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
     * Retrieve the G4 integration cache from the Hub API.
     *
     * Sends an HTTP GET request to:
     *   `api/v{version}/g4/integration/cache`
     * using a 5-second timeout. On success, resolves with the cache payload
     * returned by the server. On failure, logs the error and resolves `undefined`.
     *
     * Notes:
     * - This method **does not throw** on failure; it catches and logs the error.
     * - The resolved type is `any` because the cache shape is dynamic; narrow it
     *   at call sites if you have a known interface.
     *
     * @returns A promise that resolves to the cache object, or `undefined` if the request fails.
     */
    public async getCache(): Promise<any> {
        // Prepare an HTTP command object for the request.
        const command = new HttpCommand();

        // API route, versioned via the instance's `_version` field.
        command.command = `api/v${this._version}/g4/integration/cache`;

        // HTTP verb to use.
        command.method = 'GET';

        // Fail the request if it exceeds 5 seconds.
        command.timeout = 5000;

        try {
            // Dispatch the request via the shared HTTP client; return the server payload.
            return await this.httpClient.sendAsync(command);
        } catch (err: any) {
            // Swallow the error after logging; caller will receive `undefined`.
            Global.logger.error(err.message);
        }
    }

    /**
     * Synchronizes the plugin cache using the provided external repositories and MCP servers.
     *
     * @param syncOptions The synchronization payload that contains external repositories
     * and server definitions to send to the integration endpoint.
     * @returns A promise that resolves when the synchronization request completes.
     */
    public async syncCache(syncOptions: { repositories: [any], servers: any }): Promise<void> {
        // Create the HTTP command object that will be sent to the integration API.
        const command = new HttpCommand();

        // Set the versioned API route for the cache synchronization endpoint.
        command.command = `api/v${this._version}/g4/integration/cache/sync`;

        // Send the payload as JSON.
        command.addHeader('Content-Type', 'application/json');

        // Attach the synchronization payload that contains repositories and servers.
        command.body = syncOptions;

        // Use HTTP POST to trigger cache synchronization.
        command.method = 'POST';

        // Abort the request if it takes longer than 5 seconds.
        command.timeout = 5000;

        try {
            // Send the request using the shared HTTP client.
            await this.httpClient.sendAsync(command);
        } catch (err: any) {
            // Log the failure and suppress the exception so the caller receives no result.
            Global.logger.error(err.message);
        }
    }

    /**
     * Synchronizes tools with the remote server by sending an HTTP GET request
     * to the tool synchronization endpoint. The request uses a 5-second timeout.
     * Any errors encountered during the request are logged.
     *
     * @remarks
     * This method constructs an HTTP command targeting the environment update endpoint
     * and executes it asynchronously using the configured HTTP client.
     *
     * @returns {Promise<void>} A promise that resolves when the synchronization completes.
     *
     * @throws Will log an error if the HTTP request fails.
     *
     * @example
     * await client.syncTools();
     */
    public async syncTools(): Promise<void> {
        // Construct a new HTTP command for the environment update endpoint
        const command = new HttpCommand();

        // Build the request URL path for tool synchronization
        command.command = `api/v${this._version}/g4/mcp/sync`;

        // Use the HTTP GET method for synchronization
        command.method = 'GET';

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
     * Reads one stored flow manifest from the G4 Hub.
     *
     * @remarks
     * Used by the flow publisher to detect that a key already exists (so publishing would
     * overwrite it) and to pre-fill the form from the stored values. HttpClient resolves failures
     * with their error text instead of rejecting, so any non-object response (404 Not Found,
     * timeout, Hub unreachable) is treated as "no stored flow".
     *
     * @param flowNamespace - Flow namespace, matched case-insensitively by the server.
     * @param key - Flow key or alias.
     * @returns The stored G4FlowManifestModel, or `undefined` when none is available.
     */
    public async getFlow(flowNamespace: string, key: string): Promise<any | undefined> {
        // Build a GET for the namespaced flow route; both segments are URL-encoded.
        const command = new HttpCommand();
        command.command = `api/v${this._version}/g4/flows/${encodeURIComponent(flowNamespace)}/${encodeURIComponent(key)}`;
        command.method = 'GET';
        command.timeout = 5000;

        // Only a JSON object with a key is a stored manifest; everything else means "not available".
        const response = await this.httpClient.sendAsync(command);
        const isManifest = response !== null && typeof response === 'object' && typeof response.key === 'string';

        return isManifest ? response : undefined;
    }

    /**
     * Reads the flow manifest schema published by the G4 Hub's OpenAPI document.
     *
     * @remarks
     * Returns `components.schemas` from `swagger/flows/docs.json`: G4FlowManifestModel plus the
     * models it references (PluginAuthorModel, PluginParameterModel). `$ref` links are left as-is
     * for the consumer to resolve. When the Hub is unreachable or the document has no flow schema,
     * `undefined` is returned so the caller can fall back to a bundled copy.
     *
     * @returns The schemas map, or `undefined` when it cannot be read.
     */
    public async getFlowSchema(): Promise<Record<string, any> | undefined> {
        // The OpenAPI documents live outside the versioned API route.
        const command = new HttpCommand();
        command.command = 'swagger/flows/docs.json';
        command.method = 'GET';
        command.timeout = 5000;

        // Accept the document only when it actually carries the flow manifest schema.
        const response = await this.httpClient.sendAsync(command);
        const schemas = response?.components?.schemas;
        const isFlowSchema = schemas !== null && typeof schemas === 'object' && schemas.G4FlowManifestModel !== undefined;

        return isFlowSchema ? schemas : undefined;
    }

    /**
     * Sends a PUT request that creates or overwrites one flow in the G4 Hub.
     *
     * @remarks
     * The flows endpoint answers 204 No Content on success, and HttpClient resolves every request
     * (it never rejects) with either the response body or the error text. An empty response
     * therefore means success, and any other response carries the server's failure details, such
     * as a 400 validation error or a timeout message. That lets callers count and report failures,
     * which the log-only pattern of the other update methods cannot do.
     *
     * @param manifest - G4FlowManifestModel payload whose `automation` is Base64-encoded.
     * @returns `undefined` when the flow was stored; otherwise the failure text.
     */
    public async updateFlow(manifest: any): Promise<string | undefined> {
        // Build a PUT against the flows endpoint with a JSON manifest body.
        const command = new HttpCommand();
        command.command = `api/v${this._version}/g4/flows`;
        command.body = manifest;
        command.method = 'PUT';
        command.addHeader('Content-Type', 'application/json');
        command.timeout = 5000;

        // Send the request; a 204 resolves with an empty body, while failures resolve with their error text.
        const response = await this.httpClient.sendAsync(command);
        const isStored = response === '' || response === null || response === undefined;

        if (isStored) {
            return undefined;
        }

        // Surface the failure text verbatim; structured bodies are already serialized by HttpClient.
        return typeof response === 'string'
            ? response
            : JSON.stringify(response);
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
