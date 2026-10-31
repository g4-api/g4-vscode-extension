/*
 * G4(TM) Autonomous Run component.
 *
 * Starts and follows an autonomous exploratory run: an agent (Claude Code, Codex, or OpenCode, in a
 * sandbox partition or on this machine) explores the application and records each scenario it is asked
 * for as its own G4 flow, starting and stopping the recorders itself. The page opens a dialog over the
 * tab with the run form (recorders, harness, model, reasoning effort, prompt); Start turns the dialog
 * into the running view (the animated robot, the agent's latest step, the elapsed time, the scenarios
 * as the agent records them beside the console that streams the agent's steps, Stop), and the end of
 * the run turns it into the result view (the outcome, every scenario with its flow, the console, and
 * links to the run folder). The dialog has one fixed size for every view and never changes it on a
 * click: the status is one line, the buttons stay at the bottom, and the form body, the scenarios,
 * and the console scroll inside their own areas. The run belongs to the extension
 * host, so closing the dialog or the tab does not stop it; a reopened page shows it again. The form
 * follows manifest.json: the host sends new data when the file changes or the user presses refresh.
 *
 * Host contract (show-autonomous.ts):
 * - Injected #g4-data: { harnessIssues: string[], harnesses: [{ name, type, isSandbox, models, efforts }],
 *   isRecordingEnabled, recorders: [{ value, text, hint, isPicked }] }.
 * - Webview → host: { command: 'ready' },
 *                   { command: 'startAutonomousRun', run: { harness, model, prompt, reasoningEffort, recorders } },
 *                   { command: 'stopAutonomousRun' },
 *                   { command: 'openRunFolder' }, { command: 'openRunFile', path }, { command: 'openFlow', path },
 *                   { command: 'openSettings' }, { command: 'refreshAutonomousData' },
 *                   { command: 'copyConsoleText', text }
 * - Host → webview: { command: 'autonomousSnapshot', snapshot: { state, events, scenarios } },
 *                   { command: 'autonomousData', data } (the #g4-data shape, re-read from manifest.json),
 *                   { command: 'autonomousStartResult', issue },
 *                   { command: 'autonomousChange', change: { kind: 'state' | 'event' | 'scenarios', ... } }
 */

// How often the elapsed time on the running view is refreshed.
const ELAPSED_INTERVAL_MILLISECONDS = 1000;

// Agent events the page keeps and the console lists; the host keeps the same number, so a reopened page
// replays the whole console.
const EVENT_HISTORY_LIMIT = 200;

// How close to the bottom (in pixels) the console counts as following the newest line.
const CONSOLE_FOLLOW_TOLERANCE_PIXELS = 4;

// Width of the kind column in copied console text; the longest kind (result, error) fits, so texts line up.
const CONSOLE_KIND_COLUMN_WIDTH = 6;

// Status line before the agent reports its first step.
const STATUS_STARTING_TEXT = 'Starting the agent…';

// Shown in the running view's scenario box until the agent plans one.
const SCENARIOS_EMPTY_TEXT = 'The agent has not planned any scenario yet.';

// Inside of each 16 by 16 line icon; the stroke comes from the page's icon style.
const ICON_PATHS = {
    down: '<path d="M8 3v9M4 8l4 4 4-4"/>',
    refresh: '<path d="M13 8a5 5 0 1 1-1.5-3.5M13 2.5v2.5h-2.5"/>'
};

// Solid console tool icons, drawn on a 640 x 640 grid and filled with the button color (no fixed fill, so they
// follow the theme): clear (trash can), copy (two sheets), transcript (document), and wrap (a line that turns
// back under itself).
const SOLID_ICON_PATHS = {
    clear: '<path d="M232.7 69.9C237.1 56.8 249.3 48 263.1 48L377 48C390.8 48 403 56.8 407.4 69.9L416 96L512 96C529.7 96 544 110.3 544 128C544 145.7 529.7 160 512 160L128 160C110.3 160 96 145.7 96 128C96 110.3 110.3 96 128 96L224 96L232.7 69.9zM128 208L512 208L512 512C512 547.3 483.3 576 448 576L192 576C156.7 576 128 547.3 128 512L128 208zM216 272C202.7 272 192 282.7 192 296L192 488C192 501.3 202.7 512 216 512C229.3 512 240 501.3 240 488L240 296C240 282.7 229.3 272 216 272zM320 272C306.7 272 296 282.7 296 296L296 488C296 501.3 306.7 512 320 512C333.3 512 344 501.3 344 488L344 296C344 282.7 333.3 272 320 272zM424 272C410.7 272 400 282.7 400 296L400 488C400 501.3 410.7 512 424 512C437.3 512 448 501.3 448 488L448 296C448 282.7 437.3 272 424 272z"/>',
    copy: '<path d="M480 400L288 400C279.2 400 272 392.8 272 384L272 128C272 119.2 279.2 112 288 112L421.5 112C425.7 112 429.8 113.7 432.8 116.7L491.3 175.2C494.3 178.2 496 182.3 496 186.5L496 384C496 392.8 488.8 400 480 400zM288 448L480 448C515.3 448 544 419.3 544 384L544 186.5C544 169.5 537.3 153.2 525.3 141.2L466.7 82.7C454.7 70.7 438.5 64 421.5 64L288 64C252.7 64 224 92.7 224 128L224 384C224 419.3 252.7 448 288 448zM160 192C124.7 192 96 220.7 96 256L96 512C96 547.3 124.7 576 160 576L352 576C387.3 576 416 547.3 416 512L416 496L368 496L368 512C368 520.8 360.8 528 352 528L160 528C151.2 528 144 520.8 144 512L144 256C144 247.2 151.2 240 160 240L176 240L176 192L160 192z"/>',
    file: '<path d="M128 128C128 92.7 156.7 64 192 64L341.5 64C358.5 64 374.8 70.7 386.8 82.7L493.3 189.3C505.3 201.3 512 217.6 512 234.6L512 512C512 547.3 483.3 576 448 576L192 576C156.7 576 128 547.3 128 512L128 128zM336 122.5L336 216C336 229.3 346.7 240 360 240L453.5 240L336 122.5zM248 320C234.7 320 224 330.7 224 344C224 357.3 234.7 368 248 368L392 368C405.3 368 416 357.3 416 344C416 330.7 405.3 320 392 320L248 320zM248 416C234.7 416 224 426.7 224 440C224 453.3 234.7 464 248 464L392 464C405.3 464 416 453.3 416 440C416 426.7 405.3 416 392 416L248 416z"/>',
    wrap: '<path d="M124 116L516 116A28 28 0 0 1 516 172L124 172A28 28 0 0 1 124 116zM124 292L428 292A116 116 0 0 1 428 524L392 524L392 568L296 496L392 424L392 468L428 468A60 60 0 0 0 428 348L124 348A28 28 0 0 1 124 292zM124 468L204 468A28 28 0 0 1 204 524L124 524A28 28 0 0 1 124 468z"/>'
};

// Title of the dialog, in every view.
const MODAL_TITLE = 'Autonomous Exploratory Run';

// Text of the choice that leaves the model or the effort to the harness.
const HARNESS_DEFAULT_TEXT = 'Harness default';

// Display text of the reasoning effort values the harnesses use.
const EFFORT_TEXTS = {
    high: 'High',
    low: 'Low',
    max: 'Max',
    medium: 'Medium',
    minimal: 'Minimal',
    ultra: 'Ultra',
    xhigh: 'Extra High'
};

// How each run outcome is announced on the result view, when the host sent no explanation.
const OUTCOME_NOTICES = {
    completed: { title: 'The agent finished.', tone: 'ok' },
    failed: { title: 'The run failed.', tone: 'error' },
    stopped: { title: 'The run was stopped.', tone: '' },
    timedOut: { title: 'The run reached its time limit.', tone: 'error' }
};

// Run phases during which the running view is shown.
const ACTIVE_PHASES = new Set(['running', 'starting', 'stopping']);

// The VS Code webview bridge. Acquired once; guarded so the page also renders correctly when it is
// opened outside the extension host.
globalThis.VSCODE = (typeof acquireVsCodeApi === 'function')
    ? acquireVsCodeApi()
    : null;

