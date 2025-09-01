import path = require('path');
import * as vscode from 'vscode';
import { TreeItem } from '../components/tree-item';
import { Global } from '../constants/global';

/**
 * Event payload type for tree refreshes.
 *
 * VS Code expects either:
 *  - a specific element to refresh (re-render just that subtree), or
 *  - `undefined`/`null`/`void` to signal a full refresh from the root.
 *
 * Using a union keeps the emitter flexible and explicit.
 */
type TreeItemChangeEvent = TreeItem | undefined | null | void;

/**
 * Tree data provider for the "g4Documentations" view.
 *
 * Exposes the standard `onDidChangeTreeData` event so the view can be refreshed,
 * and holds onto the extension context for lifecycle/disposables.
 */
export class DocumentsTreeProvider implements vscode.TreeDataProvider<TreeItem> {
    // Extension context used to register disposables (commands, views, etc.).
    private readonly _context: vscode.ExtensionContext;

    // Internal event emitter used to signal that the tree's data has changed.
    // Consumers (the VS Code UI) subscribe via the public `onDidChangeTreeData` event.
    private readonly _onDidChangeTreeData: vscode.EventEmitter<TreeItemChangeEvent> =
        new vscode.EventEmitter<TreeItemChangeEvent>();

    // Public event VS Code listens to in order to re-query and re-render the tree.
    public readonly onDidChangeTreeData: vscode.Event<TreeItemChangeEvent> =
        this._onDidChangeTreeData.event;

    /**
     * Create a new provider instance.
     * @param context - VS Code extension context for resource management.
     */
    constructor(context: vscode.ExtensionContext) {
        // Keep context for registering disposables (tree view, commands, etc.).
        this._context = context;
    }

    /**
     * Provides children for a given tree element, or root items when no element is supplied.
     *
     * Behavior:
     * - If `element` is provided, returns its `children` (used by VS Code to expand nodes).
     * - If `element` is not provided, shows a progress indicator and builds the root items
     *   by calling `DocumentsTreeProvider.getTreeItems()`.
     *
     * Notes:
     * - The progress UI is associated with the `"rhinoDocumentation"` view via `location.viewId`.
     * - Resolving the promise with the result of `getTreeItems()` is safe even though it returns
     *   a Promise; the outer promise will adopt/await it.
     *
     * @param element - The parent node whose children are requested; `undefined` when roots are requested.
     * @returns A list of `TreeItem` children, or a promise that resolves to them.
     */
    public getChildren(element?: TreeItem | undefined): vscode.ProviderResult<TreeItem[]> {
        // If VS Code asks for the children of a specific element, return them directly.
        if (element !== undefined) {
            return element?.children;
        }

        // Configure the progress indicator to appear in the target view.
        const options = { location: { viewId: "rhinoDocumentation" } };

        // Build and return the root items under a progress UI.
        return vscode.window.withProgress(options, () => {
            return new Promise<TreeItem[]>((resolve) => {
                // Build the root nodes (this function returns a Promise<TreeItem[]>).
                const data = DocumentsTreeProvider.getTreeItems();

                // Resolve with the result; resolving with a promise is OK (promise adoption).
                resolve(data);
            });
        });
    }

    /**
     * Returns the concrete `TreeItem` representation for a given element.
     *
     * VS Code calls this to render each node. Since `element` is already an instance
     * of your `TreeItem` (with label, icon, command, etc.), just return it as-is.
     * If you needed to compute properties dynamically, you could do so here
     * (and even return a `Promise<vscode.TreeItem>`).
     *
     * @param element - The logical node to render.
     * @returns The `TreeItem` (or a promise of one) that VS Code will display.
     */
    public getTreeItem(element: TreeItem): vscode.TreeItem | Thenable<vscode.TreeItem> {
        return element;
    }

