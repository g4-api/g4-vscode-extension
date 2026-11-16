/*
 * The manifest branding: the labels VS Code reads from package.json before the extension runs.
 *
 * The command prefix (category), the command titles, the activity bar tooltip (the container title), the view names,
 * the settings title, and the editor names live in package.json. VS Code reads them when it scans the extensions, and
 * no API changes them while the window runs. package.json therefore names them as %key% placeholders, which VS Code
 * fills from package.nls.json. On activation the extension fills a token template with the G4 Hub branding, writes
 * the result over its installed package.nls.json, and clears the VS Code cache of scanned extension manifests, so the
 * next window load shows the branded labels.
 *
 * RESOURCES:
 * Manifest localization: https://code.visualstudio.com/api/references/extension-manifest
 */
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { Utilities } from '../extensions/utilities';

// The character code of a byte order mark at the start of a file, which JSON.parse refuses.
const BYTE_ORDER_MARK_CODE = 0xFEFF;

// The manifest labels VS Code reads; the only file of the install folder this service writes.
const LABELS_FILE = 'package.nls.json';

// The labels in token form, such as "Create a New {product} Project"; shipped with the extension and never written.
const TEMPLATE_FILE = path.join('resources.branding', 'package.nls.template.json');

// The folder of the VS Code user data that holds one cache folder per profile.
const PROFILES_CACHE_FOLDER = 'CachedProfilesData';

// The cache of scanned user extension manifests in each profile folder. Some VS Code versions reuse it across window
// loads and even restarts, so a rewritten package.nls.json shows only after the cache is removed.
const MANIFEST_CACHE_FILE = 'extensions.user.cache';

// How many parent folders the user data search climbs from the global storage folder; profiles nest it at most a few
// levels deep, so the search never wanders far up the disk.
const MAXIMUM_USER_DATA_DEPTH = 6;

/**
 * Writes the branded manifest labels over the installed package.nls.json.
 *
 * @remarks
 * Static, because the installed labels are one file for the whole extension host. The branding arrives as a text
 * resolver in the options, so the service has no dependency on the branding service and is testable without VS Code.
 */
export class G4ManifestBrandingService {
    /**
     * Fills the label template with the branding and writes it over the installed labels when they differ.
     *
     * @remarks
     * Never throws. A missing template, a write that fails, or a cache that cannot be removed keeps the installed
     * labels or the cache and writes one warning, so branding never breaks activation. A change shows from the next
     * window load; the caller decides whether to offer a reload.
     *
     * @param options - The install folder, the global storage folder, the text resolver, and the logger.
     * @returns True when the installed labels were replaced.
     */
    public static async updateAsync(options: UpdateManifestBrandingOptions): Promise<boolean> {
        // Read the token template; without it there is nothing to brand, so the installed labels stay.
        const template = await G4ManifestBrandingService.readLabelsAsync(path.join(options.extensionPath, TEMPLATE_FILE));

        if (template === undefined) {
            options.logger.warning(`The manifest label template ${TEMPLATE_FILE} is missing; the installed labels are kept.`);

            return false;
        }

        // Fill every template label with the branding, so each key carries its branded text.
        const labels: Record<string, string> = {};

        for (const [key, text] of Object.entries(template)) {
            labels[key] = options.getText(text);
        }

        // Compare with the installed labels, so an unchanged branding writes nothing and asks for no reload.
        const labelsPath = path.join(options.extensionPath, LABELS_FILE);
        const installedLabels = await G4ManifestBrandingService.readLabelsAsync(labelsPath) ?? {};

        if (G4ManifestBrandingService.testEqualLabels(installedLabels, labels)) {
            return false;
        }

        // Write the branded labels in the shipped layout; a failed write keeps the installed labels.
        try {
            await fs.writeFile(labelsPath, `${JSON.stringify(labels, null, 4)}\n`, 'utf8');
        } catch (error) {
            options.logger.warning(`The manifest labels could not be written to ${labelsPath}: ${Utilities.resolveErrorMessage(error)}`);

            return false;
        }

        // Remove the cached manifests, so the next window load reads the new labels instead of the cached ones.
        await G4ManifestBrandingService.removeManifestCachesAsync(options);

        // Report the pending change, so the log explains why the labels differ until the window reloads.
        options.logger.information('The manifest labels were updated; they show after the window reloads.');

        return true;
    }

