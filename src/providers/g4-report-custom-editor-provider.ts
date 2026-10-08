import * as path from 'node:path';
import * as vscode from 'vscode';
import { ShowReportCommand } from '../commands/show-report';
import { Utilities } from '../extensions/utilities';

// Strict Base64 alphabet with optional end padding; linear, no nested quantifiers.
const BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/;

/**
 * Opens saved G4 reports (.g4rpt files) in the report viewer.
 *
 * @remarks
 * A .g4rpt file holds the Base64 of the automation result JSON, as saved after a run. The viewer
 * renders it with the same page as the report shown after a run. VS Code keeps one editor per
 * file, so opening a report that is already open focuses its tab.
 */
export class G4ReportCustomEditorProvider implements vscode.CustomReadonlyEditorProvider {
    public static readonly VIEW_TYPE = 'g4.reportViewer';

    /**
     * Creates the provider with the extension context required to render report editors.
     *
     * @param _context - Extension context that owns provider registrations and resource roots.
     */
    constructor(private readonly _context: vscode.ExtensionContext) {
    }

    /**
     * Registers the custom editor and ties its disposal to the extension lifecycle.
     */
    public register(): void {
        // One viewer per report file; the tab keeps its state while hidden.
        const disposable = vscode.window.registerCustomEditorProvider(
            G4ReportCustomEditorProvider.VIEW_TYPE,
            this,
            {
                supportsMultipleEditorsPerDocument: false,
                webviewOptions: {
                    retainContextWhenHidden: true
                }
            }
        );

        // Dispose the provider automatically when the extension is deactivated.
        this._context.subscriptions.push(disposable);
    }

    /**
     * Opens a report file as a read-only document; the file is read when the editor is resolved.
     *
     * @param uri - Report file URI.
     * @returns A document that holds only the URI.
     */
    public openCustomDocument(uri: vscode.Uri): vscode.CustomDocument {
        return { uri, dispose: () => undefined };
    }

    /**
     * Renders a report file in the report viewer.
     *
     * @remarks
     * The editor pattern matches any reports folder, so a file outside `<workspace folder>/reports`
     * is returned to VS Code's default editor. A file that is not Base64 of a JSON document is
     * reported with a warning and its tab is closed.
     *
     * @param document - Report document selected for the custom editor.
     * @param webviewPanel - VS Code panel that hosts the report viewer.
     * @param _cancellationToken - Cancellation token supplied by the custom-editor contract.
     */
    public async resolveCustomEditor(
        document: vscode.CustomDocument,
        webviewPanel: vscode.WebviewPanel,
        _cancellationToken: vscode.CancellationToken
    ): Promise<void> {
        // Recover through the default editor for a .g4rpt file outside a root reports folder.
        if (!Utilities.testReportFile(document.uri)) {
            webviewPanel.dispose();
            await vscode.commands.executeCommand('vscode.openWith', document.uri, 'default');

            return;
        }

        // Read the payload; a file that cannot be shown closes its tab after the warning.
        const reportData = await G4ReportCustomEditorProvider.readReportData(document.uri);

        if (reportData === undefined) {
            webviewPanel.dispose();
            vscode.window.showWarningMessage(`${path.basename(document.uri.fsPath)} is not a readable G4 report.`);

            return;
        }

        // Allow the report component scripts, styles, and fonts, as the Show-Report tab does.
        webviewPanel.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                vscode.Uri.joinPath(this._context.extensionUri, 'resources.fonts'),
                vscode.Uri.joinPath(this._context.extensionUri, 'resources.components')
            ]
        };

        webviewPanel.webview.html = ShowReportCommand.newReportHtml(webviewPanel.webview, this._context, reportData);
    }

    /**
     * Reads a report file and returns its Base64 payload when it decodes to JSON.
     *
     * @param uri - Report file URI.
     * @returns The trimmed Base64 payload, or undefined when the file cannot be read or decoded.
     */
    private static async readReportData(uri: vscode.Uri): Promise<string | undefined> {
        try {
            const fileBytes = await vscode.workspace.fs.readFile(uri);
            const reportData = Buffer.from(fileBytes).toString('utf8').trim();

            if (!BASE64_PATTERN.test(reportData)) {
                return undefined;
            }

            // The viewer expects the automation result JSON; anything else would render empty.
            JSON.parse(Utilities.convertFromBase64(reportData));

            return reportData;
        } catch {
            return undefined;
        }
    }
}
