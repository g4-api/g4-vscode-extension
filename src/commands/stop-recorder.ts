/*
 * Command that stops the G4 Hub recording session and opens the recorded workflow.
 *
 * RESOURCES:
 * VS Code command API reference: https://code.visualstudio.com/api/references/commands
 */
import * as vscode from 'vscode';

import { CommandBase } from './command-base';
import { ShowWorkflowCommand } from './show-workflow';

import { showTemporaryInformationMessage } from '../extensions/notification-utilities';
import { Utilities } from '../extensions/utilities';

import { Logger } from '../logging/logger';

import { G4RecorderScriptService } from '../services/g4-recorder-script-service';
import { G4RecordingService } from '../services/g4-recording-service';

import type { RecordingJob } from '../clients/g4-recordings-client';

import type {
    RecorderOptions,
    RecorderScriptOptions
} from '../services/g4-recording-service';

/**
 * Registers and runs the **Stop-Recorder** command, which stops the Hub session and opens its workflow.
 *
 * @remarks
 * The Hub flushes every recorder, converts the events into a native G4 automation, and closes owned
 * browsers. The extension then applies what only it knows: each recorder's opt-in pre- and post-scripts
 * (placed through the Hub's job-to-recorder map) and the manifest `settings` block. Post-scripts run on this
 * machine after the session stopped, exactly as before.
 */
export class StopRecorderCommand extends CommandBase {
    /** Dedicated logger for this command instance. */
    private readonly _logger: Logger;

    /**
     * Creates the Stop-Recorder command.
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
        this._logger = this.logger?.newLogger('G4.StopRecorder');

        // Command identifier as used in package.json and when invoking via commands.executeCommand.
        this.command = 'Stop-Recorder';
    }

    /**
     * Register the VS Code command handler and push the disposable into context.
     * Called by the framework during command lifecycle.
     */
    protected async onRegister(): Promise<void> {
        // Register the command and bind it to invokeCommand.
        const disposable = vscode.commands.registerCommand(
            this.command,
            async (commandOptions: any) => {
                await this.invokeCommand(commandOptions);
            },
            this
        );

        // Ensure disposal happens when the extension deactivates.
        this.context.subscriptions.push(disposable);
    }

    /**
     * Stops the Hub session, completes and shows the recorded workflow, then runs the post-scripts.
     *
     * @remarks
     * A failed stop leaves the session running (unless the Hub lost it), so the post-scripts run only after a
     * successful stop, when the recorders really stopped capturing.
     */
    protected async onInvokeCommand(_?: any): Promise<void> {
        // Nothing to stop while idle.
        if (!this._recordingService.isRecording) {
            showTemporaryInformationMessage('No recording session is running.');
            return;
        }

        // Keep the session's recorders before stop returns the service to idle; scripts are resolved from them.
        const recorders = this._recordingService.sessionRecorders;

        try {
            // Stop on the Hub, which returns the automation and the recorder of each job.
            const stopped = await this._recordingService.stopRecording();

            // An empty recording has nothing to show.
            const isEmptyRecording = stopped.automation === undefined || stopped.automation === null;

            if (isEmptyRecording) {
                this._logger.information('No recorded events found.');
                showTemporaryInformationMessage('Recording stopped. No recorded events found.');
            } else {
                // Complete the flow with the extension-owned parts, then open it in the workflow viewer.
                StopRecorderCommand.setRecordedScripts({
                    automation: stopped.automation,
                    jobs: stopped.jobs,
                    recorders
                });

                const automation = StopRecorderCommand.newAutomationWithSettings(stopped.automation);
                this.showRecordedWorkflow(automation);
                showTemporaryInformationMessage('Recording stopped.');
            }
        } catch (error: unknown) {
            // Report the Hub's explanation; the session stays available for a retry unless the Hub lost it.
            const message = `Failed to stop recording: ${Utilities.resolveErrorMessage(error)}`;
            this._logger.error(message);
            vscode.window.showErrorMessage(message);
            return;
        }

        // The recorders stopped capturing, so run their post-scripts on this machine.
        await this.invokePostScripts(recorders);
    }

    /**
     * Returns the index of the job's CloseBrowser action, or -1 when it has none.
     *
     * @param rules - The job's rules.
     * @returns The CloseBrowser index, or -1.
     */
    private static getCloseBrowserIndex(rules: any[]): number {
        return rules.findIndex(rule => rule?.pluginName === 'CloseBrowser');
    }

