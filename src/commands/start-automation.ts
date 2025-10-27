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
export class StartAutomationCommand extends CommandBase {
    /** Logger scoped to this command for detailed diagnostics */
    private readonly _logger: Logger;

    /**
     * Creates an instance of the command class responsible for starting
     * automation workflows within the extension.
     *
     * This constructor initializes command metadata, logging, and
     * maintains a reference to all active `NotificationService` connections
     * mapped by notebook URI path.
     *
     * @param context - The VS Code extension context used to manage disposables,
     *                  global storage, and subscriptions.
     * @param _connections - A map of active `NotificationService` instances,
     *                       keyed by their associated notebook URI path.
     */
    constructor(
        context: vscode.ExtensionContext,
        private readonly _connections: Map<string, NotificationService>
    ) {
        // Initialize base CommandBase properties (context, logger factory, etc.)
        super(context);

        // Create a dedicated logger instance for this specific command
        // The logger name 'G4.StartAutomation' helps identify messages
        // related to automation command execution in the output channel.
        this._logger = this.logger?.newLogger('G4.StartAutomation');

        // Define the command identifier string used in:
        // 1. package.json → contributes.commands section
        // 2. Command Palette or keybindings for execution
        this.command = 'Start-Automation';
    }

    /**
     * Registers the command associated with this class instance
     * within the VS Code command registry.
     *
     * This method binds the current class context (`this`) to the
     * registered command handler, ensuring that when the command
     * is executed, it correctly invokes the instance's `invokeCommand`
     * method. The resulting `Disposable` is added to the extension's
     * context subscriptions for proper cleanup on deactivation.
     *
     * @returns A Promise that resolves when the command has been registered.
     */
    protected async onRegister(): Promise<void> {
        // Register the command under the identifier stored in `this.command`.
        // When the command is executed (e.g., via Command Palette or keybinding),
        // VS Code invokes the async handler defined below.
        const disposable = vscode.commands.registerCommand(
            this.command,
            async (args: any) => {
                // Delegate command execution to the instance method `invokeCommand`.
                // The `args` parameter may include user-defined data or context.
                await this.invokeCommand(args);
            },
            this // Bind the current class instance as the command handler context.
        );

        // Add the disposable object to the extension context's subscriptions.
        // VS Code will automatically dispose of it when the extension is deactivated,
        // ensuring that no dangling command registrations remain.
        this.context.subscriptions.push(disposable);
    }

    /**
     * Handles the invocation of a command that triggers automation execution
     * within the currently active notebook editor.
     *
     * This method ensures that a valid editor and corresponding notification
     * service are available before attempting to start automation.
     *
     * @param args - Optional arguments passed from the command invocation.
     *               Typically contains `automationData` for the operation.
     */
    protected async onInvokeCommand(args?: any): Promise<void> {
        // Get the currently active notebook editor in VS Code
        const editor = vscode.window.activeNotebookEditor;

        // If no editor is open or active, log and notify the user
        if (!editor) {
            this._logger.error('No active notebook editor available.');
            vscode.window.showErrorMessage('No active notebook editor found.');
            return;
        }

        // Use the notebook's unique URI path as a lookup key for the connection
        const key = editor.notebook.uri.path;

        // Attempt to retrieve the associated notification or automation service
        const service = this._connections.get(key);

        // If no service exists for the notebook, log and display an error
        if (!service) {
            this._logger.error(`NotificationService not found for notebook: ${key}`);
            vscode.window.showErrorMessage(
                'No notification service available for this notebook.'
            );
            return;
        }

        // Ensure that the service connection is active before running automation
        // Attempt to reconnect/start the service
        if (service.connection.state !== 'Connected') {
            await service.start();
        }

        // Extract any automation-specific data from the command arguments
        const automationData = args?.automationData;

        // Start the automation flow using the provided automation data
        await service.startAutomation(automationData);
    }
}
