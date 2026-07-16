/*
 * RESOURCES
 * https://code.visualstudio.com/api/references/commands
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';

import { Global } from '../constants/global';
import { showTemporaryInformationMessage } from '../extensions/notification-utilities';
import { Utilities } from '../extensions/utilities';
import { CommandBase } from './command-base';

import type { Logger } from '../logging/logger';

const DOCUMENTATION_DIRECTORY_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const EXTERNAL_LINK_PATTERN = /^[a-z][a-z0-9+.-]*:/i;
const MARKDOWN_FENCE_PATTERN = /^\s*(`{3,}|~{3,})/;
const MARKDOWN_EXTENSIONS = new Set(['.md', '.markdown', '.mdx']);

/**
 * Creates a complete G4 project in a user-selected folder.
 *
 * @remarks
 * The command owns project scaffolding, sandbox-specific driver configuration, learning-path
 * generation, and the final workspace transition. Packaged resource objects are always cloned
 * before modification so one invocation cannot alter later projects.
 */
export class NewProjectCommand extends CommandBase {
    /** Logger scoped to new-project creation diagnostics. */
    private readonly _logger: Logger;

    /**
     * Initializes and names the command.
     *
     * @param context - Extension context that owns the command registration.
     */
    constructor(context: vscode.ExtensionContext) {
        super(context);

        // Scope diagnostics to this command so project-creation failures remain distinguishable
        // from shared command infrastructure messages.
        this._logger = this.logger.newLogger('NewProjectCommand');

        // Bind the implementation to the identifier contributed in package.json so registration
        // and command-palette invocation resolve the same command.
        this.command = 'New-Project';
    }

    /**
     * Collects the project and optional sandbox locations, then creates the project.
     *
     * @remarks
     * Owns the complete user interaction and filesystem workflow. Cancellation of the project
     * folder dialog ends the command without side effects; sandbox cancellation preserves the
     * resource defaults and does not cancel project creation.
     */
    protected async onInvokeCommand(): Promise<void> {
        // Restrict the initial picker to one directory because every generated path is rooted in
        // a single project location.
        const dialogOptions: vscode.OpenDialogOptions = {
            canSelectFiles: false,
            canSelectFolders: true,
            canSelectMany: false
        };

        // Collect the project root before requesting sandbox details so cancellation produces no
        // filesystem side effects.
        const projectSelection = await vscode.window.showOpenDialog(dialogOptions);

        // Treat dismissal as an intentional stop rather than creating files in an empty path.
        if (projectSelection === undefined || projectSelection.length === 0) {
            return;
        }

        // Resolve optional runtime dependencies independently so skipping the sandbox still
        // produces a portable project from packaged defaults.
        const sandboxDirectoryPath = await NewProjectCommand.resolveSandboxLocation();

        // Establish the complete directory tree before synchronous file generation begins.
        NewProjectCommand.createProjectFolders(projectSelection);

        // Create the manifest first because downstream editor configuration reuses its endpoint
        // and recorder settings as the project source of truth.
        const projectManifest = NewProjectCommand.createProjectManifest(
            projectSelection,
            this._logger,
            sandboxDirectoryPath
        );

        // Generate tool configuration only after the manifest exists so MCP settings cannot drift
        // from the endpoint written to the project.
        NewProjectCommand.createProjectConfigurationFiles(
            projectSelection,
            projectManifest,
            this._logger
        );

        // Seed automation bases and templates after sandbox selection has finalized every driver
        // path used by the generated project.
        NewProjectCommand.createBaseBots(
            projectSelection,
            this._logger,
            sandboxDirectoryPath
        );
        NewProjectCommand.createBaseTemplates(projectSelection, this._logger);

        // Copy learning material after the docs root exists, rewriting links against the final
        // friendly destination names during the same stage.
        NewProjectCommand.createDocumentation(projectSelection, this._logger);

        // Transition VS Code only after all synchronous scaffold writes have completed.
        NewProjectCommand.openFolder(projectSelection);
    }

    /**
     * Registers this command and transfers disposal ownership to the extension context.
     */
    protected async onRegister(): Promise<void> {
        // Route VS Code invocation through the shared command pipeline so base-class logging and
        // error handling remain active.
        const registration = vscode.commands.registerCommand(this.command, async () => {
            await this.invokeCommand();
        });

        // Transfer disposal ownership to the extension context to prevent registrations from
        // surviving extension deactivation.
        this.context.subscriptions.push(registration);
    }

    /**
     * Converts a validated lower-kebab-case directory name to a friendly Title Case name.
     *
     * @remarks
     * Compute-only. Validation belongs to documentation discovery so this conversion can remain
     * deterministic and focused on display-name generation.
     *
     * @param value - Validated lower-kebab-case directory name.
     * @returns The corresponding space-separated Title Case name.
     */
    private static convertKebabToTitleCase(value: string): string {
        // Accumulate converted words explicitly so the folder-name transformation remains easy to
        // extend without embedding display rules inside a compact callback chain.
        const titleCaseWords: string[] = [];

        // Capitalize each validated slug segment while preserving every character after its first.
        for (const word of value.split('-')) {
            titleCaseWords.push(word.charAt(0).toUpperCase() + word.slice(1));
        }

        // Rejoin with spaces because only top-level display folders receive friendly names.
        return titleCaseWords.join(' ');
    }

    /**
     * Copies one learning path and rewrites Markdown links for its friendly destination name.
     *
     * @remarks
     * A failure remains isolated to the affected learning path so the rest of the project can be
     * generated. Diagnostics include both source and destination paths for packaging failures.
     *
     * @param options - Source, destination, mapping, and logging dependencies for the copy.
     */
    private static copyDocumentationDirectory(options: DocumentationCopyOptions): void {
        // Resolve both sides before the guarded operation so failure diagnostics can identify the
        // exact packaged source and generated destination.
        const sourceDirectoryPath = path.join(
            options.documentationSourcePath,
            options.sourceDirectoryName
        );
        const destinationDirectoryPath = path.join(
            options.documentationDestinationPath,
            options.destinationDirectoryName
        );

        try {
            // Copy the complete learning path first so assets and unchanged Markdown files retain
            // their original relative layout.
            fs.cpSync(sourceDirectoryPath, destinationDirectoryPath, { recursive: true });

            // Limit content rewriting to Markdown formats because binary assets and supporting
            // files must remain byte-for-byte copies.
            const markdownSourceFilePaths = this.getMarkdownFilePaths(sourceDirectoryPath);

            for (const sourceFilePath of markdownSourceFilePaths) {
                // Mirror the source-relative file path into the friendly destination folder so
                // rewritten content replaces only its corresponding copied file.
                const relativeFilePath = path.relative(sourceDirectoryPath, sourceFilePath);
                const destinationFilePath = path.join(destinationDirectoryPath, relativeFilePath);
                const content = fs.readFileSync(sourceFilePath, 'utf8');

                // Recalculate cross-learning-path targets against the complete dynamic folder map.
                const updatedContent = this.updateDocumentationLinks(
                    content,
                    options.destinationNamesBySourceName
                );

                // Avoid unnecessary writes when a document contains no mapped links, preserving
                // the copied file exactly and reducing filesystem work.
                if (updatedContent !== content) {
                    fs.writeFileSync(destinationFilePath, updatedContent, 'utf8');
                }
            }
        } catch (error: unknown) {
            // Isolate a learning-path failure so one missing asset or invalid permission does not
            // prevent the remaining documentation folders from being generated.
            const copyError = this.getError(error);
            const errorMessage =
                `Failed to generate documentation from ${sourceDirectoryPath} ` +
                `to ${destinationDirectoryPath}: ${copyError.message}`;

            options.logger?.error(errorMessage, undefined, copyError);
        }
    }

