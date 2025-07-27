/*
 * RESOURCES
 * https://code.visualstudio.com/api/references/commands
 */
import * as fs from 'fs/promises';
import * as path from 'path';
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
     * Initializes a new ShowWorkflowCommand for the Rhino API.
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
        this._logger = this.logger?.newLogger('G4.WorkflowEditor');

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
    protected async onInvokeCommand(): Promise<any> {
        // Determine where to cache downloaded webapp files
        const storageDir = path.join(this.context.globalStorageUri.fsPath, 'webapp');

        // Download and patch all integration resources into the storage directory
        await ShowWorkflowCommand.resolveResources(this._baseUrl, storageDir);

        // Path to the main HTML entry point of the web application
        const indexPath = path.join(storageDir, 'index.html');

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
                    vscode.Uri.file(path.join(this.context.extensionPath, 'images'))
                ]
            }
        );

        // Inject a small script that forwards console logs and errors from the webview to the extension
        const shim = ShowWorkflowCommand.getShim();

        // Load the raw HTML, rewrite resource references, and inject the shim
        let html = await fs.readFile(indexPath, 'utf8');
        html = ShowWorkflowCommand.setHtml(panel, storageDir, html);
        html = html.replace(/<\/head>/i, shim + '</head>');

        // Listen for messages posted from the webview’s shim and log them at the appropriate level
        panel.webview.onDidReceiveMessage(msg => {
            this._logger.information(msg.text);
        });

        // Finally, assign the processed HTML to the webview to render the app
        panel.webview.html = html;
    }

    /**
     * Returns an HTML snippet that injects a script to forward console messages
     * and uncaught errors from the Webview to the VS Code extension host.
     *
     * @returns A string containing a <script> element for shimmed console logging.
     */
    private static getShim(): string {
        return `
        <script>
        (function() {
            // Acquire VS Code API for sending messages back to the extension
            const vs = acquireVsCodeApi();

            // Wrap standard console methods to also post messages to the extension
            ['log', 'warn', 'error', 'info', 'debug'].forEach(level => {
                const original = console[level].bind(console);
                console[level] = (...args) => {
                    // Call the original console method for in-page logging
                    original(...args);
                    // Serialize each argument to a string
                    const text = args
                        .map(arg => typeof arg === 'string' ? arg : JSON.stringify(arg))
                        .join(' ');
                    // Send the log level and message text to the extension
                    vs.postMessage({ level, text });
                };
            });

            // Listen for uncaught errors in the window and forward them
            window.addEventListener('error', e => {
                const message = e.message + ' at ' + e.filename + ':' + e.lineno;
                vs.postMessage({ level: 'error', text: message });
            });
        })();
        </script>`;
    }

    /**
     * Downloads and patches integration resource files from the server to local storage.
     *
     * @param baseUrl     The root URL of the Rhino API server (e.g., "http://localhost:9944").
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
        const listText = await (await fetch(`${baseUrl}/api/v4/g4/integration/files`)).text();
        const resources: string[] = JSON.parse(listText);

        // Iterate through each resource path returned by the server
        for (const resource of resources) {
            // Construct the full URL and local file path for this resource
            const url = `${baseUrl}/${resource}`;
            const filePath = path.join(storageDir, resource);

            // Create any missing parent folders for this file
            await fs.mkdir(path.dirname(filePath), { recursive: true });

            // Perform the HTTP GET request for the resource
            const res = await fetch(url);
            if (!res.ok) {
                // Throw an error to abort if the fetch fails
                throw new Error(`Failed to fetch ${url}`);
            }

            /**
             * Detects and patches the main HTML entry point for the embedded workflow editor.
             * Replaces the default CSS filename with a VS Code–specific stylesheet, then writes
             * the modified HTML to disk.
             */
            if (resource === 'index.html') {
                // Read the fetched HTML content as a UTF-8 string
                let htmlText = await res.text();

                // Swap out the blueprint CSS filename for the VS Code–optimized version
                htmlText = htmlText.replace(
                    /designer-blueprint-parameters\.css/g,
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

                // If this is the index.js script, patch icon URL generation logic
            } else if (path.basename(resource) === 'index.js') {
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
        html = html.replace(
            /<link\s+([^>]*?)href="([^"]+)"([^>]*)>/g,
            (match, before, href, after) => {
                // Skip external or data URIs
                if (href.startsWith('http') || href.startsWith('data:')) {
                    return match;
                }

                // Build a file URI and then convert it to a Webview URI
                const absPath = vscode.Uri.file(path.join(storageDir, href));
                const webviewUri = panel.webview.asWebviewUri(absPath);

                // Return the tag with the updated href pointing to the Webview URI
                return `<link ${before}href="${webviewUri}"${after}>`;
            }
        );

        // Replace <script> tags that reference local JS files
        html = html.replace(
            /<script\s+([^>]*?)src="([^"]+)"([^>]*)>/g,
            (match, before, src, after) => {
                // Skip external or data URIs
                if (src.startsWith('http') || src.startsWith('data:')) {
                    return match;
                }

                // Build a file URI and then convert it to a Webview URI
                const absPath = vscode.Uri.file(path.join(storageDir, src));
                const webviewUri = panel.webview.asWebviewUri(absPath);

                // Return the tag with the updated src pointing to the Webview URI
                return `<script ${before}src="${webviewUri}"${after}>`;
            }
        );

        // Replace <img> tags that reference local image files
        html = html.replace(
            /<img\s+([^>]*?)src="([^"]+)"([^>]*)>/g,
            (match, before, src, after) => {
                // Skip external or data URIs
                if (src.startsWith('http') || src.startsWith('data:')) {
                    return match;
                }

                // Build a file URI and then convert it to a Webview URI
                const absPath = vscode.Uri.file(path.join(storageDir, src));
                const webviewUri = panel.webview.asWebviewUri(absPath);

                // Return the tag with the updated src pointing to the Webview URI
                return `<img ${before}src="${webviewUri}"${after}>`;
            }
        );

        // Return the transformed HTML ready for the Webview
        return html;
    }
}
