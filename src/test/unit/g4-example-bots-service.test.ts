/*
 * Unit tests for the example bots: which catalog entries are offered, where each example is written, which examples a
 * command argument names, and how an example takes the driver settings of the project's base bot.
 *
 * The packaged catalog (resources.examples/bots/catalog.json) is also checked, so a shipped entry without its bot
 * file, or a bot file that is not valid JSON, fails here instead of in the user's project.
 */
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { G4ExampleBotsService } from '../../services/g4-example-bots-service';

import type { ExampleBot } from '../../services/g4-example-bots-service';

// The extension root, relative to the compiled test (out/test/unit).
const EXTENSION_ROOT = path.resolve(__dirname, '..', '..', '..');

// A project folder used only to build paths; nothing is written to it. It is the folder VS Code opens: the src
// folder New Project creates, which holds manifest.json, bots and base.bots.
const PROJECT_FOLDER = path.join(path.sep, 'projects', 'demo', 'src');

/**
 * Creates a catalog example with test defaults.
 *
 * @param overrides - The fields to change.
 * @returns The example.
 */
const newExample = (overrides: Partial<ExampleBot> = {}): ExampleBot => ({
    companions: [],
    description: 'Clicks a button five times.',
    driver: 'chrome',
    group: 'Loops',
    id: 'loops/for-loop-count',
    name: 'For Loop Count',
    platforms: [],
    ...overrides
});

