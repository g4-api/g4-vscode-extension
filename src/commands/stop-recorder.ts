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
import { Utilities } from '../extensions/utilities';


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

    // TODO: Add new job to create a job from a recording batched actions.
    /**
     * Command execution entry point. Starts all configured EventCaptureService
     * connections (one per endpoint).
     *
     * @param args Optional arguments passed when invoking the command.
     */
    protected async onInvokeCommand(_?: any): Promise<void> {
        // Determine which connection captured the earliest event
        const connection = StopRecorderCommand.getFirstCaptureService(this._connections);

        // If no connections are active, log a warning and exit
        if (!connection) {
            this.logger.warning('No active EventCaptureService connections found to stop.');
            return;
        }

        try {
            // Merge all buffers into one array & sort ascending by timestamp
            const buffer = Array
                .from(this._connections.values())
                .flatMap(service => service.buffer)
                .sort((a, b) => a.timestamp - b.timestamp);

            // Buffer to accumulate consecutive keyboard keys
            const keysBuffer: string[] = [];

            // Create a new automation object to hold the recorded actions
            const automation = StopRecorderCommand.newAutomation(connection?.options.driverParameters);

            // Determine machine name from the first event in the buffer
            let machineName = buffer[0]?.value?.machineName || 'unknown-machine';

            while (buffer.length > 0) {
                let event = StopRecorderCommand.assertEvent(buffer.shift())?.event;

                if (!event) {
                    continue;
                }

                const isJobsEmpty = !automation.stages[0].jobs || automation.stages[0].jobs.length === 0;
                const machineNameMatch = event?.value?.machineName === machineName;

                if (isJobsEmpty || !machineNameMatch) {
                    const id = `recorded-actions-job-${machineName.toLowerCase()}`;
                    const job = StopRecorderCommand.newJob(id, []);
                    const service = Array
                        .from(this._connections.values())
                        .find(service => service.buffer?.[0]?.machineName === machineName);

                    const driverParameters = service?.options?.driverParameters || {};

                    job.reference.name = `Recorded Actions Job (${machineName})`;
                    job.reference.description = `Job to execute all recorded actions from machine ${machineName}.`;
                    job.driverParameters = automation.stages[0].jobs.length === 1
                        ? driverParameters
                        : {};

                    if (automation.stages[0].jobs.length > 0) {
                        automation.stages[0].jobs.at(-1)?.rules.push({
                            $type: 'Action',
                            pluginName: "CloseBrowser"
                        });
                    }

                    automation.stages[0].jobs.push(job);
                }

                if (event?.value?.type?.match(/mouse/gi)) {
                    const mouseAction = StopRecorderCommand.resolveMouseEvent(event);

                    automation.stages[0].jobs.at(-1)?.rules.push(mouseAction);

                    continue;
                }

                let isKeyboard = event?.value?.type?.match(/keyboard/i);
                keysBuffer.length = 0;
                keysBuffer.push(event?.value?.value?.key || '');

                while (isKeyboard) {

                    event = StopRecorderCommand.assertEvent(buffer.shift())?.event;

                    if (!event) {
                        continue;
                    }

                    keysBuffer.push(event?.value?.value?.key || '');
                    isKeyboard = buffer?.[0]?.value?.type?.match(/keyboard/i);
                }

                automation.stages[0].jobs.at(-1)?.rules.push({
                    $type: 'Action',
                    pluginName: "SendUser32Keys",
                    onElement: event?.value?.chain?.locator,
                    argument: '{{$ --Keys: ' + keysBuffer.join('') + '}}'
                });
            }

            automation.stages[0].jobs.at(-1)?.rules.push({
                $type: 'Action',
                pluginName: "CloseBrowser"
            });

            new ShowWorkflowCommand(this._context, this.endpoint).invokeCommand({
                workflow: automation
            });
        }
        catch (error: any) {
            this.logger.error(error?.message || 'An unknown error occurred while stopping the recorder.');
        }
        finally {
            connection?.disconnect();
            for (const service of this._connections.values()) {
                service.clearBuffer();
            }
        }
    }

    private static assertEvent(event: any): any {
        const isDown = event?.value?.event.match(/down/i);
        if (isDown) {
            return null;
        }

        const isUp = event?.value?.event.match(/up/i);

        if (!isUp) {
            return null;
        }

        const path = event?.value?.chain?.path || [];
        const element = path.at(-1) ?? null;

        if (!element) {
            return null;
        }

        const bounds = element.bounds || {};
        const id = `${bounds.height};${bounds.X};${bounds.Y};${bounds.width}`;

        return {
            id,
            bounds,
            event: event,
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
    private static newAutomation(driverParameters: any): any {
        // Retrieve the current manifest, which holds configuration and authentication info.
        const manifest = Utilities.getManifest();

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
     * Creates a new Job object representing a single execution unit
     * that groups together a list of rules (actions or operations).
     *
     * This method standardizes the structure of a "job" object used by
     * automation or workflow systems — ensuring consistent naming,
     * description, and reference metadata.
     */
    private static newJob(id: string, rules: any[]): any {
        return {
            // Metadata about the job, including its ID, display name, and purpose.
            reference: {
                id: id,
                name: "Recorded Actions Job",
                description: "Job to execute all recorded actions."
            },

            // The rules or actions that this job will execute in sequence or parallel,
            // depending on the workflow engine.
            rules: rules || []
        };
    }

    private static resolveMouseEvent(event: any): any {
        const isLeft = event?.value?.event.match(/left/i);
        const isRight = event?.value?.event.match(/right/i);
        const isMiddle = event?.value?.event.match(/middle/i);

        let g4Action: string;
        if (isLeft) {
            g4Action = 'InvokeUser32Click';
        } else if (isRight) {
            g4Action = 'InvokeUser32ContextClick';
        } else {
            g4Action = 'None';
        }

        return {
            $type: 'Action',
            pluginName: g4Action,
            onElement: event?.value?.chain?.locator,
            capabilities: {
                x: event?.value?.x,
                y: event?.value?.y
            }
        };
    }
}
