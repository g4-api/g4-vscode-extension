import * as path from 'node:path';
import * as vscode from 'vscode';
import { ShowWorkflowCommand } from '../commands/show-workflow';

/**
 * Opens G4 bot workflow files directly in the workflow canvas.
 */
export class G4WorkflowCustomEditorProvider implements vscode.CustomTextEditorProvider {
    public static readonly VIEW_TYPE = 'g4.workflowEditor';
    private static readonly _supportedExtensions = new Set(['.g4', '.g4bot']);

    /**
     * Creates the provider with the extension services required to render workflow editors.
     *
     * @param _context - Extension context that owns provider registrations and disposables.
     * @param _baseUrl - Base URL used by the workflow command when rendering webview resources.
     *
     * @remarks
     * The provider keeps explicit extension context because registration and workflow rendering
     * both have lifecycle side effects owned by the extension.
     */
    constructor(
        private readonly _context: vscode.ExtensionContext,
        private readonly _baseUrl: string
    ) {
    }

    /**
     * Registers the custom editor and ties its disposal to the extension lifecycle.
     */
    public register(): void {
        // Register one workflow canvas per document so VS Code owns editor activation and reuse.
        const disposable = vscode.window.registerCustomEditorProvider(
            G4WorkflowCustomEditorProvider.VIEW_TYPE,
            this,
            {
                supportsMultipleEditorsPerDocument: false
            }
        );

        // Dispose the provider automatically when the extension is deactivated.
        this._context.subscriptions.push(disposable);
    }

    /**
     * Renders a supported bot file in the workflow canvas.
     *
     * @param document - Text document selected for the custom editor.
     * @param webviewPanel - VS Code panel that hosts the workflow canvas.
     * @param _cancellationToken - Cancellation token supplied by the custom-editor contract.
     *
     * @remarks
     * Unsupported documents are defensively returned to VS Code's default editor. Supported
     * documents delegate rendering to ShowWorkflowCommand so file-open behavior stays shared.
     */
    public async resolveCustomTextEditor(
        document: vscode.TextDocument,
        webviewPanel: vscode.WebviewPanel,
        _cancellationToken: vscode.CancellationToken
    ): Promise<void> {
        // Recover through the default editor if VS Code invokes this provider for an invalid file.
        if (!G4WorkflowCustomEditorProvider.testBotWorkflowFile(document.uri)) {
            webviewPanel.dispose();
            await vscode.commands.executeCommand('vscode.openWith', document.uri, 'default');

            return;
        }

        // Reuse the command's import and rendering flow so custom-editor and command opens match.
        const command = new ShowWorkflowCommand(this._context, this._baseUrl);
        await command.renderWorkflowWebview(webviewPanel, {
            fileUri: document.uri.toString()
        });
    }

    /**
     * Tests whether a URI is a supported workflow file inside a workspace bots folder.
     *
     * @param uri - Candidate document URI.
     * @returns True when the URI is a local .g4 or .g4bot file under a bots path segment.
     *
     * @remarks
     * This is compute-only path validation. It reads the current workspace folders but does not
     * mutate editor or extension state.
     */
    private static testBotWorkflowFile(uri: vscode.Uri): boolean {
        const isFileScheme = uri.scheme === 'file';
        const fileExtension = path.extname(uri.fsPath).toLowerCase();
        const isSupportedExtension = this._supportedExtensions.has(fileExtension);

        if (!isFileScheme || !isSupportedExtension) {
            return false;
        }

        // Evaluate every workspace root because multi-root workspaces may contain separate bots trees.
        const workspaceFolders = vscode.workspace.workspaceFolders ?? [];

        return workspaceFolders.some(workspaceFolder => {
            const relativePath = path.relative(workspaceFolder.uri.fsPath, uri.fsPath);
            const isEmptyRelativePath = relativePath.length === 0;
            const isParentDirectory = relativePath === '..';
            const isNestedOutsideWorkspace = relativePath.startsWith(`..${path.sep}`);
            const isAbsolutePath = path.isAbsolute(relativePath);
            const isOutsideWorkspace =
                isEmptyRelativePath ||
                isParentDirectory ||
                isNestedOutsideWorkspace ||
                isAbsolutePath;

            if (isOutsideWorkspace) {
                return false;
            }

            // Require a complete path segment so similarly named folders cannot claim the editor.
            const pathSegments = relativePath.split(/[\\/]+/);
            const isInsideBotsFolder = pathSegments.some(
                pathSegment => pathSegment.toLowerCase() === 'bots'
            );

            return isInsideBotsFolder;
        });
    }
}
