import * as vscode from 'vscode';

/**
 * Provides the HTML content and messaging bridge for the G4 Webview sidebar or panel.
 * Implements the VS Code WebviewViewProvider interface to render dynamic UI inside VS Code.
 */
export class G4WebviewViewProvider implements vscode.WebviewViewProvider {
    /**
     * Constant view type identifier. Must match the `viewType` contributed
     * in the extension's package.json under `contributes.views`.
     */
    public static readonly VIEW_TYPE = 'g4View';

    /**
     * @param _context - The VS Code extension context, used for managing disposables and state.
     */
    constructor(
        private readonly _context: vscode.ExtensionContext
    ) { }

    /**
     * Called by VS Code to resolve and render the WebviewView.
     * Sets up HTML content, enables scripts, and wires message handling.
     *
     * @param webviewView - The WebviewView instance to configure and render into.
     * @param _context    - Additional resolve context (unused).
     * @param _token      - Cancellation token for long-running resolution (unused).
     */
    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ) {
        // Allow execution of scripts inside the webview
        webviewView.webview.options = { enableScripts: true };

        // Set the HTML content for the webview
        webviewView.webview.html = G4WebviewViewProvider.getHtml();

        // Listen for messages sent from the webview's frontend
        webviewView.webview.onDidReceiveMessage(
            async (message) => {
                // Handle the 'workflow:show' command by invoking the VS Code command
                if (message.type === 'workflow:show') {
                    await vscode.commands.executeCommand('Show-Workflow');
                }
                // Add more message handlers here as needed
            }
        );
    }

    /**
     * Register this WebviewViewProvider with VS Code so that
     * it can resolve and render the custom sidebar view.
     */
    public register(): void {
        // Register the provider under our view type constant. When VS Code
        // needs to show the view (e.g. in the sidebar), it will call
        // resolveWebviewView on this instance.
        const disposable = vscode.window.registerWebviewViewProvider(
            G4WebviewViewProvider.VIEW_TYPE,  // Identifier matching package.json contribution
            this                              // The provider instance that implements resolveWebviewView
        );

        // Ensure VS Code will dispose of the provider registration
        // when the extension is deactivated to avoid memory leaks.
        this._context.subscriptions.push(disposable);
    }

    /**
     * Generates the full HTML content for the G4 Engine Client webview.
     * Utilizes VS Code theming CSS variables, responsive layout, and JavaScript
     * to communicate user actions back to the extension.
     */
    private static getHtml(): string {
        return /* html */`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8" />
            <style>
                body {
                    margin: 0;
                    padding: 16px;
                    background: var(--vscode-sideBar-background);
                    color: var(--vscode-foreground);
                    font-family: var(--vscode-font-family);
                    font-size: var(--vscode-font-size);
                    line-height: 1.4;
                }

                .description {
                    margin-bottom: 20px;
                    color: var(--vscode-foreground);
                }

                .description strong {
                    color: var(--vscode-foreground);
                }

                .btn {
                    background-color: var(--vscode-button-background);
                    color:            var(--vscode-button-foreground);
                    border:           none;
                    border-radius:    2px;
                    padding:          6px 14px;
                    font-family:      var(--vscode-font-family);
                    font-size:        var(--vscode-font-size);
                    cursor:           pointer;
                    width:            100%;
                    max-width:        300px;
                }

                .btn:hover {
                    background-color: var(--vscode-button-hoverBackground);
                }

                .btn:active {
                    background-color: var(--vscode-button-background);
                }
                .btn .icon {
                    margin-right: 6px; font-size: 1.2em;
                }

                .btn-container {
                    display: flex;
                    justify-content: center;
                    align-items: center;
                }

                @media (min-width: 600px) {
                    .btn {
                        margin-left: 0;
                        margin-right: auto;
                    } 
                }
            </style>
            <title>G4 Engine Client</title>
        </head>
        <body style="padding:10px;">
            <div class="description">
                <strong>G4 Engine API Workflow Editor</strong><br/>
                Visualize, build, test and run your automation workflows through a graphical interface.
                Click "Open G4 Workflow Editor" to launch the embedded designer in a new editor tab.
            </div>

            <div class="btn-container">
                <button id="showWorkflowBtn" class="btn">
                    Open G4 Workflow Editor
                </button>
            </div>

            <script>
                const vscode = acquireVsCodeApi();
                document.getElementById('showWorkflowBtn').addEventListener('click', () =>
                    vscode.postMessage({ type: 'workflow:show', payload: {} })
                );
            </script>
      </body>
      </html>`;
    }
}