import * as vscode from 'vscode';
import { Logger } from '../logging/logger';
import { ExtensionLogger } from '../logging/extensions-logger';
import { Channels } from '../constants/channels';

/**
 * Notebook serializer that reads and writes a single file combining Markdown and JSON.
 * Splits the notebook content at a configurable token to separate markdown from JSON.
 */
export class MdJsonNotebookProvider implements vscode.NotebookSerializer {
    /** Logger scoped to this command for detailed diagnostics */
    private readonly _logger: Logger;

    /**
     * Token that delimits the Markdown and JSON sections in the file.
     * Uses a line-based separator to ensure clean splits: '\n---\n'.
     */
    public static readonly SPLIT_TOKEN: string = '\n---\n';

    /**
     * The type identifier for this notebook provider.
     * Used to register the provider with VS Code.
     */
    public static readonly NOTEBOOK_TYPE: string = 'G4.MdJsonNotebook';

    /**
     * Constructor for the MdJsonNotebookProvider.
     * Initializes the provider with an extension context.
     * 
     * @param _context Extension context for storing state or accessing resources.
     * @param _baseUrl Base URL for the SignalR hub, used to connect and send automation data.
     */
    constructor(
        private readonly _context: vscode.ExtensionContext,
        private readonly _baseUrl: string
    ) {
        // Create a dedicated logger for this command
        this._logger = new ExtensionLogger(Channels.extension, 'Notebook').newLogger('Notebook');
    }

    /**
     * Registers this notebook provider with VS Code.
     * This method is called during extension activation to register the provider.
     */
    public register(): void {
        // Register the notebook serializer for our custom MD/JSON notebook type,
        // so VS Code knows how to load and save `.mdjson` notebooks using this provider.
        vscode.workspace.registerNotebookSerializer(MdJsonNotebookProvider.NOTEBOOK_TYPE, this);

        // Create a notebook controller (“kernel”) that appears in the toolbar
        // for any notebook of our custom type. The ID must be unique,
        // and the human‑friendly label is shown in the UI.
        const controller = vscode.notebooks.createNotebookController(
            'mdjson-controller',                          // unique id
            MdJsonNotebookProvider.NOTEBOOK_TYPE,         // matches contributes.notebooks
            'G4 Markdown/JSON Notebook'                   // UI label
        );

        // Only JSON cells are supported by this controller,
        // and we enable execution order to display a run count.
        controller.supportedLanguages = ['json'];
        controller.supportsExecutionOrder = true;

        // Hook into the Run/Run Cell/Run All actions for this controller.
        // VS Code calls this whenever the user executes cells.
        controller.executeHandler = async (cells, _notebook, controller) => {
            for (const cell of cells) {
                // Create the execution UI element (spinner in the gutter).
                const invoker = controller.createNotebookCellExecution(cell);
                invoker.start(Date.now());

                try {
                    // Read the cell’s text and parse it as JSON
                    const automationData = JSON.parse(cell.document.getText());

                    // Dispatch to our own command, passing the parsed JSON
                    await vscode.commands.executeCommand(
                        'Start-Automation',
                        { automationData: automationData }
                    );

                    // Mark the cell execution as successful
                    invoker.end(true, Date.now());
                } catch (e) {
                    // Log any errors that occur and mark execution as failed
                    this._logger.error(`Failed to invoke automation`, "error", e as Error);
                    invoker.end(false, Date.now());
                }
            }
        };

        // Ensure the controller is disposed when the extension deactivates
        this._context?.subscriptions.push(controller);
    }

    /**
     * Deserialize the raw file bytes into VS Code notebook cells.
     * 
     * @param content The raw Uint8Array of file content.
     * 
     * @returns A NotebookData object containing two cells: markdown and JSON.
     */
    deserializeNotebook(content: Uint8Array): vscode.NotebookData {
        try {
            // Decode the raw bytes into a UTF-8 string
            const text = new TextDecoder().decode(content);

            // Find the index of the split token to separate sections
            const i = text.indexOf(MdJsonNotebookProvider.SPLIT_TOKEN);

            // If token found, split into markdown and JSON parts, else treat entire text as markdown
            const mdPart = i >= 0
                ? text.substring(0, i)
                : text;

            const jsPart = i >= 0
                ? text.substring(i + MdJsonNotebookProvider.SPLIT_TOKEN.length)
                : '';

            // Create notebook cells: first markdown, then JSON code
            const cells: vscode.NotebookCellData[] = [
                {
                    kind: vscode.NotebookCellKind.Markup,
                    languageId: 'markdown',
                    value: mdPart
                },
                {
                    kind: vscode.NotebookCellKind.Code,
                    languageId: 'json',
                    value: jsPart
                }
            ];

            // Return the NotebookData object with the cells
            // Note: Cells are always returned in the order they were added
            //       so the first cell is markdown and the second is JSON.
            return new vscode.NotebookData(cells);
            // On error, return an empty notebook to prevent VS Code error popups
        } catch (e) {
            console.error(e);
            return {
                cells: []
            };
        }
    }

    /** 
     * Serialize the notebook cells back into a single file combining markdown and JSON.
     * 
     * @param data The NotebookData object containing markdown and JSON cells.
     * 
     * @returns A Uint8Array of the combined file content.
     */
    serializeNotebook(data: vscode.NotebookData): Uint8Array {
        try {
            // Extract markdown and JSON cell values, defaulting to empty strings
            const md = data.cells[0]?.value ?? '';
            const js = data.cells[1]?.value ?? '';

            // Concatenate with the split token to reconstruct the file
            const text = `${md}${MdJsonNotebookProvider.SPLIT_TOKEN}${js}`;

            // Encode the final text into a Uint8Array for storage
            return new TextEncoder().encode(text);
            // Return an empty file on failure
        } catch (e) {
            console.error('serializeNotebook failed:', e);
            return new TextEncoder().encode('');
        }
    }
}
