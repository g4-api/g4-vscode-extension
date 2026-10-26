/*
 * RESOURCES
 * https://make.wordpress.org/core/handbook/best-practices/inline-documentation-standards/javascript/
 * https://nodejs.dev/learn/making-http-requests-with-nodejs
 */
import { request } from 'node:http';
import { Channels } from "../constants/channels";
import { Utilities } from '../extensions/utilities';
import { ExtensionLogger } from '../logging/extensions-logger';
import { Logger } from '../logging/logger';

/**
 * Provides a base class for sending HTTP requests and receiving HTTP responses
 * from a resource identified by a URI.
 */
export class HttpClient {
    // The logger instance used for logging HTTP client-related information.
    private readonly _logger: Logger;

    // The base URL of the Internet resource used when sending requests.
    private readonly _baseUrl: string;

    /**
     * Creates a new instance of an HttpClient.
     *
     * @param baseUrl The base address of the Internet resource used when sending requests.
     * @param logger Optional logger for request failures; defaults to the G4 Extension channel.
     *     Unit tests pass their own logger to read what a failure writes.
     */
    constructor(baseUrl: string, logger?: Logger) {
        // Initialize the base URL
        this._baseUrl = baseUrl;

        // Initialize the logger with the appropriate channel and context
        this._logger = logger ?? new ExtensionLogger(Channels.extension, 'HttpClient', Utilities.getLogSettings());
    }

    /**
     * Builds the short reason text of a failed response.
     *
     * @remarks
     * A G4 Hub failure is usually a problem body (`title` plus an `errors` map of field messages);
     * the title and the field messages are the parts a user can act on. Used for the log line and by
     * G4Client for the failure messages shown to the user. A text body is used as-is.
     *
     * @param body - The parsed response body.
     * @returns The reason text, or an empty string when the body has none.
     */
    public static getProblemText(body: unknown): string {
        // A text body (or an empty 204/500 body) is already the reason.
        if (typeof body === 'string') {
            return body.trim();
        }

        // Anything other than an object carries no readable reason.
        const isObject = body !== null && typeof body === 'object';

        if (!isObject) {
            return '';
        }

        // Read the problem title and the field messages from the problem body.
        const problem = body as { errors?: unknown; title?: unknown; };
        const title = typeof problem.title === 'string' ? problem.title : '';
        const isErrorsMap = problem.errors !== null && typeof problem.errors === 'object';
        const errorValues = isErrorsMap ? Object.values(problem.errors as Record<string, unknown>) : [];
        const fieldMessages = errorValues.flat().filter((message) => typeof message === 'string');

        // Join what is available; a body with neither falls back to its JSON form.
        const reasonText = [title, ...fieldMessages].filter((text) => text !== '').join(' ');

        return reasonText === '' ? JSON.stringify(body) : reasonText;
    }

