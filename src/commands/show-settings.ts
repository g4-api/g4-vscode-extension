/*
 * RESOURCES
 * https://code.visualstudio.com/api/references/commands
 */
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { CommandBase } from './command-base';
import { Utilities } from '../extensions/utilities';

/**
 * Command to create a new project structure in VS Code.
 * This command scaffolds a basic project layout with folders, manifests, and sample files.
 */
export class ShowSettingsCommand extends CommandBase {
    /**
     * Creates a new Show Report command instance.
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
     * by calling `invokeCommand(args)`.
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

        // Store the command disposable in the extension context so VS Code
        // automatically disposes it when the extension is deactivated.
        this.context.subscriptions.push(command);
    }

    /**
     * Invokes the Show Settings command and opens the settings inside a VS Code webview.
     *
     * Behavior:
     * - Creates a new webview panel for displaying the settings.
     * - Loads the settings HTML from the extension resources.
     * - Injects the settings header shim before the closing </head> tag.
     * - Injects the settings body shim before the closing </body> tag.
     * - Assigns the final HTML to the webview panel.
     *
     * @returns A promise that resolves after the settings webview is created.
     */
    protected async onInvokeCommand(): Promise<any> {
        // Create a new VS Code webview panel for displaying the G4 settings.
        const panel = vscode.window.createWebviewPanel(
            // Internal webview type identifier.
            'g4-settings',

            'G4 Settings',

            // Open the settings in the first editor column.
            vscode.ViewColumn.One,
            {
                // Allow scripts to run inside the settings webview.
                enableScripts: true,

                // Keep the webview state alive when the tab is hidden.
                retainContextWhenHidden: true
            }
        );

        // Build the HTML shim injected into the settings <head>.
        const headerShim = ShowSettingsCommand.getHeaderShim();

        // Build the HTML shim injected into the settings <body>.
        const bodyShim = ShowSettingsCommand.getBodyShim();

        // Resolve the settings HTML from the command arguments.
        let html = await ShowSettingsCommand.setHtml(panel, this.context);

        // Inject header dependencies before the closing </head> tag.
        html = html.replace(/<\/head>/i, headerShim + '</head>');

        // Inject body dependencies before the closing </body> tag.
        html = html.replace(/<\/body>/i, bodyShim + '</body>');

        // Render the final HTML inside the webview.
        panel.webview.html = html;

        // Handle messages posted from the settings webview.
        panel.webview.onDidReceiveMessage(
            async (message) => {
                // Open external links (e.g. the Capabilities page) in the
                // computer's default browser rather than inside VS Code.
                if (message?.command === 'openExternal' && message.url) {
                    await vscode.env.openExternal(vscode.Uri.parse(message.url));
                }

                // Handle settings save messages posted from the webview.
                if (message?.command === 'saveSettings' && message.manifest !== undefined) {
                    // A save needs an open workspace to resolve the manifest path.
                    if (!vscode.workspace.workspaceFolders?.length) {
                        vscode.window.showErrorMessage('Open a G4 project folder before saving settings.');
                        return;
                    }

                    // Resolve the target manifest path for the current workspace.
                    const manifestUri = Utilities.resolveManifestUri();

                    try {
                        // Serialize with the same 4-space indent used when reading/injecting it.
                        const json = JSON.stringify(message.manifest, null, 4);

                        // Ensure the parent folder (e.g. src/) exists, then overwrite the manifest.
                        await fs.mkdir(path.dirname(manifestUri), { recursive: true });
                        await fs.writeFile(manifestUri, json + '\n', 'utf8');

                        // Confirm the save to the user.
                        vscode.window.showInformationMessage('G4 settings saved.');
                    } catch (error: any) {
                        // Surface any write failure (permissions, disk, etc.).
                        vscode.window.showErrorMessage(`Could not save G4 settings: ${error?.message ?? error}`);
                    }
                }
            },
            undefined,
            this.context.subscriptions
        );
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

    // Builds the settings webview HTML and injects the font URI into it.
    private static async setHtml(panel: vscode.WebviewPanel, context: vscode.ExtensionContext): Promise<string> {

        // Get the URI for the Inter font included in the extension resources.
        const fontUri = panel.webview.asWebviewUri(
            vscode.Uri.joinPath(
                context.extensionUri,
                'fonts',
                'inter-variable.ttf'
            )
        );

        // Load the current extension manifest.
        const manifest = Utilities.getManifest();

        // Serialize the manifest to a formatted JSON string for injection into the settings HTML.
        const manifestJson = JSON.stringify(manifest, null, 4);

        // Load the settings HTML template from the extension resources.
        const html = Utilities.getResource('g4-settings.html');

        // Inject the manifest data and font URI into the HTML template and return it.
        // The manifest is supplied through a replacer function so any literal `$`
        // in the JSON (for example inside a token) is never treated as a special
        // replacement token (e.g. `$&` or `$1`).
        return html
            .replace('{{$ settings.data }}', () => manifestJson)
            .replace('{{$ fonts.uri }}', fontUri.toString());
    }
}
