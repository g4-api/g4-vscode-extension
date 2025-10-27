import * as vscode from 'vscode';
import { EventCaptureService } from '../clients/g4-signalr-client';
import { Utilities } from '../extensions/utilities';

/**
 * Provides and manages the **G4 Recorder** custom Webview panel in VS Code.
 * 
 * This view is responsible for:
 * - Displaying the status of connected recorder servers.
 * - Handling user commands such as Start / Stop / Refresh.
 * - Communicating with the webview front-end via postMessage.
 * - Periodically testing and updating the connection states of all servers.
 */
export class G4RecorderViewProvider implements vscode.WebviewViewProvider {

	/** Unique view type ID registered in package.json (`contributes.views`). */
	public static readonly VIEW_TYPE = 'g4RecorderView';

	/** 
	 * The active webview instance — assigned once the view is resolved.
	 * Used to send messages and updates to the front-end (via `postMessage`).
	 */
	private _view?: vscode.WebviewView;

	/**
	 * Reference to the periodic status-check timer.
	 * Cleared when the view is disposed to avoid memory leaks.
	 */
	private _timer?: NodeJS.Timeout;

	/**
	 * Internal list of all known server statuses.
	 * Each element tracks one server’s health, name, and connection reference.
	 */
	private readonly _serversStatus: ServerStatus[];

	/**
	 * Creates a new instance of the recorder view provider.
	 *
	 * @param _context - The VS Code extension context (used for lifecycle, paths, etc.)
	 * @param _recorderConnections - A map of server names → EventCaptureService instances.
	 */
	constructor(
		private readonly _context: vscode.ExtensionContext,
		private readonly _recorderConnections: Map<string, EventCaptureService>
	) {
		// Initialize the internal status array based on currently active connections.
		this._serversStatus = G4RecorderViewProvider.resolveServers(this._recorderConnections);
	}

	/**
	 * Registers the current class instance as a VS Code Webview View Provider.
	 *
	 * This method integrates the custom webview into the VS Code extension host
	 * by registering it under a defined view type (`VIEW_TYPE`). Once registered,
	 * VS Code can instantiate and manage the webview as part of the UI.
	 *
	 * The `retainContextWhenHidden` option ensures that the webview’s state
	 * (scripts, DOM, and data) is preserved even when the panel is hidden,
	 * improving user experience by avoiding reloads.
	 */
	public register(): void {
		// Register this instance as a WebviewViewProvider under the specified view type
		const disposable = vscode.window.registerWebviewViewProvider(
			G4RecorderViewProvider.VIEW_TYPE, // Unique identifier for the webview (defined in your provider class)
			this,                             // This instance handles webview lifecycle (resolveWebviewView, etc.)
			{
				webviewOptions: {
					retainContextWhenHidden: true, // Keep webview state when hidden
				},
			}
		);

		// Ensure that the registration is properly disposed of when the extension deactivates
		this._context.subscriptions.push(disposable);
	}

	/**
	 * Resolves and initializes the VS Code webview when it becomes visible.
	 *
	 * This lifecycle method is called automatically by VS Code when the view associated
	 * with this provider is first displayed. It configures the webview, injects the initial
	 * HTML content, wires message and dispose handlers, and starts periodic heartbeats
	 * for connection monitoring or UI updates.
	 *
	 * @param webviewView - The webview container VS Code provides for rendering custom UI.
	 * @param _resolveCtx - Additional resolution context (unused in this implementation).
	 * @param _token      - A cancellation token that signals if the resolution should be aborted.
	 */
	public resolveWebviewView(
		webviewView: vscode.WebviewView,
		_resolveCtx: vscode.WebviewViewResolveContext,
		_token: vscode.CancellationToken
	) {
		// Store a reference to the webview so it can be accessed later (e.g., for sending messages)
		this._view = webviewView;

		// Configure webview permissions (allow JavaScript execution)
		webviewView.webview.options = {
			enableScripts: true,
		};

		// Inject the initial HTML markup for the webview
		webviewView.webview.html = this.getHtml();

		// Clean up when the webview is closed or disposed
		webviewView.onDidDispose(() => this.dispose());

		// Listen for incoming messages from the webview's frontend script
		webviewView.webview.onDidReceiveMessage(
			async (message) => this.resolveMessage(this._serversStatus, message)
		);

		// Send an initial message to the webview to populate server data
		this._view?.webview.postMessage({
			type: 'servers:init',
			payload: this._serversStatus.map(service => ({
				name: service.name,
				url: service.url,
				ok: service.ok
			}))
		});

		// Start a periodic heartbeat mechanism to monitor activity or maintain state
		this.startHeartbeat();
	}

