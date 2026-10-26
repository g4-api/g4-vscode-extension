/*
 * Unit tests for HttpClient and the G4Client failure messages (STU-02, STU-03).
 *
 * Each test starts a local HTTP server on a free port, so no G4 Hub is needed.
 */
import * as assert from 'node:assert/strict';
import { createServer, IncomingMessage, Server, ServerResponse } from 'node:http';
import { AddressInfo } from 'node:net';
import { G4Client } from '../../clients/g4-client';
import { HttpClient, HttpCommand } from '../../clients/http-client';
import { Logger } from '../../logging/logger';

// Wait after a timeout, so the 'socket hang up' error that follows the timeout has time to arrive.
const SETTLE_WAIT_MILLISECONDS = 300;

/**
 * Starts a local HTTP server that answers every request with the given handler.
 *
 * @param onRequest - Request handler of the test server.
 * @returns The listening server and its base URL.
 */
const startServer = async (
    onRequest: (request: IncomingMessage, response: ServerResponse) => void): Promise<{ baseUrl: string; server: Server; }> => {
    // Listen on a free port, chosen by the operating system.
    const server = createServer(onRequest);

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));

    // Build the base URL from the chosen port.
    const { port } = server.address() as AddressInfo;

    return { baseUrl: `http://127.0.0.1:${port}/`, server };
};

/**
 * Creates a logger that records every error line, so a test can read what a failure logged.
 *
 * @returns The recorded error lines and the logger that fills them.
 */
const newTestLogger = (): { errors: string[]; logger: Logger; } => {
    const errors: string[] = [];
    const logger = { error: (message: string) => errors.push(message) } as unknown as Logger;

    return { errors, logger };
};

/**
 * Creates a GET command for the given route.
 *
 * @param route - Route relative to the base URL.
 * @param timeout - Request timeout in milliseconds.
 * @returns The command.
 */
const newCommand = (route: string, timeout: number): HttpCommand => {
    const command = new HttpCommand();
    command.command = route;
    command.method = 'GET';
    command.timeout = timeout;

    return command;
};

