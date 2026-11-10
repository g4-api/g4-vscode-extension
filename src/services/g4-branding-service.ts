/*
 * White-label branding for the extension's labels and visible text.
 *
 * The G4 Hub resolves the branding from the Branding section of its appsettings.json and publishes it at
 * GET /api/v4/g4/integration/branding. The extension reads it when it connects to the Hub, keeps a copy in the
 * global state so the next start shows the same labels before the Hub answers, and falls back to the G4 defaults
 * when neither is available. Text names a product through a placeholder such as {hub} or {engineTm}; only known
 * placeholders are replaced, so identifiers, routes, and other braces never change.
 *
 * RESOURCES:
 * Memento: https://code.visualstudio.com/api/references/vscode-api#Memento
 */
import type * as vscode from 'vscode';

// The Hub route that publishes the resolved branding, relative to the Hub base URL.
const BRANDING_ROUTE = 'api/v4/g4/integration/branding';

// The global state key that keeps the last branding the Hub published.
const BRANDING_STATE_KEY = 'g4.branding.settings';

// How long the branding request may take before the cached or default branding is kept.
const REQUEST_TIMEOUT_MILLISECONDS = 5000;

// Matches the slashes that end a base URL, so the route is always joined with exactly one slash. Linear: one
// literal with a single quantifier, anchored at the end.
const TRAILING_SLASHES_PATTERN = /\/+$/;

// Matches one placeholder such as {engineTm}: a bounded run of word characters between braces, so the match runs in
// linear time and never spans text outside one pair of braces.
const TOKEN_PATTERN = /\{(\w{1,64})\}/g;

// The placeholder values the Hub publishes when it has no Branding section, so every label keeps the G4 text.
const DEFAULT_TOKENS: Readonly<Record<string, string>> = {
    engine: 'G4 Engine',
    engineClient: 'G4 Engine Client',
    engineClientTm: 'G4™ Engine Client',
    engineTm: 'G4™ Engine',
    hub: 'G4 Hub',
    hubTm: 'G4™ Hub',
    mark: 'G4',
    product: 'G4',
    productTm: 'G4™',
    studio: 'G4 Studio',
    studioTm: 'G4™ Studio',
    testWright: 'G4 Test Wright',
    testWrightTm: 'G4™ Test Wright',
    tm: '™'
};

// The script every webview page runs first. It publishes the branding as globalThis.G4BrandingSettings, adds a
// getText resolver as globalThis.G4Branding unless the page already has one (the Hub designer brings its own),
// and replaces the data-branding-text and data-branding-title templates once the markup is parsed.
const PAGE_RUNTIME = `(() => {
    const pattern = /\\{(\\w{1,64})\\}/g;
    const getSettings = () => globalThis.G4BrandingSettings;
    const getText = (text) => typeof text === 'string'
        ? text.replaceAll(pattern, (placeholder, name) => getSettings()?.tokens?.[name] ?? placeholder)
        : text;
    globalThis.G4Branding ??= { getSettings, getText };
    const updateDocument = () => {
        for (const element of document.querySelectorAll('[data-branding-text]')) {
            element.textContent = getText(element.dataset.brandingText);
        }
        for (const element of document.querySelectorAll('[data-branding-title]')) {
            element.setAttribute('title', getText(element.dataset.brandingTitle));
        }
    };
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', updateDocument, { once: true });
    } else {
        updateDocument();
    }
})();`;

/**
 * Escapes the characters that carry meaning in HTML text and attribute values.
 *
 * @param value - The text to escape.
 * @returns The escaped text.
 */
