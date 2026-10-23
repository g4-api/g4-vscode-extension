/*
 * Client for the G4 Hub recordings API.
 *
 * RESOURCES:
 * Hub recordings routes: /api/v4/g4/recordings (start, status, suspend, resume, stop)
 */
import { Utilities } from '../extensions/utilities';

/**
 * Calls the G4 Hub recordings API, which owns recorder connections, event buffering, and flow conversion.
 *
 * @remarks
 * The extension no longer connects to recorder services itself: it describes the session (recorders,
 * authentication, excluded windows) and the Hub connects, records, and converts. Every method throws a
 * {@link G4RecordingsError} for a non-success response so callers can react to the HTTP status (for
 * example 409 when a recorder is already held by another session) and show the Hub's problem detail.
 * The client is stateless; the caller owns the session identifier.
 */
export class G4RecordingsClient {
    // Starting waits for every recorder to connect and for Chromium browsers to launch, which the Hub bounds
    // at 15 seconds per recorder, so the request needs a generous ceiling.
    private static readonly _startTimeoutMilliseconds: number = 60000;

    // Status, suspend, and resume are in-memory Hub operations and return quickly.
    private static readonly _statusTimeoutMilliseconds: number = 10000;

    // Stopping flushes recorder queues, converts the flow, and closes browsers, which can take several seconds.
    private static readonly _stopTimeoutMilliseconds: number = 60000;

    /** Versioned recordings route appended to the Hub base URL. */
    private readonly _recordingsUrl: string;

    /**
     * Creates a client for one G4 Hub.
     *
     * @param hubUrl - The Hub base URL, for example `http://localhost:9944`; a trailing slash is ignored.
     */
    constructor(hubUrl: string) {
        // Normalize the base URL once so every route is joined without a double slash.
        const baseUrl = hubUrl.endsWith('/')
            ? hubUrl.slice(0, -1)
            : hubUrl;

        this._recordingsUrl = `${baseUrl}/api/v4/g4/recordings`;
    }

    /**
     * Gets the status of a recording session: its state, each recorder's diagnostics, and after stop the
     * recorder of each generated job.
     *
     * @param sessionId - The session identifier returned by {@link startRecording}.
     * @returns The current session status.
     * @throws {G4RecordingsError} When the session is unknown (404) or the Hub cannot be reached.
     */
    public async getStatus(sessionId: string): Promise<RecordingStatus> {
        const response = await G4RecordingsClient.sendRequest({
            method: 'GET',
            url: `${this._recordingsUrl}/${sessionId}`,
            timeoutMilliseconds: G4RecordingsClient._statusTimeoutMilliseconds
        });

        return response.body as RecordingStatus;
    }

    /**
     * Resumes buffering for one suspended recorder of a running session.
     *
     * @param sessionId - The session identifier returned by {@link startRecording}.
     * @param baseUrl - The recorder endpoint as configured at start.
     * @returns The session status after the change.
     * @throws {G4RecordingsError} When the recorder is not part of the session (400), the session is unknown
     * (404), or the session is not recording (409).
     */
    public async resumeRecorder(sessionId: string, baseUrl: string): Promise<RecordingStatus> {
        const response = await G4RecordingsClient.sendRequest({
            method: 'POST',
            url: `${this._recordingsUrl}/${sessionId}/resume`,
            body: { baseUrl },
            timeoutMilliseconds: G4RecordingsClient._statusTimeoutMilliseconds
        });

        return response.body as RecordingStatus;
    }

    /**
     * Starts a recording session on the Hub.
     *
     * @remarks
     * The Hub connects every enabled recorder and launches Chromium browsers before it answers, so the
     * returned status already reports each recorder's connection outcome. A partial start succeeds and lists
     * per-recorder errors.
     *
     * @param settings - Authentication, recorders, and windows to exclude from the recording.
     * @returns The status of the new session, including its identifier.
     * @throws {G4RecordingsError} For invalid settings (400), a recorder already held by another session
     * (409), or when no recorder started (502).
     */
    public async startRecording(settings: RecordingSettings): Promise<RecordingStatus> {
        const response = await G4RecordingsClient.sendRequest({
            method: 'POST',
            url: this._recordingsUrl,
            body: settings,
            timeoutMilliseconds: G4RecordingsClient._startTimeoutMilliseconds
        });

        return response.body as RecordingStatus;
    }

