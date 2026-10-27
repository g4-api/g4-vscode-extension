/*
 * Command to update template definitions in the G4 Hub.
 * 
 * RESOURCES:
 * VS Code command API reference: https://code.visualstudio.com/api/references/commands
 */
import * as fs from 'node:fs';
import * as vscode from 'vscode';
import { CommandBase } from './command-base';
import { Logger } from '../logging/logger';
import { G4Client } from '../clients/g4-client';
import {
    addPendingNotice,
    addPendingWarning
} from '../extensions/notification-utilities';
import { Utilities } from '../extensions/utilities';
import path from 'node:path';

/**
 * Command to update one or more template definitions in the G4 Hub.
 * Extends CommandBase to integrate with the VS Code command lifecycle.
 */
export class UpdateTemplateCommand extends CommandBase {
    /** Logger scoped to this command for detailed diagnostics */
    private readonly _logger: Logger;
    private readonly _client: G4Client;

    /**
     * Creates a new UpdateEnvironmentCommand for updating templates.
     * 
     * @param context     - VS Code extension context for managing disposables and state.
     * @param baseUri     - Base URI for G4 API requests.
     */
    constructor(context: vscode.ExtensionContext, baseUri: string) {
        // Initialize base CommandBase properties (context, logger factory, etc.)
        super(context);

        // Create a dedicated logger for this command
        this._logger = this.logger?.newLogger('G4.UpdateTemplate');

        // Define the command identifier used in package.json and invocation
        this.command = 'Update-Template';

        // Initialize the G4Client with the base URI for API requests
        this._client = new G4Client(baseUri);
    }

    /**
     * Registers the 'Update-Template' command with VS Code's command registry.
     * Ensures cleanup when the extension deactivates.
     */
    protected async onRegister(): Promise<void> {
        // Register command callback for updating templates
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
     * Prompts the user to select one or more template names, reads each template file,
     * and sends an update request for each selected template to the G4 Hub.
     *
     * @remarks
     * When at least one template was stored, the Hub tools are refreshed and the extension host
     * restarts, which closes notifications and clears the status bar. The success message and any
     * failure are therefore also stored as pending notices and shown again after the restart.
     *
     * @returns A Promise that resolves when all selected templates have been processed.
     */
    protected async onInvokeCommand(): Promise<void> {
        // Get a map of template names to their file paths
        const templates = UpdateTemplateCommand.getTemplates();

        // Create a sorted list of template names for display in the Quick Pick
        const options = Object.keys(templates).sort((a, b) => a.localeCompare(b));

        // Configure the Quick Pick UI for multi-select
        const pickOption: vscode.QuickPickOptions & { canPickMany: true } = {
            title: 'Select a template to create or update',
            placeHolder: 'Select a template',
            canPickMany: true,
        };

        // Show the Quick Pick menu and wait for user selection
        const selected = await vscode.window.showQuickPick(options, pickOption);

        // If the user cancelled or picked nothing, exit early
        if (!selected || selected.length === 0) {
            return;
        }

        // Upload the selected templates under one status bar progress item that clears itself.
        const progressOptions = {
            location: vscode.ProgressLocation.Window,
            title: 'Updating templates'
        };

        const { failures, storedCount } = await vscode.window.withProgress(
            progressOptions,
            () => this.updateTemplates(selected, templates));

        // Show every failure with its reason, so a failed upload is never reported as a success.
        const failureMessage = failures.length > 0
            ? `Could not update ${failures.length} of ${selected.length} template(s). ${failures.join(' ')}`
            : '';

        if (failureMessage !== '') {
            void vscode.window.showErrorMessage(failureMessage);
        }

        // Stop when nothing was stored: the tools did not change, so a restart would only close open views.
        if (storedCount === 0) {
            return;
        }

        // Confirm a full success in the status bar for 5 seconds; the restart below may replace it sooner.
        let successMessage = '';

        if (failures.length === 0) {
            const names = selected.map((name) => `'${name}'`).join(', ');

            successMessage = selected.length === 1
                ? `Template ${names} updated successfully.`
                : `Templates ${names} updated successfully.`;

            vscode.window.setStatusBarMessage(successMessage, 5000);
        }

        // Refresh the Hub tools from the stored templates; a failed refresh keeps the extension host running.
        const toolsResult = await this._client.syncTools();

        if (!toolsResult.ok) {
            const toolsFailure = G4Client.getFailureMessage(toolsResult);
            const toolsMessage = `Templates were stored, but the G4 tool sync failed: ${toolsFailure}`;

            this._logger.error(toolsMessage);
            void vscode.window.showErrorMessage(toolsMessage);
            return;
        }

        // The restart closes notifications and clears the status bar message within a moment, so keep
        // the outcome for the next activation, which shows it again.
        if (successMessage !== '') {
            await addPendingNotice(this.context, successMessage);
        }

        if (failureMessage !== '') {
            await addPendingWarning(this.context, failureMessage);
        }

        // Restart the extension host to apply changes
        await vscode.commands.executeCommand('workbench.action.restartExtensionHost');
    }

    /**
     * Retrieves all available template definitions from the system and returns
     * a map of template names to their corresponding file paths.
     */
    private static getTemplates(): Record<string, string> {
        // Find the folder that holds template definition files
        const templatesRepository = Utilities.getSystemFolderPath('templates');

        // Read all file paths inside that folder
        const templatesFiles = Utilities.getFiles(templatesRepository);

        // Prepare an empty mapping from template name -> file path
        const templates: Record<string, string> = {};

        // For each file, derive its template name and add to the map
        for (const file of templatesFiles) {
            // Remove directory and extension to get the "template name"
            const templateName = path.basename(file, path.extname(file));

            // Associate the derived name with its full path
            templates[templateName] = file;
        }

        // Return the completed template map
        return templates;
    }

    /**
     * Reads, parses and uploads each selected template, and collects the failures.
     *
     * @remarks
     * One template that cannot be read, is not valid JSON, or is rejected by the Hub fails alone;
     * the rest are still uploaded. Each outcome is logged.
     *
     * @param selected - Template names chosen by the user.
     * @param templates - Map of template names to file paths.
     * @returns One "name: reason" line per template that was not stored, and the stored count.
     */
    private async updateTemplates(
        selected: string[],
        templates: Record<string, string>): Promise<{ failures: string[]; storedCount: number; }> {

        // Collect the failures for the final notification and count the stored templates, so the
        // caller syncs and restarts only when something changed.
        const failures: string[] = [];
        let storedCount = 0;

        for (const name of selected) {
            // Read and parse the file; a bad file is reported and skipped, so the batch continues.
            let template: unknown;

            try {
                template = JSON.parse(fs.readFileSync(templates[name], 'utf8'));
            } catch (error) {
                const reason = `The file cannot be read as JSON: ${Utilities.resolveErrorMessage(error)}`;

                this._logger.error(`Template '${name}' was not uploaded: ${reason}`);
                failures.push(`'${name}': ${reason}`);
                continue;
            }

            // Upload the template and record the Hub's answer.
            const result = await this._client.updateTemplate(template);

            if (!result.ok) {
                const reason = G4Client.getFailureMessage(result);

                this._logger.error(`Template '${name}' was not updated: ${reason}`);
                failures.push(`'${name}': ${reason}`);
                continue;
            }

            // Count and log the stored template.
            storedCount++;
            this._logger.information(`Template '${name}' updated successfully.`);
        }

        return { failures, storedCount };
    }
}
