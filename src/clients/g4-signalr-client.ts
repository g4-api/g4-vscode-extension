import * as vscode from 'vscode';

import {
    HubConnection,
    HubConnectionBuilder,
    HubConnectionState
} from '@microsoft/signalr';

import { showTemporaryInformationMessage } from '../extensions/notification-utilities';

import { Logger } from '../logging/logger';

/**
 * Service for managing SignalR notifications in VS Code.
 * This service connects to a SignalR hub and listens for events,
 * forwarding them to the VS Code output panel or notifications.
 * 
 * @param context VS Code extension context for lifecycle management and disposables.
 * @param baseUrl Base URL for the SignalR hub.
 */
export class NotificationService {
    private readonly _connection: HubConnection;

    /**
     * Service for managing SignalR notifications in VS Code.
     * 
     * @param context VS Code extension context for lifecycle management and disposables.
     * @param baseUrl Base URL for the SignalR hub.
     */
    constructor(
        private readonly _options: { baseUrl: string, context: vscode.ExtensionContext, logger: Logger }
    ) {
        // Build the connection against your hub URL
        this._connection = new HubConnectionBuilder()
            .withUrl(`${this._options.baseUrl}/hub/v4/g4/notifications`)
            .withAutomaticReconnect()
            .build();

        // Register handlers for incoming messages
        this.registerHandlers();
    }

    /**
     * Exposes the active SignalR connection for low-level operations or status checks.
     */
    public get connection(): HubConnection {
        // Return the underlying HubConnection instance
        return this._connection;
    }

    /**
     * Sends an automation payload to the G4 hub to initiate workflow execution.
     * Delegates to the 'StartAutomation' SignalR method.
     *
     * @param automationData - Arbitrary object containing automation parameters.
     * @returns A promise that resolves when the invocation completes.
     */
    public async startAutomation(automationData: any): Promise<void> {
        // Invoke the hub method named 'StartAutomation' with the provided data
        await this._connection.invoke('StartAutomation', automationData);
    }

    /**
     * Stops the currently running automation on the G4 hub.
     * Not yet implemented; placeholder for future hub method invocation.
     */
    public stopAutomation(): void {
        // TODO: Implement SignalR hub call to stop automation
        console.warn('Stop-Automation is not implemented yet.');
    }

    /**
     * Registers SignalR event handlers for various connection lifecycle events
     * and log message reception. Hooks into the underlying HubConnection to
     * display messages in the Output panel and handle reconnect logic.
     */
    private registerHandlers(): void {
        // Handle incoming log entries from the hub and write them to the log channel
        this._connection.on(
            'ReceiveLogCreatedEvent',
            (logEntry: any) => {
                // Log informational messages to the G4 Extension Logs channel
                this._options.logger.information(logEntry);
            }
        );

        // Notify user when the connection is reconnecting
        this._connection.onreconnecting(error => {
            const msg =
                `Attempting to reconnect to G4 notifications hub...` +
                (error ? ` Error: ${error.message}` : '');

            // Log a warning about the reconnection attempt
            this._options.logger.warning(msg);
        });

        // Notify user upon successful reconnection
        this._connection.onreconnected(() => {
            // Log the successful reconnection as informational
            this._options.logger.information('Successfully reconnected to G4 notifications hub.');
        });

        // Handle hub connection closure, log the error and show a VS Code notification
        this._connection.onclose(error => {
            const msg =
                `Disconnected from G4 notifications hub.` +
                (error ? ` Error: ${error.message}` : '');

            // Log the disconnection as an error
            this._options.logger.error(msg);
        });
    }

    /**
     * Starts the SignalR connection to the G4 notifications hub.
     * Displays an information message on successful connection.
     * On error, shows an error message and schedules a retry after a delay.
     *
     * @returns A promise that resolves after the connection start attempt completes or the retry is scheduled.
     */
    public async start(): Promise<void> {
        try {
            // Initiate the SignalR connection to the hub
            await this._connection.start();

            // Notify the user that we successfully connected
            this._options.logger.information(
                `Connected to G4 notifications hub at ${this._options.baseUrl}`
            );
        } catch (err: any) {
            // Log the error details for debugging purposes
            this._options.logger.error(
                `Failed to connect to G4 notifications hub at ${this._options.baseUrl}: ${err?.message || err}`
            );

            // Retry connection automatically after 5 seconds
            setTimeout(() => this.start(), 5000);
        }
    }

    /**
     * Stops the SignalR connection and cleans up resources.
     * Displays a confirmation message on success or logs and shows an error on failure.
     *
     * @returns A promise that resolves once the connection has been stopped or an error has been handled.
     */
    public async dispose(): Promise<void> {
        try {
            // Attempt to gracefully stop the SignalR connection
            await this._connection.stop();

            // Notify the user that the connection was closed successfully
            showTemporaryInformationMessage(
                'Disconnected from G4 notifications hub.'
            );
        } catch (err: any) {
            // Log the error details for debugging purposes
            this._options.logger.error(
                `Error disconnecting from G4 notifications hub: ${err?.message || err}`
            );
        }
    }
}