// The data the host injected through #g4-data. Read defensively so the page still renders
// standalone, where the placeholder is left unreplaced.
globalThis.INJECTED = readInjectedData();

// The page state. Module-level because the dialog, the host messages, and the elapsed timer all
// outlive the function that started them:
// - form: the values the user picked, kept across runs so a new run starts from them.
// - modal / view: the open dialog and the element inside it whose content switches between the form,
//   the running view, and the result view; null while the dialog is closed.
// - run: the host's latest run snapshot (state, events, scenarios); its phase decides the view.
// - isStartPending: Start was sent and the host has not answered yet.
// - isRefreshPending: the harness refresh was sent and the host has not answered yet.
// - elapsedTimer: the timer of the running view's clock; null while the running view is not shown.
// - console: whether the console wraps its lines and when the user last cleared it, for which run (all
//   remembered in the webview state), and whether it follows the newest line (off while the user scrolls up).
globalThis.STATE = {
    console: { ...readViewState().console, isFollowing: true },
    elapsedTimer: null,
    form: newForm(),
    isRefreshPending: false,
    isStartPending: false,
    modal: null,
    run: {
        events: [],
        scenarios: [],
        state: { phase: 'idle' }
    },
    view: null
};

/**
 * Adds one agent event to the open console, keeping it at the newest line while it follows.
 *
 * @remarks
 * Only the new line is written, so a long console never redraws and a user scrolled up keeps the line
 * they are reading: when the oldest line is dropped, the view moves up by its height.
 *
 * @param {{ kind: string, text: string, time: string }} entry - The agent event.
 */
function addConsoleLine(entry) {
    const list = globalThis.STATE.view?.querySelector('[data-part="console-lines"]');
    const isLineSkipped = !list || !entry;

    // Only the running and result views have a console, and only a real event becomes a line.
    if (isLineSkipped) {
        return;
    }

    // Write the new line at the end.
    list.insertAdjacentHTML('beforeend', getConsoleLineMarkup(entry));

    // Drop the oldest lines past the limit, keeping the reader's place.
    while (list.children.length > EVENT_HISTORY_LIMIT) {
        const removedHeight = list.firstElementChild.offsetHeight;

        list.firstElementChild.remove();
        list.scrollTop = Math.max(0, list.scrollTop - removedHeight);
    }

    // Follow the newest line unless the user scrolled up, then refresh the header.
    if (globalThis.STATE.console.isFollowing) {
        list.scrollTop = list.scrollHeight;
    }

    updateConsoleHeader();
}

/**
 * Clears the console on the page and remembers it, so a reopened tab does not bring the lines back.
 *
 * @remarks
 * Only the page forgets the lines: the run keeps every one in events.jsonl, which Transcript opens, and
 * lines that arrive later are shown as usual. The clear is remembered with the run's start time, so it
 * applies to this run only.
 */
function clearConsole() {
    const { console: consoleState, run, view } = globalThis.STATE;

    // Forget the lines and remember when, and for which run, the console was cleared.
    run.events = [];
    consoleState.clearedAt = new Date().toISOString();
    consoleState.clearedRunStartedAt = typeof run.state?.startedAt === 'string'
        ? run.state.startedAt
        : '';
    consoleState.isFollowing = true;

    // Persist the clear in the webview state, so a reopened tab replays only later lines.
    saveViewState();

    // Empty the list, then refresh the count and the status line, which no longer shows a cleared step.
    view?.querySelector('[data-part="console-lines"]')?.replaceChildren();
    updateConsoleHeader();
    updateRunning();
}

/**
 * Normalizes the page data from the host: the injected #g4-data or a refreshed copy.
 *
 * @remarks
 * Compute-only. Missing or malformed parts become empty lists, and recording counts as on unless the
 * data says otherwise, so the form still renders and explains why Start is off.
 *
 * @param {unknown} data - The data as the host sent it.
 * @returns {{ harnessIssues: string[], harnesses: object[], isRecordingEnabled: boolean, recorders: object[] }}
 *     The page data.
 */
function convertFromAutonomousData(data) {
    return {
        harnessIssues: Array.isArray(data?.harnessIssues) ? data.harnessIssues : [],
        harnesses: Array.isArray(data?.harnesses) ? data.harnesses : [],
        isRecordingEnabled: data?.isRecordingEnabled !== false,
        recorders: Array.isArray(data?.recorders) ? data.recorders : []
    };
}

/**
 * Converts an event time to the HH:mm:ss stamp of a console line, in local time.
 *
 * @remarks
 * Compute-only. A missing or unreadable time gives an empty stamp instead of NaN:NaN:NaN.
 *
 * @param {string} time - The event time, as an ISO text.
 * @returns {string} The stamp, or ''.
 */
function convertToClockText(time) {
    // Reject an unreadable time, so the stamp is empty instead of NaN.
    const date = new Date(time ?? '');

    if (Number.isNaN(date.getTime())) {
        return '';
    }

    // Pad each part to two digits, so the stamps line up.
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');

    return `${hours}:${minutes}:${seconds}`;
}

/**
 * Converts a duration to the mm:ss text shown on the running and result views.
 *
 * @remarks
 * Compute-only. Minutes keep counting past 59, so a long run reads 75:02 instead of wrapping.
 *
 * @param {number} milliseconds - Elapsed time.
 * @returns {string} The time as mm:ss.
 */
function convertToElapsedText(milliseconds) {
    const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
    const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
    const seconds = String(totalSeconds % 60).padStart(2, '0');

    return `${minutes}:${seconds}`;
}

/**
 * Returns one console line: its time stamp and its text, styled by the event kind.
 *
 * @remarks
 * Compute-only. The full text is also the tooltip, for the lines cut to one line when wrapping is off.
 *
 * @param {{ kind: string, text: string, time: string }} entry - The agent event.
 * @returns {string} The list item markup.
 */
function getConsoleLineMarkup(entry) {
    return `
            <li class="autonomous__console-line autonomous__console-line--${getEscapedText(entry.kind)}"
                title="${getEscapedText(entry.text)}"
                data-test-id="autonomous-console-line">
                <span class="autonomous__console-time">${getEscapedText(convertToClockText(entry.time))}</span>
                <span class="autonomous__console-text">${getEscapedText(entry.text)}</span>
            </li>`;
}

/**
 * Returns the console: a header row (the title, the line count, and the tools) over the lines, which fill
 * their pane and scroll.
 *
 * @remarks
 * Compute-only over the page state. The console is always open, so it never changes the dialog's size.
 * The wrap choice comes from the state, so the console looks the same in the running view, the result
 * view, and a reopened tab. The tools carry data-action, so the dialog's delegated click listener runs
 * them; Transcript reuses the run-file action.
 *
 * @returns {string} The console markup.
 */
function getConsoleMarkup() {
    const { console: consoleState, run } = globalThis.STATE;
    const wrappedClass = consoleState.isWrapped
        ? ' autonomous__console--wrapped'
        : '';
    const lines = run.events.map((entry) => getConsoleLineMarkup(entry)).join('');

    return `
    <section class="autonomous__console${wrappedClass}"
             data-part="console-panel"
             data-test-id="autonomous-console-panel"
             aria-label="Agent console">
        <div class="autonomous__pane-header">
            <h3 class="autonomous__section-title autonomous__console-title">Console</h3>
            <span class="autonomous__console-count"
                  data-part="console-count"
                  data-test-id="autonomous-console-count-text"></span>
            <button type="button"
                    class="autonomous__console-tool autonomous__console-tool--labeled"
                    title="Scroll to the newest line and follow it again"
                    data-action="show-latest-console-line"
                    data-part="console-jump"
                    data-test-id="show-latest-autonomous-console-line-button"
                    hidden>${getIconMarkup('down')}Latest</button>
            <button type="button"
                    class="autonomous__console-tool"
                    title="Wrap long lines"
                    data-action="switch-console-wrap"
                    data-part="console-wrap"
                    data-test-id="switch-autonomous-console-wrap-button"
                    aria-label="Wrap long lines"
                    aria-pressed="${consoleState.isWrapped}">${getIconMarkup('wrap')}</button>
            <button type="button"
                    class="autonomous__console-tool"
                    title="Clear the console; the transcript keeps every line"
                    data-action="clear-console"
                    data-test-id="clear-autonomous-console-button"
                    aria-label="Clear the console">${getIconMarkup('clear')}</button>
            <button type="button"
                    class="autonomous__console-tool"
                    title="Copy the console lines"
                    data-action="copy-console"
                    data-test-id="copy-autonomous-console-button"
                    aria-label="Copy the console lines">${getIconMarkup('copy')}</button>
            <button type="button"
                    class="autonomous__console-tool"
                    title="Open the agent's raw output (events.jsonl)"
                    data-action="open-file"
                    data-path="events.jsonl"
                    data-test-id="open-autonomous-console-transcript-button"
                    aria-label="Open the transcript">${getIconMarkup('file')}</button>
        </div>
        <ol class="autonomous__console-lines"
            data-part="console-lines"
            data-test-id="autonomous-console-lines-list"
            aria-live="off">${lines}</ol>
    </section>`;
}

