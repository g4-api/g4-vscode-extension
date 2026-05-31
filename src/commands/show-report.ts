/*
 * RESOURCES
 * https://code.visualstudio.com/api/references/commands
 */
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { CommandBase } from './command-base';
import { Logger } from '../logging/logger';
import { Utilities } from '../extensions/utilities';

/**
 * Command to create a new project structure in VS Code.
 * This command scaffolds a basic project layout with folders, manifests, and sample files.
 */
export class ShowReportCommand extends CommandBase {
    // Logger instance scoped to this command
    // This allows us to log messages specific to the New Project command
    private readonly _logger: Logger;

    private readonly _baseUrl: string;

    constructor(context: vscode.ExtensionContext, baseUrl: string) {
        // Invoke the base constructor to set up shared properties
        // (logger, client, context, manifest, etc.)
        super(context);

        // Create a child logger scoped to this command for clearer log output
        this._logger = this.logger?.newLogger('G4.ShowReportCommand');

        // Set the base URL for API calls, defaulting to localhost if not provided
        this._baseUrl = baseUrl;

        // Set the command identifier that will be used when registering
        // and invoking this command in the extension
        this.command = 'Show-Report';
    }

    protected async onRegister(args?: any): Promise<any> {
        // Register the command identifier; when the user runs it, invoke our command pipeline
        let command = vscode.commands.registerCommand(
            this.command,
            async (args) => {
                await this.invokeCommand(args);
            }
        );

        // Add the registration disposable to the extension context so VS Code cleans it up automatically
        this.context.subscriptions.push(command);
    }

    protected async onInvokeCommand(args: any): Promise<any> {
        const readFile = async (panel: vscode.WebviewPanel, uri: string) => {
            try {
                // Decode and parse the incoming URI (handles percent-encoded characters)
                const fileUri = vscode.Uri.parse(uri);

                // Read raw bytes from the workspace file system
                const fileBytes = await vscode.workspace.fs.readFile(fileUri);

                // Convert raw bytes to UTF-8 text for non-notebook files
                const text = Buffer.from(fileBytes).toString('utf8');

                // Derive a simple filename for display in the webview
                const fileName = path.basename(fileUri.fsPath);

                // Send the file name and content back to the webview for import
                panel.webview.postMessage({
                    type: 'report:open',
                    payload: {
                        fileName: fileName,
                        content: text
                    }
                });
            } catch (err: any) {
                this._logger.error(`Failed to read ${uri}: ${err}`);
                panel.webview.postMessage({
                    type: 'report:open',
                    payload: {
                        error: `Could not read file: ${err.message}`
                    }
                });
            }
        };

        const newReport = async (autoView: boolean, message: any) => {
            const automationResultBase64 = message.payload;
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

            if (!workspaceFolder) {
                vscode.window.showErrorMessage(
                    'No workspace folder is open. Please open a folder before saving workflow reports.'
                );

                return;
            }

            const reportsFolder = path.join(workspaceFolder, 'reports');
            const reportFileName = "";
            const reportFilePath = path.join(reportsFolder, reportFileName);

            // Creates <current-workspace>/reports if it does not exist.
            await fs.mkdir(reportsFolder, { recursive: true });

            await fs.writeFile(
                reportFilePath,
                automationResultBase64,
                'utf8'
            );

            if (!autoView) {
                return;
            }

            // Open webview to display the report
        };

        const panel = vscode.window.createWebviewPanel(
            'g4-report',
            'G4 Report',
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );

        const headerShim = ShowReportCommand.getHeaderShim();
        const bodyShim = ShowReportCommand.getBodyShim();

        let html = ShowReportCommand.setHtml(args);
        html = html.replace(/<\/head>/i, headerShim + '</head>');
        html = html.replace(/<\/body>/i, bodyShim + '</body>');

        panel.webview.onDidReceiveMessage(async message => {
            if (message.type === 'report:open') {
                const a = "stop here";
            }
        });

        panel.webview.html = html;
    }

    private static getHeaderShim(): string {
        return `
        <script></script>`;
    }

    private static getBodyShim(): string {
        // Use a template string to return the entire <script> block
        return `
        <script></script>`;
    }

    private static setHtml(args: any): string {
        const html =Utilities.getResource('g4-report.html');

        // TODO: We can use the args to customize the HTML content before returning it

        return  html;
    }
}
