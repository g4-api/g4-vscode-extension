// Collapse/expand chevron used by every settings section header.
const SVG_CHEVRON = `
<svg class="chev-r" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" width="13" height="13">
    <path fill="currentColor" d="M441.3 299.8C451.5 312.4 450.8 330.9 439.1 342.6L311.1 470.6C301.9 479.8 288.2 482.5 276.2 477.5C264.2 472.5 256.5 460.9 256.5 448L256.5 192C256.5 179.1 264.3 167.4 276.3 162.4C288.3 157.4 302 160.2 311.2 169.3L439.2 297.3L441.4 299.7z"/>
</svg>
<svg class="chev-d" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" width="13" height="13">
    <path fill="currentColor" d="M300.3 440.8C312.9 451 331.4 450.3 343.1 438.6L471.1 310.6C480.3 301.4 483 287.7 478 275.7C473 263.7 461.4 256 448.5 256L192.5 256C179.6 256 167.9 263.8 162.9 275.8C157.9 287.8 160.7 301.5 169.9 310.6L297.9 438.6L300.3 440.8z"/>
</svg>`;

// Carets used by the themed number-input steppers.
const SVG_CARET_UP = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><path fill="currentColor" d="M300.3 199.2C312.9 188.9 331.4 189.7 343.1 201.4L471.1 329.4C480.3 338.6 483 352.3 478 364.3C473 376.3 461.4 384 448.5 384L192.5 384C179.6 384 167.9 376.2 162.9 364.2C157.9 352.2 160.7 338.5 169.9 329.4L297.9 201.4L300.3 199.2z"/></svg>`;

const SVG_CARET_DOWN = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><path fill="currentColor" d="M300.3 440.8C312.9 451 331.4 450.3 343.1 438.6L471.1 310.6C480.3 301.4 483 287.7 478 275.7C473 263.7 461.4 256 448.5 256L192.5 256C179.6 256 167.9 263.8 162.9 275.8C157.9 287.8 160.7 301.5 169.9 310.6L297.9 438.6L300.3 440.8z"/></svg>`;

// Refresh icon used by the "reload driver list" button.
const SVG_REFRESH = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><path fill="currentColor" d="M129.9 292.5C143.2 199.5 223.3 128 320 128C373 128 421 149.5 455.8 184.2C456 184.4 456.2 184.6 456.4 184.8L464 192L416.1 192C398.4 192 384.1 206.3 384.1 224C384.1 241.7 398.4 256 416.1 256L544.1 256C561.8 256 576.1 241.7 576.1 224L576.1 96C576.1 78.3 561.8 64 544.1 64C526.4 64 512.1 78.3 512.1 96L512.1 149.4L500.8 138.7C454.5 92.6 390.5 64 320 64C191 64 84.3 159.4 66.6 283.5C64.1 301 76.2 317.2 93.7 319.7C111.2 322.2 127.4 310 129.9 292.6zM573.4 356.5C575.9 339 563.7 322.8 546.3 320.3C528.9 317.8 512.6 330 510.1 347.4C496.8 440.4 416.7 511.9 320 511.9C267 511.9 219 490.4 184.2 455.7C184 455.5 183.8 455.3 183.6 455.1L176 447.9L223.9 447.9C241.6 447.9 255.9 433.6 255.9 415.9C255.9 398.2 241.6 383.9 223.9 383.9L96 384C87.5 384 79.3 387.4 73.3 393.5C67.3 399.6 63.9 407.7 64 416.3L65 543.3C65.1 561 79.6 575.2 97.3 575C115 574.8 129.2 560.4 129 542.7L128.6 491.2L139.3 501.3C185.6 547.4 249.5 576 320 576C449 576 555.7 480.6 573.4 356.5z"/></svg>`;

// Icon buttons and modal controls. Embedded in this component on purpose (not shared assets);
// currentColor lets every icon follow the theme like the other settings icons.
const SVG_ARROW_DOWN = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" aria-hidden="true"><path fill="currentColor" d="M297.4 598.6C309.9 611.1 330.2 611.1 342.7 598.6L470.7 470.6C479.9 461.4 482.6 447.7 477.6 435.7C472.6 423.7 460.9 416 448 416L384 416L384 80C384 53.5 362.5 32 336 32L304 32C277.5 32 256 53.5 256 80L256 416L192 416C179.1 416 167.4 423.8 162.4 435.8C157.4 447.8 160.2 461.5 169.4 470.6L297.4 598.6z"/></svg>`;

const SVG_ARROW_UP = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" aria-hidden="true"><path fill="currentColor" d="M297.4 41.4C309.9 28.9 330.2 28.9 342.7 41.4L470.7 169.4C479.9 178.6 482.6 192.3 477.6 204.3C472.6 216.3 460.9 224 448 224L384 224L384 560C384 586.5 362.5 608 336 608L304 608C277.5 608 256 586.5 256 560L256 224L192 224C179.1 224 167.4 216.2 162.4 204.2C157.4 192.2 160.2 178.5 169.4 169.4L297.4 41.4z"/></svg>`;

const SVG_CLOSE = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" aria-hidden="true"><path fill="currentColor" d="M320 576C461.4 576 576 461.4 576 320C576 178.6 461.4 64 320 64C178.6 64 64 178.6 64 320C64 461.4 178.6 576 320 576zM231 231C240.4 221.6 255.6 221.6 264.9 231L319.9 286L374.9 231C384.3 221.6 399.5 221.6 408.8 231C418.1 240.4 418.2 255.6 408.8 264.9L353.8 319.9L408.8 374.9C418.2 384.3 418.2 399.5 408.8 408.8C399.4 418.1 384.2 418.2 374.9 408.8L319.9 353.8L264.9 408.8C255.5 418.2 240.3 418.2 231 408.8C221.7 399.4 221.6 384.2 231 374.9L286 319.9L231 264.9C221.6 255.5 221.6 240.3 231 231z"/></svg>`;

const SVG_EXPAND = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" aria-hidden="true"><path fill="currentColor" d="M128 96C110.3 96 96 110.3 96 128L96 224C96 241.7 110.3 256 128 256C145.7 256 160 241.7 160 224L160 160L224 160C241.7 160 256 145.7 256 128C256 110.3 241.7 96 224 96L128 96zM160 416C160 398.3 145.7 384 128 384C110.3 384 96 398.3 96 416L96 512C96 529.7 110.3 544 128 544L224 544C241.7 544 256 529.7 256 512C256 494.3 241.7 480 224 480L160 480L160 416zM416 96C398.3 96 384 110.3 384 128C384 145.7 398.3 160 416 160L480 160L480 224C480 241.7 494.3 256 512 256C529.7 256 544 241.7 544 224L544 128C544 110.3 529.7 96 512 96L416 96zM544 416C544 398.3 529.7 384 512 384C494.3 384 480 398.3 480 416L480 480L416 480C398.3 480 384 494.3 384 512C384 529.7 398.3 544 416 544L512 544C529.7 544 544 529.7 544 512L544 416z"/></svg>`;

const SVG_EYE = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" aria-hidden="true"><path fill="currentColor" d="M320 96C239.2 96 174.5 132.8 127.4 176.6C80.6 220.1 49.3 272 34.4 307.7C31.1 315.6 31.1 324.4 34.4 332.3C49.3 368 80.6 420 127.4 463.4C174.5 507.1 239.2 544 320 544C400.8 544 465.5 507.2 512.6 463.4C559.4 419.9 590.7 368 605.6 332.3C608.9 324.4 608.9 315.6 605.6 307.7C590.7 272 559.4 220 512.6 176.6C465.5 132.9 400.8 96 320 96zM176 320C176 240.5 240.5 176 320 176C399.5 176 464 240.5 464 320C464 399.5 399.5 464 320 464C240.5 464 176 399.5 176 320zM320 256C320 291.3 291.3 320 256 320C244.5 320 233.7 317 224.3 311.6C223.3 322.5 224.2 333.7 227.2 344.8C240.9 396 293.6 426.4 344.8 412.7C396 399 426.4 346.3 412.7 295.1C400.5 249.4 357.2 220.3 311.6 224.3C316.9 233.6 320 244.4 320 256z"/></svg>`;

const SVG_EYE_SLASH = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" aria-hidden="true"><path fill="currentColor" d="M73 39.1C63.6 29.7 48.4 29.7 39.1 39.1C29.8 48.5 29.7 63.7 39 73.1L567 601.1C576.4 610.5 591.6 610.5 600.9 601.1C610.2 591.7 610.3 576.5 600.9 567.2L504.5 470.8C507.2 468.4 509.9 466 512.5 463.6C559.3 420.1 590.6 368.2 605.5 332.5C608.8 324.6 608.8 315.8 605.5 307.9C590.6 272.2 559.3 220.2 512.5 176.8C465.4 133.1 400.7 96.2 319.9 96.2C263.1 96.2 214.3 114.4 173.9 140.4L73 39.1zM236.5 202.7C260 185.9 288.9 176 320 176C399.5 176 464 240.5 464 320C464 351.1 454.1 379.9 437.3 403.5L402.6 368.8C415.3 347.4 419.6 321.1 412.7 295.1C399 243.9 346.3 213.5 295.1 227.2C286.5 229.5 278.4 232.9 271.1 237.2L236.4 202.5zM357.3 459.1C345.4 462.3 332.9 464 320 464C240.5 464 176 399.5 176 320C176 307.1 177.7 294.6 180.9 282.7L101.4 203.2C68.8 240 46.4 279 34.5 307.7C31.2 315.6 31.2 324.4 34.5 332.3C49.4 368 80.7 420 127.5 463.4C174.6 507.1 239.3 544 320.1 544C357.4 544 391.3 536.1 421.6 523.4L357.4 459.2z"/></svg>`;

const SVG_FORMAT = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" aria-hidden="true"><path fill="currentColor" d="M392.8 65.2C375.8 60.3 358.1 70.2 353.2 87.2L225.2 535.2C220.3 552.2 230.2 569.9 247.2 574.8C264.2 579.7 281.9 569.8 286.8 552.8L414.8 104.8C419.7 87.8 409.8 70.1 392.8 65.2zM457.4 201.3C444.9 213.8 444.9 234.1 457.4 246.6L530.8 320L457.4 393.4C444.9 405.9 444.9 426.2 457.4 438.7C469.9 451.2 490.2 451.2 502.7 438.7L598.7 342.7C611.2 330.2 611.2 309.9 598.7 297.4L502.7 201.4C490.2 188.9 469.9 188.9 457.4 201.4zM182.7 201.3C170.2 188.8 149.9 188.8 137.4 201.3L41.4 297.3C28.9 309.8 28.9 330.1 41.4 342.6L137.4 438.6C149.9 451.1 170.2 451.1 182.7 438.6C195.2 426.1 195.2 405.8 182.7 393.3L109.3 320L182.6 246.6C195.1 234.1 195.1 213.8 182.6 201.3z"/></svg>`;

const SVG_SEARCH = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" aria-hidden="true"><path fill="currentColor" d="M480 272C480 317.9 465.1 360.3 440 394.7L566.6 521.4C579.1 533.9 579.1 554.2 566.6 566.7C554.1 579.2 533.8 579.2 521.3 566.7L394.7 440C360.3 465.1 317.9 480 272 480C157.1 480 64 386.9 64 272C64 157.1 157.1 64 272 64C386.9 64 480 157.1 480 272zM272 416C351.5 416 416 351.5 416 272C416 192.5 351.5 128 272 128C192.5 128 128 192.5 128 272C128 351.5 192.5 416 272 416z"/></svg>`;

const SVG_TRASH = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" aria-hidden="true"><path fill="currentColor" d="M232.7 69.9C237.1 56.8 249.3 48 263.1 48L377 48C390.8 48 403 56.8 407.4 69.9L416 96L512 96C529.7 96 544 110.3 544 128C544 145.7 529.7 160 512 160L128 160C110.3 160 96 145.7 96 128C96 110.3 110.3 96 128 96L224 96L232.7 69.9zM128 208L512 208L512 512C512 547.3 483.3 576 448 576L192 576C156.7 576 128 547.3 128 512L128 208zM216 272C202.7 272 192 282.7 192 296L192 488C192 501.3 202.7 512 216 512C229.3 512 240 501.3 240 488L240 296C240 282.7 229.3 272 216 272zM320 272C306.7 272 296 282.7 296 296L296 488C296 501.3 306.7 512 320 512C333.3 512 344 501.3 344 488L344 296C344 282.7 333.3 272 320 272zM424 272C410.7 272 400 282.7 400 296L400 488C400 501.3 410.7 512 424 512C437.3 512 448 501.3 448 488L448 296C448 282.7 437.3 272 424 272z"/></svg>`;

// Line breaks in text box content (Windows or Unix). Linear: optional character plus one literal.
const LINE_BREAK_PATTERN = /\r?\n/;

