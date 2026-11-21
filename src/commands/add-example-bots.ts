/**
 * Command that adds example bots to the open project, only when the user asks for them.
 *
 * New Project creates no example bots. This command lists the shipped examples (resources.examples/bots/catalog.json)
 * in a picker grouped by topic, and writes the chosen ones to src/bots/examples/<group>/<name>.json. Examples that
 * drive a browser or a desktop app take the driver settings of the project's base bot, so they run against the same
 * sandbox as the project's other bots. An existing file is never overwritten without asking. A documentation link
 * can run the command with example ids, which skips the picker.
 *
 * RESOURCES:
 * VS Code quick pick API reference: https://code.visualstudio.com/api/references/vscode-api#QuickPick
 * VS Code command URIs: https://code.visualstudio.com/api/extension-guides/command#command-uris
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';

import { CommandBase } from './command-base';

import { Utilities } from '../extensions/utilities';

import { Logger } from '../logging/logger';

import { G4BrandingService } from '../services/g4-branding-service';
import { G4ExampleBotsService } from '../services/g4-example-bots-service';

import type { ExampleBot } from '../services/g4-example-bots-service';

// The packaged catalog of example bots.
const CATALOG_RESOURCE = 'resources.examples/bots/catalog.json';

// The answers of the dialog shown when an example file already exists in the project.
const CONFLICT_ANSWERS = {
    overwrite: 'Overwrite',
    overwriteAll: 'Overwrite All',
    skip: 'Skip',
    skipAll: 'Skip All'
};

// The file at the project root that marks a G4 project folder.
const MANIFEST_FILE = 'manifest.json';

/**
 * The Add-ExampleBots command: writes chosen example bots into the project's src/bots/examples folder.
 *
 * @remarks
 * Which examples exist, where they go and what content they get is decided by G4ExampleBotsService; this command
 * only asks the user, reads and writes files, and opens the result.
 */
export class AddExampleBotsCommand extends CommandBase {
    /** Logger the added, skipped and broken examples are written with. */
    private readonly _logger: Logger;

    /**
     * Creates a new AddExampleBotsCommand instance.
     *
     * @param context The VS Code extension context used to manage disposables.
     */
    constructor(context: vscode.ExtensionContext) {
        // Initialize the command base infrastructure.
        super(context);

        // Write the outcome under its own logger name, so it reads apart from other commands.
        this._logger = this.logger?.newLogger('G4.ExampleBots');

        // Set the VS Code command identifier.
        this.command = 'Add-ExampleBots';
    }

    /**
     * Lets the user choose example bots, writes them into the project, and opens a single added example.
     *
     * @remarks
     * Runs from the Command Palette, the Explorer menu of the bots folder (which passes the folder URI and so still
     * opens the picker), or a documentation link that passes example ids (which skips the picker).
     *
     * @param commandArgument - Example ids (one, a list, or `{ ids }`), a folder URI, or nothing.
     * @returns A promise that resolves when the examples are written or the user stopped.
     */
    protected async onInvokeCommand(commandArgument?: unknown): Promise<void> {
        // An example can only be added to an open project folder.
        const projectRoot = AddExampleBotsCommand.getProjectRoot();

        if (projectRoot === undefined) {
            const message = G4BrandingService.getText('Open a {product} project folder first, then add example bots.');

            void vscode.window.showWarningMessage(message);

            return;
        }

        // Read the catalog and keep the examples this machine can run; a dropped entry is logged, not fatal.
        const catalog = G4ExampleBotsService.getCatalog(Utilities.getResource(CATALOG_RESOURCE));

        for (const issue of catalog.issues) {
            this._logger?.warning(issue);
        }

        const availableExamples = G4ExampleBotsService.getAvailableExamples(catalog.examples, process.platform);

        if (availableExamples.length === 0) {
            void vscode.window.showWarningMessage('No example bots are available for this platform.');

            return;
        }

        // Use the examples a documentation link named, or let the user pick.
        const selectedExamples = await this.resolveSelectedExamples(availableExamples, commandArgument);

        if (selectedExamples.length === 0) {
            return;
        }

        // Write the chosen examples, asking before any existing file is replaced.
        const writtenPaths = await this.writeExamples(selectedExamples, projectRoot);
        const skippedCount = selectedExamples.length - writtenPaths.length;

        // Open a single added example in the workflow editor, so a documentation link lands on the bot itself.
        if (writtenPaths.length === 1) {
            await vscode.commands.executeCommand('Show-Workflow', {
                fileUri: vscode.Uri.file(writtenPaths[0]).toString()
            });
        }

        // Report the outcome once, naming the folder the examples went to.
        const skippedMessage = skippedCount > 0
            ? ` Skipped ${skippedCount}.`
            : '';
        const message = `Added ${writtenPaths.length} example bot(s) to src/bots/examples.${skippedMessage}`;

        void vscode.window.showInformationMessage(message);
    }

