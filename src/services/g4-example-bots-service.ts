/*
 * The example bots: a catalog of ready-to-run bots shipped with the extension, added to a project only on request.
 *
 * Each example is one bot file under resources.examples/bots, listed in resources.examples/bots/catalog.json with its
 * group, its name, what it teaches, the driver it needs and the platforms it runs on. The Add Example Bots command
 * asks this service which examples fit the machine, where each one goes in the project, and what content to write.
 * An example that drives a browser or a desktop app takes its driver settings from the project's own base bot, so it
 * runs against the same sandbox as every other bot in that project. An example can also name companion files, such
 * as the environment it reads, which are added to the project with it. Nothing here touches the disk or VS Code:
 * the command reads and writes, this service only decides.
 *
 * The project folder, in every path here, is the folder that holds manifest.json. New Project creates it as
 * <project>/src and opens it in VS Code, so the bots, base.bots and bots.examples folders sit directly inside it.
 */
import * as path from 'node:path';

// The folder inside the project folder that holds the base bots written by New Project.
const BASE_BOTS_FOLDER = 'base.bots';

// The base bot whose driver settings each driver kind copies. A driver-free example needs none, and an Android
// example keeps the settings it ships with, because New Project writes no Android base bot.
const BASE_BOT_FILES: Record<ExampleDriverKind, string | undefined> = {
    android: undefined,
    chrome: 'chrome-automation-base.json',
    none: undefined,
    uia: 'uia-automation-base.json'
};

// The folder inside the project folder the examples are written to, one subfolder per group. It sits beside the
// bots folder, so the examples stay apart from the user's own bots, and is created with the first example.
const EXAMPLES_FOLDER = 'bots.examples';

// The packaged folder every companion file of an example must come from.
const COMPANION_RESOURCE_ROOT = 'resources.examples/';

// The characters one path segment of a companion file may hold: letters, digits, dots, hyphens and underscores.
// A single character class with one quantifier runs in linear time; "." and ".." are refused separately.
const COMPANION_SEGMENT_PATTERN = /^[A-Za-z0-9._-]+$/;

// The driver kinds a catalog entry may name.
const EXAMPLE_DRIVER_KINDS = new Set<string>(['android', 'chrome', 'none', 'uia']);

// The number of spaces the written bot JSON is indented with, matching the shipped base bots.
const JSON_INDENT_SPACES = 4;

// The file that marks the project folder.
const MANIFEST_FILE = 'manifest.json';

// The folder New Project creates inside the folder the user chose; it becomes the project folder.
const SOURCE_FOLDER = 'src';

// The fewest segments an example id has: its group folder and its file name, as in "loops/for-loop-index".
const MINIMUM_EXAMPLE_ID_SEGMENTS = 2;

// The characters one example id segment may hold: lowercase letters, digits and hyphens. A single character class
// with one quantifier runs in linear time; the hyphen placement rules are checked with plain string tests.
const EXAMPLE_ID_SEGMENT_PATTERN = /^[a-z0-9-]+$/;

/**
 * Decides which example bots are offered, where each is written, and what content it gets.
 *
 * @remarks
 * Compute-only: every function takes text or values and returns a new value, so the command owns all file and
 * user-interface work and the rules here are unit-tested without VS Code.
 */
export class G4ExampleBotsService {
    /** The name of the folder, inside the project folder, the examples are written to; named in messages. */
    public static readonly examplesFolder = EXAMPLES_FOLDER;

    /**
     * Gets the examples of the catalog that run on a platform, in catalog order.
     *
     * @param examples - The catalog examples.
     * @param platform - The Node platform name of this machine, such as "win32" or "linux".
     * @returns The examples with no platform limit or with this platform among their platforms.
     */
    public static getAvailableExamples(examples: ExampleBot[], platform: string): ExampleBot[] {
        return examples.filter(example => {
            // An empty platform list means the example runs everywhere.
            const isUnlimited = example.platforms.length === 0;

            return isUnlimited || example.platforms.includes(platform);
        });
    }

