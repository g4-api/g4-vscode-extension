/*
 * Removes the actions a recorder's `excludeEvents` setting lists from a flow the Hub produced.
 *
 * RESOURCES:
 * Manifest setting: settings.recorderSettings.recorders[].excludeEvents, for example [{ "name": "SubmitForm" }]
 */
import { G4RecordingService } from './g4-recording-service';

import type { RecordingJob } from '../clients/g4-recordings-client';

/**
 * Applies each recorder's excluded events to the flow of a stopped recording session.
 *
 * @remarks
 * The recorders report every event they see and the Hub converts all of them, so deciding which actions a flow
 * keeps is a client decision. The extension only sees the converted flow, so an exclusion names the action as it
 * appears in the flow (the rule's `pluginName`; for the Chromium recorder this is the event name, for example
 * `SubmitForm`). An exclusion applies only to the jobs of the recorder that declares it, which the Hub's
 * job-to-recorder map identifies.
 */
export class G4RecordedEventsFilter {
    /**
     * Normalizes a manifest `excludeEvents` value into a clean list of exclusions.
     *
     * @remarks
     * Compute-only. The manifest can be edited by hand, so anything that is not a list of objects with a text
     * `name` is dropped instead of failing the recording; names are trimmed and empty names are dropped.
     *
     * @param value - The raw `excludeEvents` value from the manifest; a missing value yields an empty list.
     * @returns The exclusions, each with a trimmed, non-empty name.
     */
    public static convertToEventExclusions(value: unknown): RecorderEventExclusion[] {
        // A missing or malformed setting excludes nothing, so older manifests keep every recorded action.
        if (!Array.isArray(value)) {
            return [];
        }

        // Keep only entries that carry a text name, trimmed, so hand edits never produce an empty match.
        const exclusions: RecorderEventExclusion[] = [];

        for (const entry of value) {
            const name = entry?.name;

            if (typeof name !== 'string') {
                continue;
            }

            const trimmedName = name.trim();

            if (trimmedName.length > 0) {
                exclusions.push({ name: trimmedName });
            }
        }

        return exclusions;
    }

    /**
     * Removes the excluded actions from every job the declaring recorder produced.
     *
     * @remarks
     * Mutates the automation's job rules in place, matching how the Stop-Recorder command completes the flow.
     * Names are compared without case. A job missing from the job map belongs to no known recorder and is left
     * untouched, so a Hub that does not publish the map never loses actions.
     *
     * @param options - The automation, the Hub's job map, and the recorders with their exclusions.
     * @returns The number of actions removed.
     */
    public static removeExcludedRules(options: ExcludedRulesOptions): number {
        const { automation, jobs, recorders } = options;
        const flowJobs: any[] = automation?.stages?.[0]?.jobs ?? [];
        let removedCount = 0;

        for (const recorder of recorders) {
            // A recorder without exclusions keeps every action, so its jobs need no work.
            const excludedNames = new Set(recorder.excludeEvents.map(exclusion => exclusion.name.toLowerCase()));

            if (excludedNames.size === 0) {
                continue;
            }

            // Find the recorder's jobs by origin, the form the Hub reports its endpoints in.
            const origin = G4RecordingService.convertToOrigin(recorder.baseUrl);
            const recorderJobs = jobs.filter(job => G4RecordingService.convertToOrigin(job.baseUrl) === origin);

            for (const recorderJob of recorderJobs) {
                // A map entry that points past the flow describes no job, so there is nothing to filter.
                const rules = flowJobs[recorderJob.index]?.rules;

                if (!Array.isArray(rules)) {
                    continue;
                }

                // Keep the rules whose plugin is not excluded, and count what was dropped.
                const keptRules = rules.filter(rule => {
                    const pluginName = rule?.pluginName;
                    const isExcludedRule = typeof pluginName === 'string' && excludedNames.has(pluginName.toLowerCase());

                    return !isExcludedRule;
                });

                // Replace the job's rules with the kept ones so the flow the caller saves no longer holds them.
                removedCount += rules.length - keptRules.length;
                flowJobs[recorderJob.index].rules = keptRules;
            }
        }

        return removedCount;
    }
}

// Compile-time contracts are kept after the executable code: interfaces come before type aliases, and within
// each group a declaration is followed by the contracts it depends on, otherwise the order is A-Z.

/**
 * Options for removing excluded actions from a stopped session's automation.
 */
export interface ExcludedRulesOptions {
    /** The automation returned by the Hub; its job rules are replaced in place. */
    automation: any;

    /** The Hub's job-to-recorder map for the automation; jobs not listed are never filtered. */
    jobs: RecordingJob[];

    /** The recorders of the session with their exclusions. */
    recorders: RecorderEventFilter[];
}

/**
 * The part of a recorder that decides which of its actions are removed from the flow.
 *
 * @remarks
 * Models only the endpoint and the exclusions, so both the manifest recorders and the autonomous run's
 * `recording-request.json` filters can be passed without the rest of the recorder settings.
 */
export interface RecorderEventFilter {
    /** The recorder endpoint, `<schema>://<host>:<port>`, compared with the job map as an origin. */
    baseUrl: string;

    /** The actions removed from the recorder's jobs; an empty list keeps every action. */
    excludeEvents: RecorderEventExclusion[];
}

/**
 * One action removed from a recorder's jobs.
 *
 * @remarks
 * An object rather than a bare name so later fields (for example a type or a condition) can be added without
 * changing the manifest shape.
 */
export interface RecorderEventExclusion {
    /** The action name as it appears in the flow (the rule's `pluginName`), compared without case. */
    name: string;
}
