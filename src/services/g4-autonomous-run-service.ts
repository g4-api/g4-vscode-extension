/*
 * Owns the autonomous exploratory run: prepares the run folder, starts the agent, follows its output and its
 * scenario ledger, and closes the run.
 *
 * RESOURCES:
 * Run folder layout: brief.md, recording-request.json, g4-recorder.ps1, scenarios.json, scenarios/<nn-name>/flow.json,
 * events.jsonl, stderr.log, final-message.md, run.json
 */
import * as fs from 'node:fs';
import * as fsPromises from 'node:fs/promises';
import * as path from 'node:path';

import { G4RecordingsClient } from '../clients/g4-recordings-client';

import { Utilities } from '../extensions/utilities';

import {
    G4AutonomousBrief,
    RECORDER_HELPER_FILE_NAME
} from './g4-autonomous-brief';
import {
    FINAL_MESSAGE_FILE_NAME,
    G4AutonomousHarness
} from './g4-autonomous-harness';
import { G4AutonomousProcess } from './g4-autonomous-process';
import { G4AutonomousSettings } from './g4-autonomous-settings';
import { G4RecorderSandboxService } from './g4-recorder-sandbox-service';
import { G4RecorderSelfIdentityService } from './g4-recorder-self-identity-service';
import { G4ServiceHealth } from './g4-service-health';

import type { Logger } from '../logging/logger';

import type {
    AutonomousAgentEvent,
    AutonomousAgentEventKind,
    AutonomousAgentInventory,
    AutonomousToolServer
} from './g4-autonomous-harness';
import type { AutonomousHarness } from './g4-autonomous-settings';
import type {
    G4RecordingService,
    RecorderOptions
} from './g4-recording-service';

// Environment variable that hands the G4 authentication to the recorder helper without writing it to disk.
const AUTHENTICATION_VARIABLE = 'G4_AUTONOMOUS_AUTHENTICATION';

// A byte order mark at the start of a file, which JSON.parse refuses. Linear: one anchored character.
const BYTE_ORDER_MARK_PATTERN = /^\uFEFF/;

// Fallback G4 Hub endpoint when the manifest names no g4Server, matching the rest of the extension.
const DEFAULT_HUB_URL = 'http://localhost:9944';

// Window-title fragment of the VS Code Extension Development Host, excluded when its process ids are unknown.
const DEVELOPMENT_HOST_TITLE = 'Extension Development Host';

// Most recent agent events kept for the page; a reopened tab shows them again.
const EVENT_HISTORY_LIMIT = 200;

// Milliseconds in a minute, for the run's time limit.
const MILLISECONDS_PER_MINUTE = 60 * 1000;

// How often the scenario ledger is read for changes while the agent runs.
const LEDGER_POLL_MILLISECONDS = 1000;

// Most recent standard error lines kept to explain a failed run.
const STDERR_TAIL_LIMIT = 20;

/**
 * Runs one autonomous exploratory run at a time and reports its progress to listeners (the run page).
 *
 * @remarks
 * The agent owns the recordings: it plans, starts, and stops a recording per scenario through the helper
 * script in the run folder, and the helper keeps the scenario ledger. This service never records. It
 * prepares the run (the recording request with the picked recorders and this VS Code excluded, the
 * helper, an empty ledger, and the brief), starts the harness, follows its output and the ledger, and
 * closes the run. Only when the agent has ended (finished, stopped, failed, or timed out) does the
 * service touch the ledger itself: a recording the agent left open is stopped through the Hub so no
 * recorder stays reserved, and its scenario is marked aborted. State lives in memory and survives a
 * closed tab; reloading the window ends the agent with the extension host.
 */
export class G4AutonomousRunService {
    /** The latest agent events, oldest first, at most {@link EVENT_HISTORY_LIMIT}. */
    private _events: AutonomousRunEventEntry[] = [];

    /** The harness of the current run; undefined before the agent starts. */
    private _harness: AutonomousHarness | undefined;

    /** Whether the agent's start was already reported, so it is checked and shown once. */
    private _isAgentReady = false;

    /** Whether a stop was requested by the user, so the outcome reads "stopped" rather than "failed". */
    private _isStopRequested = false;

    /** Whether the run hit its time limit, so the outcome reads "timed out". */
    private _isTimedOut = false;

    /** The last error the agent reported, used to explain a failed run. */
    private _lastErrorText = '';

    /** The final `result` event of the run, when the harness printed one. */
    private _lastResultEvent: AutonomousAgentEvent | undefined;

    /** The ledger text last read, so listeners hear only about real changes. */
    private _ledgerText = '';

    /** Timer that reads the ledger while the agent runs. */
    private _ledgerTimer: NodeJS.Timeout | undefined;

    /** Receives every run change; the run page registers while it is open. */
    private readonly _listeners = new Set<(change: AutonomousRunChange) => void>();

    /** Logger for the run's lifecycle; never receives the prompt text or the authentication. */
    private readonly _logger: Logger;

    /** The running agent process. */
    private _process: G4AutonomousProcess | undefined;

    /** The shared recording service, read to refuse a run while a manual recording is open. */
    private readonly _recordingService: G4RecordingService;

    /** The scenarios of the run's ledger. */
    private _scenarios: AutonomousScenario[] = [];

    /** The run's state; `idle` before the first run. */
    private _state: AutonomousRunState = G4AutonomousRunService.newIdleState();

    /** The last standard error lines of the agent. */
    private _stderrTail: string[] = [];

    /** Timer that stops the agent at the time limit. */
    private _timeoutTimer: NodeJS.Timeout | undefined;

