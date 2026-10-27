/*
 * RESOURCES
 * https://code.visualstudio.com/api/references/commands
 */
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { CommandBase } from './command-base';
import { Logger } from '../logging/logger';
import { Utilities } from '../extensions/utilities';

/**
 * Command to create a new project structure in VS Code.
 * This command scaffolds a basic project layout with folders, manifests, and sample files.
 */
export class ShowWorkflowCommand extends CommandBase {
    // Logger instance scoped to this command
    // This allows us to log messages specific to the New Project command
    private readonly _logger: Logger;

    // Base URL for the G4 API, can be overridden in the constructor
    // This allows flexibility in testing or using different environments
    private readonly _baseUrl: string;

    /**
     * Initializes a new ShowWorkflowCommand for the G4 API.
     *
     * @param context - The VS Code extension context used to register the command
     *                  and manage its lifecycle.
     * @param baseUrl - The base URL for the G4 API, defaults to 'http://localhost:9944'.
     *                  This can be overridden to point to a different server or environment.
     */
    constructor(context: vscode.ExtensionContext, baseUrl: string) {
        // Invoke the base constructor to set up shared properties
        // (logger, client, context, manifest, etc.)
        super(context);

        // Create a child logger scoped to this command for clearer log output
        this._logger = this.logger?.newLogger('G4.ShowWorkflowCommand');

        // Set the base URL for API calls, defaulting to localhost if not provided
        this._baseUrl = baseUrl;

        // Set the command identifier that will be used when registering
        // and invoking this command in the extension
        this.command = 'Show-Workflow';
    }

    /**
     * Registers this command with VS Code and ensures it is disposed when the extension deactivates.
     */
    protected async onRegister(args?: any): Promise<any> {
        // Register the command identifier; when the user runs it, invoke our command pipeline
        let command = vscode.commands.registerCommand(
            this.command,
            async (commandArgs?: any) => {
                await this.invokeCommand(commandArgs ?? args);
            }
        );

        // Add the registration disposable to the extension context so VS Code cleans it up automatically
        this.context.subscriptions.push(command);
    }

    /**
     * Opens the embedded workflow web application in a VS Code Webview,
     * loading remote resources, patching them locally, and wiring up log forwarding.
     */
    protected async onInvokeCommand(args: any): Promise<any> {
        const panel = vscode.window.createWebviewPanel(
            'g4-workflow',
            'G4 Workflow',
            vscode.ViewColumn.One,
            ShowWorkflowCommand.getWebviewOptions(this.context, path.join(this.context.globalStorageUri.fsPath, 'webapp'))
        );

        // Close the tab this command opened when the designer could not be loaded; the failure was
        // already reported, so no empty G4 Workflow tab is left behind.
        const isRendered = await this.renderWorkflowWebview(panel, args);

        if (!isRendered) {
            panel.dispose();
        }
    }

    /**
     * Renders the embedded workflow application into an existing webview panel.
     *
     * @remarks
     * The designer is downloaded from the G4 Hub on every open. When that fails (the Hub is down or
     * answers with an error), the panel shows what happened instead of staying blank, the failure is
     * logged and shown as an error notification naming the Hub URL and the reason, and the method
     * returns false, so a caller that opened the panel itself can close it.
     *
     * @returns True when the designer was rendered; false when it could not be loaded from the Hub.
     */
    public async renderWorkflowWebview(panel: vscode.WebviewPanel, args: any): Promise<boolean> {
        // Determine where to cache downloaded webapp files
        const storageDir = path.join(this.context.globalStorageUri.fsPath, 'webapp');

        // Cache the webapp resources before rendering. The panel is already open but blank while the
        // files download, so surface a built-in VS Code progress notification to signal the wait.
        // The in-webview spinner then takes over once the HTML is assigned at the end of this method.
        try {
            await vscode.window.withProgress(
                {
                    cancellable: false,
                    location: vscode.ProgressLocation.Notification,
                    title: 'Opening G4 Workflow editor…'
                },
                async (progress) => {
                    // Download and patch all integration resources into the storage directory.
                    await ShowWorkflowCommand.resolveResources(this._baseUrl, storageDir, progress);
                }
            );
        } catch (error) {
            // Explain the failure in the tab and in a notification, instead of leaving a blank tab
            // behind the generic error VS Code shows for a command that throws.
            const reason = ShowWorkflowCommand.getLoadFailureReason(error);
            const message = `The G4 Workflow designer could not be loaded from the G4 Hub at ${this._baseUrl}: ${reason}`;

            this._logger.error(message);
            panel.webview.html = ShowWorkflowCommand.getLoadFailureHtml(message);
            void vscode.window.showErrorMessage(message);

            return false;
        }

        // Path to the main HTML entry point of the web application
        const indexPath = path.join(storageDir, 'views', 'canvas.html');

        panel.webview.options = ShowWorkflowCommand.getWebviewOptions(this.context, storageDir);

        // Inject a small script that forwards console logs and errors from the webview to the extension
        const headerShim = ShowWorkflowCommand.getHeaderShim();
        const bodyShim = ShowWorkflowCommand.getBodyShim();

        // Load the raw HTML, rewrite resource references, and inject the shim
        let html = await fs.readFile(indexPath, 'utf8');
        html = ShowWorkflowCommand.setHtml(panel, storageDir, html);
        html = html.replace(/<\/head>/i, headerShim + '</head>');
        html = html.replace(/<\/body>/i, bodyShim + '</body>');

        /**
         * Handles messages sent from the webview to the VS Code extension host.
         *
         * Supported message types:
         * - workflow:import  - Reads a workflow file selected by the webview.
         * - webview:ready    - Sends the initial workflow to the webview when it is ready.
         * - workflow:result  - Receives the workflow result from the webview.
         * - console          - Receives console output from the webview and writes it to the extension logger.
         */
        panel.webview.onDidReceiveMessage(async message => {
            // Delegate message handling to the resolveMessage method, passing along the panel, command arguments, and message payload
            // This keeps the message handling logic organized and allows resolveMessage to be async if needed.
            await this.resolveMessage(panel, args, message);
        });

        // Finally, assign the processed HTML to the webview to render the app
        panel.webview.html = html;

        return true;
    }

