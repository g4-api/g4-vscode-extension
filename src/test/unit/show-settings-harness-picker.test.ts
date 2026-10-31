/*
 * Unit tests for the harness launcher picker of the Settings editor: the picker starts beside an
 * absolute path, in the workspace for an empty field or a bare command, and offers the launcher and
 * executable types with All Files kept for anything else.
 */
import * as assert from 'node:assert/strict';
import * as path from 'node:path';

import { ShowSettingsCommand } from '../../commands/show-settings';

// A workspace folder for the tests; resolved, so it is absolute on every platform.
const WORKSPACE_FOLDER = path.resolve('workspace');

/**
 * Resolves the picker options through the command's private helper, the way the command calls it.
 *
 * @param currentPath - The path the Executable field holds.
 * @param workspaceFolder - The workspace folder.
 * @returns The picker options.
 */
const getHarnessPickerOptions = (currentPath: string, workspaceFolder: string): PickerOptions =>
    (ShowSettingsCommand as unknown as {
        getHarnessPickerOptions: (currentPath: string, workspaceFolder: string) => PickerOptions;
    }).getHarnessPickerOptions(currentPath, workspaceFolder);

describe('ShowSettingsCommand harness picker', () => {
    it('starts in the folder of an absolute launcher path', () => {
        const launcherPath = path.resolve('partitions', 'g4-explorer', 'start-claude.cmd');

        const options = getHarnessPickerOptions(launcherPath, WORKSPACE_FOLDER);

        assert.equal(options.startFolder, path.dirname(launcherPath));
    });

    it('starts in the workspace for an empty field or a bare command', () => {
        assert.equal(getHarnessPickerOptions('', WORKSPACE_FOLDER).startFolder, WORKSPACE_FOLDER);
        assert.equal(getHarnessPickerOptions('  claude  ', WORKSPACE_FOLDER).startFolder, WORKSPACE_FOLDER);
    });

    it('lets VS Code choose the folder when there is no workspace and no absolute path', () => {
        assert.equal(getHarnessPickerOptions('codex', '').startFolder, '');
    });

    it('offers launchers and executables first, and all files', () => {
        const options = getHarnessPickerOptions('', WORKSPACE_FOLDER);

        assert.deepEqual(Object.keys(options.filters), ['Launchers and Executables', 'All Files']);
        assert.deepEqual(options.filters['Launchers and Executables'], ['cmd', 'bat', 'exe']);
        assert.deepEqual(options.filters['All Files'], ['*']);
    });
});

// The contract below is compile-time only, so it follows the tests. Interfaces come before type
// aliases; inside each group a declaration comes before the ones it uses, and A-Z order decides otherwise.

/**
 * The picker options the tests read; a copy of the command's private contract.
 */
interface PickerOptions {
    /** The file type filters, by their display name. */
    filters: Record<string, string[]>;

    /** The folder the picker opens in, or an empty string. */
    startFolder: string;
}