    /** Why the run was stopped for a required tool server the agent lacked; empty otherwise. */
    private _toolServerFailure = '';

    /**
     * Creates the run service.
     *
     * @param options - The logger and the shared recording service.
     */
    constructor(options: AutonomousRunServiceOptions) {
        this._logger = options.logger;
        this._recordingService = options.recordingService;
    }

    /**
     * Whether a run is being prepared, running, or stopping.
     */
    public get isRunning(): boolean {
        return ['starting', 'running', 'stopping'].includes(this._state.phase);
    }

    /**
     * Everything the run page needs to show the current or last run.
     */
    public get snapshot(): AutonomousRunSnapshot {
        return {
            events: [...this._events],
            scenarios: [...this._scenarios],
            state: {
                ...this._state,
                recorderNames: [...this._state.recorderNames],
                toolServers: [...this._state.toolServers]
            }
        };
    }

    /**
     * Registers a listener for run changes.
     *
     * @param listener - Receives each change.
     * @returns A function that removes the listener.
     */
    public addListener(listener: (change: AutonomousRunChange) => void): () => void {
        this._listeners.add(listener);

        return () => {
            this._listeners.delete(listener);
        };
    }

    /**
     * Reads a scenario ledger written by the recorder helper.
     *
     * @remarks
     * Compute-only. The helper writes the ledger atomically, but an agent could still edit it, so every
     * field is narrowed and a ledger that is not valid JSON yields no scenarios.
     *
     * @param ledgerText - The ledger file text.
     * @returns The scenarios, in ledger order.
     */
    public static convertFromLedgerText(ledgerText: string): AutonomousScenario[] {
        // A ledger that cannot be read has no scenarios to show.
        let ledger: any;

        try {
            ledger = JSON.parse(ledgerText.replace(BYTE_ORDER_MARK_PATTERN, ''));
        } catch {
            return [];
        }

        const entries: unknown[] = Array.isArray(ledger?.scenarios) ? ledger.scenarios : [];
        const getText = (value: unknown): string => (typeof value === 'string' ? value : '');

        // Narrow every field, so a hand-edited ledger cannot put objects into the page.
        return entries
            .filter((entry): entry is Record<string, unknown> => {
                const isObjectEntry = entry !== null && typeof entry === 'object';

                return isObjectEntry;
            })
            .map((entry, position) => {
                // A missing or non-numeric number falls back to the scenario's position and to no actions.
                const indexValue = Number(entry.index);
                const ruleCountValue = Number(entry.ruleCount);
                const index = Number.isFinite(indexValue)
                    ? indexValue
                    : position + 1;
                const ruleCount = Number.isFinite(ruleCountValue)
                    ? ruleCountValue
                    : 0;

                return {
                    error: getText(entry.error),
                    flowPath: getText(entry.flowPath),
                    folder: getText(entry.folder),
                    index,
                    name: getText(entry.name),
                    note: getText(entry.note),
                    recording: getText(entry.recording) || 'planned',
                    result: getText(entry.result) || 'pending',
                    ruleCount,
                    sessionId: getText(entry.sessionId),
                    startedAt: getText(entry.startedAt),
                    stoppedAt: getText(entry.stoppedAt)
                };
            });
    }

    /**
     * Starts an autonomous run.
     *
     * @remarks
     * Checks everything that can be checked before the agent starts (no other run, no manual recording,
     * a known harness, model, and effort, picked recorders, a prompt, an open workspace, a reachable Hub),
     * then prepares the run folder and starts the harness. The run continues in the background; listeners
     * hear about every change. Nothing is written when a check fails.
     *
     * @param request - What the user picked on the run page.
     * @returns An empty string when the run started, or why it did not.
     */
    public async startRun(request: AutonomousRunRequest): Promise<string> {
        // Refuse what cannot run before touching the disk.
        const manifest = Utilities.getManifest();
        const settings = G4AutonomousSettings.resolveAutonomousSettings(manifest);
        const harness = settings.harnesses.find((candidate) => candidate.name === request.harnessName);
        const recorders = Utilities.resolveEventsCaptureOptions()
            .filter((recorder) => request.recorders.includes(recorder.baseUrl));
        const startIssue = this.getStartIssue({ harness, recorders, request });

        if (startIssue.length > 0) {
            return startIssue;
        }

        // The Hub runs every recording the agent starts, so it must answer before the agent begins.
        const hubUrl = Utilities.getG4Endpoint() || DEFAULT_HUB_URL;
        const isHubAlive = await G4ServiceHealth.testPing(hubUrl);

        if (!isHubAlive) {
            return `The G4 Hub does not answer at ${hubUrl}. Start the Hub, then start the run again.`;
        }

        // Mark the run as starting at once, so a second click cannot start another one.
        const runHarness = harness as AutonomousHarness;
        const workspaceFolder = request.workspaceFolder;
        const runFolder = await G4AutonomousRunService.newRunFolder(path.resolve(workspaceFolder, settings.runsFolder));

        this.resetRun();
        this.setState({
            effort: request.effort,
            finishedAt: '',
            harnessName: runHarness.name,
            isSandbox: runHarness.isSandbox,
            message: 'Preparing the run folder.',
            model: request.model,
            outcome: '',
            phase: 'starting',
            recorderNames: recorders.map((recorder) => G4AutonomousSettings.getRecorderName(recorder)),
            runFolder,
            sessionId: '',
            startedAt: new Date().toISOString(),
            toolServers: []
        });

        try {
            // Start sandboxed recorder apps when the manifest asks for it, as a manual recording does.
            const isSandboxRequested = manifest?.settings?.recorderSettings?.useSandbox === true;
            const sandboxRecorders = isSandboxRequested
                ? recorders
                : [];

            await G4RecorderSandboxService.startFromOptionsWhenRequired({
                recorders: sandboxRecorders,
                sandboxPath: manifest?.sandbox
            });

            // Write the run folder, then start the agent.
            await this.writeRunFolder({ hubUrl, recorders, request, runFolder });
            this.startAgent({ harness: runHarness, manifest, request, runFolder, timeoutMinutes: settings.timeoutMinutes });

            return '';
        } catch (error: unknown) {
            // A run that could not start is finished as failed, with the reason on the page.
            const message = `The run could not start: ${Utilities.resolveErrorMessage(error)}`;

            this._logger.error(message);
            await this.finishRun(null, message);

            return message;
        }
    }

