import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { EventCaptureOptions } from '../clients/g4-signalr-client';
import { G4ServiceHealth } from './g4-service-health';

// Gives sandboxed recorder services the same bounded startup window used by the hub service.
const RECORDER_START_TIMEOUT_MILLISECONDS = 30000;

/**
 * Starts sandboxed G4 recorder services when a recorder endpoint is not already running.
 */
export class G4RecorderSandboxService {
    /**
     * Starts every configured recorder service that is offline and backed by a valid sandbox.
     *
     * @param options - Recorder startup options resolved by the Start-Recorder command.
     * @returns One result per recorder endpoint that needed inspection.
     *
     * @remarks
     * Activation must never start recorders. This method is command-owned and performs side effects
     * only after the user starts recording and sandbox use is enabled for that start attempt.
     */
    public static async startFromOptionsWhenRequired(
        options: G4RecorderSandboxStartOptions
    ): Promise<G4RecorderSandboxStartResult[]> {
        // Validate the sandbox once before touching any recorder endpoint.
        const sandboxPath = this.getTrimmedText(options.sandboxPath);
        const isSandboxConfigured = sandboxPath.length > 0;
        const isSandboxAvailable = isSandboxConfigured && fs.existsSync(sandboxPath);

        if (!isSandboxAvailable) {
            return options.recorders.map(recorder => this.newSkippedResult({
                baseUri: recorder.baseUrl,
                driver: recorder.driverParameters?.driver || 'Unknown',
                message: 'Recorder sandbox startup skipped because the configured sandbox folder was not found.'
            }));
        }

        // Check recorders concurrently so one offline endpoint does not delay the rest of the start command.
        const startupTasks = options.recorders.map(recorder =>
            this.startRecorderWhenRequired(sandboxPath, recorder)
        );

        return Promise.all(startupTasks);
    }

    /**
     * Formats a copyable command-line command for starting a sandboxed recorder manually.
     *
     * @param recorderPaths - Runtime paths used to start the recorder process.
     * @returns A command that launches the recorder with the sandboxed dotnet runtime.
     */
    private static getSandboxRecorderCommand(recorderPaths: G4SandboxRecorderPaths): string {
        // Show the complete launcher command for the current platform.
        const isWindows = os.platform() === 'win32';

        if (isWindows) {
            const launcherCommand = this.getSandboxRecorderLauncherCommand(recorderPaths);

            return `cmd.exe /d /c ${launcherCommand}`;
        }

        // Unix-like platforms start from the recorder directory with the absolute dotnet executable.
        const recorderDirectory = this.getUnixCommandArgument(recorderPaths.recorderDirectory);
        const dotnetPath = this.getUnixCommandArgument(recorderPaths.dotnetPath);

        return `cd ${recorderDirectory} && ${dotnetPath} ${recorderPaths.recorderFileName}`;
    }

    /**
     * Formats the Windows CMD launcher command that opens the recorder in its own process.
     *
     * @param recorderPaths - Runtime paths used to start the recorder process.
     * @returns The `start` command body passed to `cmd.exe /c`.
     */
    private static getSandboxRecorderLauncherCommand(recorderPaths: G4SandboxRecorderPaths): string {
        // Use an empty title so CMD does not treat the first quoted argument as the executable.
        const windowTitle = this.getWindowsCommandArgument('');

        // `start` uses /D as the working directory and launches the path produced by Node path joining.
        const recorderDirectory = this.getWindowsCommandArgument(path.normalize(recorderPaths.recorderDirectory));
        const dotnetPath = this.getWindowsCommandArgument(path.normalize(recorderPaths.dotnetPath));

        return `start ${windowTitle} /D ${recorderDirectory} ${dotnetPath} ${recorderPaths.recorderFileName}`;
    }

    /**
     * Resolves the sandboxed dotnet executable and recorder DLL paths.
     *
     * @param sandboxPath - Absolute sandbox root from the project manifest.
     * @param recorderFileName - Recorder DLL file name selected from the recorder driver.
     * @returns Runtime paths needed to spawn the recorder process.
     */
    private static getSandboxRecorderPaths(
        sandboxPath: string,
        recorderFileName: string
    ): G4SandboxRecorderPaths[] {
        // Resolve the platform-specific dotnet executable from the shared sandbox runtime.
        const dotnetFileName = os.platform() === 'win32'
            ? 'dotnet.exe'
            : 'dotnet';
        const dotnetPath = path.join(sandboxPath, 'runtime', 'dotnet', dotnetFileName);

        // Resolve candidate recorder folders from the bot-utilities bundle.
        const recorderDirectories = this.getSandboxRecorderDirectories(sandboxPath, recorderFileName);

        // Return candidate paths together so validation and command formatting use one consistent model.
        return recorderDirectories.map(recorderDirectory => ({
            dotnetPath,
            recorderDirectory,
            recorderFileName,
            recorderPath: path.join(recorderDirectory, recorderFileName)
        }));
    }

