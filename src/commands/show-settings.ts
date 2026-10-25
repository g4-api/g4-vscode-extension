/*
 * RESOURCES
 * https://code.visualstudio.com/api/references/commands
 * https://code.visualstudio.com/api/extension-guides/webview#serialization
 */
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as vscode from 'vscode';

import { CommandBase } from './command-base';

import { showTemporaryInformationMessage } from '../extensions/notification-utilities';
import { Utilities } from '../extensions/utilities';
import { WebviewComponents } from '../extensions/webview-components';

// Confirmation button of the factory reset dialog; a modal dialog adds its own Cancel.
const FACTORY_RESET_ACTION = 'Restore Factory Settings';

// What a factory reset changes, shown under the confirmation question.
const FACTORY_RESET_DETAIL = 'This clears the license token and sandbox path and restores every shipped default. Nothing is written until you click Save.';

// Buttons of the dialog shown when manifest.json changed outside the editor; a modal dialog adds its own Cancel.
const OVERWRITE_ACTION = 'Overwrite';
const RELOAD_ACTION = 'Reload Settings';

// What each choice of the changed-file dialog does, shown under the question.
const CHANGED_FILE_DETAIL = 'Overwrite replaces those changes with the values in this editor. '
    + 'Reload Settings discards the unsaved values in this editor and loads the file.';

// Webview type of the settings tab; also the type VS Code restores after an extension-host restart.
const VIEW_TYPE = 'g4-settings';

/**
 * Command that opens the G4 Settings editor: a webview form over the workspace manifest.json.
 *
 * @remarks
 * The page edits a copy of the manifest read from disk and posts it back on Save; the host checks
 * that the file did not change meanwhile, writes it, and applies the settings. Only one settings
 * tab is open at a time, and a tab left open across an extension-host restart is restored.
 */
export class ShowSettingsCommand extends CommandBase {
    /**
     * The manifest.json text the open tab was loaded from, or `undefined` when there was no file.
     *
     * @remarks
     * Save compares the file with this text, so a change made outside the editor (by hand, by
     * git, or by Test Wright) is never overwritten without asking. Updated after every save.
     */
    private _loadedFileText: string | undefined;

    /**
     * The open settings tab, if any.
     *
     * @remarks
     * One tab edits one manifest.json; a second tab could save over the first, so running the
     * command again reveals this tab instead. Cleared when the user closes the tab.
     */
    private _panel: vscode.WebviewPanel | undefined;

    /**
     * Creates a new Show Settings command instance.
     *
     * @param context - The VS Code extension context.
     */
    constructor(context: vscode.ExtensionContext) {
        // Initialize shared command infrastructure from the base class,
        // including context, logger, manifest, and client access.
        super(context);

        // Set the VS Code command identifier used when registering
        // and invoking this command.
        this.command = 'Show-Settings';
    }

    /**
     * Registers the VS Code command handled by this command class.
     *
     * The registered command delegates execution to the shared command pipeline
     * by calling `invokeCommand(args)`. A webview serializer is registered as well, so a settings
     * tab that was open during an extension-host restart (Sync-Cache, Update-Template) comes back
     * working instead of staying on screen with Save doing nothing.
     *
     * @returns A promise that resolves when the command registration is complete.
     */
    protected async onRegister(): Promise<any> {
        // Register the VS Code command identifier assigned to this command instance.
        const command = vscode.commands.registerCommand(
            this.command,

            // Forward command arguments into the command execution pipeline.
            async () => {
                await this.invokeCommand();
            }
        );

        // Rebuild a restored tab from the file on disk; a second restored tab is closed, so only one can save.
        const serializer = vscode.window.registerWebviewPanelSerializer(VIEW_TYPE, {
            deserializeWebviewPanel: async (panel: vscode.WebviewPanel) => {
                if (this._panel) {
                    panel.dispose();
                    return;
                }

                panel.webview.options = this.getWebviewOptions();
                await this.openPanel(panel);
            }
        });

        // Store the disposables in the extension context so VS Code
        // automatically disposes them when the extension is deactivated.
        this.context.subscriptions.push(command, serializer);
    }