    /**
     * Seeds the project with Chrome and UIA automation bases.
     *
     * @param projectSelection - Folder selected as the project root.
     * @param logger - Logger for file-generation failures.
     * @param sandboxDirectoryPath - Optional sandbox used to replace packaged driver paths.
     */
    private static createBaseBots(
        projectSelection: ProjectSelection,
        logger: Logger,
        sandboxDirectoryPath?: string
    ): void {
        // Resolve the shared destination once so both automation bases are guaranteed to land in
        // the same generated base-bot directory.
        const baseBotsPath = path.join(this.getPath(projectSelection), 'src', 'base.bots');

        // Generate Chrome content through the sandbox-aware transformer before persisting it.
        this.writeFile({
            content: this.createChromeBaseContent(sandboxDirectoryPath),
            directoryPath: baseBotsPath,
            fileName: 'chrome-automation-base.json',
            logger: logger
        });

        // Generate UIA content separately because its driver server uses a different sandbox
        // subdirectory and service contract.
        this.writeFile({
            content: this.createUiaBaseContent(sandboxDirectoryPath),
            directoryPath: baseBotsPath,
            fileName: 'uia-automation-base.json',
            logger: logger
        });
    }

    /**
     * Seeds the project with the schema-safe generic base template.
     *
     * @param projectSelection - Folder selected as the project root.
     * @param logger - Logger for file-generation failures.
     */
    private static createBaseTemplates(
        projectSelection: ProjectSelection,
        logger: Logger
    ): void {
        // Resolve the schema-designated template directory independently from executable bots.
        const baseTemplatesPath = path.join(
            this.getPath(projectSelection),
            'src',
            'base.templates'
        );

        // Copy the packaged template without mutation so every project begins from the validated
        // extension resource.
        this.writeFile({
            content: Utilities.getResource('resources.base/template-base.json'),
            directoryPath: baseTemplatesPath,
            fileName: 'template-base.json',
            logger: logger
        });
    }

    /**
     * Builds Chrome automation-base content for the selected sandbox.
     *
     * @remarks
     * Compute-only. Invalid packaged JSON is returned unchanged so a resource defect does not
     * block project creation.
     *
     * @param sandboxDirectoryPath - Optional sandbox that owns Chrome and its driver.
     * @returns Serialized automation-base content.
     */
    private static createChromeBaseContent(sandboxDirectoryPath?: string): string {
        // Read the packaged base once so every fallback returns the exact resource content.
        const resourceContent = Utilities.getResource(
            'resources.base/chrome-automation-base.json'
        );

        // Preserve remote or packaged defaults when the user intentionally skips sandbox setup.
        if (sandboxDirectoryPath === undefined) {
            return resourceContent;
        }

        try {
            // Parse only when sandbox rewriting is required, keeping the skip path independent of
            // resource schema assumptions.
            const chromeAutomationBase = JSON.parse(resourceContent) as ChromeAutomationBase;
            const chromeOptions = chromeAutomationBase.driverParameters
                ?.capabilities
                ?.alwaysMatch
                ?.["goog:chromeOptions"];

            // Point Chrome capabilities at the browser executable owned by the selected sandbox.
            if (chromeOptions !== undefined) {
                chromeOptions.binary = path.join(
                    sandboxDirectoryPath,
                    'browsers',
                    'chrome',
                    'chrome.exe'
                );
            }

            // Keep the driver service path aligned with the browser sandbox to prevent mixed
            // installations during recorder startup.
            if (chromeAutomationBase.driverParameters !== undefined) {
                chromeAutomationBase.driverParameters.driverBinaries = path.join(
                    sandboxDirectoryPath,
                    'drivers',
                    'chrome'
                );
            }

            // Serialize the complete parsed object so unmodeled packaged fields remain intact.
            return JSON.stringify(chromeAutomationBase, null, '\t');
        } catch {
            // Return the untouched resource when parsing fails so optional sandbox rewriting cannot
            // block creation of the rest of the project.
            return resourceContent;
        }
    }

    /**
     * Creates all documentation using the learning paths bundled with the extension.
     *
     * @remarks
     * Folder discovery is dynamic: every valid top-level lower-kebab-case directory is copied to
     * a Title Case destination. Any documentation failure is logged and does not block the core
     * project scaffold.
     *
     * @param projectSelection - Folder selected as the project root.
     * @param logger - Logger for discovery, copy, and link-rewrite failures.
     */
    private static createDocumentation(
        projectSelection: ProjectSelection,
        logger?: Logger
    ): void {
        // Resolve packaged and generated roots once so discovery, index generation, and folder
        // copies all operate against the same documentation tree.
        const documentationSourcePath = Utilities.getResourcePath('resources.docs');
        const documentationDestinationPath = path.join(
            this.getPath(projectSelection),
            'docs'
        );

        // Stop only the optional documentation stage when packaging omitted its source folder;
        // the core project scaffold is already valid at this point.
        if (!fs.existsSync(documentationSourcePath)) {
            logger?.error(`Documentation source folder does not exist: ${documentationSourcePath}.`);
            return;
        }

        // Discover every eligible learning path before writing content so all link rewrites share
        // one complete source-to-friendly-name mapping.
        const destinationNamesBySourceName = this.createDocumentationMappings(
            documentationSourcePath,
            logger
        );

        // Abandon documentation generation when the source root cannot be enumerated because a
        // partial mapping could produce broken cross-path links.
        if (destinationNamesBySourceName === undefined) {
            return;
        }

        // Write the root index first so users always have the learning-path entry point whenever
        // individual directory copies succeed.
        this.writeDocumentationIndex({
            destinationNamesBySourceName: destinationNamesBySourceName,
            documentationDestinationPath: documentationDestinationPath,
            documentationSourcePath: documentationSourcePath,
            logger: logger
        });

        // Generate each learning path independently so a failure in one folder does not suppress
        // valid paths discovered beside it.
        for (const [sourceDirectoryName, destinationDirectoryName]
            of destinationNamesBySourceName) {
            this.copyDocumentationDirectory({
                destinationDirectoryName: destinationDirectoryName,
                destinationNamesBySourceName: destinationNamesBySourceName,
                documentationDestinationPath: documentationDestinationPath,
                documentationSourcePath: documentationSourcePath,
                logger: logger,
                sourceDirectoryName: sourceDirectoryName
            });
        }
    }