describe('Example bots', () => {
    it('keeps well-formed catalog entries and reports the broken and duplicated ones', () => {
        const catalogText = JSON.stringify({
            examples: [
                newExample(),
                { ...newExample(), name: 'Duplicate' },
                { ...newExample({ id: 'loops/x' }), driver: 'firefox' },
                { ...newExample({ id: '../escape/out' }) },
                { ...newExample({ id: 'no-group' }) },
                { ...newExample({ id: 'loops/double--hyphen' }) },
                { group: 'Loops', id: 'loops/missing-fields' }
            ]
        });

        const catalog = G4ExampleBotsService.getCatalog(catalogText);

        // Only the first valid entry survives; an unknown driver, a climbing id, an id without a group folder and
        // missing fields are all dropped, and so is the repeated id.
        assert.deepEqual(catalog.examples.map(example => example.id), ['loops/for-loop-count']);
        assert.equal(catalog.issues.length, 6);
        assert.ok(catalog.issues.some(issue => issue.includes('more than once')));
    });

    it('reads the companion files of an entry and drops an entry whose companion is not safe', () => {
        const companion = { resource: 'resources.examples/environments/ExampleLogin.json', target: 'environments/ExampleLogin.json' };
        const catalogText = JSON.stringify({
            examples: [
                { ...newExample({ id: 'data/with-companion' }), companions: [companion] },
                { ...newExample({ id: 'data/climbing-target' }), companions: [{ ...companion, target: '../outside.json' }] },
                { ...newExample({ id: 'data/absolute-target' }), companions: [{ ...companion, target: '/etc/outside.json' }] },
                { ...newExample({ id: 'data/foreign-resource' }), companions: [{ ...companion, resource: 'src/extension.ts' }] },
                { ...newExample({ id: 'data/not-a-list' }), companions: 'environments/ExampleLogin.json' }
            ]
        });

        const catalog = G4ExampleBotsService.getCatalog(catalogText);

        // Only the entry with a packaged resource and a plain project path survives.
        assert.deepEqual(catalog.examples.map(example => example.id), ['data/with-companion']);
        assert.deepEqual(catalog.examples[0].companions, [companion]);
        assert.equal(catalog.issues.length, 4);

        // The companion goes to its own place in the project folder, not under bots.examples.
        assert.equal(
            G4ExampleBotsService.getCompanionTargetPath(companion, PROJECT_FOLDER),
            path.join(path.sep, 'projects', 'demo', 'src', 'environments', 'ExampleLogin.json')
        );
    });

    it('offers nothing and explains why when the catalog is not readable', () => {
        assert.deepEqual(G4ExampleBotsService.getCatalog('{ not json').examples, []);
        assert.equal(G4ExampleBotsService.getCatalog('{ not json').issues.length, 1);
        assert.deepEqual(G4ExampleBotsService.getCatalog('{}').issues, ['The example catalog has no "examples" list.']);
    });

    it('offers platform-limited examples only on their platforms', () => {
        const everywhere = newExample();
        const windowsOnly = newExample({ driver: 'uia', id: 'desktop/calculator-uia', platforms: ['win32'] });

        const examples = [everywhere, windowsOnly];

        // Windows gets both; any other platform gets only the unlimited example.
        assert.deepEqual(G4ExampleBotsService.getAvailableExamples(examples, 'win32'), examples);
        assert.deepEqual(G4ExampleBotsService.getAvailableExamples(examples, 'linux'), [everywhere]);
    });

    it('writes an example under bots.examples by its id and reads the base bot of its driver', () => {
        const example = newExample();

        // The examples folder sits beside bots, directly inside the project folder; no folder is added in between.
        assert.equal(G4ExampleBotsService.examplesFolder, 'bots.examples');
        assert.equal(
            G4ExampleBotsService.getTargetPath(example, PROJECT_FOLDER),
            path.join(path.sep, 'projects', 'demo', 'src', 'bots.examples', 'loops', 'for-loop-count.json')
        );
        assert.equal(G4ExampleBotsService.getResourceName(example), 'resources.examples/bots/loops/for-loop-count.json');

        // Chrome and UIA examples read their base bot from the project folder; a driver-free example reads none.
        assert.equal(
            G4ExampleBotsService.getBaseBotPath(example, PROJECT_FOLDER),
            path.join(path.sep, 'projects', 'demo', 'src', 'base.bots', 'chrome-automation-base.json')
        );
        assert.equal(
            G4ExampleBotsService.getBaseBotPath(newExample({ driver: 'uia' }), PROJECT_FOLDER),
            path.join(path.sep, 'projects', 'demo', 'src', 'base.bots', 'uia-automation-base.json')
        );
        assert.equal(G4ExampleBotsService.getBaseBotPath(newExample({ driver: 'none' }), PROJECT_FOLDER), undefined);

        // A project has no Android base bot, so an Android example keeps the driver settings it ships with.
        assert.equal(G4ExampleBotsService.getBaseBotPath(newExample({ driver: 'android' }), PROJECT_FOLDER), undefined);
    });

    it('finds the project folder as the folder that holds manifest.json', () => {
        const projectRoot = path.join(path.sep, 'projects', 'demo');
        const otherFolder = path.join(path.sep, 'projects', 'notes');
        const manifestPath = path.join(PROJECT_FOLDER, 'manifest.json');
        const testManifest = (filePath: string): boolean => filePath === manifestPath;
        const testNothing = (): boolean => false;

        // VS Code has the src folder open, as New Project leaves it: the open folder is the project folder.
        assert.equal(G4ExampleBotsService.getProjectFolder([PROJECT_FOLDER], testManifest), PROJECT_FOLDER);

        // The folder above src is open: the project folder is its src folder, never src inside src.
        assert.equal(G4ExampleBotsService.getProjectFolder([projectRoot], testManifest), PROJECT_FOLDER);

        // In a multi-root workspace the folder with the manifest wins over the first folder.
        assert.equal(G4ExampleBotsService.getProjectFolder([otherFolder, PROJECT_FOLDER], testManifest), PROJECT_FOLDER);

        // Without a manifest the first folder is read the way the extension reads it elsewhere.
        assert.equal(G4ExampleBotsService.getProjectFolder([PROJECT_FOLDER], testNothing), PROJECT_FOLDER);
        assert.equal(G4ExampleBotsService.getProjectFolder([projectRoot], testNothing), PROJECT_FOLDER);

        // No open folder means no project.
        assert.equal(G4ExampleBotsService.getProjectFolder([], testNothing), undefined);
    });

    it('takes the examples a documentation link names, and opens the picker for any other argument', () => {
        const count = newExample();
        const index = newExample({ id: 'loops/for-loop-index' });
        const examples = [count, index];

        // One id, a list and { ids } all name examples, in catalog order, and unknown ids are reported.
        assert.deepEqual(G4ExampleBotsService.getRequestedExamples(examples, ' loops/for-loop-index ').examples, [index]);
        assert.deepEqual(
            G4ExampleBotsService.getRequestedExamples(examples, ['loops/for-loop-index', 'loops/for-loop-count']).examples,
            [count, index]
        );
        assert.deepEqual(G4ExampleBotsService.getRequestedExamples(examples, { ids: ['loops/nope'] }), {
            examples: [],
            isRequested: true,
            unknownIds: ['loops/nope']
        });

        // No argument, or the folder URI of the Explorer menu, names nothing, so the picker opens.
        assert.equal(G4ExampleBotsService.getRequestedExamples(examples, undefined).isRequested, false);
        const folderArgument = { fsPath: '/projects/demo/src/bots' };

        assert.equal(G4ExampleBotsService.getRequestedExamples(examples, folderArgument).isRequested, false);
    });

    it('replaces only the driver settings of an example with those of the base bot', () => {
        const exampleText = JSON.stringify({
            driverParameters: { driver: 'ChromeDriver', driverBinaries: 'http://localhost:4444/wd/hub' },
            reference: { name: 'Example' },
            stages: [{ jobs: [] }]
        });
        const baseBotText = JSON.stringify({
            driverParameters: { driver: 'ChromeDriver', driverBinaries: 'E:/sandbox/drivers/chrome' },
            reference: { name: 'Base' }
        });

        const result = G4ExampleBotsService.newExampleContent(exampleText, baseBotText);
        const bot = JSON.parse(result.content);

        // The driver settings come from the base bot; the name and stages stay the example's own.
        assert.equal(result.isBaseApplied, true);
        assert.equal(bot.driverParameters.driverBinaries, 'E:/sandbox/drivers/chrome');
        assert.equal(bot.reference.name, 'Example');
        assert.deepEqual(bot.stages, [{ jobs: [] }]);
    });

    it('keeps the shipped example when there is no usable base bot', () => {
        const exampleText = '{ "driverParameters": { "driver": "ChromeDriver" } }';

        // No base bot, a broken one, or one without driver settings all leave the example as shipped.
        assert.deepEqual(
            G4ExampleBotsService.newExampleContent(exampleText, undefined),
            { content: exampleText, isBaseApplied: false }
        );
        assert.equal(G4ExampleBotsService.newExampleContent(exampleText, '{ broken').isBaseApplied, false);
        assert.equal(G4ExampleBotsService.newExampleContent(exampleText, '{ "reference": {} }').isBaseApplied, false);
    });

    it('ships a valid catalog whose every example has a valid bot file', () => {
        const examplesFolder = path.join(EXTENSION_ROOT, 'resources.examples', 'bots');
        const catalog = G4ExampleBotsService.getCatalog(fs.readFileSync(path.join(examplesFolder, 'catalog.json'), 'utf8'));

        assert.deepEqual(catalog.issues, []);
        assert.ok(catalog.examples.length > 0);

        // Every listed example must have its bot file, and the file must look like a bot.
        for (const example of catalog.examples) {
            const botPath = path.join(examplesFolder, ...example.id.split('/')) + '.json';
            const bot = JSON.parse(fs.readFileSync(botPath, 'utf8'));

            assert.ok(Array.isArray(bot.stages), `${example.id} has no stages`);
            assert.ok(bot.driverParameters, `${example.id} has no driverParameters`);
            assert.ok(bot.reference?.name, `${example.id} has no name`);

            // Every companion an example names must be packaged, and a JSON companion must be valid JSON.
            for (const companion of example.companions) {
                const companionPath = path.join(EXTENSION_ROOT, ...companion.resource.split('/'));

                assert.ok(fs.existsSync(companionPath), `${example.id} names the missing file ${companion.resource}`);
                assert.doesNotThrow(() => JSON.parse(fs.readFileSync(companionPath, 'utf8')), `${companion.resource} is not valid JSON`);
            }
        }
    });

    it('ships every bot file in the catalog, so none is packaged without being offered', () => {
        const examplesFolder = path.join(EXTENSION_ROOT, 'resources.examples', 'bots');
        const catalog = G4ExampleBotsService.getCatalog(fs.readFileSync(path.join(examplesFolder, 'catalog.json'), 'utf8'));
        const listedIds = new Set(catalog.examples.map(example => example.id));

        // Each group folder holds bot files; every one of them must be a catalog entry.
        const groupFolders = fs.readdirSync(examplesFolder, { withFileTypes: true }).filter(entry => entry.isDirectory());

        for (const groupFolder of groupFolders) {
            const botFiles = fs.readdirSync(path.join(examplesFolder, groupFolder.name)).filter(file => file.endsWith('.json'));

            for (const botFile of botFiles) {
                const id = `${groupFolder.name}/${path.basename(botFile, '.json')}`;

                assert.ok(listedIds.has(id), `${id} is not listed in catalog.json`);
            }
        }
    });
});
