import * as vscode from 'vscode';
import { HubConnection, HubConnectionBuilder } from '@microsoft/signalr';
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
        private baseUrl: string,
        private readonly _context: vscode.ExtensionContext,
        private readonly _logger: Logger
    ) {
        // Build the connection against your hub URL
        this._connection = new HubConnectionBuilder()
            .withUrl(`${this.baseUrl}/hub/v4/g4/notifications`)
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
                this._logger.information(logEntry);
            }
        );

        // Notify user when the connection is reconnecting
        this._connection.onreconnecting(error => {
            const msg =
                `Attempting to reconnect to G4 notifications hub...` +
                (error ? ` Error: ${error.message}` : '');

            // Log a warning about the reconnection attempt
            this._logger.warning(msg);
        });

        // Notify user upon successful reconnection
        this._connection.onreconnected(() => {
            // Log the successful reconnection as informational
            this._logger.information('Successfully reconnected to G4 notifications hub.');
        });

        // Handle hub connection closure, log the error and show a VS Code notification
        this._connection.onclose(error => {
            const msg =
                `Disconnected from G4 notifications hub.` +
                (error ? ` Error: ${error.message}` : '');

            // Log the disconnection as an error
            this._logger.error(msg);
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
            this._logger.information(
                `Connected to G4 notifications hub at ${this.baseUrl}`
            );
        } catch (err: any) {
            // Log the error details for debugging purposes
            this._logger.error(
                `Failed to connect to G4 notifications hub at ${this.baseUrl}: ${err?.message || err}`
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
            vscode.window.showInformationMessage(
                'Disconnected from G4 notifications hub.'
            );
        } catch (err: any) {
            // Log the error details for debugging purposes
            this._logger.error(
                `Error disconnecting from G4 notifications hub: ${err?.message || err}`
            );
        }
    }
}
