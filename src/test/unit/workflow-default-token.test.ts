/*
 * Unit tests for the designer's default license token: a designer run without its own token uses
 * the project manifest's token, while a token in the bot or typed into the designer always wins.
 *
 * The real page script (the designer body shim) runs in a sandbox with stand-ins for the page,
 * the designer, the VS Code webview API and the SignalR connection.
 */
import * as assert from 'node:assert/strict';
import * as vm from 'node:vm';

import { ShowWorkflowCommand } from '../../commands/show-workflow';

// Manifest token the stand-in extension answers with.
const MANIFEST_TOKEN = 'manifest-token';

/**
 * Runs the designer body shim against stand-ins and returns the pieces a test drives.
 *
 * @returns The wrapped SignalR connection, the messages posted to the extension, and the calls
 *          that reached the original SignalR invoke.
 */
const startShim = async (): Promise<{
    connection: { invoke: (methodName: string, ...methodArguments: unknown[]) => Promise<unknown>; };
    invokedCalls: { methodArguments: unknown[]; methodName: string; }[];
    postedMessages: { payload?: { requestId?: number; }; type: string; }[];
}> => {
    // Collect the page listeners, so the test can raise DOMContentLoaded and extension messages.
    const windowListeners: Record<string, ((event: unknown) => void)[]> = {};
    const postedMessages: { payload?: { requestId?: number; }; type: string; }[] = [];
    const invokedCalls: { methodArguments: unknown[]; methodName: string; }[] = [];

    // The stand-in extension answers every token request with the manifest token.
    const sendToPage = (data: unknown): void => {
        for (const listener of windowListeners.message ?? []) {
            listener({ data });
        }
    };

    const vscodeApi = {
        postMessage: (message: { payload?: { requestId?: number; }; type: string; }): void => {
            postedMessages.push(message);

            if (message.type === 'workflow:token:get') {
                queueMicrotask(() => sendToPage({
                    payload: { requestId: message.payload?.requestId, token: MANIFEST_TOKEN },
                    type: 'workflow:token'
                }));
            }
        }
    };

    // The original SignalR invoke records what reached the Hub.
    const connection = {
        invoke: async (methodName: string, ...methodArguments: unknown[]): Promise<unknown> => {
            invokedCalls.push({ methodArguments, methodName });
            return undefined;
        }
    };

    const sandbox = {
        _connection: connection,
        _designer: { onDefinitionChanged: { subscribe: (): void => undefined } },
        clearInterval,
        clearTimeout,
        console,
        document: {
            getElementById: () => ({ addEventListener: (): void => undefined }),
            querySelector: () => ({})
        },
        setDefinition: (): void => undefined,
        setInterval,
        setTimeout,
        structuredClone,
        window: {
            addEventListener: (type: string, listener: (event: unknown) => void): void => {
                windowListeners[type] = [...(windowListeners[type] ?? []), listener];
            },
            vscodeApi
        }
    };

    // Run the page script exactly as the designer tab receives it.
    const shimHtml = (ShowWorkflowCommand as unknown as { getBodyShim: () => string; }).getBodyShim();
    const script = shimHtml.replace('<script>', '').replace('</script>', '');

    vm.runInNewContext(script, sandbox);

    // Load the page, then wait until the designer is ready and the invoke is wrapped.
    for (const listener of windowListeners.DOMContentLoaded ?? []) {
        listener({});
    }

    for (let attempt = 0; attempt < 50 && !postedMessages.some(i => i.type === 'webview:ready'); attempt++) {
        await new Promise(resolve => setTimeout(resolve, 20));
    }

    return { connection, invokedCalls, postedMessages };
};

describe('Designer console credential masking', () => {
    it('masks the token and password in a logged automation request', () => {
        const text = '{"type":"Automation","value":{"authentication":{"password":"secret","token":"abc+/=","username":"u"}}}';

        assert.equal(
            ShowWorkflowCommand.convertToMaskedText(text),
            '{"type":"Automation","value":{"authentication":{"password":"***","token":"***","username":"u"}}}');
    });

    it('masks credentials in JSON nested as an escaped string', () => {
        const text = String.raw`{"message":"{\"authentication\":{\"token\":\"abc\",\"password\":\"p\"}}"}`;

        assert.equal(
            ShowWorkflowCommand.convertToMaskedText(text),
            String.raw`{"message":"{\"authentication\":{\"token\":\"***\",\"password\":\"***\"}}"}`);
    });

    it('leaves text without credentials unchanged, and logs nothing for non-text', () => {
        assert.equal(ShowWorkflowCommand.convertToMaskedText('Workflow designer ready.'), 'Workflow designer ready.');
        assert.equal(ShowWorkflowCommand.convertToMaskedText({ token: 'abc' }), '');
    });
});

describe('Designer default license token', () => {
    it('reads the token from the manifest, and nothing when the manifest has none', () => {
        assert.equal(ShowWorkflowCommand.getManifestToken({ authentication: { token: 'abc' } }), 'abc');
        assert.equal(ShowWorkflowCommand.getManifestToken({ authentication: {} }), '');
        assert.equal(ShowWorkflowCommand.getManifestToken(undefined), '');
    });

    it('fills an empty token of a starting run with the manifest token', async () => {
        const { connection, invokedCalls } = await startShim();
        const automation = { authentication: { password: '', token: '', username: '' } };

        await connection.invoke('StartAutomation', automation);

        // Compare as JSON: the filled object comes from the sandbox, whose Object prototype differs.
        assert.equal(invokedCalls.length, 1);
        assert.equal(
            JSON.stringify((invokedCalls[0].methodArguments[0] as typeof automation).authentication),
            JSON.stringify({ password: '', token: MANIFEST_TOKEN, username: '' }));
    });

    it('keeps a token the bot or the user provided', async () => {
        const { connection, invokedCalls, postedMessages } = await startShim();
        const automation = { authentication: { token: 'user-token' } };

        await connection.invoke('StartAutomation', automation);

        assert.equal((invokedCalls[0].methodArguments[0] as typeof automation).authentication.token, 'user-token');
        assert.equal(postedMessages.some(i => i.type === 'workflow:token:get'), false);
    });

    it('leaves every other SignalR call unchanged', async () => {
        const { connection, invokedCalls, postedMessages } = await startShim();

        await connection.invoke('SendHeartbeat');

        assert.deepEqual(invokedCalls, [{ methodArguments: [], methodName: 'SendHeartbeat' }]);
        assert.equal(postedMessages.some(i => i.type === 'workflow:token:get'), false);
    });
});
