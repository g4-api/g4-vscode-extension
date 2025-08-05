import * as fs from 'fs';
import * as vscode from 'vscode';
import path = require('path');
import { LogConfiguration } from '../models/log-configuration-model';
import { Global } from '../constants/global';

export class Utilities {
    /**
     * Checks whether a given string is valid JSON.
     *
     * @param str - The string to validate as JSON.
     * 
     * @returns `true` if `str` can be parsed as JSON; otherwise `false`.
     */
    public static assertJson(str: string): boolean {
        try {
            // Attempt to parse the string as JSON
            JSON.parse(str);
            // If parsing succeeds without throwing, the string is valid JSON
            return true;
        } catch {
            // If parsing throws an error, the string is not valid JSON
            return false;
        }
    }

    /**
     * Alias for `assertUndefinedOrNull` to check if a value is `null` or `undefined`.
     *
     * @param obj - The value to test.
     * 
     * @returns `true` if `obj` is `null`, `undefined`, or if an error occurs during the check; otherwise `false`.
     */
    public static assertNullOrUndefined(obj: any): boolean {
        // Delegate to the internal check that safely handles getters and unexpected errors
        return this.assertUndefinedOrNull(obj);
    }

    /**
     * Recursively retrieves all file paths under the specified directory.
     *
     * @param directory - The root directory path to start searching from.
     * 
     * @returns An array of absolute file paths for all files found within the directory tree.
     */
    public static getFiles(directory: string): string[] {
        // Initialize an array to collect file paths
        const list: string[] = [];

        /**
         * Helper function to traverse directories recursively.
         *
         * @param directoryPath - Current directory path in the recursion.
         */
        const getFilesFromDirectory = (directoryPath: string): void => {
            // Read all entries (files and subdirectories) in the current directory
            const entries = fs.readdirSync(directoryPath);

            for (const entry of entries) {
                // Build the full path for the current entry
                const filePath = path.join(directoryPath, entry);
                // Get filesystem stats to determine if entry is a file or directory
                const stats = fs.statSync(filePath);

                if (stats.isDirectory()) {
                    // If it's a directory, recurse into it
                    getFilesFromDirectory(filePath);
                } else {
                    // If it's a file, add its absolute path to the results list
                    list.push(filePath);
                }
            }
        };

        // Begin recursion from the provided root directory
        getFilesFromDirectory(directory);

        // Return the accumulated list of file paths
        return list;
    }

    /**
     * Recursively searches a directory for JSON files whose base names match any in a given list.
     *
     * @param directory    - The root directory path to begin the search.
     * @param arrayOfNames - An array of file base names (without the `.json` extension) to match.
     * 
     * @returns An array of full file paths for all matching JSON files.
     */
    public static getFilesByFileNames(directory: string, arrayOfNames: string[]): string[] {
        // Accumulates matching file paths
        const list: string[] = [];

        // Regex to extract the base file name (word characters) immediately before '.json'
        // The negative lookbehind (?!\\) ensures we don't match backslashes
        const patternToExtractName = /(?!\\)\w+(?=\.json)/;

        /**
         * Helper function that walks the directory tree recursively.
         */
        const getFilesFromDirectory = (directoryPath: string): void => {
            // Read all entries (files and subdirectories) in the current directory
            const files = fs.readdirSync(directoryPath);

            for (const file of files) {
                const filePath = path.join(directoryPath, file);
                const stats = fs.statSync(filePath);

                if (stats.isDirectory()) {
                    // If it's a directory, recurse into it
                    getFilesFromDirectory(filePath);

                } else {
                    // If it's a file, attempt to match its base name against each target name
                    for (const name of arrayOfNames) {
                        const matches = filePath.match(patternToExtractName);
                        // If regex finds a base name and it matches one in our list, record the path
                        if (matches !== null && matches[0] === name) {
                            list.push(filePath);
                        }
                    }
                }
            }
        };

        // Start the recursive search from the provided root directory
        getFilesFromDirectory(directory);

        // Return all matching file paths
        return list;
    }

