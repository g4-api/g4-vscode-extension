import { ResourceModel } from "../models/register-data-model";
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
    constructor(baseUrl: string, version: number = 4) {
        // Initialize HttpClient with the provided base server URL
        this.httpClient = new HttpClient(baseUrl);
    }
}