function convertToEscapedHtml(value: string): string {
    return value
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

/**
 * Holds the branding the extension shows and resolves branding placeholders in text.
 *
 * @remarks
 * Static, because labels are resolved everywhere, including module-level code, and the branding is one value
 * for the whole extension host. Call {@link G4BrandingService.initialize} first in activation, so labels created
 * during activation, such as the output channels, already use the cached branding.
 */
export class G4BrandingService {
    // The branding in use: the default until initialize reads the cache, then the cache, then the Hub's answer.
    private static _settings: BrandingSettings = { tokens: { ...DEFAULT_TOKENS } };

    /**
     * Replaces every known placeholder in HTML markup with its branded value, HTML-escaped.
     *
     * @remarks
     * Use for markup the extension writes itself, such as the side view and the failure pages; the branded
     * names come from the Hub's configuration, so they are escaped before they reach the markup.
     *
     * @param markup - The markup to resolve.
     * @returns The resolved markup.
     */
    public static getHtml(markup: string): string {
        // Resolve each placeholder like getText, then escape the value, so a name cannot add markup.
        return markup.replaceAll(TOKEN_PATTERN, (placeholder: string, tokenName: string) => {
            const value = G4BrandingService._settings.tokens[tokenName] ?? DEFAULT_TOKENS[tokenName];

            return value === undefined ? placeholder : convertToEscapedHtml(value);
        });
    }

    /**
     * Returns a script element that brands a webview page.
     *
     * @remarks
     * Insert it before every other script of the page. The settings are written as JSON with `<` escaped, so
     * no value can close the script element.
     *
     * @returns The script element markup.
     */
    public static getPageScript(): string {
        // Escape `<` as a JSON unicode escape, so a branded name can never end the script element early. Keep the
        // escaped backslash: String.raw with the escape is decoded to '<' by the TypeScript compiler.
        const settingsJson = JSON.stringify(G4BrandingService._settings).replaceAll('<', '\\u003c'); // NOSONAR

        return `<script>globalThis.G4BrandingSettings = ${settingsJson};\n${PAGE_RUNTIME}</script>`;
    }

    /**
     * Returns the branding in use.
     *
     * @returns The branding settings, with every placeholder value filled.
     */
    public static getSettings(): BrandingSettings {
        return G4BrandingService._settings;
    }

    /**
     * Replaces every known placeholder in the text with its branded value.
     *
     * @remarks
     * A placeholder missing from the branding falls back to its G4 default, and an unknown placeholder is kept
     * as written, so text that uses braces for another purpose never changes.
     *
     * @param text - The text to resolve.
     * @returns The resolved text.
     */
    public static getText(text: string): string {
        // Resolve against the branding in use, falling back to the G4 default and then to the text as written.
        const tokens = G4BrandingService._settings.tokens;

        return text.replaceAll(TOKEN_PATTERN, (placeholder: string, tokenName: string) => {
            return tokens[tokenName] ?? DEFAULT_TOKENS[tokenName] ?? placeholder;
        });
    }

    /**
     * Loads the branding the Hub published last time.
     *
     * @remarks
     * Runs first in activation and never fails: a missing or malformed copy keeps the G4 defaults.
     *
     * @param globalState - The extension's global state.
     */
    public static initialize(globalState: vscode.Memento): void {
        // Start from the G4 defaults, so a missing or malformed copy never keeps an earlier branding.
        G4BrandingService._settings = { tokens: { ...DEFAULT_TOKENS } };

        // Apply the copy the Hub published last time, when there is a valid one.
        const cachedSettings = globalState.get<unknown>(BRANDING_STATE_KEY);

        G4BrandingService.setSettings(cachedSettings);
    }

    /**
     * Reads the branding from the Hub and keeps it for this and the next start.
     *
     * @remarks
     * A Hub that does not answer, answers with an error, or publishes no branding leaves the current branding in
     * place, so an older Hub without the branding route keeps the G4 labels. Labels created before the refresh,
     * such as the output channel names, change on the next start.
     *
     * @param globalState - The extension's global state that keeps the copy.
     * @param baseUrl - The Hub base URL, for example http://localhost:9944.
     * @returns True when the Hub published a branding that differs from the one in use.
     */
    public static async refreshAsync(globalState: vscode.Memento, baseUrl: string): Promise<boolean> {
        // Skip the request when no Hub is configured.
        if (!baseUrl) {
            return false;
        }

        // Ask the Hub for its branding, with a timeout so a slow Hub never delays the connection flow.
        let receivedSettings: unknown;

        try {
            const brandingUrl = new URL(BRANDING_ROUTE, `${baseUrl.replace(TRAILING_SLASHES_PATTERN, '')}/`);
            const response = await fetch(brandingUrl, {
                signal: AbortSignal.timeout(REQUEST_TIMEOUT_MILLISECONDS)
            });

            if (!response.ok) {
                return false;
            }

            receivedSettings = await response.json();
        } catch {
            return false;
        }

        // Keep the branding only when it differs, so an unchanged Hub writes nothing.
        const isChanged = JSON.stringify(receivedSettings) !== JSON.stringify(globalState.get<unknown>(BRANDING_STATE_KEY));
        const isApplied = G4BrandingService.setSettings(receivedSettings);

        if (!isApplied || !isChanged) {
            return false;
        }

        await globalState.update(BRANDING_STATE_KEY, receivedSettings);

        return true;
    }

    /**
     * Replaces the branding when the value is a branding with placeholder values.
     *
     * @param value - The candidate branding, from the Hub or the global state.
     * @returns True when the value was applied.
     */
    private static setSettings(value: unknown): boolean {
        // Refuse anything without a token map, so a malformed answer cannot blank the labels.
        const tokens = (value as Partial<BrandingSettings> | undefined)?.tokens;
        const isBranding = typeof tokens === 'object' && tokens !== null;

        if (!isBranding) {
            return false;
        }

        // Fill missing placeholders from the defaults, so an older Hub that publishes fewer of them still works.
        G4BrandingService._settings = {
            ...(value as BrandingSettings),
            tokens: { ...DEFAULT_TOKENS, ...tokens }
        };

        return true;
    }
}

// Compile-time contracts stay after the executable code. Interfaces come before type aliases, and a contract
// follows the contracts that depend on it before A-Z order resumes.

/**
 * The resolved branding the Hub publishes.
 *
 * @remarks
 * The Hub publishes more fields (names, support contact, banner); the extension models only the placeholder map
 * it resolves text with and the assets it may show. Other fields pass through untouched to the webviews.
 */
export interface BrandingSettings {
    /** The asset addresses and the badge text, relative to the Hub; absent before the Hub answered. */
    assets?: {
        /** The favicon address. */
        favicon?: string;

        /** The logo address. */
        logo?: string;

        /** The short mark text drawn in badges, for example "G4". */
        markText?: string;
    };

    /** The value of every placeholder, keyed by placeholder name without braces, for example engineTm. */
    tokens: Record<string, string>;
}
