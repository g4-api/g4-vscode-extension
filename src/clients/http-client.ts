/*
 * RESOURCES
 * https://make.wordpress.org/core/handbook/best-practices/inline-documentation-standards/javascript/
 * https://nodejs.dev/learn/making-http-requests-with-nodejs
 */
import { IncomingMessage, request } from 'http';
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
     */
    constructor(baseUrl: string) {
        // Initialize the base URL
        this._baseUrl = baseUrl;

        // Initialize the logger with the appropriate channel and context
        this._logger = new ExtensionLogger(Channels.extension, 'HttpClient');
    }

    /**
     * Asynchronously sends an HTTP request based on the provided HttpCommand.
     * 
     * @param httpCommand The HttpCommand object containing request details.
     * @returns A Promise that resolves with the response data.
     */
    public async sendAsync(httpCommand: HttpCommand): Promise<any> {
        return new Promise((resolve, _) => {
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

            // Prepare HTTP request options
            const options = {
                method: httpCommand.method,
                headers: httpCommand.headers,
                timeout: timeout,
            };

            // Create and send the HTTP request
            const httpRequest = request(url, options, (response) => {
                // Accumulate incoming data chunks
                let data = '';

                // When response has data, accumulate it
                response.on('data', (chunk) => (data += chunk));

                // When complete, delegate to the onEnd handler
                response.on('end', () => HttpClient.onEnd(this._logger, response, 'data', resolve));
            });

            // Handle request timeout by aborting and calling the timeout handler
            httpRequest.on('timeout', () => {
                httpRequest.destroy();
                HttpClient.onTimeout(this._logger, url.toString(), timeout, resolve);
            });

            // Handle network or protocol errors
            httpRequest.on('error', (error: any) => HttpClient.onError(this._logger, error, resolve));

            // Only write if there is an actual body
            if (body !== undefined && body !== null && body !== '') {
                httpRequest.write(typeof body === 'string' || Buffer.isBuffer(body) ? body : String(body));
            }

            // Finalize the request
            httpRequest.end();
        });
    }

    // Handles the 'end' event of an HTTP response.
    private static onEnd(logger: Logger, response: IncomingMessage, data: string, resolve: any) {
        // Check if the response data is in JSON format
        const isJson = Utilities.assertJson(data);

        // Parse the response body accordingly
        const responseBody = isJson ? JSON.parse(data) : data;

        // Check if the HTTP status code indicates a successful response (2xx range)
        if (response?.statusCode && response.statusCode >= 200 && response.statusCode <= 299) {
            // Resolve the Promise with the parsed response body
            resolve(responseBody);
            return;
        }

        // If the response has an error status code, handle the error
        const errorMessage = isJson ? JSON.stringify(responseBody, null, 4) : responseBody;
        const error = new Error(`Send-HttpRequest -Url ${response.url} = (${response.statusCode})`);
        error.stack = errorMessage;

        // Call the onError method to handle and log the error
        this.onError(logger, error, resolve);
    }

    // Handles the 'timeout' event of an HTTP request.
    private static onTimeout(logger: Logger, url: string, timeout: number | undefined, resolve: any) {
        // Format the timeout threshold for logging purposes
        let formattedThreshold = "";
        if (timeout) {
            formattedThreshold = timeout > 60000
                ? `${(timeout / 60000).toPrecision(2)} minutes`
                : `${timeout} milliseconds`;
        }

        // Create an error for the timeout situation
        const error = new Error(`Request to ${url} timed out after ${formattedThreshold}. Please check your network connection or try again.`);

        // Call the onError method to handle and log the timeout error
        this.onError(logger, error, resolve);
    }

    // Handles errors that occur during an HTTP request.
    private static onError(logger: Logger, error: any, resolve: any) {
        // Log the error using the provided logger
        logger?.error(`HTTP Request Error: ${error.message}`, error);

        // Resolve the Promise with the error stack trace
        resolve(error.stack);
    }
}

/**
 * Represents an HTTP command with details for making an HTTP request.
 */
export class HttpCommand {
    /**
     * The endpoint command for the HTTP request.
     */
    public command: string;

    /**
     * The request body for the HTTP request.
     */
    public body: any;

    /**
     * The headers for the HTTP request.
     */
    public headers: any;

    /**
     * The HTTP method for the request (e.g., 'GET', 'POST').
     */
    public method: string;

    /**
     * The URI schema for the HTTP request (e.g., 'http', 'https').
     */
    public schema: string;

    /**
     * The timeout threshold for the HTTP request in milliseconds.
     */
    public timeout: number;

    /**
     * Creates a new instance of the HttpCommand class with default values.
     */
    constructor() {
        // Default values for the HttpCommand properties
        this.command = '/';
        this.body = null;
        this.headers = {};
        this.method = 'GET';
        this.schema = 'http';
        this.timeout = 180000;
    }

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