    /**
     * Discovers valid learning-path directories and assigns friendly destination names.
     *
     * @remarks
     * Name collisions are checked case-insensitively because generated projects may live on
     * case-insensitive filesystems. Invalid or colliding directories are logged and skipped.
     *
     * @param documentationSourcePath - Packaged documentation root.
     * @param logger - Logger for invalid names, collisions, and discovery failures.
     * @returns Source-to-destination mapping, or undefined when the root cannot be read.
     */
    private static createDocumentationMappings(
        documentationSourcePath: string,
        logger?: Logger
    ): ReadonlyMap<string, string> | undefined {
        // Defer collection initialization until discovery succeeds so undefined remains an
        // unambiguous signal that the source root could not be read.
        let sourceEntries: fs.Dirent[];

        try {
            // Request directory metadata in the same call to avoid separate filesystem checks for
            // every packaged documentation entry.
            sourceEntries = fs.readdirSync(documentationSourcePath, { withFileTypes: true });
        } catch (error: unknown) {
            // Normalize unknown thrown values before logging so diagnostics always carry an Error
            // instance and useful message.
            const discoveryError = this.getError(error);

            logger?.error(
                `Failed to discover documentation folders under ${documentationSourcePath}: ` +
                discoveryError.message,
                undefined,
                discoveryError
            );
            return undefined;
        }

        // Track normalized destination names separately to catch collisions on case-insensitive
        // filesystems before any directories are copied.
        const destinationNames = new Set<string>();
        const destinationNamesBySourceName = new Map<string, string>();

        // Evaluate only top-level directories because each directory represents one learning path.
        for (const sourceEntry of sourceEntries) {
            // Ignore index files and unrelated packaged assets; they are handled by dedicated stages.
            if (!sourceEntry.isDirectory()) {
                continue;
            }

            // Enforce the source naming contract so Title Case conversion remains deterministic.
            if (!DOCUMENTATION_DIRECTORY_NAME_PATTERN.test(sourceEntry.name)) {
                logger?.error(
                    `Documentation folder must use lower-kebab-case and was skipped: ` +
                    `${sourceEntry.name}.`
                );
                continue;
            }

            // Derive the user-facing destination while retaining the original slug as the lookup key
            // used during Markdown link rewriting.
            const destinationName = this.convertKebabToTitleCase(sourceEntry.name);
            const normalizedDestinationName = destinationName.toLowerCase();

            // Skip ambiguous destinations rather than allowing the later copy to overwrite another
            // learning path on a case-insensitive filesystem.
            if (destinationNames.has(normalizedDestinationName)) {
                logger?.error(
                    `Documentation folder name collision after Title Case conversion: ` +
                    `${sourceEntry.name} -> ${destinationName}.`
                );
                continue;
            }

            // Commit the pair only after validation and collision checks have both succeeded.
            destinationNames.add(normalizedDestinationName);
            destinationNamesBySourceName.set(sourceEntry.name, destinationName);
        }

        // Return a read-only contract so downstream generation cannot alter discovery results.
        return destinationNamesBySourceName;
    }

    /**
     * Creates the VS Code MCP configuration from the generated project manifest.
     *
     * @remarks
     * Compute-only. Endpoint components are narrowed and normalized before the fixed G4 MCP route
     * is added. Invalid primitives return undefined so objects and malformed ports never reach the
     * generated URL.
     *
     * @param projectManifest - Manifest that provides the G4 server endpoint.
     * @returns Formatted `mcp.json` content, or undefined when the endpoint is invalid.
     */
    private static createMcpConfigurationContent(
        projectManifest: ProjectManifest
    ): string | undefined {
        const getServerText = (value: unknown): string | undefined => {
            // Accept strings only so malformed objects can never use JavaScript's default
            // `[object Object]` representation in the generated endpoint.
            if (typeof value !== 'string') {
                return undefined;
            }

            // Normalize external manifest text before checking whether the component is usable.
            const normalizedValue = value.trim();

            // Treat empty endpoint components as missing so callers can skip invalid MCP output.
            if (normalizedValue.length === 0) {
                return undefined;
            }

            return normalizedValue;
        };
        const getServerPort = (value: unknown): string | undefined => {
            let normalizedPort: string;
            let numericPort: number;

            // Preserve authored string formatting while validating its numeric meaning.
            if (typeof value === 'string') {
                const normalizedValue = getServerText(value);

                if (normalizedValue === undefined) {
                    return undefined;
                }

                normalizedPort = normalizedValue;
                numericPort = Number(normalizedValue);
            } else if (typeof value === 'number') {
                // Convert only after narrowing to number so object stringification is impossible.
                normalizedPort = value.toString();
                numericPort = value;
            } else {
                return undefined;
            }

            // Accept only finite integer ports within the TCP port range so the generated URL is
            // syntactically and operationally meaningful.
            const isFinitePort = Number.isFinite(numericPort);
            const isIntegerPort = Number.isInteger(numericPort);
            const isPortAboveMinimum = numericPort >= 1;
            const isPortBelowMaximum = numericPort <= 65_535;
            const isValidPort =
                isFinitePort &&
                isIntegerPort &&
                isPortAboveMinimum &&
                isPortBelowMaximum;

            if (!isValidPort) {
                return undefined;
            }

            return normalizedPort;
        };

        // Narrow each partial manifest value before interpolation so only endpoint primitives reach
        // the generated URL.
        const serverSchema = getServerText(projectManifest.g4Server?.schema);
        const serverHost = getServerText(projectManifest.g4Server?.host);
        const serverPort = getServerPort(projectManifest.g4Server?.port);
        const isServerSchemaMissing = serverSchema === undefined;
        const isServerHostMissing = serverHost === undefined;
        const isServerPortMissing = serverPort === undefined;
        const isServerEndpointInvalid =
            isServerSchemaMissing ||
            isServerHostMissing ||
            isServerPortMissing;

        // Refuse malformed endpoint data instead of emitting an MCP URL containing empty values or
        // default object stringification.
        if (isServerEndpointInvalid) {
            return undefined;
        }

        // Shape the editor-specific configuration around the manifest endpoint while keeping the
        // fixed G4 MCP route centralized in this transformation.
        const mcpConfiguration = {
            servers: {
                'g4-engine': {
                    type: 'http',
                    url: `${serverSchema}://${serverHost}:${serverPort}/api/v4/g4/mcp`
                }
            },
            inputs: []
        };

        // Match the project's tab-indented JSON convention for readable generated configuration.
        return JSON.stringify(mcpConfiguration, null, '\t');
    }

    /**
     * Creates the source-level configuration files used by VS Code integrations.
     *
     * @remarks
     * Invalid endpoint data skips only `mcp.json` and is reported through the provided logger so
     * the remaining project scaffold can complete.
     *
     * @param projectSelection - Folder selected as the project root.
     * @param projectManifest - Generated manifest used as the endpoint source of truth.
     * @param logger - Logger for file-generation failures.
     */
    private static createProjectConfigurationFiles(
        projectSelection: ProjectSelection,
        projectManifest: ProjectManifest,
        logger?: Logger
    ): void {
        // Target the source-scoped VS Code directory created during the folder scaffold stage.
        const vscodeConfigurationPath = path.join(
            this.getPath(projectSelection),
            'src',
            '.vscode'
        );

        // Validate manifest endpoint primitives before writing editor configuration so a malformed
        // optional MCP file cannot block the remaining project scaffold.
        const mcpConfigurationContent = this.createMcpConfigurationContent(projectManifest);

        if (mcpConfigurationContent === undefined) {
            logger?.error(
                'Failed to create mcp.json because g4Server schema and host must be non-empty ' +
                'strings and port must be an integer from 1 through 65535.'
            );
            return;
        }

        // Derive and persist MCP content from the same manifest object written to disk so editor
        // tooling connects to the project's configured G4 server.
        this.writeFile({
            content: mcpConfigurationContent,
            directoryPath: vscodeConfigurationPath,
            fileName: 'mcp.json',
            logger: logger
        });
    }

