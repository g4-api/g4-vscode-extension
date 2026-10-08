/*
 * G4(TM) Automation Report component.
 *
 * Renders an automation result (or an automation request) that the extension host injects through
 * #g4-data. The page shows the report header, then one block per session: summary cards, an error
 * summary, the plugin tree, the execution timeline (a waterfall trace view), and the assertions.
 * A request payload gets a rule tree and an order-only timeline instead, because it has not run yet.
 *
 * Host contract (show-report.ts):
 * - Injected #g4-data: the decoded report JSON (a G4 response with sessions, or a G4 request).
 * - Rendered into #g4-header (the page header) and #app (the report body).
 * - No messages are exchanged with the host.
 *
 * Interactive elements carry data-report-action (what a click, key, or input does) and
 * data-report-target (the id of the element it changes); one delegated listener per event type on
 * #app performs the action, so the markup holds no inline handlers.
 */

// Chevron markup shared by every collapsible row; CSS shows the right or down arrow from the open modifier.
const CHEVRON_ICONS_HTML = `
<svg class="automation-report-chevron__right" height="13" viewBox="0 0 640 640" width="13" xmlns="http://www.w3.org/2000/svg">
    <path fill="currentColor" d="M441.3 299.8C451.5 312.4 450.8 330.9 439.1 342.6L311.1 470.6C301.9 479.8 288.2 482.5 276.2 477.5C264.2 472.5 256.5 460.9 256.5 448L256.5 192C256.5 179.1 264.3 167.4 276.3 162.4C288.3 157.4 302 160.2 311.2 169.3L439.2 297.3L441.4 299.7z"/>
</svg>
<svg class="automation-report-chevron__down" height="13" viewBox="0 0 640 640" width="13" xmlns="http://www.w3.org/2000/svg">
    <path fill="currentColor" d="M300.3 440.8C312.9 451 331.4 450.3 343.1 438.6L471.1 310.6C480.3 301.4 483 287.7 478 275.7C473 263.7 461.4 256 448.5 256L192.5 256C179.6 256 167.9 263.8 162.9 275.8C157.9 287.8 160.7 301.5 169.9 310.6L297.9 438.6L300.3 440.8z"/>
</svg>`;

// Class that hides a collapsed section, plugin child list, timeline child list, or stack trace row.
const COLLAPSED_CLASS = 'automation-report-collapsed';

// Class that hides a plugin node the tree filter does not match.
const FILTER_HIDDEN_CLASS = 'automation-report-filter-hidden';

// Number of the slowest plugins per job that the plugin tree marks as hot.
const HOT_PLUGIN_COUNT = 3;

// Maximum characters shown for a plugin argument and target element in the plugin tree row.
const MAXIMUM_ARGUMENT_CHARACTERS = 55;
const MAXIMUM_ELEMENT_CHARACTERS = 40;

// Maximum characters of a plugin description used as the plugin row tooltip.
const MAXIMUM_TOOLTIP_CHARACTERS = 200;

// .NET ticks per millisecond (a tick is 100 nanoseconds).
const TICKS_PER_MILLISECOND = 10000;

// Counter behind every generated element id (plugin nodes, sections, stack traces, timelines).
// Module-level because ids must stay unique across all sessions rendered into one page, and the
// writers that need them are independent compute-only functions.
globalThis.REPORT_ELEMENT_COUNT = 0;

/**
 * Converts an ISO date/time into a local medium date and time text.
 *
 * @param {unknown} isoText - The ISO date/time value.
 * @returns {string} The local date/time text, or '-' when the value is missing or invalid.
 */
function convertToDateTimeText(isoText) {
    // A missing or unparsable value shows a dash rather than "Invalid Date".
    const time = convertToTime(isoText);

    if (Number.isNaN(time)) {
        return '-';
    }

    return new Date(time).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'medium' });
}

/**
 * Converts a duration in .NET ticks into a readable text: seconds from 1 s, whole milliseconds from
 * 1 ms, and "< 1 ms" below that.
 *
 * @param {unknown} ticks - Duration in .NET ticks.
 * @returns {string} The duration text, or '-' when the value is not a finite number.
 */
function convertToDurationText(ticks) {
    // A missing or non-numeric duration shows a dash.
    const isNumber = typeof ticks === 'number' && Number.isFinite(ticks);

    if (!isNumber) {
        return '-';
    }

    // Choose the unit by size so short and long actions both read naturally.
    const milliseconds = convertToMilliseconds(ticks);

    if (milliseconds >= 1000) {
        return `${(milliseconds / 1000).toFixed(2)} s`;
    }

    if (milliseconds >= 1) {
        return `${milliseconds.toFixed(0)} ms`;
    }

    return '< 1 ms';
}

/**
 * Converts any value into text that is safe inside HTML text and double-quoted attributes.
 *
 * @remarks
 * Compute-only. The value is first turned into text by convertToText (so an object shows as JSON,
 * never as "[object Object]"), then &, <, >, and " are escaped.
 *
 * @param {unknown} value - The value to render.
 * @returns {string} The escaped text.
 */