    /**
     * Refreshes the entire tree view.
     *
     * Fires `onDidChangeTreeData` with `undefined`, which tells VS Code that the
     * whole tree has changed. VS Code will re-invoke `getChildren()` from the root.
     *
     * Note: If you ever need to refresh only a specific element instead of the
     * entire tree, you can fire the event with that element instead of `undefined`.
     */
    public refresh(): void {
        // Signal a full refresh (rebuild from root). Passing `undefined` is the
        // VS Code convention for “everything has changed”.
        this._onDidChangeTreeData.fire(undefined);
    }

    /**
     * Registers the documents tree view and its related command(s) with VS Code.
     *
     * Side effects:
     * - Binds this instance as the data provider for the "g4Documentations" view.
     * - Registers the "Update-Documents" command (idempotently) to refresh the tree.
     * - Creates the actual TreeView instance and tracks it for automatic disposal.
     *
     * @returns {any} No explicit return value; registration is performed via side effects.
     */
    public register(): any {
        // Toggle a folder-like tree item's icon and state when it expands/collapses.
        const setFolderIcon = (item: TreeItem, expanded: boolean) => {
            // Augment the runtime object with an optional expansion marker we control.
            type FolderNode = TreeItem & { isExpanded?: boolean };

            // Cast the item to our augmented type.
            const node = item as FolderNode;

            // Record the current expansion state on the node (handy for later checks).
            node.isExpanded = expanded;

            // Keep VS Code's collapsible state aligned with our expansion flag.
            node.collapsibleState = expanded
                ? vscode.TreeItemCollapsibleState.Expanded
                : vscode.TreeItemCollapsibleState.Collapsed;

            // Use codicons for a consistent VS Code look:
            // - 'folder-opened' when expanded
            // - 'folder' when collapsed
            node.iconPath = new vscode.ThemeIcon(expanded ? 'folder-opened' : 'folder');

            // Notify the view that only this node changed; avoids recreating the whole tree.
            this._onDidChangeTreeData.fire(node);
        };

        // Tree view creation options: bind this provider and enable "Collapse All" in the UI.
        const options = {
            treeDataProvider: this,
            showCollapseAll: true,
        };

        // Ensure the view id "g4Documentations" is associated with this provider.
        vscode.window.registerTreeDataProvider('g4Documentations', this);

        // Register the refresh command once (avoid duplicate registrations across activations).
        vscode.commands.getCommands().then((commands) => {
            if (!commands.includes('Update-Documents')) {
                vscode.commands.registerCommand('Update-Documents', () => {
                    // Trigger a full tree refresh (fires onDidChangeTreeData).
                    this.refresh();
                });
            }
        });

        // Create the TreeView instance so it becomes visible/available in the Explorer.
        const tree = vscode.window.createTreeView('g4Documentations', options);

        // Track disposables to clean up automatically when the extension is deactivated.
        this._context.subscriptions.push(
            tree,
            tree.onDidExpandElement(e => setFolderIcon(e.element, true)),
            tree.onDidCollapseElement(e => setFolderIcon(e.element, false))
        );
    }

    // Build a tree of plugin types and populate each type with its plugin children.
    private static async getTreeItems(): Promise<any> {
        // Pull the latest cache snapshot from the client.
        const cache = await Global.g4Client.getCache();

        // Create the top-level "plugin type" nodes.
        // (Make sure your factory is actually named `getPluginsTypes` as used here.)
        const tree = this.getPluginsTypes(cache);

        // Hydrate each type with its plugin children.
        for (const pluginType of tree) {
            // Lookup all items under the current type (plugins + templates).
            const plugins = this.getPlugins(cache, (pluginType as any).data.key);

            // Treat the type node as a container that can hold children.
            const parent = pluginType as unknown as TreeItem & {
                children?: TreeItem[];
                data?: any;
            };

            // Ensure the children array exists.
            parent.children ??= [];

            // Attach only plugin items (not templates) as children.
            for (const childItem of plugins.plugins) {
                parent.children.push(childItem);
            }

            // If the parent now has children, make it expandable in the tree view.
            if (parent.children.length > 0) {
                parent.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
            }
        }

        // Return the fully hydrated roots.
        return tree;
    }