/**
 * Returns the console lines as plain text for the clipboard: one line per event with its stamp and kind.
 *
 * @remarks
 * Compute-only over the run snapshot, so lines dropped from the view are not copied either.
 *
 * @returns {string} The text.
 */
function getConsoleText() {
    // One line per event: the stamp, the kind in a fixed column, and the text; non-text values become empty.
    const convertToLineText = (entry) => {
        const kindText = typeof entry.kind === 'string'
            ? entry.kind
            : '';
        const lineText = typeof entry.text === 'string'
            ? entry.text
            : '';

        return `${convertToClockText(entry.time)} ${kindText.padEnd(CONSOLE_KIND_COLUMN_WIDTH)} ${lineText}`;
    };

    return globalThis.STATE.run.events
        .map(convertToLineText)
        .join('\n');
}

/**
 * Returns the choices of the effort select for a harness.
 *
 * @remarks
 * Compute-only. A harness without efforts offers only its default.
 *
 * @param {{ efforts: string[] } | undefined} harness - The picked harness.
 * @returns {{ value: string, text: string }[]} The choices.
 */
function getEffortChoices(harness) {
    const efforts = harness?.efforts ?? [];

    if (efforts.length === 0) {
        return [{ value: '', text: HARNESS_DEFAULT_TEXT }];
    }

    return efforts.map((effort) => ({ value: effort, text: EFFORT_TEXTS[effort] ?? effort }));
}

/**
 * Returns the elapsed time of the run: until now while it runs, until its end after it ended.
 *
 * @remarks
 * Compute-only over the run state.
 *
 * @returns {string} The time as mm:ss, or an empty string before the run started.
 */
function getElapsedText() {
    const { finishedAt, startedAt } = globalThis.STATE.run.state;
    const startTime = Date.parse(startedAt ?? '');

    if (Number.isNaN(startTime)) {
        return '';
    }

    const finishTime = Date.parse(finishedAt ?? '');
    const endTime = Number.isNaN(finishTime) ? Date.now() : finishTime;

    return convertToElapsedText(endTime - startTime);
}

/**
 * Escapes a value so it can be safely rendered as HTML text or inside double-quoted HTML attributes.
 *
 * @remarks
 * Compute-only. Arrays and objects become JSON (component attributes such as choices), so they
 * never reach the page as '[object Object]'; null and undefined become ''.
 *
 * @param {*} value - The value to escape.
 * @returns {string} The escaped HTML-safe string.
 */
function getEscapedText(value) {
    const isObject = value !== null && typeof value === 'object';
    const text = isObject
        ? JSON.stringify(value)
        : String(value ?? '');

    return text
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;');
}

/**
 * Returns one fact of the running or result view.
 *
 * @param {string} name - The fact name.
 * @param {string} value - The fact value.
 * @param {string} testId - The value's test id.
 * @returns {string} The fact markup.
 */
function getFactMarkup(name, value, testId) {
    return `
            <div class="autonomous__fact">
                <dt class="autonomous__fact-name">${getEscapedText(name)}</dt>
                <dd class="autonomous__fact-value"
                    title="${getEscapedText(value)}"
                    data-test-id="${getEscapedText(testId)}">${getEscapedText(value)}</dd>
            </div>`;
}

/**
 * Returns the run form markup, filled from the current form values.
 *
 * @remarks
 * Compute-only over the page state. The controls carry data-name (the form value they edit), so
 * one delegated g4-input listener on the dialog keeps the state current. The model and effort
 * choices come from the picked harness.
 *
 * @returns {string} The form markup.
 */
function getFormMarkup() {
    const { form } = globalThis.STATE;
    const { harnesses, isRecordingEnabled, recorders } = globalThis.INJECTED;
    const harness = getHarness(form.harness);

    // The dropdown lists every recorder from the manifest; the picked ones start switched on.
    const recorderChoices = recorders.map(({ value, text, hint }) => ({ value, text, hint }));
    const recordersDisabledAttribute = isRecordingEnabled
        ? ''
        : 'disabled';

    // Each harness says where it runs; models and efforts follow the picked harness.
    const harnessChoices = harnesses.map((choice) => {
        const choicePlaceText = choice.isSandbox
            ? 'sandbox partition'
            : 'this machine';

        return { value: choice.name, text: choice.name, hint: `${choice.type}, ${choicePlaceText}` };
    });
    const harnessDisabledAttribute = harnesses.length === 0
        ? 'disabled'
        : '';
    const placeText = harness?.isSandbox
        ? 'Runs inside its sandbox partition.'
        : 'Runs on this machine with your own login.';
    const harnessHint = harness
        ? placeText
        : 'Add a harness in the Settings Editor, save it, then refresh.';

    // The refresh button turns while the host re-reads the manifest, and takes no second press.
    const refreshBusyClass = globalThis.STATE.isRefreshPending
        ? ' autonomous__icon-button--busy'
        : '';
    const refreshDisabledAttribute = globalThis.STATE.isRefreshPending
        ? 'disabled'
        : '';

    return `
    <div class="autonomous__form" data-test-id="autonomous-form">
        <div class="autonomous__form-body" data-test-id="autonomous-form-body">
            <p class="autonomous__intro" data-test-id="autonomous-form-intro-text">
                Pick the recorders, the agent that explores, and tell it which scenarios to record. The agent starts and stops
                the recorders itself, once per scenario.
            </p>

            <g4-notice-list test-id="autonomous-form-notice"></g4-notice-list>

            <g4-field hint="Recorders from manifest.json. Switch on the ones the agent may record with."
                      label="Recorders"
                      test-id="autonomous-recorders-field">
                <g4-toggle-dropdown data-name="recorders"
                                    choices="${getEscapedText(recorderChoices)}"
                                    ${recordersDisabledAttribute}
                                    placeholder="No recorders selected"
                                    test-id="autonomous-recorders-toggle-dropdown"
                                    value="${getEscapedText(form.recorders)}"></g4-toggle-dropdown>
            </g4-field>

            <g4-field hint="${getEscapedText(harnessHint)}"
                      label="Harness"
                      test-id="autonomous-harness-field">
                <div class="autonomous__select-row">
                    <g4-select data-name="harness"
                               choices="${getEscapedText(harnessChoices)}"
                               ${harnessDisabledAttribute}
                               test-id="autonomous-harness-select"
                               value="${getEscapedText(form.harness)}"></g4-select>
                    <button type="button"
                            class="autonomous__icon-button${refreshBusyClass}"
                            title="Read the harnesses and recorders again from manifest.json"
                            data-action="refresh-harnesses"
                            data-test-id="refresh-autonomous-harnesses-button"
                            aria-label="Refresh harnesses and recorders"
                            ${refreshDisabledAttribute}>${getIconMarkup('refresh')}</button>
                </div>
            </g4-field>

            <div class="autonomous__field-row">
                <g4-field hint="Plans and drives every step."
                          label="Model"
                          test-id="autonomous-model-field">
                    <g4-select data-name="model"
                               choices="${getEscapedText(getModelChoices(harness))}"
                               test-id="autonomous-model-select"
                               value="${getEscapedText(form.model)}"></g4-select>
                </g4-field>
                <g4-field hint="How long the model thinks before each step."
                          label="Reasoning Effort"
                          test-id="autonomous-reasoning-effort-field">
                    <g4-select data-name="reasoningEffort"
                               choices="${getEscapedText(getEffortChoices(harness))}"
                               test-id="autonomous-reasoning-effort-select"
                               value="${getEscapedText(form.reasoningEffort)}"></g4-select>
                </g4-field>
            </div>

            <g4-field hint="The scenarios to record, what to look for, and what to avoid. Ask for several scenarios to get one flow each."
                      label="Prompt"
                      required
                      test-id="autonomous-prompt-field">
                <g4-markdown-textarea data-name="prompt"
                                      rows="8"
                                      test-id="autonomous-prompt-markdown-textarea">${getEscapedText(form.prompt)}</g4-markdown-textarea>
            </g4-field>
        </div>

        <div class="autonomous__actions">
            <span class="autonomous__actions-note"
                  data-part="start-note"
                  data-test-id="autonomous-start-note-text"
                  aria-live="polite"></span>
            <button type="button"
                    class="autonomous__button autonomous__button--secondary"
                    title="Close the dialog"
                    data-action="close"
                    data-test-id="close-autonomous-run-dialog-button">
                Close
            </button>
            <button type="button"
                    class="autonomous__button autonomous__button--primary"
                    data-action="start"
                    data-test-id="start-autonomous-run-button">
                Start
            </button>
        </div>
    </div>`;
}

