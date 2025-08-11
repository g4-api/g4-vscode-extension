import { Global } from "../constants/global";
import { HttpClient, HttpCommand } from "./http-client";

/**
 * Client for interacting with the G4 server API.
 *
 * Wraps HTTP operations and provides methods to register and fetch resources.
 */
export class G4Client {
    /**
     * Internal HTTP client instance.
     */
    private readonly httpClient: HttpClient;

    /**
     * Creates an instance of G4Client.
     *
     * @param baseUrl - The base URL of the G4 server (e.g., "https://api.example.com").
     * @param version - API version to target (default: 4).
     */
    constructor(baseUrl: string, private readonly _version: number = 4) {
        // Initialize HttpClient with the provided base server URL
        this.httpClient = new HttpClient(baseUrl);
    }

    /**
     * Sends a PUT request to create or update an environment on the server.
     *
     * @param name        - The unique name of the environment to update.
     * @param encode      - Whether the server should encode the response (true/false).
     * @param environment - The environment payload object to send in the request body.
     * 
     * @returns A Promise that resolves when the update completes (errors are logged).
     */
    public async updateEnvironment(name: string, encode: boolean, environment: any): Promise<void> {
        // Construct a new HTTP command for the environment update endpoint
        const command = new HttpCommand();

        // Build the request URL path with version, environment name, and encode flag
        command.command = `api/v${this._version}/g4/environments/${name}?encode=${encode ? 'true' : 'false'}`;

        // Attach the environment object as the request body
        command.body = environment;

        // Use the HTTP PUT method for update semantics
        command.method = 'PUT';

        // Ensure server interprets the body as JSON
        command.addHeader('Content-Type', 'application/json');

        // Set a timeout of 5 seconds for the request
        command.timeout = 5000;

        try {
            // Execute the HTTP request asynchronously
            await this.httpClient.sendAsync(command);
        } catch (err: any) {
            // Log any errors encountered during the request
            Global.logger.error(err.message);
        }
    }

        /**
     * Sends a PUT request to create or update an environment on the server.
     *
     * @param name        - The unique name of the environment to update.
     * @param encode      - Whether the server should encode the response (true/false).
     * @param environment - The environment payload object to send in the request body.
     * 
     * @returns A Promise that resolves when the update completes (errors are logged).
     */
    public async updateTemplate(template: any): Promise<void> {
        // Construct a new HTTP command for the template update endpoint
        const command = new HttpCommand();

        // Build the request URL path with version, template name, and encode flag
        command.command = `api/v${this._version}/g4/templates`;

        // Attach the template object as the request body
        command.body = template;

        // Use the HTTP PUT method for update semantics
        command.method = 'PUT';

        // Ensure server interprets the body as JSON
        command.addHeader('Content-Type', 'application/json');

        // Set a timeout of 5 seconds for the request
        command.timeout = 5000;

        try {
            // Execute the HTTP request asynchronously
            await this.httpClient.sendAsync(command);
        } catch (err: any) {
            // Log any errors encountered during the request
            Global.logger.error(err.message);
        }
    }
}
