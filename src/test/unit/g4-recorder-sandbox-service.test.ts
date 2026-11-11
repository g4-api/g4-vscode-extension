/**
 * Unit tests for the sandbox recorder lookup of G4RecorderSandboxService.
 *
 * The lookup maps a recorder driver to the recorder host DLL and the sandbox folders that may hold it, so the
 * extension starts the right recorder process when "Use Sandbox Recorders" is on.
 */
import * as assert from 'node:assert/strict';
import * as path from 'node:path';

import { G4RecorderSandboxService } from '../../services/g4-recorder-sandbox-service';

/**
 * The private lookup members under test, reached through a cast because they are internal to the service.
 */
interface SandboxLookup {
    /** Returns the candidate folders of a recorder DLL. */
    getSandboxRecorderDirectories(sandboxPath: string, recorderFileName: string): string[];

    /** Returns the recorder DLL of a driver, or an empty string. */
    getSandboxRecorderFileName(driver: string): string;

    /** Returns why a recorder DLL cannot run on a platform, or an empty string. */
    getSandboxRecorderPlatformIssue(recorderFileName: string, platform: NodeJS.Platform): string;
}

const lookup = G4RecorderSandboxService as unknown as SandboxLookup;

describe('G4RecorderSandboxService recorder lookup', () => {
    it('maps each supported driver to its recorder host', () => {
        assert.equal(lookup.getSandboxRecorderFileName('ChromeDriver'), 'G4.Recorders.Chromium.dll');
        assert.equal(lookup.getSandboxRecorderFileName('UiaDriver'), 'G4.Recorders.Uia.dll');
        assert.equal(lookup.getSandboxRecorderFileName(' AndroidDriver '), 'G4.Recorders.Android.dll');
        assert.equal(lookup.getSandboxRecorderFileName('SapDriver'), 'G4.Recorders.Sap.dll');
        assert.equal(lookup.getSandboxRecorderFileName('IosDriver'), '');
    });

    it('looks for the Android recorder in its own sandbox bundle', () => {
        const sandboxPath = path.join('C:', 'g4-sandbox');
        const directories = lookup.getSandboxRecorderDirectories(sandboxPath, 'G4.Recorders.Android.dll');

        assert.deepEqual(directories, [path.join(sandboxPath, 'bot-utilities', 'android-recorder-x64')]);
    });

    it('looks for the SAP recorder in its Windows sandbox bundle', () => {
        const sandboxPath = path.join('C:', 'g4-sandbox');
        const directories = lookup.getSandboxRecorderDirectories(sandboxPath, 'G4.Recorders.Sap.dll');

        assert.deepEqual(directories, [path.join(sandboxPath, 'bot-utilities', 'sap-recorder-win-x64')]);
    });

    it('starts the SAP recorder only on Windows, and every other recorder anywhere', () => {
        assert.equal(lookup.getSandboxRecorderPlatformIssue('G4.Recorders.Sap.dll', 'win32'), '');
        assert.match(lookup.getSandboxRecorderPlatformIssue('G4.Recorders.Sap.dll', 'linux'), /runs only on Windows/);
        assert.match(lookup.getSandboxRecorderPlatformIssue('G4.Recorders.Sap.dll', 'darwin'), /runs only on Windows/);
        assert.equal(lookup.getSandboxRecorderPlatformIssue('G4.Recorders.Android.dll', 'linux'), '');
    });
});
