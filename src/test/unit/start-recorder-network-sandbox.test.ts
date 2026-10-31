/*
 * Unit tests for the Chrome network-sandbox switch of the Start-Recorder command: every Chromium recorder gets
 * --disable-features=NetworkServiceSandbox merged into its Chrome arguments, the manifest's recorder objects stay
 * unchanged, and desktop recorders are sent exactly as configured.
 */
import * as assert from 'node:assert/strict';

import { StartRecorderCommand } from '../../commands/start-recorder';

import type { RecorderOptions } from '../../services/g4-recording-service';

/**
 * Builds a recorder with the given driver parameters and nothing else that affects the switch.
 *
 * @param driverParameters - The recorder driver parameters.
 * @returns The recorder.
 */
const newRecorder = (driverParameters: unknown): RecorderOptions =>
    ({ baseUrl: 'http://localhost:9956', enabled: true, driverParameters } as RecorderOptions);

/**
 * Builds Chrome driver parameters with the given browser arguments.
 *
 * @param argumentsList - The Chrome command-line arguments.
 * @returns The driver parameters.
 */
const newChromeParameters = (argumentsList: string[]): unknown => ({
    capabilities: {
        alwaysMatch: {
            browserName: 'chrome',
            'goog:chromeOptions': { args: argumentsList, binary: 'C:/g4/chrome.exe' }
        }
    },
    driver: 'ChromeDriver'
});

/**
 * Reads the Chrome arguments a recorder will send to the Hub.
 *
 * @param recorder - The recorder returned by the switch.
 * @returns The Chrome command-line arguments.
 */
const getChromeArguments = (recorder: RecorderOptions): unknown[] =>
    recorder.driverParameters.capabilities.alwaysMatch['goog:chromeOptions'].args;

describe('StartRecorderCommand Chrome network sandbox switch', () => {
    it('adds the switch to a Chromium recorder and keeps its other arguments', () => {
        const [recorder] = StartRecorderCommand.addNetworkSandboxSwitch([newRecorder(newChromeParameters(['--disable-gpu']))]);

        assert.deepEqual(getChromeArguments(recorder), ['--disable-gpu', '--disable-features=NetworkServiceSandbox']);
        assert.equal(recorder.driverParameters.capabilities.alwaysMatch['goog:chromeOptions'].binary, 'C:/g4/chrome.exe');
    });

    it('merges into an existing disable-features argument instead of adding a second one', () => {
        const parameters = newChromeParameters(['--disable-features=Translate,AutofillServerCommunication', '--disable-gpu']);
        const [recorder] = StartRecorderCommand.addNetworkSandboxSwitch([newRecorder(parameters)]);

        assert.deepEqual(getChromeArguments(recorder), [
            '--disable-features=Translate,AutofillServerCommunication,NetworkServiceSandbox',
            '--disable-gpu'
        ]);
    });

    it('adds the feature only once when it is already turned off', () => {
        const parameters = newChromeParameters(['--disable-features=NetworkServiceSandbox']);
        const [recorder] = StartRecorderCommand.addNetworkSandboxSwitch([newRecorder(parameters)]);

        assert.deepEqual(getChromeArguments(recorder), ['--disable-features=NetworkServiceSandbox']);
    });

    it('creates the Chrome options when the recorder has none', () => {
        const [recorder] = StartRecorderCommand.addNetworkSandboxSwitch([newRecorder({ driver: 'chromedriver' })]);

        assert.deepEqual(getChromeArguments(recorder), ['--disable-features=NetworkServiceSandbox']);
    });

    it('never changes the manifest recorder it was given', () => {
        const original = newRecorder(newChromeParameters(['--disable-gpu']));
        const snapshot = structuredClone(original);

        StartRecorderCommand.addNetworkSandboxSwitch([original]);

        assert.deepEqual(original, snapshot);
    });

    it('sends a desktop recorder exactly as configured', () => {
        const uiaRecorder = newRecorder({ capabilities: { alwaysMatch: { browserName: 'Uia' } }, driver: 'UiaDriver' });
        const [recorder] = StartRecorderCommand.addNetworkSandboxSwitch([uiaRecorder]);

        assert.equal(recorder, uiaRecorder);
    });
});
