/*
 * The side-panel icon: the icon VS Code shows for the extension on the activity bar and its views.
 *
 * VS Code reads that icon from the file package.json names, once, when it starts; no API changes it while the window
 * runs. The extension therefore copies the chosen icon over its installed icon file, and VS Code shows it from the
 * next start. The icon is chosen in this order: the local g4.sidePanelIcon setting, then the ActivityBarIcon the G4
 * Hub publishes in its branding, then the built-in icon kept untouched under resources.assets/defaults.
 *
 * RESOURCES:
 * Activity bar icons: https://code.visualstudio.com/api/references/contribution-points#contributes.viewsContainers
 */
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import type * as vscode from 'vscode';

import { Utilities } from '../extensions/utilities';

/** The VS Code setting that holds the path of a local SVG file to use as the side-panel icon. */
export const SIDE_PANEL_ICON_SETTING = 'g4.sidePanelIcon';

// The built-in icon, kept untouched so clearing every choice can restore it.
const DEFAULT_ICON_FILE = path.join('resources.assets', 'defaults', 'g4-icon.svg');

// The global state key that keeps the last icon the Hub published, so a start without the Hub can still apply it.
const HUB_ICON_STATE_KEY = 'g4.sidePanelIcon.hub';

// The icon file package.json names for the activity bar and the views; the only file this service writes.
const ICON_FILE = path.join('resources.assets', 'g4-icon.svg');

// The largest icon accepted; an activity bar icon is a few kilobytes, so anything larger is not an icon.
const MAXIMUM_ICON_BYTES = 256 * 1024;

// How long the Hub icon request may take before the kept icon is used.
const REQUEST_TIMEOUT_MILLISECONDS = 5000;

// Matches the opening of the root svg element. Linear: a literal followed by one character class.
const SVG_START_PATTERN = /^<svg[\s>]/i;

// Matches the slashes that end a base URL, so the icon path is joined with exactly one slash. Linear: one literal
// with a single quantifier, anchored at the end.
const TRAILING_SLASHES_PATTERN = /\/+$/;

// Matches an XML prolog such as <?xml version="1.0"?>. Linear: one bounded character class between literals.
const XML_PROLOG_PATTERN = /^<\?xml[^>]{0,256}\?>/;

/**
 * Chooses the side-panel icon and copies it over the installed icon file.
 *
 * @remarks
 * Static, because the installed icon file is one value for the whole extension host. Every input comes through the
 * options, so the choice is testable without VS Code.
 */
export class G4SidePanelIconService {
    /**
     * Tests whether a text is an SVG document.
     *
     * @remarks
     * Accepts a byte order mark, leading white space, and an XML prolog before the root svg element, and requires the
     * document to end with the closing svg tag. The check refuses other files placed by mistake, such as a PNG or an
     * HTML page; VS Code draws the icon as an image, so no script inside it runs.
     *
     * @param text - The candidate text.
     * @returns True when the text is an SVG document.
     */
    public static testSvgIcon(text: string): boolean {
        // Drop a byte order mark and the white space before the markup.
        const unmarkedText = text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text;
        let markup = unmarkedText.trimStart();

        // Step over an XML prolog, which may precede the root element.
        const prolog = XML_PROLOG_PATTERN.exec(markup);

        if (prolog !== null) {
            markup = markup.slice(prolog[0].length).trimStart();
        }

        // Require the root svg element at the start and its closing tag at the end.
        const isClosed = markup.trimEnd().toLowerCase().endsWith('</svg>');

        return SVG_START_PATTERN.test(markup) && isClosed;
    }