    /**
     * Resolves the sandbox recorder DLL for a recorder driver.
     *
     * @param driver - Recorder driver name from the manifest.
     * @returns The recorder DLL name, or an empty string when the driver is unsupported.
     */
    private static getSandboxRecorderFileName(driver: string): string {
        // Match Chromium-like drivers first so ChromeDriver starts the Chromium recorder.
        const normalizedDriver = driver.trim().toLowerCase();
        const isChromiumRecorder = normalizedDriver.includes('chrome') ||
            normalizedDriver.includes('chromium');

        if (isChromiumRecorder) {
            return 'ChromiumPeek.dll';
        }

        // UIA recorders use the UI Automation recorder process.
        const isUiaRecorder = normalizedDriver.includes('uia');

        if (isUiaRecorder) {
            return 'UiaPeek.dll';
        }

        // Unknown drivers cannot be mapped to a sandbox recorder process safely.
        return '';
    }

    /**
     * Normalizes optional manifest text values.
     *
     * @param value - Optional value to trim.
     * @returns The trimmed text, or an empty string when the value is not configured.
     */
    private static getTrimmedText(value: string | undefined): string {
        const isValueConfigured = value !== null && value !== undefined;

        if (!isValueConfigured) {
            return '';
        }

        // Return a trimmed value so validation can rely on non-padded text.
        return value.trim();
    }

    /**
     * Resolves candidate recorder directories for a sandbox recorder DLL.
     *
     * @param sandboxPath - Absolute sandbox root from the project manifest.
     * @param recorderFileName - Recorder DLL file name selected from the recorder driver.
     * @returns Candidate directories that may contain the recorder DLL.
     */
    private static getSandboxRecorderDirectories(
        sandboxPath: string,
        recorderFileName: string
    ): string[] {
        // Chromium recorder assets are expected in the chromium peek bundle.
        const chromiumPeekDirectory = path.join(sandboxPath, 'bot-utilities', 'chromium-peek-x64');

        if (recorderFileName !== 'UiaPeek.dll') {
            return [chromiumPeekDirectory];
        }

        // Existing Windows sandboxes ship UIA peek under a dedicated folder.
        const uiaPeekDirectory = path.join(sandboxPath, 'bot-utilities', 'uia-peek-win-x64');

        return [
            chromiumPeekDirectory,
            uiaPeekDirectory
        ];
    }

    /**
     * Quotes one argument for Unix-like diagnostic command output.
     *
     * @param value - Raw command argument value.
     * @returns The quoted argument value.
     */
    private static getUnixCommandArgument(value: string): string {
        // Keep the escaped backslash: POSIX single-quote escaping closes, writes \', then reopens.
        const escapedValue = value.replaceAll("'", "'\\''"); // NOSONAR

        return `'${escapedValue}'`;
    }

    /**
     * Quotes one argument for Windows CMD command output.
     *
     * @param value - Raw command argument value.
     * @returns The quoted argument value.
     */
    private static getWindowsCommandArgument(value: string): string {
        // CMD escapes embedded double quotes by doubling them inside the quoted argument.
        const escapedValue = value.replaceAll('"', '""');

        return `"${escapedValue}"`;
    }

    /**
     * Creates the Windows CMD process arguments used to launch a sandboxed recorder.
     *
     * @param recorderPaths - Runtime paths used to start the recorder process.
     * @returns Arguments passed to `cmd.exe`.
     */
    private static getWindowsProcessArguments(recorderPaths: G4SandboxRecorderPaths): string[] {
        // Normalize generated paths before passing them as command arguments to CMD.
        const recorderDirectory = path.normalize(recorderPaths.recorderDirectory);
        const dotnetPath = path.normalize(recorderPaths.dotnetPath);

        return [
            '/d',
            '/c',
            'start',
            '',
            '/D',
            recorderDirectory,
            dotnetPath,
            recorderPaths.recorderFileName
        ];
    }

    /**
     * Creates a skipped startup result for one recorder endpoint.
     *
     * @param options - Skipped result fields.
     * @returns A recorder startup result marked as not ready.
     */
    private static newSkippedResult(options: G4SkippedRecorderResultOptions): G4RecorderSandboxStartResult {
        return {
            baseUri: options.baseUri,
            driver: options.driver,
            isReady: false,
            isStarted: false,
            message: options.message
        };
    }

