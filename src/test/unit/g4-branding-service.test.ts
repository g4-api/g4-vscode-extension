/*
 * Unit tests for the white-label branding: the extension resolves branding placeholders in its labels, keeps the
 * branding the G4 Hub publishes in the global state, and hands it to every webview page.
 *
 * The Hub is a local HTTP server that answers the branding route; the global state is an in-memory stand-in.
 */
import * as assert from 'node:assert/strict';
import * as http from 'node:http';
import * as vm from 'node:vm';

import { WebviewComponents } from '../../extensions/webview-components';
import { G4BrandingService } from '../../services/g4-branding-service';

// The global state key the extension keeps the Hub's branding under.
const BRANDING_STATE_KEY = 'g4.branding.settings';

// A branded Hub answer: every placeholder the tests read, as the Hub resolves them for the product Acme.
const ACME_SETTINGS = {
    productName: 'Acme',
    tokens: {
        engine: 'Acme Engine',
        engineTm: 'Acme™ Engine',
        hub: 'Acme <Hub>',
        product: 'Acme',
        productTm: 'Acme™'
    }
};

/**
 * Creates an in-memory stand-in for the extension's global state.
 *
 * @returns The stand-in and the map behind it.
 */
const newGlobalState = (): { globalState: FakeMemento; values: Map<string, unknown>; } => {
    const values = new Map<string, unknown>();

    // An undefined value removes the key, as VS Code's Memento does.
    const globalState: FakeMemento = {
        get: <T>(key: string): T | undefined => values.get(key) as T | undefined,
        update: async (key: string, value: unknown): Promise<void> => {
            if (value === undefined) {
                values.delete(key);

                return;
            }

            values.set(key, value);
        }
    };

    return { globalState, values };
};

/**
 * Starts a local Hub stand-in that answers the branding route.
 *
 * @param body - The JSON body the branding route returns; undefined answers 404, as a Hub without the route.
 * @returns The Hub base URL and a function that stops the server.
 */
const startHub = async (body: unknown): Promise<{ baseUrl: string; stop: () => Promise<void>; }> => {
    // Answer only the branding route, so a request to any other path fails the test visibly.
    const server = http.createServer((request, response) => {
        const isBrandingRoute = request.url === '/api/v4/g4/integration/branding';

        if (!isBrandingRoute || body === undefined) {
            response.writeHead(404).end();

            return;
        }

        response.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(body));
    });

    // Listen on a free local port, then report the base URL the extension would read from the manifest.
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as { port: number; };

    return {
        baseUrl: `http://127.0.0.1:${port}`,
        stop: () => new Promise<void>(resolve => server.close(() => resolve()))
    };
};