    /**
     * Retrieves a flat, alphabetically sorted list of folders (A–Z) followed by files (A–Z)
     * from the specified directory, with optional exclusion and inclusion filters.
     *
     * @param folderPath     - Absolute path of the directory to scan.
     * @param excludeFolders - Names of subfolders to skip (case-insensitive). Defaults to [].
     * @param includeFiles   - File extensions (including the dot, e.g. ".TS") to include (case-insensitive).
     *                          If empty, all files are included. Defaults to [].
     * 
     * @returns An array of names (folders first, then files), sorted alphabetically.
     */
    public static getFilesAndFolders(folderPath: string, excludeFolders: string[] = [], includeFiles: string[] = []): string[] {
        // Delegate to the internal resolver which handles reading, filtering, and sorting
        return this.resolveFilesAndFolders(folderPath, excludeFolders, includeFiles);
    }

    /**
     * Retrieves the first match from a RegExpMatchArray.
     *
     * @param regexMatch - The result array from a RegExp match operation, or null if no match was attempted.
     * 
     * @returns The first matching substring, or an empty string if no match is found.
     */
    public static getFirstMatch(regexMatch: RegExpMatchArray | null): string {
        // If the match array exists and has at least one element, return the first match
        if (regexMatch && regexMatch.length > 0) {
            return regexMatch[0];
        }

        // Otherwise, return an empty string to indicate no match
        return "";
    }

    /**
     * Retrieves the logging configuration for the RhinoServer from the project manifest.
     *
     * If a clientLogConfiguration is defined in the manifest, it will be returned.
     * Otherwise, a sensible default configuration is provided.
     *
     * @returns {LogConfiguration} The resolved or default log configuration.
     */
    public static getLogConfiguration(): LogConfiguration {
        // Attempt to load the project manifest
        const manifest = this.resolveProjectManifest();

        // Check whether a manifest object was successfully returned
        const hasManifest = !this.assertUndefinedOrNull(manifest);

        // Check whether the manifest contains a clientLogConfiguration section
        const hasClientConfig = hasManifest && !this.assertUndefinedOrNull(manifest.clientLogConfiguration);

        // If clientLogConfiguration exists on the manifest, use it
        if (hasClientConfig) {
            return manifest.clientLogConfiguration;
        }

        // Otherwise, return a default log configuration
        return {
            agentLogConfiguration: {
                // Enable the agent's own logging by default
                enabled: true,
                // Emit logs every 3000 milliseconds
                interval: 3000
            },
            // Default to informational-level logging
            logLevel: "information",
            sourceOptions: {
                // Only include explicitly listed sources (none by default)
                filter: "include",
                // No specific sources to include; all will be excluded
                sources: []
            }
        };
    }

    /**
     * Loads the workspace project manifest, or falls back to the base manifest if none is found.
     *
     * @returns The parsed manifest object from `manifest.json` in the workspace (if present),
     *          otherwise the default base manifest object.
     */
    public static getManifest(): any {
        // Delegate to resolveProjectManifest, which handles:
        //  1. Locating the workspace manifest file (with or without src folder)
        //  2. Reading and parsing the JSON
        //  3. Falling back to the base manifest if getDefault is true (default behavior)
        return this.resolveProjectManifest();
    }

    /**
     * Retrieves the full text range of the currently active editor document.
     *
     * @returns A `vscode.Range` that spans from the start of the first line
     *          to the end of the last line, or a zero-length range at (0,0)
     *          if no document is open.
     */
    public static getOpenDocumentRange(): vscode.Range {
        // Attempt to get the active document from the current editor
        const document = vscode.window.activeTextEditor?.document;

        // If there's no active document (no editor open), return a zero-length range at the start
        if (!document) {
            const zeroPos = new vscode.Position(0, 0);
            return new vscode.Range(zeroPos, zeroPos);
        }

        // Retrieve the first and last line in the document
        const firstLine = document.lineAt(0);
        const lastLine = document.lineAt(document.lineCount - 1);

        // Construct and return a range from the start of the first line to the end of the last line
        return new vscode.Range(firstLine.range.start, lastLine.range.end);
    }

    /**
     * Retrieves the text content of the currently active editor document.
     *
     * @returns The full document text as a string, or an empty string if no editor is open.
     */
    public static getOpenDocumentText(): string {
        // Get the active text editor in VS Code (if any)
        const editor = vscode.window.activeTextEditor;

        // If there is no active editor (e.g., no file open), return an empty string
        if (!editor) {
            return '';
        }

        // Otherwise, return the document’s text content
        return editor.document.getText();
    }