    /**
     * Asynchronously sends an HTTP request based on the provided HttpCommand.
     *
     * @remarks
     * The promise never rejects. Every outcome resolves exactly once with an HttpResult: a 2xx
     * response sets `ok`, any other response carries its status and body, and a timeout or network
     * failure has status 0 with the failure text as its body. Each failure is logged once with the
     * method, URL, status and the server's reason.
     *
     * @param httpCommand The HttpCommand object containing request details.
     * @returns A Promise that resolves with the request outcome.
     */
    public async sendAsync(httpCommand: HttpCommand): Promise<HttpResult> {
        return new Promise((resolve) => {
            // Check if a body payload is provided
            const isBody = httpCommand.body !== null && httpCommand.body !== undefined;

            // Determine if the payload should be sent as JSON
            const isJson = 'Content-Type' in httpCommand.headers && httpCommand.headers['Content-Type'] === 'application/json';

            // Serialize body as JSON if needed, otherwise convert to string
            const body = isBody && isJson
                ? JSON.stringify(httpCommand.body)
                : httpCommand.body?.toString();

            // Use provided timeout or default to 5000ms
            const timeout = httpCommand.timeout || 5000;

            // Construct the request URL relative to the base URL
            const url = new URL(httpCommand.command, this._baseUrl);

            // Name the request once, so every failure line says which call failed.
            const requestText = `Send-HttpRequest -Method ${httpCommand.method} -Url ${url.toString()}`;

            // Prepare HTTP request options
            const options = {
                method: httpCommand.method,
                headers: httpCommand.headers,
                timeout: timeout,
            };

            // Resolve only the first outcome: a timeout destroys the request, which then also raises
            // 'error' ('socket hang up'), and that second report must not be logged or resolved again.
            let isSettled = false;

            const setResult = (newResult: () => HttpResult): void => {
                // Ignore every outcome after the first one.
                if (isSettled) {
                    return;
                }

                // Build (and log) the result only for the first outcome, then resolve with it.
                isSettled = true;
                resolve(newResult());
            };

            // Create and send the HTTP request
            const httpRequest = request(url, options, (response) => {
                // Accumulate incoming data chunks
                let data = '';

                // When response has data, accumulate it
                response.on('data', (chunk) => (data += chunk));

                // When complete, turn the status and body into the request outcome.
                response.on('end', () => {
                    const status = response.statusCode ?? 0;

                    setResult(() => this.newResponseResult(requestText, status, data));
                });
            });

            // Settle the timeout before destroying the request, so the error that follows is ignored.
            httpRequest.on('timeout', () => {
                setResult(() => this.newTimeoutResult(requestText, url.toString(), timeout));
                httpRequest.destroy();
            });

            // Handle network or protocol errors, such as a refused connection.
            httpRequest.on('error', (error: Error) => setResult(() => this.newFailureResult(requestText, error)));

            // Only write if there is an actual body
            if (body !== undefined && body !== null && body !== '') {
                httpRequest.write(typeof body === 'string' || Buffer.isBuffer(body) ? body : String(body));
            }

            // Finalize the request
            httpRequest.end();
        });
    }

    // Builds the result of a network failure (status 0) and logs it with its reason.
    private newFailureResult(requestText: string, error: Error): HttpResult {
        // Resolve a non-empty reason, so the log line never ends after its prefix.
        const reasonText = HttpClient.resolveNetworkErrorText(error);

        // Log which request failed and why.
        this._logger.error(`HTTP Request Error: ${requestText} failed: ${reasonText}`);

        return { ok: false, status: 0, body: reasonText };
    }

    // Builds the result of a completed response and logs it when the status is not 2xx.
    private newResponseResult(requestText: string, status: number, data: string): HttpResult {
        // Parse a JSON body; keep any other body (including the empty body of a 204) as text.
        const isJson = Utilities.assertJson(data);
        const body: unknown = isJson ? JSON.parse(data) : data;

        // A 2xx status is the only success.
        const isSuccess = status >= 200 && status <= 299;

        if (isSuccess) {
            return { ok: true, status, body };
        }

        // Log the request, the status and the server's reason, so the failure is traceable.
        const problemText = HttpClient.getProblemText(body);
        const reasonText = problemText === '' ? '' : ` ${problemText}`;

        this._logger.error(`HTTP Request Error: ${requestText} = (${status})${reasonText}`);

        return { ok: false, status, body };
    }

    // Builds the result of a timed-out request (status 0) and logs it.
    private newTimeoutResult(requestText: string, url: string, timeout: number): HttpResult {
        // Format the timeout threshold in the unit a user reads most easily.
        const formattedThreshold = timeout > 60000
            ? `${(timeout / 60000).toPrecision(2)} minutes`
            : `${timeout} milliseconds`;

        // The text keeps the 'timed out' wording, which the publishers read as "Hub not reachable".
        const timeoutText = `Request to ${url} timed out after ${formattedThreshold}. `
            + 'Please check your network connection or try again.';

        // Log the timeout once; the 'socket hang up' error that follows is ignored by sendAsync.
        this._logger.error(`HTTP Request Error: ${requestText} timed out after ${formattedThreshold}`);

        return { ok: false, status: 0, body: timeoutText };
    }

