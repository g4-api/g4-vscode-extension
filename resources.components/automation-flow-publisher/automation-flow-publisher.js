/*
 * G4(TM) Flow Publisher component.
 *
 * Renders a form for one G4FlowManifestModel, built from the flow schema that the extension host
 * reads from the Hub's OpenAPI document (swagger/flows/docs.json) and injects through #g4-data.
 * The page looks and behaves like the G4 Settings editor: collapsible sections with a chevron,
 * labels with hints above their controls, add-entry lists, Markdown text boxes with an expanded
 * editor, toggle switches, JSON editors with a Format button, collapsible item cards, and a sticky
 * action bar. It keeps its own copy of that look (no shared stylesheet or script) so the component
 * stays isolated.
 *
 * Host contract (update-flow.ts):
 * - Injected #g4-data: { automation, defaults, existingFlow, isSchemaFallback, schemas, summaryTemplate }.
 * - Webview → host: { command: 'lookupFlow', requestId, namespace, key }
 *                   { command: 'publish', automationText, values, warnings }
 * - Host → webview: { command: 'flowLookup', requestId, existingFlow }
 *                   { command: 'publishResult', isSuccess, isCancelled, message, fieldErrors, existingFlow, savedAutomationText }
 *
 * Parameter tokens: the automation references a parameter as `{{$ Parameters.Name }}`, exactly.
 * Unused parameters, unknown names, and broken tokens are warnings: they are shown on the page and
 * listed in a confirmation the host shows on Publish, but never block publishing.
 *
 * The page never talks to the network; the host owns every Hub call and every file write. The
 * Automation box edits the bot JSON without its authentication block; the host strips any
 * authentication again, Base64-encodes it for the Hub, and after a successful publish writes it
 * back to the bot file with the original authentication block restored.
 */
'use strict';

// Matches a lower-case letter or digit followed by an upper-case letter, the boundary between
// words in a camelCase schema name (projectUrl → project Url). Linear: two single characters.
const CAMEL_CASE_BOUNDARY_PATTERN = /([a-z0-9])([A-Z])/g;

// One plain sentence per field, in the voice of the settings editor hints. These take precedence
// over the backend schema descriptions, which describe the C# property rather than the user's task;
// a schema field without an entry here falls back to its backend description.
const FIELD_HINTS = {
    'author.link': 'A page about the author, such as a profile or a team site.',
    'author.name': 'The person or team that maintains this flow.',
    aliases: 'Other names that also find and run this flow. Up to 55 characters each.',
    categories: 'Groups the flow appears under when browsing the G4 catalog. Add at least one, up to 55 characters each.',
    context: 'Extra data stored with the flow, as a JSON object. Leave it empty for none.',
    description: 'Longer details: what the flow needs, what it changes, and what it returns. Supports Markdown.',
    key: 'The flow\'s unique name within its namespace. Normalized to PascalCase when you leave the field.',
    namespace: 'Groups related flows. Leave it empty to use G4.System.',
    platforms: 'Where the flow can run, for example Windows, Linux, or Any. Add at least one, up to 55 characters each.',
    projectUrl: 'Where to read more about the flow, such as its repository or documentation.',
    protocol: 'Key/value settings for the protocol the flow uses. Leave it empty for none.',
    summary: 'A short explanation of what the flow does, shown in the G4 catalog. Supports Markdown.',
    version: 'Your own version label for this flow, for example 1.0.0.'
};

// Guidance appended to a JSON error while typing or publishing, worded like the settings editor.
const JSON_EDIT_GUIDANCE = 'Fix the highlighted text; this change won\'t be saved until it parses.';

// Guidance appended to a JSON error when Format cannot parse the text, worded like the settings editor.
const JSON_FORMAT_GUIDANCE = 'Fix the highlighted text before formatting.';

// UI policy layered over the schema: the section a field belongs to, its order, label, and any
// control that the schema type alone cannot express. Schema fields missing here are still rendered
// (Additional Fields section, by schema type), so a new backend field appears without a code change.
const FIELD_POLICY = {
    key: { section: 'identity', order: 1, label: 'Key', control: 'key' },
    namespace: { section: 'identity', order: 2, label: 'Namespace' },
    version: { section: 'identity', order: 3, label: 'Version' },
    summary: { section: 'description', order: 1, label: 'Summary', control: 'markdown', isRequired: true },
    description: { section: 'description', order: 2, label: 'Description', control: 'markdown', isRequired: true },
    categories: { section: 'classification', order: 1, label: 'Categories', control: 'list', isRequired: true },
    aliases: { section: 'classification', order: 2, label: 'Aliases', control: 'list' },
    platforms: { section: 'classification', order: 3, label: 'Platforms', control: 'list', isRequired: true },
    author: { section: 'author', order: 1, label: 'Author', urlProperties: ['link'] },
    projectUrl: { section: 'author', order: 2, label: 'Project URL', control: 'url' },
    parameters: { section: 'parameters', order: 1, label: 'Parameters' },
    context: { section: 'context', order: 1, label: 'Context', control: 'json' },
    protocol: { section: 'context', order: 2, label: 'Protocol' },
    automation: { section: 'hidden' },
    id: { section: 'hidden' },
    pluginType: { section: 'hidden' },
    source: { section: 'hidden' },
    type: { section: 'hidden' }
};

// Splits a typed key into words: every run of characters that is not a letter or digit.
// Linear: one negated character class with a single quantifier.
const KEY_SEPARATOR_PATTERN = /[^\p{L}\p{N}]+/u;

// Line breaks in textarea content (Windows or Unix). Linear: optional character plus one literal.
const LINE_BREAK_PATTERN = /\r?\n/;

// Longest accepted entry in an add-entry list (categories, aliases, platforms).
const LIST_ENTRY_MAXIMUM_LENGTH = 55;

// Delay after the last Key or Namespace edit before asking the host whether the flow exists,
// so typing does not send one Hub request per keystroke.
const LOOKUP_DELAY_MILLISECONDS = 400;

