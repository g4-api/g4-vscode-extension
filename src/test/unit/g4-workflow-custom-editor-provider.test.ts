/*
 * Unit tests for the document text the workflow canvas writes into a bot document (STU-16).
 */
import * as assert from 'node:assert/strict';
import { G4WorkflowCustomEditorProvider } from '../../providers/g4-workflow-custom-editor-provider';

// The builder is private; the tests reach it by name to check the merge without a VS Code window.
const newDocumentText = (G4WorkflowCustomEditorProvider as unknown as {
    newDocumentText: (document: unknown, automation: Record<string, unknown>) => string;
}).newDocumentText;

/**
 * Creates the part of a TextDocument the builder reads: its text and a line ending other than CRLF.
 *
 * @param text - Document text.
 * @returns The document stand-in.
 */
const newDocument = (text: string): unknown => ({ eol: 1, getText: () => text });

describe('G4WorkflowCustomEditorProvider.newDocumentText', () => {
    it('keeps top-level fields the canvas does not model, in their place', () => {
        const document = newDocument('{\n    "$schema": "bot.schema.json",\n    "stages": [],\n    "notes": "keep"\n}\n');
        const text = newDocumentText(document, { stages: [{ jobs: [] }] });

        assert.deepEqual(JSON.parse(text), { $schema: 'bot.schema.json', stages: [{ jobs: [] }], notes: 'keep' });
        assert.deepEqual(Object.keys(JSON.parse(text)), ['$schema', 'stages', 'notes']);
    });

    it('drops a field the canvas removed', () => {
        const document = newDocument('{ "driverParameters": { "driver": "ChromeDriver" }, "stages": [] }');
        const text = newDocumentText(document, { driverParameters: undefined, stages: [] });

        assert.deepEqual(JSON.parse(text), { stages: [] });
    });

    it('keeps the trailing newline and a 4-space indent', () => {
        const withNewLine = newDocumentText(newDocument('{}\n'), { stages: [] });
        const withoutNewLine = newDocumentText(newDocument('{}'), { stages: [] });

        assert.equal(withNewLine, '{\n    "stages": []\n}\n');
        assert.equal(withoutNewLine, '{\n    "stages": []\n}');
    });

    it('replaces a document that is not valid JSON with the automation', () => {
        const text = newDocumentText(newDocument('{ "stages": '), { stages: [] });

        assert.deepEqual(JSON.parse(text), { stages: [] });
    });
});
