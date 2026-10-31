/*
 * RESOURCES
 * https://code.visualstudio.com/api/references/commands
 * https://code.visualstudio.com/api/extension-guides/webview#serialization
 */
import * as path from 'node:path';
import * as vscode from 'vscode';

import { CommandBase } from './command-base';

import { Utilities } from '../extensions/utilities';
import { WebviewComponents } from '../extensions/webview-components';

import { G4AutonomousSettings } from '../services/g4-autonomous-settings';

import type { G4AutonomousRunService } from '../services/g4-autonomous-run-service';
import type { AutonomousSettings } from '../services/g4-autonomous-settings';
import type { RecorderOptions } from '../services/g4-recording-service';

// How long the status bar says that the console was copied.
const COPIED_MESSAGE_MILLISECONDS = 3000;

// How long manifest.json must stay quiet before the page is sent new data; one save fires several events.
const MANIFEST_SETTLE_MILLISECONDS = 250;

// Webview type of the autonomous run tab; also the type VS Code restores after an extension-host restart.
const VIEW_TYPE = 'g4-autonomous';

/**
 * Command that opens the G4 Autonomous Exploratory Run tab: a form that picks the recorders, the harness,
 * the model, the reasoning effort, and the prompt of an agent that explores the application and records
 * one flow per scenario, and the live view of that run.
 *
 * @remarks
 * The run itself belongs to {@link G4AutonomousRunService}, so it keeps going when the tab is closed and
 * a reopened tab shows it again. This command only renders the page from the manifest, relays the page's
 * requests to the service, and forwards the service's changes to the page. Only one tab is open at a
 * time, and a tab left open across an extension-host restart is restored, like the other G4 pages.
 */
export class ShowAutonomousCommand extends CommandBase {
    /**
     * The open autonomous run tab, if any.
     *
     * @remarks
     * Running the command again reveals this tab instead of opening a second one. Cleared when the user
     * closes the tab.
     */
    private _panel: vscode.WebviewPanel | undefined;

    /**
     * Creates a new Show Autonomous command instance.
     *
     * @param context - The VS Code extension context.
     * @param _runService - The owner of the autonomous run.
     */
    constructor(context: vscode.ExtensionContext, private readonly _runService: G4AutonomousRunService) {
        // Initialize shared command infrastructure from the base class, including context, logger,
        // manifest, and client access.
        super(context);

        // Set the VS Code command identifier used when registering and invoking this command.
        this.command = 'Show-Autonomous';
    }

    /**
     * Opens the autonomous run tab, or reveals the one that is open.
     *
     * @remarks
     * After an extension-host restart, VS Code revives a hidden webview tab only when it is shown,
     * so the extension does not know that tab yet. The API cannot bring such a tab to the front, so
     * it is closed and a fresh tab is opened; the run state lives in the service, not in the tab.
     *
     * @returns A promise that resolves after the tab is shown.
     */
    protected async onInvokeCommand(): Promise<any> {
        // Reveal the open tab so only one tab shows the run.
        if (this._panel) {
            this._panel.reveal();
            return;
        }

        // Close a restored tab that was never revived, so the new tab stays the only one.
        const unrevivedTabs = vscode.window.tabGroups.all
            .flatMap((tabGroup) => tabGroup.tabs)
            .filter((tab) => ShowAutonomousCommand.testAutonomousTab(tab));

        if (unrevivedTabs.length > 0) {
            await vscode.window.tabGroups.close(unrevivedTabs);
        }

        // Create the tab; the context is retained so a hidden tab keeps its running view and timers.
        const panel = vscode.window.createWebviewPanel(
            VIEW_TYPE,
            'G4 Autonomous Run',
            vscode.ViewColumn.One,
            {
                ...this.getWebviewOptions(),
                retainContextWhenHidden: true
            }
        );

        this.openPanel(panel);
    }