    /**
     * Stops the running agent and closes the run.
     *
     * @remarks
     * Ends the agent's whole process tree; the run then closes like any other run, including stopping a
     * recording the agent left open.
     *
     * @returns A promise that resolves once the agent has ended.
     */
    public async stopRun(): Promise<void> {
        const isAgentRunning = this._state.phase === 'running' && this._process !== undefined;

        if (!isAgentRunning) {
            return;
        }

        // Remember that the user stopped the run, then end the agent.
        this._isStopRequested = true;
        this.setState({ ...this._state, message: 'Stopping the agent.', phase: 'stopping' });
        this._logger.information('Autonomous run: stopping the agent at the user\'s request.');

        await this._process?.stop();
    }

    /**
     * Reports what the agent started with and stops the run when a required tool server is missing.
     *
     * @remarks
     * Runs once per run. The inventory goes into the run state (and so into `run.json`) and becomes the
     * first console line. When the harness requires tool servers that the agent did not connect, the agent
     * is stopped before it can try the screen without them, and the run fails with the reason. A harness
     * that reports no inventory (Codex, OpenCode) is only announced; nothing can be checked.
     *
     * @param inventory - What the agent reported, or undefined when its harness reports nothing.
     */
    private addAgentReadyEvent(inventory: AutonomousAgentInventory | undefined): void {
        // Report the start only once, even when a harness repeats its first event.
        if (this._isAgentReady) {
            return;
        }

        // Mark the start as reported before any check, so a repeated init cannot stop the agent twice.
        this._isAgentReady = true;

        // Read the harness's required servers; none means there is nothing to check.
        const requiredNames = this._harness?.requiredToolServers ?? [];
        const isChecked = requiredNames.length > 0;

        // Without an inventory, say what could not be checked and let the agent run.
        if (!inventory) {
            const uncheckedText = isChecked
                ? ` The required tool servers (${requiredNames.join(', ')}) cannot be checked.`
                : '';

            this.addEventEntry('ready', `Agent ready. This harness does not report its tools.${uncheckedText}`);
            return;
        }

        // Keep the servers with the run, then show what the agent got.
        const unconnectedServers = G4AutonomousHarness.getUnconnectedToolServers(requiredNames, inventory);
        const isMissingServer = unconnectedServers.length > 0;
        const inventoryText = G4AutonomousHarness.getInventoryText(inventory);

        const entryKind = isMissingServer
            ? 'error'
            : 'ready';

        this.setState({ ...this._state, toolServers: inventory.toolServers.map((server) => ({ ...server })) });
        this.addEventEntry(entryKind, inventoryText);

        // Every required server connected, so the agent keeps running.
        if (!isMissingServer) {
            return;
        }

        // A required server is missing: stop the agent before it works blind, and say how to fix it.
        const serverTexts = unconnectedServers.map((server) => `"${server.name}" (${server.status})`);
        const isOneServer = unconnectedServers.length === 1;
        const subjectText = isOneServer
            ? `The agent's required tool server ${serverTexts[0]} did not connect`
            : `The agent's required tool servers ${serverTexts.join(', ')} did not connect`;
        const remedyText = isOneServer
            ? 'Start it (for example the G4 Hub or the recorder), then run again.'
            : 'Start them (for example the G4 Hub or the recorder), then run again.';

        // Keep the reason, so getOutcome and getOutcomeMessage report the run as failed with it.
        this._toolServerFailure = `${subjectText}. ${remedyText}`;
        this._logger.warning(`Autonomous run: ${this._toolServerFailure}`);

        // Show the stop on the page, then stop the agent; finishRun records the outcome when it exits.
        this.setState({ ...this._state, message: 'Stopping the agent: a required tool server is missing.', phase: 'stopping' });
        void this._process?.stop();
    }

    /**
     * Adds one agent event to the history and tells the listeners.
     *
     * @param event - The agent event.
     */
    private addEvent(event: AutonomousAgentEvent): void {
        // Remember the session and the result; they are not shown as lines.
        if (event.kind === 'session') {
            const isFirstSession = this._state.sessionId.length === 0 && event.text.length > 0;

            if (isFirstSession) {
                this.setState({ ...this._state, sessionId: event.text });
            }

            // A harness that never reports its tools is announced on its first session, so the console
            // says the required tool servers are not checked.
            const isUnreportedStart = !this._isAgentReady && this._harness?.type !== 'claude';

            if (isUnreportedStart) {
                this.addAgentReadyEvent(undefined);
            }

            return;
        }

        // The agent's start is checked against the required tool servers once, then shown as a line.
        if (event.kind === 'ready') {
            this.addAgentReadyEvent(event.inventory);
            return;
        }

        if (event.kind === 'result') {
            this._lastResultEvent = event;
        }

        if (event.kind === 'error') {
            this._lastErrorText = event.text;
        }

        // A result without text has nothing to show.
        if (event.text.length === 0) {
            return;
        }

        this.addEventEntry(event.kind, event.text);
    }