/**
 * Finds a harness of the injected data by name.
 *
 * @param {string} name - The harness name.
 * @returns {{ name: string, type: string, isSandbox: boolean, models: string[], efforts: string[] } | undefined}
 *     The harness, or undefined.
 */
function getHarness(name) {
    return globalThis.INJECTED.harnesses.find((harness) => harness.name === name);
}

/**
 * Returns one icon of the page: a solid console tool icon, or a line icon.
 *
 * @remarks
 * Compute-only. The icon is decorative; the button around it carries the accessible name. Solid icons use their
 * 640-unit grid and the solid modifier (filled with the button color); line icons use the 16-unit grid and a stroke.
 *
 * @param {keyof ICON_PATHS | keyof SOLID_ICON_PATHS} name - The icon name.
 * @returns {string} The SVG markup.
 */
function getIconMarkup(name) {
    // Draw a solid console tool icon on its own grid, so it renders at the same size as the line icons.
    const solidPaths = SOLID_ICON_PATHS[name];

    if (solidPaths) {
        return `<svg class="autonomous__icon autonomous__icon--solid"
                     aria-hidden="true"
                     viewBox="0 0 640 640"
                     xmlns="http://www.w3.org/2000/svg">${solidPaths}</svg>`;
    }

    return `<svg class="autonomous__icon"
                 aria-hidden="true"
                 viewBox="0 0 16 16"
                 xmlns="http://www.w3.org/2000/svg">${ICON_PATHS[name] ?? ''}</svg>`;
}

/**
 * Returns the choices of the model select for a harness.
 *
 * @remarks
 * Compute-only. A harness without models offers only its default.
 *
 * @param {{ models: string[] } | undefined} harness - The picked harness.
 * @returns {{ value: string, text: string }[]} The choices.
 */
function getModelChoices(harness) {
    const models = harness?.models ?? [];

    if (models.length === 0) {
        return [{ value: '', text: HARNESS_DEFAULT_TEXT }];
    }

    return models.map((model) => ({ value: model, text: model }));
}

/**
 * Fits the form values to refreshed page data, keeping every choice that still exists.
 *
 * @remarks
 * Compute-only. A harness that is gone falls back to the first one, and a model or effort the harness no
 * longer offers falls back to its first. Recorders stay switched as the user left them; a recorder that
 * is new in the manifest starts as the manifest says. The prompt is never touched.
 *
 * @param {{ harness: string, model: string, prompt: string, reasoningEffort: string, recorders: string[] }} form
 *     The current form values.
 * @param {{ recorders: { value: string }[] }} previousData - The page data the form was made for.
 * @param {{ harnesses: object[], recorders: { value: string, isPicked: boolean }[] }} data - The new page data.
 * @returns {{ harness: string, model: string, prompt: string, reasoningEffort: string, recorders: string[] }}
 *     The fitted form values.
 */
function getReconciledForm(form, previousData, data) {
    // Keep the harness, its model, and its effort while they exist; otherwise take the first.
    const harness = data.harnesses.find((choice) => choice.name === form.harness) ?? data.harnesses[0];
    const models = harness?.models ?? [];
    const efforts = harness?.efforts ?? [];
    const model = models.includes(form.model)
        ? form.model
        : models[0] ?? '';
    const reasoningEffort = efforts.includes(form.reasoningEffort)
        ? form.reasoningEffort
        : efforts[0] ?? '';

    // Keep the user's recorder switches, and switch on a new recorder the manifest enables.
    const recorderValues = new Set(data.recorders.map((recorder) => recorder.value));
    const previousValues = new Set(previousData.recorders.map((recorder) => recorder.value));
    const keptRecorders = form.recorders.filter((value) => recorderValues.has(value));
    const testAddedPickedRecorder = (recorder) => recorder.isPicked && !previousValues.has(recorder.value);
    const addedRecorders = data.recorders
        .filter(testAddedPickedRecorder)
        .map((recorder) => recorder.value);

    return {
        ...form,
        harness: harness?.name ?? '',
        model,
        reasoningEffort,
        recorders: [...keptRecorders, ...addedRecorders]
    };
}

/**
 * Returns the result view markup: the outcome and facts, the scenarios beside the console, and the run files.
 *
 * @remarks
 * Compute-only over the run snapshot. It fills the fixed dialog like the running view: a long outcome
 * scrolls in the summary on top, the scenarios and the console scroll in their panes, and the buttons stay
 * at the bottom. Buttons carry data-action (and data-path for a file), so the dialog's delegated click
 * listener runs them.
 *
 * @returns {string} The result markup.
 */
function getResultMarkup() {
    const { scenarios, state } = globalThis.STATE.run;
    const scenariosText = getScenarioCountText(scenarios);

    return `
    <section class="autonomous__result"
             data-test-id="autonomous-result-panel"
             aria-label="Autonomous run result">
        <div class="autonomous__result-summary" data-test-id="autonomous-result-summary">
            <g4-notice-list test-id="autonomous-result-notice"></g4-notice-list>

            <dl class="autonomous__facts" data-test-id="autonomous-result-facts">
                ${getFactMarkup('Harness', state.harnessName, 'autonomous-result-harness-text')}
                ${getFactMarkup('Model', state.model || HARNESS_DEFAULT_TEXT, 'autonomous-result-model-text')}
                ${getFactMarkup('Scenarios', scenariosText, 'autonomous-result-scenarios-text')}
                ${getFactMarkup('Elapsed', getElapsedText(), 'autonomous-result-elapsed-text')}
            </dl>
        </div>

        <div class="autonomous__panes" data-test-id="autonomous-result-panes">
            <section class="autonomous__panel"
                     data-test-id="autonomous-result-scenarios-region"
                     aria-label="Scenarios">
                <div class="autonomous__pane-header">
                    <h3 class="autonomous__section-title">Scenarios</h3>
                </div>
                <div class="autonomous__scenarios-box" data-test-id="autonomous-result-scenarios-box">
                    ${getScenarioListMarkup(scenarios, 'The agent recorded no scenarios.')}
                </div>
            </section>

            <div class="autonomous__console-slot" data-test-id="autonomous-result-console-slot">
                ${getConsoleMarkup()}
            </div>
        </div>

        <div class="autonomous__actions autonomous__actions--wrap">
            <button type="button"
                    class="autonomous__button autonomous__button--secondary"
                    title="Show the run folder in the file manager"
                    data-action="open-folder"
                    data-test-id="open-autonomous-run-folder-button">
                Open Run Folder
            </button>
            <button type="button"
                    class="autonomous__button autonomous__button--secondary"
                    title="Open the agent's summary"
                    data-action="open-file"
                    data-path="final-message.md"
                    data-test-id="open-autonomous-final-message-button">
                Summary
            </button>
            <button type="button"
                    class="autonomous__button autonomous__button--secondary"
                    title="Open the brief the agent received"
                    data-action="open-file"
                    data-path="brief.md"
                    data-test-id="open-autonomous-brief-button">
                Brief
            </button>
            <button type="button"
                    class="autonomous__button autonomous__button--secondary"
                    title="Open the agent's raw output"
                    data-action="open-file"
                    data-path="events.jsonl"
                    data-test-id="open-autonomous-events-button">
                Transcript
            </button>
            <span class="autonomous__actions-spacer"></span>
            <button type="button"
                    class="autonomous__button autonomous__button--primary"
                    title="Start another run with the same choices"
                    data-action="new-run"
                    data-test-id="new-autonomous-run-button">
                New Run
            </button>
        </div>
    </section>`;
}

