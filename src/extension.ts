import * as fs from 'node:fs/promises';
import * as vscode from 'vscode';

import { NotificationService } from './clients/g4-signalr-client';

import { NewProjectCommand } from './commands/new-project';
import { ShowReportCommand } from './commands/show-report';
import { ShowSettingsCommand } from './commands/show-settings';
import { ShowWorkflowCommand } from './commands/show-workflow';
import { StartRecorderCommand } from './commands/start-recorder';
import { StopRecorderCommand } from './commands/stop-recorder';
import { SyncCacheCommand } from './commands/sync-cache';
import { UpdateEnvironmentCommand } from './commands/update-environment';
import { UpdateFlowCommand } from './commands/update-flow';
import { UpdateTemplateCommand } from './commands/update-template';
import { UpdateTemplatePublisherCommand } from './commands/update-template-publisher';

import { Global } from './constants/global';

import { showPendingNotices } from './extensions/notification-utilities';
import { Utilities } from './extensions/utilities';

import { DocumentsTreeProvider } from './providers/g4-documents-tree-provider';
import { G4RecorderViewProvider } from './providers/g4-recorder-webview-view-provider';
import { G4ReportCustomEditorProvider } from './providers/g4-report-custom-editor-provider';
import { G4WebviewViewProvider } from './providers/g4-webview-view-provider';
import { G4WorkflowCustomEditorProvider } from './providers/g4-workflow-custom-editor-provider';

import {
    G4HubService,
    G4ProjectManifest
} from './services/g4-hub-service';
import { G4RecordingService } from './services/g4-recording-service';
import { ApplySettingsOptions, G4SettingsService } from './services/g4-settings-service';

// Import the function that initializes the connection to the backend hub.
const hubConnections = new Map<string, NotificationService>();

// Fallback Hub endpoint used when the manifest names no g4Server, matching CommandBase.
const DEFAULT_HUB_URL = 'http://localhost:9944';

// The recorder command, view, and session owner, captured during registration so the settings service
// can hot-apply recorder changes (replace recorder settings, re-render the panel) without a reload.
let recorderCommand: StartRecorderCommand | undefined;
let recorderViewProvider: G4RecorderViewProvider | undefined;
let recordingService: G4RecordingService | undefined;

/**
 * Entry point for the VS Code extension.
 * This function is called by VS Code when the extension is activated and is responsible for
 * initializing the connection to backend services, resolving configuration, and registering
 * all commands, events and providers that the extension exposes.
 *
 * @param context The extension context provided by VS Code that contains subscriptions,
 *        global state, workspace state and other shared resources for the extension.
 */
