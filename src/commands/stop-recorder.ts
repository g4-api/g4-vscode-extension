/*
 * Command to forward notebook automation events via G4 NotificationService.
 *
 * RESOURCES:
 * VS Code command API reference: https://code.visualstudio.com/api/references/commands
 */
import * as vscode from 'vscode';

import { EventCaptureService } from '../clients/g4-signalr-client';

import { CommandBase } from './command-base';
import { ShowWorkflowCommand } from './show-workflow';

import { G4RecorderScriptService } from '../services/g4-recorder-script-service';
import { showTemporaryInformationMessage } from '../extensions/notification-utilities';

import { Logger } from '../logging/logger';

export class StopRecorderCommand extends CommandBase {
    // Alignment emitted with a recorded pointer offset. It must match the origin the recorder
    // measures the offset from (the element's top-left corner), so the InvokeUser32Click plugin
    // anchors the offset there instead of its MiddleCenter default.
    private static readonly _offsetAlignment: string = 'TopLeft';

    // Mapping of keyboard event keys to supported identifiers.
    // This map is used to determine which special keys should be
    // emitted as dedicated actions during recording playback.
    private static readonly _includeKeyboardEventMap: Map<string, string> = new Map<string, string>([
        ['backspace', 'Backspace'],
        ['caps lock', 'Caps Lock'],
        ['delete', 'Delete'],
        ['down', 'Down'],
        ['end', 'End'],
        ['enter', 'Enter'],
        ['esc', 'Esc'],
        ['f1', 'F1'],
        ['f2', 'F2'],
        ['f3', 'F3'],
        ['f4', 'F4'],
        ['f5', 'F5'],
        ['f6', 'F6'],
        ['f7', 'F7'],
        ['f8', 'F8'],
        ['f9', 'F9'],
        ['f10', 'F10'],
        ['f11', 'F11'],
        ['f12', 'F12'],
        ['home', 'Home'],
        ['insert', 'Insert'],
        ['left', 'Left'],
        ['num del', 'Num Del'],
        ['num lock', 'Num Lock'],
        ['page down', 'Page Down'],
        ['page up', 'Page Up'],
        ['pause', 'Pause'],
        ['prnt scrn', 'Prnt Scrn'],
        ['right', 'Right'],
        ['scroll lock', 'Scroll Lock'],
        ['tab', 'Tab'],
        ['up', 'Up']
    ]);

    // Dedicated logger for this command instance.
    private readonly _logger: Logger;

    /**
     * Create a new StopRecorderCommand.
     *
     * @param _context VS Code extension context (lifecycle & subscriptions).
     * @param _connections Map of active EventCaptureService connections.
     */
    constructor(
        private readonly _context: vscode.ExtensionContext,
        private readonly _connections: Map<string, EventCaptureService> = new Map<string, EventCaptureService>(),
    ) {
        // Initialize base CommandBase members (logger factory, context, etc.)
        super(_context);

        // Create a dedicated child logger for this command's messages.
        this._logger = this.logger?.newLogger('G4.StartRecorder');

        // Command identifier as used in package.json and when invoking via commands.executeCommand.
        this.command = 'Stop-Recorder';
    }

    /**
     * Gets the connection pool (read-only map).
     */
    public get connections(): Map<string, EventCaptureService> {
        return this._connections;
    }

    /**
     * Register the VS Code command handler and push the disposable into context.
     * Called by the framework during command lifecycle.
     */
    protected async onRegister(): Promise<void> {
        // Register the command and bind it to invokeCommand.
        const disposable = vscode.commands.registerCommand(
            this.command,
            async (args: any) => {
                await this.invokeCommand(args);
            },
            // `thisArg` ensures `this` inside invokeCommand is this instance
            this
        );

        // Ensure disposal happens when the extension deactivates.
        this.context.subscriptions.push(disposable);
    }

    /**
     * Finalizes the recording process by aggregating captured events from all
     * active connections, building an automation workflow, and displaying it.
     */
    protected async onInvokeCommand(_?: any): Promise<void> {
        // Snapshot and time-order the buffered events, and resolve the connection used for
        // automation-level defaults, before touching (and closing) the connections.
        const buffer = StopRecorderCommand.newSortedBuffer(this._connections);
        const initialConnection = StopRecorderCommand.getFirstCaptureService(this._connections);

        // Build and show the workflow BEFORE stopping the browsers so a slow or failing
        // browser-stop can never prevent the recorded workflow from reaching the canvas. The
        // finally block always stops the browsers and closes the connections afterwards.
        try {
            const automation = this.newRecordedAutomation(buffer, initialConnection);

            if (automation) {
                this.showRecordedWorkflow(automation);
            }
        }
        catch (error: any) {
            this.logger.error(error || 'An unknown error occurred while stopping the recorder.');
        }
        finally {
            await StopRecorderCommand.stopRecorderConnections(this._connections);
        }
    }

    /**
     * Merges every connection's buffered events into one list, tags each with its recorder
     * endpoint, and orders them by capture time so events from different recorders interleave in
     * real order. The event timestamp lives on the inner model (item.value.timestamp), not on the
     * broadcast envelope, so it is read from there.
     */
    private static newSortedBuffer(connections: Map<string, EventCaptureService>): any[] {
        return Array
            .from(connections.values())
            .flatMap(service =>
                service.buffer.map(item => ({
                    ...item,
                    baseUrl: service.options.baseUrl
                }))
            )
            .sort((a, b) => (a?.value?.timestamp || 0) - (b?.value?.timestamp || 0));
    }