    /**
     * Gets the base bot file whose driver settings an example copies.
     *
     * @param example - The example to add.
     * @param projectFolder - The project folder: the folder that holds manifest.json and base.bots.
     * @returns The absolute base bot path, or undefined for a driver-free example that keeps its own settings.
     */
    public static getBaseBotPath(example: ExampleBot, projectFolder: string): string | undefined {
        // A driver-free example (no browser, no desktop app) runs on its own settings.
        const baseBotFile = BASE_BOT_FILES[example.driver];

        if (baseBotFile === undefined) {
            return undefined;
        }

        return path.join(projectFolder, BASE_BOTS_FOLDER, baseBotFile);
    }

    /**
     * Gets the project path a companion file of an example is written to.
     *
     * @param companion - The companion file.
     * @param projectFolder - The project folder: the folder that holds manifest.json and bots.
     * @returns The absolute path, such as "<project folder>/environments/ExampleLogin.json".
     */
    public static getCompanionTargetPath(companion: ExampleCompanion, projectFolder: string): string {
        return path.join(projectFolder, ...companion.target.split('/'));
    }

    /**
     * Reads the example catalog text into its examples, keeping only well-formed entries.
     *
     * @remarks
     * A broken entry is dropped and reported instead of failing the whole catalog, so one bad line in a release
     * never hides every other example.
     *
     * @param catalogText - The text of resources.examples/bots/catalog.json.
     * @returns The well-formed examples in catalog order, and one issue line per dropped entry.
     */
    public static getCatalog(catalogText: string): ExampleCatalog {
        // An unreadable catalog offers nothing, and says why.
        let catalogValue: unknown;

        try {
            catalogValue = JSON.parse(catalogText);
        } catch (error) {
            return { examples: [], issues: [`The example catalog is not valid JSON: ${resolveErrorMessage(error)}`] };
        }

        const entries = (catalogValue as { examples?: unknown; } | null)?.examples;

        if (!Array.isArray(entries)) {
            return { examples: [], issues: ['The example catalog has no "examples" list.'] };
        }

        // Keep each well-formed entry once, and name every entry that is dropped.
        const examples: ExampleBot[] = [];
        const issues: string[] = [];
        const knownIds = new Set<string>();

        for (const [index, entry] of entries.entries()) {
            const example = convertToExampleBot(entry);

            if (example === undefined) {
                issues.push(`Example entry ${index + 1} is missing a valid id, group, name, description, driver or companion.`);
                continue;
            }

            if (knownIds.has(example.id)) {
                issues.push(`Example "${example.id}" is listed more than once; only the first entry is kept.`);
                continue;
            }

            knownIds.add(example.id);
            examples.push(example);
        }

        return { examples, issues };
    }

    /**
     * Finds the project folder among the folders open in VS Code.
     *
     * @remarks
     * The project folder is the folder that holds manifest.json. VS Code normally has that folder itself open,
     * because New Project opens <project>/src; a user can also open the folder above it, where the manifest is
     * one level down in src. Each open folder is tried both ways, in order, so a multi-root workspace writes
     * into its G4 project. Without any manifest, the first open folder is used the way the rest of the extension
     * reads it: the folder itself when it is named src, otherwise its src folder.
     *
     * @param workspaceFolders - The absolute paths of the folders open in VS Code, in workspace order.
     * @param testFile - Tells whether a file exists; the command passes the file system's own test.
     * @returns The absolute project folder, or undefined when no folder is open.
     */
    public static getProjectFolder(workspaceFolders: string[], testFile: (filePath: string) => boolean): string | undefined {
        // Try each open folder as the project folder itself, then as the folder above it.
        const candidates = workspaceFolders.flatMap(folder => [folder, path.join(folder, SOURCE_FOLDER)]);
        const projectFolder = candidates.find(candidate => testFile(path.join(candidate, MANIFEST_FILE)));

        if (projectFolder !== undefined) {
            return projectFolder;
        }

        // No manifest anywhere: without an open folder there is no project.
        const firstFolder = workspaceFolders[0];

        if (firstFolder === undefined) {
            return undefined;
        }

        // Fall back to where the extension expects the project inside the first open folder.
        const isSourceFolder = path.basename(firstFolder).toLowerCase() === SOURCE_FOLDER;

        return isSourceFolder
            ? firstFolder
            : path.join(firstFolder, SOURCE_FOLDER);
    }

