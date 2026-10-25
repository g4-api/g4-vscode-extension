/*
 * Command to update environment definitions in the G4 Hub.
 * 
 * RESOURCES:
 * VS Code command API reference: https://code.visualstudio.com/api/references/commands
 */
import * as fs from 'node:fs';
import * as vscode from 'vscode';
import { CommandBase } from './command-base';
import { Logger } from '../logging/logger';
import { G4Client } from '../clients/g4-client';
import { Utilities } from '../extensions/utilities';
import path from 'node:path';

/**
 * Sends the active notebook content to a connected automation service.
 * Extends CommandBase to integrate with the VS Code command lifecycle.
 */
export class UpdateEnvironmentCommand extends CommandBase {
    /** Logger scoped to this command for detailed diagnostics */
    private readonly _logger: Logger;
    private readonly _client: G4Client;

    /**
     * Creates a new UpdateEnvironmentCommand.
     * 
     * @param _context     - VS Code extension context for managing disposables and state.
     * @param _connections - Mapping from notebook URI to NotificationService client.
     */
    constructor(context: vscode.ExtensionContext, baseUri: string) {
        // Initialize base CommandBase properties (context, logger factory, etc.)
        super(context);

        // Create a dedicated logger for this command
        this._logger = this.logger?.newLogger('G4.UpdateEnvironment');

        // Define the command identifier used in package.json and invocation
        this.command = 'Update-Environment';

        // Initialize the G4Client with the base URI for API requests
        this._client = new G4Client(baseUri);
    }

    /**
     * Registers the 'Update-Environment' command with VS Code's command registry.
     * Ensures cleanup when the extension deactivates.
     */
    protected async onRegister(): Promise<void> {
        // Register command callback
        const disposable = vscode.commands.registerCommand(
            this.command,
            async (args: any) => {
                await this.invokeCommand(args);
            },
            this
        );

        // Add to context subscriptions for automatic disposal
        this.context.subscriptions.push(disposable);
    }

    /**
     * Prompts the user to select one or more environment names, reads each environment file,
     * converts it to JSON, and sends an update request for each selected environment.
     *
     * @returns A Promise that resolves when all selected environments have been processed.
     */
    protected async onInvokeCommand(): Promise<void> {
        // Get a map of environment names to their file paths
        const environments = UpdateEnvironmentCommand.getEnvironments();

        // Create a sorted list of environment names for display
        const options = Object.keys(environments).sort((a, b) => a.localeCompare(b));

        // Configure the Quick Pick UI for multi-select
        const pickOption: vscode.QuickPickOptions & { canPickMany: true } = {
            title: 'Select an environment to create or update',
            placeHolder: 'Select an environment',
            canPickMany: true,
        };

        // Show the Quick Pick menu and wait for user selection
        const selected = await vscode.window.showQuickPick(options, pickOption);

        // If the user cancelled or picked nothing, exit early
        if (!selected || selected.length === 0) {
            return;
        }

        // Upload the selected environments under one status bar progress item that clears itself.
        const progressOptions = {
            location: vscode.ProgressLocation.Window,
            title: 'Updating environments'
        };

        const failures = await vscode.window.withProgress(
            progressOptions,
            () => this.updateEnvironments(selected, environments));

        // Confirm a full success in the status bar for 5 seconds, so it cannot outlive a later failure.
        if (failures.length === 0) {
            const names = selected.map((name) => `'${name}'`).join(', ');
            const successMessage = selected.length === 1
                ? `Environment ${names} updated successfully.`
                : `Environments ${names} updated successfully.`;

            vscode.window.setStatusBarMessage(successMessage, 5000);
            return;
        }

        // Show every failure with its reason, so a failed upload is never reported as a success.
        const failureMessage = `Could not update ${failures.length} of ${selected.length} environment(s). `
            + failures.join(' ');

        void vscode.window.showErrorMessage(failureMessage);
    }

    /**
     * Retrieves all available environment definitions from the system and returns
     * a map of environment names to their corresponding file paths.
     */
    private static getEnvironments(): Record<string, string> {
        // Find the folder that holds environment definition files
        const environmentsRepository = Utilities.getSystemFolderPath('environments');

        // Read all file paths inside that folder
        const environmentsFiles = Utilities.getFiles(environmentsRepository);

        // Prepare an empty mapping from environment name -> file path
        const environments: Record<string, string> = {};

        // For each file, derive its environment name and add to the map
        for (const file of environmentsFiles) {
            // Remove directory and extension to get the "environment name"
            const environmentName = path.basename(file, path.extname(file));

            // Associate the derived name with its full path
            environments[environmentName] = file;
        }

        // Return the completed environment map
        return environments;
    }

