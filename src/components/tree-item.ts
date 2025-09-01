import * as vscode from 'vscode';

export class TreeItem extends vscode.TreeItem {
    children: TreeItem[] | undefined;
    command?: vscode.Command;

    constructor(
        label: string,
        iconPath?: string | vscode.Uri | { light: string | vscode.Uri; dark: string | vscode.Uri } | vscode.ThemeIcon,
        children?: TreeItem[] | undefined,
        command?: vscode.Command) {

        super(
            label,
            children === undefined
                ? vscode.TreeItemCollapsibleState.None
                : vscode.TreeItemCollapsibleState.Collapsed);

        this.command = command;

        if (typeof iconPath === 'string') {
            this.iconPath = vscode.Uri.file(iconPath);
        } else if (
            iconPath &&
            typeof iconPath === 'object' && 'light' in iconPath && 'dark' in iconPath
        ) {
            this.iconPath = {
                light: typeof iconPath.light === 'string' ? vscode.Uri.file(iconPath.light) : iconPath.light,
                dark: typeof iconPath.dark === 'string' ? vscode.Uri.file(iconPath.dark) : iconPath.dark,
            };
        } else {
            this.iconPath = iconPath;
        }

        if (children !== undefined) {
            this.children = children;
        }
    }
}