    /**
     * Keeps one console line in the bounded history and tells the listeners.
     *
     * @param kind - What the line reports.
     * @param text - The line text.
     */
    private addEventEntry(kind: AutonomousAgentEventKind, text: string): void {
        // Keep the history bounded, then tell the page.
        const entry: AutonomousRunEventEntry = { kind, text, time: new Date().toISOString() };

        this._events.push(entry);

        if (this._events.length > EVENT_HISTORY_LIMIT) {
            this._events.splice(0, this._events.length - EVENT_HISTORY_LIMIT);
        }

        this.sendChange({ entry, kind: 'event' });
    }

    /**
     * Stops every recording the agent left open, saves what it recorded, and marks those scenarios aborted.
     *
     * @remarks
     * Runs only after the agent has ended, so the ledger has no other writer. A recording that cannot be
     * stopped (the Hub lost the session) is marked aborted with the Hub's reason.
     *
     * @param runFolder - The run folder.
     * @param hubUrl - The G4 Hub base URL.
     */
    private async closeOpenRecordings(runFolder: string, hubUrl: string): Promise<void> {
        // Read the latest ledger; the agent cannot change it any more.
        const ledgerPath = path.join(runFolder, 'scenarios.json');
        const ledgerText = await fsPromises.readFile(ledgerPath, 'utf8').catch(() => '');
        const scenarios = G4AutonomousRunService.convertFromLedgerText(ledgerText);
        const openScenarios = scenarios.filter((scenario) => {
            const isOpenScenario = scenario.recording === 'recording' && scenario.sessionId.length > 0;

            return isOpenScenario;
        });

        if (openScenarios.length === 0) {
            return;
        }

        // Stop each open recording and keep what it captured.
        const client = new G4RecordingsClient(hubUrl);

        for (const scenario of openScenarios) {
            scenario.recording = 'aborted';
            scenario.stoppedAt = new Date().toISOString();
            scenario.error = 'The run ended while this scenario was recording; the extension stopped the recording.';

            try {
                const automation = await client.stopRecording(scenario.sessionId);

                if (automation !== undefined) {
                    const flowFolder = path.join(runFolder, scenario.folder);
                    await fsPromises.mkdir(flowFolder, { recursive: true });
                    await fsPromises.writeFile(path.join(flowFolder, 'flow.json'), `${JSON.stringify(automation, null, 2)}\n`, 'utf8');
                    scenario.flowPath = `${scenario.folder}/flow.json`;
                }
            } catch (error: unknown) {
                scenario.error = `The run ended while this scenario was recording, and the recording could not be stopped: ${Utilities.resolveErrorMessage(error)}`;
            }

            this._logger.warning(`Autonomous run: closed the open recording of scenario "${scenario.name}".`);
        }

        // Write the ledger back in the helper's shape.
        await G4AutonomousRunService.writeJsonFile(ledgerPath, { scenarios, version: 1 });
        this.updateScenarios(scenarios);
    }

    /**
     * Closes the run: stops its timers, closes open recordings, writes the final files, and reports the outcome.
     *
     * @param exitCode - The agent's exit code, or null when it was killed or never started.
     * @param startFailure - Why the run could not start; empty when the agent ran.
     */
    private async finishRun(exitCode: number | null, startFailure = ''): Promise<void> {
        // Stop following the agent.
        clearInterval(this._ledgerTimer);
        clearTimeout(this._timeoutTimer);
        this._ledgerTimer = undefined;
        this._timeoutTimer = undefined;
        this._process = undefined;

        // Resolve where the run lives and which Hub holds its recordings.
        const runFolder = this._state.runFolder;
        const hubUrl = Utilities.getG4Endpoint() || DEFAULT_HUB_URL;

        // Close recordings the agent left open, then read the final ledger.
        if (startFailure.length === 0) {
            await this.closeOpenRecordings(runFolder, hubUrl).catch((error: unknown) => {
                this._logger.error(`Autonomous run: could not close open recordings: ${Utilities.resolveErrorMessage(error)}`);
            });
            await this.readLedger();
        }

        // Keep the final answer next to the flows; Codex writes this file itself.
        const finalText = this._lastResultEvent?.fullText ?? '';

        if (finalText.length > 0) {
            await fsPromises.writeFile(path.join(runFolder, FINAL_MESSAGE_FILE_NAME), `${finalText}\n`, 'utf8').catch(() => undefined);
        }

        // Decide the outcome and explain it.
        const outcome = this.getOutcome(exitCode, startFailure);
        const message = this.getOutcomeMessage(outcome, exitCode, startFailure);
        const finishedState: AutonomousRunState = {
            ...this._state,
            finishedAt: new Date().toISOString(),
            message,
            outcome,
            phase: 'finished'
        };

        // Write the run summary, then tell the page.
        await G4AutonomousRunService.writeJsonFile(path.join(runFolder, 'run.json'), {
            ...finishedState,
            exitCode,
            scenarios: G4AutonomousRunService.getScenarioTotals(this._scenarios)
        }).catch(() => undefined);

        this._logger.information(`Autonomous run finished (${outcome}): ${message}`);
        this.setState(finishedState);
    }

