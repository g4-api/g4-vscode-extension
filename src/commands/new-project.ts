/*
 * RESOURCES
 * https://code.visualstudio.com/api/references/commands
 */
import fs = require('fs');
import os = require('os');
import * as path from 'node:path';
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
     * Initializes a new NewProjectCommand for the G4 API.
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
        const folderUri = await vscode.window.showOpenDialog(dialogOptions);

        // If the user canceled the dialog, folderUri will be undefined
        if (!folderUri || folderUri.length === 0) {
            return;
        }

        // After the location is chosen, resolve the G4 sandbox location (auto-detect / browse /
        // skip). A skipped or cancelled selection returns undefined, and the base files keep
        // their default paths.
        const sandboxPath = await NewProjectCommand.resolveSandboxLocation();

        // Create the project folder structure
        NewProjectCommand.newProjectFolder(folderUri);

        // Create root-level tool configuration files that agent and MCP clients expect.
        NewProjectCommand.newProjectConfigurationFiles(folderUri, this._logger);

        // Generate the initial project manifest file, recording the sandbox path when provided
        NewProjectCommand.newProjectManifest(folderUri, this._logger, sandboxPath);

        // Add sample content under the project
        NewProjectCommand.newSampleBot(folderUri, this._logger);

        // Seed the base.bots folder with the chrome/uia automation base files, rewriting the
        // chrome paths to the selected sandbox when one was provided
        NewProjectCommand.newBaseBots(folderUri, this._logger, sandboxPath);

        // Create the documentation files for the project (e.g. configuration guides, README templates, etc.)
        NewProjectCommand.newDocumentation(folderUri);

        // Finally, open the newly created project folder in the editor
        NewProjectCommand.openFolder(folderUri);
    }

    /**
     * Prompts for the G4 sandbox location via a QuickPick offering auto-detect, browse, or skip.
     *
     * @remarks
     * Owns the sandbox selection interaction. Auto-detect falls back to Browse when nothing is
     * found; Skip and cancellation both return undefined so project creation proceeds with the
     * base files' default paths.
     *
     * @returns The selected sandbox folder path, or undefined when skipped/cancelled.
     */
    private static async resolveSandboxLocation(): Promise<string | undefined> {
        // The three actions offered to the user.
        const autoDetectItem: vscode.QuickPickItem = {
            label: '$(search) Auto-detect latest G4 sandbox',
            detail: 'Find the newest g4-sandbox-* folder automatically.'
        };
        const browseItem: vscode.QuickPickItem = {
            label: '$(folder-opened) Browse for G4 sandbox folder...',
            detail: 'Select the sandbox folder manually.'
        };
        const skipItem: vscode.QuickPickItem = {
            label: '$(circle-slash) Skip',
            detail: 'Do not set a sandbox; keep the base files\' default paths.'
        };

        // Ask the user how to provide the sandbox location.
        const choice = await vscode.window.showQuickPick(
            [autoDetectItem, browseItem, skipItem],
            {
                title: 'G4 Sandbox Location',
                placeHolder: 'Choose how to set the G4 sandbox location for this project'
            }
        );

        // Cancelled (Esc) or Skip: no sandbox is applied.
        if (!choice || choice === skipItem) {
            return undefined;
        }

        // Auto-detect: use the newest sandbox; fall back to Browse when none is found.
        if (choice === autoDetectItem) {
            const detected = Utilities.findLatestSandbox();

            if (detected) {
                vscode.window.showInformationMessage(`G4 sandbox detected: ${detected}`);
                return detected;
            }

            vscode.window.showWarningMessage('No G4 sandbox was auto-detected. Please browse to it.');
        }

        // Browse (chosen directly, or as the auto-detect fallback).
        return Utilities.selectSandboxLocation();
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
            path.join(projectPath, 'docs'),
            path.join(projectPath, 'docs', 'examples'),
            path.join(projectPath, 'build'),
            path.join(projectPath, 'scripts'),
            path.join(projectPath, 'src', '.agents', 'skills'),
            path.join(projectPath, 'src', '.claude', 'skills'),
            path.join(projectPath, 'src', '.github'),
            path.join(projectPath, 'src', '.prompts'),
            path.join(projectPath, 'src', '.vscode'),
            path.join(projectPath, 'src', 'configurations'),
            path.join(projectPath, 'src', 'environments'),
            path.join(projectPath, 'src', 'base.bots'),
            path.join(projectPath, 'src', 'base.templates'),
            path.join(projectPath, 'src', 'templates'),
            path.join(projectPath, 'src', 'templates.examples'),
            path.join(projectPath, 'src', isTestProject ? 'tests' : 'bots'),
            path.join(projectPath, 'src', isTestProject ? 'tests.examples' : 'bots.examples'),
            path.join(projectPath, 'src', 'resources'),
            path.join(projectPath, 'src', 'resources.examples')
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
     * Creates root-level configuration files for tool integrations in a new project.
     *
     * @remarks
     * Owns root and source-level configuration files. The required parent folders are created
     * by newProjectFolder() before this method runs, and the files intentionally start as empty
     * JSON objects so users can opt into their preferred MCP/client settings.
     *
     * @param userPath - The URI or path selected by the user for the new project.
     * @param logger - Optional logger for reporting file-writing errors.
     */
    private static newProjectConfigurationFiles(userPath: any, logger?: Logger): void {
        // Resolve the project root once so root and nested configuration files stay aligned.
        const projectPath = this.getPath(userPath);
        const emptyJsonContent = JSON.stringify({}, null, '\t');

        // Root MCP configuration consumed by agent tooling.
        this.writeFile({
            directoryPath: projectPath,
            fileName: '.mcp.json',
            content: emptyJsonContent,
            logger: logger
        });

        // VS Code-specific MSP configuration under the source workspace settings folder.
        this.writeFile({
            directoryPath: path.join(projectPath, 'src', '.vscode'),
            fileName: 'msp.json',
            content: emptyJsonContent,
            logger: logger
        });
    }

    /**
     * Generates a Manifest.json file in the project's src folder based on the extension’s package manifest.
     *
     * @param userPath - The URI or path selected by the user for the new project.
     * @param logger - Optional logger for reporting file-writing errors.
     * @param sandboxPath - The selected sandbox folder path, or undefined to keep default paths.
     */
    private static newProjectManifest(userPath: any, logger?: Logger, sandboxPath?: string) {
        // Clone the base manifest so the shared constant is never mutated, then record the
        // selected G4 sandbox path when one was provided.
        const manifest = JSON.parse(JSON.stringify(Global.BASE_MANIFEST));

        if (sandboxPath) {
            manifest.sandbox = sandboxPath;
        }

        // Keep the manifest Chrome recorder aligned with the generated chrome base bot, including
        // sandbox-adjusted binary paths when a sandbox was selected.
        const chromeBaseContent = this.newChromeBaseContent(sandboxPath);
        this.setChromeRecorderDriverParameters(manifest, chromeBaseContent);

        // Convert the manifest object to a formatted JSON string with tabs for readability
        const content = JSON.stringify(manifest, null, '\t');

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
     * Seeds the base.bots folder with the chrome and uia automation base files.
     *
     * @remarks
     * When a sandbox path is provided, the chrome file's browser binary and driver binaries are
     * rewritten to point at that sandbox; the uia file (which targets a localhost hub, not a
     * sandbox path) is copied unchanged.
     *
     * @param userPath    The URI(s) returned from the folder picker (project root).
     * @param logger      Logger for reporting any file-writing errors.
     * @param sandboxPath The selected sandbox folder path, or undefined to keep default paths.
     */
    private static newBaseBots(userPath: any, logger: Logger, sandboxPath?: string): void {
        // Resolve the target base.bots folder under the project's src directory.
        const baseBotsPath = path.join(this.getPath(userPath), 'src', 'base.bots');

        // Chrome base: optionally rewrite its sandbox paths before writing.
        this.writeFile({
            directoryPath: baseBotsPath,
            fileName: 'chrome-automation-base.json',
            content: this.newChromeBaseContent(sandboxPath),
            logger: logger
        });

        // Uia base: copied verbatim (it targets a localhost hub, not a sandbox path).
        this.writeFile({
            directoryPath: baseBotsPath,
            fileName: 'uia-automation-base.json',
            content: Utilities.getResource('resources.base/uia-automation-base.json'),
            logger: logger
        });
    }

    /**
     * Returns the chrome-automation-base.json content, rewriting the Chrome binary and driver
     * paths to the given sandbox when provided.
     *
     * @remarks
     * Compute-only. Falls back to the resource as-is on skip or when the resource cannot be
     * parsed, so project creation always succeeds.
     *
     * @param sandboxPath The selected sandbox folder path, or undefined to keep default paths.
     * @returns The chrome base file content to write.
     */
    private static newChromeBaseContent(sandboxPath?: string): string {
        // Load the chrome base file from extension resources.
        const raw = Utilities.getResource('resources.base/chrome-automation-base.json');

        // No sandbox selected: keep the default paths.
        if (!sandboxPath) {
            return raw;
        }

        try {
            // Point the Chrome binary and driver at the selected sandbox, preserving the known
            // sub-paths (browsers/chrome/chrome.exe and drivers/chrome).
            const chrome = JSON.parse(raw);
            const chromeOptions = chrome?.driverParameters?.capabilities?.alwaysMatch?.['goog:chromeOptions'];

            if (chromeOptions) {
                chromeOptions.binary = path.join(sandboxPath, 'browsers', 'chrome', 'chrome.exe');
            }

            if (chrome?.driverParameters) {
                chrome.driverParameters.driverBinaries = path.join(sandboxPath, 'drivers', 'chrome');
            }

            return JSON.stringify(chrome, null, '\t');
        } catch {
            // Malformed resource: fall back to the raw content so project creation still succeeds.
            return raw;
        }
    }

    /**
     * Copies the generated Chrome base driver parameters into the matching manifest recorder.
     *
     * @remarks
     * Compute-only except for mutating the provided manifest clone. The Chrome base content is
     * used as the source of truth so recorder sandbox paths stay identical to the base bot file.
     *
     * @param manifest - The generated project manifest clone to update before writing.
     * @param chromeBaseContent - The generated chrome-automation-base.json content.
     */
    private static setChromeRecorderDriverParameters(manifest: any, chromeBaseContent: string): void {
        try {
            // Parse the generated Chrome base content so the recorder receives the same object
            // that is written under base.bots.
            const chromeBase = JSON.parse(chromeBaseContent);
            const chromeDriverParameters = chromeBase?.driverParameters;

            if (!chromeDriverParameters) {
                return;
            }

            // Find the Chrome recorder by driver name, matching the new-project manifest contract.
            const recorders = manifest?.settings?.recorderSettings?.recorders;

            if (!Array.isArray(recorders)) {
                return;
            }

            const chromeRecorder = recorders.find(
                (recorder: any) => recorder?.driverParameters?.driver === 'ChromeDriver'
            );

            if (!chromeRecorder) {
                return;
            }

            // Deep-clone the driver parameters so later mutations cannot couple the two objects.
            chromeRecorder.driverParameters = JSON.parse(JSON.stringify(chromeDriverParameters));
        } catch {
            // Malformed Chrome base content should not block project creation.
        }
    }

    /**
     * Creates the default documentation files for a new G4 workspace/project.
     *
     * This method copies bundled documentation resources from the extension package
     * into the user's generated project structure. Currently, it creates the `docs`
     * folder and writes the G4 manifest configuration guide into it.
     *
     * @param userPath The root user/project path where the documentation folder should be created.
     */
    private static newDocumentation(userPath: any): void {
        // Build the list of documentation files that should be created.
        // Each entry defines:
        // - content: the embedded resource content loaded from the extension
        // - fileName: the output file name
        // - folderPath: the target directory where the file will be written
        const documentsContent = [
            {
                // Load the bundled G4 manifest configuration guide from extension resources.
                content: Utilities.getResource('resources.docs/g4-manifest-configuration-guide.md'),

                // Keep the original markdown file name when writing it to the project.
                fileName: 'G4 Manifest Configuration Guide.md',

                // Place all generated documentation files under the project "docs" folder.
                folderPath: path.join(this.getPath(userPath), 'docs')
            }
        ];

        // Write each documentation file to its target folder.
        // The writeFile helper is responsible for creating the directory if needed
        // and then writing the file content to disk.
        for (const document of documentsContent) {
            this.writeFile({
                directoryPath: document.folderPath,
                fileName: document.fileName,
                content: document.content
            });
        }
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
        const contentBasic = Utilities.getResource('resources.examples/demo-bot.json');

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
            fileName: 'find-something-on-bing.json',
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