describe('HttpClient.sendAsync', () => {
    let server: Server | undefined;

    afterEach(() => {
        // Close the test server and drop open sockets, so a hanging request cannot keep mocha alive.
        server?.closeAllConnections();
        server?.close();
        server = undefined;
    });

    it('returns ok with the parsed body for a 2xx JSON response', async () => {
        // Answer with a JSON object.
        const started = await startServer((_request, response) => {
            response.writeHead(200, { 'Content-Type': 'application/json' });
            response.end(JSON.stringify({ key: 'value' }));
        });
        server = started.server;
        const { errors, logger } = newTestLogger();

        // Send the request and read the result.
        const result = await new HttpClient(started.baseUrl, logger).sendAsync(newCommand('api/item', 2000));

        // A success carries the parsed body and logs nothing.
        assert.deepEqual(result, { ok: true, status: 200, body: { key: 'value' } });
        assert.deepEqual(errors, []);
    });

    it('returns ok with an empty body for 204 No Content', async () => {
        // Answer with no content, as the Hub does for a stored template or flow.
        const started = await startServer((_request, response) => {
            response.writeHead(204);
            response.end();
        });
        server = started.server;
        const { errors, logger } = newTestLogger();

        // Send the request and read the result.
        const result = await new HttpClient(started.baseUrl, logger).sendAsync(newCommand('api/item', 2000));

        // A 204 is a success with an empty text body.
        assert.deepEqual(result, { ok: true, status: 204, body: '' });
        assert.deepEqual(errors, []);
    });

    it('returns the status and problem body for a 4xx response and logs the URL and reason', async () => {
        // Answer with a problem body, as the Hub does for a validation error.
        const problem = { title: 'One or more validation errors occurred.', errors: { key: ['The key is required.'] } };
        const started = await startServer((_request, response) => {
            response.writeHead(400, { 'Content-Type': 'application/problem+json' });
            response.end(JSON.stringify(problem));
        });
        server = started.server;
        const { errors, logger } = newTestLogger();

        // Send the request and read the result.
        const result = await new HttpClient(started.baseUrl, logger).sendAsync(newCommand('api/templates', 2000));

        // The failure keeps the status and the problem body.
        assert.deepEqual(result, { ok: false, status: 400, body: problem });

        // One log line names the method, the full URL, the status, the title and the field message.
        assert.equal(errors.length, 1);
        assert.match(errors[0], /-Method GET -Url http:\/\/127\.0\.0\.1:\d+\/api\/templates = \(400\)/);
        assert.match(errors[0], /One or more validation errors occurred\. The key is required\./);

        // The user message carries the same reason.
        assert.equal(
            G4Client.getFailureMessage(result),
            'The G4 Hub answered 400: One or more validation errors occurred. The key is required.');
    });

    it('returns the status and text body for a 5xx response', async () => {
        // Answer with a plain-text server error.
        const started = await startServer((_request, response) => {
            response.writeHead(502, { 'Content-Type': 'text/plain' });
            response.end('MCP server localhost:1 is not reachable');
        });
        server = started.server;
        const { errors, logger } = newTestLogger();

        // Send the request and read the result.
        const result = await new HttpClient(started.baseUrl, logger).sendAsync(newCommand('api/sync', 2000));

        // The failure keeps the status and the text body, and the log line ends with the reason.
        assert.deepEqual(result, { ok: false, status: 502, body: 'MCP server localhost:1 is not reachable' });
        assert.equal(errors.length, 1);
        assert.match(errors[0], /= \(502\) MCP server localhost:1 is not reachable$/);
    });

    it('returns status 0 for a timeout and logs it once', async () => {
        // Accept the request but never answer it.
        const started = await startServer(() => { /* Never answer. */ });
        server = started.server;
        const { errors, logger } = newTestLogger();

        // Send the request with a short timeout, then wait for the follow-up socket error.
        const result = await new HttpClient(started.baseUrl, logger).sendAsync(newCommand('api/slow', 200));

        await new Promise((resolve) => setTimeout(resolve, SETTLE_WAIT_MILLISECONDS));

        // The timeout is a failure without a status; only the timeout is logged, not 'socket hang up'.
        assert.equal(result.ok, false);
        assert.equal(result.status, 0);
        assert.match(result.body as string, /timed out after 200 milliseconds/);
        assert.equal(errors.length, 1);
        assert.match(errors[0], /api\/slow timed out after 200 milliseconds$/);
    });

    it('returns status 0 with a readable reason for a refused connection', async () => {
        // Find a free port, then close it, so the connection is refused.
        const started = await startServer(() => { /* Not used. */ });
        const { port } = started.server.address() as AddressInfo;

        await new Promise((resolve) => started.server.close(resolve));

        // Use 'localhost', which Node tries on IPv6 and IPv4 and reports as an AggregateError with an
        // empty message.
        const { errors, logger } = newTestLogger();
        const result = await new HttpClient(`http://localhost:${port}/`, logger).sendAsync(newCommand('api/cache', 2000));

        // The failure has no status, and both the body and the log name the refused connection.
        assert.equal(result.ok, false);
        assert.equal(result.status, 0);
        assert.match(result.body as string, /ECONNREFUSED/);
        assert.equal(errors.length, 1);
        assert.match(errors[0], /api\/cache failed: .*ECONNREFUSED/);
    });
});

describe('G4Client.getFailureMessage', () => {
    it('uses the failure text when no response arrived', () => {
        // A timeout or network failure carries its reason as the body.
        const message = G4Client.getFailureMessage({ ok: false, status: 0, body: 'connect ECONNREFUSED 127.0.0.1:9944' });

        assert.equal(message, 'connect ECONNREFUSED 127.0.0.1:9944');
    });

    it('names the status when the response body is empty', () => {
        // A failure with an empty body still names its status.
        const message = G4Client.getFailureMessage({ ok: false, status: 500, body: '' });

        assert.equal(message, 'The G4 Hub answered 500.');
    });
});
