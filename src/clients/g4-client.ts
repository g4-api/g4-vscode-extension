import { HttpClient, HttpCommand, HttpResult } from "./http-client";

// Timeout of a cache sync. The Hub loads every external repository and MCP server before it
// answers; one MCP server and one repository already took 9.2 s, so 5 s failed on every activation.
const SYNC_CACHE_TIMEOUT_MILLISECONDS = 60000;

/**
 * Client for interacting with the G4 server API.
 *
 * Wraps HTTP operations and provides methods to register and fetch resources.
 *
 * @remarks
 * HttpClient never rejects; it resolves an HttpResult. The read methods turn a failure into
 * `undefined`, and the write methods return the result (or its failure text) so callers can report
 * the real outcome instead of assuming success.
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
     * Builds a one-line failure message for a failed request, for notifications and the log.
     *
     * @remarks
     * A timeout or network failure (status 0) already carries its reason as text. A Hub response
     * is reduced to its status plus the problem title and field messages.
     *
     * @param result - The failed request outcome.
     * @returns The message to show the user.
     */
    public static getFailureMessage(result: HttpResult): string {
        // A request that got no response carries the failure reason as its body.
        if (result.status === 0) {
            return typeof result.body === 'string' ? result.body : 'No response from the G4 Hub.';
        }

        // A Hub response is described by its status and the reason in its problem body.
        const problemText = HttpClient.getProblemText(result.body);

        return problemText === ''
            ? `The G4 Hub answered ${result.status}.`
            : `The G4 Hub answered ${result.status}: ${problemText}`;
    }

    /**
     * Retrieve the G4 integration cache from the Hub API.
     *
     * Sends an HTTP GET request to:
     *   `api/v{version}/g4/integration/cache`
     * using a 5-second timeout. On success, resolves with the cache payload
     * returned by the server. On failure (already logged by HttpClient), resolves `undefined`.
     *
     * Notes:
     * - This method **does not throw** on failure.
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

        // Only a successful object response is a cache; a failure must never be read as one.
        const result = await this.httpClient.sendAsync(command);
        const isCache = result.ok && result.body !== null && typeof result.body === 'object';

        return isCache ? result.body : undefined;
    }

    /**
     * Synchronizes the plugin cache using the provided external repositories and MCP servers.
     *
     * @param syncOptions The synchronization payload that contains external repositories
     * and server definitions to send to the integration endpoint.
     * @returns The request outcome; `ok` is false when the Hub rejected the sync or did not answer
     *     within 60 seconds.
     */
    public async syncCache(syncOptions: { repositories: [any], servers: any }): Promise<HttpResult> {
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

        // Allow the Hub time to load every external repository and MCP server.
        command.timeout = SYNC_CACHE_TIMEOUT_MILLISECONDS;

        // Send the request; the caller reports the outcome.
        return this.httpClient.sendAsync(command);
    }

    /**
     * Synchronizes tools with the remote server by sending an HTTP GET request
     * to the tool synchronization endpoint. The request uses a 5-second timeout.
     *
     * @remarks
     * This method constructs an HTTP command targeting the MCP tool synchronization endpoint
     * and executes it asynchronously using the configured HTTP client. Failures are logged by
     * HttpClient and returned to the caller.
     *
     * @returns The request outcome.
     *
     * @example
     * const result = await client.syncTools();
     */
    public async syncTools(): Promise<HttpResult> {
        // Construct a new HTTP command for the tool synchronization endpoint
        const command = new HttpCommand();

        // Build the request URL path for tool synchronization
        command.command = `api/v${this._version}/g4/mcp/sync`;

        // Use the HTTP GET method for synchronization
        command.method = 'GET';

        // Set a timeout of 5 seconds for the request
        command.timeout = 5000;

        // Send the request; the caller reports the outcome.
        return this.httpClient.sendAsync(command);
    }

    /**
     * Sends a PUT request to create or update an environment on the server.
     *
     * @param name        - The unique name of the environment to update.
     * @param encode      - Whether the server should encode the response (true/false).
     * @param environment - The environment payload object to send in the request body.
     *
     * @returns The request outcome, so the caller can report whether the environment was stored.
     */
    public async updateEnvironment(name: string, encode: boolean, environment: any): Promise<HttpResult> {
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

        // Send the request; the caller reports the outcome.
        return this.httpClient.sendAsync(command);
    }

    /**
     * Reads one stored flow manifest from the G4 Hub.
     *
     * @remarks
     * Used by the flow publisher to detect that a key already exists (so publishing would
     * overwrite it) and to pre-fill the form from the stored values. Any failure (404 Not Found,
     * timeout, Hub unreachable) or a response that is not a manifest is treated as "no stored flow".
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

        // Only a successful JSON object with a key is a stored manifest; everything else means "not available".
        const result = await this.httpClient.sendAsync(command);

        return G4Client.testManifest(result) ? result.body : undefined;
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
        const result = await this.httpClient.sendAsync(command);

        return G4Client.getSchemas(result, 'G4FlowManifestModel');
    }

    /**
     * Sends a PUT request that creates or overwrites one flow in the G4 Hub.
     *
     * @remarks
     * The flows endpoint answers 204 No Content on success. Any failure is returned as text: the
     * JSON problem body of a Hub response (such as a 400 validation error), or the reason of a
     * timeout or network failure. That lets callers count and report failures.
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

        // Send the request; only a failure carries text back to the publisher.
        const result = await this.httpClient.sendAsync(command);

        return result.ok ? undefined : G4Client.getFailureText(result);
    }

    /**
     * Sends a PUT request that creates or overwrites one template in the G4 Hub.
     *
     * @remarks
     * Used by the Update-Template command, which reports the outcome per template; the template
     * publisher uses `publishTemplate`, which returns the failure text for its form.
     *
     * @param template - G4PluginAttribute payload to send in the request body.
     * @returns The request outcome, so the caller can report whether the template was stored.
     */
    public async updateTemplate(template: any): Promise<HttpResult> {
        // Construct a new HTTP command for the template update endpoint
        const command = new HttpCommand();

        // Build the versioned templates route; the template identifies itself by its key
        command.command = `api/v${this._version}/g4/templates`;

        // Attach the template object as the request body
        command.body = template;

        // Use the HTTP PUT method for update semantics
        command.method = 'PUT';

        // Ensure server interprets the body as JSON
        command.addHeader('Content-Type', 'application/json');

        // Set a timeout of 5 seconds for the request
        command.timeout = 5000;

        // Send the request; the caller reports the outcome.
        return this.httpClient.sendAsync(command);
    }

    /**
     * Reads one stored template manifest from the G4 Hub.
     *
     * @remarks
     * Used by the template publisher to detect that a key already exists (so publishing would
     * overwrite it) and to pre-fill the form from the stored values. The Hub identifies a template
     * by key alone. Any failure (404 Not Found, timeout, Hub unreachable) or a response that is not
     * a manifest is treated as "no stored template".
     *
     * @param key - Template key, matched case-insensitively by the server.
     * @returns The stored G4PluginAttribute manifest, or `undefined` when none is available.
     */
    public async getTemplate(key: string): Promise<any | undefined> {
        // Build a GET for the template route; the key is URL-encoded.
        const command = new HttpCommand();
        command.command = `api/v${this._version}/g4/templates/${encodeURIComponent(key)}`;
        command.method = 'GET';
        command.timeout = 5000;

        // Only a successful JSON object with a key is a stored manifest; everything else means "not available".
        const result = await this.httpClient.sendAsync(command);

        return G4Client.testManifest(result) ? result.body : undefined;
    }

    /**
     * Reads the template manifest schema published by the G4 Hub's OpenAPI document.
     *
     * @remarks
     * Returns `components.schemas` from `swagger/templates/docs.json`: G4PluginAttribute plus the
     * models it references. `$ref` links are left as-is for the consumer to resolve. When the Hub
     * is unreachable or the document has no template schema, `undefined` is returned so the caller
     * can fall back to a bundled copy.
     *
     * @returns The schemas map, or `undefined` when it cannot be read.
     */
    public async getTemplateSchema(): Promise<Record<string, any> | undefined> {
        // The OpenAPI documents live outside the versioned API route.
        const command = new HttpCommand();
        command.command = 'swagger/templates/docs.json';
        command.method = 'GET';
        command.timeout = 5000;

        // Accept the document only when it actually carries the template manifest schema.
        const result = await this.httpClient.sendAsync(command);

        return G4Client.getSchemas(result, 'G4PluginAttribute');
    }

    /**
     * Sends a PUT request that creates or overwrites one template in the G4 Hub and reports failures.
     *
     * @remarks
     * The templates endpoint answers 204 No Content on success. Any failure is returned as text: the
     * JSON problem body of a Hub response (such as a 400 validation error or a 409 invalid
     * manifest), or the reason of a timeout or network failure. Unlike `updateTemplate`, this lets
     * the publisher report the failure on the form.
     *
     * @param manifest - G4PluginAttribute payload; `rules` is a JSON array of rules.
     * @returns `undefined` when the template was stored; otherwise the failure text.
     */
    public async publishTemplate(manifest: any): Promise<string | undefined> {
        // Build a PUT against the templates endpoint with a JSON manifest body.
        const command = new HttpCommand();
        command.command = `api/v${this._version}/g4/templates`;
        command.body = manifest;
        command.method = 'PUT';
        command.addHeader('Content-Type', 'application/json');
        command.timeout = 5000;

        // Send the request; only a failure carries text back to the publisher.
        const result = await this.httpClient.sendAsync(command);

        return result.ok ? undefined : G4Client.getFailureText(result);
    }

    /**
     * Converts a failed request into the text the publishers parse.
     *
     * @remarks
     * The publishers read a JSON problem body for field errors, and read any other text through
     * `Utilities.convertToHubFailureText`, which recognises timeouts and refused connections. An
     * empty failure body is replaced by its status, so a failure is never mistaken for success.
     *
     * @param result - The failed request outcome.
     * @returns The JSON problem body, the failure text, or the status when the body is empty.
     */
    private static getFailureText(result: HttpResult): string {
        // A structured problem body stays JSON, so the publishers can read its field errors.
        if (result.body !== null && typeof result.body === 'object') {
            return JSON.stringify(result.body);
        }

        // A text body is used as-is unless it is empty.
        const isText = typeof result.body === 'string' && result.body.trim() !== '';

        return isText ? result.body as string : `The G4 Hub answered ${result.status} with no details.`;
    }

    // Reads `components.schemas` from a successful OpenAPI response that carries the named model.
    private static getSchemas(result: HttpResult, modelName: string): Record<string, any> | undefined {
        // A failed request has no document to read.
        if (!result.ok) {
            return undefined;
        }

        // Accept the schemas map only when it carries the expected model.
        const schemas = (result.body as { components?: { schemas?: unknown; }; } | undefined)?.components?.schemas;
        const isSchemas = schemas !== null && typeof schemas === 'object';
        const schemasMap = schemas as Record<string, any>;

        return isSchemas && schemasMap[modelName] !== undefined ? schemasMap : undefined;
    }

    // Tests that a request returned a stored manifest: a successful JSON object with a string key.
    private static testManifest(result: HttpResult): boolean {
        const manifest = result.body as { key?: unknown; } | null;

        return result.ok && manifest !== null && typeof manifest === 'object' && typeof manifest.key === 'string';
    }
}