    /**
     * Resolves a readable reason for a network failure.
     *
     * @remarks
     * Node reports a refused localhost connection as an AggregateError with an empty message (one
     * inner error per address it tried), so the message alone often says nothing. The first inner
     * message, then the error code, are used instead.
     *
     * @param error - The error raised by the request.
     * @returns The failure reason, never empty.
     */
    private static resolveNetworkErrorText(error: Error): string {
        // Use the message when Node provided one.
        if (error.message !== '') {
            return error.message;
        }

        // An AggregateError names the real cause in its first inner error.
        const failure = error as Error & { code?: unknown; errors?: unknown[]; };
        const innerError = Array.isArray(failure.errors) ? failure.errors[0] : undefined;
        const isInnerMessage = innerError instanceof Error && innerError.message !== '';

        if (isInnerMessage) {
            return innerError.message;
        }

        // Fall back to the error code (for example ECONNREFUSED), then to a fixed text.
        return typeof failure.code === 'string' ? failure.code : 'Unknown network error';
    }
}

/**
 * Represents an HTTP command with details for making an HTTP request.
 */
export class HttpCommand {
    /**
     * The endpoint command for the HTTP request.
     */
    public command: string = '/';

    /**
     * The request body for the HTTP request.
     */
    public body: any = null;

    /**
     * The headers for the HTTP request.
     */
    public headers: any = {};

    /**
     * The HTTP method for the request (e.g., 'GET', 'POST').
     */
    public method: string = 'GET';

    /**
     * The URI schema for the HTTP request (e.g., 'http', 'https').
     */
    public schema: string = 'http';

    /**
     * The timeout threshold for the HTTP request in milliseconds.
     */
    public timeout: number = 180000;

    /**
     * Adds a header to the HTTP request.
     *
     * @param name The name of the header.
     * @param value The value of the header.
     * @returns The current instance of HttpCommand for method chaining.
     */
    public addHeader(name: string, value: any): this {
        // Set the specified header name and value in the headers object
        this.headers[name] = value;

        // Return the current instance of HttpCommand for method chaining
        return this;
    }

    /**
     * Clears all headers from the HTTP request.
     *
     * @returns The current instance of HttpCommand for method chaining.
     */
    public clearHeaders(): this {
        // Set the headers property to an empty object to clear all headers
        this.headers = {};

        // Return the current instance of HttpCommand for method chaining
        return this;
    }

    /**
     * Adds default headers for JSON content type to the HTTP request.
     *
     * @returns The current instance of HttpCommand for method chaining.
     */
    public addDefaultHeaders(): this {
        // Set the default Content-Type header for JSON
        this.headers["Content-Type"] = "application/json";

        // Return the current instance of HttpCommand for method chaining
        return this;
    }
}

// Compile-time contracts stay after the executable code. Interfaces come before type aliases, and
// a caller comes before its local dependencies, with A-Z order otherwise.

/**
 * Outcome of one HTTP request sent by HttpClient.
 *
 * @remarks
 * HttpClient never rejects, so callers branch on `ok` instead of using try/catch. The shape was
 * chosen on 2026-10-25 (STU-02) to replace the old behaviour, which resolved failures with error
 * text that callers could not tell apart from a real response.
 */
export interface HttpResult {
    /** Parsed JSON body, the raw text body ('' for 204 No Content), or the failure text when `status` is 0. */
    body: unknown;

    /** True only for a 2xx response; false for any other status, a timeout or a network failure. */
    ok: boolean;

    /** HTTP status code of the response, or 0 when no response arrived (timeout or network failure). */
    status: number;
}
