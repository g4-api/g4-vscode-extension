/*
 * Reads the autonomous run settings (`settings.autonomousSettings`) from the project manifest.
 *
 * RESOURCES:
 * Partition launchers: E:\ai-agents-sandbox\partitions\<name>\start-<harness>.cmd
 */
import * as path from 'node:path';

import type { RecorderOptions } from './g4-recording-service';

// Folder, relative to the workspace, that holds one subfolder per autonomous run when the manifest names none.
const DEFAULT_RUNS_FOLDER = 'autonomous-runs';

// Longest run, in minutes, when the manifest sets no timeout; the agent is stopped when it is reached.
const DEFAULT_TIMEOUT_MINUTES = 60;

// File extensions of Windows batch launchers. A harness started through one runs inside its sandbox partition.
const LAUNCHER_EXTENSIONS = new Set(['.bat', '.cmd']);

// The agent command-line tools the extension can drive.
const HARNESS_TYPES = new Set<string>(['claude', 'codex', 'opencode']);

// Driver name shown for a recorder whose manifest entry does not name its driver.
const UNKNOWN_DRIVER_TEXT = 'Recorder';

/**
 * Resolves the autonomous run settings of the project manifest into a checked, typed form.
 *
 * @remarks
 * The manifest is the only home of extension settings, so the harnesses (which agent tool to start, where
 * it lives, and which models and efforts it offers) are read from `settings.autonomousSettings`. A harness
 * whose executable is a `.cmd`/`.bat` partition launcher runs sandboxed (the launcher points the agent's
 * home, config, and temp folders into the partition); any other executable runs on this machine with the
 * user's own login. Entries that cannot run are reported as issues instead of being dropped silently.
 */
export class G4AutonomousSettings {
    /**
     * Names a recorder for people: its capability label and driver, or the driver alone.
     *
     * @remarks
     * Compute-only. Reads the first `<vendor>:options` object under `capabilities.alwaysMatch` that has a
     * text `label`, so UIA (`uia:options`) and other recorder families are named alike; a recorder whose
     * driver is not named is called "Recorder".
     *
     * @param recorder - The recorder resolved from the manifest.
     * @returns The name, for example `machine-a (UiaDriver)`.
     */
    public static getRecorderName(recorder: RecorderOptions): string {
        // Name the recorder by its driver; a missing or non-text driver gets a generic name.
        const driver = G4AutonomousSettings.convertToText(recorder.driverParameters?.driver) || UNKNOWN_DRIVER_TEXT;
        const alwaysMatch = recorder.driverParameters?.capabilities?.alwaysMatch;
        const isAlwaysMatchObject = alwaysMatch !== null && typeof alwaysMatch === 'object';
        const entries = isAlwaysMatchObject ? Object.entries(alwaysMatch as Record<string, unknown>) : [];

        // Prefer the label the user gave the recorder in its vendor options.
        for (const [key, options] of entries) {
            const label = G4AutonomousSettings.convertToText((options as { label?: unknown } | null)?.label);
            const isVendorOptions = key.endsWith(':options');

            if (isVendorOptions && label.length > 0) {
                return `${label} (${driver})`;
            }
        }

        return driver;
    }

    /**
     * Reads the autonomous run settings from a manifest snapshot.
     *
     * @remarks
     * Compute-only. Missing values get defaults; a harness without a known type, a name, or an executable
     * is left out and described in `issues`, so the page can say why the harness list is shorter than the
     * manifest's. Model and effort lists keep their order and lose blank and repeated entries.
     *
     * @param manifest - The project manifest snapshot.
     * @returns The resolved settings and the issues found.
     */
    public static resolveAutonomousSettings(manifest: any): AutonomousSettings {
        // Read the section defensively; a manifest saved before this feature has none.
        const section = manifest?.settings?.autonomousSettings ?? {};
        const entries: unknown[] = Array.isArray(section.harnesses) ? section.harnesses : [];
        const harnesses: AutonomousHarness[] = [];
        const issues: string[] = [];

        // Resolve each harness; an entry that cannot run becomes an issue, not a harness.
        entries.forEach((entry, index) => {
            const resolution = G4AutonomousSettings.resolveHarness(entry, index);

            if (resolution.issue) {
                issues.push(resolution.issue);
                return;
            }

            harnesses.push(resolution.harness as AutonomousHarness);
        });

        // A repeated harness name would make the page's choice ambiguous, so the later entry is dropped.
        const uniqueHarnesses = harnesses.filter((harness, index) => {
            const isFirstWithName = harnesses.findIndex((other) => other.name === harness.name) === index;

            if (!isFirstWithName) {
                issues.push(`Harness "${harness.name}" is listed more than once; only the first entry is used.`);
            }

            return isFirstWithName;
        });

        // Fall back to the defaults for the run folder and the timeout.
        const runsFolder = G4AutonomousSettings.convertToText(section.runsFolder) || DEFAULT_RUNS_FOLDER;
        const timeoutMinutes = Number(section.timeoutMinutes);
        const isTimeoutValid = Number.isFinite(timeoutMinutes) && timeoutMinutes > 0;

        return {
            harnesses: uniqueHarnesses,
            issues,
            runsFolder,
            timeoutMinutes: isTimeoutValid
                ? timeoutMinutes
                : DEFAULT_TIMEOUT_MINUTES
        };
    }