    /**
     * Invokes the Show Settings command and opens the settings inside a VS Code webview.
     *
     * Behavior:
     * - Reveals the open settings tab instead of opening a second one.
     * - Creates a new webview panel for displaying the settings.
     * - Loads the settings from manifest.json on disk, then wires the tab.
     *
     * @returns A promise that resolves after the settings webview is created.
     */
    protected async onInvokeCommand(): Promise<any> {
        // Reveal the open tab so only one tab can save manifest.json.
        if (this._panel) {
            this._panel.reveal();
            return;
        }

        // Create a new VS Code webview panel for displaying the G4 settings.
        const panel = vscode.window.createWebviewPanel(
            // Internal webview type identifier.
            VIEW_TYPE,

            'G4 Settings',

            // Open the settings in the first editor column.
            vscode.ViewColumn.One,
            {
                ...this.getWebviewOptions(),

                // Keep the webview state alive when the tab is hidden.
                retainContextWhenHidden: true
            }
        );

        await this.openPanel(panel);
    }

    // Builds the HTML shim injected into the settings document <head>.
    private static getHeaderShim(): string {
        // Placeholder for future head-level report scripts/styles.
        return `
        <script></script>`;
    }

    // Builds the HTML shim injected into the settings document <body>.
    private static getBodyShim(): string {
        // Placeholder for future body-level report scripts/markup.
        return `
        <script></script>`;
    }

    // Reads manifest.json as text; `undefined` when the file does not exist or cannot be read.
    private static async readManifestText(): Promise<string | undefined> {
        try {
            return await fs.readFile(Utilities.resolveManifestUri(), 'utf8');
        } catch {
            return undefined;
        }
    }

    // Builds the webview options of the settings tab, shared by a new tab and a restored one.
    private getWebviewOptions(): vscode.WebviewOptions {
        return {
            // Allow scripts to run inside the settings webview.
            enableScripts: true,

            // Allow the component CSS/JS to load.
            localResourceRoots: [
                vscode.Uri.joinPath(this.context.extensionUri, 'resources.components')
            ]
        };
    }

    /**
     * Handles one message posted from the settings page.
     *
     * @param panel - The settings tab that sent the message.
     * @param message - The page message.
     */
    private async onPanelMessage(panel: vscode.WebviewPanel, message: any): Promise<void> {
        // Open external links (e.g. the Capabilities page) in the
        // computer's default browser rather than inside VS Code.
        if (message?.command === 'openExternal' && message.url) {
            await vscode.env.openExternal(vscode.Uri.parse(message.url));
        }

        // Let the settings page fill the root manifest sandbox field from a folder picker.
        if (message?.command === 'browseSandbox') {
            const sandboxPath = await Utilities.selectSandboxLocation();

            if (sandboxPath) {
                await panel.webview.postMessage({
                    command: 'setSandboxPath',
                    sandboxPath
                });
            }
        }

        // A factory reset clears the license token and sandbox path, so the user confirms it
        // in a modal dialog first; the page applies it only after the confirmation.
        if (message?.command === 'confirmFactoryReset') {
            const choice = await vscode.window.showWarningMessage(
                'Restore factory settings?',
                { detail: FACTORY_RESET_DETAIL, modal: true },
                FACTORY_RESET_ACTION);

            if (choice === FACTORY_RESET_ACTION) {
                await panel.webview.postMessage({ command: 'factoryResetConfirmed' });
            }
        }

        // Let the settings page fill the root manifest sandbox field from the newest local sandbox.
        if (message?.command === 'autoDetectSandbox') {
            const sandboxPath = Utilities.findLatestSandbox();

            if (sandboxPath) {
                await panel.webview.postMessage({
                    command: 'setSandboxPath',
                    sandboxPath
                });
            } else {
                vscode.window.showWarningMessage(
                    'No G4 Sandbox was auto-detected. Browse manually for the G4 Sandbox.'
                );
            }
        }

        // Handle settings save messages posted from the webview.
        if (message?.command === 'saveSettings' && message.manifest !== undefined) {
            await this.saveSettings(panel, message.manifest);
        }
    }