    /**
     * Creates the standard G4 project directory tree.
     *
     * @param projectSelection - Folder selected as the project root.
     */
    private static createProjectFolders(projectSelection: ProjectSelection): void {
        // Resolve the user selection once so every directory shares an identical project root.
        const projectPath = this.getPath(projectSelection);

        // Declare the full scaffold before mutation to keep the expected project layout visible as
        // one maintainable contract.
        const directoryPaths = [
            path.join(projectPath, 'docs'),
            path.join(projectPath, 'build'),
            path.join(projectPath, 'scripts'),
            path.join(projectPath, 'src', '.agents'),
            path.join(projectPath, 'src', '.claude'),
            path.join(projectPath, 'src', '.github'),
            path.join(projectPath, 'src', '.vscode'),
            path.join(projectPath, 'src', 'environments'),
            path.join(projectPath, 'src', 'base.bots'),
            path.join(projectPath, 'src', 'base.templates'),
            path.join(projectPath, 'src', 'templates'),
            path.join(projectPath, 'src', 'bots'),
            path.join(projectPath, 'src', 'resources')
        ];

        // Create only missing directories so rerunning the command preserves existing project
        // content while repairing an incomplete scaffold.
        for (const directoryPath of directoryPaths) {
            if (!fs.existsSync(directoryPath)) {
                fs.mkdirSync(directoryPath, { recursive: true });
            }
        }
    }

    /**
     * Creates and writes the project manifest.
     *
     * @remarks
     * The packaged manifest is cloned before sandbox paths are applied. Recorder parameters are
     * copied from the generated bases so the manifest and base-bot files cannot drift.
     *
     * @param projectSelection - Folder selected as the project root.
     * @param logger - Logger for file-generation failures.
     * @param sandboxDirectoryPath - Optional sandbox used to replace packaged driver paths.
     * @returns The same manifest object serialized to `manifest.json`.
     */
    private static createProjectManifest(
        projectSelection: ProjectSelection,
        logger?: Logger,
        sandboxDirectoryPath?: string
    ): ProjectManifest {
        // Clone the packaged manifest so sandbox customization cannot mutate the global template or
        // leak settings into later project-creation commands.
        const projectManifest = structuredClone(Global.BASE_MANIFEST) as ProjectManifest;

        // Record the sandbox root only when the user selected one, preserving packaged defaults for
        // portable or remote projects.
        if (sandboxDirectoryPath !== undefined) {
            projectManifest.sandbox = sandboxDirectoryPath;
        }

        // Generate Chrome parameters through the same transformer used for the base-bot file so the
        // recorder and automation base share identical driver paths.
        const chromeBaseContent = this.createChromeBaseContent(sandboxDirectoryPath);

        this.setRecorderDriverParameters(projectManifest, chromeBaseContent);

        // Replace UIA recorder parameters only for local sandbox projects; otherwise its configured
        // grid endpoint remains available for remote execution.
        if (sandboxDirectoryPath !== undefined) {
            const uiaBaseContent = this.createUiaBaseContent(sandboxDirectoryPath);

            this.setRecorderDriverParameters(projectManifest, uiaBaseContent);
        }

        // Persist the fully synchronized manifest after every sandbox-dependent mutation completes.
        this.writeFile({
            content: JSON.stringify(projectManifest, null, '\t'),
            directoryPath: path.join(this.getPath(projectSelection), 'src'),
            fileName: 'manifest.json',
            logger: logger
        });

        // Return the written object so dependent configuration is derived without rereading the file.
        return projectManifest;
    }

    /**
     * Builds UIA automation-base content for the selected sandbox.
     *
     * @remarks
     * Compute-only. Invalid packaged JSON is returned unchanged so a resource defect does not
     * block project creation.
     *
     * @param sandboxDirectoryPath - Optional sandbox that owns the UIA driver server.
     * @returns Serialized automation-base content.
     */
    private static createUiaBaseContent(sandboxDirectoryPath?: string): string {
        // Read the packaged UIA base once so the original content remains available for every
        // non-rewrite or recovery path.
        const resourceContent = Utilities.getResource('resources.base/uia-automation-base.json');

        // Preserve the configured grid endpoint when the user chooses a project without a sandbox.
        if (sandboxDirectoryPath === undefined) {
            return resourceContent;
        }

        try {
            // Parse only for a selected sandbox because that is the sole case requiring mutation.
            const uiaAutomationBase = JSON.parse(resourceContent) as AutomationBase;

            // Point UIA at the driver server directory bundled with the selected sandbox so the
            // recorder and generated base use the same local service.
            if (uiaAutomationBase.driverParameters !== undefined) {
                uiaAutomationBase.driverParameters.driverBinaries = path.join(
                    sandboxDirectoryPath,
                    'drivers',
                    'uia-driver-server'
                );
            }

            // Serialize the entire resource object to preserve fields outside the partial local type.
            return JSON.stringify(uiaAutomationBase, null, '\t');
        } catch {
            // Preserve project creation when the optional resource cannot be parsed by returning its
            // untouched packaged representation.
            return resourceContent;
        }
    }

    /**
     * Finds the boundary between a documentation path and its query or fragment.
     *
     * @remarks
     * Compute-only.
     *
     * @param linkPathWithSuffix - Local link target that may contain a query or fragment.
     * @returns Index of the first suffix character, or the string length when no suffix exists.
     */
    private static getDocumentationPathSuffixIndex(linkPathWithSuffix: string): number {
        // Locate both supported suffix delimiters before choosing the earliest boundary.
        const queryIndex = linkPathWithSuffix.indexOf('?');
        const fragmentIndex = linkPathWithSuffix.indexOf('#');

        // Default to the complete path so links without suffixes require no special branch.
        let pathSuffixIndex = linkPathWithSuffix.length;

        // Use a query as the current boundary when it is present.
        if (queryIndex >= 0) {
            pathSuffixIndex = queryIndex;
        }

        // Prefer a fragment only when it occurs before the query or is the sole suffix.
        if (fragmentIndex >= 0 && fragmentIndex < pathSuffixIndex) {
            pathSuffixIndex = fragmentIndex;
        }

        // Return the shared slice boundary used to preserve both path and suffix components.
        return pathSuffixIndex;
    }

    /**
     * Normalizes an unknown caught value to an Error for consistent diagnostics.
     *
     * @remarks
     * Compute-only.
     *
     * @param value - Value caught from an operation that may throw non-Error values.
     * @returns The original Error or a new Error containing the string representation.
     */
    private static getError(value: unknown): Error {
        // Preserve native Error identity, stack, and metadata when the thrown value already supplies it.
        if (value instanceof Error) {
            return value;
        }

        // Wrap non-Error throws so every logger call receives the same diagnostic contract.
        return new Error(String(value));
    }