    /**
     * Explains why the agent failed, from the most to the least specific source.
     *
     * @param exitCode - The agent's exit code, or null.
     * @returns The agent's own error, its last error event, its last standard error line, or the exit code.
     */
    private getFailureReason(exitCode: number | null): string {
        // The harness's own failed result says the most.
        const resultEvent = this._lastResultEvent;
        const isResultError = resultEvent?.isError === true && resultEvent.text.length > 0;

        if (isResultError) {
            return resultEvent.text;
        }

        // Then the last error the agent reported, then the last line it wrote to standard error.
        if (this._lastErrorText.length > 0) {
            return this._lastErrorText;
        }

        const lastStderrLine = this._stderrTail.at(-1) ?? '';

        if (lastStderrLine.length > 0) {
            return lastStderrLine;
        }

        // Without any message, the exit code is all there is.
        const exitCodeText = exitCode === null
            ? 'none'
            : `${exitCode}`;

        return `the agent exited with code ${exitCodeText}`;
    }

    /**
     * Decides how the run ended.
     *
     * @param exitCode - The agent's exit code, or null.
     * @param startFailure - Why the run could not start; empty when the agent ran.
     * @returns The outcome.
     */
    private getOutcome(exitCode: number | null, startFailure: string): AutonomousRunOutcome {
        // A run that could not start, or lacked a required tool server, failed whatever the agent's exit code.
        const isFailedEarly = startFailure.length > 0 || this._toolServerFailure.length > 0;

        if (isFailedEarly) {
            return 'failed';
        }

        if (this._isTimedOut) {
            return 'timedOut';
        }

        if (this._isStopRequested) {
            return 'stopped';
        }

        const isCompleted = exitCode === 0 && this._lastResultEvent?.isError !== true;

        return isCompleted
            ? 'completed'
            : 'failed';
    }

    /**
     * Explains the outcome in one sentence for the page and the log.
     *
     * @param outcome - The outcome.
     * @param exitCode - The agent's exit code, or null.
     * @param startFailure - Why the run could not start; empty when the agent ran.
     * @returns The explanation.
     */
    private getOutcomeMessage(outcome: AutonomousRunOutcome, exitCode: number | null, startFailure: string): string {
        const totals = G4AutonomousRunService.getScenarioTotals(this._scenarios);
        const totalsText = `${totals.saved} of ${totals.total} scenario flows saved`;

        switch (outcome) {
            case 'completed':
                return `The agent finished: ${totalsText}.`;

            case 'stopped':
                return `The run was stopped: ${totalsText}.`;

            case 'timedOut':
                return `The run reached its time limit and was stopped: ${totalsText}.`;

            default: {
                if (startFailure.length > 0) {
                    return startFailure;
                }

                // A missing required tool server explains the failure better than the agent's exit code.
                if (this._toolServerFailure.length > 0) {
                    return this._toolServerFailure;
                }

                return `The run failed (${this.getFailureReason(exitCode)}): ${totalsText}.`;
            }
        }
    }

    /**
     * Counts the scenarios by how they ended.
     *
     * @remarks
     * Compute-only.
     *
     * @param scenarios - The ledger scenarios.
     * @returns The totals.
     */
    private static getScenarioTotals(scenarios: AutonomousScenario[]): AutonomousScenarioTotals {
        return {
            failed: scenarios.filter((scenario) => scenario.result === 'failed').length,
            passed: scenarios.filter((scenario) => scenario.result === 'passed').length,
            saved: scenarios.filter((scenario) => scenario.flowPath.length > 0).length,
            total: scenarios.length
        };
    }

    /**
     * Explains why a run cannot start, or returns an empty string when it can.
     *
     * @param options - The chosen harness, the picked recorders, and the request.
     * @returns The reason, or an empty string.
     */
    private getStartIssue(options: StartIssueOptions): string {
        const { harness, recorders, request } = options;

        // One run at a time, and never next to a manual recording: both would hold the same recorders.
        if (this.isRunning) {
            return 'An autonomous run is already running.';
        }

        if (this._recordingService.isRecording) {
            return 'A manual recording is running. Stop it before starting an autonomous run.';
        }

        // The harness, model, and effort must be ones the manifest offers.
        if (!harness) {
            return `The harness "${request.harnessName}" is not configured in the G4 settings.`;
        }

        const isModelUnknown = harness.models.length > 0 && !harness.models.includes(request.model);
        const isEffortUnknown = harness.efforts.length > 0 && !harness.efforts.includes(request.effort);

        if (isModelUnknown) {
            return `The model "${request.model}" is not offered by the harness "${harness.name}".`;
        }

        if (isEffortUnknown) {
            return `The effort "${request.effort}" is not offered by the harness "${harness.name}".`;
        }

        // The run needs recorders, a prompt, and a workspace for its run folder.
        if (recorders.length === 0) {
            return 'Pick at least one recorder that is configured in the G4 settings.';
        }

        if (request.prompt.trim().length === 0) {
            return 'Describe what the agent should explore and record.';
        }

        if (request.workspaceFolder.length === 0) {
            return 'Open a G4 project folder before starting an autonomous run.';
        }

        return '';
    }

    /**
     * Creates an empty run state.
     *
     * @returns The idle state.
     */
    private static newIdleState(): AutonomousRunState {
        return {
            effort: '',
            finishedAt: '',
            harnessName: '',
            isSandbox: false,
            message: '',
            model: '',
            outcome: '',
            phase: 'idle',
            recorderNames: [],
            runFolder: '',
            sessionId: '',
            startedAt: '',
            toolServers: []
        };
    }