// Anything that looks like a parameter token: the word Parameters (not part of a longer word, such
// as driverParameters) followed by a dot, with any braces, `$`, and spaces around it. Every match that
// is not exactly a strict token is a broken token. Linear: the character classes on either side of
// each quantifier are disjoint, so no position can be matched two ways.
const LOOSE_PARAMETER_TOKEN_PATTERN = /(?:\{+[\s$]*)?(?<!\w)Parameters\s*\.\s*[^\s{}"]*[ \t]*\}*/gi;

// Root schema of the form.
const MANIFEST_SCHEMA_NAME = 'G4FlowManifestModel';

// Rows of the static Markdown reference: the element, what to type, and how it looks. `result` is
// trusted markup written here; `syntax` is text and is escaped when rendered.
const MARKDOWN_REFERENCE = [
    { element: 'Heading', syntax: '# Title\n## Section\n### Subsection', result: '<h3>Title</h3><h4>Section</h4><h5>Subsection</h5>' },
    { element: 'Bold', syntax: '**bold text**', result: '<strong>bold text</strong>' },
    { element: 'Italic', syntax: '*italic text*', result: '<em>italic text</em>' },
    { element: 'Strikethrough', syntax: '~~removed text~~', result: '<del>removed text</del>' },
    { element: 'Inline code', syntax: 'Run `npm install` first.', result: 'Run <code>npm install</code> first.' },
    { element: 'Code block', syntax: '```json\n{ "key": "value" }\n```', result: '<pre><code>{ "key": "value" }</code></pre>' },
    { element: 'Link', syntax: '[G4 Hub](https://example.com)', result: '<a href="#" tabindex="-1">G4 Hub</a>' },
    { element: 'Bulleted list', syntax: '- First item\n- Second item\n  - Nested item', result: '<ul><li>First item</li><li>Second item<ul><li>Nested item</li></ul></li></ul>' },
    { element: 'Numbered list', syntax: '1. First step\n2. Second step', result: '<ol><li>First step</li><li>Second step</li></ol>' },
    { element: 'Blockquote', syntax: '> Note: runs on Windows only.', result: '<blockquote>Note: runs on Windows only.</blockquote>' },
    {
        element: 'Table',
        syntax: '| Name | Type |\n| ---- | ---- |\n| Url  | String |',
        result: '<table><thead><tr><th>Name</th><th>Type</th></tr></thead><tbody><tr><td>Url</td><td>String</td></tr></tbody></table>'
    },
    { element: 'Horizontal rule', syntax: 'Above\n\n---\n\nBelow', result: 'Above<hr>Below' }
];

// One plain sentence per parameter property, in the voice of the settings editor hints.
const PARAMETER_HINTS = {
    default: 'The value used when the caller does not pass one.',
    displayName: 'A friendly name shown in tools and forms.',
    description: 'What the parameter is for. Supports Markdown.',
    mandatory: 'The caller must always pass this parameter.',
    multiple: 'The caller can pass this parameter more than once, one value each time, for example --Name:value1 --Name:value2. It is not a comma-separated list.',
    name: 'The name callers use to pass this value.',
    type: 'The kind of value expected, for example String or Int.',
    values: 'The values callers can choose from. Leave it empty to accept any value.'
};

// Parameter properties the form does not edit. Their stored values are kept and sent back unchanged.
const PARAMETER_HIDDEN_PROPERTIES = ['dependsOn', 'stringSyntax'];

// Parameter string-array properties edited as Markdown text, one array entry per line.
const PARAMETER_MARKDOWN_PROPERTIES = ['description'];

// Parameter properties shown first in each parameter card; the rest follow in schema order.
const PARAMETER_PROPERTY_ORDER = ['name', 'displayName', 'type', 'default'];

// Parameter property edited as nested value cards (Name, Display Name, Description) instead of JSON.
const PARAMETER_VALUES_PROPERTY = 'values';

// How long the action bar note stays visible after a publish result, like the settings save note.
const SAVE_NOTE_DURATION_MILLISECONDS = 2500;

// Page sections in display order. Identity and Description start open; the rest start collapsed,
// exactly like the collapsed-by-default sections of the settings editor.
const SECTIONS = [
    {
        id: 'identity',
        isOpenByDefault: true,
        title: 'Identity',
        description: 'The key and namespace identify the flow in the G4 Hub; publishing the same identity again overwrites it.'
    },
    {
        id: 'description',
        isOpenByDefault: true,
        title: 'Description',
        description: 'Text shown for the flow in the G4 catalog.'
    },
    {
        id: 'classification',
        isOpenByDefault: false,
        title: 'Classification',
        description: 'Categories, aliases, and platforms used to find and group the flow.'
    },
    {
        id: 'author',
        isOpenByDefault: false,
        title: 'Author & Links',
        description: 'Who maintains the flow and where to learn more about it.'
    },
    {
        id: 'parameters',
        isOpenByDefault: false,
        title: 'Parameters',
        description: 'Inputs the flow accepts. Open a card to edit a parameter.'
    },
    {
        id: 'context',
        isOpenByDefault: false,
        title: 'Context & Protocol',
        description: 'Extra data stored with the flow: a JSON context object and protocol key/value settings.'
    },
    {
        id: 'additional',
        isOpenByDefault: false,
        title: 'Additional Fields',
        description: 'Fields published by the G4 Hub schema that have no dedicated editor yet.'
    }
];

// The strict parameter token: `{{$ Parameters.Name }}` with exactly one space after `{{$` and one
// before `}}`. The name is everything up to that space. Linear: one negated class between literals.
const STRICT_PARAMETER_TOKEN_PATTERN = /\{\{\$ Parameters\.([^\s{}"]+) \}\}/g;

// Move down / move up icons of the card header buttons. Embedded in this component on purpose
// (not shared assets); currentColor lets them follow the theme.
const SVG_ARROW_DOWN = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" aria-hidden="true">
    <path fill="currentColor" d="M297.4 598.6C309.9 611.1 330.2 611.1 342.7 598.6L470.7 470.6C479.9 461.4 482.6 447.7 477.6 435.7C472.6 423.7 460.9 416 448 416L384 416L384 80C384 53.5 362.5 32 336 32L304 32C277.5 32 256 53.5 256 80L256 416L192 416C179.1 416 167.4 423.8 162.4 435.8C157.4 447.8 160.2 461.5 169.4 470.6L297.4 598.6z"/>
</svg>`;

const SVG_ARROW_UP = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" aria-hidden="true">
    <path fill="currentColor" d="M297.4 41.4C309.9 28.9 330.2 28.9 342.7 41.4L470.7 169.4C479.9 178.6 482.6 192.3 477.6 204.3C472.6 216.3 460.9 224 448 224L384 224L384 560C384 586.5 362.5 608 336 608L304 608C277.5 608 256 586.5 256 560L256 224L192 224C179.1 224 167.4 216.2 162.4 204.2C157.4 192.2 160.2 178.5 169.4 169.4L297.4 41.4z"/>
</svg>`;

// Collapse/expand chevron used by every section and card header (same icon as the settings editor).
const SVG_CHEVRON = `
<svg class="flow-publisher-chev-r" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" width="13" height="13">
    <path fill="currentColor" d="M441.3 299.8C451.5 312.4 450.8 330.9 439.1 342.6L311.1 470.6C301.9 479.8 288.2 482.5 276.2 477.5C264.2 472.5 256.5 460.9 256.5 448L256.5 192C256.5 179.1 264.3 167.4 276.3 162.4C288.3 157.4 302 160.2 311.2 169.3L439.2 297.3L441.4 299.7z"/>
</svg>
<svg class="flow-publisher-chev-d" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" width="13" height="13">
    <path fill="currentColor" d="M300.3 440.8C312.9 451 331.4 450.3 343.1 438.6L471.1 310.6C480.3 301.4 483 287.7 478 275.7C473 263.7 461.4 256 448.5 256L192.5 256C179.6 256 167.9 263.8 162.9 275.8C157.9 287.8 160.7 301.5 169.9 310.6L297.9 438.6L300.3 440.8z"/>
</svg>`;

// Close icon for the modals. Embedded in this component on purpose (not a shared asset).
const SVG_CLOSE = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" aria-hidden="true">
    <path fill="currentColor" d="M320 576C461.4 576 576 461.4 576 320C576 178.6 461.4 64 320 64C178.6 64 64 178.6 64 320C64 461.4 178.6 576 320 576zM231 231C240.4 221.6 255.6 221.6 264.9 231L319.9 286L374.9 231C384.3 221.6 399.5 221.6 408.8 231C418.1 240.4 418.2 255.6 408.8 264.9L353.8 319.9L408.8 374.9C418.2 384.3 418.2 399.5 408.8 408.8C399.4 418.1 384.2 418.2 374.9 408.8L319.9 353.8L264.9 408.8C255.5 418.2 240.3 418.2 231 408.8C221.7 399.4 221.6 384.2 231 374.9L286 319.9L231 264.9C221.6 255.5 221.6 240.3 231 231z"/>
</svg>`;

// Expand icon that opens a text box in the large editor. Embedded in this component on purpose.
const SVG_EXPAND = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" aria-hidden="true">
    <path fill="currentColor" d="M128 96C110.3 96 96 110.3 96 128L96 224C96 241.7 110.3 256 128 256C145.7 256 160 241.7 160 224L160 160L224 160C241.7 160 256 145.7 256 128C256 110.3 241.7 96 224 96L128 96zM160 416C160 398.3 145.7 384 128 384C110.3 384 96 398.3 96 416L96 512C96 529.7 110.3 544 128 544L224 544C241.7 544 256 529.7 256 512C256 494.3 241.7 480 224 480L160 480L160 416zM416 96C398.3 96 384 110.3 384 128C384 145.7 398.3 160 416 160L480 160L480 224C480 241.7 494.3 256 512 256C529.7 256 544 241.7 544 224L544 128C544 110.3 529.7 96 512 96L416 96zM544 416C544 398.3 529.7 384 512 384C494.3 384 480 398.3 480 416L480 480L416 480C398.3 480 384 494.3 384 512C384 529.7 398.3 544 416 544L512 544C529.7 544 544 529.7 544 512L544 416z"/>
</svg>`;

// Format icon that checks and pretty-prints a JSON box. Embedded in this component on purpose.
const SVG_FORMAT = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" aria-hidden="true">
    <path fill="currentColor" d="M392.8 65.2C375.8 60.3 358.1 70.2 353.2 87.2L225.2 535.2C220.3 552.2 230.2 569.9 247.2 574.8C264.2 579.7 281.9 569.8 286.8 552.8L414.8 104.8C419.7 87.8 409.8 70.1 392.8 65.2zM457.4 201.3C444.9 213.8 444.9 234.1 457.4 246.6L530.8 320L457.4 393.4C444.9 405.9 444.9 426.2 457.4 438.7C469.9 451.2 490.2 451.2 502.7 438.7L598.7 342.7C611.2 330.2 611.2 309.9 598.7 297.4L502.7 201.4C490.2 188.9 469.9 188.9 457.4 201.4zM182.7 201.3C170.2 188.8 149.9 188.8 137.4 201.3L41.4 297.3C28.9 309.8 28.9 330.1 41.4 342.6L137.4 438.6C149.9 451.1 170.2 451.1 182.7 438.6C195.2 426.1 195.2 405.8 182.7 393.3L109.3 320L182.6 246.6C195.1 234.1 195.1 213.8 182.6 201.3z"/>
</svg>`;

// Markdown icon that opens the Markdown reference. Embedded in this component on purpose.
const SVG_MARKDOWN = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" aria-hidden="true">
    <path fill="currentColor" d="M593.8 123.1L46.2 123.1C20.7 123.1 0 143.8 0 169.2L0 470.7C0 496.2 20.7 516.9 46.2 516.9L593.9 516.9C619.4 516.9 640.1 496.2 640 470.8L640 169.2C640 143.8 619.3 123.1 593.8 123.1zM338.5 424.6L277 424.6L277 304.6L215.5 381.5L154 304.6L154 424.6L92.3 424.6L92.3 215.4L153.8 215.4L215.3 292.3L276.8 215.4L338.3 215.4L338.3 424.6L338.5 424.6zM473.8 427.7L381.5 320L443 320L443 215.4L504.5 215.4L504.5 320L566 320L473.8 427.7z"/>
</svg>`;

// Trash icon for every remove button (list and key/value rows, parameter and value cards). Embedded in
// this component on purpose (not a shared asset); currentColor lets it follow the theme like the
// settings icon buttons.
const SVG_TRASH = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" aria-hidden="true">
    <path fill="currentColor" d="M232.7 69.9C237.1 56.8 249.3 48 263.1 48L377 48C390.8 48 403 56.8 407.4 69.9L416 96L512 96C529.7 96 544 110.3 544 128C544 145.7 529.7 160 512 160L128 160C110.3 160 96 145.7 96 128C96 110.3 110.3 96 128 96L224 96L232.7 69.9zM128 208L512 208L512 512C512 547.3 483.3 576 448 576L192 576C156.7 576 128 547.3 128 512L128 208zM216 272C202.7 272 192 282.7 192 296L192 488C192 501.3 202.7 512 216 512C229.3 512 240 501.3 240 488L240 296C240 282.7 229.3 272 216 272zM320 272C306.7 272 296 282.7 296 296L296 488C296 501.3 306.7 512 320 512C333.3 512 344 501.3 344 488L344 296C344 282.7 333.3 272 320 272zM424 272C410.7 272 400 282.7 400 296L400 488C400 501.3 410.7 512 424 512C437.3 512 448 501.3 448 488L448 296C448 282.7 437.3 272 424 272z"/>
</svg>`;

// Warning triangle for parameter token warnings. Embedded in this component on purpose (not a
// shared asset); currentColor lets it take the theme's warning color.
const SVG_WARNING = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" aria-hidden="true">
    <path fill="currentColor" d="M320 64C334.7 64 348.2 72.1 355.2 85L571.2 485C577.9 497.4 577.6 512.4 570.4 524.5C563.2 536.6 550.1 544 536 544L104 544C89.9 544 76.8 536.6 69.6 524.5C62.4 512.4 62.1 497.4 68.8 485L284.8 85C291.8 72.1 305.3 64 320 64zM320 416C302.3 416 288 430.3 288 448C288 465.7 302.3 480 320 480C337.7 480 352 465.7 352 448C352 430.3 337.7 416 320 416zM320 224C301.8 224 287.3 239.5 288.6 257.7L296 361.7C296.9 374.2 307.4 384 319.9 384C332.5 384 342.9 374.3 343.8 361.7L351.2 257.7C352.5 239.5 338.1 224 319.8 224z"/>
</svg>`;

// Validation message for URL fields.
const URL_ERROR_MESSAGE = 'Enter a full URL, for example https://example.com.';

// The fields of one parameter value card, in display order, with their settings-style hints.
const VALUE_FIELDS = [
    { name: 'name', label: 'Name', hint: 'The value callers pass.' },
    { name: 'displayName', label: 'Display Name', hint: 'A friendly name shown in tools and forms.' },
    { name: 'description', label: 'Description', hint: 'What this value means. Supports Markdown.' }
];

// The VS Code webview bridge. Guarded so the page also renders when opened standalone.
globalThis.VSCODE = (typeof acquireVsCodeApi === 'function')
    ? acquireVsCodeApi()
    : null;

// Data injected by the host through #g4-data; null when the page is opened standalone.
globalThis.INJECTED = (() => {
    try {
        return JSON.parse(document.getElementById('g4-data').value);
    } catch {
        return null;
    }
})();

// Page state. Module-level because the webview is one page with one form: every render reads from
// it and every input handler writes to it, and the delegated listeners have no other shared owner.
globalThis.STATE = {
    automationText: '',
    definitions: [],
    errors: {},
    existingFlow: null,
    isPublishing: false,
    isSummaryEdited: false,
    lookupRequestId: 0,
    lineNumberObserver: null,
    lookupTimer: undefined,
    modal: { expandTargetId: '', openers: {} },
    openSectionIds: new Set(SECTIONS.filter((section) => section.isOpenByDefault).map((section) => section.id)),
    publishResult: null,
    saveNoteTimer: undefined,
    values: {}
};

/**
 * Splits multi-line text into one array entry per line, exactly as typed.
 *
 * @remarks
 * Compute-only. Indentation and blank lines (including trailing ones) are kept because the text is
 * Markdown, where both carry meaning; only an empty box becomes an empty array.
 *
 * @param {string} text - Textarea content.
 * @returns {string[]} One entry per line, or [] for empty text.
 */
function convertToLines(text) {
    return text === ''
        ? []
        : text.split(LINE_BREAK_PATTERN);
}

/**
 * Normalizes text into a PascalCase flow key.
 *
 * @remarks
 * Compute-only, and identical to UpdateFlowCommand.convertToPascalCase on the host: split on every
 * character that is not a letter or digit, upper-case each part's first character, keep the rest.
 *
 * @param {string} text - Typed key.
 * @returns {string} PascalCase key, or '' when the text has no letters or digits.
 */
function convertToPascalCase(text) {
    return text
        .split(KEY_SEPARATOR_PATTERN)
        .filter((part) => part !== '')
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join('');
}

/**
 * Escapes a value for safe use inside HTML content and attribute values.
 *
 * @remarks
 * Compute-only. Primitives are rendered as text; any other value is rendered as JSON so an object
 * never reaches the page as '[object Object]'.
 *
 * @param {unknown} value - Value to escape; null and undefined become ''.
 * @returns {string} Escaped text.
 */
function convertToSafeHtml(value) {
    if (value === null || value === undefined) {
        return '';
    }

    // Narrow to text before escaping: primitives directly, anything else as JSON.
    const isPrimitive = ['string', 'number', 'boolean'].includes(typeof value);
    const text = isPrimitive
        ? String(value)
        : JSON.stringify(value) ?? '';

    return text
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

/**
 * Narrows a value to text for use inside a sentence.
 *
 * @param {unknown} value - Value from the host or a stored manifest.
 * @returns {string} The string itself, or '' for any non-string value.
 */
function convertToSafeText(value) {
    return typeof value === 'string' ? value : '';
}

/**
 * Measures the automation that gets encoded: the compact form of the edited JSON.
 *
 * @param {string} text - Automation JSON text.
 * @returns {string} Size such as '3.3 KB', or '' when the text does not parse.
 */
function getAutomationSizeText(text) {
    try {
        const compactText = JSON.stringify(JSON.parse(text));
        return `${(new TextEncoder().encode(compactText).length / 1024).toFixed(1)} KB`;
    } catch {
        return '';
    }
}

/**
 * Returns the field definition with the given name.
 *
 * @param {string} name - Schema property name.
 * @returns {object | undefined} Field definition.
 */
function getDefinition(name) {
    return globalThis.STATE.definitions.find((definition) => definition.name === name);
}

/**
 * Returns the value an empty JSON editor stands for, by schema type: {} for an object (as the
 * settings editor stores an empty Capabilities box), [] for an array, and null otherwise.
 *
 * @param {object} schema - Resolved schema of the JSON field.
 * @returns {object | unknown[] | null} The empty value.
 */
function getEmptyJsonValue(schema) {
    if (schema.type === 'object') {
        return {};
    }

    return schema.type === 'array' ? [] : null;
}

/**
 * Builds the ordered field definitions from the flow schema and the UI policy.
 *
 * @remarks
 * Compute-only. Each definition carries the resolved schema, the control derived from the schema
 * type (unless the policy names one), the section, label, help text, and required flag.
 *
 * @param {Record<string, object>} schemas - components.schemas from the flow OpenAPI document.
 * @returns {object[]} Visible field definitions sorted by section order.
 */
function getFieldDefinitions(schemas) {
    // Chooses the control for a resolved schema: text, list, parameters, object, map, or json.
    // Text that is Markdown (summary, description) is named by the policy instead.
    const getControlName = (schema) => {
        const itemSchema = resolveSchema(schema.items ?? {}, schemas);
        const isArray = schema.type === 'array';
        const isStringArray = isArray && itemSchema.type === 'string';
        const isObjectArray = isArray && itemSchema.properties !== undefined;
        const isObject = schema.properties !== undefined;
        const isMap = schema.type === 'object' && schema.additionalProperties !== undefined && !isObject;

        if (schema.type === 'string') {
            return 'text';
        }

        if (isStringArray) {
            return 'list';
        }

        if (isObjectArray) {
            return 'parameters';
        }

        if (isObject) {
            return 'object';
        }

        return isMap ? 'map' : 'json';
    };

    // Without the root schema there is nothing to render.
    const manifestSchema = schemas?.[MANIFEST_SCHEMA_NAME];

    if (!manifestSchema?.properties) {
        return [];
    }

    // Merge each schema property with its policy; unknown backend fields go to Additional Fields.
    const requiredNames = new Set(manifestSchema.required ?? []);
    const definitions = Object.entries(manifestSchema.properties).map(([name, propertySchema]) => {
        const policy = FIELD_POLICY[name] ?? { section: 'additional', order: 100, label: getLabelText(name) };
        const schema = resolveSchema(propertySchema, schemas);
        const hint = FIELD_HINTS[name] ?? propertySchema.description ?? schema.description ?? '';

        return {
            control: policy.control ?? getControlName(schema),
            hint,
            isRequired: requiredNames.has(name) || policy.isRequired === true,
            label: policy.label ?? getLabelText(name),
            name,
            order: policy.order ?? 100,
            schema,
            section: policy.section,
            urlProperties: policy.urlProperties ?? []
        };
    });

    // Drop hidden fields and order the rest for rendering.
    return definitions
        .filter((definition) => definition.section !== 'hidden')
        .sort((left, right) => left.order - right.order || left.name.localeCompare(right.name));
}

/**
 * Tests JSON text and describes the first problem, in the settings editor wording.
 *
 * @remarks
 * Compute-only. Besides syntax, the parsed value must have the shape the field stores: a JSON
 * object for an object field (Context) and a JSON array for an array field (parameter values).
 *
 * @param {string} text - JSON text.
 * @param {{ guidance: string, expectedType?: string }} options - Guidance sentence and the expected schema type.
 * @returns {string} '' when the text is valid; otherwise the error line.
 */
function getJsonError(text, options) {
    // Parse first; a syntax error is reported with the parser's own message.
    let value;

    try {
        value = JSON.parse(text);
    } catch (error) {
        return `Invalid JSON - ${resolveErrorMessage(error)}. ${options.guidance}`;
    }

    // Then check the shape the field stores.
    const isObject = value !== null && typeof value === 'object' && !Array.isArray(value);
    const isWrongObject = options.expectedType === 'object' && !isObject;
    const isWrongArray = options.expectedType === 'array' && !Array.isArray(value);

    if (isWrongObject) {
        return `Enter a JSON object, for example { "key": "value" }. ${options.guidance}`;
    }

    if (isWrongArray) {
        return `Enter a JSON array, for example [ { "name": "One" } ]. ${options.guidance}`;
    }

    return '';
}

/**
 * Turns a camelCase schema name into a readable label (projectUrl → Project Url).
 *
 * @param {string} name - Schema property name.
 * @returns {string} Label text.
 */
function getLabelText(name) {
    const spaced = name.replaceAll(CAMEL_CASE_BOUNDARY_PATTERN, '$1 $2');

    return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/**
 * Converts the form state into manifest values for the host.
 *
 * @remarks
 * Compute-only. Only schema fields are sent; the host adds automation and the fixed fields.
 * Assumes testFormValues() passed, so every JSON text is valid.
 *
 * @returns {Record<string, unknown>} Manifest values keyed by schema property name.
 */
function getManifestValues() {
    // Converts one parameter row back into a PluginParameterModel, keeping unknown properties.
    const getParameterValue = (row, definition) => {
        const parameter = { ...row.extra };

        for (const property of getParameterProperties(definition)) {
            const rawValue = row.fields[property.name];

            if (property.kind === 'checkbox') {
                parameter[property.name] = rawValue === true;
            } else if (property.kind === 'markdown' || property.kind === 'lines') {
                parameter[property.name] = convertToLines(rawValue);
            } else {
                parameter[property.name] = rawValue.trim();
            }
        }

        // Value cards back to PluginParameterModel items; properties the card does not show are kept.
        parameter[PARAMETER_VALUES_PROPERTY] = row.values.map((valueRow) => ({
            ...valueRow.extra,
            name: valueRow.name.trim(),
            displayName: valueRow.displayName.trim(),
            description: convertToLines(valueRow.description)
        }));

        return parameter;
    };

    // Convert each field from its editing shape back into its manifest shape.
    const values = {};

    for (const definition of globalThis.STATE.definitions) {
        const value = globalThis.STATE.values[definition.name];

        switch (definition.control) {
            case 'key':
                values[definition.name] = convertToPascalCase(value);
                break;
            case 'markdown':
                values[definition.name] = convertToLines(value);
                break;
            case 'list':
                values[definition.name] = value.map((entry) => entry.trim()).filter((entry) => entry !== '');
                break;
            case 'object':
                values[definition.name] = { ...value };
                break;
            case 'map':
                values[definition.name] = Object.fromEntries(value
                    .filter((row) => row.key.trim() !== '')
                    .map((row) => [row.key.trim(), row.value]));
                break;
            case 'parameters':
                values[definition.name] = value.map((row) => getParameterValue(row, definition));
                break;
            case 'json':
                values[definition.name] = value.trim() === '' ? getEmptyJsonValue(definition.schema) : JSON.parse(value);
                break;
            default:
                values[definition.name] = value.trim();
        }
    }

    return values;
}

/**
 * Returns the names of the parameters in the form, trimmed, without blank names.
 *
 * @returns {string[]} Parameter names in form order.
 */
function getParameterNames() {
    const definition = globalThis.STATE.definitions.find((item) => item.control === 'parameters');
    const rows = definition ? globalThis.STATE.values[definition.name] : [];

    return rows
        .map((row) => (row.fields.name ?? '').trim())
        .filter((name) => name !== '');
}

/**
 * Describes the editable properties of one parameter row, from the parameter item schema.
 *
 * @remarks
 * Compute-only. Strings become text inputs, booleans toggle switches, the description a Markdown
 * text box, and other string arrays plain one-entry-per-line text. `values` is edited as nested
 * value cards (see newParameterRow), and any other nested object is not edited but kept. Identifying
 * properties (name, display name, type, default) come first; the rest keep schema order.
 *
 * @param {object} definition - The parameters field definition.
 * @returns {{ name: string, kind: string, label: string, hint: string }[]} Row properties.
 */
function getParameterProperties(definition) {
    const schemas = globalThis.INJECTED?.schemas ?? {};
    const itemSchema = resolveSchema(definition.schema.items ?? {}, schemas);

    // Rank identifying properties first; everything else keeps its schema position.
    const getRank = (name) => {
        const rank = PARAMETER_PROPERTY_ORDER.indexOf(name);
        return rank === -1 ? PARAMETER_PROPERTY_ORDER.length : rank;
    };

    // Hidden properties (dependsOn) are not edited; newParameterRow keeps their values in `extra`.
    const entries = Object.entries(itemSchema.properties ?? {})
        .filter(([name]) => !PARAMETER_HIDDEN_PROPERTIES.includes(name))
        .sort(([left], [right]) => getRank(left) - getRank(right));

    // Map each property schema type to the input kind that edits it.
    return entries.map(([name, propertySchema]) => {
        const schema = resolveSchema(propertySchema, schemas);
        const itemType = resolveSchema(schema.items ?? {}, schemas).type;
        const isStringArray = schema.type === 'array' && itemType === 'string';
        let kind = 'json';

        if (schema.type === 'string') {
            kind = 'text';
        } else if (schema.type === 'boolean') {
            kind = 'checkbox';
        } else if (isStringArray) {
            kind = PARAMETER_MARKDOWN_PROPERTIES.includes(name) ? 'markdown' : 'lines';
        }

        const hint = PARAMETER_HINTS[name] ?? propertySchema.description ?? '';

        return { name, kind, label: getLabelText(name), hint };
    }).filter((property) => property.kind !== 'json');
}

/**
 * Finds parameter token problems in the automation text.
 *
 * @remarks
 * Compute-only. A strict token names a parameter; a parameter no strict token names is unused, and
 * a strict token naming no parameter is unknown (names are case-sensitive; a case-only difference
 * adds a suggestion). Any parameter-like text that is not exactly a strict token is broken.
 *
 * @param {string} text - Automation JSON text.
 * @param {string[]} parameterNames - Names of the parameters in the form (blank names excluded).
 * @returns {{ broken: object[], unknown: object[], unused: string[] }} Issues; positions are offsets into the text.
 */
function getParameterTokenIssues(text, parameterNames) {
    const getLine = (offset) => text.slice(0, offset).split('\n').length;

    // Strict tokens: the names they reference and the ranges they cover.
    const strictMatches = [...text.matchAll(STRICT_PARAMETER_TOKEN_PATTERN)];
    const strictRanges = strictMatches.map((match) => [match.index, match.index + match[0].length]);
    const usedNames = new Set(strictMatches.map((match) => match[1]));
    const knownNames = new Set(parameterNames);

    // Unknown names, with a suggestion when only the case differs.
    const unknown = strictMatches
        .filter((match) => !knownNames.has(match[1]))
        .map((match) => ({
            end: match.index + match[0].length,
            line: getLine(match.index),
            name: match[1],
            start: match.index,
            suggestion: parameterNames.find((name) => name.toLowerCase() === match[1].toLowerCase()) ?? ''
        }));

    // Broken tokens: parameter-like text that no strict token covers exactly.
    const broken = [...text.matchAll(LOOSE_PARAMETER_TOKEN_PATTERN)]
        .filter((match) => !strictRanges.some(([start, end]) => start === match.index && end === match.index + match[0].length))
        .map((match) => ({ end: match.index + match[0].length, line: getLine(match.index), start: match.index, text: match[0] }));

    // Unused parameters, once each, in form order.
    const unused = [...new Set(parameterNames)].filter((name) => !usedNames.has(name));

    return { broken, unknown, unused };
}

/**
 * Lists the parameter token warnings as plain sentences, for the publish confirmation.
 *
 * @param {{ broken: object[], unknown: object[], unused: string[] }} issues - Result of getParameterTokenIssues.
 * @returns {string[]} One sentence per warning.
 */
function getParameterWarningTexts(issues) {
    return [
        ...issues.unused.map((name) => `Unused parameter '${name}': the automation has no {{$ Parameters.${name} }}.`),
        ...issues.unknown.map((issue) => {
            const suggestionText = issue.suggestion === '' ? '' : ` Did you mean '${issue.suggestion}'?`;
            return `Line ${issue.line}: unknown parameter '${issue.name}'.${suggestionText}`;
        }),
        ...issues.broken.map((issue) => `Line ${issue.line}: broken parameter token '${issue.text}'. Use {{$ Parameters.Name }}.`)
    ];
}

/**
 * Closes one modal layer and returns focus to where the user was.
 *
 * @remarks
 * Closing the expanded editor returns focus to the text box it edits; closing the Markdown
 * reference returns focus to the button that opened it (in the page or in the expanded editor).
 *
 * @param {'expand' | 'reference'} layer - Modal layer to close.
 */
function hideModal(layer) {
    const modal = globalThis.STATE.modal;
    const layerElement = document.getElementById(`flow-publisher-${layer}-layer`);

    if (!layerElement) {
        return;
    }

    layerElement.remove();

    // Pick the element that gets focus back, then forget this layer's opener.
    const focusTarget = layer === 'expand'
        ? document.getElementById(modal.expandTargetId)
        : modal.openers[layer];

    delete modal.openers[layer];

    if (layer === 'expand') {
        modal.expandTargetId = '';
    }

    if (focusTarget?.isConnected) {
        focusTarget.focus();
    }
}

/**
 * Moves an array item to a new index when the target index is in range.
 *
 * @param {unknown[]} items - Array to reorder in place.
 * @param {number} fromIndex - Current index.
 * @param {number} toIndex - Target index.
 */
function moveItem(items, fromIndex, toIndex) {
    const isInRange = toIndex >= 0 && toIndex < items.length;

    if (!isInRange) {
        return;
    }

    const [item] = items.splice(fromIndex, 1);
    items.splice(toIndex, 0, item);
}

/**
 * Converts a manifest (defaults, stored flow) into form state values.
 *
 * @remarks
 * Compute-only. Every definition gets a value of the shape its control edits, so rendering and
 * input handling never meet a missing value.
 *
 * @param {Record<string, unknown>} manifest - Manifest-like values.
 * @param {object[]} definitions - Field definitions.
 * @returns {Record<string, unknown>} Form state values.
 */
function newFormValues(manifest, definitions) {
    // Builds an object field value (author) with one string per schema property.
    const newObjectValue = (value, definition) => {
        const result = {};

        for (const name of Object.keys(definition.schema.properties ?? {})) {
            result[name] = convertToSafeText(value?.[name]);
        }

        return result;
    };

    // Map rows keep string values as-is and show anything else as JSON text.
    const newMapRows = (value) => Object.entries(value ?? {}).map(([key, entry]) => {
        const text = typeof entry === 'string' ? entry : JSON.stringify(entry);
        return { key, value: text };
    });

    // Convert each field from its manifest shape into its editing shape.
    const values = {};

    for (const definition of definitions) {
        const value = manifest?.[definition.name];
        const isArrayValue = Array.isArray(value);
        const isMissing = value === null || value === undefined;

        switch (definition.control) {
            case 'markdown':
                values[definition.name] = isArrayValue ? value.filter((item) => typeof item === 'string').join('\n') : '';
                break;
            case 'list':
                values[definition.name] = isArrayValue ? value.filter((item) => typeof item === 'string') : [];
                break;
            case 'object':
                values[definition.name] = newObjectValue(value, definition);
                break;
            case 'map':
                values[definition.name] = newMapRows(value);
                break;
            case 'parameters':
                values[definition.name] = (isArrayValue ? value : []).map((parameter) => newParameterRow(parameter, definition));
                break;
            case 'json':
                values[definition.name] = isMissing ? '' : JSON.stringify(value, null, 4);
                break;
            default:
                values[definition.name] = convertToSafeText(value);
        }
    }

    return values;
}

/**
 * Builds one parameter row state from a stored parameter (or an empty one).
 *
 * @remarks
 * Compute-only. Properties the form does not edit are kept in `extra` and sent back unchanged,
 * so loading and re-publishing an existing flow never drops data the form cannot show. Stored
 * values become value cards. Cards start closed, like the settings item cards.
 *
 * @param {Record<string, unknown>} parameter - Stored parameter.
 * @param {object} definition - The parameters field definition.
 * @returns {{ extra: object, fields: object, isOpen: boolean, values: object[] }} Row state.
 */
function newParameterRow(parameter, definition) {
    // Split the stored parameter into edited properties, the values list, and pass-through extras.
    const properties = getParameterProperties(definition);
    const knownNames = new Set([...properties.map((property) => property.name), PARAMETER_VALUES_PROPERTY]);
    const extra = Object.fromEntries(Object.entries(parameter ?? {}).filter(([name]) => !knownNames.has(name)));
    const storedValues = parameter?.[PARAMETER_VALUES_PROPERTY];
    const fields = {};

    // Convert each edited property into the shape its input edits.
    for (const property of properties) {
        const value = parameter?.[property.name];
        const isArrayValue = Array.isArray(value);

        if (property.kind === 'checkbox') {
            fields[property.name] = value === true;
        } else if (property.kind === 'markdown' || property.kind === 'lines') {
            fields[property.name] = isArrayValue ? value.filter((item) => typeof item === 'string').join('\n') : '';
        } else {
            fields[property.name] = convertToSafeText(value);
        }
    }

    // Only object entries can be value cards; anything else in the list cannot be shown or kept.
    const values = (Array.isArray(storedValues) ? storedValues : [])
        .filter((value) => value !== null && typeof value === 'object' && !Array.isArray(value))
        .map((value) => newValueRow(value));

    return { extra, fields, isOpen: false, values };
}

/**
 * Builds one value card state from a stored parameter value (or an empty one).
 *
 * @remarks
 * Compute-only. Name, Display Name, and Description are edited; every other property (type,
 * default, nested values) is kept in `extra` and sent back unchanged. Cards start closed.
 *
 * @param {Record<string, unknown>} value - Stored value (a PluginParameterModel).
 * @returns {{ description: string, displayName: string, extra: object, isOpen: boolean, name: string }} Value card state.
 */
function newValueRow(value) {
    const editedNames = new Set(VALUE_FIELDS.map((field) => field.name));
    const extra = Object.fromEntries(Object.entries(value ?? {}).filter(([name]) => !editedNames.has(name)));
    const description = Array.isArray(value?.description)
        ? value.description.filter((line) => typeof line === 'string').join('\n')
        : '';

    return {
        description,
        displayName: convertToSafeText(value?.displayName),
        extra,
        isOpen: false,
        name: convertToSafeText(value?.name)
    };
}

/**
 * Handles clicks anywhere in the page body through data-action attributes (event delegation), so
 * re-rendered markup never needs listeners re-attached.
 *
 * @remarks
 * Buttons inside a card header carry their own action, and closest() finds the button before the
 * header, so pressing Remove or a move button never also folds the card.
 *
 * @param {MouseEvent} event - Click event.
 */
function onAppClick(event) {
    const target = event.target.closest('[data-action]');

    if (!target) {
        return;
    }

    const state = globalThis.STATE;
    const action = target.dataset.action;
    const path = target.dataset.path;
    const index = Number(target.dataset.index);

    // Section and card folding only flip visibility in place, like the settings editor.
    if (action === 'toggle-section') {
        setSectionOpen(target.dataset.sectionId, !state.openSectionIds.has(target.dataset.sectionId));
        return;
    }

    if (action === 'toggle-parameter-card') {
        const row = state.values[path][index];
        row.isOpen = !row.isOpen;
        setCollapseState({ bodyId: `parameter-${index}-body`, chevronId: `parameter-${index}-chevron`, isOpen: row.isOpen });
        return;
    }

    // Value cards live inside a parameter card: data-index is the parameter, data-value-index the value.
    const valueIndex = Number(target.dataset.valueIndex);

    if (action === 'toggle-value-card') {
        const valueRow = state.values[path][index].values[valueIndex];
        valueRow.isOpen = !valueRow.isOpen;
        setCollapseState({
            bodyId: `parameter-${index}-value-${valueIndex}-body`,
            chevronId: `parameter-${index}-value-${valueIndex}-chevron`,
            isOpen: valueRow.isOpen
        });
        return;
    }

    // JSON Format checks and pretty-prints one editor in place.
    if (action === 'format-json') {
        setFormattedJson(target.dataset.targetId);
        return;
    }

    // A token warning selects its text in the Automation box.
    if (action === 'select-automation-text') {
        setAutomationSelection(Number(target.dataset.start), Number(target.dataset.end));
        return;
    }

    // Text box tools open a modal over the page; the page itself is not re-rendered.
    if (action === 'open-markdown-reference') {
        showMarkdownReference(target);
        return;
    }

    if (action === 'open-expand-editor') {
        showExpandEditor(target.dataset.targetId, target);
        return;
    }

    // Every other action mutates state first; the form is re-rendered from it below.
    switch (action) {
        case 'remove-list-row':
        case 'remove-map-row':
        case 'remove-parameter':
            state.values[path].splice(index, 1);
            break;
        case 'add-list-row':
            state.values[path].push('');
            break;
        case 'add-map-row':
            state.values[path].push({ key: '', value: '' });
            break;
        case 'add-parameter':
            state.values[path].push({ ...newParameterRow({}, getDefinition(path)), isOpen: true });
            break;
        case 'move-parameter-up':
            moveItem(state.values[path], index, index - 1);
            break;
        case 'move-parameter-down':
            moveItem(state.values[path], index, index + 1);
            break;
        case 'add-value':
            state.values[path][index].values.push({ ...newValueRow({}), isOpen: true });
            break;
        case 'remove-value':
            state.values[path][index].values.splice(valueIndex, 1);
            break;
        case 'move-value-up':
            moveItem(state.values[path][index].values, valueIndex, valueIndex - 1);
            break;
        case 'move-value-down':
            moveItem(state.values[path][index].values, valueIndex, valueIndex + 1);
            break;
        case 'load-existing':
            setFormFromManifest(state.existingFlow);
            break;
        case 'dismiss-result':
            state.publishResult = null;
            break;
        default:
            return;
    }

    // Structural edits invalidate indexed error paths, so stale errors are dropped.
    if (action !== 'dismiss-result') {
        state.errors = {};
    }

    showForm();

    // A new list entry or value is ready for typing.
    if (action === 'add-list-row') {
        const lastIndex = state.values[path].length - 1;
        document.querySelector(`[data-path="${path}"][data-list-index="${lastIndex}"]`)?.focus();
    }

    if (action === 'add-value') {
        const lastValueIndex = state.values[path][index].values.length - 1;
        document.getElementById(`field-${path}-${index}-values-${lastValueIndex}-name`)?.focus();
    }
}

/**
 * Normalizes the key when the user leaves the Key field.
 *
 * @param {FocusEvent} event - Focus-out event.
 */
function onAppFocusOut(event) {
    const target = event.target;

    // Normalize the key on blur so the stored value always matches the preview.
    if (target.dataset.control === 'key') {
        const key = convertToPascalCase(target.value);
        target.value = key;
        setKeyValue(key);
    }
}

/**
 * Writes typed values into state without re-rendering, so focus and caret stay where they are.
 *
 * @param {Event} event - Input or change event.
 */
function onAppInput(event) {
    const target = event.target;
    const state = globalThis.STATE;
    const dataset = target.dataset;
    const value = target.type === 'checkbox' ? target.checked : target.value;

    // Text boxes are fully handled on 'input'. Their 'change' fires again on blur, which is the
    // mousedown of the next click; handling it there would rebuild warning buttons under the mouse
    // and swallow that click. Only toggle switches need 'change'.
    if (event.type === 'change' && target.type !== 'checkbox') {
        return;
    }

    // JSON and Markdown boxes keep their line numbers in step with the text.
    if (dataset.lineNumbers !== undefined) {
        showFieldLineNumbers(target);
    }

    // Automation editor: kept apart from the manifest values, since the host owns that field.
    if (dataset.automation !== undefined) {
        state.automationText = value;
        setJsonEditorError(target);
        showAutomationSize();
        showParameterWarnings();
        return;
    }

    // Value card field; the value card title follows the name and display name as they are typed.
    if (dataset.valueIndex !== undefined) {
        const rowIndex = Number(dataset.parameterIndex);
        const valueIndex = Number(dataset.valueIndex);
        state.values[dataset.path][rowIndex].values[valueIndex][dataset.valueProperty] = value;
        setFieldError(dataset.errorPath, '');
        showValueTitle({ path: dataset.path, rowIndex, valueIndex });
        return;
    }

    // Parameter row property; the card title follows the name and type as they are typed.
    if (dataset.parameterIndex !== undefined) {
        const rowIndex = Number(dataset.parameterIndex);
        state.values[dataset.path][rowIndex].fields[dataset.property] = value;
        setFieldError(dataset.errorPath, '');
        setJsonEditorError(target);
        showParameterTitle(dataset.path, rowIndex);
        showParameterWarnings();
        return;
    }

    // Key/value map row part.
    if (dataset.mapIndex !== undefined) {
        state.values[dataset.path][Number(dataset.mapIndex)][dataset.part] = value;
        setFieldError(dataset.errorPath, '');
        return;
    }

    // Add-entry list row; typing also clears the list's "add at least one entry" error.
    if (dataset.listIndex !== undefined) {
        state.values[dataset.path][Number(dataset.listIndex)] = value;
        setFieldError(dataset.errorPath, '');
        setFieldError(dataset.path, '');
        return;
    }

    if (!dataset.path) {
        return;
    }

    // Object sub-field (author.name) or top-level field.
    const [name, property] = dataset.path.split('.');

    if (property) {
        state.values[name][property] = value;
    } else {
        state.values[name] = value;
    }

    setFieldError(dataset.path, '');
    setJsonEditorError(target);

    // The key preview and existence lookup follow every key or namespace edit.
    const isIdentityField = name === 'key' || name === 'namespace';

    if (isIdentityField) {
        showKeyPreview();
        startFlowLookup();
    }

    // A typed summary stops following the key.
    if (name === 'summary') {
        state.isSummaryEdited = true;
    }
}

/**
 * Keeps a text box's line numbers aligned while the box scrolls. Registered as a capturing
 * listener, because scroll events do not bubble.
 *
 * @param {Event} event - Scroll event.
 */
function onAppScroll(event) {
    const target = event.target;

    if (target.dataset?.lineNumbers === undefined) {
        return;
    }

    const gutter = document.getElementById(`${target.id}-line-numbers`);

    if (gutter) {
        gutter.scrollTop = target.scrollTop;
    }
}

/**
 * Closes the top modal layer on Escape: the Markdown reference first, then the expanded editor.
 *
 * @param {KeyboardEvent} event - Key event.
 */
function onDocumentKeyDown(event) {
    if (event.key !== 'Escape') {
        return;
    }

    const layer = ['reference', 'expand'].find((name) => document.getElementById(`flow-publisher-${name}-layer`));

    if (layer) {
        event.preventDefault();
        hideModal(layer);
    }
}

/**
 * Applies messages from the extension host: existence lookups and publish results.
 *
 * @param {MessageEvent} event - Message from the host.
 */
function onHostMessage(event) {
    const message = event.data;
    const state = globalThis.STATE;

    // Maps server field errors (C# property names) onto form paths, including the automation
    // editor; unknown keys stay in the banner.
    const getServerErrors = (fieldErrors) => {
        const errors = {};

        for (const [name, messages] of Object.entries(fieldErrors)) {
            const path = name.charAt(0).toLowerCase() + name.slice(1);
            const texts = [messages].flat().filter((text) => typeof text === 'string');
            const isFormPath = getDefinition(path) !== undefined || path === 'automation';

            if (isFormPath && texts.length > 0) {
                errors[path] = texts.join(' ');
            }
        }

        return errors;
    };

    // Existence lookup: ignore answers that a newer key or namespace edit has already superseded.
    if (message?.command === 'flowLookup') {
        if (message.requestId !== state.lookupRequestId) {
            return;
        }

        state.existingFlow = message.existingFlow ?? null;
        showBanners();
        return;
    }

    if (message?.command !== 'publishResult') {
        return;
    }

    // The user cancelled at the warnings confirmation: unlock the action bar, change nothing else.
    if (message.isCancelled === true) {
        state.isPublishing = false;
        showActionBar();
        showSaveNote('Publish cancelled.');
        return;
    }

    // Record the publish outcome and attach server field errors to the matching fields.
    const isSuccess = message.isSuccess === true;

    state.isPublishing = false;
    state.publishResult = { isSuccess, message: convertToSafeText(message.message) };
    state.errors = getServerErrors(message.fieldErrors ?? {});

    if (message.existingFlow) {
        state.existingFlow = message.existingFlow;
    }

    // The bot file now holds the published automation, so Reset to Defaults restores that text.
    const isAutomationSaved = typeof message.savedAutomationText === 'string' && globalThis.INJECTED?.automation;

    if (isAutomationSaved) {
        globalThis.INJECTED.automation.automationText = message.savedAutomationText;
    }

    // Open whatever holds an error, re-render, and bring the result banner into view.
    setErrorSectionsOpen();
    showForm();
    showActionBar();
    showSaveNote(isSuccess ? 'Flow published.' : 'Publish failed.');
    document.getElementById('app').scrollTop = 0;
}

/**
 * Handles clicks inside the modal region: close buttons and the Markdown reference button.
 *
 * @remarks
 * Clicking the backdrop does nothing on purpose, so a stray click never closes an editor.
 *
 * @param {MouseEvent} event - Click event.
 */
function onModalClick(event) {
    const target = event.target.closest('[data-action]');

    if (target?.dataset.action === 'close-modal') {
        hideModal(target.dataset.layer);
        return;
    }

    if (target?.dataset.action === 'open-markdown-reference') {
        showMarkdownReference(target);
        return;
    }

    // Format in the JSON editor: format the field it edits, then show the result in the editor.
    if (target?.dataset.action === 'format-expanded-json') {
        const editor = document.getElementById('flow-publisher-expand-textarea');
        const sourceId = globalThis.STATE.modal.expandTargetId;

        setFormattedJson(sourceId);
        editor.value = document.getElementById(sourceId)?.value ?? editor.value;
        showLineNumbers();
        showExpandError();
        editor.focus();
    }
}

/**
 * Copies the expanded editor's text into the text box it edits, live, through that box's own
 * input path (state, error clearing, summary tracking).
 *
 * @param {Event} event - Input event.
 */
function onModalInput(event) {
    const target = event.target;
    const source = document.getElementById(globalThis.STATE.modal.expandTargetId);

    if (target.id !== 'flow-publisher-expand-textarea' || !source) {
        return;
    }

    source.value = target.value;
    source.dispatchEvent(new Event('input', { bubbles: true }));
    showLineNumbers();
    showExpandError();
}

/**
 * Validates the form and sends the manifest values to the host for publishing.
 */
function onPublishClick() {
    const state = globalThis.STATE;

    // Validate; on failure open the sections and cards that hold errors and focus the first one.
    state.errors = testFormValues();
    const errorCount = Object.keys(state.errors).length;

    if (errorCount > 0) {
        const fieldCountText = errorCount === 1 ? '1 field' : `${errorCount} fields`;

        state.publishResult = { isSuccess: false, message: `Fix ${fieldCountText} before publishing.` };
        setErrorSectionsOpen();
        showForm();
        document.querySelector('[data-invalid="true"] input, [data-invalid="true"] textarea')?.focus();
        return;
    }

    // Lock the action bar until the host answers with publishResult.
    state.isPublishing = true;
    state.publishResult = null;
    showActionBar();
    showBanners();
    showSaveNote('Sending the flow to the G4 Hub…');

    // Token warnings travel with the publish; the host asks for confirmation when there are any.
    const issues = getParameterTokenIssues(state.automationText, getParameterNames());

    globalThis.VSCODE?.postMessage({
        command: 'publish',
        automationText: state.automationText,
        values: getManifestValues(),
        warnings: getParameterWarningTexts(issues)
    });
}

/**
 * Restores every field to the bot's defaults (Reset to Defaults), like the settings editor's reset.
 */
function onResetClick() {
    const state = globalThis.STATE;
    const injected = globalThis.INJECTED ?? {};

    // Rebuild the values from the defaults and the bot file; the default summary follows the key again.
    state.values = newFormValues(injected.defaults ?? {}, state.definitions);
    state.automationText = convertToSafeText(injected.automation?.automationText);
    state.errors = {};
    state.isSummaryEdited = false;
    state.publishResult = null;

    // Re-render and re-check whether the default identity already exists.
    showForm();
    showSaveNote('Defaults restored.');
    startFlowLookup();
}

/**
 * Resolves a readable message from any caught value without default object stringification.
 *
 * @param {unknown} error - Value caught in a catch clause.
 * @returns {string} Readable message.
 */
function resolveErrorMessage(error) {
    if (error instanceof Error) {
        return error.message;
    }

    if (typeof error === 'string') {
        return error;
    }

    // Any other thrown value gets a readable JSON form instead of '[object Object]'.
    try {
        return JSON.stringify(error) ?? 'Unknown error';
    } catch {
        return 'Unknown error';
    }
}

/**
 * Follows a `$ref` (and a single-entry `allOf`) to the referenced schema.
 *
 * @param {object} schema - Property schema that may reference another schema.
 * @param {Record<string, object>} schemas - All schemas by name.
 * @returns {object} Resolved schema (the input itself when it has no reference).
 */
function resolveSchema(schema, schemas) {
    const reference = schema?.$ref ?? schema?.allOf?.[0]?.$ref;

    if (!reference) {
        return schema ?? {};
    }

    const name = reference.split('/').pop();

    return schemas?.[name] ?? {};
}

/**
 * Selects a range of the Automation box and scrolls it into view (used by token warnings).
 *
 * @param {number} start - Start offset in the automation text.
 * @param {number} end - End offset in the automation text.
 */
function setAutomationSelection(start, end) {
    const textarea = document.querySelector('[data-automation="true"]');

    if (!textarea) {
        return;
    }

    // Select the range, then bring its line near the top of the box.
    const lineHeight = Number.parseFloat(getComputedStyle(textarea).lineHeight) || 18;
    const lineIndex = textarea.value.slice(0, start).split('\n').length - 1;

    textarea.focus();
    textarea.setSelectionRange(start, end);
    textarea.scrollTop = Math.max(0, (lineIndex - 2) * lineHeight);
}

/**
 * Shows or hides a collapsible body and turns its chevron, in place (the settings fold behaviour).
 *
 * @param {{ bodyId: string, chevronId: string, isOpen: boolean }} options - Target ids and the new state.
 */
function setCollapseState(options) {
    document.getElementById(options.bodyId)?.classList.toggle('flow-publisher-is-collapsed', !options.isOpen);
    document.getElementById(options.chevronId)?.classList.toggle('flow-publisher-is-open', options.isOpen);
}

/**
 * Opens every section and parameter card that contains an error, so no error is hidden in a
 * collapsed section.
 */
function setErrorSectionsOpen() {
    const state = globalThis.STATE;

    for (const path of Object.keys(state.errors)) {
        const [name, rowIndex, property, valueIndex] = path.split('.');
        const definition = getDefinition(name);

        // The automation editor has its own section and no field definition.
        if (name === 'automation') {
            state.openSectionIds.add('automation');
            continue;
        }

        if (!definition) {
            continue;
        }

        state.openSectionIds.add(definition.section);

        // A parameter error also opens its card, and the value card when the error is in one.
        const isParameterError = definition.control === 'parameters' && rowIndex !== undefined;

        if (isParameterError) {
            const row = state.values[name][Number(rowIndex)];
            const isValueError = property === PARAMETER_VALUES_PROPERTY && valueIndex !== undefined;

            row.isOpen = true;

            if (isValueError) {
                row.values[Number(valueIndex)].isOpen = true;
            }
        }
    }
}

/**
 * Shows or clears one field's error in place, without re-rendering.
 *
 * @param {string | undefined} path - Error path of the field.
 * @param {string} message - Error text; '' clears the error.
 */
function setFieldError(path, message) {
    if (!path) {
        return;
    }

    // Record the error in state so a later re-render keeps it.
    const state = globalThis.STATE;
    const isCleared = message === '';

    if (isCleared) {
        delete state.errors[path];
    } else {
        state.errors[path] = message;
    }

    // Update the field's error line and invalid marker directly.
    const errorElement = document.getElementById(`error-${path}`);

    if (!errorElement) {
        return;
    }

    errorElement.textContent = message;
    errorElement.closest('.flow-publisher-field')?.setAttribute('data-invalid', String(!isCleared));
}

/**
 * Replaces the form values with a stored manifest (Load existing values).
 *
 * @param {Record<string, unknown> | null} manifest - Stored flow manifest.
 */
function setFormFromManifest(manifest) {
    if (!manifest) {
        return;
    }

    // Stored values replace the form; the stored summary is the user's text, so it stops following the key.
    const state = globalThis.STATE;
    state.values = newFormValues(manifest, state.definitions);
    state.isSummaryEdited = true;
    state.publishResult = { isSuccess: true, message: 'Loaded the stored values of this flow.' };
}

/**
 * Checks and pretty-prints one JSON editor (the settings Format button).
 *
 * @param {string} textareaId - Id of the JSON textarea.
 */
function setFormattedJson(textareaId) {
    const textarea = document.getElementById(textareaId);

    if (!textarea) {
        return;
    }

    // Invalid JSON is reported on the field and left untouched for the user to fix.
    const jsonOptions = { expectedType: textarea.dataset.jsonType, guidance: JSON_FORMAT_GUIDANCE };
    const jsonError = textarea.value.trim() === '' ? '' : getJsonError(textarea.value, jsonOptions);

    if (jsonError !== '') {
        setFieldError(textarea.dataset.errorPath, jsonError);
        return;
    }

    // Replace the text with its formatted form and write it back through the normal input path.
    const formattedText = textarea.value.trim() === '' ? '' : JSON.stringify(JSON.parse(textarea.value), null, 4);
    textarea.value = formattedText;
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
}

/**
 * Validates a JSON editor while typing and shows the result in place, like the settings
 * Capabilities box; other inputs are ignored.
 *
 * @param {HTMLElement} target - The edited control.
 */
function setJsonEditorError(target) {
    if (target.dataset.kind !== 'json') {
        return;
    }

    // An empty editor is valid; anything else must parse to the expected shape.
    const text = target.value;
    const jsonOptions = { expectedType: target.dataset.jsonType, guidance: JSON_EDIT_GUIDANCE };
    const message = text.trim() === '' ? '' : getJsonError(text, jsonOptions);

    setFieldError(target.dataset.errorPath, message);
}

/**
 * Applies a normalized key: updates state, refreshes the summary default, preview, and lookup.
 *
 * @param {string} key - Normalized key.
 */
function setKeyValue(key) {
    const state = globalThis.STATE;
    state.values.key = key;

    // Keep the default summary in step with the key until the user edits the summary.
    const summaryTemplate = globalThis.INJECTED?.summaryTemplate;
    const isSummaryFollowing = !state.isSummaryEdited && typeof summaryTemplate === 'string' && key !== '';

    if (isSummaryFollowing) {
        state.values.summary = summaryTemplate.replace('{key}', key);
        const summaryInput = document.querySelector('[data-path="summary"]');

        if (summaryInput) {
            summaryInput.value = state.values.summary;
            showFieldLineNumbers(summaryInput);
        }
    }

    // Refresh the preview and ask whether the new identity already exists.
    showKeyPreview();
    startFlowLookup();
}

/**
 * Opens or closes one page section and remembers the choice across re-renders.
 *
 * @param {string} sectionId - Section id.
 * @param {boolean} isOpen - New state.
 */
function setSectionOpen(sectionId, isOpen) {
    const openSectionIds = globalThis.STATE.openSectionIds;

    if (isOpen) {
        openSectionIds.add(sectionId);
    } else {
        openSectionIds.delete(sectionId);
    }

    setCollapseState({ bodyId: `section-${sectionId}-body`, chevronId: `section-${sectionId}-chevron`, isOpen });
}

/**
 * Renders the sticky action bar: Publish, Reset to Defaults, and the status note (settings layout).
 */
function showActionBar() {
    // Publish is locked while a publish is in flight.
    const isPublishing = globalThis.STATE.isPublishing;
    const publishLabel = isPublishing ? 'Publishing…' : 'Publish';
    const disabledAttribute = isPublishing ? 'disabled' : '';

    // Render the bar.
    document.getElementById('g4-actionbar').innerHTML = `
    <div class="flow-publisher-actionbar">
        <button type="button"
                id="flow-publisher-publish"
                class="flow-publisher-btn"
                data-test-id="publish-flow-button"
                ${disabledAttribute}>${publishLabel}</button>
        <button type="button"
                id="flow-publisher-reset"
                class="flow-publisher-btn flow-publisher-btn-ghost"
                data-test-id="reset-flow-to-defaults-button"
                ${disabledAttribute}>Reset to Defaults</button>
        <span class="flow-publisher-actionbar-spacer"></span>
        <span id="flow-publisher-save-note"
              class="flow-publisher-save-note"
              data-test-id="publish-flow-status-note"
              aria-live="polite"></span>
    </div>`;

    // The bar is replaced on every render, so its buttons are wired again here.
    document.getElementById('flow-publisher-publish').addEventListener('click', onPublishClick);

    document.getElementById('flow-publisher-reset').addEventListener('click', onResetClick);
}

/**
 * Updates the automation size in the Automation section while the JSON is edited.
 *
 * @remarks
 * Text that does not parse keeps the last size until it parses again.
 */
function showAutomationSize() {
    const sizeElement = document.getElementById('flow-automation-size');
    const sizeText = getAutomationSizeText(globalThis.STATE.automationText);

    if (sizeElement && sizeText !== '') {
        sizeElement.textContent = sizeText;
    }
}

/**
 * Renders the banner stack: schema fallback, overwrite notice, and the last publish result.
 */
function showBanners() {
    const container = document.getElementById('flow-publisher-banners');

    if (container) {
        container.innerHTML = writeBanners().trim();
    }
}

/**
 * Opens the expanded editor for one text box: a large centered editor with line numbers whose
 * typing updates the text box live.
 *
 * @remarks
 * A Markdown box gets the Markdown reference button in the header; a JSON box gets Format and an
 * error line under the editor that follows the box's live validation.
 *
 * @param {string} targetId - Id of the text box to edit.
 * @param {HTMLElement} opener - The Expand button.
 */
function showExpandEditor(targetId, opener) {
    const source = document.getElementById(targetId);

    if (!source || document.getElementById('flow-publisher-expand-layer')) {
        return;
    }

    // Title: the field label (without the required mark), prefixed with the titles of the cards
    // that hold it (parameter, then value), outermost first.
    const labelElement = document.querySelector(`label[for="${targetId}"]`);
    const labelText = labelElement?.firstChild?.textContent.trim() || 'Text';
    const cardTitles = [];
    let card = source.closest('.flow-publisher-item-card');

    while (card) {
        cardTitles.unshift(card.querySelector('.flow-publisher-item-card-title')?.textContent ?? '');
        card = card.parentElement.closest('.flow-publisher-item-card');
    }

    const title = [...cardTitles, labelText].filter((text) => text !== '').join(' - ');

    // Header tool: Format for JSON, the Markdown reference for Markdown.
    const isJson = source.dataset.kind === 'json';
    const toolHtml = isJson
        ? writeIconButton({ action: 'format-expanded-json', icon: SVG_FORMAT, label: 'Check & Format JSON', testId: 'expand-editor-format-button' })
        : writeIconButton({ action: 'open-markdown-reference', icon: SVG_MARKDOWN, label: 'Markdown reference', testId: 'expand-editor-markdown-button' });
    const errorHtml = isJson
        ? '<div id="flow-publisher-expand-error" class="flow-publisher-field-error flow-publisher-expand-error" data-test-id="expand-editor-error-message" role="alert"></div>'
        : '';

    globalThis.STATE.modal.expandTargetId = targetId;
    globalThis.STATE.modal.openers.expand = opener;

    document.getElementById('g4-modal').insertAdjacentHTML('beforeend', `
    <div id="flow-publisher-expand-layer" class="flow-publisher-modal-backdrop" data-test-id="expand-editor-layer">
        <div class="flow-publisher-modal flow-publisher-modal--editor"
             role="dialog"
             aria-modal="true"
             aria-labelledby="flow-publisher-expand-title"
             data-test-id="expand-editor-modal">
            <div class="flow-publisher-modal-hdr">
                <span id="flow-publisher-expand-title" class="flow-publisher-modal-title">${convertToSafeHtml(title)}</span>
                <span class="flow-publisher-item-card-spacer"></span>
                ${toolHtml}
            </div>
            <div class="flow-publisher-expand-body">
                <div id="flow-publisher-expand-gutter" class="flow-publisher-line-numbers" aria-hidden="true"></div>
                <textarea id="flow-publisher-expand-textarea"
                          class="flow-publisher-expand-textarea"
                          data-test-id="expand-editor-textarea"
                          aria-labelledby="flow-publisher-expand-title"
                          spellcheck="false"
                          wrap="off">${convertToSafeHtml(source.value)}</textarea>
            </div>
            ${errorHtml}
            ${writeModalCloseButton('expand', 'expand-editor-close-button')}
        </div>
    </div>`);

    // Line numbers follow the text's vertical scroll; the editor opens where the caret was.
    const editor = document.getElementById('flow-publisher-expand-textarea');
    const gutter = document.getElementById('flow-publisher-expand-gutter');

    editor.addEventListener('scroll', () => {
        gutter.scrollTop = editor.scrollTop;
    });

    showLineNumbers();
    showExpandError();
    editor.focus();
    editor.setSelectionRange(source.selectionStart, source.selectionEnd);
}

/**
 * Mirrors the JSON error of the field being edited into the expanded editor's error line.
 */
function showExpandError() {
    const errorElement = document.getElementById('flow-publisher-expand-error');
    const source = document.getElementById(globalThis.STATE.modal.expandTargetId);

    if (errorElement && source) {
        errorElement.textContent = globalThis.STATE.errors[source.dataset.errorPath] ?? '';
    }
}

/**
 * Writes the line numbers of one JSON or Markdown box into its gutter.
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
    const gutter = document.getElementById(`${textarea.id}-line-numbers`);

    if (!gutter || textarea.clientWidth === 0) {
        return;
    }

    // One hidden one-row text area per page, used to read the row height of the box's font.
    let rowProbe = document.getElementById('flow-publisher-row-measure');

    if (!rowProbe) {
        rowProbe = document.createElement('textarea');
        rowProbe.id = 'flow-publisher-row-measure';
        rowProbe.className = 'flow-publisher-line-measure';
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
 * Renders the page body (banners and sections) from state.
 */
function showForm() {
    const sectionsHtml = SECTIONS.map((section) => writeSection(section)).join('');

    // Render the page body, then fill the key preview that lives inside it.
    document.getElementById('app').innerHTML = `
    <div class="flow-publisher-main">
        <div id="flow-publisher-banners" class="flow-publisher-banners" data-test-id="flow-publisher-banners">${writeBanners().trim()}</div>
        ${sectionsHtml}
        ${writeAutomationSection()}
        <div class="flow-publisher-page-spacer"></div>
    </div>`;

    showKeyPreview();
    showParameterWarnings();
    startLineNumbers();
}

/**
 * Renders the page header, in the settings header style.
 */
function showHeader() {
    const relativePath = convertToSafeText(globalThis.INJECTED?.automation?.relativePath);

    document.getElementById('g4-header').innerHTML = `
    <div class="flow-publisher-header">
        <div>
            <div class="flow-publisher-header-title">G4&#x2122; Publish Flow</div>
            <div class="flow-publisher-header-meta" data-test-id="flow-publisher-bot-path">Publish bots/${convertToSafeHtml(relativePath)} to the G4 Hub as a flow</div>
        </div>
    </div>`;
}

/**
 * Updates the "Will publish as" preview under the key field.
 */
function showKeyPreview() {
    const preview = document.getElementById('flow-publisher-key-preview');

    if (!preview) {
        return;
    }

    // An empty namespace is stored under G4.System by the server, so the preview says so.
    const values = globalThis.STATE.values;
    const key = convertToPascalCase(values.key ?? '');
    const namespaceText = (values.namespace ?? '').trim();
    const namespace = namespaceText === '' ? 'G4.System' : namespaceText;

    preview.textContent = key === ''
        ? ''
        : `Will publish as ${namespace}/${key}`;
}

/**
 * Writes one number per line into the expanded editor's gutter and keeps it aligned with the text.
 */
function showLineNumbers() {
    const editor = document.getElementById('flow-publisher-expand-textarea');
    const gutter = document.getElementById('flow-publisher-expand-gutter');

    if (!editor || !gutter) {
        return;
    }

    const lineCount = editor.value.split(LINE_BREAK_PATTERN).length;

    gutter.textContent = Array.from({ length: lineCount }, (_, index) => index + 1).join('\n');
    gutter.scrollTop = editor.scrollTop;
}

/**
 * Opens the static Markdown reference: what to type and how it looks, for the common elements.
 *
 * @param {HTMLElement} opener - The button that opened it; it gets focus back on close.
 */
function showMarkdownReference(opener) {
    if (document.getElementById('flow-publisher-reference-layer')) {
        return;
    }

    globalThis.STATE.modal.openers.reference = opener;

    const rowsHtml = MARKDOWN_REFERENCE.map((item) => `
                    <tr>
                        <th scope="row">${convertToSafeHtml(item.element)}</th>
                        <td><pre class="flow-publisher-md-syntax">${convertToSafeHtml(item.syntax)}</pre></td>
                        <td class="flow-publisher-md-result">${item.result}</td>
                    </tr>`).join('');

    document.getElementById('g4-modal').insertAdjacentHTML('beforeend', `
    <div id="flow-publisher-reference-layer" class="flow-publisher-modal-backdrop" data-test-id="markdown-reference-layer">
        <div class="flow-publisher-modal flow-publisher-modal--reference"
             role="dialog"
             aria-modal="true"
             aria-labelledby="flow-publisher-reference-title"
             data-test-id="markdown-reference-modal">
            <div class="flow-publisher-modal-hdr">
                <span id="flow-publisher-reference-title" class="flow-publisher-modal-title">Markdown reference</span>
            </div>
            <div class="flow-publisher-modal-body">
                <div class="flow-publisher-section-desc">Summary and description text is Markdown; each line is published as one entry. The most common syntax:</div>
                <table class="flow-publisher-md-table" data-test-id="markdown-reference-table">
                    <thead>
                        <tr><th scope="col">Element</th><th scope="col">You type</th><th scope="col">It looks like</th></tr>
                    </thead>
                    <tbody>${rowsHtml}
                    </tbody>
                </table>
            </div>
            ${writeModalCloseButton('reference', 'markdown-reference-close-button')}
        </div>
    </div>`);

    document.querySelector('[data-test-id="markdown-reference-close-button"]').focus();
}

/**
 * Updates one parameter card title in place while its name or type is typed.
 *
 * @param {string} path - Parameters field name.
 * @param {number} rowIndex - Row index.
 */
function showParameterTitle(path, rowIndex) {
    const titleElement = document.getElementById(`parameter-${rowIndex}-title`);
    const row = globalThis.STATE.values[path]?.[rowIndex];

    if (titleElement && row) {
        titleElement.textContent = writeParameterTitle(row, rowIndex);
    }
}

/**
 * Shows the parameter token warnings in place: the Parameters and Automation section headers, each
 * unused parameter's card header, and the warning list in the Automation section.
 *
 * @remarks
 * Only the warning holders change, so typing in the automation or a parameter name keeps focus and
 * the caret where they are.
 */
function showParameterWarnings() {
    const issues = getParameterTokenIssues(globalThis.STATE.automationText, getParameterNames());
    const unusedNames = new Set(issues.unused);
    const automationCount = issues.unused.length + issues.unknown.length + issues.broken.length;

    // Replaces a holder's markup only when it changes, so elements under the mouse are not
    // recreated mid-click when the warnings stay the same. The new markup is normalized through a
    // template first, so it compares equal to what the browser serializes back.
    const setMarkup = (holder, html) => {
        const template = document.createElement('template');
        template.innerHTML = html;

        if (holder.innerHTML !== template.innerHTML) {
            holder.innerHTML = template.innerHTML;
        }
    };

    // Fills one header holder: the triangle and a label, or nothing.
    const setHeaderWarning = (id, label, tooltip) => {
        const holder = document.getElementById(id);

        if (holder) {
            setMarkup(holder, label === '' ? '' : `${SVG_WARNING}<span>${convertToSafeHtml(label)}</span>`);
            holder.title = tooltip;
        }
    };

    // Section headers.
    const unusedTooltip = issues.unused.join(', ');
    const automationTooltip = getParameterWarningTexts(issues).join('\n');

    setHeaderWarning('section-parameters-warning', issues.unused.length > 0 ? 'Unused Parameter(s)' : '', unusedTooltip);
    setHeaderWarning('section-automation-warning', automationCount > 0 ? 'Parameter Warning(s)' : '', automationTooltip);

    // Parameter card headers: every card whose (trimmed) name is unused.
    document.querySelectorAll('[data-parameter-warning-index]').forEach((holder) => {
        const rows = globalThis.STATE.values[holder.dataset.path] ?? [];
        const name = (rows[Number(holder.dataset.parameterWarningIndex)]?.fields.name ?? '').trim();
        const isUnused = unusedNames.has(name);

        setHeaderWarning(holder.id, isUnused ? 'Unused Parameter' : '', isUnused ? `No {{$ Parameters.${name} }} in the automation.` : '');
    });

    // Automation warning list.
    const list = document.getElementById('flow-automation-warnings');

    if (list) {
        setMarkup(list, writeParameterWarnings(issues).trim());
    }
}

/**
 * Shows the action bar note for a moment, like the settings "Settings sent." note.
 *
 * @param {string} text - Note text.
 */
function showSaveNote(text) {
    const state = globalThis.STATE;
    const note = document.getElementById('flow-publisher-save-note');

    const onSaveNoteElapsed = () => {
        note.classList.remove('flow-publisher-is-shown');
    };

    if (!note) {
        return;
    }

    // Show the note, then fade it out; a newer note restarts the timer.
    note.textContent = text;
    note.classList.add('flow-publisher-is-shown');
    clearTimeout(state.saveNoteTimer);
    state.saveNoteTimer = setTimeout(onSaveNoteElapsed, SAVE_NOTE_DURATION_MILLISECONDS);
}

/**
 * Updates one value card title in place while its name or display name is typed.
 *
 * @param {{ path: string, rowIndex: number, valueIndex: number }} options - Parameters field name, parameter row, and value index.
 */
function showValueTitle(options) {
    const titleElement = document.getElementById(`parameter-${options.rowIndex}-value-${options.valueIndex}-title`);
    const valueRow = globalThis.STATE.values[options.path]?.[options.rowIndex]?.values[options.valueIndex];

    if (titleElement && valueRow) {
        titleElement.textContent = writeValueTitle(valueRow, options.valueIndex);
    }
}

/**
 * Schedules an existence lookup for the current namespace and key.
 *
 * @remarks
 * Debounced by LOOKUP_DELAY_MILLISECONDS. Each request carries an id so an older answer that
 * arrives late cannot overwrite the result of a newer edit.
 */
function startFlowLookup() {
    const state = globalThis.STATE;

    const onLookupDelayElapsed = () => {
        const key = convertToPascalCase(state.values.key ?? '');

        // Without a key there is nothing to look up; clear any previous overwrite notice.
        if (key === '') {
            state.existingFlow = null;
            showBanners();
            return;
        }

        // Ask the host, tagging the request so late answers to older requests are ignored.
        state.lookupRequestId++;
        globalThis.VSCODE?.postMessage({
            command: 'lookupFlow',
            key,
            namespace: (state.values.namespace ?? '').trim(),
            requestId: state.lookupRequestId
        });
    };

    // Restart the debounce window on every edit.
    clearTimeout(state.lookupTimer);
    state.lookupTimer = setTimeout(onLookupDelayElapsed, LOOKUP_DELAY_MILLISECONDS);
}

/**
 * Initializes the page: builds definitions and values from the injected data, renders every
 * region, and wires the delegated listeners once.
 */
function startFlowPublisher() {
    const injected = globalThis.INJECTED ?? {};
    const state = globalThis.STATE;

    // Build the form model from the schema, then seed it with the host defaults and the bot JSON.
    state.definitions = getFieldDefinitions(injected.schemas ?? {});
    state.values = newFormValues(injected.defaults ?? {}, state.definitions);
    state.automationText = convertToSafeText(injected.automation?.automationText);
    state.existingFlow = injected.existingFlow ?? null;

    // Render every region.
    showHeader();
    showForm();
    showActionBar();

    // Delegated listeners survive re-renders of #app.
    const app = document.getElementById('app');

    app.addEventListener('click', onAppClick);
    app.addEventListener('input', onAppInput);
    app.addEventListener('change', onAppInput);
    app.addEventListener('focusout', onAppFocusOut);
    app.addEventListener('scroll', onAppScroll, true);

    // The modal region sits outside #app, so it has its own delegated listeners.
    const modal = document.getElementById('g4-modal');

    modal?.addEventListener('click', onModalClick);
    modal?.addEventListener('input', onModalInput);
    document.addEventListener('keydown', onDocumentKeyDown);
}

/**
 * Numbers every JSON and Markdown box on the page, now and whenever one changes size.
 *
 * @remarks
 * Called after each render. The resize observer also fires when a box first gets a size, which
 * is when a folded section or card opens, so boxes rendered while hidden are numbered then.
 */
function startLineNumbers() {
    const state = globalThis.STATE;

    const onTextAreasResized = (entries) => {
        entries.forEach((entry) => showFieldLineNumbers(entry.target));
    };

    state.lineNumberObserver ??= new ResizeObserver(onTextAreasResized);
    state.lineNumberObserver.disconnect();
    document.querySelectorAll('textarea[data-line-numbers]').forEach((textarea) => state.lineNumberObserver.observe(textarea));
}

/**
 * Validates the whole form.
 *
 * @remarks
 * Compute-only over state. Checks required fields, key normalization, URLs, list entries, map keys,
 * parameter names, JSON editors, and the automation. Full contract validation stays on the server.
 *
 * @returns {Record<string, string>} Error message per field path; empty when the form is valid.
 */
function testFormValues() {
    const errors = {};
    const values = globalThis.STATE.values;

    const testUrl = (text) => {
        try {
            new URL(text);
            return true;
        } catch {
            return false;
        }
    };

    for (const definition of globalThis.STATE.definitions) {
        const name = definition.name;
        const value = values[name];
        const control = definition.control;
        const isTextValue = typeof value === 'string';
        const isFilledText = isTextValue && value.trim() !== '';

        // Required fields: text with nothing visible, or a list without a non-blank entry.
        const isEmptyText = isTextValue && !isFilledText;
        const isEmptyList = control === 'list' && value.every((entry) => entry.trim() === '');

        if (definition.isRequired && isEmptyText) {
            errors[name] = 'Required.';
            continue;
        }

        if (definition.isRequired && isEmptyList) {
            errors[name] = 'Add at least one entry.';
            continue;
        }

        // Single-value controls: key normalization, URL format, and JSON syntax.
        const isEmptyKey = control === 'key' && convertToPascalCase(value) === '';
        const isInvalidUrl = control === 'url' && isFilledText && !testUrl(value.trim());
        const jsonOptions = { expectedType: definition.schema.type, guidance: JSON_EDIT_GUIDANCE };
        const jsonError = control === 'json' && isFilledText ? getJsonError(value, jsonOptions) : '';

        if (isEmptyKey) {
            errors[name] = 'Enter at least one letter or digit.';
        }

        if (isInvalidUrl) {
            errors[name] = URL_ERROR_MESSAGE;
        }

        if (jsonError !== '') {
            errors[name] = jsonError;
        }

        // Object sub-fields that must be URLs (author.link).
        if (control === 'object') {
            for (const property of definition.urlProperties) {
                const text = value[property]?.trim() ?? '';
                const isInvalidPropertyUrl = text !== '' && !testUrl(text);

                if (isInvalidPropertyUrl) {
                    errors[`${name}.${property}`] = URL_ERROR_MESSAGE;
                }
            }
        }

        // List entries: within the length limit and not repeated (ignoring case and blank entries).
        if (control === 'list') {
            Object.assign(errors, testListEntries(name, value));
        }

        // Map rows: a value needs a key.
        if (control === 'map') {
            value.forEach((row, index) => {
                const isValueWithoutKey = row.key.trim() === '' && row.value.trim() !== '';

                if (isValueWithoutKey) {
                    errors[`${name}.${index}.key`] = 'Enter a key for this value.';
                }
            });
        }

        // Parameter rows: a name is required, and every value card is checked.
        if (control === 'parameters') {
            value.forEach((row, index) => {
                if ((row.fields.name ?? '').trim() === '') {
                    errors[`${name}.${index}.name`] = 'Enter a parameter name.';
                }

                Object.assign(errors, testParameterValues(`${name}.${index}.${PARAMETER_VALUES_PROPERTY}`, row.values));
            });
        }
    }

    // The automation is published as-is, so it must be a JSON object.
    const automationText = globalThis.STATE.automationText;
    const automationOptions = { expectedType: 'object', guidance: JSON_EDIT_GUIDANCE };
    const automationError = automationText.trim() === ''
        ? 'Required. Enter the bot automation as a JSON object.'
        : getJsonError(automationText, automationOptions);

    if (automationError !== '') {
        errors.automation = automationError;
    }

    return errors;
}

/**
 * Checks the entries of one add-entry list.
 *
 * @remarks
 * Compute-only. Blank entries are ignored (they are dropped on publish). A repeated entry is
 * reported on its later occurrence, so the first one stays clean.
 *
 * @param {string} name - List field name.
 * @param {string[]} entries - List entries as typed.
 * @returns {Record<string, string>} Error message per entry path (`name.index`).
 */
function testListEntries(name, entries) {
    const errors = {};
    const firstIndexes = new Map();

    entries.forEach((entry, index) => {
        const text = entry.trim();
        const comparable = text.toLowerCase();

        if (text === '') {
            return;
        }

        if (text.length > LIST_ENTRY_MAXIMUM_LENGTH) {
            errors[`${name}.${index}`] = `Use ${LIST_ENTRY_MAXIMUM_LENGTH} characters or fewer.`;
        } else if (firstIndexes.has(comparable)) {
            errors[`${name}.${index}`] = `Duplicate of entry ${firstIndexes.get(comparable) + 1}.`;
        } else {
            firstIndexes.set(comparable, index);
        }
    });

    return errors;
}

/**
 * Checks the value cards of one parameter.
 *
 * @remarks
 * Compute-only. Name and Description are required; a repeated name (ignoring case) is reported
 * on its later occurrence, so the first one stays clean.
 *
 * @param {string} basePath - Error path of the parameter's values (`parameters.N.values`).
 * @param {object[]} valueRows - Value card states.
 * @returns {Record<string, string>} Error message per value field path (`basePath.index.field`).
 */
function testParameterValues(basePath, valueRows) {
    const errors = {};
    const firstIndexes = new Map();

    valueRows.forEach((valueRow, index) => {
        const name = valueRow.name.trim();
        const comparable = name.toLowerCase();

        if (name === '') {
            errors[`${basePath}.${index}.name`] = 'Enter a value name.';
        } else if (firstIndexes.has(comparable)) {
            errors[`${basePath}.${index}.name`] = `Duplicate of value ${firstIndexes.get(comparable) + 1}.`;
        } else {
            firstIndexes.set(comparable, index);
        }

        if (valueRow.description.trim() === '') {
            errors[`${basePath}.${index}.description`] = 'Required.';
        }
    });

    return errors;
}

/**
 * Builds the collapsed Automation section: size, authentication and encoding notes, and the editable
 * bot JSON. The bot path is already in the page header.
 *
 * @returns {string} Section HTML.
 */
function writeAutomationSection() {
    const automation = globalThis.INJECTED?.automation;

    if (!automation) {
        return '';
    }

    const authenticationText = automation.isAuthenticationRemoved
        ? 'authentication hidden here and kept in the file'
        : 'no authentication block';
    const isInvalid = globalThis.STATE.errors.automation !== undefined;
    const sizeText = getAutomationSizeText(globalThis.STATE.automationText) || automation.sizeText;

    const bodyHtml = `
        <div class="flow-publisher-automation-meta">
            <span id="flow-automation-size" data-test-id="flow-automation-size">${convertToSafeHtml(sizeText)}</span>
            <span data-test-id="flow-automation-authentication">${authenticationText}</span>
            <span>Base64 encoded on publish</span>
        </div>
        <div id="flow-automation-warnings" class="flow-publisher-warning-list" data-test-id="flow-automation-warnings" role="status"></div>
        <div class="flow-publisher-field" data-invalid="${isInvalid}" data-test-id="automation-field">
            ${writeJsonEditor({
                dataAttributes: 'data-automation="true"',
                errorPath: 'automation',
                jsonType: 'object',
                path: 'automation',
                value: globalThis.STATE.automationText
            })}
            ${writeError('automation')}
        </div>`;

    return writeSectionShell({
        bodyHtml,
        description: 'The bot automation that is published, as JSON. Edits are published and, after a successful publish, saved to the bot file with its authentication block restored.',
        id: 'automation',
        title: 'Automation'
    });
}

/**
 * Builds the banner stack HTML (settings note style).
 *
 * @returns {string} Banners HTML.
 */
function writeBanners() {
    const state = globalThis.STATE;
    const banners = [];

    // Builds one banner with an optional trailing action button.
    const writeBanner = (options) => {
        const role = options.statusClass === 'flow-publisher-status-err' ? 'alert' : 'status';
        const actionHtml = options.action
            ? `<button type="button"
                       class="flow-publisher-btn flow-publisher-btn-ghost flow-publisher-btn-sm"
                       data-action="${options.action.name}"
                       data-test-id="${options.action.testId}">${convertToSafeHtml(options.action.label)}</button>`
            : '';

        return `
        <div class="flow-publisher-note flow-publisher-banner"
             data-test-id="${options.testId}"
             role="${role}">
            <span class="flow-publisher-banner-text ${options.statusClass}">${convertToSafeHtml(options.text)}</span>
            ${actionHtml}
        </div>`;
    };

    // Schema source: the form falls back to the bundled schema when the Hub is unreachable.
    if (globalThis.INJECTED?.isSchemaFallback) {
        banners.push(writeBanner({
            statusClass: '',
            testId: 'schema-fallback-banner',
            text: 'Using the built-in flow schema; the G4 Hub could not be reached.'
        }));
    }

    // Overwrite notice, with a shortcut to load the stored values into the form.
    if (state.existingFlow) {
        const flowNamespace = convertToSafeText(state.existingFlow.namespace) || 'G4.System';
        const flowKey = convertToSafeText(state.existingFlow.key);

        banners.push(writeBanner({
            action: { name: 'load-existing', label: 'Load existing values', testId: 'load-existing-flow-values-button' },
            statusClass: '',
            testId: 'flow-overwrite-banner',
            text: `${flowNamespace}/${flowKey} already exists; publishing will overwrite it.`
        }));
    }

    // Last publish (or validation) result.
    if (state.publishResult) {
        const statusClass = state.publishResult.isSuccess ? 'flow-publisher-status-ok' : 'flow-publisher-status-err';

        banners.push(writeBanner({
            action: { name: 'dismiss-result', label: 'Dismiss', testId: 'dismiss-publish-result-button' },
            statusClass,
            testId: 'publish-result-banner',
            text: state.publishResult.message
        }));
    }

    return banners.join('');
}

/**
 * Builds the header of a collapsible item card (parameter or value): chevron, title, move up and
 * down, and the trash button. The buttons carry their own actions, so they never fold the card.
 *
 * @param {{ action: string, chevronId: string, dataAttributes: string, isOpen: boolean, isFirst: boolean, isLast: boolean, kind: string, label: string, testId: string, title: string, titleId: string }} options - Header data; kind is 'parameter' or 'value'.
 * @returns {string} Header HTML.
 */
function writeCardHeader(options) {
    const chevronOpenClass = options.isOpen ? ' flow-publisher-is-open' : '';

    // Text move buttons, as in the settings cards; disabled at the ends of the list.
    // Icon move buttons; disabled at the ends of the list.
    const writeMoveButton = (direction, isDisabled, icon) => `
            <button type="button"
                    class="flow-publisher-btn flow-publisher-btn-ghost flow-publisher-btn-sm flow-publisher-icon-btn"
                    title="Move ${direction}"
                    aria-label="Move ${convertToSafeHtml(options.label)} ${direction}"
                    data-action="move-${options.kind}-${direction}"
                    data-test-id="move-${options.testId}-${direction}-button"
                    ${options.dataAttributes}
                    ${isDisabled ? 'disabled' : ''}>${icon}</button>`;

    return `
        <div class="flow-publisher-item-card-hdr"
             data-action="${options.action}"
             ${options.dataAttributes}
             data-test-id="toggle-${options.testId}-card">
            <i id="${options.chevronId}" class="flow-publisher-chev${chevronOpenClass}">${SVG_CHEVRON}</i>
            <span id="${options.titleId}" class="flow-publisher-item-card-title">${convertToSafeHtml(options.title)}</span>
            <span class="flow-publisher-item-card-spacer"></span>
            ${options.warningHtml ?? ''}
            <span class="flow-publisher-item-card-actions">
                ${writeMoveButton('up', options.isFirst, SVG_ARROW_UP)}
                ${writeMoveButton('down', options.isLast, SVG_ARROW_DOWN)}
                ${writeIconButton({
                    action: `remove-${options.kind}`,
                    dataAttributes: options.dataAttributes,
                    icon: SVG_TRASH,
                    label: `Remove ${options.label}`,
                    testId: `remove-${options.testId}-button`
                })}
            </span>
        </div>`;
}

/**
 * Builds the field error line; its id lets setFieldError update it in place.
 *
 * @remarks
 * An empty line takes no space, so every field is followed by the same gap until it has an error.
 *
 * @param {string} path - Error path.
 * @returns {string} Error line HTML.
 */
function writeError(path) {
    const message = globalThis.STATE.errors[path] ?? '';
    const testId = `${path.replaceAll('.', '-')}-error-message`;

    return `
    <div id="error-${path}"
         class="flow-publisher-field-error"
         data-test-id="${testId}"
         role="alert">${convertToSafeHtml(message)}</div>`;
}

/**
 * Builds one field in the settings field layout: label, hint, control, preview, and error line.
 *
 * @remarks
 * Delegates the control body to one writer per control type; the writers stay top-level so each
 * control's markup can be read (and tested) on its own.
 *
 * @param {object} definition - Field definition.
 * @returns {string} Field HTML.
 */
function writeField(definition) {
    const state = globalThis.STATE;
    const value = state.values[definition.name];

    // Field-level markers: invalid state, required mark, and the hint.
    const isInvalid = state.errors[definition.name] !== undefined;
    const requiredMark = definition.isRequired ? ' <span class="flow-publisher-required-mark">*</span>' : '';
    const hintHtml = definition.hint === '' ? '' : `<div class="flow-publisher-field-hint">${convertToSafeHtml(definition.hint)}</div>`;

    // An object (author) is a row of ordinary fields, one per property, with no wrapper label.
    if (definition.control === 'object') {
        return writeObjectField(definition);
    }

    // Pick the control body for this field.
    let bodyHtml;

    switch (definition.control) {
        case 'markdown':
            bodyHtml = writeMarkdownEditor({ errorPath: definition.name, path: definition.name, value });
            break;
        case 'list':
            bodyHtml = writeListField(definition);
            break;
        case 'map':
            bodyHtml = writeMapField(definition);
            break;
        case 'parameters':
            bodyHtml = writeParametersField(definition);
            break;
        case 'json':
            bodyHtml = writeJsonEditor({ errorPath: definition.name, jsonType: definition.schema.type, path: definition.name, value });
            break;
        default:
            bodyHtml = writeTextInput(definition);
    }

    // Settings layout: label, hint, control, then the error line (shown only when there is an error).
    const labelHtml = definition.isLabelHidden === true
        ? ''
        : `<label class="flow-publisher-field-label" for="field-${definition.name}">${convertToSafeHtml(definition.label)}${requiredMark}</label>`;

    return `
    <div class="flow-publisher-field"
         data-invalid="${isInvalid}"
         data-test-id="${definition.name}-field">
        ${labelHtml}
        ${hintHtml}
        ${bodyHtml}
        ${writeError(definition.name)}
    </div>`;
}

/**
 * Builds a ghost icon button (trash, Format, Markdown, Expand) with a tooltip and an accessible name.
 *
 * @param {{ action: string, icon: string, label: string, testId: string, dataAttributes?: string }} options - Button data; label is the tooltip and the accessible name.
 * @returns {string} Button HTML.
 */
function writeIconButton(options) {
    const label = convertToSafeHtml(options.label);

    return `
    <button type="button"
            class="flow-publisher-btn flow-publisher-btn-ghost flow-publisher-btn-sm flow-publisher-icon-btn"
            title="${label}"
            data-action="${options.action}"
            data-test-id="${options.testId}"
            ${options.dataAttributes ?? ''}
            aria-label="${label}">${options.icon}</button>`;
}

/**
 * Builds a JSON editor that behaves like the settings Capabilities box: a monospace textarea that
 * is validated while typing, with Format and Expand icon buttons revealed on hover or focus.
 *
 * @param {{ errorPath: string, jsonType: string, path: string, value: string, dataAttributes?: string, textareaId?: string, testId?: string }} options - Editor data; jsonType is the schema type the text must parse to.
 * @returns {string} Editor HTML.
 */
function writeJsonEditor(options) {
    const textareaId = options.textareaId ?? `field-${options.path}`;
    const testId = options.testId ?? `${options.path}-json-textarea`;
    const dataAttributes = options.dataAttributes ?? `data-path="${options.path}"`;
    const targetAttribute = `data-target-id="${textareaId}"`;

    return `
    <div class="flow-publisher-json-wrap flow-publisher-numbered">
        <div class="flow-publisher-field-line-numbers" aria-hidden="true">
            <div id="${textareaId}-line-numbers" class="flow-publisher-field-line-rows" data-test-id="${testId}-line-numbers"></div>
        </div>
        <textarea id="${textareaId}"
                  class="flow-publisher-json-textarea"
                  data-error-path="${options.errorPath}"
                  data-json-type="${options.jsonType}"
                  data-kind="json"
                  data-line-numbers="true"
                  data-test-id="${testId}"
                  wrap="off"
                  ${dataAttributes}
                  rows="10"
                  spellcheck="false">${convertToSafeHtml(options.value)}</textarea>
        <div class="flow-publisher-text-tools">
            ${writeIconButton({ action: 'format-json', dataAttributes: targetAttribute, icon: SVG_FORMAT, label: 'Check & Format JSON', testId: `${testId}-format-button` })}
            ${writeIconButton({ action: 'open-expand-editor', dataAttributes: targetAttribute, icon: SVG_EXPAND, label: 'Expand', testId: `${testId}-expand-button` })}
        </div>
    </div>`;
}

/**
 * Builds an add-entry list field (categories, aliases, platforms): one text box per entry with a
 * trash button, in the key/value row style, and an add button.
 *
 * @param {object} definition - Field definition.
 * @returns {string} Field body HTML.
 */
function writeListField(definition) {
    const entries = globalThis.STATE.values[definition.name];
    const label = convertToSafeHtml(definition.label);

    // One row per entry: a text box as wide as a key/value key, then the trash button.
    const rowsHtml = entries.map((entry, index) => {
        const errorPath = `${definition.name}.${index}`;
        const isInvalid = globalThis.STATE.errors[errorPath] !== undefined;

        return `
        <div class="flow-publisher-field" data-invalid="${isInvalid}">
            <div class="flow-publisher-kv-row">
                <input type="text"
                       class="flow-publisher-kv-key"
                       data-error-path="${errorPath}"
                       data-list-index="${index}"
                       data-path="${definition.name}"
                       data-test-id="${definition.name}-${index}-input"
                       aria-label="${label} entry ${index + 1}"
                       autocomplete="off"
                       maxlength="${LIST_ENTRY_MAXIMUM_LENGTH}"
                       placeholder="Entry"
                       spellcheck="false"
                       value="${convertToSafeHtml(entry)}">
                ${writeIconButton({
                    action: 'remove-list-row',
                    dataAttributes: `data-index="${index}" data-path="${definition.name}"`,
                    icon: SVG_TRASH,
                    label: `Remove ${definition.label} entry ${index + 1}`,
                    testId: `remove-${definition.name}-${index}-row-button`
                })}
            </div>
            ${writeError(errorPath)}
        </div>`;
    }).join('');

    // An empty list says so, like the settings "None." hint.
    const listHtml = entries.length === 0 ? '<div class="flow-publisher-field-hint">None.</div>' : rowsHtml;

    return `
    <div class="flow-publisher-kv-list">${listHtml}</div>
    <div class="flow-publisher-add-row">
        <button type="button"
                id="field-${definition.name}"
                class="flow-publisher-btn flow-publisher-btn-ghost flow-publisher-btn-sm"
                data-action="add-list-row"
                data-path="${definition.name}"
                data-test-id="add-${definition.name}-row-button">+ Add entry</button>
    </div>`;
}

/**
 * Builds a key/value map field (context, protocol) in the settings key/value style.
 *
 * @param {object} definition - Field definition.
 * @returns {string} Field body HTML.
 */
function writeMapField(definition) {
    const rows = globalThis.STATE.values[definition.name];
    const label = convertToSafeHtml(definition.label);

    // One row per entry: key input, value input, and a Remove button; the row's error line follows.
    const rowsHtml = rows.map((row, index) => {
        const errorPath = `${definition.name}.${index}.key`;
        const isInvalid = globalThis.STATE.errors[errorPath] !== undefined;

        return `
        <div class="flow-publisher-field" data-invalid="${isInvalid}">
            <div class="flow-publisher-kv-row">
                <input type="text"
                       class="flow-publisher-kv-key"
                       data-error-path="${errorPath}"
                       data-map-index="${index}"
                       data-part="key"
                       data-path="${definition.name}"
                       data-test-id="${definition.name}-${index}-key-input"
                       aria-label="${label} key ${index + 1}"
                       placeholder="Key"
                       value="${convertToSafeHtml(row.key)}">
                <input type="text"
                       class="flow-publisher-kv-val"
                       data-error-path="${errorPath}"
                       data-map-index="${index}"
                       data-part="value"
                       data-path="${definition.name}"
                       data-test-id="${definition.name}-${index}-value-input"
                       aria-label="${label} value ${index + 1}"
                       placeholder="Value"
                       value="${convertToSafeHtml(row.value)}">
                ${writeIconButton({
                    action: 'remove-map-row',
                    dataAttributes: `data-index="${index}" data-path="${definition.name}"`,
                    icon: SVG_TRASH,
                    label: `Remove ${definition.label} entry ${index + 1}`,
                    testId: `remove-${definition.name}-${index}-row-button`
                })}
            </div>
            ${writeError(errorPath)}
        </div>`;
    }).join('');

    // An empty list says so, like the settings "None." hint.
    const listHtml = rows.length === 0 ? '<div class="flow-publisher-field-hint">None.</div>' : rowsHtml;

    return `
    <div class="flow-publisher-kv-list">${listHtml}</div>
    <div class="flow-publisher-add-row">
        <button type="button"
                id="field-${definition.name}"
                class="flow-publisher-btn flow-publisher-btn-ghost flow-publisher-btn-sm"
                data-action="add-map-row"
                data-path="${definition.name}"
                data-test-id="add-${definition.name}-row-button">+ Add entry</button>
    </div>`;
}

/**
 * Builds a Markdown text box: a textarea with Markdown reference and Expand buttons revealed on
 * hover or focus, in the same corner and with the same reveal as the JSON Format button.
 *
 * @param {{ errorPath: string, path: string, value: string, dataAttributes?: string, textareaId?: string, testId?: string }} options - Text box data.
 * @returns {string} Text box HTML.
 */
function writeMarkdownEditor(options) {
    const textareaId = options.textareaId ?? `field-${options.path}`;
    const testId = options.testId ?? `${options.path}-textarea`;
    const dataAttributes = options.dataAttributes ?? `data-path="${options.path}"`;

    return `
    <div class="flow-publisher-json-wrap flow-publisher-numbered">
        <div class="flow-publisher-field-line-numbers" aria-hidden="true">
            <div id="${textareaId}-line-numbers" class="flow-publisher-field-line-rows" data-test-id="${testId}-line-numbers"></div>
        </div>
        <textarea id="${textareaId}"
                  class="flow-publisher-markdown-textarea"
                  data-error-path="${options.errorPath}"
                  data-kind="markdown"
                  data-line-numbers="true"
                  data-test-id="${testId}"
                  wrap="off"
                  ${dataAttributes}>${convertToSafeHtml(options.value)}</textarea>
        <div class="flow-publisher-text-tools">
            ${writeIconButton({ action: 'open-markdown-reference', icon: SVG_MARKDOWN, label: 'Markdown reference', testId: `${testId}-markdown-button` })}
            ${writeIconButton({ action: 'open-expand-editor', dataAttributes: `data-target-id="${textareaId}"`, icon: SVG_EXPAND, label: 'Expand', testId: `${testId}-expand-button` })}
        </div>
    </div>`;
}

/**
 * Builds the icon-only Close button that sits on a modal's top-right corner.
 *
 * @param {'expand' | 'reference'} layer - Modal layer the button closes.
 * @param {string} testId - Test id of the button.
 * @returns {string} Button HTML.
 */
function writeModalCloseButton(layer, testId) {
    return `
    <button type="button"
            class="flow-publisher-modal-close"
            title="Close (Esc)"
            data-action="close-modal"
            data-layer="${layer}"
            data-test-id="${testId}"
            aria-label="Close">${SVG_CLOSE}</button>`;
}

/**
 * Builds an object field (author) as one row of ordinary settings-style fields, one per property:
 * "Author Name", "Author Link", each with its own label, schema hint, input, and error line.
 *
 * @param {object} definition - Field definition.
 * @returns {string} Field row HTML.
 */
function writeObjectField(definition) {
    const value = globalThis.STATE.values[definition.name];

    // A name reads before the rest (Author Name, then Author Link); other properties keep schema order.
    const properties = Object.keys(value).sort((left, right) => Number(right === 'name') - Number(left === 'name'));

    // One complete field per property; URL properties get a URL input.
    const fieldsHtml = properties.map((property) => {
        const path = `${definition.name}.${property}`;
        const inputType = definition.urlProperties.includes(property) ? 'url' : 'text';
        const isInvalid = globalThis.STATE.errors[path] !== undefined;
        const label = `${definition.label} ${getLabelText(property)}`;
        const hint = FIELD_HINTS[path] ?? convertToSafeText(definition.schema.properties?.[property]?.description);
        const hintHtml = hint === '' ? '' : `<div class="flow-publisher-field-hint">${convertToSafeHtml(hint)}</div>`;

        return `
        <div class="flow-publisher-field"
             data-invalid="${isInvalid}"
             data-test-id="${definition.name}-${property}-field">
            <label class="flow-publisher-field-label" for="field-${definition.name}-${property}">${convertToSafeHtml(label)}</label>
            ${hintHtml}
            <input type="${inputType}"
                   id="field-${definition.name}-${property}"
                   data-path="${path}"
                   data-test-id="${definition.name}-${property}-input"
                   value="${convertToSafeHtml(value[property])}">
            ${writeError(path)}
        </div>`;
    }).join('');

    return `<div id="field-${definition.name}" class="flow-publisher-field-row">${fieldsHtml}</div>`;
}

/**
 * Builds one parameter property control: text input, Markdown or one-per-line text, or toggle switch.
 *
 * @param {{ index: number, path: string, property: object, row: object }} options - Input data.
 * @returns {string} Control HTML.
 */
function writeParameterInput(options) {
    const { index, path, property, row } = options;
    const errorPath = `${path}.${index}.${property.name}`;
    const inputId = `field-${path}-${index}-${property.name}`;
    const testId = `parameter-${index}-${property.name}`;
    const value = row.fields[property.name];
    const dataAttributes = `data-parameter-index="${index}" data-path="${path}" data-property="${property.name}"`;

    // Booleans render as settings toggle switches.
    if (property.kind === 'checkbox') {
        const checkedAttribute = value ? 'checked' : '';

        return `
        <label class="flow-publisher-toggle">
            <input type="checkbox"
                   id="${inputId}"
                   data-error-path="${errorPath}"
                   data-test-id="${testId}-toggle"
                   ${dataAttributes}
                   ${checkedAttribute}>
            <span class="flow-publisher-switch"></span>
            <span class="flow-publisher-toggle-text">
                <span class="flow-publisher-toggle-label">${convertToSafeHtml(property.label)}</span>
                <span class="flow-publisher-toggle-hint">${convertToSafeHtml(property.hint)}</span>
            </span>
        </label>`;
    }

    // Every other property is a labelled field with its hint and error line.
    const isInvalid = globalThis.STATE.errors[errorPath] !== undefined;
    const labelHtml = `<label class="flow-publisher-field-label" for="${inputId}">${convertToSafeHtml(property.label)}</label>`;
    const hintHtml = property.hint === '' ? '' : `<div class="flow-publisher-field-hint">${convertToSafeHtml(property.hint)}</div>`;
    let controlHtml;

    if (property.kind === 'markdown') {
        controlHtml = writeMarkdownEditor({
            dataAttributes,
            errorPath,
            path,
            testId: `${testId}-textarea`,
            textareaId: inputId,
            value
        });
    } else if (property.kind === 'lines') {
        controlHtml = `
        <textarea id="${inputId}"
                  data-error-path="${errorPath}"
                  data-kind="lines"
                  data-test-id="${testId}-textarea"
                  wrap="off"
                  ${dataAttributes}>${convertToSafeHtml(value)}</textarea>`;
    } else {
        controlHtml = `
        <input type="text"
               id="${inputId}"
               data-error-path="${errorPath}"
               data-test-id="${testId}-input"
               ${dataAttributes}
               value="${convertToSafeHtml(value)}">`;
    }

    return `
    <div class="flow-publisher-field" data-invalid="${isInvalid}">
        ${labelHtml}
        ${hintHtml}
        ${controlHtml}
        ${writeError(errorPath)}
    </div>`;
}

/**
 * Builds one collapsible parameter item card, shaped like the settings recorder cards: chevron,
 * title, move and trash buttons in the header; fields, toggles, and the nested Values in the body.
 *
 * @param {{ definition: object, index: number, properties: object[], row: object, rowCount: number }} options - Row data.
 * @returns {string} Card HTML.
 */
function writeParameterRow(options) {
    const { definition, index, properties, row, rowCount } = options;
    const path = definition.name;

    // Renders every property of one kind with the shared input writer.
    const writeInputs = (kind) => properties
        .filter((property) => property.kind === kind)
        .map((property) => writeParameterInput({ index, path, property, row }))
        .join('');

    // Fold state: the card body follows row.isOpen.
    const bodyCollapsedClass = row.isOpen ? '' : ' flow-publisher-is-collapsed';
    const headerHtml = writeCardHeader({
        action: 'toggle-parameter-card',
        chevronId: `parameter-${index}-chevron`,
        dataAttributes: `data-index="${index}" data-path="${path}"`,
        isFirst: index === 0,
        isLast: index === rowCount - 1,
        isOpen: row.isOpen,
        kind: 'parameter',
        label: `parameter ${index + 1}`,
        testId: `parameter-${index}`,
        title: writeParameterTitle(row, index),
        titleId: `parameter-${index}-title`,
        warningHtml: `<span id="parameter-${index}-warning" class="flow-publisher-header-warning" data-parameter-warning-index="${index}" data-path="${path}" data-test-id="parameter-${index}-warning"></span>`
    });

    return `
    <div class="flow-publisher-item-card" data-test-id="parameter-${index}-card">
        ${headerHtml}
        <div id="parameter-${index}-body" class="flow-publisher-item-card-body${bodyCollapsedClass}">
            <div class="flow-publisher-field-row">${writeInputs('text')}</div>
            ${writeInputs('markdown')}
            ${writeInputs('lines')}
            <div class="flow-publisher-toggle-row">${writeInputs('checkbox')}</div>
            ${writeValuesField({ index, path, row })}
        </div>
    </div>`;
}

/**
 * Builds a parameter card title: "name - type", like the settings "machine - driver" card titles.
 *
 * @param {object} row - Parameter row state.
 * @param {number} index - Row index, used when the name is still empty.
 * @returns {string} Title text.
 */
function writeParameterTitle(row, index) {
    const nameText = convertToSafeText(row.fields.name).trim();
    const typeText = convertToSafeText(row.fields.type).trim();
    const title = nameText === '' ? `Parameter ${index + 1}` : nameText;

    return typeText === '' ? title : `${title} - ${typeText}`;
}

/**
 * Builds the Automation section's warning list: one line per issue; line issues select their text
 * in the Automation box when clicked.
 *
 * @param {{ broken: object[], unknown: object[], unused: string[] }} issues - Result of getParameterTokenIssues.
 * @returns {string} Warning list HTML ('' when there is nothing to warn about).
 */
function writeParameterWarnings(issues) {
    const code = (text) => `<code>${convertToSafeHtml(text)}</code>`;

    // A line issue is a button that selects its text; an unused parameter has no position.
    const writeItem = (contentHtml, range) => range
        ? `
        <button type="button"
                class="flow-publisher-warning-item"
                data-action="select-automation-text"
                data-start="${range.start}"
                data-end="${range.end}"
                data-test-id="flow-automation-warning-item">${SVG_WARNING}<span>${contentHtml}</span></button>`
        : `
        <div class="flow-publisher-warning-item" data-test-id="flow-automation-warning-item">${SVG_WARNING}<span>${contentHtml}</span></div>`;

    return [
        ...issues.unused.map((name) => writeItem(`Unused parameter ${code(name)}: the automation has no ${code(`{{$ Parameters.${name} }}`)}.`)),
        ...issues.unknown.map((issue) => {
            const suggestionHtml = issue.suggestion === '' ? '' : ` Did you mean ${code(issue.suggestion)}?`;
            return writeItem(`Line ${issue.line}: unknown parameter ${code(issue.name)}.${suggestionHtml}`, issue);
        }),
        ...issues.broken.map((issue) => writeItem(
            `Line ${issue.line}: broken parameter token ${code(issue.text)}. Use ${code('{{$ Parameters.Name }}')} with one space after ${code('{{$')} and before ${code('}}')}.`,
            issue))
    ].join('');
}

/**
 * Builds the parameters editor: a list of collapsible item cards and an add button.
 *
 * @param {object} definition - The parameters field definition.
 * @returns {string} Field body HTML.
 */
function writeParametersField(definition) {
    const rows = globalThis.STATE.values[definition.name];
    const properties = getParameterProperties(definition);
    const cardsHtml = rows
        .map((row, index) => writeParameterRow({ definition, index, properties, row, rowCount: rows.length }))
        .join('');

    // An empty list says so, like the settings "None." hint.
    const listHtml = rows.length === 0 ? '<div class="flow-publisher-field-hint">None.</div>' : cardsHtml;

    return `
    <div class="flow-publisher-card-list">${listHtml}</div>
    <div class="flow-publisher-add-row">
        <button type="button"
                id="field-${definition.name}"
                class="flow-publisher-btn flow-publisher-btn-ghost flow-publisher-btn-sm"
                data-action="add-parameter"
                data-path="${definition.name}"
                data-test-id="add-parameter-button">+ Add parameter</button>
    </div>`;
}

/**
 * Builds one field section from the section definition and the fields assigned to it.
 *
 * @param {{ id: string, title: string, description: string }} section - Section definition.
 * @returns {string} Section HTML, or '' when no field belongs to the section.
 */
function writeSection(section) {
    const definitions = globalThis.STATE.definitions.filter((definition) => definition.section === section.id);

    if (definitions.length === 0) {
        return '';
    }

    // Identity fields share one row, like the settings connection row, with the "Will publish as"
    // preview under the row so it never pushes the Key input out of line; other sections stack.
    // A section holding only a field of its own name (Parameters) shows the editor directly: the
    // section title and description already name it, as in the settings list sections.
    const isSingleNamedField = definitions.length === 1 && definitions[0].label === section.title;
    const fieldsHtml = isSingleNamedField
        ? writeField({ ...definitions[0], hint: '', isLabelHidden: true })
        : definitions.map((definition) => writeField(definition)).join('');
    const previewHtml = '<div id="flow-publisher-key-preview" class="flow-publisher-key-preview" data-test-id="flow-key-preview" aria-live="polite"></div>';
    const bodyHtml = section.id === 'identity'
        ? `<div class="flow-publisher-field-row">${fieldsHtml}</div>${previewHtml}`
        : fieldsHtml;

    return writeSectionShell({ bodyHtml, description: section.description, id: section.id, title: section.title });
}

/**
 * Builds the collapsible section shell used by every section (settings writeSection markup).
 *
 * @param {{ bodyHtml: string, description: string, id: string, title: string }} options - Section content.
 * @returns {string} Section HTML.
 */
function writeSectionShell(options) {
    const isOpen = globalThis.STATE.openSectionIds.has(options.id);
    const chevronOpenClass = isOpen ? ' flow-publisher-is-open' : '';
    const bodyCollapsedClass = isOpen ? '' : ' flow-publisher-is-collapsed';

    return `
    <div class="flow-publisher-section" data-test-id="flow-${options.id}-section">
        <div class="flow-publisher-section-hdr"
             data-action="toggle-section"
             data-section-id="${options.id}"
             data-test-id="toggle-flow-${options.id}-section">
            <i id="section-${options.id}-chevron" class="flow-publisher-chev${chevronOpenClass}">${SVG_CHEVRON}</i>
            ${convertToSafeHtml(options.title)}
            <span id="section-${options.id}-warning" class="flow-publisher-header-warning" data-test-id="flow-${options.id}-warning"></span>
        </div>
        <div id="section-${options.id}-body" class="flow-publisher-section-body${bodyCollapsedClass}">
            <div class="flow-publisher-section-desc">${convertToSafeHtml(options.description)}</div>
            ${options.bodyHtml}
        </div>
    </div>`;
}

/**
 * Builds a single-line text input (text, key, or URL control).
 *
 * @param {object} definition - Field definition.
 * @returns {string} Input HTML.
 */
function writeTextInput(definition) {
    const inputType = definition.control === 'url' ? 'url' : 'text';

    return `
    <input type="${inputType}"
           id="field-${definition.name}"
           data-control="${definition.control}"
           data-path="${definition.name}"
           data-test-id="${definition.name}-input"
           autocomplete="off"
           spellcheck="false"
           value="${convertToSafeHtml(globalThis.STATE.values[definition.name])}">`;
}

/**
 * Builds one collapsible value card inside a parameter card: Name and Display Name side by side,
 * then the Description Markdown box.
 *
 * @param {{ index: number, path: string, valueCount: number, valueIndex: number, valueRow: object }} options - Parameter row index, field name, and the value.
 * @returns {string} Value card HTML.
 */
function writeValueRow(options) {
    const { index, path, valueCount, valueIndex, valueRow } = options;
    const idPrefix = `parameter-${index}-value-${valueIndex}`;
    const errorBase = `${path}.${index}.${PARAMETER_VALUES_PROPERTY}.${valueIndex}`;
    const dataAttributes = `data-index="${index}" data-path="${path}" data-value-index="${valueIndex}"`;

    // One labelled field per value property; Name and Description are required.
    const writeValueField = (field) => {
        const errorPath = `${errorBase}.${field.name}`;
        const inputId = `field-${path}-${index}-values-${valueIndex}-${field.name}`;
        const testId = `${idPrefix}-${field.name}`;
        const isInvalid = globalThis.STATE.errors[errorPath] !== undefined;
        const isRequired = field.name !== 'displayName';
        const requiredMark = isRequired ? ' <span class="flow-publisher-required-mark">*</span>' : '';
        const inputAttributes = `data-error-path="${errorPath}" data-parameter-index="${index}" data-path="${path}" data-value-index="${valueIndex}" data-value-property="${field.name}"`;
        const controlHtml = field.name === 'description'
            ? writeMarkdownEditor({
                dataAttributes: inputAttributes,
                errorPath,
                path,
                testId: `${testId}-textarea`,
                textareaId: inputId,
                value: valueRow.description
            })
            : `
            <input type="text"
                   id="${inputId}"
                   data-test-id="${testId}-input"
                   ${inputAttributes}
                   autocomplete="off"
                   spellcheck="false"
                   value="${convertToSafeHtml(valueRow[field.name])}">`;

        return `
        <div class="flow-publisher-field" data-invalid="${isInvalid}">
            <label class="flow-publisher-field-label" for="${inputId}">${convertToSafeHtml(field.label)}${requiredMark}</label>
            <div class="flow-publisher-field-hint">${convertToSafeHtml(field.hint)}</div>
            ${controlHtml}
            ${writeError(errorPath)}
        </div>`;
    };

    const [nameField, displayNameField, descriptionField] = VALUE_FIELDS;
    const bodyCollapsedClass = valueRow.isOpen ? '' : ' flow-publisher-is-collapsed';
    const headerHtml = writeCardHeader({
        action: 'toggle-value-card',
        chevronId: `${idPrefix}-chevron`,
        dataAttributes,
        isFirst: valueIndex === 0,
        isLast: valueIndex === valueCount - 1,
        isOpen: valueRow.isOpen,
        kind: 'value',
        label: `value ${valueIndex + 1}`,
        testId: idPrefix,
        title: writeValueTitle(valueRow, valueIndex),
        titleId: `${idPrefix}-title`
    });

    return `
    <div class="flow-publisher-item-card" data-test-id="${idPrefix}-card">
        ${headerHtml}
        <div id="${idPrefix}-body" class="flow-publisher-item-card-body${bodyCollapsedClass}">
            <div class="flow-publisher-field-row">${writeValueField(nameField)}${writeValueField(displayNameField)}</div>
            ${writeValueField(descriptionField)}
        </div>
    </div>`;
}

/**
 * Builds a value card title: "name - display name", or "Value N" while the name is empty.
 *
 * @param {object} valueRow - Value card state.
 * @param {number} valueIndex - Value index, used when the name is still empty.
 * @returns {string} Title text.
 */
function writeValueTitle(valueRow, valueIndex) {
    const nameText = valueRow.name.trim();
    const displayNameText = valueRow.displayName.trim();
    const title = nameText === '' ? `Value ${valueIndex + 1}` : nameText;

    return displayNameText === '' ? title : `${title} - ${displayNameText}`;
}

/**
 * Builds the nested Values block of a parameter card: label, hint, value cards, and an add button.
 *
 * @param {{ index: number, path: string, row: object }} options - Parameter row index, field name, and row state.
 * @returns {string} Values block HTML.
 */
function writeValuesField(options) {
    const { index, path, row } = options;
    const cardsHtml = row.values
        .map((valueRow, valueIndex) => writeValueRow({ index, path, valueCount: row.values.length, valueIndex, valueRow }))
        .join('');

    // An empty list says so, like the settings "None." hint.
    const listHtml = row.values.length === 0 ? '<div class="flow-publisher-field-hint">None.</div>' : cardsHtml;

    return `
    <div class="flow-publisher-field" data-test-id="parameter-${index}-values-field">
        <div class="flow-publisher-field-label">Values</div>
        <div class="flow-publisher-field-hint">${convertToSafeHtml(PARAMETER_HINTS[PARAMETER_VALUES_PROPERTY])}</div>
        <div class="flow-publisher-card-list">${listHtml}</div>
        <div class="flow-publisher-add-row">
            <button type="button"
                    class="flow-publisher-btn flow-publisher-btn-ghost flow-publisher-btn-sm"
                    data-action="add-value"
                    data-index="${index}"
                    data-path="${path}"
                    data-test-id="add-parameter-${index}-value-button">+ Add value</button>
        </div>
    </div>`;
}

// Host messages: existence lookups and publish results.
window.addEventListener('message', onHostMessage); // NOSONAR - sandboxed webview; any origin accepted by design

startFlowPublisher();