    // Build two lists of tree items (plugins & templates) for a given plugin `type` from the cache.
    private static getPlugins(cache: any, type: string): { plugins: any, templates: any } {
        // Convert a raw plugin entry into a VS Code `TreeItem`.
        const convertToTreeItem = (plugin: any) => {
            // Build a readable label: remove one '-' then add spaces before capitals; trim; fallback text.
            const label =
                plugin?.manifest?.key.replace(/(-)+/g, '').replace(/([A-Z])/g, ' $1').trim() ??
                'Unknown Plugin';

            // Create the tree item and allow an attached `data` payload for downstream use.
            const item = new TreeItem(label) as TreeItem & { data?: any };

            // Persist the minimal info we need later (manifest id + original document).
            item.data = {
                key: plugin?.manifest?.id,
                document: plugin?.document,
            };

            // Visual: show as a "file" node (codicon).
            item.iconPath = new vscode.ThemeIcon('file');

            // Return the prepared node.
            return item;
        };

        // Deduplicate and sort an array of TreeItems by their label.
        const sortPlugins = (items: (TreeItem & { data?: any })[]) => {
            // Use a Map keyed by a normalized label to remove duplicates.
            const map = new Map<string, TreeItem & { data?: any }>();

            for (const item of items) {
                // Normalize label for dedupe: ensure string, trim, lower-case.
                const label = (typeof item.label === 'string' ? item.label : '')?.trim().toLowerCase();

                // Keep the first item seen for this normalized label.
                if (!map.has(label)) {
                    map.set(label, item);
                }
            }

            // Convert back to an array and sort by the original (display) label A→Z.
            return Array.from(map.values()).sort((a, b) => {
                const aLabel = typeof a.label === 'string' ? a.label : '';
                const bLabel = typeof b.label === 'string' ? b.label : '';
                return aLabel.localeCompare(bLabel);
            });
        };

        // Guard: if the bucket is missing, return empty groups.
        // (Use hasOwnProperty for broad runtime compatibility.)
        if (!Object.hasOwn(cache, type)) {
            return {
                plugins: [],
                templates: []
            };
        }

        // Build plugin items (non-templates)
        const bucket = cache[type];
        const plugins = Object
            .values(bucket)
            .filter((i: any) => String(i?.manifest?.source).toUpperCase() !== 'TEMPLATE')
            .map(convertToTreeItem);

        // Build template items.
        const templates = Object
            .values(bucket)
            .filter((i: any) => String(i?.manifest?.source).toUpperCase() === 'TEMPLATE')
            .map(convertToTreeItem);

        // Normalize: distinct by label and sort A→Z.
        return {
            plugins: sortPlugins(plugins),
            templates: sortPlugins(templates)
        };
    }

    // Builds the top-level plugin-type nodes from the provided cache.
    private static getPluginsTypes(cache: any): (vscode.TreeItem & { data?: any })[] {
        // Convert each cache key into a TreeItem root node
        const roots = Object.keys(cache).map((key) => {
            // Human-friendly label: insert spaces before capitals and trim
            const label = key.replace(/([A-Z])/g, " $1").trim();

            // Create a TreeItem and allow attaching arbitrary `data`
            const item = new TreeItem(label) as vscode.TreeItem & { data?: any };

            // Keep original key for later use (e.g., fetching children)
            item.data = { key };

            // Use a folder icon to indicate this is a top-level bucket
            item.iconPath = new vscode.ThemeIcon("folder");

            return item;
        });

        // Sort roots by label (A→Z). If label isn’t a string, fall back to empty.
        return roots.sort((a, b) => {
            const aLabel = typeof a.label === "string" ? a.label : "";
            const bLabel = typeof b.label === "string" ? b.label : "";
            return aLabel.localeCompare(bLabel);
        });
    }
}
