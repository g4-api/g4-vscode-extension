import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawn } from 'node:child_process';
import { G4ServiceHealth } from './g4-service-health';

// Keeps startup responsive while still giving a freshly spawned hub time to bind the port.
const HUB_START_TIMEOUT_MILLISECONDS = 30000;

/**
 * Starts the sandboxed G4 Hub process when the manifest points to a local sandbox and
 * the configured G4 server is not already answering ping requests.
 */
export class G4HubService {
    /**
     * Resolves the configured G4 server base URI from a project manifest.
     *
     * @param manifest - The parsed workspace project manifest.
     * @returns The base URI in `schema://host:port` form, or an empty string when incomplete.
     *
     * @remarks
     * Uses compute-only manifest input because URI resolution should not depend on extension state.
     */
    public static getBaseUri(manifest: G4ProjectManifest): string {
        // Normalize server fields before validation so whitespace-only values skip auto-start.
        const schema = this.getTrimmedText(manifest.g4Server?.schema);
        const host = this.getTrimmedText(manifest.g4Server?.host);

        // Normalize the port separately because manifests may store it as either a string or number.
        const port = manifest.g4Server?.port;
        const isPortPresent = port !== null && port !== undefined;
        const portText = isPortPresent
            ? `${port}`.trim()
            : '';

        // Validate each part separately so partial manifests continue through the normal activation loop.
        const isSchemaConfigured = schema.length > 0;
        const isHostConfigured = host.length > 0;
        const isPortConfigured = isPortPresent && portText.length > 0;
        const isServerConfigured = isSchemaConfigured && isHostConfigured && isPortConfigured;

        if (!isServerConfigured) {
            return '';
        }

        // Return only fully configured endpoints so callers can skip connection work safely.
        return `${schema}://${host}:${portText}`;
    }

    /**
     * Checks the configured server and starts the sandboxed hub only when needed.
     *
     * @param manifest - The parsed workspace project manifest.
     * @returns True when the hub is reachable after this method completes; otherwise false.
     *
     * @remarks
     * Uses compute-only manifest input for configuration and explicit process spawning only after
     * the sandbox path and ping state prove that startup is required.
     */
    public static async startFromManifestWhenRequired(manifest: G4ProjectManifest): Promise<boolean> {
        // Auto-start is only valid when both server and sandbox values are configured.
        const baseUri = this.getBaseUri(manifest);
        const sandboxPath = this.getSandboxPath(manifest);
        const isBaseUriConfigured = baseUri.length > 0;
        const isSandboxConfigured = sandboxPath.length > 0;

        if (!isBaseUriConfigured || !isSandboxConfigured) {
            return false;
        }

        // Skip auto-start when the sandbox folder is not present on this machine.
        if (!fs.existsSync(sandboxPath)) {
            return false;
        }

        // If the server is already alive, leave it alone and let normal activation continue.
        const isHubRunning = await G4ServiceHealth.testPing(baseUri);

        if (isHubRunning) {
            return true;
        }

        // Start the sandboxed hub and wait briefly for the ping endpoint to come online.
        const isStarted = this.startSandboxedHub(sandboxPath);

        if (!isStarted) {
            return false;
        }

        // Once a process is spawned, wait briefly so callers know whether startup reached the ping endpoint.
        return G4ServiceHealth.waitForPing(baseUri, HUB_START_TIMEOUT_MILLISECONDS);
    }

    /**
     * Formats a copyable command-line command for starting the sandboxed hub manually.
     *
     * @param hubPaths - Runtime paths used to start the G4 Hub process.
     * @returns A command that sets the working directory and invokes the hub.
     *
     * @remarks
     * Uses compute-only path input so diagnostics can show the exact command without starting a process.
     */
    private static getSandboxHubCommand(hubPaths: G4SandboxHubPaths): string {
        // Show the complete launcher command for the current platform.
        const isWindows = os.platform() === 'win32';

        if (isWindows) {
            const launcherCommand = this.getSandboxHubLauncherCommand(hubPaths);

            return `cmd.exe /d /c ${launcherCommand}`;
        }

        // Linux starts from the hub directory but uses the absolute sandboxed dotnet executable.
        const hubDirectory = this.getUnixCommandArgument(hubPaths.hubDirectory);
        const dotnetPath = this.getUnixCommandArgument(hubPaths.dotnetPath);

        return `cd ${hubDirectory} && ${dotnetPath} G4.Services.Hub.dll`;
    }