	/**
	 * Cleans up resources and stops background tasks associated with the webview.
	 *
	 * This method is typically called when the webview is closed or the extension
	 * is deactivated. It ensures that any running timers (such as the heartbeat)
	 * are cleared to prevent memory leaks or orphaned background tasks.
	 *
	 * It also nullifies internal references (`_view`, `_timer`) so the object
	 * can be safely garbage collected.
	 */
	public dispose() {
		// Stop the periodic heartbeat if it’s still running
		if (this._timer) {
			clearInterval(this._timer); // Cancel the repeating interval
			this._timer = undefined;    // Clear the reference for GC
		}

		// Remove the reference to the webview to free resources
		this._view = undefined;
	}

	/**
	 * Generates the HTML content for the webview panel.
	 *
	 * This method returns a complete HTML document as a string, which includes
	 * the necessary structure, styles, and scripts for the webview.
	 */
	private getHtml(): string {
		// Uses VS Code theme variables and minimal CSS
		return `<!DOCTYPE html>
			<html lang="en">

			<head>
				<meta charset="UTF-8" />
				<title>Recorder</title>
				<style>
					@keyframes bulbPulse {
						0% {
							box-shadow: 0 0 0px #3c3;
						}

						50% {
							box-shadow: 0 0 6px #3c3;
						}

						100% {
							box-shadow: 0 0 0px #3c3;
						}
					}

					@media (prefers-reduced-motion: reduce) {
						.bulb.on {
							animation: none;
						}
					}

					:root {
						--border-radius: 2px;
					}

					body {
						margin: 0;
						padding: 12px;
						background: var(--vscode-sideBar-background);
						color: var(--vscode-foreground);
						font-family: var(--vscode-font-family);
						font-size: var(--vscode-font-size);
						line-height: 1.4;
					}

					button {
						background: var(--vscode-button-background);
						color: var(--vscode-button-foreground);
						border: none;
						border-radius: var(--border-radius);
						padding: 6px 10px;
						cursor: pointer;
					}

					button:hover {
						background: var(--vscode-button-hoverBackground);
					}

					.bulb {
						width: 10px;
						height: 10px;
						border-radius: 50%;
						border: 1px solid var(--vscode-editorGroup-border);
						background: #c33;
						box-shadow: 0 0 6px #c33;
					}

					.bulb.on {
						animation: bulbPulse 1.2s ease-in-out infinite;
						background: #3c3;
						will-change: box-shadow;
					}

					.control-btn {
						display: flex;
						align-items: center;
						gap: 8px;
						min-width: 90px;
					}

					.controls {
						align-items: center;
						display: flex;
						gap: 8px;
						margin-bottom: 12px;
					}

					.left {
						display: flex;
						align-items: center;
						gap: 8px;
					}

					.name {
						font-weight: 600;
					}

					.panel {
						border: 1px solid var(--vscode-editorGroup-border);
						border-radius: var(--border-radius);
						padding: 10px;
					}

					.panel h3 {
						margin: 0 0 8px 0;
						font-size: 0.95rem;
						font-weight: 600;
					}

					.refresh {
						background: transparent;
						color: var(--vscode-textLink-foreground);
						border: 1px solid var(--vscode-editorGroup-border);
						padding: 4px 8px;
						border-radius: var(--border-radius);
					}

					.refresh:hover {
						background: rgba(127, 127, 127, 0.1);
					}

					.row {
						display: flex;
						gap: 8px;
						align-items: center;
					}

					.server {
						display: flex;
						align-items: center;
						justify-content: space-between;
						padding: 6px 0;
						border-top: 1px solid var(--vscode-editorGroup-border);
					}

					.server:first-child {
						border-top: none;
					}

					.small {
						font-size: 0.85rem;
						opacity: .8;
					}

					.svg-inline {
						fill: var(--vscode-button-foreground);
						transform: scale(0.9);
					}

					.svg-inline-secondary {
						fill: var(--vscode-textLink-foreground);
						transform: scale(0.9);
					}

					.top {
						display: flex;
						justify-content: space-between;
						align-items: center;
						margin-bottom: 10px;
					}

					.url {
						font-size: 0.85rem;
						opacity: 0.8;
						text-overflow: ellipsis;
						overflow: hidden;
						white-space: nowrap;
						max-width: 240px;
					}
				</style>
			</head>

			<body>
				<div class="controls">
					<button id="btnToggle" class="control-btn" title="Start (identical behavior to VS Code debug Start)"
						aria-label="Start" data-state="stopped">
						<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" width="20" height="20" class="svg-inline">
							<path
								d="M187.2 100.9C174.8 94.1 159.8 94.4 147.6 101.6C135.4 108.8 128 121.9 128 136L128 504C128 518.1 135.5 531.2 147.6 538.4C159.7 545.6 174.8 545.9 187.2 539.1L523.2 355.1C536 348.1 544 334.6 544 320C544 305.4 536 291.9 523.2 284.9L187.2 100.9z" />
						</svg>
						<span>Start</span>
					</button>
				</div>

				<div class="panel">
					<div class="top">
						<h3>Servers</h3>
						<button class="refresh control-btn" id="btnRefresh" title="Refresh" aria-label="Refresh">
							<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" width="20" height="20"
								class="svg-inline-secondary">
								<path
									d="M552 256L408 256C398.3 256 389.5 250.2 385.8 241.2C382.1 232.2 384.1 221.9 391 215L437.7 168.3C362.4 109.7 253.4 115 184.2 184.2C109.2 259.2 109.2 380.7 184.2 455.7C259.2 530.7 380.7 530.7 455.7 455.7C463.9 447.5 471.2 438.8 477.6 429.6C487.7 415.1 507.7 411.6 522.2 421.7C536.7 431.8 540.2 451.8 530.1 466.3C521.6 478.5 511.9 490.1 501 501C401 601 238.9 601 139 501C39.1 401 39 239 139 139C233.3 44.7 382.7 39.4 483.3 122.8L535 71C541.9 64.1 552.2 62.1 561.2 65.8C570.2 69.5 576 78.3 576 88L576 232C576 245.3 565.3 256 552 256z" />
							</svg>
							<span>Refresh</span>
						</button>
					</div>

					<div id="servers"></div>
					<div class="small" id="footer"></div>
				</div>

				<script>
					const vscode = acquireVsCodeApi();
					const serversElement = document.getElementById('servers');
					const footerElement = document.getElementById('footer');
					const btnToggle = document.getElementById('btnToggle');

					// Inline SVGs (using normal strings)
					var PLAY_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" width="20" height="20" class="svg-inline">' +
						'<path d="M187.2 100.9C174.8 94.1 159.8 94.4 147.6 101.6C135.4 108.8 128 121.9 128 136L128 504C128 518.1 135.5 531.2 147.6 538.4C159.7 545.6 174.8 545.9 187.2 539.1L523.2 355.1C536 348.1 544 334.6 544 320C544 305.4 536 291.9 523.2 284.9L187.2 100.9z"/>' +
						'</svg>';

					var STOP_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" width="20" height="20" class="svg-inline">' +
						'<path d="M160 96L480 96C515.3 96 544 124.7 544 160L544 480C544 515.3 515.3 544 480 544L160 544C124.7 544 96 515.3 96 480L96 160C96 124.7 124.7 96 160 96z"/>' +
						'</svg>';

					function setToggleState(running) {
						btnToggle.dataset.state = running ? 'running' : 'stopped';
						btnToggle.title = running
							? 'Stop (identical behavior to VS Code debug Stop)'
							: 'Start (identical behavior to VS Code debug Start)';
						btnToggle.setAttribute('aria-label', running ? 'Stop' : 'Start');
						btnToggle.innerHTML = (running ? STOP_SVG : PLAY_SVG) + '<span>' + (running ? 'Stop' : 'Start') + '</span>';
					}

					setToggleState(false);

					btnToggle.addEventListener('click', function () {
						var running = btnToggle.dataset.state === 'running';
						if (running) {
							vscode.postMessage({ type: 'recorder:stop' });
							setToggleState(false);
						} else {
							vscode.postMessage({ type: 'recorder:start' });
							setToggleState(true);
						}
					});

					document.getElementById('btnRefresh').addEventListener('click', function () {
						vscode.postMessage({ type: 'servers:refresh' });
					});

					function render(servers) {
						serversElement.innerHTML = '';
						for (const server of servers) {
							var row = document.createElement('div');
							row.className = 'server';

							var left = document.createElement('div');
							left.className = 'left';

							var bulb = document.createElement('span');
							bulb.className = 'bulb' + (server.ok ? ' on' : '');
							left.appendChild(bulb);

							var name = document.createElement('span');
							name.className = 'name';
							name.textContent = server.name;
							left.appendChild(name);
							row.appendChild(left);

							var url = document.createElement('a');
							url.className = 'url';
							url.title = server.url;
							url.innerHTML = server.url;
							url.href = server.url + '/swagger';
							url.target = '_blank';
							row.appendChild(url);

							serversElement.appendChild(row);
						}

						var time = new Date();
						footerElement.textContent = 'Last update: ' + time.toLocaleTimeString();
					}

					window.addEventListener('message', function (event) {
						var message = event.data;
						if (!message) return;

						switch (message.type) {
							case 'servers:init':
							case 'servers:update':
								render(message.payload || []);
								break;
							case 'recorder:state':
								setToggleState(!!message.running);
								break;
						}
					});
				</script>
			</body>

			</html>`;
	}

