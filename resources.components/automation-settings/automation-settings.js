/*
 * G4(TM) Settings component.
 *
 * Edits the project manifest (manifest.json) the extension host injects through #g4-data. The page
 * is assembled from the reusable G4 components (resources.components/g4-*): sections, fields, text,
 * number, secret, and path inputs, selects, toggles, JSON and code text areas, list and key/value
 * editors, cards, busy buttons, the page header, and the action bar. This script owns the settings
 * model: defaults, state paths, checks, engine calls, and the host messages.
 *
 * Host contract (show-settings.ts):
 * - Injected #g4-data: the manifest JSON.
 * - Webview → host: { command: 'saveSettings', manifest }, { command: 'openExternal', url },
 *                   { command: 'browseSandbox' }, { command: 'autoDetectSandbox' },
 *                   { command: 'confirmFactoryReset' }
 * - Host → webview: { command: 'setSandboxPath', sandboxPath }, { command: 'factoryResetConfirmed' }
 *
 * Every control carries data-path (the dotted state path it edits) and data-kind (how its value is
 * stored); one delegated listener per component event writes the value into state.
 */

// Marker used to wrap a single path segment that legitimately contains
// dots or colons (for example the WebDriver key "uia:options").
const KEY_CLOSE = '}}';
const KEY_OPEN = '{{';

// Recorder capture modes supported by EventCaptureService.
const RECORDER_MODE_CHOICES = [
    { value: 'standard', text: 'Standard' },
    { value: 'user32', text: 'User32' },
    { value: 'coordinate', text: 'Coordinate' }
];

// Tooltip shown on the per-recorder mode dropdown.
const RECORDER_MODE_TITLE = 'This value only applies to UIA recorders and is ignored by other recorders.';

// Interpreters offered for a recorder's pre/post scripts. Values must match the shells the
// extension's recorder script runner supports.
const RECORDER_SHELL_CHOICES = [
    { value: 'powershell', text: 'PowerShell (Windows)' },
    { value: 'pwsh', text: 'PowerShell 7 (pwsh)' },
    { value: 'bash', text: 'Bash' },
    { value: 'cmd', text: 'Command Prompt (cmd)' }
];

// How long the "Settings sent." note stays in the action bar.
const SAVE_NOTE_DURATION_MILLISECONDS = 2000;

// Characters of a state path that are not allowed in a test id; each becomes a hyphen.
// Linear: one negated character class, matched one character at a time.
const TEST_ID_SEPARATOR_PATTERN = /[^a-z0-9]/gi;

// Latest status line of every section, so a re-rendered section shows it again. Module-level
// because status messages arrive from async work (engine calls, host messages) after the section
// that started them may have been rendered again.
globalThis.SECTION_STATUS = {
    connection: { message: '', tone: '' },
    license: { message: '', tone: '' },
    driver: { message: '', tone: '' },
    run: { message: '', tone: '' },
    logging: { message: '', tone: '' },
    reports: { message: '', tone: '' },
    response: { message: '', tone: '' },
    screenshots: { message: '', tone: '' },
    plugins: { message: '', tone: '' },
    mcp: { message: '', tone: '' },
    recorders: { message: '', tone: '' }
};

/**
 * Built-in starting values for the settings form.
 *
 * These mirror the shipped `manifest.json` exactly, including value types
 * that matter to the engine (for example `port` is a string, and unused
 * provider slots stay `null`). The form edits a working copy of this object
 * and never mutates globalThis.DEFAULTS, so "Reset" always returns to this baseline.
 */
globalThis.DEFAULTS = {
    "g4Server": {
        "schema": "http",
        "host": "localhost",
        "port": "9944"
    },
    "authentication": {
        "token": ""
    },
    "driverParameters": {
        "driver": "ChromeDriver",
        "driverBinaries": "http://localhost:4444/wd/hub"
    },
    "settings": {
        "automationSettings": {
            "loadTimeout": 60000,
            "maxParallel": 1,
            "returnFlatResponse": true,
            "returnStructuredResponse": true,
            "searchTimeout": 15000
        },
        "clientLogConfiguration": {
            "agentLogConfiguration": {
                "enabled": true,
                "interval": 1000
            },
            "logLevel": "information",
            "sourceOptions": {
                "filter": "include",
                "sources": []
            }
        },
        "clientReportSettings": {
            "autoView": true,
            "reportsFolder": ".",
            "saveReports": true
        },
        "environmentsSettings": {
            "returnEnvironments": true
        },
        "recorderSettings": {
            "enabled": true,
            "useSandbox": false,
            "recorders": [
                {
                    "enabled": true,
                    "mode": "standard",
                    "useOffset": false,
                    "schema": "http",
                    "host": "localhost",
                    "port": "9955",
                    "driverParameters": {
                        "capabilities": {
                            "alwaysMatch": {
                                "browserName": "Uia",
                                "uia:options": {
                                    "label": "machine-a"
                                }
                            }
                        },
                        "driver": "UiaDriver",
                        "driverBinaries": "http://localhost:5555/wd/hub",
                        "firstMatch": [
                            {}
                        ]
                    },
                    "thinkTimeSettings": {
                        "enabled": true,
                        "maxThinkTime": 2000,
                        "minThinkTime": 2000
                    },
                    "preScript": {
                        "enabled": false,
                        "shell": "powershell",
                        "script": "",
                        "addToAutomationFlow": false
                    },
                    "postScript": {
                        "enabled": false,
                        "shell": "powershell",
                        "script": "",
                        "addToAutomationFlow": false
                    }
                },
                {
                    "enabled": false,
                    "mode": "standard",
                    "useOffset": false,
                    "schema": "http",
                    "host": "localhost",
                    "port": "9955",
                    "driverParameters": {
                        "capabilities": {
                            "alwaysMatch": {
                                "browserName": "Uia",
                                "uia:options": {
                                    "label": "machine-b"
                                }
                            }
                        },
                        "driver": "UiaDriver",
                        "driverBinaries": "http://localhost:4444/wd/hub",
                        "firstMatch": [
                            {}
                        ]
                    },
                    "thinkTimeSettings": {
                        "enabled": false,
                        "maxThinkTime": 2000,
                        "minThinkTime": 2000
                    },
                    "preScript": {
                        "enabled": false,
                        "shell": "powershell",
                        "script": "",
                        "addToAutomationFlow": false
                    },
                    "postScript": {
                        "enabled": false,
                        "shell": "powershell",
                        "script": "",
                        "addToAutomationFlow": false
                    }
                }
            ]
        },
        "exceptionsSettings": {
            "returnExceptions": true
        },
        "queueManagerSettings": {
            "properties": null,
            "type": null
        },
        "performancePointsSettings": {
            "returnPerformancePoints": true
        },
        "pluginsSettings": {
            "externalRepositories": [],
            "forceRuleReference": true,
            "servers": {}
        },
        "screenshotsSettings": {
            "convertToBase64": false,
            "onExceptionOnly": false,
            "outputFolder": ".",
            "returnScreenshots": false
        }
    }
};

// The VS Code webview bridge. Acquired once; guarded so the page also
// renders correctly when opened outside the extension host.
globalThis.VSCODE = (typeof acquireVsCodeApi === 'function')
    ? acquireVsCodeApi()
    : null;

// The real manifest injected by the extension host (show-settings.ts)
// through the #g4-data holder. Parsed defensively so the page still
// renders when opened standalone, where the marker is left unreplaced.
globalThis.INJECTED = (() => {
    try {
        return JSON.parse(document.getElementById('g4-data').value);
    } catch {
        return null;
    }
})();

// The editable working copy of the settings. Starts from the injected
// manifest layered over globalThis.DEFAULTS so a partial manifest still produces a
// fully-populated form; falls back to globalThis.DEFAULTS alone when nothing was
// injected. globalThis.DEFAULTS itself is never mutated, so "Reset" can restore it.
globalThis.STATE = (globalThis.INJECTED && Object.keys(globalThis.INJECTED).length)
    ? mergeSettings(copyValue(globalThis.DEFAULTS), globalThis.INJECTED)
    : copyValue(globalThis.DEFAULTS);

// The settings as the page opened them (the manifest layered over the defaults). Reset to Defaults
// restores this copy, like the publishers' reset; never mutated.
globalThis.INITIAL = copyValue(globalThis.STATE);

// Driver keys fetched from the engine; null until a successful load.
// Used to populate every "Driver" dropdown.
globalThis.DRIVERS = null;

// Shown when the engine can't be reached so the form stays usable.
globalThis.FALLBACK_DRIVERS = ['ChromeDriver', 'UiaDriver', 'AndroidDriver', 'IosDriver', 'SimulatorDriver'];

// Raw README that hosts the free development-license token. The token
// lives in a ```none code block right under the "Development License"
// heading. raw.githubusercontent.com serves permissive CORS headers,
// so the webview can read it directly.
globalThis.DEV_LICENSE_URL =
    'https://raw.githubusercontent.com/g4-api/g4-services/main/README.md';

// Maps each section id to the function that builds its full markup, so a
// single section can be re-rendered in place without rebuilding the page.
globalThis.SECTION_BUILDERS = {
    connection: writeConnectionSection,
    license: writeLicenseSection,
    driver: writeDriverSection,
    run: writeRunBehaviorSection,
    logging: writeLoggingSection,
    reports: writeReportsSection,
    response: writeResponseDataSection,
    screenshots: writeScreenshotsSection,
    plugins: writePluginsSection,
    mcp: writeMcpSection,
    recorders: writeRecordersSection
};

/**
 * Adds a new desktop recorder seeded from the shipped recorder template.
 *
 * Behavior:
 * - Clones the first shipped recorder as a template.
 * - Gives the new machine a unique friendly name and leaves it disabled.
 * - Re-renders the recorders section and opens and reveals the new card.
 */
function addRecorder() {
    // Resolve the recorders list and clone the shipped template.
    const recorders = globalThis.STATE.settings.recorderSettings.recorders;
    const template = copyValue(globalThis.DEFAULTS.settings.recorderSettings.recorders[0]);

    // Give the new machine a unique friendly name and leave it disabled
    // so adding it never changes behavior until the user opts in.
    template.enabled = false;
    template.driverParameters.capabilities.alwaysMatch['uia:options'].label =
        'machine-' + (recorders.length + 1);

    // Append the recorder, re-render, and reveal the new card.
    recorders.push(template);
    updateSection('recorders');
    showItem(`recorder-${recorders.length - 1}`);
}

/**
 * Adds a new external plugin repository seeded with sensible defaults.
 *
 * Behavior:
 * - Appends a repository with default version/timeout and empty maps.
 * - Re-renders the plugins section and opens and reveals the new card.
 */
function addRepository() {
    // Resolve the current repositories as an array.
    const existing = getPath(globalThis.STATE, 'settings.pluginsSettings.externalRepositories');
    const repositories = Array.isArray(existing) ? existing : [];

    // Append a default repository, store it, re-render, and reveal the new card.
    repositories.push({ name: '', url: '', version: 1, timeout: 300, capabilities: {}, headers: {} });
    setPath(globalThis.STATE, 'settings.pluginsSettings.externalRepositories', repositories);
    updateSection('plugins');
    showItem(`repository-${repositories.length - 1}`);
}

/**
 * Adds a new, empty MCP server entry with a unique placeholder name.
 *
 * Behavior:
 * - Finds a unique default name so two new servers don't collide.
 * - Seeds the entry as a local (stdio) server with an empty command/args.
 * - Re-renders the MCP section and opens and reveals the new card.
 */
function addServer() {
    // Resolve the current servers map.
    const servers = getPath(globalThis.STATE, 'settings.pluginsSettings.servers') || {};

    // Find a unique default name so two new servers don't collide.
    let n = Object.keys(servers).length + 1;
    let name = 'server-' + n;

    while (servers[name]) {
        name = 'server-' + (++n);
    }

    // Seed a local server, store it, re-render, and reveal the new card.
    servers[name] = { type: 'stdio', command: '', args: [] };
    setPath(globalThis.STATE, 'settings.pluginsSettings.servers', servers);
    updateSection('mcp');
    showItem(`server-${Object.keys(servers).length - 1}`);
}

/**
 * Converts every manifest property named `port` to a string before saving.
 *
 * @remarks
 * Mutates the manifest clone created for serialization. The UI renders port fields as
 * numeric controls, but the manifest contract stores port values as strings.
 *
 * @param {*} value - The manifest branch to normalize.
 */
function convertManifestPortsToText(value) {
    // Scalars cannot contain nested port fields.
    const isNonObjectValue = !value || typeof value !== 'object';

    if (isNonObjectValue) {
        return;
    }

    // Arrays may hold recorder or server objects, so normalize each item.
    if (Array.isArray(value)) {
        for (const item of value) {
            convertManifestPortsToText(item);
        }

        return;
    }

    // Plain objects are scanned for port leaves and nested objects.
    for (const [key, propertyValue] of Object.entries(value)) {
        const isPropertyValuePresent = propertyValue !== null && propertyValue !== undefined;
        const isPortValue = key === 'port' && isPropertyValuePresent;

        if (isPortValue) {
            value[key] = String(propertyValue);
            continue;
        }

        convertManifestPortsToText(propertyValue);
    }
}

/**
 * Wraps a key so it survives dotted-path splitting unchanged.
 *
 * Behavior:
 * - Surrounds the raw key with the escape markers.
 * - The resulting segment is copied verbatim by splitPath().
 *
 * @param {string} key - The raw object key.
 * @returns {string} The escaped key segment.
 */
function convertToEscapedKey(key) {
    // Wrap the key in the open/close markers so dots inside it are preserved.
    return KEY_OPEN + key + KEY_CLOSE;
}

/**
 * Creates a deep copy of a plain JSON-compatible value.
 *
 * Behavior:
 * - Uses structuredClone to produce an independent deep copy.
 * - Used to clone globalThis.DEFAULTS into editable state without mutating the baseline.
 *
 * @param {*} value - The JSON-compatible value to copy.
 * @returns {*} A deep copy of the value.
 */
