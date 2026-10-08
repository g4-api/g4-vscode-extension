/*
 * RESOURCES
 * https://code.visualstudio.com/api/references/commands
 */
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { CommandBase } from './command-base';
import { Utilities } from '../extensions/utilities';
import { WebviewComponents } from '../extensions/webview-components';

/**
 * Command responsible for opening and displaying a G4 report.
 *
 * This command is registered under `Show-Report` and can be invoked
 * programmatically by other extension components, such as a webview message
 * handler after a workflow execution completes.
 */
export class ShowReportCommand extends CommandBase {

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
        this.command = 'Show-Report';
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
            async (args) => {
                await this.invokeCommand(args);
            }
        );

        // Store the command disposable in the extension context so VS Code
        // automatically disposes it when the extension is deactivated.
        this.context.subscriptions.push(command);
    }

    /**
     * Invokes the Show Report command and opens the report inside a VS Code webview.
     *
     * Behavior:
     * - Creates a new webview panel for displaying the report.
     * - Loads the report HTML from the provided command arguments.
     * - Injects the report header shim before the closing </head> tag.
     * - Injects the report body shim before the closing </body> tag.
     * - Assigns the final HTML to the webview panel.
     *
     * @param args - Command arguments used to identify and render the report.
     * @returns A promise that resolves after the report webview is created.
     */
    protected async onInvokeCommand(args: any): Promise<any> {
        // Create a new VS Code webview panel for displaying the G4 report.
        const panel = vscode.window.createWebviewPanel(
            // Internal webview type identifier.
            'g4-report',

            // Use the report id as the tab title when available,
            // otherwise fall back to a default title.
            args?.id?.replace('.g4rpt', '') || 'G4 Report',

            // Open the report in the first editor column.
            vscode.ViewColumn.One,
            {
                // Allow scripts to run inside the report webview.
                enableScripts: true,

                // Allow the component CSS/JS and shared font resources to load.
                localResourceRoots: [
                    vscode.Uri.joinPath(this.context.extensionUri, 'resources.fonts'),
                    vscode.Uri.joinPath(this.context.extensionUri, 'resources.components')
                ],

                // Keep the webview state alive when the tab is hidden.
                retainContextWhenHidden: true
            }
        );

        // Resolve the Base64 report payload from the command arguments.
        const reportData = await ShowReportCommand.getReportData(args);

        // Render the final HTML inside the webview.
        panel.webview.html = ShowReportCommand.newReportHtml(panel.webview, this.context, reportData);
    }

    /**
     * Builds the report viewer HTML for one Base64 report payload.
     *
     * @remarks
     * Shared by this command (the report shown after a run) and the report custom editor (a saved
     * .g4rpt file), so both render the same page. The webview must allow scripts and the
     * `resources.components` and `resources.fonts` roots.
     *
     * @param webview - Webview that will host the report; used to resolve resource URIs.
     * @param context - The VS Code extension context.
     * @param reportData - Base64 of the automation result JSON.
     * @returns The complete report HTML, including the header and body shims.
     */
    public static newReportHtml(webview: vscode.Webview, context: vscode.ExtensionContext, reportData: string): string {
        // Get the URI for the report component stylesheet.
        const styleUri = webview.asWebviewUri(
            vscode.Uri.joinPath(
                context.extensionUri,
                'resources.components',
                'automation-report',
                'automation-report.css'
            )
        );

        // Get the URI for the report component script.
        const scriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(
                context.extensionUri,
                'resources.components',
                'automation-report',
                'automation-report.js'
            )
        );

        // Load the report component HTML template from the extension resources.
        const html = WebviewComponents.setComponentHtml({
            html: Utilities.getResource('resources.components/automation-report/automation-report.html'),
            rootPath: vscode.Uri.joinPath(context.extensionUri, 'resources.components').fsPath,
            toUri: (filePath) => webview.asWebviewUri(vscode.Uri.file(filePath)).toString()
        });

        // Inject the decoded report data and the component URIs into the HTML template.
        return html
            .replace('{{$ report.data }}', Utilities.convertFromBase64(reportData))
            .replace('{{$ component.style.uri }}', styleUri.toString())
            .replace('{{$ component.script.uri }}', scriptUri.toString())

            // Inject header dependencies before the closing </head> tag.
            .replace(/<\/head>/i, ShowReportCommand.getHeaderShim() + '</head>')

            // Inject body dependencies before the closing </body> tag.
            .replace(/<\/body>/i, ShowReportCommand.getBodyShim() + '</body>');
    }

    // Builds the HTML shim injected into the report document <head>.
    private static getHeaderShim(): string {
        // Placeholder for future head-level report scripts/styles.
        return `
        <script></script>`;
    }

    // Builds the HTML shim injected into the report document <body>.
    private static getBodyShim(): string {
        // Placeholder for future body-level report scripts/markup.
        return `
        <script></script>`;
    }

    // Resolves the Base64 report payload from the command arguments: a report file path, a Base64
    // string, or "e30=" (Base64 for "{}") when neither is given.
    private static async getReportData(args: any): Promise<string> {
        // Checks whether the provided value is a valid Base64 string.
        //
        // Behavior:
        // - Rejects empty or non-string values.
        // - Requires the Base64 length to be divisible by 4.
        // - Validates the string against a strict Base64 pattern.
        // - Performs a decode/re-encode check to ensure the value is actually valid Base64.
        const assertBase64 = (value: string): boolean => {
            // Base64 input must be a non-empty string.
            if (!value || typeof value !== 'string') {
                return false;
            }

            // Strict Base64 strings must have a length divisible by 4.
            if (value.length % 4 !== 0) {
                return false;
            }

            // Validate the Base64 structure:
            // - Uses A-Z, a-z, 0-9, +, and / characters.
            // - Allows optional padding at the end using = or ==.
            // - Does not allow invalid padding in the middle of the string.
            const base64Regex =
                /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

            // Reject values that do not match the strict Base64 format.
            if (!base64Regex.test(value)) {
                return false;
            }

            try {
                // Decode and re-encode the value.
                // If the result matches the original string, the Base64 value is valid
                // and uses the expected canonical representation.
                return Buffer
                    .from(value, 'base64')
                    .toString('base64') === value;

            } catch {
                // Treat decoding failures as invalid Base64.
                return false;
            }
        };

        // Checks whether a file or path exists and is accessible.
        //
        // Behavior:
        // - Attempts to access the provided file path.
        // - Returns true when the path exists and can be accessed.
        // - Returns false when the path does not exist or access fails.
        const assertFile = async (filePath: string): Promise<boolean> => {
            try {
                // Try to access the file path using the file system API.
                await fs.access(filePath);

                // Access succeeded, so the file/path exists and is reachable.
                return true;
            } catch {
                // Access failed, which usually means the file does not exist
                // or the current process does not have permission to access it.
                return false;
            }
        };

        // Reads a file from a file system path and returns its content.
        //
        // Behavior:
        // - Converts the path into a VS Code file URI. Uri.parse would read a Windows path such as
        //   "E:\reports\a.g4rpt" as scheme "e", so the path is converted with Uri.file.
        // - Reads the file content using the VS Code workspace file system API.
        // - Converts the file bytes into UTF-8 text.
        // - Returns the file name and content when successful.
        // - Returns an error message when the file cannot be read.
        const readFile = async (
            filePath: string
        ): Promise<{ fileName?: string; error?: string; content?: string }> => {
            try {
                // Convert the path (already confirmed to exist by assertFile) into a file URI.
                const fileUri = vscode.Uri.file(filePath);

                // Read the file as raw bytes from the workspace file system.
                const fileBytes = await vscode.workspace.fs.readFile(fileUri);

                // Convert the raw bytes into UTF-8 text.
                const text = Buffer.from(fileBytes).toString('utf8');

                // Extract a simple file name for display or import metadata.
                const fileName = path.basename(fileUri.fsPath);

                // Return the imported file data.
                return {
                    fileName,
                    content: text
                };
            } catch (err: any) {
                // Return the error instead of throwing so the caller can send it
                // back to the webview in a controlled payload.
                return {
                    error: `Could not read file: ${err.message}`
                };
            }
        };

        // Resolve the incoming report content.
        // Default value "e30=" is Base64 for "{}".
        const content = args?.content || 'e30=';

        // Stores the report payload as Base64 until it is decoded later.
        // Default value "e30=" keeps the report data as an empty JSON object.
        let reportData = 'e30=';

        // If the content points to an existing file, read the report data from disk.
        if (await assertFile(content)) {
            // Read the file and use its content as the report payload.
            // If reading succeeds but no content is returned, fall back to "{}".
            reportData = (await readFile(content)).content || 'e30=';
        }

        // If the content is not a file but is valid Base64,
        // use it directly as the report payload.
        else if (assertBase64(content)) {
            reportData = content;
        }

        return reportData;
    }
}
