/*
 * Unit tests for the order of the G4 Documentations tree: folders first, then files, A-Z within each group,
 * ignoring case and comparing numbers by value.
 *
 * The nodes are plain objects with a label and, for folders, a children array, so the tests need no
 * VS Code runtime.
 */
import * as assert from 'node:assert/strict';

import { DocumentsTreeProvider } from '../../providers/g4-documents-tree-provider';

/**
 * Creates a folder node with no documents.
 *
 * @param label - The folder's display text.
 * @returns The node.
 */
const newFolder = (label: string): TestNode => ({ children: [], label });

/**
 * Creates a file node.
 *
 * @param label - The file's display text.
 * @returns The node.
 */
const newFile = (label: string): TestNode => ({ label });

/**
 * Reads the labels of nodes in their order.
 *
 * @param nodes - The nodes.
 * @returns The labels.
 */
const getLabels = (nodes: TestNode[]): string[] => nodes.map((node) => node.label);

describe('Documents tree order', () => {
    it('lists folders before files, each group A-Z ignoring case', () => {
        // Files and folders arrive mixed, as a directory read returns them.
        const nodes = [
            newFile('troubleshooting'),
            newFolder('Quick Start'),
            newFile('G4 Learning Paths'),
            newFolder('configure Manifest'),
            newFile('README')
        ];

        const sorted = DocumentsTreeProvider.sortTreeItems(nodes);

        assert.deepEqual(getLabels(sorted), ['configure Manifest', 'Quick Start', 'G4 Learning Paths', 'README', 'troubleshooting']);
    });

    it('compares numbers by value and leaves the input untouched', () => {
        // Unpadded numbers must not sort as text ("10" before "2").
        const nodes = [newFile('10-advanced'), newFile('2-intro'), newFile('1-start')];

        const sorted = DocumentsTreeProvider.sortTreeItems(nodes);

        assert.deepEqual(getLabels(sorted), ['1-start', '2-intro', '10-advanced']);
        assert.deepEqual(getLabels(nodes), ['10-advanced', '2-intro', '1-start']);
    });
});

// Compile-time contracts stay after the executable code. Interfaces come before type aliases, and a contract
// follows the contracts that depend on it before A-Z order resumes.

/**
 * A plain stand-in for a tree node.
 *
 * @remarks
 * Only the two members the sort reads, so the tests need no VS Code tree items.
 */
interface TestNode {
    /** The documents of a folder; absent for a file. */
    children?: TestNode[];

    /** The display text. */
    label: string;
}
