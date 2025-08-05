import * as vscode from 'vscode';
import { NewProjectCommand } from './commands/new-project';
import { ShowWorkflowCommand } from './commands/show-workflow';
import { MdJsonNotebookProvider } from './providers/md-json-notebook-provider';
import { NotificationService } from './clients/g4-signalr-client';
import { SendAutomationCommand } from './commands/start-automation';
import { Utilities } from './extensions/utilities';
import { G4WebviewViewProvider } from './providers/g4-webview-view-provider';
import { Global } from './constants/global';
import { UpdateEnvironmentCommand } from './commands/update-environment';

const connections = new Map<string, NotificationService>();

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext) {
    // // Register the "Open File Viewer" command
    // const cmd = vscode.commands.registerCommand('extension.openDropDemo', () => {
    //     const panel = vscode.window.createWebviewPanel(
    //         'fileViewer',              // internal viewType
    //         'File Viewer',             // title
    //         vscode.ViewColumn.One,     // show in first column
    //         { enableScripts: true }    // allow JS in the webview
    //     );

    //     // Set HTML content
    //     panel.webview.html = getWebviewContent();

    //     // Listen for messages from the webview
    //     panel.webview.onDidReceiveMessage(async message => {
    //         if (message.command === 'readFile') {
    //             try {
    //                 const uri = vscode.Uri.parse(message.uri as string);
    //                 const bytes = await vscode.workspace.fs.readFile(uri);
    //                 const text = new TextDecoder('utf-8').decode(bytes);
    //                 // Send file content back to webview
    //                 panel.webview.postMessage({ command: 'fileContent', content: text });
    //             } catch (err: any) {
    //                 panel.webview.postMessage({
    //                     command: 'fileContent',
    //                     content: `Error reading file: ${err.message}`
    //                 });
    //             }
    //         }
    //     });
    // });

    // context.subscriptions.push(cmd);
    const baseUri = await InitializeConnection(context);
    const options = { context, baseUri, connections };

    registerCommands(options);
    registerNotebookEvents(options);
    registerProviders(options);
}

// This method is called when your extension is deactivated
export function deactivate() { }

const registerCommands = (options: {
    context: vscode.ExtensionContext,
    baseUri: string,
    connections: Map<string, NotificationService>
}) => {
    new NewProjectCommand(options.context).register();
    new SendAutomationCommand(options.context, options.connections).register();
    new ShowWorkflowCommand(options.context, options.baseUri).register();
    new UpdateEnvironmentCommand(options.context, options.baseUri).register();
};

const registerProviders = (options: {
    context: vscode.ExtensionContext,
    baseUri: string,
    connections: Map<string, NotificationService>
}) => {
    new MdJsonNotebookProvider(options.context, options.baseUri).register();
    new G4WebviewViewProvider(options.context).register();
};

/**
 * Set up listeners to auto-register SignalR NotificationService instances
 * whenever a new MdJson notebook becomes active.
 *
 * @param options.context - VS Code extension context for subscriptions.
 * @param options.baseUri - Base URL for connecting to the G4 SignalR hub.
 * @param options.connections - Map of notebook URIs to NotificationService clients.
 */
const registerNotebookEvents = (options: {
    context: vscode.ExtensionContext;
    baseUri: string;
    connections: Map<string, NotificationService>;
}): void => {
    // Listen for changes to the active notebook editor
    const changeActiveNotebookEditor = vscode.window.onDidChangeActiveNotebookEditor(
        /**
         * Called when the user switches to a different notebook editor.
         * If the notebook is an MdJson (.mdjson) file and no existing
         * NotificationService is registered, create one.
         *
         * @param editor - The newly focused notebook editor, or undefined.
         */
        (editor) => {
            // Get the currently active NotebookDocument, if any
            const notebook = editor?.notebook;

            // Only handle our custom MdJson notebook type
            const isMdJson = notebook?.notebookType === MdJsonNotebookProvider.NOTEBOOK_TYPE;
            // Ensure the file extension matches .mdjson
            const hasMdJsonExtension = notebook?.uri.path.endsWith('.mdjson');

            // Exit early if this is not an MdJson notebook
            if (!(isMdJson && hasMdJsonExtension)) {
                return;
            }

            // Use the notebook file path as a unique key in the connections map
            const key = notebook.uri.path.toString();

            // If we've already created a service for this notebook, do nothing
            if (options.connections.has(key)) {
                return;
            }

            // Create and register a new NotificationService for this notebook
            const service = new NotificationService(
                options.baseUri,
                options.context,
                Global.logger
            );
            options.connections.set(key, service);
        }
    );

    // Ensure the event listener is disposed when the extension deactivates
    options.context.subscriptions.push(changeActiveNotebookEditor);
};