    /**
     * Formats the Windows CMD launcher command that opens G4 Hub in its own process.
     *
     * @param hubPaths - Runtime paths used to start the G4 Hub process.
     * @returns The `start` command body passed to `cmd.exe /c`.
     *
     * @remarks
     * Uses compute-only path input so the spawned command and the debug command stay identical.
     */
    private static getSandboxHubLauncherCommand(hubPaths: G4SandboxHubPaths): string {
        // Use an empty title so CMD does not treat the first quoted argument as the executable.
        const windowTitle = this.getWindowsCommandArgument('');

        // `start` uses /D as the working directory and launches the path produced by Node path joining.
        const hubDirectory = this.getWindowsCommandArgument(path.normalize(hubPaths.hubDirectory));
        const dotnetPath = this.getWindowsCommandArgument(path.normalize(hubPaths.dotnetPath));

        // `/min` launches the hub console minimized so it is visible on the taskbar (and can be
        // restored) without stealing foreground focus from VS Code.
        return `start ${windowTitle} /min /D ${hubDirectory} ${dotnetPath} G4.Services.Hub.dll`;
    }

    /**
     * Resolves the platform-specific dotnet and hub paths inside a sandbox root.
     *
     * @param sandboxPath - Absolute sandbox root from the project manifest.
     * @returns The runtime paths needed to spawn G4 Hub.
     *
     * @remarks
     * Uses compute-only path input so process startup can validate paths before creating side effects.
     */
    private static getSandboxHubPaths(sandboxPath: string): G4SandboxHubPaths {
        // Resolve platform-specific dotnet and hub paths from the sandbox layout.
        const dotnetFileName = os.platform() === 'win32'
            ? 'dotnet.exe'
            : 'dotnet';
        const dotnetPath = path.join(sandboxPath, 'runtime', 'dotnet', dotnetFileName);
        const hubPath = path.join(sandboxPath, 'g4-hub', 'G4.Services.Hub.dll');
        const hubDirectory = path.dirname(hubPath);

        // Return all paths together so validation and command formatting use one consistent resolution.
        return {
            dotnetPath,
            hubDirectory,
            hubPath
        };
    }

    /**
     * Resolves a usable sandbox path from a project manifest.
     *
     * @param manifest - The parsed workspace project manifest.
     * @returns The trimmed sandbox path, or an empty string when sandbox startup is not configured.
     *
     * @remarks
     * Uses compute-only manifest input because sandbox path normalization should not touch the file system.
     */
    private static getSandboxPath(manifest: G4ProjectManifest): string {
        // Normalize the sandbox string before validation so whitespace-only values do not reach fs checks.
        const sandboxPath = this.getTrimmedText(manifest.sandbox);
        const isSandboxConfigured = sandboxPath.length > 0;

        if (!isSandboxConfigured) {
            return '';
        }

        // Return the normalized path only after validation so fs checks never receive whitespace-only input.
        return sandboxPath;
    }

    /**
     * Normalizes optional manifest text values.
     *
     * @param value - Optional manifest value to trim.
     * @returns The trimmed text, or an empty string when the value is not configured.
     *
     * @remarks
     * Uses compute-only text input so manifest validation can avoid compressed fallback expressions.
     */
    private static getTrimmedText(value: string | undefined): string {
        const isValueConfigured = value !== null && value !== undefined;

        if (!isValueConfigured) {
            return '';
        }

        // Return a trimmed value so all manifest string validation can rely on non-padded text.
        return value.trim();
    }

    /**
     * Quotes one argument for Unix-like diagnostic command output.
     *
     * @param value - Raw command argument value.
     * @returns The quoted argument value.
     *
     * @remarks
     * Uses compute-only string input because the result is diagnostic text only.
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
     *
     * @remarks
     * Uses compute-only string input because the result is diagnostic text only.
     */
    private static getWindowsCommandArgument(value: string): string {
        // CMD escapes embedded double quotes by doubling them inside the quoted argument.
        const escapedValue = value.replaceAll('"', '""');

        return `"${escapedValue}"`;
    }

    /**
     * Creates the Windows CMD process arguments used to launch G4 Hub.
     *
     * @param hubPaths - Runtime paths used to start the G4 Hub process.
     * @returns Arguments passed to `cmd.exe`.
     *
     * @remarks
     * Uses path values produced by Node path APIs directly so command launch does not depend on
     * handwritten slash or backslash fragments.
     */
    private static getWindowsProcessArguments(hubPaths: G4SandboxHubPaths): string[] {
        // Normalize generated paths before passing them as command arguments to CMD.
        const hubDirectory = path.normalize(hubPaths.hubDirectory);
        const dotnetPath = path.normalize(hubPaths.dotnetPath);

        return [
            '/d',
            '/c',
            'start',
            '',
            // `/min` launches the hub console minimized so it is visible on the taskbar without
            // stealing foreground focus from VS Code.
            '/min',
            '/D',
            hubDirectory,
            dotnetPath,
            'G4.Services.Hub.dll'
        ];
    }

