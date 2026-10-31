/*
 * Command that starts a recording session on the G4 Hub.
 *
 * RESOURCES:
 * VS Code command API reference: https://code.visualstudio.com/api/references/commands
 */
import * as vscode from 'vscode';

import { G4RecordingsError } from '../clients/g4-recordings-client';

import { CommandBase } from './command-base';

import { Utilities } from '../extensions/utilities';

import { Logger } from '../logging/logger';

import { G4RecorderSandboxService } from '../services/g4-recorder-sandbox-service';
import { G4RecorderScriptService } from '../services/g4-recorder-script-service';
import { G4RecorderSelfIdentityService } from '../services/g4-recorder-self-identity-service';
import { G4RecordingService } from '../services/g4-recording-service';

import type { RecordingStatus } from '../clients/g4-recordings-client';

import type { RecorderOptions } from '../services/g4-recording-service';

/**
 * Registers and runs the **Start-Recorder** command, which starts one recording session on the G4 Hub.
 *
 * @remarks
 * - The command ID is `Start-Recorder` (must match `contributes.commands` in package.json).
 * - The Hub connects to every recorder, buffers its events, launches Chromium browsers, and later builds the
 *   automation; the extension only describes the session.
 * - Work that must happen on this machine stays here: starting sandboxed recorder apps and running each
 *   recorder's pre-script before the session starts.
 */
export class StartRecorderCommand extends CommandBase {
    // Chrome options key that holds the browser's command-line arguments in the recorder's capabilities.
    private static readonly _chromeOptionsKey: string = 'goog:chromeOptions';

    // HTTP status the Hub returns when a requested recorder is already recording in another session.
    private static readonly _conflictStatusCode: number = 409;

    // Window-title fragment of the VS Code Extension Development Host, excluded when its process ids are unknown.
    private static readonly _developmentHostTitle: string = 'Extension Development Host';

    // Chrome command-line switch that lists the browser features to turn off.
    private static readonly _disableFeaturesSwitch: string = '--disable-features=';

    // Chrome feature that runs the network service inside Chrome's app sandbox.
    private static readonly _networkSandboxFeature: string = 'NetworkServiceSandbox';

    /** Dedicated logger instance for this command. */
    private readonly _logger: Logger;

    /**
     * Creates the Start-Recorder command.
     *
     * @param _context - VS Code extension context (lifecycle and subscriptions).
     * @param _recordingService - The shared recording session owner.
     */
    constructor(
        private readonly _context: vscode.ExtensionContext,
        private readonly _recordingService: G4RecordingService
    ) {
        // Initialize base CommandBase members (logger factory, context, endpoint).
        super(_context);

        // Create a dedicated child logger for this command's messages.
        this._logger = this.logger?.newLogger('G4.StartRecorder');

        // Command identifier as used in package.json and when invoking via commands.executeCommand.
        this.command = 'Start-Recorder';
    }

    /**
     * Whether a recording session is currently running.
     *
     * @remarks
     * The settings service reads this to confirm a stop before applying recorder changes.
     */
    public get isRecording(): boolean {
        return this._recordingService.isRecording;
    }