    /**
     * Creates the run folder: a timestamp under the runs folder, made unique when two runs start in the same second.
     *
     * @param runsFolder - The absolute runs folder.
     * @returns The absolute run folder, created.
     */
    private static async newRunFolder(runsFolder: string): Promise<string> {
        // Name the folder by the local start time, sortable and readable.
        const now = new Date();
        const convertToTwoDigitText = (value: number): string => `${value}`.padStart(2, '0');
        const month = convertToTwoDigitText(now.getMonth() + 1);
        const day = convertToTwoDigitText(now.getDate());
        const hours = convertToTwoDigitText(now.getHours());
        const minutes = convertToTwoDigitText(now.getMinutes());
        const seconds = convertToTwoDigitText(now.getSeconds());
        const date = `${now.getFullYear()}${month}${day}`;
        const time = `${hours}${minutes}${seconds}`;
        const baseName = `${date}-${time}`;

        // Add a counter when the name is taken; mkdir without recursive fails on an existing folder.
        await fsPromises.mkdir(runsFolder, { recursive: true });

        for (let attempt = 1; ; attempt++) {
            const folderName = attempt === 1 ? baseName : `${baseName}-${attempt}`;
            const runFolder = path.join(runsFolder, folderName);

            try {
                await fsPromises.mkdir(runFolder);
                return runFolder;
            } catch (error: unknown) {
                const isTaken = (error as NodeJS.ErrnoException)?.code === 'EEXIST';

                if (!isTaken) {
                    throw error;
                }
            }
        }
    }

    /**
     * Reads the scenario ledger and tells the listeners when it changed.
     */
    private async readLedger(): Promise<void> {
        // Read the ledger; a file that is being replaced reads as empty and is tried again next time.
        const ledgerPath = path.join(this._state.runFolder, 'scenarios.json');
        const ledgerText = await fsPromises.readFile(ledgerPath, 'utf8').catch(() => '');

        // An unchanged or unreadable ledger keeps the scenarios the page already shows.
        const isLedgerUnchanged = ledgerText.length === 0 || ledgerText === this._ledgerText;

        if (isLedgerUnchanged) {
            return;
        }

        this._ledgerText = ledgerText;
        this.updateScenarios(G4AutonomousRunService.convertFromLedgerText(ledgerText));
    }

    /**
     * Clears what the previous run left behind.
     */
    private resetRun(): void {
        this._events = [];
        this._harness = undefined;
        this._isAgentReady = false;
        this._isStopRequested = false;
        this._isTimedOut = false;
        this._lastErrorText = '';
        this._lastResultEvent = undefined;
        this._ledgerText = '';
        this._scenarios = [];
        this._stderrTail = [];
        this._toolServerFailure = '';

        this.sendChange({ kind: 'scenarios', scenarios: [] });
    }

    /**
     * Sends a change to every listener; a failing listener does not stop the others.
     *
     * @param change - The change.
     */
    private sendChange(change: AutonomousRunChange): void {
        for (const listener of this._listeners) {
            try {
                listener(change);
            } catch (error: unknown) {
                this._logger.warning(`Autonomous run: a listener failed: ${Utilities.resolveErrorMessage(error)}`);
            }
        }
    }

    /**
     * Replaces the run state and tells the listeners.
     *
     * @param state - The new state.
     */
    private setState(state: AutonomousRunState): void {
        this._state = state;
        this.sendChange({ kind: 'state', state: { ...state } });
    }

    /**
     * Starts the harness with the brief and follows it until it ends.
     *
     * @remarks
     * Output lines go to `events.jsonl` unchanged and become page events; standard error goes to
     * `stderr.log`. The ledger is read every second and the time limit is armed. When the process
     * ends, {@link finishRun} closes the run.
     *
     * @param options - The harness, the manifest, the request, the run folder, and the time limit.
     */
    private startAgent(options: StartAgentOptions): void {
        const { harness, manifest, request, runFolder, timeoutMinutes } = options;

        // Build the command line and the environment; the authentication travels only in the environment.
        const argumentsList = G4AutonomousHarness.getArguments({
            effort: request.effort,
            extraArguments: harness.arguments,
            model: request.model,
            runFolder,
            type: harness.type
        });
        const authentication = manifest?.authentication ?? { token: '' };
        const environment: NodeJS.ProcessEnv = {
            ...process.env,
            [AUTHENTICATION_VARIABLE]: JSON.stringify(authentication),
            G4_AUTONOMOUS_RUN_FOLDER: runFolder
        };

        // Refuse an argument a launcher cannot pass on before any file is opened.
        G4AutonomousProcess.getInvocation(harness.executable, argumentsList);

        // Keep the raw output and the error output next to the flows.
        const eventsStream = fs.createWriteStream(path.join(runFolder, 'events.jsonl'), { encoding: 'utf8' });
        const stderrStream = fs.createWriteStream(path.join(runFolder, 'stderr.log'), { encoding: 'utf8' });
        const agentProcess = new G4AutonomousProcess();

        // Flushes both output files, then closes the run with the agent's exit code.
        const onAgentExited = async (exitCode: number | null): Promise<void> => {
            await Promise.all([
                new Promise((resolve) => eventsStream.end(resolve)),
                new Promise((resolve) => stderrStream.end(resolve))
            ]);
            await this.finishRun(exitCode);
        };

        this._harness = harness;
        this._process = agentProcess;

        agentProcess.start({
            argumentsList,
            environment,
            executable: harness.executable,
            inputText: fs.readFileSync(path.join(runFolder, 'brief.md'), 'utf8'),
            onError: (message) => {
                this._lastErrorText = message;
                this._logger.error(`Autonomous run: ${message}`);
            },
            onErrorLine: (line) => {
                // Keep every error line on disk and the last few in memory to explain a failure.
                stderrStream.write(`${line}\n`);
                this._stderrTail.push(line);
                this._stderrTail.splice(0, Math.max(0, this._stderrTail.length - STDERR_TAIL_LIMIT));
            },
            onOutputLine: (line) => {
                // Keep the raw line on disk, then turn it into page events.
                eventsStream.write(`${line}\n`);
                G4AutonomousHarness.convertFromOutputLine(harness.type, line).forEach((event) => this.addEvent(event));
            },
            workingDirectory: runFolder
        });

        // Log where and how the agent runs, without the prompt, then show the page that it runs.
        const placeText = harness.isSandbox
            ? 'sandbox'
            : 'this machine';
        const modelText = request.model || '(default)';
        const effortText = request.effort || '(default)';

        this._logger.information(
            `Autonomous run started with ${harness.name} (${placeText}), model ${modelText}, effort ${effortText}, in ${runFolder}.`);
        this.setState({ ...this._state, message: 'The agent is running.', phase: 'running' });

        // Follow the ledger and arm the time limit.
        this._ledgerTimer = setInterval(() => {
            void this.readLedger();
        }, LEDGER_POLL_MILLISECONDS);

        this._timeoutTimer = setTimeout(() => {
            this._isTimedOut = true;
            this._logger.warning(`Autonomous run: the ${timeoutMinutes}-minute time limit was reached; stopping the agent.`);
            void agentProcess.stop();
        }, timeoutMinutes * MILLISECONDS_PER_MINUTE);

        // Close the run when the agent ends, after its output streams are flushed.
        void agentProcess.exited.then(onAgentExited);
    }

