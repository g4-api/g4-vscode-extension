import * as vscode from 'vscode';
import { NewProjectCommand } from './commands/new-project';
import { ShowWorkflowCommand } from './commands/show-workflow';
import { MdJsonNotebookProvider } from './providers/md-json-notebook-provider';
import { EventCaptureService, NotificationService } from './clients/g4-signalr-client';
import { StartAutomationCommand } from './commands/start-automation';
import { Utilities } from './extensions/utilities';
import { G4WebviewViewProvider } from './providers/g4-webview-view-provider';
import { Global } from './constants/global';
import { UpdateEnvironmentCommand } from './commands/update-environment';
import { UpdateTemplateCommand } from './commands/update-template';
import { DocumentsTreeProvider } from './providers/g4-documents-tree-provider';
import { StartRecorderCommand } from './commands/start-recorder';
import { StopRecorderCommand } from './commands/stop-recorder';
import { G4RecorderViewProvider } from './providers/g4-recorder-webview-view-provider';

// Import the function that initializes the connection to the backend hub.
const hubConnections = new Map<string, NotificationService>();

// Function to initialize connection to the backend hub.
const captureConnections = new Map<string, EventCaptureService>();

/**
 * Entry point for the VS Code extension.
 * This function is called by VS Code when the extension is activated and is responsible for
 * initializing the connection to backend services, resolving configuration, and registering
 * all commands, events and providers that the extension exposes.
 *
 * @param context The extension context provided by VS Code that contains subscriptions,
 *                global state, workspace state and other shared resources for the extension.
 */
export async function activate(context: vscode.ExtensionContext) {
    // Initialize the base URI used to communicate with the backend hub or services.
    // This typically resolves configuration, environment and connection parameters.
    const baseUri = await InitializeConnection(context);

    // Resolve configuration options related to events capture, such as recording behavior
    // and filters applied while listening to editor or UI events.
    const eventsCaptureOptions = Utilities.resolveEventsCaptureOptions();

    // Compose a shared options object that is passed to all registration functions.
    // This groups together the core dependencies needed by commands, events and providers.
    const options = {
        context,
        baseUri,
        eventsCaptureOptions,
        hubConnections,
        recorderConnections: captureConnections
    };

    // Register all VS Code commands exposed by the extension.
    registerCommands(options);

    // Register notebook related events such as cell execution and document changes.
    registerNotebookEvents(options);

    // Register language or notebook providers such as completion, hover and serializers.
    registerProviders(options);
}

/**
 * Deactivation hook for the VS Code extension.
 * 
 * This function is automatically invoked by VS Code when the extension
 * is being deactivated. It provides an opportunity to release any held
 * resources, close open connections, or dispose of subscriptions that
 * were registered during activation.
 * 
 * This helps prevent memory leaks and ensures clean shutdown when the
 * extension is reloaded or VS Code is closed.
 */
export function deactivate() {
    // Clean up any resources or connections here.
    // Examples:
    // - Dispose event subscriptions
    // - Close hub or recorder connections
    // - Clear timers or intervals
}

/**
 * Registers all VS Code commands exposed by the extension.
 */
const registerCommands = (options: {
    context: vscode.ExtensionContext,
    baseUri: string,
    eventsCaptureOptions: any[],
    hubConnections: Map<string, NotificationService>
}) => {
    // Command to create a new G4 project structure.
    new NewProjectCommand(options.context).register();

    // Command to trigger an automation workflow using the connected hub.
    new StartAutomationCommand(options.context, options.hubConnections).register();

    // Command to open or visualize a specific workflow in the UI.
    new ShowWorkflowCommand(options.context, options.baseUri).register();

    // Command to synchronize or refresh environment settings from the backend.
    new UpdateEnvironmentCommand(options.context, options.baseUri).register();

    // Command to fetch or update templates used for new automation workflows.
    new UpdateTemplateCommand(options.context, options.baseUri).register();

    // Initialize the recorder command, which handles UI event recording.
    const startRecorderCommand = new StartRecorderCommand(
        options.context,
        options.eventsCaptureOptions || []
    );

    // Retrieve recorder connections from the command instance.
    const connections = startRecorderCommand.connections;

    // Register the StartRecorderCommand with VS Code.
    startRecorderCommand.register();

    // Store each recorder connection in the global captureConnections map
    // for later use by the StopRecorderCommand.
    for (const [endpoint, service] of connections) {
        captureConnections.set(endpoint, service);
    }

    // Command to stop active event recordings and finalize captured data.
    new StopRecorderCommand(options.context, captureConnections).register();
};

/**
 * Registers all VS Code providers used by the extension.
 */
const registerProviders = (options: {
    context: vscode.ExtensionContext,
    baseUri: string,
    hubConnections: Map<string, NotificationService>,
    recorderConnections: Map<string, EventCaptureService>
}) => {
    // Register the Markdown/JSON notebook provider responsible for
    // loading, saving, and executing custom .mdjson notebooks.
    new MdJsonNotebookProvider(options.context, options.baseUri).register();

    // Register the main G4 webview provider that powers the extension’s UI panel.
    new G4WebviewViewProvider(options.context).register();

    // Register the recorder view provider that displays captured UI events
    // and communicates with the associated EventCaptureService instances.
    new G4RecorderViewProvider(options.context, options.recorderConnections).register();

    // Register the documents tree provider that displays workspace or
    // project-related documents in the Explorer sidebar.
    new DocumentsTreeProvider(options.context).register();
};

/** * Set up listeners to auto-register SignalR NotificationService instances
 * whenever a new MdJson notebook becomes active.
 *
 * @param options.context - VS Code extension context for subscriptions.
 * @param options.baseUri - Base URL for connecting to the G4 SignalR hub.
 * @param options.connections - Map of notebook URIs to NotificationService clients.
 */
const registerNotebookEvents = (options: {
    context: vscode.ExtensionContext;
    baseUri: string;
    hubConnections: Map<string, NotificationService>;
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
            if (options.hubConnections.has(key)) {
                return;
            }

            // Create and register a new NotificationService for this notebook
            const service = new NotificationService({
                baseUrl: options.baseUri || "http://localhost:9955",
                context: options.context,
                logger: Global.logger
            });
            options.hubConnections.set(key, service);
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
        const client = new NotificationService({
            baseUrl: baseUri,
            context,
            logger: Global.logger
        });

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
            Global.baseHubUrl = baseUri;

            // Return the base URI on successful connection
            return baseUri;
        } catch (error: any) { // NOSONAR
            // On failure, log the error, show failure icon, then retry after delay
            vscode.window.setStatusBarMessage('G4 Engine SignalR Connection Failed. Retrying...');
            await new Promise(resolve => setTimeout(resolve, 5000));
            continue;
        }
    }
};
