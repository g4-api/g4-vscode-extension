import {
    G4RecordingsClient,
    G4RecordingsError
} from '../clients/g4-recordings-client';

import type {
    RecorderStatus,
    RecordingJob,
    RecordingStatus
} from '../clients/g4-recordings-client';

import type { RecorderScriptShell } from './g4-recorder-script-service';

/**
 * Owns the extension's single recording session on the G4 Hub.
 *
 * @remarks
 * One instance is shared by Start-Recorder, Stop-Recorder, the recorder panel, and the settings service, so
 * every part of the extension sees the same session. The Hub owns the recorder connections, buffering, and
 * flow conversion; this service only keeps the recorder settings from the manifest, the active session
 * identifier, and the latest status snapshot for the panel. State lives in memory only: reloading the window
 * forgets the session, which the Hub keeps until it is stopped or the Hub restarts.
 */
export class G4RecordingService {
    // HTTP status the Hub returns for an unknown session, for example after the Hub restarted.
    private static readonly _notFoundStatusCode: number = 404;

    /** Client for the Hub recordings API; undefined when the manifest names no G4 Hub. */
    private readonly _client: G4RecordingsClient | undefined;

    /** Recorder settings from the manifest, including disabled recorders. */
    private _recorders: RecorderOptions[];

    /** Identifier of the running session; undefined while not recording. */
    private _sessionId: string | undefined;

    /** The recorders that were started in the running session, kept for their post-scripts after stop. */
    private _sessionRecorders: RecorderOptions[] = [];

    /** Latest session status from the Hub, refreshed by the panel heartbeat. */
    private _status: RecordingStatus | undefined;

    /**
     * Creates the recording service.
     *
     * @param options - The Hub base URL and the recorder settings from the manifest.
     */
    constructor(options: RecordingServiceOptions) {
        // Without a Hub endpoint no session can start; the commands report that when the user tries.
        const isHubConfigured = options.hubUrl.length > 0;

        this._client = isHubConfigured
            ? new G4RecordingsClient(options.hubUrl)
            : undefined;
        this._recorders = options.recorders;
    }

    /**
     * Whether a recording session is running on the Hub.
     */
    public get isRecording(): boolean {
        return this._sessionId !== undefined;
    }

    /**
     * The enabled recorders from the manifest, in manifest order.
     */
    public get recorders(): RecorderOptions[] {
        return this._recorders.filter(recorder => recorder.enabled);
    }

    /**
     * The recorders started in the running (or just stopped) session.
     */
    public get sessionRecorders(): RecorderOptions[] {
        return this._sessionRecorders;
    }

    /**
     * Normalizes an endpoint to its origin, the form the Hub reports.
     *
     * @remarks
     * Compute-only. An unparsable value is returned trimmed and lower-cased so it still compares predictably.
     *
     * @param url - An endpoint such as `http://LOCALHOST:9955/`.
     * @returns The origin, for example `http://localhost:9955`.
     */
    public static convertToOrigin(url: string): string {
        try {
            return new URL(url).origin;
        } catch {
            return url.trim().toLowerCase();
        }
    }

    /**
     * Finds the latest Hub status of one recorder.
     *
     * @remarks
     * Compute-only over the cached snapshot. The Hub normalizes endpoints to their origin, so both sides are
     * compared as origins and a manifest URL with a trailing slash or upper-case host still matches.
     *
     * @param baseUrl - The recorder endpoint from the manifest.
     * @returns The recorder's status, or undefined while not recording or when the Hub does not list it.
     */
    public getRecorderStatus(baseUrl: string): RecorderStatus | undefined {
        // Match on the normalized origin, the form the Hub reports.
        const origin = G4RecordingService.convertToOrigin(baseUrl);
        const recorders = this._status?.recorders ?? [];

        return recorders.find(recorder => G4RecordingService.convertToOrigin(recorder.baseUrl) === origin);
    }

    /**
     * Resumes buffering for one suspended recorder of the running session.
     *
     * @param baseUrl - The recorder endpoint from the manifest.
     * @returns A promise that resolves once the Hub applied the change and the snapshot was refreshed.
     * @throws {G4RecordingsError} When the Hub rejects the request.
     */
    public async resumeRecorder(baseUrl: string): Promise<void> {
        const { client, sessionId } = this.getSession();

        this._status = await client.resumeRecorder(sessionId, baseUrl);
    }

