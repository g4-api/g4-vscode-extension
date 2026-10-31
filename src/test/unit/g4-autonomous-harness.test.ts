/*
 * Unit tests for the autonomous run harnesses: each tool's command line, and each tool's output read into
 * run events. The output lines are trimmed copies of what Claude Code 2.1.287, Codex 0.160.0, and
 * OpenCode 1.18.34 printed for the same small task.
 */
import * as assert from 'node:assert/strict';
import * as path from 'node:path';

import { G4AutonomousHarness } from '../../services/g4-autonomous-harness';

import type { AutonomousAgentEvent } from '../../services/g4-autonomous-harness';
import type { AutonomousHarnessType } from '../../services/g4-autonomous-settings';

// The run folder the command lines are built for.
const RUN_FOLDER = String.raw`E:\project\autonomous-runs\20261028-101500`;

// Claude Code `--print --output-format stream-json --verbose` output.
const CLAUDE_LINES = [
    '{"type": "system", "subtype": "init", "session_id": "98ca6184-d9a0-446b-b821-d45c54efd1b8"}',
    '{"type": "assistant", "message": {"content": [{"type": "tool_use", "id": "toolu_1", "name": "PowerShell", "input": {"command": "$env:G4_AUTONOMOUS_PROBE", "description": "Print the probe"}}]}}',
    '{"type": "user", "message": {"content": [{"tool_use_id": "toolu_1", "type": "tool_result", "content": "probe-value-42", "is_error": false}]}}',
    '{"type": "assistant", "message": {"content": [{"type": "text", "text": "probe-value-42"}]}}',
    '{"type": "result", "subtype": "success", "is_error": false, "result": "probe-value-42", "session_id": "98ca6184-d9a0-446b-b821-d45c54efd1b8"}'
];

// Codex `exec --json` output.
const CODEX_LINES = [
    '{"type": "thread.started", "thread_id": "01a183e5-7598-72e2-9418-d22c86ac441a"}',
    '{"type": "turn.started"}',
    '{"type": "item.started", "item": {"id": "item_0", "type": "command_execution", "command": "powershell -NoProfile -Command \\"$env:G4_AUTONOMOUS_PROBE\\"", "aggregated_output": "", "exit_code": null, "status": "in_progress"}}',
    '{"type": "item.completed", "item": {"id": "item_0", "type": "command_execution", "command": "powershell", "aggregated_output": "probe-value-42", "exit_code": 0, "status": "completed"}}',
    '{"type": "item.completed", "item": {"id": "item_1", "type": "agent_message", "text": "probe-value-42"}}',
    '{"type": "turn.completed", "usage": {"input_tokens": 29149, "output_tokens": 75}}'
];

// OpenCode `run --format json` output.
const OPENCODE_LINES = [
    '{"type": "step_start", "sessionID": "ses_e7c1a3224ffeZaf7F9slLr3vQi", "part": {"type": "step-start"}}',
    '{"type": "tool_use", "sessionID": "ses_e7c1a3224ffeZaf7F9slLr3vQi", "part": {"type": "tool", "tool": "bash", "state": {"status": "completed", "input": {"command": "powershell -NoProfile -Command \\"Write-Output $env:G4_AUTONOMOUS_PROBE\\""}, "output": "probe-value-42\\r\\n"}}}',
    '{"type": "step_finish", "sessionID": "ses_e7c1a3224ffeZaf7F9slLr3vQi", "part": {"reason": "tool-calls", "type": "step-finish"}}',
    '{"type": "text", "sessionID": "ses_e7c1a3224ffeZaf7F9slLr3vQi", "part": {"type": "text", "text": "probe-value-42"}}',
    '{"type": "step_finish", "sessionID": "ses_e7c1a3224ffeZaf7F9slLr3vQi", "part": {"reason": "stop", "type": "step-finish"}}'
];

/**
 * Reads every line of one tool's output into events.
 *
 * @param type - The tool.
 * @param lines - The output lines.
 * @returns The events, in order.
 */
const readEvents = (type: AutonomousHarnessType, lines: string[]): AutonomousAgentEvent[] =>
    lines.flatMap((line) => G4AutonomousHarness.convertFromOutputLine(type, line));

