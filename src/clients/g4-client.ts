import { ResourceModel } from "../models/register-data-model";
import { HttpClient, HttpCommand } from "./http-client";
import { IncomingMessage, request, RequestOptions } from 'http';

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

    public async updateEnvironment(name: string, encode: boolean, environment: any): Promise<void> {
        const command = new HttpCommand();
        command.command = `api/v${this._version}/g4/environments/${name}?encode=${encode ? 'true' : 'false'}`;
        command.body = environment;
        command.method = 'PUT';
        command.addHeader('Content-Type', 'application/json');
        command.timeout = 5000;
        
        (async () => {
            try {
                await this.httpClient.sendAsync(command);
            } catch (err: any) {
                console.error('Error:', err.message);
            }
        })();
    }
}
