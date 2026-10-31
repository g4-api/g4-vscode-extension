import * as vscode from 'vscode';

import { Utilities } from '../extensions/utilities';

import { G4RecordingService } from '../services/g4-recording-service';

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
	 * The active webview instance - assigned once the view is resolved.
	 * Used to send messages and updates to the front-end (via `postMessage`).
	 */
	private _view?: vscode.WebviewView;

	/**
	 * Reference to the periodic status-check timer.
	 * Cleared when the view is disposed to avoid memory leaks.
	 */
	private _timer?: NodeJS.Timeout;

	/**
	 * Memory-only switch that turns Chrome's network sandbox off for the Chromium recorders on the next start.
	 * Starts from the manifest value but is never written back to manifest.json.
	 */
	private _disableNetworkSandboxOverride: boolean;

	/**
	 * Memory-only sandbox override used by the recorder panel.
	 * Starts from the manifest value but is never written back to manifest.json.
	 */
	private _useSandboxOverride: boolean;

	/**
	 * Internal list of all known server statuses.
	 * Each element tracks one server's health, name, and connection reference.
	 */
	private readonly _serversStatus: ServerStatus[];

	/**
	 * Creates a new instance of the recorder view provider.
	 *
	 * @param _context - The VS Code extension context (used for lifecycle, paths, etc.)
	 * @param _recordingService - The shared recording session owner; its Hub status drives each recorder row.
	 */
	constructor(
		private readonly _context: vscode.ExtensionContext,
		private readonly _recordingService: G4RecordingService
	) {
		// Initialize the internal status array from the enabled recorders in the manifest.
		this._serversStatus = G4RecorderViewProvider.resolveServers(this._recordingService);

		// Seed the panel-only overrides from the manifest so the first start matches saved settings.
		const settings = Utilities.getManifest()?.settings?.recorderSettings;
		this._useSandboxOverride = settings?.useSandbox === true;
		this._disableNetworkSandboxOverride = settings?.disableChromeNetworkSandbox === true;
	}

	/**
	 * Registers the current class instance as a VS Code Webview View Provider.
	 *
	 * This method integrates the custom webview into the VS Code extension host
	 * by registering it under a defined view type (`VIEW_TYPE`). Once registered,
	 * VS Code can instantiate and manage the webview as part of the UI.
	 *
	 * The `retainContextWhenHidden` option ensures that the webview's state
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
	 * Re-reads recorder settings and re-renders the view after settings are applied.
	 *
	 * @remarks
	 * Called by the settings applier so the recorder panel reflects manifest changes (enabled
	 * recorders, endpoints, sandbox flag) without a window reload. Rebuilds the server-status list
	 * from the current connection pool and, when the view is live, re-renders its HTML.
	 */
	public updateView(): void {
		// Rebuild the status list from the refreshed recorder settings, mutating the existing array in
		// place so the message handlers keep their reference.
		const servers = G4RecorderViewProvider.resolveServers(this._recordingService);
		this._serversStatus.length = 0;
		this._serversStatus.push(...servers);

		// Re-seed the panel-only overrides from the refreshed manifest.
		const settings = Utilities.getManifest()?.settings?.recorderSettings;
		this._useSandboxOverride = settings?.useSandbox === true;
		this._disableNetworkSandboxOverride = settings?.disableChromeNetworkSandbox === true;

		// Re-render the webview when it is live so the new recorder list and status are shown.
		if (this._view) {
			this._view.webview.html = this.getHtml();
		}
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

		// Extract recorder settings from the manifest to determine if the recorder is enabled
		const settings = Utilities.getManifest()?.settings?.recorderSettings;
		const enabled = settings?.enabled ?? true;

		// Prepare the initial server status payload to send to the webview
		const servers = this._serversStatus.map(service => ({
			name: service.name,
			url: service.url,
			ok: service.ok,
			driver: service.driver,
			suspended: service.suspended
		}));

		// Send an initial message to the webview to populate server data
		this._view?.webview.postMessage({
			type: 'servers:init',
			payload: {
				disableChromeNetworkSandbox: this._disableNetworkSandboxOverride,
				enabled: enabled,
				isRecording: this._recordingService.isRecording,
				useSandbox: this._useSandboxOverride,
				servers: servers
			}
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
		// Stop the periodic heartbeat if it's still running
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

					@keyframes bulbPulseSuspended {
						0% {
							box-shadow: 0 0 0px #e0a316;
						}

						50% {
							box-shadow: 0 0 6px #e0a316;
						}

						100% {
							box-shadow: 0 0 0px #e0a316;
						}
					}

					@keyframes spinnerRotate {
						from {
							transform: rotate(0deg);
						}
						to {
							transform: rotate(360deg);
						}
					}

					@media (prefers-reduced-motion: reduce) {
						.bulb.on,
						.bulb.suspended {
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
						width: 8px;
						height: 8px;
						flex: 0 0 auto;
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

					.bulb.suspended {
						animation: bulbPulseSuspended 1.2s ease-in-out infinite;
						background: #e0a316;
						box-shadow: 0 0 6px #e0a316;
						will-change: box-shadow;
					}

					.control-btn {
						display: flex;
						align-items: center;
						gap: 8px;
						min-width: 90px;
					}

					.controls {
						align-items: flex-start;
						display: flex;
						flex-direction: column;
						gap: 8px;
						margin-bottom: 12px;
					}

					.left {
						display: flex;
						align-items: center;
						gap: 8px;
						flex: 1 1 auto;
						min-width: 0;
					}

					.meta {
						display: flex;
						flex-direction: column;
						min-width: 0;
					}

					.name {
						font-weight: 600;
						overflow: hidden;
						text-overflow: ellipsis;
						white-space: nowrap;
					}

					.driver {
						font-size: 0.8rem;
						opacity: 0.7;
						overflow: hidden;
						text-overflow: ellipsis;
						white-space: nowrap;
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
						display: flex;
						align-items: center;
						justify-content: center;
						background: transparent;
						color: var(--vscode-textLink-foreground);
						border: 1px solid var(--vscode-editorGroup-border);
						padding: 4px;
						border-radius: var(--border-radius);
						flex: 0 0 auto;
					}

					.refresh:hover {
						background: rgba(127, 127, 127, 0.1);
					}

					.suspend-btn {
						display: flex;
						align-items: center;
						justify-content: center;
						background: transparent;
						color: var(--vscode-textLink-foreground);
						border: 1px solid var(--vscode-editorGroup-border);
						padding: 4px;
						border-radius: var(--border-radius);
						flex: 0 0 auto;
						cursor: pointer;
					}

					.suspend-btn:hover:not(:disabled) {
						background: rgba(127, 127, 127, 0.1);
					}

					.suspend-btn:disabled {
						opacity: 0.4;
						cursor: not-allowed;
					}

					.switch {
						background-color: var(--vscode-panel-border);
						border-radius: 9px;
						height: 18px;
						position: relative;
						transition: background-color .15s ease;
						width: 34px;
					}

					.switch::after {
						background-color: var(--vscode-editor-background);
						border-radius: 50%;
						content: '';
						height: 14px;
						left: 2px;
						position: absolute;
						top: 2px;
						transition: transform .15s ease;
						width: 14px;
					}

					.toggle {
						align-items: center;
						cursor: pointer;
						display: inline-flex;
						gap: 10px;
					}

					.toggle input {
						height: 0;
						opacity: 0;
						position: absolute;
						width: 0;
					}

					.toggle input:checked + .switch {
						background-color: var(--vscode-testing-iconPassed, #22c55e);
					}

					.toggle input:checked + .switch::after {
						transform: translateX(16px);
					}

					.toggle-hint {
						color: var(--vscode-descriptionForeground);
						font-size: 11px;
					}

					.toggle-label {
						font-size: 12px;
						font-weight: 600;
					}

					.toggle-text {
						display: flex;
						flex-direction: column;
						gap: 2px;
					}

					.row {
						display: flex;
						gap: 8px;
						align-items: center;
					}

					.server {
						display: flex;
						align-items: center;
						gap: 8px;
						padding: 6px 0;
						border-top: 1px solid var(--vscode-editorGroup-border);
					}

					.server:first-child {
						border-top: none;
					}

					.small {
						font-size: 0.85rem;
						opacity: .8;
						overflow-wrap: anywhere;
					}

					.spinner {
						animation: spinnerRotate 1s linear infinite;
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
						flex: 0 1 auto;
						min-width: 0;
					}
				</style>
			</head>

			<body data-g4-recorder-view="true">
				<div class="controls">
					<button id="btnToggle" class="control-btn"
						title="Start recording - connect to the recorder servers and capture UI actions (launches the browser for Chromium recorders)."
						aria-label="Start recording" data-state="stopped">
						<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" width="20" height="20" class="svg-inline">
							<path
								d="M187.2 100.9C174.8 94.1 159.8 94.4 147.6 101.6C135.4 108.8 128 121.9 128 136L128 504C128 518.1 135.5 531.2 147.6 538.4C159.7 545.6 174.8 545.9 187.2 539.1L523.2 355.1C536 348.1 544 334.6 544 320C544 305.4 536 291.9 523.2 284.9L187.2 100.9z" />
						</svg>
						<span>Start</span>
					</button>
					<label class="toggle" title="Use sandbox recorder services for the next start.">
						<input type="checkbox" id="useSandboxToggle" aria-label="Use Sandbox Recorders" />
						<span class="switch"></span>
						<span class="toggle-text">
							<span class="toggle-label">Use Sandbox</span>
							<span class="toggle-hint">Applies only to future starts.</span>
						</span>
					</label>
					<label class="toggle"
					       title="Start the recorder's Chrome without its network sandbox. Use it only when recorder pages stay blank."
					       data-test-id="disable-chrome-network-sandbox-toggle">
						<input type="checkbox"
						       id="disableNetworkSandboxToggle"
						       data-test-id="disable-chrome-network-sandbox-checkbox"
						       aria-label="Turn off the Chrome network sandbox" />
						<span class="switch"></span>
						<span class="toggle-text">
							<span class="toggle-label">Chrome Network Sandbox Off</span>
							<span class="toggle-hint">Only if pages stay blank. Applies to future starts.</span>
						</span>
					</label>
				</div>

				<div class="panel">
					<div class="top">
						<h3>Servers</h3>
						<button class="refresh" id="btnRefresh"
							title="Refresh recorder status - re-check the connection to each recorder server and update the indicators."
							aria-label="Refresh recorder status">
							<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" width="20" height="20"
								class="svg-inline-secondary">
								<path
									d="M552 256L408 256C398.3 256 389.5 250.2 385.8 241.2C382.1 232.2 384.1 221.9 391 215L437.7 168.3C362.4 109.7 253.4 115 184.2 184.2C109.2 259.2 109.2 380.7 184.2 455.7C259.2 530.7 380.7 530.7 455.7 455.7C463.9 447.5 471.2 438.8 477.6 429.6C487.7 415.1 507.7 411.6 522.2 421.7C536.7 431.8 540.2 451.8 530.1 466.3C521.6 478.5 511.9 490.1 501 501C401 601 238.9 601 139 501C39.1 401 39 239 139 139C233.3 44.7 382.7 39.4 483.3 122.8L535 71C541.9 64.1 552.2 62.1 561.2 65.8C570.2 69.5 576 78.3 576 88L576 232C576 245.3 565.3 256 552 256z" />
							</svg>
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
					const useSandboxToggle = document.getElementById('useSandboxToggle');
					const disableNetworkSandboxToggle = document.getElementById('disableNetworkSandboxToggle');
					let useSandbox = false;
					let isNetworkSandboxDisabled = false;

					// Inline SVGs (using normal strings)
					var PLAY_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" width="20" height="20" class="svg-inline">' +
						'<path d="M187.2 100.9C174.8 94.1 159.8 94.4 147.6 101.6C135.4 108.8 128 121.9 128 136L128 504C128 518.1 135.5 531.2 147.6 538.4C159.7 545.6 174.8 545.9 187.2 539.1L523.2 355.1C536 348.1 544 334.6 544 320C544 305.4 536 291.9 523.2 284.9L187.2 100.9z"/>' +
						'</svg>';

					var STOP_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" width="20" height="20" class="svg-inline">' +
						'<path d="M160 96L480 96C515.3 96 544 124.7 544 160L544 480C544 515.3 515.3 544 480 544L160 544C124.7 544 96 515.3 96 480L96 160C96 124.7 124.7 96 160 96z"/>' +
						'</svg>';
					
					var SPINNER_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" width="20" height="20" class="svg-inline spinner">' +
						'<path d="M286.7 96.1C291.7 113 282.1 130.9 265.2 135.9C185.9 159.5 128.1 233 128.1 320C128.1 426 214.1 512 320.1 512C426.1 512 512.1 426 512.1 320C512.1 233.1 454.3 159.6 375 135.9C358.1 130.9 348.4 113 353.5 96.1C358.6 79.2 376.4 69.5 393.3 74.6C498.9 106.1 576 204 576 320C576 461.4 461.4 576 320 576C178.6 576 64 461.4 64 320C64 204 141.1 106.1 246.9 74.6C263.8 69.6 281.7 79.2 286.7 96.1z"/>' +
						'</svg>';

					// Per-recorder suspend/resume icons (link-colored, sized to the compact row button).
					var SUSPEND_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" width="16" height="16" class="svg-inline-secondary">' +
						'<path d="M176 96C149.5 96 128 117.5 128 144L128 496C128 522.5 149.5 544 176 544L240 544C266.5 544 288 522.5 288 496L288 144C288 117.5 266.5 96 240 96L176 96zM400 96C373.5 96 352 117.5 352 144L352 496C352 522.5 373.5 544 400 544L464 544C490.5 544 512 522.5 512 496L512 144C512 117.5 490.5 96 464 96L400 96z"/>' +
						'</svg>';

					var RESUME_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" width="16" height="16" class="svg-inline-secondary">' +
						'<path d="M187.2 100.9C174.8 94.1 159.8 94.4 147.6 101.6C135.4 108.8 128 121.9 128 136L128 504C128 518.1 135.5 531.2 147.6 538.4C159.7 545.6 174.8 545.9 187.2 539.1L523.2 355.1C536 348.1 544 334.6 544 320C544 305.4 536 291.9 523.2 284.9L187.2 100.9z"/>' +
						'</svg>';

					function setToggleState(running) {
						btnToggle.dataset.state = running ? 'running' : 'stopped';
						btnToggle.title = running
							? 'Stop recording - end capture, close any recorder browsers, and open the recorded workflow.'
							: 'Start recording - connect to the recorder servers and capture UI actions (launches the browser for Chromium recorders).';
						btnToggle.setAttribute('aria-label', running ? 'Stop recording' : 'Start recording');
						btnToggle.innerHTML = (running ? STOP_SVG : PLAY_SVG) + '<span>' + (running ? 'Stop' : 'Start') + '</span>';
					}

					setToggleState(false);

					// True from a Start or Stop click until the extension reports the result, so a status
					// refresh in between cannot flip the button back.
					var isTogglePending = false;

					// Shows a spinner on the button while the extension starts or stops the session.
					function setTogglePending(text) {
						isTogglePending = true;
						btnToggle.dataset.state = 'pending';
						btnToggle.setAttribute('aria-label', text);
						btnToggle.innerHTML = SPINNER_SVG + '<span>' + text + '</span>';
					}

					// Ask the extension to start or stop; the button changes only when it reports the real
					// state (recorder:state), so a refused start or a failed stop never shows a wrong state.
					btnToggle.addEventListener('click', function () {
						if (isTogglePending) {
							return;
						}

						var running = btnToggle.dataset.state === 'running';

						if (running) {
							setTogglePending('Closing...');
							vscode.postMessage({ type: 'recorder:stop' });
						} else {
							setTogglePending('Starting...');
							vscode.postMessage({
								type: 'recorder:start',
								disableChromeNetworkSandbox: isNetworkSandboxDisabled,
								useSandbox: useSandbox
							});
						}
					});

					useSandboxToggle.addEventListener('change', function () {
						useSandbox = useSandboxToggle.checked === true;
						vscode.postMessage({ type: 'recorder:useSandbox', useSandbox: useSandbox });
					});

					// Keep the network-sandbox switch in the extension's memory so a re-rendered panel shows it again.
					disableNetworkSandboxToggle.addEventListener('change', function () {
						isNetworkSandboxDisabled = disableNetworkSandboxToggle.checked === true;
						vscode.postMessage({
							type: 'recorder:disableChromeNetworkSandbox',
							disableChromeNetworkSandbox: isNetworkSandboxDisabled
						});
					});

					document.getElementById('btnRefresh').addEventListener('click', function () {
						vscode.postMessage({ type: 'recorder:refresh' });
					});

					function render(serversData) {
						const servers = serversData.servers || [];
						serversElement.innerHTML = '';

						if (serversData.useSandbox !== undefined) {
							useSandbox = serversData.useSandbox === true;
							useSandboxToggle.checked = useSandbox;
						}

						// Show the extension's network-sandbox switch, which also follows manifest edits.
						if (serversData.disableChromeNetworkSandbox !== undefined) {
							isNetworkSandboxDisabled = serversData.disableChromeNetworkSandbox === true;
							disableNetworkSandboxToggle.checked = isNetworkSandboxDisabled;
						}

						// Follow the real session state (also changed from the palette or the settings
						// prompt), except while a Start or Stop click waits for its result.
						if (serversData.isRecording !== undefined && !isTogglePending) {
							setToggleState(serversData.isRecording === true);
						}

						// Hide the controls while the recorder is disabled and show them again when it is
						// enabled; removing them meant only a window reload could bring them back.
						var controlDisplay = serversData.enabled ? '' : 'none';

						for (var control of document.querySelectorAll('#btnToggle, div.top, #btnRefresh')) {
							control.style.display = controlDisplay;
						}

						if(!serversData.enabled) {
							const disabledMsg = document.createElement('div');
							disabledMsg.className = 'small';
							disabledMsg.textContent = 'Recorder is disabled in settings. In order to enable it, ' +
								'please update the extension settings under "Recorder Settings" and set "enabled" to true.';
							serversElement.appendChild(disabledMsg);
							
							return;
						}

						if(servers.length === 0) {

							const noServersMsg = document.createElement('div');
							noServersMsg.className = 'small';
							noServersMsg.textContent = 'No recorder servers configured or connected.';
							serversElement.appendChild(noServersMsg);

							return;
						}
						
						for (const server of servers) {
							const row = document.createElement('div');
							row.className = 'server';

							const left = document.createElement('div');
							left.className = 'left';

							const bulb = document.createElement('span');

							// The light is the go / no-go of the recording, not of the recorder process: pulsing
							// green only while this recorder records in the session (amber when suspended), red
							// otherwise - before Start, after Stop, or when it did not join the session.
							let bulbClass = '';
							let bulbTitle = serversData.isRecording === true
								? 'Not recording: this recorder is not connected to the session'
								: 'Not recording';

							if (server.ok && server.suspended) {
								bulbClass = ' suspended';
								bulbTitle = 'Recording paused: suspended by the G4 Hub';
							} else if (server.ok) {
								bulbClass = ' on';
								bulbTitle = 'Recording';
							}

							bulb.className = 'bulb' + bulbClass;
							bulb.title = bulbTitle;
							bulb.setAttribute('data-test-id', 'recorder-status-light');
							left.appendChild(bulb);

							const meta = document.createElement('div');
							meta.className = 'meta';

							const name = document.createElement('span');
							name.className = 'name';
							name.textContent = server.name;
							meta.appendChild(name);

							const driver = document.createElement('span');
							driver.className = 'driver';
							driver.textContent = server.driver;
							driver.title = server.driver;
							meta.appendChild(driver);

							left.appendChild(meta);
							row.appendChild(left);

							const url = document.createElement('a');
							url.className = 'url';
							url.title = server.url;
							url.innerHTML = server.url;
							url.href = server.url + '/swagger';
							url.target = '_blank';
							row.appendChild(url);

							// Per-recorder suspend/resume: shows the suspend icon while active and the play
							// icon while suspended. Disabled until the recorder is connected, since
							// suspending an idle recorder has no effect.
							const isSuspended = !!server.suspended;
							const suspendBtn = document.createElement('button');
							suspendBtn.className = 'suspend-btn';
							suspendBtn.disabled = !server.ok;
							suspendBtn.innerHTML = isSuspended ? RESUME_SVG : SUSPEND_SVG;
							suspendBtn.title = server.ok
								? (isSuspended
									? 'Resume this recorder - continue capturing events.'
									: 'Suspend this recorder - stop capturing events (the hub connection stays open).')
								: 'Start the recorder to enable suspend.';
							suspendBtn.setAttribute('aria-label', isSuspended ? 'Resume this recorder' : 'Suspend this recorder');
							suspendBtn.addEventListener('click', function () {
								vscode.postMessage({
									type: isSuspended ? 'recorder:resume' : 'recorder:suspend',
									url: server.url
								});
							});
							row.appendChild(suspendBtn);

							serversElement.appendChild(row);
						}

						const time = new Date();
						footerElement.textContent = 'Last update: ' + time.toLocaleTimeString();
					}

					window.addEventListener('message', function (event) {
						const message = event.data;
						if (!message) {
							return;
						}

						switch (message.type) {
							case 'servers:init':
							case 'servers:update':
								render(message.payload || { servers: [] });
								break;
							case 'recorder:state':
								// The result of a Start or Stop click: show the real state and accept clicks again.
								isTogglePending = false;
								setToggleState(!!message.running);
								break;
						}
					});

					// Ask for the recorder rows and the session state at once, so a re-rendered panel
					// (for example after settings were applied) does not wait for the next heartbeat.
					vscode.postMessage({ type: 'recorder:refresh' });
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
				// Trigger VS Code command to start the Hub session; report the real outcome even when the
				// start was refused or failed, then show the connected recorders.
				try {
					await vscode.commands.executeCommand('Start-Recorder', {
						disableChromeNetworkSandbox: message.disableChromeNetworkSandbox === true,
						useSandbox: message.useSandbox === true
					});
				} finally {
					this.showRecordingState();
				}

				await this.testServers(serversStatus);
				break;
			}

			case 'recorder:stop': {
				// Trigger VS Code command to stop the Hub session; report the real outcome even when the
				// stop failed (the session then keeps running), then show the recorders.
				try {
					await vscode.commands.executeCommand('Stop-Recorder');
				} finally {
					this.showRecordingState();
				}

				await this.testServers(serversStatus);
				break;
			}

			case 'recorder:refresh': {
				// Manually trigger a server status refresh from the webview
				await this.testServers(serversStatus);
				break;
			}

			case 'recorder:suspend':
			case 'recorder:resume': {
				// Toggle buffering for the targeted recorder (identified by its base URL) on the Hub. The
				// recorder stays connected; suspending only drops its events until resumed.
				await this.updateRecorderSuspension(message.url, message.type === 'recorder:suspend');

				// Reflect the new suspended state immediately instead of waiting for the heartbeat tick.
				await this.testServers(serversStatus);
				break;
			}

			case 'recorder:disableChromeNetworkSandbox': {
				// Store only the panel switch; the manifest stays unchanged until edited in the settings page.
				this._disableNetworkSandboxOverride = message.disableChromeNetworkSandbox === true;
				await this.testServers(serversStatus);
				break;
			}

			case 'recorder:useSandbox': {
				// Store only the panel override; settings remain unchanged until edited in the settings page.
				this._useSandboxOverride = message.useSandbox === true;
				await this.testServers(serversStatus);
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
	 * Resolves one status row per enabled recorder from the manifest settings.
	 *
	 * @remarks
	 * Compute-only. Connection and suspension come from the latest Hub session status, so every row is idle
	 * until a session runs.
	 *
	 * @param recordingService - The shared recording session owner.
	 * @returns One status row per enabled recorder.
	 */
	private static resolveServers(recordingService: G4RecordingService): ServerStatus[] {
		return recordingService.recorders.map(recorder => {
			// Generate a unique ID for this server status entry.
			const id = Utilities.newRandomString(8);
			const recorderStatus = recordingService.getRecorderStatus(recorder.baseUrl);

			return {
				id,
				name: `Recorder (${id})`,
				ok: recorderStatus?.connected === true,
				suspended: recorderStatus?.suspended === true,
				url: recorder.baseUrl,
				driver: recorder.driverParameters?.driver || 'Unknown'
			};
		});
	}

	/**
	 * Starts the heartbeat cycle that periodically checks the status of connected servers.
	 */
	private startHeartbeat() {
		// Run an immediate server health check before starting the periodic cycle
		void this.testServers(this._serversStatus);

		// Schedule recurring checks every 5 seconds (5000 ms)
		this._timer = setInterval(
			() => void this.testServers(this._serversStatus),
			5000
		);
	}

	/**
	 * Refreshes the session status from the Hub and updates every recorder row in the webview.
	 *
	 * @remarks
	 * Each row's light is the go / no-go of the recording: it follows only the Hub's session status (connected,
	 * suspended), never whether the recorder process is running, so it is red before Start and turns red as
	 * soon as Stop ends the session. A Hub that cannot be reached keeps the previous snapshot and logs the
	 * failure, so a transient network error does not flicker the panel.
	 *
	 * @param serversStatus - The rows to update in place.
	 * @returns A promise that resolves once the webview received the update.
	 */
	private async testServers(serversStatus: ServerStatus[]): Promise<void> {
		// Refresh the Hub snapshot; a failure keeps the previous one so a network blip does not flicker the rows.
		try {
			await this._recordingService.updateStatus();
		} catch (error: unknown) {
			const reason = Utilities.resolveErrorMessage(error);
			console.warn(`[G4RecorderViewProvider] Recording status refresh failed: ${reason}`);
		}

		// Apply the session snapshot to every row; an idle service has none, so every row is off after Stop.
		const updates: ServerStatus[] = [];

		for (const status of serversStatus) {
			const recorderStatus = this._recordingService.getRecorderStatus(status.url);

			status.ok = recorderStatus?.connected === true;
			status.suspended = recorderStatus?.suspended === true;
			status.lastChecked = Date.now();

			updates.push({ ...status });
		}

		// Extract recorder settings from the manifest to determine if the recorder is enabled
		const settings = Utilities.getManifest()?.settings?.recorderSettings;
		const enabled = settings?.enabled ?? true;

		// Map the updated statuses to a simplified format for the webview
		const servers = updates.map(service => ({
			name: service.name,
			url: service.url,
			ok: service.ok,
			driver: service.driver,
			suspended: service.suspended
		}));

		// Broadcast the updated server statuses and the session state back to the webview, so a session
		// started or stopped elsewhere (the palette, the settings prompt) corrects the button.
		this._view?.webview.postMessage({
			type: 'servers:update',
			payload: {
				disableChromeNetworkSandbox: this._disableNetworkSandboxOverride,
				enabled: enabled,
				isRecording: this._recordingService.isRecording,
				useSandbox: this._useSandboxOverride,
				servers: servers
			}
		});
	}

	/**
	 * Sends the real recording state to the webview after a Start or Stop click.
	 *
	 * @remarks
	 * The button shows a spinner from the click until this message arrives, so it never shows a
	 * guessed state: a refused start stays on Start and a failed stop stays on Stop.
	 */
	private showRecordingState(): void {
		void this._view?.webview.postMessage({
			type: 'recorder:state',
			running: this._recordingService.isRecording
		});
	}

	/**
	 * Suspends or resumes one recorder of the running Hub session.
	 *
	 * @remarks
	 * A rejected request (for example after the session stopped) is shown to the user; the panel then
	 * refreshes and shows the real state.
	 *
	 * @param baseUrl - The recorder endpoint shown in the row.
	 * @param isSuspended - True to suspend, false to resume.
	 * @returns A promise that resolves once the Hub answered.
	 */
	private async updateRecorderSuspension(baseUrl: string, isSuspended: boolean): Promise<void> {
		try {
			// Ask the Hub to change only this recorder; the session and the other recorders continue unchanged.
			if (isSuspended) {
				await this._recordingService.suspendRecorder(baseUrl);
			} else {
				await this._recordingService.resumeRecorder(baseUrl);
			}
		} catch (error: unknown) {
			// Show the Hub's reason so the user knows why the row did not change (for example a stopped session).
			const action = isSuspended ? 'suspend' : 'resume';
			const reason = Utilities.resolveErrorMessage(error);
			vscode.window.showErrorMessage(`Failed to ${action} recorder ${baseUrl}: ${reason}`);
		}
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
	 * Optional - may be undefined if the server has never been checked or initialized.
	 */
	lastChecked?: number;

	/** 
	 * Human-readable name of the server.
	 * Displayed in the UI and used for quick identification (e.g., "G4 API", "Recorder Service").
	 */
	name: string;

	/**
	 * Indicates whether this recorder is connected to the running recording session, as the Hub reports it.
	 * Drives the row's go / no-go light; always false while no session runs, even when the recorder process
	 * is up.
	 */
	ok: boolean;

	/**
	 * Indicates whether the Hub suspended this recorder; its events are dropped until resumed.
	 * Always false while no session runs.
	 */
	suspended: boolean;

	/**
	 * Base URL of the server.
	 * Used for direct navigation (e.g., to Swagger docs) and network operations.
	 */
	url: string;

	/**
	 * The raw driver name from the recorder's configuration (e.g., "ChromeDriver",
	 * "UiaDriver"), shown under the recorder name in the panel.
	 */
	driver: string;
};