    /**
     * Replaces the scenarios and tells the listeners.
     *
     * @param scenarios - The scenarios; a detached copy is stored, so the caller's list can change freely.
     */
    private updateScenarios(scenarios: AutonomousScenario[]): void {
        this._scenarios = structuredClone(scenarios);
        this.sendChange({ kind: 'scenarios', scenarios: [...this._scenarios] });
    }

    /**
     * Writes a value as indented JSON, through a temporary file so a reader never sees half of it.
     *
     * @param filePath - The target file.
     * @param value - The value.
     */
    private static async writeJsonFile(filePath: string, value: unknown): Promise<void> {
        const temporaryPath = `${filePath}.tmp`;

        await fsPromises.writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
        await fsPromises.rename(temporaryPath, filePath);
    }

    /**
     * Writes the files the agent starts from: the recording request, the helper, an empty ledger, the brief,
     * and a first run summary.
     *
     * @remarks
     * The recording request holds the picked recorders in the shape the Hub reads (scripts left out, as for
     * a manual recording) and excludes this VS Code instance from recording. It never holds the
     * authentication.
     *
     * @param options - The Hub URL, the picked recorders, the request, and the run folder.
     */
    private async writeRunFolder(options: WriteRunFolderOptions): Promise<void> {
        const { hubUrl, recorders, request, runFolder } = options;

        // Exclude this VS Code instance, so clicks on it never enter a flow.
        const selfProcessIds = await G4RecorderSelfIdentityService.getSelfProcessIds();
        const recordingRequest = {
            hubUrl,
            request: {
                excludedProcessIds: Array.from(selfProcessIds),
                excludedWindowTitles: [DEVELOPMENT_HOST_TITLE],
                recorders: recorders.map((recorder) => ({
                    baseUrl: recorder.baseUrl,
                    driverParameters: recorder.driverParameters,
                    enabled: true,
                    mode: recorder.mode,
                    thinkTimeSettings: recorder.thinkTimeSettings,
                    useOffset: recorder.useOffset
                }))
            }
        };

        // Write the files the helper and the agent read.
        const helperSource = Utilities.getResourcePath(`resources.autonomous/${RECORDER_HELPER_FILE_NAME}`);
        const brief = G4AutonomousBrief.getBriefText({
            prompt: request.prompt,
            recorderNames: recorders.map((recorder) => `${G4AutonomousSettings.getRecorderName(recorder)} at ${recorder.baseUrl}`),
            runFolder
        });

        await G4AutonomousRunService.writeJsonFile(path.join(runFolder, 'recording-request.json'), recordingRequest);
        await fsPromises.copyFile(helperSource, path.join(runFolder, RECORDER_HELPER_FILE_NAME));
        await G4AutonomousRunService.writeJsonFile(path.join(runFolder, 'scenarios.json'), { scenarios: [], version: 1 });
        await fsPromises.writeFile(path.join(runFolder, 'brief.md'), `${brief}\n`, 'utf8');
        await G4AutonomousRunService.writeJsonFile(path.join(runFolder, 'run.json'), { ...this._state });
    }
}

// Compile-time contracts are kept after the executable code: interfaces come before type aliases, and within
// each group a declaration is followed by the contracts it depends on, otherwise the order is A-Z.

/**
 * A run change that carries one new agent event.
 */
export interface AutonomousRunEventChange {
    /** The new event. */
    entry: AutonomousRunEventEntry;

    /** Tells the change apart from the other kinds. */
    kind: 'event';
}

/**
 * A run change that carries the scenarios of the ledger after it changed.
 */
export interface AutonomousRunScenariosChange {
    /** Tells the change apart from the other kinds. */
    kind: 'scenarios';

    /** Every scenario of the ledger, in ledger order. */
    scenarios: AutonomousScenario[];
}

/**
 * Constructor options of the run service.
 */
