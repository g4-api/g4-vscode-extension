import * as vscode from 'vscode';
import * as path from 'node:path';
import { NewProjectCommand } from './commands/new-project';
import { ShowWorkflowCommand } from './commands/show-workflow';
import { EventCaptureService, NotificationService } from './clients/g4-signalr-client';
import { Utilities } from './extensions/utilities';
import { G4WebviewViewProvider } from './providers/g4-webview-view-provider';
import { Global } from './constants/global';
import { UpdateEnvironmentCommand } from './commands/update-environment';
import { UpdateTemplateCommand } from './commands/update-template';
import { DocumentsTreeProvider } from './providers/g4-documents-tree-provider';
import { StartRecorderCommand } from './commands/start-recorder';
import { StopRecorderCommand } from './commands/stop-recorder';
import { G4RecorderViewProvider } from './providers/g4-recorder-webview-view-provider';
import { SyncCacheCommand } from './commands/sync-cache';
import { ShowReportCommand } from './commands/show-report';
import { ShowSettingsCommand } from './commands/show-settings';
import { G4WorkflowCustomEditorProvider } from './providers/g4-workflow-custom-editor-provider';

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
    // Read the configured G4 endpoint from the extension settings.
    const baseUri = Utilities.getG4Endpoint();

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

    // Register language or notebook providers such as completion, hover and serializers.
    registerProviders(options);

    // Initialize the base URI used to communicate with the backend hub or services.
    // This typically resolves configuration, environment and connection parameters.
    await InitializeConnection(baseUri, context);
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

    // Command to open or visualize a specific report in the UI.
    new ShowReportCommand(options.context).register();

    // Command to open or visualize the G4 settings in the UI.
    new ShowSettingsCommand(options.context).register();

    // Command to open a bot definition as a regular JSON/text document.
    const openBotAsJson = vscode.commands.registerCommand(
        'Open-Bot-As-Json',
        async (uri?: vscode.Uri) => {
            const targetUri = uri ?? vscode.window.activeTextEditor?.document.uri;

            if (!targetUri || !isBotFile(targetUri, ['.g4', '.g4bot'])) {
                vscode.window.showWarningMessage('Select a .g4 or .g4bot file under the bots folder.');
                return;
            }

            const document = await vscode.workspace.openTextDocument(targetUri);
            const jsonDocument = document.languageId === 'json'
                ? document
                : await vscode.languages.setTextDocumentLanguage(document, 'json');

            await vscode.window.showTextDocument(jsonDocument, {
                preview: false
            });
        }
    );
    options.context.subscriptions.push(openBotAsJson);

    // Command to open a JSON bot definition in the workflow editor.
    const openBotInWorkflow = vscode.commands.registerCommand(
        'Open-Bot-In-Workflow',
        async (uri?: vscode.Uri) => {
            const targetUri = uri ?? vscode.window.activeTextEditor?.document.uri;

            if (!targetUri || !isBotFile(targetUri, ['.json'])) {
                vscode.window.showWarningMessage('Select a JSON bot file under the bots folder.');
                return;
            }

            await vscode.commands.executeCommand('Show-Workflow', {
                fileUri: targetUri.toString()
            });
        }
    );
    options.context.subscriptions.push(openBotInWorkflow);

    // Command to open or visualize a specific workflow in the UI.
    new ShowWorkflowCommand(options.context, options.baseUri).register();

    // Command to synchronize external repositories and MCP servers with the G4 cache.
    new SyncCacheCommand(options.context, options.baseUri).register();

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
 * Checks whether a URI points to a supported bot file inside a workspace bots folder.
 */
const isBotFile = (uri: vscode.Uri, extensions: string[]): boolean => {
    if (uri.scheme !== 'file') {
        return false;
    }

    const supportedExtensions = new Set(extensions);
    if (!supportedExtensions.has(path.extname(uri.fsPath).toLowerCase())) {
        return false;
    }

    const folders = vscode.workspace.workspaceFolders ?? [];
    return folders.some(folder => {
        const relativePath = path.relative(folder.uri.fsPath, uri.fsPath);
        if (!relativePath || relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
            return false;
        }

        return relativePath
            .split(/[\\/]+/)
            .some(segment => segment.toLowerCase() === 'bots');
    });
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
    // Register the main G4 webview provider that powers the extension’s UI panel.
    new G4WebviewViewProvider(options.context).register();

    // Register the recorder view provider that displays captured UI events
    // and communicates with the associated EventCaptureService instances.
    new G4RecorderViewProvider(options.context, options.recorderConnections).register();

    // Register the documents tree provider that displays workspace or
    // project-related documents in the Explorer sidebar.
    new DocumentsTreeProvider(options.context).register();

    // Register the custom workflow editor for G4 bot workflow files.
    new G4WorkflowCustomEditorProvider(options.context, options.baseUri).register();
};

/**
 * Continuously attempts to connect to the G4 SignalR hub until a stable connection
 * is established, then synchronizes external repositories and MCP servers into the cache.
 */
const InitializeConnection = async (baseUri: string, context: vscode.ExtensionContext): Promise<string> => {
    // Determine whether a usable endpoint is available.
    const canConnect = baseUri !== null && baseUri !== '';

    // Stop immediately when no valid G4 endpoint is configured.
    if (!canConnect) {
        return '';
    }

    // Keep retrying until the SignalR connection is successfully established.
    while (true) {
        // Show a progress message while attempting to connect to the G4 engine.
        vscode.window.setStatusBarMessage('$(sync~spin) Waiting for G4 Engine Connection...');

        // Create a fresh SignalR notification client for the current connection attempt.
        const client = new NotificationService({
            baseUrl: baseUri,
            context,
            logger: Global.logger
        });

        try {
            // Start the SignalR connection to the G4 hub.
            await client.start();

            // Retry when the client did not reach the connected state.
            if (client.connection.state !== 'Connected') {
                await new Promise(resolve => setTimeout(resolve, 5000));
                continue;
            }

            // Notify the user that the SignalR hub connection succeeded.
            vscode.window.setStatusBarMessage('Connected to G4 Engine SignalR Hub');

            // Show progress while synchronizing externals and MCP servers into the G4 cache.
            vscode.window.setStatusBarMessage('$(sync~spin) Loading G4 Engine Externals and MCPs...');

            // Perform an additional synchronization of tools to ensure the latest tool definitions are available.
            const command = new SyncCacheCommand(context, baseUri);
            await command.invokeCommand({ restart: false });

            vscode.window.setStatusBarMessage('G4 Engine is Connected and Ready');

            // Store the connected G4 hub base URL globally for later use.
            Global.baseHubUrl = baseUri;

            // Return the configured base URI after a successful connection.
            return baseUri;
        } catch (error: any) { // NOSONAR
            // Show a retry message when the SignalR connection attempt fails.
            vscode.window.setStatusBarMessage('$(sync~spin)G4 Engine SignalR Connection Failed. Retrying...');

            // Wait briefly before starting the next retry attempt.
            await new Promise(resolve => setTimeout(resolve, 5000));
            continue;
        }
    }
};