export async function activate(context: vscode.ExtensionContext) {
    // Read the configured G4 endpoint through the original activation path so
    // command registration is not blocked by project-manifest availability.
    const baseUri = Utilities.getG4Endpoint();

    // Start the sandboxed hub opportunistically without delaying activation events.
    void startSandboxHubFromManifest().catch(() => undefined);

    // Show notices stored before the window reloaded or the extension host restarted, such as the sandbox
    // chosen by New-Project or a cache sync problem; warnings are also written to the new log channel.
    void showPendingNotices(context, Global.logger);

    // Resolve configuration options related to events capture, such as recording behavior
    // and filters applied while listening to editor or UI events.
    const eventsCaptureOptions = Utilities.resolveEventsCaptureOptions();

    // Create the single recording session owner shared by the recorder commands, panel, and settings.
    // The Hub runs recordings, so it needs the Hub endpoint (or the same fallback CommandBase uses).
    const hubUrl = baseUri.length > 0
        ? baseUri
        : DEFAULT_HUB_URL;

    recordingService = new G4RecordingService({
        hubUrl,
        recorders: eventsCaptureOptions
    });

    // Compose a shared options object that is passed to all registration functions.
    // This groups together the core dependencies needed by commands, events and providers.
    const options = {
        context,
        baseUri,
        hubConnections,
        recordingService
    };

    // Register all VS Code commands exposed by the extension.
    registerCommands(options);

    // Register language or notebook providers such as completion, hover and serializers.
    registerProviders(options);

    // Register the settings service and Apply-Settings command after the recorder command and
    // view exist, so hot-apply can rebuild and re-render them without a window reload.
    registerSettingsService(context);

    // Initialize the base URI used to communicate with the backend hub or services.
    // This typically resolves configuration, environment and connection parameters.
    await initializeConnection(baseUri, context);
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
    hubConnections: Map<string, NotificationService>,
    recordingService: G4RecordingService
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

            if (!targetUri || !Utilities.testBotFile(targetUri, ['.g4', '.g4bot'])) {
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

            if (!targetUri || !Utilities.testBotFile(targetUri, ['.json'], ['bots', 'base.bots'])) {
                vscode.window.showWarningMessage('Select a JSON bot file under the bots or base.bots folder.');
                return;
            }

            await vscode.commands.executeCommand('Show-Workflow', {
                fileUri: targetUri.toString()
            });
        }
    );
    options.context.subscriptions.push(openBotInWorkflow);

    // Command to open a saved .g4rpt report in the report viewer.
    const openReportViewer = vscode.commands.registerCommand(
        'Open-Report-Viewer',
        async (uri?: vscode.Uri) => {
            const targetUri = uri ?? vscode.window.activeTextEditor?.document.uri;

            if (!targetUri || !Utilities.testReportFile(targetUri)) {
                vscode.window.showWarningMessage('Select a .g4rpt file under the reports folder.');
                return;
            }

            await vscode.commands.executeCommand('vscode.openWith', targetUri, G4ReportCustomEditorProvider.VIEW_TYPE);
        }
    );
    options.context.subscriptions.push(openReportViewer);

    // Command to open or visualize a specific workflow in the UI.
    new ShowWorkflowCommand(options.context, options.baseUri).register();

    // Command to synchronize external repositories and MCP servers with the G4 cache.
    new SyncCacheCommand(options.context, options.baseUri).register();

    // Command to synchronize or refresh environment settings from the backend.
    new UpdateEnvironmentCommand(options.context, options.baseUri).register();

    // Command to fetch or update templates used for new automation workflows.
    new UpdateTemplateCommand(options.context, options.baseUri).register();

    // Command to publish bot automations from the workspace bots folder as flows.
    new UpdateFlowCommand(options.context, options.baseUri).register();

    // Command to publish a template file, or the rules of one bot job, from the workspace as a template.
    new UpdateTemplatePublisherCommand(options.context, options.baseUri).register();

    // Initialize the recorder command, which starts Hub recording sessions. Captured in a module
    // field so the settings service can confirm a stop before applying recorder settings.
    recorderCommand = new StartRecorderCommand(options.context, options.recordingService);
    recorderCommand.register();

    // Command to stop the Hub recording session and open the recorded workflow.
    new StopRecorderCommand(options.context, options.recordingService).register();
};

/**
 * Registers all VS Code providers used by the extension.
 */
const registerProviders = (options: {
    context: vscode.ExtensionContext,
    baseUri: string,
    hubConnections: Map<string, NotificationService>,
    recordingService: G4RecordingService
}) => {
    // Register the main G4 webview provider that powers the extension's UI panel.
    new G4WebviewViewProvider(options.context).register();

    // Register the recorder view provider that shows each recorder's Hub session status and drives
    // start, stop, suspend, and resume. Captured in a module field so the settings service can
    // re-render it when settings are applied.
    recorderViewProvider = new G4RecorderViewProvider(options.context, options.recordingService);
    recorderViewProvider.register();

    // Register the documents tree provider that displays workspace or
    // project-related documents in the Explorer sidebar.
    new DocumentsTreeProvider(options.context).register();

    // Register the custom workflow editor for G4 bot workflow files.
    new G4WorkflowCustomEditorProvider(options.context, options.baseUri).register();

    // Register the report viewer for saved .g4rpt reports, and keep the Explorer menu's list of
    // report files current.
    new G4ReportCustomEditorProvider(options.context).register();
    registerReportFilesContext(options.context);
};