/**
 * Service that connects to the G4 "events capture" SignalR hub, buffers incoming
 * recording events, and exposes lifecycle methods to start/stop the connection.
 *
 * @remarks
 * - Uses automatic reconnect to handle transient network failures.
 * - Buffers all received events in memory (FIFO) until disposed.
 * - Emits user-friendly logs during reconnects and on connection state changes.
 */
export class EventCaptureService {
    /** Underlying SignalR connection to the G4 hub. */
    private readonly _connection: HubConnection;

    /** Internal buffer of all captured events since service start or last clear. */
    private readonly _buffer: any[] = [];

    /** OS process id of the browser launched for this (chromium) recorder, if any. */
    private _processId?: number;

    /** When true, incoming recording events are dropped instead of buffered (suspended). */
    private _suspended = false;

    /**
     * Creates a new instance of the EventCaptureService.
     *
     * @param _options Configuration for base URL, VS Code context, and logger.
     */
    constructor(
        private readonly _options: EventCaptureOptions
    ) {
        // Build a SignalR connection to the G4 Peek hub endpoint.
        this._connection = new HubConnectionBuilder()
            .withUrl(`${this._options.baseUrl}/hub/v4/g4/peek`)
            .withAutomaticReconnect() // enable backoff-based auto-reconnect
            .build();

        // Register all inbound handlers and connection lifecycle callbacks.
        this.registerHandlers();
    }

    /**
     * Exposes the internal buffer of captured events (read-only).
     * Useful for retrieving all events since the last clear or service start.
     * 
     * @returns Array of all captured events in FIFO order.
     */
    public get buffer(): any[] {
        return this._buffer;
    }

    /**
     * The operating-system process id of the browser launched for this recorder,
     * or `undefined` when no browser has been launched (for example UIA recorders).
     */
    public get processId(): number | undefined {
        return this._processId;
    }

    /**
     * Indicates whether this recorder drives a Chromium browser (ChromeDriver) and
     * therefore needs its browser launched/closed over the hub, versus a passive UIA
     * recorder that only connects and captures.
     */
    public get isChromium(): boolean {
        // Chromium recorders are identified by a ChromeDriver-style driver value.
        const driver = this._options.driverParameters?.driver ?? '';
        return /chrome/i.test(driver);
    }

    /**
     * Indicates whether this service's hub connection is currently connected.
     *
     * @remarks
     * Used to tell whether a recording session is live — for example, before rebuilding recorder
     * connections when settings are applied, so an in-progress session is not silently dropped.
     */
    public get isConnected(): boolean {
        return this._connection.state === HubConnectionState.Connected;
    }

    /**
     * Indicates whether this recorder is suspended. While suspended, incoming recording events are
     * dropped instead of buffered; the hub connection stays open so resuming needs no reconnect.
     */
    public get isSuspended(): boolean {
        return this._suspended;
    }

    /** Suspends buffering: incoming events are dropped until {@link resume} is called. */
    public suspend(): void {
        this._suspended = true;
    }

    /** Resumes buffering after a {@link suspend}. */
    public resume(): void {
        this._suspended = false;
    }

    /**
     * Exposes the underlying SignalR connection (read-only).
     * Useful for advanced scenarios (e.g., invoking hub methods).
     */
    public get connection(): HubConnection {
        return this._connection;
    }

    /**
     * Exposes the service configuration options (read-only).
     */
    public get options(): EventCaptureOptions {
        return this._options;
    }

    /**
     * Clears the internal buffer of captured events.
     * Use this to reset the buffer without disposing the service.
     */
    public clearBuffer(): void {
        this.buffer.length = 0;
    }

    /**
     * Disconnects from the SignalR hub and finalizes the current
     * event-capture session.
     *
     * Once disconnected:
     * - The underlying connection is stopped, preventing new events.
     * - Any errors during shutdown are logged for troubleshooting.
     *
     * @remarks
     * Cleanup is intentionally UI-neutral because this method is shared by user-initiated Stop
     * and internal settings hot-load teardown. Callers decide whether the transition warrants a
     * notification. Connecting and reconnecting services are still stopped even though only a
     * previously connected service returns true.
     *
     * @returns True when the service was connected immediately before it was stopped.
     */
    public async disconnect(): Promise<boolean> {
        // Snapshot the user-visible connection state before cleanup so callers can distinguish an
        // actual connected-to-disconnected transition from an already-red service teardown.
        const isConnectedBeforeStop = this.isConnected;

        try {
            // Always stop the SignalR client so connecting or reconnecting attempts cannot survive
            // an internal rebuild, even though they do not count as a live recorder connection.
            await this._connection.stop();

            return isConnectedBeforeStop;
        } catch (error: any) {
            // Log details if the connection could not be stopped gracefully.
            this._options.logger.error(
                `Failed to disconnect from G4 events capture hub: ${error?.message || error}`
            );

            return false;
        }
    }

