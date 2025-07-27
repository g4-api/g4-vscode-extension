/*
 * Command to forward notebook automation events via G4 NotificationService.
 * 
 * RESOURCES:
 * VS Code command API reference: https://code.visualstudio.com/api/references/commands
 */
import * as vscode from 'vscode';
import { CommandBase } from './command-base';
import { Logger } from '../logging/logger';
import { NotificationService } from '../clients/g4-signalr-client';

/**
 * Sends the active notebook content to a connected automation service.
 * Extends CommandBase to integrate with the VS Code command lifecycle.
 */
export class SendAutomationCommand extends CommandBase {
    /** Logger scoped to this command for detailed diagnostics */
    private readonly _logger: Logger;

    /**
     * Creates a new SendAutomationCommand.
     * 
     * @param _context     - VS Code extension context for managing disposables and state.
     * @param _connections - Mapping from notebook URI to NotificationService client.
     */
    constructor(
        context: vscode.ExtensionContext,
        private readonly _connections: Map<string, NotificationService>
    ) {
        // Initialize base CommandBase properties (context, logger factory, etc.)
        super(context);

        // Create a dedicated logger for this command
        this._logger = this.logger?.newLogger('G4.StartAutomation');

        // Define the command identifier used in package.json and invocation
        this.command = 'Start-Automation';
    }

    /**
     * Registers the 'Send-Automation' command with VS Code's command registry.
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
     * Invoked when the 'Send-Automation' command is executed.
     * Validates active notebook editor and forwards content to the service.
     */
    protected async onInvokeCommand(args?: any): Promise<void> {
        // Get the currently active notebook editor
        const editor = vscode.window.activeNotebookEditor;
        if (!editor) {
            this._logger.error('No active notebook editor available.');
            vscode.window.showErrorMessage('No active notebook editor found.');
            return;
        }

        // Determine unique key for this notebook
        const key = editor.notebook.uri.path;

        // Look up the NotificationService for this notebook
        const service = this._connections.get(key);
        if (!service) {
            this._logger.error(`NotificationService not found for notebook: ${key}`);
            vscode.window.showErrorMessage(
                'No notification service available for this notebook.'
            );
            return;
        }

        // If the service is not connected, start it
        if (service.connection.state !== 'Connected') {
            await service.start();
        }

        const automationData = args?.automationData;

        // TODO: add animation or progress indicator

        // Send the automation payload
        await service.startAutomation(automationData);
    }
}
