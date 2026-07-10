/*
 * Command to forward notebook automation events via G4 NotificationService.
 *
 * RESOURCES:
 * VS Code command API reference: https://code.visualstudio.com/api/references/commands
 */
import * as vscode from 'vscode';
import { CommandBase } from './command-base';
import { Logger } from '../logging/logger';
import { EventCaptureService } from '../clients/g4-signalr-client';
import { ShowWorkflowCommand } from './show-workflow';

export class StopRecorderCommand extends CommandBase {
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

        // Create a dedicated child logger for this command’s messages.
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
        const automation = StopRecorderCommand.newAutomation(this.manifest, automationDriver);

        // Precompute the last group index per endpoint (only the final job closes its browser) and
        // track the launch job index per endpoint (later jobs mount it via "Job(N)").
        const lastIndexByBaseUrl = StopRecorderCommand.newLastIndexByBaseUrl(groups);
        const launchJobByBaseUrl = new Map<string, number>();

        // [recorder-diag] TEMPORARY: log the known recorder endpoint keys so each group's baseUrl
        // can be compared against them to explain a driver-less job.
        this.logger.information(
            `[recorder-diag] connection keys: ${JSON.stringify(Array.from(this._connections.keys()))}`
        );

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
                lastIndexByBaseUrl
            });

            // [recorder-diag] TEMPORARY: log each group's identity and its resolved driver so a
            // driver-less job (empty/absent driverParameters) can be traced to a baseUrl mismatch.
            this.logger.information(
                `[recorder-diag] group #${i} baseUrl=${JSON.stringify(group.baseUrl)} ` +
                `machineName=${JSON.stringify(group.machineName)} connectionResolved=${!!connection} ` +
                `driverParameters=${JSON.stringify(job.driverParameters)}`
            );

            automation.stages[0].jobs.push(job);
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
        lastIndexByBaseUrl: Map<string, number>
    }): any {
        const { group, index, isSingleJob, connection, launchJobByBaseUrl, lastIndexByBaseUrl } = options;

        const baseUrl = group.baseUrl || '';
        const mode = connection?.options?.mode || 'standard';

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
            isChromium);

        StopRecorderCommand.setJobDriverParameters(job, {
            isSingleJob,
            connection,
            baseUrl,
            jobIndex: index + 1,
            launchJobByBaseUrl
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
            job.driverParameters = connection?.options.driverParameters || {};
            launchJobByBaseUrl.set(baseUrl, jobIndex);
        } else {
            job.driverParameters = { driver: `Job(${launchJob})` };
        }
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
     * Stops each recorder's browser (chromium only) and closes its connection, swallowing errors so
     * one failing recorder never blocks the others. Run after the workflow is shown so a slow stop
     * cannot delay the canvas.
     */
    private static async stopRecorderConnections(connections: Map<string, EventCaptureService>): Promise<void> {
        for (const service of connections.values()) {
            try {
                await service.stopBrowser();
                await service.disconnect();
            }
            catch {
                // Ignore errors during browser stop / disconnect.
            }
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

        // Retrieve the last element in the event’s UI path (deepest element)
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
     * Determines which EventCaptureService instance captured the earliest event
     * based on the timestamps of items in their internal buffers.
     *
     * This method is useful when coordinating multiple capture services that may
     * record events in parallel — ensuring actions are processed in the correct order.
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
     * Creates a new Automation definition object that represents a complete
     * executable automation workflow.
     */
    private static newAutomation(manifest: any, driverParameters: any): any {
        // Extract the authentication token if available; fallback to an empty string.
        const token = manifest.authentication?.token || "";

        // Extract runtime or environment settings, or default to an empty object.
        const settings = manifest.settings || {};

        // Construct and return a standardized automation definition object.
        return {
            // Authentication block ensures that execution contexts can securely
            // interact with the G4 Engine or remote services.
            authentication: {
                token: token
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
        isChromium: boolean = false
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
                    const mouseAction = StopRecorderCommand.resolveMouseEvent(mode, event);
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

            // Build and return the normalized action object with locator and timestamp context
            return {
                $type: 'Action',
                pluginName: pluginName,
                onElement: mode === 'coordinate' ? undefined : event?.value?.chain?.locator,
                argument: '{{$ --' + parameter + ':' + keys + '}}',
                context: {
                    timestamp: event?.value?.timestamp
                }
            };
        };

        // Holds any additional rules that may be produced while parsing the sequence,
        // for example special-key actions.
        const rules: any[] = [];

        // Temporary storage for all sequential key values that will later be combined
        // into a single SendKeys or single-key action.
        const keysBuffer: string[] = [];

        // Seed the buffer with the key from the initial event.
        keysBuffer.push(event?.value?.value?.key || '');

        // Determine whether the current event is still a keyboard event.
        let isKeyboard = event?.value?.type?.match(/keyboard/i);

        // Continue reading events from the buffer while they belong to the keyboard category.
        while (isKeyboard) {
            // Extract the next event from the buffer and normalize it through assertEvent.
            event = StopRecorderCommand.assertEvent(buffer.shift())?.event;

            // Skip empty slots or invalid events and move on to the next one.
            if (!event) {
                continue;
            }

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

                // Decide whether the buffered content represents a single special key or a sequence.
                const isLength = keysBuffer.length === 1;
                const isEntry = includeKeyboardEventMap.has(keysBuffer[0].toLowerCase());
                const isSingleSpecialKey = isLength && isEntry;

                // When handling a single special key, use that key directly.
                // Otherwise, join all buffered keys into a continuous string.
                const keys = isSingleSpecialKey
                    ? keysBuffer[0]
                    : keysBuffer.filter(i => i !== '').join('');

                // Create the final rule for the buffered keys and return it together
                // with any additional rules that were collected.
                const keysRule = newKeyboardRule(mode, keys, event, isSingleSpecialKey);

                // Return the combined result set.
                return [keysRule, ...rules];
            }

            // For unrecognized keys longer than one character, skip adding them to the buffer.
            // This prevents invalid entries from polluting the key sequence.
            if (key.length > 1) {
                continue;
            }

            // The key is not resolved as a special key, so add it to the sequence buffer.
            keysBuffer.push(key || '');

            // Peek at the next event in the buffer to check if it is still a keyboard event.
            isKeyboard = buffer?.[0]?.value?.type?.match(/keyboard/i);
        }

        // No more keyboard events are available. Combine all buffered keys into one string.
        const keys = keysBuffer.filter(i => i !== '').join('');

        // Create a rule that represents the complete key sequence as a single action.
        const keysRule = newKeyboardRule(mode, keys, event, false);

        // Return the sequence rule followed by any additional rules that may have been gathered.
        return [keysRule, ...rules];
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

        // Construct and return the standardized action rule
        return {
            resolved: resolved,
            rule: {
                $type: 'Action',
                pluginName: mode === 'standard' ? 'SendKeyboardKey' : 'SendUser32KeyboardKey',
                onElement: mode === 'coordinate' ? undefined : event?.value?.chain?.locator,
                argument: '{{$ --Key:' + resolved + '}}',
                context: {
                    timestamp: event?.value?.timestamp
                }
            }
        };
    }

    /**
     * Resolves a recorded mouse event into a standardized action definition
     * compatible with the automation workflow schema.
     */
    private static resolveMouseEvent(mode: string, event: any): any {
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
        const resolvedLocator = locator || fallbackLocator;

        // Construct the action rule based on the mouse event type and mode
        const rule: any = {
            $type: 'Action',
            pluginName: mouseEventMap.get(mouseEventType) || 'None',
            onElement: event?.value?.chain?.locator,
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

        // Return a normalized action object suitable for automation execution
        return rule;
    }

    /**
     * Groups a flat list of recorded event objects into consecutive groups,
     * where each group represents a continuous sequence of events
     * coming from the same recorder endpoint (baseUrl).
     *
     * Unlike a traditional "group by" operation, this method preserves
     * **order and continuity** — meaning if the same recorder appears again
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
