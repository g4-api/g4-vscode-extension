/*
 * Unit tests for the designer plugins' state in VS Code: a designer plugin (collapsible regions) saves
 * its state through the page, the extension keeps it in the workspace state per bot file, and sends it
 * back to the page before the bot is imported, where the page hands it to the plugin host.
 *
 * The real page script (the designer body shim) runs in a sandbox with stand-ins for the page, the
 * designer, the VS Code webview API, and the Hub's G4DesignerPlugins host.
 */
import * as assert from 'node:assert/strict';
import * as vm from 'node:vm';

import { ShowWorkflowCommand } from '../../commands/show-workflow';

// The bot file the tests' designer shows.
const DOCUMENT_URI = 'file:///c%3A/project/bots/login.json';

// The workspace state key the extension keeps that bot's plugin states under.
const DOCUMENT_STATES_KEY = `g4.designerPlugins.states:${DOCUMENT_URI}`;

// A collapsible regions state, as the plugin saves it.
const REGIONS_STATE = { regions: [{ componentType: 'container', path: [0, 0], type: 'job' }], version: 1 };

/**
 * Creates an in-memory stand-in for the extension's workspace state.
 *
 * @returns The stand-in and the map behind it.
 */
const newWorkspaceState = (): { values: Map<string, unknown>; workspaceState: FakeMemento; } => {
    const values = new Map<string, unknown>();

    // An undefined value removes the key, as VS Code's Memento does.
    const workspaceState: FakeMemento = {
        get: (key: string): unknown => values.get(key),
        update: async (key: string, value: unknown): Promise<void> => {
            if (value === undefined) {
                values.delete(key);

                return;
            }

            values.set(key, value);
        }
    };

    return { values, workspaceState };
};

/**
 * Runs the designer body shim against stand-ins and returns the pieces a test drives.
 *
 * @returns The storage the page registered, the messages it posted, the states the host received,
 *     and a function that sends a message to the page.
 */
