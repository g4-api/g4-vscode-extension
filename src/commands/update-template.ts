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
     * @returns A Promise that resolves when all selected templates have been processed.
     */
    protected async onInvokeCommand(): Promise<void> {
        // Get a map of template names to their file paths
        const templates = UpdateTemplateCommand.getTemplates();

        // Create a sorted list of template names for display in the Quick Pick
        const options = Object.keys(templates).sort((a, b) => a.localeCompare(b));

        // Configure the Quick Pick UI for multi-select
        const pickOption: vscode.QuickPickOptions = {
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

        // Indicate progress in the status bar
        vscode.window.setStatusBarMessage('$(sync~spin) Updating templates...');

        // Iterate over each chosen template name
        for (const name of selected) {
            // Lookup the file path for this template
            const templateFilePath = templates[name];

            // Read the entire file contents as a UTF-8 encoded string
            const template = fs.readFileSync(templateFilePath, 'utf8');

            // Show error if reading failed, then continue to next
            if (!template) {
                vscode.window.setStatusBarMessage(`Failed to read or parse template: ${name}`);
                this._logger.error(`Failed to read or parse template: ${name}`);
                continue;
            }

            // Send the update request to the backend client for this template
            await this._client.updateTemplate(JSON.parse(template));

            // Notify success for this template
            vscode.window.setStatusBarMessage(`Template '${name}' updated successfully.`);
            this._logger.information(`Template '${name}' updated successfully.`);
        }

        // Synchronize tools after updating the template
        await this._client.syncTools().then(async () => {
            // Restart the extension host to apply changes
            await vscode.commands.executeCommand('workbench.action.restartExtensionHost');
        });
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
}
