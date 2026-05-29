/*
 * RESOURCES
 * https://code.visualstudio.com/api/references/commands
 */
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { CommandBase } from './command-base';
import { Logger } from '../logging/logger';

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
            async () => {
                await this.invokeCommand(args);
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
        // Determine where to cache downloaded webapp files
        const storageDir = path.join(this.context.globalStorageUri.fsPath, 'webapp');

        // Download and patch all integration resources into the storage directory
        await ShowWorkflowCommand.resolveResources(this._baseUrl, storageDir);

        // Path to the main HTML entry point of the web application
        const indexPath = path.join(storageDir, 'views', 'canvas.html');

        const folders = vscode.workspace.workspaceFolders;
        const botsFolders = folders?.map(i => vscode.Uri.joinPath(i.uri, "bots")) || [];

        // Create a new VS Code WebviewPanel to host the embedded app
        const panel = vscode.window.createWebviewPanel(
            'g4-workflow',           // internal view type identifier
            'G4 Workflow',           // title shown in the editor tab
            vscode.ViewColumn.One,   // open in the first (left) editor column
            {
                enableScripts: true,              // allow running scripts inside the webview
                retainContextWhenHidden: true,    // keep state even when the panel is hidden
                localResourceRoots: [             // restrict which local folders the webview can load
                    vscode.Uri.file(storageDir),
                    vscode.Uri.file(path.join(this.context.extensionPath, 'images')),
                    ...botsFolders
                ]
            }
        );

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
        panel.webview.onDidReceiveMessage(async message => this.ResolveMessage(panel, args, message));

        // Finally, assign the processed HTML to the webview to render the app
        panel.webview.html = html;
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
             * - Converts non-string values to JSON text.
             * - Falls back to String(value) if JSON serialization fails.
             *
             * @param value - The value to convert.
             * @returns The string representation of the provided value.
             */
            const convertFromJson = (value) => {
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
     * This script wires up drag‐and‐drop file import and messaging
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

            // Notify the extension that the webview is ready to receive messages
            window.addEventListener('DOMContentLoaded', () => {
                Utilities.waitForElement('.sqd-root-start-stop', 5000).then(() => {
                    vscode.postMessage({ type: 'webview:ready' });
                });
            });

            // Listen for messages coming back from the extension
            window.addEventListener('message', event => {
                // Extract the message type from the event data
                const type = event.data?.type;
                
                // Exit if the message type is not 'workflow:import'
                if (type !== 'workflow:import') {
                    return;
                }

                // Set the definition in the workspace
                // This assumes you have a function setDefinition to handle the incoming data
                const definition = JSON.parse(event.data?.payload?.content || '{}');

                // Set observer for the workspace element
                const workspaceElement = document.querySelector('.sqd-workspace');
                const workspaceObserver = new Observer(workspaceElement);
                
                // Set the definition in the workspace based on the received message
                setDefinition(definition);

                // Reset the view to set the portview
                resetView(workspaceObserver);
            });
        </script>`;
    }

    /**
     * Resolves messages sent from the webview to the extension host.
     *
     * Supported message types:
     * - workflow:import - Reads a workflow file and sends its content back to the webview.
     * - webview:ready   - Sends an initial workflow to the webview when available.
     * - workflow:result - Opens the generated workflow report.
     * - console         - Writes webview console messages to the extension logger.
     *
     * @param panel   - The VS Code webview panel that sent the message.
     * @param args    - Optional command arguments used to initialize the webview.
     * @param message - The message received from the webview.
     */
    private async ResolveMessage(panel: vscode.WebviewPanel, args: any, message: any) {
        // Helper to read a file or notebook given its URI string, then post its content
        const readFile = async (uri: string) => {
            try {
                // Decode and parse the incoming URI (handles percent-encoded characters)
                const fileUri = vscode.Uri.parse(uri);

                // Read raw bytes from the workspace file system
                const fileBytes = await vscode.workspace.fs.readFile(fileUri);

                // Convert raw bytes to UTF-8 text for non-notebook files
                const text = Buffer.from(fileBytes).toString('utf8');

                // Derive a simple filename for display in the webview
                const fileName = path.basename(fileUri.fsPath);

                // Send the file name and content back to the webview for import
                panel.webview.postMessage({
                    type: 'workflow:import',
                    payload: {
                        fileName: fileName,
                        content: text
                    }
                });
            } catch (err: any) {
                // Log the failure and notify the webview of the error
                this._logger.error(`Failed to read ${uri}: ${err}`);
                panel.webview.postMessage({
                    type: 'workflow:import',
                    payload: {
                        error: `Could not read file: ${err.message}`
                    }
                });
            }
        };

        // If the webview requests a workflow import, read the selected file
        // and send its content back to the webview.
        if (message.type === 'workflow:import') {
            readFile(message.payload.fileUri);

            // No further handling is needed for this message, so we can exit early.
            return;
        }

        // When the webview is ready, send the initial workflow if one was provided.
        // This is useful when opening the editor with an existing workflow.
        if (message.type === 'webview:ready' && args?.workflow) {
            panel.webview.postMessage({
                type: 'workflow:import',
                payload: {
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
                // No file path is used here because the report content comes directly
                // from the webview message payload.
                path: null,

                // The final workflow/report content produced by the webview.
                content: message.payload
            };

            // Open the report view using the registered VS Code command.
            await vscode.commands.executeCommand('Show-Report', report);

            // Stop processing this message because the workflow result was handled.
            return;
        }

        // Receives console messages forwarded from the webview.
        // These messages are written to the extension logger using the matching level.
        if (message.type === 'console') {
            const level = message.payload.level;
            const text = message.payload.text;

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
     * Downloads and patches integration resource files from the server to local storage.
     *
     * @param baseUrl     The root URL of the G4 API server (e.g., "http://localhost:9944").
     * @param storageDir  The local directory path where resources should be saved.
     * 
     * @throws Error if any HTTP request fails.
     */
    private static async resolveResources(baseUrl: string, storageDir: string): Promise<void> {
        // Ensure the target directory exists (creates parent folders as needed)
        await fs.mkdir(storageDir, { recursive: true });

        // Dynamically import node-fetch for HTTP requests
        const fetch = (await import('node-fetch')).default;

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

        // Iterate through each resource path returned by the server
        for (const resource of resources) {
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
             * Replaces the default CSS filename with a VS Code–specific stylesheet, then writes
             * the modified HTML to disk.
             */
            if (resource === 'views/canvas.html') {
                // Read the fetched HTML content as a UTF-8 string
                let htmlText = await res.text();

                // Swap out the blueprint CSS filename for the VS Code–optimized version
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
        // Replace <link> tags that reference local CSS or other resources
        html = html.replaceAll(
            /<link\s+([^>]*?)href="([^"]+)"([^>]*)>/g,
            (match, before, href, after) => {
                // Skip external or data URIs
                if (href.startsWith('http') || href.startsWith('data:')) {
                    return match;
                }

                // Build a file URI and then convert it to a Webview URI
                const absPath = vscode.Uri.file(path.join(storageDir, 'views', href));
                const webviewUri = panel.webview.asWebviewUri(absPath);

                // Return the tag with the updated href pointing to the Webview URI
                return `<link ${before}href="${webviewUri}"${after}>`;
            }
        );

        // Replace <script> tags that reference local JS files
        html = html.replaceAll(
            /<script\s+([^>]*?)src="([^"]+)"([^>]*)>/g,
            (match, before, src, after) => {
                // Skip external or data URIs
                if (src.startsWith('http') || src.startsWith('data:')) {
                    return match;
                }

                // Build a file URI and then convert it to a Webview URI
                const absPath = vscode.Uri.file(path.join(storageDir, 'views', src));
                const webviewUri = panel.webview.asWebviewUri(absPath);

                // Return the tag with the updated src pointing to the Webview URI
                return `<script ${before}src="${webviewUri}"${after}>`;
            }
        );

        // Replace <img> tags that reference local image files
        html = html.replaceAll(
            /<img\s+([^>]*?)src="([^"]+)"([^>]*)>/g,
            (match, before, src, after) => {
                // Skip external or data URIs
                if (src.startsWith('http') || src.startsWith('data:')) {
                    return match;
                }

                // Build a file URI and then convert it to a Webview URI
                const absPath = vscode.Uri.file(path.join(storageDir, 'views', src));
                const webviewUri = panel.webview.asWebviewUri(absPath);

                // Return the tag with the updated src pointing to the Webview URI
                return `<img ${before}src="${webviewUri}"${after}>`;
            }
        );

        // Return the transformed HTML ready for the Webview
        return html;
    }
}