export interface AutonomousRunServiceOptions {
    /** Logger for the run lifecycle. */
    logger: Logger;

    /** The shared recording service. */
    recordingService: G4RecordingService;
}

/**
 * Everything the run page needs to show the current or last run.
 */
export interface AutonomousRunSnapshot {
    /** The latest agent events, oldest first. */
    events: AutonomousRunEventEntry[];

    /** The scenarios of the run's ledger. */
    scenarios: AutonomousScenario[];

    /** The run state. */
    state: AutonomousRunState;
}

/**
 * One agent event as kept for the page.
 */
export interface AutonomousRunEventEntry {
    /** What the event reports. */
    kind: AutonomousAgentEventKind;

    /** One line of text. */
    text: string;

    /** When the event arrived, as an ISO time. */
    time: string;
}

/**
 * One scenario of the run ledger, as written by the recorder helper.
 */
export interface AutonomousScenario {
    /** Why recording failed or was aborted; empty otherwise. */
    error: string;

    /** The saved flow, relative to the run folder; empty when none was saved. */
    flowPath: string;

    /** The scenario folder, relative to the run folder. */
    folder: string;

    /** The scenario number, from 1. */
    index: number;

    /** The scenario name the agent gave it. */
    name: string;

    /** The agent's note on the result. */
    note: string;

    /** The recording state: planned, recording, saved, empty, failed, or aborted. */
    recording: string;

    /** The agent's verdict: pending, passed, failed, or skipped. */
    result: string;

    /** The number of actions in the saved flow. */
    ruleCount: number;

    /** The Hub session of the latest recording; empty before the first start. */
    sessionId: string;

    /** When the latest recording started, as an ISO time. */
    startedAt: string;

    /** When the latest recording stopped, as an ISO time. */
    stoppedAt: string;
}

/**
 * A run change that carries the new run state.
 */
export interface AutonomousRunStateChange {
    /** Tells the change apart from the other kinds. */
    kind: 'state';

    /** The new state. */
    state: AutonomousRunState;
}

/**
 * The state of the current or last run.
 */
export interface AutonomousRunState {
    /** The reasoning effort the run uses. */
    effort: string;

    /** When the run ended, as an ISO time; empty while it runs. */
    finishedAt: string;

    /** The harness name. */
    harnessName: string;

    /** Whether the harness runs inside a sandbox partition. */
    isSandbox: boolean;

    /** One sentence about the current step or the outcome. */
    message: string;

    /** The model the run uses. */
    model: string;

    /** How the run ended; empty until it does. */
    outcome: AutonomousRunOutcome | '';

    /** Where the run is in its lifecycle. */
    phase: AutonomousRunPhase;

    /** The names of the recorders the agent records with. */
    recorderNames: string[];

    /** The absolute run folder. */
    runFolder: string;

    /** The agent's session id, once the harness reports it. */
    sessionId: string;

    /** When the run started, as an ISO time. */
    startedAt: string;

    /** The agent's tool servers and their states, once a harness reports them; empty otherwise. */
    toolServers: AutonomousToolServer[];
}

/**
 * Scenario counts written to the run summary.
 */
interface AutonomousScenarioTotals {
    /** Scenarios the agent reported as failed. */
    failed: number;

    /** Scenarios the agent reported as passed. */
    passed: number;

    /** Scenarios with a saved flow. */
    saved: number;

    /** All scenarios. */
    total: number;
}

/**
 * Inputs of {@link G4AutonomousRunService.startAgent}.
 */
interface StartAgentOptions {
    /** The harness to start. */
    harness: AutonomousHarness;

    /** The manifest snapshot, read for the authentication. */
    manifest: any;

    /** What the user picked. */
    request: AutonomousRunRequest;

    /** The absolute run folder. */
    runFolder: string;

    /** The time limit, in minutes. */
    timeoutMinutes: number;
}

/**
 * Inputs of {@link G4AutonomousRunService.getStartIssue}.
 */
interface StartIssueOptions {
    /** The harness the user picked; undefined when the settings do not offer it. */
    harness: AutonomousHarness | undefined;

    /** The picked recorders that the manifest configures. */
    recorders: RecorderOptions[];

    /** What the user picked. */
    request: AutonomousRunRequest;
}

/**
 * Inputs of {@link G4AutonomousRunService.writeRunFolder}.
 */
interface WriteRunFolderOptions {
    /** The G4 Hub base URL the helper calls. */
    hubUrl: string;

    /** The picked recorders. */
    recorders: RecorderOptions[];

    /** What the user picked. */
    request: AutonomousRunRequest;

    /** The absolute run folder. */
    runFolder: string;
}

/**
 * What the user picked on the run page.
 */
export interface AutonomousRunRequest {
    /** The reasoning effort; empty for the harness's default. */
    effort: string;

    /** The harness name from the settings. */
    harnessName: string;

    /** The model; empty for the harness's default. */
    model: string;

    /** What the agent should explore and record. */
    prompt: string;

    /** The endpoints of the picked recorders. */
    recorders: string[];

    /** The workspace folder the runs folder is resolved against; empty when none is open. */
    workspaceFolder: string;
}

/** A change of the run, sent to listeners: an agent event, new scenarios, or a new state. */
export type AutonomousRunChange = AutonomousRunEventChange | AutonomousRunScenariosChange | AutonomousRunStateChange;

/** How a run ended. */
export type AutonomousRunOutcome = 'completed' | 'failed' | 'stopped' | 'timedOut';

/** Where a run is in its lifecycle. */
export type AutonomousRunPhase = 'finished' | 'idle' | 'running' | 'starting' | 'stopping';