    /**
     * Finds the recorder's first and last job in the Hub's job-to-recorder map.
     *
     * @remarks
     * Compute-only. Endpoints are compared as origins because the Hub reports them normalized.
     *
     * @param jobs - The job map returned with the stopped session.
     * @param baseUrl - The recorder endpoint from the manifest.
     * @returns The first and last job indexes, or undefined when the recorder produced no job.
     */
    private static getRecorderJobRange(jobs: RecordingJob[], baseUrl: string): RecorderJobRange | undefined {
        // Collect this recorder's job positions in flow order.
        const origin = G4RecordingService.convertToOrigin(baseUrl);
        const indexes = jobs
            .filter(job => G4RecordingService.convertToOrigin(job.baseUrl) === origin)
            .map(job => job.index)
            .sort((left, right) => left - right);

        if (indexes.length === 0) {
            return undefined;
        }

        return {
            firstIndex: indexes[0],
            lastIndex: indexes.at(-1) ?? indexes[0]
        };
    }

    /**
     * Runs every session recorder's post-script on this machine after the session stopped.
     *
     * @remarks
     * Failures are surfaced but never block the remaining recorders, since the recorders already stopped and
     * the stop cannot be undone.
     *
     * @param recorders - The recorders that took part in the stopped session.
     */
    private async invokePostScripts(recorders: RecorderOptions[]): Promise<void> {
        // Scripts from the project settings never run in Restricted Mode; a session can only exist
        // there if trust was removed while it ran.
        if (!vscode.workspace.isTrusted) {
            this._logger.warning('Recorder post-scripts were skipped because this folder is not trusted.');
            return;
        }

        for (const recorder of recorders) {
            const result = await G4RecorderScriptService.runRecorderScript({
                phase: 'post',
                configuration: recorder.postScript,
                baseUrl: recorder.baseUrl,
                mode: recorder.mode,
                driverParameters: recorder.driverParameters,
                logger: this._logger
            });

            // Only an executed-and-failed post-script is worth a notification.
            const isPostScriptFailed = result.isExecuted && !result.isSuccess;

            if (isPostScriptFailed) {
                const warning = `Post-script failed for recorder ${recorder.baseUrl}. See the G4 log for details.`;
                vscode.window.showWarningMessage(warning);
            }
        }
    }

    /**
     * Returns a copy of the automation with the manifest `settings` block placed after its driver parameters.
     *
     * @remarks
     * Compute-only. The Hub's flow is client-neutral and carries no settings; the extension adds the
     * project's runtime settings, detached so a later manifest refresh cannot change the open workflow.
     *
     * @param automation - The automation returned by the Hub.
     * @returns A new automation object that also carries the manifest settings.
     */
    private static newAutomationWithSettings(automation: any): any {
        // Read the project's runtime settings; an absent block becomes an empty object, as before.
        const manifestSettings = Utilities.getManifest()?.settings;
        const isSettingsObject = manifestSettings !== null && typeof manifestSettings === 'object';
        const settings = isSettingsObject
            ? structuredClone(manifestSettings)
            : {};

        // Keep the familiar key order: authentication, driver parameters, settings, then stages.
        return {
            authentication: automation.authentication,
            driverParameters: automation.driverParameters,
            settings,
            ...automation
        };
    }

    /**
     * Builds an InvokeScript action from a recorder script, or null when it must not be injected.
     *
     * @remarks
     * Returns null when the script is not opted into the automation flow, is empty, or contains characters
     * that cannot be embedded in the `{{$ --ScriptBlock:...}}` macro (base64 is not yet supported). Newlines
     * are escaped to the two-character sequence so multi-line scripts survive the macro. The shell is
     * informational only (InvokeScript runs in the driver session) and is shown in the display name.
     *
     * @param phase - Whether this is the 'pre' or 'post' recording script.
     * @param scriptConfig - The recorder's script configuration.
     * @returns The InvokeScript rule, or null when the script must be skipped.
     */
    private static newInvokeScriptRule(phase: 'pre' | 'post', scriptConfig: RecorderScriptOptions | undefined): any {
        // Only inject scripts the user explicitly added to the automation flow.
        if (scriptConfig?.addToAutomationFlow !== true) {
            return null;
        }

        // Skip empty scripts; there is nothing to run.
        const script = typeof scriptConfig?.script === 'string' ? scriptConfig.script : '';

        if (script.trim().length === 0) {
            return null;
        }

        // Escape newlines so a multi-line script survives the single-line macro value.
        const scriptBlock = script.replaceAll('\r\n', '\n').replaceAll('\n', String.raw`\n`);

        // Skip scripts the macro cannot carry safely; the settings UI already surfaces this case.
        // TODO: emit a base64 ScriptBlock once InvokeScript supports decoding, to lift this limit.
        if (!StopRecorderCommand.testAutomationSafeScript(scriptBlock)) {
            return null;
        }

        // Compose a readable label carrying the phase and the (informational) shell.
        const phaseLabel = phase === 'pre' ? 'Pre-Recording Script' : 'Post-Recording Script';
        const shell = typeof scriptConfig?.shell === 'string' ? scriptConfig.shell : '';
        const displayName = shell.length > 0 ? `${phaseLabel} (${shell})` : phaseLabel;

        return {
            $type: 'Action',
            pluginName: 'InvokeScript',
            argument: `{{$ --ScriptBlock:${scriptBlock}}}`,
            capabilities: {
                displayName: displayName
            }
        };
    }

