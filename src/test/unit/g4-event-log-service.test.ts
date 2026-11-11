/*
 * Unit tests for the event log: the summary of each kind of event, the shortened preview and its limits, the parts
 * offered for drilling in, credential masking, levels, and what writeEvent writes and keeps.
 */
import * as assert from 'node:assert/strict';

import { G4EventLogService } from '../../services/g4-event-log-service';

import type { Logger } from '../../logging/logger';
import type { EventLogLevel, PreviewLimits } from '../../services/g4-event-log-service';

// Small limits, so the tests can show every rule with short values.
const SMALL_LIMITS: PreviewLimits = { arrayItems: 2, depth: 2, lines: 40, stringLength: 10 };

/**
 * Creates a log entry event the way the Hub sends it: camelCase envelope, PascalCase engine fields.
 *
 * @param fields - Engine fields to add or replace.
 * @returns The event.
 */
const newLogEvent = (fields: Record<string, unknown> = {}): Record<string, unknown> => ({
    id: 'invoker-1',
    objectType: 'LogEventArgs',
    type: 'Log',
    value: {
        Logger: 'G4.Plugins.InvokeClick',
        LogLevel: 'Information',
        Message: 'Element was clicked',
        ...fields
    }
});

/**
 * Creates a logger that records what each level was given.
 *
 * @returns The logger and the recorded writes.
 */
const newRecordingLogger = (): { logger: Logger; writes: { level: EventLogLevel; text: string; }[]; } => {
    const writes: { level: EventLogLevel; text: string; }[] = [];
    const logger = {
        debug: (text: string) => writes.push({ level: 'debug', text }),
        error: (text: string) => writes.push({ level: 'error', text }),
        information: (text: string) => writes.push({ level: 'information', text }),
        warning: (text: string) => writes.push({ level: 'warning', text })
    } as unknown as Logger;

    return { logger, writes };
};

