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
import { UpdateTemplateCommand } from './commands/update-template';
import { DocumentsTreeProvider } from './providers/g4-documents-tree-provider';





import { mkdirSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { spawn } from 'child_process';


function safeRequire<T = any>(mod: string): T {
    // @ts-ignore
    const req: NodeJS.Require = typeof __non_webpack_require__ === 'function'
        // @ts-ignore
        ? __non_webpack_require__
        : require;
    return req(mod);
}


console.log('Electron version:', process.versions.electron);
const { uIOhook } = safeRequire('uiohook-napi');

type ElementInfo = {
    name?: string;
    controlType?: string;
    automationId?: string;
    className?: string;
    runtimeId?: number[];
    bounds?: { x: number; y: number; width: number; height: number };
    processId?: number;
};


type RecordedEvent =
    | {
        type: 'click';
        button: 'left' | 'right' | 'middle';
        ts: number;
        screen: { x: number; y: number };
        element: ElementInfo | null;
    }
    | {
        type: 'keydown' | 'keyup';
        ts: number;
        keycode: number;
    };

let running = false;
let outFile = '';
let probePath = vscode.Uri.file(
        'E:\\Grabage\\net8.0-windows\\publish\\UiaPeek.exe'
    ).fsPath;


function buttonIdToName(btn: number): 'left' | 'right' | 'middle' {
    return btn === 1 ? 'left' : btn === 2 ? 'right' : 'middle';
}

function append(evt: RecordedEvent) {
    const line = JSON.stringify(evt) + '\n';
    writeFileSync(outFile, line, { flag: 'a' });
}


function probeAt(x: number, y: number): Promise<ElementInfo | null> {
    return new Promise((resolve) => {
        const p = spawn(probePath, ["peek", "-x", String(x), "-y", String(y)], { windowsHide: false });

        let buf = '';
        p.stdout.on('data', (d) => {
            (buf += d.toString('utf8'));
        });
        p.on('error', () => resolve(null));
        p.on('close', () => {
            try {
                const parsed = JSON.parse(buf || '{}');
                resolve(parsed);
            } catch {
                resolve(null);
            }
        });
    });
}


async function start(context: vscode.ExtensionContext) {
    if (running) {
        vscode.window.showInformationMessage('Win Recorder already running.');
        return;
    }

    // Resolve storage + output
    const storage = context.globalStorageUri.fsPath;
    if (!existsSync(storage)) mkdirSync(storage, { recursive: true });
    outFile = join(storage, 'recording.jsonl');
    if (!existsSync(outFile)) writeFileSync(outFile, '');

    // Wire events
    uIOhook.on('mousedown', async (e: any) => {
        if (!running) return;
        const element = await probeAt(e.x, e.y);
        append({
            type: 'click',
            button: buttonIdToName(e.button),
            ts: Date.now(),
            screen: { x: e.x, y: e.y },
            element
        });
    });

    uIOhook.on('keydown', (e: any) => {
        if (!running) return;
        append({ type: 'keydown', ts: Date.now(), keycode: e.keycode });
    });

    uIOhook.on('keyup', (e: any) => {
        if (!running) return;
        append({ type: 'keyup', ts: Date.now(), keycode: e.keycode });
    });

    // Start hook
    uIOhook.start();
    running = true;

    const link = vscode.Uri.file(outFile);
    vscode.window.showInformationMessage('Win Recorder started. Writing JSONL to: ' + outFile, 'Open File')
        .then(btn => { if (btn) vscode.env.openExternal(link); });
}


async function stop() {
    if (!running) return;
    running = false;
    if (uIOhook) uIOhook.stop();
    vscode.window.showInformationMessage('Win Recorder stopped.');
}

const connections = new Map<string, NotificationService>();

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext) {
    const baseUri = await InitializeConnection(context);
    const options = { context, baseUri, connections };

    registerCommands(options);
    registerNotebookEvents(options);
    registerProviders(options);

    vscode.commands.registerCommand('winrec.start', () => start(context));
    vscode.commands.registerCommand('winrec.stop', () => stop());
}

// This method is called when your extension is deactivated
export function deactivate() {
    // Clean up any resources or connections
}

const registerCommands = (options: {
    context: vscode.ExtensionContext,
    baseUri: string,
    connections: Map<string, NotificationService>
}) => {
    new NewProjectCommand(options.context).register();
    new SendAutomationCommand(options.context, options.connections).register();
    new ShowWorkflowCommand(options.context, options.baseUri).register();
    new UpdateEnvironmentCommand(options.context, options.baseUri).register();
    new UpdateTemplateCommand(options.context, options.baseUri).register();
};

const registerProviders = (options: {
    context: vscode.ExtensionContext,
    baseUri: string,
    connections: Map<string, NotificationService>
}) => {
    new MdJsonNotebookProvider(options.context, options.baseUri).register();
    new G4WebviewViewProvider(options.context).register();
    new DocumentsTreeProvider(options.context).register();
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