    /**
     * Public wrapper to load a named resource file from the `resources` directory.
     *
     * @param resourceName - The filename of the resource to load (e.g., `"config.json"`).
     * 
     * @returns The file contents as a UTF‑8 string, or an empty string if the resource cannot be read.
     */
    public static getResource(resourceName: string): string {
        // Delegate to the private resolver which handles file lookup and error swallowing
        return this.resolveResource(resourceName);
    }

    /**
     * Retrieves the full G4 server endpoint URL from the project manifest.
     *
     * @returns The endpoint URL in the format `<schema>://<host>:<port>`,
     *          or an empty string if no server configuration is found.
     */
    public static getG4Endpoint(): string {
        // Delegate to resolveG4Endpoint which constructs the URL or returns an empty string
        return this.resolveG4Endpoint();
    }

    /**
     * Retrieves the G4 server configuration object from the project manifest.
     *
     * @returns The `ServerConfiguration` defined under the `G4Server` key,
     *          or `undefined` if no configuration is found.
     */
    public static getG4Server(): any | undefined {
        // Delegate to resolveG4Server which reads and parses the manifest
        // without falling back to the default base manifest.
        return this.resolveG4Server();
    }

    /**
     * Resolves the absolute path to a specified system folder within the current workspace.
     *
     * @param folder - The folder name to resolve. Valid options:
     *                 'configurations', 'environments', 'models',
     *                 'templates', 'resources', or 'tests'.
     * 
     * @returns The fully-qualified path to the requested folder,
     *          with any leading backslash removed for Windows-style URIs.
     */
    public static getSystemFolderPath(folder: 'bots' | 'configurations' | 'environments' | 'models' | 'templates' | 'resources' | 'tests'): string {
        // Attempt to get the first workspace folder’s file system path
        let workspace = vscode.workspace.workspaceFolders
            ?.map(f => f.uri.path)[0];

        // Normalize undefined to an empty string to avoid path.join errors
        workspace = workspace === undefined ? '' : workspace;

        // Construct the target folder path inside the workspace
        const systemFolderPath = path.join(workspace, folder);

        // On Windows, VSCode URI paths may begin with a leading backslash (e.g., "\C:\…")
        // Strip it off to produce a valid file system path
        return systemFolderPath.startsWith('\\')
            ? systemFolderPath.substring(1)
            : systemFolderPath;
    }

    /**
     * Calculates the absolute path to a system utility folder (e.g., build, docs, scripts)
     * located alongside the current workspace folder.
     *
     * @param folder - The name of the utility folder to resolve ('build', 'docs', or 'scripts').
     * 
     * @returns The resolved folder path, with any leading backslash removed for Windows paths.
     */
    public static getSystemUtilityFolderPath(folder: 'build' | 'docs' | 'scripts'): string {
        // Retrieve the first workspace folder’s file system path (if any)
        let workspace = vscode.workspace.workspaceFolders
            ?.map(f => f.uri.path)[0];

        // Normalize undefined to empty string to avoid errors in path operations
        workspace = workspace === undefined ? '' : workspace;

        // Construct the target folder path by navigating up one level from workspace
        // and into the specified utility folder (e.g., "../build")
        const targetPath = path.join(workspace, '..', folder);

        // On Windows, VSCode URIs may start with a leading backslash (e.g., "\C:\…")
        // Remove it to form a valid file system path
        return targetPath.startsWith('\\')
            ? targetPath.substring(1)
            : targetPath;
    }