    /**
     * Returns copies of the recorders in which every Chromium recorder starts Chrome with its network sandbox off.
     *
     * @remarks
     * Compute-only: the manifest's recorder objects are never changed, so turning the switch off again restores
     * the plain launch on the next start. A Chromium recorder is any recorder whose driver name contains
     * "chrome", the rule the Hub uses to launch a browser. The feature is merged into an existing
     * `--disable-features=` argument instead of adding a second one, because Chrome reads only one of them;
     * other recorders are returned unchanged.
     *
     * @param recorders - The recorders that will join the session.
     * @returns The recorders to send to the Hub.
     */
    public static addNetworkSandboxSwitch(recorders: RecorderOptions[]): RecorderOptions[] {
        return recorders.map(recorder => {
            // Leave desktop and other non-Chromium recorders exactly as configured.
            const driver: unknown = recorder.driverParameters?.driver;
            const isChromium = typeof driver === 'string' && driver.toLowerCase().includes('chrome');

            if (!isChromium) {
                return recorder;
            }

            // Work on a copy and make sure the Chrome arguments list exists along the whole path.
            const driverParameters = structuredClone(recorder.driverParameters ?? {});
            const capabilities = driverParameters.capabilities ??= {};
            const alwaysMatch = capabilities.alwaysMatch ??= {};
            const chromeOptions = alwaysMatch[StartRecorderCommand._chromeOptionsKey] ??= {};
            const argumentsList: unknown[] = Array.isArray(chromeOptions.args) ? chromeOptions.args : [];

            // Add the feature to the existing disable-features argument, or append a new argument when none exists.
            const switchPrefix = StartRecorderCommand._disableFeaturesSwitch;
            const feature = StartRecorderCommand._networkSandboxFeature;
            const switchIndex = argumentsList.findIndex(argument =>
                typeof argument === 'string' && argument.startsWith(switchPrefix));

            if (switchIndex < 0) {
                argumentsList.push(`${switchPrefix}${feature}`);
            } else {
                const features = (argumentsList[switchIndex] as string)
                    .substring(switchPrefix.length)
                    .split(',')
                    .filter(name => name.length > 0);
                const mergedFeatures = features.includes(feature) ? features : [...features, feature];

                argumentsList[switchIndex] = `${switchPrefix}${mergedFeatures.join(',')}`;
            }

            // Store the arguments on the copy and hand back a recorder that shares nothing mutable with the manifest.
            chromeOptions.args = argumentsList;

            return { ...recorder, driverParameters };
        });
    }

    /**
     * Register the VS Code command handler and push the disposable into context.
     * Called by the framework during command lifecycle.
     */
    protected async onRegister(): Promise<void> {
        // Register the command and bind it to invokeCommand.
        const disposable = vscode.commands.registerCommand(
            this.command,
            async (commandOptions: StartRecorderCommandOptions) => {
                await this.invokeCommand(commandOptions);
            },
            this
        );

        // Ensure disposal happens when the extension deactivates.
        this.context.subscriptions.push(disposable);
    }

    /**
     * Command execution entry point: starts sandboxed recorders when requested, runs pre-scripts, and asks the
     * Hub to start a session for every recorder whose pre-script did not fail.
     *
     * @param commandOptions - Optional arguments from the recorder panel.
     */
    protected async onInvokeCommand(commandOptions?: StartRecorderCommandOptions): Promise<void> {
        // A second session would fail on the Hub because the recorders are reserved, so explain it here.
        if (this._recordingService.isRecording) {
            const runningMessage = 'A recording session is already running. Stop it before starting a new one.';
            vscode.window.showWarningMessage(runningMessage);
            return;
        }

        // Nothing can be recorded without an enabled recorder in the manifest.
        const recorders = this._recordingService.recorders;

        if (recorders.length === 0) {
            vscode.window.showWarningMessage('No recorder is enabled. Enable a recorder in the G4 settings first.');
            return;
        }

        // Start sandboxed recorder processes before the Hub connects when the user enabled sandbox mode.
        await this.startSandboxRecordersWhenRequired(recorders, commandOptions);

        // Run each recorder's pre-script on this machine; a failed pre-script keeps that recorder out of the session.
        const startedRecorders = await this.invokePreScripts(recorders);

        if (startedRecorders.length === 0) {
            vscode.window.showWarningMessage('No recorder started because every pre-script failed.');
            return;
        }

        // Turn Chrome's network sandbox off for the Chromium recorders when the manifest or the panel asks for it,
        // for machines where that sandbox cannot start and every recorder page stays blank.
        const isNetworkSandboxDisabled = StartRecorderCommand.testNetworkSandboxDisabled(commandOptions);
        const sessionRecorders = isNetworkSandboxDisabled
            ? StartRecorderCommand.addNetworkSandboxSwitch(startedRecorders)
            : startedRecorders;

        if (isNetworkSandboxDisabled) {
            this._logger.information('Chrome network sandbox is off for the Chromium recorders of this session.');
        }

        // Ask the Hub to start the session; it reports each recorder's connection outcome.
        await this.startSession(sessionRecorders);
    }

