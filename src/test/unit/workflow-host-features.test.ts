/*
 * Unit tests for the designer page's optional G4 Hub features.
 *
 * A G4 Hub older than this extension publishes a host object without the method the extension calls.
 * The page must lose only that feature: dropping a bot file on the canvas, showing the flow the
 * extension sends, and reporting edits all keep working, and the extension is told what is missing so
 * it can tell the user.
 *
 * The real page script (the designer body shim) runs in a sandbox with stand-ins for the page, the
 * designer, the VS Code webview API, and the Hub's host objects.
 */
import * as assert from 'node:assert/strict';
import * as vm from 'node:vm';

import { ShowWorkflowCommand } from '../../commands/show-workflow';

// The message the page posts for a Hub feature it cannot register.
const UNAVAILABLE_MESSAGE_TYPE = 'workflow:host:feature:unavailable';

// A flow the extension sends to the page, as the bot file holds it.
const DEFINITION = { properties: { name: 'login' }, sequence: [] };

/**
 * Returns an empty record of what the page called on the Hub host objects.
 *
 * @remarks
 * Compute-only. Every test owns one record, so one test's calls never reach another.
 *
 * @returns The record the host stand-ins fill.
 */
const newHostCalls = (): HostCalls => ({
    manifestFilters: [],
    receivedStates: [],
    store: undefined,
    storage: undefined
});

/**
 * Builds the Hub host objects of a Hub that has every feature this extension uses.
 *
 * @param calls - Collects what the page called on the hosts.
 * @returns The two host objects the designer page publishes.
 */
const newCurrentHosts = (calls: HostCalls): HostObjects => ({
    G4DesignerPlugins: {
        receiveState: (pluginName: string, state: unknown): void => {
            calls.receivedStates.push({ pluginName, state });
        },
        setStateStorage: (storage: unknown): void => {
            calls.storage = storage;
        }
    },
    G4ToolboxesFilter: {
        setToolboxesFilterManifest: (filter: unknown): void => {
            calls.manifestFilters.push(filter);
        },
        setToolboxesFilterStore: (store: unknown): void => {
            calls.store = store;
        }
    }
});

/**
 * Runs the designer body shim against stand-ins and returns the pieces a test drives.
 *
 * @param hosts - The Hub host objects the page finds, as that Hub version publishes them.
 * @returns What the page wired, called and posted, and a function that sends it a message.
 */
const startShim = async (hosts: HostObjects): Promise<ShimHarness> => {
    // Collect the page listeners, so the test can raise DOMContentLoaded and extension messages.
    const windowListeners: Record<string, ((event: unknown) => void)[]> = {};
    const designerListeners: Record<string, ((event: unknown) => void)[]> = {};
    const postedMessages: PostedMessage[] = [];
    const definitions: unknown[] = [];

    const sendToPage = (data: unknown): void => {
        for (const listener of windowListeners.message ?? []) {
            listener({ data });
        }
    };

    const invokeFileDrop = (fileUri: string): void => {
        for (const listener of designerListeners.drop ?? []) {
            listener({ dataTransfer: { getData: (): string => fileUri }, preventDefault: (): void => undefined });
        }
    };

    // Stand in for the Hub page: the designer, the SignalR connection, and the Hub host objects.
    const sandbox: Record<string, unknown> = {
        _client: { newAutomation: (): unknown => ({}) },
        _connection: { invoke: async (): Promise<unknown> => undefined },
        _designer: { getDefinition: (): unknown => ({}), onDefinitionChanged: { subscribe: (): void => undefined } },
        clearInterval,
        clearTimeout,
        console,
        document: {
            getElementById: () => ({
                addEventListener: (type: string, listener: (event: unknown) => void): void => {
                    designerListeners[type] = [...(designerListeners[type] ?? []), listener];
                }
            }),
            querySelector: () => ({})
        },
        Observer: class { },
        resetView: (): void => undefined,
        setDefinition: (definition: unknown): void => {
            definitions.push(definition);
        },
        setInterval,
        setTimeout,
        structuredClone,
        window: {
            addEventListener: (type: string, listener: (event: unknown) => void): void => {
                windowListeners[type] = [...(windowListeners[type] ?? []), listener];
            },
            vscodeApi: { postMessage: (message: PostedMessage): number => postedMessages.push(message) }
        },
        ...hosts
    };
    sandbox.globalThis = sandbox;

    // Run the page script exactly as the designer tab receives it.
    const shimHtml = (ShowWorkflowCommand as unknown as { getBodyShim: () => string; }).getBodyShim();
    const script = shimHtml.replace('<script>', '').replace('</script>', '');

    vm.runInNewContext(script, sandbox);

    // Load the page, then wait until it reports ready.
    for (const listener of windowListeners.DOMContentLoaded ?? []) {
        listener({});
    }

    for (let attempt = 0; attempt < 50 && !postedMessages.some(message => message.type === 'webview:ready'); attempt++) {
        await new Promise(resolve => setTimeout(resolve, 20));
    }

    return { definitions, invokeFileDrop, postedMessages, sendToPage };
};