    /**
     * Builds the automation workflow from the time-ordered buffer, or returns null (logging why)
     * when there is nothing to build. A single-job recording runs on the automation-level (real)
     * driver directly so exactly one browser opens; a multi-job recording uses a no-op
     * automation-level driver so only the per-job drivers open browsers, avoiding an extra
     * "shadow" browser alongside the job drivers.
     */
    private newRecordedAutomation(buffer: any[], initialConnection: EventCaptureService | undefined): any {
        // Abort building when there is no connection to source automation defaults from.
        if (!initialConnection) {
            this.logger.warning('No active EventCaptureService connections found to stop.');
            return null;
        }

        // Group consecutive events by recorder endpoint.
        const groups = StopRecorderCommand.newBufferGroups(buffer);

        // Abort if no events were recorded.
        if (!groups || groups.length === 0) {
            this.logger.information('No recorded events found in the buffers.');
            return null;
        }

        // A single job inherits the automation-level (real) driver; multiple jobs use a no-op
        // automation-level driver so only the per-job drivers open browsers.
        const isSingleJob = groups.length === 1;
        const automationDriver = isSingleJob
            ? (initialConnection.options.driverParameters || {})
            : { driver: 'NoDriver', driverBinaries: '.' };
        const manifest = this.manifest;
        const automation = StopRecorderCommand.newAutomation(
            manifest,
            StopRecorderCommand.confirmDriverBinaries(automationDriver)
        );

        // Precompute the last group index per endpoint (only the final job closes its browser) and
        // track the launch job index per endpoint (later jobs mount it via "Job(N)").
        const lastIndexByBaseUrl = StopRecorderCommand.newLastIndexByBaseUrl(groups);
        const firstIndexByBaseUrl = StopRecorderCommand.newFirstIndexByBaseUrl(groups);
        const launchJobByBaseUrl = new Map<string, number>();

        // Convert each group into a job and attach it to the automation.
        for (let i = 0; i < groups.length; i++) {
            const group = groups[i];
            const connection = this._connections.get(group.baseUrl || '');

            const job = StopRecorderCommand.newRecordedJob({
                group,
                index: i,
                isSingleJob,
                connection,
                launchJobByBaseUrl,
                lastIndexByBaseUrl,
                firstIndexByBaseUrl
            });

            automation.stages[0].jobs.push(job);
        }

        // Finalize the completed definition with a detached authentication snapshot so later
        // manifest refreshes cannot mutate the workflow already sent to the editor.
        const manifestAuthentication = manifest.authentication;
        const isAuthenticationObject =
            manifestAuthentication !== null &&
            typeof manifestAuthentication === 'object' &&
            !Array.isArray(manifestAuthentication);

        if (isAuthenticationObject) {
            automation.authentication = structuredClone(manifestAuthentication);
        }

        return automation;
    }

    /**
     * Maps each recorder endpoint to the index of the last group that uses it, so only the final
     * job for a given browser closes it (earlier jobs must leave it open for later reuse).
     */
    private static newLastIndexByBaseUrl(groups: BufferGroup[]): Map<string, number> {
        const lastIndexByBaseUrl = new Map<string, number>();

        for (let i = 0; i < groups.length; i++) {
            lastIndexByBaseUrl.set(groups[i].baseUrl || '', i);
        }

        return lastIndexByBaseUrl;
    }

    /**
     * Maps each recorder endpoint to the index of the FIRST group that uses it, so the recorder's
     * pre-script is attached only to its launch job (a browser reused by a later job keeps its
     * pre-script on the first job that opened it).
     */
    private static newFirstIndexByBaseUrl(groups: BufferGroup[]): Map<string, number> {
        const firstIndexByBaseUrl = new Map<string, number>();

        for (let i = 0; i < groups.length; i++) {
            const baseUrl = groups[i].baseUrl || '';

            // Record only the first occurrence so a reused browser keeps its launch (first) index.
            if (!firstIndexByBaseUrl.has(baseUrl)) {
                firstIndexByBaseUrl.set(baseUrl, i);
            }
        }

        return firstIndexByBaseUrl;
    }

    /**
     * Attaches the recorder's opt-in pre/post scripts to a job as InvokeScript actions.
     *
     * @remarks
     * Runs only for scripts the user flagged with "Add to Automation Flow". The pre-script is
     * prepended as the job's first action (its launch job); the post-script is inserted immediately
     * before the job's CloseBrowser (its last job). Scripts that are empty, unflagged, or contain
     * characters the `{{$ --ScriptBlock:...}}` macro cannot carry are skipped (the settings UI
     * already surfaces the unsafe-character case). The job's rules array is mutated in place.
     *
     * @param job - The recorded job whose rules are augmented.
     * @param options - The recorder connection and this job's first/last-for-browser flags.
     */
    private static setRecordedScripts(job: any, options: {
        connection: EventCaptureService | undefined,
        isFirstForBrowser: boolean,
        isLastForBrowser: boolean
    }): void {
        const { connection, isFirstForBrowser, isLastForBrowser } = options;
        const captureOptions = connection?.options;

        // Prepend the pre-script as the first action of the recorder's launch job.
        if (isFirstForBrowser) {
            const preRule = StopRecorderCommand.newInvokeScriptRule('pre', captureOptions?.preScript);

            if (preRule) {
                job.rules.unshift(preRule);
            }
        }

        // Insert the post-script immediately before CloseBrowser on the recorder's last job.
        if (isLastForBrowser) {
            const postRule = StopRecorderCommand.newInvokeScriptRule('post', captureOptions?.postScript);

            if (postRule) {
                const closeIndex = StopRecorderCommand.getCloseBrowserIndex(job.rules);
                const insertIndex = closeIndex >= 0 ? closeIndex : job.rules.length;
                job.rules.splice(insertIndex, 0, postRule);
            }
        }
    }

