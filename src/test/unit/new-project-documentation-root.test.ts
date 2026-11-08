/*
 * Unit tests for the New-Project copy of the Markdown pages in the documentation root.
 *
 * Each test builds a small packaged documentation tree in a temporary folder and copies it with the command's private helper.
 */
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { NewProjectCommand } from '../../commands/new-project';

// The helper is private; the tests reach it by name to check the copy without creating a whole project.
const copyDocumentationRootFiles = (NewProjectCommand as unknown as {
    copyDocumentationRootFiles: (options: {
        destinationNamesBySourceName: ReadonlyMap<string, string>;
        documentationDestinationPath: string;
        documentationSourcePath: string;
    }) => void;
}).copyDocumentationRootFiles.bind(NewProjectCommand);

describe('NewProjectCommand.copyDocumentationRootFiles', () => {
    let sourceFolder = '';
    let destinationFolder = '';

    beforeEach(() => {
        // Give every test its own folders, so files cannot leak between tests.
        sourceFolder = fs.mkdtempSync(path.join(os.tmpdir(), 'g4-docs-source-'));
        destinationFolder = fs.mkdtempSync(path.join(os.tmpdir(), 'g4-docs-destination-'));
    });

    afterEach(() => {
        // Remove the test folders.
        fs.rmSync(sourceFolder, { force: true, recursive: true });
        fs.rmSync(destinationFolder, { force: true, recursive: true });
    });

    // Copies the source folder with one learning path named "quick-start".
    const copyPages = (): void => {
        copyDocumentationRootFiles({
            destinationNamesBySourceName: new Map([['quick-start', 'Quick Start']]),
            documentationDestinationPath: destinationFolder,
            documentationSourcePath: sourceFolder
        });
    };

    it('copies root Markdown pages and skips the index, folders and other files', () => {
        fs.writeFileSync(path.join(sourceFolder, 'troubleshooting.md'), '# Help\n', 'utf8');
        fs.writeFileSync(path.join(sourceFolder, 'g4-learning.md'), '# Index\n', 'utf8');
        fs.writeFileSync(path.join(sourceFolder, 'notes.txt'), 'text\n', 'utf8');
        fs.mkdirSync(path.join(sourceFolder, 'quick-start'));
        fs.writeFileSync(path.join(sourceFolder, 'quick-start', 'README.md'), '# Path\n', 'utf8');

        copyPages();

        assert.deepEqual(fs.readdirSync(destinationFolder), ['troubleshooting.md']);
    });

    it('points learning-path links at the friendly folder and index links at the published index', () => {
        fs.writeFileSync(
            path.join(sourceFolder, 'recipes.md'),
            '[Back](g4-learning.md)\n[Path](quick-start/README.md)\n[Site](https://example.com/g4-learning.md)\n',
            'utf8');

        copyPages();

        assert.equal(
            fs.readFileSync(path.join(destinationFolder, 'recipes.md'), 'utf8'),
            '[Back](G4%20Learning%20Paths.md)\n[Path](Quick%20Start/README.md)\n[Site](https://example.com/g4-learning.md)\n');
    });
});