    /**
     * Registers the VS Code command and the webview serializer.
     *
     * @remarks
     * The serializer brings back a tab that was open during an extension-host restart (Sync-Cache,
     * Update-Template) with a working form instead of a dead page.
     *
     * @returns A promise that resolves when the command registration is complete.
     */
    protected async onRegister(): Promise<any> {
        // Register the VS Code command identifier assigned to this command instance.
        const command = vscode.commands.registerCommand(
            this.command,

            // Forward the call into the command execution pipeline.
            async () => {
                await this.invokeCommand();
            }
        );

        // Rebuild a restored tab from the manifest; a second restored tab is closed, so only one stays.
        const serializer = vscode.window.registerWebviewPanelSerializer(VIEW_TYPE, {
            deserializeWebviewPanel: async (panel: vscode.WebviewPanel) => {
                // Keep one tab: a second restored tab goes away.
                if (this._panel) {
                    panel.dispose();
                    return;
                }

                // Give the restored tab the same options and wiring as a new one.
                panel.webview.options = this.getWebviewOptions();
                this.openPanel(panel);
            }
        });

        // Store the disposables so VS Code disposes them when the extension is deactivated.
        this.context.subscriptions.push(command, serializer);
    }

    /**
     * Narrows a page message field to text.
     *
     * @remarks
     * Compute-only. Page messages are untyped, so anything but text becomes an empty string instead of
     * reaching the service or a path as '[object Object]'.
     *
     * @param value - The message field.
     * @returns The trimmed text, or an empty string.
     */
    private static convertToText(value: unknown): string {
        return typeof value === 'string'
            ? value.trim()
            : '';
    }

    /**
     * Builds the page data: whether recording is on, one dropdown choice per manifest recorder, and the
     * harnesses with their models and efforts.
     *
     * @remarks
     * Compute-only. Every recorder is listed, disabled ones included, so the user can pick one for
     * this run without editing the settings; a recorder enabled in the manifest starts picked. The
     * harness executables stay in the host; the page only needs names, kinds, and choices.
     *
     * @param manifest - The project manifest snapshot.
     * @param recorders - The recorders resolved from the manifest.
     * @param settings - The autonomous run settings resolved from the manifest.
     * @returns The data injected into the page.
     */
    private static getAutonomousData(manifest: any, recorders: RecorderOptions[], settings: AutonomousSettings): AutonomousPageData {
        return {
            harnessIssues: settings.issues,
            harnesses: settings.harnesses.map((harness) => ({
                efforts: harness.efforts,
                isSandbox: harness.isSandbox,
                models: harness.models,
                name: harness.name,
                type: harness.type
            })),
            isRecordingEnabled: manifest?.settings?.recorderSettings?.enabled !== false,
            recorders: recorders.map((recorder) => ({
                hint: recorder.baseUrl,
                isPicked: recorder.enabled,
                text: G4AutonomousSettings.getRecorderName(recorder),
                value: recorder.baseUrl
            }))
        };
    }

    /**
     * Builds the page HTML and injects the page data and component URIs into it.
     *
     * @param panel - The tab the HTML is for.
     * @param context - The extension context, for resource paths.
     * @returns The page HTML.
     */
    private static getHtml(panel: vscode.WebviewPanel, context: vscode.ExtensionContext): string {
        // Get the URIs of the page stylesheet and script.
        const styleUri = panel.webview.asWebviewUri(
            vscode.Uri.joinPath(
                context.extensionUri,
                'resources.components',
                'automation-autonomous',
                'automation-autonomous.css'
            )
        );

        const scriptUri = panel.webview.asWebviewUri(
            vscode.Uri.joinPath(
                context.extensionUri,
                'resources.components',
                'automation-autonomous',
                'automation-autonomous.js'
            )
        );

        // Serialize the page data for the #g4-data textarea. A textarea decodes character references
        // and ends at </textarea>, so `<` and `&` are written as JSON unicode escapes, which
        // JSON.parse restores unchanged. Keep the escaped backslashes: String.raw`<` is decoded
        // to '<' by the TypeScript compiler, which would silently disable this escaping.
        const data = ShowAutonomousCommand.readAutonomousData(Utilities.getManifest());
        const dataJson = JSON.stringify(data, null, 4)
            .replaceAll('<', '\\u003c') // NOSONAR
            .replaceAll('&', '\\u0026'); // NOSONAR

        // Fill in the reusable components first, so the data is never searched for placeholders.
        const html = WebviewComponents.setComponentHtml({
            html: Utilities.getResource('resources.components/automation-autonomous/automation-autonomous.html'),
            rootPath: vscode.Uri.joinPath(context.extensionUri, 'resources.components').fsPath,
            toUri: (filePath) => panel.webview.asWebviewUri(vscode.Uri.file(filePath)).toString()
        });

        // Inject the data through a replacer function, so a literal `$` in it (for example in a
        // label) is never read as a replacement token such as `$&`.
        return html
            .replace('{{$ autonomous.data }}', () => dataJson)
            .replace('{{$ component.style.uri }}', styleUri.toString())
            .replace('{{$ component.script.uri }}', scriptUri.toString());
    }

