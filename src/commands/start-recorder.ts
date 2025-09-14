/*
 * Command to forward notebook automation events via G4 NotificationService.
 * 
 * RESOURCES:
 * VS Code command API reference: https://code.visualstudio.com/api/references/commands
 */
import * as vscode from 'vscode';
import { CommandBase } from './command-base';
import { Logger } from '../logging/logger';
import { EventCaptureService } from '../clients/g4-signalr-client';

export class StartRecorderCommand extends CommandBase {
    /** Logger scoped to this command for detailed diagnostics */
    private readonly _logger: Logger;
    private readonly _eventsCapturer: EventCaptureService;

    constructor(
        private readonly _context: vscode.ExtensionContext,
        private readonly _endpoints: string[],
    ) {
        // Initialize base CommandBase properties (context, logger factory, etc.)
        super(_context);

        // Create a dedicated logger for this command
        this._logger = this.logger?.newLogger('G4.StartRecorder');

        // Define the command identifier used in package.json and invocation
        this.command = 'Start-Recorder';

        this._eventsCapturer = new EventCaptureService({
            baseUrl: this._endpoints.length > 0 ? this._endpoints[0] : "http://localhost:9955",
            context: _context,
            logger: this._logger
        });
    }

    /**
     * Registers the 'Send-Recorder' command with VS Code's command registry.
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
        this._eventsCapturer.start();
    }
}