    /**
     * Chooses the side-panel icon and copies it over the installed icon file when it differs.
     *
     * @remarks
     * Never throws. A choice that cannot be read, such as a missing local file, an invalid SVG, or an unreachable Hub
     * without a kept icon, keeps the installed icon and writes one warning, so a mistake never blanks the icon. The new
     * icon shows from the next VS Code start.
     *
     * @param options - The choices and the places to read and write.
     * @returns True when the installed icon file was replaced.
     */
    public static async updateAsync(options: UpdateSidePanelIconOptions): Promise<boolean> {
        // Pick the icon by precedence: the local setting, then the Hub branding, then the built-in icon.
        const configuredPath = options.configuredPath.trim();
        const hubIcon = options.hubIcon?.trim() ?? '';
        let icon: string | undefined;

        if (configuredPath !== '') {
            icon = await G4SidePanelIconService.readLocalIconAsync(configuredPath, options.logger);
        } else if (hubIcon === '') {
            icon = await G4SidePanelIconService.readDefaultIconAsync(options);
        } else {
            icon = await G4SidePanelIconService.readHubIconAsync({ ...options, hubIcon });
        }

        // Keep the installed icon when the chosen one could not be read.
        if (icon === undefined) {
            return false;
        }

        // Replace the installed file only when its content differs, so an unchanged choice writes nothing.
        const iconPath = path.join(options.extensionPath, ICON_FILE);
        const installedIcon = await fs.readFile(iconPath, 'utf8').catch(() => '');

        if (installedIcon === icon) {
            return false;
        }

        try {
            await fs.writeFile(iconPath, icon, 'utf8');
        } catch (error) {
            options.logger.warning(`The side-panel icon could not be written to ${iconPath}: ${Utilities.resolveErrorMessage(error)}`);

            return false;
        }

        // Tell the user when the change shows, because VS Code reads the icon only at startup.
        options.logger.information('The side-panel icon was updated; it shows from the next VS Code start.');

        return true;
    }

    /**
     * Reads the built-in icon and forgets the icon the Hub published before.
     *
     * @param options - The extension path and the global state.
     * @returns The built-in icon, or undefined when the extension files are incomplete.
     */
    private static async readDefaultIconAsync(options: UpdateSidePanelIconOptions): Promise<string | undefined> {
        // Forget a Hub icon that the Hub no longer publishes, so a later outage cannot bring it back.
        if (options.globalState.get<unknown>(HUB_ICON_STATE_KEY) !== undefined) {
            await options.globalState.update(HUB_ICON_STATE_KEY, undefined);
        }

        // Read the untouched built-in icon; a missing copy keeps the installed icon.
        const defaultPath = path.join(options.extensionPath, DEFAULT_ICON_FILE);

        try {
            return await fs.readFile(defaultPath, 'utf8');
        } catch (error) {
            options.logger.warning(`The built-in side-panel icon could not be read from ${defaultPath}: ${Utilities.resolveErrorMessage(error)}`);

            return undefined;
        }
    }

    /**
     * Reads the icon the Hub publishes, or the copy kept from the last time the Hub answered.
     *
     * @remarks
     * Without a Hub base URL, as at startup before the connection, only the kept copy is used, and only when it was
     * read for the same icon the branding names. A Hub that does not answer also falls back to the kept copy.
     *
     * @param options - The Hub icon, the Hub base URL, the global state, and the logger.
     * @returns The icon, or undefined when neither the Hub nor the kept copy provides a valid one.
     */
    private static async readHubIconAsync(options: UpdateSidePanelIconOptions & { hubIcon: string; }): Promise<string | undefined> {
        // Find the copy kept for this icon, the fallback for every failure below.
        const keptIcon = options.globalState.get<KeptHubIcon>(HUB_ICON_STATE_KEY);
        const keptSvg = keptIcon?.source === options.hubIcon ? keptIcon.svg : undefined;

        if (!options.hubBaseUrl) {
            return keptSvg;
        }

        // Download the icon; a path is resolved against the Hub, and an absolute URL is used as written.
        let iconText: string;

        try {
            const iconUrl = new URL(options.hubIcon, `${options.hubBaseUrl.replace(TRAILING_SLASHES_PATTERN, '')}/`);
            const response = await fetch(iconUrl, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MILLISECONDS) });

            if (!response.ok) {
                options.logger.warning(`The Hub side-panel icon ${iconUrl.href} answered ${response.status}; the current icon is kept.`);

                return keptSvg;
            }

            // Refuse a large answer before decoding it.
            const iconBytes = Buffer.from(await response.arrayBuffer());

            if (iconBytes.length > MAXIMUM_ICON_BYTES) {
                options.logger.warning(`The Hub side-panel icon ${iconUrl.href} is larger than 256 KB; the current icon is kept.`);

                return keptSvg;
            }