    /**
     * Generates a timestamp string in the format `DD/MM/YY, HH:MM:SS.mmm`.
     *
     * @returns A formatted timestamp using the 'en-GB' locale with two‑digit date/time components
     *          and three‑digit milliseconds appended after a dot.
     */
    public static getTimestamp(): string {
        // Create a new Date instance representing the current date and time
        const date = new Date();

        // Define formatting options for day, month, year, hour, minute, and second
        const options: Intl.DateTimeFormatOptions = {
            year: '2-digit',   // two‑digit year (e.g., "25")
            month: '2-digit',  // two‑digit month (e.g., "07" for July)
            day: '2-digit',    // two‑digit day of month (e.g., "21")
            hour: '2-digit',   // two‑digit hour (24‑hour clock)
            minute: '2-digit', // two‑digit minute
            second: '2-digit', // two‑digit second
            hour12: false      // use 24‑hour clock rather than AM/PM
        };

        // Format date/time according to 'en-GB' locale (produces "DD/MM/YY, HH:MM:SS")
        const base = date.toLocaleString('en-GB', options);

        // Append milliseconds (three digits) for higher precision
        const ms = date.getMilliseconds().toString().padStart(3, '0');

        // Return the complete timestamp in the format "DD/MM/YY, HH:MM:SS.mmm"
        return `${base}.${ms}`;
    }

    /**
     * Delays execution for a specified duration.
     *
     * @param ms - The number of milliseconds to wait (default is 1000 ms).
     * 
     * @returns A promise that resolves after the specified delay.
     */
    public static waitAsync(ms = 1000): Promise<void> {
        // Return a new promise that resolves after `ms` milliseconds
        return new Promise<void>(resolve => {
            setTimeout(resolve, ms);
        });
    }

    /**
     * Checks whether a given value is `null` or `undefined`, safely handling any unexpected errors.
     *
     * @param obj - The value to test.
     * 
     * @returns `true` if `obj` is `null`, `undefined`, or if an error occurs during the check; otherwise `false`.
     */
    private static assertUndefinedOrNull(obj: any): boolean {
        try {
            // Return true if obj is strictly null or strictly undefined
            return obj === null || obj === undefined;
        } catch {
            // If any exception is thrown (e.g., obj has a problematic getter), treat it as undefined/null
            return true;
        }
    }

    /**
     * Recursively lists folders and files in a given directory, with optional filtering and sorting.
     *
     * @param folderPath     - Absolute path of the directory to scan.
     * @param excludeFolders - Array of folder names to exclude (case-insensitive). Defaults to [].
     * @param includeFiles   - Array of file extensions (including the dot, e.g. ".TS") to include (case-insensitive).
     *                         If empty, all files are included. Defaults to [].
     * 
     * @returns A sorted array of names (folders first, then files) from the directory,
     *          filtered according to the provided include/exclude lists.
     */
    private static resolveFilesAndFolders(
        folderPath: string,
        excludeFolders: string[] = [],
        includeFiles: string[] = []): string[] {

        // Helper: sort an array of names alphabetically (A–Z)
        const sortByName = (list: string[]) => {
            return list.sort((n1: string, n2: string) => {
                if (n1 > n2) {
                    return 1;
                }
                if (n1 < n2) {
                    return -1;
                }
                return 0;
            });
        };

        // Initialize results
        let folders: string[] = [];
        let files: string[] = [];

        // If the directory doesn't exist, return empty results immediately
        if (!fs.existsSync(folderPath)) {
            return [...folders, ...files];
        }

        // Normalize filters to uppercase for case-insensitive comparison
        excludeFolders = excludeFolders.map(i => i.toUpperCase());
        includeFiles = includeFiles.map(i => i.toUpperCase());

        // Read all items (files and directories) in the target folder
        const unsorted = fs.readdirSync(folderPath);

        for (const item of unsorted) {
            const fullPath = path.join(folderPath, item);
            const stats = fs.statSync(fullPath);

            if (stats.isDirectory()) {
                // Check if this directory is in the exclusion list
                const isExcluded = excludeFolders.length > 0 && excludeFolders.indexOf(item.toUpperCase()) > -1;

                // Skip this folder
                if (isExcluded) {
                    continue;
                }
                folders.push(item);

            } else if (stats.isFile()) {
                // Determine file extension and check inclusion list
                const suffix = path.extname(item).toUpperCase();
                const isIncluded = includeFiles.length === 0 || includeFiles.indexOf(suffix) > -1;

                // Skip this file
                if (!isIncluded) {
                    continue;
                }
                files.push(item);
            }
        }

        // Sort folders and files alphabetically
        folders = sortByName(folders);
        files = sortByName(files);

        // Return combined array: folders first, then files
        return [...folders, ...files];
    }