    /**
     * Finds the VS Code user data folder above the extension's global storage folder.
     *
     * @remarks
     * The global storage folder sits under User/globalStorage for the default profile and deeper for other profiles,
     * so the search climbs until a folder holds the profiles cache folder, within a fixed number of levels.
     *
     * @param globalStoragePath - The extension's global storage folder.
     * @returns The user data folder, or undefined when no folder within reach holds the profiles cache.
     */
    private static async findUserDataFolderAsync(globalStoragePath: string): Promise<string | undefined> {
        // Start one level above the global storage folder, which never holds the profiles cache itself.
        let folder = path.dirname(globalStoragePath);

        // Climb one folder at a time and stop at the first one that holds the profiles cache folder.
        for (let depth = 0; depth < MAXIMUM_USER_DATA_DEPTH; depth++) {
            const isUserDataFolder = await fs.stat(path.join(folder, PROFILES_CACHE_FOLDER))
                .then((status) => status.isDirectory())
                .catch(() => false);

            if (isUserDataFolder) {
                return folder;
            }

            // Stop at the root of the disk, where the parent of a folder is the folder itself.
            const parentFolder = path.dirname(folder);

            if (parentFolder === folder) {
                return undefined;
            }

            folder = parentFolder;
        }

        return undefined;
    }

    /**
     * Reads a labels file as a map of label keys to texts.
     *
     * @param filePath - The labels file.
     * @returns The labels, or undefined when the file is missing or does not hold a JSON object of texts.
     */
    private static async readLabelsAsync(filePath: string): Promise<Record<string, string> | undefined> {
        // Read and parse the file; a missing or malformed file counts as no labels.
        let value: unknown;

        try {
            const fileText = await fs.readFile(filePath, 'utf8');
            const isMarked = fileText.charCodeAt(0) === BYTE_ORDER_MARK_CODE;

            value = JSON.parse(isMarked ? fileText.slice(1) : fileText);
        } catch {
            return undefined;
        }

        // Accept only an object whose every value is text, so a corrupted file is never written back as labels.
        const isObject = typeof value === 'object' && value !== null && !Array.isArray(value);

        if (!isObject) {
            return undefined;
        }

        const entries = Object.entries(value as Record<string, unknown>);
        const isEveryText = entries.every(([, text]) => typeof text === 'string');

        return isEveryText ? Object.fromEntries(entries) as Record<string, string> : undefined;
    }

    /**
     * Removes the cached extension manifests of every VS Code profile.
     *
     * @remarks
     * The cache is rebuilt by VS Code on the next scan, so removing it only costs one fresh scan. A user data folder
     * that cannot be found, such as in a host that keeps no cache, leaves nothing to remove.
     *
     * @param options - The global storage folder and the logger.
     */
    private static async removeManifestCachesAsync(options: UpdateManifestBrandingOptions): Promise<void> {
        // Find the user data folder; without it there is no cache to remove.
        const userDataFolder = await G4ManifestBrandingService.findUserDataFolderAsync(options.globalStoragePath);

        if (userDataFolder === undefined) {
            return;
        }

        // Remove the manifest cache of each profile; a missing file in a profile is not a failure.
        const cacheFolder = path.join(userDataFolder, PROFILES_CACHE_FOLDER);
        const profileFolders = await fs.readdir(cacheFolder).catch(() => []);

        for (const profileFolder of profileFolders) {
            const cachePath = path.join(cacheFolder, profileFolder, MANIFEST_CACHE_FILE);

            try {
                await fs.rm(cachePath, { force: true });
            } catch (error) {
                options.logger.warning(`The extension manifest cache ${cachePath} could not be removed: ${Utilities.resolveErrorMessage(error)}`);
            }
        }
    }

    /**
     * Tests whether two label maps hold the same keys with the same texts.
     *
     * @param first - The first label map.
     * @param second - The second label map.
     * @returns True when both maps are equal regardless of key order.
     */
    private static testEqualLabels(first: Record<string, string>, second: Record<string, string>): boolean {
        // Compare the key counts first, so a key present only in the second map is never missed.
        const firstKeys = Object.keys(first);
        const isSameCount = firstKeys.length === Object.keys(second).length;

        // Compare every text of the first map with the same key of the second map.

        return isSameCount && firstKeys.every((key) => first[key] === second[key]);
    }
}

// Compile-time contracts stay after the executable code. Interfaces come before type aliases, and a contract
// follows the contracts that depend on it before A-Z order resumes.

/**
 * The inputs and places the manifest branding update reads and writes.
 */
export interface UpdateManifestBrandingOptions {
    /** The folder the extension is installed in, which holds package.nls.json and the label template. */
    extensionPath: string;

    /** Replaces the branding placeholders of one template text, for example the branding service getText. */
    getText: (text: string) => string;

    /** The extension's global storage folder, from which the VS Code user data folder is found. */
    globalStoragePath: string;

    /** Receives the outcome and the reason a step could not complete. */
    logger: ManifestBrandingLogger;
}

/**
 * The part of the extension logger the manifest branding update writes to.
 *
 * @remarks
 * Only the two levels the update uses, so tests can pass a small stand-in instead of the extension logger.
 */
interface ManifestBrandingLogger {
    /** Writes an outcome the user may want to know, such as labels waiting for the next window load. */
    information(message: string): void;

    /** Writes the reason a step could not complete. */
    warning(message: string): void;
}