    /**
     * Starts one recorder process when its ping endpoint is offline.
     *
     * @param sandboxPath - Absolute sandbox root from the project manifest.
     * @param recorder - Recorder endpoint option from the Start-Recorder command.
     * @returns Startup result for the inspected recorder endpoint.
     */
    private static async startRecorderWhenRequired(
        sandboxPath: string,
        recorder: EventCaptureOptions
    ): Promise<G4RecorderSandboxStartResult> {
        // Resolve the endpoint and driver because both are needed for ping and process selection.
        const baseUri = this.getTrimmedText(recorder.baseUrl);
        const driver = this.getTrimmedText(recorder.driverParameters?.driver);

        if (!baseUri) {
            return this.newSkippedResult({
                baseUri,
                driver,
                message: 'Recorder sandbox startup skipped because the recorder endpoint is incomplete.'
            });
        }

        // If the recorder already answers ping, leave it alone and continue recording startup.
        const isRecorderRunning = await G4ServiceHealth.testPing(baseUri);

        if (isRecorderRunning) {
            return {
                baseUri,
                driver,
                isReady: true,
                isStarted: false
            };
        }

        // Resolve the recorder executable from the configured driver.
        const recorderFileName = this.getSandboxRecorderFileName(driver);

        if (!recorderFileName) {
            return this.newSkippedResult({
                baseUri,
                driver,
                message: `Recorder sandbox startup skipped because driver '${driver || 'Unknown'}' is unsupported.`
            });
        }

        // Spawn the sandboxed recorder and wait briefly for the ping endpoint to come online.
        const launchResult = this.startSandboxedRecorder(sandboxPath, recorderFileName);

        if (!launchResult.isStarted) {
            const message = launchResult.message ||
                `Recorder sandbox startup failed before launch for ${baseUri}.`;
            const endpointMessage = `${message} Endpoint: ${baseUri}.`;

            return this.newSkippedResult({
                baseUri,
                driver,
                message: endpointMessage
            });
        }

        // Once a process is spawned, wait briefly so callers know whether startup reached the ping endpoint.
        const isReady = await G4ServiceHealth.waitForPing(
            baseUri,
            RECORDER_START_TIMEOUT_MILLISECONDS
        );

        return {
            baseUri,
            driver,
            isReady,
            isStarted: launchResult.isStarted,
            message: isReady
                ? undefined
                : `Recorder sandbox process started but ${baseUri} did not answer ping in time.`
        };
    }

    /**
     * Starts the sandboxed dotnet host for a recorder DLL.
     *
     * @param sandboxPath - Absolute sandbox root from the project manifest.
     * @param recorderFileName - Recorder DLL file name selected from the recorder driver.
     * @returns Launch result with optional asset diagnostics.
     */
    private static startSandboxedRecorder(
        sandboxPath: string,
        recorderFileName: string
    ): G4SandboxRecorderLaunchResult {
        // Resolve the concrete runtime paths before validating whether the sandbox can be started.
        const candidateRecorderPaths = this.getSandboxRecorderPaths(sandboxPath, recorderFileName);
        const recorderPaths = candidateRecorderPaths.find(candidatePath =>
            fs.existsSync(candidatePath.recorderPath)
        ) || candidateRecorderPaths[0];

        // Missing runtime assets mean the sandbox is not usable for recorder auto-start.
        const isDotnetAvailable = fs.existsSync(recorderPaths.dotnetPath);
        const isRecorderAvailable = fs.existsSync(recorderPaths.recorderPath);
        const isSandboxRecorderAvailable = isDotnetAvailable && isRecorderAvailable;

        if (!isSandboxRecorderAvailable) {
            return {
                isStarted: false,
                message: this.getSandboxRecorderMissingAssetsMessage(candidateRecorderPaths)
            };
        }

        try {
            // Emit a copyable command before spawning so startup failures can be reproduced manually.
            const command = this.getSandboxRecorderCommand(recorderPaths);
            console.info(`Starting G4 Recorder with command: ${command}`);

            // Start through CMD on Windows so `start` creates the real recorder process outside VS Code.
            const isWindows = os.platform() === 'win32';
            const processName = isWindows
                ? 'cmd.exe'
                : recorderPaths.dotnetPath;
            const processArguments = isWindows
                ? this.getWindowsProcessArguments(recorderPaths)
                : [recorderPaths.recorderPath];

            const onRecorderProcessError = (error: Error): void => {
                // Surface launcher failures that would otherwise be hidden by detached startup.
                console.error(`G4 Recorder launcher failed: ${error.message}`);
            };

            const onRecorderProcessExit = (code: number | null, signal: NodeJS.Signals | null): void => {
                // CMD exits after `start`; non-zero exit or signal means the launcher itself failed.
                const isCleanExit = code === 0 && signal === null;

                if (isCleanExit) {
                    console.info('G4 Recorder launcher completed.');
                    return;
                }

                console.error(`G4 Recorder launcher exited with code ${code} and signal ${signal}.`);
            };

            // Detach the recorder so VS Code is not tied to the child process lifetime.
            const recorderProcess = spawn(processName, processArguments, {
                cwd: recorderPaths.recorderDirectory,
                detached: true,
                stdio: 'ignore',
                windowsHide: false
            });

            // Observe launcher failure/completion before releasing the process handle.
            recorderProcess.once('error', onRecorderProcessError);
            recorderProcess.once('exit', onRecorderProcessExit);

            // Unreference the child process so VS Code can exit without waiting for the recorder.
            recorderProcess.unref();

            // A successful spawn only proves the process was created; ping polling verifies readiness later.
            return {
                isStarted: true
            };
        } catch (error: unknown) {
            // Startup failures are reported by the caller through a VS Code warning.
            const errorMessage = error instanceof Error
                ? error.message
                : String(error);

            return {
                isStarted: false,
                message: `Recorder sandbox launcher failed before process creation: ${errorMessage}`
            };
        }
    }