    /**
     * Resolves a run-folder file the page asked to open, refusing anything outside the run folder.
     *
     * @remarks
     * Compute-only over the run state. The page sends paths relative to the run folder (a flow, the
     * brief, the final answer); a path that climbs out of the folder is refused.
     *
     * @param relativePath - The path relative to the run folder.
     * @returns The absolute file path, or an empty string when it is not inside the run folder.
     */
    private getRunFilePath(relativePath: string): string {
        // Without a run or a path there is nothing to open.
        const runFolder = this._runService.snapshot.state.runFolder;
        const isRequestValid = runFolder.length > 0 && relativePath.length > 0;

        if (!isRequestValid) {
            return '';
        }

        // Accept only a path that stays inside the run folder.
        const filePath = path.resolve(runFolder, relativePath);
        const relativeToRun = path.relative(runFolder, filePath);
        const isInsideRunFolder = relativeToRun.length > 0 && !relativeToRun.startsWith('..') && !path.isAbsolute(relativeToRun);

        return isInsideRunFolder
            ? filePath
            : '';
    }

    /**
     * Builds the webview options of the tab, shared by a new tab and a restored one.
     *
     * @returns The options: scripts on, and only the component folder readable.
     */
    private getWebviewOptions(): vscode.WebviewOptions {
        return {
            // Allow scripts to run inside the webview.
            enableScripts: true,

            // Allow the component CSS/JS to load.
            localResourceRoots: [
                vscode.Uri.joinPath(this.context.extensionUri, 'resources.components')
            ]
        };
    }