    /**
     * Gets the examples a command argument names, in catalog order.
     *
     * @remarks
     * The command accepts one id (from a documentation link), a list of ids, or `{ ids }`. Any other argument, such
     * as the folder URI the Explorer menu passes, names nothing, so the command falls back to the picker.
     *
     * @param examples - The available examples.
     * @param commandArgument - The value the command was invoked with.
     * @returns The named examples, and the requested ids that match no available example.
     */
    public static getRequestedExamples(examples: ExampleBot[], commandArgument: unknown): ExampleRequest {
        // Collect the requested ids from whichever argument shape was used.
        const requestedIds = convertToRequestedIds(commandArgument);

        if (requestedIds.length === 0) {
            return { examples: [], isRequested: false, unknownIds: [] };
        }

        // Keep catalog order for the matches, and report the ids that match nothing.
        const requestedIdSet = new Set(requestedIds);
        const knownIds = new Set(examples.map(example => example.id));

        return {
            examples: examples.filter(example => requestedIdSet.has(example.id)),
            isRequested: true,
            unknownIds: requestedIds.filter(id => !knownIds.has(id))
        };
    }

    /**
     * Gets the packaged resource name of an example's bot file.
     *
     * @param example - The example.
     * @returns The resource name, such as "resources.examples/bots/loops/for-loop-index.json".
     */
    public static getResourceName(example: ExampleBot): string {
        return `resources.examples/bots/${example.id}.json`;
    }

    /**
     * Gets the project path an example is written to.
     *
     * @param example - The example.
     * @param projectFolder - The project folder: the folder that holds manifest.json and bots.
     * @returns The absolute path, such as "<project folder>/bots.examples/loops/for-loop-index.json".
     */
    public static getTargetPath(example: ExampleBot, projectFolder: string): string {
        return path.join(projectFolder, EXAMPLES_FOLDER, ...example.id.split('/')) + '.json';
    }

    /**
     * Gets the bot text to write for an example, with the driver settings of the project's base bot.
     *
     * @remarks
     * Only `driverParameters` is copied: the example keeps its own settings, stages and rules. When the base bot is
     * missing or unreadable, the example keeps the driver settings it ships with and the result says so, so the
     * command can warn instead of failing.
     *
     * @param exampleText - The packaged example bot text.
     * @param baseBotText - The project's base bot text, or undefined when there is none or the example needs none.
     * @returns The bot text to write, and whether the base bot's driver settings were applied.
     */
    public static newExampleContent(exampleText: string, baseBotText: string | undefined): ExampleContent {
        // Without a base bot, the example is written exactly as shipped.
        if (baseBotText === undefined) {
            return { content: exampleText, isBaseApplied: false };
        }

        // Both files must be JSON objects for the driver settings to move from one to the other.
        const exampleBot = convertFromJsonObject(exampleText);
        const baseBot = convertFromJsonObject(baseBotText);
        const baseDriverParameters = baseBot?.driverParameters;
        const isBaseUsable = exampleBot !== undefined && baseDriverParameters !== undefined;

        if (!isBaseUsable) {
            return { content: exampleText, isBaseApplied: false };
        }

        // Replace the example's driver settings with the project's, keeping every other part of the example.
        const updatedBot = { ...exampleBot, driverParameters: structuredClone(baseDriverParameters) };

        return {
            content: JSON.stringify(updatedBot, null, JSON_INDENT_SPACES) + '\n',
            isBaseApplied: true
        };
    }
}

/**
 * Reads JSON text that must hold an object.
 *
 * @param text - The JSON text.
 * @returns The object, or undefined when the text is not JSON or not an object.
 */
function convertFromJsonObject(text: string): Record<string, unknown> | undefined {
    // Parse and accept only a plain object, so a list or a primitive is never treated as a bot.
    try {
        const value: unknown = JSON.parse(text);
        const isObject = typeof value === 'object' && value !== null && !Array.isArray(value);

        return isObject
            ? value as Record<string, unknown>
            : undefined;
    } catch {
        // Text that is not JSON is no bot either; the caller falls back to the shipped example.
        return undefined;
    }
}