	/**
	 * Handles incoming messages from the webview frontend.
	 */
	private async resolveMessage(serversStatus: ServerStatus[], message: any): Promise<void> {
		// Use optional chaining to safely access the message type
		switch (message?.type) {
			case 'recorder:start': {
				// Trigger VS Code command to start the recorder process
				await vscode.commands.executeCommand('Start-Recorder');
				break;
			}

			case 'recorder:stop': {
				// Trigger VS Code command to stop the recorder process
				await vscode.commands.executeCommand('Stop-Recorder');
				break;
			}

			case 'servers:refresh': {
				// Manually trigger a server status refresh from the webview
				this.testServers(serversStatus);
				break;
			}

			default: {
				// Ignore unknown message types for robustness
				console.warn(`[G4RecorderViewProvider] Unhandled message type: ${message?.type}`);
				break;
			}
		}
	}

	/**
	 * Resolves a list of server statuses from active recorder connections.
	 */
	private static resolveServers(
		recorderConnections: Map<string, EventCaptureService>
	): ServerStatus[] {
		// Initialize the result list
		const servers: ServerStatus[] = [];

		// Iterate through each entry in the map (connection URL and corresponding service)
		for (const [connection, service] of recorderConnections) {
			// Skip invalid or undefined services
			if (!service) {
				continue;
			}

			// Generate a unique ID for this server status entry
			const id = Utilities.newRandomString(8);

			// Push a new server status object for the valid connection
			servers.push({
				id,
				name: `Recorder (${id})`,
				ok: service.connection?.state === 'Connected',
				service,
				url: connection
			});
		}

		// Return the complete list of server statuses
		return servers;
	}

