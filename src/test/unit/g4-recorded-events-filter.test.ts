/*
 * Unit tests for the recorders' excluded events: a manifest `excludeEvents` list is normalized, and the listed
 * actions are removed only from the jobs of the recorder that declares them, as named in the Hub's job map.
 * The DOM context the Hub adds to rule capabilities is removed only for recorders that exclude it, and the
 * new-project manifest template is checked too, so new projects keep excluding SubmitForm and the DOM context.
 */
import * as assert from 'node:assert/strict';

import { Global } from '../../constants/global';

import { G4RecordedEventsFilter } from '../../services/g4-recorded-events-filter';

import type { RecordingJob } from '../../clients/g4-recordings-client';

import type { RecorderEventFilter } from '../../services/g4-recorded-events-filter';

/**
 * Builds a one-stage automation whose jobs hold rules with the given plugin names.
 *
 * @param jobsPlugins - The plugin names of each job's rules, in job order.
 * @returns The automation.
 */
const newAutomation = (jobsPlugins: string[][]): any => ({
    stages: [{
        jobs: jobsPlugins.map((plugins, index) => ({
            reference: { id: `job-${index + 1}` },
            rules: plugins.map((pluginName) => ({ $type: 'Action', pluginName }))
        }))
    }]
});

/**
 * Reads the plugin names of every job of an automation.
 *
 * @param automation - The automation.
 * @returns The plugin names of each job's rules, in job order.
 */
const getJobsPlugins = (automation: any): string[][] =>
    automation.stages[0].jobs.map((job: any) => job.rules.map((rule: any) => rule.pluginName));

// A Chromium login job (job 0) and a desktop job (job 1) that both hold a SubmitForm action.
const CHROMIUM_URL = 'http://localhost:9956';
const DESKTOP_URL = 'http://localhost:9955';
const JOBS: RecordingJob[] = [
    { baseUrl: CHROMIUM_URL, id: 'job-1', index: 0 },
    { baseUrl: DESKTOP_URL, id: 'job-2', index: 1 }
];

/**
 * Builds the automation of a session in which both recorders captured a SubmitForm action.
 *
 * @returns The automation.
 */
const newSessionAutomation = (): any => newAutomation([
    ['OpenUrl', 'InvokeClick', 'SubmitForm', 'CloseBrowser'],
    ['InvokeUser32Click', 'SubmitForm']
]);

describe('G4RecordedEventsFilter.convertToEventExclusions', () => {
    it('keeps named entries trimmed and drops anything a hand edit could leave behind', () => {
        const exclusions = G4RecordedEventsFilter.convertToEventExclusions([
            { name: ' SubmitForm ' },
            { name: '' },
            { name: '   ' },
            { name: 42 },
            'SubmitForm',
            null,
            {},
            { name: 'InvokeScroll', type: 'Mouse' }
        ]);

        assert.deepEqual(exclusions, [{ name: 'SubmitForm' }, { name: 'InvokeScroll' }]);
    });

    it('excludes nothing when the setting is missing or is not a list', () => {
        for (const value of [undefined, null, 'SubmitForm', { name: 'SubmitForm' }]) {
            assert.deepEqual(G4RecordedEventsFilter.convertToEventExclusions(value), []);
        }
    });
});

describe('G4RecordedEventsFilter.removeExcludedRules', () => {
    it('removes an excluded action only from the jobs of the recorder that declares it', () => {
        const automation = newSessionAutomation();
        const recorders: RecorderEventFilter[] = [
            { baseUrl: CHROMIUM_URL, excludeDomContext: false, excludeEvents: [{ name: 'SubmitForm' }] },
            { baseUrl: DESKTOP_URL, excludeDomContext: false, excludeEvents: [] }
        ];

        const removedCount = G4RecordedEventsFilter.removeExcludedRules({ automation, jobs: JOBS, recorders });

        assert.equal(removedCount, 1);
        assert.deepEqual(getJobsPlugins(automation), [
            ['OpenUrl', 'InvokeClick', 'CloseBrowser'],
            ['InvokeUser32Click', 'SubmitForm']
        ]);
    });

    it('compares names without case and endpoints as origins', () => {
        const automation = newSessionAutomation();
        const recorders: RecorderEventFilter[] = [
            { baseUrl: 'HTTP://LocalHost:9956/', excludeDomContext: false, excludeEvents: [{ name: 'submitform' }] }
        ];

        const removedCount = G4RecordedEventsFilter.removeExcludedRules({ automation, jobs: JOBS, recorders });

        assert.equal(removedCount, 1);
        assert.deepEqual(getJobsPlugins(automation)[0], ['OpenUrl', 'InvokeClick', 'CloseBrowser']);
    });

    it('keeps every action when no recorder excludes anything', () => {
        const automation = newSessionAutomation();
        const recorders: RecorderEventFilter[] = [
            { baseUrl: CHROMIUM_URL, excludeDomContext: false, excludeEvents: [] },
            { baseUrl: DESKTOP_URL, excludeDomContext: false, excludeEvents: [] }
        ];

        const removedCount = G4RecordedEventsFilter.removeExcludedRules({ automation, jobs: JOBS, recorders });

        assert.equal(removedCount, 0);
        assert.deepEqual(automation, newSessionAutomation());
    });

    it('leaves jobs alone that the job map does not assign, or that are not in the flow', () => {
        const automation = newSessionAutomation();
        const recorders: RecorderEventFilter[] = [
            { baseUrl: CHROMIUM_URL, excludeDomContext: false, excludeEvents: [{ name: 'SubmitForm' }] }
        ];
        const outsideJobs: RecordingJob[] = [{ baseUrl: CHROMIUM_URL, id: 'job-9', index: 9 }];

        assert.equal(G4RecordedEventsFilter.removeExcludedRules({ automation, jobs: [], recorders }), 0);
        assert.equal(G4RecordedEventsFilter.removeExcludedRules({ automation, jobs: outsideJobs, recorders }), 0);
        assert.deepEqual(automation, newSessionAutomation());
    });

    it('tolerates an automation without stages', () => {
        const recorders: RecorderEventFilter[] = [
            { baseUrl: CHROMIUM_URL, excludeDomContext: false, excludeEvents: [{ name: 'SubmitForm' }] }
        ];

        assert.equal(G4RecordedEventsFilter.removeExcludedRules({ automation: {}, jobs: JOBS, recorders }), 0);
        assert.equal(G4RecordedEventsFilter.removeExcludedRules({ automation: undefined, jobs: JOBS, recorders }), 0);
    });
});

