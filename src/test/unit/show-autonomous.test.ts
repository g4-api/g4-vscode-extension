/*
 * Unit tests for the autonomous run page data: every manifest recorder becomes a dropdown choice
 * named by its capability label and driver, recording turned off in the settings is reported, and
 * the harnesses reach the page without their executables.
 */
import * as assert from 'node:assert/strict';

import { ShowAutonomousCommand } from '../../commands/show-autonomous';

import { G4AutonomousSettings } from '../../services/g4-autonomous-settings';

import type { AutonomousSettings } from '../../services/g4-autonomous-settings';
import type { RecorderOptions } from '../../services/g4-recording-service';

/**
 * Builds the page data through the command's private builder, the way the command calls it, with the
 * settings resolved from the same manifest.
 *
 * @param manifest - The manifest snapshot.
 * @param recorders - The recorders resolved from the manifest.
 * @returns The page data.
 */
const getAutonomousData = (manifest: unknown, recorders: RecorderOptions[]): PageData =>
    (ShowAutonomousCommand as unknown as {
        getAutonomousData: (manifest: unknown, recorders: RecorderOptions[], settings: AutonomousSettings) => PageData;
    }).getAutonomousData(manifest, recorders, G4AutonomousSettings.resolveAutonomousSettings(manifest));

/**
 * Builds a recorder with the given endpoint, state, and driver parameters and nothing else that
 * affects its choice.
 *
 * @param baseUrl - The recorder endpoint.
 * @param isEnabled - Whether the recorder is enabled in the manifest.
 * @param driverParameters - The recorder driver parameters.
 * @returns The recorder.
 */
const newRecorder = (baseUrl: string, isEnabled: boolean, driverParameters: unknown): RecorderOptions =>
    ({ baseUrl, enabled: isEnabled, driverParameters } as RecorderOptions);

describe('ShowAutonomousCommand page data', () => {
    it('names a recorder by its capability label and driver, with the endpoint as value and hint', () => {
        const recorder = newRecorder('http://localhost:9955', true, {
            driver: 'UiaDriver',
            capabilities: { alwaysMatch: { browserName: 'Uia', 'uia:options': { label: 'machine-a' } } }
        });

        const data = getAutonomousData({}, [recorder]);

        assert.deepEqual(data.recorders, [{
            hint: 'http://localhost:9955',
            isPicked: true,
            text: 'machine-a (UiaDriver)',
            value: 'http://localhost:9955'
        }]);
    });

    it('lists a disabled recorder unpicked, named by its driver when it has no label', () => {
        const recorder = newRecorder('http://localhost:9956', false, { driver: 'ChromeDriver' });

        const data = getAutonomousData({}, [recorder]);

        assert.equal(data.recorders[0].text, 'ChromeDriver');
        assert.equal(data.recorders[0].isPicked, false);
    });

    it('names a recorder without a driver generically', () => {
        const recorder = newRecorder('http://localhost:9957', true, undefined);

        const data = getAutonomousData({}, [recorder]);

        assert.equal(data.recorders[0].text, 'Recorder');
    });

    it('reports recording as off only when the settings turn it off', () => {
        const disabledManifest = { settings: { recorderSettings: { enabled: false } } };

        assert.equal(getAutonomousData({}, []).isRecordingEnabled, true);
        assert.equal(getAutonomousData(disabledManifest, []).isRecordingEnabled, false);
    });

    it('lists the harnesses with their choices and issues, but not their executables', () => {
        const manifest = {
            settings: {
                autonomousSettings: {
                    harnesses: [
                        { name: 'Claude sandbox', type: 'claude', executable: 'start-claude.cmd', models: ['claude-opus-5-5'], efforts: ['high'] },
                        { name: 'Broken', type: 'claude' }
                    ]
                }
            }
        };

        const data = getAutonomousData(manifest, []);

        assert.deepEqual(data.harnesses, [{
            efforts: ['high'],
            isSandbox: true,
            models: ['claude-opus-5-5'],
            name: 'Claude sandbox',
            type: 'claude'
        }]);
        assert.deepEqual(data.harnessIssues, ['Harness "Broken" has no executable and was skipped.']);
    });
});

// The contract below is compile-time only, so it follows the tests.

/**
 * The page data the tests read; a copy of the command's private contract, limited to what is asserted.
 */
interface PageData {
    /** Why harness entries were left out. */
    harnessIssues: string[];

    /** The harnesses offered to the page. */
    harnesses: { efforts: string[], isSandbox: boolean, models: string[], name: string, type: string }[];

    /** Whether recording is on in the settings. */
    isRecordingEnabled: boolean;

    /** One choice per manifest recorder. */
    recorders: { hint: string, isPicked: boolean, text: string, value: string }[];
}