    /**
     * Starts a recording session on the Hub.
     *
     * @remarks
     * Owns the session lifecycle: the session identifier and the started recorders are stored only after the
     * Hub accepted the request, so a failed start leaves the service idle.
     *
     * @param options - The recorders to start, the authentication, and the windows to exclude.
     * @returns The Hub status of the new session, including per-recorder connection outcomes.
     * @throws {Error} When a session is already running or no G4 Hub is configured.
     * @throws {G4RecordingsError} When the Hub rejects the request.
     */
    public async startRecording(options: StartRecordingOptions): Promise<RecordingStatus> {
        // Refuse a second session; the Hub would also reject it because the recorders are reserved.
        if (this.isRecording) {
            throw new Error('A recording session is already running. Stop it before starting a new one.');
        }

        const client = this.getClient();

        // Describe the session to the Hub; scripts stay local and are never sent.
        const recorders = options.recorders.map(recorder => ({
            baseUrl: recorder.baseUrl,
            driverParameters: recorder.driverParameters,
            enabled: true,
            mode: recorder.mode,
            thinkTimeSettings: recorder.thinkTimeSettings,
            useOffset: recorder.useOffset
        }));

        const status = await client.startRecording({
            authentication: options.authentication,
            excludedProcessIds: options.excludedProcessIds,
            excludedWindowTitles: options.excludedWindowTitles,
            recorders
        });

        // Publish the session only after the Hub accepted it.
        this._sessionId = status.id;
        this._sessionRecorders = options.recorders;
        this._status = status;

        return status;
    }

    /**
     * Stops the running session and returns its automation and job-to-recorder map.
     *
     * @remarks
     * After stop the service is idle again. When the Hub no longer knows the session (404, for example after
     * a Hub restart) the session is cleared as well, because nothing can be recovered; any other failure
     * keeps the session so the user can retry the stop.
     *
     * @returns The automation (undefined for an empty recording) and the recorder of each job.
     * @throws {Error} When no session is running or no G4 Hub is configured.
     * @throws {G4RecordingsError} When the Hub rejects the request.
     */
    public async stopRecording(): Promise<StoppedRecording> {
        const { client, sessionId } = this.getSession();

        try {
            // Stop first, then read the job map that the Hub publishes with the stopped status.
            const automation = await client.stopRecording(sessionId);
            const status = await client.getStatus(sessionId);

            // The session is complete; return to idle while keeping the started recorders for post-scripts.
            this.clearSession();

            return {
                automation,
                jobs: status.jobs ?? []
            };
        } catch (error: unknown) {
            // A session the Hub no longer knows cannot be stopped later either, so forget it.
            const isSessionLost = error instanceof G4RecordingsError
                && error.statusCode === G4RecordingService._notFoundStatusCode;

            if (isSessionLost) {
                this.clearSession();
            }

            throw error;
        }
    }

    /**
     * Suspends buffering for one recorder of the running session; its events are dropped until resumed.
     *
     * @param baseUrl - The recorder endpoint from the manifest.
     * @returns A promise that resolves once the Hub applied the change and the snapshot was refreshed.
     * @throws {G4RecordingsError} When the Hub rejects the request.
     */
    public async suspendRecorder(baseUrl: string): Promise<void> {
        const { client, sessionId } = this.getSession();

        this._status = await client.suspendRecorder(sessionId, baseUrl);
    }

    /**
     * Replaces the recorder settings after the manifest changed.
     *
     * @remarks
     * Called by the settings service. A running session keeps the recorders it started with; the new settings
     * apply to the next session.
     *
     * @param recorders - The recorder settings from the refreshed manifest.
     */
    public updateRecorders(recorders: RecorderOptions[]): void {
        this._recorders = recorders;
    }

    /**
     * Refreshes the cached session status from the Hub.
     *
     * @remarks
     * Called by the panel heartbeat. When the Hub no longer knows the session (404) the service returns to
     * idle, so the panel stops showing a recording that cannot be stopped. Other failures keep the previous
     * snapshot and are rethrown for the caller to log.
     *
     * @returns The refreshed status, or undefined while not recording.
     * @throws {G4RecordingsError} When the Hub cannot be reached.
     */
    public async updateStatus(): Promise<RecordingStatus | undefined> {
        // Nothing to refresh while idle.
        if (!this.isRecording) {
            return undefined;
        }

        const { client, sessionId } = this.getSession();

        try {
            this._status = await client.getStatus(sessionId);

            return this._status;
        } catch (error: unknown) {
            // A lost session (Hub restarted) cannot recover; return to idle.
            const isSessionLost = error instanceof G4RecordingsError
                && error.statusCode === G4RecordingService._notFoundStatusCode;

            if (isSessionLost) {
                this.clearSession();
                return undefined;
            }

            throw error;
        }
    }