/**
 * Continuously attempts to connect to the G4 SignalR hub until successful.
 * Displays status updates in the VS Code status bar during the retry loop.
 */
const InitializeConnection = async (context: vscode.ExtensionContext): Promise<string> => {
    // Retrieve the configured G4 endpoint URL; returns null/empty if not set
    const baseUri = Utilities.getG4Endpoint();
    const canConnect = baseUri !== null && baseUri !== '';

    // If no valid endpoint, abort immediately
    if (!canConnect) {
        return '';
    }

    // Loop until a stable connection is established
    while (true) {
        // Show a spinning icon to indicate we are attempting connection
        vscode.window.setStatusBarMessage('$(sync~spin) Waiting for G4 Engine Connection...');

        // Create a new SignalR client pointing at the G4 hub
        const client = new NotificationService(baseUri, context, Global.logger);
        try {
            // Attempt to start the SignalR connection
            await client.start();

            // If the connection is not yet in 'Connected' state, retry after delay
            if (client.connection.state !== 'Connected') {
                await new Promise(resolve => setTimeout(resolve, 5000));
                continue;
            }

            // On successful connect, update status bar and exit loop
            vscode.window.setStatusBarMessage('Connected to G4 Engine SignalR Hub.');

            // Set global base URI for the G4 Hub API
            Global.BASE_HUB_URL = baseUri;

            // Return the base URI on successful connection
            return baseUri;
        } catch (error) {
            // On failure, show failure icon, then retry after delay
            vscode.window.setStatusBarMessage('G4 Engine SignalR Connection Failed. Retrying...');
            await new Promise(resolve => setTimeout(resolve, 5000));
            continue;
        }
    }
};


// Returns the HTML for our webview
function getWebviewContent(): string {
    return `<!DOCTYPE html>
<html lang="en">
<body style="margin:0;padding:0;overflow:hidden;">
  <div id="dropArea"
       style="width:100%;height:100vh;
              display:flex;align-items:center;
              justify-content:center;
              border: 2px dashed #888;
              box-sizing:border-box;">
    <span>Drag & drop a file here</span>
  </div>
  <div id="content" style="padding:10px;white-space:pre-wrap;"></div>

  <script>
    // VS Code API for messaging
    const vscode = acquireVsCodeApi();
    const dropArea = document.getElementById('dropArea');
    const contentEl = document.getElementById('content');

    // Highlight on drag over
    dropArea.addEventListener('dragover', e => {
      e.preventDefault();
      dropArea.style.borderColor = '#06c';
    });
    dropArea.addEventListener('dragleave', e => {
      dropArea.style.borderColor = '#888';
    });

    // Handle drop
    dropArea.addEventListener('drop', e => {
      e.preventDefault();
      dropArea.style.borderColor = '#888';

      // VS Code only gives us a URI
      const fileUri = e.dataTransfer.getData('text/uri-list');
      if (fileUri) {
        vscode.postMessage({ command: 'readFile', uri: fileUri });
      }
    });

    // Receive file content from extension
    window.addEventListener('message', event => {
      console.log('Received message:', event.data);
      const msg = event.data;
      if (msg.command === 'fileContent') {
        contentEl.innerHTML = msg.content;
      }
    });
  </script>
</html>`;
}