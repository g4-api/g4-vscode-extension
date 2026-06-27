import * as path from 'node:path';
import * as vscode from 'vscode';
import { ShowWorkflowCommand } from '../commands/show-workflow';

/**
 * Opens G4 bot workflow files directly in the workflow canvas.
 */
export class G4WorkflowCustomEditorProvider implements vscode.CustomTextEditorProvider {
    public static readonly VIEW_TYPE = 'g4.workflowEditor';

    constructor(
        private readonly _context: vscode.ExtensionContext,
        private readonly _baseUri: string
    ) { }

    public async resolveCustomTextEditor(
        document: vscode.TextDocument,
        webviewPanel: vscode.WebviewPanel,
        _token: vscode.CancellationToken
    ): Promise<void> {
        if (!G4WorkflowCustomEditorProvider.isBotWorkflowFile(document.uri)) {
            webviewPanel.dispose();
            await vscode.commands.executeCommand('vscode.openWith', document.uri, 'default');
            return;
        }

        const command = new ShowWorkflowCommand(this._context, this._baseUri);
        await command.renderWorkflowWebview(webviewPanel, {
            fileUri: document.uri.toString()
        });
    }

    public register(): void {
        const disposable = vscode.window.registerCustomEditorProvider(
            G4WorkflowCustomEditorProvider.VIEW_TYPE,
            this,
            {
                supportsMultipleEditorsPerDocument: false
            }
        );

        this._context.subscriptions.push(disposable);
    }

    private static isBotWorkflowFile(uri: vscode.Uri): boolean {
        const supportedExtensions = new Set(['.g4', '.g4bot']);
        if (uri.scheme !== 'file' || !supportedExtensions.has(path.extname(uri.fsPath).toLowerCase())) {
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
    }
}