    /**
     * Inserts each recorder's opt-in pre- and post-scripts into the jobs the Hub produced for it.
     *
     * @remarks
     * The pre-script becomes the first action of the recorder's first job (the job that launches its
     * driver); the post-script is inserted immediately before the CloseBrowser of the recorder's last job.
     * Scripts that are empty, not flagged "Add to Automation Flow", or unsafe for the macro are skipped. The
     * automation's job rules are mutated in place.
     *
     * @param options - The automation, the Hub's job map, and the session recorders.
     */
    private static setRecordedScripts(options: RecordedScriptsOptions): void {
        const { automation, jobs, recorders } = options;
        const flowJobs: any[] = automation?.stages?.[0]?.jobs ?? [];

        for (const recorder of recorders) {
            // A recorder without events produced no job, so it has nowhere to place its scripts.
            const range = StopRecorderCommand.getRecorderJobRange(jobs, recorder.baseUrl);

            if (range === undefined) {
                continue;
            }

            // Prepend the pre-script to the recorder's first job.
            const firstJob = flowJobs[range.firstIndex];
            const preRule = StopRecorderCommand.newInvokeScriptRule('pre', recorder.preScript);
            const isPreRulePlaced = preRule !== null && Array.isArray(firstJob?.rules);

            if (isPreRulePlaced) {
                firstJob.rules.unshift(preRule);
            }

            // Insert the post-script before CloseBrowser on the recorder's last job, or at its end without one.
            const lastJob = flowJobs[range.lastIndex];
            const postRule = StopRecorderCommand.newInvokeScriptRule('post', recorder.postScript);
            const isPostRulePlaced = postRule !== null && Array.isArray(lastJob?.rules);

            if (isPostRulePlaced) {
                const closeIndex = StopRecorderCommand.getCloseBrowserIndex(lastJob.rules);
                const insertIndex = closeIndex >= 0
                    ? closeIndex
                    : lastJob.rules.length;

                lastJob.rules.splice(insertIndex, 0, postRule);
            }
        }
    }

    /**
     * Displays the completed workflow in the G4 Workflow Viewer.
     *
     * @param automation - The completed automation.
     */
    private showRecordedWorkflow(automation: any): void {
        new ShowWorkflowCommand(this._context, this.endpoint).invokeCommand({
            workflow: automation
        });
    }

    /**
     * Tests whether a script can be safely embedded in a `{{$ --ScriptBlock:...}}` macro value.
     *
     * @remarks
     * The macro closes on `}}`, opens a nested expression on `{{`, and splits arguments on a
     * whitespace-delimited `--<word>`; a script containing any of those cannot be carried until
     * base64 encoding is supported. Newlines are already escaped by the caller and are safe.
     *
     * @param scriptBlock - The newline-escaped script value.
     * @returns True when the value is safe to embed, otherwise false.
     */
    private static testAutomationSafeScript(scriptBlock: string): boolean {
        const isBraceUnsafe = scriptBlock.includes('}}') || scriptBlock.includes('{{');
        const isArgumentUnsafe = /\s--[\w/,.$*]/.test(scriptBlock);

        return !isBraceUnsafe && !isArgumentUnsafe;
    }
}

// Compile-time contracts are kept after the executable code: interfaces come before type aliases, and within
// each group a declaration is followed by the contracts it depends on, otherwise the order is A-Z.

/**
 * Options for placing recorder scripts into a stopped session's automation.
 */
interface RecordedScriptsOptions {
    /** The automation returned by the Hub; its job rules are mutated in place. */
    automation: any;

    /** The Hub's job-to-recorder map for the automation. */
    jobs: RecordingJob[];

    /** The recorders that took part in the session. */
    recorders: RecorderOptions[];
}

/**
 * The first and last job a recorder produced in a stopped session.
 */
interface RecorderJobRange {
    /** Index of the recorder's first job, which receives its pre-script. */
    firstIndex: number;

    /** Index of the recorder's last job, which receives its post-script. */
    lastIndex: number;
}