/**
 * Converts one catalog entry into an example, or undefined when a field is missing or invalid.
 *
 * @param entry - The raw catalog entry.
 * @returns The example, with its platforms defaulting to none (runs everywhere).
 */
function convertToExampleBot(entry: unknown): ExampleBot | undefined {
    // Only an object can be an entry.
    const isObject = typeof entry === 'object' && entry !== null;

    if (!isObject) {
        return undefined;
    }

    const record = entry as Record<string, unknown>;
    const { description, driver, group, id, name } = record;

    // Every text field is required, the id must be a safe slug path, and the driver must be a known kind.
    const isTextComplete = [description, group, name].every(value => typeof value === 'string' && value.trim() !== '');
    const isIdValid = typeof id === 'string' && testExampleId(id);
    const isDriverValid = typeof driver === 'string' && EXAMPLE_DRIVER_KINDS.has(driver);

    if (!isTextComplete || !isIdValid || !isDriverValid) {
        return undefined;
    }

    // A companion that is not well formed drops the whole entry, so an example is never added half complete.
    const companions = convertToExampleCompanions(record.companions);

    if (companions === undefined) {
        return undefined;
    }

    // Keep only text platform names; a missing list means every platform.
    const platforms = Array.isArray(record.platforms)
        ? record.platforms.filter((platform): platform is string => typeof platform === 'string')
        : [];

    return {
        companions,
        description: description as string,
        driver: driver as ExampleDriverKind,
        group: group as string,
        id,
        name: name as string,
        platforms
    };
}

/**
 * Converts the companions of a catalog entry into companion files.
 *
 * @param companions - The raw `companions` value of the entry.
 * @returns The companion files, none for a missing list, or undefined when any companion is not well formed.
 */
function convertToExampleCompanions(companions: unknown): ExampleCompanion[] | undefined {
    // Most examples are a bot file alone.
    if (companions === undefined) {
        return [];
    }

    if (!Array.isArray(companions)) {
        return undefined;
    }

    // Every companion needs a packaged resource and a safe place in the project.
    const exampleCompanions: ExampleCompanion[] = [];

    for (const companion of companions) {
        const { resource, target } = (companion ?? {}) as { resource?: unknown; target?: unknown; };
        const isResourceValid = typeof resource === 'string'
            && resource.startsWith(COMPANION_RESOURCE_ROOT)
            && testCompanionPath(resource);
        const isTargetValid = typeof target === 'string' && testCompanionPath(target);

        if (!isResourceValid || !isTargetValid) {
            return undefined;
        }

        exampleCompanions.push({ resource: resource as string, target: target as string });
    }

    return exampleCompanions;
}

/**
 * Converts a command argument into the example ids it requests.
 *
 * @param commandArgument - One id, a list of ids, `{ ids }`, or anything else.
 * @returns The requested ids, trimmed and without empty or non-text values.
 */
function convertToRequestedIds(commandArgument: unknown): string[] {
    // Accept the three shapes; everything else requests nothing.
    let values: unknown[] = [];

    if (typeof commandArgument === 'string') {
        values = [commandArgument];
    } else if (Array.isArray(commandArgument)) {
        values = commandArgument;
    } else if (typeof commandArgument === 'object' && commandArgument !== null) {
        const ids = (commandArgument as { ids?: unknown; }).ids;

        values = Array.isArray(ids) ? ids : [];
    }

    // Keep only non-empty text ids, trimmed, so a stray space in a documentation link still matches.
    return values
        .filter((value): value is string => typeof value === 'string')
        .map(value => value.trim())
        .filter(value => value !== '');
}

/**
 * Resolves a readable message from a caught value.
 *
 * @param error - The caught value.
 * @returns The error message, the text itself, or a JSON form.
 */
function resolveErrorMessage(error: unknown): string {
    // An Error carries its own message, and a thrown text is the message.
    if (error instanceof Error) {
        return error.message;
    }

    if (typeof error === 'string') {
        return error;
    }

    // Any other thrown value gets a readable JSON form instead of default object stringification.
    try {
        return JSON.stringify(error) ?? 'Unknown error';
    } catch {
        return 'Unknown error';
    }
}