    /**
     * Registers the command with the VS Code command registry.
     */
    protected async onRegister(): Promise<void> {
        // Register the command callback that forwards execution to the base command flow.
        const disposable = vscode.commands.registerCommand(
            this.command,
            async (commandArgument: unknown) => {
                await this.invokeCommand(commandArgument);
            },
            this
        );

        // Track the command registration so it is disposed automatically when the extension unloads.
        this.context.subscriptions.push(disposable);
    }

    /**
     * Gets the short tag shown beside an example's name.
     *
     * @param example - The example.
     * @returns "no browser needed", "Windows only", or an empty text.
     */
    private static getExampleTag(example: ExampleBot): string {
        // A driver-free example is the quickest to try, so say that it needs no browser.
        if (example.driver === 'none') {
            return 'no browser needed';
        }

        // Name a Windows-only example, so a reader knows why it is missing on other machines.
        const isWindowsOnly = example.platforms.length === 1 && example.platforms[0] === 'win32';

        return isWindowsOnly
            ? 'Windows only'
            : '';
    }

    /**
     * Finds the project folder: the first workspace folder with a manifest.json, else the first workspace folder.
     *
     * @returns The absolute folder path, or undefined when no folder is open.
     */
    private static getProjectRoot(): string | undefined {
        // Prefer the folder that holds manifest.json, so a multi-root workspace writes into the G4 project.
        const folders = vscode.workspace.workspaceFolders ?? [];
        const projectFolder = folders.find(folder => fs.existsSync(path.join(folder.uri.fsPath, MANIFEST_FILE)));

        return (projectFolder ?? folders[0])?.uri.fsPath;
    }

    /**
     * Gets the bot text for an example in this project.
     *
     * @param example - The example.
     * @param projectRoot - The project folder.
     * @returns The branded bot text, with the base bot's driver settings when the example needs a driver.
     */
    private newContent(example: ExampleBot, projectRoot: string): string {
        // Read the packaged example, branded like the base bots New Project writes.
        const resourceName = G4ExampleBotsService.getResourceName(example);
        const exampleText = G4BrandingService.getJsonText(Utilities.getResource(resourceName));

        // Read the project's base bot when the example drives a browser or a desktop app.
        const baseBotPath = G4ExampleBotsService.getBaseBotPath(example, projectRoot);
        const isBaseBotPresent = baseBotPath !== undefined && fs.existsSync(baseBotPath);
        let baseBotText: string | undefined;

        if (isBaseBotPresent) {
            baseBotText = fs.readFileSync(baseBotPath as string, 'utf8');
        }

        // Apply the base driver settings, and say so when the example keeps its own.
        const result = G4ExampleBotsService.newExampleContent(exampleText, baseBotText);
        const isBaseMissing = baseBotPath !== undefined && !result.isBaseApplied;

        if (isBaseMissing) {
            this._logger?.warning(
                `"${example.name}" keeps its shipped driver settings: ${baseBotPath} is missing or not a bot.`
            );
        }

        return result.content;
    }

    /**
     * Gets the picker items: one "all of this group" item and one item per example, under a separator per group.
     *
     * @param examples - The available examples, in catalog order.
     * @returns The picker items.
     */
    private static newPickItems(examples: ExampleBot[]): ExamplePickItem[] {
        // Keep the catalog's group order, which is the order a reader learns in.
        const groups = [...new Set(examples.map(example => example.group))];
        const items: ExamplePickItem[] = [];

        for (const group of groups) {
            // Open each group with its separator and a row that adds the whole group at once.
            const groupExamples = examples.filter(example => example.group === group);

            items.push(
                { examples: [], kind: vscode.QuickPickItemKind.Separator, label: group },
                {
                    description: `${groupExamples.length} example(s)`,
                    examples: groupExamples,
                    label: `$(folder) All ${group} examples`
                }
            );

            // Then one row per example, tagged and described so the reader knows what it teaches.
            for (const example of groupExamples) {
                items.push({
                    description: AddExampleBotsCommand.getExampleTag(example),
                    detail: example.description,
                    examples: [example],
                    label: example.name
                });
            }
        }

        return items;
    }