    /**
     * Runs the pre-script of every enabled recorder and returns the recorders that may start.
     *
     * @remarks
     * Blocking and abort-on-failure: each pre-script is awaited, and a script that runs and fails (non-zero
     * exit or timeout) keeps its recorder out of the session. A disabled or empty pre-script never blocks.
     * Failures are isolated per recorder, so one failed pre-script never blocks the others.
     *
     * @param recorders - The enabled recorders from the manifest.
     * @returns The recorders whose pre-script succeeded or did not run.
     */
    private async invokePreScripts(recorders: RecorderOptions[]): Promise<RecorderOptions[]> {
        const startedRecorders: RecorderOptions[] = [];

        for (const recorder of recorders) {
            // Run the pre-script and wait for its outcome before the recorder joins the session.
            const result = await G4RecorderScriptService.runRecorderScript({
                phase: 'pre',
                configuration: recorder.preScript,
                baseUrl: recorder.baseUrl,
                mode: recorder.mode,
                driverParameters: recorder.driverParameters,
                logger: this._logger
            });

            // Only an executed-and-failed pre-script excludes the recorder; a skipped one does nothing.
            const isPreScriptFailed = result.isExecuted && !result.isSuccess;

            if (isPreScriptFailed) {
                const warning = `Pre-script failed for recorder ${recorder.baseUrl}; this recorder will not start.`;
                this._logger.warning(warning);
                vscode.window.showWarningMessage(warning);
                continue;
            }

            startedRecorders.push(recorder);
        }

        return startedRecorders;
    }

    /**
     * Builds the G4 authentication sent to the Hub, which exports it unchanged into the recorded flow.
     *
     * @remarks
     * Compute-only over the manifest snapshot. A detached copy is returned so a later manifest refresh cannot
     * change the request; a missing or malformed section yields an empty token, the shell the flow expects.
     *
     * @returns The authentication object for the start request.
     */
    private static newAuthentication(): any {
        const authentication = Utilities.getManifest()?.authentication;
        const isAuthenticationObject = authentication !== null
            && typeof authentication === 'object'
            && !Array.isArray(authentication);

        return isAuthenticationObject
            ? structuredClone(authentication)
            : { token: '' };
    }

    /**
     * Reports recorders that the Hub could not start in a session that otherwise started.
     *
     * @remarks
     * A partial start keeps the session with the recorders that connected, so each failure is shown once
     * and the session continues.
     *
     * @param status - The status returned by the Hub's start.
     */
    private showRecorderErrors(status: RecordingStatus): void {
        const failedRecorders = (status.recorders ?? []).filter(recorder => typeof recorder.error === 'string');

        for (const recorder of failedRecorders) {
            const warning = `Recorder ${recorder.baseUrl} did not start: ${recorder.error}`;
            this._logger.warning(warning);
            vscode.window.showWarningMessage(warning);
        }
    }

    /**
     * Starts sandboxed recorder services when the manifest or panel override enables sandbox use.
     *
     * @remarks
     * Intentionally command-owned: extension activation never starts recorder services; the recorder process
     * check only runs after the user starts recording.
     *
     * @param recorders - The enabled recorders from the manifest.
     * @param commandOptions - Optional command arguments from the recorder panel.
     */
    private async startSandboxRecordersWhenRequired(
        recorders: RecorderOptions[],
        commandOptions?: StartRecorderCommandOptions
    ): Promise<void> {
        // Resolve the effective sandbox setting, letting the recorder panel override the manifest in memory.
        const manifest = Utilities.getManifest();
        const isManifestSandbox = manifest?.settings?.recorderSettings?.useSandbox === true;
        const sandboxOverride = commandOptions?.useSandbox;
        const isOverrideConfigured = sandboxOverride !== null && sandboxOverride !== undefined;
        const isSandbox = isOverrideConfigured
            ? sandboxOverride === true
            : isManifestSandbox;

        if (!isSandbox) {
            return;
        }

        // Ask the sandbox service to ping and start each recorder endpoint before the Hub connects to it.
        const results = await G4RecorderSandboxService.startFromOptionsWhenRequired({
            recorders,
            sandboxPath: manifest?.sandbox
        });

        // Surface sandbox failures as VS Code warnings so the user sees why recording may not connect.
        const shownWarnings = new Set<string>();

        for (const result of results) {
            const warningMessage = result.message ?? '';
            const isWarningNeeded = !result.isReady && warningMessage.length > 0;
            const isAlreadyShown = shownWarnings.has(warningMessage);

            // Avoid repeating the same warning when several recorders share the same failure.
            if (!isWarningNeeded || isAlreadyShown) {
                continue;
            }

            shownWarnings.add(warningMessage);
            this._logger.warning(warningMessage);
            vscode.window.showWarningMessage(warningMessage);
        }
    }

