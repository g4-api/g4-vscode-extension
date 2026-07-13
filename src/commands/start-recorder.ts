/*
 * Command to forward notebook automation events via G4 NotificationService.
 *
 * RESOURCES:
 * VS Code command API reference: https://code.visualstudio.com/api/references/commands
 */
import * as vscode from 'vscode';
import { CommandBase } from './command-base';
import { Logger } from '../logging/logger';
import { EventCaptureService, EventCaptureOptions } from '../clients/g4-signalr-client';
import { G4RecorderSandboxService } from '../services/g4-recorder-sandbox-service';
import { Utilities } from '../extensions/utilities';

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
        private readonly _options: EventCaptureOptions[],
    ) {
        // Initialize base CommandBase members (logger factory, context, etc.)
        super(_context);

        // Create a dedicated child logger for this command's messages.
        this._logger = this.logger?.newLogger('G4.StartRecorder');

        // Command identifier as used in package.json and when invoking via commands.executeCommand.
        this.command = 'Start-Recorder';

        // Instantiate one EventCaptureService per endpoint and store in the pool.
        for (const option of this._options) {
            
            if(!option.enabled) {
                this._logger.information('Skipping disabled recorder endpoint: ' + option.baseUrl);
                continue;
            }

            // Inject the context and logger, which are not provided by the manifest-derived
            // options, so the service can log and access extension lifecycle resources without
            // throwing on undefined members.
            const captureService = new EventCaptureService({
                ...option,
                context: this._context,
                logger: this._logger
            });
            this._connections.set(option.baseUrl, captureService);
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
            async (commandOptions: StartRecorderCommandOptions) => {
                await this.invokeCommand(commandOptions);
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
     * @param commandOptions Optional arguments passed when invoking the command.
     */
    protected async onInvokeCommand(commandOptions?: StartRecorderCommandOptions): Promise<void> {
        // Start sandboxed recorder processes before SignalR connects when the user enabled sandbox mode.
        await this.startSandboxRecordersWhenRequired(commandOptions);

        // Build an array of start promises so we can await them collectively.
        const starts: Promise<void>[] = [];

        for (const [endpoint, service] of this._connections) {
            try {
                this._logger.information(`Starting recorder for endpoint: ${endpoint}`);

                // Clear any existing events and start active (never carry a suspended state from a
                // previous session).
                service.clearBuffer();
                service.resume();

                // Start each connection and collect its Promise; let them run concurrently.
                starts.push(service.start());
            } catch (error: unknown) {
                // Ensure we don't fail the whole loop on one bad endpoint.
                const message = error instanceof Error ? error.message : String(error);
                this._logger.error(`Failed to start recorder for endpoint ${endpoint}: ${message}`);
            }
        }

        // Await all connection attempts to settle before launching browsers. allSettled is used
        // so one recorder failing to connect does not skip the launch for the others.
        await Promise.allSettled(starts);

        // Launch the browser for each chromium recorder now that connections are established
        // (startBrowser is a no-op for passive UIA recorders). This is decoupled from the
        // connection promises so a post-connect issue on one service cannot skip the launches.
        for (const [endpoint, service] of this._connections) {
            try {
                await service.startBrowser();
            } catch (error: unknown) {
                const message = error instanceof Error ? error.message : String(error);
                this._logger.error(`Failed to launch browser for endpoint ${endpoint}: ${message}`);
            }
        }
    }

    /**
     * Starts sandboxed recorder services when the manifest or panel override enables sandbox use.
     *
     * @param commandOptions - Optional command arguments from the recorder panel.
     *
     * @remarks
     * This method is intentionally command-owned. Extension activation must never wait for or start
     * recorder services; the recorder process check only runs after the user starts recording.
     */
    private async startSandboxRecordersWhenRequired(commandOptions?: StartRecorderCommandOptions): Promise<void> {
        // Resolve the effective sandbox setting, letting the recorder panel override the manifest in memory.
        const manifest = Utilities.getManifest();
        const manifestUseSandbox = manifest?.settings?.recorderSettings?.useSandbox === true;
        const sandboxOverride = commandOptions?.useSandbox;
        const isOverrideConfigured = sandboxOverride !== null && sandboxOverride !== undefined;
        const useSandbox = isOverrideConfigured
            ? sandboxOverride === true
            : manifestUseSandbox;

        if (!useSandbox) {
            return;
        }

        // Only enabled recorder services are present in the connection map and should be started.
        const recorders = Array
            .from(this._connections.values())
            .map(service => service.options);

        if (recorders.length === 0) {
            return;
        }

        // Ask the sandbox service to ping and start each recorder endpoint before SignalR connects.
        const results = await G4RecorderSandboxService.startFromOptionsWhenRequired({
            recorders,
            sandboxPath: manifest?.sandbox
        });

        // Surface sandbox failures as VS Code warnings so the user sees why recording may not connect.
        const shownWarnings = new Set<string>();

        for (const result of results) {
            const warningMessage = result.message ?? '';
            const isWarningNeeded = !result.isReady && warningMessage.length > 0;

            if (!isWarningNeeded) {
                continue;
            }

            // Avoid repeating the same warning when several recorder endpoints share the same failure.
            if (shownWarnings.has(warningMessage)) {
                continue;
            }

            shownWarnings.add(warningMessage);
            this._logger.warning(warningMessage);
            vscode.window.showWarningMessage(warningMessage);
        }
    }
}

/**
 * Optional Start-Recorder command arguments sent by the recorder panel.
 */
type StartRecorderCommandOptions = {
    /** Memory-only sandbox override selected in the recorder panel. */
    useSandbox?: boolean;
};