    /**
     * Asks what to do with an example file that already exists.
     *
     * @param example - The example whose file exists.
     * @returns The chosen answer, or undefined when the dialog was closed (treated as skip).
     */
    private async readConflictAnswer(example: ExampleBot): Promise<string | undefined> {
        // A modal dialog keeps the decision in front of the user, and closing it counts as skip.
        const message = `The example "${example.name}" already exists in src/bots/examples. Overwrite it?`;

        return vscode.window.showWarningMessage(
            message,
            { modal: true },
            CONFLICT_ANSWERS.overwrite,
            CONFLICT_ANSWERS.skip,
            CONFLICT_ANSWERS.overwriteAll,
            CONFLICT_ANSWERS.skipAll
        );
    }

    /**
     * Resolves the examples to add: the ones a command argument names, or the ones the user picks.
     *
     * @param examples - The available examples.
     * @param commandArgument - The value the command was invoked with.
     * @returns The examples to add, without duplicates, in catalog order; empty when the user stopped.
     */
    private async resolveSelectedExamples(examples: ExampleBot[], commandArgument: unknown): Promise<ExampleBot[]> {
        // A documentation link names its examples, so no picker opens; an unknown id is reported, not guessed.
        const request = G4ExampleBotsService.getRequestedExamples(examples, commandArgument);

        const isUnknownRequested = request.isRequested && request.unknownIds.length > 0;

        if (isUnknownRequested) {
            const unknownList = request.unknownIds.join(', ');

            void vscode.window.showWarningMessage(`Unknown example bot(s): ${unknownList}.`);
        }

        if (request.isRequested) {
            return request.examples;
        }

        // Let the user tick examples or whole groups; the picker stays open when focus moves away.
        const picked = await vscode.window.showQuickPick(AddExampleBotsCommand.newPickItems(examples), {
            canPickMany: true,
            ignoreFocusOut: true,
            matchOnDescription: true,
            matchOnDetail: true,
            placeHolder: 'Choose the example bots to add to src/bots/examples'
        });

        const isNothingPicked = !picked || picked.length === 0;

        if (isNothingPicked) {
            return [];
        }

        // A group item and its examples may both be ticked; keep each example once, in catalog order.
        const pickedIds = new Set((picked ?? []).flatMap(item => item.examples.map(example => example.id)));

        return examples.filter(example => pickedIds.has(example.id));
    }

    /**
     * Writes the chosen examples into the project.
     *
     * @remarks
     * An existing file is replaced only after the user agrees; "Overwrite All" and "Skip All" answer the rest of
     * this run. An example whose base bot is missing keeps its shipped driver settings and is logged, so it is still
     * written. A file that cannot be written is logged and counted as skipped.
     *
     * @param examples - The examples to write.
     * @param projectRoot - The project folder.
     * @returns The paths that were written.
     */
    private async writeExamples(examples: ExampleBot[], projectRoot: string): Promise<string[]> {
        // Track what was written and any "All" answer, which decides every later conflict of this run.
        const writtenPaths: string[] = [];
        let blanketAnswer: string | undefined;

        for (const example of examples) {
            const targetPath = G4ExampleBotsService.getTargetPath(example, projectRoot);

            // Ask before replacing an existing file, unless an earlier "All" answer already decided.
            if (fs.existsSync(targetPath)) {
                const answer = blanketAnswer ?? await this.readConflictAnswer(example);
                const isBlanket = answer === CONFLICT_ANSWERS.overwriteAll || answer === CONFLICT_ANSWERS.skipAll;
                const isOverwrite = answer === CONFLICT_ANSWERS.overwrite || answer === CONFLICT_ANSWERS.overwriteAll;

                if (isBlanket) {
                    blanketAnswer = answer;
                }

                if (!isOverwrite) {
                    this._logger?.information(`Skipped the existing example ${targetPath}.`);
                    continue;
                }
            }

            // Give the example the driver settings of the project's base bot, and brand its default names.
            const content = this.newContent(example, projectRoot);

            // Create the group folder and write the file; a failure is logged and the next example still runs.
            try {
                fs.mkdirSync(path.dirname(targetPath), { recursive: true });
                fs.writeFileSync(targetPath, content, 'utf8');
                writtenPaths.push(targetPath);
                this._logger?.information(`Added the example ${targetPath}.`);
            } catch (error) {
                const reason = error instanceof Error ? error.message : 'Unknown error';

                this._logger?.error(`Could not write the example ${targetPath}: ${reason}`);
            }
        }

        return writtenPaths;
    }
}

// Compile-time contracts are kept after the executable code on purpose. Interfaces precede type aliases, and within
// each group a declaration's local dependency chain comes directly after it before A-Z sorting resumes.

/**
 * One picker row: a group separator, an "all of this group" row, or one example.
 */
interface ExamplePickItem extends vscode.QuickPickItem {
    /** The examples the row adds: none for a separator, the whole group, or one example. */
    examples: ExampleBot[];
}