    /**
     * Creates a precise missing-asset message for recorder startup validation failures.
     *
     * @param candidateRecorderPaths - Candidate runtime paths inspected before launch.
     * @returns Human-readable diagnostics for the missing sandbox assets.
     */
    private static getSandboxRecorderMissingAssetsMessage(
        candidateRecorderPaths: G4SandboxRecorderPaths[]
    ): string {
        // Resolve the dotnet path from the first candidate because all candidates share the runtime.
        const dotnetPath = candidateRecorderPaths[0]?.dotnetPath || '';
        const isDotnetAvailable = dotnetPath.length > 0 && fs.existsSync(dotnetPath);
        const missingAssets: string[] = [];

        if (!isDotnetAvailable) {
            missingAssets.push(`dotnet runtime not found at ${dotnetPath || '<empty>'}`);
        }

        // Report every candidate recorder DLL path when none of them exists.
        const isAnyRecorderAvailable = candidateRecorderPaths.some(candidatePath =>
            fs.existsSync(candidatePath.recorderPath)
        );

        if (!isAnyRecorderAvailable) {
            const recorderPaths = candidateRecorderPaths
                .map(candidatePath => candidatePath.recorderPath)
                .join('; ');

            missingAssets.push(`recorder DLL not found at ${recorderPaths}`);
        }

        const messageSuffix = missingAssets.length > 0
            ? missingAssets.join('; ')
            : 'unknown missing sandbox asset';

        return `Recorder sandbox startup failed before launch. Missing sandbox assets: ${messageSuffix}.`;
    }
}

/**
 * Startup options for sandboxed recorder services.
 */
export type G4RecorderSandboxStartOptions = {
    /** Enabled recorder endpoints that should be checked before SignalR connection startup. */
    recorders: EventCaptureOptions[];

    /** Absolute sandbox root that contains runtime and bot-utilities folders. */
    sandboxPath?: string;
};

/**
 * Result for one sandbox recorder startup attempt.
 */
export type G4RecorderSandboxStartResult = {
    /** Recorder endpoint inspected by the startup flow. */
    baseUri: string;

    /** Driver name used to select the recorder DLL. */
    driver: string;

    /** True when the endpoint answered ping after inspection or startup. */
    isReady: boolean;

    /** True when this call spawned a recorder process. */
    isStarted: boolean;

    /** Optional human-readable warning or diagnostic message. */
    message?: string;
};

/**
 * Runtime file-system paths required to start one sandboxed recorder process.
 */
type G4SandboxRecorderPaths = {
    /** Absolute path to the sandboxed dotnet executable for the current platform. */
    dotnetPath: string;

    /** Absolute path to the directory that must be used as the recorder working directory. */
    recorderDirectory: string;

    /** Recorder DLL file name selected for the configured driver. */
    recorderFileName: string;

    /** Absolute path to the selected recorder DLL inside the sandbox. */
    recorderPath: string;
};

/**
 * Result for validating and spawning one sandboxed recorder process.
 */
type G4SandboxRecorderLaunchResult = {
    /** True when the recorder launcher process was spawned. */
    isStarted: boolean;

    /** Optional diagnostics when validation or process creation failed. */
    message?: string;
};

/**
 * Fields used to create a skipped recorder startup result.
 */
type G4SkippedRecorderResultOptions = {
    /** Recorder endpoint inspected by the startup flow. */
    baseUri: string;

    /** Driver name used to select the recorder DLL. */
    driver: string;

    /** Human-readable reason for skipping startup. */
    message: string;
};