    /**
     * Registers message handlers and connection lifecycle event listeners.
     * @internal
     */
    private registerHandlers(): void {
        // Buffer every incoming recording event for later consumption.
        this._connection.on('ReceiveRecordingEvent', (message: any) => {
            // Drop events while suspended; the connection stays open so resuming needs no reconnect.
            if (this._suspended) {
                return;
            }

            this._buffer.push(message);
        });

        // When SignalR is attempting to reconnect after a drop.
        this._connection.onreconnecting(error => {
            const msg =
                `Attempting to reconnect to G4 events capture hub...` +
                (error ? ` Error: ${error.message}` : '');
            this._options.logger.warning(msg);
        });

        // When SignalR successfully reconnected.
        this._connection.onreconnected(() => {
            this._options.logger.information('Successfully reconnected to G4 events capture hub.');
        });

        // When the connection closes (after retries are exhausted or explicitly stopped).
        this._connection.onclose(error => {
            const msg =
                `Disconnected from G4 events capture hub.` +
                (error ? ` Error: ${error.message}` : '');
            this._options.logger.error(msg);
        });
    }

    /**
     * Starts (or restarts) the SignalR connection to the events capture hub.
     * Retries once via a simple timeout if the initial start fails.
     */
    public async start(): Promise<void> {
        try {
            // Initiate the SignalR connection to the hub.
            await this._connection.start();

            // Inform the user we're connected and ready to receive events.
            this._options.logger.information(
                `Connected to G4 events capture hub at ${this._options.baseUrl}`
            );
        } catch (err: any) {
            // Log the failure and schedule a simple retry.
            this._options.logger.error(
                `Failed to connect to G4 events capture hub at ${this._options.baseUrl}: ${err?.message || err}`
            );

            // Retry connection after 5 seconds (basic backoff).
            setTimeout(() => this.start(), 5000);
        }
    }

    /**
     * Launches the Chromium browser associated with this recorder by invoking the hub's
     * StartRecorder method, and stores the returned OS process id so the exact browser can
     * be closed later. No-op for non-chromium (for example UIA) recorders, which capture
     * passively without a browser to launch.
     */
    public async startBrowser(): Promise<void> {
        // UIA (and any non-chromium) recorders capture passively; nothing to launch.
        if (!this.isChromium) {
            return;
        }

        // The browser can only be launched once the SignalR connection is established.
        if (this._connection.state !== 'Connected') {
            this._options.logger.warning(
                `Cannot launch browser for ${this._options.baseUrl}: connection is not established.`
            );
            return;
        }

        try {
            // Ask the hub to launch Chromium with the recorder extension and capture the
            // process id, which is required to stop the exact browser instance later.
            this._processId = await this._connection.invoke('StartRecorder', this._options.driverParameters);

            this._options.logger.information(
                `Launched recorder browser (pid ${this._processId}) at ${this._options.baseUrl}`
            );
        } catch (err: any) {
            this._options.logger.error(
                `Failed to launch recorder browser at ${this._options.baseUrl}: ${err?.message || err}`
            );
        }
    }

    /**
     * Closes the Chromium browser previously launched for this recorder by invoking the
     * hub's StopRecorder method with the stored process id. No-op for non-chromium
     * recorders or when no browser was launched.
     */
    public async stopBrowser(): Promise<void> {
        // Only chromium recorders launch a browser; nothing to stop otherwise.
        if (!this.isChromium || this._processId === undefined) {
            return;
        }

        try {
            // Ask the hub to gracefully close (then force-kill if needed) the tracked browser.
            // The hub returns false when it no longer tracks the process id (for example the
            // recorder server was restarted after launch), which is logged so a browser that
            // stays open points at a process-registry mismatch rather than a missing call. The
            // invoke is raced against a timeout so a lost or delayed hub response cannot block
            // the caller (the hub's own graceful-close grace period is only a few seconds).
            const stopTimeoutMs = 15000;
            const timeout = new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error(`StopRecorder timed out after ${stopTimeoutMs}ms`)), stopTimeoutMs)
            );
            const isStopped = await Promise.race([
                this._connection.invoke('StopRecorder', this._processId),
                timeout
            ]);

            this._options.logger.information(
                `Requested stop of recorder browser (pid ${this._processId}) at ${this._options.baseUrl}; ` +
                `hub reported stopped=${isStopped}`
            );
        } catch (err: any) {
            this._options.logger.error(
                `Failed to stop recorder browser at ${this._options.baseUrl}: ${err?.message || err}`
            );
        } finally {
            // Clear the id so a later stop does not attempt to kill an already-dead process.
            this._processId = undefined;
        }
    }
}

/** Constructor options for the EventCaptureService. */
export interface EventCaptureOptions {
    /** Base URL of the backend (e.g., http://localhost:9955). */
    baseUrl: string;

    /** VS Code extension context for lifecycle and storage if needed. */
    context: vscode.ExtensionContext;

    /** Optional driver parameters associated with this connection. */
    driverParameters?: any;

    /** Flag to enable or disable event capture (default: false). */
    enabled?: boolean;

    /** Logger instance for user-facing and diagnostic logs. */
    logger: Logger;

    /** Operating mode for the event resolution (default: 'standard'). */
    mode?: EventCaptureMode;

    /** Setting to handle think time between events. */
    thinkTimeSettings?: any;
}

/** Type alias for the event capture operating modes. */
export type EventCaptureMode = 'standard' | 'user32' | 'coordinate';