    /**
     * Starts the sandboxed dotnet host for G4 Hub.
     *
     * @param sandboxPath - Absolute sandbox root from the project manifest.
     * @returns True when the process was spawned; otherwise false.
     *
     * @remarks
     * Keeps process creation explicit in this helper because spawning the hub is the only side effect.
     */
    private static startSandboxedHub(sandboxPath: string): boolean {
        // Resolve the concrete runtime paths before validating whether the sandbox can be started.
        const hubPaths = this.getSandboxHubPaths(sandboxPath);

        // Missing runtime assets mean the sandbox is not usable for auto-start.
        const isDotnetAvailable = fs.existsSync(hubPaths.dotnetPath);
        const isHubAvailable = fs.existsSync(hubPaths.hubPath);
        const isSandboxHubAvailable = isDotnetAvailable && isHubAvailable;

        if (!isSandboxHubAvailable) {
            return false;
        }

        try {
            // Emit a copyable command before spawning so startup failures can be reproduced manually.
            const command = this.getSandboxHubCommand(hubPaths);
            console.info(`Starting G4 Hub with command: ${command}`);

            // Start through CMD on Windows so `start` creates the real hub process outside VS Code.
            const isWindows = os.platform() === 'win32';
            const processName = isWindows
                ? 'cmd.exe'
                : hubPaths.dotnetPath;
            const processArguments = isWindows
                ? this.getWindowsProcessArguments(hubPaths)
                : [hubPaths.hubPath];

            const onHubProcessError = (error: Error): void => {
                // Surface launcher failures that would otherwise be hidden by detached startup.
                console.error(`G4 Hub launcher failed: ${error.message}`);
            };

            const onHubProcessExit = (code: number | null, signal: NodeJS.Signals | null): void => {
                // CMD exits after `start`; non-zero exit or signal means the launcher itself failed.
                const isCleanExit = code === 0 && signal === null;

                if (isCleanExit) {
                    console.info('G4 Hub launcher completed.');
                    return;
                }

                console.error(`G4 Hub launcher exited with code ${code} and signal ${signal}.`);
            };

            // Detach the hub so VS Code activation is not tied to the child process lifetime.
            const hubProcess = spawn(processName, processArguments, {
                cwd: hubPaths.hubDirectory,
                detached: true,
                stdio: 'ignore',
                // Hide the transient cmd.exe launcher window so it does not flash into the foreground
                // and steal focus. The hub console is created separately by `start /min`, so it still
                // appears (minimized) regardless of this flag.
                windowsHide: true
            });

            // Observe launcher failure/completion before releasing the process handle.
            hubProcess.once('error', onHubProcessError);
            hubProcess.once('exit', onHubProcessExit);

            // Unreference the child process so VS Code can exit
            // without waiting for the hub to terminate.
            hubProcess.unref();

            // A successful spawn only proves the process was created; ping polling verifies readiness later.
            return true;
        } catch {
            // Startup failures are intentionally silent so activation can continue through normal retries.
            return false;
        }
    }

}

/**
 * Minimal project manifest fields needed for sandboxed G4 Hub startup.
 *
 * @remarks
 * The full manifest contains many more sections; this type intentionally models only the
 * startup contract consumed by this service.
 */
export type G4ProjectManifest = {
    /** Absolute sandbox root that contains `runtime/dotnet` and `g4-hub`. */
    sandbox?: string;

    /** G4 server endpoint that should be pinged before deciding whether to auto-start the hub. */
    g4Server?: G4ServerConfiguration;
};

/**
 * Server endpoint configuration read from the workspace G4 manifest.
 *
 * @remarks
 * Manifest values are optional because activation must keep working while a project is
 * being created or while a manifest is partially configured.
 */
export type G4ServerConfiguration = {
    /** URI scheme used to reach the G4 server, for example `http` or `https`. */
    schema?: string;

    /** Host name or IP address used to reach the G4 server. */
    host?: string;

    /** Port used to reach the G4 server. */
    port?: number | string;
};

/**
 * Runtime file-system paths required to start the sandboxed G4 Hub process.
 *
 * @remarks
 * This internal model keeps path resolution separate from process creation so startup can
 * validate every required asset before spawning a detached process.
 */
type G4SandboxHubPaths = {
    /** Absolute path to the sandboxed dotnet executable for the current platform. */
    dotnetPath: string;

    /** Absolute path to the directory that must be used as the G4 Hub working directory. */
    hubDirectory: string;

    /** Absolute path to the G4 Hub DLL inside the sandbox. */
    hubPath: string;
};
