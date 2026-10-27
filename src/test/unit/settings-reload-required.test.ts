/*
 * Unit tests for the settings reload decision (N-03): an empty external repository list, stored as
 * [] now and as null by older versions, is not a change that needs a window reload.
 */
import * as assert from 'node:assert/strict';

import { G4SettingsService } from '../../services/g4-settings-service';

// The private decision under test, reached the same way the settings service calls it.
const testReloadRequired = (previousManifest: unknown, currentManifest: unknown): boolean =>
    (G4SettingsService as unknown as {
        testReloadRequired: (previous: unknown, current: unknown) => boolean;
    }).testReloadRequired(previousManifest, currentManifest);

/**
 * Builds a manifest with the given external repositories and nothing else that affects a reload.
 *
 * @param externalRepositories - The repository list, or null as older versions stored it.
 * @returns The manifest.
 */
const newManifest = (externalRepositories: unknown): unknown => ({
    g4Server: { host: 'localhost', port: 9944 },
    settings: { pluginsSettings: { externalRepositories, servers: {} } }
});

describe('G4SettingsService reload decision', () => {
    it('does not ask for a reload when an empty repository list changes between null and []', () => {
        assert.equal(testReloadRequired(newManifest(null), newManifest([])), false);
        assert.equal(testReloadRequired(newManifest([]), newManifest(null)), false);
    });

    it('asks for a reload when a repository is removed', () => {
        const repository = { name: 'atp-repository', url: 'http://localhost:9999', version: 4 };

        assert.equal(testReloadRequired(newManifest([repository]), newManifest([])), true);
    });
});
