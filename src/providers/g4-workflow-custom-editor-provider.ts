import * as path from 'node:path';
import * as vscode from 'vscode';
import { ShowWorkflowCommand } from '../commands/show-workflow';

/**
 * Opens G4 bot workflow files directly in the workflow canvas.
 *
 * @remarks
 * The canvas edits the bot's TextDocument: every designer edit is written into the document with
 * a WorkspaceEdit, so the tab shows unsaved changes, Undo and Redo work, and Save writes the file.
 * A change to the document from anywhere else (Undo, the text editor, git) is loaded back into
 * the canvas.
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
     * documents delegate rendering to ShowWorkflowCommand so file-open behavior stays shared; the
     * canvas starts from the document text and stays in sync with the document.
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

        // Keep the canvas and the document in sync before the canvas loads, so no edit is missed.
        this.connectDocument(document, webviewPanel);

        // Reuse the command's import and rendering flow so custom-editor and command opens match;
        // the canvas starts from the document text, which may hold unsaved edits.
        const command = new ShowWorkflowCommand(this._context, this._baseUrl);
        await command.renderWorkflowWebview(webviewPanel, {
            fileUri: document.uri.toString(),
            getContent: () => document.getText()
        });
    }

    /**
     * Builds the document text for an automation reported by the canvas.
     *
     * @remarks
     * Compute-only. The automation is laid over the document's current JSON, so top-level fields
     * the canvas does not model are kept in place; a field the canvas removed (undefined) is
     * dropped by serialization. The text keeps a 4-space indent, the document's line ending, and
     * its trailing newline.
     *
     * @param document - The bot document.
     * @param automation - The automation built by the canvas.
     * @returns The new document text.
     */
    private static newDocumentText(document: vscode.TextDocument, automation: Record<string, unknown>): string {
        // Start from the document's JSON; a document that does not parse is replaced as a whole.
        const documentText = document.getText();
        let documentJson: Record<string, unknown> = {};

        try {
            const parsed: unknown = JSON.parse(documentText);
            const isObject = parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed);

            documentJson = isObject ? parsed as Record<string, unknown> : {};
        } catch {
            documentJson = {};
        }

        // Serialize the merged automation in the document's own layout.
        const lineEnding = document.eol === vscode.EndOfLine.CRLF ? '\r\n' : '\n';
        const json = JSON.stringify({ ...documentJson, ...automation }, null, 4).replaceAll('\n', lineEnding);
        const trailingNewLine = documentText.endsWith('\n') ? lineEnding : '';

        return json + trailingNewLine;
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

    /**
     * Connects the canvas and the bot document in both directions for the lifetime of the panel.
     *
     * @remarks
     * Owns two subscriptions, disposed with the panel. A canvas edit is applied to the document as
     * one WorkspaceEdit (one Undo step). A document change that is not that edit (Undo, Redo, the
     * text editor, git) is posted back to the canvas as an import. The text of the last applied
     * edit tells the two apart, so the canvas never re-imports its own edit.
     *
     * @param document - The bot document.
     * @param webviewPanel - The panel that hosts the canvas.
     */
    private connectDocument(document: vscode.TextDocument, webviewPanel: vscode.WebviewPanel): void {
        // Text of the last canvas edit written into the document.
        let lastAppliedText: string | undefined;

        // Write each canvas edit into the document, so the tab becomes dirty and Save writes it.
        const onCanvasMessage = webviewPanel.webview.onDidReceiveMessage(async (message) => {
            const automation: unknown = message?.type === 'workflow:changed' ? message.payload?.automation : undefined;
            const isAutomation = automation !== null && typeof automation === 'object' && !Array.isArray(automation);

            if (!isAutomation) {
                return;
            }

            // Skip an edit that leaves the document text as it is.
            const text = G4WorkflowCustomEditorProvider.newDocumentText(document, automation as Record<string, unknown>);

            if (text === document.getText()) {
                return;
            }

            // Replace the whole document in one edit, remembering the text so its change event is ignored.
            lastAppliedText = text;

            const edit = new vscode.WorkspaceEdit();
            const fullRange = new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length));

            edit.replace(document.uri, fullRange, text);
            await vscode.workspace.applyEdit(edit);
        });

        // Load any other change of the document back into the canvas.
        const onDocumentChange = vscode.workspace.onDidChangeTextDocument((event) => {
            const isThisDocument = event.document.uri.toString() === document.uri.toString();

            if (!isThisDocument || event.contentChanges.length === 0 || document.getText() === lastAppliedText) {
                return;
            }

            // The canvas now shows the document again, so the next canvas edit starts from it.
            lastAppliedText = undefined;

            void webviewPanel.webview.postMessage({
                type: 'workflow:import',
                payload: {
                    fileName: path.basename(document.uri.fsPath),
                    content: document.getText()
                }
            });
        });

        // Release both subscriptions when the panel closes.
        webviewPanel.onDidDispose(() => {
            onCanvasMessage.dispose();
            onDocumentChange.dispose();
        });
    }
}
