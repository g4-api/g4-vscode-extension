import * as vscode from 'vscode';
import { HubConnection, HubConnectionBuilder, LogLevel } from '@microsoft/signalr';

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
    private readonly _context: vscode.ExtensionContext;

    /**
     * Service for managing SignalR notifications in VS Code.
     * 
     * @param context VS Code extension context for lifecycle management and disposables.
     * @param baseUrl Base URL for the SignalR hub.
     */
    constructor(context: vscode.ExtensionContext, private baseUrl: string) {
        // Retain the extension context for lifecycle management
        this._context = context;

        // Build the connection against your hub URL
        this._connection = new HubConnectionBuilder()
            .withUrl(`${this.baseUrl}/hub/v4/g4/notifications`)
            .withAutomaticReconnect()
            .build();

        // Register handlers for incoming messages
        this.registerHandlers();
    }

    public get connection(): HubConnection {
        return this._connection;
    }

    public async startAutomation(automationData: any): Promise<void> {
        await this._connection.invoke('StartAutomation', automationData);
    }

    public stopAutomation(): void {
        // Stop automation for the SignalR hub
        console.log('Stopping automation');
    }

    /**
     * Registers callbacks for incoming SignalR events.
     */
    private registerHandlers() {
        // // Listen for your event and forward to the VS Code Output panel
        // this._connection.on('ReceiveLogCreatedEvent', (logEntry: any) => {
        //     vscode.window.showInformationMessage(logEntry);
        // });

        // Optionally handle reconnect notifications
        this._connection.onreconnecting(error => {
            vscode.window.showWarningMessage(`SignalR reconnecting: ${error?.message}`);
        });
        this._connection.onreconnected(() => {
            vscode.window.showInformationMessage('SignalR reconnected.');
        });
        this._connection.onclose(error => {
            vscode.window.showErrorMessage(`SignalR closed: ${error?.message}`);
        });
    }

    /**
     * Starts the SignalR connection.
     */
    public async start() {
        try {
            await this._connection.start();
            vscode.window.showInformationMessage('Connected to SignalR hub.');
        } catch (err: any) {
            vscode.window.showErrorMessage(`Failed to connect: ${err.message}`);
            // Optionally retry after a delay
            setTimeout(() => this.start(), 5000);
        }
    }

    /**
     * Clean up when the extension deactivates.
     */
    public async dispose() {
        await this._connection.stop();
    }
}
