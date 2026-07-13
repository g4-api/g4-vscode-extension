import type { ClientRequest, IncomingMessage } from 'node:http';
import { request as requestHttp } from 'node:http';
import { request as requestHttps } from 'node:https';

// Keeps each health probe short so startup can continue quickly when a service is offline.
const PING_TIMEOUT_MILLISECONDS = 2000;

// Polls often enough to make startup feel immediate without hammering a process that is booting.
const PING_RETRY_INTERVAL_MILLISECONDS = 1000;

/**
 * Provides shared health checks for local G4 services that expose the standard ping route.
 */
export class G4ServiceHealth {
    /**
     * Sends one ping request to a configured G4 service.
     *
     * @param baseUri - The configured service base URI.
     * @returns True when the ping endpoint returns a 2xx response.
     *
     * @remarks
     * Uses local callback handlers so request lifecycle, timeout cleanup, and error handling stay readable.
     */
    public static async testPing(baseUri: string): Promise<boolean> {
        return new Promise<boolean>((resolve) => {
            let pingRequest: ClientRequest;

            const onPingResponse = (response: IncomingMessage): void => {
                // Drain the response so Node can reuse or close the socket cleanly.
                response.resume();

                // Treat any successful HTTP response as proof that the service is alive.
                const statusCode = response.statusCode ?? 0;
                const isSuccessStatus = statusCode >= 200 && statusCode <= 299;

                resolve(isSuccessStatus);
            };

            const onPingTimeout = (): void => {
                // Destroy the socket on timeout so callers are not blocked by a hung connection.
                pingRequest.destroy();

                resolve(false);
            };

            const onPingError = (): void => {
                // Connection failures simply mean the service is not currently reachable.
                resolve(false);
            };

            // Create the protocol-specific request against the canonical ping endpoint.
            const pingUrl = new URL('/api/v4/g4/ping', baseUri);
            const requestFactory = pingUrl.protocol === 'https:'
                ? requestHttps
                : requestHttp;

            pingRequest = requestFactory(
                pingUrl,
                { method: 'GET', timeout: PING_TIMEOUT_MILLISECONDS },
                onPingResponse
            );

            // Wire timeout and error events after request creation so every failure resolves false.
            pingRequest.on('timeout', onPingTimeout);
            pingRequest.on('error', onPingError);
            pingRequest.end();
        });
    }

    /**
     * Waits for a G4 service to begin answering ping requests.
     *
     * @param baseUri - The configured service base URI.
     * @param timeoutMilliseconds - Maximum duration to poll before giving up.
     * @returns True when the service becomes healthy before the timeout.
     */
    public static async waitForPing(
        baseUri: string,
        timeoutMilliseconds: number
    ): Promise<boolean> {
        // Poll until the startup deadline so slow machines still get a chance to bind the port.
        const deadline = Date.now() + timeoutMilliseconds;

        while (Date.now() < deadline) {
            const isServiceRunning = await this.testPing(baseUri);

            if (isServiceRunning) {
                return true;
            }

            // Pause between probes to give the spawned service time to finish binding its port.
            await this.waitAsync(PING_RETRY_INTERVAL_MILLISECONDS);
        }

        // The service did not become healthy within the startup budget.
        return false;
    }

    /**
     * Waits for the requested duration.
     *
     * @param timeoutMilliseconds - Duration to wait before resolving.
     * @returns A promise that resolves after the timeout elapses.
     */
    private static async waitAsync(timeoutMilliseconds: number): Promise<void> {
        return new Promise<void>((resolve) => {
            setTimeout(resolve, timeoutMilliseconds);
        });
    }
}
