/*
 * Unit tests for the autonomous run settings: defaults, harness entries that cannot run, sandbox
 * detection, list cleaning, and recorder names.
 */
import * as assert from 'node:assert/strict';

import { G4AutonomousSettings } from '../../services/g4-autonomous-settings';

import type { RecorderOptions } from '../../services/g4-recording-service';

/**
 * Wraps autonomous settings in a manifest.
 *
 * @param autonomousSettings - The `settings.autonomousSettings` section.
 * @returns The manifest.
 */
const newManifest = (autonomousSettings: unknown): unknown => ({ settings: { autonomousSettings } });

describe('G4AutonomousSettings', () => {
    it('uses the defaults when the manifest has no autonomous settings', () => {
        const settings = G4AutonomousSettings.resolveAutonomousSettings({});

        assert.deepEqual(settings, { harnesses: [], issues: [], runsFolder: 'autonomous-runs', timeoutMinutes: 60 });
    });

    it('resolves a sandbox launcher and a machine executable, with clean model and effort lists', () => {
        const settings = G4AutonomousSettings.resolveAutonomousSettings(newManifest({
            runsFolder: ' runs ',
            timeoutMinutes: 15,
            harnesses: [
                {
                    name: 'Claude sandbox',
                    type: 'Claude',
                    executable: String.raw`E:\partitions\g4-explorer\start-claude.CMD`,
                    models: ['claude-opus-5-5', ' ', 'claude-opus-5-5', 'claude-haiku-4-5'],
                    efforts: ['high', 7],
                    requiredToolServers: [' g4-uia-recorder ', 'g4-uia-recorder', {}]
                },
                { type: 'codex', executable: 'codex.exe', arguments: ['--sandbox', 'danger-full-access'] }
            ]
        }));

        assert.equal(settings.runsFolder, 'runs');
        assert.equal(settings.timeoutMinutes, 15);
        assert.deepEqual(settings.issues, []);
        assert.deepEqual(settings.harnesses, [
            {
                arguments: [],
                efforts: ['high'],
                executable: String.raw`E:\partitions\g4-explorer\start-claude.CMD`,
                isSandbox: true,
                models: ['claude-opus-5-5', 'claude-haiku-4-5'],
                name: 'Claude sandbox',
                requiredToolServers: ['g4-uia-recorder'],
                type: 'claude'
            },
            {
                arguments: ['--sandbox', 'danger-full-access'],
                efforts: [],
                executable: 'codex.exe',
                isSandbox: false,
                models: [],
                name: 'codex 2',
                requiredToolServers: [],
                type: 'codex'
            }
        ]);
    });

    it('leaves out entries that cannot run and says why', () => {
        const settings = G4AutonomousSettings.resolveAutonomousSettings(newManifest({
            timeoutMinutes: -5,
            harnesses: [
                'claude',
                { name: 'Gemini', type: 'gemini', executable: 'gemini.exe' },
                { name: 'No executable', type: 'claude' },
                { name: 'Twice', type: 'opencode', executable: 'opencode.exe' },
                { name: 'Twice', type: 'codex', executable: 'codex.exe' }
            ]
        }));

        assert.equal(settings.timeoutMinutes, 60);
        assert.deepEqual(settings.harnesses.map((harness) => [harness.name, harness.type]), [['Twice', 'opencode']]);
        assert.deepEqual(settings.issues, [
            'Harness 1 is not an object and was skipped.',
            'Harness 2 has an unknown type "gemini"; use claude, codex, or opencode.',
            'Harness "No executable" has no executable and was skipped.',
            'Harness "Twice" is listed more than once; only the first entry is used.'
        ]);
    });

    it('names a recorder by its capability label and driver, or by its driver alone', () => {
        const labelled = {
            driverParameters: {
                driver: 'UiaDriver',
                capabilities: { alwaysMatch: { browserName: 'Uia', 'uia:options': { label: 'machine-a' } } }
            }
        } as RecorderOptions;
        const unlabelled = { driverParameters: { driver: 'ChromeDriver' } } as RecorderOptions;
        const unnamed = { driverParameters: {} } as RecorderOptions;

        assert.equal(G4AutonomousSettings.getRecorderName(labelled), 'machine-a (UiaDriver)');
        assert.equal(G4AutonomousSettings.getRecorderName(unlabelled), 'ChromeDriver');
        assert.equal(G4AutonomousSettings.getRecorderName(unnamed), 'Recorder');
    });
});