    /**
     * Starts the Hub session for the recorders that passed their pre-scripts.
     *
     * @remarks
     * Excludes this VS Code instance's windows by process id, plus the Extension Development Host title as a
     * fallback, so clicks on the recorder panel never enter the flow. A start the Hub rejects leaves the
     * service idle and is reported to the user with the Hub's own explanation.
     *
     * @param recorders - The recorders to start.
     */
    private async startSession(recorders: RecorderOptions[]): Promise<void> {
        // Resolve this VS Code instance's process family so the Hub can drop events from its windows.
        const selfProcessIds = await G4RecorderSelfIdentityService.getSelfProcessIds();

        try {
            this._logger.information(`Starting a recording session for ${recorders.length} recorder(s).`);

            const status = await this._recordingService.startRecording({
                authentication: StartRecorderCommand.newAuthentication(),
                excludedProcessIds: Array.from(selfProcessIds),
                excludedWindowTitles: [StartRecorderCommand._developmentHostTitle],
                recorders
            });

            // A partial start keeps the session; report the recorders that did not connect.
            this.showRecorderErrors(status);
            this._logger.information(`Recording session ${status.id} started.`);
        } catch (error: unknown) {
            // Explain a reserved recorder specifically, and every other failure with the Hub's message.
            const isConflict = error instanceof G4RecordingsError
                && error.statusCode === StartRecorderCommand._conflictStatusCode;
            const reason = Utilities.resolveErrorMessage(error);
            const message = isConflict
                ? `A recorder is already recording in another session: ${reason}`
                : `Failed to start recording: ${reason}`;

            this._logger.error(message);
            vscode.window.showErrorMessage(message);
        }
    }

    /**
     * Tests whether this start turns Chrome's network sandbox off for the Chromium recorders.
     *
     * @remarks
     * Compute-only over the manifest snapshot: the recorder panel's in-memory switch wins when it was sent,
     * otherwise `settings.recorderSettings.disableChromeNetworkSandbox` decides; a missing value means off.
     *
     * @param commandOptions - Optional command arguments from the recorder panel.
     * @returns True when the network sandbox must be turned off.
     */
    private static testNetworkSandboxDisabled(commandOptions?: StartRecorderCommandOptions): boolean {
        // Prefer the panel's switch, which is never written back to the manifest.
        const override = commandOptions?.disableChromeNetworkSandbox;
        const isOverrideConfigured = override !== null && override !== undefined;

        if (isOverrideConfigured) {
            return override === true;
        }

        // Fall back to the manifest setting, which is off unless set to true.
        const recorderSettings = Utilities.getManifest()?.settings?.recorderSettings;

        return recorderSettings?.disableChromeNetworkSandbox === true;
    }
}

// Compile-time contracts are kept after the executable code: interfaces come before type aliases, and within
// each group a declaration is followed by the contracts it depends on, otherwise the order is A-Z.

/**
 * Optional Start-Recorder command arguments sent by the recorder panel.
 */
type StartRecorderCommandOptions = {
    /**
     * Memory-only switch from the recorder panel that turns Chrome's network sandbox off for this start; absent
     * when the command runs from the palette, so the manifest setting applies.
     */
    disableChromeNetworkSandbox?: boolean;

    /** Memory-only sandbox override selected in the recorder panel. */
    useSandbox?: boolean;
};
