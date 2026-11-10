/*
 * Unit tests for the documentation labels: a node is named by the link text its index gives it, then by its own
 * title, then by its name on disk.
 *
 * The packaged learning paths (resources.docs) are the real input, so a renamed path or module that loses its
 * name shows up here.
 */
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { G4DocumentLabelService } from '../../services/g4-document-label-service';

// The packaged learning paths, relative to the compiled test (out/test/unit).
const DOCUMENTATION_FOLDER = path.resolve(__dirname, '..', '..', '..', 'resources.docs');

/**
 * Reads a packaged documentation file.
 *
 * @param relativePath - The file, relative to resources.docs.
 * @returns The file text.
 */
const readDocument = (relativePath: string): string => fs.readFileSync(path.join(DOCUMENTATION_FOLDER, relativePath), 'utf8');

describe('Documentation labels', () => {
    it('names the learning paths and reference files as the root index names them', () => {
        const linkLabels = G4DocumentLabelService.getLinkLabels(readDocument('g4-learning.md'));

        /**
         * Resolves a packaged folder's label from the root index.
         *
         * @param folderName - The folder name.
         * @returns The label.
         */
        const getFolderLabel = (folderName: string): string => G4DocumentLabelService.getFolderLabel({
            folderName,
            linkLabels,
            readmeText: readDocument(path.join(folderName, 'README.md'))
        });

        // The index keeps punctuation, small words, and acronyms that Title Case of the slug loses.
        assert.equal(getFolderLabel('configure-manifest'), 'Configure manifest.json');
        assert.equal(getFolderLabel('plugins-externals-and-mcp'), 'Plugins, Externals, and MCP');
        assert.equal(getFolderLabel('publish-a-flow'), 'Publish a Flow');
        assert.equal(getFolderLabel('autonomous-run'), 'Autonomous Exploratory Run');

        // The reference files are named by their links in the index.
        assert.equal(G4DocumentLabelService.getFileLabel({ fileName: 'recipes.md', fileText: '', linkLabels }), 'Recipes');
    });

    it('names a module by its README link, then by its title without the module prefix, then by its file name', () => {
        const linkLabels = G4DocumentLabelService.getLinkLabels(readDocument(path.join('quick-start', 'README.md')));
        const noLinks = new Map<string, string>();

        // A module the README links is named by its link text.
        const linkedLabel = G4DocumentLabelService.getFileLabel({ fileName: '01-deploy-the-sandbox.md', fileText: '', linkLabels });

        assert.notEqual(linkedLabel, '01-deploy-the-sandbox');

        // Without a link, the H1 outside code blocks names the file, without "Module N:" and the subtitle.
        const titledText = '```\n# not a title\n```\n# Module 7: Real title: subtitle\n';

        assert.equal(G4DocumentLabelService.getFileLabel({ fileName: '07-x.md', fileText: titledText, linkLabels: noLinks }), 'Real title');
        assert.equal(G4DocumentLabelService.getFileLabel({ fileName: 'notes.md', fileText: 'No heading.', linkLabels: noLinks }), 'notes');
    });

    it('reads same-folder documents and subfolders from links, and ignores every other target', () => {
        const indexText = [
            '[📗 **Quick Start**](quick-start/README.md) [Again](quick-start/README.md)',
            '[`Go`](./go.md#top) [Image](images/a.png) [Deep](a/b/c.md) [Up](../up.md) [Space](my%20notes.md)',
            '[Folder](Publish%20A%20Flow/README.md) [Site](https://example.com/page.md)'
        ].join('\n');

        const labels = G4DocumentLabelService.getLinkLabels(indexText);

        assert.deepEqual([...labels], [
            ['quick-start/', 'Quick Start'],
            ['go.md', 'Go'],
            ['my notes.md', 'Space'],
            ['publish a flow/', 'Folder']
        ]);
    });

    it('names a folder without an index link or README from its name', () => {
        const label = G4DocumentLabelService.getFolderLabel({ folderName: 'my-new-path', linkLabels: new Map(), readmeText: '' });

        assert.equal(label, 'My New Path');
    });
});