// Shared bottom status line metadata for every settings section.
globalThis.SECTION_STATUS = {
    connection: {
        elementId: 'connection-section-status',
        testId: 'connection-section-status-message',
        message: '',
        statusClassName: ''
    },
    license: {
        elementId: 'license-section-status',
        testId: 'license-section-status-message',
        message: '',
        statusClassName: ''
    },
    driver: {
        elementId: 'driver-section-status',
        testId: 'driver-section-status-message',
        message: '',
        statusClassName: ''
    },
    run: {
        elementId: 'run-section-status',
        testId: 'run-section-status-message',
        message: '',
        statusClassName: ''
    },
    logging: {
        elementId: 'logging-section-status',
        testId: 'logging-section-status-message',
        message: '',
        statusClassName: ''
    },
    reports: {
        elementId: 'reports-section-status',
        testId: 'reports-section-status-message',
        message: '',
        statusClassName: ''
    },
    response: {
        elementId: 'response-section-status',
        testId: 'response-section-status-message',
        message: '',
        statusClassName: ''
    },
    screenshots: {
        elementId: 'screenshots-section-status',
        testId: 'screenshots-section-status-message',
        message: '',
        statusClassName: ''
    },
    plugins: {
        elementId: 'plugins-section-status',
        testId: 'plugins-section-status-message',
        message: '',
        statusClassName: ''
    },
    mcp: {
        elementId: 'mcp-section-status',
        testId: 'mcp-section-status-message',
        message: '',
        statusClassName: ''
    },
    recorders: {
        elementId: 'recorders-section-status',
        testId: 'recorders-section-status-message',
        message: '',
        statusClassName: ''
    }
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

// Marker used to wrap a single path segment that legitimately contains
// dots or colons (for example the WebDriver key "uia:options").
const KEY_OPEN = '{{';
const KEY_CLOSE = '}}';

// Recorder capture modes supported by EventCaptureService.
const RECORDER_MODE_CHOICES = [
    { value: 'standard', text: 'Standard' },
    { value: 'user32', text: 'User32' },
    { value: 'coordinate', text: 'Coordinate' }
];

// Interpreters offered for a recorder's pre/post scripts. Values must match the shells the
// extension's recorder script runner supports.
const RECORDER_SHELL_CHOICES = [
    { value: 'powershell', text: 'PowerShell (Windows)' },
    { value: 'pwsh', text: 'PowerShell 7 (pwsh)' },
    { value: 'bash', text: 'Bash' },
    { value: 'cmd', text: 'Command Prompt (cmd)' }
];

// Tooltip shown on the per-recorder mode dropdown.
const RECORDER_MODE_TITLE = 'This value only applies to UIA recorders and is ignored by other recorders.';

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
 * Adds an empty entry to the string-to-string map at `path`, with a unique
 * placeholder key.
 *
 * Behavior:
 * - Finds a unique placeholder key so a new entry doesn't collide.
 * - Stores the entry, re-renders the owning section, and reveals the new row.
 *
 * @param {string} path - Dotted state path to the map object.
 */
function addEntry(path) {
    // Resolve the current map.
    const map = getPath(globalThis.STATE, path) || {};

    // Find a unique placeholder key so the new entry doesn't collide.
    let n = Object.keys(map).length + 1;
    let key = 'key-' + n;
    while (key in map) {
        key = 'key-' + (++n);
    }

    // Add the empty entry, store it, re-render, and reveal the new row.
    map[key] = '';
    setPath(globalThis.STATE, path, map);
    updateSection(resolveSectionId(path));
    showItem(document.getElementById('kv-' + path.replace(/[^a-z0-9]/gi, '-'))?.lastElementChild);
}

/**
 * Adds an empty entry to the list at `path` (one text box per entry) and focuses it.
 *
 * @param {string} path - Dotted state path to the string[] list.
 */
function addListEntry(path) {
    // Resolve the current list, append an empty entry, and store it.
    const existing = getPath(globalThis.STATE, path);
    const list = Array.isArray(existing) ? existing : [];

    list.push('');
    setPath(globalThis.STATE, path, list);

    // Re-render the owning section and focus the new row.
    updateSection(resolveSectionId(path));
    showItem(document.getElementById('list-' + path.replace(/[^a-z0-9]/gi, '-'))?.lastElementChild);
}

/**
 * Adds a new desktop recorder seeded from the shipped recorder template.
 *
 * Behavior:
 * - Clones the first shipped recorder as a template.
 * - Gives the new machine a unique friendly name and leaves it disabled.
 * - Re-renders the recorders section and reveals the new card.
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
    setCardOpen(`rec-body-${recorders.length - 1}`, true);
    showItem(document.querySelector('#sec-recorders .card-list')?.lastElementChild);
}

/**
 * Adds a new external plugin repository seeded with sensible defaults.
 *
 * Behavior:
 * - Appends a repository with default version/timeout and empty maps.
 * - Re-renders the plugins section and reveals the new card.
 */
function addRepository() {
    // Resolve the current repositories as an array.
    const existing = getPath(globalThis.STATE, 'settings.pluginsSettings.externalRepositories');
    const repositories = Array.isArray(existing) ? existing : [];

    // Append a default repository, store it, re-render, and reveal the new card.
    repositories.push({ name: '', url: '', version: 1, timeout: 300, capabilities: {}, headers: {} });
    setPath(globalThis.STATE, 'settings.pluginsSettings.externalRepositories', repositories);
    updateSection('plugins');
    setCardOpen(`repo-body-${repositories.length - 1}`, true);
    showItem(document.querySelector('#sec-plugins .card-list')?.lastElementChild);
}

/**
 * Adds a new, empty MCP server entry with a unique placeholder name.
 *
 * Behavior:
 * - Finds a unique default name so two new servers don't collide.
 * - Seeds the entry as a local (stdio) server with an empty command/args.
 * - Re-renders the MCP section and reveals the new card.
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
    setCardOpen(`mcp-body-${Object.keys(servers).length - 1}`, true);
    showItem(document.querySelector('#sec-mcp .card-list')?.lastElementChild);
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
 * - Disables the button and shows progress while fetching.
 * - Reads the token out of the fetched README and writes it to state + input.
 * - On any failure, leaves the field untouched and points at the manual link.
 */
async function getDevelopmentLicense() {
    // Resolve the button that owns the in-flight fetch state.
    const button = document.getElementById('fetch-token-btn');

    // Disable the button and show progress while the request is in flight.
    if (button) {
        button.disabled = true;
    }
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
        const input = document.getElementById('secret-authentication-token');
        if (input) {
            input.value = token;
        }

        // Tell the user the token was added and how to apply it.
        setSectionStatus('license', 'Free token added. Click Save to apply it.', 'status-ok');
    } catch (error) {
        // Report a friendly failure message and log the detail.
        console.warn('Could not fetch development license:', error);
        setSectionStatus('license', 'Could not reach GitHub. Grab the token manually from the link below, then paste it here.', 'status-err');
    } finally {
        // Always restore the button regardless of the outcome.
        if (button) {
            button.disabled = false;
        }
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
 * - Converts all other values into strings.
 * - Escapes HTML-sensitive characters:
 *   - & becomes &amp;
 *   - < becomes &lt;
 *   - > becomes &gt;
 *   - " becomes &quot;
 *
 * @param {*} value - The value to escape.
 * @returns {string} The escaped HTML-safe string.
 */
function getEscapedText(value) {
    // Convert null/undefined to an empty string, then normalize to string.
    return String(value ?? '')

        // Escape ampersand first so we do not double-break generated entities.
        .replaceAll('&', '&amp;')

        // Escape opening angle brackets to prevent HTML tag injection.
        .replaceAll('<', '&lt;')

        // Escape closing angle brackets for safe HTML rendering.
        .replaceAll('>', '&gt;')

        // Escape double quotes so the value is safe in double-quoted attributes.
        .replaceAll('"', '&quot;');
}

/**
 * Computes a validation message for a text field, or '' when it's valid.
 *
 * Behavior:
 * - Treats a required field with empty text as invalid.
 * - Treats a non-empty value failing the 'url' rule as invalid.
 * - Returns an empty string when the value is acceptable.
 *
 * @param {*} value - The field value.
 * @param {boolean} [isRequired] - Whether the field must be non-empty.
 * @param {string} [rule] - Extra rule: 'url' for a basic URL check.
 * @returns {string} The warning to show, or '' when the value is fine.
 */
function getFieldError(value, isRequired, rule) {
    // Normalize the value to trimmed text for the checks below.
    const text = String(value ?? '').trim();

    // Required fields must not be empty.
    if (isRequired && !text) {
        return 'Required.';
    }

    // The 'url' rule requires an http(s) URL when a value is present.
    if (text && rule === 'url' && !/^https?:\/\/.+/i.test(text)) {
        return 'Enter a valid URL (http:// or https://).';
    }

    // No problems found.
    return '';
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
 * Resolves status metadata for a section id.
 *
 * @remarks
 * The registry is shared by the renderer and runtime status updates so
 * every section uses one predictable bottom status line.
 *
 * @param {string} sectionId - The section id to resolve.
 * @returns {{elementId:string,testId:string}|null} The status metadata, or null when unknown.
 */
function getSectionStatus(sectionId) {
    // Read through the shared registry so future sections only need one entry.
    const sectionStatus = globalThis.SECTION_STATUS?.[sectionId];

    if (!sectionStatus) {
        return null;
    }

    return sectionStatus;
}

/**
 * Moves one entry of the list at `path` up or down, when the target position exists.
 *
 * @param {string} path - Dotted state path to the list.
 * @param {number} index - The entry index to move.
 * @param {number} offset - -1 to move up, 1 to move down.
 */
function moveListEntry(path, index, offset) {
    const list = getPath(globalThis.STATE, path);
    const target = index + offset;
    const isInRange = Array.isArray(list) && target >= 0 && target < list.length;

    if (!isInRange) {
        return;
    }

    // Swap the two entries, then re-render the owning section.
    [list[index], list[target]] = [list[target], list[index]];
    updateSection(resolveSectionId(path));
}

/**
 * Moves a foldable card up or down, so each card keeps its own open/closed state.
 *
 * @param {object} options - Move options.
 * @param {string} options.bodyPrefix - Card body id prefix (e.g. 'rec-body-'); ids end with the position.
 * @param {number} options.count - Number of cards.
 * @param {number} options.index - The card position to move.
 * @param {number} options.offset - -1 to move up, 1 to move down.
 * @param {function(number, number): void} options.swap - Swaps the two items in state.
 * @param {string} options.sectionId - The section to re-render.
 */
function moveCard({ bodyPrefix, count, index, offset, swap, sectionId }) {
    const target = index + offset;

    if (target < 0 || target >= count) {
        return;
    }

    // Read both cards' open states, swap the items, re-render, then give each state to its card.
    const isIndexOpen = !document.getElementById(bodyPrefix + index)?.classList.contains('is-collapsed');
    const isTargetOpen = !document.getElementById(bodyPrefix + target)?.classList.contains('is-collapsed');

    swap(index, target);
    updateSection(sectionId);
    setCardOpen(bodyPrefix + target, isIndexOpen);
    setCardOpen(bodyPrefix + index, isTargetOpen);
}

/**
 * Moves a desktop recorder card up or down, keeping each card's open/closed state.
 *
 * @param {number} index - The recorder index to move.
 * @param {number} offset - -1 to move up, 1 to move down.
 */
function moveRecorder(index, offset) {
    const recorders = globalThis.STATE.settings.recorderSettings.recorders;

    moveCard({
        bodyPrefix: 'rec-body-',
        count: recorders.length,
        index,
        offset,
        sectionId: 'recorders',
        swap: (first, second) => {
            [recorders[first], recorders[second]] = [recorders[second], recorders[first]];
        }
    });
}

/**
 * Moves an external plugin repository card up or down, keeping each card's open/closed state.
 *
 * @param {number} index - The repository index to move.
 * @param {number} offset - -1 to move up, 1 to move down.
 */
function moveRepository(index, offset) {
    const repositories = getPath(globalThis.STATE, 'settings.pluginsSettings.externalRepositories');

    if (!Array.isArray(repositories)) {
        return;
    }

    moveCard({
        bodyPrefix: 'repo-body-',
        count: repositories.length,
        index,
        offset,
        sectionId: 'plugins',
        swap: (first, second) => {
            [repositories[first], repositories[second]] = [repositories[second], repositories[first]];
        }
    });
}

/**
 * Moves an MCP server card up or down by rebuilding the servers map in the new key order.
 *
 * @param {string} name - The server key to move.
 * @param {number} offset - -1 to move up, 1 to move down.
 */
function moveServer(name, offset) {
    const servers = getPath(globalThis.STATE, 'settings.pluginsSettings.servers') || {};
    const names = Object.keys(servers);
    const index = names.indexOf(name);

    if (index === -1) {
        return;
    }

    // Swap the two names and rebuild the map in that order.
    moveCard({
        bodyPrefix: 'mcp-body-',
        count: names.length,
        index,
        offset,
        sectionId: 'mcp',
        swap: (first, second) => {
            [names[first], names[second]] = [names[second], names[first]];
            setPath(globalThis.STATE, 'settings.pluginsSettings.servers', Object.fromEntries(names.map((key) => [key, servers[key]])));
        }
    });
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
 * Closes the expanded editor on Escape.
 *
 * @param {KeyboardEvent} event - Key event.
 */
function onDocumentKeyDown(event) {
    if (event.key === 'Escape' && document.getElementById('expand-layer')) {
        event.preventDefault();
        hideExpandEditor();
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

    // Only sandbox path messages are handled by this page-level listener.
    const message = event.data;

    if (message?.command !== 'setSandboxPath' || !message.sandboxPath) {
        return;
    }

    setSandboxPath(message.sandboxPath);
}

/**
 * Keeps a text box's line numbers aligned while it scrolls. Registered as a capturing listener,
 * because scroll events do not bubble.
 *
 * @param {Event} event - Scroll event.
 */
function onTextBoxScroll(event) {
    const target = event.target;
    const gutter = target?.dataset?.lineNumbers === undefined
        ? null
        : document.getElementById(`${target.id}-line-numbers`);

    if (gutter) {
        gutter.scrollTop = target.scrollTop;
    }
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
 * Removes an entry by key from the map at `path`.
 *
 * @param {string} path - Dotted state path to the map object.
 * @param {string} key - The entry key to remove.
 */
function removeEntry(path, key) {
    // Delete the entry when the map exists, then re-render the owning section.
    const map = getPath(globalThis.STATE, path);
    if (map && typeof map === 'object') {
        delete map[key];
    }
    updateSection(resolveSectionId(path));
}

/**
 * Removes one entry from the list at `path`.
 *
 * @param {string} path - Dotted state path to the string[] list.
 * @param {number} index - The entry index to remove.
 */
function removeListEntry(path, index) {
    // Drop the entry when the list exists, then re-render the owning section.
    const list = getPath(globalThis.STATE, path);

    if (Array.isArray(list)) {
        list.splice(index, 1);
    }

    updateSection(resolveSectionId(path));
}

/**
 * Removes a desktop recorder by index.
 *
 * @param {number} index - The recorder index to remove.
 */
function removeRecorder(index) {
    // Drop the recorder at the index and re-render the section; the other cards keep their states.
    const recorders = globalThis.STATE.settings.recorderSettings.recorders;

    removeCard({ bodyPrefix: 'rec-body-', count: recorders.length, index, sectionId: 'recorders', remove: () => recorders.splice(index, 1) });
}

/**
 * Removes a foldable card and re-renders its section, so every remaining card keeps its own
 * open/closed state (a re-render reopens cards by position, which would shift after a removal).
 *
 * @param {object} options - Remove options.
 * @param {string} options.bodyPrefix - Card body id prefix (e.g. 'rec-body-'); ids end with the position.
 * @param {number} options.count - Number of cards before the removal.
 * @param {number} options.index - The card position to remove.
 * @param {function(): void} options.remove - Removes the item from state.
 * @param {string} options.sectionId - The section to re-render.
 */
function removeCard({ bodyPrefix, count, index, remove, sectionId }) {
    const openStates = Array.from({ length: count }, (_, position) => !document.getElementById(bodyPrefix + position)?.classList.contains('is-collapsed'));

    openStates.splice(index, 1);
    remove();
    updateSection(sectionId);
    openStates.forEach((isOpen, position) => setCardOpen(bodyPrefix + position, isOpen));
}

/**
 * Removes an external plugin repository by index.
 *
 * @param {number} index - The repository index to remove.
 */
function removeRepository(index) {
    // Drop the repository at the index when the list exists, then re-render.
    const repositories = getPath(globalThis.STATE, 'settings.pluginsSettings.externalRepositories');

    if (!Array.isArray(repositories)) {
        updateSection('plugins');
        return;
    }

    removeCard({ bodyPrefix: 'repo-body-', count: repositories.length, index, sectionId: 'plugins', remove: () => repositories.splice(index, 1) });
}

/**
 * Removes an MCP server by name.
 *
 * @param {string} name - The server key to remove.
 */
function removeServer(name) {
    // Delete the server entry when present and re-render the section.
    const servers = getPath(globalThis.STATE, 'settings.pluginsSettings.servers');
    const names = Object.keys(servers || {});
    const index = names.indexOf(name);

    if (index === -1) {
        updateSection('mcp');
        return;
    }

    removeCard({ bodyPrefix: 'mcp-body-', count: names.length, index, sectionId: 'mcp', remove: () => delete servers[name] });
}

/**
 * Renames an entry key in the map at `path`, preserving order. Ignores
 * empty, unchanged, or colliding names.
 *
 * @param {string} path - Dotted state path to the map object.
 * @param {string} oldKey - The current entry key.
 * @param {string} newKeyRaw - The requested new key.
 */
function renameEntryKey(path, oldKey, newKeyRaw) {
    // Normalize the requested key and resolve the current map.
    const newKey = String(newKeyRaw || '').trim();
    const map = getPath(globalThis.STATE, path) || {};

    // Ignore empty, unchanged, or colliding renames.
    if (!newKey || newKey === oldKey || (newKey in map)) {
        updateSection(resolveSectionId(path));
        return;
    }

    // Rebuild the map so the renamed key keeps its original order.
    const next = {};
    for (const [key, value] of Object.entries(map)) {
        next[key === oldKey ? newKey : key] = value;
    }
    setPath(globalThis.STATE, path, next);
    updateSection(resolveSectionId(path));
}

/**
 * Renames an MCP server while preserving its position and definition.
 *
 * Behavior:
 * - Ignores no-op or empty renames, and refuses to overwrite an existing key.
 * - Rebuilds the object so the renamed key keeps its original order.
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
 * Resets all settings back to the shipped defaults and re-renders.
 */
function resetDefaults() {
    // Restore the baseline working copy and re-render the whole form.
    globalThis.STATE = copyValue(globalThis.DEFAULTS);
    showSettings();
}

/**
 * Resolves which section owns a given state path, for path-based edits
 * (headers, credentials) that need to know what to re-render.
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

    // Log settings (including the Sources list) belong to the logging section.
    if (path.startsWith('settings.clientLogConfiguration')) {
        return 'logging';
    }

    // Unknown owner.
    return null;
}

/**
 * Closes the expanded editor and returns focus to the text box it edits.
 */
function hideExpandEditor() {
    const layer = document.getElementById('expand-layer');

    if (!layer) {
        return;
    }

    const source = document.getElementById(layer.dataset.targetId);

    layer.remove();
    source?.focus();
}

/**
 * Serializes the current settings and sends them to the extension host.
 *
 * Behavior:
 * - Builds a clean manifest from the current state.
 * - Posts the manifest to the host, or logs a note when run outside it.
 * - Briefly shows a "Settings sent" note regardless of host wiring.
 */
function save() {
    // Check everything first, so every problem is shown at once: empty required fields get
    // "Required." (their section and card open), and repeated log sources are marked.
    const isRequiredMissing = showRequiredErrors();
    const sourcesPath = 'settings.clientLogConfiguration.sourceOptions.sources';
    const isSourceRepeated = showListErrors(sourcesPath);

    // Repeated log sources: open the Logging section and say why.
    if (isSourceRepeated) {
        const body = document.getElementById('sec-logging');

        if (body?.classList.contains('is-collapsed')) {
            updateSectionCollapse('sec-logging', 'seci-logging');
        }

        setSectionStatus('logging', 'Remove the duplicate sources before saving.', 'status-err');
    }

    // Nothing is saved while any problem remains.
    if (isRequiredMissing || isSourceRepeated) {
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
    const note = document.getElementById('save-note');
    if (note) {
        note.classList.add('show');
        setTimeout(() => note.classList.remove('show'), 2000);
    }
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
 * Updates the value of an existing entry in the map at `path`.
 *
 * @param {string} path - Dotted state path to the map object.
 * @param {string} key - The entry key.
 * @param {string} value - The new value.
 */
function setEntryValue(path, key, value) {
    // Write the value at the escaped key path (the key may contain dots/colons).
    setPath(globalThis.STATE, `${path}.${convertToEscapedKey(key)}`, value);
}

/**
 * Writes a message into an inline error element when it exists.
 *
 * Behavior:
 * - Does nothing when the error element is missing.
 * - Otherwise sets the element's text to the message ('' clears it).
 *
 * @param {Element|null} errorElement - The error element to update, if present.
 * @param {string} message - The message to display; '' clears the error.
 */
function setError(errorElement, message) {
    // Update the error text only when the element exists.
    if (errorElement) {
        errorElement.textContent = message;
    }
}

/**
 * Opens or closes a foldable card (recorder, repository, MCP server) and turns its chevron.
 *
 * @param {string} bodyId - Id of the card body.
 * @param {boolean} isOpen - The new state.
 */
function setCardOpen(bodyId, isOpen) {
    const body = document.getElementById(bodyId);

    if (!body) {
        return;
    }

    body.classList.toggle('is-collapsed', !isOpen);
    document.getElementById(body.dataset.chevronId)?.classList.toggle('open', isOpen);
}

/**
 * Formats the JSON being edited in the expanded editor: formats the text box it edits, then
 * shows the result (or the error) in the editor.
 */
function setExpandedFormat() {
    const layer = document.getElementById('expand-layer');
    const source = layer ? document.getElementById(layer.dataset.targetId) : null;
    const editor = document.getElementById('expand-textarea');

    if (!source || !editor) {
        return;
    }

    setFormattedJson(source.id, source.dataset.jsonPath, source.dataset.errorId);
    editor.value = source.value;
    showExpandLineNumbers();
    showExpandError();
    editor.focus();
}

/**
 * Copies the expanded editor's text into the text box it edits, live, through that box's own
 * input handler (state, validation, line numbers).
 *
 * @param {string} value - Editor text.
 */
function setExpandedText(value) {
    const layer = document.getElementById('expand-layer');
    const source = layer ? document.getElementById(layer.dataset.targetId) : null;

    if (!source) {
        return;
    }

    source.value = value;
    source.dispatchEvent(new Event('input', { bubbles: true }));
    showExpandLineNumbers();
    showExpandError();
}

/**
 * Validates and pretty-prints the JSON in a textarea (4-space indent).
 *
 * Behavior:
 * - Treats an empty box as "no value" by storing an empty object.
 * - On success, reformats the textarea and stores the parsed value.
 * - On failure, leaves the text as-is and shows an inline error.
 *
 * @param {string} textareaId - Id of the JSON textarea.
 * @param {string} path - The dotted state path the editor binds to.
 * @param {string} [errorElementId] - Id of the element that shows parse errors.
 */
function setFormattedJson(textareaId, path, errorElementId) {
    // Resolve the textarea and error element; bail when there is no textarea.
    const textarea = document.getElementById(textareaId);
    const errorElement = errorElementId ? document.getElementById(errorElementId) : null;
    if (!textarea) {
        return;
    }

    // Read the trimmed text.
    const text = String(textarea.value ?? '').trim();

    // An empty box means "no value here" - store an empty object.
    if (!text) {
        setPath(globalThis.STATE, path, {});
        setError(errorElement, '');
        return;
    }

    try {
        // Reformat valid JSON, store it, and clear any error.
        const parsed = JSON.parse(text);
        textarea.value = JSON.stringify(parsed, null, 4);
        setPath(globalThis.STATE, path, parsed);
        setError(errorElement, '');
        showFieldLineNumbers(textarea);
    } catch (error) {
        // Leave invalid JSON untouched and surface the error.
        const message = error instanceof Error
            ? error.message
            : String(error);

        setError(
            errorElement,
            `Invalid JSON - ${message}. Fix the highlighted text before formatting.`
        );
    }
}

/**
 * Handles a JSON editor change: parses the text and writes the resulting
 * value to state, or reports an inline error and keeps the last good
 * value when the text isn't valid JSON.
 *
 * Behavior:
 * - Treats an empty box as "no value" by storing an empty object.
 * - Stores the parsed value and clears the error on valid JSON.
 * - Surfaces an inline error and keeps the last good value on invalid JSON.
 *
 * @param {string} path - The dotted state path to write.
 * @param {string} rawValue - The textarea contents.
 * @param {string} [errorElementId] - Id of the element that shows parse errors.
 */
function setJsonValue(path, rawValue, errorElementId) {
    // Resolve the error element that surfaces parse errors.
    const errorElement = errorElementId ? document.getElementById(errorElementId) : null;
    const text = String(rawValue ?? '').trim();

    // An empty box means "no value here" - store an empty object.
    if (!text) {
        setPath(globalThis.STATE, path, {});
        setError(errorElement, '');
        return;
    }

    try {
        // Valid JSON is written to state and clears the error.
        setPath(globalThis.STATE, path, JSON.parse(text));
        setError(errorElement, '');
    } catch (error) {
        // Invalid JSON keeps the last good value and surfaces the error.
        const message = error instanceof Error
            ? error.message
            : String(error);

        setError(
            errorElement,
            `Invalid JSON - ${message}. Fix the highlighted text; this change won't be saved until it parses.`
        );
    }
}

/**
 * Stores one typed entry of the list at `path`, and re-checks duplicates when the list must be
 * unique.
 *
 * @param {string} path - Dotted state path to the string[] list.
 * @param {number} index - The entry index.
 * @param {string} value - The typed text (kept as typed; blank entries are dropped on save).
 * @param {boolean} [isUnique=false] - Whether repeated entries are reported.
 */
function setListEntry(path, index, value, isUnique = false) {
    const list = getPath(globalThis.STATE, path);

    if (!Array.isArray(list)) {
        return;
    }

    list[index] = value;

    if (isUnique) {
        showListErrors(path);
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
 * Steps a port field while keeping the stored manifest value as text.
 *
 * @remarks
 * Compute-only except for writing the new value into page state and the visible input.
 * Ports are displayed with numeric controls but serialized as strings for manifest
 * compatibility.
 *
 * @param {string} path - The dotted state path to adjust.
 * @param {string} inputId - Id of the bound port input.
 * @param {number} direction - +1 to increment, -1 to decrement.
 */
function setPortNumberStep(path, inputId, direction) {
    // Read the current port as a number only for stepping.
    const current = Number(getPath(globalThis.STATE, path));
    const next = (Number.isFinite(current) ? current : 0) + direction;
    const nextText = String(next);

    // Store the stepped port as text so the saved manifest keeps the original contract.
    setPath(globalThis.STATE, path, nextText);

    // Reflect the stepped value in the visible input.
    const input = document.getElementById(inputId);

    if (!input) {
        return;
    }

    input.value = nextText;
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
    const input = document.getElementById('inp-sandbox');
    if (input) {
        input.value = sandboxPath;
    }

    // Tell the user the value is staged and still follows normal Save behavior.
    setSectionStatus('connection', 'Sandbox path set. Click Save to apply it.', 'status-ok');
}

/**
 * Writes a status message to a section's single bottom status line.
 *
 * @remarks
 * Mutates only the DOM element owned by the section status registry. This
 * keeps status placement consistent even when controls move inside a section.
 *
 * @param {string} sectionId - The owning section id.
 * @param {string} message - The status text to show.
 * @param {string} [statusClassName] - Optional visual state class.
 */
function setSectionStatus(sectionId, message, statusClassName) {
    // Missing sections can happen during early script loading or after a re-render.
    const sectionStatus = getSectionStatus(sectionId);

    if (!sectionStatus) {
        return;
    }

    // Store the latest status in the registry so section re-renders can hydrate it.
    sectionStatus.message = String(message ?? '');
    sectionStatus.statusClassName = statusClassName || '';

    const statusElement = document.getElementById(sectionStatus.elementId);

    if (!statusElement) {
        return;
    }

    // Replace the status class as a complete state update so stale success/error
    // classes cannot survive the next message.
    statusElement.className = 'field-hint section-status';

    if (statusClassName) {
        statusElement.classList.add(statusClassName);
    }

    statusElement.textContent = message;
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
 * Mirrors the JSON error of the text box being edited into the expanded editor's error line.
 */
function showExpandError() {
    const layer = document.getElementById('expand-layer');
    const source = layer ? document.getElementById(layer.dataset.targetId) : null;
    const errorElement = document.getElementById('expand-error');

    if (source && errorElement) {
        errorElement.textContent = document.getElementById(source.dataset.errorId)?.textContent ?? '';
    }
}

/**
 * Opens the expanded editor for one text box: a large centered editor with line numbers whose
 * typing updates the text box live. A JSON box also gets Format and its error line.
 *
 * @param {string} textareaId - Id of the text box to edit.
 */
function showExpandEditor(textareaId) {
    const source = document.getElementById(textareaId);

    if (!source || document.getElementById('expand-layer')) {
        return;
    }

    // Title: the field label, prefixed with the card title for a field inside a card.
    const field = source.closest('.field');
    const labelText = field?.querySelector('.field-label')?.firstChild?.textContent.trim() || 'Text';
    const cardTitle = source.closest('.item-card')?.querySelector('.item-card-title')?.textContent.trim();
    const title = cardTitle ? `${cardTitle} - ${labelText}` : labelText;
    const isJson = source.dataset.jsonPath !== undefined;
    const formatHtml = isJson
        ? writeIconButton({ icon: SVG_FORMAT, label: 'Check & Format JSON', onclick: 'setExpandedFormat()', testId: 'expand-editor-format-button' })
        : '';
    const errorHtml = isJson ? '<div class="field-error expand-error" id="expand-error" role="alert"></div>' : '';

    document.getElementById('g4-modal').insertAdjacentHTML('beforeend', `
    <div id="expand-layer" class="modal-backdrop" data-target-id="${getEscapedText(textareaId)}" data-test-id="expand-editor-layer">
        <div class="modal modal--editor" role="dialog" aria-modal="true" aria-labelledby="expand-title" data-test-id="expand-editor-modal">
            <div class="modal-hdr">
                <span id="expand-title" class="modal-title">${getEscapedText(title)}</span>
                <span class="spacer"></span>
                ${formatHtml}
            </div>
            <div class="expand-body">
                <div id="expand-gutter" class="line-numbers" aria-hidden="true"></div>
                <textarea id="expand-textarea"
                          class="expand-textarea mono"
                          data-test-id="expand-editor-textarea"
                          aria-labelledby="expand-title"
                          spellcheck="false"
                          wrap="off"
                          oninput="setExpandedText(this.value)"
                          onscroll="document.getElementById('expand-gutter').scrollTop = this.scrollTop">${getEscapedText(source.value)}</textarea>
            </div>
            ${errorHtml}
            <button type="button"
                    class="modal-close"
                    title="Close (Esc)"
                    data-test-id="expand-editor-close-button"
                    aria-label="Close"
                    onclick="hideExpandEditor()">${SVG_CLOSE}</button>
        </div>
    </div>`);

    // Open where the caret was, with line numbers and any current error.
    const editor = document.getElementById('expand-textarea');

    showExpandLineNumbers();
    showExpandError();
    editor.focus();
    editor.setSelectionRange(source.selectionStart, source.selectionEnd);
}

/**
 * Writes one number per line into the expanded editor's gutter and keeps it aligned with the text.
 */
function showExpandLineNumbers() {
    const editor = document.getElementById('expand-textarea');
    const gutter = document.getElementById('expand-gutter');

    if (!editor || !gutter) {
        return;
    }

    const lineCount = editor.value.split(LINE_BREAK_PATTERN).length;

    gutter.textContent = Array.from({ length: lineCount }, (_, index) => index + 1).join('\n');
    gutter.scrollTop = editor.scrollTop;
}

/**
 * Writes the line numbers of one text box into its gutter.
 *
 * @remarks
 * Text boxes do not wrap, so every line is exactly one row. The row height is read from a hidden
 * one-row text area with the box's font (a text area's row is taller than a block's when
 * line-height is 'normal'), and the gutter scrolls in step with the text. A box in a folded
 * section has no size yet; the resize observer numbers it when it becomes visible.
 *
 * @param {HTMLTextAreaElement} textarea - The text box.
 */
function showFieldLineNumbers(textarea) {
    const gutter = textarea ? document.getElementById(`${textarea.id}-line-numbers`) : null;

    if (!gutter || textarea.clientWidth === 0) {
        return;
    }

    // One hidden one-row text area per page, used to read the row height of the box's font.
    let rowProbe = document.getElementById('row-measure');

    if (!rowProbe) {
        rowProbe = document.createElement('textarea');
        rowProbe.id = 'row-measure';
        rowProbe.className = 'line-measure';
        rowProbe.setAttribute('aria-hidden', 'true');
        rowProbe.tabIndex = -1;
        document.body.append(rowProbe);
    }

    const style = getComputedStyle(textarea);

    rowProbe.style.font = style.font;
    rowProbe.style.lineHeight = style.lineHeight;
    rowProbe.value = 'x';

    const rowHeight = rowProbe.scrollHeight;
    const lines = textarea.value.split(LINE_BREAK_PATTERN);

    // One number per line, each one row tall.
    gutter.replaceChildren(...lines.map((_, index) => {
        const number = document.createElement('div');
        number.textContent = String(index + 1);
        number.style.height = `${rowHeight}px`;
        return number;
    }));

    // The rows layer is absolutely placed, so the numbers never stretch the box; the column is as
    // wide as the largest number (in the box's monospace font, where 1ch is one digit).
    gutter.style.font = style.font;
    gutter.style.lineHeight = `${rowHeight}px`;
    gutter.style.paddingTop = style.paddingTop;
    gutter.parentElement.style.font = style.font;
    gutter.parentElement.style.width = `calc(${String(lines.length).length}ch + 18px)`;
    gutter.scrollTop = textarea.scrollTop;
}

/**
 * Scrolls a freshly added item into view and focuses its first editable
 * field.
 *
 * @param {Element|null} element - The item element to reveal.
 */
function showItem(element) {
    // Nothing to reveal when the element is missing.
    if (!element) {
        return;
    }

    // Scroll the item into view and focus its first editable field.
    element.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    const field = element.querySelector('input[type=text], input[type=number], input[type=password], textarea, select');
    if (field) {
        field.focus();
    }
}

/**
 * Shows "Duplicate of entry N." under each repeated entry of the list at `path` (ignoring case
 * and blank entries); the first occurrence stays clean.
 *
 * @param {string} path - Dotted state path to the string[] list.
 * @returns {boolean} True when the list has a duplicate.
 */
function showListErrors(path) {
    const list = getPath(globalThis.STATE, path);
    const slug = path.replace(/[^a-z0-9]/gi, '-');
    const firstIndexes = new Map();
    let isDuplicateFound = false;

    (Array.isArray(list) ? list : []).forEach((entry, index) => {
        const comparable = String(entry ?? '').trim().toLowerCase();
        const isDuplicate = comparable !== '' && firstIndexes.has(comparable);
        const message = isDuplicate ? `Duplicate of entry ${firstIndexes.get(comparable) + 1}.` : '';

        if (comparable !== '' && !isDuplicate) {
            firstIndexes.set(comparable, index);
        }

        isDuplicateFound = isDuplicateFound || isDuplicate;
        setError(document.getElementById(`listerr-${slug}-${index}`), message);
    });

    return isDuplicateFound;
}

/**
 * Marks every empty required field with "Required." (fields show only their * until a save), and
 * opens the sections and cards that hold them.
 *
 * @returns {boolean} True when a required field is empty.
 */
function showRequiredErrors() {
    const emptyFields = [...document.querySelectorAll('[data-required="true"]')]
        .filter((control) => String(control.value ?? '').trim() === '');

    for (const control of emptyFields) {
        setError(document.getElementById(control.dataset.errorId), 'Required.');

        // Open the card, then the section, that hold the field.
        const cardBody = control.closest('.item-card-body');
        const sectionBody = control.closest('.section-body');

        if (cardBody?.classList.contains('is-collapsed')) {
            setCardOpen(cardBody.id, true);
        }

        if (sectionBody?.classList.contains('is-collapsed')) {
            updateSectionCollapse(sectionBody.id, sectionBody.id.replace('sec-', 'seci-'));
        }
    }

    if (emptyFields.length === 0) {
        return false;
    }

    // Say why in the first affected section, and bring the first empty field into view.
    const sectionId = emptyFields[0].closest('.section-body')?.id.replace('sec-', '');

    if (sectionId) {
        setSectionStatus(sectionId, 'Fill in the required fields before saving.', 'status-err');
    }

    emptyFields[0].scrollIntoView({ block: 'center' });
    emptyFields[0].focus();

    return true;
}

/**
 * Re-checks every list that must be unique, so a re-render never hides a duplicate message.
 */
function showUniqueListErrors() {
    document.querySelectorAll('[data-unique-path]').forEach((list) => showListErrors(list.dataset.uniquePath));
}

/**
 * Renders the header and the full settings form from the current state.
 *
 * Behavior:
 * - Renders the page header.
 * - Renders every section in order into the main app container.
 * - Renders the sticky action bar with Save / Reset controls.
 */
function showSettings() {
    // Render the page header.
    document.getElementById('g4-header').innerHTML = `
    <div class="header">
        <div>
            <div class="header-title">G4&#x2122; Settings</div>
            <div class="header-meta">Configure how the automation engine runs</div>
        </div>
    </div>`;

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

    // Render the sections into the main app container.
    document.getElementById('app').innerHTML = `
    <div class="main">
        ${sections}
        <div class="settings-page-spacer"></div>
    </div>`;

    // Render the sticky action bar with Save / Reset controls.
    document.getElementById('g4-actionbar').innerHTML = `
    <div class="actionbar">
        <button type="button" class="btn" onclick="save()">Save</button>
        <button type="button" class="btn btn-ghost" onclick="resetDefaults()">Reset to Defaults</button>
        <span class="spacer"></span>
        <span class="save-note" id="save-note">Settings sent.</span>
    </div>`;

    // Number every text box (now, and as each one becomes visible or changes size), and check the
    // lists that must be unique.
    startLineNumbers();
    showUniqueListErrors();
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
 * Numbers every text box on the page, now and whenever one changes size.
 *
 * @remarks
 * Called after each render. The resize observer also fires when a box first gets a size, which
 * is when a folded section or card opens, so boxes rendered while hidden are numbered then.
 */
function startLineNumbers() {
    const onTextBoxesResized = (entries) => {
        entries.forEach((entry) => showFieldLineNumbers(entry.target));
    };

    globalThis.LINE_NUMBER_OBSERVER ??= new ResizeObserver(onTextBoxesResized);
    globalThis.LINE_NUMBER_OBSERVER.disconnect();
    document.querySelectorAll('textarea[data-line-numbers]').forEach((textarea) => globalThis.LINE_NUMBER_OBSERVER.observe(textarea));
}

/**
 * Steps a number field up or down by one, honoring its min/max bounds,
 * then writes the result to state and the visible input.
 *
 * Behavior:
 * - Reads the current numeric value (treating non-numbers as 0).
 * - Adds the direction and clamps to the optional min/max bounds.
 * - Writes the result back to state and the bound input.
 *
 * @param {object} options - Number-step options.
 * @param {string} options.path - The dotted state path to adjust.
 * @param {string} options.inputId - Id of the bound number input.
 * @param {number} options.direction - +1 to increment, -1 to decrement.
 * @param {number|null} [options.minimum] - Lower bound, or null for none.
 * @param {number|null} [options.maximum] - Upper bound, or null for none.
 */
function stepNumber(options) {
    // Resolve the explicit step options supplied by the generated markup.
    const {
        path,
        inputId,
        direction,
        minimum = null,
        maximum = null
    } = options;

    // Read the current value and step it by the requested direction.
    const current = Number(getPath(globalThis.STATE, path));
    let next = (Number.isFinite(current) ? current : 0) + direction;

    // Clamp the result to the optional lower/upper bounds.
    const isMinimumProvided = minimum !== null && minimum !== undefined;
    const isMaximumProvided = maximum !== null && maximum !== undefined;

    if (isMinimumProvided && next < minimum) {
        next = minimum;
    }

    if (isMaximumProvided && next > maximum) {
        next = maximum;
    }

    // Write the stepped value into state.
    setPath(globalThis.STATE, path, next);

    // Reflect the new value in the visible input.
    const input = document.getElementById(inputId);
    if (input) {
        input.value = next;
    }
}

/**
 * Pings the configured engine and reports the result next to the button.
 *
 * Behavior:
 * - Disables the button and spins its icon while the request is in flight.
 * - Reports "Connected" on success and "Could not connect" on failure.
 * - The button label stays "Test Connection" throughout.
 *
 * @param {HTMLButtonElement} button - The clicked Test connection button.
 */
async function testConnection(button) {
    // Disable + spin the button while the request is in flight.
    if (button) {
        button.disabled = true;
        button.classList.add('is-busy');
    }
    setSectionStatus('connection', 'Testing...');

    try {
        // Ping the engine and treat any non-OK status as a failure.
        const response = await fetch(getPingUrl(), { cache: 'no-store' });
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        setSectionStatus('connection', 'Connected', 'status-ok');
    } catch (error) {
        // Report a friendly failure message and log the detail.
        console.warn('Connection test failed:', error);
        setSectionStatus('connection', 'Could not connect', 'status-err');
    } finally {
        // Always restore the button regardless of the outcome.
        if (button) {
            button.disabled = false;
            button.classList.remove('is-busy');
        }
    }
}

/**
 * Fetches the driver manifests from the engine and refreshes every Driver
 * dropdown.
 *
 * Behavior:
 * - Spins the clicked button while the request is in flight.
 * - Writes section status only when the refresh was user-triggered.
 * - Reads each manifest's `key` and stores them as the driver list.
 * - Falls back to the static list on failures or empty responses.
 * - Re-renders the driver and recorder sections so the selects update.
 *
 * @param {HTMLButtonElement} [button] - The clicked "refresh" button, if any.
 * @param {string} [sectionId] - The section that should receive user-triggered status.
 */
async function updateDrivers(button, sectionId) {
    // Page-load refreshes pass no section id and stay silent by design.
    const isUserRefresh = !!button && !!sectionId;
    let statusMessage = 'Could not refresh driver list. Using the built-in driver list.';
    let statusClassName = 'status-err';

    // Spin the clicked button while the request is in flight. No manual
    // cleanup needed - the section re-render below rebuilds the button.
    if (button) {
        button.disabled = true;
        button.classList.add('is-busy');
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
        statusClassName = 'status-ok';
    } catch (error) {
        // On any failure, drop back to the static fallback list.
        console.warn('Could not fetch driver manifests:', error);
        globalThis.DRIVERS = null;
    }

    // Persist the final status before re-render so the rebuilt section keeps it.
    if (isUserRefresh) {
        setSectionStatus(sectionId, statusMessage, statusClassName);
    }

    // Refresh the driver selects in place, preserving collapse/scroll.
    updateSection('driver');
    updateSection('recorders');
}

/**
 * Updates a field's inline warning element as the user types.
 *
 * Behavior:
 * - Computes the current validation message via getFieldError.
 * - Writes the message into the error element when it exists.
 *
 * @param {object} options - Field validation options.
 * @param {string} options.errorElementId - Id of the error element.
 * @param {*} options.value - The current field value.
 * @param {boolean} options.isRequired - Whether the field is required.
 * @param {string} options.rule - Extra validation rule (see getFieldError).
 */
function updateFieldError(options) {
    // Resolve the explicit validation options supplied by the generated markup.
    const {
        errorElementId,
        value,
        isRequired,
        rule
    } = options;

    // Resolve the error element and update its text with the latest message.
    const errorElement = document.getElementById(errorElementId);

    if (errorElement) {
        errorElement.textContent = getFieldError(value, isRequired, rule);
    }
}

/**
 * Reveals or masks a secret input and updates the toggle button icon.
 *
 * Behavior:
 * - Flips the input type between password and text.
 * - Shows the eye-slash icon (Hide) while revealed and the eye icon (Show) while masked.
 *
 * @param {string} inputId - The id of the password input.
 * @param {HTMLButtonElement} button - The clicked toggle button.
 */
function updateSecretVisibility(inputId, button) {
    // Resolve the secret input; bail when it does not exist.
    const input = document.getElementById(inputId);
    if (!input) {
        return;
    }

    // Flip the visibility and update the button icon, tooltip, and accessible name to match.
    const isRevealing = input.type === 'password';
    const label = isRevealing ? 'Hide' : 'Show';

    input.type = isRevealing ? 'text' : 'password';
    button.innerHTML = isRevealing ? SVG_EYE_SLASH : SVG_EYE;
    button.title = label;
    button.setAttribute('aria-label', label);
}

/**
 * Re-renders a single section's body in place. Every other section - and
 * this section's own collapsed/expanded state and the page scroll
 * position - is left untouched, because only the inner content of the
 * live body element is swapped (its display style, which encodes
 * collapse, never changes).
 *
 * Behavior:
 * - Resolves the live body element and the section builder.
 * - Builds the section fresh off-DOM and copies just its body content.
 *
 * @param {string} id - The section id (e.g. 'plugins').
 */
function updateSection(id) {
    // Resolve the live body element and the matching section builder.
    const liveBody = document.getElementById('sec-' + id);
    const builder = globalThis.SECTION_BUILDERS[id];
    if (!liveBody || !builder) {
        return;
    }

    // Build the section fresh off-DOM, then copy just its body content.
    const scratch = document.createElement('div');
    scratch.innerHTML = builder();

    // Remember which cards are open: a fresh render starts every card closed.
    const openCardIds = [...liveBody.querySelectorAll('.item-card-body:not(.is-collapsed)')].map((body) => body.id);

    // Swap in only the inner body content, preserving collapse/scroll.
    const freshBody = scratch.querySelector('#sec-' + id);
    if (freshBody) {
        liveBody.innerHTML = freshBody.innerHTML;
    }

    // Reopen the cards that were open (by position, so editing a card never folds it).
    openCardIds.forEach((cardId) => setCardOpen(cardId, true));

    // The section's text boxes are new elements: number them, and re-check unique lists.
    startLineNumbers();
    showUniqueListErrors();
}

/**
 * Toggles the visibility of a section body and updates its chevron icon.
 *
 * Behavior:
 * - Finds the target element by id.
 * - Hides the element when it is currently visible, and shows it otherwise.
 * - Adds or removes the `open` class on the icon to match the visible state.
 *
 * @param {string} id - The id of the section body element to show or hide.
 * @param {string} iconId - The id of the chevron icon to update.
 */
function updateSectionCollapse(id, iconId) {
    // Resolve the target element that should be toggled.
    const element = document.getElementById(id);

    // Resolve the optional chevron icon that reflects the toggle state.
    const icon = document.getElementById(iconId);

    // If the target element does not exist, there is nothing to toggle.
    if (!element) {
        return;
    }

    // The element should be hidden when it is currently visible.
    const isCollapsing = !element.classList.contains('is-collapsed');

    // Apply the new visibility state.
    element.classList.toggle('is-collapsed', isCollapsing);

    // If no icon exists, only the element visibility is toggled.
    if (!icon) {
        return;
    }

    // Update the chevron open state to match the element visibility.
    isCollapsing
        ? icon.classList.remove('open')
        : icon.classList.add('open');
}

/**
 * Renders a note linking to the engine's Capabilities page (the live G4
 * catalog). Used in the Plugins and MCP Servers sections.
 *
 * Behavior:
 * - Builds the Capabilities URL from the current connection settings.
 * - Renders a hint with an external link handled by openExternal.
 *
 * @returns {string} HTML markup for the capabilities note.
 */
function writeCapabilitiesNote() {
    // Resolve the live Capabilities page URL from current settings.
    const url = getCapabilitiesUrl();

    // Render the hint with an external link routed through the host bridge.
    return `<div class="field-hint settings-hint-block--compact">
        Browse the full G4 catalog on the
        <a href="${getEscapedText(url)}" onclick="return openExternal(this.href)" target="_blank" rel="noopener noreferrer">Capabilities page</a>
        - search plugins, read each plugin's manifest and documentation, and add external or MCP sources.
    </div>`;
}

/**
 * Renders the move up, move down, and trash buttons of a card header.
 *
 * @param {object} options - Button options.
 * @param {string} options.label - What the card is, for tooltips (e.g. 'machine 2').
 * @param {string} options.moveCall - Call that moves the card, with `OFFSET` in place of -1/1.
 * @param {string} options.removeCall - Call that removes the card.
 * @param {boolean} options.isFirst - Whether the card is first (Move up disabled).
 * @param {boolean} options.isLast - Whether the card is last (Move down disabled).
 * @param {string} options.testId - Test id prefix for the buttons.
 * @returns {string} HTML markup for the header buttons.
 */
function writeCardActions({ label, moveCall, removeCall, isFirst, isLast, testId }) {
    // Header buttons stop the click from reaching a collapsible header, so they never fold the card.
    return `
    <span class="item-card-actions">
        ${writeIconButton({ icon: SVG_ARROW_UP, label: `Move ${label} up`, onclick: `event.stopPropagation(); ${moveCall.replace('OFFSET', '-1')}`, testId: `move-${testId}-up-button`, isDisabled: isFirst })}
        ${writeIconButton({ icon: SVG_ARROW_DOWN, label: `Move ${label} down`, onclick: `event.stopPropagation(); ${moveCall.replace('OFFSET', '1')}`, testId: `move-${testId}-down-button`, isDisabled: isLast })}
        ${writeIconButton({ icon: SVG_TRASH, label: `Remove ${label}`, onclick: `event.stopPropagation(); ${removeCall}`, testId: `remove-${testId}-button` })}
    </span>`;
}

/**
 * Builds the "Connection" section: where the G4 engine lives.
 *
 * @returns {string} HTML markup for the section.
 */
function writeConnectionSection() {
    // Build the protocol/host/port row with the Test Connection control aligned at the end.
    const body = `
    <div class="field-row connection-row">
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
        <div class="field connection-action">
            <button type="button"
                    id="test-conn-btn"
                    class="btn btn-ghost btn-sm spin-btn"
                    data-test-id="test-g4-connection-button"
                    onclick="testConnection(this)"><span class="btn-label">Test Connection</span><span class="btn-spinner">${SVG_REFRESH}</span></button>
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
 * Behavior:
 * - Detects the current auth type and selects it in the dropdown.
 * - Renders username/password fields for basic, a token field for bearer.
 *
 * @param {object} options - Control options.
 * @param {string} options.path - Dotted state path to the credentials object.
 * @param {string} options.label - Human-friendly field label.
 * @param {string} [options.hint] - Optional helper text shown under the label.
 * @returns {string} HTML markup for the credentials editor.
 */
function writeCredentials({ path, label, hint }) {
    // Detect the current auth type and resolve optional hint markup.
    const type = getCredentialsType(getPath(globalThis.STATE, path));
    const hintHtml = hint ? `<div class="field-hint">${getEscapedText(hint)}</div>` : '';

    // Render the auth-type selector wired to setCredentialsType.
    const selector = `
    <div class="field">
        <label class="field-label">${getEscapedText(label)}</label>
        ${hintHtml}
        <select onchange="setCredentialsType('${path}', this.value)">
            <option value="none" ${type === 'none' ? 'selected' : ''}>None</option>
            <option value="basic" ${type === 'basic' ? 'selected' : ''}>Basic (Username &amp; Password)</option>
            <option value="bearer" ${type === 'bearer' ? 'selected' : ''}>Bearer (Token)</option>
        </select>
    </div>`;

    // Render the auth-type-specific input fields.
    let fields = '';
    if (type === 'basic') {
        // Basic auth shows username + masked password fields.
        fields = `
        <div class="field-row">
            ${writeText({ path: `${path}.username`, label: 'Username' })}
            ${writeSecret({ path: `${path}.password`, label: 'Password' })}
        </div>`;
    } else if (type === 'bearer') {
        // Bearer auth shows a single masked token field.
        fields = writeSecret({ path: `${path}.token`, label: 'Token' });
    }

    // Combine the selector with the type-specific fields.
    return selector + fields;
}

/**
 * Renders the standard manifest `driverParameters` editor: driver,
 * driver service URL/path, and the alwaysMatch capabilities JSON. Shared
 * by the Default Browser section and each recorder card so they edit the
 * exact same structure.
 *
 * Behavior:
 * - Builds the Driver dropdown from getDriverChoices, including the saved value.
 * - Wires a refresh button to re-fetch the driver list from the engine.
 * - Renders the driver service URL/path and the alwaysMatch capabilities JSON.
 *
 * @param {string} base - Dotted state path to the driverParameters object.
 * @param {string} sectionId - The section that owns refresh status for this editor.
 * @returns {string} HTML markup for the driver-parameters controls.
 */
function writeDriverParameters(base, sectionId) {
    // Resolve the saved driver value and build its dropdown options.
    const driverValue = getPath(globalThis.STATE, `${base}.driver`);
    const driverOptions = getDriverChoices(driverValue)
        .map(choice => `<option value="${getEscapedText(choice.value)}" ${choice.value === driverValue ? 'selected' : ''}>${getEscapedText(choice.text)}</option>`)
        .join('');

    // Render the driver select (+ refresh button), service URL, and capabilities JSON.
    return `
    <div class="field-row">
        <div class="field">
            <label class="field-label">Driver</label>
            <div class="field-hint">The technology used to drive the browser or app. Fetched from the engine.</div>
            <div class="input-wrap">
                <select onchange="setControlValue({ path: '${base}.driver', rawValue: this.value })">${driverOptions}</select>
                <button type="button"
                        class="btn btn-ghost btn-sm icon-btn"
                        title="Refresh Driver List"
                        data-test-id="${getEscapedText(sectionId)}-refresh-driver-list-button"
                        aria-label="Refresh Driver List"
                        onclick="updateDrivers(this, '${getEscapedText(sectionId)}')">${SVG_REFRESH}</button>
            </div>
        </div>
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
        rows: 10
    })}`;
}

/**
 * Builds the "Default Browser" section: the default automation driver.
 *
 * @returns {string} HTML markup for the section.
 */
function writeDriverSection() {
    // Reuse the shared driver-parameters editor for the default driver.
    const body = writeDriverParameters('driverParameters', 'driver');

    // Wrap the body in the collapsible section shell.
    return writeSection({
        id: 'driver',
        title: 'Default Browser',
        desc: 'The technology G4 uses to drive the browser or app.',
        body
    });
}

/**
 * Renders a small ghost icon button with a tooltip and an accessible name.
 *
 * @param {object} options - Button options.
 * @param {string} options.icon - The SVG markup.
 * @param {string} options.label - Tooltip and accessible name.
 * @param {string} options.onclick - Inline click handler.
 * @param {string} [options.testId] - Test id of the button.
 * @param {boolean} [options.isDisabled=false] - Whether the button is disabled.
 * @param {string} [options.id] - Element id of the button.
 * @returns {string} HTML markup for the button.
 */
function writeIconButton({ icon, label, onclick, testId, isDisabled = false, id }) {
    const escapedLabel = getEscapedText(label);
    const idAttribute = id ? ` id="${getEscapedText(id)}"` : '';
    const testIdAttribute = testId ? ` data-test-id="${getEscapedText(testId)}"` : '';

    return `
    <button type="button"${idAttribute}
            class="btn btn-ghost btn-sm icon-btn"
            title="${escapedLabel}"
            aria-label="${escapedLabel}"${testIdAttribute}
            onclick="${onclick}"${isDisabled ? ' disabled' : ''}>${icon}</button>`;
}

/**
 * Renders a JSON editor bound to an object/array state path.
 *
 * Behavior:
 * - Pretty-prints the current value into the textarea.
 * - On each edit the text is parsed; valid JSON is written to state, invalid
 *   JSON leaves the last good value untouched and surfaces an inline error.
 * - Provides Format and Expand icon buttons, line numbers, and no wrapping, like the flow publisher.
 *
 * @param {object} options - Control options.
 * @param {string} options.path - Dotted state path the control binds to.
 * @param {string} options.label - Human-friendly field label.
 * @param {string} [options.hint] - Optional helper text shown under the label.
 * @param {number} [options.rows=8] - Visible height of the editor, in text rows.
 * @returns {string} HTML markup for the JSON field.
 */
function writeJson({ path, label, hint, rows = 8 }) {
    // Resolve the current value as pretty-printed JSON text.
    const value = getPath(globalThis.STATE, path);
    const isValueMissing = value === null || value === undefined;
    const text = isValueMissing ? '' : JSON.stringify(value, null, 4);
    const hintHtml = hint ? `<div class="field-hint">${getEscapedText(hint)}</div>` : '';

    // Build stable ids for the error element and the textarea.
    const slug = path.replace(/[^a-z0-9]/gi, '-');
    const errorElementId = 'jsonerr-' + slug;
    const textareaId = 'json-' + slug;

    // Render the numbered JSON text box, its Format/Expand buttons, and the inline error line.
    return `
    <div class="field">
        <label class="field-label">${getEscapedText(label)}</label>
        ${hintHtml}
        <div class="json-wrap numbered">
            ${writeLineNumbers(textareaId)}
            <textarea id="${textareaId}" class="mono settings-json-textarea" rows="${rows}" spellcheck="false" wrap="off"
                data-line-numbers="true" data-json-path="${path}" data-error-id="${errorElementId}"
                oninput="setJsonValue('${path}', this.value, '${errorElementId}'); showFieldLineNumbers(this)">${getEscapedText(text)}</textarea>
            <div class="text-tools">
                ${writeIconButton({ icon: SVG_FORMAT, label: 'Check & Format JSON', onclick: `setFormattedJson('${textareaId}', '${path}', '${errorElementId}')`, testId: `${textareaId}-format-button` })}
                ${writeIconButton({ icon: SVG_EXPAND, label: 'Expand', onclick: `showExpandEditor('${textareaId}')`, testId: `${textareaId}-expand-button` })}
            </div>
        </div>
        <div class="field-error" id="${errorElementId}"></div>
    </div>`;
}

/**
 * Renders an editor for a string-to-string map (e.g. HTTP headers) as a list
 * of key/value rows with add and remove controls.
 *
 * Behavior:
 * - Renders one row per existing entry, or an empty-state hint when none.
 * - Wires key rename, value edit, and remove handlers per row.
 * - Wires the add button to append a new entry.
 *
 * @param {object} options - Control options.
 * @param {string} options.path - Dotted state path to the map object.
 * @param {string} options.label - Human-friendly field label.
 * @param {string} [options.hint] - Optional helper text shown under the label.
 * @param {string} [options.keyPlaceholder='Key'] - Placeholder for key inputs.
 * @param {string} [options.valuePlaceholder='Value'] - Placeholder for value inputs.
 * @param {string} [options.addLabel='Add'] - Caption for the add button.
 * @param {string} [options.emptyText='None.'] - Text shown when the map is empty.
 * @returns {string} HTML markup for the key/value field.
 */
function writeKeyValue({ path, label, hint, keyPlaceholder = 'Key', valuePlaceholder = 'Value', addLabel = 'Add', emptyText = 'None.' }) {
    // Resolve the current map, its entries, optional hint markup, and a list id.
    const map = getPath(globalThis.STATE, path) || {};
    const entries = Object.entries(map);
    const hintHtml = hint ? `<div class="field-hint">${getEscapedText(hint)}</div>` : '';
    const listId = 'kv-' + path.replace(/[^a-z0-9]/gi, '-');

    // Render one row per entry, or an empty-state hint when there are none.
    const rows = entries.length
        ? entries.map(([key, val]) => `
            <div class="kv-row">
                <input type="text" class="kv-key" value="${getEscapedText(key)}" placeholder="${getEscapedText(keyPlaceholder)}"
                    onchange="renameEntryKey('${path}', '${getEscapedText(key)}', this.value)" />
                <input type="text" class="kv-val" value="${getEscapedText(val)}" placeholder="${getEscapedText(valuePlaceholder)}"
                    oninput="setEntryValue('${path}', '${getEscapedText(key)}', this.value)" />
                ${writeIconButton({ icon: SVG_TRASH, label: `Remove ${key}`, onclick: `removeEntry('${path}', '${getEscapedText(key)}')` })}
            </div>`).join('')
        : `<div class="field-hint">${getEscapedText(emptyText)}</div>`;

    // Render the labeled key/value list plus the add button.
    return `
    <div class="field">
        <label class="field-label">${getEscapedText(label)}</label>
        ${hintHtml}
        <div class="kv-list" id="${listId}">${rows}</div>
        <div class="add-row">
            <button type="button" class="btn btn-ghost btn-sm" onclick="addEntry('${path}')">+ ${getEscapedText(addLabel)}</button>
        </div>
    </div>`;
}

/**
 * Builds the "License" section: the token that authorizes the engine.
 *
 * @returns {string} HTML markup for the section.
 */
function writeLicenseSection() {
    // Build the license guidance, auto-fetch button, and token field.
    const body = `
    <p class="field-hint settings-hint-block">
        Need a token? Get a free, full-featured license for personal use at
        <a href="https://github.com/g4-api/g4-services#development-license" target="_blank" rel="noopener noreferrer">g4-api/g4-services</a>.
        It renews periodically - when it expires, just request a new one and paste it here.
        If the personal license doesn't work,
        <a href="https://github.com/g4-api/g4-services/issues" target="_blank" rel="noopener noreferrer">open an issue</a>
        and we'll help you out.
    </p>
    <div class="add-row settings-add-row--license">
        <button type="button" class="btn btn-ghost btn-sm" id="fetch-token-btn"
            onclick="getDevelopmentLicense()">Fetch Free Token Automatically</button>
    </div>
    <div class="field-hint settings-hint-block--loose">
        Downloads the latest free token from GitHub and fills it in below - no copy/paste needed (requires internet access).
    </div>
    ${writeSecret({
        path: 'authentication.token',
        label: 'License Token',
        hint: 'Your private key for the engine. Treat it like a password - never share or post it.'
    })}
    <div class="note">Tip: keep this on one line, with no spaces or line breaks. If you start seeing "unauthorized" errors, your token may have expired.</div>`;

    // Wrap the body in the collapsible section shell.
    return writeSection({
        id: 'license',
        title: 'License',
        desc: 'The token that proves you are allowed to use the engine.',
        body
    });
}

/**
 * Renders the line-number gutter for a text box; the script fills it (see showFieldLineNumbers).
 *
 * @param {string} textareaId - Id of the text box the gutter numbers.
 * @returns {string} HTML markup for the gutter.
 */
function writeLineNumbers(textareaId) {
    return `
            <div class="field-line-numbers" aria-hidden="true">
                <div id="${textareaId}-line-numbers" class="field-line-rows"></div>
            </div>`;
}

/**
 * Renders a list editor bound to a string[] state path: one text box per entry with a trash button
 * (and move buttons when order matters), plus an add button, like the flow publisher lists.
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
 * @returns {string} HTML markup for the list field.
 */
function writeListRows({ path, label, hint, isOrdered = false, isUnique = false, emptyText = 'None.' }) {
    // Resolve the current list, optional hint markup, and stable ids.
    const value = getPath(globalThis.STATE, path);
    const list = Array.isArray(value) ? value : [];
    const hintHtml = hint ? `<div class="field-hint">${getEscapedText(hint)}</div>` : '';
    const slug = path.replace(/[^a-z0-9]/gi, '-');

    // One row per entry: a text box, optional move buttons, and the trash button, with an error line.
    const rows = list.length
        ? list.map((entry, index) => {
            const moveButtons = isOrdered
                ? `${writeIconButton({ icon: SVG_ARROW_UP, label: `Move ${label} entry ${index + 1} up`, onclick: `moveListEntry('${path}', ${index}, -1)`, isDisabled: index === 0 })}
                   ${writeIconButton({ icon: SVG_ARROW_DOWN, label: `Move ${label} entry ${index + 1} down`, onclick: `moveListEntry('${path}', ${index}, 1)`, isDisabled: index === list.length - 1 })}`
                : '';

            return `
            <div class="list-entry">
                <div class="kv-row">
                    <input type="text" class="kv-key" value="${getEscapedText(entry)}" placeholder="Entry"
                        aria-label="${getEscapedText(label)} entry ${index + 1}"
                        oninput="setListEntry('${path}', ${index}, this.value, ${isUnique})" />
                    ${moveButtons}
                    ${writeIconButton({ icon: SVG_TRASH, label: `Remove ${label} entry ${index + 1}`, onclick: `removeListEntry('${path}', ${index})` })}
                </div>
                <div class="field-error" id="listerr-${slug}-${index}"></div>
            </div>`;
        }).join('')
        : `<div class="field-hint">${getEscapedText(emptyText)}</div>`;

    // Render the labeled list plus the add button.
    return `
    <div class="field">
        <label class="field-label">${getEscapedText(label)}</label>
        ${hintHtml}
        <div class="kv-list" id="list-${slug}"${isUnique ? ` data-unique-path="${path}"` : ''}>${rows}</div>
        <div class="add-row">
            <button type="button" class="btn btn-ghost btn-sm" onclick="addListEntry('${path}')">+ Add entry</button>
        </div>
    </div>`;
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
    <div class="field-row">
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
    <div class="field-row">
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
        isUnique: true
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
 * Behavior:
 * - Renders the Capabilities note.
 * - Renders one card per configured server, or an empty-state note.
 * - Renders an add-server button.
 *
 * @returns {string} HTML markup for the section.
 */
function writeMcpSection() {
    // Resolve the configured MCP servers and their names.
    const servers = getPath(globalThis.STATE, 'settings.pluginsSettings.servers') || {};
    const names = Object.keys(servers);

    // Render one server card per name, or an empty-state note.
    const cards = names.length
        ? names.map(name => writeMcpServerCard(name, servers[name])).join('')
        : '<div class="note">No MCP servers connected. Add one to expose its tools as G4 plugins.</div>';

    // Build the capabilities note, server list, and add button.
    const body = `
    ${writeCapabilitiesNote()}
    <div class="field-hint settings-hint-block">Connect external MCP servers - their tools appear in the G4 plugin catalog.</div>
    <div class="card-list">${cards}</div>
    <div class="add-row">
        <button type="button" class="btn btn-ghost btn-sm" onclick="addServer()">+ Add MCP Server</button>
    </div>`;

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
 * - Wires name rename, type change, and remove handlers.
 *
 * @param {string} name - The server name (object key).
 * @param {object} server - The server definition.
 * @returns {string} HTML markup for the server card.
 */
function writeMcpServerCard(name, server) {
    // Resolve the card's state base, the transport type, and the argument text.
    const base = `settings.pluginsSettings.servers.${convertToEscapedKey(name)}`;
    const type = server?.type || 'stdio';
    const isRemote = type === 'http' || type === 'sse';
    const names = Object.keys(getPath(globalThis.STATE, 'settings.pluginsSettings.servers') || {});
    const position = names.indexOf(name);

    // Local (stdio) servers are launched as a process; remote servers are
    // reached over HTTP/SSE. Only the relevant fields are shown. The
    // variable-length key/value editor (env or headers) is rendered last
    // so growing it never pushes the fixed fields around.
    const commandErrorId = `mcp-command-error-${position}`;
    const localFields = `
        <div class="field">
            <label class="field-label">Command <span class="required-mark">*</span></label>
            <div class="field-hint">The program that starts the server (e.g. node, python, npx).</div>
            <input type="text" value="${getEscapedText(server?.command ?? '')}"
                data-required="true" data-error-id="${commandErrorId}"
                oninput="setControlValue({ path: '${base}.command', rawValue: this.value }); setError(document.getElementById('${commandErrorId}'), '')" />
            <div class="field-error" id="${commandErrorId}"></div>
        </div>
        ${writeListRows({
        path: `${base}.args`,
        label: 'Arguments',
        hint: 'Passed to the command, in this order.',
        isOrdered: true
    })}
        ${writeText({
        path: `${base}.workingDirectory`,
        label: 'Working Directory',
        hint: 'Folder the server process runs in. Optional.'
    })}`;

    // Remote servers only need a URL endpoint.
    const remoteFields = `
        ${writeText({
        path: `${base}.url`,
        label: 'URL',
        required: true,
        validate: 'url',
        placeholder: 'https://...',
        hint: 'The remote MCP server endpoint.'
    })}`;

    // Remote servers edit request headers; local servers edit env variables.
    const mapEditor = isRemote
        ? writeKeyValue({
            path: `${base}.headers`,
            label: 'Headers',
            hint: 'Optional HTTP headers sent with each request.',
            keyPlaceholder: 'Header',
            valuePlaceholder: 'Value',
            addLabel: 'Add Header',
            emptyText: 'No headers.'
        })
        : writeKeyValue({
            path: `${base}.env`,
            label: 'Environment Variables',
            hint: 'Passed to the server process.',
            keyPlaceholder: 'NAME',
            valuePlaceholder: 'value',
            addLabel: 'Add Variable',
            emptyText: 'No environment variables.'
        });

    // Render a foldable card (closed by default, like the recorder cards): the header, name/type row,
    // transport-specific fields, timeout, and map editor.
    return `
    <div class="item-card foldable-card">
        <div class="item-card-hdr" onclick="updateSectionCollapse('mcp-body-${position}','mcp-chev-${position}')">
            <i class="chev" id="mcp-chev-${position}">${SVG_CHEVRON}</i>
            <span class="item-card-title mono">${getEscapedText(name)}</span>
            <span class="spacer"></span>
            ${writeCardActions({
        label: `server ${name}`,
        moveCall: `moveServer('${getEscapedText(name)}', OFFSET)`,
        removeCall: `removeServer('${getEscapedText(name)}')`,
        isFirst: position === 0,
        isLast: position === names.length - 1,
        testId: `mcp-server-${position}`
    })}
        </div>
        <div class="item-card-body is-collapsed" id="mcp-body-${position}" data-chevron-id="mcp-chev-${position}">
        <div class="field-row">
            <div class="field">
                <label class="field-label">Name <span class="required-mark">*</span></label>
                <div class="field-hint">A short identifier for this tool server.</div>
                <input type="text" value="${getEscapedText(name)}"
                    data-required="true" data-error-id="mcp-name-error-${position}"
                    onchange="renameServer('${getEscapedText(name)}', this.value)" />
                <div class="field-error" id="mcp-name-error-${position}"></div>
            </div>
            <div class="field">
                <label class="field-label">Type <span class="required-mark">*</span></label>
                <div class="field-hint">How G4 connects to the server.</div>
                <select onchange="setServerType('${getEscapedText(name)}', this.value)">
                    <option value="stdio" ${type === 'stdio' ? 'selected' : ''}>Local Process (stdio)</option>
                    <option value="http" ${type === 'http' ? 'selected' : ''}>Remote (HTTP)</option>
                    <option value="sse" ${type === 'sse' ? 'selected' : ''}>Remote (SSE)</option>
                </select>
            </div>
        </div>
        ${isRemote ? remoteFields : localFields}
        ${writeText({
        path: `${base}.timeout`,
        label: 'Timeout',
        type: 'number',
        minimum: 0,
        hint: 'Optional connection timeout. Leave empty for the server default.'
    })}
        ${mapEditor}
        </div>
    </div>`;
}

/**
 * Builds the "Plugins" section.
 *
 * Behavior:
 * - Renders the rules-rebuild toggle and the Capabilities note.
 * - Renders one card per external repository, or an empty-state note.
 * - Renders an add-repository button.
 *
 * @returns {string} HTML markup for the section.
 */
function writePluginsSection() {
    // Resolve the configured external repositories.
    const repositories = getPath(globalThis.STATE, 'settings.pluginsSettings.externalRepositories') || [];

    // Render one repository card per entry, or an empty-state note.
    const cards = repositories.length
        ? repositories.map((repository, index) => writeRepositoryCard(repository, index)).join('')
        : '<div class="note">No external repositories. G4 uses its built-in plugins only.</div>';

    // Build the rules toggle, capabilities note, repository list, and add button.
    const body = `
    ${writeToggle({
        path: 'settings.pluginsSettings.forceRuleReference',
        label: 'Rebuild Rules at the Start of Every Run',
        hint: 'Recommended on. Keeps each run consistent with the current state.'
    })}
    ${writeCapabilitiesNote()}
    <div class="subhdr">External Plugin Repositories</div>
    <div class="field-hint settings-hint-block">Load extra plugins from remote repositories at startup. Leave empty to use built-in plugins only.</div>
    <div class="card-list">${cards}</div>
    <div class="add-row">
        <button type="button" class="btn btn-ghost btn-sm" onclick="addRepository()">+ Add Repository</button>
    </div>`;

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
 * @remarks
 * Uses explicit state handling because manifest port fields are string values even though
 * the UI should behave like the other numeric controls.
 *
 * @param {object} options - Control options.
 * @param {string} options.path - Dotted state path the port control binds to.
 * @param {string} options.label - Human-friendly field label.
 * @param {string} [options.hint] - Optional helper text shown under the label.
 * @returns {string} HTML markup for the port field.
 */
function writePort({ path, label, hint }) {
    // Resolve the current string value and stable element ids.
    const value = getPath(globalThis.STATE, path);
    const slug = path.replace(/[^a-z0-9]/gi, '-');
    const inputId = 'inp-' + slug;
    const hintHtml = hint ? `<div class="field-hint">${getEscapedText(hint)}</div>` : '';

    // Render the number input with the themed steppers used by other numeric fields.
    return `
    <div class="field field-port">
        <label class="field-label">${getEscapedText(label)}</label>
        ${hintHtml}
        <div class="num-wrap">
            <input type="number"
                   id="${inputId}"
                   title="${getEscapedText(label)}"
                   data-test-id="${slug}-port-input"
                   aria-label="${getEscapedText(label)}"
                   oninput="setControlValue({ path: '${path}', rawValue: this.value })"
                   value="${getEscapedText(value ?? '')}" />
            <div class="num-steppers">
                <button type="button"
                        class="num-step"
                        data-test-id="${slug}-port-increase-button"
                        aria-label="Increase ${getEscapedText(label)}"
                        onclick="setPortNumberStep('${path}', '${inputId}', 1)"
                        tabindex="-1">${SVG_CARET_UP}</button>
                <button type="button"
                        class="num-step"
                        data-test-id="${slug}-port-decrease-button"
                        aria-label="Decrease ${getEscapedText(label)}"
                        onclick="setPortNumberStep('${path}', '${inputId}', -1)"
                        tabindex="-1">${SVG_CARET_DOWN}</button>
            </div>
        </div>
    </div>`;
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
 * Returns a reason when a recorder script cannot be added to the automation flow, or '' when safe.
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
 * Builds one editable recorder ("machine") card.
 *
 * Behavior:
 * - Titles the card by the recorder's friendly UIA label, or a positional fallback.
 * - Renders the enabled toggle, host/port, driver parameters, and think-time pacing.
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
    const modePath = `${base}.mode`;
    const modeValue = recorder?.mode || 'standard';
    const isUiaRecorder = testUiaRecorderDriver(recorder?.driverParameters?.driver);
    const modeDisabledAttribute = isUiaRecorder ? '' : ' disabled';
    const modeOptions = RECORDER_MODE_CHOICES
        .map(choice => `
            <option value="${getEscapedText(choice.value)}" ${choice.value === modeValue ? 'selected' : ''}>
                ${getEscapedText(choice.text)}
            </option>`)
        .join('');

    // Resolve the header driver suffix and the initial unsafe-character notices.
    const driver = recorder?.driverParameters?.driver || '';
    const headerTitle = driver.length > 0 ? `${label} - ${driver}` : label;
    const isPreFlagged = recorder?.preScript?.addToAutomationFlow === true;
    const isPostFlagged = recorder?.postScript?.addToAutomationFlow === true;
    const preScriptReason = isPreFlagged ? getUnsafeScriptReason(recorder?.preScript?.script) : '';
    const postScriptReason = isPostFlagged ? getUnsafeScriptReason(recorder?.postScript?.script) : '';

    // Render a collapsible card (closed by default). The header shows "<friendly name> - <driver>"
    // and the Remove button (which stops propagation so removing never toggles the card); the body
    // holds identity, driver parameters, pacing, and the pre/post script controls.
    return `
    <div class="item-card machine-card">
        <div class="item-card-hdr" style="cursor: pointer;"
             onclick="updateSectionCollapse('rec-body-${index}','rec-chev-${index}')">
            <i class="chev" id="rec-chev-${index}">${SVG_CHEVRON}</i>
            <span class="item-card-title">${getEscapedText(headerTitle)}</span>
            <span class="spacer"></span>
            ${writeCardActions({
        label: `machine ${index + 1}`,
        moveCall: `moveRecorder(${index}, OFFSET)`,
        removeCall: `removeRecorder(${index})`,
        isFirst: index === 0,
        isLast: index === globalThis.STATE.settings.recorderSettings.recorders.length - 1,
        testId: `recorder-${index}`
    })}
        </div>
        <div class="item-card-body is-collapsed" id="rec-body-${index}" data-chevron-id="rec-chev-${index}">
        ${writeToggle({
        path: `${base}.enabled`,
        label: 'Enabled',
        hint: 'Turn this machine on or off without removing it.'
    })}
        <div class="field-row">
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
            <div class="field">
                <label class="field-label">Mode</label>
                <div class="field-hint">Capture strategy for UIA recorders.</div>
                <select title="${getEscapedText(RECORDER_MODE_TITLE)}"
                        aria-label="Recorder Mode"
                        onchange="setControlValue({ path: '${modePath}', rawValue: this.value })"${modeDisabledAttribute}>
                    ${modeOptions}
                </select>
            </div>
        </div>
        ${writeToggle({
        path: `${base}.useOffset`,
        label: 'Use Offset',
        hint: 'Adds the recorded pointer offset (--OffsetX/--OffsetY) to mouse actions. Applies to User32 capture mode.'
    })}
        <div class="subhdr">Driver Parameters</div>
        ${writeDriverParameters(`${base}.driverParameters`, 'recorders')}
        <div class="subhdr">Pacing Between Actions</div>
        ${writeToggle({
        path: `${base}.thinkTimeSettings.enabled`,
        label: 'Pause Like a Human Between Actions',
        hint: 'Off replays as fast as possible.'
    })}
        <div class="field-row">
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
        <div class="subhdr">Pre-Recording Script</div>
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
        extraInput: `updateRecorderScriptError(${index}, 'preScript')`
    })}
        ${writeToggle({
        path: `${base}.preScript.addToAutomationFlow`,
        label: 'Add to Automation Flow',
        hint: 'Adds this script to the recorded automation as an InvokeScript action (the first action). Only executes on replay for drivers that support this shell.',
        extraChange: `updateRecorderScriptError(${index}, 'preScript')`
    })}
        <div class="field-error" id="err-preScript-${index}">${getEscapedText(preScriptReason)}</div>
        <div class="subhdr">Post-Recording Script</div>
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
        extraInput: `updateRecorderScriptError(${index}, 'postScript')`
    })}
        ${writeToggle({
        path: `${base}.postScript.addToAutomationFlow`,
        label: 'Add to Automation Flow',
        hint: 'Adds this script to the recorded automation as an InvokeScript action (just before Close Browser). Only executes on replay for drivers that support this shell.',
        extraChange: `updateRecorderScriptError(${index}, 'postScript')`
    })}
        <div class="field-error" id="err-postScript-${index}">${getEscapedText(postScriptReason)}</div>
        </div>
    </div>`;
}

/**
 * Builds the "Desktop Recorders" section: capture desktop/UI sessions.
 *
 * Behavior:
 * - Renders the master enable toggle.
 * - Renders one card per recorder, or an empty-state note.
 * - Renders an add-machine button.
 *
 * @returns {string} HTML markup for the section.
 */
function writeRecordersSection() {
    // Resolve the configured recorders.
    const recorders = getPath(globalThis.STATE, 'settings.recorderSettings.recorders') || [];

    // Ensure non-UIA recorders cannot retain a non-standard mode from an older manifest edit.
    setRecorderModes(recorders);

    // Render one recorder card per entry, or an empty-state note.
    const cards = recorders.length
        ? recorders.map((recorder, index) => writeRecorderCard(recorder, index)).join('')
        : '<div class="note">No recorders yet. Add one to capture a desktop machine.</div>';

    // Build the master toggle, recorder list, and add button.
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
    <div class="card-list">${cards}</div>
    <div class="add-row">
        <button type="button" class="btn btn-ghost btn-sm" onclick="addRecorder()">+ Add Machine</button>
    </div>`;

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
 * Behavior:
 * - Titles the card by repository name, or a positional fallback.
 * - Renders name/url/version/timeout fields plus capabilities, headers, and credentials.
 *
 * @param {object} repository - The repository entry from state.
 * @param {number} index - The repository's index in the array.
 * @returns {string} HTML markup for the repository card.
 */
function writeRepositoryCard(repository, index) {
    // Resolve the card's state base path and display title.
    const base = `settings.pluginsSettings.externalRepositories.${index}`;
    const title = repository?.name || `Repository ${index + 1}`;

    // Render a foldable card (closed by default, like the recorder cards): the header, the scalar
    // fields, and the advanced editors.
    return `
    <div class="item-card foldable-card">
        <div class="item-card-hdr" onclick="updateSectionCollapse('repo-body-${index}','repo-chev-${index}')">
            <i class="chev" id="repo-chev-${index}">${SVG_CHEVRON}</i>
            <span class="item-card-title">${getEscapedText(title)}</span>
            <span class="spacer"></span>
            ${writeCardActions({
        label: `repository ${index + 1}`,
        moveCall: `moveRepository(${index}, OFFSET)`,
        removeCall: `removeRepository(${index})`,
        isFirst: index === 0,
        isLast: index === (getPath(globalThis.STATE, 'settings.pluginsSettings.externalRepositories') || []).length - 1,
        testId: `repository-${index}`
    })}
        </div>
        <div class="item-card-body is-collapsed" id="repo-body-${index}" data-chevron-id="repo-chev-${index}">
        ${writeText({
        path: `${base}.name`,
        label: 'Name',
        required: true,
        maxLength: 155,
        hint: 'A unique name for this repository (up to 155 characters).'
    })}
        ${writeText({
        path: `${base}.url`,
        label: 'URL',
        required: true,
        validate: 'url',
        placeholder: 'https://...',
        hint: 'The repository endpoint G4 loads plugins from.'
    })}
        <div class="field-row">
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
        rows: 6
    })}
        ${writeKeyValue({
        path: `${base}.headers`,
        label: 'Headers',
        hint: 'Optional HTTP headers sent with each request.',
        keyPlaceholder: 'Header',
        valuePlaceholder: 'Value',
        addLabel: 'Add Header',
        emptyText: 'No headers.'
    })}
        ${writeCredentials({
        path: `${base}.credentials`,
        label: 'Credentials',
        hint: 'Optional authentication for the repository endpoint.'
    })}
        </div>
    </div>`;
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
    <div class="field-row">
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

    // Render an editable path field plus host-backed actions.
    return `
    <div class="field">
        <label class="field-label" for="inp-sandbox">G4 Sandbox</label>
        <div class="field-hint">Local G4 sandbox folder used for bundled browsers and drivers.</div>
        <div class="input-wrap">
            <input type="text"
                   id="inp-sandbox"
                   title="G4 Sandbox Folder"
                   data-test-id="g4-sandbox-path-input"
                   aria-label="G4 Sandbox Folder"
                   oninput="setControlValue({ path: 'sandbox', rawValue: this.value })"
                   value="${getEscapedText(value)}" />
            ${writeIconButton({
        icon: SVG_SEARCH,
        label: 'Browse for G4 Sandbox',
        onclick: 'selectSandboxFolder()',
        testId: 'browse-g4-sandbox-button',
        id: 'browse-sandbox-button'
    })}
            <button type="button"
                    id="auto-detect-sandbox-button"
                    class="btn btn-ghost btn-sm"
                    title="Auto-Detect Latest G4 Sandbox"
                    data-test-id="auto-detect-g4-sandbox-button"
                    aria-label="Auto-Detect Latest G4 Sandbox"
                    onclick="findSandboxFolder()">Auto-Detect</button>
        </div>
    </div>`;
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
 * Renders a password input with a show/hide reveal button.
 *
 * Behavior:
 * - Reads the current value from state at `path`.
 * - Wires the input to setControlValue and the button to updateSecretVisibility.
 *
 * @param {object} options - Control options.
 * @param {string} options.path - Dotted state path the control binds to.
 * @param {string} options.label - Human-friendly field label.
 * @param {string} [options.hint] - Optional helper text shown under the label.
 * @returns {string} HTML markup for the secret field.
 */
function writeSecret({ path, label, hint }) {
    // Resolve the current value, optional hint markup, and a stable input id.
    const value = getPath(globalThis.STATE, path);
    const hintHtml = hint ? `<div class="field-hint">${getEscapedText(hint)}</div>` : '';
    const safeId = 'secret-' + path.replace(/[^a-z0-9]/gi, '-');

    // Render the masked input alongside a Show/Hide reveal button.
    return `
    <div class="field">
        <label class="field-label">${getEscapedText(label)}</label>
        ${hintHtml}
        <div class="input-wrap">
            <input id="${safeId}" type="password" value="${getEscapedText(value ?? '')}"
                oninput="setControlValue({ path: '${path}', rawValue: this.value })" />
            ${writeIconButton({ icon: SVG_EYE, label: 'Show', onclick: `updateSecretVisibility('${safeId}', this)`, testId: `${safeId}-visibility-button` })}
        </div>
    </div>`;
}

/**
 * Renders a collapsible settings section shell.
 *
 * Behavior:
 * - Renders an optional one-line description above the body.
 * - Wires the header to collapse/expand the body via updateSectionCollapse().
 * - Starts collapsed unless `open` is true.
 *
 * @param {object} options - Section options.
 * @param {string} options.id - Unique id suffix for the section.
 * @param {string} options.title - The section title.
 * @param {string} [options.desc] - An optional one-line description.
 * @param {string} options.body - The inner HTML for the section body.
 * @param {boolean} [options.open=false] - Whether the section starts expanded.
 * @returns {string} HTML markup for the section.
 */
function writeSection({ id, title, desc, body, open = false }) {
    // Render the optional description line above the body.
    const descHtml = desc
        ? `<div class="section-desc">${getEscapedText(desc)}</div>`
        : '';
    const statusHtml = writeSectionStatus(id);

    // Render the section shell with a collapsible header and body.
    return `
    <div class="section">
        <div class="section-hdr" onclick="updateSectionCollapse('sec-${id}','seci-${id}')">
            <i class="chev ${open ? 'open' : ''}" id="seci-${id}">${SVG_CHEVRON}</i>
            ${getEscapedText(title)}
        </div>
        <div class="section-body${open ? '' : ' is-collapsed'}" id="sec-${id}">
            ${descHtml}${body}${statusHtml}
        </div>
    </div>`;
}

/**
 * Renders the shared bottom status line for a settings section.
 *
 * @param {string} sectionId - The owning section id.
 * @returns {string} HTML markup for the section status line.
 */
function writeSectionStatus(sectionId) {
    // Sections without registry entries intentionally render no status line.
    const sectionStatus = getSectionStatus(sectionId);

    if (!sectionStatus) {
        return '';
    }

    // Rehydrate the status line from the shared registry after section re-renders.
    const statusClassName = sectionStatus.statusClassName
        ? ' ' + sectionStatus.statusClassName
        : '';
    const statusMessage = sectionStatus.message || '';

    return `
            <div id="${getEscapedText(sectionStatus.elementId)}"
                 class="field-hint section-status${getEscapedText(statusClassName)}"
                 data-test-id="${getEscapedText(sectionStatus.testId)}"
                 aria-live="polite">${getEscapedText(statusMessage)}</div>`;
}

/**
 * Renders a dropdown bound to a state path.
 *
 * Behavior:
 * - Reads the current value from state at `path`.
 * - Marks the matching choice as selected.
 * - Wires the select to setControlValue.
 *
 * @param {object} options - Control options.
 * @param {string} options.path - Dotted state path the control binds to.
 * @param {string} options.label - Human-friendly field label.
 * @param {Array<{value:string,text:string}>} options.choices - The available options.
 * @param {string} [options.hint] - Optional helper text shown under the label.
 * @returns {string} HTML markup for the select field.
 */
function writeSelect({ path, label, choices, hint }) {
    // Resolve the current value and optional hint markup.
    const value = getPath(globalThis.STATE, path);
    const hintHtml = hint ? `<div class="field-hint">${getEscapedText(hint)}</div>` : '';

    // Build the option list, marking the matching value as selected.
    const optionsHtml = choices.map(choice => `
        <option value="${getEscapedText(choice.value)}" ${choice.value === value ? 'selected' : ''}>
            ${getEscapedText(choice.text)}
        </option>`).join('');

    // Render the labeled select wired to setControlValue.
    return `
    <div class="field">
        <label class="field-label">${getEscapedText(label)}</label>
        ${hintHtml}
        <select onchange="setControlValue({ path: '${path}', rawValue: this.value })">${optionsHtml}</select>
    </div>`;
}

/**
 * Renders a multiline text area bound to a state path.
 *
 * Behavior:
 * - Reads the current value from state at `path`.
 * - Writes every keystroke back through setControlValue as a plain string.
 *
 * @param {object} options - Control options.
 * @param {string} options.path - Dotted state path the control binds to.
 * @param {string} options.label - Human-friendly field label.
 * @param {string} [options.hint] - Optional helper text shown under the label.
 * @param {string} [options.placeholder] - Optional placeholder text.
 * @param {number} [options.rows=4] - Visible row count for the text area.
 * @returns {string} HTML markup for the text area field.
 */
function writeTextarea({ path, label, hint, placeholder, rows = 4, extraInput = '' }) {
    // Resolve the current value and the optional hint/placeholder markup.
    const value = getPath(globalThis.STATE, path);
    const hintHtml = hint ? `<div class="field-hint">${getEscapedText(hint)}</div>` : '';
    const placeholderAttribute = placeholder ? ` placeholder="${getEscapedText(placeholder)}"` : '';

    // Append an optional caller statement (for example inline validation) after the value is stored.
    const extraInputCall = extraInput ? `; ${extraInput}` : '';

    // Render the numbered text box (no wrapping) wired to setControlValue on every input, with an
    // Expand button. The value is escaped so script characters like < and & render as literal text.
    const textareaId = 'text-' + path.replace(/[^a-z0-9]/gi, '-');

    return `
    <div class="field">
        <label class="field-label">${getEscapedText(label)}</label>
        ${hintHtml}
        <div class="json-wrap numbered">
            ${writeLineNumbers(textareaId)}
            <textarea id="${textareaId}" class="mono text-box" rows="${rows}" spellcheck="false" wrap="off" data-line-numbers="true"${placeholderAttribute}
                oninput="setControlValue({ path: '${path}', rawValue: this.value })${extraInputCall}; showFieldLineNumbers(this)">${getEscapedText(value ?? '')}</textarea>
            <div class="text-tools">
                ${writeIconButton({ icon: SVG_EXPAND, label: 'Expand', onclick: `showExpandEditor('${textareaId}')`, testId: `${textareaId}-expand-button` })}
            </div>
        </div>
    </div>`;
}

/**
 * Renders a single-line text/number input bound to a state path.
 *
 * Behavior:
 * - Reads the current value from state at `path`.
 * - Renders number fields with themed up/down steppers in place of native spinners.
 * - Wires required/url validation for text fields only.
 *
 * @param {object} options - Control options.
 * @param {string} options.path - Dotted state path the control binds to.
 * @param {string} options.label - Human-friendly field label.
 * @param {string} [options.hint] - Optional helper text shown under the label.
 * @param {string} [options.type='text'] - The HTML input type.
 * @param {string} [options.suffix] - Optional unit/suffix text after the input.
 * @param {string} [options.placeholder] - Optional placeholder text.
 * @param {number} [options.minimum] - Lower bound for number fields.
 * @param {number} [options.maximum] - Upper bound for number fields.
 * @param {boolean} [options.required] - Whether the text field must be non-empty.
 * @param {number} [options.maxLength] - Max character length for text fields.
 * @param {string} [options.validate] - Extra validation rule (e.g. 'url').
 * @returns {string} HTML markup for the text field.
 */
function writeText({
    path,
    label,
    hint,
    type = 'text',
    suffix,
    placeholder,
    minimum,
    maximum,
    required,
    maxLength,
    validate
}) {
    // Resolve the current value and the optional hint/suffix/placeholder markup.
    const value = getPath(globalThis.STATE, path);
    const hintHtml = hint ? `<div class="field-hint">${getEscapedText(hint)}</div>` : '';
    const suffixHtml = suffix ? `<span class="field-suffix">${getEscapedText(suffix)}</span>` : '';
    const placeholderAttribute = placeholder ? ` placeholder="${getEscapedText(placeholder)}"` : '';

    // Resolve the input kind and the optional numeric/length attributes.
    const kind = type === 'number' ? 'number' : 'text';
    const isMinimumProvided = minimum !== null && minimum !== undefined;
    const isMaximumProvided = maximum !== null && maximum !== undefined;
    const minimumAttribute = isMinimumProvided ? ` min="${minimum}"` : '';
    const maximumAttribute = isMaximumProvided ? ` max="${maximum}"` : '';
    const maxLengthAttribute = maxLength ? ` maxlength="${maxLength}"` : '';

    // Pass the lower bound through so setControlValue can clamp the stored value.
    const minimumOption = isMinimumProvided ? `, minimum: ${minimum}` : '';
    const slug = path.replace(/[^a-z0-9]/gi, '-');
    const inputId = 'inp-' + slug;

    // Required marker + inline validation are only wired for text fields; number fields stay valid
    // via their min/step handling. A required field shows only its * while editing: "Required."
    // appears when a save finds it empty (showRequiredErrors), and typing clears it again.
    const star = required ? ' <span class="required-mark">*</span>' : '';
    const isValidationNeeded = (required || validate) && kind !== 'number';
    const errorElementId = 'fielderr-' + slug;
    const validationCall = isValidationNeeded
        ? `; updateFieldError({ errorElementId: '${errorElementId}', value: this.value, isRequired: false, rule: '${validate || ''}' })`
        : '';
    const errorHtml = isValidationNeeded
        ? `<div class="field-error" id="${errorElementId}">${getEscapedText(getFieldError(value, false, validate))}</div>`
        : '';
    const requiredAttributes = required && kind !== 'number'
        ? ` data-required="true" data-error-id="${errorElementId}"`
        : '';

    // Build the base input element wired to setControlValue (+ optional validation).
    const inputHtml = `<input id="${inputId}" type="${type}" value="${getEscapedText(value ?? '')}"${placeholderAttribute}${minimumAttribute}${maximumAttribute}${maxLengthAttribute}${requiredAttributes}
            oninput="setControlValue({ path: '${path}', rawValue: this.value, kind: '${kind}'${minimumOption} })${validationCall}" />`;

    // Number fields get themed up/down steppers in place of the native
    // (un-themable) spinner controls. The buttons step the value by 1,
    // honoring the same min/max bounds as typing.
    const control = kind === 'number'
        ? `<div class="num-wrap">
            ${inputHtml}
            <div class="num-steppers">
                <button type="button" class="num-step" tabindex="-1" aria-label="Increase"
                    onclick="stepNumber({ path: '${path}', inputId: '${inputId}', direction: 1, minimum: ${minimum ?? 'null'}, maximum: ${maximum ?? 'null'} })">${SVG_CARET_UP}</button>
                <button type="button" class="num-step" tabindex="-1" aria-label="Decrease"
                    onclick="stepNumber({ path: '${path}', inputId: '${inputId}', direction: -1, minimum: ${minimum ?? 'null'}, maximum: ${maximum ?? 'null'} })">${SVG_CARET_DOWN}</button>
            </div>
        </div>`
        : inputHtml;

    // Render the labeled field with its control and optional error line.
    return `
    <div class="field">
        <label class="field-label">${getEscapedText(label)}${star}${suffixHtml}</label>
        ${hintHtml}
        ${control}
        ${errorHtml}
    </div>`;
}

/**
 * Renders an on/off toggle switch bound to a boolean state path.
 *
 * Behavior:
 * - Reads the current value from state and coerces it to a boolean.
 * - Wires the checkbox to setControlValue with the 'bool' kind.
 *
 * @param {object} options - Control options.
 * @param {string} options.path - Dotted state path the control binds to.
 * @param {string} options.label - Human-friendly field label.
 * @param {string} [options.hint] - Optional helper text shown beside the toggle.
 * @returns {string} HTML markup for the toggle.
 */
function writeToggle({ path, label, hint, extraChange = '' }) {
    // Resolve the current boolean value and optional hint markup.
    const value = !!getPath(globalThis.STATE, path);
    const hintHtml = hint ? `<div class="toggle-hint">${getEscapedText(hint)}</div>` : '';

    // Append an optional caller statement (for example inline validation) after the value is stored.
    const extraChangeCall = extraChange ? `; ${extraChange}` : '';

    // Render the toggle switch wired to setControlValue as a boolean.
    return `
    <div class="field">
        <label class="toggle">
            <input type="checkbox" ${value ? 'checked' : ''}
                onchange="setControlValue({ path: '${path}', rawValue: this.checked, kind: 'bool' })${extraChangeCall}" />
            <span class="switch"></span>
            <span class="toggle-text">
                <span class="toggle-label">${getEscapedText(label)}</span>
                ${hintHtml}
            </span>
        </label>
    </div>`;
}

// Listen for host responses to sandbox browse/auto-detect requests. This runs inside a sandboxed
// VS Code webview where only the extension host can post messages, so any message origin is accepted
// intentionally and the cross-origin verification finding is suppressed here on purpose.
window.addEventListener('message', onHostMessage); // NOSONAR - sandboxed webview; any origin accepted by design

// Keep text box line numbers in step with scrolling, and let Escape close the expanded editor.
document.addEventListener('scroll', onTextBoxScroll, true);
document.addEventListener('keydown', onDocumentKeyDown);

// Initial render.
showSettings();

// Populate the Driver dropdowns from the engine (best effort).
updateDrivers();