    /**
     * Finds the first learning-path directory segment after relative path markers.
     *
     * @remarks
     * Compute-only.
     *
     * @param targetSegments - Slash-delimited local Markdown path segments.
     * @returns Segment index, or -1 when the path contains only relative markers.
     */
    private static getLearningPathSegmentIndex(targetSegments: readonly string[]): number {
        // Walk from the path origin because only the first semantic segment can identify a
        // top-level learning-path directory.
        for (let index = 0; index < targetSegments.length; index++) {
            const targetSegment = targetSegments[index];

            // Exclude empty and relative-navigation markers so links such as `../quick-start`
            // resolve the learning-path slug rather than their traversal prefix.
            const isRelativeMarker =
                targetSegment.length === 0 ||
                targetSegment === '.' ||
                targetSegment === '..';

            // Return immediately once the first directory candidate is found; later segments name
            // files or nested folders and must not be remapped.
            if (!isRelativeMarker) {
                return index;
            }
        }

        // Signal that the target contains navigation markers only and therefore has no mapped path.
        return -1;
    }

    /**
     * Recursively finds Markdown files whose local links may require rewriting.
     *
     * @param directoryPath - Learning-path directory to traverse.
     * @returns Absolute paths for Markdown files below the supplied directory.
     */
    private static getMarkdownFilePaths(directoryPath: string): string[] {
        // Maintain explicit result and work collections so traversal remains iterative and avoids
        // recursion depth limits in large learning paths.
        const markdownFilePaths: string[] = [];
        const pendingDirectoryPaths = [directoryPath];

        // Continue until every discovered subdirectory has been inspected exactly once.
        while (pendingDirectoryPaths.length > 0) {
            const pendingDirectoryPath = pendingDirectoryPaths.pop();

            // Guard the stack boundary even though the loop condition normally guarantees a value.
            if (pendingDirectoryPath === undefined) {
                continue;
            }

            // Read entry metadata with names so directory and extension decisions need no extra calls.
            const entries = fs.readdirSync(pendingDirectoryPath, { withFileTypes: true });

            for (const entry of entries) {
                const entryPath = path.join(pendingDirectoryPath, entry.name);

                // Queue nested directories for later traversal while keeping the current loop flat.
                if (entry.isDirectory()) {
                    pendingDirectoryPaths.push(entryPath);
                    continue;
                }

                // Restrict rewrites to supported Markdown extensions and leave all other copied
                // resources untouched.
                const isMarkdownFile =
                    entry.isFile() &&
                    MARKDOWN_EXTENSIONS.has(path.extname(entry.name).toLowerCase());

                // Collect absolute paths so callers can derive both source-relative and destination
                // paths without repeating traversal context.
                if (isMarkdownFile) {
                    markdownFilePaths.push(entryPath);
                }
            }
        }

        // Return the complete traversal result only after every queued directory is exhausted.
        return markdownFilePaths;
    }

    /**
     * Extracts the project filesystem path from a VS Code folder selection.
     *
     * @remarks
     * Compute-only. `fsPath` is preferred because VS Code already applies platform-specific URI
     * conversion; `path` remains as a compatibility fallback for lightweight test doubles.
     *
     * @param projectSelection - Result returned by the folder-selection dialog.
     * @returns The selected filesystem path, or an empty string for an empty selection.
     */
    private static getPath(projectSelection: ProjectSelection): string {
        // Read only the first URI because the dialog contract intentionally permits one selection.
        const projectLocation = projectSelection[0];

        // Keep path resolution safe for test doubles or unexpected empty selections outside the UI flow.
        if (projectLocation === undefined) {
            return '';
        }

        // Prefer VS Code's platform-native conversion while retaining URI path compatibility for
        // lightweight tests that do not construct a complete vscode.Uri.
        return projectLocation.fsPath || projectLocation.path;
    }

    /**
     * Determines whether a parsed Markdown target is a rewritable local path.
     *
     * @remarks
     * Compute-only. Anchors, query-only targets, rooted paths, and URI schemes intentionally
     * remain unchanged.
     *
     * @param linkPathWithSuffix - Target path including an optional query or fragment.
     * @returns True when the target is a relative local path.
     */
    private static isLocalDocumentationLink(linkPathWithSuffix: string): boolean {
        // Classify targets that contain no navigable file path so anchors and query-only links stay local
        // to their current document.
        const isMissingPath =
            linkPathWithSuffix.length === 0 ||
            linkPathWithSuffix.startsWith('#') ||
            linkPathWithSuffix.startsWith('?');

        // Exclude rooted filesystem and site paths because friendly learning-path mappings apply only
        // to relative paths within the generated documentation tree.
        const isRootedPath =
            linkPathWithSuffix.startsWith('/') ||
            linkPathWithSuffix.startsWith('\\');

        // Reject explicit URI schemes last so HTTP, mail, and other external targets remain unchanged.
        return !isMissingPath && !isRootedPath && !EXTERNAL_LINK_PATTERN.test(linkPathWithSuffix);
    }

    /**
     * Opens the generated source folder as the active VS Code workspace.
     *
     * @param projectSelection - Folder selected as the project root.
     */
    private static openFolder(projectSelection: ProjectSelection): void {
        // Convert the generated source directory to a VS Code file URI so the workspace command uses
        // the editor's cross-platform path handling.
        const projectSourceUri = vscode.Uri.file(
            path.join(this.getPath(projectSelection), 'src')
        );

        // Start the workspace transition without awaiting it because opening a folder may reload the
        // extension host and terminate the current command context.
        void vscode.commands.executeCommand('vscode.openFolder', projectSourceUri);
    }

    /**
     * Separates a Markdown destination path from angle brackets and an optional link title.
     *
     * @remarks
     * Compute-only. Undefined indicates malformed angle-bracket syntax that must remain unchanged.
     *
     * @param destination - Complete Markdown destination captured between parentheses.
     * @returns Parsed destination parts, or undefined for an unterminated angle wrapper.
     */
    private static parseDocumentationDestination(
        destination: string
    ): ParsedDocumentationDestination | undefined {
        // Remove regex-captured padding before separating the semantic path from optional title syntax.
        const destinationText = destination.trim();
        const isAngleWrapped = destinationText.startsWith('<');

        // Parse angle-wrapped paths first because spaces inside brackets belong to the path rather than
        // introducing a Markdown link title.
        if (isAngleWrapped) {
            const closingAngleIndex = destinationText.indexOf('>');

            // Preserve malformed Markdown unchanged when its angle wrapper has no closing delimiter.
            if (closingAngleIndex < 0) {
                return undefined;
            }

            // Retain content after the wrapper independently so an optional link title survives rewriting.
            return {
                isAngleWrapped: true,
                linkPathWithSuffix: destinationText.slice(1, closingAngleIndex),
                titleSuffix: destinationText.slice(closingAngleIndex + 1)
            };
        }

        // For ordinary destinations, the first whitespace separates the path from an optional title.
        const whitespaceIndex = destinationText.search(/\s/);

        // Represent title-free destinations explicitly so later rewriting needs no fallback parsing.
        if (whitespaceIndex < 0) {
            return {
                isAngleWrapped: false,
                linkPathWithSuffix: destinationText,
                titleSuffix: ''
            };
        }

        // Preserve the title suffix byte-for-byte while exposing only the path to mapping logic.
        return {
            isAngleWrapped: false,
            linkPathWithSuffix: destinationText.slice(0, whitespaceIndex),
            titleSuffix: destinationText.slice(whitespaceIndex)
        };
    }