describe('G4EventLogService', () => {
    it('summarizes a log entry by level, logger, and its first message line, cut', () => {
        const longMessage = `${'x'.repeat(130)}\nsecond line`;

        assert.equal(
            G4EventLogService.getSummaryText(newLogEvent()),
            'Log · Information · G4.Plugins.InvokeClick · "Element was clicked"');
        assert.equal(
            G4EventLogService.getSummaryText(newLogEvent({ Message: longMessage })),
            `Log · Information · G4.Plugins.InvokeClick · "${'x'.repeat(120)}…"`);
    });

    it('summarizes an automation request by id and counts, and other values by type', () => {
        const automation = {
            objectType: 'G4AutomationModel',
            type: 'Automation',
            value: {
                reference: { id: 'abc' },
                stages: [{ jobs: [{ rules: [{}, {}] }, { rules: [{}] }] }, { jobs: [] }]
            }
        };

        assert.equal(G4EventLogService.getSummaryText(automation), 'Automation request · abc · 2 stages · 2 jobs · 3 rules');
        assert.equal(G4EventLogService.getSummaryText({ objectType: 'RuleEventArgs', type: 'Rule' }), 'Rule · RuleEventArgs');
        assert.equal(G4EventLogService.getSummaryText({ a: 1 }), 'Object');
        assert.equal(G4EventLogService.getSummaryText([1, 2]), 'Array · 2 items');
        assert.equal(G4EventLogService.getSummaryText('text'), 'Value');
    });

    it('previews two levels in full and shows deeper containers, long strings, and long arrays shortened', () => {
        const value = {
            empty: {},
            list: [1, 2, 3, 4],
            nested: { deep: { a: 1 }, items: [] },
            text: 'abcdefghijklmnop'
        };

        assert.deepEqual(G4EventLogService.getPreviewLines(value, SMALL_LIMITS), [
            '  {',
            '    "empty": {},',
            '    "list": [',
            '      1,',
            '      2,',
            '      … 2 more items',
            '    ],',
            '    "nested": {',
            '      "deep": {…1 key},',
            '      "items": []',
            '    },',
            '    "text": "abcdefghij…" (+6 chars)',
            '  }'
        ]);
    });

    it('offers each shortened part, in the order the preview shows it, with its path text', () => {
        const value = { list: [1, 2, 3], nested: { deep: { a: 1 } }, 'odd key': 'abcdefghijklmnop' };
        const parts = G4EventLogService.getCollapsedParts(value, SMALL_LIMITS);

        assert.deepEqual(parts, [
            { path: ['list'], sizeText: '3 items' },
            { path: ['nested', 'deep'], sizeText: '1 key' },
            { path: ['odd key'], sizeText: '16 chars' }
        ]);
        assert.equal(G4EventLogService.getPathText(['value', 'Response', 'Extractions', 3]), 'value.Response.Extractions[3]');
        assert.equal(G4EventLogService.getPathText(['odd key']), '["odd key"]');
        assert.deepEqual(G4EventLogService.getPartValue(value, ['nested', 'deep']), { a: 1 });
        assert.equal(G4EventLogService.getPartValue(value, ['list', 9, 'x']), undefined);
    });

    it('offers the large parts inside a shortened part, but not its small entries', () => {
        // The preview stops at Response; its long list and long page source can still be picked on their own.
        const rows = Array.from({ length: 120 }, (_, index) => ({ key: `row${index}`, value: index }));
        const value = { value: { Response: { Extractions: rows, PageSource: 'x'.repeat(500), Status: 'ok' } } };
        const parts = G4EventLogService.getCollapsedParts(value);

        assert.deepEqual(parts, [
            { path: ['value', 'Response'], sizeText: '3 keys' },
            { path: ['value', 'Response', 'Extractions'], sizeText: '120 items' },
            { path: ['value', 'Response', 'PageSource'], sizeText: '500 chars' }
        ]);
    });

    it('stops the preview at the line limit and tells how large the event is in full', () => {
        const value = Object.fromEntries(Array.from({ length: 60 }, (_, index) => [`key${index}`, index]));
        const lines = G4EventLogService.getPreviewLines(value);

        assert.equal(lines.length, 40);
        assert.equal(lines[39], '  … truncated (641 B, 62 lines in full)');
    });

    it('masks credential keys at any depth and credentials written inside text', () => {
        const value = {
            authentication: { password: 'secret', token: 'license', username: 'me' },
            list: [{ Token: 'other' }],
            request: String.raw`{\"token\":\"nested\"}`,
            token: ''
        };

        assert.deepEqual(G4EventLogService.convertToMaskedValue(value), {
            authentication: { password: '***', token: '***', username: 'me' },
            list: [{ Token: '***' }],
            request: String.raw`{\"token\":\"***\"}`,
            token: ''
        });
    });

    it('raises the level to the engine warning or error, and never lowers it', () => {
        assert.equal(G4EventLogService.resolveLevel('information', newLogEvent({ LogLevel: 'Error' })), 'error');
        assert.equal(G4EventLogService.resolveLevel('information', newLogEvent({ LogLevel: 'Critical' })), 'error');
        assert.equal(G4EventLogService.resolveLevel('debug', newLogEvent({ LogLevel: 'Warning' })), 'warning');
        assert.equal(G4EventLogService.resolveLevel('error', newLogEvent({ LogLevel: 'Warning' })), 'error');
        assert.equal(G4EventLogService.resolveLevel('information', newLogEvent({ LogLevel: 'Debug' })), 'information');
        assert.equal(G4EventLogService.resolveLevel('warning', { a: 1 }), 'warning');
    });

    it('writes a numbered summary, masks, keeps the event, and shows only the header for an automation preview', () => {
        const { logger, writes } = newRecordingLogger();
        const logRecord = G4EventLogService.writeEvent({
            detail: 'preview',
            level: 'information',
            logger,
            value: newLogEvent({ LogLevel: 'Warning', Message: '{"password":"p"}' })
        });
        const automationRecord = G4EventLogService.writeEvent({
            detail: 'preview',
            label: 'Request',
            level: 'information',
            logger,
            value: { objectType: 'G4AutomationModel', type: 'Automation', value: { stages: [] } }
        });

        // The log entry is written at the engine level, numbered, with its source, size, and masked JSON.
        const [logWrite, automationWrite] = writes;
        const logLines = logWrite.text.split('\n');

        assert.equal(logWrite.level, 'warning');
        assert.match(logLines[0], new RegExp(String.raw`^#${logRecord.number} Log · Warning · `));
        assert.match(logLines[1], /^event: {7}LogEventArgs · \d+ B$/);
        assert.equal(logLines[2], '  {');
        assert.ok(!logWrite.text.includes('"p"'));

        // The automation preview stops at the header, and both events are kept, newest first.
        assert.equal(automationWrite.text.split('\n').length, 2);
        assert.match(automationWrite.text, /event: {7}Request · G4AutomationModel · /);
        assert.deepEqual(G4EventLogService.getEvents().slice(0, 2).map(record => record.number), [automationRecord.number, logRecord.number]);
    });

    it('writes a part in full, with strings as their own lines', () => {
        const { logger, writes } = newRecordingLogger();
        const record = G4EventLogService.writeEvent({
            detail: 'summary',
            level: 'information',
            logger,
            value: { page: 'line one\nline two', rows: [1, 2] }
        });

        G4EventLogService.writePart({ logger, part: { path: ['page'], sizeText: '17 chars' }, record });
        G4EventLogService.writePart({ logger, part: { path: [], sizeText: '40 B' }, record });

        assert.equal(writes[0].text.split('\n').length, 2);
        assert.equal(writes[1].text, `#${record.number} page (17 chars)\n  line one\n  line two`);
        assert.match(writes[2].text, new RegExp(String.raw`^#${record.number} whole event \(40 B\)\n  \{`));
    });

    it('formats sizes in bytes, kilobytes, and megabytes', () => {
        assert.equal(G4EventLogService.convertToSizeText(512), '512 B');
        assert.equal(G4EventLogService.convertToSizeText(48 * 1024), '48 KB');
        assert.equal(G4EventLogService.convertToSizeText(3.2 * 1024 * 1024), '3.2 MB');
    });
});