/**
 * Returns how many scenarios have a saved flow, out of all of them.
 *
 * @remarks
 * Compute-only.
 *
 * @param {{ flowPath: string }[]} scenarios - The ledger scenarios.
 * @returns {string} The count, for example "2 of 3 recorded".
 */
function getScenarioCountText(scenarios) {
    const recordedCount = scenarios.filter((scenario) => scenario.flowPath).length;

    return `${recordedCount} of ${scenarios.length} recorded`;
}

/**
 * Returns the line under a scenario's name: a failure first, then the agent's note, then the flow size.
 *
 * @remarks
 * Compute-only.
 *
 * @param {{ error: string, note: string, flowPath: string, ruleCount: number }} scenario - The ledger scenario.
 * @returns {string} The detail text, or '' when there is nothing to say.
 */
function getScenarioDetailText(scenario) {
    if (scenario.error) {
        return scenario.error;
    }

    if (scenario.note) {
        return scenario.note;
    }

    if (scenario.flowPath) {
        return `${scenario.ruleCount} actions recorded`;
    }

    return '';
}

/**
 * Returns the scenario list: each scenario with its recording state, its result, and its flow.
 *
 * @remarks
 * Compute-only. A saved flow gets an Open Flow button; an error or the agent's note shows under the
 * name.
 *
 * @param {object[]} scenarios - The ledger scenarios.
 * @param {string} emptyText - Shown when there are none yet.
 * @returns {string} The list markup.
 */
function getScenarioListMarkup(scenarios, emptyText) {
    if (scenarios.length === 0) {
        return `<p class="autonomous__empty" data-test-id="autonomous-scenarios-empty-text">${getEscapedText(emptyText)}</p>`;
    }

    const items = scenarios.map((scenario) => {
        const detail = getScenarioDetailText(scenario);
        const openFlowButton = scenario.flowPath
            ? `
                <button type="button"
                        class="autonomous__button autonomous__button--secondary autonomous__button--small"
                        title="Open this flow in the workflow viewer"
                        data-action="open-flow"
                        data-path="${getEscapedText(scenario.flowPath)}"
                        data-test-id="open-autonomous-scenario-flow-button">
                    Open Flow
                </button>`
            : '';

        return `
            <li class="autonomous__scenario" data-test-id="autonomous-scenario-item">
                <span class="autonomous__scenario-index" data-test-id="autonomous-scenario-index-text">${getEscapedText(scenario.index)}</span>
                <span class="autonomous__scenario-body">
                    <span class="autonomous__scenario-name" data-test-id="autonomous-scenario-name-text">${getEscapedText(scenario.name)}</span>
                    <span class="autonomous__scenario-detail" data-test-id="autonomous-scenario-detail-text">${getEscapedText(detail)}</span>
                </span>
                <span class="autonomous__badge autonomous__badge--${getEscapedText(scenario.recording)}"
                      data-test-id="autonomous-scenario-recording-text">${getEscapedText(scenario.recording)}</span>
                <span class="autonomous__badge autonomous__badge--${getEscapedText(scenario.result)}"
                      data-test-id="autonomous-scenario-result-text">${getEscapedText(scenario.result)}</span>${openFlowButton}
            </li>`;
    }).join('');

    return `<ol class="autonomous__scenarios" data-test-id="autonomous-scenarios-list">${items}</ol>`;
}

/**
 * Returns why the run cannot start yet, or '' when it can.
 *
 * @remarks
 * Compute-only over the page state. The reasons are checked in the order the user fixes them:
 * settings first, then the form from top to bottom. The host checks again before it starts.
 *
 * @returns {string} The reason shown beside Start, or ''.
 */
function getStartIssue() {
    const { form, isStartPending } = globalThis.STATE;
    const { harnesses, isRecordingEnabled, recorders } = globalThis.INJECTED;

    if (isStartPending) {
        return 'Starting…';
    }

    if (!isRecordingEnabled) {
        return 'Recording is turned off in the settings.';
    }

    if (recorders.length === 0) {
        return 'No recorders are configured.';
    }

    if (harnesses.length === 0) {
        return 'No harness is configured.';
    }

    if (form.recorders.length === 0) {
        return 'Switch on at least one recorder.';
    }

    if (form.prompt.trim() === '') {
        return 'Write a prompt for the agent.';
    }

    return '';
}

/**
 * Returns the running view's status line: the agent's latest step, else the run's own message, else
 * that the agent is starting.
 *
 * @remarks
 * Compute-only over the run snapshot.
 *
 * @param {{ events: { text: string }[], state: { message: string } }} run - The run snapshot.
 * @returns {string} The status text.
 */
function getStatusText(run) {
    const latestText = run.events.at(-1)?.text;
    const isLatestTextShown = typeof latestText === 'string' && latestText !== '';

    if (isLatestTextShown) {
        return latestText;
    }

    const isMessageShown = typeof run.state.message === 'string' && run.state.message !== '';

    if (isMessageShown) {
        return run.state.message;
    }

    return STATUS_STARTING_TEXT;
}

/**
 * Returns the events a console shows: all of them, or only those after the user cleared it during this run.
 *
 * @remarks
 * Compute-only. A clear belongs to the run it was made in (matched by the run's start time), so a new run
 * shows every line again. ISO times of the same clock compare correctly as text.
 *
 * @param {{ events?: { time: string }[], state?: { startedAt?: string } }} run - The run snapshot.
 * @param {{ clearedAt: string, clearedRunStartedAt: string }} consoleState - When and for which run the
 *     console was cleared.
 * @returns {{ kind: string, text: string, time: string }[]} The events to show.
 */
function getVisibleEvents(run, consoleState) {
    const events = Array.isArray(run?.events) ? run.events : [];
    const isClearedRun = consoleState.clearedAt !== ''
        && consoleState.clearedRunStartedAt !== ''
        && consoleState.clearedRunStartedAt === run?.state?.startedAt;

    // A console that was not cleared during this run shows every line.
    if (!isClearedRun) {
        return events;
    }

    // Keep only the lines that arrived after the clear; ISO times of the same clock compare as text.
    const testAfterClear = (entry) => {
        const isTimed = typeof entry?.time === 'string';

        return isTimed && entry.time > consoleState.clearedAt;
    };

    return events.filter(testAfterClear);
}

/**
 * Creates the starting form values: the recorders enabled in the manifest and the first harness with
 * its first model and effort.
 *
 * @returns {{ harness: string, model: string, prompt: string, reasoningEffort: string, recorders: string[] }}
 *     The form values.
 */
function newForm() {
    const harness = globalThis.INJECTED.harnesses[0];

    return {
        harness: harness?.name ?? '',
        model: harness?.models?.[0] ?? '',
        prompt: '',
        reasoningEffort: harness?.efforts?.[0] ?? '',
        recorders: globalThis.INJECTED.recorders
            .filter((recorder) => recorder.isPicked)
            .map((recorder) => recorder.value)
    };
}

/**
 * Runs the dialog's buttons: Close, Start, Stop, the harness refresh, the console tools, and the result
 * view's links.
 *
 * @param {MouseEvent} event - Click inside the dialog.
 */