    /**
     * Prompts for a sandbox through auto-detection, browsing, or an explicit skip.
     *
     * @remarks
     * Auto-detection falls back to browsing when no sandbox exists. Skip and cancellation both
     * return undefined so project creation continues with packaged defaults.
     *
     * @returns Selected sandbox path, or undefined when the sandbox is skipped or cancelled.
     */
    private static async resolveSandboxLocation(): Promise<string | undefined> {
        // Define stable Quick Pick identities because later branches compare the selected object rather
        // than user-facing label text.
        const autoDetectItem: vscode.QuickPickItem = {
            detail: 'Find the newest g4-sandbox-* folder automatically.',
            label: '$(search) Auto-detect latest G4 sandbox'
        };
        const browseItem: vscode.QuickPickItem = {
            detail: 'Select the sandbox folder manually.',
            label: '$(folder-opened) Browse for G4 sandbox folder...'
        };
        const skipItem: vscode.QuickPickItem = {
            detail: 'Do not set a sandbox; keep the base files\' default paths.',
            label: '$(circle-slash) Skip'
        };

        // Present every sandbox strategy in one interaction so users can choose automation, explicit
        // browsing, or packaged defaults without leaving project creation.
        const selectedAction = await vscode.window.showQuickPick(
            [autoDetectItem, browseItem, skipItem],
            {
                placeHolder: 'Choose how to set the G4 sandbox location for this project',
                title: 'G4 Sandbox Location'
            }
        );

        // Treat dismissal and explicit skip identically so neither choice blocks the scaffold flow.
        if (selectedAction === undefined || selectedAction === skipItem) {
            return undefined;
        }

        // Attempt discovery only for the automatic action; direct browsing bypasses filesystem scanning.
        if (selectedAction === autoDetectItem) {
            const detectedSandboxPath = Utilities.findLatestSandbox();

            // Confirm a successful detection before returning so users understand which runtime will be used.
            if (detectedSandboxPath !== undefined) {
                showTemporaryInformationMessage(`G4 sandbox detected: ${detectedSandboxPath}`);
                return detectedSandboxPath;
            }

            // Keep warnings persistent because a missing sandbox requires explicit user awareness and
            // the next stage will ask for manual selection.
            void vscode.window.showWarningMessage(
                'No G4 sandbox was auto-detected. Please browse to it.'
            );
        }

        // Browse either by direct request or as the recovery path after unsuccessful auto-detection.
        return Utilities.selectSandboxLocation();
    }

    /**
     * Copies generated base-bot driver parameters into the matching manifest recorder.
     *
     * @remarks
     * Mutates only the manifest clone passed by the caller. Driver parameters are deep-cloned so
     * later changes cannot couple manifest and base-bot objects.
     *
     * @param projectManifest - Generated manifest clone to update.
     * @param baseContent - Generated automation-base content used as the source of truth.
     */
    private static setRecorderDriverParameters(
        projectManifest: ProjectManifest,
        baseContent: string
    ): void {
        try {
            // Parse the already-generated base so recorder synchronization uses the exact values that
            // will be written to base.bots.
            const automationBase = JSON.parse(baseContent) as AutomationBase;
            const baseDriverParameters = automationBase.driverParameters;
            const driverName = baseDriverParameters?.driver;

            // Validate the driver identity before inspecting recorders because it is the stable key that
            // connects a base bot to its manifest recorder.
            const isDriverNameAvailable =
                typeof driverName === 'string' && driverName.length > 0;

            // Leave the manifest unchanged when the base does not expose usable driver parameters.
            if (baseDriverParameters === undefined || !isDriverNameAvailable) {
                return;
            }

            // Resolve the optional recorder collection defensively because partial manifests are valid
            // inputs to this internal synchronization contract.
            const recorders = projectManifest.settings?.recorderSettings?.recorders;

            // Skip synchronization when recorder configuration is absent rather than creating a new
            // manifest section with assumptions about external schema defaults.
            if (recorders === undefined) {
                return;
            }

            // Match by driver identity instead of array position so user-customized recorder ordering
            // cannot apply parameters to the wrong service.
            const matchingRecorder = recorders.find(recorder => {
                return recorder.driverParameters?.driver === driverName;
            });

            // Preserve unrelated recorder entries when no driver-specific target exists.
            if (matchingRecorder === undefined) {
                return;
            }

            // Clone the parameters before assignment so later mutations cannot couple manifest and
            // automation-base object graphs.
            matchingRecorder.driverParameters = structuredClone(baseDriverParameters);
        } catch {
            // Treat malformed optional base content as recoverable because it must not prevent the
            // remaining scaffold from being generated.
        }
    }

    /**
     * Maps one local Markdown target through the discovered learning-path display names.
     *
     * @remarks
     * Compute-only. Query strings, fragments, titles, and optional angle wrappers are retained.
     * URI decoding failures leave the original destination unchanged.
     *
     * @param destination - Markdown destination captured between link parentheses.
     * @param destinationNamesBySourceName - Learning-path source-to-destination mapping.
     * @returns Rewritten destination, or the original when no mapped path is present.
     */
    private static updateDocumentationLinkDestination(
        destination: string,
        destinationNamesBySourceName: ReadonlyMap<string, string>
    ): string {
        // Separate path syntax from optional Markdown wrappers and titles before applying folder maps.
        const parsedDestination = this.parseDocumentationDestination(destination);

        // Preserve malformed, external, rooted, anchor-only, and query-only destinations exactly as authored.
        if (
            parsedDestination === undefined ||
            !this.isLocalDocumentationLink(parsedDestination.linkPathWithSuffix)
        ) {
            return destination;
        }

        // Split path and suffix at the earliest query or fragment so only directory segments are decoded
        // and rewritten.
        const pathSuffixIndex = this.getDocumentationPathSuffixIndex(
            parsedDestination.linkPathWithSuffix
        );
        const linkPath = parsedDestination.linkPathWithSuffix.slice(0, pathSuffixIndex);
        const pathSuffix = parsedDestination.linkPathWithSuffix.slice(pathSuffixIndex);
        const targetSegments = linkPath.split('/');

        // Locate the first semantic directory after relative traversal markers such as `.` and `..`.
        const learningPathSegmentIndex = this.getLearningPathSegmentIndex(targetSegments);

        // Leave links without a directory candidate unchanged because they cannot reference a learning path.
        if (learningPathSegmentIndex < 0) {
            return destination;
        }

        let sourceDirectoryName: string;

        try {
            // Decode the authored slug before map lookup because Markdown links may percent-encode it.
            sourceDirectoryName = decodeURIComponent(targetSegments[learningPathSegmentIndex]);
        } catch {
            // Preserve invalid percent encoding rather than replacing a link with a partially decoded target.
            return destination;
        }

        // Resolve the friendly output name from the complete discovery map built before file generation.
        const destinationDirectoryName = destinationNamesBySourceName.get(sourceDirectoryName);

        // Keep same-folder and non-learning-path links unchanged when their first segment has no mapping.
        if (destinationDirectoryName === undefined) {
            return destination;
        }

        // Encode spaces in the friendly folder name so the rewritten Markdown target remains portable.
        targetSegments[learningPathSegmentIndex] = encodeURIComponent(destinationDirectoryName);

        // Reassemble the rewritten path with its original query or fragment before restoring wrappers.
        const updatedPathWithSuffix = targetSegments.join('/') + pathSuffix;
        let updatedTarget = updatedPathWithSuffix;

        // Restore angle brackets only when the original destination used them, preserving authored syntax.
        if (parsedDestination.isAngleWrapped) {
            updatedTarget = `<${updatedPathWithSuffix}>`;
        }

        // Append the untouched link title after all path-specific transformation is complete.
        return updatedTarget + parsedDestination.titleSuffix;
    }