    /**
     * Returns the page a designer tab shows when the designer could not be loaded from the Hub.
     *
     * @remarks
     * Compute-only. The message is HTML-escaped, and the page uses the VS Code theme colors, so it
     * reads like the rest of the editor.
     *
     * @param message - The failure message, naming the Hub URL and the reason.
     * @returns The page markup.
     */
    public static getLoadFailureHtml(message: string): string {
        // Escape the text, since the reason comes from the network stack or the Hub.
        const escapedMessage = message
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;');

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';">
    <title>G4 Workflow</title>
    <style>
        body { color: var(--vscode-foreground); font-family: var(--vscode-font-family); padding: 2rem; }
        h1 { font-size: 1.2rem; font-weight: 600; }
    </style>
</head>
<body>
    <h1 data-test-id="workflow-load-failure-title">The G4 Workflow designer could not be loaded</h1>
    <p data-test-id="workflow-load-failure-message">${escapedMessage}</p>
    <p data-test-id="workflow-load-failure-hint">Start the G4 Hub (or check its address in G4 Settings), then open the designer again.</p>
</body>
</html>`;
    }

    /**
     * Masks credential values in a text that the designer page logs.
     *
     * @remarks
     * Compute-only. The designer logs automation requests and events as JSON text, and the run's
     * `authentication` carries the license token and password. Every `"token"` and `"password"`
     * value is replaced with `***`, in plain JSON and in JSON nested as an escaped string
     * (`\"token\":\"...\"`). The value pattern stops at a quote or a backslash, so the scan is
     * linear. Text that is not a string is returned as an empty string.
     *
     * @param text - The console text from the designer page.
     * @returns The text with every credential value masked.
     */
    public static convertToMaskedText(text: unknown): string {
        // Only text can be logged; anything else carries nothing to show.
        if (typeof text !== 'string') {
            return '';
        }

        // Match a credential key with its opening quote (escaped or not), then the value up to its end.
        const credentialPattern = /(\\?"(?:token|password)\\?"\s*:\s*\\?")[^"\\]*/gi;

        return text.replaceAll(credentialPattern, '$1***');
    }

    /**
     * Reads the license token a designer run uses when it has none of its own.
     *
     * @remarks
     * Compute-only. Returns the manifest's `authentication.token` when it is text, otherwise ''.
     * The caller sends it only to the run that asked, so the token stays out of the workflow and
     * the bot file; it is never logged.
     *
     * @param manifest - The project manifest, as Utilities.getManifest returns it.
     * @returns The token, or '' when the manifest has none.
     */
    public static getManifestToken(manifest: unknown): string {
        const token = (manifest as { authentication?: { token?: unknown; }; } | undefined)?.authentication?.token;

        return typeof token === 'string' ? token : '';
    }

    /**
     * Describes why the designer download failed, for the failure message.
     *
     * @remarks
     * Compute-only. Node's fetch reports a refused or unreachable server only as "fetch failed" and
     * keeps the real cause (for example `connect ECONNREFUSED 127.0.0.1:9944`) on `error.cause`, so
     * the cause is preferred when it carries text.
     *
     * @param error - The value the download threw.
     * @returns The reason text.
     */
    public static getLoadFailureReason(error: unknown): string {
        // Prefer the underlying network error, which names what actually went wrong.
        const cause = error instanceof Error ? error.cause : undefined;
        const causeMessage = cause instanceof Error ? cause.message : '';

        if (causeMessage.length > 0) {
            return causeMessage;
        }

        return Utilities.resolveErrorMessage(error);
    }

    /**
     * Returns an HTML snippet that injects a script to forward console messages
     * and uncaught errors from the Webview to the VS Code extension host.
     *
     * @returns A string containing a <script> element for shimmed console logging.
     */
    private static getHeaderShim(): string {
        return `
        <script>
        (function () {
            // Acquire the VS Code API object which allows communication between the webview and the extension host.
            window.vscodeApi = acquireVsCodeApi();

            // A special marker used to identify console messages that contain document results.
            const documentResultMarker = '__G4_DOCUMENT_RESULT_BASE64__:';

            /**
             * Converts a value into a string representation.
             *
             * Behavior:
             * - Returns strings as-is.
             * - Converts an Error to its stack (or name and message), because JSON.stringify
             *   skips the non-enumerable message and stack and would log '{}'.
             * - Converts other non-string values to JSON text.
             * - Falls back to String(value) if JSON serialization fails.
             *
             * @param value - The value to convert.
             * @returns The string representation of the provided value.
             */
            const convertFromJson = (value) => {
                // Describe an Error by its stack, which already starts with its name and message.
                if (value instanceof Error) {
                    return value.stack || (value.name + ': ' + value.message);
                }

                try {

                    // If the value is already a string, no conversion is needed,
                    // otherwise convert objects, arrays, numbers, booleans, null, etc. to JSON text.
                    return typeof value === 'string'
                        ? value
                        : JSON.stringify(value);
                } catch {
                    // Fallback for values that cannot be serialized,
                    // for example circular objects.
                    return String(value);
                }
            };

            /**
             * Sends a console message from the webview to the VS Code extension host.
             *
             * The extension side should listen for messages with type 'console'
             * and handle the provided log level and text payload.
             *
             * @param level - The console level, for example 'log', 'info', 'warn', or 'error'.
             * @param text  - The console message text to send.
             */
            const sendConsoleMessage = (level, text) => {
                // Post a message to the VS Code extension host.
                window.vscodeApi.postMessage({
                    // Message type used by the extension to identify console messages.
                    type: 'console',

                    // Console message data.
                    payload: {
                        level,
                        text
                    }
                });
            };

            /**
             * Detects and sends a document result payload from console text.
             *
             * Behavior:
             * - Looks for the configured document result marker inside the text.
             * - If the marker is not found, returns false so the text can be handled normally.
             * - If the marker is found, extracts everything after the marker as a Base64 payload.
             * - If the payload is empty, sends a warning to the extension console.
             * - If the payload exists, posts it to the VS Code extension host.
             *
             * @param text - The console text to inspect.
             * @returns True if the text contained a document result marker; otherwise false.
             */
            const sendDocumentResult = (text) => {
                // Locate the document result marker inside the console text.
                const markerIndex = text.indexOf(documentResultMarker);

                // Marker was not found, so this is a regular console message.
                if (markerIndex < 0) {
                    return false;
                }

                // Extract the Base64 payload that appears after the marker.
                const base64 = text
                    .substring(markerIndex + documentResultMarker.length)
                    .trim();

                // Marker exists, but no payload was provided after it.
                if (!base64) {
                    sendConsoleMessage(
                        'warn',
                        'Document result marker was found, but payload is empty.'
                    );

                    // The message was handled as a document result, even though the payload is missing.
                    return true;
                }

                // Send the document result payload to the VS Code extension host.
                window.vscodeApi.postMessage({
                    type: 'workflow:result',
                    payload: base64
                });

                // The message was handled as a document result.
                return true;
            };

            // Intercepts selected console methods and forwards their output to the
            // VS Code extension host.
            ['log', 'warn', 'error', 'info', 'debug'].forEach(level => {
                // Keep a bound reference to the original console method.
                // Binding preserves the correct 'console' context when calling it later.
                const original = console[level].bind(console);

                // Replace the console method with a wrapper.
                console[level] = (...args) => {
                    // Write to the original browser/devtools console first.
                    original(...args);

                    // Convert all console arguments to text and join them into one message.
                    const text = args
                        .map(convertFromJson)
                        .join(' ');

                    // If this message contains a document result marker,
                    // handle it as a document result instead of a regular console message.
                    if (sendDocumentResult(text)) {
                        return;
                    }

                    // Forward normal console output to the VS Code extension host.
                    sendConsoleMessage(level, text);
                };
            });

            /**
             * Captures unhandled JavaScript runtime errors from the webview window
             * and forwards them to the VS Code extension host as console error messages.
             *
             * This helps surface webview errors in the extension side, instead of only
             * showing them inside the webview developer tools.
             */
            window.addEventListener('error', e => {
                // Send the error message, source file, and line number to the extension.
                sendConsoleMessage(
                    'error',
                    e.message + ' at ' + e.filename + ':' + e.lineno
                );
            });

            /**
             * Captures unhandled Promise rejections from the webview window
             * and forwards them to the VS Code extension host as console error messages.
             *
             * This helps detect async errors that were not caught with '.catch()'
             * or a try/catch around an awaited operation.
             */
            window.addEventListener('unhandledrejection', e => {
                // Convert the rejection reason to text and send it as an error message.
                sendConsoleMessage(
                    'error',
                    'Unhandled promise rejection: ' + convertFromJson(e.reason)
                );
            });
        })();
        </script>`;
    }

    /**
     * Returns the HTML `<script>` block to inject into the WebView.
     * This script wires up drag-and-drop file import and messaging
     * between the WebView and the VS Code extension host.
     *
     * @returns {string} The HTML/JS shim as a string.
     */
    private static getBodyShim(): string {
        // Use a template string to return the entire <script> block
        return `
        <script>
            // Acquire the VS Code API for sending messages back to the extension
            const vscode = window.vscodeApi;

            // Get the drop area element by its ID in the DOM
            const dropArea = document.getElementById('designer');

            // Attach a handler for files dropped onto the drop area
            dropArea.addEventListener('drop', e => {
                // Prevent the browser from opening the file by default
                e.preventDefault();

                // VS Code only supplies a URI, so grab it from dataTransfer
                const fileUri = e.dataTransfer.getData('text/uri-list');
                if (fileUri) {
                    // Notify the extension to import the file at this URI
                    vscode.postMessage({
                        type: 'workflow:import',
                        payload: {
                            fileUri: fileUri
                        }
                    });
                }
            });

            /**
             * Resolves once the workflow designer is genuinely ready to accept a definition.
             *
             * The '.sqd-root-start-stop' node only exists after the designer has been created
             * and the global 'setDefinition' helper has been wired up, so both are used as the
             * readiness signal. Unlike a one-shot 'waitForElement', this poller never rejects and
             * keeps checking across the full budget, so it tolerates slow manifest/resource loads
             * instead of silently dropping the ready signal.
             *
             * @param timeout  - Maximum time to wait, in milliseconds.
             * @param interval - Delay between readiness checks, in milliseconds.
             * @returns A promise that resolves to true when the designer is ready, otherwise false.
             */
            const waitForDesigner = (timeout = 30000, interval = 100) => new Promise(resolve => {
                const startTime = Date.now();
                const timer = setInterval(() => {
                    // 'setDefinition' is a global-scope binding, so guard the probe defensively.
                    let isReady = false;
                    try {
                        isReady = typeof setDefinition === 'function'
                            && document.querySelector('.sqd-root-start-stop') !== null;
                    } catch {
                        isReady = false;
                    }

                    // Resolve when ready, or once the wait budget has been exhausted.
                    if (isReady || (Date.now() - startTime) >= timeout) {
                        clearInterval(timer);
                        resolve(isReady);
                    }
                }, interval);
            });

            // Delay between the last designer edit and its report, so typing in a property box sends
            // one update instead of one per keystroke; also how long an import may keep re-rendering.
            const CHANGE_REPORT_DELAY_MILLISECONDS = 300;

            // Pending report of a designer edit, replaced by every newer edit.
            let changeReportTimer = null;

            // True while an imported definition settles, so its re-render is not reported as an edit.
            let isImportSettling = false;

            // Automation the designer last showed or reported, as JSON text. A change event that
            // leaves the automation unchanged (an import, a selection, a re-render) is not reported.
            let lastAutomationText = null;

            /**
             * Builds the bot automation from the designer's current definition.
             *
             * The definition is cloned first because the conversion normalizes some settings in
             * place, and the designer state must not change just because it was read.
             *
             * @returns The automation object, or null when the definition cannot be converted.
             */
            const getAutomation = () => {
                try {
                    return _client.newAutomation(structuredClone(_designer.getDefinition()));
                } catch {
                    return null;
                }
            };

            /**
             * Reports the designer's automation to the extension when it differs from the last one.
             *
             * The custom editor writes it into the bot document, so the tab becomes dirty, Undo
             * works, and Save writes the edit to the file.
             */
            const sendAutomationChange = () => {
                changeReportTimer = null;

                // Skip a definition that cannot be converted, and one that did not really change.
                const automation = getAutomation();
                const automationText = automation === null ? null : JSON.stringify(automation);

                if (automationText === null || automationText === lastAutomationText) {
                    return;
                }

                // Remember what was reported, then send it.
                lastAutomationText = automationText;
                vscode.postMessage({ type: 'workflow:changed', payload: { automation } });
            };

            /**
             * Schedules a change report after a designer edit; ignored while an import settles.
             */
            const onDefinitionChanged = () => {
                if (isImportSettling) {
                    return;
                }

                clearTimeout(changeReportTimer);
                changeReportTimer = setTimeout(sendAutomationChange, CHANGE_REPORT_DELAY_MILLISECONDS);
            };

            /**
             * Applies a workflow definition to the designer and resets the viewport.
             *
             * The imported automation becomes the baseline once the canvas has settled, so opening
             * a bot (or reloading it after Undo or an outside edit) never reports an edit back.
             *
             * @param definition - The parsed workflow definition to render.
             */
            const applyDefinition = (definition) => {
                // Drop any pending edit report: the imported definition replaces it.
                clearTimeout(changeReportTimer);
                isImportSettling = true;

                // Observe the workspace so 'resetView' can recenter once the canvas repaints.
                const workspaceElement = document.querySelector('.sqd-workspace');
                const workspaceObserver = new Observer(workspaceElement);

                // Render the definition and reset the viewport; on failure keep the last baseline.
                try {
                    setDefinition(definition);
                    resetView(workspaceObserver);
                } catch (applyErr) {
                    isImportSettling = false;
                    return;
                }

                // Take the baseline after the canvas settled, then report edits again.
                setTimeout(() => {
                    const automation = getAutomation();

                    lastAutomationText = automation === null ? null : JSON.stringify(automation);
                    isImportSettling = false;
                }, CHANGE_REPORT_DELAY_MILLISECONDS);
            };

            // How long a starting run waits for the extension to answer with the manifest token; a
            // run that gets no answer starts with the token it has, so it is never held up.
            const TOKEN_REQUEST_TIMEOUT_MILLISECONDS = 3000;

            // Token requests waiting for the extension's answer, keyed by request id.
            const pendingTokenRequests = new Map();
            let nextTokenRequestId = 0;

            /**
             * Asks the extension for the license token of the project manifest.
             *
             * Resolves the token, or '' when the manifest has none or no answer arrives in time.
             */
            const requestManifestToken = () => new Promise(resolve => {
                // Number the request, so the answer reaches the run that asked.
                nextTokenRequestId += 1;
                const requestId = nextTokenRequestId;

                // Give up after the timeout, so a missing answer cannot block the run.
                const timer = setTimeout(() => {
                    pendingTokenRequests.delete(requestId);
                    resolve('');
                }, TOKEN_REQUEST_TIMEOUT_MILLISECONDS);

                // Wait for the answer, then send the request.
                pendingTokenRequests.set(requestId, token => {
                    clearTimeout(timer);
                    resolve(token);
                });

                vscode.postMessage({ type: 'workflow:token:get', payload: { requestId } });
            });

            /**
             * Fills a starting run's license token from the project manifest when the run has none.
             *
             * A token in the bot or typed into the designer always wins. The manifest token goes
             * only into this run's request; it never enters the designer's definition, so it is
             * never written back to the bot file.
             */
            const setDefaultToken = async (automation) => {
                // Keep a token the user provided.
                const token = automation?.authentication?.token;
                const isTokenSet = typeof token === 'string' && token.trim() !== '';

                if (!automation || isTokenSet) {
                    return;
                }

                // Use the manifest token, when the project has one.
                const manifestToken = await requestManifestToken();

                if (manifestToken === '') {
                    return;
                }

                automation.authentication = { ...(automation.authentication || {}), token: manifestToken };
            };

            /**
             * Routes every StartAutomation request through setDefaultToken, so a designer run
             * without its own token uses the project's token, as Test Wright runs do.
             */
            const enableDefaultToken = () => {
                const invoke = _connection.invoke.bind(_connection);

                _connection.invoke = async (methodName, ...methodArguments) => {
                    if (methodName === 'StartAutomation') {
                        await setDefaultToken(methodArguments[0]);
                    }

                    return invoke(methodName, ...methodArguments);
                };
            };

            // Notify the extension only once the designer can actually accept a definition, after
            // the edit reports are wired, so the first import is already guarded.
            window.addEventListener('DOMContentLoaded', () => {
                waitForDesigner().then(isReady => {
                    if (isReady) {
                        _designer.onDefinitionChanged.subscribe(onDefinitionChanged);
                        enableDefaultToken();
                        vscode.postMessage({ type: 'webview:ready' });
                    } else {
                        console.warn('Workflow designer was not ready in time; ready signal skipped.');
                    }
                });
            });

            // Listen for messages coming back from the extension
            window.addEventListener('message', event => {
                // Extract the message type from the event data
                const type = event.data?.type;

                // Hand the extension's token answer to the run that asked for it.
                if (type === 'workflow:token') {
                    const requestId = event.data?.payload?.requestId;
                    const answer = pendingTokenRequests.get(requestId);
                    const token = event.data?.payload?.token;

                    if (answer) {
                        pendingTokenRequests.delete(requestId);
                        answer(typeof token === 'string' ? token : '');
                    }

                    return;
                }

                // Exit if the message type is not 'workflow:import'
                if (type !== 'workflow:import') {
                    return;
                }

                // Parse the incoming definition and render it.
                const definition = JSON.parse(event.data?.payload?.content || '{}');
                applyDefinition(definition);
            });
        </script>`;
    }

    /**
     * Resolves messages sent from the webview to the extension host.
     *
     * Supported message types:
     * - workflow:import - Reads a workflow file and sends its content back to the webview.
     * - workflow:token:get - Answers with the manifest's license token for a run that has none.
     * - webview:ready   - Sends an initial workflow to the webview when available.
     * - workflow:result - Opens the generated workflow report.
     * - console         - Writes webview console messages to the extension logger.
     *
     * @param panel   - The VS Code webview panel that sent the message.
     * @param args    - Optional command arguments used to initialize the webview.
     * @param message - The message received from the webview.
     */
    private async resolveMessage(panel: vscode.WebviewPanel, args: any, message: any) {
        const newId = (): string => {
            // Get the current local date and time for the report file name.
            const now = new Date();

            // Pads a number with leading zeros.
            const pad = (value: number, length: number = 2): string => {
                return value.toString().padStart(length, '0');
            };

            // Build the report file name using:
            // yyyy-MM-dd-hhmmssfff.g4rpt
            return `${now.getFullYear()}-` +
                `${pad(now.getMonth() + 1)}-` +
                `${pad(now.getDate())}-` +
                `${pad(now.getHours())}` +
                `${pad(now.getMinutes())}` +
                `${pad(now.getSeconds())}` +
                `${pad(now.getMilliseconds(), 3)}.g4rpt`;
        };

        // Saves a workflow automation result as a timestamped G4 report file
        // under <reportsFolder>/reports, where reportsFolder comes from the manifest's
        // clientReportSettings and is resolved against the first workspace folder ("." by default).
        //
        // Report file name format:
        // yyyy-MM-dd-hhmmssfff.g4rpt
        const newReport = async (id: string, automationResultBase64: any): Promise<{ id: string }> => {
            try {
                // Resolve the first workspace folder path.
                const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

                // A workspace folder is required because the report is saved to disk.
                if (!workspaceFolder) {
                    vscode.window.showErrorMessage(
                        'No workspace folder is open. Please open a folder before saving workflow reports.'
                    );
                    return { id: id };
                }

                // Build the reports folder path: <reportsFolder>/reports. The setting is the parent
                // folder (relative to the workspace, or absolute); "." keeps <current-workspace>/reports.
                const reportsParent = Utilities.getManifest()?.settings?.clientReportSettings?.reportsFolder || '.';
                const reportsFolder = path.resolve(workspaceFolder, reportsParent, 'reports');

                // Build the full report file path.
                const reportFilePath = path.join(reportsFolder, id);

                // Create the reports folder if it does not exist.
                await fs.mkdir(reportsFolder, { recursive: true });

                // Save the report payload as UTF-8 text.
                await fs.writeFile(
                    reportFilePath,
                    automationResultBase64,
                    'utf8'
                );
            } catch (err: any) {
                vscode.window.showErrorMessage(
                    'Failed to save report: ' + err.message
                );
            }
            return {
                'id': id
            };
        };

        // If the webview requests a workflow import, read the selected file
        // and send its content back to the webview.
        if (message.type === 'workflow:import') {
            await this.importWorkflowFile(panel, message.payload.fileUri);

            // No further handling is needed for this message, so we can exit early.
            return;
        }

        // A designer run that has no token of its own asks for the project's token. The answer goes
        // only into that run's request: it never enters the workflow or the bot file, and it is
        // never logged.
        if (message.type === 'workflow:token:get') {
            await panel.webview.postMessage({
                type: 'workflow:token',
                payload: {
                    requestId: message.payload?.requestId,
                    token: ShowWorkflowCommand.getManifestToken(Utilities.getManifest())
                }
            });

            return;
        }

        // A custom editor imports its open document, which may hold unsaved edits the file on disk lacks.
        if (message.type === 'webview:ready' && typeof args?.getContent === 'function') {
            const fileName = typeof args.fileUri === 'string'
                ? path.basename(vscode.Uri.parse(args.fileUri).fsPath)
                : 'G4 Workflow';

            panel.webview.postMessage({
                type: 'workflow:import',
                payload: {
                    fileName,
                    content: args.getContent()
                }
            });

            // No further handling is needed for this message, so we can exit early.
            return;
        }

        // When the webview is ready, import the file provided by command arguments.
        // Bot-file clicks and drag/drop both converge on the same import path.
        if (message.type === 'webview:ready' && args?.fileUri) {
            await this.importWorkflowFile(panel, args.fileUri);

            // No further handling is needed for this message, so we can exit early.
            return;
        }

        // When the webview is ready, send the initial workflow if one was provided.
        // This is useful when opening the editor with an existing workflow.
        if (message.type === 'webview:ready' && args?.workflow) {
            panel.webview.postMessage({
                type: 'workflow:import',
                payload: {
                    fileName: 'G4 Workflow',
                    content: JSON.stringify(args.workflow)
                }
            });

            // No further handling is needed for this message, so we can exit early.
            return;
        }

        // Receives the final workflow result from the webview.
        if (message.type === 'workflow:result') {
            // Build the report input passed to the report command.
            const report = {
                // The final workflow/report content produced by the webview.
                content: message.payload,

                // A simple report ID based on the current timestamp.
                id: newId(),

                // No file path is used here because the report content comes directly
                // from the webview message payload.
                path: null
            };

            // Check if the extension is configured to save reports to disk.
            const isSaveReports = Utilities.getManifest()?.settings?.clientReportSettings?.saveReports;

            // If saving reports is enabled, save the workflow result as a new report file.
            if (isSaveReports) {
                await newReport(report.id, message.payload);
            }

            // Check if the extension is configured to auto-open
            // the report view when a workflow result is received.
            const isAutoView = Utilities.getManifest()?.settings?.clientReportSettings?.autoView;

            // Open the report view using the registered VS Code command.
            if (isAutoView) {
                await vscode.commands.executeCommand('Show-Report', report);
            }

            // Stop processing this message because the workflow result was handled.
            return;
        }

        // Receives console messages forwarded from the webview.
        // These messages are written to the extension logger using the matching level.
        if (message.type === 'console') {
            const level = message.payload.level;

            // The designer logs every automation request it sends, credentials included; mask them before
            // anything reaches the log, which is written to disk.
            const text = ShowWorkflowCommand.convertToMaskedText(message.payload.text);

            switch (level) {
                case 'debug':
                    this._logger.debug(text);
                    break;

                case 'warn':
                    this._logger.warning(text);
                    break;

                case 'error':
                    this._logger.error(text);
                    break;

                case 'info':
                default:
                    this._logger.information(text);
                    break;
            }
        }
    }

    /**
     * Reads a workflow file and posts it into the workflow webview.
     */
    private async importWorkflowFile(panel: vscode.WebviewPanel, uri: string): Promise<void> {
        try {
            // Decode and parse the incoming URI (handles percent-encoded characters).
            const fileUri = vscode.Uri.parse(uri);

            // Read raw bytes from the workspace file system.
            const fileBytes = await vscode.workspace.fs.readFile(fileUri);

            // Convert raw bytes to UTF-8 text for non-notebook files.
            const text = Buffer.from(fileBytes).toString('utf8');

            // Derive a simple filename for display in the webview.
            const fileName = path.basename(fileUri.fsPath);
            panel.title = fileName || 'G4 Workflow';

            // Send the file name and content back to the webview for import.
            panel.webview.postMessage({
                type: 'workflow:import',
                payload: {
                    fileName,
                    content: text
                }
            });
        } catch (err: any) {
            // Log the failure and notify the webview of the error.
            this._logger.error(`Failed to read ${uri}: ${err}`);
            panel.webview.postMessage({
                type: 'workflow:import',
                payload: {
                    error: `Could not read file: ${err.message}`
                }
            });
        }
    }

    /**
     * Builds webview options shared by command panels and custom editor panels.
     */
    public static getWebviewOptions(context: vscode.ExtensionContext, storageDir: string): vscode.WebviewOptions & vscode.WebviewPanelOptions {
        const folders = vscode.workspace.workspaceFolders;
        const botsFolders = folders?.map(i => vscode.Uri.joinPath(i.uri, "bots")) || [];

        return {
            enableScripts: true,
            retainContextWhenHidden: true,
            localResourceRoots: [
                vscode.Uri.file(storageDir),
                vscode.Uri.file(path.join(context.extensionPath, 'images')),
                ...botsFolders
            ]
        };
    }

    /**
     * Downloads and patches integration resource files from the server to local storage.
     *
     * @param baseUrl     The root URL of the G4 API server (e.g., "http://localhost:9944").
     * @param storageDir  The local directory path where resources should be saved.
     * @param progress    Optional VS Code progress reporter advanced once per cached resource.
     *
     * @throws Error if any HTTP request fails.
     */
    private static async resolveResources(
        baseUrl: string,
        storageDir: string,
        progress?: vscode.Progress<{ increment?: number; message?: string }>
    ): Promise<void> {
        // Ensure the target directory exists (creates parent folders as needed)
        await fs.mkdir(storageDir, { recursive: true });

        // Requests use the runtime's built-in fetch. A lazy import('node-fetch') was loaded from a separate
        // webpack chunk, which broke when dist/ was rebuilt while the extension host kept the old bundle.

        // Fetch the list of resource file paths from the API endpoint
        const listResponse = await fetch(`${baseUrl}/api/v4/g4/integration/files`);

        // Abort early if the server returns a non-2xx status
        if (!listResponse.ok) {
            throw new Error(`Failed to fetch resource list: ${listResponse.status} ${listResponse.statusText}`);
        }

        // Read the response body as plain text before parsing
        const listText = await listResponse.text();
        let resources: string[];
        try {
            // Parse the JSON array of resource paths returned by the server
            resources = JSON.parse(listText);
        } catch {
            // Surface a clear error if the body is not valid JSON
            throw new Error(`Invalid resource list response from ${baseUrl}/api/v4/g4/integration/files`);
        }

        // Advance the progress notification in even steps across every resource so it climbs as files
        // are cached instead of jumping from empty to full only when the download completes.
        const incrementPerResource = resources.length > 0
            ? 100 / resources.length
            : 0;

        // Iterate through each resource path returned by the server
        for (const resource of resources) {
            // Report this resource before fetching it so the notification reflects current work.
            progress?.report({
                increment: incrementPerResource,
                message: path.basename(resource)
            });

            // Construct the full URL and local file path for this resource
            const url = `${baseUrl}/${resource}`;
            const filePath = path.join(storageDir, resource);

            // Create any missing parent folders for this file
            await fs.mkdir(path.dirname(filePath), { recursive: true });

            // Perform the HTTP GET request for the resource
            const res = await fetch(url);
            const isCompressed = resource.endsWith('.gz') || resource.endsWith('.br');
            if (!res.ok && !isCompressed) {
                // Throw an error to abort if the fetch fails
                throw new Error(`Failed to fetch ${url}`);
            }

            /**
             * Detects and patches the main HTML entry point for the embedded workflow editor.
             * Replaces the default CSS filename with a VS Code-specific stylesheet, then writes
             * the modified HTML to disk.
             */
            if (resource === 'views/canvas.html') {
                // Read the fetched HTML content as a UTF-8 string
                let htmlText = await res.text();

                // Swap out the blueprint CSS filename for the VS Code-optimized version
                htmlText = htmlText.replaceAll(
                    'designer-blueprint-parameters-g4.css',
                    'designer-blueprint-parameters-vscode.css'
                );

                // Persist the patched HTML back to disk at the target filePath
                await fs.writeFile(filePath, htmlText, 'utf8');

                // Skip any further processing of this resource since it's now handled
                continue;
            }

            // If this is the global.js script, patch API endpoints within its text
            if (path.basename(resource) === 'global.js') {
                let jsText = await res.text();
                // Update notification hub URL to include the full base URL
                jsText = jsText.replace(
                    '"/hub/v4/g4/notifications"',
                    `"${baseUrl}/hub/v4/g4/notifications"`
                );
                // Update API URL references to include the full base URL
                jsText = jsText.replace(
                    '"/api/v4/g4"',
                    `"${baseUrl}/api/v4/g4"`
                );
                // Write the patched script to disk
                await fs.writeFile(filePath, jsText, 'utf8');

                // If this is the canvas.js script, patch icon URL generation logic
            } else if (path.basename(resource) === 'canvas.js') {
                let jsText = await res.text();
                // Replace the BASE_HUB_URL placeholder with the full base URL
                jsText = jsText.replace(
                    'return `${BASE_HUB_URL}/images/icon-${iconType}.svg`;',
                    `return \`${baseUrl}/images/icon-\${iconType}.svg\`;`
                );
                // Write the patched script to disk
                await fs.writeFile(filePath, jsText, 'utf8');
                // Otherwise, treat it as a binary or static asset
            } else {
                // Read the response as raw bytes and write to disk
                const data = await res.arrayBuffer();
                await fs.writeFile(filePath, Buffer.from(data));
            }
        }
    }

    /**
     * Rewrites relative resource references in the provided HTML so they load correctly
     * in a VS Code Webview by converting them to Webview URIs.
     *
     * @param panel       - The WebviewPanel into which the HTML will be loaded.
     * @param storageDir  - The local file system directory where static files are stored.
     * @param html        - The original HTML string containing <link>, <script>, and <img> tags.
     * @returns The HTML string with updated resource URLs suitable for the Webview.
     */
    private static setHtml(panel: vscode.WebviewPanel, storageDir: string, html: string): string {
        // Rewrite stylesheet references with a linear tag scanner to avoid regex backtracking.
        html = this.setHtmlResourceUris({
            attributeName: 'href',
            html,
            panel,
            storageDir,
            tagName: 'link'
        });

        // Rewrite script references through the same bounded scanner.
        html = this.setHtmlResourceUris({
            attributeName: 'src',
            html,
            panel,
            storageDir,
            tagName: 'script'
        });

        // Rewrite image references through the same bounded scanner.
        html = this.setHtmlResourceUris({
            attributeName: 'src',
            html,
            panel,
            storageDir,
            tagName: 'img'
        });

        // Return the transformed HTML ready for the Webview
        return html;
    }

    /**
     * Rewrites one resource attribute on matching HTML tags using a linear scanner.
     *
     * @remarks
     * This intentionally avoids broad HTML regexes because static analysis flags those patterns
     * for super-linear backtracking risk on malformed markup.
     *
     * @param options - The tag, attribute, webview, and HTML values needed for the rewrite.
     * @returns HTML with local resource attributes converted to VS Code webview URIs.
     */
    private static setHtmlResourceUris(options: {
        attributeName: string;
        html: string;
        panel: vscode.WebviewPanel;
        storageDir: string;
        tagName: string;
    }): string {
        // Keep a lowercase copy only for searching; all emitted text comes from the original HTML.
        const lowerHtml = options.html.toLowerCase();
        const tagPrefix = `<${options.tagName.toLowerCase()}`;
        let output = '';
        let searchIndex = 0;

        while (searchIndex < options.html.length) {
            // Find the next requested tag name without regex so scanning remains linear.
            const tagStart = lowerHtml.indexOf(tagPrefix, searchIndex);

            if (tagStart < 0) {
                output += options.html.substring(searchIndex);
                break;
            }

            // Copy all unchanged text before the candidate tag.
            output += options.html.substring(searchIndex, tagStart);

            // Treat partial names such as <linker> as ordinary text.
            const boundaryIndex = tagStart + tagPrefix.length;
            const boundaryCharacter = options.html.charAt(boundaryIndex);
            const isTagNameComplete = this.testHtmlTagBoundary(boundaryCharacter);

            if (!isTagNameComplete) {
                output += options.html.substring(tagStart, boundaryIndex);
                searchIndex = boundaryIndex;
                continue;
            }

            // Extract the candidate tag; malformed trailing HTML is copied unchanged.
            const tagEnd = options.html.indexOf('>', boundaryIndex);

            if (tagEnd < 0) {
                output += options.html.substring(tagStart);
                break;
            }

            // Rewrite only the selected attribute value and preserve every other character.
            const tagText = options.html.substring(tagStart, tagEnd + 1);
            output += this.setHtmlTagResourceUri({
                attributeName: options.attributeName,
                panel: options.panel,
                storageDir: options.storageDir,
                tagText
            });

            searchIndex = tagEnd + 1;
        }

        return output;
    }

    /**
     * Rewrites a local resource attribute inside one already-isolated HTML tag.
     *
     * @param options - The single tag and resource-location context.
     * @returns The original tag when no local resource exists, otherwise the rewritten tag.
     */
    private static setHtmlTagResourceUri(options: {
        attributeName: string;
        panel: vscode.WebviewPanel;
        storageDir: string;
        tagText: string;
    }): string {
        // Locate a quoted resource attribute while preserving the original tag formatting.
        const valueRange = this.getHtmlAttributeValueRange(options.tagText, options.attributeName);

        if (!valueRange) {
            return options.tagText;
        }

        const resourcePath = options.tagText.substring(valueRange.start, valueRange.end);

        // External, protocol-relative, and data URIs are already valid inside the webview.
        if (this.testExternalOrDataUri(resourcePath)) {
            return options.tagText;
        }

        // Convert the local resource path to a VS Code webview URI.
        const absolutePath = vscode.Uri.file(path.join(options.storageDir, 'views', resourcePath));
        const webviewUri = `${options.panel.webview.asWebviewUri(absolutePath)}`;

        // Replace only the attribute value so tag structure and other attributes remain untouched.
        return options.tagText.substring(0, valueRange.start) +
            webviewUri +
            options.tagText.substring(valueRange.end);
    }

    /**
     * Finds the value span for a quoted HTML attribute without using a regex.
     *
     * @param tagText - The tag text to inspect.
     * @param attributeName - Attribute name to locate.
     * @returns Start and end offsets for the attribute value, or undefined when absent.
     */
    private static getHtmlAttributeValueRange(tagText: string, attributeName: string): { start: number; end: number } | undefined {
        // Search case-insensitively while returning offsets into the original tag text.
        const lowerTagText = tagText.toLowerCase();
        const lowerAttributeName = attributeName.toLowerCase();
        let searchIndex = 0;

        while (searchIndex < tagText.length) {
            const attributeStart = lowerTagText.indexOf(lowerAttributeName, searchIndex);

            if (attributeStart < 0) {
                return undefined;
            }

            const isAttributeBoundary = this.testHtmlAttributeBoundary(tagText.charAt(attributeStart - 1));

            if (!isAttributeBoundary) {
                searchIndex = attributeStart + lowerAttributeName.length;
                continue;
            }

            // Allow ordinary spacing around the equals sign.
            let valueIndex = attributeStart + lowerAttributeName.length;
            valueIndex = this.skipHtmlWhitespace(tagText, valueIndex);

            if (tagText.charAt(valueIndex) !== '=') {
                searchIndex = valueIndex;
                continue;
            }

            valueIndex = this.skipHtmlWhitespace(tagText, valueIndex + 1);

            const quote = tagText.charAt(valueIndex);
            const isQuotedValue = quote === '"' || quote === "'";

            if (!isQuotedValue) {
                searchIndex = valueIndex + 1;
                continue;
            }

            const valueStart = valueIndex + 1;
            const valueEnd = tagText.indexOf(quote, valueStart);

            if (valueEnd < 0) {
                return undefined;
            }

            return {
                end: valueEnd,
                start: valueStart
            };
        }

        return undefined;
    }

    /**
     * Skips HTML whitespace characters from a known offset.
     *
     * @param text - Text being scanned.
     * @param startIndex - Offset where whitespace skipping starts.
     * @returns First offset that is not HTML whitespace.
     */
    private static skipHtmlWhitespace(text: string, startIndex: number): number {
        let index = startIndex;

        while (index < text.length && this.testHtmlWhitespace(text.charAt(index))) {
            index++;
        }

        return index;
    }

    /**
     * Tests whether a character can end a tag name.
     *
     * @param character - Character immediately after the requested tag name.
     * @returns True when the candidate is a complete tag name.
     */
    private static testHtmlTagBoundary(character: string): boolean {
        return character === '' ||
            character === '>' ||
            this.testHtmlWhitespace(character);
    }

    /**
     * Tests whether a character can precede an HTML attribute name.
     *
     * @param character - Character immediately before the candidate attribute.
     * @returns True when the candidate starts at an attribute boundary.
     */
    private static testHtmlAttributeBoundary(character: string): boolean {
        return character === '' ||
            character === '<' ||
            this.testHtmlWhitespace(character);
    }

    /**
     * Tests whether a resource URI should not be rewritten for the webview.
     *
     * @param uri - Resource URI from an HTML attribute.
     * @returns True for already-external, protocol-relative, anchor, and data URIs.
     */
    private static testExternalOrDataUri(uri: string): boolean {
        const lowerUri = uri.toLowerCase();

        return lowerUri.startsWith('http://') ||
            lowerUri.startsWith('https://') ||
            lowerUri.startsWith('data:') ||
            lowerUri.startsWith('//') ||
            lowerUri.startsWith('#');
    }

    /**
     * Tests whether a character is HTML whitespace.
     *
     * @param character - Character to inspect.
     * @returns True when the character is one of the HTML whitespace characters.
     */
    private static testHtmlWhitespace(character: string): boolean {
        return character === ' ' ||
            character === '\n' ||
            character === '\r' ||
            character === '\t' ||
            character === '\f';
    }
}
