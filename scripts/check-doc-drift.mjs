/**
 * Fails when the G4 Studio reference pages drift away from the code they describe.
 *
 * @remarks
 * Two checks run on every invocation:
 *
 * 1. Every `contributes.commands[].command` and `contributes.customEditors[].viewType` in
 *    `package.json` must appear in backticks in `resources.docs/command-reference.md`.
 * 2. Every literal `path: 'settings.…'` in the Settings Editor source
 *    (`resources.components/automation-settings/automation-settings.js`) must appear in backticks
 *    in `resources.docs/settings-editor-reference.md`.
 *
 * The script is plain Node with no dependencies. It is compute-only except for reading files and
 * writing the report, and it exits with code 1 when any item is missing.
 *
 * Usage: `node scripts/check-doc-drift.mjs` (or `npm run check:doc-drift`).
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as url from 'node:url';

// Resolves the repository root from this file's location so the script works from any working directory.
const REPOSITORY_ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');

// Pins the four files the checks compare, so a moved file fails loudly instead of passing silently.
const FILES = {
    commandReference: path.join(REPOSITORY_ROOT, 'resources.docs', 'command-reference.md'),
    packageManifest: path.join(REPOSITORY_ROOT, 'package.json'),
    settingsEditorSource: path.join(
        REPOSITORY_ROOT,
        'resources.components',
        'automation-settings',
        'automation-settings.js'),
    settingsReference: path.join(REPOSITORY_ROOT, 'resources.docs', 'settings-editor-reference.md')
};

// Matches a settings path written as a plain string literal; template-literal paths are built at run time.
const SETTINGS_PATH_PATTERN = /path:\s*'(settings\.[A-Za-z0-9_.]+)'/g;

/**
 * Collects every command id and custom editor view type contributed by the extension.
 *
 * @param {object} packageManifest The parsed `package.json`.
 * @returns {string[]} The sorted, unique identifiers that the command reference must mention.
 */
function getContributedIdentifiers(packageManifest) {
    // Read both contribution lists defensively so a manifest without custom editors still works.
    const commands = packageManifest?.contributes?.commands ?? [];
    const customEditors = packageManifest?.contributes?.customEditors ?? [];

    // Merge the two lists into one set so a repeated identifier is reported once.
    const identifiers = new Set();

    for (const command of commands) {
        identifiers.add(command.command);
    }

    for (const customEditor of customEditors) {
        identifiers.add(customEditor.viewType);
    }

    return [...identifiers].sort();
}

/**
 * Collects every literal `settings.*` path used by the Settings Editor source.
 *
 * @param {string} sourceText The text of `automation-settings.js`.
 * @returns {string[]} The sorted, unique settings paths.
 */
function getSettingsPaths(sourceText) {
    // Scan the source once and keep each distinct path in a set.
    const settingsPaths = new Set();

    for (const match of sourceText.matchAll(SETTINGS_PATH_PATTERN)) {
        settingsPaths.add(match[1]);
    }

    return [...settingsPaths].sort();
}

/**
 * Finds the identifiers that a page never mentions in backticks.
 *
 * @param {string[]} identifiers The identifiers that must be documented.
 * @param {string} pageText The text of the reference page.
 * @returns {string[]} The identifiers missing from the page.
 */
function getMissingIdentifiers(identifiers, pageText) {
    return identifiers.filter((identifier) => !pageText.includes('`' + identifier + '`'));
}

/**
 * Reads the four input files, runs both checks and reports the result.
 *
 * @returns {number} The process exit code: 0 when the docs match the code, 1 otherwise.
 */
function invokeChecks() {
    // Stop with a clear message when an input file moved, because a missing file would hide drift.
    const missingFiles = Object.values(FILES).filter((filePath) => !fs.existsSync(filePath));

    if (missingFiles.length > 0) {
        console.error('Doc drift check cannot run. Missing files:');

        for (const filePath of missingFiles) {
            console.error('  ' + path.relative(REPOSITORY_ROOT, filePath));
        }

        return 1;
    }

    // Load the code-side and doc-side inputs once.
    const packageManifest = JSON.parse(fs.readFileSync(FILES.packageManifest, 'utf8'));
    const settingsEditorSource = fs.readFileSync(FILES.settingsEditorSource, 'utf8');
    const commandReferenceText = fs.readFileSync(FILES.commandReference, 'utf8');
    const settingsReferenceText = fs.readFileSync(FILES.settingsReference, 'utf8');

    // Derive what the code contributes and compare it with what each page documents.
    const contributedIdentifiers = getContributedIdentifiers(packageManifest);
    const settingsPaths = getSettingsPaths(settingsEditorSource);
    const missingCommands = getMissingIdentifiers(contributedIdentifiers, commandReferenceText);
    const missingSettings = getMissingIdentifiers(settingsPaths, settingsReferenceText);

    // Report the totals first so a passing run still shows what was compared.
    console.log(`Commands and editors checked: ${contributedIdentifiers.length}, missing: ${missingCommands.length}`);
    console.log(`Settings paths checked: ${settingsPaths.length}, missing: ${missingSettings.length}`);

    // Name each missing item so the author knows exactly which page row to add.
    for (const identifier of missingCommands) {
        console.error(`MISSING in resources.docs/command-reference.md: ${identifier}`);
    }

    for (const settingsPath of missingSettings) {
        console.error(`MISSING in resources.docs/settings-editor-reference.md: ${settingsPath}`);
    }

    return missingCommands.length + missingSettings.length === 0 ? 0 : 1;
}

process.exitCode = invokeChecks();