function onDialogClick(event) {
    // Only an enabled control with an action does anything.
    const button = event.target.closest('[data-action]');
    const isButtonInactive = !button || button.disabled;

    if (isButtonInactive) {
        return;
    }

    // Each action goes to the modal, the run, or the host.
    switch (button.dataset.action) {
        case 'close':
            globalThis.STATE.modal?.close();
            break;

        case 'start':
            startRun();
            break;

        case 'stop':
            stopRun();
            break;

        case 'new-run':
            showForm();
            break;

        case 'open-folder':
            sendHostMessage({ command: 'openRunFolder' });
            break;

        case 'open-file':
            sendHostMessage({ command: 'openRunFile', path: button.dataset.path });
            break;

        case 'open-flow':
            sendHostMessage({ command: 'openFlow', path: button.dataset.path });
            break;

        case 'refresh-harnesses':
            requestAutonomousData();
            break;

        case 'clear-console':
            clearConsole();
            break;

        case 'switch-console-wrap':
            switchConsoleWrapped();
            break;

        case 'copy-console':
            sendHostMessage({ command: 'copyConsoleText', text: getConsoleText() });
            break;

        case 'show-latest-console-line':
            showLatestConsoleLine();
            break;

        default:
            break;
    }
}

/**
 * Forgets the dialog after the user closes it (Close, the corner button, or Escape).
 *
 * @remarks
 * The run belongs to the host, so closing the dialog does not stop it; the launcher says that a run
 * is in progress and opens the dialog again on it.
 */
function onDialogClose() {
    stopElapsedTimer();

    // The dialog removed itself; forget it so the launcher opens a new one.
    globalThis.STATE.modal = null;
    globalThis.STATE.view = null;
    updateLauncher();
}

/**
 * Keeps the form state current as the user edits a control, and re-checks Start.
 *
 * @remarks
 * Picking another harness resets the model and the effort to that harness's first choices and draws
 * the form again, since their choices change.
 *
 * @param {CustomEvent<{ value: unknown }>} event - g4-input from a control with data-name.
 */
function onDialogInput(event) {
    const { form } = globalThis.STATE;
    const name = event.target.dataset?.name;
    const isFormValue = typeof name === 'string' && Object.hasOwn(form, name);

    if (!isFormValue) {
        return;
    }

    // Store the value under the control's name.
    form[name] = event.detail.value;

    // A new harness brings its own models and efforts.
    if (name === 'harness') {
        const harness = getHarness(form.harness);

        form.model = harness?.models?.[0] ?? '';
        form.reasoningEffort = harness?.efforts?.[0] ?? '';
        showForm();
        return;
    }

    updateStartButton();
}

/**
 * Follows the console's newest line only while the user stays at the bottom of it.
 *
 * @remarks
 * Scroll does not bubble, so the dialog hears it in the capture phase and keeps only the console's.
 * Scrolling up pauses following and shows Latest; scrolling back down resumes it.
 *
 * @param {Event} event - Scroll of an element inside the dialog.
 */
function onDialogScroll(event) {
    // Only the console's own scroll decides whether it follows.
    const list = event.target;

    if (list?.dataset?.part !== 'console-lines') {
        return;
    }

    // Follow while the bottom of the lines is in view.
    const distanceToBottom = list.scrollHeight - list.scrollTop - list.clientHeight;

    globalThis.STATE.console.isFollowing = distanceToBottom <= CONSOLE_FOLLOW_TOLERANCE_PIXELS;
    updateConsoleHeader();
}

/**
 * Applies a message from the extension host: the run snapshot, the start answer, or a run change.
 *
 * @param {MessageEvent} event - The host message.
 */
function onHostMessage(event) {
    // Trust only messages from the webview host itself, not from an embedded cross-origin frame; some
    // host deliveries carry no origin value.
    const isTrustedOrigin = event.origin === globalThis.origin || event.origin === '';

    if (!isTrustedOrigin) {
        return;
    }

    const message = event.data ?? {};

    switch (message.command) {
        case 'autonomousSnapshot': {
            // A console the user cleared during this run replays only the lines that came after the clear.
            const snapshot = message.snapshot ?? globalThis.STATE.run;

            globalThis.STATE.run = { ...snapshot, events: getVisibleEvents(snapshot, globalThis.STATE.console) };
            showRunView();
            break;
        }

        case 'autonomousData':
            // The manifest changed or the user asked to refresh; the form keeps the choices that still exist.
            updateAutonomousData(message.data);
            break;

        case 'autonomousStartResult':
            // An accepted start is followed by state changes; a refused one goes back to the form with the reason.
            globalThis.STATE.isStartPending = false;

            if (message.issue) {
                showForm({ text: message.issue, tone: 'error', testId: 'autonomous-start-refused-notice' });
            }

            break;

        case 'autonomousChange':
            updateRun(message.change ?? {});
            break;

        default:
            break;
    }
}

/**
 * Runs a notice action: the settings link of the form's notices.
 *
 * @param {CustomEvent<{ id: string }>} event - g4-action of a notice list.
 */
function onNoticeAction(event) {
    if (event.detail?.id === 'open-settings') {
        sendHostMessage({ command: 'openSettings' });
    }
}

/**
 * Opens the run dialog from the launcher button.
 */
function onOpenDialogClick() {
    showDialog();
}

/**
 * Reads the data the host injected through #g4-data.
 *
 * @remarks
 * Compute-only over the document. Missing or unreadable data (the page opened standalone) yields
 * no recorders and no harnesses with recording on, so the form still renders and explains why Start
 * is off.
 *
 * @returns {{ harnessIssues: string[], harnesses: object[], isRecordingEnabled: boolean, recorders: object[] }}
 *     The injected data.
 */
function readInjectedData() {
    try {
        return convertFromAutonomousData(JSON.parse(document.getElementById('g4-data').value));
    } catch {
        return convertFromAutonomousData(null);
    }
}

/**
 * Reads the console choices remembered in the webview state.
 *
 * @remarks
 * Compute-only over the webview state. Outside VS Code, or before anything was remembered, the console
 * starts with wrapping off and nothing cleared. Values that are not text are dropped, so a stale state
 * cannot hide lines.
 *
 * @returns {{ console: { clearedAt: string, clearedRunStartedAt: string, isWrapped: boolean } }}
 *     The remembered choices.
 */
function readViewState() {
    const viewState = globalThis.VSCODE?.getState?.() ?? {};
    const convertToText = (value) => (typeof value === 'string' ? value : '');

    return {
        console: {
            clearedAt: convertToText(viewState.console?.clearedAt),
            clearedRunStartedAt: convertToText(viewState.console?.clearedRunStartedAt),
            isWrapped: viewState.console?.isWrapped === true
        }
    };
}

/**
 * Asks the host to read manifest.json again, for a harness or recorder saved after the page opened.
 *
 * @remarks
 * The refresh button turns until the host answers with autonomousData; outside VS Code there is no
 * host, so nothing is asked.
 */
function requestAutonomousData() {
    // One request at a time, and only inside VS Code, where a host can answer.
    const isRefreshBlocked = !globalThis.VSCODE || globalThis.STATE.isRefreshPending;

    if (isRefreshBlocked) {
        return;
    }

    // Show the refresh as busy, then ask.
    globalThis.STATE.isRefreshPending = true;
    updateRefreshButton();
    sendHostMessage({ command: 'refreshAutonomousData' });
}

/**
 * Remembers the console choices in the webview state, so a reloaded tab shows the console as it was left.
 */
function saveViewState() {
    const { clearedAt, clearedRunStartedAt, isWrapped } = globalThis.STATE.console;

    globalThis.VSCODE?.setState?.({ console: { clearedAt, clearedRunStartedAt, isWrapped } });
}

/**
 * Posts a message to the extension host, when the page runs inside it.
 *
 * @param {object} message - The message.
 */
function sendHostMessage(message) {
    globalThis.VSCODE?.postMessage(message);
}