    /**
     * Reads one environment file into the object uploaded to the Hub.
     *
     * @remarks
     * A `.json` file must hold one JSON object. Any other file uses `KEY=value` lines: the line is
     * split at the first `=`, so a value may contain `=`, and `KEY=` stores an empty value, so a
     * value can be cleared. Blank lines, lines beginning with "#", and lines without a key are
     * ignored. An empty result is refused, so an unreadable file is never uploaded as `{}`.
     *
     * @param environmentFilePath - Full path of the environment file.
     * @returns The environment, or the reason it cannot be uploaded.
     */
    private static readEnvironment(environmentFilePath: string): { environment?: Record<string, unknown>; error?: string; } {
        // Read the file without its UTF-8 BOM, which would break JSON.parse and join the first key;
        // a read failure is reported for this environment only.
        let data: string;

        try {
            const text = fs.readFileSync(environmentFilePath, 'utf8');
            data = text.startsWith('\uFEFF') ? text.slice(1) : text;
        } catch (error) {
            return { error: `The file cannot be read: ${Utilities.resolveErrorMessage(error)}` };
        }

        // Parse a JSON environment file as one object.
        const isJsonFile = path.extname(environmentFilePath).toLowerCase() === '.json';

        if (isJsonFile) {
            return UpdateEnvironmentCommand.readJsonEnvironment(data);
        }

        // Parse KEY=value lines, splitting each line at its first "=".
        const environment: Record<string, string> = {};

        for (const line of data.split('\n')) {
            // Skip blank lines and comment lines starting with "#".
            const trimmedLine = line.trim();

            if (!trimmedLine || trimmedLine.startsWith('#')) {
                continue;
            }

            // Skip a line without "=" or without a key; it cannot name a parameter.
            const separatorIndex = trimmedLine.indexOf('=');

            if (separatorIndex <= 0) {
                continue;
            }

            // Store the trimmed key and value; an empty value clears the parameter.
            const key = trimmedLine.slice(0, separatorIndex).trim();
            environment[key] = trimmedLine.slice(separatorIndex + 1).trim();
        }

        // Refuse an empty environment, so a wrong file is not uploaded as {}.
        return Object.keys(environment).length === 0
            ? { error: 'The file has no KEY=value lines.' }
            : { environment };
    }

    // Parses the text of a .json environment file; it must be a non-empty JSON object.
    private static readJsonEnvironment(data: string): { environment?: Record<string, unknown>; error?: string; } {
        // Parse the file; a syntax error is reported for this environment only.
        let parsed: unknown;

        try {
            parsed = JSON.parse(data);
        } catch (error) {
            return { error: `The file is not valid JSON: ${Utilities.resolveErrorMessage(error)}` };
        }

        // Accept only a non-empty object, which maps parameter names to values.
        const environment = parsed as Record<string, unknown> | null;
        const isObject = environment !== null && typeof environment === 'object' && !Array.isArray(environment);

        if (!isObject) {
            return { error: 'The file must hold one JSON object of parameter names and values.' };
        }

        return Object.keys(environment).length === 0
            ? { error: 'The JSON object is empty.' }
            : { environment };
    }

    /**
     * Reads and uploads each selected environment, and collects the failures.
     *
     * @remarks
     * One environment that cannot be read or is rejected by the Hub fails alone; the rest are still
     * uploaded. Each outcome is logged.
     *
     * @param selected - Environment names chosen by the user.
     * @param environments - Map of environment names to file paths.
     * @returns One "name: reason" line per environment that was not stored.
     */
    private async updateEnvironments(selected: string[], environments: Record<string, string>): Promise<string[]> {
        // Collect one line per environment that was not stored, for the final notification.
        const failures: string[] = [];

        for (const name of selected) {
            // Read the file; a file that cannot be uploaded is reported and skipped.
            const { environment, error } = UpdateEnvironmentCommand.readEnvironment(environments[name]);

            if (!environment) {
                this._logger.error(`Environment '${name}' was not uploaded: ${error}`);
                failures.push(`'${name}': ${error}`);
                continue;
            }

            // Upload the environment and record the Hub's answer.
            const result = await this._client.updateEnvironment(name, true, environment);

            if (!result.ok) {
                const reason = G4Client.getFailureMessage(result);

                this._logger.error(`Environment '${name}' was not updated: ${reason}`);
                failures.push(`'${name}': ${reason}`);
                continue;
            }

            this._logger.information(`Environment '${name}' updated successfully.`);
        }

        return failures;
    }
}