    /**
     * Wires a settings tab (new or restored) and renders it from the file on disk.
     *
     * @remarks
     * Owns the tab's lifetime state: the open-tab reference, the manifest.json watcher, and the
     * page message handler. All three are released when the user closes the tab.
     *
     * @param panel - The settings tab to wire.
     */
    private async openPanel(panel: vscode.WebviewPanel): Promise<void> {
        // Remember the tab until the user closes it, so the command can reveal it.
        this._panel = panel;

        // Watch manifest.json, so a change made outside the editor is reported while the tab is open.
        const manifestUri = Utilities.resolveManifestUri();
        const watcher = vscode.workspace.createFileSystemWatcher(
            new vscode.RelativePattern(path.dirname(manifestUri), path.basename(manifestUri)));
        const onManifestFileChanged = () => {
            void this.showManifestChanged(panel);
        };

        watcher.onDidChange(onManifestFileChanged);
        watcher.onDidCreate(onManifestFileChanged);
        watcher.onDidDelete(onManifestFileChanged);

        // Release the tab state and the watcher when the user closes the tab.
        panel.onDidDispose(() => {
            this._panel = undefined;
            this._loadedFileText = undefined;
            watcher.dispose();
        }, undefined, this.context.subscriptions);

        // Handle messages posted from the settings webview.
        panel.webview.onDidReceiveMessage(
            (message) => this.onPanelMessage(panel, message),
            undefined,
            this.context.subscriptions
        );

        // Render the form from the file on disk.
        await this.setPanelHtml(panel);
    }

    /**
     * Writes the manifest after checking that the file did not change since the tab loaded it.
     *
     * @remarks
     * Runs inside Apply-Settings, after any recording was stopped, so nothing is written when the
     * user cancels a prompt. A file changed outside the editor is overwritten only after the user
     * confirms; Reload Settings re-renders the form from the file instead.
     *
     * @param panel - The settings tab that asked to save.
     * @param manifest - The manifest built by the page.
     * @returns True when the file was written.
     */
    private async saveManifest(panel: vscode.WebviewPanel, manifest: unknown): Promise<boolean> {
        // Ask before overwriting a file that changed since the tab loaded it.
        const fileText = await ShowSettingsCommand.readManifestText();

        if (fileText !== this._loadedFileText) {
            const choice = await vscode.window.showWarningMessage(
                'manifest.json changed outside the G4 Settings editor after it was loaded.',
                { detail: CHANGED_FILE_DETAIL, modal: true },
                OVERWRITE_ACTION,
                RELOAD_ACTION);

            // Reload shows the file's values; Cancel leaves the form as it is. Neither writes.
            if (choice === RELOAD_ACTION) {
                await this.setPanelHtml(panel);
            }

            if (choice !== OVERWRITE_ACTION) {
                return false;
            }
        }

        // Resolve the target manifest path for the current workspace.
        const manifestUri = Utilities.resolveManifestUri();

        try {
            // Serialize with the same 4-space indent used when reading/injecting it.
            const json = `${JSON.stringify(manifest, null, 4)}\n`;

            // Ensure the parent folder (e.g. src/) exists, then overwrite the manifest.
            await fs.mkdir(path.dirname(manifestUri), { recursive: true });
            await fs.writeFile(manifestUri, json, 'utf8');

            // The tab now matches the file, so the next save and the watcher compare against it.
            this._loadedFileText = json;
        } catch (error) {
            // Surface any write failure (permissions, disk, etc.).
            vscode.window.showErrorMessage(`Could not save G4 settings: ${Utilities.resolveErrorMessage(error)}`);
            return false;
        }

        // Confirm the save to the user.
        showTemporaryInformationMessage('G4 settings saved.');

        return true;
    }

    /**
     * Saves the page's manifest through Apply-Settings, which asks about a recording first.
     *
     * @remarks
     * Apply-Settings stops an in-progress recording (after the user confirms), then calls back to
     * write the file, then applies it. Cancelling the recording prompt therefore writes nothing,
     * so the file and the applied settings cannot disagree.
     *
     * @param panel - The settings tab that asked to save.
     * @param manifest - The manifest built by the page.
     */
    private async saveSettings(panel: vscode.WebviewPanel, manifest: unknown): Promise<void> {
        // A save needs an open workspace to resolve the manifest path.
        if (!vscode.workspace.workspaceFolders?.length) {
            vscode.window.showErrorMessage('Open a G4 project folder before saving settings.');
            return;
        }

        // Hot-apply the settings so features like the recorders pick up the change without a
        // window reload; the file is written inside the apply flow, after its prompts.
        const applyOptions = {
            saveManifest: () => this.saveManifest(panel, manifest)
        };

        try {
            await vscode.commands.executeCommand('Apply-Settings', applyOptions);
        } catch (error) {
            vscode.window.showErrorMessage(`Could not apply G4 settings: ${Utilities.resolveErrorMessage(error)}`);
        }
    }