    /**
     * Returns the service to idle after a session ended.
     */
    private clearSession(): void {
        this._sessionId = undefined;
        this._status = undefined;
    }

    /**
     * Returns the Hub client, or throws when the manifest names no G4 Hub.
     *
     * @returns The Hub client.
     * @throws {Error} When no G4 Hub endpoint is configured.
     */
    private getClient(): G4RecordingsClient {
        if (this._client === undefined) {
            throw new Error('No G4 Hub endpoint is configured. Set g4Server in the project manifest.');
        }

        return this._client;
    }

    /**
     * Returns the Hub client and the running session identifier, or throws while idle.
     *
     * @returns The Hub client and the session identifier.
     * @throws {Error} When no session is running or no G4 Hub is configured.
     */
    private getSession(): { client: G4RecordingsClient, sessionId: string } {
        const client = this.getClient();
        const sessionId = this._sessionId;

        if (sessionId === undefined) {
            throw new Error('No recording session is running.');
        }

        return { client, sessionId };
    }
}

// Compile-time contracts are kept after the executable code: interfaces come before type aliases, and within
// each group a declaration is followed by the contracts it depends on, otherwise the order is A-Z.

/**
 * Constructor options of the recording service.
 */
export interface RecordingServiceOptions {
    /** The G4 Hub base URL; empty when the manifest names no Hub. */
    hubUrl: string;

    /** The recorder settings from the manifest, including disabled recorders. */
    recorders: RecorderOptions[];
}

/**
 * Options for starting a recording session.
 */
export interface StartRecordingOptions {
    /** The G4 authentication exported unchanged into the generated automation. */
    authentication: any;

    /** Processes whose windows are never recorded, such as this VS Code instance. */
    excludedProcessIds: number[];

    /** Window-title fragments whose windows are never recorded. */
    excludedWindowTitles: string[];

    /** The recorders to start; their pre-scripts already ran. */
    recorders: RecorderOptions[];
}

/**
 * One recorder as configured in the project manifest (`settings.recorderSettings.recorders`).
 *
 * @remarks
 * Produced by `Utilities.resolveEventsCaptureOptions`. The extension keeps the scripts: it runs them on this
 * machine around the session and inserts the opted-in ones into the flow after stop.
 */
export interface RecorderOptions {
    /** The recorder endpoint, `<schema>://<host>:<port>`. */
    baseUrl: string;

    /** Playback driver configuration; `driver` selects the recorder family (UiaDriver or ChromeDriver). */
    driverParameters: any;

    /** Whether the recorder takes part in a session. */
    enabled: boolean;

    /** UIA capture mode: `standard`, `user32`, or `coordinate`. */
    mode: string;

    /** Script run after the session stops, optionally inserted before the recorder's last CloseBrowser. */
    postScript: RecorderScriptOptions;

    /** Script run before the session starts, optionally inserted as the recorder's first action. */
    preScript: RecorderScriptOptions;

    /** Waits inserted between recorded actions, in milliseconds. */
    thinkTimeSettings: any;

    /** Whether User32 clicks keep the element-relative pointer offset. */
    useOffset: boolean;
}

/**
 * A recorder's pre- or post-script settings.
 */
export interface RecorderScriptOptions {
    /** Whether the script is inserted into the recorded flow as an InvokeScript action. */
    addToAutomationFlow: boolean;

    /** Whether the script runs on this machine around the recording session. */
    enabled: boolean;

    /** The script text. */
    script: string;

    /** The shell that runs the script, for example `powershell`. */
    shell: RecorderScriptShell;
}

/**
 * The result of stopping a recording session.
 */
export interface StoppedRecording {
    /** The generated automation, or undefined when the recording holds no events. */
    automation: any;

    /** The recorder of each generated job, in job order. */
    jobs: RecordingJob[];
}
