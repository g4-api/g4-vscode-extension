/*
 * Unit tests for the parts of an autonomous run that need no agent: the brief the agent receives and
 * the scenario ledger the recorder helper writes.
 */
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as http from 'node:http';
import * as os from 'node:os';
import * as path from 'node:path';

import { G4AutonomousBrief } from '../../services/g4-autonomous-brief';
import { G4AutonomousRunService } from '../../services/g4-autonomous-run-service';

import type { AddressInfo } from 'node:net';

import type { AutonomousAgentEvent } from '../../services/g4-autonomous-harness';
import type { AutonomousRunState } from '../../services/g4-autonomous-run-service';
import type { AutonomousHarness } from '../../services/g4-autonomous-settings';

describe('G4AutonomousBrief', () => {
    it('puts the prompt first and spells out every helper command with the absolute helper path', () => {
        const runFolder = String.raw`E:\project\autonomous-runs\20261028-101500`;
        const brief = G4AutonomousBrief.getBriefText({
            prompt: '  Record two scenarios: create and approve a purchase order.  ',
            recorderNames: ['machine-a (UiaDriver) at http://localhost:9955'],
            runFolder
        });
        const helperCommand = `powershell -NoProfile -ExecutionPolicy Bypass -File "${path.join(runFolder, 'g4-recorder.ps1')}"`;

        assert.ok(brief.indexOf('Record two scenarios') < brief.indexOf('## Recording rules'));
        assert.ok(brief.includes('- machine-a (UiaDriver) at http://localhost:9955'));

        for (const action of ['plan', 'start', 'stop', 'result', 'status']) {
            assert.ok(brief.includes(`${helperCommand} -Action ${action}`), `the brief explains the ${action} action`);
        }
    });

    it('points the agent at the G4 visual skills and screen tools, and to search for them first', () => {
        const brief = G4AutonomousBrief.getBriefText({ prompt: 'Record one scenario.', recorderNames: [], runFolder: 'E:/run' });

        assert.ok(brief.includes('## Seeing and controlling the screen'));
        assert.ok(brief.includes('g4-visual-observe') && brief.includes('g4-visual-ground'));
        assert.ok(brief.includes('GetScreenshot, ConvertScreenshotPoint, MovePointer, and ResolveGroundedElement'));
        assert.ok(brief.includes('search your tools'));
        assert.ok(brief.indexOf('## Seeing and controlling the screen') < brief.indexOf('## Ground rules'));
    });
});

