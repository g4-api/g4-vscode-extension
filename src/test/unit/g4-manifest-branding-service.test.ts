/*
 * Unit tests for the manifest branding: the extension fills its label template with the Hub branding, writes the
 * result over its installed package.nls.json, and removes the VS Code cache of scanned extension manifests, so the
 * next window load shows the branded command prefix, activity bar tooltip, and view names.
 *
 * The install folder and the VS Code user data folder are temporary folders, and the text resolver is a small
 * stand-in that replaces {product}.
 */
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { G4BrandingService } from '../../services/g4-branding-service';
import { G4ManifestBrandingService } from '../../services/g4-manifest-branding-service';

// The label template the install folder ships, in token form.
const TEMPLATE = { 'command.New-Project.category': '{product}', 'viewsContainer.g4Container.title': '{product}' };

// The labels the install folder ships, which are the G4 defaults.
const DEFAULT_LABELS = { 'command.New-Project.category': 'G4', 'viewsContainer.g4Container.title': 'G4' };

/**
 * Creates a temporary install folder and a VS Code user data folder with two profiles that each hold a manifest cache.
 *
 * @returns The install folder, the global storage folder of a non-default profile, and the two cache files.
 */
const newFolders = (): { cachePaths: string[]; extensionPath: string; globalStoragePath: string; } => {
    // Lay out the install folder the way the packaged extension does.
    const extensionPath = fs.mkdtempSync(path.join(os.tmpdir(), 'g4-manifest-branding-'));

    fs.mkdirSync(path.join(extensionPath, 'resources.branding'), { recursive: true });
    fs.writeFileSync(path.join(extensionPath, 'resources.branding', 'package.nls.template.json'), JSON.stringify(TEMPLATE));
    fs.writeFileSync(path.join(extensionPath, 'package.nls.json'), JSON.stringify(DEFAULT_LABELS));

    // Lay out the user data folder: a cache per profile, and a global storage folder nested under a named profile.
    const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'g4-user-data-'));
    const cachePaths = ['__default__profile__', '-5a1b2c3d'].map((profile) => path.join(userDataPath, 'CachedProfilesData', profile, 'extensions.user.cache'));
    const globalStoragePath = path.join(userDataPath, 'User', 'profiles', '-5a1b2c3d', 'globalStorage', 'g4-api.g4-engine-client');

    for (const cachePath of cachePaths) {
        fs.mkdirSync(path.dirname(cachePath), { recursive: true });
        fs.writeFileSync(cachePath, '{}');
    }

    fs.mkdirSync(globalStoragePath, { recursive: true });

    return { cachePaths, extensionPath, globalStoragePath };
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

describe('Manifest branding', () => {
    it('writes the branded labels once and removes the manifest cache of every profile', async () => {
        const { cachePaths, extensionPath, globalStoragePath } = newFolders();
        const { logger, warnings } = newLogger();
        const options = {
            extensionPath,
            getText: (text: string): string => text.replaceAll('{product}', 'MLM'),
            globalStoragePath,
            logger
        };

        // The first update writes the branded labels and removes both caches, so the next load reads the labels.
        assert.equal(await G4ManifestBrandingService.updateAsync(options), true);
        assert.deepEqual(JSON.parse(fs.readFileSync(path.join(extensionPath, 'package.nls.json'), 'utf8')), {
            'command.New-Project.category': 'MLM',
            'viewsContainer.g4Container.title': 'MLM'
        });

        for (const cachePath of cachePaths) {
            assert.equal(fs.existsSync(cachePath), false);
        }

        // A second update with the same branding writes nothing and asks for no reload.
        assert.equal(await G4ManifestBrandingService.updateAsync(options), false);
        assert.deepEqual(warnings, []);
    });

    it('writes nothing for the G4 defaults, so an unbranded install never asks for a reload', async () => {
        const { cachePaths, extensionPath, globalStoragePath } = newFolders();
        const { logger } = newLogger();

        // The G4 default branding fills the template with the shipped labels.
        const isUpdated = await G4ManifestBrandingService.updateAsync({
            extensionPath,
            getText: (text: string): string => text.replaceAll('{product}', 'G4'),
            globalStoragePath,
            logger
        });

        assert.equal(isUpdated, false);
        assert.equal(fs.existsSync(cachePaths[0]), true);
    });

    it('keeps the installed labels and warns when the template is missing', async () => {
        const { extensionPath, globalStoragePath } = newFolders();
        const { logger, warnings } = newLogger();

        fs.rmSync(path.join(extensionPath, 'resources.branding'), { force: true, recursive: true });

        // Without a template nothing is branded, and the installed labels stay as shipped.
        const isUpdated = await G4ManifestBrandingService.updateAsync({ extensionPath, getText: (text: string): string => text, globalStoragePath, logger });

        assert.equal(isUpdated, false);
        assert.equal(warnings.length, 1);
        assert.deepEqual(JSON.parse(fs.readFileSync(path.join(extensionPath, 'package.nls.json'), 'utf8')), DEFAULT_LABELS);
    });

    it('brands JSON templates with escaped values and keeps unknown placeholders', () => {
        // The G4 defaults apply before any Hub answered, and unknown braces stay as written.
        const jsonText = '{ "name": "{productTm} Default Stage", "macro": "{{$ parameters.X }}", "other": "{unknown}" }';
        const branded = JSON.parse(G4BrandingService.getJsonText(jsonText)) as Record<string, string>;

        assert.equal(branded.name, 'G4™ Default Stage');
        assert.equal(branded.macro, '{{$ parameters.X }}');
        assert.equal(branded.other, '{unknown}');
    });
});