function convertToEscapedHtml(value) {
    // Escape the ampersand first so the entities added next are not escaped again.
    return convertToText(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;');
}

/**
 * Converts .NET ticks into milliseconds.
 *
 * @param {number} ticks - The tick value.
 * @returns {number} The equivalent milliseconds.
 */
function convertToMilliseconds(ticks) {
    return ticks / TICKS_PER_MILLISECOND;
}

/**
 * Converts any value into display text without default object stringification.
 *
 * @remarks
 * Compute-only. Report values come from engine JSON, so a field such as an assertion's Actual value
 * can be an object or array; it is shown as JSON instead of "[object Object]".
 *
 * @param {unknown} value - The value to convert.
 * @returns {string} The text: '' for null or undefined, the string itself, a primitive's text, or JSON.
 */
function convertToText(value) {
    // Nothing to show for a missing value.
    if (value === null || value === undefined) {
        return '';
    }

    if (typeof value === 'string') {
        return value;
    }

    // Numbers, booleans, and big integers have a meaningful text form.
    const isPrimitive = ['bigint', 'boolean', 'number'].includes(typeof value);

    if (isPrimitive) {
        return `${value}`;
    }

    // Objects and arrays are shown as JSON; values JSON cannot represent (functions, symbols) show nothing.
    try {
        return JSON.stringify(value) ?? '';
    } catch {
        return '';
    }
}

/**
 * Converts an ISO date/time text into milliseconds since the epoch.
 *
 * @remarks
 * Shared by the date/time texts and the timeline. Only text is parsed, so an object or number from
 * the report never reaches the Date parser.
 *
 * @param {unknown} isoText - The ISO date/time value.
 * @returns {number} The time in milliseconds, or NaN when the value is missing or not a valid date.
 */
function convertToTime(isoText) {
    if (typeof isoText !== 'string') {
        return Number.NaN;
    }

    return new Date(isoText).getTime();
}

/**
 * Converts an ISO date/time into a 24-hour local time with milliseconds (HH:MM:SS.mmm).
 *
 * @param {unknown} isoText - The ISO date/time value.
 * @returns {string} The local time text, or '-' when the value is missing or invalid.
 */
function convertToTimeText(isoText) {
    // A missing or unparsable value shows a dash rather than "Invalid Date".
    const time = convertToTime(isoText);

    if (Number.isNaN(time)) {
        return '-';
    }

    return new Date(time).toLocaleTimeString('en-US', {
        fractionalSecondDigits: 3,
        hour: '2-digit',
        hour12: false,
        minute: '2-digit',
        second: '2-digit'
    });
}

/**
 * Converts a value into text cut to a maximum length, with "..." appended when it was longer.
 *
 * @param {unknown} value - The value to shorten.
 * @param {number} maximumLength - The number of characters kept before the ellipsis.
 * @returns {string} The original or shortened text.
 */
function convertToTruncatedText(value, maximumLength) {
    const text = convertToText(value);

    return text.length > maximumLength
        ? `${text.slice(0, maximumLength)}...`
        : text;
}

/**
 * Collects every assertion (extraction entity) from a plugin tree into a flat list.
 *
 * @remarks
 * Compute-only: walks the tree recursively and returns new objects; the report data is not changed.
 *
 * @param {Array<object>|null|undefined} plugins - The plugins to scan, children included.
 * @returns {Array<{ content: object, onElement: string, session: object|undefined }>} The assertions.
 */
function getAssertions(plugins) {
    const assertions = [];

    // Visit every plugin, its extractions, and their entities, then descend into the children.
    for (const plugin of (plugins || [])) {
        for (const extraction of (plugin?.extractions || [])) {
            for (const entity of (extraction?.entities || [])) {
                assertions.push({
                    content: entity?.content || {},
                    onElement: plugin?.rule?.onElement || '',
                    session: extraction?.session
                });
            }
        }

        assertions.push(...getAssertions(plugin?.plugins));
    }

    return assertions;
}

/**
 * Resolves a plugin's status from its exceptions: passed without exceptions, timeout when any
 * exception type mentions a timeout, otherwise error.
 *
 * @remarks
 * Shared by the plugin tree and the execution timeline so both color an action the same way.
 *
 * @param {Array<object>} exceptions - The plugin's exceptions.
 * @returns {'passed'|'timeout'|'error'} The status.
 */
function getExceptionStatus(exceptions) {
    if (exceptions.length === 0) {
        return 'passed';
    }

    // A timeout is reported separately because it usually means a slow page, not a broken step.
    const isTimeout = exceptions.some((exception) => {
        const isTypeText = typeof exception?.type === 'string';

        return isTypeText && exception.type.includes('Timeout');
    });

    return isTimeout
        ? 'timeout'
        : 'error';
}

/**
 * Flattens a plugin tree into one list: each plugin followed by its descendants.
 *
 * @param {Array<object>|null|undefined} plugins - The plugins to flatten.
 * @returns {Array<object>} Every plugin in the tree, in document order.
 */
function getFlattenedPlugins(plugins) {
    const flattened = [];

    for (const plugin of (plugins || [])) {
        flattened.push(plugin, ...getFlattenedPlugins(plugin?.plugins));
    }

    return flattened;
}

/**
 * Returns the plural suffix for a count: the suffix for every count except exactly one.
 *
 * @param {number} count - The counted items.
 * @param {string} [pluralSuffix='s'] - The suffix to use ('s', 'es').
 * @returns {string} The suffix, or '' for a count of one.
 */
function getPluralSuffix(count, pluralSuffix = 's') {
    return count === 1
        ? ''
        : pluralSuffix;
}

/**
 * Creates a unique element id for generated markup.
 *
 * @remarks
 * Uses the module-level counter globalThis.REPORT_ELEMENT_COUNT so ids stay unique across sessions.
 *
 * @param {string} prefix - A short prefix that tells the element kind apart in the DOM.
 * @returns {string} The new id.
 */
function newElementId(prefix) {
    globalThis.REPORT_ELEMENT_COUNT++;

    return `${prefix}-${globalThis.REPORT_ELEMENT_COUNT}`;
}

/**
 * Performs the click action of the element under the pointer: toggling a plugin, a stage/job/stack
 * trace section, or a timeline row, or expanding/collapsing a whole timeline.
 *
 * @param {MouseEvent} event - The click event delegated from #app.
 */
function onAppClick(event) {
    // Find the nearest element that declares an action; clicks elsewhere are ignored.
    const actionElement = event.target instanceof Element
        ? event.target.closest('[data-report-action]')
        : null;

    if (!actionElement) {
        return;
    }

    // Run the declared action against the element it targets.
    const action = actionElement.getAttribute('data-report-action');
    const targetId = actionElement.getAttribute('data-report-target') || '';

    switch (action) {
        case 'toggle-plugin':
            updatePluginExpansion(targetId);
            break;
        case 'toggle-section':
            updateSectionExpansion(targetId);
            break;
        case 'toggle-timeline-row':
            updateTimelineRowExpansion(actionElement.id);
            break;
        case 'expand-timeline':
            setTimelineExpansion(targetId, true);
            break;
        case 'collapse-timeline':
            setTimelineExpansion(targetId, false);
            break;
        default:
            break;
    }
}

/**
 * Applies the plugin tree filter while the user types in a tree's filter box.
 *
 * @param {InputEvent} event - The input event delegated from #app.
 */
function onAppInput(event) {
    // Only the tree filter boxes declare this action.
    const input = event.target;
    const isFilterInput = input instanceof HTMLInputElement
        && input.getAttribute('data-report-action') === 'filter-tree';

    if (!isFilterInput) {
        return;
    }

    updateTreeFilter(input.getAttribute('data-report-target') || '', input.value);
}

/**
 * Toggles a focused timeline row with Enter or Space, so the timeline tree works from the keyboard.
 *
 * @param {KeyboardEvent} event - The keydown event delegated from #app.
 */
function onAppKeyDown(event) {
    // Only Enter and Space on a timeline row toggle it; Tab and arrow keys keep their normal behavior.
    const row = event.target instanceof Element
        ? event.target.closest('[data-report-action="toggle-timeline-row"]')
        : null;
    const isToggleKey = event.key === 'Enter' || event.key === ' ';

    if (!row || !isToggleKey) {
        return;
    }

    // Keep Space from scrolling the report while it toggles the row.
    event.preventDefault();
    updateTimelineRowExpansion(row.id);
}

/**
 * Resolves which kind of payload was injected and which object is its root.
 *
 * Supported shapes:
 * - Response: the object contains `sessions`.
 * - Wrapped response: the first property value contains `sessions`.
 * - Request: the object contains `stages[0].jobs[0].rules`.
 * - Unknown: anything else.
 *
 * @param {object|null|undefined} data - The parsed payload.
 * @returns {{ type: 'response'|'request'|'unknown', root: object }} The payload kind and its root.
 */
function resolveSchema(data) {
    if (data?.sessions) {
        return { root: data, type: 'response' };
    }

    // Some responses are wrapped under a dynamic top-level key such as an automation id.
    const firstValue = Object.values(data || {})[0];

    if (firstValue?.sessions) {
        return { root: firstValue, type: 'response' };
    }

    if (data?.stages?.[0]?.jobs?.[0]?.rules) {
        return { root: data, type: 'request' };
    }

    return { root: data || {}, type: 'unknown' };
}

/**
 * Expands or collapses every expandable row of one execution timeline.
 *
 * @remarks
 * Called by the timeline's Expand all / Collapse all buttons. It changes only DOM state owned by that
 * timeline: the children containers, the rows' aria-expanded value, and the chevrons.
 *
 * @param {string} timelineId - The id of the timeline root element.
 * @param {boolean} isExpanded - True to expand every row; false to collapse every row.
 */
function setTimelineExpansion(timelineId, isExpanded) {
    // Resolve the timeline so only its rows change, not another session's timeline.
    const timeline = document.getElementById(timelineId);

    if (!timeline) {
        return;
    }

    // Apply the requested state to every expandable row so the whole tree opens or closes at once.
    const rows = timeline.querySelectorAll('.automation-report-timeline__row[aria-expanded]');

    for (const row of rows) {
        setTimelineRowExpansion(row, isExpanded);
    }
}

/**
 * Sets the expanded state of one timeline row: its children container, aria-expanded, and chevron.
 *
 * @remarks
 * Shared by the row toggle and the Expand all / Collapse all buttons so both keep the three pieces of
 * state in step. The row's aria-controls names its children container.
 *
 * @param {Element} row - The expandable timeline row.
 * @param {boolean} isExpanded - True to show the row's children; false to hide them.
 */
function setTimelineRowExpansion(row, isExpanded) {
    // Resolve the children container this row controls; a row without one has nothing to change.
    const children = document.getElementById(row.getAttribute('aria-controls') || '');

    if (!children) {
        return;
    }

    // Show or hide the children, record the state for assistive technology, and turn the chevron.
    children.classList.toggle(COLLAPSED_CLASS, !isExpanded);
    row.setAttribute('aria-expanded', `${isExpanded}`);
    row.querySelector('.automation-report-chevron')?.classList.toggle('automation-report-chevron--open', isExpanded);
}

/**
 * Renders the page: the request view, the no-data view, or the header and one block per session.
 *
 * @remarks
 * Owns the page's DOM writes: #g4-header and #app are replaced, and the delegated listeners are
 * attached to #app once. Called once when the script loads.
 */
function startReport() {
    // Renders a request payload: its driver and browser in the header, and the request view below.
    const showRequestView = (root) => {
        const driver = root.driverParameters?.driver || '-';
        const browser = root.driverParameters?.capabilities?.alwaysMatch?.browserName || '-';

        headerElement.innerHTML = `
        <g4-page-header meta="${convertToEscapedHtml(driver)} &bull; ${convertToEscapedHtml(browser)}"
                        page-title="G4&#x2122; Request Configuration"
                        test-id="request-configuration-header">
            <span class="automation-report-tag" data-test-id="request-configuration-kind-tag">Request</span>
        </g4-page-header>`;
        appElement.innerHTML = `<div class="automation-report-main" data-test-id="request-configuration-main">${writeRequestView(root)}</div>`;
    };

    // Renders the fallback for a payload that is neither a response with sessions nor a request.
    const showNoDataView = () => {
        headerElement.innerHTML = `
        <g4-page-header meta="No session data found"
                        page-title="G4&#x2122; Automation Report"
                        test-id="automation-report-header"></g4-page-header>`;
        appElement.innerHTML = `
        <div class="automation-report-main" data-test-id="automation-report-main">
            <div class="automation-report-error" data-test-id="automation-report-unrecognized-format-message">
                <div class="automation-report-error__title">Unrecognized format</div>
                <div class="automation-report-error__description">Expected a G4 response with <code class="automation-report-error__code">sessions</code> and <code class="automation-report-error__code">responseTree</code> keys.</div>
            </div>
        </div>`;
    };

    // Resolve the page containers and wire the delegated listeners once, before any markup exists.
    const headerElement = document.getElementById('g4-header');
    const appElement = document.getElementById('app');

    appElement.addEventListener('click', onAppClick);

    appElement.addEventListener('input', onAppInput);

    appElement.addEventListener('keydown', onAppKeyDown);

    // Read the injected payload and decide which view it needs.
    const data = JSON.parse(document.getElementById('g4-data').value);
    const schema = resolveSchema(data);

    if (schema.type === 'request') {
        showRequestView(schema.root);
        return;
    }

    const sessions = schema.root.sessions || {};
    const sessionIds = Object.keys(sessions);

    if (sessionIds.length === 0) {
        showNoDataView();
        return;
    }

    // The automation name shown in the header is stored on the first stage of the first session.
    const firstStages = sessions[sessionIds[0]]?.responseTree?.stages || [];
    const automationReference = firstStages[0]?.automationReference || {};

    // Render the header and every session, separated by a divider.
    const sessionsHtml = sessionIds
        .map(sessionId => writeSession(sessionId, sessions[sessionId] || {}))
        .join('<div class="automation-report-session-divider"></div>');

    headerElement.innerHTML = writeHeader(automationReference, schema.root.performancePoint || {});
    appElement.innerHTML = `<div class="automation-report-main" data-test-id="automation-report-main">${sessionsHtml}</div>`;
}

/**
 * Expands or collapses a plugin's child list and turns its chevron.
 *
 * @param {string} nodeId - The id of the plugin node.
 */
function updatePluginExpansion(nodeId) {
    // A plugin without children has no list to toggle.
    const children = document.getElementById(`${nodeId}-children`);

    if (!children) {
        return;
    }

    // Flip the list and keep the chevron in step with it.
    const isExpanded = children.classList.toggle(COLLAPSED_CLASS) === false;

    document.getElementById(`${nodeId}-chevron`)?.classList.toggle('automation-report-chevron--open', isExpanded);
}

/**
 * Expands or collapses a section (a stage, a job, or an exception's stack trace) and turns its chevron.
 *
 * @param {string} sectionId - The id of the section body.
 */
function updateSectionExpansion(sectionId) {
    const section = document.getElementById(sectionId);

    if (!section) {
        return;
    }

    // Flip the section and keep its chevron in step with it.
    const isExpanded = section.classList.toggle(COLLAPSED_CLASS) === false;

    document.getElementById(`${sectionId}-chevron`)?.classList.toggle('automation-report-chevron--open', isExpanded);
}

/**
 * Toggles one timeline row between expanded and collapsed.
 *
 * @param {string} rowId - The id of the expandable timeline row.
 */
function updateTimelineRowExpansion(rowId) {
    const row = document.getElementById(rowId);

    if (!row) {
        return;
    }

    const isExpanded = row.getAttribute('aria-expanded') === 'true';

    setTimelineRowExpansion(row, !isExpanded);
}

/**
 * Filters a plugin tree by name, keeping the branches that lead to a match visible and expanded.
 *
 * @remarks
 * Nodes are visited from the leaves up (reverse document order), so a parent can see whether any of
 * its descendants is still visible before deciding its own visibility.
 *
 * @param {string} treeId - The id of the tree root.
 * @param {string} query - The text typed in the filter box.
 */
function updateTreeFilter(treeId, query) {
    const tree = document.getElementById(treeId);

    if (!tree) {
        return;
    }

    // Match case-insensitively; an empty query shows everything.
    const normalizedQuery = query.trim().toLowerCase();
    const nodes = Array.from(tree.querySelectorAll('.automation-report-plugin')).reverse();

    for (const node of nodes) {
        // A node stays visible when the query is empty, it matches, or a descendant is still visible.
        const isMatch = (node.getAttribute('data-name') || '').includes(normalizedQuery);
        const isDescendantVisible = Array
            .from(node.querySelectorAll('.automation-report-plugin'))
            .some(descendant => !descendant.classList.contains(FILTER_HIDDEN_CLASS));
        const isVisible = normalizedQuery === '' || isMatch || isDescendantVisible;

        node.classList.toggle(FILTER_HIDDEN_CLASS, !isVisible);

        // Open the path to a matching descendant so the match is on screen.
        const isOpenPath = normalizedQuery !== '' && isDescendantVisible;
        const children = node.querySelector(':scope > .automation-report-plugin__children');

        if (!isOpenPath || !children) {
            continue;
        }

        children.classList.remove(COLLAPSED_CLASS);
        document.getElementById(`${node.id}-chevron`)?.classList.add('automation-report-chevron--open');
    }
}

/**
 * Renders the assertion results table: element, condition, operator, expected and actual values,
 * the result dot (passed, failed, or unknown), and the reason phrase.
 *
 * @param {Array<object>} assertions - The assertions to render.
 * @returns {string} HTML markup for the table, or an empty-state message.
 */
function writeAssertions(assertions) {
    if (assertions.length === 0) {
        return '<div class="automation-report-empty-state" data-test-id="assertions-empty-message">No assertion data found.</div>';
    }

    // One row per assertion; the result dot reflects the evaluation (true, false, or anything else).
    const rowsHtml = assertions.map((assertion) => {
        const content = assertion.content || {};
        let status = 'unknown';

        if (content.Evaluation === true) {
            status = 'passed';
        }

        if (content.Evaluation === false) {
            status = 'error';
        }

        return `
        <tr data-test-id="assertion-row">
            <td class="automation-report-monospace">${convertToEscapedHtml(assertion.onElement || '-')}</td>
            <td class="automation-report-monospace">${convertToEscapedHtml(content.Condition || '-')}</td>
            <td class="automation-report-monospace">${convertToEscapedHtml(content.Operator || '-')}</td>
            <td class="automation-report-monospace">${convertToEscapedHtml(content.Expected ?? '-')}</td>
            <td class="automation-report-monospace">${convertToEscapedHtml(content.Actual ?? '-')}</td>
            <td class="automation-report-table__cell--center">${writeStatusDot(status)}</td>
            <td class="automation-report-table__reason">${convertToEscapedHtml(content.ReasonPhrase || '-')}</td>
        </tr>`;
    }).join('');

    return `
    <table class="automation-report-table" data-test-id="assertions-table">
        <thead>
            <tr>
                <th>Element</th>
                <th>Condition</th>
                <th>Operator</th>
                <th>Expected</th>
                <th>Actual</th>
                <th>Result</th>
                <th>Reason Phrase</th>
            </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
    </table>`;
}

/**
 * Renders the session summary cards: total runtime, average action time, total actions, exceptions,
 * failed assertions, and the time lost to timeouts.
 *
 * @param {object} performancePoint - The session performance point.
 * @param {Array<object>} stages - The session stages.
 * @returns {string} HTML markup for the cards.
 */
function writeCards(performancePoint, stages) {
    // Collect the plugins and assertions of every job, children included.
    const jobs = stages.flatMap(stage => stage.jobs || []);
    const plugins = jobs.flatMap(job => getFlattenedPlugins(job.plugins));
    const failedAssertionCount = jobs
        .flatMap(job => getAssertions(job.plugins))
        .filter(assertion => assertion.content?.Evaluation === false)
        .length;
    const exceptionCount = plugins.reduce((total, plugin) => total + (plugin.exceptions || []).length, 0);

    // Average time per action, and the total run time of actions that timed out.
    const isAverageAvailable = plugins.length > 0 && typeof performancePoint.runTime === 'number';
    const averageRunTime = isAverageAvailable
        ? performancePoint.runTime / plugins.length
        : null;
    const timeoutRunTime = plugins
        .filter(plugin => getExceptionStatus(plugin.exceptions || []) === 'timeout')
        .reduce((total, plugin) => total + (plugin.performancePoint?.runTime || 0), 0);
    const timeoutText = timeoutRunTime > 0
        ? convertToDurationText(timeoutRunTime)
        : '-';

    // Render the cards in display order, each with an escaped label and value.
    const cards = [
        { label: 'Total Runtime', value: convertToDurationText(performancePoint.runTime) },
        { label: 'Avg. Action Time', value: convertToDurationText(averageRunTime) },
        { label: 'Total Actions', value: `${plugins.length}` },
        { label: 'Total Exceptions', value: `${exceptionCount}` },
        { label: 'Failed Assertions', value: `${failedAssertionCount}` },
        { label: 'Total Timeouts', value: timeoutText }
    ];

    const cardsHtml = cards.map(card => `
        <div class="automation-report-card" data-test-id="summary-card">
            <div class="automation-report-card__label">${convertToEscapedHtml(card.label)}</div>
            <div class="automation-report-card__value">${convertToEscapedHtml(card.value)}</div>
        </div>`).join('');

    return `<div class="automation-report-cards" data-test-id="summary-cards">${cardsHtml}</div>`;
}

/**
 * Renders a chevron that a collapsible row turns between right (collapsed) and down (expanded).
 *
 * @param {{ id?: string, isOpen: boolean }} options - The chevron id (for rows toggled by id) and its state.
 * @returns {string} HTML markup for the chevron.
 */
function writeChevron({ id, isOpen }) {
    const openClass = isOpen
        ? ' automation-report-chevron--open'
        : '';
    const idAttribute = id
        ? ` id="${id}"`
        : '';

    return `<i${idAttribute} class="automation-report-chevron${openClass}" aria-hidden="true">${CHEVRON_ICONS_HTML}</i>`;
}

/**
 * Renders a section-header count badge, such as "2 failed", with a status dot.
 *
 * @param {'passed'|'error'} status - The dot color.
 * @param {string} text - The count text.
 * @returns {string} HTML markup for the badge, placed in the section header slot.
 */
function writeCount(status, text) {
    return `<span class="automation-report-count" data-slot="header" data-test-id="${status}-count">${writeStatusDot(status)}${convertToEscapedHtml(text)}</span>`;
}

/**
 * Renders the error summary section: the failed assertions table, the exceptions table, and their counts.
 *
 * @param {{ assertions: Array<object>, exceptions: Array<object>, sessionId: string }} options -
 *     The failed assertions, the exceptions, and the escaped session id used in the test id.
 * @returns {string} HTML markup for the section.
 */
function writeErrorSummary({ assertions, exceptions, sessionId }) {
    // One row per failed assertion and per exception.
    const assertionRowsHtml = assertions.map((assertion) => {
        const content = assertion.content || {};

        return `
        <tr data-test-id="failed-assertion-row">
            <td class="automation-report-monospace">${convertToEscapedHtml(assertion.onElement || '-')}</td>
            <td class="automation-report-monospace">${convertToEscapedHtml(content.Condition || '-')}</td>
            <td class="automation-report-monospace">${convertToEscapedHtml(content.Operator || '-')}</td>
            <td class="automation-report-monospace">${convertToEscapedHtml(content.Expected ?? '-')}</td>
            <td class="automation-report-monospace">${convertToEscapedHtml(content.Actual ?? '-')}</td>
            <td class="automation-report-table__reason">${convertToEscapedHtml(content.ReasonPhrase || '-')}</td>
        </tr>`;
    }).join('');
    const exceptionRowsHtml = exceptions.map(exception => `
        <tr data-test-id="exception-row">
            <td class="automation-report-monospace">${convertToEscapedHtml(exception.pluginName || '?')}</td>
            <td class="automation-report-monospace">${convertToEscapedHtml(exception.type || '-')}</td>
            <td>${convertToEscapedHtml(exception.exception?.Message || '-')}</td>
            <td class="automation-report-table__reason">${convertToEscapedHtml(exception.reasonPhrase || '-')}</td>
        </tr>`).join('');

    // Show each table only when it has rows; the exceptions label gets extra space after assertions.
    const assertionsHtml = assertions.length > 0
        ? `
        <div class="automation-report-error-summary__label automation-report-meta-text">Failed Assertions</div>
        <table class="automation-report-table" data-test-id="failed-assertions-table">
            <thead>
                <tr>
                    <th>Element</th>
                    <th>Condition</th>
                    <th>Operator</th>
                    <th>Expected</th>
                    <th>Actual</th>
                    <th>Reason</th>
                </tr>
            </thead>
            <tbody>${assertionRowsHtml}</tbody>
        </table>`
        : '';
    const separatedClass = assertions.length > 0
        ? ' automation-report-error-summary__label--separated'
        : '';
    const exceptionsHtml = exceptions.length > 0
        ? `
        <div class="automation-report-error-summary__label automation-report-meta-text${separatedClass}">Exceptions</div>
        <table class="automation-report-table" data-test-id="exceptions-table">
            <thead>
                <tr>
                    <th>Plugin</th>
                    <th>Type</th>
                    <th>Message</th>
                    <th>Reason</th>
                </tr>
            </thead>
            <tbody>${exceptionRowsHtml}</tbody>
        </table>`
        : '';

    // Count badges for the section header.
    const countsHtml = [];

    if (assertions.length > 0) {
        countsHtml.push(writeCount('error', `${assertions.length} failed`));
    }

    if (exceptions.length > 0) {
        countsHtml.push(writeCount('error', `${exceptions.length} exception${getPluralSuffix(exceptions.length)}`));
    }

    return `
    <g4-section class="automation-report-section automation-report-section--spaced"
                open
                section-title="Error Summary"
                test-id="error-summary-${sessionId}-section">
        ${countsHtml.join('')}
        ${assertionsHtml}${exceptionsHtml}
    </g4-section>`;
}

/**
 * Renders a plugin's exceptions table, indented to the plugin's depth, with an expandable stack
 * trace row for each exception that has one.
 *
 * @param {Array<object>} exceptions - The plugin's exceptions.
 * @param {number} depth - The plugin's depth in the tree.
 * @returns {string} HTML markup for the table.
 */
function writeExceptions(exceptions, depth) {
    const rowsHtml = exceptions.map((exception) => {
        // A stack trace gets a toggle cell and a collapsed row below the exception.
        const stackTrace = exception.exception?.StackTrace || '';
        const stackId = newElementId('stack');
        const toggleCellHtml = stackTrace
            ? `
            <td class="automation-report-table__stack-toggle"
                title="Show or hide the stack trace"
                data-report-action="toggle-section"
                data-report-target="${stackId}"
                data-test-id="exception-stack-trace-toggle">
                ${writeChevron({ id: `${stackId}-chevron`, isOpen: false })}
            </td>`
            : '<td>-</td>';
        const stackRowHtml = stackTrace
            ? `<tr id="${stackId}" class="${COLLAPSED_CLASS}"><td colspan="5"><pre class="automation-report-exception-stack">${convertToEscapedHtml(stackTrace)}</pre></td></tr>`
            : '';

        return `
        <tr data-test-id="plugin-exception-row">
            <td class="automation-report-monospace">${convertToEscapedHtml(exception.pluginName || '?')}</td>
            <td class="automation-report-monospace">${convertToEscapedHtml(exception.type || '-')}</td>
            <td>${convertToEscapedHtml(exception.exception?.Message || '-')}</td>
            <td class="automation-report-table__reason">${convertToEscapedHtml(exception.reasonPhrase || '-')}</td>
            ${toggleCellHtml}
        </tr>${stackRowHtml}`;
    }).join('');

    // The table is indented by the plugin depth so it sits under its plugin row.
    return `
    <div class="automation-report-plugin-exceptions"
         style="--automation-report-plugin-depth: ${depth}"
         data-test-id="plugin-exceptions">
        <table class="automation-report-table">
            <thead>
                <tr>
                    <th>Plugin</th>
                    <th>Type</th>
                    <th>Message</th>
                    <th>Reason</th>
                    <th>Stack Trace</th>
                </tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
        </table>
    </div>`;
}

/**
 * Renders the report page header: the automation name and its start date/time.
 *
 * @param {object} automationReference - The automation reference of the first stage.
 * @param {object} performancePoint - The report's root performance point.
 * @returns {string} HTML markup for the header.
 */
function writeHeader(automationReference, performancePoint) {
    const name = automationReference?.name || 'Untitled Automation';
    const startText = convertToDateTimeText(performancePoint?.start);

    return `
    <g4-page-header meta="${convertToEscapedHtml(name)} &bull; ${convertToEscapedHtml(startText)}"
                    page-title="G4&#x2122; Automation Report"
                    test-id="automation-report-header"></g4-page-header>`;
}

/**
 * Renders one plugin row of the plugin tree and, recursively, its children.
 *
 * Behavior:
 * - Shows a chevron when the plugin has children (collapsed at first), a status dot, the display name,
 *   the argument and target element, a runtime bar relative to the parent, and the duration.
 * - Marks the duration as hot when the plugin is one of the job's slowest.
 * - Shows the plugin's exceptions under the row.
 *
 * @param {object} plugin - The plugin to render.
 * @param {{ depth: number, parentRunTime: number, hotPluginIds: Set<string> }} options - The plugin's
 *     depth, its parent's (or job's) run time in ticks, and the ids of the job's slowest plugins.
 * @returns {string} HTML markup for the plugin node.
 */
function writePlugin(plugin, options) {
    const { depth, hotPluginIds, parentRunTime } = options;

    // Resolve what the row shows: identity, rule details, timing, and status.
    const nodeId = newElementId('plugin');
    const reference = plugin.performancePoint?.reference || {};
    const rule = plugin.rule || {};
    const displayName = rule.capabilities?.displayName || reference.name || rule.pluginName || '?';
    const runTime = plugin.performancePoint?.runTime || 0;
    const exceptions = plugin.exceptions || [];
    const children = plugin.plugins || [];
    const isExpandable = children.length > 0;
    const isHot = hotPluginIds.has(reference.id);

    // The runtime bar is the plugin's share of its parent's run time.
    const runTimePercent = parentRunTime > 0
        ? Math.min(100, (runTime / parentRunTime) * 100)
        : 0;

    // Optional parts of the row, each empty when the plugin does not have it.
    const chevronHtml = isExpandable
        ? writeChevron({ id: `${nodeId}-chevron`, isOpen: false })
        : '<span class="automation-report-plugin-row__toggle-spacer"></span>';
    const argumentHtml = rule.argument
        ? `<span class="automation-report-plugin-row__argument">&#x2022; ${convertToEscapedHtml(convertToTruncatedText(rule.argument, MAXIMUM_ARGUMENT_CHARACTERS))}</span>`
        : '';
    const elementHtml = rule.onElement
        ? `<span class="automation-report-plugin-row__element">&#x2022; ${convertToEscapedHtml(convertToTruncatedText(rule.onElement, MAXIMUM_ELEMENT_CHARACTERS))}</span>`
        : '';
    const hotClass = isHot
        ? ' automation-report-plugin-row__duration--hot'
        : '';
    const tooltip = reference.description
        ? convertToTruncatedText(reference.description, MAXIMUM_TOOLTIP_CHARACTERS)
        : '';
    const exceptionsHtml = exceptions.length > 0
        ? writeExceptions(exceptions, depth)
        : '';
    const childrenHtml = isExpandable
        ? `<div id="${nodeId}-children" class="automation-report-plugin__children ${COLLAPSED_CLASS}">${children.map(child => writePlugin(child, { depth: depth + 1, hotPluginIds, parentRunTime: runTime || parentRunTime })).join('')}</div>`
        : '';

    return `
    <div id="${nodeId}"
         class="automation-report-plugin"
         data-name="${convertToEscapedHtml(convertToText(displayName).toLowerCase())}"
         data-test-id="plugin-tree-node">
        <div class="automation-report-plugin-row"
             style="--automation-report-plugin-depth: ${depth}"
             title="${convertToEscapedHtml(tooltip)}"
             data-report-action="toggle-plugin"
             data-report-target="${nodeId}"
             data-test-id="plugin-tree-row">
            <div class="automation-report-plugin-row__toggle">${chevronHtml}</div>
            ${writeStatusDot(getExceptionStatus(exceptions))}
            <span class="automation-report-plugin-row__name">${convertToEscapedHtml(displayName)}</span>
            ${argumentHtml}
            ${elementHtml}
            <span class="automation-report-plugin-row__spacer"></span>
            <div class="automation-report-plugin-row__bar-track">
                <progress class="automation-report-plugin-row__runtime" max="100" value="${runTimePercent.toFixed(1)}"></progress>
            </div>
            <span class="automation-report-plugin-row__duration${hotClass}">${convertToDurationText(runTime)}</span>
        </div>
        ${exceptionsHtml}
        ${childrenHtml}
    </div>`;
}

/**
 * Renders an order-only timeline for a request: one row per rule, each in its own equal slot,
 * because a request has not run and has no timing yet.
 *
 * @param {Array<object>|null|undefined} stages - The request stages.
 * @returns {string} HTML markup for the timeline, or an empty-state message.
 */
function writeRequestTimeline(stages) {
    const rules = (stages || [])
        .flatMap(stage => stage.jobs || [])
        .flatMap(job => job.rules || []);

    if (rules.length === 0) {
        return '<div class="automation-report-empty-state" data-test-id="request-timeline-empty-message">No actions to display.</div>';
    }

    // Each rule occupies its own slot of equal width, in request order.
    const slotPercent = 100 / rules.length;
    const rowsHtml = rules.map((rule, ruleIndex) => {
        const name = rule.capabilities?.displayName || rule.pluginName || '?';

        return `
        <div class="automation-report-timeline__row"
             style="--automation-report-timeline-depth: 0"
             title="${convertToEscapedHtml(name)}"
             data-test-id="request-timeline-row">
            <div class="automation-report-timeline__name">
                <span class="automation-report-timeline__label">${convertToEscapedHtml(name)}</span>
            </div>
            <div class="automation-report-timeline__track">
                <span class="automation-report-timeline__bar automation-report-timeline__bar--solid automation-report-timeline__bar--passed"
                      style="--automation-report-timeline-bar-start: ${(ruleIndex * slotPercent).toFixed(3)}%; --automation-report-timeline-bar-width: ${slotPercent.toFixed(3)}%"></span>
            </div>
            <div class="automation-report-timeline__duration">#${ruleIndex + 1}</div>
        </div>`;
    }).join('');

    return `
    <div class="automation-report-timeline" data-test-id="request-timeline">
        <div class="automation-report-timeline__viewport" data-test-id="request-timeline-viewport">
            <div class="automation-report-timeline__axis" aria-hidden="true">
                <div class="automation-report-timeline__axis-name">Action</div>
                <div class="automation-report-timeline__axis-track"></div>
                <div class="automation-report-timeline__axis-duration">Order</div>
            </div>
            ${rowsHtml}
        </div>
    </div>`;
}

/**
 * Renders the request view: request-level cards, the rule tree grouped by stage and job, and the
 * order-only request timeline.
 *
 * @param {object} data - The request payload.
 * @returns {string} HTML markup for the request view.
 */
function writeRequestView(data) {
    // Renders one rule as a plugin-style row without timing.
    const writeRequestRule = (rule) => {
        const name = rule.capabilities?.displayName || rule.pluginName || '?';
        const argumentHtml = rule.argument
            ? `<span class="automation-report-plugin-row__argument">&#x2022; ${convertToEscapedHtml(convertToTruncatedText(rule.argument, MAXIMUM_ARGUMENT_CHARACTERS))}</span>`
            : '';
        const elementHtml = rule.onElement
            ? `<span class="automation-report-plugin-row__element">&#x2022; ${convertToEscapedHtml(convertToTruncatedText(rule.onElement, MAXIMUM_ELEMENT_CHARACTERS))}</span>`
            : '';

        return `
        <div class="automation-report-plugin-row" data-test-id="request-rule-row">
            <div class="automation-report-plugin-row__toggle"><span class="automation-report-plugin-row__toggle-spacer"></span></div>
            ${writeStatusDot('unknown')}
            <span class="automation-report-plugin-row__name">${convertToEscapedHtml(name)}</span>
            ${argumentHtml}
            ${elementHtml}
            <span class="automation-report-plugin-row__spacer"></span>
        </div>`;
    };

    // Renders one job header and its rules, expanded.
    const writeRequestJob = (job) => {
        const rules = job.rules || [];
        const jobBodyId = newElementId('request-job');

        return `
        <div class="automation-report-tree-job" data-test-id="request-job">
            <div class="automation-report-tree-job__header"
                 data-report-action="toggle-section"
                 data-report-target="${jobBodyId}"
                 data-test-id="request-job-header">
                ${writeChevron({ id: `${jobBodyId}-chevron`, isOpen: true })}
                ${convertToEscapedHtml(job.reference?.name || 'Job')}
                <span class="automation-report-meta-text">${rules.length} action${getPluralSuffix(rules.length)}</span>
            </div>
            <div id="${jobBodyId}">${rules.map(writeRequestRule).join('')}</div>
        </div>`;
    };

    // Renders one stage header and its jobs, expanded.
    const writeRequestStage = (stage) => {
        const jobs = stage.jobs || [];
        const stageBodyId = newElementId('request-stage');

        return `
        <div class="automation-report-tree-stage" data-test-id="request-stage">
            <div class="automation-report-tree-stage__header"
                 data-report-action="toggle-section"
                 data-report-target="${stageBodyId}"
                 data-test-id="request-stage-header">
                ${writeChevron({ id: `${stageBodyId}-chevron`, isOpen: true })}
                ${convertToEscapedHtml(stage.reference?.name || 'Stage')}
                <span class="automation-report-meta-text">${jobs.length} job${getPluralSuffix(jobs.length)}</span>
            </div>
            <div id="${stageBodyId}">${jobs.map(writeRequestJob).join('')}</div>
        </div>`;
    };

    // Count what the request contains.
    const stages = data.stages || [];
    const jobs = stages.flatMap(stage => stage.jobs || []);
    const rules = jobs.flatMap(job => job.rules || []);

    // Render the request cards; runtime values do not exist before a run, so they show a dash.
    const cards = [
        { label: 'Total Runtime', value: '-' },
        { label: 'Avg. Action Time', value: '-' },
        { label: 'Total Actions', value: `${rules.length}` },
        { label: 'Total Exceptions', value: '-' },
        { label: 'Failed Assertions', value: '-' },
        { label: 'Total Timeouts', value: '-' }
    ];
    const cardsHtml = cards.map(card => `
        <div class="automation-report-card" data-test-id="request-summary-card">
            <div class="automation-report-card__label">${convertToEscapedHtml(card.label)}</div>
            <div class="automation-report-card__value">${convertToEscapedHtml(card.value)}</div>
        </div>`).join('');

    // Summarize the counts in the rule tree header, then assemble the view.
    const countsText = `${stages.length} stage${getPluralSuffix(stages.length)} \u2022 ${jobs.length} job${getPluralSuffix(jobs.length)} \u2022 ${rules.length} action${getPluralSuffix(rules.length)}`;

    return `
    <div class="automation-report-cards automation-report-cards--request" data-test-id="request-summary-cards">${cardsHtml}</div>
    <g4-section open
                section-title="Rule Tree"
                test-id="rule-tree-section">
        <span class="automation-report-meta-text" data-slot="header">${convertToEscapedHtml(countsText)}</span>
        ${stages.map(writeRequestStage).join('')}
    </g4-section>
    <g4-section class="automation-report-section"
                open
                section-title="Execution Timeline"
                test-id="request-timeline-section">
        <span class="automation-report-meta-text" data-slot="header">${rules.length} action${getPluralSuffix(rules.length)}</span>
        ${writeRequestTimeline(stages)}
    </g4-section>`;
}

/**
 * Renders one session: its title and info strip, summary cards, error summary, plugin tree,
 * execution timeline, and assertions.
 *
 * @param {string} sessionId - The session id (a key of the sessions dictionary).
 * @param {object} session - The session result.
 * @returns {string} HTML markup for the session block.
 */
function writeSession(sessionId, session) {
    // Finds the first extraction session that names a machine, for the machine and IP fields.
    const findMachineInformation = (stages) => {
        const plugins = stages
            .flatMap(stage => stage.jobs || [])
            .flatMap(job => getFlattenedPlugins(job.plugins));

        for (const plugin of plugins) {
            const extraction = (plugin?.extractions || []).find(item => item?.session?.machineName);

            if (extraction) {
                return extraction.session;
            }
        }

        return null;
    };

    // Renders one label/value pair of the session info strip.
    const writeInformationItem = (label, value) => `
        <div class="automation-report-session-info__item">
            <div class="automation-report-session-info__label">${convertToEscapedHtml(label)}</div>
            <div class="automation-report-session-info__value">${convertToEscapedHtml(value)}</div>
        </div>`;

    // Collect the session's stages, jobs, plugins, assertions, and exceptions.
    const performancePoint = session.performancePoint || {};
    const stages = session.responseTree?.stages || [];
    const jobs = stages.flatMap(stage => stage.jobs || []);
    const plugins = jobs.flatMap(job => getFlattenedPlugins(job.plugins));
    const assertions = jobs.flatMap(job => getAssertions(job.plugins));
    const failedAssertions = assertions.filter(assertion => assertion.content?.Evaluation === false);
    const passedCount = assertions.filter(assertion => assertion.content?.Evaluation === true).length;
    const exceptions = plugins.flatMap(plugin => plugin.exceptions || []);
    const safeSessionId = convertToEscapedHtml(sessionId);
    const treeId = `tree-${safeSessionId}`;

    // The info strip shows the machine only when an extraction reported one.
    const machine = findMachineInformation(stages);
    const machineHtml = machine
        ? `${writeInformationItem('Machine', machine.machineName || '-')}${writeInformationItem('IP', machine.machineIp || '-')}`
        : '';

    // The error summary appears only when something failed; the assertion counts only when non-zero.
    const isErrorSummaryNeeded = failedAssertions.length + exceptions.length > 0;
    const errorSummaryHtml = isErrorSummaryNeeded
        ? writeErrorSummary({ assertions: failedAssertions, exceptions, sessionId: safeSessionId })
        : '';
    const failedCountHtml = failedAssertions.length > 0
        ? writeCount('error', `${failedAssertions.length} Fail${getPluralSuffix(failedAssertions.length)}`)
        : '';
    const passedCountHtml = passedCount > 0
        ? writeCount('passed', `${passedCount} Pass${getPluralSuffix(passedCount, 'es')}`)
        : '';
    const treeCountsText = `${stages.length} stage${getPluralSuffix(stages.length)} \u2022 ${jobs.length} job${getPluralSuffix(jobs.length)} \u2022 ${plugins.length} total plugins`;

    return `
    <div data-test-id="session-${safeSessionId}">
        <div class="automation-report-session-title">
            <span class="automation-report-session-title__label">Session</span>
            <span class="automation-report-session-title__id automation-report-monospace">${safeSessionId}</span>
        </div>
        <div class="automation-report-session-info" data-test-id="session-${safeSessionId}-information">
            ${machineHtml}
            ${writeInformationItem('Start', convertToTimeText(performancePoint.start))}
            ${writeInformationItem('End', convertToTimeText(performancePoint.end))}
            ${writeInformationItem('Plugins Run', `${plugins.length}`)}
            ${writeInformationItem('Stages', `${stages.length}`)}
            ${writeInformationItem('Jobs', `${jobs.length}`)}
        </div>
        ${writeCards(performancePoint, stages)}
        ${errorSummaryHtml}
        <g4-section class="automation-report-section automation-report-section--spaced"
                    open
                    section-title="Plugin Tree"
                    test-id="plugin-tree-${safeSessionId}-section">
            <span class="automation-report-meta-text" data-slot="header">${convertToEscapedHtml(treeCountsText)}</span>
            <input type="text"
                   class="automation-report-tree-filter"
                   data-report-action="filter-tree"
                   data-report-target="${treeId}"
                   data-slot="header"
                   data-test-id="plugin-tree-${safeSessionId}-filter-input"
                   aria-label="Filter plugins"
                   placeholder="Filter">
            <div id="${treeId}" data-test-id="plugin-tree-${safeSessionId}">
                ${writeTree(stages)}
            </div>
        </g4-section>
        <g4-section class="automation-report-section"
                    open
                    section-title="Execution Timeline"
                    test-id="execution-timeline-${safeSessionId}-section">
            ${writeTimeline(stages, performancePoint.start, performancePoint.end)}
        </g4-section>
        <g4-section class="automation-report-section"
                    flush
                    open
                    section-title="Assertions"
                    test-id="assertions-${safeSessionId}-section">
            ${failedCountHtml}
            ${passedCountHtml}
            ${writeAssertions(assertions)}
        </g4-section>
    </div>`;
}

/**
 * Renders a small round status dot.
 *
 * @param {'passed'|'timeout'|'error'|'unknown'} status - The status; CSS maps it to the theme color.
 * @returns {string} HTML markup for the dot.
 */
function writeStatusDot(status) {
    return `<span class="automation-report-status automation-report-status--${status}" aria-hidden="true"></span>`;
}

/**
 * Renders the execution timeline of one session as a waterfall trace view.
 *
 * Behavior:
 * - Shows a sticky time axis with round tick steps, and one collapsible group row per stage and job.
 * - Shows every action as one row: an indented tree on the left (children to the right of their
 *   parent, with guide lines), its bar on the shared time axis, and its duration on the right.
 * - Draws an action that has children as a span bracket, and a leaf action as a solid bar.
 * - Colors an action's bar and row by its own status (passed, timeout, exception). The status dot
 *   shows the worst status in the action's subtree, so a failure inside a collapsed action stays visible.
 * - Starts with the stage/job groups and the first action level expanded; deeper levels start collapsed.
 * - Fills the panel width (bars are positioned in percent) and scrolls inside its own viewport.
 *
 * @remarks
 * Compute-only: it returns markup and owns no state. Rows are expanded and collapsed afterwards by
 * updateTimelineRowExpansion and setTimelineExpansion, which change only the rendered DOM.
 *
 * @param {Array<object>|null|undefined} stages - The report stages to render.
 * @param {string} sessionStart - The session start date/time.
 * @param {string} sessionEnd - The session end date/time.
 * @returns {string} HTML markup for the timeline section.
 */
function writeTimeline(stages, sessionStart, sessionEnd) {
    // Ranks the statuses so the worst one in a subtree wins: an exception over a timeout over a pass.
    const STATUS_RANKS = { error: 2, passed: 0, timeout: 1 };

    // Tooltip text per status.
    const STATUS_TEXTS = { error: 'Failed', passed: 'Passed', timeout: 'Timed out' };

    // Round axis steps in milliseconds; the axis uses the smallest step that keeps the interval count low.
    const TICK_STEPS_MILLISECONDS = [
        1, 2, 5, 10, 20, 50, 100, 200, 500,
        1000, 2000, 5000, 10000, 15000, 30000,
        60000, 120000, 300000, 600000, 900000, 1800000, 3600000
    ];

    // The largest number of axis intervals; more would crowd the tick labels on a narrow panel.
    const MAXIMUM_TICK_INTERVALS = 8;

    // Action rows at this depth or deeper start collapsed, so only the first action level is open.
    const COLLAPSED_ACTION_DEPTH = 1;

    // Every start and end time seen, used to size the axis so no bar falls outside it.
    const times = [];

    // Converts a date/time into milliseconds, or returns the fallback when it is missing or invalid.
    const getTime = (value, fallback) => {
        const time = convertToTime(value);

        return Number.isFinite(time)
            ? time
            : fallback;
    };

    // Picks the worst status of a list, so a parent can show a failure hidden in its subtree.
    const getWorstStatus = (statuses) => {
        let worstStatus = 'passed';

        for (const status of statuses) {
            const isWorse = STATUS_RANKS[status] > STATUS_RANKS[worstStatus];

            if (isWorse) {
                worstStatus = status;
            }
        }

        return worstStatus;
    };

    // Reads the first exception's message for the tooltip; anything that is not text is left out.
    const getExceptionMessage = (exceptions) => {
        const message = exceptions[0]?.exception?.Message;

        return typeof message === 'string'
            ? message
            : '';
    };

    // Converts one plugin (and its children) into a timeline node, recording its times for the axis.
    const newNode = (plugin, depth) => {
        // Resolve the identity shown in the row; the display name matches what the plugin tree shows.
        const reference = plugin?.performancePoint?.reference || {};
        const name = reference.name || plugin?.rule?.pluginName || '?';
        const displayName = plugin?.rule?.capabilities?.displayName || name;

        // Resolve the timing; an action without its own times falls back to the session bounds.
        const start = getTime(plugin?.performancePoint?.start, sessionStartTime);
        const end = getTime(plugin?.performancePoint?.end, sessionEndTime);

        times.push(start, end);

        // Build the children first so this node's subtree status is known.
        const exceptions = plugin?.exceptions || [];
        const status = getExceptionStatus(exceptions);
        const children = (plugin?.plugins || []).map(child => newNode(child, depth + 1));
        const worstStatus = getWorstStatus([status, ...children.map(child => child.worstStatus)]);

        return {
            children,
            depth,
            displayName,
            end,
            exceptionMessage: getExceptionMessage(exceptions),
            name,
            runTime: plugin?.performancePoint?.runTime,
            start,
            status,
            worstStatus
        };
    };

    // Formats an axis tick: milliseconds for sub-second steps, seconds below a minute, minutes above.
    const formatTickText = (milliseconds, stepMilliseconds) => {
        if (milliseconds === 0) {
            return '0';
        }

        if (stepMilliseconds < 1000) {
            return `${milliseconds} ms`;
        }

        if (stepMilliseconds < 60000) {
            return `${milliseconds / 1000} s`;
        }

        return `${milliseconds / 60000} min`;
    };

    // Converts a time into a percent of the axis, clamped so a bar never leaves its track.
    const getPercent = (time) => Math.min(100, Math.max(0, ((time - timelineStart) / span) * 100));

    // Renders one row: tree cell (indent, chevron, status dot, label), bar on the time track, and duration.
    const writeRow = (options) => {
        const { childrenId, depth, durationText, end, isExpandable, isExpanded, kind, label, rowId, start, status, tooltip, worstStatus } = options;

        // Expandable rows expose their state to assistive technology, toggle on click and on Enter/Space
        // (through the delegated listeners), and take keyboard focus; leaf rows get none of these.
        const toggleDataAttributes = isExpandable
            ? `data-report-action="toggle-timeline-row"`
            : '';
        const toggleAriaAttributes = isExpandable
            ? `aria-controls="${childrenId}"
             aria-expanded="${isExpanded}"`
            : '';
        const focusAttribute = isExpandable
            ? 'tabindex="0"'
            : '';

        // An expandable row shows a chevron; a leaf keeps the same space so labels stay aligned.
        const toggleHtml = isExpandable
            ? `<span class="automation-report-timeline__toggle">${writeChevron({ isOpen: isExpanded })}</span>`
            : '<span class="automation-report-timeline__toggle" aria-hidden="true"></span>';

        // A parent's bar is a span bracket over its children; a leaf's bar is solid.
        const barKind = isExpandable
            ? 'span'
            : 'solid';
        const barStart = getPercent(start);
        const barWidth = Math.max(0, getPercent(end) - barStart);

        return `
        <div id="${rowId}"
             class="automation-report-timeline__row automation-report-timeline__row--${kind} automation-report-timeline__row--${status}"
             style="--automation-report-timeline-depth: ${depth}"
             title="${convertToEscapedHtml(tooltip)}"
             ${toggleDataAttributes}
             data-test-id="execution-timeline-${rowId}-row"
             ${toggleAriaAttributes}
             aria-level="${depth + 1}"
             role="treeitem"
             ${focusAttribute}>
            <div class="automation-report-timeline__name">
                ${toggleHtml}
                ${writeStatusDot(worstStatus)}
                <span class="automation-report-timeline__label">${convertToEscapedHtml(label)}</span>
            </div>
            <div class="automation-report-timeline__track">
                <span class="automation-report-timeline__bar automation-report-timeline__bar--${barKind} automation-report-timeline__bar--${status}"
                      style="--automation-report-timeline-bar-start: ${barStart.toFixed(3)}%; --automation-report-timeline-bar-width: ${barWidth.toFixed(3)}%"></span>
            </div>
            <div class="automation-report-timeline__duration">${convertToEscapedHtml(durationText)}</div>
        </div>`;
    };

    // Renders an action row and, recursively, its children inside a collapsible container.
    const writeNode = (node) => {
        // Give every row a unique id so its toggle and children container can find each other.
        const rowId = newElementId(`${timelineId}-row`);
        const childrenId = `${rowId}-children`;
        const isExpandable = node.children.length > 0;
        const isExpanded = node.depth < COLLAPSED_ACTION_DEPTH;

        // Prefer the engine's own run time; fall back to the wall-clock span when it is missing.
        const isRunTime = typeof node.runTime === 'number' && node.runTime > 0;
        const durationTicks = isRunTime
            ? node.runTime
            : (node.end - node.start) * TICKS_PER_MILLISECOND;
        const durationText = convertToDurationText(durationTicks);

        // Explain the row in its tooltip: name, offset from the session start, duration, and status.
        const nameText = node.displayName === node.name
            ? node.name
            : `${node.displayName} (${node.name})`;
        const offsetText = `+${((node.start - timelineStart) / 1000).toFixed(3)} s`;
        const messageText = node.exceptionMessage
            ? `: ${node.exceptionMessage}`
            : '';
        const tooltip = `${nameText}\nStart: ${offsetText}   Duration: ${durationText}\n${STATUS_TEXTS[node.status]}${messageText}`;

        // Render the children only when there are any, collapsed when this row starts collapsed.
        const collapsedClass = isExpanded
            ? ''
            : ` ${COLLAPSED_CLASS}`;
        const childrenHtml = isExpandable
            ? `<div id="${childrenId}" class="automation-report-timeline__children${collapsedClass}" role="group">${node.children.map(writeNode).join('')}</div>`
            : '';
        const rowHtml = writeRow({
            childrenId,
            depth: node.depth + 1,
            durationText,
            end: node.end,
            isExpandable,
            isExpanded,
            kind: 'action',
            label: node.displayName,
            rowId,
            start: node.start,
            status: node.status,
            tooltip,
            worstStatus: node.worstStatus
        });

        return `<div class="automation-report-timeline__node" role="none">${rowHtml}${childrenHtml}</div>`;
    };

    // Resolve the session bounds; actions without their own times fall back to them.
    const sessionStartTime = getTime(sessionStart, Number.NaN);
    const sessionEndTime = getTime(sessionEnd, Number.NaN);

    // Build one group per stage and job, keeping the group's own times when the report has them.
    const groups = [];

    for (const stage of (stages || [])) {
        for (const job of (stage.jobs || [])) {
            const nodes = (job.plugins || []).map(plugin => newNode(plugin, 0));

            if (nodes.length === 0) {
                continue;
            }

            // Label the group "Stage > Job" and span it over the job's own times, or its actions' times.
            const stageName = typeof stage.name === 'string' ? stage.name : 'Stage';
            const jobName = typeof job.name === 'string' ? job.name : 'Job';
            const groupStart = getTime(job.performancePoint?.start, Math.min(...nodes.map(node => node.start)));
            const groupEnd = getTime(job.performancePoint?.end, Math.max(...nodes.map(node => node.end)));

            times.push(groupStart, groupEnd);
            groups.push({ end: groupEnd, label: `${stageName} \u203A ${jobName}`, nodes, start: groupStart });
        }
    }

    // Show an empty state when there is nothing with a time to place on the axis.
    const knownTimes = [sessionStartTime, sessionEndTime, ...times].filter(Number.isFinite);

    if (groups.length === 0 || knownTimes.length === 0) {
        return '<div class="automation-report-empty-state" data-test-id="execution-timeline-empty-message">No timeline data.</div>';
    }

    // Size the axis to cover the session and every action, with at least 1 ms to avoid dividing by zero.
    const timelineStart = Math.min(...knownTimes);
    const timelineEnd = Math.max(...knownTimes);
    const span = Math.max(timelineEnd - timelineStart, 1);

    // Choose a round tick step and render the tick labels; the gridlines repeat at the same percent.
    const tickStep = TICK_STEPS_MILLISECONDS.find(step => span / step <= MAXIMUM_TICK_INTERVALS)
        ?? TICK_STEPS_MILLISECONDS.at(-1);
    const tickPercent = (tickStep / span) * 100;
    const ticksHtml = [];

    for (let milliseconds = 0; milliseconds <= span; milliseconds += tickStep) {
        ticksHtml.push(`<span class="automation-report-timeline__tick" style="--automation-report-timeline-tick-position: ${((milliseconds / span) * 100).toFixed(3)}%">${formatTickText(milliseconds, tickStep)}</span>`);
    }

    // Render each stage/job group as an expanded header row with its actions nested below it.
    const timelineId = newElementId('timeline');
    const groupsHtml = groups.map((group) => {
        const rowId = newElementId(`${timelineId}-row`);
        const childrenId = `${rowId}-children`;
        const durationText = convertToDurationText((group.end - group.start) * TICKS_PER_MILLISECOND);
        const rowHtml = writeRow({
            childrenId,
            depth: 0,
            durationText,
            end: group.end,
            isExpandable: true,
            isExpanded: true,
            kind: 'group',
            label: group.label,
            rowId,
            start: group.start,
            status: 'passed',
            tooltip: `${group.label}\nDuration: ${durationText}`,
            worstStatus: getWorstStatus(group.nodes.map(node => node.worstStatus))
        });

        return `
        <div class="automation-report-timeline__node" role="none">
            ${rowHtml}
            <div id="${childrenId}" class="automation-report-timeline__children" role="group">${group.nodes.map(writeNode).join('')}</div>
        </div>`;
    }).join('');

    // Render the toolbar, the sticky axis, and the groups inside the timeline's own scroll viewport.
    return `
    <div id="${timelineId}"
         class="automation-report-timeline"
         style="--automation-report-timeline-tick-percent: ${tickPercent.toFixed(3)}%"
         data-test-id="execution-timeline-${timelineId}">
        <div class="automation-report-timeline__toolbar">
            <button type="button"
                    class="automation-report-timeline__toolbar-button"
                    title="Expand every action in the timeline"
                    data-report-action="expand-timeline"
                    data-report-target="${timelineId}"
                    data-test-id="execution-timeline-${timelineId}-expand-all-button">
                Expand all
            </button>
            <button type="button"
                    class="automation-report-timeline__toolbar-button"
                    title="Collapse every action in the timeline"
                    data-report-action="collapse-timeline"
                    data-report-target="${timelineId}"
                    data-test-id="execution-timeline-${timelineId}-collapse-all-button">
                Collapse all
            </button>
        </div>
        <div class="automation-report-timeline__viewport"
             data-test-id="execution-timeline-${timelineId}-viewport"
             aria-label="Execution timeline"
             role="tree">
            <div class="automation-report-timeline__axis" aria-hidden="true">
                <div class="automation-report-timeline__axis-name">Action</div>
                <div class="automation-report-timeline__axis-track">${ticksHtml.join('')}</div>
                <div class="automation-report-timeline__axis-duration">Duration</div>
            </div>
            ${groupsHtml}
        </div>
    </div>`;
}

/**
 * Renders the plugin tree: each stage and job as an expanded section, with the job's plugins below.
 *
 * @remarks
 * The three slowest plugins of each job are passed down as hot so their durations stand out.
 *
 * @param {Array<object>|null|undefined} stages - The session stages.
 * @returns {string} HTML markup for the tree, or an empty-state message.
 */
function writeTree(stages) {
    // Renders one job section with its plugins; the job's slowest plugins are marked hot.
    const writeTreeJob = (job) => {
        const plugins = job.plugins || [];
        const jobRunTime = job.performancePoint?.runTime || 0;
        const jobBodyId = newElementId('job');

        // Pick the job's slowest plugins (children included) so their durations are highlighted.
        const getRunTime = plugin => plugin.performancePoint?.runTime || 0;
        const hotPluginIds = new Set(getFlattenedPlugins(plugins)
            .sort((left, right) => getRunTime(right) - getRunTime(left))
            .slice(0, HOT_PLUGIN_COUNT)
            .map(plugin => plugin.performancePoint?.reference?.id)
            .filter(Boolean));

        // Render the plugins under an expanded job header with their count and the job's run time.
        const pluginsHtml = plugins
            .map(plugin => writePlugin(plugin, { depth: 0, hotPluginIds, parentRunTime: jobRunTime }))
            .join('');

        return `
        <div class="automation-report-tree-job" data-test-id="plugin-tree-job">
            <div class="automation-report-tree-job__header"
                 data-report-action="toggle-section"
                 data-report-target="${jobBodyId}"
                 data-test-id="plugin-tree-job-header">
                ${writeChevron({ id: `${jobBodyId}-chevron`, isOpen: true })}
                ${convertToEscapedHtml(job.name)}
                <span class="automation-report-meta-text">${plugins.length} plugin${getPluralSuffix(plugins.length)} &bull; ${convertToDurationText(jobRunTime)}</span>
            </div>
            <div id="${jobBodyId}">${pluginsHtml}</div>
        </div>`;
    };

    // Renders one stage section with its jobs.
    const writeTreeStage = (stage) => {
        const jobs = stage.jobs || [];
        const stageBodyId = newElementId('stage');

        return `
        <div class="automation-report-tree-stage" data-test-id="plugin-tree-stage">
            <div class="automation-report-tree-stage__header"
                 data-report-action="toggle-section"
                 data-report-target="${stageBodyId}"
                 data-test-id="plugin-tree-stage-header">
                ${writeChevron({ id: `${stageBodyId}-chevron`, isOpen: true })}
                ${convertToEscapedHtml(stage.name)}
                <span class="automation-report-meta-text">${jobs.length} job${getPluralSuffix(jobs.length)}</span>
            </div>
            <div id="${stageBodyId}">${jobs.map(writeTreeJob).join('')}</div>
        </div>`;
    };

    if (!stages?.length) {
        return '<div class="automation-report-empty-state" data-test-id="plugin-tree-empty-message">No stages.</div>';
    }

    return stages.map(writeTreeStage).join('');
}

// Render the report once the script loads; the injected data is already in the page.
startReport();
