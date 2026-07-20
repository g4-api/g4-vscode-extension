import { spawn } from 'node:child_process';
import { Logger } from '../logging/logger';

/**
 * Runs a recorder's pre/post shell script around its start/stop, outside the automation body.
 *
 * @remarks
 * These scripts live only in `recorderSettings` and are executed by the extension host on the
 * developer machine; they are never serialized into a recorded automation. Execution is blocking:
 * the caller awaits the result and decides whether a failure aborts the recorder (pre) or is merely
 * surfaced (post). The shell resolution is kept pure and separate from the spawn so it can be unit
 * tested without touching the process table.
 */
export class G4RecorderScriptService {
    /** Default per-script timeout in milliseconds; a script exceeding it is killed and treated as failed. */
    private static readonly _defaultTimeoutMilliseconds: number = 30000;

    /**
     * Resolves a shell choice and inline script into a spawnable command and argument list.
     *
     * @remarks
     * Pure and deterministic so it can be unit tested. The script is passed as a single argument to
     * the interpreter (never through an OS shell), so the target interpreter alone parses it.
     *
     * @param shell - The interpreter to run the script with.
     * @param script - The inline script body.
     * @returns The command and arguments to spawn.
     */
    public static resolveShellInvocation(shell: RecorderScriptShell, script: string): ShellInvocation {
        // Map each supported shell to its non-interactive, no-profile invocation form.
        switch (shell) {
            case 'powershell':
                return { command: 'powershell.exe', args: ['-NoProfile', '-NonInteractive', '-Command', script] };

            case 'pwsh':
                return { command: 'pwsh', args: ['-NoProfile', '-NonInteractive', '-Command', script] };

            case 'bash':
                return { command: 'bash', args: ['-c', script] };

            case 'cmd':
                return { command: 'cmd.exe', args: ['/d', '/s', '/c', script] };

            default:
                // An unknown shell is a configuration error the caller must surface, not silently run.
                throw new Error(`Unsupported recorder script shell: '${shell}'.`);
        }
    }

    /**
     * Runs a recorder's pre/post script and reports whether it succeeded.
     *
     * @remarks
     * A disabled or empty script is a no-op that reports success so callers need no special-casing.
     * The call blocks until the script exits or the timeout kills it. Output is streamed to the
     * recorder logger; the exit code (and timeout) determine success.
     *
     * @param options - The script configuration and recorder context to run against.
     * @returns The execution outcome, including whether the script actually ran.
     */
    public static async runRecorderScript(options: RunRecorderScriptOptions): Promise<RecorderScriptResult> {
        const { configuration, phase, baseUrl, logger } = options;

        // Skip quietly when the script is disabled or empty; report success so callers never branch.
        const isEnabled = configuration?.enabled === true;
        const script = configuration?.script?.trim() ?? '';
        const isRunnable = isEnabled && script.length > 0;

        if (!isRunnable) {
            return { isExecuted: false, isSuccess: true, exitCode: null, isTimedOut: false };
        }

        // Resolve the interpreter invocation; an unsupported shell is a hard, surfaced failure.
        let invocation: ShellInvocation;

        try {
            invocation = G4RecorderScriptService.resolveShellInvocation(configuration.shell, script);
        } catch (error: unknown) {
            const message = G4RecorderScriptService.resolveErrorMessage(error);
            logger.error(`Cannot run ${phase}-script for recorder ${baseUrl}: ${message}`);
            return { isExecuted: true, isSuccess: false, exitCode: null, isTimedOut: false };
        }

        // Build the child environment and resolve the effective timeout before spawning.
        const environment = G4RecorderScriptService.newScriptEnvironment(options);
        const timeoutMilliseconds = options.timeoutMilliseconds ?? G4RecorderScriptService._defaultTimeoutMilliseconds;

        // Announce the run before blocking so a long or hung script is visible in the log.
        logger.information(`Running ${phase}-script (${configuration.shell}) for recorder ${baseUrl}...`);

        // Block on the interpreter and derive success from the exit code and timeout state.
        const { exitCode, isTimedOut } = await G4RecorderScriptService.invokeShell({
            command: invocation.command,
            args: invocation.args,
            environment,
            timeoutMilliseconds,
            logger
        });

        const isSuccess = !isTimedOut && exitCode === 0;

        // Report the outcome at the matching severity so failures are never silent.
        if (isTimedOut) {
            logger.error(`${phase}-script for recorder ${baseUrl} timed out after ${timeoutMilliseconds}ms.`);
        } else if (!isSuccess) {
            logger.error(`${phase}-script for recorder ${baseUrl} exited with code ${exitCode}.`);
        } else {
            logger.information(`${phase}-script for recorder ${baseUrl} completed successfully.`);
        }

        return { isExecuted: true, isSuccess, exitCode, isTimedOut };
    }

