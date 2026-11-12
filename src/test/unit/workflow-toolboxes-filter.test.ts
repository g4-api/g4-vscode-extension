/*
 * Unit tests for the designer's toolboxes filter in VS Code: the extension reads the project manifest's
 * `toolboxesFilter`, keeps only complete entries, sends it to the designer page, and the page hands it
 * to the Hub's toolboxes filter, which redraws the toolbox. The user's own filter is kept in the
 * workspace state, because a webview has no cookies: the page's store saves it through the extension.
 *
 * The real page script (the designer body shim) runs in a sandbox with stand-ins for the page, the
 * designer, the VS Code webview API, and the Hub's G4ToolboxesFilter.
 */
import * as assert from 'node:assert/strict';
import * as vm from 'node:vm';

import { ShowWorkflowCommand } from '../../commands/show-workflow';

/**
 * Runs the designer body shim against stand-ins and returns the pieces a test drives.
 *
 * @returns A function that sends a message to the page, and the filters the page applied.
 */
const startShim = async (): Promise<{
    appliedFilters: unknown[];
    postedMessages: { payload?: unknown; type: string; }[];
    sendToPage: (data: unknown) => void;
    stores: { read: () => unknown; save: (filter: unknown) => void; }[];
}> => {
    // Collect the page listeners, so the test can raise DOMContentLoaded and extension messages.
    const windowListeners: Record<string, ((event: unknown) => void)[]> = {};
    const postedMessages: { payload?: unknown; type: string; }[] = [];
    const appliedFilters: unknown[] = [];
    const stores: { read: () => unknown; save: (filter: unknown) => void; }[] = [];

    const sendToPage = (data: unknown): void => {
        for (const listener of windowListeners.message ?? []) {
            listener({ data });
        }
    };

    // Stand in for the Hub page: the designer, the SignalR connection, and the toolboxes filter.
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
        G4ToolboxesFilter: {
            setToolboxesFilterManifest: (filter: unknown): void => {
                appliedFilters.push(filter);
            },
            setToolboxesFilterStore: (store: { read: () => unknown; save: (filter: unknown) => void; }): void => {
                stores.push(store);
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
            vscodeApi: { postMessage: (message: { type: string; }): number => postedMessages.push(message) }
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

    return { appliedFilters, postedMessages, sendToPage, stores };
};

/**
 * Creates an in-memory stand-in for the extension's workspace state.
 *
 * @returns The memento and the values it holds.
 */
const newWorkspaceState = (): { memento: { get: (key: string) => unknown; update: (key: string, value: unknown) => Promise<void>; }; values: Map<string, unknown>; } => {
    const values = new Map<string, unknown>();
    const memento = {
        get: (key: string): unknown => values.get(key),
        update: async (key: string, value: unknown): Promise<void> => {
            if (value === undefined) {
                values.delete(key);
            } else {
                values.set(key, value);
            }
        }
    };

    return { memento, values };
};

describe('Designer toolboxes filter from the project manifest', () => {
    it('keeps only complete toolbox and tool entries', () => {
        const manifest = {
            toolboxesFilter: {
                toolboxes: [
                    { enabled: false, name: ' UiControls ' },
                    { enabled: 'no', name: 'Logging' },
                    { name: 'Http' },
                    null
                ],
                tools: [
                    { enabled: true, name: 'G4.Plugins.Ui:SendKeys' },
                    { enabled: false, name: '' }
                ]
            }
        };

        assert.deepEqual(ShowWorkflowCommand.getManifestToolboxesFilter(manifest), {
            toolboxes: [{ enabled: false, name: 'UiControls' }],
            tools: [{ enabled: true, name: 'G4.Plugins.Ui:SendKeys' }]
        });
    });

    it('reads a missing or malformed section as an empty filter', () => {
        const emptyFilter = { toolboxes: [], tools: [] };

        assert.deepEqual(ShowWorkflowCommand.getManifestToolboxesFilter(undefined), emptyFilter);
        assert.deepEqual(ShowWorkflowCommand.getManifestToolboxesFilter({}), emptyFilter);
        assert.deepEqual(
            ShowWorkflowCommand.getManifestToolboxesFilter({ toolboxesFilter: { toolboxes: 'x', tools: {} } }),
            emptyFilter);
    });

    it('sends the manifest filter to the designer page', async () => {
        const postedMessages: unknown[] = [];
        const panel = {
            webview: {
                postMessage: async (message: unknown): Promise<boolean> => {
                    postedMessages.push(message);
                    return true;
                }
            }
        };
        const sendToolboxesFilter = (ShowWorkflowCommand as unknown as {
            sendToolboxesFilter: (options: { manifest: unknown; panel: unknown; workspaceState: unknown; }) => Promise<void>;
        }).sendToolboxesFilter;
        const { memento } = newWorkspaceState();

        await ShowWorkflowCommand.saveUserToolboxesFilter(memento as never, {
            filter: { tools: [{ enabled: false, name: 'SendKeys' }] }
        });
        await sendToolboxesFilter({
            manifest: { toolboxesFilter: { toolboxes: [{ enabled: false, name: 'Http' }] } },
            panel,
            workspaceState: memento
        });

        assert.deepEqual(postedMessages, [{
            payload: {
                toolboxesFilter: { toolboxes: [{ enabled: false, name: 'Http' }], tools: [] },
                userFilter: { toolboxes: [], tools: [{ enabled: false, name: 'SendKeys' }] }
            },
            type: 'workflow:toolboxes:set'
        }]);
    });

    it('keeps the user filter in the workspace state, complete entries only, and removes an empty one', async () => {
        const { memento, values } = newWorkspaceState();

        await ShowWorkflowCommand.saveUserToolboxesFilter(memento as never, {
            filter: { toolboxes: [{ enabled: false, name: 'Http' }, { name: 'Broken' }], tools: 'x' }
        });

        assert.deepEqual(ShowWorkflowCommand.getUserToolboxesFilter(memento as never), {
            toolboxes: [{ enabled: false, name: 'Http' }],
            tools: []
        });

        await ShowWorkflowCommand.saveUserToolboxesFilter(memento as never, { filter: { toolboxes: [], tools: [] } });

        assert.equal(values.size, 0);
        assert.deepEqual(ShowWorkflowCommand.getUserToolboxesFilter(memento as never), { toolboxes: [], tools: [] });
    });

    it('gives the page a store that applies a change at once and saves it through the extension', async () => {
        const { postedMessages, sendToPage, stores } = await startShim();
        const [store] = stores;
        const changedFilter = { toolboxes: [{ enabled: false, name: 'Http' }], tools: [] };

        // The store starts empty, then reads the filter the extension sent with the manifest filter.
        assert.equal(stores.length, 1);
        assert.equal(JSON.stringify(store.read()), JSON.stringify({ toolboxes: [], tools: [] }));

        const savedFilter = { toolboxes: [], tools: [{ enabled: true, name: 'SendKeys' }] };

        sendToPage({ payload: { toolboxesFilter: {}, userFilter: savedFilter }, type: 'workflow:toolboxes:set' });
        assert.equal(JSON.stringify(store.read()), JSON.stringify(savedFilter));

        // A switch change is read back at once (no cookie round trip) and sent to the extension to keep.
        store.save(changedFilter);

        assert.equal(JSON.stringify(store.read()), JSON.stringify(changedFilter));
        // Compare as JSON: the page's objects come from the sandbox realm, so a strict deep equal would fail.
        const savedMessages = postedMessages.filter(message => message.type === 'workflow:toolboxes:user:save');

        assert.equal(JSON.stringify(savedMessages), JSON.stringify([{
            payload: { filter: changedFilter },
            type: 'workflow:toolboxes:user:save'
        }]));
    });

    it('hands a received filter to the toolboxes filter of the page', async () => {
        const { appliedFilters, sendToPage } = await startShim();
        const toolboxesFilter = { toolboxes: [{ enabled: false, name: 'Http' }], tools: [] };

        sendToPage({ payload: { toolboxesFilter }, type: 'workflow:toolboxes:set' });

        assert.equal(appliedFilters.length, 1);
        assert.equal(JSON.stringify(appliedFilters[0]), JSON.stringify(toolboxesFilter));
    });
});
