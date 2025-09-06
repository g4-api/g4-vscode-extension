/*
 * RESOURCES
 * https://code.visualstudio.com/api/references/commands
 */
import fs = require('fs');
import os = require('os');
import * as path from 'path';
import * as vscode from 'vscode';
import { CommandBase } from './command-base';
import { Logger } from '../logging/logger';
import { Global } from '../constants/global';
import { Utilities } from '../extensions/utilities';

/**
 * Command to create a new project structure in VS Code.
 * This command scaffolds a basic project layout with folders, manifests, and sample files.
 */
export class NewProjectCommand extends CommandBase {
    // Logger instance scoped to this command
    // This allows us to log messages specific to the New Project command
    private readonly _logger: Logger;

    /**
     * Initializes a new NewProjectCommand for the Rhino API.
     *
     * @param context - The VS Code extension context used to register the command
     *                  and manage its lifecycle.
     */
    constructor(context: vscode.ExtensionContext) {
        // Invoke the base constructor to set up shared properties
        // (logger, client, context, manifest, etc.)
        super(context);

        // Create a child logger scoped to this command for clearer log output
        this._logger = this.logger?.newLogger('NewProjectCommand');

        // Set the command identifier that will be used when registering
        // and invoking this command in the extension
        this.command = 'New-Project';
    }

    /**
     * Registers this command with VS Code and ensures it is disposed when the extension deactivates.
     */
    protected async onRegister(): Promise<any> {
        // Register the command identifier; when the user runs it, invoke our command pipeline
        let command = vscode.commands.registerCommand(this.command, async () => {
            await this.invokeCommand();
        });

        // Add the registration disposable to the extension context so VS Code cleans it up automatically
        this.context.subscriptions.push(command);
    }

    /**
     * Opens a folder selection dialog and then scaffolds a new project structure
     * by creating folders, manifests, sample files, and finally opening the folder in VS Code.
     */
    protected async onInvokeCommand(): Promise<any> {
        // Configure the open dialog to allow selecting a single folder only
        const dialogOptions: vscode.OpenDialogOptions = {
            canSelectFiles: false,
            canSelectFolders: true,
            canSelectMany: false
        };

        // Show the folder picker dialog to the user
        vscode.window.showOpenDialog(dialogOptions).then(folderUri => {
            // If the user canceled the dialog, folderUri will be undefined
            if (!folderUri || folderUri.length === 0) {
                return;
            }

            // Create the project folder structure
            NewProjectCommand.newProjectFolder(folderUri);

            // Generate the initial project manifest file (e.g. package.json or equivalent)
            NewProjectCommand.newProjectManifest(folderUri, this._logger);

            // Add sample content under the project
            NewProjectCommand.newSampleBot(folderUri, this._logger);

            // Finally, open the newly created project folder in the editor
            NewProjectCommand.openFolder(folderUri);
        });
    }

    /**
     * Creates the standard project folder structure under the user‑selected path.
     *
     * @param userPath - The URI or path selected by the user for the new project.
     */
    private static newProjectFolder(userPath: any) {
        // Resolve the file system path from the user-provided URI or object
        const projectPath = NewProjectCommand.getPath(userPath);
        const isTestProject = false;

        // Define the directories to scaffold:
        // - Documentation (docs)
        // - Build outputs (build)
        // - Custom scripts (scripts)
        // - Source code (src) with organized subfolders for configurations, environments, models, plugins, tests, and resources
        const folders = [
            path.join(projectPath, '.github'),
            path.join(projectPath, 'docs'),
            path.join(projectPath, 'docs', 'examples'),
            path.join(projectPath, 'build'),
            path.join(projectPath, 'scripts'),
            path.join(projectPath, 'src', '.prompts'),
            path.join(projectPath, 'src', 'configurations'),
            path.join(projectPath, 'src', 'environments'),
            path.join(projectPath, 'src', 'models'),
            path.join(projectPath, 'src', 'models', 'json'),
            path.join(projectPath, 'src', 'models', 'markdown'),
            path.join(projectPath, 'src', 'templates'),
            path.join(projectPath, 'src', 'templates', 'examples'),
            path.join(projectPath, 'src', isTestProject ? 'tests' : 'bots'),
            path.join(projectPath, 'src', isTestProject ? 'tests' : 'bots', 'examples'),
            path.join(projectPath, 'src', 'resources'),
            path.join(projectPath, 'src', 'resources', 'examples')
        ];

        // Iterate over each intended folder path...
        for (const folder of folders) {
            // ...and create it if it does not already exist, enabling recursive creation of parent directories
            if (!fs.existsSync(folder)) {
                fs.mkdirSync(folder, { recursive: true });
            }
        }
    }