    /**
     * Rewrites local Markdown links while preserving fenced code blocks and newline style.
     *
     * @remarks
     * Compute-only. External links and any link without a discovered learning-path directory are
     * returned unchanged.
     *
     * @param content - Markdown content from a packaged learning-path file.
     * @param destinationNamesBySourceName - Learning-path source-to-destination mapping.
     * @returns Content with mapped local destinations updated.
     */
    private static updateDocumentationLinks(
        content: string,
        destinationNamesBySourceName: ReadonlyMap<string, string>
    ): string {
        const updateLineDocumentationLinks = (line: string): string => {
            const updatedSegments: string[] = [];
            let cursorIndex = 0;

            // Scan monotonically for Markdown label openings so malformed input cannot make the
            // parser retry an unbounded expression from overlapping positions.
            while (cursorIndex < line.length) {
                const labelOpeningIndex = line.indexOf('[', cursorIndex);

                // Append the untouched remainder when no additional link candidate exists.
                if (labelOpeningIndex < 0) {
                    updatedSegments.push(line.slice(cursorIndex));
                    break;
                }

                const destinationOpeningIndex = line.indexOf('](', labelOpeningIndex + 1);

                // Preserve incomplete label syntax because only complete Markdown links are eligible
                // for destination rewriting.
                if (destinationOpeningIndex < 0) {
                    updatedSegments.push(line.slice(cursorIndex));
                    break;
                }

                const destinationStartIndex = destinationOpeningIndex + 2;
                const destinationClosingIndex = line.indexOf(')', destinationStartIndex);

                // Preserve an unterminated destination and stop at the line boundary so parsing remains
                // linear even for adversarial Markdown.
                if (destinationClosingIndex < 0) {
                    updatedSegments.push(line.slice(cursorIndex));
                    break;
                }

                const destination = line.slice(
                    destinationStartIndex,
                    destinationClosingIndex
                );

                // Keep empty destinations unchanged because the previous regex required at least one
                // destination character before applying a rewrite.
                if (destination.length === 0) {
                    updatedSegments.push(
                        line.slice(cursorIndex, destinationClosingIndex + 1)
                    );
                    cursorIndex = destinationClosingIndex + 1;
                    continue;
                }

                // Rewrite only the destination while retaining image markers, labels, delimiters, and
                // all text preceding the current link candidate.
                const updatedDestination = this.updateDocumentationLinkDestination(
                    destination,
                    destinationNamesBySourceName
                );

                updatedSegments.push(
                    line.slice(cursorIndex, destinationStartIndex),
                    updatedDestination,
                    ')'
                );
                cursorIndex = destinationClosingIndex + 1;
            }

            return updatedSegments.join('');
        };

        // Detect the source newline convention up front so rewriting does not create noisy line-ending churn.
        const newline = content.includes('\r\n') ? '\r\n' : '\n';

        // Accumulate output and fence state explicitly because links inside code examples must remain literal.
        const updatedLines: string[] = [];
        let fenceCharacter = '';

        // Inspect content line-by-line so fenced code regions can suspend link replacement safely.
        for (const line of content.split(/\r?\n/)) {
            const fenceMatch = MARKDOWN_FENCE_PATTERN.exec(line);

            // Toggle fence state only when the current delimiter opens a block or matches the active block.
            if (fenceMatch !== null) {
                const currentFenceCharacter = fenceMatch[1].charAt(0);

                // Capture the opening delimiter so a different fence character inside the example cannot
                // close the active block accidentally.
                if (fenceCharacter.length === 0) {
                    fenceCharacter = currentFenceCharacter;
                } else if (fenceCharacter === currentFenceCharacter) {
                    fenceCharacter = '';
                }

                // Preserve fence lines exactly and skip link processing for their delimiter content.
                updatedLines.push(line);
                continue;
            }

            // Preserve every line inside a fenced example so tutorial code is never rewritten as navigation.
            if (fenceCharacter.length > 0) {
                updatedLines.push(line);
                continue;
            }

            // Apply the single-pass link scanner only outside fenced content and append the processed line.
            updatedLines.push(updateLineDocumentationLinks(line));
        }

        // Restore the original newline convention after every line has been evaluated.
        return updatedLines.join(newline);
    }

    /**
     * Creates the friendly learning-path index in the generated documentation root.
     *
     * @param options - Source, destination, mapping, and logger dependencies for index creation.
     */
    private static writeDocumentationIndex(options: DocumentationIndexOptions): void {
        // Resolve the packaged index independently from destination naming so the source remains stable.
        const sourceFilePath = path.join(
            options.documentationSourcePath,
            'g4-learning.md'
        );

        try {
            // Read the complete index before writing so link transformation is atomic from the caller's view.
            const indexContent = fs.readFileSync(sourceFilePath, 'utf8');

            // Rewrite discovered learning-path targets while publishing the index under its friendly project name.
            this.writeFile({
                content: this.updateDocumentationLinks(
                    indexContent,
                    options.destinationNamesBySourceName
                ),
                directoryPath: options.documentationDestinationPath,
                fileName: 'G4 Learning Paths.md',
                logger: options.logger
            });
        } catch (error: unknown) {
            // Isolate index failure from directory copies so users can still access generated learning-path files.
            const indexError = this.getError(error);

            options.logger?.error(
                `Failed to create the documentation index from ${sourceFilePath}: ` +
                indexError.message,
                undefined,
                indexError
            );
        }
    }

    /**
     * Writes one generated project file and reports a recoverable failure.
     *
     * @remarks
     * The synchronous write guarantees every scaffold file exists before the generated project is
     * opened. Callers create parent directories before invoking this helper.
     *
     * @param options - Destination, content, and optional logging dependencies.
     */
    private static writeFile(options: WriteFileOptions): void {
        // Resolve the final file path once so both the write and any diagnostic identify the same target.
        const filePath = path.join(options.directoryPath, options.fileName);

        try {
            // Complete the write synchronously before project opening can reload the extension host.
            fs.writeFileSync(filePath, options.content, 'utf8');
        } catch (error: unknown) {
            // Normalize and report recoverable write failures without terminating the remaining scaffold stages.
            const writeError = this.getError(error);

            options.logger?.error(
                `Failed to write ${filePath}: ${writeError.message}`,
                undefined,
                writeError
            );
        }
    }
}