/**
 * Opens the run dialog over the tab, showing the view that fits the run.
 *
 * @remarks
 * Owns the dialog's lifetime: the modal and its view are kept in the page state until the user
 * closes the dialog. The input, click, and notice listeners sit on the view, so they survive every
 * switch between the form, the running view, and the result view.
 */
function showDialog() {
    // One dialog at a time: a second open would leave two forms editing the same state.
    if (globalThis.STATE.modal) {
        return;
    }

    // Build the dialog around one view element whose content switches between the views; the dialog keeps
    // one fixed size, so switching views or clicking inside never resizes it.
    const modal = document.createElement('g4-modal');
    const view = document.createElement('div');

    modal.setAttribute('modal-title', MODAL_TITLE);
    modal.setAttribute('size', 'fixed');
    modal.setAttribute('test-id', 'autonomous-run-modal');
    view.className = 'autonomous__view';
    view.dataset.testId = 'autonomous-run-view';
    modal.append(view);

    // Wire the controls and buttons once; the modal reports its close on itself.
    view.addEventListener('g4-input', onDialogInput);
    view.addEventListener('g4-action', onNoticeAction);
    view.addEventListener('click', onDialogClick);
    view.addEventListener('scroll', onDialogScroll, true);
    modal.addEventListener('g4-close', onDialogClose);

    // Remember the dialog, open it with focus returning to the launcher button, then show the run.
    globalThis.STATE.modal = modal;
    globalThis.STATE.view = view;
    modal.show(document.getElementById('open-autonomous-dialog-button'));
    showRunView();
}

/**
 * Shows the run form in the dialog, with an optional notice above it.
 *
 * @remarks
 * Rebuilt from the page state every time, so the values survive the other views. The notices
 * explain a form that cannot start (recording off, no recorders, no harness, harness entries left
 * out of the settings).
 *
 * @param {{ text: string, tone: string, testId: string } | null} [statusNotice] - A one-time notice,
 *     for example why the host refused to start.
 */
function showForm(statusNotice = null) {
    const { view } = globalThis.STATE;
    const { harnessIssues, harnesses, isRecordingEnabled, recorders } = globalThis.INJECTED;

    if (!view) {
        return;
    }

    // Render the form; its components draw themselves as they connect.
    stopElapsedTimer();
    view.innerHTML = getFormMarkup();

    // Collect the notices: the one-time status, then the settings problems.
    const settingsAction = { id: 'open-settings', label: 'Open Settings', testId: 'open-autonomous-settings-button' };
    const notices = [];

    if (statusNotice) {
        notices.push(statusNotice);
    }

    if (!isRecordingEnabled) {
        notices.push({
            text: 'Recording is turned off. Turn on Recorders in the Settings Editor to start a run.',
            tone: 'error',
            testId: 'autonomous-recording-disabled-notice',
            action: settingsAction
        });
    }

    const isRecorderListEmpty = isRecordingEnabled && recorders.length === 0;

    if (isRecorderListEmpty) {
        notices.push({
            text: 'No recorders are configured. Add one under Recorders in the Settings Editor.',
            tone: 'error',
            testId: 'autonomous-no-recorders-notice',
            action: settingsAction
        });
    }

    if (harnesses.length === 0) {
        notices.push({
            text: 'No harness is configured. Add Claude Code, Codex, or OpenCode under Autonomous Runs in the Settings Editor.',
            tone: 'error',
            testId: 'autonomous-no-harness-notice',
            action: settingsAction
        });
    }

    for (const issue of harnessIssues) {
        notices.push({ text: issue, testId: 'autonomous-harness-issue-notice' });
    }

    // Show the notices, then set Start from the restored values.
    view.querySelector('g4-notice-list').notices = notices;
    updateStartButton();
}

/**
 * Scrolls the console to its newest line and follows new lines again.
 */
function showLatestConsoleLine() {
    const list = globalThis.STATE.view?.querySelector('[data-part="console-lines"]');

    // Follow again, so new lines keep the console at the bottom.
    globalThis.STATE.console.isFollowing = true;

    if (list) {
        list.scrollTop = list.scrollHeight;
    }

    updateConsoleHeader();
}

/**
 * Shows the result view in the dialog: the outcome, the scenarios with their flows, and the run files.
 */
function showResult() {
    const { run, view } = globalThis.STATE;

    if (!view) {
        return;
    }

    // Render the result, then announce the outcome with the host's explanation.
    stopElapsedTimer();
    view.innerHTML = getResultMarkup();

    const outcomeNotice = OUTCOME_NOTICES[run.state.outcome] ?? OUTCOME_NOTICES.failed;

    view.querySelector('g4-notice-list').notices = [{
        text: run.state.message || outcomeNotice.title,
        tone: outcomeNotice.tone,
        testId: 'autonomous-run-outcome-notice'
    }];

    // Show the console at its newest line.
    showLatestConsoleLine();
}

/**
 * Shows the running view in the dialog: the animated robot, the agent's latest step, the run's facts,
 * the scenarios, the console, and Stop.
 *
 * @remarks
 * The view is cloned from #autonomous-running-template; its parts are filled right away and again
 * on every run change, and the clock ticks every second.
 */
function showRunning() {
    const { run, view } = globalThis.STATE;

    if (!view) {
        return;
    }

    // Clone the running view and fill in what this run uses.
    const { state } = run;
    const content = document.getElementById('autonomous-running-template').content.cloneNode(true);
    const recorderNames = Array.isArray(state.recorderNames) ? state.recorderNames : [];
    const recordersElement = content.querySelector('[data-part="recorders"]');
    const harnessPlace = state.isSandbox ? 'sandbox' : 'this machine';
    const harnessName = typeof state.harnessName === 'string'
        ? state.harnessName
        : '';
    const harnessElement = content.querySelector('[data-part="harness"]');

    harnessElement.textContent = `${harnessName} (${harnessPlace})`;
    harnessElement.title = harnessElement.textContent;
    content.querySelector('[data-part="model"]').textContent = state.model || HARNESS_DEFAULT_TEXT;

    // Show the effort by its display name; a value without one shows as itself.
    const effortValueText = state.effort || HARNESS_DEFAULT_TEXT;
    const effortText = EFFORT_TEXTS[state.effort] ?? effortValueText;

    content.querySelector('[data-part="effort"]').textContent = effortText;
    recordersElement.textContent = recorderNames.join(', ');
    recordersElement.title = recorderNames.join('\n');

    // Put the console in its slot; new lines are added to it one by one as they arrive.
    content.querySelector('[data-part="console"]').innerHTML = getConsoleMarkup();

    // Replace the previous view, fill the live parts, start the clock, and move focus to Stop.
    view.replaceChildren(content);
    updateRunning();
    showLatestConsoleLine();
    startElapsedTimer();
    view.querySelector('[data-action="stop"]')?.focus();
}

/**
 * Shows the view that fits the run: running, result, or the form.
 */
function showRunView() {
    const phase = globalThis.STATE.run.state?.phase;

    updateLauncher();

    if (ACTIVE_PHASES.has(phase)) {
        showRunning();
        return;
    }

    if (phase === 'finished') {
        showResult();
        return;
    }

    showForm();
}

/**
 * Starts the page: wires the launcher and the host messages, asks for the run snapshot, and opens the
 * dialog.
 */
function startAutonomous() {
    // The launcher stays behind the dialog and opens it again after the user closes it.
    document.getElementById('open-autonomous-dialog-button').addEventListener('click', onOpenDialogClick);

    // Host messages carry the run; ask for the current one so a reopened tab shows it.
    globalThis.addEventListener('message', onHostMessage);
    sendHostMessage({ command: 'ready' });

    // The tab opens straight into the dialog.
    showDialog();
}

/**
 * Starts the running view's clock.
 */
function startElapsedTimer() {
    stopElapsedTimer();
    globalThis.STATE.elapsedTimer = setInterval(updateElapsed, ELAPSED_INTERVAL_MILLISECONDS);
    updateElapsed();
}

/**
 * Asks the host to start the run with the form values.
 *
 * @remarks
 * Start is disabled while getStartIssue reports a reason, but the check runs again here so a stale
 * button can never send an incomplete run. The view changes when the host reports the new state.
 */