/**
 * Keeps the `g4.reportFiles` context key listing every `<workspace folder>/reports/**\/*.g4rpt` file.
 *
 * @remarks
 * The Explorer menu's `when` clause cannot anchor a folder to a workspace root, so the menu tests
 * `resourcePath in g4.reportFiles` instead. The list is rebuilt (debounced) whenever anything below
 * a reports folder is created or deleted, and when workspace folders change.
 *
 * @param context - Extension context that owns the watcher and listeners.
 */
const registerReportFilesContext = (context: vscode.ExtensionContext): void => {
    let timer: NodeJS.Timeout | undefined;

    // Publishes the current report files as an object keyed by path, the shape `in` tests.
    const updateReportFiles = async (): Promise<void> => {
        const uris = await vscode.workspace.findFiles('**/reports/**/*.g4rpt');
        const reportFiles = Object.fromEntries(uris
            .filter(uri => Utilities.testReportFile(uri))
            .map(uri => [uri.fsPath, true]));

        await vscode.commands.executeCommand('setContext', 'g4.reportFiles', reportFiles);
    };

    // Coalesces bursts of file events (a run saving, a folder deleted) into one rebuild.
    const scheduleUpdate = (): void => {
        clearTimeout(timer);
        timer = setTimeout(() => void updateReportFiles(), 300);
    };

    // Watch whole reports trees so folder renames and deletions also refresh the list.
    const watcher = vscode.workspace.createFileSystemWatcher('**/reports/**');

    context.subscriptions.push(
        watcher,
        watcher.onDidCreate(scheduleUpdate),
        watcher.onDidDelete(scheduleUpdate),
        vscode.workspace.onDidChangeWorkspaceFolders(scheduleUpdate),
        { dispose: () => clearTimeout(timer) }
    );

    void updateReportFiles();
};

/**
 * Registers the settings service and the `Apply-Settings` command.
 *
 * @remarks
 * Wired after commands and providers so the recorder command and view instances captured during
 * their registration are available. The command lets the user hot-apply settings on demand from
 * the Command Palette; the settings webview invokes the same command after a save.
 *
 * @param context - The extension context used to register the command disposable.
 */
const registerSettingsService = (context: vscode.ExtensionContext): void => {
    // Copy the module fields into locals so their non-undefined type narrows for the service.
    const startRecorderCommand = recorderCommand;
    const recorderView = recorderViewProvider;
    const sessionOwner = recordingService;

    // The recorder subsystems must exist before the settings service can hot-apply their changes.
    if (startRecorderCommand === undefined) {
        return;
    }

    if (recorderView === undefined) {
        return;
    }

    if (sessionOwner === undefined) {
        return;
    }

    // Build the service over the live recorder subsystems and the shared session owner.
    const settingsService = new G4SettingsService({
        startRecorderCommand,
        recorderView,
        recordingService: sessionOwner
    });

    // Register Apply-Settings so a manual palette call, or a settings save, hot-applies the
    // on-disk manifest without a window reload.
    const disposable = vscode.commands.registerCommand(
        'Apply-Settings',
        (options?: ApplySettingsOptions) => settingsService.updateSettings(options));

    context.subscriptions.push(disposable);
};

/**
 * Continuously attempts to connect to the G4 SignalR hub until a stable connection
 * is established, then synchronizes external repositories and MCP servers into the cache.
 */
