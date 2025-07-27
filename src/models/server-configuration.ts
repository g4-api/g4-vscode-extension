/**
 * Configuration details for connecting to a G4 server.
 */
export type ServerConfiguration = {
    /** URI scheme to use (e.g., "http" or "https"). */
    schema: string;

    /** Hostname or IP address of the server (e.g., "api.example.com"). */
    host: string;
    
    /** Port number as a string (e.g., "80" or "443"). */
    port: string;
};
