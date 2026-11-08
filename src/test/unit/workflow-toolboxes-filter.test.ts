/*
 * Unit tests for the designer's toolboxes filter in VS Code: the extension reads the project manifest's
 * `toolboxesFilter`, keeps only complete entries, sends it to the designer page, and the page hands it
 * to the Hub's toolboxes filter, which redraws the toolbox.
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
    sendToPage: (data: unknown) => void;
}> => {
    // Collect the page listeners, so the test can raise DOMContentLoaded and extension messages.
    const windowListeners: Record<string, ((event: unknown) => void)[]> = {};
    const postedMessages: { type: string; }[] = [];
    const appliedFilters: unknown[] = [];

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

    return { appliedFilters, sendToPage };
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
            sendToolboxesFilter: (panel: unknown, manifest: unknown) => Promise<void>;
        }).sendToolboxesFilter;

        await sendToolboxesFilter(panel, { toolboxesFilter: { toolboxes: [{ enabled: false, name: 'Http' }] } });

        assert.deepEqual(postedMessages, [{
            payload: { toolboxesFilter: { toolboxes: [{ enabled: false, name: 'Http' }], tools: [] } },
            type: 'workflow:toolboxes:set'
        }]);
    });

    it('hands a received filter to the toolboxes filter of the page', async () => {
        const { appliedFilters, sendToPage } = await startShim();
        const toolboxesFilter = { toolboxes: [{ enabled: false, name: 'Http' }], tools: [] };

        sendToPage({ payload: { toolboxesFilter }, type: 'workflow:toolboxes:set' });

        assert.equal(appliedFilters.length, 1);
        assert.equal(JSON.stringify(appliedFilters[0]), JSON.stringify(toolboxesFilter));
    });
});