describe('G4AutonomousHarness command lines', () => {
    it('streams Claude Code events with the model, effort, and run folder, after the extra arguments', () => {
        const argumentsList = G4AutonomousHarness.getArguments({
            effort: 'high',
            extraArguments: ['--permission-mode', 'bypassPermissions'],
            model: 'claude-opus-5-5',
            runFolder: RUN_FOLDER,
            type: 'claude'
        });

        assert.deepEqual(argumentsList, [
            '--permission-mode', 'bypassPermissions',
            '--print', '--output-format', 'stream-json', '--verbose',
            '--model', 'claude-opus-5-5',
            '--effort', 'high',
            '--add-dir', RUN_FOLDER
        ]);
    });

    it('runs Codex in the run folder, writes its answer there, and reads the prompt from standard input', () => {
        const argumentsList = G4AutonomousHarness.getArguments({
            effort: 'xhigh',
            extraArguments: [],
            model: 'gpt-6-sol',
            runFolder: RUN_FOLDER,
            type: 'codex'
        });

        assert.deepEqual(argumentsList, [
            'exec', '--json', '--skip-git-repo-check',
            '-C', RUN_FOLDER,
            '-o', path.join(RUN_FOLDER, 'final-message.md'),
            '-m', 'gpt-6-sol',
            '-c', 'model_reasoning_effort=xhigh',
            '-'
        ]);
    });

    it('runs OpenCode in the run folder with the effort as model variant, and leaves empty choices to the tool', () => {
        const withChoices = G4AutonomousHarness.getArguments({
            effort: 'max',
            extraArguments: [],
            model: 'g4-gateway/nemotron',
            runFolder: RUN_FOLDER,
            type: 'opencode'
        });
        const withDefaults = G4AutonomousHarness.getArguments({
            effort: '',
            extraArguments: [],
            model: '',
            runFolder: RUN_FOLDER,
            type: 'opencode'
        });

        assert.deepEqual(withChoices, ['run', '--format', 'json', '--dir', RUN_FOLDER, '--model', 'g4-gateway/nemotron', '--variant', 'max']);
        assert.deepEqual(withDefaults, ['run', '--format', 'json', '--dir', RUN_FOLDER]);
    });
});