const initializeConnection = async (baseUri: string, context: vscode.ExtensionContext): Promise<string> => {
    // Determine whether a usable endpoint is available.
    const canConnect = baseUri !== null && baseUri !== '';

    // Stop immediately when no valid G4 endpoint is configured.
    if (!canConnect) {
        return '';
    }

    // Keep one status bar message for the whole flow: each update disposes the previous one, so the
    // retry loop cannot stack a new message every 5 seconds.
    let statusMessage: vscode.Disposable | undefined;

    const setConnectionStatus = (text: string, timeoutMilliseconds?: number): void => {
        // Remove the previous message before showing the next one.
        statusMessage?.dispose();

        // A timeout lets a final message clear itself; a progress message stays until it is replaced.
        statusMessage = timeoutMilliseconds === undefined
            ? vscode.window.setStatusBarMessage(text)
            : vscode.window.setStatusBarMessage(text, timeoutMilliseconds);
    };

    // Keep retrying until the SignalR connection is successfully established.
    while (true) {
        // Show a progress message while attempting to connect to the G4 engine.
        setConnectionStatus('$(sync~spin) Waiting for G4 Engine Connection...');

        // Create a fresh SignalR notification client for the current connection attempt.
        const client = new NotificationService({
            baseUrl: baseUri,
            context,
            logger: Global.logger
        });

        // Make one connection attempt; the loop owns retrying, so only one client exists at a time.
        let isConnected = false;

        try {
            await client.start();
            isConnected = client.connection.state === 'Connected';
        } catch {
            isConnected = false;
        }

        // Discard a failed client before the next attempt, so failed clients cannot pile up and
        // all connect at once when the Hub comes back.
        if (!isConnected) {
            await client.stop();

            // Show a retry message, then wait briefly before the next attempt.
            setConnectionStatus('$(sync~spin) G4 Engine SignalR Connection Failed. Retrying...');
            await new Promise(resolve => setTimeout(resolve, 5000));
            continue;
        }

        // Show progress while synchronizing externals and MCP servers into the G4 cache.
        setConnectionStatus('$(sync~spin) Loading G4 Engine Externals and MCPs...');

        // Synchronize the cache and tools. A failure is reported by the command and must not
        // start a second client next to this connected one.
        try {
            const command = new SyncCacheCommand(context, baseUri);
            await command.invokeCommand({ restart: false });
        } catch (error) {
            Global.logger.error(`Loading G4 Engine externals and MCPs failed: ${Utilities.resolveErrorMessage(error)}`);
        }

        // Show the connected state; it stays until the next connection status replaces it.
        setConnectionStatus('G4 Engine is Connected and Ready');

        // Store the connected G4 hub base URL globally for later use.
        Global.baseHubUrl = baseUri;

        // The G4 cache is now populated. Rebuild the documentation tree so its
        // plugin-type nodes (and docs) render against the connected engine. Guarded
        // so a not-yet-registered command can never fail the connection flow.
        try {
            await vscode.commands.executeCommand('Update-Documents');
        } catch {
            // Ignore: the documents view/command may not be registered yet.
        }

        // Return the configured base URI after a successful connection.
        return baseUri;
    }
};

/**
 * Reads the current workspace manifest when it exists and parses successfully.
 *
 * @returns The parsed manifest, or null while the workspace has no readable manifest.
 */
const readProjectManifest = async (): Promise<G4ProjectManifest | null> => {
    // Activation can start before a workspace folder is available.
    const workspaceFolders = vscode.workspace.workspaceFolders ?? [];

    if (workspaceFolders.length === 0) {
        return null;
    }

    try {
        // Use the existing manifest-location convention shared by commands.
        const manifestPath = Utilities.resolveManifestUri();
        const manifestContent = await fs.readFile(manifestPath, 'utf8');

        return JSON.parse(manifestContent) as G4ProjectManifest;
    } catch {
        return null;
    }
};

/**
 * Starts the sandboxed G4 Hub from the current project manifest when the manifest is available.
 *
 * @returns A promise that resolves after the optional startup attempt completes.
 *
 * @remarks
 * Runs as a detached activation task so missing manifests, new project creation, and slow hub
 * startup never block command and provider registration.
 */
const startSandboxHubFromManifest = async (): Promise<void> => {
    // Missing, malformed, or unreadable manifests are expected during new project creation.
    const manifest = await readProjectManifest();

    if (manifest === null) {
        return;
    }

    // Incomplete server or sandbox configuration is skipped silently by the hub service.
    await G4HubService.startFromManifestWhenRequired(manifest);
};