	/**
	 * Starts the heartbeat cycle that periodically checks the status of connected servers.
	 */
	private startHeartbeat() {
		// Run an immediate server health check before starting the periodic cycle
		this.testServers(this._serversStatus);

		// Schedule recurring checks every 5 seconds (5000 ms)
		this._timer = setInterval(
			() => this.testServers(this._serversStatus),
			5000
		);
	}

	/**
	 * Tests the connectivity state of all known recorder servers and updates their status.
	 */
	private testServers(serversStatus: ServerStatus[]) {
		// Node 18+ includes global 'fetch', so external calls could be made here if needed.
		// Currently, this method only checks the local connection state.

		// Prepare an array to collect updated server status objects
		const updates: ServerStatus[] = [];

		// Iterate through each server in the provided list
		for (const status of serversStatus) {

			// Determine if the server’s connection is currently active
			const ok = status.service?.connection?.state === 'Connected';

			// Update the status object fields
			status.ok = ok;                     // Reflects whether the connection is healthy
			status.lastChecked = Date.now();    // Timestamp of the current health check

			// Push a shallow copy of the updated status into the result array
			updates.push({ ...status });
		}

		// Broadcast the updated server statuses back to the webview
		this._view?.webview.postMessage({
			type: 'servers:update',
			payload: updates.map(service => ({
				name: service.name,
				url: service.url,
				ok: service.ok
			}))
		});
	}
}

/**
 * Represents the current status and connection details of a monitored server.
 * Used to track health, identify the service instance, and expose metadata for UI rendering.
 */
type ServerStatus = {
	/** 
	 * Unique identifier for the server.
	 * Typically used for internal mapping or correlation with backend records.
	 */
	id: string;

	/** 
	 * Timestamp (in milliseconds since epoch) of the last successful health check.
	 * Optional — may be undefined if the server has never been checked or initialized.
	 */
	lastChecked?: number;

	/** 
	 * Human-readable name of the server.
	 * Displayed in the UI and used for quick identification (e.g., “G4 API”, “Recorder Service”).
	 */
	name: string;

	/** 
	 * Indicates whether the server is reachable and healthy.
	 * true  → server responded successfully to health check.
	 * false → server is unreachable or returned an error.
	 */
	ok: boolean;

	/** 
	 * Reference to the associated EventCaptureService instance, if active.
	 * May be undefined when no active connection or service instance is attached.
	 */
	service: EventCaptureService | undefined;

	/** 
	 * Base URL of the server.
	 * Used for direct navigation (e.g., to Swagger docs) and network operations.
	 */
	url: string;
};