describe('G4AutonomousRunService agent start', () => {
    // A service with a running agent stand-in, so the start check can be driven without a process.
    const newRunningService = (harness: Partial<AutonomousHarness>): RunningService => {
        // Stand in for the logger and the recording service, so no host is needed.
        const logger = { error: () => undefined, information: () => undefined, warning: () => undefined };
        const service = new G4AutonomousRunService({ logger, recordingService: { isRecording: false } } as any);
        const internals = service as unknown as RunServiceInternals;
        const stopCalls: number[] = [];

        // Inject the harness, a counting process, and the running phase the start check expects.
        internals._harness = { requiredToolServers: [], type: 'claude', ...harness } as AutonomousHarness;
        internals._process = { stop: async () => { stopCalls.push(1); } };
        internals._state = { ...internals._state, phase: 'running' };

        return { internals, service, stopCalls };
    };

    // What a Claude Code init reports when the recorder's tool server did not connect.
    const inventory = {
        skillCount: 36,
        toolCount: 48,
        toolServers: [{ name: 'g4', status: 'connected' }, { name: 'g4-uia-recorder', status: 'failed' }]
    };

    it('stops the agent and fails the run when a required tool server did not connect', () => {
        const { internals, service, stopCalls } = newRunningService({ requiredToolServers: ['g4-uia-recorder'] });

        internals.addEvent({ inventory, kind: 'ready', text: '' });

        const { events, state } = service.snapshot;
        const failure = 'The agent\'s required tool server "g4-uia-recorder" (failed) did not connect.';

        assert.equal(stopCalls.length, 1);
        assert.equal(state.phase, 'stopping');
        assert.deepEqual(state.toolServers, inventory.toolServers);
        assert.deepEqual(events.map((event) => event.kind), ['error']);
        assert.ok(events[0].text.includes('g4-uia-recorder failed'));
        assert.equal(internals.getOutcome(0, ''), 'failed');
        const message = internals.getOutcomeMessage('failed', 0, '');

        assert.ok(message.startsWith(failure), message);
    });

    it('lets the agent run when every required tool server is connected, and reports its start once', () => {
        const { internals, service, stopCalls } = newRunningService({ requiredToolServers: ['g4'] });

        internals.addEvent({ inventory, kind: 'ready', text: '' });
        internals.addEvent({ inventory, kind: 'ready', text: '' });

        assert.equal(stopCalls.length, 0);
        assert.equal(service.snapshot.state.phase, 'running');
        assert.deepEqual(service.snapshot.events.map((event) => event.kind), ['ready']);
        assert.equal(internals.getOutcome(0, ''), 'completed');
    });

    it('says that a harness without an inventory cannot be checked', () => {
        const { internals, service, stopCalls } = newRunningService({ requiredToolServers: ['g4-uia-recorder'], type: 'codex' });

        internals.addEvent({ kind: 'session', text: 'thread-1' });

        const [event] = service.snapshot.events;

        assert.equal(stopCalls.length, 0);
        assert.equal(event.kind, 'ready');
        assert.equal(event.text, 'Agent ready. This harness does not report its tools. The required tool servers (g4-uia-recorder) cannot be checked.');
    });
});

describe('G4AutonomousRunService ledger', () => {
    it('reads the ledger the recorder helper writes, byte order mark included', () => {
        const ledgerText = '\uFEFF' + JSON.stringify({
            version: 1,
            scenarios: [{
                error: '',
                flowPath: 'scenarios/01-create-po/flow.json',
                folder: 'scenarios/01-create-po',
                index: 1,
                name: 'Create PO',
                note: 'All good',
                recording: 'saved',
                result: 'passed',
                ruleCount: 12,
                sessionId: 'session-1',
                startedAt: '2026-10-28T19:10:41Z',
                stoppedAt: '2026-10-28T19:10:52Z'
            }]
        });

        const scenarios = G4AutonomousRunService.convertFromLedgerText(ledgerText);

        assert.deepEqual(scenarios, [{
            error: '',
            flowPath: 'scenarios/01-create-po/flow.json',
            folder: 'scenarios/01-create-po',
            index: 1,
            name: 'Create PO',
            note: 'All good',
            recording: 'saved',
            result: 'passed',
            ruleCount: 12,
            sessionId: 'session-1',
            startedAt: '2026-10-28T19:10:41Z',
            stoppedAt: '2026-10-28T19:10:52Z'
        }]);
    });

    it('narrows a hand-edited ledger and yields nothing for one that is not JSON', () => {
        const scenarios = G4AutonomousRunService.convertFromLedgerText(JSON.stringify({
            scenarios: [{ name: { nested: true }, ruleCount: 'many' }, null, 'text']
        }));

        assert.deepEqual(scenarios, [{
            error: '',
            flowPath: '',
            folder: '',
            index: 1,
            name: '',
            note: '',
            recording: 'planned',
            result: 'pending',
            ruleCount: 0,
            sessionId: '',
            startedAt: '',
            stoppedAt: ''
        }]);
        assert.deepEqual(G4AutonomousRunService.convertFromLedgerText('{ half a ledger'), []);
    });
});