    /**
     * Tests whether a harness executable is a sandbox partition launcher.
     *
     * @remarks
     * Compute-only. Partition launchers are Windows batch files (`start-claude.cmd` and the like) that
     * load the partition environment before starting the real tool, so the file extension decides.
     *
     * @param executable - The harness executable path or command.
     * @returns True for a `.cmd` or `.bat` launcher.
     */
    public static testSandboxLauncher(executable: string): boolean {
        return LAUNCHER_EXTENSIONS.has(path.extname(executable).toLowerCase());
    }

    /**
     * Narrows a manifest value to trimmed text.
     *
     * @remarks
     * Compute-only. Anything but text becomes an empty string, so an object never reaches a name or a
     * path as '[object Object]'.
     *
     * @param value - The manifest value.
     * @returns The trimmed text, or an empty string.
     */
    private static convertToText(value: unknown): string {
        return typeof value === 'string'
            ? value.trim()
            : '';
    }

    /**
     * Narrows a manifest list to its distinct, non-blank text entries.
     *
     * @remarks
     * Compute-only. Order is kept, so the first model or effort of the list is the page's default.
     *
     * @param value - The manifest list.
     * @returns The cleaned list; empty when the value is not a list.
     */
    private static getTextList(value: unknown): string[] {
        const entries: unknown[] = Array.isArray(value) ? value : [];
        const texts = entries
            .map((entry) => G4AutonomousSettings.convertToText(entry))
            .filter((entry) => entry.length > 0);

        return [...new Set(texts)];
    }

    /**
     * Resolves one manifest harness entry, or explains why it cannot run.
     *
     * @remarks
     * Compute-only. The type and the executable are required; the name defaults to the type and the
     * position, so a minimal entry still shows up in the page.
     *
     * @param entry - The manifest entry.
     * @param index - The entry's position, used in the default name and in issues.
     * @returns The harness, or the issue that kept it out.
     */
    private static resolveHarness(entry: unknown, index: number): HarnessResolution {
        // Only an object can describe a harness.
        const isObject = entry !== null && typeof entry === 'object' && !Array.isArray(entry);
        const position = index + 1;

        if (!isObject) {
            return { issue: `Harness ${position} is not an object and was skipped.` };
        }

        // The type selects the command line and the output reader, so it must be one the extension knows.
        const harness = entry as Record<string, unknown>;
        const type = G4AutonomousSettings.convertToText(harness.type).toLowerCase();

        if (!HARNESS_TYPES.has(type)) {
            return { issue: `Harness ${position} has an unknown type "${type}"; use claude, codex, or opencode.` };
        }

        // Without an executable there is nothing to start.
        const executable = G4AutonomousSettings.convertToText(harness.executable);
        const name = G4AutonomousSettings.convertToText(harness.name) || `${type} ${position}`;

        if (executable.length === 0) {
            return { issue: `Harness "${name}" has no executable and was skipped.` };
        }

        return {
            harness: {
                arguments: G4AutonomousSettings.getTextList(harness.arguments),
                efforts: G4AutonomousSettings.getTextList(harness.efforts),
                executable,
                isSandbox: G4AutonomousSettings.testSandboxLauncher(executable),
                models: G4AutonomousSettings.getTextList(harness.models),
                name,
                requiredToolServers: G4AutonomousSettings.getTextList(harness.requiredToolServers),
                type: type as AutonomousHarnessType
            }
        };
    }
}

// Compile-time contracts are kept after the executable code: interfaces come before type aliases, and within
// each group a declaration is followed by the contracts it depends on, otherwise the order is A-Z.

/**
 * The autonomous run settings, resolved from `settings.autonomousSettings`.
 */
export interface AutonomousSettings {
    /** The harnesses that can run, in manifest order, with unique names. */
    harnesses: AutonomousHarness[];

    /** Why manifest entries were left out; empty when every entry is usable. */
    issues: string[];

    /** The folder, relative to the workspace (or absolute), that receives one subfolder per run. */
    runsFolder: string;

    /** The longest a run may take, in minutes, before the agent is stopped. */
    timeoutMinutes: number;
}

/**
 * The outcome of resolving one manifest harness entry: the harness, or the issue that kept it out.
 */
interface HarnessResolution {
    /** The usable harness; absent when the entry has an issue. */
    harness?: AutonomousHarness;

    /** Why the entry cannot run; absent when it is usable. */
    issue?: string;
}

/**
 * One agent command-line tool the user can start a run with.
 */
export interface AutonomousHarness {
    /** Extra arguments placed before the extension's own, for example a permission mode on a machine run. */
    arguments: string[];

    /** The reasoning efforts offered for this harness; the first is the default, empty means the tool's own. */
    efforts: string[];

    /** The partition launcher (`.cmd`/`.bat`, sandboxed) or the tool executable (this machine). */
    executable: string;

    /** Whether the executable is a partition launcher, so the agent runs inside its sandbox. */
    isSandbox: boolean;

    /** The models offered for this harness; the first is the default, empty means the tool's own. */
    models: string[];

    /** The unique display name, also the value the page sends back. */
    name: string;

    /**
     * The agent tool servers (MCP servers, by name) the run cannot do without, for example the recorder server
     * that offers the screen tools; a Claude run stops at once when one of them does not connect. Empty means
     * nothing is checked.
     */
    requiredToolServers: string[];

    /** Which tool this is; selects the command line and the output reader. */
    type: AutonomousHarnessType;
}

/** The agent command-line tools the extension can drive. */
export type AutonomousHarnessType = 'claude' | 'codex' | 'opencode';