    /**
     * Handles one message posted from the autonomous run page.
     *
     * @remarks
     * Relays the page's requests: the snapshot when the page is ready, start and stop to the run service,
     * the result links (run folder, run files, flows, settings), a fresh read of the manifest, and the
     * console text for the clipboard. The prompt is never logged.
     *
     * @param panel - The tab that posted the message.
     * @param message - The page message.
     * @returns A promise that resolves once the request is handled.
     */
    private async onPanelMessage(panel: vscode.WebviewPanel, message: any): Promise<void> {
        const command = ShowAutonomousCommand.convertToText(message?.command);

        switch (command) {
            case 'ready':
                // Show the current or last run in a page that just loaded.
                await panel.webview.postMessage({ command: 'autonomousSnapshot', snapshot: this._runService.snapshot });
                break;

            case 'startAutonomousRun': {
                // Start the run and tell the page whether it started.
                const run = message.run ?? {};
                const recorders: unknown[] = Array.isArray(run.recorders) ? run.recorders : [];
                const recorderUrls = recorders
                    .map((recorder) => ShowAutonomousCommand.convertToText(recorder))
                    .filter((recorderUrl) => recorderUrl.length > 0);
                const prompt = typeof run.prompt === 'string'
                    ? run.prompt
                    : '';
                const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '';
                const issue = await this._runService.startRun({
                    effort: ShowAutonomousCommand.convertToText(run.reasoningEffort),
                    harnessName: ShowAutonomousCommand.convertToText(run.harness),
                    model: ShowAutonomousCommand.convertToText(run.model),
                    prompt,
                    recorders: recorderUrls,
                    workspaceFolder
                });

                // An empty issue means the run started; the page then follows the state changes.
                await panel.webview.postMessage({ command: 'autonomousStartResult', issue });
                break;
            }

            case 'stopAutonomousRun':
                // End the agent; the run closes itself and the page hears the outcome.
                await this._runService.stopRun();
                break;

            case 'openRunFolder': {
                // Show the run folder in the operating system's file manager.
                const runFolder = this._runService.snapshot.state.runFolder;

                if (runFolder.length > 0) {
                    await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(runFolder));
                }

                break;
            }

            case 'openRunFile': {
                // Open a run file (the brief, the final answer, the events) as a document.
                const filePath = this.getRunFilePath(ShowAutonomousCommand.convertToText(message.path));

                if (filePath.length > 0) {
                    await vscode.window.showTextDocument(vscode.Uri.file(filePath), { preview: false });
                }

                break;
            }

            case 'openFlow': {
                // Open a saved scenario flow in the workflow viewer.
                const filePath = this.getRunFilePath(ShowAutonomousCommand.convertToText(message.path));

                if (filePath.length > 0) {
                    await vscode.commands.executeCommand('Show-Workflow', { fileUri: vscode.Uri.file(filePath).toString() });
                }

                break;
            }

            case 'openSettings':
                // Open the Settings Editor, where harnesses and recorders are configured.
                await vscode.commands.executeCommand('Show-Settings');
                break;

            case 'refreshAutonomousData':
                // Re-read the manifest on request, for a harness saved after the page opened.
                await ShowAutonomousCommand.sendAutonomousData(panel);
                break;

            case 'copyConsoleText': {
                // Put the console lines on the clipboard; the webview has no reliable clipboard of its own.
                const text = typeof message.text === 'string'
                    ? message.text
                    : '';

                await vscode.env.clipboard.writeText(text);
                vscode.window.setStatusBarMessage('G4: Autonomous run console copied.', COPIED_MESSAGE_MILLISECONDS);
                break;
            }

            default:
                break;
        }
    }

    /**
     * Wires a tab (new or restored) and renders it from the manifest.
     *
     * @remarks
     * Owns the tab's lifetime state: the open-tab reference, the page message handler, the run
     * listener, and the manifest.json watcher, all released when the user closes the tab. Closing the
     * tab does not stop the run.
     *
     * @param panel - The tab to wire.
     */
    private openPanel(panel: vscode.WebviewPanel): void {
        // Remember the tab until the user closes it, so the command can reveal it.
        this._panel = panel;

        // Send the page new data once manifest.json settles; one save fires several file events. A failed
        // read is only logged: the page keeps the data it has.
        let settleTimer: NodeJS.Timeout | undefined;

        const onManifestReadError = (error: unknown) => {
            const reason = Utilities.resolveErrorMessage(error);

            this.logger.warning(`Autonomous run page could not re-read the manifest: ${reason}`);
        };
        const onManifestSettled = () => {
            ShowAutonomousCommand.sendAutonomousData(panel).catch(onManifestReadError);
        };
        const onManifestFileChanged = () => {
            clearTimeout(settleTimer);
            settleTimer = setTimeout(onManifestSettled, MANIFEST_SETTLE_MILLISECONDS);
        };

        // Forward every run change to the page while the tab is open.
        const removeListener = this._runService.addListener((change) => {
            void panel.webview.postMessage({ change, command: 'autonomousChange' });
        });

        // Watch manifest.json, so a harness or recorder saved while the tab is open reaches the form.
        const manifestUri = Utilities.resolveManifestUri();
        const manifestPattern = new vscode.RelativePattern(
            path.dirname(manifestUri),
            path.basename(manifestUri)
        );
        const watcher = vscode.workspace.createFileSystemWatcher(manifestPattern);

        watcher.onDidChange(onManifestFileChanged);
        watcher.onDidCreate(onManifestFileChanged);
        watcher.onDidDelete(onManifestFileChanged);

        // Release the tab state and the watcher when the user closes the tab; the run keeps going.
        panel.onDidDispose(() => {
            clearTimeout(settleTimer);
            removeListener();
            watcher.dispose();
            this._panel = undefined;
        }, undefined, this.context.subscriptions);

        // Handle messages posted from the page; a failed request is logged and reported, never thrown.
        panel.webview.onDidReceiveMessage(
            (message) => {
                this.onPanelMessage(panel, message).catch((error: unknown) => {
                    const reason = Utilities.resolveErrorMessage(error);

                    this.logger.error(`Autonomous run page request failed: ${reason}`);
                    vscode.window.showErrorMessage(`G4 autonomous run: ${reason}`);
                });
            },
            undefined,
            this.context.subscriptions
        );

        // Render the page from the manifest.
        panel.webview.html = ShowAutonomousCommand.getHtml(panel, this.context);
    }

    /**
     * Reads the page data from a manifest snapshot: its recorders, its autonomous settings, and
     * whether recording is on.
     *
     * @remarks
     * Shared by the first render and every refresh, so the page always gets the same shape. The harnesses
     * and the recording switch come from the given snapshot; the recorders are read from manifest.json on
     * disk by Utilities.resolveEventsCaptureOptions, which is the same file the snapshot was just read from.
     *
     * @param manifest - The project manifest snapshot.
     * @returns The page data.
     */
    private static readAutonomousData(manifest: any): AutonomousPageData {
        return ShowAutonomousCommand.getAutonomousData(
            manifest,
            Utilities.resolveEventsCaptureOptions(),
            G4AutonomousSettings.resolveAutonomousSettings(manifest));
    }

    /**
     * Re-reads manifest.json and sends the page the new harnesses, recorders, and recording switch.
     *
     * @remarks
     * The shared manifest snapshot is replaced too, so the run service starts the next run with the
     * harnesses the page now offers. Called by the manifest watcher and by the page's refresh button.
     *
     * @param panel - The tab to update.
     * @returns A promise that resolves once the data is posted.
     */
    private static async sendAutonomousData(panel: vscode.WebviewPanel): Promise<void> {
        // Replace the shared snapshot, so the page and the run service read the same harnesses.
        const manifest = Utilities.updateManifest();

        // Post the new data; the page keeps the user's choices that still exist.
        await panel.webview.postMessage({
            command: 'autonomousData',
            data: ShowAutonomousCommand.readAutonomousData(manifest)
        });
    }

    /**
     * Tests whether an editor tab shows the autonomous run webview.
     *
     * @remarks
     * Compute-only. VS Code reports a webview tab's view type with its own `mainThreadWebview-`
     * prefix, so both the bare and the prefixed form are accepted.
     *
     * @param tab - The editor tab to test.
     * @returns True when the tab is an autonomous run tab.
     */
    private static testAutonomousTab(tab: vscode.Tab): boolean {
        // Only webview tabs carry a view type.
        if (!(tab.input instanceof vscode.TabInputWebview)) {
            return false;
        }

        const viewType = tab.input.viewType;
        const isAutonomousViewType = viewType === VIEW_TYPE || viewType === `mainThreadWebview-${VIEW_TYPE}`;

        return isAutonomousViewType;
    }
}

