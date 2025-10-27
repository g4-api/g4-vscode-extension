import * as vscode from 'vscode';

/**
 * Represents a tree item used in a VS Code TreeView.
 * 
 * This class extends {@link vscode.TreeItem} and allows you to define:
 * - A label (displayed in the tree)
 * - Optional icon (string path, URI, or theme-aware icon)
 * - Optional child items (for hierarchical structures)
 * - Optional command (executed when the item is clicked)
 * 
 * The collapsible state of the item is automatically inferred:
 * - `None` if no children are provided.
 * - `Collapsed` if the item contains child items.
 */
export class TreeItem extends vscode.TreeItem {
    /** Child items of this node (if any). */
    children: TreeItem[] | undefined;

    /** Optional VS Code command executed when this item is selected. */
    command?: vscode.Command;

    /**
     * Creates a new instance of a tree item.
     * 
     * @param label    - The display text of the item.
     * @param iconPath - Path or object representing the item's icon.
     *                   Accepts a string, URI, or a light/dark theme-aware object.
     * @param children - Optional array of child items (defines collapsible behavior).
     * @param command  - Optional VS Code command to execute when the item is clicked.
     */
    constructor(
        label: string,
        iconPath?: string | vscode.Uri | { light: string | vscode.Uri; dark: string | vscode.Uri } | vscode.ThemeIcon,
        children?: TreeItem[] | undefined,
        command?: vscode.Command
    ) {
        // Initialize the base TreeItem with label and collapsible state.
        // If `children` is defined, mark it as collapsible; otherwise, non-collapsible.
        super(
            label,
            children === undefined
                ? vscode.TreeItemCollapsibleState.None
                : vscode.TreeItemCollapsibleState.Collapsed
        );

        // Assign the optional command that runs when this item is clicked.
        this.command = command;

        // Handle different icon path formats (string, object, ThemeIcon, or URI).
        if (typeof iconPath === 'string') {
            // Convert plain string paths to file URIs.
            this.iconPath = vscode.Uri.file(iconPath);
        } else if (
            iconPath &&
            typeof iconPath === 'object' &&
            'light' in iconPath &&
            'dark' in iconPath
        ) {
            // Handle theme-aware icon objects with separate light/dark paths.
            this.iconPath = {
                light:
                    typeof iconPath.light === 'string'
                        ? vscode.Uri.file(iconPath.light)
                        : iconPath.light,
                dark:
                    typeof iconPath.dark === 'string'
                        ? vscode.Uri.file(iconPath.dark)
                        : iconPath.dark,
            };
        } else {
            // Directly assign ThemeIcon or URI-based icons.
            this.iconPath = iconPath;
        }

        // Assign the children if provided (for expandable nodes).
        if (children !== undefined) {
            this.children = children;
        }
    }
}