/**
 * Tests whether a text is a safe relative file path: plain segments joined by "/".
 *
 * @remarks
 * A segment that is empty, "." or "..", or that holds a character outside letters, digits, dots, hyphens and
 * underscores, is refused. The path can therefore never be absolute and never climb out of the folder it is
 * joined to.
 *
 * @param relativePath - The candidate path, such as "environments/ExampleLogin.json".
 * @returns True when every segment is plain.
 */
function testCompanionPath(relativePath: string): boolean {
    return relativePath.split('/').every(segment => {
        const isPlainText = COMPANION_SEGMENT_PATTERN.exec(segment) !== null;
        const isClimbing = segment === '.' || segment === '..';

        return isPlainText && !isClimbing;
    });
}

/**
 * Tests whether a text is a safe example id: two or more slug segments joined by "/".
 *
 * @remarks
 * Each segment is lowercase letters, digits and single inner hyphens, so the id is safe as a relative path and can
 * never climb out of the examples folder ("..", empty or absolute segments are refused).
 *
 * @param id - The candidate id, such as "loops/for-loop-index".
 * @returns True when the id is well formed.
 */
function testExampleId(id: string): boolean {
    // Split into the group folder and file segments; one segment alone has no group folder.
    const segments = id.split('/');

    if (segments.length < MINIMUM_EXAMPLE_ID_SEGMENTS) {
        return false;
    }

    // Every segment must be slug characters with no leading, trailing or doubled hyphen.
    return segments.every(segment => {
        const isSlugText = EXAMPLE_ID_SEGMENT_PATTERN.exec(segment) !== null;
        const isHyphenPlacementValid = !segment.startsWith('-') && !segment.endsWith('-') && !segment.includes('--');

        return isSlugText && isHyphenPlacementValid;
    });
}

// Compile-time contracts are kept after the executable code on purpose. Interfaces precede type aliases, and within
// each group a declaration's local dependency chain comes directly after it before A-Z sorting resumes.

/**
 * One example bot of the catalog.
 */
export interface ExampleBot {
    /** The files added to the project with the example, such as the environment it reads; usually none. */
    companions: ExampleCompanion[];

    /** What the example does and teaches, shown under its name in the picker. */
    description: string;

    /** The driver the example needs, which decides the base bot its driver settings come from. */
    driver: ExampleDriverKind;

    /** The picker group the example is listed under, such as "Loops". */
    group: string;

    /** The slug path of the example, such as "loops/for-loop-index"; also its resource and project path. */
    id: string;

    /** The display name of the example in the picker. */
    name: string;

    /** The Node platform names the example runs on; empty means every platform. */
    platforms: string[];
}

/**
 * One file that is added to the project together with an example.
 *
 * @remarks
 * An example that reads an environment ships that environment as a companion, so the example is complete after one
 * command. A companion is user data once it is in the project, so an existing file is never replaced.
 */
export interface ExampleCompanion {
    /** The packaged resource name of the file, such as "resources.examples/environments/ExampleLogin.json". */
    resource: string;

    /** The path of the file inside the project folder, such as "environments/ExampleLogin.json". */
    target: string;
}

/**
 * The examples read from the catalog, with the entries that were dropped.
 */
export interface ExampleCatalog {
    /** The well-formed examples, in catalog order. */
    examples: ExampleBot[];

    /** One line per dropped entry, for the extension log. */
    issues: string[];
}

/**
 * The bot text to write for one example.
 */
export interface ExampleContent {
    /** The bot JSON text. */
    content: string;

    /** True when the project's base bot driver settings replaced the shipped ones. */
    isBaseApplied: boolean;
}

/**
 * The examples a command argument names.
 */
export interface ExampleRequest {
    /** The available examples the argument names, in catalog order. */
    examples: ExampleBot[];

    /** True when the argument named examples, so the picker is skipped. */
    isRequested: boolean;

    /** The requested ids that match no available example. */
    unknownIds: string[];
}

/**
 * The driver an example needs: Android through Appium, Chrome, the UIA desktop driver, or none (driver-free bots
 * such as HTTP calls).
 */
export type ExampleDriverKind = 'android' | 'chrome' | 'none' | 'uia';