/**
 * Returns the feature names the page reported as unavailable.
 *
 * @param postedMessages - The messages the page posted to the extension.
 * @returns One name per report, in the order they were posted.
 */
const selectUnavailableFeatures = (postedMessages: PostedMessage[]): string[] => postedMessages
    .filter(message => message.type === UNAVAILABLE_MESSAGE_TYPE)
    .map(message => (message.payload as { feature?: string; })?.feature ?? '');

describe('Designer page against a G4 Hub without every feature', () => {
    it('keeps drag and drop, the sent flow and the ready signal on a Hub without the filter store', async () => {
        // The Hub of sandbox v2026.11.10.86: the filter host exists, but keeps the user filter in a
        // cookie and has no store setter, so an unguarded call throws while the page script runs.
        const hosts = newCurrentHosts(newHostCalls());

        delete (hosts.G4ToolboxesFilter as Record<string, unknown>).setToolboxesFilterStore;

        const { definitions, invokeFileDrop, postedMessages, sendToPage } = await startShim(hosts);

        // The page reached the end of its script: it reported ready and wired its listeners.
        assert.ok(postedMessages.some(message => message.type === 'webview:ready'), 'the page reports it is ready');

        // Dropping a bot file on the canvas still asks the extension to import it.
        invokeFileDrop('file:///c%3A/project/bots/login.json');

        const importMessages = postedMessages.filter(message => message.type === 'workflow:import');

        // The page builds its messages inside the sandbox, so values are compared as JSON text.
        assert.equal(importMessages.length, 1, 'a dropped file is sent to the extension');
        assert.equal(
            JSON.stringify(importMessages[0].payload),
            JSON.stringify({ fileUri: 'file:///c%3A/project/bots/login.json' }));

        // The flow the extension sends is still drawn, instead of leaving the default empty flow.
        sendToPage({ payload: { content: JSON.stringify(DEFINITION) }, type: 'workflow:import' });

        assert.equal(definitions.length, 1, 'the flow the extension sends is drawn');
        assert.equal(JSON.stringify(definitions[0]), JSON.stringify(DEFINITION));
    });

    it('reports only the missing feature, and registers the ones the Hub has', async () => {
        const calls = newHostCalls();
        const hosts = newCurrentHosts(calls);

        delete (hosts.G4ToolboxesFilter as Record<string, unknown>).setToolboxesFilterStore;

        const { postedMessages } = await startShim(hosts);

        // One report, naming the feature in the user's words, and the plugin storage still registered.
        assert.deepEqual(selectUnavailableFeatures(postedMessages), ['saving your own toolbox filter']);
        assert.ok(calls.storage, 'the plugins state storage is still registered');
        assert.equal(calls.store, undefined, 'no filter store is registered on a Hub without it');
    });

    it('registers every feature and reports none on a Hub that has them all', async () => {
        const calls = newHostCalls();
        const { postedMessages, sendToPage } = await startShim(newCurrentHosts(calls));

        assert.deepEqual(selectUnavailableFeatures(postedMessages), []);
        assert.ok(calls.storage, 'the plugins state storage is registered');
        assert.ok(calls.store, 'the toolboxes filter store is registered');

        // The manifest filter still reaches the Hub host.
        sendToPage({
            payload: { toolboxesFilter: { toolboxes: [{ enabled: false, name: 'Mobile' }], tools: [] } },
            type: 'workflow:toolboxes:set'
        });

        assert.equal(calls.manifestFilters.length, 1, 'the manifest filter is applied');
        assert.deepEqual(selectUnavailableFeatures(postedMessages), []);
    });

    it('keeps the editor when the Hub publishes no host objects at all', async () => {
        const { definitions, invokeFileDrop, postedMessages, sendToPage } = await startShim({});

        assert.ok(postedMessages.some(message => message.type === 'webview:ready'), 'the page reports it is ready');

        invokeFileDrop('file:///c%3A/project/bots/login.json');
        sendToPage({ payload: { content: JSON.stringify(DEFINITION) }, type: 'workflow:import' });

        assert.equal(postedMessages.filter(message => message.type === 'workflow:import').length, 1);
        assert.equal(JSON.stringify(definitions), JSON.stringify([DEFINITION]));

        // Both features are reported, so the user learns why they do nothing.
        assert.deepEqual(selectUnavailableFeatures(postedMessages), [
            'saving the layout of designer plugins, such as collapsed regions',
            'saving your own toolbox filter'
        ]);
    });

    it('hands the other plugins their state when one plugin cannot take its own', async () => {
        const calls = newHostCalls();
        const hosts = newCurrentHosts(calls);

        // A plugin host that throws for one plugin, as a broken designer plugin does.
        (hosts.G4DesignerPlugins as Record<string, unknown>).receiveState = (pluginName: string, state: unknown): void => {
            if (pluginName === 'broken-plugin') {
                throw new Error('plugin failed to take its state');
            }

            calls.receivedStates.push({ pluginName, state });
        };

        const { postedMessages, sendToPage } = await startShim(hosts);

        sendToPage({
            payload: { states: { 'broken-plugin': { isOn: true }, 'collapsible-regions': { regions: [] } } },
            type: 'workflow:plugins:state:set'
        });

        assert.deepEqual(calls.receivedStates.map(received => received.pluginName), ['collapsible-regions']);
        assert.deepEqual(selectUnavailableFeatures(postedMessages), ['the saved state of designer plugin broken-plugin']);
    });
});