    /**
     * Stops a recording session and returns the generated automation.
     *
     * @remarks
     * The Hub flushes every recorder's queue, converts the events, and closes owned browsers. A repeated stop
     * returns the same automation.
     *
     * @param sessionId - The session identifier returned by {@link startRecording}.
     * @returns The generated automation, or `undefined` when the recording holds no events (204).
     * @throws {G4RecordingsError} When the session is unknown (404) or the Hub cannot be reached.
     */
    public async stopRecording(sessionId: string): Promise<any> {
        const response = await G4RecordingsClient.sendRequest({
            method: 'POST',
            url: `${this._recordingsUrl}/${sessionId}/stop`,
            timeoutMilliseconds: G4RecordingsClient._stopTimeoutMilliseconds
        });

        // An empty recording answers 204 without a body; report it as no automation.
        const isEmptyRecording = response.statusCode === 204;

        if (isEmptyRecording) {
            return undefined;
        }

        return response.body;
    }

    /**
     * Suspends buffering for one recorder of a running session; its events are dropped until resumed.
     *
     * @param sessionId - The session identifier returned by {@link startRecording}.
     * @param baseUrl - The recorder endpoint as configured at start.
     * @returns The session status after the change.
     * @throws {G4RecordingsError} When the recorder is not part of the session (400), the session is unknown
     * (404), or the session is not recording (409).
     */
    public async suspendRecorder(sessionId: string, baseUrl: string): Promise<RecordingStatus> {
        const response = await G4RecordingsClient.sendRequest({
            method: 'POST',
            url: `${this._recordingsUrl}/${sessionId}/suspend`,
            body: { baseUrl },
            timeoutMilliseconds: G4RecordingsClient._statusTimeoutMilliseconds
        });

        return response.body as RecordingStatus;
    }

    /**
     * Reads the readable message of a Hub error body.
     *
     * @remarks
     * Compute-only. The Hub answers failures with a problem-details object whose `detail` carries the
     * domain message; `title` is the generic fallback. Any other body yields an empty message so the
     * caller can fall back to the status code.
     *
     * @param body - The parsed response body.
     * @returns The most specific readable message, or an empty string.
     */
    private static getProblemMessage(body: unknown): string {
        // Only an object body can be a problem-details response.
        const isObjectBody = typeof body === 'object' && body !== null;

        if (!isObjectBody) {
            return '';
        }

        // Prefer the domain detail, then the generic title.
        const problem = body as { detail?: unknown, title?: unknown };

        if (typeof problem.detail === 'string' && problem.detail.length > 0) {
            return problem.detail;
        }

        if (typeof problem.title === 'string') {
            return problem.title;
        }

        return '';
    }

    /**
     * Sends one JSON request to the Hub and returns its status code and parsed body.
     *
     * @remarks
     * Owns transport details shared by every route: JSON serialization, the per-route timeout, body
     * parsing, and conversion of failures into {@link G4RecordingsError}. A network failure or timeout is
     * reported with status code 0 so callers can tell an unreachable Hub from a rejected request.
     *
     * @param options - The HTTP method, absolute URL, optional JSON body, and timeout.
     * @returns The success status code and the parsed body (`undefined` when the response has none).
     * @throws {G4RecordingsError} For any non-success status, network failure, or timeout.
     */
    private static async sendRequest(options: RecordingsRequestOptions): Promise<RecordingsResponse> {
        const { method, url, body, timeoutMilliseconds } = options;

        // Serialize the body only when one is supplied, so GET and body-less POST requests send none.
        const isBodyPresent = body !== undefined;
        const headers: Record<string, string> = isBodyPresent
            ? { 'Content-Type': 'application/json' }
            : {};
        const requestBody = isBodyPresent
            ? JSON.stringify(body)
            : undefined;

        // Send the request with a bounded wait so an unresponsive Hub cannot block a command forever.
        let response: Response;

        try {
            response = await fetch(url, {
                method,
                headers,
                body: requestBody,
                signal: AbortSignal.timeout(timeoutMilliseconds)
            });
        } catch (error: unknown) {
            const message = `The G4 Hub is unreachable at ${url}: ${Utilities.resolveErrorMessage(error)}`;
            throw new G4RecordingsError(message, 0);
        }

        // Parse a JSON body when one is present; 204 and empty answers carry none.
        const text = await response.text();
        let responseBody: unknown = undefined;

        if (text.length > 0) {
            try {
                responseBody = JSON.parse(text);
            } catch {
                responseBody = text;
            }
        }

        // Convert a rejected request into an error that carries the Hub's own explanation.
        if (!response.ok) {
            const problemMessage = G4RecordingsClient.getProblemMessage(responseBody);
            const message = problemMessage.length > 0
                ? problemMessage
                : `The G4 Hub answered ${response.status} ${response.statusText}.`;

            throw new G4RecordingsError(message, response.status);
        }

        return {
            statusCode: response.status,
            body: responseBody
        };
    }
}

