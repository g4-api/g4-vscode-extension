/*
 * Unit tests for the side-panel icon: the extension copies the chosen icon over its installed icon file, choosing the
 * local setting first, then the icon the G4 Hub branding names, then the built-in icon.
 *
 * The install folder is a temporary folder with the icon file and the built-in copy, the Hub is a local HTTP server
 * that serves icons, and the global state is an in-memory stand-in.
 */
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as http from 'node:http';
import * as os from 'node:os';
import * as path from 'node:path';

import { G4SidePanelIconService } from '../../services/g4-side-panel-icon-service';

// The built-in icon the install folder starts with.
const DEFAULT_ICON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/></svg>\n';

// The icon a user chooses with the local setting.
const LOCAL_ICON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect height="20" width="20" x="2" y="2"/></svg>\n';

// The icon the Hub branding names.
const HUB_ICON = '<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M2 2h20v20z"/></svg>\n';

/**
 * Creates a temporary install folder with the icon file and the built-in copy.
 *
 * @returns The install folder and the path of its icon file.
 */
const newInstallFolder = (): { extensionPath: string; iconPath: string; } => {
    // Lay out the two icon files the way the packaged extension does.
    const extensionPath = fs.mkdtempSync(path.join(os.tmpdir(), 'g4-side-panel-icon-'));
    const iconPath = path.join(extensionPath, 'resources.assets', 'g4-icon.svg');

    fs.mkdirSync(path.join(extensionPath, 'resources.assets', 'defaults'), { recursive: true });
    fs.writeFileSync(iconPath, DEFAULT_ICON);
    fs.writeFileSync(path.join(extensionPath, 'resources.assets', 'defaults', 'g4-icon.svg'), DEFAULT_ICON);

    return { extensionPath, iconPath };
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
 * Creates a logger stand-in that records every message.
 *
 * @returns The logger and the recorded warnings and information messages.
 */
const newLogger = (): { information: string[]; logger: { information(message: string): void; warning(message: string): void; }; warnings: string[]; } => {
    const information: string[] = [];
    const warnings: string[] = [];

    return {
        information,
        logger: {
            information: (message: string): void => { information.push(message); },
            warning: (message: string): void => { warnings.push(message); }
        },
        warnings
    };
};

/**
 * Starts a local Hub stand-in that serves icons by path.
 *
 * @param files - The answer body of each served path; any other path answers 404.
 * @returns The Hub base URL and a function that stops the server.
 */
const startHub = async (files: Record<string, string>): Promise<{ baseUrl: string; stop: () => Promise<void>; }> => {
    // Answer only the listed paths, so a request to any other path fails visibly.
    const server = http.createServer((request, response) => {
        const body = files[request.url ?? ''];

        if (body === undefined) {
            response.writeHead(404).end();

            return;
        }

        response.writeHead(200, { 'Content-Type': 'image/svg+xml' }).end(body);
    });

    // Listen on a free local port, then report the base URL the extension would connect to.
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as { port: number; };

    return {
        baseUrl: `http://127.0.0.1:${port}`,
        stop: () => new Promise<void>(resolve => server.close(() => resolve()))
    };
};

describe('Side-panel icon', () => {
    it('accepts SVG documents and refuses other files', () => {
        // An SVG may start with a byte order mark, white space, and an XML prolog.
        assert.equal(G4SidePanelIconService.testSvgIcon(DEFAULT_ICON), true);
        assert.equal(G4SidePanelIconService.testSvgIcon(`${String.fromCharCode(0xFEFF)}  ${HUB_ICON}`), true);

        // A page, a truncated SVG, and binary data are refused.
        assert.equal(G4SidePanelIconService.testSvgIcon('<html><body>Not found</body></html>'), false);
        assert.equal(G4SidePanelIconService.testSvgIcon('<svg viewBox="0 0 24 24"><circle r="9"/>'), false);
        assert.equal(G4SidePanelIconService.testSvgIcon('\u0089PNG'), false);
    });

    it('applies the local setting over the Hub icon, once, and keeps the icon for an invalid or relative path', async () => {
        const { extensionPath, iconPath } = newInstallFolder();
        const { globalState } = newGlobalState();
        const { information, logger, warnings } = newLogger();
        const localPath = path.join(extensionPath, 'local.svg');

        fs.writeFileSync(localPath, LOCAL_ICON);

        // The local setting wins even when the Hub names an icon.
        const options = { configuredPath: localPath, extensionPath, globalState: globalState as never, hubIcon: '/images/hub.svg', logger };

        assert.equal(await G4SidePanelIconService.updateAsync(options), true);
        assert.equal(fs.readFileSync(iconPath, 'utf8'), LOCAL_ICON);
        assert.equal(information.length, 1);

        // The same choice again writes nothing.
        assert.equal(await G4SidePanelIconService.updateAsync(options), false);

        // A file that is not an SVG and a relative path each keep the installed icon with one warning.
        const textPath = path.join(extensionPath, 'notes.txt');

        fs.writeFileSync(textPath, 'not an icon');

        assert.equal(await G4SidePanelIconService.updateAsync({ ...options, configuredPath: textPath }), false);
        assert.equal(await G4SidePanelIconService.updateAsync({ ...options, configuredPath: 'icons/local.svg' }), false);
        assert.equal(fs.readFileSync(iconPath, 'utf8'), LOCAL_ICON);
        assert.equal(warnings.length, 2);
    });

    it('downloads the Hub icon, keeps it for starts without the Hub, and restores the built-in icon when cleared', async () => {
        const { extensionPath, iconPath } = newInstallFolder();
        const { globalState, values } = newGlobalState();
        const { logger, warnings } = newLogger();
        const hub = await startHub({ '/images/hub.svg': HUB_ICON, '/images/page.html': '<html></html>' });
        const options = { configuredPath: '', extensionPath, globalState: globalState as never, logger };

        try {
            // A Hub icon path is resolved against the Hub and applied.
            assert.equal(await G4SidePanelIconService.updateAsync({ ...options, hubBaseUrl: hub.baseUrl, hubIcon: '/images/hub.svg' }), true);
            assert.equal(fs.readFileSync(iconPath, 'utf8'), HUB_ICON);

            // After an extension update restored the built-in file, a start without the Hub applies the kept icon.
            fs.writeFileSync(iconPath, DEFAULT_ICON);

            assert.equal(await G4SidePanelIconService.updateAsync({ ...options, hubIcon: '/images/hub.svg' }), true);
            assert.equal(fs.readFileSync(iconPath, 'utf8'), HUB_ICON);

            // A different icon the Hub cannot serve, or that is not an SVG, keeps the installed icon.
            assert.equal(await G4SidePanelIconService.updateAsync({ ...options, hubBaseUrl: hub.baseUrl, hubIcon: '/images/missing.svg' }), false);
            assert.equal(await G4SidePanelIconService.updateAsync({ ...options, hubBaseUrl: hub.baseUrl, hubIcon: '/images/page.html' }), false);
            assert.equal(fs.readFileSync(iconPath, 'utf8'), HUB_ICON);
            assert.equal(warnings.length, 2);

            // A Hub that names no icon restores the built-in icon and forgets the kept one.
            assert.equal(await G4SidePanelIconService.updateAsync({ ...options, hubBaseUrl: hub.baseUrl, hubIcon: '' }), true);
            assert.equal(fs.readFileSync(iconPath, 'utf8'), DEFAULT_ICON);
            assert.equal(values.size, 0);
        } finally {
            await hub.stop();
        }
    });
});

// Compile-time contracts stay after the executable code. Interfaces come before type aliases, and a contract
// follows the contracts that depend on it before A-Z order resumes.

/**
 * The part of VS Code's Memento the service uses.
 *
 * @remarks
 * Only the two members the service calls, so the tests need no VS Code runtime.
 */
interface FakeMemento {
    /** Reads a kept value. */
    get<T>(key: string): T | undefined;

    /** Writes a kept value; undefined removes it. */
    update(key: string, value: unknown): Promise<void>;
}