function copyValue(value) {
    // Produce an independent deep copy of the value.
    return structuredClone(value);
}

/**
 * Requests sandbox auto-detection from the extension host.
 *
 * Behavior:
 * - Uses the host so filesystem access stays outside the webview sandbox.
 * - Leaves the current field value unchanged until the host returns a path.
 */
function findSandboxFolder() {
    // The webview cannot inspect the local filesystem directly.
    if (!globalThis.VSCODE) {
        setSectionStatus('connection', 'Auto-detect is available only inside VS Code.');
        return;
    }

    // Ask the host to find the newest sandbox folder.
    globalThis.VSCODE.postMessage({ command: 'autoDetectSandbox' });
}

/**
 * Builds the configured engine's Capabilities page URL from the current
 * Connection settings, with sensible fallbacks for any blank part.
 *
 * Behavior:
 * - Reads the schema/host/port from the current g4Server state.
 * - Falls back to http/localhost/9944 for any missing part.
 *
 * @returns {string} The full capabilities.html URL.
 */
function getCapabilitiesUrl() {
    // Resolve the configured engine connection, defaulting each part.
    const server = globalThis.STATE.g4Server || {};
    const schema = server.schema || 'http';
    const host = server.host || 'localhost';
    const port = server.port || '9944';

    // Compose the Capabilities page URL.
    return `${schema}://${host}:${port}/views/capabilities.html`;
}

/**
 * Classifies a credentials object into a UI auth type.
 *
 * Behavior:
 * - Treats a missing/non-object value as 'none'.
 * - Honors an explicit basic/bearer `type`.
 * - Infers bearer from a token, or basic from username/password.
 *
 * @param {object|null} credentials - The stored credentials value.
 * @returns {('none'|'basic'|'bearer')} The detected auth type.
 */
function getCredentialsType(credentials) {
    // A missing or non-object value means no credentials.
    if (!credentials || typeof credentials !== 'object') {
        return 'none';
    }

    // An explicit type wins when it is basic or bearer.
    if (credentials.type === 'basic' || credentials.type === 'bearer') {
        return credentials.type;
    }

    // Otherwise infer the type from the present fields.
    const isTokenPresent = credentials.token !== null && credentials.token !== undefined;

    if (isTokenPresent) {
        return 'bearer';
    }

    const isUsernamePresent = credentials.username !== null && credentials.username !== undefined;
    const isPasswordPresent = credentials.password !== null && credentials.password !== undefined;
    const isBasicCredentialsPresent = isUsernamePresent || isPasswordPresent;

    if (isBasicCredentialsPresent) {
        return 'basic';
    }

    // Nothing recognizable - treat as none.
    return 'none';
}

/**
 * Fetches the free development-license token from GitHub and drops it into
 * the token field.
 *
 * Behavior:
 * - Shows the button busy and reports progress while fetching.
 * - Reads the token out of the fetched README and writes it to state + input.
 * - On any failure, leaves the field untouched and points at the manual link.
 *
 * @param {HTMLElement} button - The Fetch Free Token busy button.
 */
async function getDevelopmentLicense(button) {
    // Show progress while the request is in flight.
    button.busy = true;
    setSectionStatus('license', 'Fetching the latest free token...');

    try {
        // Fetch the README and treat any non-OK status as a failure.
        const response = await fetch(globalThis.DEV_LICENSE_URL, { cache: 'no-store' });

        if (!response.ok) {
            throw new Error(`GitHub returned ${response.status}`);
        }

        // Extract the token; a missing token is treated as a failure.
        const token = readDevelopmentToken(await response.text());

        if (!token) {
            throw new Error('token not found in page');
        }

        // Update both the working state and the visible input.
        setPath(globalThis.STATE, 'authentication.token', token);

        const input = document.querySelector('[data-path="authentication.token"]');

        if (input) {
            input.value = token;
        }

        // Tell the user the token was added and how to apply it.
        setSectionStatus('license', 'Free token added. Click Save to apply it.', 'ok');
    } catch (error) {
        // Report a friendly failure message and log the detail.
        console.warn('Could not fetch development license:', error);
        setSectionStatus('license', 'Could not reach GitHub. Grab the token manually from the link below, then paste it here.', 'error');
    } finally {
        // Always restore the button regardless of the outcome.
        button.busy = false;
    }
}

/**
 * Returns the choices for a Driver dropdown.
 *
 * Behavior:
 * - Uses the fetched driver keys, or the static fallback when none loaded.
 * - Always includes the currently-saved value so it is never silently dropped.
 * - Maps each key to an option whose value and text are both the driver key.
 *
 * @param {string} currentValue - The driver value currently in state.
 * @returns {Array<{value:string,text:string}>} The dropdown choices.
 */
function getDriverChoices(currentValue) {
    // Prefer the live driver list; fall back to the static list when empty.
    const isLiveDriverListAvailable = Array.isArray(globalThis.DRIVERS) && globalThis.DRIVERS.length;
    const source = isLiveDriverListAvailable
        ? globalThis.DRIVERS
        : globalThis.FALLBACK_DRIVERS;
    const keys = source.slice();

    // Keep the saved value selectable even when it is not in the source list.
    if (currentValue && !keys.includes(currentValue)) {
        keys.unshift(currentValue);
    }

    // Map each driver key into a {value, text} choice.
    return keys.map(key => ({ value: key, text: key }));
}

/**
 * Builds the engine's driver-manifests endpoint URL from the current
 * Connection settings.
 *
 * Behavior:
 * - Reads the schema/host/port from the current g4Server state.
 * - Falls back to http/localhost/9944 for any missing part.
 *
 * @returns {string} The full drivers API URL.
 */
function getDriversUrl() {
    // Resolve the configured engine connection, defaulting each part.
    const server = globalThis.STATE.g4Server || {};
    const schema = server.schema || 'http';
    const host = server.host || 'localhost';
    const port = server.port || '9944';

    // Compose the driver-manifests API URL.
    return `${schema}://${host}:${port}/api/v4/g4/integration/manifests/drivers`;
}

/**
 * Escapes a value so it can be safely rendered as HTML text or inside
 * double-quoted HTML attributes.
 *
 * Behavior:
 * - Converts null or undefined values into an empty string.
 * - Renders arrays and objects as JSON (component attributes such as a list editor's value).
 * - Escapes HTML-sensitive characters: & < > and ".
 *
 * @param {*} value - The value to escape.
 * @returns {string} The escaped HTML-safe string.
 */
function getEscapedText(value) {
    // Objects become JSON so they never reach the page as '[object Object]'.
    const text = value !== null && typeof value === 'object'
        ? JSON.stringify(value)
        : String(value ?? '');

    return text
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;');
}

/**
 * Reads a nested value from an object using a dotted path.
 *
 * Behavior:
 * - Splits the path into segments, keeping escaped segments intact.
 * - Walks the object one segment at a time.
 * - Stops and returns undefined as soon as any segment is missing.
 *
 * @param {object} root - The object to read from.
 * @param {string} path - A dotted path (e.g. "settings.automationSettings.loadTimeout").
 * @returns {*} The resolved value, or undefined when any segment is missing.
 */
function getPath(root, path) {
    // Reduce the path segments down to the target value, bailing on null/undefined.
    return splitPath(path).reduce(
        (currentValue, key) => {
            const isCurrentValueMissing = currentValue === null || currentValue === undefined;

            return isCurrentValueMissing ? currentValue : currentValue[key];
        },
        root
    );
}

/**
 * Builds the engine's ping endpoint URL from the current Connection
 * settings.
 *
 * Behavior:
 * - Reads the schema/host/port from the current g4Server state.
 * - Falls back to http/localhost/9944 for any missing part.
 *
 * @returns {string} The full ping API URL.
 */
function getPingUrl() {
    // Resolve the configured engine connection, defaulting each part.
    const server = globalThis.STATE.g4Server || {};
    const schema = server.schema || 'http';
    const host = server.host || 'localhost';
    const port = server.port || '9944';

    // Compose the ping API URL.
    return `${schema}://${host}:${port}/api/v4/g4/ping`;
}

/**
 * Returns the section element for a section id.
 *
 * @param {string} sectionId - Section id.
 * @returns {HTMLElement | null} The <g4-section>.
 */
function getSection(sectionId) {
    return document.querySelector(`g4-section[data-section-id="${sectionId}"]`);
}

/**
 * Returns a recorder script's unsafe-character reason, or '' when safe.
 *
 * Behavior:
 * - Newlines are safe (escaped to \n when the script is injected as an InvokeScript action).
 * - Flags the sequences the {{$ --ScriptBlock:...}} macro cannot carry: }} closes it, {{ opens a
 *   nested expression, and a whitespace-delimited --<word> starts a new argument.
 *
 * @param {string} script - The inline recorder script.
 * @returns {string} A human-readable reason, or an empty string when the script is safe.
 */
function getUnsafeScriptReason(script) {
    // Only strings can be inspected; treat anything else as empty (and therefore safe).
    const text = typeof script === 'string' ? script : '';

    // Detect the macro-breaking sequences.
    const isBraceUnsafe = text.includes('}}') || text.includes('{{');
    const isArgumentUnsafe = /\s--[\w/,.$*]/.test(text);

    if (!isBraceUnsafe && !isArgumentUnsafe) {
        return '';
    }

    return 'Contains characters (}} {{ or " --") that can\'t be added to the automation flow yet; this script will not be injected.';
}

/**
 * Asks for confirmation before restoring the shipped defaults (Restore Factory Settings).
 *
 * @remarks
 * A webview cannot show a native dialog, so the host shows a modal confirmation and answers with
 * factoryResetConfirmed (see onHostMessage). Opened outside VS Code there is no host to ask, and
 * the reset applies directly.
 */
function invokeFactoryReset() {
    // Without the host bridge there is no dialog; apply the reset so the button still works.
    if (!globalThis.VSCODE) {
        resetFactorySettings();
        return;
    }

    // Ask the host to confirm; the reset happens only when it answers.
    globalThis.VSCODE.postMessage({ command: 'confirmFactoryReset' });
}

/**
 * Deep-merges an override object onto a base object, returning the base.
 *
 * Behavior:
 * - Returns the base unchanged when the override is not a plain object.
 * - Recurses into nested plain objects so missing keys keep their base value.
 * - Replaces arrays and scalar values wholesale (no element-wise merge).
 * - Mutates and returns the base, so callers pass a throwaway copy.
 *
 * Used to layer the injected manifest over globalThis.DEFAULTS so a partial manifest
 * still produces a fully-populated form (missing keys fall back to globalThis.DEFAULTS).
 *
 * @param {object} base - The baseline object to merge into (mutated).
 * @param {*} override - The values that take precedence over the base.
 * @returns {object} The merged base object.
 */
function mergeSettings(base, override) {
    // A non-object override (array, scalar, null) cannot be merged key-by-key.
    if (!override || typeof override !== 'object' || Array.isArray(override)) {
        return base;
    }

    // Layer each override key onto the base, recursing into nested objects.
    for (const [key, value] of Object.entries(override)) {
        // Determine whether both sides are plain objects worth merging.
        const baseValue = base[key];
        const bothPlainObjects =
            value && typeof value === 'object' && !Array.isArray(value) &&
            baseValue && typeof baseValue === 'object' && !Array.isArray(baseValue);

        // Recurse for nested objects; otherwise replace the value outright.
        base[key] = bothPlainObjects
            ? mergeSettings(baseValue, value)
            : value;
    }

    // Return the merged base so the call can be used as an expression.
    return base;
}

/**
 * Builds a clean manifest object from the current state.
 *
 * Behavior:
 * - Clamps maxParallel to a valid floor (the engine rejects values <= 0).
 * - Drops the optional MCP `servers` block when it is empty.
 * - Mirrors the base manifest by storing an empty repository list as null.
 *
 * @returns {object} A manifest-shaped object ready to send to the host.
 */
function newManifest() {
    // Start from a deep copy of the working state.
    const manifest = copyValue(globalThis.STATE);

    // Recorder mode only applies to UIA recorders; force all other recorders to the safe baseline.
    setRecorderModes(manifest.settings?.recorderSettings?.recorders);

    // Treat an empty sandbox textbox as "not configured" and omit the root field.
    const sandbox = String(manifest.sandbox ?? '').trim();

    if (sandbox) {
        manifest.sandbox = sandbox;
    } else {
        delete manifest.sandbox;
    }

    // Port fields render as number inputs but must be saved as manifest strings.
    convertManifestPortsToText(manifest);

    // Safety net: never send a parallelism below 1, even if state drifts.
    const parallel = Number(manifest.settings.automationSettings.maxParallel);
    const isValidParallel = Number.isFinite(parallel) && parallel >= 1;

    manifest.settings.automationSettings.maxParallel = isValidParallel
        ? parallel
        : 1;

    // Keep the optional MCP servers block out of the file when unused.
    const servers = manifest.settings?.pluginsSettings?.servers;

    if (servers && Object.keys(servers).length === 0) {
        delete manifest.settings.pluginsSettings.servers;
    }

    // Lists edited as one text box per entry: drop blank entries and surrounding spaces.
    const getCleanList = (list) => (Array.isArray(list) ? list : [])
        .map((entry) => String(entry ?? '').trim())
        .filter(Boolean);
    const sourceOptions = manifest.settings?.clientLogConfiguration?.sourceOptions;

    if (sourceOptions && Array.isArray(sourceOptions.sources)) {
        sourceOptions.sources = getCleanList(sourceOptions.sources);
    }

    for (const server of Object.values(servers ?? {})) {
        if (Array.isArray(server?.args)) {
            server.args = getCleanList(server.args);
        }
    }

    // Mirror the base manifest: an empty repository list is stored as null.
    const repositories = manifest.settings?.pluginsSettings?.externalRepositories;

    if (Array.isArray(repositories) && repositories.length === 0) {
        manifest.settings.pluginsSettings.externalRepositories = null;
    }

    // Return the cleaned manifest.
    return manifest;
}

