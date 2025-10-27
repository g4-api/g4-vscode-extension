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

/**
 * Registers and runs the **Start-Recorder** command, creating and managing
 * one {@link EventCaptureService} per configured endpoint.
 *
 * @remarks
 * - The command ID is `Start-Recorder` (must match `contributes.commands` in package.json).
 * - Each endpoint gets its own SignalR connection for event capture.
 * - Connections are started on command invocation.
 */
export class StartRecorderCommand extends CommandBase {
    /** Dedicated logger instance for this command. */
    private readonly _logger: Logger;

    /**
     * Connection pool keyed by endpoint base URL (e.g. `http://localhost:9955`).
     * Each value is a live {@link EventCaptureService} instance.
     */
    private readonly _connections: Map<string, EventCaptureService> = new Map<string, EventCaptureService>();

    /**
     * Create a new StartRecorderCommand.
     *
     * @param _context VS Code extension context (lifecycle & subscriptions).
     * @param _options List of options for event capture services.
     */
    constructor(
        private readonly _context: vscode.ExtensionContext,
        private readonly _options: EventCaptureServiceOptions[],
    ) {
        // Initialize base CommandBase members (logger factory, context, etc.)
        super(_context);

        // Create a dedicated child logger for this command’s messages.
        this._logger = this.logger?.newLogger('G4.StartRecorder');

        // Command identifier as used in package.json and when invoking via commands.executeCommand.
        this.command = 'Start-Recorder';

        // Instantiate one EventCaptureService per endpoint and store in the pool.
        for (const option of this._options) {
            const captureService = new EventCaptureService({
                baseUrl: option.url,
                driverParameters: option.driverParameters,
                context: _context,
                logger: this._logger
            });
            this._connections.set(option.url, captureService);
        }
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
            async (_: any) => {
                await this.invokeCommand();
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
    protected async onInvokeCommand(): Promise<void> {
        // Build an array of start promises so we can await them collectively.
        const starts: Promise<void>[] = [];

        for (const [endpoint, service] of this._connections) {
            try {
                this._logger.information(`Starting recorder for endpoint: ${endpoint}`);

                // Start each connection and collect its Promise; let them run concurrently.
                starts.push(service.start());
            } catch (error: unknown) {
                // Ensure we don’t fail the whole loop on one bad endpoint.
                const message = error instanceof Error ? error.message : String(error);
                this._logger.error(`Failed to start recorder for endpoint ${endpoint}: ${message}`);
            }
        }

        // Await all connection starts; if any rejects, we log it here.
        try {
            await Promise.all(starts);
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            this._logger.error(`One or more recorders failed to start: ${message}`);
        }
    }
}

/* Options for configuring event capture services. */
type EventCaptureServiceOptions = { url: string, driverParameters: any }
