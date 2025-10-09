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


export class StopRecorderCommand extends CommandBase {
    private readonly _logger: Logger;

    /**
     * Create a new StopRecorderCommand.
     *
     * @param _context VS Code extension context (lifecycle & subscriptions).
     * @param _connections Map of active EventCaptureService connections.
     */
    constructor(
        private readonly _context: vscode.ExtensionContext,
        private readonly _connections: Map<string, EventCaptureService> = new Map<string, EventCaptureService>(),
    ) {
        // Initialize base CommandBase members (logger factory, context, etc.)
        super(_context);

        // Create a dedicated child logger for this command’s messages.
        this._logger = this.logger?.newLogger('G4.StartRecorder');

        // Command identifier as used in package.json and when invoking via commands.executeCommand.
        this.command = 'Stop-Recorder';
    }

    /**
     * Gets the connection pool (read-only map).
     */
    public get connections(): Map<string, EventCaptureService> {
        return this._connections;
    }

    /**
     * Register the VS Code command handler and push the disposable into context.
     * Called by the framework during command lifecycle.
     */
    protected async onRegister(): Promise<void> {
        // Register the command and bind it to invokeCommand.
        const disposable = vscode.commands.registerCommand(
            this.command,
            async (args: any) => {
                await this.invokeCommand(args);
            },
            this // `thisArg` ensures `this` inside invokeCommand is this instance
        );

        // Ensure disposal happens when the extension deactivates.
        this.context.subscriptions.push(disposable);
    }

    /**
     * Command execution entry point. Starts all configured EventCaptureService
     * connections (one per endpoint).
     *
     * @param args Optional arguments passed when invoking the command.
     */
    protected async onInvokeCommand(args?: any): Promise<void> {
        const connection = this._connections.get("http://localhost:9955");
        const buffer = connection?.buffer || [];
        const actions: Map<string, any[]> = new Map();
        const keysBuffer: string[] = [];

        console.log(args);

        let currentElement = "";

        for (let i = 0; i < buffer.length; i++) {
            const event = buffer[i];

            const isDown = event?.value?.event.match(/down/i);
            if (isDown) {
                continue; // skip key down events
            }

            const isUp = event?.value?.event.match(/up/i);

            if (!isUp) {
                continue;
            }

            const path = event?.value?.chain?.path || [];
            const element = path.at(-1) ?? null;

            if (!element) {
                continue;
            }

            const bounds = element.bounds || {};
            const id = `${bounds.height};${bounds.X};${bounds.Y};${bounds.width}`;
            const sameElement = i > 0 && id === currentElement || i === 0;

            currentElement = id;

            if (!actions.has(id)) {
                actions.set(id, []);
            }

            if (event?.value?.type?.match(/mouse/i)) {
                const isLeft = event?.value?.event.match(/left/i);
                const isRight = event?.value?.event.match(/right/i);
                const isMiddle = event?.value?.event.match(/middle/i);

                let g4Action: string;
                if (isLeft) {
                    g4Action = 'InvokeUser32Click';
                } else if (isRight) {
                    g4Action = 'InvokeUser32ContextClick';
                } else {
                    g4Action = 'None';
                }

                actions.get(id)?.push({
                    pluginName: g4Action,
                    onElement: event?.value?.chain?.locator
                });

                continue;
            }

            if(!sameElement) {
                keysBuffer.length = 0; // clear buffer

                actions.get(id)?.push({
                    pluginName: "SendUser32Keys",
                    onElement: event?.value?.chain?.locator,
                    argument: keysBuffer.join('')
                });
            }

            keysBuffer.push(event?.value?.value?.key || '');
        }

        const a = "";
    }
}