/**
 * Handles the action bar buttons: Save, Reset to Defaults, and Restore Factory Settings.
 *
 * @param {CustomEvent} event - g4-action event of the action bar.
 */
function onActionBarAction(event) {
    // Each button runs its own command; other ids are ignored.
    if (event.detail.id === 'save') {
        save();
        return;
    }

    if (event.detail.id === 'reset') {
        resetDefaults();
        return;
    }

    if (event.detail.id === 'factory-reset') {
        invokeFactoryReset();
    }
}

/**
 * Applies a card list change: add, move, or remove a recorder, repository, or MCP server. The
 * section is rendered again and every card keeps its own open state.
 *
 * @param {CustomEvent} event - g4-add, g4-move, or g4-remove event of a card list.
 */
function onAppCardListChange(event) {
    const listName = event.target.dataset.list;
    const lists = {
        recorders: {
            add: addRecorder,
            path: 'settings.recorderSettings.recorders',
            sectionId: 'recorders'
        },
        repositories: {
            add: addRepository,
            path: 'settings.pluginsSettings.externalRepositories',
            sectionId: 'plugins'
        },
        servers: {
            add: addServer,
            path: 'settings.pluginsSettings.servers',
            sectionId: 'mcp'
        }
    };
    const list = lists[listName];

    // Only the three card lists of this page change state here.
    if (!list) {
        return;
    }

    // Adding seeds a new item, renders it, and opens it.
    if (event.type === 'g4-add') {
        list.add();
        return;
    }

    // Recorders and repositories are arrays; MCP servers are an object whose key order is the card order.
    const value = getPath(globalThis.STATE, list.path);
    const isServers = listName === 'servers';
    const items = isServers ? Object.entries(value || {}) : (Array.isArray(value) ? value : []);

    // Swap the two items, or drop the removed one.
    if (event.type === 'g4-move') {
        const { from, to } = event.detail;
        [items[from], items[to]] = [items[to], items[from]];
    } else {
        items.splice(event.detail.index, 1);
    }

    // MCP servers are stored again as an object, in the new key order.
    if (isServers) {
        setPath(globalThis.STATE, list.path, Object.fromEntries(items));
    }

    // Render the section again, then give every card its own open state back.
    updateSection(list.sectionId);
    document.querySelector(`g4-card-list[data-list="${listName}"]`)?.setOpenStates(event.detail.openStates);
}

/**
 * Commits an edit that is stored when the user leaves the control (an MCP server rename), and
 * stores list and key/value structural changes (add, remove, move) like typing.
 *
 * @param {CustomEvent} event - g4-change event of a component.
 */
function onAppChange(event) {
    const dataset = event.target.dataset;

    // A server name is committed when the user leaves the box, so typing never re-renders it.
    if (dataset.kind === 'server-name') {
        renameServer(dataset.server, event.detail.value);
        return;
    }

    // Adding, removing, or moving list and key/value entries is stored like typing.
    if (dataset.kind === 'list' || dataset.kind === 'map') {
        onAppInput(event);
    }
}

/**
 * Runs the page buttons inside the sections (Test Connection, Fetch Free Token, Refresh Driver
 * List) and opens external links in the computer's browser.
 *
 * @param {MouseEvent} event - Click event.
 */
function onAppClick(event) {
    const link = event.target.closest('a[data-external]');

    // External links open in the computer's browser, not inside the webview.
    if (link) {
        if (!openExternal(link.href)) {
            event.preventDefault();
        }

        return;
    }

    const button = event.target.closest('g4-busy-button[data-action]');

    // A busy or disabled button does not start its work again.
    if (!button || button.busy || button.disabled) {
        return;
    }

    // Start the button's work; each one shows its progress in a section status line.
    switch (button.dataset.action) {
        case 'fetch-token':
            getDevelopmentLicense(button);
            break;
        case 'refresh-drivers':
            updateDrivers(button, button.dataset.sectionId);
            break;
        case 'test-connection':
            testConnection(button);
            break;
        default:
            break;
    }
}

/**
 * Writes component values into state, by the control's data-kind, without re-rendering (except
 * for choices that change which fields a section shows).
 *
 * @param {CustomEvent} event - g4-input (or g4-change) event of a component; detail.value is its value.
 */
function onAppInput(event) {
    const dataset = event.target.dataset;
    const path = dataset.path;
    const value = event.detail.value;

    switch (dataset.kind) {
        case 'bool':
            setControlValue({ path, rawValue: value, kind: 'bool' });
            break;
        case 'credentials-type':
            setCredentialsType(path, value);
            break;
        case 'json':
            setJsonValue(path, value);
            break;
        case 'list':
            setPath(globalThis.STATE, path, value);
            break;
        case 'map':
            // Entries without a key are not stored; the editor keeps them while they are typed.
            setPath(globalThis.STATE, path, Object.fromEntries(value
                .filter((entry) => entry.key.trim() !== '')
                .map((entry) => [entry.key.trim(), entry.value])));
            break;
        case 'number': {
            // An optional number left empty is removed (undefined is dropped when the manifest is
            // serialized), so the consumer's default applies instead of a stored 0.
            const isEmptyText = typeof value === 'string' && value.trim() === '';
            const isEmptyOptional = dataset.optional === 'true' && isEmptyText;

            if (isEmptyOptional) {
                setPath(globalThis.STATE, path, undefined);
                break;
            }

            // A number field may carry a lower bound; the stored value is clamped to it.
            const minimum = dataset.minimum === undefined ? null : Number(dataset.minimum);

            setControlValue({ path, rawValue: value, kind: 'number', minimum });
            break;
        }

        case 'port':
            // Ports render as numbers but the manifest stores them as text.
            setPath(globalThis.STATE, path, String(value));
            break;
        case 'server-name':
            // A server is renamed when the user leaves the box (g4-change).
            break;
        case 'server-type':
            setServerType(dataset.server, value);
            break;
        default:
            if (path) {
                setControlValue({ path, rawValue: value });
            }
    }

    // A recorder script, or its "Add to Automation Flow" switch, re-checks the script.
    if (dataset.recorderIndex !== undefined) {
        updateRecorderScriptError(Number(dataset.recorderIndex), dataset.phase);
    }
}

/**
 * Handles messages returned by the extension host.
 *
 * @param {MessageEvent} event - The webview message event.
 */
function onHostMessage(event) {
    // Verify the message came from the webview host itself, not an embedded cross-origin frame,
    // before trusting its data. The host delivers with this frame's own origin; an empty origin is
    // also allowed because some host deliveries carry no origin value.
    const isTrustedOrigin = event.origin === window.origin || event.origin === '';

    if (!isTrustedOrigin) {
        return;
    }

    const message = event.data;

    // The user confirmed the factory reset in the host's dialog.
    if (message?.command === 'factoryResetConfirmed') {
        resetFactorySettings();
        return;
    }

    // A sandbox path picked or detected by the host fills the sandbox field.
    if (message?.command !== 'setSandboxPath' || !message.sandboxPath) {
        return;
    }

    setSandboxPath(message.sandboxPath);
}

/**
 * Opens a URL in the computer's default browser.
 *
 * Behavior:
 * - Inside the VS Code host, delegates to the extension (vscode.env.openExternal)
 *   and returns false to cancel the in-webview navigation.
 * - Outside the host, returns true so a normal browser follows the link.
 *
 * @param {string} url - The URL to open.
 * @returns {boolean} false when handled by the host, true otherwise.
 */
function openExternal(url) {
    // When hosted, ask the extension to open the link and cancel navigation.
    if (globalThis.VSCODE) {
        globalThis.VSCODE.postMessage({ command: 'openExternal', url });
        return false;
    }

    // Outside the host, let the browser follow the link normally.
    return true;
}

/**
 * Pulls the token string out of the development-license README.
 *
 * Behavior:
 * - Scopes the search to the "Development License" section when present.
 * - Prefers the explicit ```none fenced block.
 * - Falls back to the first long base64-looking run.
 * - Returns null when no token can be found.
 *
 * @param {string} markdown - The raw README contents.
 * @returns {string|null} The extracted token, or null when none is found.
 */
