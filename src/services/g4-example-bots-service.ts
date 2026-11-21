/*
 * The example bots: a catalog of ready-to-run bots shipped with the extension, added to a project only on request.
 *
 * Each example is one bot file under resources.examples/bots, listed in resources.examples/bots/catalog.json with its
 * group, its name, what it teaches, the driver it needs and the platforms it runs on. The Add Example Bots command
 * asks this service which examples fit the machine, where each one goes in the project, and what content to write.
 * An example that drives a browser or a desktop app takes its driver settings from the project's own base bot, so it
 * runs against the same sandbox as every other bot in that project. Nothing here touches the disk or VS Code: the
 * command reads and writes, this service only decides.
 */
import * as path from 'node:path';

// The folder under the project's src folder that holds the base bots written by New Project.
const BASE_BOTS_FOLDER = 'base.bots';

// The base bot whose driver settings each driver kind copies; a driver-free example needs none.
const BASE_BOT_FILES: Record<ExampleDriverKind, string | undefined> = {
    chrome: 'chrome-automation-base.json',
    none: undefined,
    uia: 'uia-automation-base.json'
};

// The folder under the project's src/bots folder the examples are written to, one subfolder per group.
const EXAMPLES_FOLDER = 'examples';

// The driver kinds a catalog entry may name.
const EXAMPLE_DRIVER_KINDS = new Set<string>(['chrome', 'none', 'uia']);

// The number of spaces the written bot JSON is indented with, matching the shipped base bots.
const JSON_INDENT_SPACES = 4;

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
     * @param projectRoot - The project folder that holds manifest.json and src.
     * @returns The absolute base bot path, or undefined for a driver-free example that keeps its own settings.
     */
    public static getBaseBotPath(example: ExampleBot, projectRoot: string): string | undefined {
        // A driver-free example (no browser, no desktop app) runs on its own settings.
        const baseBotFile = BASE_BOT_FILES[example.driver];

        if (baseBotFile === undefined) {
            return undefined;
        }

        return path.join(projectRoot, 'src', BASE_BOTS_FOLDER, baseBotFile);
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
                issues.push(`Example entry ${index + 1} is missing a valid id, group, name, description or driver.`);
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
     * @param projectRoot - The project folder that holds manifest.json and src.
     * @returns The absolute path, such as "<project>/src/bots/examples/loops/for-loop-index.json".
     */
    public static getTargetPath(example: ExampleBot, projectRoot: string): string {
        return path.join(projectRoot, 'src', 'bots', EXAMPLES_FOLDER, ...example.id.split('/')) + '.json';
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

    // Keep only text platform names; a missing list means every platform.
    const platforms = Array.isArray(record.platforms)
        ? record.platforms.filter((platform): platform is string => typeof platform === 'string')
        : [];

    return {
        description: description as string,
        driver: driver as ExampleDriverKind,
        group: group as string,
        id,
        name: name as string,
        platforms
    };
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
 * The driver an example needs: Chrome, the UIA desktop driver, or none (driver-free bots such as HTTP calls).
 */
export type ExampleDriverKind = 'chrome' | 'none' | 'uia';