    /**
     * Constructs the full G4 server endpoint URL from the server configuration.
     *
     * @returns The endpoint URL in the format `<schema>://<host>:<port>`, 
     *          or an empty string if the server configuration is missing.
     */
    private static resolveG4Endpoint(): string {
        // Retrieve server configuration from the project manifest (no default fallback)
        const server = this.resolveG4Server();

        // If server config is absent, return an empty string
        if (!server) {
            return '';
        }

        // Build and return the URL string (e.g., "https://example.com:443")
        return `${server.schema}://${server.host}:${server.port}`;
    }

    /**
     * Retrieves the G4 server configuration from the workspace’s project manifest.
     *
     * @returns The `ServerConfiguration` defined under the `G4Server` key in the manifest,
     *          or `undefined` if no manifest or configuration is present.
     */
    private static resolveG4Server(): any | undefined {
        // Load the workspace manifest without falling back to the base manifest
        const projectManifest = this.resolveProjectManifest(false);

        // Return the G4Server property if it exists; otherwise returns undefined
        return projectManifest?.g4Server;
    }

    /**
     * Resolves and loads the project’s manifest file from the current workspace.
     *
     * @param getDefault - If true (default), falls back to the base manifest when no workspace manifest is found or readable.
     *                     If false, returns `undefined` instead of the default manifest.
     * 
     * @returns The parsed manifest object, or `undefined` if `getDefault` is false and no valid manifest is found.
     */
    private static resolveProjectManifest(getDefault: boolean = true): any {
        // Attempt to get the first workspace folder’s file system path
        let workspace = vscode.workspace.workspaceFolders
            ?.map(folder => folder.uri.path)[0];

        // Normalize undefined to empty string for safe string operations
        workspace = workspace === undefined ? '' : workspace;

        // Determine manifest location:
        // - If the workspace path already ends with 'src', expect manifest.json there
        // - Otherwise, look under 'src/manifest.json'
        let manifest = workspace.endsWith('src')
            ? path.join(workspace, 'manifest.json')
            : path.join(workspace, 'src', 'manifest.json');

        // On Windows URIs, remove leading backslash if present (e.g., '\C:\…')
        manifest = manifest.startsWith('\\')
            ? manifest.substring(1)
            : manifest;

        try {
            // Read manifest file synchronously as UTF‑8 text
            const data = fs.readFileSync(manifest, 'utf8');

            // Parse JSON and return the resulting object
            return JSON.parse(data);
        } catch (error: any) {
            // Swallow any errors (file not found, parse error, etc.)
            // Consider logging error.message here if troubleshooting is needed
        }

        // If reading/parsing failed:
        // - Return the default base manifest if requested
        // - Otherwise return null
        return getDefault
            ? this.newProjectManifest()
            : null;
    }

    /**
     * Loads and parses the base project manifest file.
     *
     * @returns The parsed JSON object from `base-manifest.json`, or throws if the file content is invalid JSON.
     */
    private static newProjectManifest(): any {
        // Read the raw JSON string from the resources directory
        const manifest = this.resolveResource('base-manifest.json');

        // If the manifest is empty, return base manifest
        if (!manifest) {
            return Global.BASE_MANIFEST;
        }

        // Parse the JSON string into an object and return
        // An error will be thrown here if the JSON is malformed
        return JSON.parse(manifest);
    }

    /**
     * Reads the contents of a resource file from the `resources` directory.
     *
     * @param resourceName - The filename of the resource to load (e.g., `"config.json"`).
     * 
     * @returns The file’s contents as a UTF‑8 string, or an empty string if the file cannot be found or read.
     */
    private static resolveResource(resourceName: string): string {
        try {
            // Determine the project root by moving two levels up from this file’s directory
            const directoryPath = path.resolve(__dirname, '..');

            // Build the absolute path to the resource file under the `resources` folder
            const filePath = path.join(directoryPath, 'resources', resourceName);

            // Synchronously read the file as UTF‑8 text and return its contents
            return fs.readFileSync(filePath, 'utf8');
        } catch (error: any) {
            // If any error occurs (e.g., file not found, permission denied), swallow it
            // and fall through to return an empty string
            // Consider logging `error.message` here if diagnostics are needed
        }

        // Return an empty string when the resource cannot be resolved
        return '';
    }
}