// The contracts below are compile-time only, so they follow the executable code. Interfaces come
// before type aliases; inside each group a declaration comes before the ones it uses (dependency
// first), and A-Z order decides otherwise.

/**
 * The data the host injects into the autonomous run page through #g4-data.
 */
interface AutonomousPageData {
    /** Why harness entries of the manifest were left out; shown on the page. */
    harnessIssues: string[];

    /** The harnesses the user can start a run with, in manifest order. */
    harnesses: AutonomousHarnessChoice[];

    /** False when recording is turned off in the settings; the page then refuses to start a run. */
    isRecordingEnabled: boolean;

    /** One choice per recorder in the manifest, in manifest order, disabled recorders included. */
    recorders: AutonomousRecorderChoice[];
}

/**
 * One harness as the page offers it; the executable stays in the host.
 */
interface AutonomousHarnessChoice {
    /** The reasoning efforts offered; empty means the tool's own default. */
    efforts: string[];

    /** Whether the harness runs inside a sandbox partition. */
    isSandbox: boolean;

    /** The models offered; empty means the tool's own default. */
    models: string[];

    /** The unique harness name, sent back when the user starts a run. */
    name: string;

    /** The tool: claude, codex, or opencode. */
    type: string;
}

/**
 * One recorder as a choice of the page's recorders dropdown.
 */
interface AutonomousRecorderChoice {
    /** The recorder endpoint, shown under the name. */
    hint: string;

    /** Whether the recorder starts switched on (it is enabled in the manifest). */
    isPicked: boolean;

    /** The recorder name: its capability label and driver, or the driver alone. */
    text: string;

    /** The recorder endpoint, `<schema>://<host>:<port>`; the page reports picked recorders by it. */
    value: string;
}
