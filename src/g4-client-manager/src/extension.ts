// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "g4-client-manager" is now active!');

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	const disposable = vscode.commands.registerCommand('g4-client-manager.helloWorld', () => {
		// The code you place here will be executed every time your command is executed
		// Display a message box to the user
		vscode.window.showInformationMessage('Hello World from g4-client-manager!');
	});

	const html = vscode.commands.registerCommand('myExtension.showWebview', () => {
		// Create the webview panel
		const panel = vscode.window.createWebviewPanel(
			'myWebview',
			'Dynamic Webview',
			vscode.ViewColumn.One,
			{
				enableScripts: true, // Allow JavaScript in the webview
			}
		);

		// Get the path to the index.html file
		const htmlPath = path.join(context.extensionPath, 'media', 'index.html');

		// Read the file dynamically
		fs.readFile(htmlPath, 'utf8', (err, data) => {
			if (err) {
				vscode.window.showErrorMessage('Error loading HTML file.');
				console.error(err);
				return;
			}

			// Set the webview content
			panel.webview.html = getWebviewContent(panel.webview, context.extensionUri);
		});
	});

	context.subscriptions.push(disposable);
	context.subscriptions.push(html);
}

function getWebviewContent(webview: vscode.Webview, extensionUri: vscode.Uri): string {
    // Path to index.html
    const htmlPath = path.join(extensionUri.fsPath, 'media', 'index.html');

    // Read the HTML file
    let htmlContent = fs.readFileSync(htmlPath, 'utf8');

    // Resolve baseUri for resources
    const baseUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media')).toString();

    // Replace placeholders with baseUri
    htmlContent = htmlContent.replace(/{{baseUri}}/g, baseUri);

    return htmlContent;
}

// This method is called when your extension is deactivated
export function deactivate() { }