describe('White-label branding', () => {
    // Reset to the default branding after each test, since the service holds one branding for the host.
    afterEach(() => {
        G4BrandingService.initialize(newGlobalState().globalState as never);
    });

    it('resolves placeholders to the G4 defaults and keeps unknown braces as written', () => {
        // A fresh host without a cached branding keeps every label as the G4 text.
        G4BrandingService.initialize(newGlobalState().globalState as never);

        assert.equal(G4BrandingService.getText('The {hub} answered 500.'), 'The G4 Hub answered 500.');
        assert.equal(G4BrandingService.getText('{productTm} Settings'), 'G4™ Settings');
        assert.equal(G4BrandingService.getText('route /flows/{key} and G4.System'), 'route /flows/{key} and G4.System');
    });

    it('reads the branding the Hub published last time from the global state', () => {
        // A cached branding is applied before the Hub answers.
        const { globalState, values } = newGlobalState();
        values.set(BRANDING_STATE_KEY, ACME_SETTINGS);

        G4BrandingService.initialize(globalState as never);

        // Known placeholders follow the cache, and placeholders it lacks fall back to the G4 defaults.
        assert.equal(G4BrandingService.getText('{engine} is Connected and Ready'), 'Acme Engine is Connected and Ready');
        assert.equal(G4BrandingService.getText('{studio}'), 'G4 Studio');
    });

    it('ignores a malformed cached branding', () => {
        // A cache without a token map cannot blank the labels.
        const { globalState, values } = newGlobalState();
        values.set(BRANDING_STATE_KEY, { tokens: 'not a map' });

        G4BrandingService.initialize(globalState as never);

        assert.equal(G4BrandingService.getText('{product}'), 'G4');
    });

    it('refreshes from the Hub, keeps the copy, and keeps the labels when the Hub has no branding route', async () => {
        const { globalState, values } = newGlobalState();
        const brandedHub = await startHub(ACME_SETTINGS);
        const olderHub = await startHub(undefined);

        try {
            // A branded Hub changes the labels and its answer is kept for the next start.
            const isChanged = await G4BrandingService.refreshAsync(globalState as never, brandedHub.baseUrl);

            assert.equal(isChanged, true);
            assert.equal(G4BrandingService.getText('{productTm} Report'), 'Acme™ Report');
            assert.deepEqual(values.get(BRANDING_STATE_KEY), ACME_SETTINGS);

            // The same answer again changes nothing.
            assert.equal(await G4BrandingService.refreshAsync(globalState as never, brandedHub.baseUrl), false);

            // A Hub without the route leaves the branding in place.
            assert.equal(await G4BrandingService.refreshAsync(globalState as never, olderHub.baseUrl), false);
            assert.equal(G4BrandingService.getText('{product}'), 'Acme');
        } finally {
            await brandedHub.stop();
            await olderHub.stop();
        }
    });

    it('escapes branded names in markup and brands a page through its script', () => {
        const { globalState, values } = newGlobalState();
        values.set(BRANDING_STATE_KEY, ACME_SETTINGS);
        G4BrandingService.initialize(globalState as never);

        // Markup the extension writes gets escaped names, so a name cannot add elements.
        assert.equal(G4BrandingService.getHtml('<h1>{hub}</h1>'), '<h1>Acme &lt;Hub&gt;</h1>');

        // The page script publishes the branding and replaces the templates once the markup is parsed.
        const title = { dataset: { brandingText: '{productTm} Settings' }, textContent: 'G4™ Settings' };
        const button = { attributes: {} as Record<string, string>, dataset: { brandingTitle: 'Open the {hub}' } };
        const sandbox: Record<string, unknown> = {
            document: {
                querySelectorAll: (selector: string) => selector === '[data-branding-text]' ? [title] : [{
                    dataset: button.dataset,
                    setAttribute: (name: string, value: string) => { button.attributes[name] = value; }
                }],
                readyState: 'complete'
            }
        };
        sandbox.globalThis = sandbox;

        const script = G4BrandingService.getPageScript();
        vm.runInNewContext(script.replace('<script>', '').replace('</script>', ''), sandbox);

        assert.equal(title.textContent, 'Acme™ Settings');
        assert.equal(button.attributes.title, 'Open the Acme <Hub>');
        assert.equal((sandbox.G4Branding as { getText: (text: string) => string; }).getText('{engineTm}'), 'Acme™ Engine');
        assert.equal(script.includes('<Hub>'), false);
    });

    it('runs the branding script first in the head of every component page', () => {
        // A page without components still gets the branding, right after its opening head tag.
        const html = WebviewComponents.setComponentHtml({
            html: '<html><head><title data-branding-text="{productTm} Settings">G4™ Settings</title></head><body></body></html>',
            rootPath: '.',
            toUri: (filePath: string) => filePath
        });

        // Assert: the branding script follows the head tag and ends before the page's own markup.
        assert.ok(html.startsWith('<html><head>'));
        assert.ok(html.includes('<script>globalThis.G4BrandingSettings = '));
        assert.ok(html.indexOf('</script>') < html.indexOf('<title'));
    });
});

// Compile-time contracts stay after the executable code; interfaces precede type aliases, and a caller
// precedes its local dependency chain before A-Z order resumes.

/**
 * The part of VS Code's Memento the branding service uses.
 *
 * @remarks
 * Models only get and update, the two members the branding service calls.
 */
interface FakeMemento {
    /** Returns the value kept under a key; undefined when there is none. */
    get: <T>(key: string) => T | undefined;

    /** Keeps a value under a key; undefined removes the key. */
    update: (key: string, value: unknown) => Promise<void>;
}