    /**
     * Renders the settings form from manifest.json on disk.
     *
     * @remarks
     * The form is filled from the file, not from the snapshot cached at activation, so a value
     * written by hand, by git or by Test Wright is shown and kept. When the file is missing or is
     * not valid JSON, the cached manifest (or the packaged defaults) is shown instead.
     *
     * @param panel - The settings tab to render.
     */
    private async setPanelHtml(panel: vscode.WebviewPanel): Promise<void> {
        // Read the file and remember its text, so Save can tell whether it changed meanwhile.
        const fileText = await ShowSettingsCommand.readManifestText();
        this._loadedFileText = fileText;

        // Parse the file; fall back to the cached manifest when it is missing or not valid JSON.
        let manifest: unknown = Utilities.getManifest();

        try {
            manifest = fileText === undefined ? manifest : JSON.parse(fileText);
        } catch {
            manifest = Utilities.getManifest();
        }

        // Build the page HTML around the manifest and inject the shims.
        let html = await ShowSettingsCommand.setHtml(panel, this.context, manifest);
        html = html.replace(/<\/head>/i, ShowSettingsCommand.getHeaderShim() + '</head>');
        html = html.replace(/<\/body>/i, ShowSettingsCommand.getBodyShim() + '</body>');

        // Render the final HTML inside the webview.
        panel.webview.html = html;
    }

    // Builds the settings webview HTML and injects the manifest and component URIs into it.
    private static async setHtml(
        panel: vscode.WebviewPanel,
        context: vscode.ExtensionContext,
        manifest: unknown): Promise<string> {

        // Get the URI for the settings component stylesheet.
        const styleUri = panel.webview.asWebviewUri(
            vscode.Uri.joinPath(
                context.extensionUri,
                'resources.components',
                'automation-settings',
                'automation-settings.css'
            )
        );

        // Get the URI for the settings component script.
        const scriptUri = panel.webview.asWebviewUri(
            vscode.Uri.joinPath(
                context.extensionUri,
                'resources.components',
                'automation-settings',
                'automation-settings.js'
            )
        );

        // Serialize the manifest for the #g4-data textarea. A textarea decodes character references
        // and ends at </textarea>, so `<` and `&` are written as JSON unicode escapes, which
        // JSON.parse restores unchanged. Keep the escaped backslashes: String.raw`<` is decoded
        // to '<' by the TypeScript compiler, which would silently disable this escaping.
        const manifestJson = JSON.stringify(manifest, null, 4)
            .replaceAll('<', '\\u003c') // NOSONAR
            .replaceAll('&', '\\u0026'); // NOSONAR

        // Load the settings component HTML template and fill in the reusable components it uses,
        // before the manifest is injected, so the manifest is never searched for placeholders.
        const html = WebviewComponents.setComponentHtml({
            html: Utilities.getResource('resources.components/automation-settings/automation-settings.html'),
            rootPath: vscode.Uri.joinPath(context.extensionUri, 'resources.components').fsPath,
            toUri: (filePath) => panel.webview.asWebviewUri(vscode.Uri.file(filePath)).toString()
        });

        // Inject the manifest data and font URI into the HTML template and return it.
        // The manifest is supplied through a replacer function so any literal `$`
        // in the JSON (for example inside a token) is never treated as a special
        // replacement token (e.g. `$&` or `$1`).
        return html
            .replace('{{$ settings.data }}', () => manifestJson)
            .replace('{{$ component.style.uri }}', styleUri.toString())
            .replace('{{$ component.script.uri }}', scriptUri.toString());
    }

    /**
     * Reports a change to manifest.json made outside the open settings tab.
     *
     * @remarks
     * A write by this tab is recognised by its text and ignored. Any other change offers to reload
     * the form; ignoring the notice is safe, because Save asks again before overwriting.
     *
     * @param panel - The open settings tab.
     */
    private async showManifestChanged(panel: vscode.WebviewPanel): Promise<void> {
        // Ignore this tab's own save, and a tab that was closed meanwhile.
        const fileText = await ShowSettingsCommand.readManifestText();

        if (fileText === this._loadedFileText || this._panel !== panel) {
            return;
        }

        // Offer to reload the form from the file.
        const choice = await vscode.window.showInformationMessage(
            'manifest.json changed outside the G4 Settings editor.',
            RELOAD_ACTION);

        if (choice === RELOAD_ACTION && this._panel === panel) {
            await this.setPanelHtml(panel);
        }
    }
}