    /**
     * Spawns the interpreter, streams its output to the logger, and enforces the timeout.
     *
     * @remarks
     * Never rejects: a spawn error (for example a missing `pwsh`/`bash`) resolves as a failed run so
     * the caller's abort logic stays in one place. On timeout the child is force-killed and the run
     * is reported as timed out.
     *
     * @param options - The command, arguments, environment, timeout, and logger.
     * @returns The child's exit code (null when it could not run) and whether it was timed out.
     */
    private static invokeShell(options: {
        command: string;
        args: string[];
        environment: NodeJS.ProcessEnv;
        timeoutMilliseconds: number;
        logger: Logger;
    }): Promise<{ exitCode: number | null; isTimedOut: boolean }> {
        const { command, args, environment, timeoutMilliseconds, logger } = options;

        return new Promise(resolve => {
            // Spawn without an OS shell so the script string is not re-parsed by a second shell.
            const child = spawn(command, args, { env: environment, windowsHide: true });

            // Track a timeout kill so the close handler can distinguish it from a normal exit.
            let isTimedOut = false;

            const timer = setTimeout(() => {
                isTimedOut = true;
                child.kill('SIGKILL');
            }, timeoutMilliseconds);

            // Stream stdout/stderr to the recorder log so script output is visible during recording.
            child.stdout?.on('data', chunk => logger.information(String(chunk).trimEnd()));
            child.stderr?.on('data', chunk => logger.warning(String(chunk).trimEnd()));

            // A spawn failure (missing interpreter, etc.) resolves as a failed run rather than throwing.
            child.on('error', (error: Error) => {
                clearTimeout(timer);
                logger.error(`Failed to launch '${command}': ${error.message}`);
                resolve({ exitCode: null, isTimedOut });
            });

            // Normal completion: clear the timer and report the exit code (null when killed by signal).
            child.on('close', (code: number | null) => {
                clearTimeout(timer);
                resolve({ exitCode: code, isTimedOut });
            });
        });
    }

    /**
     * Builds the child environment: the inherited environment plus recorder context variables.
     *
     * @remarks
     * Scripts are session-scoped (no per-event payload), so only stable recorder identity is exposed
     * as `G4_RECORDER_*` / `G4_SESSION_*` variables the script can act on.
     *
     * @param options - The recorder context to expose to the script.
     * @returns The environment passed to the spawned interpreter.
     */
    private static newScriptEnvironment(options: RunRecorderScriptOptions): NodeJS.ProcessEnv {
        // Read the recorder's driver identity and friendly label defensively; both are optional.
        const driver = options.driverParameters?.driver ?? '';
        const label = options.driverParameters?.capabilities?.alwaysMatch?.['uia:options']?.label ?? '';

        return {
            ...process.env,
            G4_RECORDER_PHASE: options.phase,
            G4_RECORDER_BASE_URL: options.baseUrl,
            G4_RECORDER_MODE: options.mode ?? '',
            G4_RECORDER_DRIVER: driver,
            G4_RECORDER_LABEL: label,
            G4_SESSION_TIMESTAMP: new Date().toISOString()
        };
    }

    /**
     * Resolves a readable message from an unknown thrown value.
     *
     * @remarks
     * A `catch` clause types the caught value as `unknown`, which may be an Error, a string, or an
     * arbitrary object. Stringifying an object directly (via `String(value)` or a template literal)
     * yields the useless '[object Object]', so each case is narrowed first and only non-Error,
     * non-string values fall back to a JSON form (with a fixed label when serialization fails).
     *
     * @param error - The value caught in a catch clause.
     * @returns A readable message describing the error.
     */
    private static resolveErrorMessage(error: unknown): string {
        // An Error carries the intended message directly.
        if (error instanceof Error) {
            return error.message;
        }

        // A thrown string is already the message.
        if (typeof error === 'string') {
            return error;
        }

        // Any other thrown value gets a readable JSON form instead of default object stringification,
        // falling back to a fixed label when it cannot be serialized (for example a cyclic object).
        try {
            return JSON.stringify(error) ?? 'Unknown error';
        } catch {
            return 'Unknown error';
        }
    }
}

// Compile-time contracts are kept below the executable class per the project style: interfaces
// first, then type aliases. They model the recorder-script configuration and the runner's inputs
// and outputs.

/**
 * A recorder's inline pre or post script configuration, as stored under a recorder entry.
 */
export interface RecorderScriptConfiguration {
    /** Whether the script runs; when false the runner is a no-op. */
    enabled: boolean;

    /** Interpreter used to run the script. */
    shell: RecorderScriptShell;

    /** Inline script body executed by the interpreter. */
    script: string;
}

/**
 * The outcome of a single recorder-script run.
 */
export interface RecorderScriptResult {
    /** True when the script actually ran (enabled and non-empty), false when it was skipped. */
    isExecuted: boolean;

    /** True when the script ran to a zero exit code within the timeout, or when it was skipped. */
    isSuccess: boolean;

    /** Exit code of the interpreter, or null when it could not run or was killed by signal. */
    exitCode: number | null;

    /** True when the script exceeded its timeout and was force-killed. */
    isTimedOut: boolean;
}

/**
 * A spawnable interpreter command and its arguments.
 */
export interface ShellInvocation {
    /** Executable to spawn (for example `powershell.exe`). */
    command: string;

    /** Arguments passed to the executable, with the script body as a single argument. */
    args: string[];
}

/**
 * The recorder context and script configuration for one runner invocation.
 */
export interface RunRecorderScriptOptions {
    /** Whether this is the pre-recording or post-recording script. */
    phase: RecorderScriptPhase;

    /** The script configuration to run. */
    configuration: RecorderScriptConfiguration | undefined;

    /** The recorder endpoint the script belongs to (host:port), exposed to the script and logs. */
    baseUrl: string;

    /** The recorder capture mode, exposed to the script. */
    mode?: string;

    /** The recorder driver parameters, read for the driver identity and label exposed to the script. */
    driverParameters?: any;

    /** Optional override for the per-script timeout in milliseconds. */
    timeoutMilliseconds?: number;

    /** Logger the script output and outcome are written to. */
    logger: Logger;
}

/** Which side of the recording lifecycle a script runs on. */
export type RecorderScriptPhase = 'pre' | 'post';

/** Supported interpreters for a recorder script. */
export type RecorderScriptShell = 'powershell' | 'pwsh' | 'bash' | 'cmd';