            iconText = iconBytes.toString('utf8');
        } catch (error) {
            options.logger.warning(`The Hub side-panel icon ${options.hubIcon} could not be read: ${Utilities.resolveErrorMessage(error)}`);

            return keptSvg;
        }

        // Refuse a file that is not an SVG document, such as a PNG or an error page.
        if (!G4SidePanelIconService.testSvgIcon(iconText)) {
            options.logger.warning(`The Hub side-panel icon ${options.hubIcon} is not an SVG file; the current icon is kept.`);

            return keptSvg;
        }

        // Keep the icon for starts without the Hub, writing only when it changed.
        if (keptIcon?.source !== options.hubIcon || keptIcon.svg !== iconText) {
            await options.globalState.update(HUB_ICON_STATE_KEY, { source: options.hubIcon, svg: iconText });
        }

        return iconText;
    }

    /**
     * Reads the icon file the local setting names.
     *
     * @param configuredPath - The path from the setting, absolute or starting with ~ for the home folder.
     * @param logger - Receives the reason when the file cannot be used.
     * @returns The icon, or undefined when the path is relative or the file is missing, too large, or not an SVG.
     */
    private static async readLocalIconAsync(configuredPath: string, logger: SidePanelIconLogger): Promise<string | undefined> {
        // Expand the home folder, so the setting can be shared between machines with different user names.
        const isHomePath = configuredPath === '~' || configuredPath.startsWith('~/') || configuredPath.startsWith('~\\');
        const iconPath = isHomePath ? path.join(os.homedir(), configuredPath.slice(1)) : configuredPath;

        // Refuse a relative path: the setting applies to every workspace, so there is no folder to resolve it against.
        if (!path.isAbsolute(iconPath)) {
            logger.warning(`${SIDE_PANEL_ICON_SETTING} must be an absolute path to an .svg file; "${configuredPath}" is relative.`);

            return undefined;
        }

        // Read the file, refusing a large file before reading it.
        let iconText: string;

        try {
            const iconStatistics = await fs.stat(iconPath);

            if (iconStatistics.size > MAXIMUM_ICON_BYTES) {
                logger.warning(`The side-panel icon ${iconPath} is larger than 256 KB; the current icon is kept.`);

                return undefined;
            }

            iconText = await fs.readFile(iconPath, 'utf8');
        } catch (error) {
            logger.warning(`The side-panel icon ${iconPath} could not be read: ${Utilities.resolveErrorMessage(error)}`);

            return undefined;
        }

        // Refuse a file that is not an SVG document.
        if (!G4SidePanelIconService.testSvgIcon(iconText)) {
            logger.warning(`The side-panel icon ${iconPath} is not an SVG file; the current icon is kept.`);

            return undefined;
        }

        return iconText;
    }
}

// Compile-time contracts stay after the executable code. Interfaces come before type aliases, and a contract
// follows the contracts that depend on it before A-Z order resumes.

/**
 * The Hub icon kept in the global state.
 */
interface KeptHubIcon {
    /** The ActivityBarIcon value the icon was read for, so a changed value never reuses an older icon. */
    source: string;

    /** The SVG document. */
    svg: string;
}

/**
 * The choices and places the side-panel icon update reads and writes.
 */
export interface UpdateSidePanelIconOptions {
    /** The value of the g4.sidePanelIcon setting; empty when the user chose no local icon. */
    configuredPath: string;

    /** The folder the extension is installed in, which holds the icon file and the built-in copy. */
    extensionPath: string;

    /** The extension's global state, which keeps the last icon the Hub published. */
    globalState: vscode.Memento;

    /** The Hub base URL, for example http://localhost:9944; absent before the Hub connection. */
    hubBaseUrl?: string;

    /** The ActivityBarIcon of the Hub branding: a path served by the Hub or an absolute URL; empty or absent for none. */
    hubIcon?: string;

    /** Receives the outcome and the reason a choice could not be used. */
    logger: SidePanelIconLogger;
}

/**
 * The part of the extension logger the icon update writes to.
 *
 * @remarks
 * Only the two levels the update uses, so tests can pass a small stand-in instead of the extension logger.
 */
interface SidePanelIconLogger {
    /** Writes an outcome the user may want to know, such as a new icon waiting for the next start. */
    information(message: string): void;

    /** Writes the reason a chosen icon could not be used. */
    warning(message: string): void;
}
