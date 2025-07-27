import * as vscode from 'vscode';
import { NewProjectCommand } from './commands/new-project';
import { ShowWorkflowCommand } from './commands/show-workflow';
import { MdJsonNotebookProvider } from './providers/md-json-notebook-provider';
import { NotificationService } from './clients/g4-signalr-client';
import { SendAutomationCommand } from './commands/start-automation';
import { Utilities } from './extensions/utilities';
import { G4WebviewViewProvider } from './providers/g4-webview-view-provider';

const connections = new Map<string, NotificationService>();

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext) {
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
    new ShowWorkflowCommand(options.context, options.baseUri).register();
    new SendAutomationCommand(options.context, options.connections).register();
}

const registerProviders = (options: {
    context: vscode.ExtensionContext,
    baseUri: string,
    connections: Map<string, NotificationService>
}) => {
    new MdJsonNotebookProvider(options.context, options.baseUri).register();
    new G4WebviewViewProvider(options.context).register();
}

const registerNotebookEvents = (options: {
    context: vscode.ExtensionContext,
    baseUri: string,
    connections: Map<string, NotificationService>
}) => {
    const openNotebookDocument = vscode.workspace.onDidOpenNotebookDocument(notebook => {
        console.log('changeActiveNotebookEditor');
    });

    // Listen for changes to the active notebook editor and
    // auto-register NotificationService for new MdJson notebooks.
    const changeActiveNotebookEditor = vscode.window.onDidChangeActiveNotebookEditor(
        /**
         * Callback invoked whenever the active notebook editor changes.
         * Registers a SignalR NotificationService for MdJson notebooks
         * that haven’t been seen before.
         *
         * @param editor - The new active notebook editor (or undefined).
         */
        (editor) => {
            // Extract the NotebookDocument, if available
            const notebook = editor?.notebook;

            // Check if this is our custom MdJson notebook type
            const isMdJsonNotebook = notebook?.notebookType === MdJsonNotebookProvider.NOTEBOOK_TYPE;
            // Verify the file extension ends with '.mdjson'
            const isPath = notebook?.uri.path.endsWith('.mdjson');

            // Only proceed when both type and extension match
            if (!(isMdJsonNotebook && isPath)) {
                return;
            }

            // Use the notebook file path as a unique key
            const key = notebook.uri.path.toString();

            // If we already have a connection for this notebook, do nothing
            if (connections.has(key)) {
                return;
            }

            // Create and store a new NotificationService for this notebook
            connections.set(
                key,
                new NotificationService(options.context, options.baseUri)
            );
        }
    );

    const changeVisibleNotebookEditors = vscode.window.onDidChangeVisibleNotebookEditors(editors => {
        // Compare with previously tracked editors
        console.log("changeVisibleNotebookEditors");
    });

    options.context.subscriptions.push(
        openNotebookDocument,
        changeActiveNotebookEditor,
        changeVisibleNotebookEditors
    );
}

/**
 * Continuously attempts to connect to the G4 SignalR hub until successful.
 * Displays status updates in the VS Code status bar during the retry loop.
 */
const InitializeConnection = async (context: vscode.ExtensionContext): Promise<string> => {
    // Retrieve the configured G4 endpoint URL; returns null/empty if not set
    const baseUri = Utilities.getG4Endpoint();
    const canConnect = baseUri != null && baseUri !== '';

    // If no valid endpoint, abort immediately
    if (!canConnect) {
        return '';
    }

    // Loop until a stable connection is established
    while (true) {
        // Show a spinning icon to indicate we are attempting connection
        vscode.window.setStatusBarMessage('$(sync~spin) Waiting for G4 Engine Connection...');

        // Create a new SignalR client pointing at the G4 hub
        const client = new NotificationService(context, baseUri);
        try {
            // Attempt to start the SignalR connection
            await client.start();

            // If the connection is not yet in 'Connected' state, retry after delay
            if (client.connection.state !== 'Connected') {
                await new Promise(resolve => setTimeout(resolve, 5000));
                continue;
            }

            // On successful connect, update status bar and exit loop
            vscode.window.setStatusBarMessage('$(check) Connected to G4 Engine SignalR hub.');

            // Return the base URI on successful connection
            return baseUri;
        } catch (error) {
            // On failure, show failure icon, then retry after delay
            vscode.window.setStatusBarMessage('$(error) Failed to connect');
            await new Promise(resolve => setTimeout(resolve, 5000));
            continue;
        }
    }
};