// Compile-time contracts stay after the executable code; interfaces precede type aliases, and a caller
// precedes its local dependency chain before A-Z order resumes.

/**
 * The Hub host objects the designer page publishes, as one Hub version has them.
 *
 * @remarks
 * Both are optional because each Hub version decides what it publishes, which is what these tests
 * vary: an older Hub publishes a host object without the method this extension calls.
 */
interface HostObjects {
    /** The designer plugins host, when that Hub publishes it. */
    G4DesignerPlugins?: Record<string, unknown>;

    /** The toolboxes filter host, when that Hub publishes it. */
    G4ToolboxesFilter?: Record<string, unknown>;
}

/**
 * What a test drives and observes on the running body shim.
 */
interface ShimHarness {
    /** The definitions the page drew, in order. */
    definitions: unknown[];

    /** Drops a file URI on the designer canvas, as VS Code does. */
    invokeFileDrop: (fileUri: string) => void;

    /** The messages the page posted to the extension. */
    postedMessages: PostedMessage[];

    /** Sends a message from the extension to the page. */
    sendToPage: (data: unknown) => void;
}

/**
 * What the page called on the Hub host objects.
 *
 * @remarks
 * Each test owns one record and passes it to the host stand-ins, so the assertions read what the
 * page did rather than what the Hub would have done with it.
 */
interface HostCalls {
    /** The manifest filters the page applied. */
    manifestFilters: unknown[];

    /** The states the page handed to the designer plugins host. */
    receivedStates: { pluginName: string; state: unknown; }[];

    /** The toolboxes filter store the page registered, when the Hub takes one. */
    store: unknown;

    /** The plugin state storage the page registered, when the Hub takes one. */
    storage: unknown;
}

/**
 * A message the page posts to the extension.
 *
 * @remarks
 * Models only the type, which the tests filter by, and the payload, which they compare.
 */
interface PostedMessage {
    /** The message payload. */
    payload?: unknown;

    /** The message type, for example workflow:host:feature:unavailable. */
    type: string;
}
