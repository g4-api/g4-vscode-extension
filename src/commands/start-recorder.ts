/*
 * Command to forward notebook automation events via G4 NotificationService.
 *
 * RESOURCES:
 * VS Code command API reference: https://code.visualstudio.com/api/references/commands
 */
import * as vscode from 'vscode';
import { CommandBase } from './command-base';
import { Logger } from '../logging/logger';
import { EventCaptureService, EventCaptureMode } from '../clients/g4-signalr-client';
import { G4RecorderSandboxService } from '../services/g4-recorder-sandbox-service';
import { G4RecorderScriptService } from '../services/g4-recorder-script-service';
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
        private _options: ReturnType<typeof Utilities.resolveEventsCaptureOptions>,
    ) {
        // Initialize base CommandBase members (logger factory, context, etc.)
        super(_context);

        // Create a dedicated child logger for this command's messages.
        this._logger = this.logger?.newLogger('G4.StartRecorder');

        // Command identifier as used in package.json and when invoking via commands.executeCommand.
        this.command = 'Start-Recorder';

        // Build one capture service per enabled endpoint into the shared connection pool.
        this.setConnections(this._options);
    }

    /**
     * Gets the connection pool (read-only map).
     */
    public get connections(): Map<string, EventCaptureService> {
        return this._connections;
    }

    /**
     * Whether a recording session is currently active.
     *
     * @remarks
     * True when at least one capture connection is live on its hub. The settings applier reads
     * this to decide whether rebuilding connections would interrupt an in-progress recording.
     */
    public get isRecording(): boolean {
        // A session is active while any capture connection is connected to its hub.
        for (const service of this._connections.values()) {
            if (service.isConnected) {
                return true;
            }
        }

        return false;
    }

    /**
     * Rebuilds the recorder connection pool from a fresh set of endpoint options.
     *
     * @remarks
     * Owns the connection-pool lifecycle when recorder settings change: it closes and drops every
     * current capture service, then rebuilds the pool from the new options so enabling, disabling,
     * or re-pointing a recorder takes effect without a window reload. The pool Map is mutated in
     * place so other holders (Stop-Recorder, the recorder view) keep observing the live set.
     *
     * @param options The new recorder endpoint options (from the refreshed manifest).
     * @returns A promise that resolves once the old connections are closed and the pool rebuilt.
     */
    public async updateConnections(options: ReturnType<typeof Utilities.resolveEventsCaptureOptions>): Promise<void> {
        // Close every current capture service before dropping it so no socket is left dangling.
        for (const service of this._connections.values()) {
            try {
                await service.stopBrowser();
                await service.disconnect();
            } catch {
                // Ignore teardown failures; a failed close must not block the rebuild.
            }
        }

        // Drop the closed services and record the new options as the active configuration.
        this._connections.clear();
        this._options = options;

        // Rebuild the pool from the new options so the next start uses the updated endpoints.
        this.setConnections(options);
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

        // Run each recorder's pre-script before connecting. A pre-script that runs and fails aborts
        // that recorder's start; its endpoint is skipped so it never connects or launches.
        const skippedEndpoints = await this.runPreScripts();

        // Connect the surviving recorders, then launch their browsers. Both stages are extracted so
        // this entry point stays a readable, linear sequence.
        await this.startConnections(skippedEndpoints);
        await this.startBrowsers(skippedEndpoints);
    }

    /**
     * Connects every recorder that survived its pre-script, running the connects concurrently.
     *
     * @remarks
     * Recorders in the skip set never connect this session. Each connect is isolated in its own
     * try/catch so one bad endpoint cannot abort the others, and all connects are awaited together
     * so browser launches only begin once the connections have settled.
     *
     * @param skippedEndpoints Endpoints whose pre-script failed and must not start.
     */
    private async startConnections(skippedEndpoints: Set<string>): Promise<void> {
        // Build an array of start promises so we can await them collectively.
        const starts: Promise<void>[] = [];

        for (const [endpoint, service] of this._connections) {
            // Skip recorders whose pre-script failed; they must not connect this session.
            if (skippedEndpoints.has(endpoint)) {
                continue;
            }

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
    }

    /**
     * Launches the browser for every connected chromium recorder that survived its pre-script.
     *
     * @remarks
     * startBrowser is a no-op for passive UIA recorders. This is decoupled from the connect stage so
     * a post-connect issue on one service cannot skip the launches for the others, and skip-set
     * recorders (which never connected) are never launched.
     *
     * @param skippedEndpoints Endpoints whose pre-script failed and must not start.
     */
    private async startBrowsers(skippedEndpoints: Set<string>): Promise<void> {
        for (const [endpoint, service] of this._connections) {
            // A recorder skipped by a failed pre-script never connected, so never launch its browser.
            if (skippedEndpoints.has(endpoint)) {
                continue;
            }

            try {
                await service.startBrowser();
            } catch (error: unknown) {
                const message = error instanceof Error ? error.message : String(error);
                this._logger.error(`Failed to launch browser for endpoint ${endpoint}: ${message}`);
            }
        }
    }

    /**
     * Runs the pre-script for every pooled recorder and reports which endpoints must be skipped.
     *
     * @remarks
     * Blocking and abort-on-failure: each recorder's pre-script is awaited, and a script that runs
     * and fails (non-zero exit or timeout) marks its endpoint for skipping so that recorder does not
     * connect or launch. A disabled or empty pre-script is a no-op that never skips. Failures are
     * isolated per recorder, so one failed pre-script never blocks the others from starting.
     *
     * @returns The set of endpoint base URLs whose pre-script failed and must not start.
     */
    private async runPreScripts(): Promise<Set<string>> {
        // Endpoints whose pre-script failed; the start/launch loops skip these.
        const skippedEndpoints = new Set<string>();

        for (const [endpoint, service] of this._connections) {
            const options = service.options;

            // Run the pre-script and wait for its outcome before touching the connection.
            const result = await G4RecorderScriptService.runRecorderScript({
                phase: 'pre',
                configuration: options.preScript,
                baseUrl: options.baseUrl,
                mode: options.mode,
                driverParameters: options.driverParameters,
                logger: this._logger
            });

            // Only an executed-and-failed pre-script aborts the recorder; a skipped one does nothing.
            if (result.isExecuted && !result.isSuccess) {
                skippedEndpoints.add(endpoint);

                const warning = `Pre-script failed for recorder ${endpoint}; this recorder will not start.`;
                this._logger.warning(warning);
                vscode.window.showWarningMessage(warning);
            }
        }

        return skippedEndpoints;
    }

    /**
     * Builds one capture service per enabled endpoint into the shared connection pool.
     *
     * @remarks
     * Store-only helper shared by the constructor and updateConnections(). Disabled endpoints are
     * skipped so no idle connection is opened for them. The extension context and logger are
     * injected because the manifest-derived options do not carry them.
     *
     * @param options The recorder endpoint options to build services from.
     */
    private setConnections(options: ReturnType<typeof Utilities.resolveEventsCaptureOptions>): void {
        for (const option of options) {
            // Skip endpoints the user disabled so no idle connection is opened for them.
            if (!option.enabled) {
                this._logger.information('Skipping disabled recorder endpoint: ' + option.baseUrl);
                continue;
            }

            // Inject the context and logger, which the manifest-derived options do not carry, so
            // the service can log and access extension lifecycle resources. The manifest stores
            // mode as a free string, so narrow it to the EventCaptureMode the service expects.
            const captureService = new EventCaptureService({
                ...option,
                mode: option.mode as EventCaptureMode,
                context: this._context,
                logger: this._logger
            });

            this._connections.set(option.baseUrl, captureService);
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
