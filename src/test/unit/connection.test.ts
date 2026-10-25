/*
 * Unit tests for the Hub connection attempt (STU-13) and the recorder health probe (STU-22).
 */
import * as assert from 'node:assert/strict';
import { createServer, Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { NotificationService } from '../../clients/g4-signalr-client';
import { Logger } from '../../logging/logger';
import { G4ServiceHealth } from '../../services/g4-service-health';

// Time to wait after a failed start, longer than the 5 s retry the client used to schedule on its own.
const NO_RETRY_WAIT_MILLISECONDS = 5500;

/**
 * Starts a local HTTP server that answers every request with the given status.
 *
 * @param statusCode - Status of every answer.
 * @returns The listening server and its base URL.
 */
const startStatusServer = async (statusCode: number): Promise<{ baseUrl: string; server: Server; }> => {
    // Listen on a free port, chosen by the operating system.
    const server = createServer((_request, response) => {
        response.writeHead(statusCode);
        response.end();
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));

    const { port } = server.address() as AddressInfo;

    return { baseUrl: `http://127.0.0.1:${port}`, server };
};

/**
 * Finds a port with nothing listening on it.
 *
 * @returns A closed local port.
 */
const getClosedPort = async (): Promise<number> => {
    const { server } = await startStatusServer(200);
    const { port } = server.address() as AddressInfo;

    await new Promise((resolve) => server.close(resolve));

    return port;
};

describe('G4ServiceHealth.testPing', () => {
    let server: Server | undefined;

    afterEach(() => {
        server?.close();
        server = undefined;
    });

    it('counts a 404 answer as alive only when any status is accepted', async () => {
        // A recorder answers 404 on the Hub's ping route.
        const started = await startStatusServer(404);
        server = started.server;

        assert.equal(await G4ServiceHealth.testPing(started.baseUrl), false);
        assert.equal(await G4ServiceHealth.testPing(started.baseUrl, true), true);
    });

    it('never counts a closed port as alive', async () => {
        const port = await getClosedPort();

        assert.equal(await G4ServiceHealth.testPing(`http://127.0.0.1:${port}`, true), false);
    });
});

describe('NotificationService.start', function () {
    // The test waits past the retry the client used to schedule on its own.
    this.timeout(NO_RETRY_WAIT_MILLISECONDS + 5000);

    it('rejects once when the Hub is down and does not retry on its own', async () => {
        // Record every error line the client writes.
        const errors: string[] = [];
        const logger = {
            error: (message: string) => errors.push(message),
            information: () => undefined,
            warning: () => undefined
        } as unknown as Logger;

        const port = await getClosedPort();
        const client = new NotificationService({ baseUrl: `http://127.0.0.1:${port}`, context: {} as never, logger });

        // The attempt fails and the error reaches the caller, which owns retrying.
        await assert.rejects(client.start());
        await client.stop();

        // No second attempt is made later: the connection loop alone decides when to retry.
        await new Promise((resolve) => setTimeout(resolve, NO_RETRY_WAIT_MILLISECONDS));

        assert.equal(errors.filter((message) => message.startsWith('Failed to connect')).length, 1);
    });
});
