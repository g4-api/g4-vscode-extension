/*
 * Starts and stops the agent process of an autonomous run.
 *
 * RESOURCES:
 * Node child processes: https://nodejs.org/api/child_process.html
 * cmd.exe quoting (/s keeps the text between the outer quotes): cmd /?
 */
import * as path from 'node:path';

import {
    execFile,
    spawn
} from 'node:child_process';

import type { ChildProcess } from 'node:child_process';

// Characters cmd.exe expands or that end a quoted argument even inside quotes, so no argument may hold them.
// Linear: one character class, matched once.
const UNSAFE_BATCH_ARGUMENT_PATTERN = /["%\r\n\0]/;

// Batch launcher extensions; they cannot be started without cmd.exe.
const BATCH_EXTENSIONS = new Set(['.bat', '.cmd']);

/**
 * One running agent process: its output arrives line by line, and it can be stopped with its whole tree.
 *
 * @remarks
 * Owns the child process from start to exit. Arguments are always passed as a list: a native executable
 * gets them straight from Node, and a batch launcher (a sandbox partition's `start-*.cmd`) is started by
 * `cmd.exe /d /s /c` with every argument quoted after it is checked for characters cmd.exe would expand,
 * the same rule G4 Golem applies. The prompt is written to standard input, then input is closed. Stopping
 * kills the whole process tree, because a launcher starts the real tool as a grandchild and the tool
 * starts its own shells.
 */
export class G4AutonomousProcess {
    /** The child process; set by {@link start}. */
    private _child: ChildProcess | undefined;

    /** Resolves with the exit code (null when killed by a signal or never started) once the process ends. */
    private _exited: Promise<number | null> = Promise.resolve(null);

    /** Whether the process has ended, so a stop after exit does nothing. */
    private _isExited = false;

    /**
     * Resolves once the process has ended, with its exit code (null when killed or when it never started).
     */
    public get exited(): Promise<number | null> {
        return this._exited;
    }

    /**
     * Builds the command and arguments that start an executable, through cmd.exe for a batch launcher.
     *
     * @remarks
     * Compute-only, so the quoting is unit tested. `/d` skips AutoRun commands, `/s` keeps the text
     * between the outer quotes as is, and every part is quoted, so spaces in a path or an argument stay
     * in one argument. Characters that would still be expanded or would end a quote are refused.
     *
     * @param executable - The tool executable or the partition launcher.
     * @param argumentsList - The arguments.
     * @returns The command to spawn, its arguments, and whether they must be passed verbatim.
     * @throws {Error} When a batch argument holds a character cmd.exe would expand.
     */
    public static getInvocation(executable: string, argumentsList: string[]): ProcessInvocation {
        // A native executable takes the argument list as is.
        const isBatch = BATCH_EXTENSIONS.has(path.extname(executable).toLowerCase());

        if (!isBatch) {
            return { command: executable, argumentsList, isVerbatim: false };
        }

        // Refuse what cmd.exe would expand or what would end a quoted argument early. A trailing
        // backslash is refused too, since the tool would read `\"` as an escaped quote.
        const parts = [executable, ...argumentsList];
        const unsafePart = parts.find((part) => {
            const isUnsafe = UNSAFE_BATCH_ARGUMENT_PATTERN.exec(part) !== null || part.endsWith('\\');

            return isUnsafe;
        });

        if (unsafePart !== undefined) {
            throw new Error(`The argument "${unsafePart}" holds a character a launcher cannot pass on safely.`);
        }

        // Quote every part and wrap the whole line in one more pair of quotes for /s.
        const commandLine = parts.map((part) => `"${part}"`).join(' ');

        return {
            command: process.env.ComSpec ?? 'cmd.exe',
            argumentsList: ['/d', '/s', '/c', `"${commandLine}"`],
            isVerbatim: true
        };
    }

    /**
     * Starts the process and streams its output.
     *
     * @remarks
     * Never throws for a process that cannot start: the failure is reported through `onError` and
     * `exited` resolves with null, so the caller has one place to finish the run. Output is split into
     * lines; a partial last line is delivered when the stream ends.
     *
     * @param options - The executable, arguments, prompt, environment, working folder, and line handlers.
     * @throws {Error} When a batch argument holds a character cmd.exe would expand.
     */
    public start(options: ProcessStartOptions): void {
        // Resolve the command line first, so an unsafe argument fails before anything starts.
        const invocation = G4AutonomousProcess.getInvocation(options.executable, options.argumentsList);

        // Start without a shell of our own, hidden, with the run environment.
        const child = spawn(invocation.command, invocation.argumentsList, {
            cwd: options.workingDirectory,
            env: options.environment,
            windowsHide: true,
            windowsVerbatimArguments: invocation.isVerbatim
        });

        this._child = child;

        // Track the end of the process once; a start failure ends it too.
        this._exited = new Promise((resolve) => {
            const onExit = (exitCode: number | null): void => {
                if (this._isExited) {
                    return;
                }

                this._isExited = true;
                resolve(exitCode);
            };

            child.on('error', (error: Error) => {
                options.onError(`Failed to start "${options.executable}": ${error.message}`);
                onExit(null);
            });

            child.on('close', (exitCode: number | null) => {
                onExit(exitCode);
            });
        });

        // Deliver standard output and standard error line by line.
        G4AutonomousProcess.startLineReader(child.stdout, options.onOutputLine);
        G4AutonomousProcess.startLineReader(child.stderr, options.onErrorLine);

        // Hand the prompt over on standard input, then close it so the tool starts working. A tool that
        // exits before reading it closes the pipe; that error is not a run failure on its own.
        child.stdin?.on('error', () => undefined);

        child.stdin?.end(options.inputText, 'utf8');
    }

    /**
     * Stops the process and every process it started, then waits for it to end.
     *
     * @remarks
     * `taskkill /T /F` ends the whole tree on Windows (launcher, tool, and the shells the tool opened);
     * elsewhere the child is killed. Does nothing when the process already ended.
     *
     * @returns A promise that resolves once the process has ended.
     */
    public async stop(): Promise<void> {
        // Only a started process that has not ended can be stopped.
        const child = this._child;
        const isRunning = child !== undefined && !this._isExited && child.pid !== undefined;

        if (!isRunning) {
            return;
        }

        // End the whole tree; a failed taskkill falls back to killing the child itself.
        if (process.platform === 'win32') {
            await new Promise<void>((resolve) => {
                execFile('taskkill', ['/PID', `${child.pid}`, '/T', '/F'], { windowsHide: true }, (error) => {
                    if (error) {
                        child.kill();
                    }

                    resolve();
                });
            });
        } else {
            child.kill('SIGKILL');
        }

        // Return only once the process is gone, so the caller can close the run safely.
        await this._exited;
    }

    /**
     * Splits a stream into lines and delivers each one.
     *
     * @remarks
     * Data arrives in chunks that can end mid-line, so the unfinished tail is kept until the next chunk
     * or the end of the stream. Line endings `\n` and `\r\n` are both accepted.
     *
     * @param stream - The output stream; nothing happens when it is absent.
     * @param onLine - Receives each line without its line ending.
     */
    private static startLineReader(stream: NodeJS.ReadableStream | null, onLine: (line: string) => void): void {
        if (!stream) {
            return;
        }

        // Read text, and keep the unfinished end of the last chunk until the rest arrives.
        let pending = '';

        stream.setEncoding('utf8');

        stream.on('data', (chunk: string) => {
            // Deliver every complete line and keep the unfinished tail.
            const lines = (pending + chunk).split('\n');
            pending = lines.pop() ?? '';

            for (const line of lines) {
                const lineText = line.endsWith('\r')
                    ? line.slice(0, -1)
                    : line;

                onLine(lineText);
            }
        });

        stream.on('end', () => {
            // Deliver a last line that had no line ending.
            if (pending.length > 0) {
                onLine(pending);
                pending = '';
            }
        });
    }
}

// Compile-time contracts are kept after the executable code: interfaces come before type aliases, and within
// each group a declaration is followed by the contracts it depends on, otherwise the order is A-Z.

/**
 * How to spawn an executable.
 */
export interface ProcessInvocation {
    /** The arguments to spawn the command with. */
    argumentsList: string[];

    /** The command to spawn: the executable itself, or cmd.exe for a batch launcher. */
    command: string;

    /** Whether the arguments are already quoted and must be passed to Windows as they are. */
    isVerbatim: boolean;
}

/**
 * Options for starting an agent process.
 */
export interface ProcessStartOptions {
    /** The arguments, without the executable. */
    argumentsList: string[];

    /** The full environment of the process. */
    environment: NodeJS.ProcessEnv;

    /** The tool executable or the partition launcher. */
    executable: string;

    /** The text written to standard input before it is closed: the run brief. */
    inputText: string;

    /** Receives a start failure, such as a missing executable. */
    onError: (message: string) => void;

    /** Receives each standard error line. */
    onErrorLine: (line: string) => void;

    /** Receives each standard output line. */
    onOutputLine: (line: string) => void;

    /** The folder the process starts in; a partition launcher changes to its own folder anyway. */
    workingDirectory: string;
}
