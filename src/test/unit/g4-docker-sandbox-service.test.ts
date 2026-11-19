/*
 * Unit tests for the Docker sandbox defaults: the manifest of a new Docker sandbox project addresses the Grid
 * and the Chromium recorder by their compose service names, the Chrome base bot runs on the Grid without a host
 * browser path, and only a manifest marked as Docker gets a recording browser address.
 */
import * as assert from 'node:assert/strict';

import { Global } from '../../constants/global';

import { G4DockerSandboxService } from '../../services/g4-docker-sandbox-service';

// Grid endpoint and recorder host as the Hub container sees them in the sandbox compose stack.
const GRID_URL = 'http://router:4444/wd/hub';
const RECORDER_HOST = 'chromium-recorder';

/**
 * Builds a detached copy of the packaged manifest, the input New-Project gives the service.
 *
 * @returns The manifest copy.
 */
const newManifest = (): any => structuredClone(Global.BASE_MANIFEST);

/**
 * Finds a recorder of the manifest by its driver identity.
 *
 * @param manifest - The manifest to search.
 * @param driverName - The driver identity, for example `ChromeDriver`.
 * @returns The recorder entry.
 */
const getRecorder = (manifest: any, driverName: string): any =>
    manifest.settings.recorderSettings.recorders.find((recorder: any) => recorder.driverParameters.driver === driverName);

/**
 * Builds serialized Chrome automation-base content with a host browser path.
 *
 * @returns The serialized base.
 */
const newChromeBaseContent = (): string => JSON.stringify({
    driverParameters: {
        capabilities: {
            alwaysMatch: {
                browserName: 'chrome',
                'goog:chromeOptions': { args: ['--disable-gpu'], binary: String.raw`C:\g4-sandbox\browsers\chrome\chrome.exe` }
            }
        },
        driver: 'ChromeDriver',
        driverBinaries: '.'
    },
    reference: { id: 'base' }
});

describe('G4DockerSandboxService manifest defaults', () => {
    it('marks the project and points project-level automation at the Grid router', () => {
        const manifest = newManifest();

        G4DockerSandboxService.setManifestDefaults(manifest);

        assert.equal(manifest.sandboxType, 'docker');
        assert.equal(manifest.driverParameters.driverBinaries, GRID_URL);
        assert.equal(manifest.sandbox, undefined);
    });

    it('switches the Chromium recorder on at its compose host and keeps local start off', () => {
        const manifest = newManifest();
        manifest.settings.recorderSettings.useSandbox = true;

        G4DockerSandboxService.setManifestDefaults(manifest);

        const chromiumRecorder = getRecorder(manifest, 'ChromeDriver');

        assert.equal(chromiumRecorder.host, RECORDER_HOST);
        assert.equal(chromiumRecorder.port, '9956');
        assert.equal(chromiumRecorder.enabled, true);
        assert.equal(manifest.settings.recorderSettings.useSandbox, false);
    });

    it('leaves the recorders the compose stack does not have as packaged', () => {
        const manifest = newManifest();
        const packagedManifest = newManifest();

        G4DockerSandboxService.setManifestDefaults(manifest);

        for (const driverName of ['UiaDriver', 'SapDriver']) {
            assert.deepEqual(getRecorder(manifest, driverName), getRecorder(packagedManifest, driverName));
        }
    });

    it('leaves the Hub endpoint on the published host port', () => {
        const manifest = newManifest();

        G4DockerSandboxService.setManifestDefaults(manifest);

        assert.deepEqual(manifest.g4Server, Global.BASE_MANIFEST.g4Server);
    });

    it('removes the local sandbox folder and the host browser path of an existing project', () => {
        const manifest = newManifest();
        manifest.sandbox = String.raw`C:\g4-sandbox\g4-sandbox-v1`;

        G4DockerSandboxService.setManifestDefaults(manifest);

        const chromiumRecorder = getRecorder(manifest, 'ChromeDriver');
        const chromeOptions = chromiumRecorder.driverParameters.capabilities.alwaysMatch['goog:chromeOptions'];

        assert.equal('sandbox' in manifest, false);
        assert.equal('binary' in chromeOptions, false);
        assert.deepEqual(chromeOptions.args, ['--disable-gpu']);
        assert.equal(chromiumRecorder.driverParameters.driverBinaries, GRID_URL);
    });

    it('accepts a partial manifest without recorder settings', () => {
        const manifest: any = { driverParameters: { driver: 'ChromeDriver', driverBinaries: '.' } };

        G4DockerSandboxService.setManifestDefaults(manifest);

        assert.deepEqual(manifest, {
            driverParameters: { driver: 'ChromeDriver', driverBinaries: GRID_URL },
            sandboxType: 'docker'
        });
    });
});