function readDevelopmentToken(markdown) {
    // Normalize the input to a string.
    const text = String(markdown || '');

    // Scope the search to the Development License section when present.
    const headingAt = text.search(/##\s*Development License/i);
    const region = headingAt >= 0 ? text.slice(headingAt) : text;

    // Preferred: the explicit ```none ... ``` fenced block.
    const marker = '```none';
    const markerAt = region.toLowerCase().indexOf(marker);

    if (markerAt >= 0) {
        const lineBreakAt = region.indexOf('\n', markerAt + marker.length);

        if (lineBreakAt >= 0) {
            const contentStart = lineBreakAt + 1;
            const fenceCloseAt = region.indexOf('\n```', contentStart);

            if (fenceCloseAt > contentStart) {
                const token = region.slice(contentStart, fenceCloseAt).replaceAll('\r', '').trim();

                if (token) {
                    return token;
                }
            }
        }
    }

    // Fallback: the first long base64-ish token in the section.
    const fallbackTokenMatch = /[A-Za-z0-9+/]{200,}={0,2}/.exec(region);

    if (!fallbackTokenMatch) {
        return null;
    }

    return fallbackTokenMatch[0];
}

/**
 * Renames an MCP server while preserving its position and definition.
 *
 * Behavior:
 * - Ignores no-op or empty renames, and refuses to overwrite an existing key.
 * - Rebuilds the object so the renamed key keeps its original order.
 * - Keeps every card's open state.
 *
 * @param {string} oldName - The current server key.
 * @param {string} newNameRaw - The requested new key.
 */
function renameServer(oldName, newNameRaw) {
    // Normalize the requested name and resolve the servers map.
    const newName = String(newNameRaw || '').trim();
    const servers = getPath(globalThis.STATE, 'settings.pluginsSettings.servers') || {};

    // Ignore no-op or empty renames, and refuse to overwrite an existing key.
    if (!newName || newName === oldName || servers[newName]) {
        updateSection('mcp');
        return;
    }

    // Rebuild the object so the renamed key keeps its original order.
    const next = {};

    for (const [key, value] of Object.entries(servers)) {
        next[key === oldName ? newName : key] = value;
    }

    setPath(globalThis.STATE, 'settings.pluginsSettings.servers', next);
    updateSection('mcp');
}

/**
 * Restores every setting to the values the page opened with (Reset to Defaults) and re-renders.
 *
 * @remarks
 * Matches the publishers' Reset to Defaults: it undoes this session's edits. Restoring the shipped
 * defaults is a separate, confirmed action (resetFactorySettings).
 */
function resetDefaults() {
    // Restore the opened working copy and re-render the whole form.
    globalThis.STATE = copyValue(globalThis.INITIAL);
    showSettings();
    showSaveNote('Defaults restored.');
}

/**
 * Restores the shipped defaults after the user confirmed it in the host's dialog, and re-renders.
 *
 * @remarks
 * Clears the license token and the sandbox path; nothing is written until the user saves.
 */
function resetFactorySettings() {
    // Replace the working copy with the shipped baseline and re-render the whole form.
    globalThis.STATE = copyValue(globalThis.DEFAULTS);
    showSettings();
    showSaveNote('Factory settings restored. Click Save to apply.');
}

/**
 * Resolves which section owns a given state path, for path-based edits
 * (credentials) that need to know what to re-render.
 *
 * @param {string} path - A dotted state path.
 * @returns {string|null} The owning section id, or null if unknown.
 */
function resolveSectionId(path) {
    // MCP servers live under a more specific path than other plugin settings.
    if (path.startsWith('settings.pluginsSettings.servers')) {
        return 'mcp';
    }

    // Remaining plugin settings belong to the plugins section.
    if (path.startsWith('settings.pluginsSettings')) {
        return 'plugins';
    }

    // Recorder settings belong to the recorders section.
    if (path.startsWith('settings.recorderSettings')) {
        return 'recorders';
    }

    // Log settings belong to the logging section.
    if (path.startsWith('settings.clientLogConfiguration')) {
        return 'logging';
    }

    // Unknown owner.
    return null;
}

/**
 * Checks the form and sends the settings to the extension host.
 *
 * Behavior:
 * - Checks everything first, so every problem is shown at once: empty required fields get
 *   "Required." and repeated or keyless entries are marked; their sections and cards open.
 * - Builds a clean manifest from the current state and posts it to the host.
 * - Briefly shows a "Settings sent." note regardless of host wiring.
 */
function save() {
    const isRequiredMissing = showRequiredErrors();
    const isEntryInvalid = showEntryErrors();

    // Nothing is saved while any problem remains.
    if (isRequiredMissing || isEntryInvalid) {
        return;
    }

    // Build the clean manifest to send.
    const manifest = newManifest();

    // Send it to the host, or warn when the bridge is unavailable.
    if (globalThis.VSCODE) {
        globalThis.VSCODE.postMessage({ command: 'saveSettings', manifest });
    } else {
        console.warn('VS Code bridge unavailable; settings were not sent.', manifest);
    }

    // Give the user immediate feedback regardless of host wiring.
    showSaveNote('Settings sent.');
}

/**
 * Requests a sandbox folder picker from the extension host.
 *
 * Behavior:
 * - Uses the host folder picker so the webview never needs filesystem permissions.
 * - Leaves the current field value unchanged when the picker is cancelled.
 */
function selectSandboxFolder() {
    // The webview cannot open a native folder picker directly.
    if (!globalThis.VSCODE) {
        setSectionStatus('connection', 'Browse is available only inside VS Code.');
        return;
    }

    // Ask the host to open a folder picker.
    globalThis.VSCODE.postMessage({ command: 'browseSandbox' });
}

/**
 * Handles a single value change from a bound control.
 *
 * Behavior:
 * - Coerces the raw value based on the control kind (text/number/bool).
 * - Clamps number values to the supplied lower bound.
 * - Writes the coerced value into state at `path`.
 *
 * @param {object} options - Bound-control update options.
 * @param {string} options.path - The dotted state path that changed.
 * @param {*} options.rawValue - The raw value from the control.
 * @param {('text'|'number'|'bool')} [options.kind='text'] - How to coerce the value.
 * @param {number} [options.minimum=null] - Optional lower bound for number values.
 */
function setControlValue(options) {
    // Resolve the explicit update options supplied by the generated markup.
    const {
        path,
        rawValue,
        kind = 'text',
        minimum = null
    } = options;

    // Start from the raw value; coerce it below based on the control kind.
    let value = rawValue;

    // Number fields parse to a finite number and clamp to the lower bound.
    const isNumberKind = kind === 'number';

    if (isNumberKind) {
        // Keep the field usable while typing; treat empty as 0.
        const parsed = Number(rawValue);
        value = Number.isFinite(parsed) ? parsed : 0;

        // Enforce a client-side floor so the engine never receives an
        // out-of-range value (it rejects anything <= 0 server-side).
        const isMinimumProvided = minimum !== null && minimum !== undefined;

        if (isMinimumProvided && value < minimum) {
            value = minimum;
        }
    }

    // Boolean fields coerce the value to a true/false.
    const isBooleanKind = kind === 'bool';

    if (isBooleanKind) {
        value = !!rawValue;
    }

    // Write the coerced value into state.
    setPath(globalThis.STATE, path, value);

    // Recorder mode only applies to UIA; changing a recorder driver may disable and reset the mode.
    const isRecorderDriverPath = path.startsWith('settings.recorderSettings.recorders.') &&
        path.endsWith('.driverParameters.driver');

    if (isRecorderDriverPath) {
        setRecorderModes(globalThis.STATE.settings?.recorderSettings?.recorders);
        updateSection('recorders');
    }
}

/**
 * Switches the credentials auth type at `path`, preserving any reusable
 * fields, then re-renders so the matching inputs appear.
 *
 * Behavior:
 * - Builds a basic/bearer object that keeps any reusable fields.
 * - Stores null for 'none'.
 * - Re-renders the owning section.
 *
 * @param {string} path - Dotted state path to the credentials object.
 * @param {('none'|'basic'|'bearer')} type - The chosen auth type.
 */
function setCredentialsType(path, type) {
    // Read the current credentials so reusable fields can be preserved.
    const current = getPath(globalThis.STATE, path) || {};

    // Build the new credentials object based on the chosen type.
    if (type === 'basic') {
        setPath(globalThis.STATE, path, {
            type: 'basic',
            username: current.username || '',
            password: current.password || ''
        });
    } else if (type === 'bearer') {
        setPath(globalThis.STATE, path, { type: 'bearer', token: current.token || '' });
    } else {
        setPath(globalThis.STATE, path, null);
    }

    // Re-render the owning section so the matching inputs appear.
    updateSection(resolveSectionId(path));
}

/**
 * Stores a JSON editor's text: valid JSON is written to state, an empty box stores an empty
 * object, and invalid JSON keeps the last good value (the editor shows the error).
 *
 * @param {string} path - The dotted state path to write.
 * @param {string} rawValue - The editor text.
 */
function setJsonValue(path, rawValue) {
    const text = String(rawValue ?? '').trim();

    // An empty box means "no value here" - store an empty object.
    if (!text) {
        setPath(globalThis.STATE, path, {});
        return;
    }

    try {
        setPath(globalThis.STATE, path, JSON.parse(text));
    } catch {
        // Invalid JSON keeps the last good value; the JSON text area shows why.
    }
}

/**
 * Writes a nested value into an object using a dotted path.
 *
 * Behavior:
 * - Splits the path into segments, keeping escaped segments intact.
 * - Walks to the parent of the target leaf, creating objects as needed.
 * - Assigns the value to the final segment.
 *
 * @param {object} root - The object to write into.
 * @param {string} path - A dotted path to the target leaf.
 * @param {*} value - The value to assign.
 */
function setPath(root, path, value) {
    // Split the path and peel off the final (leaf) segment.
    const keys = splitPath(path);
    const last = keys.pop();

    // Walk to the parent of the target leaf, creating objects as needed.
    const parent = keys.reduce((parentValue, key) => {
        // Replace any missing/non-object link with a fresh object so the walk continues.
        const isParentValueMissing = parentValue[key] === null || parentValue[key] === undefined;

        if (isParentValueMissing || typeof parentValue[key] !== 'object') {
            parentValue[key] = {};
        }

        return parentValue[key];
    }, root);

    // Assign the value to the leaf segment on its parent.
    parent[last] = value;
}

/**
 * Normalizes recorder modes so non-UIA recorders are always saved as standard mode.
 *
 * @param {Array<object>|null|undefined} recorders - Recorder entries to normalize in place.
 */
function setRecorderModes(recorders) {
    // Ignore missing or malformed recorder lists; callers may pass partial manifests.
    if (!Array.isArray(recorders)) {
        return;
    }

    // Apply the mode contract to every recorder before rendering or saving.
    for (const recorder of recorders) {
        const driver = recorder?.driverParameters?.driver;
        const isUiaRecorder = testUiaRecorderDriver(driver);

        if (!isUiaRecorder) {
            recorder.mode = 'standard';
            continue;
        }

        const isKnownMode = RECORDER_MODE_CHOICES.some(choice => choice.value === recorder.mode);

        if (!isKnownMode) {
            recorder.mode = 'standard';
        }
    }
}

/**
 * Applies a sandbox path returned by the extension host.
 *
 * @param {string} sandboxPath - The selected or detected sandbox path.
 */
function setSandboxPath(sandboxPath) {
    // Store the selected path in the root manifest sandbox field.
    setPath(globalThis.STATE, 'sandbox', sandboxPath);

    // Reflect the host-selected value in the visible editable input.
    const input = document.querySelector('[data-path="sandbox"]');

    if (input) {
        input.value = sandboxPath;
    }

    // Tell the user the value is staged and still follows normal Save behavior.
    setSectionStatus('connection', 'Sandbox path set. Click Save to apply it.', 'ok');
}

/**
 * Writes a status message to a section's bottom status line, and remembers it so a re-rendered
 * section shows it again.
 *
 * @param {string} sectionId - The owning section id.
 * @param {string} message - The status text to show.
 * @param {'ok' | 'error' | ''} [tone=''] - Status color.
 */
function setSectionStatus(sectionId, message, tone = '') {
    const sectionStatus = globalThis.SECTION_STATUS[sectionId];

    // Only sections with a status line can show a status.
    if (!sectionStatus) {
        return;
    }

    // Remember the status, so a re-rendered section shows it again, then show it now.
    sectionStatus.message = typeof message === 'string' ? message : '';
    sectionStatus.tone = tone;
    getSection(sectionId)?.setStatus(sectionStatus.message, tone);
}

/**
 * Switches an MCP server's transport type and re-renders so the matching
 * local/remote fields appear.
 *
 * @param {string} name - The server key.
 * @param {string} type - The chosen transport ('stdio' | 'http' | 'sse').
 */
function setServerType(name, type) {
    // Store the new transport type and re-render the MCP section.
    setPath(globalThis.STATE, `settings.pluginsSettings.servers.${convertToEscapedKey(name)}.type`, type);
    updateSection('mcp');
}

/**
 * Shows the entry problems of every list that must be unique and of every key/value editor
 * (repeated entries, values without a key), and opens the sections and cards that hold them.
 *
 * @returns {boolean} True when an entry has a problem.
 */
function showEntryErrors() {
    const invalidEditors = [...document.querySelectorAll('#app g4-list-editor[unique], #app g4-key-value-editor')]
        .filter((editor) => !editor.validate());

    // Open what holds each problem, and say why in its section.
    for (const editor of invalidEditors) {
        const section = editor.closest('g4-section');
        const card = editor.closest('g4-card');

        if (card) {
            card.open = true;
        }

        if (section) {
            section.open = true;
            setSectionStatus(section.dataset.sectionId, 'Fix the highlighted entries before saving.', 'error');
        }
    }

    return invalidEditors.length > 0;
}

/**
 * Scrolls the form so an element sits in the middle of it.
 *
 * @remarks
 * Only the form (#app) scrolls. Element.scrollIntoView would also scroll the frames VS Code wraps
 * the webview in, which moves the whole page (header and action bar included) by a few pixels.
 *
 * @param {Element} element - Element to bring into view.
 */
function showInForm(element) {
    const form = document.getElementById('app');
    const formBox = form.getBoundingClientRect();
    const elementBox = element.getBoundingClientRect();

    // Move the form by the element's distance from the form's middle.
    form.scrollTop += elementBox.top - formBox.top - (formBox.height - elementBox.height) / 2;
}

/**
 * Opens the card with the given id, scrolls it into view, and focuses its first editable field.
 *
 * @param {string} cardId - The card's card-id.
 */
function showItem(cardId) {
    const card = document.querySelector(`g4-card[card-id="${cardId}"]`);

    // A card that was not rendered has nothing to show.
    if (!card) {
        return;
    }

    // Open the card, bring it into view, and put the caret in its first field.
    card.open = true;
    card.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    card.querySelector('input[type=text], input[type=number], input[type=password], textarea, select')?.focus();
}

/**
 * Marks every empty required field with "Required." (fields show only their * until a save), and
 * opens the sections and cards that hold them.
 *
 * @returns {boolean} True when a required field is empty.
 */
function showRequiredErrors() {
    const emptyFields = [...document.querySelectorAll('#app g4-field[required]')]
        .filter((field) => !field.testRequired());

    // Open the card, then the section, that hold each empty field.
    for (const field of emptyFields) {
        const card = field.closest('g4-card');
        const section = field.closest('g4-section');

        if (card) {
            card.open = true;
        }

        if (section) {
            section.open = true;
        }
    }

    // Every required field is filled.
    if (emptyFields.length === 0) {
        return false;
    }

    // Say why in the first affected section, and bring the first empty field into view.
    const sectionId = emptyFields[0].closest('g4-section')?.dataset.sectionId;

    if (sectionId) {
        setSectionStatus(sectionId, 'Fill in the required fields before saving.', 'error');
    }

    showInForm(emptyFields[0]);
    emptyFields[0].focus();

    return true;
}

/**
 * Shows a short note in the action bar, such as "Settings sent." after a save.
 *
 * @param {string} text - Note text; it disappears after SAVE_NOTE_DURATION_MILLISECONDS.
 */
function showSaveNote(text) {
    document.querySelector('#g4-actionbar g4-action-bar')?.showNote(text);
}

/**
 * Renders the header, the full settings form, and the action bar from the current state.
 */
function showSettings() {
    // Render the page header.
    document.getElementById('g4-header').innerHTML = `
    <g4-page-header meta="Configure how the automation engine runs"
                    page-title="G4&#x2122; Settings"
                    test-id="settings-header"></g4-page-header>`;

    // Render every section in display order.
    const sections = [
        writeConnectionSection(),
        writeLicenseSection(),
        writeDriverSection(),
        writeRunBehaviorSection(),
        writeLoggingSection(),
        writeReportsSection(),
        writeResponseDataSection(),
        writeScreenshotsSection(),
        writePluginsSection(),
        writeMcpSection(),
        writeRecordersSection()
    ].join('');

    document.getElementById('app').innerHTML = `
    <div class="settings-main">
        ${sections}
        <div class="settings-page-spacer"></div>
    </div>`;

    // Render the action bar with Save / Reset controls.
    const actions = [
        { id: 'save', label: 'Save', testId: 'save-settings-button', variant: 'primary' },
        { id: 'reset', label: 'Reset to Defaults', testId: 'reset-settings-to-defaults-button', variant: 'secondary' },
        { id: 'factory-reset', label: 'Restore Factory Settings', testId: 'restore-factory-settings-button', variant: 'secondary' }
    ];

    document.getElementById('g4-actionbar').innerHTML = `
    <g4-action-bar actions="${getEscapedText(actions)}"
                   note-duration="${SAVE_NOTE_DURATION_MILLISECONDS}"
                   test-id="settings-status"></g4-action-bar>`;
}

/**
 * Splits a dotted path into segments, keeping escaped segments intact.
 *
 * Behavior:
 * - Copies an escaped segment verbatim from between its markers.
 * - Skips the dot that follows an escaped segment.
 * - Reads a normal segment up to the next dot.
 *
 * @param {string} path - The dotted path to split.
 * @returns {string[]} The resolved path segments.
 */
function splitPath(path) {
    // Accumulated path segments and the current scan position.
    const segments = [];
    let i = 0;

    // Scan the whole path one segment at a time.
    while (i < path.length) {
        // An escaped segment is copied verbatim between the markers.
        if (path.startsWith(KEY_OPEN, i)) {
            // Find the closing marker and capture the wrapped segment text.
            const end = path.indexOf(KEY_CLOSE, i + KEY_OPEN.length);
            segments.push(path.slice(i + KEY_OPEN.length, end));
            i = end + KEY_CLOSE.length;

            // Skip the dot that follows an escaped segment, if present.
            if (path[i] === '.') {
                i++;
            }

            continue;
        }

        // A normal segment runs up to the next dot.
        let dot = path.indexOf('.', i);

        if (dot === -1) {
            dot = path.length;
        }

        segments.push(path.slice(i, dot));
        i = dot + 1;
    }

    // Return the resolved segment list.
    return segments;
}

/**
 * Initializes the page: renders it and wires the delegated listeners once.
 */
function startSettings() {
    const app = document.getElementById('app');

    showSettings();

    // Every component reports through events; the listeners survive re-renders of #app.
    app.addEventListener('g4-input', onAppInput);
    app.addEventListener('g4-change', onAppChange);
    app.addEventListener('g4-add', onAppCardListChange);
    app.addEventListener('g4-move', onAppCardListChange);
    app.addEventListener('g4-remove', onAppCardListChange);
    app.addEventListener('g4-browse', selectSandboxFolder);
    app.addEventListener('g4-detect', findSandboxFolder);
    app.addEventListener('click', onAppClick);
    document.getElementById('g4-actionbar').addEventListener('g4-action', onActionBarAction);

    // Populate the Driver dropdowns from the engine (best effort).
    updateDrivers();
}

/**
 * Pings the configured engine and reports the result in the Connection section.
 *
 * Behavior:
 * - Shows the button busy while the request is in flight.
 * - Reports "Connected" on success and "Could not connect" on failure.
 *
 * @param {HTMLElement} button - The Test Connection busy button.
 */
async function testConnection(button) {
    button.busy = true;
    setSectionStatus('connection', 'Testing...');

    try {
        // Ping the engine and treat any non-OK status as a failure.
        const response = await fetch(getPingUrl(), { cache: 'no-store' });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        setSectionStatus('connection', 'Connected', 'ok');
    } catch (error) {
        // Report a friendly failure message and log the detail.
        console.warn('Connection test failed:', error);
        setSectionStatus('connection', 'Could not connect', 'error');
    } finally {
        // Always restore the button regardless of the outcome.
        button.busy = false;
    }
}

/**
 * Tests whether a recorder driver is UIA.
 *
 * @param {string|undefined} driver - Recorder driver value from the manifest.
 * @returns {boolean} True when the driver is UiaDriver.
 */
function testUiaRecorderDriver(driver) {
    // Match the manifest driver contract exactly so other recorder families keep standard mode.
    return driver === 'UiaDriver';
}

/**
 * Fetches the driver manifests from the engine and refreshes every Driver
 * dropdown.
 *
 * Behavior:
 * - Shows the clicked button busy while the request is in flight.
 * - Writes section status only when the refresh was user-triggered.
 * - Reads each manifest's `key` and stores them as the driver list.
 * - Falls back to the static list on failures or empty responses.
 * - Re-renders the driver and recorder sections so the selects update.
 *
 * @param {HTMLElement} [button] - The clicked "refresh" busy button, if any.
 * @param {string} [sectionId] - The section that should receive user-triggered status.
 */
async function updateDrivers(button, sectionId) {
    // Page-load refreshes pass no section id and stay silent by design.
    const isUserRefresh = !!button && !!sectionId;
    let statusMessage = 'Could not refresh driver list. Using the built-in driver list.';
    let statusTone = 'error';

    // The section re-render below rebuilds the button, so it needs no manual reset.
    if (button) {
        button.busy = true;
    }

    // User-triggered refreshes report progress at the section bottom.
    if (isUserRefresh) {
        setSectionStatus(sectionId, 'Refreshing driver list...');
    }

    try {
        // Request the driver manifests from the engine.
        const response = await fetch(getDriversUrl(), { cache: 'no-store' });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        // Keep only the valid string `key` from each returned manifest.
        const data = await response.json();
        const driverKeys = Array.isArray(data)
            ? data.map(manifest => manifest?.key).filter(key => typeof key === 'string' && key)
            : [];

        if (!driverKeys.length) {
            throw new Error('No driver manifests returned');
        }

        // Store the fetched keys and prepare a success status for user-triggered refreshes.
        globalThis.DRIVERS = driverKeys;
        statusMessage = 'Driver list refreshed.';
        statusTone = 'ok';
    } catch (error) {
        // On any failure, drop back to the static fallback list.
        console.warn('Could not fetch driver manifests:', error);
        globalThis.DRIVERS = null;
    }

    // Persist the final status before re-render so the rebuilt section keeps it.
    if (isUserRefresh) {
        setSectionStatus(sectionId, statusMessage, statusTone);
    }

    // Refresh the driver selects in place, preserving fold states and scroll.
    updateSection('driver');
    updateSection('recorders');
}

/**
 * Refreshes the inline unsafe-character notice for one recorder script field.
 *
 * Behavior:
 * - Surfaces a reason only when the script is flagged "Add to Automation Flow" and is unsafe.
 * - Clears the notice otherwise.
 *
 * @param {number} index - The recorder index in the recorders array.
 * @param {string} phase - Either 'preScript' or 'postScript'.
 */
function updateRecorderScriptError(index, phase) {
    // Resolve the notice element rendered next to the script field; nothing to do without it.
    const errorElement = document.getElementById(`err-${phase}-${index}`);

    if (!errorElement) {
        return;
    }

    // Read the current script configuration for this recorder.
    const base = `settings.recorderSettings.recorders.${index}.${phase}`;
    const scriptConfig = getPath(globalThis.STATE, base) || {};

    // Surface the unsafe-character reason only when the script is opted into the automation flow.
    const isFlagged = scriptConfig.addToAutomationFlow === true;
    const reason = isFlagged ? getUnsafeScriptReason(scriptConfig.script) : '';

    errorElement.textContent = reason;
}

/**
 * Re-renders one section's content in place. The section itself stays: its fold state, status
 * line, and the page scroll are untouched, and every card that was open stays open.
 *
 * @param {string} id - The section id (e.g. 'plugins').
 */
function updateSection(id) {
    const section = getSection(id);
    const builder = globalThis.SECTION_BUILDERS[id];

    if (!section || !builder) {
        return;
    }

    // Build the section off-DOM (a template is inert, so its components stay plain markup), and take
    // its content.
    const scratch = document.createElement('template');
    scratch.innerHTML = builder();

    const freshSection = scratch.content.querySelector('g4-section');
    const openCardIds = [...section.querySelectorAll('g4-card[open]')].map((card) => card.getAttribute('card-id'));

    section.replaceContent(freshSection?.innerHTML ?? '');

    // Reopen the cards that were open (by position, so editing a card never folds it).
    openCardIds.forEach((cardId) => {
        const card = section.querySelector(`g4-card[card-id="${cardId}"]`);

        if (card) {
            card.open = true;
        }
    });
}

/**
 * Renders a note linking to the engine's Capabilities page (the live G4
 * catalog). Used in the Plugins and MCP Servers sections.
 *
 * @returns {string} HTML markup for the capabilities note.
 */
function writeCapabilitiesNote() {
    // Resolve the live Capabilities page URL from current settings.
    const url = getCapabilitiesUrl();

    // Render the hint with an external link the page opens through the host.
    return `<div class="settings-hint settings-hint-block--compact">
        Browse the full G4 catalog on the
        <a href="${getEscapedText(url)}" data-external="true" target="_blank" rel="noopener noreferrer">Capabilities page</a>
        - search plugins, read each plugin's manifest and documentation, and add external or MCP sources.
    </div>`;
}

/**
 * Builds the "Connection" section: where the G4 engine lives.
 *
 * @returns {string} HTML markup for the section.
 */
function writeConnectionSection() {
    // Build the protocol/host/port row with the Test Connection control aligned at the end.
    const body = `
    <div class="settings-field-row settings-connection-row">
        ${writeSelect({
        path: 'g4Server.schema',
        label: 'Protocol',
        hint: 'Use HTTPS only if your engine sits behind a secure proxy.',
        choices: [
            { value: 'http', text: 'HTTP (Default)' },
            { value: 'https', text: 'HTTPS (Secure)' }
        ]
    })}
        ${writeText({
        path: 'g4Server.host',
        label: 'Engine Address',
        hint: 'The computer running G4. "localhost" means this machine.'
    })}
        ${writePort({
        path: 'g4Server.port',
        label: 'Port',
        hint: 'The network port G4 listens on (default 9944).'
    })}
        <div class="settings-connection-action">
            <g4-busy-button data-action="test-connection"
                            label="Test Connection"
                            size="field"
                            test-id="test-g4-connection"></g4-busy-button>
        </div>
    </div>
    ${writeSandboxField()}
    `;

    // Wrap the body in the collapsible section shell.
    return writeSection({
        id: 'connection',
        title: 'Connection',
        desc: 'Tell G4 where the automation engine is running.',
        body,
        open: true
    });
}

/**
 * Renders an HTTP-credentials editor (None / Basic / Bearer) bound to an
 * AuthenticationModel object at `path`.
 *
 * Stored shape (assumed):
 *   none   -> null
 *   basic  -> { type: 'basic', username, password }
 *   bearer -> { type: 'bearer', token }
 *
 * @param {object} options - Control options.
 * @param {string} options.path - Dotted state path to the credentials object.
 * @param {string} options.label - Human-friendly field label.
 * @param {string} [options.hint] - Optional helper text shown under the label.
 * @returns {string} HTML markup for the credentials editor.
 */
function writeCredentials({ path, label, hint }) {
    // Detect the current auth type.
    const type = getCredentialsType(getPath(globalThis.STATE, path));
    const choices = [
        { value: 'none', text: 'None' },
        { value: 'basic', text: 'Basic (Username & Password)' },
        { value: 'bearer', text: 'Bearer (Token)' }
    ];

    // Render the auth-type selector; a choice re-renders the section with the matching inputs.
    const selector = writeField({
        label,
        hint,
        control: `
        <g4-select data-kind="credentials-type"
                   data-path="${getEscapedText(path)}"
                   choices="${getEscapedText(choices)}"
                   value="${type}"></g4-select>`
    });

    // Render the auth-type-specific input fields.
    if (type === 'basic') {
        return selector + `
        <div class="settings-field-row">
            ${writeText({ path: `${path}.username`, label: 'Username' })}
            ${writeSecret({ path: `${path}.password`, label: 'Password' })}
        </div>`;
    }

    return type === 'bearer'
        ? selector + writeSecret({ path: `${path}.token`, label: 'Token' })
        : selector;
}

/**
 * Renders the standard manifest `driverParameters` editor: driver,
 * driver service URL/path, and the alwaysMatch capabilities JSON. Shared
 * by the Default Browser section and each recorder card so they edit the
 * exact same structure.
 *
 * @param {string} base - Dotted state path to the driverParameters object.
 * @param {string} sectionId - The section that owns refresh status for this editor.
 * @param {string} testId - Test id prefix for the editor's controls.
 * @returns {string} HTML markup for the driver-parameters controls.
 */
function writeDriverParameters(base, sectionId, testId) {
    // Resolve the saved driver value and its dropdown choices.
    const driverValue = getPath(globalThis.STATE, `${base}.driver`);

    // Render the driver select (+ refresh button), service URL, and capabilities JSON.
    return `
    <div class="settings-field-row">
        ${writeField({
        label: 'Driver',
        hint: 'The technology used to drive the browser or app. Fetched from the engine.',
        control: `
            <g4-select data-path="${getEscapedText(base)}.driver"
                       choices="${getEscapedText(getDriverChoices(driverValue))}"
                       test-id="${testId}-driver-select"
                       value="${getEscapedText(driverValue ?? '')}">
                <g4-busy-button data-action="refresh-drivers"
                                data-section-id="${getEscapedText(sectionId)}"
                                icon-only
                                label="Refresh Driver List"
                                test-id="${testId}-refresh-driver-list"></g4-busy-button>
            </g4-select>`
    })}
        ${writeText({
        path: `${base}.driverBinaries`,
        label: 'Driver Service URL or Path',
        hint: 'A Selenium hub URL, or a local folder holding the driver (common in sandbox setups).'
    })}
    </div>
    ${writeJson({
        path: `${base}.capabilities.alwaysMatch`,
        label: 'Capabilities (alwaysMatch)',
        hint: 'Advanced. WebDriver capabilities applied to every session - set the browser binary, launch args, etc.',
        rows: 10,
        testId: `${testId}-capabilities`
    })}`;
}

/**
 * Builds the "Default Browser" section: the default automation driver.
 *
 * @returns {string} HTML markup for the section.
 */
function writeDriverSection() {
    // Reuse the shared driver-parameters editor for the default driver.
    const body = writeDriverParameters('driverParameters', 'driver', 'driver-parameters');

    // Wrap the body in the collapsible section shell.
    return writeSection({
        id: 'driver',
        title: 'Default Browser',
        desc: 'The technology G4 uses to drive the browser or app.',
        body
    });
}

/**
 * Renders a field frame around a control: label (with * and suffix), hint, and error line.
 *
 * @param {object} options - Field options.
 * @param {string} options.label - Field label.
 * @param {string} [options.hint] - Helper text under the label.
 * @param {string} [options.suffix] - Unit text after the label, such as '(milliseconds)'.
 * @param {boolean} [options.required] - Whether the field shows a * and is checked on save.
 * @param {string} [options.testId] - Test id prefix of the field.
 * @param {string} options.control - Control markup.
 * @returns {string} HTML markup for the field.
 */
function writeField({ label, hint, suffix, required, testId, control }) {
    // Optional attributes are built first, so the markup stays readable.
    const hintAttribute = hint ? ` hint="${getEscapedText(hint)}"` : '';
    const suffixAttribute = suffix ? ` suffix="${getEscapedText(suffix)}"` : '';
    const testIdAttribute = testId ? ` test-id="${getEscapedText(testId)}"` : '';
    const requiredAttribute = required ? ' required' : '';

    return `
    <g4-field${hintAttribute}
              label="${getEscapedText(label)}"${requiredAttribute}${suffixAttribute}${testIdAttribute}>${control}</g4-field>`;
}

/**
 * Renders a JSON editor bound to an object/array state path. Valid JSON is written to state while
 * typing; invalid JSON keeps the last good value and the editor shows why.
 *
 * @param {object} options - Control options.
 * @param {string} options.path - Dotted state path the control binds to.
 * @param {string} options.label - Human-friendly field label.
 * @param {string} [options.hint] - Optional helper text shown under the label.
 * @param {number} [options.rows=8] - Visible height of the editor, in text rows.
 * @param {string} [options.testId] - Test id prefix of the editor.
 * @returns {string} HTML markup for the JSON field.
 */
function writeJson({ path, label, hint, rows = 8, testId }) {
    // Resolve the current value as pretty-printed JSON text.
    const value = getPath(globalThis.STATE, path);
    const isValueMissing = value === null || value === undefined;
    const text = isValueMissing ? '' : JSON.stringify(value, null, 4);
    const editorTestId = `${testId || path.replaceAll(TEST_ID_SEPARATOR_PATTERN, '-')}-json-textarea`;

    return writeField({
        label,
        hint,
        control: `
        <g4-json-textarea data-kind="json"
                          data-path="${getEscapedText(path)}"
                          rows="${rows}"
                          test-id="${getEscapedText(editorTestId)}">${getEscapedText(text)}</g4-json-textarea>`
    });
}

/**
 * Renders an editor for a string-to-string map (e.g. HTTP headers) as key/value rows with add and
 * remove buttons.
 *
 * @param {object} options - Control options.
 * @param {string} options.path - Dotted state path to the map object.
 * @param {string} options.label - Human-friendly field label.
 * @param {string} [options.hint] - Optional helper text shown under the label.
 * @param {string} [options.keyPlaceholder='Key'] - Placeholder for key inputs.
 * @param {string} [options.valuePlaceholder='Value'] - Placeholder for value inputs.
 * @param {string} [options.addLabel='Add'] - Caption for the add button.
 * @param {string} [options.emptyText='None.'] - Text shown when the map is empty.
 * @param {string} [options.testId] - Test id prefix of the editor.
 * @returns {string} HTML markup for the key/value field.
 */
function writeKeyValue(options) {
    const {
        path,
        label,
        hint,
        keyPlaceholder = 'Key',
        valuePlaceholder = 'Value',
        addLabel = 'Add',
        emptyText = 'None.',
        testId
    } = options;
    // The editor starts from the stored map; its test id follows the field or the state path.
    const map = getPath(globalThis.STATE, path) || {};
    const editorTestId = `${testId || path.replaceAll(TEST_ID_SEPARATOR_PATTERN, '-')}-key-value-editor`;

    return writeField({
        label,
        hint,
        control: `
        <g4-key-value-editor data-kind="map"
                             data-path="${getEscapedText(path)}"
                             add-label="+ ${getEscapedText(addLabel)}"
                             empty-text="${getEscapedText(emptyText)}"
                             key-placeholder="${getEscapedText(keyPlaceholder)}"
                             test-id="${getEscapedText(editorTestId)}"
                             value="${getEscapedText(map)}"
                             value-placeholder="${getEscapedText(valuePlaceholder)}"></g4-key-value-editor>`
    });
}

/**
 * Builds the "License" section: the token that authorizes the engine.
 *
 * @returns {string} HTML markup for the section.
 */
function writeLicenseSection() {
    // Build the license guidance, auto-fetch button, and token field.
    const body = `
    <p class="settings-hint settings-hint-block">
        Need a token? Get a free, full-featured license for personal use at
        <a href="https://github.com/g4-api/g4-services#development-license" target="_blank" rel="noopener noreferrer">g4-api/g4-services</a>.
        It renews periodically - when it expires, just request a new one and paste it here.
        If the personal license doesn't work,
        <a href="https://github.com/g4-api/g4-services/issues" target="_blank" rel="noopener noreferrer">open an issue</a>
        and we'll help you out.
    </p>
    <div class="settings-add-row settings-add-row--license">
        <g4-busy-button data-action="fetch-token"
                        label="Fetch Free Token Automatically"
                        test-id="fetch-free-token"></g4-busy-button>
    </div>
    <div class="settings-hint settings-hint-block--loose">
        Downloads the latest free token from GitHub and fills it in below - no copy/paste needed (requires internet access).
    </div>
    ${writeSecret({
        path: 'authentication.token',
        label: 'License Token',
        hint: 'Your private key for the engine. Treat it like a password - never share or post it.'
    })}
    <div class="settings-note">Tip: keep this on one line, with no spaces or line breaks. If you start seeing "unauthorized" errors, your token may have expired.</div>`;

    // Wrap the body in the collapsible section shell.
    return writeSection({
        id: 'license',
        title: 'License',
        desc: 'The token that proves you are allowed to use the engine.',
        body
    });
}

/**
 * Renders a list editor bound to a string[] state path: one text box per entry with a trash button
 * (and move buttons when order matters), plus an add button.
 *
 * Behavior:
 * - Entries are stored as typed; blank entries are dropped when the manifest is saved.
 * - A unique list reports repeated entries (ignoring case) under the repeated row.
 *
 * @param {object} options - Control options.
 * @param {string} options.path - Dotted state path the control binds to (string[]).
 * @param {string} options.label - Human-friendly field label.
 * @param {string} [options.hint] - Optional helper text shown under the label.
 * @param {boolean} [options.isOrdered=false] - Whether rows get move up/down buttons.
 * @param {boolean} [options.isUnique=false] - Whether repeated entries are reported.
 * @param {string} [options.emptyText='None.'] - Text shown when the list is empty.
 * @param {string} [options.testId] - Test id prefix of the editor.
 * @returns {string} HTML markup for the list field.
 */
function writeListRows(options) {
    const { path, label, hint, isOrdered = false, isUnique = false, emptyText = 'None.', testId } = options;
    // The editor starts from the stored list; the rules become bare attributes.
    const value = getPath(globalThis.STATE, path);
    const list = Array.isArray(value) ? value : [];
    const editorTestId = `${testId || path.replaceAll(TEST_ID_SEPARATOR_PATTERN, '-')}-list-editor`;
    const orderedAttribute = isOrdered ? ' ordered' : '';
    const uniqueAttribute = isUnique ? ' unique' : '';

    return writeField({
        label,
        hint,
        control: `
        <g4-list-editor data-kind="list"
                        data-path="${getEscapedText(path)}"
                        empty-text="${getEscapedText(emptyText)}"${orderedAttribute}
                        test-id="${getEscapedText(editorTestId)}"${uniqueAttribute}
                        value="${getEscapedText(list)}"></g4-list-editor>`
    });
}

/**
 * Builds the "Logging" section: the live progress messages.
 *
 * @returns {string} HTML markup for the section.
 */
function writeLoggingSection() {
    // Build the live-progress toggle, frequency/level row, and source filter.
    const body = `
    ${writeToggle({
        path: 'settings.clientLogConfiguration.agentLogConfiguration.enabled',
        label: 'Show Live Progress',
        hint: 'Stream log messages while a run is in progress.'
    })}
    <div class="settings-field-row">
        ${writeText({
        path: 'settings.clientLogConfiguration.agentLogConfiguration.interval',
        label: 'Update Frequency',
        suffix: '(milliseconds)',
        type: 'number',
        hint: 'How often new log lines are pushed. Raise it on slow networks.'
    })}
        ${writeSelect({
        path: 'settings.clientLogConfiguration.logLevel',
        label: 'Detail Level',
        hint: '"Information" is a good everyday default.',
        choices: [
            { value: 'error', text: 'Errors Only' },
            { value: 'warning', text: 'Warnings' },
            { value: 'information', text: 'Information (Default)' },
            { value: 'debug', text: 'Debug (Noisy)' },
            { value: 'trace', text: 'Trace (Very Noisy)' }
        ]
    })}
    </div>
    <div class="settings-field-row">
        ${writeSelect({
        path: 'settings.clientLogConfiguration.sourceOptions.filter',
        label: 'Source Filter Mode',
        hint: '"Include" shows only listed sources; "Exclude" hides them.',
        choices: [
            { value: 'include', text: 'Only Show Listed Sources' },
            { value: 'exclude', text: 'Hide Listed Sources' }
        ]
    })}
    </div>
    ${writeListRows({
        path: 'settings.clientLogConfiguration.sourceOptions.sources',
        label: 'Sources',
        hint: 'Leave empty for the default set. If logs go silent, switch the mode above to "Hide" with this empty.',
        isUnique: true,
        testId: 'sources'
    })}`;

    // Wrap the body in the collapsible section shell.
    return writeSection({
        id: 'logging',
        title: 'Logging',
        desc: 'What G4 tells you while it runs.',
        body
    });
}

/**
 * Builds the "MCP Servers" section: external Model Context Protocol
 * servers whose tools become G4 plugins.
 *
 * @returns {string} HTML markup for the section.
 */
function writeMcpSection() {
    // Resolve the configured MCP servers and their names.
    const servers = getPath(globalThis.STATE, 'settings.pluginsSettings.servers') || {};
    const cards = Object.keys(servers).map((name, index) => writeMcpServerCard(name, servers[name], index)).join('');

    // Build the capabilities note, server list, and add button.
    const body = `
    ${writeCapabilitiesNote()}
    <div class="settings-hint settings-hint-block">Connect external MCP servers - their tools appear in the G4 plugin catalog.</div>
    <g4-card-list data-list="servers"
                  add-label="+ Add MCP Server"
                  empty-style="note"
                  empty-text="No MCP servers connected. Add one to expose its tools as G4 plugins."
                  test-id="mcp-servers">${cards}</g4-card-list>`;

    // Wrap the body in the collapsible section shell.
    return writeSection({
        id: 'mcp',
        title: 'MCP Servers',
        desc: 'External Model Context Protocol servers whose tools become G4 plugins.',
        body
    });
}

/**
 * Builds one editable MCP server card.
 *
 * Behavior:
 * - Detects local (stdio) vs remote (http/sse) transport and shows matching fields.
 * - Renders the variable-length env/headers editor last so it never shifts fixed fields.
 * - Name, Type, and Command (local) or URL (remote) are required.
 *
 * @param {string} name - The server name (object key).
 * @param {object} server - The server definition.
 * @param {number} position - The card position.
 * @returns {string} HTML markup for the server card.
 */
function writeMcpServerCard(name, server, position) {
    // Resolve the card's state base and the transport type.
    const base = `settings.pluginsSettings.servers.${convertToEscapedKey(name)}`;
    const type = server?.type || 'stdio';
    const isRemote = type === 'http' || type === 'sse';
    const testId = `mcp-server-${position}`;
    const typeChoices = [
        { value: 'stdio', text: 'Local Process (stdio)' },
        { value: 'http', text: 'Remote (HTTP)' },
        { value: 'sse', text: 'Remote (SSE)' }
    ];

    // Local (stdio) servers are launched as a process; remote servers are reached over HTTP/SSE.
    // Only the relevant fields are shown.
    const localFields = `
        ${writeText({
        path: `${base}.command`,
        label: 'Command',
        required: true,
        hint: 'The program that starts the server (e.g. node, python, npx).',
        testId: `${testId}-command`
    })}
        ${writeListRows({
        path: `${base}.args`,
        label: 'Arguments',
        hint: 'Passed to the command, in this order.',
        isOrdered: true,
        testId: `${testId}-arguments`
    })}
        ${writeText({
        path: `${base}.workingDirectory`,
        label: 'Working Directory',
        hint: 'Folder the server process runs in. Optional.'
    })}`;

    const remoteFields = writeText({
        path: `${base}.url`,
        label: 'URL',
        required: true,
        validate: 'url',
        placeholder: 'https://...',
        hint: 'The remote MCP server endpoint.',
        testId: `${testId}-url`
    });

    // Remote servers edit request headers; local servers edit env variables.
    const mapEditor = isRemote
        ? writeKeyValue({
            path: `${base}.headers`,
            label: 'Headers',
            hint: 'Optional HTTP headers sent with each request.',
            keyPlaceholder: 'Header',
            valuePlaceholder: 'Value',
            addLabel: 'Add Header',
            emptyText: 'No headers.',
            testId: `${testId}-headers`
        })
        : writeKeyValue({
            path: `${base}.env`,
            label: 'Environment Variables',
            hint: 'Passed to the server process.',
            keyPlaceholder: 'NAME',
            valuePlaceholder: 'value',
            addLabel: 'Add Variable',
            emptyText: 'No environment variables.',
            testId: `${testId}-environment`
        });

    // A foldable card (closed by default): the name/type row, transport fields, timeout, and map editor.
    return `
    <g4-card card-id="server-${position}"
             card-title="${getEscapedText(name)}"
             item-label="server ${getEscapedText(name)}"
             test-id="${testId}"
             title-mono>
        <div class="settings-field-row">
            ${writeField({
        label: 'Name',
        hint: 'A short identifier for this tool server.',
        required: true,
        testId: `${testId}-name-field`,
        control: `
            <g4-text-input data-kind="server-name"
                           data-server="${getEscapedText(name)}"
                           test-id="${testId}-name-text-input"
                           value="${getEscapedText(name)}"></g4-text-input>`
    })}
            ${writeField({
        label: 'Type',
        hint: 'How G4 connects to the server.',
        required: true,
        control: `
            <g4-select data-kind="server-type"
                       data-server="${getEscapedText(name)}"
                       choices="${getEscapedText(typeChoices)}"
                       test-id="${testId}-type-select"
                       value="${type}"></g4-select>`
    })}
        </div>
        ${isRemote ? remoteFields : localFields}
        ${writeText({
        path: `${base}.timeout`,
        label: 'Timeout',
        type: 'number',
        minimum: 0,
        isOptional: true,
        hint: 'Optional connection timeout. Leave empty for the server default.'
    })}
        ${mapEditor}
    </g4-card>`;
}

/**
 * Builds the "Plugins" section: the rules toggle, the Capabilities note, and the external
 * repositories.
 *
 * @returns {string} HTML markup for the section.
 */
function writePluginsSection() {
    // Resolve the configured external repositories.
    const repositories = getPath(globalThis.STATE, 'settings.pluginsSettings.externalRepositories') || [];
    const cards = repositories.map((repository, index) => writeRepositoryCard(repository, index)).join('');

    // Build the rules toggle, capabilities note, repository list, and add button.
    const body = `
    ${writeToggle({
        path: 'settings.pluginsSettings.forceRuleReference',
        label: 'Rebuild Rules at the Start of Every Run',
        hint: 'Recommended on. Keeps each run consistent with the current state.'
    })}
    ${writeCapabilitiesNote()}
    <div class="settings-subheader">External Plugin Repositories</div>
    <div class="settings-hint settings-hint-block">Load extra plugins from remote repositories at startup. Leave empty to use built-in plugins only.</div>
    <g4-card-list data-list="repositories"
                  add-label="+ Add Repository"
                  empty-style="note"
                  empty-text="No external repositories. G4 uses its built-in plugins only."
                  test-id="repositories">${cards}</g4-card-list>`;

    // Wrap the body in the collapsible section shell.
    return writeSection({
        id: 'plugins',
        title: 'Plugins',
        desc: 'Where G4 loads its building blocks from.',
        body
    });
}

/**
 * Renders a numeric port input while preserving the manifest value as a string.
 *
 * @param {object} options - Control options.
 * @param {string} options.path - Dotted state path the port control binds to.
 * @param {string} options.label - Human-friendly field label.
 * @param {string} [options.hint] - Optional helper text shown under the label.
 * @returns {string} HTML markup for the port field.
 */
function writePort({ path, label, hint }) {
    // The port is stored as text; the number box shows it as typed.
    const value = getPath(globalThis.STATE, path);
    const slug = path.replaceAll(TEST_ID_SEPARATOR_PATTERN, '-');

    return writeField({
        label,
        hint,
        control: `
        <g4-number-input data-kind="port"
                         data-path="${getEscapedText(path)}"
                         test-id="${slug}-port"
                         value="${getEscapedText(value ?? '')}"></g4-number-input>`
    });
}

/**
 * Builds one editable recorder ("machine") card.
 *
 * Behavior:
 * - Titles the card "<friendly name> - <driver>", with a positional fallback name.
 * - Renders the enabled toggle, host/port, driver parameters, pacing, and pre/post scripts.
 *
 * @param {object} recorder - The recorder entry from state.
 * @param {number} index - The recorder's index in the recorders array.
 * @returns {string} HTML markup for the recorder card.
 */
function writeRecorderCard(recorder, index) {
    // Resolve the card's state base, the escaped label path, and the display label.
    const base = `settings.recorderSettings.recorders.${index}`;
    const labelPath = `${base}.driverParameters.capabilities.alwaysMatch.${convertToEscapedKey('uia:options')}.label`;
    const label = recorder?.driverParameters?.capabilities?.alwaysMatch?.['uia:options']?.label || `machine-${index + 1}`;
    const isUiaRecorder = testUiaRecorderDriver(recorder?.driverParameters?.driver);

    // Resolve the header driver suffix and the initial unsafe-character notices.
    const driver = recorder?.driverParameters?.driver || '';
    const headerTitle = driver.length > 0 ? `${label} - ${driver}` : label;
    const isPreFlagged = recorder?.preScript?.addToAutomationFlow === true;
    const isPostFlagged = recorder?.postScript?.addToAutomationFlow === true;
    const preScriptReason = isPreFlagged ? getUnsafeScriptReason(recorder?.preScript?.script) : '';
    const postScriptReason = isPostFlagged ? getUnsafeScriptReason(recorder?.postScript?.script) : '';
    const scriptAttributes = (phase) => ({ recorderIndex: index, phase });

    // A foldable card (closed by default): identity, driver parameters, pacing, and the pre/post
    // script controls.
    return `
    <g4-card card-id="recorder-${index}"
             card-title="${getEscapedText(headerTitle)}"
             item-label="machine ${index + 1}"
             test-id="recorder-${index}">
        ${writeToggle({
        path: `${base}.enabled`,
        label: 'Enabled',
        hint: 'Turn this machine on or off without removing it.'
    })}
        <div class="settings-field-row">
            ${writeText({
        path: labelPath,
        label: 'Friendly Name',
        hint: 'A readable name for this machine (e.g. accounting-pc).'
    })}
            ${writeText({
        path: `${base}.host`,
        label: 'Recorder Host',
        hint: 'The machine running the recorder service.'
    })}
            ${writePort({
        path: `${base}.port`,
        label: 'Recorder Port',
        hint: 'Default 9955.'
    })}
            ${writeField({
        label: 'Mode',
        hint: 'Capture strategy for UIA recorders.',
        control: `
            <g4-select title="${getEscapedText(RECORDER_MODE_TITLE)}"
                       data-path="${base}.mode"
                       choices="${getEscapedText(RECORDER_MODE_CHOICES)}"
                       ${isUiaRecorder ? '' : ' disabled'}
                       label="Recorder Mode"
                       test-id="recorder-${index}-mode-select"
                       value="${getEscapedText(recorder?.mode || 'standard')}"></g4-select>`
    })}
        </div>
        ${writeToggle({
        path: `${base}.useOffset`,
        label: 'Use Offset',
        hint: 'Adds the recorded pointer offset (--OffsetX/--OffsetY) to mouse actions. Applies to User32 capture mode.'
    })}
        <div class="settings-subheader">Driver Parameters</div>
        ${writeDriverParameters(`${base}.driverParameters`, 'recorders', `recorder-${index}`)}
        <div class="settings-subheader">Pacing Between Actions</div>
        ${writeToggle({
        path: `${base}.thinkTimeSettings.enabled`,
        label: 'Pause Like a Human Between Actions',
        hint: 'Off replays as fast as possible.'
    })}
        <div class="settings-field-row">
            ${writeText({
        path: `${base}.thinkTimeSettings.minThinkTime`,
        label: 'Shortest Pause',
        suffix: '(milliseconds)',
        type: 'number',
        hint: 'Pauses shorter than this are bumped up to it.'
    })}
            ${writeText({
        path: `${base}.thinkTimeSettings.maxThinkTime`,
        label: 'Longest Pause',
        suffix: '(milliseconds)',
        type: 'number',
        hint: 'A cap. Set equal to "shortest" for a constant pause.'
    })}
        </div>
        <div class="settings-subheader">Pre-Recording Script</div>
        ${writeToggle({
        path: `${base}.preScript.enabled`,
        label: 'Run a Script Before Recording Starts',
        hint: 'Runs once on this machine before capture begins. It stays in the recorder and never becomes part of the automation.'
    })}
        ${writeSelect({
        path: `${base}.preScript.shell`,
        label: 'Shell',
        choices: RECORDER_SHELL_CHOICES,
        hint: 'Interpreter used to run the pre-recording script.'
    })}
        ${writeTextarea({
        path: `${base}.preScript.script`,
        label: 'Script',
        placeholder: '# runs before recording starts',
        hint: 'Inline script. A non-zero exit (or timeout) aborts this recorder’s start.',
        script: scriptAttributes('preScript')
    })}
        ${writeToggle({
        path: `${base}.preScript.addToAutomationFlow`,
        label: 'Add to Automation Flow',
        hint: 'Adds this script to the recorded automation as an InvokeScript action (the first action). Only executes on replay for drivers that support this shell.',
        script: scriptAttributes('preScript')
    })}
        <div id="err-preScript-${index}" class="settings-error" data-test-id="recorder-${index}-pre-script-error-message">${getEscapedText(preScriptReason)}</div>
        <div class="settings-subheader">Post-Recording Script</div>
        ${writeToggle({
        path: `${base}.postScript.enabled`,
        label: 'Run a Script After Recording Stops',
        hint: 'Runs once on this machine after capture ends. It stays in the recorder and never becomes part of the automation.'
    })}
        ${writeSelect({
        path: `${base}.postScript.shell`,
        label: 'Shell',
        choices: RECORDER_SHELL_CHOICES,
        hint: 'Interpreter used to run the post-recording script.'
    })}
        ${writeTextarea({
        path: `${base}.postScript.script`,
        label: 'Script',
        placeholder: '# runs after recording stops',
        hint: 'Inline script. Failures are reported but do not block teardown.',
        script: scriptAttributes('postScript')
    })}
        ${writeToggle({
        path: `${base}.postScript.addToAutomationFlow`,
        label: 'Add to Automation Flow',
        hint: 'Adds this script to the recorded automation as an InvokeScript action (just before Close Browser). Only executes on replay for drivers that support this shell.',
        script: scriptAttributes('postScript')
    })}
        <div id="err-postScript-${index}" class="settings-error" data-test-id="recorder-${index}-post-script-error-message">${getEscapedText(postScriptReason)}</div>
    </g4-card>`;
}

/**
 * Builds the "Desktop Recorders" section: capture desktop/UI sessions.
 *
 * @returns {string} HTML markup for the section.
 */
function writeRecordersSection() {
    // Resolve the configured recorders.
    const recorders = getPath(globalThis.STATE, 'settings.recorderSettings.recorders') || [];

    // Ensure non-UIA recorders cannot retain a non-standard mode from an older manifest edit.
    setRecorderModes(recorders);

    const cards = recorders.map((recorder, index) => writeRecorderCard(recorder, index)).join('');

    // Build the master toggles, recorder list, and add button.
    const body = `
    ${writeToggle({
        path: 'settings.recorderSettings.enabled',
        label: 'Enable Desktop Recording',
        hint: 'Master switch for all recorders below.'
    })}
    ${writeToggle({
        path: 'settings.recorderSettings.useSandbox',
        label: 'Use Sandbox Recorders',
        hint: 'Start bundled recorder services from the configured sandbox when they are not already running.'
    })}
    <g4-card-list data-list="recorders"
                  add-label="+ Add Machine"
                  empty-style="note"
                  empty-text="No recorders yet. Add one to capture a desktop machine."
                  test-id="recorders">${cards}</g4-card-list>`;

    // Wrap the body in the collapsible section shell.
    return writeSection({
        id: 'recorders',
        title: 'Automation Recorders',
        desc: 'Watch a user click through a desktop app and turn it into a replayable workflow.',
        body
    });
}

/**
 * Builds the "Reports" section: the HTML run report.
 *
 * @returns {string} HTML markup for the section.
 */
function writeReportsSection() {
    // Build the save/auto-open toggles plus the reports folder field.
    const body = `
    ${writeToggle({
        path: 'settings.clientReportSettings.saveReports',
        label: 'Save a Report After Each Run',
        hint: 'Writes an HTML report to disk.'
    })}
    ${writeToggle({
        path: 'settings.clientReportSettings.autoView',
        label: 'Open the Report Automatically',
        hint: 'Turn off for headless/CI runs where nobody is watching.'
    })}
    ${writeText({
        path: 'settings.clientReportSettings.reportsFolder',
        label: 'Reports Folder',
        hint: 'A "reports" subfolder is created here. "." means a reports folder next to where G4 runs.'
    })}`;

    // Wrap the body in the collapsible section shell.
    return writeSection({
        id: 'reports',
        title: 'Reports',
        desc: 'The summary report produced after a run.',
        body
    });
}

/**
 * Builds one editable external plugin repository card.
 *
 * @param {object} repository - The repository entry from state.
 * @param {number} index - The repository's index in the array.
 * @returns {string} HTML markup for the repository card.
 */
function writeRepositoryCard(repository, index) {
    // Resolve the card's state base path and display title.
    const base = `settings.pluginsSettings.externalRepositories.${index}`;
    const title = repository?.name || `Repository ${index + 1}`;
    const testId = `repository-${index}`;

    // A foldable card (closed by default): the scalar fields, then the advanced editors.
    return `
    <g4-card card-id="repository-${index}"
             card-title="${getEscapedText(title)}"
             item-label="repository ${index + 1}"
             test-id="${testId}">
        ${writeText({
        path: `${base}.name`,
        label: 'Name',
        required: true,
        maxLength: 155,
        hint: 'A unique name for this repository (up to 155 characters).',
        testId: `${testId}-name`
    })}
        ${writeText({
        path: `${base}.url`,
        label: 'URL',
        required: true,
        validate: 'url',
        placeholder: 'https://...',
        hint: 'The repository endpoint G4 loads plugins from.',
        testId: `${testId}-url`
    })}
        <div class="settings-field-row">
            ${writeText({
        path: `${base}.version`,
        label: 'Version',
        type: 'number',
        minimum: 1,
        required: true,
        hint: 'Repository API version (whole number).'
    })}
            ${writeText({
        path: `${base}.timeout`,
        label: 'Timeout',
        suffix: '(seconds)',
        type: 'number',
        minimum: 0,
        hint: 'Request timeout. Default 300.'
    })}
        </div>
        ${writeJson({
        path: `${base}.capabilities`,
        label: 'Capabilities',
        hint: 'Advanced. Extra key/value capabilities sent to the repository.',
        rows: 6,
        testId: `${testId}-capabilities`
    })}
        ${writeKeyValue({
        path: `${base}.headers`,
        label: 'Headers',
        hint: 'Optional HTTP headers sent with each request.',
        keyPlaceholder: 'Header',
        valuePlaceholder: 'Value',
        addLabel: 'Add Header',
        emptyText: 'No headers.',
        testId: `${testId}-headers`
    })}
        ${writeCredentials({
        path: `${base}.credentials`,
        label: 'Credentials',
        hint: 'Optional authentication for the repository endpoint.'
    })}
    </g4-card>`;
}

/**
 * Builds the "Response Data" section: optional extras in the response.
 *
 * @returns {string} HTML markup for the section.
 */
function writeResponseDataSection() {
    // Build the environment/exception/performance inclusion toggles.
    const body = `
    ${writeToggle({
        path: 'settings.environmentsSettings.returnEnvironments',
        label: 'Include Environment Values',
        hint: 'The variables/configuration used during the run. May contain secrets.'
    })}
    ${writeToggle({
        path: 'settings.exceptionsSettings.returnExceptions',
        label: 'Include Error Details',
        hint: 'Error type, message, and stack trace - useful for debugging.'
    })}
    ${writeToggle({
        path: 'settings.performancePointsSettings.returnPerformancePoints',
        label: 'Include Performance Timings',
        hint: 'How long named checkpoints took. Low cost; keep on to track performance.'
    })}`;

    // Wrap the body in the collapsible section shell.
    return writeSection({
        id: 'response',
        title: 'Response Data',
        desc: 'Extra information G4 can send back with each run.',
        body
    });
}

/**
 * Builds the "Run Behavior" section: timeouts and response shape.
 *
 * Timeouts are stored in milliseconds; helper text translates common values.
 *
 * @returns {string} HTML markup for the section.
 */
function writeRunBehaviorSection() {
    // Build the timeout/parallelism row plus the response-shape toggles.
    const body = `
    <div class="settings-field-row">
        ${writeText({
        path: 'settings.automationSettings.loadTimeout',
        label: 'Page Load Timeout',
        suffix: '(milliseconds)',
        type: 'number',
        hint: 'How long to wait for a page/screen to finish loading. 60000 = 1 minute.'
    })}
        ${writeText({
        path: 'settings.automationSettings.searchTimeout',
        label: 'Find Element Timeout',
        suffix: '(milliseconds)',
        type: 'number',
        hint: 'How long to look for a button/field before giving up. 15000 = 15 seconds.'
    })}
        ${writeText({
        path: 'settings.automationSettings.maxParallel',
        label: 'Parallel Workflows',
        type: 'number',
        minimum: 1,
        hint: 'How many workflows run at once. Every flow is isolated in its own sandbox, so raising this is safe - and recommended for data-driven runs. 1 = one at a time (minimum).'
    })}
    </div>
    ${writeToggle({
        path: 'settings.automationSettings.returnFlatResponse',
        label: 'Include Simple Results',
        hint: 'A flat, easy-to-read view of the results.'
    })}
    ${writeToggle({
        path: 'settings.automationSettings.returnStructuredResponse',
        label: 'Include Detailed Results',
        hint: 'A rich, nested view with step trees, timings, and errors.'
    })}`;

    // Wrap the body in the collapsible section shell.
    return writeSection({
        id: 'run',
        title: 'Run Behavior',
        desc: 'How workflows wait, run, and report back.',
        body
    });
}

/**
 * Renders the root manifest sandbox field with host-backed browse and auto-detect actions.
 *
 * @returns {string} HTML markup for the sandbox field.
 */
function writeSandboxField() {
    // Resolve the root sandbox field from the working manifest state.
    const value = getPath(globalThis.STATE, 'sandbox') ?? '';

    return writeField({
        label: 'G4 Sandbox',
        hint: 'Local G4 sandbox folder used for bundled browsers and drivers.',
        control: `
        <g4-path-input data-path="sandbox"
                       browse-label="Browse for G4 Sandbox"
                       detect-label="Auto-Detect"
                       detect-title="Auto-Detect Latest G4 Sandbox"
                       label="G4 Sandbox Folder"
                       test-id="g4-sandbox"
                       value="${getEscapedText(value)}"></g4-path-input>`
    });
}

/**
 * Builds the "Screenshots" section.
 *
 * @returns {string} HTML markup for the section.
 */
function writeScreenshotsSection() {
    // Build the capture toggles plus the screenshots output folder field.
    const body = `
    ${writeToggle({
        path: 'settings.screenshotsSettings.returnScreenshots',
        label: 'Capture Screenshots',
        hint: 'Off means no screenshots - the smallest, fastest runs.'
    })}
    ${writeToggle({
        path: 'settings.screenshotsSettings.onExceptionOnly',
        label: 'Only When Something Fails',
        hint: 'Cheap forensic mode: capture a picture only on errors.'
    })}
    ${writeToggle({
        path: 'settings.screenshotsSettings.convertToBase64',
        label: 'Embed Images in the Response',
        hint: 'Makes responses much larger. Off keeps images as separate files.'
    })}
    ${writeText({
        path: 'settings.screenshotsSettings.outputFolder',
        label: 'Screenshots Folder',
        hint: 'Where image files are written when not embedded.'
    })}`;

    // Wrap the body in the collapsible section shell.
    return writeSection({
        id: 'screenshots',
        title: 'Screenshots',
        desc: 'Whether and how G4 captures pictures during a run.',
        body
    });
}

/**
 * Renders the data attributes that tie a control to a recorder script's unsafe-character notice.
 *
 * @remarks
 * Shared by the script box and its "Add to Automation Flow" switch, which both re-check the script.
 *
 * @param {{ recorderIndex: number, phase: string } | undefined} script - The recorder script, if any.
 * @returns {string} The attributes (with a leading space), or '' for a control without a script.
 */
function writeScriptAttributes(script) {
    if (!script) {
        return '';
    }

    return ` data-recorder-index="${script.recorderIndex}" data-phase="${script.phase}"`;
}

/**
 * Renders a masked input with a show/hide button.
 *
 * @param {object} options - Control options.
 * @param {string} options.path - Dotted state path the control binds to.
 * @param {string} options.label - Human-friendly field label.
 * @param {string} [options.hint] - Optional helper text shown under the label.
 * @returns {string} HTML markup for the secret field.
 */
function writeSecret({ path, label, hint }) {
    // The secret box starts masked, from the stored value.
    const value = getPath(globalThis.STATE, path);
    const slug = path.replaceAll(TEST_ID_SEPARATOR_PATTERN, '-');

    return writeField({
        label,
        hint,
        control: `
        <g4-secret-input data-path="${getEscapedText(path)}"
                         test-id="secret-${slug}"
                         value="${getEscapedText(value ?? '')}"></g4-secret-input>`
    });
}

/**
 * Renders a collapsible settings section with its status line.
 *
 * @param {object} options - Section options.
 * @param {string} options.id - Unique id of the section.
 * @param {string} options.title - The section title.
 * @param {string} [options.desc] - An optional one-line description.
 * @param {string} options.body - The inner HTML for the section body.
 * @param {boolean} [options.open=false] - Whether the section starts expanded.
 * @returns {string} HTML markup for the section.
 */
function writeSection({ id, title, desc, body, open = false }) {
    // A re-rendered section shows its last status; only the first section starts open.
    const status = globalThis.SECTION_STATUS[id] ?? { message: '', tone: '' };
    const openAttribute = open ? ' open' : '';

    return `
    <g4-section data-section-id="${id}"
                description="${getEscapedText(desc ?? '')}"
                has-status${openAttribute}
                section-title="${getEscapedText(title)}"
                status="${getEscapedText(status.message)}"
                status-tone="${getEscapedText(status.tone)}"
                test-id="${id}-section">${body}</g4-section>`;
}

/**
 * Renders a dropdown bound to a state path.
 *
 * @param {object} options - Control options.
 * @param {string} options.path - Dotted state path the control binds to.
 * @param {string} options.label - Human-friendly field label.
 * @param {Array<{value:string,text:string}>} options.choices - The available options.
 * @param {string} [options.hint] - Optional helper text shown under the label.
 * @returns {string} HTML markup for the select field.
 */
function writeSelect({ path, label, choices, hint }) {
    // The dropdown starts from the stored value.
    const value = getPath(globalThis.STATE, path);
    const slug = path.replaceAll(TEST_ID_SEPARATOR_PATTERN, '-');

    return writeField({
        label,
        hint,
        control: `
        <g4-select data-path="${getEscapedText(path)}"
                   choices="${getEscapedText(choices)}"
                   test-id="${slug}-select"
                   value="${getEscapedText(value ?? '')}"></g4-select>`
    });
}

/**
 * Renders a single-line text, URL, or number input bound to a state path.
 *
 * Behavior:
 * - Number fields get themed up/down steppers in place of native spinners.
 * - A required field shows only its * while editing: "Required." appears when a save finds it
 *   empty, and typing clears it again.
 * - A URL field ('url' rule) is checked while typing.
 *
 * @param {object} options - Control options.
 * @param {string} options.path - Dotted state path the control binds to.
 * @param {string} options.label - Human-friendly field label.
 * @param {string} [options.hint] - Optional helper text shown under the label.
 * @param {string} [options.type='text'] - 'text' or 'number'.
 * @param {string} [options.suffix] - Optional unit/suffix text after the label.
 * @param {string} [options.placeholder] - Optional placeholder text.
 * @param {number} [options.minimum] - Lower bound for number fields.
 * @param {number} [options.maximum] - Upper bound for number fields.
 * @param {boolean} [options.required] - Whether the field must be non-empty.
 * @param {boolean} [options.isOptional] - Number fields only: an empty box removes the setting
 *     (the consumer's default applies) instead of storing 0.
 * @param {number} [options.maxLength] - Max character length for text fields.
 * @param {string} [options.validate] - Extra validation rule ('url').
 * @param {string} [options.testId] - Test id prefix of the field and its input.
 * @returns {string} HTML markup for the text field.
 */
function writeText(options) {
    const {
        path,
        label,
        hint,
        type = 'text',
        suffix,
        placeholder,
        minimum,
        maximum,
        required,
        isOptional,
        maxLength,
        validate,
        testId
    } = options;
    const value = getPath(globalThis.STATE, path);
    const prefix = testId || path.replaceAll(TEST_ID_SEPARATOR_PATTERN, '-');
    const isMinimumProvided = minimum !== null && minimum !== undefined;
    const isMaximumProvided = maximum !== null && maximum !== undefined;

    // Optional attributes are built first, so the markup stays readable.
    const minimumDataAttribute = isMinimumProvided ? ` data-minimum="${minimum}"` : '';
    const optionalDataAttribute = isOptional ? ' data-optional="true"' : '';
    const minimumAttribute = isMinimumProvided ? ` min="${minimum}"` : '';
    const maximumAttribute = isMaximumProvided ? ` max="${maximum}"` : '';
    const placeholderAttribute = placeholder ? ` placeholder="${getEscapedText(placeholder)}"` : '';
    const maxLengthAttribute = maxLength ? ` max-length="${maxLength}"` : '';
    const inputType = validate === 'url' ? 'url' : 'text';

    // Number fields store numbers (clamped to the lower bound); text fields store text.
    const control = type === 'number'
        ? `
        <g4-number-input data-kind="number"${minimumDataAttribute}${optionalDataAttribute}
                         data-path="${getEscapedText(path)}"${maximumAttribute}${minimumAttribute}
                         test-id="${getEscapedText(prefix)}-number-input"
                         value="${getEscapedText(value ?? '')}"></g4-number-input>`
        : `
        <g4-text-input type="${inputType}"
                       data-path="${getEscapedText(path)}"${maxLengthAttribute}${placeholderAttribute}
                       test-id="${getEscapedText(prefix)}-text-input"
                       value="${getEscapedText(value ?? '')}"></g4-text-input>`;

    return writeField({ label, hint, suffix, required, testId: `${prefix}-field`, control });
}

/**
 * Renders a multiline plain text box bound to a state path (scripts), numbered and with an
 * Expand button.
 *
 * @param {object} options - Control options.
 * @param {string} options.path - Dotted state path the control binds to.
 * @param {string} options.label - Human-friendly field label.
 * @param {string} [options.hint] - Optional helper text shown under the label.
 * @param {string} [options.placeholder] - Optional placeholder text.
 * @param {number} [options.rows=4] - Visible row count for the text area.
 * @param {{ recorderIndex: number, phase: string }} [options.script] - Recorder script whose
 *     unsafe-character notice follows the text.
 * @returns {string} HTML markup for the text area field.
 */
function writeTextarea({ path, label, hint, placeholder, rows = 4, script }) {
    // The box starts from the stored text; a recorder script also re-checks its notice.
    const value = getPath(globalThis.STATE, path);
    const slug = path.replaceAll(TEST_ID_SEPARATOR_PATTERN, '-');
    const scriptAttributes = writeScriptAttributes(script);
    const placeholderAttribute = placeholder ? ` placeholder="${getEscapedText(placeholder)}"` : '';

    return writeField({
        label,
        hint,
        control: `
        <g4-code-textarea data-path="${getEscapedText(path)}"${scriptAttributes}${placeholderAttribute}
                          rows="${rows}"
                          test-id="${slug}-code-textarea">${getEscapedText(value ?? '')}</g4-code-textarea>`
    });
}

/**
 * Renders an on/off toggle switch bound to a boolean state path.
 *
 * @param {object} options - Control options.
 * @param {string} options.path - Dotted state path the control binds to.
 * @param {string} options.label - Human-friendly field label.
 * @param {string} [options.hint] - Optional helper text shown beside the toggle.
 * @param {{ recorderIndex: number, phase: string }} [options.script] - Recorder script whose
 *     unsafe-character notice follows the switch.
 * @returns {string} HTML markup for the toggle.
 */
function writeToggle({ path, label, hint, script }) {
    // The switch starts from the stored value; a script switch also re-checks its notice.
    const value = !!getPath(globalThis.STATE, path);
    const slug = path.replaceAll(TEST_ID_SEPARATOR_PATTERN, '-');
    const scriptAttributes = writeScriptAttributes(script);
    const checkedAttribute = value ? ' checked' : '';

    return `
    <g4-toggle data-kind="bool"
               data-path="${getEscapedText(path)}"${scriptAttributes}${checkedAttribute}
               hint="${getEscapedText(hint ?? '')}"
               label="${getEscapedText(label)}"
               test-id="${slug}-toggle"></g4-toggle>`;
}
// Listen for host responses to sandbox browse/auto-detect requests. This runs inside a sandboxed
// VS Code webview where only the extension host can post messages, so any message origin is accepted
// intentionally and the cross-origin verification finding is suppressed here on purpose.
window.addEventListener('message', onHostMessage); // NOSONAR - sandboxed webview; any origin accepted by design

// Initial render.
startSettings();
