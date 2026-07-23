import { execFile } from 'node:child_process';
import * as os from 'node:os';
import * as path from 'node:path';

// Bounds the process-enumeration query so a stuck shell can never block stopping the recorder.
const SELF_IDENTITY_QUERY_TIMEOUT_MILLISECONDS = 5000;

/**
 * Resolves the operating-system process ids that make up *this* VS Code instance family.
 *
 * @remarks
 * The UIA recorder is a desktop-wide sensor: it emits an event for every window the user touches,
 * including VS Code's own chrome (the recorder panel, the Stop-recording button). VS Code is an
 * Electron/Chromium application, so any legitimate automation of it goes through the Chromium
 * recorder, never UIA. That makes every VS Code window off-limits to the UIA recorder, and the
 * clean signal for "this is my own editor" is the owning window's process id, which the recorder
 * already reports on every node.
 *
 * The extension code runs in the extension-host process, but the window the user clicks is owned by
 * a different process in the same Electron family. This service therefore resolves the whole family
 * by executable path (`process.execPath`) rather than a single pid, so the client can drop any
 * recorded event whose window belongs to VS Code. UI Automation is Windows-only, so this resolves an
 * empty set on other platforms, where the UIA recorder never runs.
 */
export class G4RecorderSelfIdentityService {
    /** Cached self process-id set; populated on first successful resolution and reused per session. */
    private static _cachedProcessIds: Set<number> | undefined;

    /**
     * Resolves the set of process ids belonging to this VS Code executable family.
     *
     * @returns A set of owning process ids; empty when the platform is not Windows or enumeration fails.
     *
     * @remarks
     * The result is cached after the first successful, non-empty resolution because the VS Code
     * process family is stable for the lifetime of a window. An empty result is never cached so a
     * transient enumeration failure does not permanently disable self-window filtering.
     */
    public static async getSelfProcessIds(): Promise<Set<number>> {
        // Reuse a previously resolved, non-empty family so stopping the recorder stays fast.
        if (this._cachedProcessIds && this._cachedProcessIds.size > 0) {
            return this._cachedProcessIds;
        }

        // UI Automation only exists on Windows; elsewhere the UIA recorder never runs, so there is
        // nothing to exclude.
        if (os.platform() !== 'win32') {
            return new Set<number>();
        }

        try {
            const processIds = await this.resolveWindowsProcessIds();

            // Only cache a real, non-empty family; keep retrying while enumeration yields nothing.
            if (processIds.size > 0) {
                this._cachedProcessIds = processIds;
            }

            return processIds;
        } catch {
            // A failed enumeration must never block stopping the recorder; degrade to no filtering.
            return new Set<number>();
        }
    }

    /**
     * Enumerates Windows processes that share this extension host's executable path.
     *
     * @returns The owning process ids of every VS Code process in this executable family.
     *
     * @remarks
     * The query is scoped by image name (which carries no path separators and is safe to embed in a
     * WQL filter), then narrowed in-process by exact executable path so a second, unrelated product
     * that happens to share the image name is not matched. The extension host's own pid is always
     * included as a defensive floor.
     */
    private static resolveWindowsProcessIds(): Promise<Set<number>> {
        // Image name and full path of the running VS Code executable (for example Code.exe).
        const executablePath = process.execPath;
        const imageName = path.basename(executablePath);

        // Embed the image name into a WQL filter, doubling any single quote so the string stays valid.
        const escapedImageName = imageName.replaceAll("'", "''");
        const script =
            `Get-CimInstance Win32_Process -Filter "Name='${escapedImageName}'" ` +
            '| Select-Object ProcessId,ExecutablePath | ConvertTo-Json -Compress';

        return new Promise<Set<number>>((resolve, reject) => {
            execFile(
                'powershell.exe',
                ['-NoProfile', '-NonInteractive', '-Command', script],
                { timeout: SELF_IDENTITY_QUERY_TIMEOUT_MILLISECONDS, windowsHide: true },
                (error, stdout) => {
                    if (error) {
                        reject(error);
                        return;
                    }

                    resolve(this.parseProcessIds(stdout, executablePath));
                }
            );
        });
    }

    /**
     * Parses the process-enumeration output into the set of matching owning process ids.
     *
     * @param stdout - Raw `ConvertTo-Json` output from the process query.
     * @param executablePath - The exact executable path each candidate must match.
     * @returns The process ids whose executable path matches this VS Code executable.
     */
    private static parseProcessIds(stdout: string, executablePath: string): Set<number> {
        // Always include the extension-host pid so the family is never empty on a parseable result.
        const processIds = new Set<number>([process.pid]);

        const trimmedOutput = (stdout || '').trim();

        if (trimmedOutput.length === 0) {
            return processIds;
        }

        // ConvertTo-Json emits a single object for one match and an array for several; normalize both.
        const parsed = JSON.parse(trimmedOutput);
        const candidates = Array.isArray(parsed) ? parsed : [parsed];

        // Match executable paths case-insensitively because Windows paths are case-insensitive.
        const normalizedExecutablePath = executablePath.toLowerCase();

        for (const candidate of candidates) {
            const candidatePath = typeof candidate?.ExecutablePath === 'string'
                ? candidate.ExecutablePath.toLowerCase()
                : '';

            if (candidatePath !== normalizedExecutablePath) {
                continue;
            }

            const processId = Number(candidate?.ProcessId);

            if (Number.isInteger(processId) && processId > 0) {
                processIds.add(processId);
            }
        }

        return processIds;
    }
}