const startShim = async (): Promise<ShimHarness> => {
    // Collect the page listeners, so the test can raise DOMContentLoaded and extension messages.
    const windowListeners: Record<string, ((event: unknown) => void)[]> = {};
    const postedMessages: PostedMessage[] = [];
    const receivedStates: { pluginName: string; state: unknown; }[] = [];
    const harness: Partial<ShimHarness> = { postedMessages, receivedStates };

    const sendToPage = (data: unknown): void => {
        for (const listener of windowListeners.message ?? []) {
            listener({ data });
        }
    };

    // Stand in for the Hub page: the designer, the SignalR connection, and the designer plugins host.
    const sandbox: Record<string, unknown> = {
        _connection: { invoke: async (): Promise<unknown> => undefined },
        _designer: { onDefinitionChanged: { subscribe: (): void => undefined } },
        clearInterval,
        clearTimeout,
        console,
        document: {
            getElementById: () => ({ addEventListener: (): void => undefined }),
            querySelector: () => ({})
        },
        G4DesignerPlugins: {
            receiveState: (pluginName: string, state: unknown): void => {
                receivedStates.push({ pluginName, state });
            },
            setStateStorage: (storage: PluginStateStorage): void => {
                harness.storage = storage;
            }
        },
        setDefinition: (): void => undefined,
        setInterval,
        setTimeout,
        structuredClone,
        window: {
            addEventListener: (type: string, listener: (event: unknown) => void): void => {
                windowListeners[type] = [...(windowListeners[type] ?? []), listener];
            },
            vscodeApi: { postMessage: (message: PostedMessage): number => postedMessages.push(message) }
        }
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

    for (let attempt = 0; attempt < 50 && !postedMessages.some(i => i.type === 'webview:ready'); attempt++) {
        await new Promise(resolve => setTimeout(resolve, 20));
    }

    harness.sendToPage = sendToPage;

    return harness as ShimHarness;
};

describe('Designer plugins state in VS Code', () => {
    it('keeps a plugin state per bot file and removes it when cleared', async () => {
        const { values, workspaceState } = newWorkspaceState();
        const memento = workspaceState as never;

        await ShowWorkflowCommand.savePluginState(memento, DOCUMENT_URI, { plugin: 'collapsible-regions', state: REGIONS_STATE });
        await ShowWorkflowCommand.savePluginState(memento, DOCUMENT_URI, { plugin: 'other-plugin', state: { isOn: true } });

        assert.deepEqual(ShowWorkflowCommand.getPluginStates(memento, DOCUMENT_URI), {
            'collapsible-regions': REGIONS_STATE,
            'other-plugin': { isOn: true }
        });

        // Clearing one plugin keeps the other; clearing the last removes the bot's entry.
        await ShowWorkflowCommand.savePluginState(memento, DOCUMENT_URI, { plugin: 'collapsible-regions', state: null });

        assert.deepEqual(ShowWorkflowCommand.getPluginStates(memento, DOCUMENT_URI), { 'other-plugin': { isOn: true } });

        await ShowWorkflowCommand.savePluginState(memento, DOCUMENT_URI, { plugin: 'other-plugin', state: null });

        assert.equal(values.has(DOCUMENT_STATES_KEY), false);
    });

    it('ignores a save without a bot file or a plugin name, and reads malformed state as none', async () => {
        const { values, workspaceState } = newWorkspaceState();
        const memento = workspaceState as never;

        await ShowWorkflowCommand.savePluginState(memento, undefined, { plugin: 'collapsible-regions', state: REGIONS_STATE });
        await ShowWorkflowCommand.savePluginState(memento, DOCUMENT_URI, { plugin: ' ', state: REGIONS_STATE });
        await ShowWorkflowCommand.savePluginState(memento, DOCUMENT_URI, undefined);

        assert.equal(values.size, 0);

        values.set(DOCUMENT_STATES_KEY, ['not', 'states']);

        assert.deepEqual(ShowWorkflowCommand.getPluginStates(memento, DOCUMENT_URI), {});
        assert.deepEqual(ShowWorkflowCommand.getPluginStates(memento, undefined), {});
    });

    it('sends the bot file plugin states to the designer page', async () => {
        const { workspaceState } = newWorkspaceState();
        const memento = workspaceState as never;
        const postedMessages: unknown[] = [];
        const panel = {
            webview: {
                postMessage: async (message: unknown): Promise<boolean> => {
                    postedMessages.push(message);

                    return true;
                }
            }
        };
        const sendPluginStates = (ShowWorkflowCommand as unknown as {
            sendPluginStates: (panel: unknown, workspaceState: unknown, documentUri: string | undefined) => Promise<void>;
        }).sendPluginStates;

        await ShowWorkflowCommand.savePluginState(memento, DOCUMENT_URI, { plugin: 'collapsible-regions', state: REGIONS_STATE });
        await sendPluginStates(panel, memento, DOCUMENT_URI);

        assert.deepEqual(postedMessages, [{
            payload: { states: { 'collapsible-regions': REGIONS_STATE } },
            type: 'workflow:plugins:state:set'
        }]);
    });

    it('stores plugin state through the extension and hands received state to the plugins', async () => {
        const { postedMessages, receivedStates, sendToPage, storage } = await startShim();

        // The page replaced the browser storage with the extension's; it starts empty.
        assert.ok(storage, 'the page registers a state storage with the designer plugins host');
        assert.equal(storage.readState('collapsible-regions', 'Login'), null);

        // State that arrives is handed to the plugin and read back from the storage.
        sendToPage({ payload: { states: { 'collapsible-regions': REGIONS_STATE } }, type: 'workflow:plugins:state:set' });

        assert.equal(receivedStates.length, 1);
        assert.equal(receivedStates[0].pluginName, 'collapsible-regions');
        assert.equal(JSON.stringify(storage.readState('collapsible-regions', 'Login')), JSON.stringify(REGIONS_STATE));

        // A save goes to the extension, whatever the automation title.
        storage.saveState('collapsible-regions', 'Renamed', null);

        const saveMessages = postedMessages.filter(i => i.type === 'workflow:plugins:state:save');

        assert.equal(JSON.stringify(saveMessages), JSON.stringify([{
            payload: { plugin: 'collapsible-regions', state: null },
            type: 'workflow:plugins:state:save'
        }]));
        assert.equal(storage.readState('collapsible-regions', 'Login'), null);
    });
});

// Compile-time contracts stay after the executable code; interfaces precede type aliases, and a caller
// precedes its local dependency chain before A-Z order resumes.

/**
 * The part of VS Code's Memento the extension uses for plugin state.
 *
 * @remarks
 * Models only get and update, the two members the plugin state code calls.
 */
interface FakeMemento {
    /** Returns the value kept under a key; undefined when there is none. */
    get: (key: string) => unknown;

    /** Keeps a value under a key; undefined removes the key. */
    update: (key: string, value: unknown) => Promise<void>;
}

/**
 * What a test drives and observes on the running body shim.
 */
interface ShimHarness {
    /** The messages the page posted to the extension. */
    postedMessages: PostedMessage[];

    /** The states the page handed to the designer plugins host. */
    receivedStates: { pluginName: string; state: unknown; }[];

    /** Sends a message from the extension to the page. */
    sendToPage: (data: unknown) => void;

    /** The state storage the page registered with the designer plugins host. */
    storage: PluginStateStorage;
}

/**
 * The state storage the page registers with the designer plugins host.
 */
interface PluginStateStorage {
    /** Returns a plugin's saved state for an automation title; null when there is none. */
    readState: (pluginName: string, documentTitle: string) => unknown;

    /** Keeps a plugin's state for an automation title; null clears it. */
    saveState: (pluginName: string, documentTitle: string, state: unknown) => void;
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

    /** The message type, for example workflow:plugins:state:save. */
    type: string;
}