    /**
     * Builds an InvokeScript action from a recorder script, or null when it must not be injected.
     *
     * @remarks
     * Returns null when the script is not opted into the automation flow, is empty, or contains
     * characters that cannot be embedded in the `{{$ --ScriptBlock:...}}` macro (base64 is not yet
     * supported). Newlines are escaped to the two-character sequence so multi-line scripts survive
     * the macro. The shell is informational only (InvokeScript runs in the driver session) and is
     * shown in the display name.
     *
     * @param phase - Whether this is the 'pre' or 'post' recording script.
     * @param scriptConfig - The recorder's script configuration.
     * @returns The InvokeScript rule, or null when the script must be skipped.
     */
    private static newInvokeScriptRule(phase: 'pre' | 'post', scriptConfig: any): any {
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
     * Returns the index of the job's CloseBrowser action, or -1 when it has none.
     */
    private static getCloseBrowserIndex(rules: any[]): number {
        return rules.findIndex(rule => rule?.pluginName === 'CloseBrowser');
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

    /**
     * Builds one recorded-actions job from a grouped buffer of events, wiring its id, think-time
     * settings, CloseBrowser placement (only the last job for a browser), the event-to-rule mapping
     * (chromium vs UIA), and its driver parameters.
     */
    private static newRecordedJob(options: {
        group: BufferGroup,
        index: number,
        isSingleJob: boolean,
        connection: EventCaptureService | undefined,
        launchJobByBaseUrl: Map<string, number>,
        lastIndexByBaseUrl: Map<string, number>,
        firstIndexByBaseUrl: Map<string, number>
    }): any {
        const { group, index, isSingleJob, connection, launchJobByBaseUrl, lastIndexByBaseUrl, firstIndexByBaseUrl } = options;

        const baseUrl = group.baseUrl || '';
        const mode = connection?.options?.mode || 'standard';

        // Whether this recorder opted into carrying the recorded pointer offset on User32 actions.
        const isOffsetEnabled = connection?.options?.useOffset === true;

        // Include the 1-based job index in the id so two browsers that share a machine name (and
        // therefore a display name) still produce unique job ids.
        const id = `recorded-actions-job-${index + 1}-${group.machineName.toLowerCase()}`;

        // Apply think time settings from the connection options if available.
        group.thinkTimeSettings = connection?.options?.thinkTimeSettings || {
            enabled: false,
            minThinkTime: 0,
            maxThinkTime: 0
        };

        // Only the last job that uses this browser should close it.
        const isLastForBrowser = lastIndexByBaseUrl.get(baseUrl) === index;

        // Chromium recorders emit already-resolved, G4-ready actions (InvokeClick, SendKeys, ...),
        // so they use a direct event-to-rule mapping instead of the UIA up/down assembly pipeline.
        const isChromium = connection?.isChromium ?? false;

        // Build the job definition from the grouped buffer of events, appending a CloseBrowser
        // action only on the final job for this browser.
        const job = StopRecorderCommand.newJob(
            id,
            mode,
            StopRecorderCommand._includeKeyboardEventMap,
            group,
            isLastForBrowser,
            isChromium,
            isOffsetEnabled);

        StopRecorderCommand.setJobDriverParameters(job, {
            isSingleJob,
            connection,
            baseUrl,
            jobIndex: index + 1,
            launchJobByBaseUrl
        });

        // Attach the recorder's opt-in pre/post scripts: the pre-script on its launch (first) job,
        // the post-script before CloseBrowser on its last job.
        const isFirstForBrowser = firstIndexByBaseUrl.get(baseUrl) === index;

        StopRecorderCommand.setRecordedScripts(job, {
            connection,
            isFirstForBrowser,
            isLastForBrowser
        });

        return job;
    }

    /**
     * Sets a job's driver parameters. A single-job automation omits the job driver entirely so the
     * job inherits the automation-level (real) driver and only one browser opens. In a multi-job
     * automation the automation-level driver is a no-op, so each job carries its own: the first job
     * for a browser launches it with the recorder's real driver (recording the launch index), and a
     * later job for the same browser mounts it by referencing the launching job as "Job(N)".
     */
    private static setJobDriverParameters(job: any, options: {
        isSingleJob: boolean,
        connection: EventCaptureService | undefined,
        baseUrl: string,
        jobIndex: number,
        launchJobByBaseUrl: Map<string, number>
    }): void {
        const { isSingleJob, connection, baseUrl, jobIndex, launchJobByBaseUrl } = options;

        // Single-job automation: omit the job driver so it inherits the automation-level driver.
        if (isSingleJob) {
            delete job.driverParameters;
            return;
        }

        // Multi-job automation: the first job launches its browser; a later job mounts it via "Job(N)".
        const launchJob = launchJobByBaseUrl.get(baseUrl);

        if (launchJob === undefined) {
            job.driverParameters = StopRecorderCommand.confirmDriverBinaries(connection?.options.driverParameters || {});
            launchJobByBaseUrl.set(baseUrl, jobIndex);
        } else {
            job.driverParameters = StopRecorderCommand.confirmDriverBinaries({ driver: `Job(${launchJob})` });
        }
    }

    /**
     * Returns a driver-parameters object that satisfies the G4 designer's import gate, which keeps
     * a driver only when it has both a non-empty `driver` and a non-empty `driverBinaries`. When an
     * object has a driver but no explicit binaries (for example a `Job(N)` reference), a shallow
     * copy with `driverBinaries: "."` is returned so the original (possibly shared recorder config)
     * is never mutated; otherwise the object is returned unchanged.
     */
    private static confirmDriverBinaries(driverParameters: any): any {
        // Nothing to normalize for a missing object.
        if (!driverParameters) {
            return driverParameters;
        }

        const hasDriver = typeof driverParameters.driver === 'string' && driverParameters.driver.length > 0;
        const hasBinaries = typeof driverParameters.driverBinaries === 'string' && driverParameters.driverBinaries.length > 0;

        // Add a placeholder binaries value only when a driver is set but no binaries were provided.
        if (hasDriver && !hasBinaries) {
            return { ...driverParameters, driverBinaries: '.' };
        }

        return driverParameters;
    }

    /**
     * Displays the constructed workflow in the G4 Workflow Viewer.
     */
    private showRecordedWorkflow(automation: any): void {
        new ShowWorkflowCommand(this._context, this.endpoint).invokeCommand({
            workflow: automation
        });
    }

    /**
     * Stops each recorder's browser and connection, then reports one user-facing notification only
     * when at least one recorder was connected before cleanup.
     *
     * @remarks
     * Run after the workflow is shown so a slow stop cannot delay the canvas. Errors are swallowed
     * per recorder so one failing service never blocks the others. Aggregating the transition
     * results prevents one notification per recorder and suppresses false notices for red services.
     *
     * @param connections - Recorder services included in the user-initiated Stop operation.
     * @returns A promise that resolves after every recorder has been given a chance to stop.
     */
    private static async stopRecorderConnections(connections: Map<string, EventCaptureService>): Promise<void> {
        // Track real connected-to-disconnected transitions across the full recorder pool so the
        // user receives one summary instead of duplicate per-service notifications.
        let isAnyConnectionDisconnected = false;

        for (const service of connections.values()) {
            try {
                await service.stopBrowser();
                const isConnectionDisconnected = await service.disconnect();

                if (isConnectionDisconnected) {
                    isAnyConnectionDisconnected = true;
                }
            } catch {
                // Ignore errors during browser stop / disconnect.
            }

            // Run this recorder's post-script after teardown. Failures are surfaced but never block
            // the remaining recorders, since the recorder has already stopped and cannot be undone.
            const options = service.options;
            const result = await G4RecorderScriptService.runRecorderScript({
                phase: 'post',
                configuration: options.postScript,
                baseUrl: options.baseUrl,
                mode: options.mode,
                driverParameters: options.driverParameters,
                logger: options.logger
            });

            if (result.isExecuted && !result.isSuccess) {
                vscode.window.showWarningMessage(`Post-script failed for recorder ${options.baseUrl}. See the G4 log for details.`);
            }
        }

        // Notify only for an actual user-visible transition; already-red services remain silent.
        if (isAnyConnectionDisconnected) {
            showTemporaryInformationMessage('Disconnected from G4 event capture services.');
        }
    }

    /**
     * Analyzes and validates a captured UI event to determine whether it
     * qualifies as a significant "key release" or "mouse up" action.
     * 
     * The method ignores "down" events (e.g., keydown or mousedown) and
     * only processes "up" events that contain a valid UI element path
     * with bounding information.
     * 
     * Returns `null` if the event does not meet the filtering criteria.
     */
    private static assertEvent(event: any): any {
        // Skip events generated by the recorder UI itself
        const isRecorder = event?.value?.chain?.locator?.match(/Extension Development Host/i);
        if (isRecorder) {
            return null;
        }

        // Skip processing for "down" events (e.g., keydown, mousedown)
        const isDown = event?.value?.event.match(/down/i);
        if (isDown) {
            return null;
        }

        // Only continue for "up" events (e.g., keyup, mouseup)
        const isUp = event?.value?.event.match(/up/i);
        if (!isUp) {
            return null;
        }

        // Retrieve the last element in the event's UI path (deepest element)
        const path = event?.value?.chain?.path || [];
        const element = path.at(-1) ?? null;

        // Skip events with no target element
        if (!element) {
            return null;
        }

        // Extract bounding rectangle of the target element
        const bounds = element.bounds || {};

        // Create a simple hash-like ID from the element's geometry
        const id = `${bounds.height};${bounds.X};${bounds.Y};${bounds.width}`;

        // Attempt to resolve the most specific locator available for this event
        const fallbackLocator = event?.value?.chain?.fallbackLocator;
        const locator = event?.value?.chain?.locator;
        const resolvedLocator = locator || fallbackLocator;

        // Return a normalized event structure for downstream processing
        return {
            id,
            bounds,
            event,
            locator: resolvedLocator
        };
    }

    /**
     * Resolves the user-facing name of a recorded interaction from its element chain.
     *
     * @remarks
     * Walks from the target element outward through its ancestors and returns the first node whose
     * `name` is a non-empty string, verbatim (the recorder already normalizes it). Returns an empty
     * string when no node in the chain exposes a name. Path orientation differs by recorder, so the
     * caller states whether the target element is first.
     *
     * @param path - The recorded element chain; each node may carry a user-facing `name`.
     * @param isTargetFirst - True when the target element is at index 0 (Chromium); false when it is
     *                        last (UIA).
     * @returns The first non-empty node name from the target outward, or an empty string.
     */
    private static getUserFacingName(path: any[] | undefined, isTargetFirst: boolean): string {
        // No chain means there is nothing to label.
        if (!Array.isArray(path) || path.length === 0) {
            return '';
        }

        // Orient the walk so the target element is visited first regardless of recorder ordering.
        const orderedPath = isTargetFirst ? path : [...path].reverse();

        // Return the first node (target, then nearest ancestor) that exposes a non-empty name. The
        // emptiness check trims only to decide presence; the returned value stays verbatim.
        for (const node of orderedPath) {
            const name = node?.name;
            const isNamePresent = typeof name === 'string' && name.trim().length > 0;

            if (isNamePresent) {
                return name;
            }
        }

        return '';
    }

    /**
     * Attaches the recorded element's user-facing name to an element-targeted rule.
     *
     * @remarks
     * Sets `capabilities.elementName` (recorder-owned; the designer appends it to the step label)
     * only when the rule targets an element and a name resolves from the chain. Value-only actions
     * (no `onElement`) and elements with no name are left unchanged, and an existing name is never
     * overwritten. The name is attached verbatim.
     *
     * @param rule - The rule being built; mutated in place when a name is attached.
     * @param path - The recorded element chain for the interaction.
     * @param isTargetFirst - True when the target element is at index 0 (Chromium); false for UIA.
     */
    private static setRecordedElementName(rule: any, path: any[] | undefined, isTargetFirst: boolean): void {
        // Only element-targeted actions get a name; value-only actions stay exactly as they are.
        if (!rule?.onElement) {
            return;
        }

        // Resolve the element's user-facing name; keep the rule unchanged when the chain has none.
        const elementName = StopRecorderCommand.getUserFacingName(path, isTargetFirst);

        if (elementName.length === 0) {
            return;
        }

        // Preserve any existing capabilities, and never overwrite a name that is already present.
        rule.capabilities = rule.capabilities || {};

        if (!rule.capabilities.elementName) {
            rule.capabilities.elementName = elementName;
        }
    }

    /**
     * Builds the offset argument fragment for a User32 mouse action, or '' when it does not apply.
     *
     * @remarks
     * Pure and deterministic. Offset is a pointer-position concept, so it applies only to User32
     * capture mode, only when the recorder opted in, and only when the recorded offset is non-zero.
     * The value is read from the event contract root (`event.value.offset`).
     *
     * @param mode - The recorder capture mode.
     * @param event - The recorded event carrying the offset at `value.offset`.
     * @param isOffsetEnabled - Whether the recorder's "use offset" option is on.
     * @returns The ` --OffsetX:<x> --OffsetY:<y>` fragment, or an empty string.
     */
    private static getOffsetArguments(mode: string, event: any, isOffsetEnabled: boolean): string {
        // Offset is a User32 pointer concept and only applies when the recorder opted in.
        if (mode !== 'user32' || !isOffsetEnabled) {
            return '';
        }

        // Read the recorded offset from the contract root, coercing each axis to a number.
        const offsetX = Number(event?.value?.offset?.x) || 0;
        const offsetY = Number(event?.value?.offset?.y) || 0;

        // A zero offset carries no meaning, so nothing is added.
        const isOffsetPresent = offsetX !== 0 || offsetY !== 0;

        if (!isOffsetPresent) {
            return '';
        }

        // Anchor the offset at the element's top-left corner, which is the origin the recorder
        // measures the offset from. Without this the InvokeUser32Click plugin defaults to
        // MiddleCenter and applies the offset from the element's center, landing off target.
        return ` --OffsetX:${offsetX} --OffsetY:${offsetY} --Alignment:${StopRecorderCommand._offsetAlignment}`;
    }

    /**
     * Merges an offset argument fragment into a rule's CLI argument macro.
     *
     * @remarks
     * A no-op when the fragment is empty. When the rule has no argument yet (the normal User32
     * click), a fresh `{{$ ... }}` macro is created; when it already has one, the fragment is spliced
     * in before the trailing `}}` so existing arguments are preserved.
     *
     * @param rule - The rule being built; mutated in place.
     * @param offsetArguments - The ` --OffsetX:<x> --OffsetY:<y>` fragment, or an empty string.
     */
    private static setOffsetArgument(rule: any, offsetArguments: string): void {
        // Nothing to add when the offset does not apply.
        if (offsetArguments.length === 0) {
            return;
        }

        // Create a fresh macro when the action has no argument yet (the common User32 click case).
        const existingArgument = typeof rule.argument === 'string' ? rule.argument : '';

        if (existingArgument.length === 0) {
            rule.argument = `{{$${offsetArguments}}}`;
            return;
        }

        // Splice the offset into an existing macro, before its closing braces, so other arguments
        // are preserved.
        const closingIndex = existingArgument.lastIndexOf('}}');

        rule.argument = closingIndex >= 0
            ? existingArgument.slice(0, closingIndex) + offsetArguments + existingArgument.slice(closingIndex)
            : existingArgument + offsetArguments;
    }

    /**
     * Determines which EventCaptureService instance captured the earliest event
     * based on the timestamps of items in their internal buffers.
     *
     * This method is useful when coordinating multiple capture services that may
     * record events in parallel - ensuring actions are processed in the correct order.
     */
    private static getFirstCaptureService(
        connections: Map<string, EventCaptureService>
    ): EventCaptureService | undefined {

        // Quick optimization: if there's only one capture service, no need to compare timestamps.
        if (connections.size === 1) {
            return Array.from(connections.values())[0];
        }

        // The service whose buffer contains the earliest event.
        let earliestService: EventCaptureService | undefined;

        // The earliest buffered event timestamp found across all services.
        let earliestTimestamp: number | undefined;

        // Iterate through all available capture services.
        for (const service of connections.values()) {

            // Examine each buffered item in the service. The event timestamp is on the inner
            // model (item.value.timestamp), not on the broadcast envelope.
            for (const item of service.buffer) {
                const timestamp = item?.value?.timestamp;

                // Skip items without a usable timestamp.
                if (typeof timestamp !== 'number') {
                    continue;
                }

                // If this is the first item checked, or if the current item has an earlier
                // timestamp, record it as the earliest so far.
                if (earliestTimestamp === undefined || timestamp < earliestTimestamp) {
                    earliestTimestamp = timestamp;
                    earliestService = service;
                }
            }
        }

        // Fall back to the first connection when no timestamped event was found, so the caller
        // still has a service to source automation defaults from instead of aborting entirely.
        return earliestService ?? Array.from(connections.values())[0];
    }

    /**
     * Creates the schema-compatible automation shell that receives recorded jobs and a final
     * authentication snapshot before being returned to the workflow editor.
     */
    private static newAutomation(manifest: any, driverParameters: any): any {
        // Extract runtime or environment settings, or default to an empty object.
        const settings = manifest.settings || {};

        // Construct and return a standardized automation definition object.
        return {
            // Keep the shell schema-compatible until the completed definition receives the
            // manifest's detached authentication snapshot.
            authentication: {
                token: ""
            },

            // Parameters that define how and where the automation will execute
            // (e.g., browser, platform, device, or driver-specific settings).
            driverParameters: driverParameters || {},

            // Arbitrary key-value pairs defining runtime configuration.
            settings: settings,

            // Stages define the automation workflow hierarchy.
            // Each stage can contain multiple jobs that run sequentially or in parallel.
            stages: [
                {
                    reference: {
                        id: "recorder-stage-01",
                        name: "Recorded Actions Stage",
                        description:
                            "Stage to execute all actions captured during the recording session."
                    },

                    // Placeholder array for job definitions.
                    // Jobs will be added dynamically as recording data is processed.
                    jobs: []
                }
            ]
        };
    }

    /**
     * Maps a grouped buffer of Chromium recorder events to executable G4 rules.
     *
     * The Chromium extension already resolves each interaction into a G4-ready event whose
     * `event` field is the plugin name (for example `InvokeClick`, `SendKeys`, `OpenUrl`) and
     * whose `chain.locator` is the element XPath. Each event therefore maps one-to-one to a
     * rule, unlike the UIA recorder whose low-level up/down events must be assembled.
     */
    private static resolveChromiumEvents(buffer: any[]): any[] {
        // Accumulates one rule per resolvable recorder event, in capture order.
        const rules: any[] = [];

        for (const item of buffer) {
            // The recorder model sits inside the broadcast envelope's `value` property.
            const model = item?.value;

            // Skip envelopes without a usable event (the event name is the plugin name).
            if (!model?.event) {
                continue;
            }

            rules.push(StopRecorderCommand.newChromiumRule(model));
        }

        return rules;
    }

    /**
     * Builds a single G4 rule from one Chromium recorder event model.
     *
     * The event name is used verbatim as the plugin name; the element locator and argument are
     * resolved per event family so the rule matches the G4 action's expected shape (element vs.
     * argument-only actions).
     */
    private static newChromiumRule(model: any): any {
        // The element XPath the interaction targeted (empty for navigation/window events).
        const locator = model?.chain?.locator || '';

        // The event-specific payload (typed text, url, scroll direction, window index, ...).
        const value = model?.value || {};

        // Every rule is an Action whose plugin name is the recorder's resolved event name, and
        // carries the capture timestamp so think-time insertion works uniformly with UIA jobs.
        const rule: any = {
            $type: 'Action',
            pluginName: model.event,
            context: {
                timestamp: model.timestamp
            }
        };

        switch (model.event) {
            case 'SendKeys':
                // Typed text targets the focused element; carry the text as the --keys argument.
                rule.onElement = locator || undefined;
                rule.argument = `{{$ --keys:${value.text ?? ''}}}`;
                break;

            case 'OpenUrl':
                // Address-bar navigation: the destination URL is the argument, no element.
                rule.argument = value.url ?? '';
                break;

            case 'UpdatePage':
            case 'UndoNavigation':
            case 'RedoNavigation':
                // Reload / back / forward navigations take neither an element nor an argument.
                break;

            case 'SwitchWindow':
            case 'CloseWindow':
                // Window actions target a window-handle index rather than a DOM element.
                rule.argument = `${value.index ?? 0}`;
                break;

            case 'InvokeScroll':
                // Wheel scroll carries a readable direction and a normalized notch count.
                rule.onElement = locator || undefined;
                rule.argument = `{{$ --direction:${value.direction ?? 'Down'} --times:${value.notches ?? 1}}}`;
                break;

            default:
                // Element-targeted actions (InvokeClick, InvokeDoubleClick, InvokeContextClick,
                // MoveMouseCursor, SubmitForm, SwitchFrame, SwitchParentFrame) run against the
                // recorded locator with no extra argument.
                if (locator) {
                    rule.onElement = locator;
                }
                break;
        }

        // Attach the recorded element's user-facing name (the Chromium chain is target-first) so the
        // designer can label the step; a no-element or unnamed action is left unchanged.
        StopRecorderCommand.setRecordedElementName(rule, model?.chain?.path, true);

        return rule;
    }

    /**
     * Builds a job definition from a grouped buffer of recorded events.
     * Each job aggregates mouse and keyboard actions into executable rules.
     */
    private static newJob(
        id: string,
        mode: string,
        includeKeyboardEventMap: Map<string, string>,
        bufferGroup: BufferGroup,
        appendCloseBrowser: boolean = true,
        isChromium: boolean = false,
        isOffsetEnabled: boolean = false
    ): any {
        /**
         * Inserts "think time" delay actions between recorded rules based on the
         * time difference between consecutive events.
         * 
         * Think time represents the natural pause a user takes between actions.
         * This function detects meaningful gaps between event timestamps and
         * injects a `WaitFlow` action to simulate that delay during replay.
         */
        const addThinkTime = (rules: any[], minThinkTime: number, maxThinkTime: number) => {
            // Validate input: if not an array or less than 2 items, just return a copy (or empty array).
            if (!Array.isArray(rules) || rules.length < 2) {
                return Array.isArray(rules) ? rules.slice() : [];
            }

            // Output array to hold the resulting sequence with inserted delays.
            const rulesOut: any[] = [];

            // Iterate over all consecutive rule pairs.
            for (let i = 0; i < rules.length - 1; i++) {
                const currentRule = rules[i];
                const nextRule = rules[i + 1];

                // Always include the current rule.
                rulesOut.push(currentRule);

                // Extract timestamps from the context (convert to number to ensure numeric comparison).
                const currentTimestamp = Number(currentRule?.context?.timestamp);
                const nextTimestamp = Number(nextRule?.context?.timestamp);

                // Skip if either timestamp is invalid.
                if (!Number.isFinite(currentTimestamp) || !Number.isFinite(nextTimestamp)) {
                    continue;
                }

                // Compute time gap between consecutive actions.
                const delta = nextTimestamp - currentTimestamp;

                // Only insert think time if the gap exceeds the minimum threshold.
                if (delta > minThinkTime) {
                    // Cap the delay to the maximum allowed think time.
                    const duration = Math.min(delta, maxThinkTime);

                    // Convert to seconds with two decimal precision.
                    const thinkTime = Number((duration / 1000).toFixed(2));

                    // Insert a synthetic "WaitFlow" rule to simulate user pause.
                    rulesOut.push({
                        $type: 'Action',
                        pluginName: 'WaitFlow',
                        argument: `{{$ --Timeout:${duration}}}`,
                        capabilities: {
                            displayName: `Think Time (${thinkTime} seconds)`,
                        },
                    });
                }
            }

            // Push the final rule (last one in sequence) to complete the list.
            rulesOut.push(rules.at(-1));

            // Return the modified rule set with think time delays.
            return rulesOut;
        };

        // Clone the group's event list to safely consume it
        const buffer = [...bufferGroup.events];

        // Initialize job-specific parameters and metadata
        const driverParameters = {};
        const machineName = bufferGroup.machineName;

        // Define the job structure with identifying reference and rule container
        const job = {
            driverParameters: driverParameters,
            reference: {
                id: id,
                name: `Recorded Actions Job (${machineName})`,
                description: `Job to execute all recorded actions from machine ${machineName}.`
            },
            rules: [] as any[]
        };

        // Chromium recorders push events that are already resolved G4 actions (the event name is
        // the plugin name and the chain carries the element locator), so each maps directly to a
        // rule. The UIA recorder instead emits low-level up/down events that must be assembled.
        if (isChromium) {
            job.rules = StopRecorderCommand.resolveChromiumEvents(buffer);
        } else {
            // Sequentially resolve and classify each recorded UIA event
            while (buffer.length > 0) {
                // Safely extract the next buffered event
                const event = StopRecorderCommand.assertEvent(buffer.shift())?.event;

                // Skip invalid or undefined entries
                if (!event) {
                    continue;
                }

                // Mouse events are translated to UI interaction actions
                if (event?.value?.type?.match(/mouse/gi)) {
                    const mouseAction = StopRecorderCommand.resolveMouseEvent(mode, event, isOffsetEnabled);
                    job.rules.push(mouseAction);
                    continue;
                }

                // Keyboard sequences are consolidated into a single input action
                const keyboardActions = StopRecorderCommand.resolveKeyboardEvent(mode, event, includeKeyboardEventMap, buffer);
                job.rules.push(...keyboardActions);
            }
        }

        // Close the browser at the end only when this is the final job that uses it; a browser
        // reused by a later job must stay open so that job can mount the same driver.
        if (appendCloseBrowser) {
            job.rules.push({
                $type: 'Action',
                pluginName: "CloseBrowser"
            });
        }

        // Insert think time delays between actions based on recorded timestamps
        if (bufferGroup.thinkTimeSettings?.enabled) {
            job.rules = addThinkTime(
                job.rules,
                bufferGroup.thinkTimeSettings?.minThinkTime || 0,
                bufferGroup.thinkTimeSettings?.maxThinkTime || 0
            );
        }

        // Return the constructed job definition
        return job;
    }

    /**
     * Resolves a sequence of raw keyboard events into one or more normalized action rules.
     *
     * The method groups consecutive keyboard events into a combined key sequence when possible,
     * while still allowing special keys that exist in the includeKeyboardEventMap to be emitted
     * as dedicated actions. It consumes events from the supplied buffer until it reaches a
     * non-keyboard event or the buffer is exhausted.
     */
    private static resolveKeyboardEvent(
        mode: string,
        event: any,
        includeKeyboardEventMap: Map<string, string>,
        buffer: any[]
    ): any[] {
        /**
         * Creates a new keyboard-related action rule based on the given mode and input.
         * 
         * When the input represents a single logical key, the action uses the keyboard key plugin.
         * When the input represents a sequence of characters, the action uses the keys plugin.
         * The mode determines whether the standard plugins or the User32-based plugins are used.
         */
        const newKeyboardRule = (
            mode: string,
            keys: string, event: any,
            isKeyboard: boolean
        ): any => {
            // Resolve plugin names according to the selected mode
            const keysAction = mode === 'standard' ? 'SendKeys' : 'SendUser32Keys';
            const keyboardAction = mode === 'standard' ? 'SendKeyboardKey' : 'SendUser32KeyboardKey';

            // Decide whether to use a single-key or multi-key parameter and plugin
            const parameter = isKeyboard ? 'Key' : 'Keys';
            const pluginName = isKeyboard ? keyboardAction : keysAction;

            // Build the normalized action object with locator and timestamp context.
            const rule: any = {
                $type: 'Action',
                pluginName: pluginName,
                onElement: mode === 'coordinate' ? undefined : event?.value?.chain?.locator,
                argument: '{{$ --' + parameter + ':' + keys + '}}',
                context: {
                    timestamp: event?.value?.timestamp
                }
            };

            // Attach the recorded element's user-facing name (the UIA chain is target-last) for the label.
            StopRecorderCommand.setRecordedElementName(rule, event?.value?.chain?.path, false);

            return rule;
        };

        // Holds any additional rules that may be produced while parsing the sequence,
        // for example special-key actions.
        const rules: any[] = [];

        // Temporary storage for all sequential key values that will later be combined
        // into a single SendKeys or single-key action.
        const keysBuffer: string[] = [];

        // Classify the initial event the same way later events are handled, so a run that begins
        // with a special key (Backspace, Enter, Tab, arrows) or a space is not captured as literal
        // text. Normalize a leading space to a real space first.
        let initialKey = event?.value?.value?.key || '';

        if (initialKey.match(/^space$/i)) {
            initialKey = ' ';
        }

        // A leading special key becomes its own dedicated action; the rest of the buffer is left for
        // the next run, exactly as a mid-sequence special key ends this run.
        const initialSpecialKey = StopRecorderCommand.resolveKeyboardKey(mode, event, includeKeyboardEventMap);

        if (initialSpecialKey?.resolved) {
            return [initialSpecialKey.rule];
        }

        // Otherwise seed the buffer with the normalized initial character, skipping multi-character
        // non-special keys just like the loop below does.
        if (initialKey.length <= 1) {
            keysBuffer.push(initialKey);
        }

        // Aggregate the following keyboard events. The guard only consumes the next event when it is
        // a keyboard event: a following mouse click's up event survives assertEvent, so peeking the
        // type here leaves the click in the buffer for resolveMouseEvent instead of pulling it into
        // this SendKeys (which would steal its element and swallow the click). The buffer.length check
        // also keeps an exhausted buffer from spinning the loop.
        while (buffer.length > 0 && buffer[0]?.value?.type?.match(/keyboard/i)) {
            // Read the next event; skip non-target events (for example key-down) without discarding
            // the last valid event, so the trailing key keeps its locator/timestamp for its rule.
            const nextEvent = StopRecorderCommand.assertEvent(buffer.shift())?.event;

            if (!nextEvent) {
                continue;
            }

            event = nextEvent;

            // Extract the key value from the event payload.
            let key = event?.value?.value?.key || '';

            // TODO: Implement a full key mapping utility.
            // Temporary handling for the space key until a full key mapping utility is introduced.
            if (key?.match(/^space$/i)) {
                key = ' ';
            }

            // Try to resolve the current event as a special key using the supplied mapping.
            const keyboardKey = StopRecorderCommand.resolveKeyboardKey(mode, event, includeKeyboardEventMap);

            // If the key is resolved as a special key, handle it accordingly.
            if (keyboardKey?.resolved) {
                // Store the dedicated rule that represents the resolved special key.
                rules.push(keyboardKey.rule);

                // Join the characters collected before this special key, if any. The buffer never
                // holds a special key now (the first event is classified above, and later special
                // keys end the run here), so the previous single-key workaround is no longer needed.
                const keys = keysBuffer.filter(i => i !== '').join('');

                // Emit a SendKeys for those characters only when there are any, so a special key with
                // no preceding characters does not produce an empty --Keys action.
                const keysRules = keys.length > 0
                    ? [newKeyboardRule(mode, keys, event, false)]
                    : [];

                // Return the buffered-characters rule (when present) followed by the special-key rules.
                return [...keysRules, ...rules];
            }

            // For unrecognized keys longer than one character, skip adding them to the buffer.
            // This prevents invalid entries from polluting the key sequence.
            if (key.length > 1) {
                continue;
            }

            // The key is not resolved as a special key, so add it to the sequence buffer.
            keysBuffer.push(key || '');
        }

        // No more keyboard events are available. Combine all buffered keys into one string.
        const keys = keysBuffer.filter(i => i !== '').join('');

        // Emit the SendKeys only when characters were collected, so an all-skipped run does not
        // produce an empty --Keys action. Any special-key rules gathered are still returned.
        const keysRules = keys.length > 0
            ? [newKeyboardRule(mode, keys, event, false)]
            : [];

        // Return the sequence rule (when present) followed by any additional rules gathered.
        return [...keysRules, ...rules];
    }

    /**
     * Resolves a raw keyboard event into a normalized keyboard action rule.
     * 
     * This function extracts the logical key name from the event payload, maps it
     * to a supported identifier (for example, "backspace" becomes "Backspace"), and
     * constructs a standardized rule object for automation execution. The output is
     * adjusted according to the given mode so that locator-based or coordinate-based
     * plugins can be targeted correctly.
     */
    private static resolveKeyboardKey(mode: string, event: any, includeKeyboardEventMap: Map<string, string>): any {
        // Extract the key from the event payload and normalize its casing
        const key = event?.value?.value?.key?.toLowerCase() || '';

        // Resolve the key to a known, supported value or null if not found
        const resolved = includeKeyboardEventMap.has(key)
            ? includeKeyboardEventMap.get(key)
            : null;

        // Construct the standardized action rule.
        const rule: any = {
            $type: 'Action',
            pluginName: mode === 'standard' ? 'SendKeyboardKey' : 'SendUser32KeyboardKey',
            onElement: mode === 'coordinate' ? undefined : event?.value?.chain?.locator,
            argument: '{{$ --Key:' + resolved + '}}',
            context: {
                timestamp: event?.value?.timestamp
            }
        };

        // Attach the recorded element's user-facing name (the UIA chain is target-last) for the label.
        StopRecorderCommand.setRecordedElementName(rule, event?.value?.chain?.path, false);

        return {
            resolved: resolved,
            rule: rule
        };
    }

    /**
     * Resolves a recorded mouse event into a standardized action definition
     * compatible with the automation workflow schema.
     */
    private static resolveMouseEvent(mode: string, event: any, isOffsetEnabled: boolean = false): any {
        // Map normalized mouse event types to corresponding plugin command names
        const mouseEventMap: Map<string, string> = new Map<string, string>([
            ['left', (mode === 'standard' ? 'InvokeClick' : 'InvokeUser32Click')],
            ['middle', (mode === 'standard' ? 'InvokeMiddleClick' : 'InvokeUser32MiddleClick')],
            ['right', (mode === 'standard' ? 'InvokeContextClick' : 'InvokeUser32ContextClick')]
        ]);

        // Extract the mouse event type (e.g., "left", "right", "middle") from the event string
        const mouseEventType = event?.value?.event?.split(' ')[0]?.toLowerCase();

        // Attempt to resolve the most specific locator available for this event
        const fallbackLocator = event?.value?.chain?.fallbackLocator;
        const locator = event?.value?.chain?.locator;
        const resolvedLocator = locator || fallbackLocator || undefined;

        // Construct the action rule based on the mouse event type and mode
        const rule: any = {
            $type: 'Action',
            pluginName: mouseEventMap.get(mouseEventType) || 'None',
            onElement: resolvedLocator,
            context: {
                x: event?.value?.x,
                y: event?.value?.y,
                timestamp: event?.value?.timestamp
            }
        };

        // Adjust the action for coordinate-based mode
        if (mode === 'coordinate') {
            rule.onElement = undefined;
            rule.argument = `{{$ --X:${event?.value?.value?.x} --Y:${event?.value?.value?.y}}}`;
        }

        // Carry the recorded pointer offset on User32 mouse actions when the recorder opted in and
        // the offset is non-zero; the element target is preserved and only the argument is extended.
        StopRecorderCommand.setOffsetArgument(rule, StopRecorderCommand.getOffsetArguments(mode, event, isOffsetEnabled));

        // Attach the recorded element's user-facing name (the UIA chain is target-last) for the step
        // label; skipped in coordinate mode (no onElement) and when the element has no name.
        StopRecorderCommand.setRecordedElementName(rule, event?.value?.chain?.path, false);

        // Return a normalized action object suitable for automation execution
        return rule;
    }

    /**
     * Groups a flat list of recorded event objects into consecutive groups,
     * where each group represents a continuous sequence of events
     * coming from the same recorder endpoint (baseUrl).
     *
     * Unlike a traditional "group by" operation, this method preserves
     * **order and continuity** - meaning if the same recorder appears again
     * later in the buffer, it starts a **new group** rather than merging with
     * previous occurrences. Grouping by endpoint (rather than machine name)
     * keeps two browsers hosted on the same machine in separate jobs and lets a
     * browser that reappears later form a new, mountable job.
     */
    private static newBufferGroups(buffer: any[]): BufferGroup[] {
        // The final list of groups. Each group contains a continuous run of events that
        // originated from the same recorder endpoint.
        const groups: BufferGroup[] = [];

        // Tracks the currently active group being populated.
        let currentGroup: BufferGroup | null = null;

        // Iterate through each event in the buffer in sequential (timestamp) order.
        for (const event of buffer) {
            // When encountering the first event, or when the originating recorder endpoint
            // changes, start a new group with a new incremental ID.
            if (!currentGroup || currentGroup.baseUrl !== event.baseUrl) {
                currentGroup = {
                    id: groups.length + 1,                // Sequential numeric group ID.
                    baseUrl: event.baseUrl,               // Recorder endpoint defining this group.
                    machineName: event.value.machineName, // Machine name, kept for display.
                    events: []                            // Container for grouped events.
                };
                groups.push(currentGroup);
            }

            // Add the current event to the active group.
            currentGroup.events.push(event);
        }

        // Return all constructed endpoint-based event groups.
        return groups;
    }
}

/**
 * Represents a logical grouping of consecutive recorded events
 * originating from the same machine within a recording session.
 */
type BufferGroup = {
    /** Optional base URL of the capture service associated with this group. */
    baseUrl?: string;

    /** Sequential group identifier (1-based index). */
    id: number;

    /** The machine name associated with the captured events. */
    machineName: string;

    /** The ordered list of recorded event objects belonging to this group. */
    events: any[];

    /** Optional think time settings applied to this group. */
    thinkTimeSettings?: any
};