describe('G4DockerSandboxService Chrome base content', () => {
    it('sends sessions to the Grid router and removes the host browser path', () => {
        const chromeBase = JSON.parse(G4DockerSandboxService.getChromeBaseContent(newChromeBaseContent()));
        const chromeOptions = chromeBase.driverParameters.capabilities.alwaysMatch['goog:chromeOptions'];

        assert.equal(chromeBase.driverParameters.driverBinaries, GRID_URL);
        assert.equal('binary' in chromeOptions, false);
    });

    it('keeps every other packaged field', () => {
        const chromeBase = JSON.parse(G4DockerSandboxService.getChromeBaseContent(newChromeBaseContent()));

        assert.deepEqual(chromeBase.driverParameters.capabilities.alwaysMatch['goog:chromeOptions'].args, ['--disable-gpu']);
        assert.equal(chromeBase.driverParameters.capabilities.alwaysMatch.browserName, 'chrome');
        assert.equal(chromeBase.driverParameters.driver, 'ChromeDriver');
        assert.deepEqual(chromeBase.reference, { id: 'base' });
    });

    it('returns content it cannot parse, or without driver parameters, unchanged', () => {
        const baseWithoutDriver = JSON.stringify({ reference: { id: 'base' } });

        assert.equal(G4DockerSandboxService.getChromeBaseContent('{ not json'), '{ not json');
        assert.equal(G4DockerSandboxService.getChromeBaseContent(baseWithoutDriver), baseWithoutDriver);
    });
});

describe('G4DockerSandboxService project detection and recording browser', () => {
    it('recognizes only a manifest marked as Docker, ignoring letter case', () => {
        assert.equal(G4DockerSandboxService.testDockerSandbox({ sandboxType: 'docker' }), true);
        assert.equal(G4DockerSandboxService.testDockerSandbox({ sandboxType: ' Docker ' }), true);
        assert.equal(G4DockerSandboxService.testDockerSandbox({ sandboxType: 'local' }), false);
        assert.equal(G4DockerSandboxService.testDockerSandbox({ sandboxType: { kind: 'docker' } }), false);
        assert.equal(G4DockerSandboxService.testDockerSandbox(newManifest()), false);
        assert.equal(G4DockerSandboxService.testDockerSandbox(undefined), false);
        assert.equal(G4DockerSandboxService.testDockerSandbox(null), false);
    });

    it('builds the recording browser address from the Hub host of a Docker project', () => {
        const manifest = newManifest();
        G4DockerSandboxService.setManifestDefaults(manifest);

        assert.equal(
            G4DockerSandboxService.getRecordingBrowserUrl(manifest),
            'http://localhost:7901/?autoconnect=1&resize=scale'
        );

        manifest.g4Server.host = 'docker-machine';

        assert.equal(
            G4DockerSandboxService.getRecordingBrowserUrl(manifest),
            'http://docker-machine:7901/?autoconnect=1&resize=scale'
        );
    });

    it('falls back to localhost when the Hub host is missing or not text', () => {
        const expectedUrl = 'http://localhost:7901/?autoconnect=1&resize=scale';

        assert.equal(G4DockerSandboxService.getRecordingBrowserUrl({ sandboxType: 'docker' }), expectedUrl);
        assert.equal(G4DockerSandboxService.getRecordingBrowserUrl({ g4Server: { host: {} }, sandboxType: 'docker' }), expectedUrl);
        assert.equal(G4DockerSandboxService.getRecordingBrowserUrl({ g4Server: { host: '  ' }, sandboxType: 'docker' }), expectedUrl);
    });

    it('has no recording browser for a project that does not use the Docker sandbox', () => {
        assert.equal(G4DockerSandboxService.getRecordingBrowserUrl(newManifest()), undefined);
        assert.equal(G4DockerSandboxService.getRecordingBrowserUrl(undefined), undefined);
    });
});