// Keep interfaces before type aliases, place each caller before its local dependency chain, then
// resume A-Z ordering so related contracts read together without losing deterministic placement.

/**
 * Chrome-specific automation-base fields that can be rewritten for a selected sandbox.
 *
 * @remarks
 * This partial contract deliberately models only the nested Chrome binary and shared driver
 * properties. JSON serialization retains additional properties present in the parsed resource.
 */
interface ChromeAutomationBase extends AutomationBase {
    /** Driver settings plus the Chrome capability path used for binary replacement. */
    driverParameters?: DriverParameters & {
        /** W3C capability groups provided to ChromeDriver. */
        capabilities?: {
            /** Capabilities applied to every Chrome session generated from this base. */
            alwaysMatch?: {
                /** Chrome-specific options containing the sandbox browser executable. */
                'goog:chromeOptions'?: {
                    /** Absolute path to the Chrome executable used by the selected sandbox. */
                    binary?: string;
                };
            };
        };
    };
}

/**
 * Minimal automation-base fields consumed while synchronizing recorder driver parameters.
 *
 * @remarks
 * Packaged base files contain additional properties that remain unmodeled because this command
 * reads only the driver identity and binaries required for manifest synchronization.
 */
interface AutomationBase {
    /** Driver configuration copied into the recorder with the same driver identity. */
    driverParameters?: DriverParameters;
}

/**
 * Dependencies required to copy and rewrite one discovered learning-path directory.
 *
 * @remarks
 * The options object keeps source, destination, mapping, and diagnostics explicit while the copy
 * operation remains isolated from other learning paths.
 */
interface DocumentationCopyOptions {
    /** Friendly Title Case directory name created in the generated project. */
    destinationDirectoryName: string;

    /** Complete source-slug to friendly-name map used for cross-path link rewriting. */
    destinationNamesBySourceName: ReadonlyMap<string, string>;

    /** Absolute generated documentation root that receives the copied learning path. */
    documentationDestinationPath: string;

    /** Absolute packaged documentation root that owns the source learning path. */
    documentationSourcePath: string;

    /** Optional command logger that receives recoverable copy or rewrite failures. */
    logger?: Logger;

    /** Validated lower-kebab-case directory name in the packaged resource tree. */
    sourceDirectoryName: string;
}

/**
 * Dependencies required to generate the root learning-path index.
 *
 * @remarks
 * Index generation shares the same immutable discovery map as directory copies so every emitted
 * link targets the final friendly destination tree.
 */
interface DocumentationIndexOptions {
    /** Complete source-slug to friendly-name map used for root-index link rewriting. */
    destinationNamesBySourceName: ReadonlyMap<string, string>;

    /** Absolute generated documentation root that receives the friendly index file. */
    documentationDestinationPath: string;

    /** Absolute packaged documentation root containing `g4-learning.md`. */
    documentationSourcePath: string;

    /** Optional command logger that receives recoverable index-generation failures. */
    logger?: Logger;
}

/**
 * Parsed components of one Markdown link destination.
 *
 * @remarks
 * Wrapper and title information is retained separately so path rewriting changes only the
 * learning-path directory segment and preserves the author's Markdown syntax.
 */
interface ParsedDocumentationDestination {
    /** Indicates whether the original destination path used angle brackets. */
    isAngleWrapped: boolean;

    /** Destination path plus any query or fragment, excluding an optional link title. */
    linkPathWithSuffix: string;

    /** Original whitespace and optional title appended after the destination path. */
    titleSuffix: string;
}

/**
 * Minimal project-manifest shape consumed during new-project generation.
 *
 * @remarks
 * The full manifest contains authentication, automation, logging, and other settings. This partial
 * contract models only endpoint, sandbox, and recorder fields read or changed by this command.
 */
interface ProjectManifest {
    /** G4 server endpoint values used to generate VS Code MCP configuration. */
    g4Server?: G4ServerConfiguration;

    /** Absolute sandbox root recorded when the user selects a local G4 sandbox. */
    sandbox?: string;

    /** Settings subset containing recorder configuration synchronized from generated base bots. */
    settings?: {
        /** Recorder settings that may contain Chrome and UIA recorder entries. */
        recorderSettings?: {
            /** Recorder entries searched by driver identity rather than array position. */
            recorders?: RecorderConfiguration[];
        };
    };
}

/**
 * Untrusted G4 server endpoint values read from the partial project manifest.
 *
 * @remarks
 * Values remain `unknown` intentionally because the base manifest is not strongly typed at its
 * source. MCP generation narrows each field before interpolation to prevent default object
 * stringification and invalid port output.
 */
interface G4ServerConfiguration {
    /** Candidate server host that must narrow to a non-empty string. */
    host?: unknown;

    /** Candidate server port that must narrow to a valid string or TCP port number. */
    port?: unknown;

    /** Candidate URL scheme that must narrow to a non-empty string. */
    schema?: unknown;
}

/**
 * Minimal recorder fields required for driver-parameter synchronization.
 *
 * @remarks
 * Recorder networking, mode, and think-time settings remain outside this partial contract because
 * synchronization replaces only the matched driver parameters.
 */
interface RecorderConfiguration {
    /** Driver configuration used for identity matching and replacement. */
    driverParameters?: DriverParameters;
}

/**
 * Driver fields shared by packaged automation bases and manifest recorder entries.
 *
 * @remarks
 * The complete driver contract contains capabilities and matching rules; this partial shape keeps
 * only the fields used to identify a recorder and replace its driver service location.
 */
interface DriverParameters {
    /** Stable driver identity used to match an automation base with its recorder. */
    driver?: string;

    /** Local directory or remote endpoint used to resolve the driver service. */
    driverBinaries?: string;
}

/**
 * Dependencies required to persist one generated project file.
 *
 * @remarks
 * Grouping write inputs prevents long positional argument lists and makes optional failure
 * reporting explicit at every scaffold call site.
 */
interface WriteFileOptions {
    /** Complete UTF-8 text written to the generated file. */
    content: string;

    /** Absolute parent directory that already exists before the write stage. */
    directoryPath: string;

    /** File name appended to the destination directory without further path parsing. */
    fileName: string;

    /** Optional command logger that receives recoverable filesystem failures. */
    logger?: Logger;
}

/**
 * Ordered folder selection returned by the VS Code open dialog.
 *
 * @remarks
 * The command configures the dialog for one selection and reads the first element, while the
 * readonly array preserves compatibility with VS Code's result contract.
 */
type ProjectSelection = readonly ProjectLocation[];

/**
 * Cross-platform URI fields required to resolve the selected project directory.
 *
 * @remarks
 * `fsPath` supplies VS Code's platform-native path while `path` supports lightweight test doubles
 * and URI-compatible fallback behavior.
 */
type ProjectLocation = Pick<vscode.Uri, 'fsPath' | 'path'>;