/**
 * A failed G4 Hub recordings request.
 *
 * @remarks
 * Carries the HTTP status so callers can handle specific outcomes, such as 409 for a recorder already held
 * by another session. A status code of 0 means the Hub could not be reached or the request timed out.
 */
export class G4RecordingsError extends Error {
    /**
     * Creates a recordings error.
     *
     * @param message - The Hub's problem detail, or a transport description.
     * @param statusCode - The HTTP status code, or 0 when the Hub could not be reached.
     */
    constructor(message: string, public readonly statusCode: number) {
        super(message);
        this.name = 'G4RecordingsError';
    }
}

// Compile-time contracts are kept after the executable code: interfaces come before type aliases, and within
// each group a declaration is followed by the contracts it depends on, otherwise the order is A-Z.

/**
 * The start request body.
 */
export interface RecordingSettings {
    /** The G4 authentication exported unchanged into the generated automation. */
    authentication: any;

    /** Processes whose windows are never recorded, such as this VS Code instance. */
    excludedProcessIds: number[];

    /** Window-title fragments whose windows are never recorded, used when process ids are unavailable. */
    excludedWindowTitles: string[];

    /** The recorders that take part in the session. */
    recorders: RecorderSettings[];
}

/**
 * One recorder entry of the start request.
 *
 * @remarks
 * Models only the fields the Hub reads. Pre- and post-scripts are deliberately absent: the extension runs
 * them itself and inserts them into the flow after stop, and the Hub rejects active script flags.
 */
export interface RecorderSettings {
    /** The recorder endpoint, for example `http://localhost:9955`. */
    baseUrl: string;

    /** Playback driver configuration; `driver` selects the recorder family (UiaDriver or ChromeDriver). */
    driverParameters: any;

    /** Whether the recorder takes part in the session; disabled entries are ignored by the Hub. */
    enabled: boolean;

    /** UIA capture mode: `standard`, `user32`, or `coordinate`; Chromium always records in standard mode. */
    mode: string;

    /** Waits inserted between recorded actions; disabled settings insert none. */
    thinkTimeSettings: ThinkTimeSettings;

    /** Whether User32 clicks keep the element-relative pointer offset. */
    useOffset: boolean;
}

/**
 * Think-time settings of one recorder, in milliseconds.
 */
export interface ThinkTimeSettings {
    /** Whether waits are inserted between recorded actions. */
    enabled: boolean;

    /** The longest wait inserted for one gap. */
    maxThinkTime: number;

    /** The gap a recorded pause must exceed to produce a wait. */
    minThinkTime: number;
}

/**
 * Options for one Hub request.
 */
interface RecordingsRequestOptions {
    /** The JSON body; absent for requests without one. */
    body?: unknown;

    /** The HTTP method. */
    method: 'GET' | 'POST';

    /** The bounded wait for the response, in milliseconds. */
    timeoutMilliseconds: number;

    /** The absolute request URL. */
    url: string;
}

/**
 * A successful Hub response.
 */
interface RecordingsResponse {
    /** The parsed JSON body, the raw text when it is not JSON, or `undefined` when there is none. */
    body: any;

    /** The HTTP status code. */
    statusCode: number;
}

/**
 * Status of a recording session, as reported by the Hub.
 */
export interface RecordingStatus {
    /** Whether stop produced a non-empty automation; absent means false. */
    hasAutomation?: boolean;

    /** The session identifier used by every later request. */
    id: string;

    /** The recorder of each generated job, in job order; empty until stop. */
    jobs?: RecordingJob[];

    /** Diagnostics for every recorder of the session. */
    recorders?: RecorderStatus[];

    /** The lifecycle state: `starting`, `recording`, `stopping`, or `stopped`. */
    state: string;
}

/**
 * Status of one recorder in a recording session, as reported by the Hub.
 */
export interface RecorderStatus {
    /** The normalized recorder endpoint, used to match the extension's recorder settings. */
    baseUrl: string;

    /** The Chromium process launched by the Hub, absent for UIA recorders and after cleanup. */
    browserProcessId?: number;

    /** Whether the Hub's connection to the recorder is open; absent means false. */
    connected?: boolean;

    /** The latest startup or cleanup error for this recorder, absent when none occurred. */
    error?: string;

    /** The number of events the Hub has buffered for this recorder; absent means zero. */
    eventCount?: number;

    /** Whether the recorder is suspended (its events are dropped); absent means false. */
    suspended?: boolean;
}

/**
 * One entry of the job-to-recorder map returned with the status after stop.
 */
export interface RecordingJob {
    /** The normalized endpoint of the recorder whose events the job holds. */
    baseUrl: string;

    /** The job reference identifier, as written in the job's `reference.id`. */
    id: string;

    /** The zero-based position of the job in the automation's only stage. */
    index: number;
}
