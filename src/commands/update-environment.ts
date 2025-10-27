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
        const pickOption: vscode.QuickPickOptions = {
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

        // Indicate progress in the status bar
        vscode.window.setStatusBarMessage('$(sync~spin) Updating environments...');

        // Iterate over each chosen environment name
        for (const name of selected) {
            // Lookup the file path for this environment
            const environmentFilePath = environments[name];

            // Read and parse the environment file into a JSON object
            const environment = UpdateEnvironmentCommand.convertToJson(environmentFilePath, this._logger);
            
            // Show error if parsing failed, then continue to next
            if (!environment) {
                vscode.window.setStatusBarMessage(`Failed to read or parse environment: ${name}`);
                this._logger.error(`Failed to read or parse environment: ${name}`);
                continue;
            }

            // Send the update request to the backend client
            await this._client.updateEnvironment(name, true, environment);

            // Notify success for this environment
            vscode.window.setStatusBarMessage(`Environment '${name}' updated successfully.`);
            this._logger.information(`Environment '${name}' updated successfully.`);
        }
    }

    /**
     * Reads an environment file (key=value format) and converts its contents into a JSON object.
     * Blank lines and lines beginning with "#" are ignored.
     */
    private static convertToJson(environmentFilePath: string, logger: Logger): any {
        try {
            // Read the entire file contents as a UTF-8 encoded string
            const data = fs.readFileSync(environmentFilePath, 'utf8');

            // Split the file text into individual lines
            const lines = data.split('\n');

            // Prepare the object to hold parsed key/value pairs
            const json: Record<string, string> = {};

            // Iterate through each line to extract key and value
            for (const line of lines) {
                // Remove leading/trailing whitespace
                const trimmedLine = line.trim();

                // Skip empty lines or comment lines starting with "#"
                if (!trimmedLine || trimmedLine.startsWith('#')) {
                    continue;
                }

                // Split on the first "=" to separate key from value
                const [key, value] = trimmedLine.split('=');

                // If either key or value is missing, ignore this malformed line
                if (!(key && value)) {
                    continue;
                }

                // Trim whitespace around key and value, then store in the result
                json[key.trim()] = value.trim();
            }

            // Return the populated JSON-like object
            return json;

        } catch (error: any) {
            // Log any errors encountered and return undefined
            logger?.error(error.message, error);
        }
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
}
