import * as vscode from 'vscode';

import {
    HubConnection,
    HubConnectionBuilder
} from '@microsoft/signalr';

import { showTemporaryInformationMessage } from '../extensions/notification-utilities';
import { Utilities } from '../extensions/utilities';

import { Logger } from '../logging/logger';
import { G4BrandingService } from '../services/g4-branding-service';
import { G4EventLogService } from '../services/g4-event-log-service';

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
        // Write each log entry from the Hub through the event log. The entry is an object; passing it to the logger as
        // the message made the logger throw on `trim`, so these entries were never written.
        this._connection.on(
            'ReceiveLogCreatedEvent',
            (logEntry: unknown) => {
                G4EventLogService.writeEvent({
                    label: 'ReceiveLogCreatedEvent',
                    level: 'information',
                    logger: this._options.logger,
                    value: logEntry
                });
            }
        );

        // Notify user when the connection is reconnecting
        this._connection.onreconnecting(error => {
            const msg =
                G4BrandingService.getText(`Attempting to reconnect to {product} notifications hub...`) +
                (error ? ` Error: ${error.message}` : '');

            // Log a warning about the reconnection attempt
            this._options.logger.warning(msg);
        });

        // Notify user upon successful reconnection
        this._connection.onreconnected(() => {
            // Log the successful reconnection as informational
            this._options.logger.information(G4BrandingService.getText('Successfully reconnected to {product} notifications hub.'));
        });

        // Handle hub connection closure, log the error and show a VS Code notification
        this._connection.onclose(error => {
            const msg =
                G4BrandingService.getText(`Disconnected from {product} notifications hub.`) +
                (error ? ` Error: ${error.message}` : '');

            // Log the disconnection as an error
            this._options.logger.error(msg);
        });
    }

    /**
     * Starts the SignalR connection to the G4 notifications hub.
     * Logs the outcome; a failed start is logged and rethrown.
     *
     * @remarks
     * This method makes exactly one attempt. The caller owns retrying, and must stop a failed
     * client before it creates the next one: a client that retried on its own kept running next
     * to every new one, so the number of clients grew every 5 seconds while the Hub was down and
     * they all connected at once when it came back.
     *
     * @returns A promise that resolves once the connection is started.
     * @throws The connection error when the Hub cannot be reached.
     */
    public async start(): Promise<void> {
        try {
            // Initiate the SignalR connection to the hub
            await this._connection.start();

            // Notify the user that we successfully connected
            this._options.logger.information(
                G4BrandingService.getText(`Connected to {product} notifications hub at ${this._options.baseUrl}`)
            );
        } catch (error) {
            // Log the error details for debugging purposes, then let the caller decide on a retry.
            this._options.logger.error(
                G4BrandingService.getText(`Failed to connect to {product} notifications hub at ${this._options.baseUrl}: ${Utilities.resolveErrorMessage(error)}`)
            );

            throw error;
        }
    }

    /**
     * Stops the connection without telling the user, for a client that never connected.
     *
     * @remarks
     * Used by the connection loop to discard a failed attempt before the next one, so only one
     * client exists at a time. Unlike `dispose`, it shows no notification and ignores errors.
     *
     * @returns A promise that resolves once the connection is stopped.
     */
    public async stop(): Promise<void> {
        // A connection that never started stops at once; any error is irrelevant for a discarded client.
        await this._connection.stop().catch(() => undefined);
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
                G4BrandingService.getText('Disconnected from {product} notifications hub.')
            );
        } catch (err: any) {
            // Log the error details for debugging purposes
            this._options.logger.error(
                G4BrandingService.getText(`Error disconnecting from {product} notifications hub: ${err?.message || err}`)
            );
        }
    }
}
