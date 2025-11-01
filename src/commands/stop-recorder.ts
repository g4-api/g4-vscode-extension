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
        // Find the connection that captured the earliest event
        const initialConnection = StopRecorderCommand.getFirstCaptureService(this._connections);

        // Abort if no active connections exist
        if (!initialConnection) {
            this.logger.warning('No active EventCaptureService connections found to stop.');
            return;
        }

        try {
            // Merge all event buffers into one list and sort by timestamp
            const buffer = Array
                .from(this._connections.values())
                .flatMap(service =>
                    service.buffer.map(item => ({
                        ...item,
                        baseUrl: service.options.baseUrl
                    }))
                )
                .sort((a, b) => a.timestamp - b.timestamp);

            // Group consecutive events by machine name
            const groups = StopRecorderCommand.newBufferGroups(buffer);

            // Abort if no events were recorded
            if (!groups || groups.length === 0) {
                this.logger.information('No recorded events found in the buffers.');
                return;
            }

            // Create a base automation definition for the recorded session
            const driverParameters = initialConnection?.options.driverParameters || {};
            const automation = StopRecorderCommand.newAutomation(this.manifest, driverParameters);

            // Convert each group into a job and attach to the automation
            for (let i = 0; i < groups.length; i++) {
                const group = groups[i];
                const connection = this._connections.get(group.baseUrl || '');
                const mode = connection?.options?.mode || 'standard';
                const id = `recorded-actions-job-${group.machineName.toLowerCase()}`;
                const job = StopRecorderCommand.newJob(id, mode, group);

                // Apply driver parameters for subsequent groups if available
                if (i !== 0) {
                    if (connection) {
                        job.driverParameters = connection?.options.driverParameters || {};
                    }
                }

                // Attach the job to the automation definition object
                automation.stages[0].jobs.push(job);
            }

            // Display the constructed workflow in the G4 Workflow Viewer
            new ShowWorkflowCommand(this._context, this.endpoint).invokeCommand({
                workflow: automation
            });
        }
        catch (error: any) {
            this.logger.error(error || 'An unknown error occurred while stopping the recorder.');
        }
        finally {
            // Clear all buffers and close all service connections
            for (const service of this._connections.values()) {
                service.clearBuffer();
                service.disconnect();
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

        // Return a normalized event structure for downstream processing
        return {
            id,
            bounds,
            event,
            locator: event?.value?.chain?.locator
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

        // The earliest buffered event item found across all services.
        let earliestItem: { timestamp: number } | undefined;

        // Iterate through all available capture services.
        for (const service of connections.values()) {

            // Examine each buffered item in the service.
            for (const item of service.buffer) {

                // If this is the first item checked, or if the current item has an earlier timestamp,
                // record it as the earliest so far.
                if (!earliestItem || item.timestamp < earliestItem.timestamp) {
                    earliestItem = item;
                    earliestService = service;
                }
            }
        }

        // Return the service that recorded the earliest event (if any were found).
        return earliestService;
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
     * Builds a job definition from a grouped buffer of recorded events.
     * Each job aggregates mouse and keyboard actions into executable rules.
     */
    private static newJob(id: string, mode: string, bufferGroup: BufferGroup): any {
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

        // Sequentially resolve and classify each recorded event
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
            const keyboardAction = StopRecorderCommand.resolveKeyboardEvent(mode, event, buffer);
            job.rules.push(keyboardAction);
        }

        // Always close the browser at the end of the recorded session
        job.rules.push({
            $type: 'Action',
            pluginName: "CloseBrowser"
        });

        // Return the constructed job definition
        return job;
    }

    /**
     * Converts consecutive keyboard-related events into a single
     * normalized keyboard action definition for automation execution.
     */
    private static resolveKeyboardEvent(mode: string, event: any, buffer: any[]): any {
        // Temporary store for sequentially pressed keys
        const keysBuffer: string[] = [];

        // Add the first detected key
        keysBuffer.push(event?.value?.value?.key || '');

        // Check if the current event represents a keyboard input
        let isKeyboard = event?.value?.type?.match(/keyboard/i);

        // Collect subsequent keyboard events until a non-keyboard event is encountered
        while (isKeyboard) {
            // Safely extract the next buffered event
            event = StopRecorderCommand.assertEvent(buffer.shift())?.event;

            // Skip invalid or undefined entries
            if (!event) {
                continue;
            }

            // Add the key value to the sequence
            keysBuffer.push(event?.value?.value?.key || '');

            // Peek ahead to determine if the next event is still a keyboard type
            isKeyboard = buffer?.[0]?.value?.type?.match(/keyboard/i);
        }

        // Combine valid keys into a continuous string
        const keys = keysBuffer.filter(i => i !== '').join('');

        // Return a normalized action representing the full key sequence
        return {
            $type: 'Action',
            pluginName: mode === 'standard' ? "SendKeys" : "SendUser32Keys",
            onElement: mode === 'coordinate' ? undefined : event?.value?.chain?.locator,
            argument: '{{$ --Keys: ' + keys + '}}'
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

        // Construct the action rule based on the mouse event type and mode
        const rule: any = {
            $type: 'Action',
            pluginName: mouseEventMap.get(mouseEventType) || 'None',
            onElement: event?.value?.chain?.locator,
            capabilities: {
                x: event?.value?.x,
                y: event?.value?.y
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
     * coming from the same machine (machineName).
     *
     * Unlike a traditional "group by" operation, this method preserves
     * **order and continuity** — meaning if the same machine appears again
     * later in the buffer, it starts a **new group** rather than merging with
     * previous occurrences.
     */
    private static newBufferGroups(buffer: any[]): BufferGroup[] {
        // The final list of groups. Each group contains events with the same machine name.
        const groups: BufferGroup[] = [];

        // Tracks the currently active group being populated.
        let currentGroup: BufferGroup | null = null;

        // Iterate through each event in the buffer in sequential order.
        for (const event of buffer) {
            // When encountering the first event, or when the machine name changes,
            // start a new group with a new incremental ID.
            if (!currentGroup || currentGroup.machineName !== event.value.machineName) {
                currentGroup = {
                    id: groups.length + 1,                // Sequential numeric group ID.
                    machineName: event.value.machineName, // Machine name defining this group.
                    events: []                            // Container for grouped events.
                };
                groups.push(currentGroup);
            }

            // Add the current event to the active group.
            currentGroup.events.push(event);
        }

        // Base URL of the capture service.
        if (currentGroup) {
            currentGroup.baseUrl = buffer[0].baseUrl;
        }

        // Return all constructed machine-based event groups.
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
};