function startRun() {
    const { form } = globalThis.STATE;

    if (getStartIssue() !== '') {
        return;
    }

    // Lock Start until the host answers, then send the run.
    globalThis.STATE.isStartPending = true;
    updateStartButton();

    sendHostMessage({
        command: 'startAutonomousRun',
        run: {
            harness: form.harness,
            model: form.model,
            prompt: form.prompt,
            reasoningEffort: form.reasoningEffort,
            recorders: [...form.recorders]
        }
    });
}

/**
 * Stops the running view's clock.
 */
function stopElapsedTimer() {
    clearInterval(globalThis.STATE.elapsedTimer);
    globalThis.STATE.elapsedTimer = null;
}

/**
 * Asks the host to stop the run; the view changes when the host reports the end.
 */
function stopRun() {
    sendHostMessage({ command: 'stopAutonomousRun' });
}

/**
 * Switches the console between wrapped lines and one line each (with the rest in the tooltip), and
 * remembers the choice.
 */
function switchConsoleWrapped() {
    const panel = globalThis.STATE.view?.querySelector('[data-part="console-panel"]');

    if (!panel) {
        return;
    }

    // Flip and remember the choice, then show it on the panel and its button.
    const isWrapped = !globalThis.STATE.console.isWrapped;

    globalThis.STATE.console.isWrapped = isWrapped;
    saveViewState();
    panel.classList.toggle('autonomous__console--wrapped', isWrapped);
    panel.querySelector('[data-part="console-wrap"]').setAttribute('aria-pressed', String(isWrapped));

    // Wrapped lines are taller; stay at the newest line while following.
    if (globalThis.STATE.console.isFollowing) {
        showLatestConsoleLine();
    }
}

/**
 * Applies page data the host re-read from manifest.json: the harnesses, the recorders, and the
 * recording switch.
 *
 * @remarks
 * The form keeps every choice that still exists (getReconciledForm) and its prompt. The form is drawn
 * again only when the data changed and the form is showing, so an unchanged file never moves the caret;
 * the running and result views do not show this data and are left alone.
 *
 * @param {unknown} data - The data as the host sent it.
 */
function updateAutonomousData(data) {
    const previousData = globalThis.INJECTED;
    const nextData = convertFromAutonomousData(data);
    const isDataChanged = JSON.stringify(previousData) !== JSON.stringify(nextData);

    // The host answered; the refresh button is free again.
    globalThis.STATE.isRefreshPending = false;

    if (!isDataChanged) {
        updateRefreshButton();
        return;
    }

    // Take the new data and fit the form values to it.
    globalThis.INJECTED = nextData;
    globalThis.STATE.form = getReconciledForm(globalThis.STATE.form, previousData, nextData);

    // Draw the form again only when it is the view on show.
    const formElement = globalThis.STATE.view?.querySelector('[data-test-id="autonomous-form"]') ?? null;
    const isFormShown = formElement !== null;

    if (isFormShown) {
        showForm();
    }
}

/**
 * Refreshes the console header: the line count, and Latest while the user is scrolled up.
 */
function updateConsoleHeader() {
    const { console: consoleState, run, view } = globalThis.STATE;
    const panel = view?.querySelector('[data-part="console-panel"]');

    if (!panel) {
        return;
    }

    // Count the lines the console shows.
    const count = run.events.length;
    const countText = count === 1
        ? '1 line'
        : `${count} lines`;

    panel.querySelector('[data-part="console-count"]').textContent = countText;

    // Latest shows only while the console is paused above the newest line.
    panel.querySelector('[data-part="console-jump"]').hidden = consoleState.isFollowing;
}

/**
 * Writes the run's elapsed time on the running view.
 */
function updateElapsed() {
    const elapsedElement = globalThis.STATE.view?.querySelector('[data-part="elapsed"]');

    if (elapsedElement) {
        elapsedElement.textContent = getElapsedText();
    }
}

/**
 * Says on the launcher whether a run is in progress, so a closed dialog is not mistaken for a stopped run.
 */
function updateLauncher() {
    const phase = globalThis.STATE.run.state?.phase;
    const button = document.getElementById('open-autonomous-dialog-button');

    button.textContent = ACTIVE_PHASES.has(phase)
        ? 'Show Running Run'
        : 'Open Run Dialog';
}

/**
 * Shows on the harness refresh button whether the host is re-reading the manifest.
 */
function updateRefreshButton() {
    const button = globalThis.STATE.view?.querySelector('[data-action="refresh-harnesses"]');

    if (!button) {
        return;
    }

    // Turn and lock the button while the host works.
    const { isRefreshPending } = globalThis.STATE;

    button.disabled = isRefreshPending;
    button.classList.toggle('autonomous__icon-button--busy', isRefreshPending);
}

/**
 * Applies one run change from the host and refreshes the view that shows it.
 *
 * @param {{ kind: string, state?: object, entry?: object, scenarios?: object[] }} change - The change.
 */
function updateRun(change) {
    const { run } = globalThis.STATE;

    switch (change.kind) {
        case 'state': {
            // A new phase switches the view; the same phase only refreshes the running parts.
            const isPhaseChanged = run.state?.phase !== change.state?.phase;

            run.state = change.state ?? run.state;

            if (isPhaseChanged) {
                showRunView();
            } else {
                updateRunning();
            }

            break;
        }

        case 'event':
            // A change without its event has nothing to show.
            if (!change.entry) {
                break;
            }

            // Keep the history bounded, add the line to the console, then refresh the status line.
            run.events = [...run.events, change.entry].slice(-EVENT_HISTORY_LIMIT);
            addConsoleLine(change.entry);
            updateRunning();
            break;

        case 'scenarios':
            // The ledger changed: take the new list and redraw the scenario box.
            run.scenarios = change.scenarios ?? [];
            updateRunning();
            break;

        default:
            break;
    }
}

/**
 * Refreshes the running view's live parts: the latest step, the scenarios, and Stop. The console is
 * kept current by addConsoleLine.
 */
function updateRunning() {
    const { run, view } = globalThis.STATE;
    const statusElement = view?.querySelector('[data-part="status"]');

    // Only the running view has a status line.
    if (!statusElement) {
        return;
    }

    // Write the latest step (or the run's own message), replaying the entrance animation on a new line.
    const statusText = getStatusText(run);

    if (statusElement.textContent !== statusText) {
        statusElement.textContent = statusText;
        statusElement.title = statusText;
        statusElement.classList.remove('autonomous__status--fresh');

        // Reading the layout makes the browser forget the finished animation, so adding the class plays it again.
        void statusElement.offsetWidth;
        statusElement.classList.add('autonomous__status--fresh');
    }

    // List the scenarios and count them; their box keeps its size and scroll position while the list changes.
    view.querySelector('[data-part="scenarios"]').innerHTML = getScenarioListMarkup(run.scenarios, SCENARIOS_EMPTY_TEXT);
    view.querySelector('[data-part="scenario-count"]').textContent = getScenarioCountText(run.scenarios);

    // Stop works only while the agent runs.
    const stopButton = view.querySelector('[data-action="stop"]');
    const isStoppable = run.state.phase === 'running';

    stopButton.disabled = !isStoppable;

    // Say that the stop is under way until the host reports the end.
    const stopText = run.state.phase === 'stopping'
        ? ' Stopping…'
        : ' Stop';

    stopButton.lastChild.textContent = stopText;
}

/**
 * Enables Start only when the run can start, and says why when it cannot.
 */
function updateStartButton() {
    const view = globalThis.STATE.view;
    const startButton = view?.querySelector('[data-action="start"]');
    const startNote = view?.querySelector('[data-part="start-note"]');
    const isFormMissing = !startButton || !startNote;

    // Only the form has Start.
    if (isFormMissing) {
        return;
    }

    // The reason shows beside the button and as its tooltip; an empty reason enables it.
    const issue = getStartIssue();
    const startTitle = issue === ''
        ? 'Start the autonomous exploratory run'
        : issue;

    startButton.disabled = issue !== '';
    startButton.title = startTitle;
    startNote.textContent = issue;
}

// Initial render.
startAutonomous();