    /**
     * Generates a Manifest.json file in the project's src folder based on the extension’s package manifest.
     *
     * @param userPath - The URI or path selected by the user for the new project.
     */
    private static newProjectManifest(userPath: any, logger?: Logger) {
        // Convert the manifest object to a formatted JSON string with tabs for readability
        const content = JSON.stringify(Global.BASE_MANIFEST, null, '\t');

        // Determine the target directory: <projectRoot>/src
        const projectPath = path.join(this.getPath(userPath), 'src');

        // Write manifest.json into the src folder using the helper method
        this.writeFile({
            directoryPath: projectPath,
            fileName: 'manifest.json',
            content: content,
            logger: logger
        });
    }

    /**
     * Writes a sample bot definition file into the project’s examples directory.
     * 
     * @param userPath      The URI(s) returned from the folder picker, used to determine the project root.
     * @param logger        Logger instance to report any file‐writing errors.
     * @param isTestProject When true, writes into "tests/examples"; otherwise into "bots/examples".
     */
    private static newSampleBot(userPath: any, logger: Logger, isTestProject: boolean = false): void {
        // Load the default demo bot content from extension resources
        const contentBasic = Utilities.getResource('demo-bot.json');

        // Determine the target examples path:
        // - If this is a test project, use "<root>/src/tests/examples"
        // - Otherwise, use "<root>/src/bots/examples"
        const examplesPath = path.join(
            this.getPath(userPath),
            'src',
            isTestProject ? 'tests' : 'bots',
            'examples'
        );

        // Write the sample bot file "find-something-on-bing.g4" into the examples folder
        this.writeFile({
            directoryPath: examplesPath,
            fileName: 'find-something-on-bing.g4',
            content: contentBasic,
            logger: logger
        });
    }

    /**
     * Opens the project's "src" folder in VS Code.
     *
     * @param userPath - The URI or path selected by the user for the project root.
     */
    private static openFolder(userPath: any): void {
        // Convert the provided URI or object into a file system path string
        let projectPath = this.getPath(userPath);

        // On Windows, if the path starts with a leading slash (e.g. "/C:/…"), strip it off
        projectPath = os.platform() === 'win32' && projectPath.startsWith('/')
            ? projectPath.substring(1, projectPath.length)
            : projectPath;

        // On Windows, convert all forward slashes to backslashes for correct formatting
        projectPath = os.platform() === 'win32'
            ? projectPath.replaceAll('/', '\\').substring(0, projectPath.length)
            : projectPath;

        // Create a file URI pointing to the "src" directory inside the project
        const uri = vscode.Uri.file(path.join(projectPath, 'src'));

        // Use VS Code’s built-in command to open the folder in the workspace
        vscode.commands.executeCommand('vscode.openFolder', uri);
    }

    /**
     * Writes content to a file at the specified directory path.
     *
     * @param options.directoryPath - The folder in which to create or overwrite the file.
     * @param options.fileName      - The name of the file to write.
     * @param options.content       - The string content to write into the file.
     * @param options.logger        - Optional logger for reporting write errors.
     */
    private static writeFile(options: {
        directoryPath: string;
        fileName: string;
        content: string;
        logger?: Logger
    }): void {
        // Construct the absolute file path by joining directory and filename
        const manifestPath = path.join(options.directoryPath, options.fileName);

        // Perform an asynchronous write operation
        fs.writeFile(manifestPath, options.content, (error: any) => {
            if (error) {
                // If writing fails, log the error message and stack via the provided logger
                options.logger?.error(error.message, error);
            }
            // On success, no further action is needed
        });
    }

    /**
     * Extracts and normalizes a file-system path from the array returned by VS Code’s open dialog.
     *
     * @param userPath - The array of URIs selected by the user (from showOpenDialog).
     * 
     * @returns The normalized file system path. On Windows, leading slashes are removed
     *          and forward‐slashes are converted to backslashes; on other platforms, the
     *          path is returned unchanged.
     */
    private static getPath(userPath: any): string {
        // start with an empty path in case nothing is selected
        let path = '';

        // if the user selected at least one folder/file, take the first URI’s path
        path = userPath?.[0]?.path ?? '';

        // on Windows, remove a leading slash (e.g. "/C:/…") and convert "/" to "\"
        if (os.platform() === 'win32') {
            return path.replaceAll('/', '\\').substring(1, path.length);
        }

        // on macOS/Linux, just return the raw path
        return path;
    }
}