describe('G4AutonomousRunService closing a run', () => {
    it('stops a recording the agent left open, saves what it captured, and marks the scenario aborted', async () => {
        // A Hub stand-in that answers the stop of the open session with a one-rule flow.
        const stoppedSessions: string[] = [];
        const hub = http.createServer((request, response) => {
            stoppedSessions.push(request.url ?? '');
            response.writeHead(200, { 'Content-Type': 'application/json' });
            response.end(JSON.stringify({ stages: [{ jobs: [{ rules: [{ pluginName: 'Click' }] }] }] }));
        });

        await new Promise<void>((resolve) => hub.listen(0, '127.0.0.1', resolve));

        const hubUrl = `http://127.0.0.1:${(hub.address() as AddressInfo).port}`;
        const runFolder = fs.mkdtempSync(path.join(os.tmpdir(), 'g4-autonomous-run-'));
        const ledger = {
            version: 1,
            scenarios: [
                { index: 1, name: 'Saved', folder: 'scenarios/01-saved', recording: 'saved', result: 'passed', sessionId: 'session-1' },
                { index: 2, name: 'Open', folder: 'scenarios/02-open', recording: 'recording', result: 'pending', sessionId: 'session-2' }
            ]
        };

        fs.writeFileSync(path.join(runFolder, 'scenarios.json'), JSON.stringify(ledger));

        // The service only needs a logger and a recording service to close a run.
        const logger = { error: () => undefined, information: () => undefined, warning: () => undefined };
        const service = new G4AutonomousRunService({ logger, recordingService: { isRecording: false } } as any);
        const closeOpenRecordings = (service as unknown as {
            closeOpenRecordings: (runFolder: string, hubUrl: string) => Promise<void>;
        }).closeOpenRecordings.bind(service);

        try {
            await closeOpenRecordings(runFolder, hubUrl);

            const scenarios = G4AutonomousRunService.convertFromLedgerText(fs.readFileSync(path.join(runFolder, 'scenarios.json'), 'utf8'));
            const flow = JSON.parse(fs.readFileSync(path.join(runFolder, 'scenarios', '02-open', 'flow.json'), 'utf8'));

            assert.deepEqual(stoppedSessions, ['/api/v4/g4/recordings/session-2/stop']);
            assert.deepEqual(scenarios.map((scenario) => [scenario.name, scenario.recording, scenario.flowPath]), [
                ['Saved', 'saved', ''],
                ['Open', 'aborted', 'scenarios/02-open/flow.json']
            ]);
            assert.equal(flow.stages[0].jobs[0].rules.length, 1);
            assert.deepEqual(service.snapshot.scenarios.map((scenario) => scenario.recording), ['saved', 'aborted']);
        } finally {
            hub.close();
            fs.rmSync(runFolder, { force: true, recursive: true });
        }
    });
});

// The contracts below are compile-time only, so they follow the tests. Interfaces come before type
// aliases; inside each group a declaration comes before the ones it uses, and A-Z order decides otherwise.

/**
 * A run service prepared by the agent-start tests, with its internals and the recorded stop calls.
 */
interface RunningService {
    /** The service's private members the tests drive. */
    internals: RunServiceInternals;

    /** The service under test. */
    service: G4AutonomousRunService;

    /** One entry per stop the service asked of the agent. */
    stopCalls: number[];
}

/**
 * The private members of the run service the tests reach; a partial view, since the tests drive only the
 * agent-start check and the outcome it leads to.
 */
interface RunServiceInternals {
    /** The harness of the run. */
    _harness: AutonomousHarness;

    /** The running agent; only its stop is used. */
    _process: {
        /** Stops the agent; the stand-in counts the calls. */
        stop: () => Promise<void>;
    };

    /** The run state. */
    _state: AutonomousRunState;

    /** Adds one agent event. */
    addEvent: (event: AutonomousAgentEvent) => void;

    /** Decides how the run ended. */
    getOutcome: (exitCode: number | null, startFailure: string) => string;

    /** Explains the outcome. */
    getOutcomeMessage: (outcome: string, exitCode: number | null, startFailure: string) => string;
}