describe('G4AutonomousHarness output', () => {
    it('reads the Claude Code session, tool call, answer, and result', () => {
        const events = readEvents('claude', CLAUDE_LINES);

        assert.deepEqual(events.map((event) => [event.kind, event.text]), [
            ['session', '98ca6184-d9a0-446b-b821-d45c54efd1b8'],
            ['ready', 'Agent ready: 0 tools, 0 skills. No tool servers.'],
            ['tool', 'PowerShell: $env:G4_AUTONOMOUS_PROBE'],
            ['text', 'probe-value-42'],
            ['result', 'probe-value-42']
        ]);
        assert.equal(events.at(-1)?.isError, false);
        assert.equal(events.at(-1)?.fullText, 'probe-value-42');
    });

    it('reports a failed Claude Code result and a failed tool result as errors', () => {
        const events = readEvents('claude', [
            '{"type": "user", "message": {"content": [{"type": "tool_result", "is_error": true, "content": [{"type": "text", "text": "Access denied"}]}]}}',
            '{"type": "result", "subtype": "success", "is_error": true, "result": "Failed to authenticate"}'
        ]);

        assert.deepEqual(events.map((event) => [event.kind, event.text]), [
            ['error', 'Access denied'],
            ['result', 'Failed to authenticate']
        ]);
        assert.equal(events[1].isError, true);
    });

    it('reads the Codex thread, command, answer, and completed turn', () => {
        const events = readEvents('codex', CODEX_LINES);

        assert.deepEqual(events.map((event) => [event.kind, event.text]), [
            ['session', '01a183e5-7598-72e2-9418-d22c86ac441a'],
            ['tool', 'shell: powershell -NoProfile -Command "$env:G4_AUTONOMOUS_PROBE"'],
            ['text', 'probe-value-42'],
            ['result', '']
        ]);
        assert.equal(events.at(-1)?.isError, false);
    });

    it('reports a failed Codex turn as a failed result', () => {
        const events = readEvents('codex', [
            '{"type": "error", "message": "The model is not supported."}',
            '{"type": "turn.failed", "error": {"message": "The model is not supported."}}'
        ]);

        assert.deepEqual(events.map((event) => [event.kind, event.text, event.isError]), [
            ['error', 'The model is not supported.', undefined],
            ['result', 'The model is not supported.', true]
        ]);
    });

    it('reads the OpenCode session, tool call, answer, and the step that stops', () => {
        const events = readEvents('opencode', OPENCODE_LINES);

        assert.deepEqual(events.map((event) => [event.kind, event.text]), [
            ['session', 'ses_e7c1a3224ffeZaf7F9slLr3vQi'],
            ['tool', 'bash: powershell -NoProfile -Command "Write-Output $env:G4_AUTONOMOUS_PROBE"'],
            ['text', 'probe-value-42'],
            ['result', '']
        ]);
    });

    it('ignores plain text, arrays, and unknown events, and folds and cuts long text', () => {
        const longText = `first line\n${'x'.repeat(500)}`;
        const ignored = [
            'Warning: plain diagnostic text',
            '[1, 2, 3]',
            '{"type": "unknown.event"}',
            '{ not json'
        ].flatMap((line) => G4AutonomousHarness.convertFromOutputLine('codex', line));
        const [longEvent] = G4AutonomousHarness.convertFromOutputLine('claude', JSON.stringify({
            type: 'assistant',
            message: { content: [{ type: 'text', text: longText }] }
        }));

        assert.deepEqual(ignored, []);
        assert.equal(longEvent.text.length, 400);
        assert.ok(longEvent.text.startsWith('first line x'));
        assert.ok(longEvent.text.endsWith('…'));
    });

    it('names a recorder helper call by the helper, so its action and scenario stay in view', () => {
        const helperCall = `powershell -NoProfile -ExecutionPolicy Bypass -File "${path.join(RUN_FOLDER, 'g4-recorder.ps1')}" -Action start -Scenario "Create PO"`;
        const [event] = G4AutonomousHarness.convertFromOutputLine('claude', JSON.stringify({
            type: 'assistant',
            message: { content: [{ type: 'tool_use', name: 'PowerShell', input: { command: helperCall } }] }
        }));

        assert.equal(event.text, 'PowerShell: g4-recorder.ps1 -Action start -Scenario "Create PO"');
    });
});

describe('G4AutonomousHarness agent start', () => {
    // A trimmed Claude Code 2.1.287 init event: the recorder's tool server failed to connect.
    const initLine = JSON.stringify({
        type: 'system',
        subtype: 'init',
        session_id: 'session-1',
        tools: ['Bash', 'Read', 'mcp__g4__g4_StartRecording'],
        skills: ['g4-visual-observe', 'g4-visual-ground'],
        mcp_servers: [
            { name: 'g4', status: 'connected', source: 'project' },
            { name: 'g4-uia-recorder', status: 'failed', source: 'project' },
            { status: 'connected' },
            'not a server'
        ]
    });

    it('reads what Claude Code started with into a ready event', () => {
        const [sessionEvent, readyEvent] = G4AutonomousHarness.convertFromOutputLine('claude', initLine);

        assert.equal(sessionEvent.kind, 'session');
        assert.equal(readyEvent.kind, 'ready');
        assert.deepEqual(readyEvent.inventory, {
            skillCount: 2,
            toolCount: 3,
            toolServers: [
                { name: 'g4', status: 'connected' },
                { name: 'g4-uia-recorder', status: 'failed' }
            ]
        });
        assert.equal(readyEvent.text, 'Agent ready: 3 tools, 2 skills. Tool servers: g4 connected, g4-uia-recorder failed.');
    });

    it('finds the required tool servers that are not connected, missing ones included', () => {
        const [, readyEvent] = G4AutonomousHarness.convertFromOutputLine('claude', initLine);
        const inventory = readyEvent.inventory as NonNullable<typeof readyEvent.inventory>;

        assert.deepEqual(G4AutonomousHarness.getUnconnectedToolServers([], inventory), []);
        assert.deepEqual(G4AutonomousHarness.getUnconnectedToolServers(['G4'], inventory), []);
        assert.deepEqual(G4AutonomousHarness.getUnconnectedToolServers(['g4-uia-recorder', 'g4', 'browser'], inventory), [
            { name: 'g4-uia-recorder', status: 'failed' },
            { name: 'browser', status: 'not configured' }
        ]);
    });
});