describe('G4RecordedEventsFilter.removeDomContext', () => {
    /**
     * Builds a session whose Chromium job (job 0) and desktop job (job 1) both carry a DOM context.
     *
     * @returns The automation.
     */
    const newContextAutomation = (): any => ({
        stages: [{
            jobs: [
                {
                    rules: [
                        { pluginName: 'OpenUrl', argument: 'https://example.com' },
                        { pluginName: 'InvokeClick', capabilities: { elementName: 'Login', domContext: 'PGEvPg==', domContextLength: 4 } },
                        { pluginName: 'SendKeys', capabilities: { domContext: 'PGkvPg==' } }
                    ]
                },
                {
                    rules: [
                        { pluginName: 'InvokeUser32Click', capabilities: { elementName: 'OK', domContext: 'PGIvPg==' } }
                    ]
                }
            ]
        }]
    });

    it('removes the context from an excluding recorder and drops capabilities left empty', () => {
        const automation = newContextAutomation();
        const recorders: RecorderEventFilter[] = [
            { baseUrl: CHROMIUM_URL, excludeDomContext: true, excludeEvents: [] },
            { baseUrl: DESKTOP_URL, excludeDomContext: false, excludeEvents: [] }
        ];

        const clearedCount = G4RecordedEventsFilter.removeDomContext({ automation, jobs: JOBS, recorders });
        const [chromiumJob, desktopJob] = automation.stages[0].jobs;

        assert.equal(clearedCount, 2);
        assert.deepEqual(chromiumJob.rules[0], { pluginName: 'OpenUrl', argument: 'https://example.com' });
        assert.deepEqual(chromiumJob.rules[1].capabilities, { elementName: 'Login' });
        assert.equal('capabilities' in chromiumJob.rules[2], false);
        assert.deepEqual(desktopJob.rules[0].capabilities, { elementName: 'OK', domContext: 'PGIvPg==' });
    });

    it('keeps the context when every recorder keeps it, or when the job map assigns no job', () => {
        const keepingRecorders: RecorderEventFilter[] = [
            { baseUrl: CHROMIUM_URL, excludeDomContext: false, excludeEvents: [] }
        ];
        const excludingRecorders: RecorderEventFilter[] = [
            { baseUrl: CHROMIUM_URL, excludeDomContext: true, excludeEvents: [] }
        ];
        const automation = newContextAutomation();

        assert.equal(G4RecordedEventsFilter.removeDomContext({ automation, jobs: JOBS, recorders: keepingRecorders }), 0);
        assert.equal(G4RecordedEventsFilter.removeDomContext({ automation, jobs: [], recorders: excludingRecorders }), 0);
        assert.deepEqual(automation, newContextAutomation());
    });
});

describe('New project manifest excluded events', () => {
    it('excludes SubmitForm on the Chromium recorder and nothing on the desktop recorder', () => {
        const recorders: any[] = Global.BASE_MANIFEST.settings.recorderSettings.recorders;
        const getExclusions = (driver: string): unknown => {
            const recorder = recorders.find((item) => item.driverParameters?.driver === driver);

            return G4RecordedEventsFilter.convertToEventExclusions(recorder?.excludeEvents);
        };

        assert.deepEqual(getExclusions('ChromeDriver'), [{ name: 'SubmitForm' }]);
        assert.deepEqual(getExclusions('UiaDriver'), []);
    });

    it('leaves the DOM context out of the flow on every recorder', () => {
        const recorders: any[] = Global.BASE_MANIFEST.settings.recorderSettings.recorders;

        assert.ok(recorders.length > 0);
        assert.ok(recorders.every((recorder) => recorder.excludeDomContext === true));
    });
});
