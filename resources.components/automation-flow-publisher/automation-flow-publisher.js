/*
 * G4(TM) Flow Publisher component.
 *
 * Renders a form for one G4FlowManifestModel, built from the flow schema that the extension host
 * reads from the Hub's OpenAPI document (swagger/flows/docs.json) and injects through #g4-data.
 * The page is assembled from the reusable G4 components (resources.components/g4-*): sections,
 * fields, text inputs, Markdown and JSON text areas, list and key/value editors, cards, toggles,
 * notice lists, the page header, and the action bar. This script owns only the flow: the form
 * model, state, checks, parameter token warnings, and the host messages.
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

// Guidance appended to a JSON error found when publishing, worded like the JSON text area.
const JSON_EDIT_GUIDANCE = 'Fix the highlighted text; this change won\'t be saved until it parses.';

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

// Sentence above the Markdown reference of every Markdown box on this page.
const MARKDOWN_REFERENCE_NOTE = 'Summary and description text is Markdown; each line is published as one entry. The most common syntax:';

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

// Validation message for URL fields checked when publishing.
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
// it and every component event writes to it, and the delegated listeners have no other shared owner.
globalThis.STATE = {
    automationText: '',
    definitions: [],
    errors: {},
    existingFlow: null,
    isPublishing: false,
    isSummaryEdited: false,
    lookupRequestId: 0,
    lookupTimer: undefined,
    openSectionIds: new Set(SECTIONS.filter((section) => section.isOpenByDefault).map((section) => section.id)),
    publishResult: null,
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
 * never reaches the page as '[object Object]' (component attributes such as a list editor's value
 * take JSON this way).
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
 * Builds the banner notices: schema fallback, overwrite notice, and the last publish result.
 *
 * @returns {object[]} Notices for the banner list.
 */
function getBannerNotices() {
    const state = globalThis.STATE;
    const notices = [];

    // Schema source: the form falls back to the bundled schema when the Hub is unreachable.
    if (globalThis.INJECTED?.isSchemaFallback) {
        notices.push({ testId: 'schema-fallback-banner', text: 'Using the built-in flow schema; the G4 Hub could not be reached.' });
    }

    // Overwrite notice, with a shortcut to load the stored values into the form.
    if (state.existingFlow) {
        const flowNamespace = convertToSafeText(state.existingFlow.namespace) || 'G4.System';
        const flowKey = convertToSafeText(state.existingFlow.key);

        notices.push({
            action: { id: 'load-existing', label: 'Load existing values', testId: 'load-existing-flow-values-button' },
            testId: 'flow-overwrite-banner',
            text: `${flowNamespace}/${flowKey} already exists; publishing will overwrite it.`
        });
    }

    // Last publish (or validation) result.
    if (state.publishResult) {
        notices.push({
            action: { id: 'dismiss-result', label: 'Dismiss', testId: 'dismiss-publish-result-button' },
            testId: 'publish-result-banner',
            text: state.publishResult.message,
            tone: state.publishResult.isSuccess ? 'ok' : 'error'
        });
    }

    return notices;
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
 * Tests JSON text and describes the first problem, in the JSON text area's wording.
 *
 * @remarks
 * Compute-only. Besides syntax, the parsed value must have the shape the field stores: a JSON
 * object for an object field (Context) and a JSON array for an array field.
 *
 * @param {string} text - JSON text.
 * @param {string} [expectedType] - The expected schema type ('object' or 'array').
 * @returns {string} '' when the text is valid; otherwise the error line.
 */
function getJsonError(text, expectedType) {
    // Parse first; a syntax error is reported with the parser's own message.
    let value;

    try {
        value = JSON.parse(text);
    } catch (error) {
        return `Invalid JSON - ${resolveErrorMessage(error)}. ${JSON_EDIT_GUIDANCE}`;
    }

    // Then check the shape the field stores.
    const isObject = value !== null && typeof value === 'object' && !Array.isArray(value);
    const isWrongObject = expectedType === 'object' && !isObject;
    const isWrongArray = expectedType === 'array' && !Array.isArray(value);

    if (isWrongObject) {
        return `Enter a JSON object, for example { "key": "value" }. ${JSON_EDIT_GUIDANCE}`;
    }

    if (isWrongArray) {
        return `Enter a JSON array, for example [ { "name": "One" } ]. ${JSON_EDIT_GUIDANCE}`;
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
 * text box, and other string arrays a plain one-entry-per-line text box. `values` is edited as
 * nested value cards (see newParameterRow), and any other nested object is not edited but kept.
 * Identifying properties (name, display name, type, default) come first; the rest keep schema order.
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
 * Builds the warning notices of the Automation section: one line per issue; line issues select
 * their text in the Automation box when pressed.
 *
 * @param {{ broken: object[], unknown: object[], unused: string[] }} issues - Result of getParameterTokenIssues.
 * @returns {object[]} Notices for the warning list.
 */
function getParameterWarningNotices(issues) {
    const code = (text) => ({ isCode: true, text });
    const text = (value) => ({ text: value });
    const selectAction = (issue) => ({ data: { end: issue.end, start: issue.start }, id: 'select-automation-text' });

    // Unused parameters have no position; unknown and broken tokens select their text when pressed.
    return [
        ...issues.unused.map((name) => ({
            parts: [text('Unused parameter '), code(name), text(': the automation has no '), code(`{{$ Parameters.${name} }}`), text('.')]
        })),
        ...issues.unknown.map((issue) => ({
            action: selectAction(issue),
            parts: [
                text(`Line ${issue.line}: unknown parameter `),
                code(issue.name),
                text('.'),
                ...(issue.suggestion === '' ? [] : [text(' Did you mean '), code(issue.suggestion), text('?')])
            ]
        })),
        ...issues.broken.map((issue) => ({
            action: selectAction(issue),
            parts: [
                text(`Line ${issue.line}: broken parameter token `),
                code(issue.text),
                text('. Use '),
                code('{{$ Parameters.Name }}'),
                text(' with one space after '),
                code('{{$'),
                text(' and before '),
                code('}}'),
                text('.')
            ]
        }))
    ];
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
 * Handles the action bar buttons: Publish and Reset to Defaults.
 *
 * @param {CustomEvent} event - g4-action event of the action bar.
 */
function onActionBarAction(event) {
    // Each button runs its own command; other ids are ignored.
    if (event.detail.id === 'publish') {
        onPublishClick();
        return;
    }

    if (event.detail.id === 'reset') {
        onResetClick();
    }
}

/**
 * Handles notice actions: loading the stored flow, dismissing the result banner, and selecting a
 * warning's text in the Automation box.
 *
 * @param {CustomEvent} event - g4-action event of a notice list.
 */
function onAppAction(event) {
    const state = globalThis.STATE;
    const { data, id } = event.detail;

    // A token warning selects its text in the Automation box.
    if (id === 'select-automation-text') {
        document.querySelector('[data-automation="true"]')?.selectRange(data.start, data.end);
        return;
    }

    // The stored flow replaces the form values; old errors no longer apply.
    if (id === 'load-existing') {
        setFormFromManifest(state.existingFlow);
        state.errors = {};
        showForm();
        return;
    }

    // Dismiss hides only the result banner.
    if (id === 'dismiss-result') {
        state.publishResult = null;
        showBanners();
    }
}

/**
 * Applies a card list change: add a parameter or value, move one, or remove one, then renders the
 * form again from state.
 *
 * @param {CustomEvent} event - g4-add, g4-move, or g4-remove event of a card list.
 */
function onAppCardListChange(event) {
    const state = globalThis.STATE;
    const dataset = event.target.dataset;
    const path = dataset.path;

    if (!path) {
        return;
    }

    // Value lists live inside a parameter card; their data-values-of is the parameter position.
    const isValueList = dataset.valuesOf !== undefined;
    const parameterIndex = Number(dataset.valuesOf);
    const rows = isValueList ? state.values[path][parameterIndex].values : state.values[path];

    // Apply the change to state; a new card starts open, ready for typing.
    if (event.type === 'g4-add') {
        const newRow = isValueList ? newValueRow({}) : newParameterRow({}, getDefinition(path));

        rows.push({ ...newRow, isOpen: true });
    } else if (event.type === 'g4-move') {
        moveItem(rows, event.detail.from, event.detail.to);
    } else {
        rows.splice(event.detail.index, 1);
    }

    // Structural edits invalidate indexed error paths, so stale errors are dropped.
    state.errors = {};
    showForm();

    // A new value is ready for typing.
    if (event.type === 'g4-add' && isValueList) {
        const nameSelector = `[data-parameter-index="${parameterIndex}"][data-value-index="${rows.length - 1}"]`;

        document.querySelector(`${nameSelector}[data-value-property="name"]`)?.focus();
    }
}

/**
 * Normalizes the key when the user leaves the Key box; other committed edits (list and key/value
 * add, remove, move) are stored like typing.
 *
 * @param {CustomEvent} event - g4-change event of a component.
 */
function onAppChange(event) {
    const target = event.target;

    if (target.dataset.control !== 'key') {
        onAppInput(event);
        return;
    }

    // Normalize the key on blur so the stored value always matches the preview.
    const key = convertToPascalCase(event.detail.value);

    target.value = key;
    setKeyValue(key);
}

/**
 * Writes component values into state without re-rendering, so focus and caret stay where they are.
 *
 * @param {CustomEvent} event - g4-input (or g4-change) event of a component; detail.value is its value.
 */
function onAppInput(event) {
    const target = event.target;
    const state = globalThis.STATE;
    const dataset = target.dataset;
    const value = event.detail.value;
    const errorPath = target.closest('g4-field')?.dataset.errorPath;

    // The field already cleared its own error line; keep state in step for later renders.
    if (errorPath) {
        delete state.errors[errorPath];
    }

    // Automation editor: kept apart from the manifest values, since the host owns that field.
    if (dataset.automation !== undefined) {
        state.automationText = value;
        showAutomationSize();
        showParameterWarnings();
        return;
    }

    // Value card field; the value card title follows the name and display name as they are typed.
    if (dataset.valueIndex !== undefined) {
        const rowIndex = Number(dataset.parameterIndex);
        const valueIndex = Number(dataset.valueIndex);
        state.values[dataset.path][rowIndex].values[valueIndex][dataset.valueProperty] = value;
        showValueTitle({ path: dataset.path, rowIndex, valueIndex });
        return;
    }

    // Parameter row property; the card title follows the name and type as they are typed.
    if (dataset.parameterIndex !== undefined) {
        const rowIndex = Number(dataset.parameterIndex);
        state.values[dataset.path][rowIndex].fields[dataset.property] = value;
        showParameterTitle(dataset.path, rowIndex);
        showParameterWarnings();
        return;
    }

    if (!dataset.path) {
        return;
    }

    // Object sub-field (author.name) or top-level field (text, Markdown, JSON text, list, map rows).
    const [name, property] = dataset.path.split('.');

    if (property) {
        state.values[name][property] = value;
    } else {
        state.values[name] = value;
    }

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
 * Remembers which sections and cards the user opened, so a later render keeps them open.
 *
 * @param {CustomEvent} event - g4-toggle event of a section or card.
 */
function onAppToggle(event) {
    const state = globalThis.STATE;
    const target = event.target;
    const isOpen = event.detail.open;

    // Sections remember their fold state in the set of open sections.
    if (target.localName === 'g4-section') {
        const sectionId = target.dataset.sectionId;

        if (isOpen) {
            state.openSectionIds.add(sectionId);
        } else {
            state.openSectionIds.delete(sectionId);
        }

        return;
    }

    // Parameter and value cards keep their fold state in their rows.
    const dataset = target.dataset;
    const row = state.values[dataset.path]?.[Number(dataset.index)];

    if (dataset.cardKind === 'parameter' && row) {
        row.isOpen = isOpen;
    }

    if (dataset.cardKind === 'value' && row) {
        row.values[Number(dataset.valueIndex)].isOpen = isOpen;
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
        document.querySelector('g4-field[data-invalid="true"]')?.focus();
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

        const summaryBox = document.querySelector('[data-path="summary"]');

        if (summaryBox) {
            summaryBox.value = state.values.summary;
        }
    }

    // Refresh the preview and ask whether the new identity already exists.
    showKeyPreview();
    startFlowLookup();
}

/**
 * Updates the Publish and Reset buttons: both are locked while a publish is in flight.
 */
function showActionBar() {
    const bar = document.querySelector('#g4-actionbar g4-action-bar');
    const isPublishing = globalThis.STATE.isPublishing;
    const publishLabel = isPublishing ? 'Publishing…' : 'Publish';

    // Both buttons lock while a publish is in flight; Publish says so.
    bar?.setAction('publish', { disabled: isPublishing, label: publishLabel });
    bar?.setAction('reset', { disabled: isPublishing });
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
 * Shows the banner stack: schema fallback, overwrite notice, and the last publish result.
 */
function showBanners() {
    const banners = document.getElementById('flow-publisher-banners');

    if (banners) {
        banners.notices = getBannerNotices();
    }
}

/**
 * Renders the page body (banners and sections) from state.
 */
function showForm() {
    const sectionsHtml = SECTIONS.map((section) => writeSection(section)).join('');

    // Render the page body, then fill the parts that live inside it.
    document.getElementById('app').innerHTML = `
    <div class="flow-publisher-main">
        <g4-notice-list id="flow-publisher-banners"
                        data-test-id="flow-publisher-banners"
                        test-id="flow-publisher-banner"></g4-notice-list>
        ${sectionsHtml}
        ${writeAutomationSection()}
        <div class="flow-publisher-page-spacer"></div>
    </div>`;

    showBanners();
    showKeyPreview();
    showParameterWarnings();
}

/**
 * Renders the page header.
 */
function showHeader() {
    const relativePath = convertToSafeText(globalThis.INJECTED?.automation?.relativePath);

    document.getElementById('g4-header').innerHTML = `
    <g4-page-header meta="Publish bots/${convertToSafeHtml(relativePath)} to the G4 Hub as a flow"
                    page-title="G4&#x2122; Publish Flow"
                    test-id="flow-publisher-header"></g4-page-header>`;
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
 * Updates one parameter card title in place while its name or type is typed.
 *
 * @param {string} path - Parameters field name.
 * @param {number} rowIndex - Row index.
 */
function showParameterTitle(path, rowIndex) {
    const card = document.querySelector(`g4-card[data-card-kind="parameter"][data-index="${rowIndex}"]`);
    const row = globalThis.STATE.values[path]?.[rowIndex];

    // The card may not be rendered (for example during a re-render).
    if (card && row) {
        card.cardTitle = writeParameterTitle(row, rowIndex);
    }
}

/**
 * Shows the parameter token warnings in place: the Parameters and Automation section headers, each
 * unused parameter's card header, and the warning list in the Automation section.
 *
 * @remarks
 * Only the warning holders change (and only when their text changes), so typing in the automation
 * or a parameter name keeps focus and the caret where they are.
 */
function showParameterWarnings() {
    const issues = getParameterTokenIssues(globalThis.STATE.automationText, getParameterNames());
    const unusedNames = new Set(issues.unused);
    const automationCount = issues.unused.length + issues.unknown.length + issues.broken.length;

    // Writes one header warning: a label (empty for none) and its tooltip.
    const setWarning = (element, label, tooltip) => {
        if (!element) {
            return;
        }

        if (element.getAttribute('warning') !== label) {
            element.setAttribute('warning', label);
        }

        element.setAttribute('warning-tooltip', tooltip);
    };

    // Section headers.
    setWarning(
        document.querySelector('g4-section[data-section-id="parameters"]'),
        issues.unused.length > 0 ? 'Unused Parameter(s)' : '',
        issues.unused.join(', '));
    setWarning(
        document.querySelector('g4-section[data-section-id="automation"]'),
        automationCount > 0 ? 'Parameter Warning(s)' : '',
        getParameterWarningTexts(issues).join('\n'));

    // Parameter card headers: every card whose (trimmed) name is unused.
    document.querySelectorAll('g4-card[data-card-kind="parameter"]').forEach((card) => {
        const rows = globalThis.STATE.values[card.dataset.path] ?? [];
        const name = (rows[Number(card.dataset.index)]?.fields.name ?? '').trim();
        const isUnused = unusedNames.has(name);

        setWarning(card, isUnused ? 'Unused Parameter' : '', isUnused ? `No {{$ Parameters.${name} }} in the automation.` : '');
    });

    // Automation warning list.
    const list = document.getElementById('flow-automation-warnings');

    if (list) {
        list.notices = getParameterWarningNotices(issues);
    }
}

/**
 * Shows the action bar note for a moment, like the settings "Settings sent." note.
 *
 * @param {string} text - Note text.
 */
function showSaveNote(text) {
    document.querySelector('#g4-actionbar g4-action-bar')?.showNote(text);
}

/**
 * Updates one value card title in place while its name or display name is typed.
 *
 * @param {{ path: string, rowIndex: number, valueIndex: number }} options - Parameters field name, parameter row, and value index.
 */
function showValueTitle(options) {
    const cardSelector = `[data-index="${options.rowIndex}"][data-value-index="${options.valueIndex}"]`;
    const card = document.querySelector(`g4-card[data-card-kind="value"]${cardSelector}`);
    const valueRow = globalThis.STATE.values[options.path]?.[options.rowIndex]?.values[options.valueIndex];

    if (card && valueRow) {
        card.cardTitle = writeValueTitle(valueRow, options.valueIndex);
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
    writeActionBar();

    // Delegated listeners survive re-renders of #app: every component reports through events.
    const app = document.getElementById('app');

    app.addEventListener('g4-input', onAppInput);
    app.addEventListener('g4-change', onAppChange);
    app.addEventListener('g4-action', onAppAction);
    app.addEventListener('g4-toggle', onAppToggle);
    app.addEventListener('g4-add', onAppCardListChange);
    app.addEventListener('g4-move', onAppCardListChange);
    app.addEventListener('g4-remove', onAppCardListChange);
    document.getElementById('g4-actionbar').addEventListener('g4-action', onActionBarAction);
}

/**
 * Validates the whole form.
 *
 * @remarks
 * Compute-only over state. Checks required fields, key normalization, URLs, list entries, map keys,
 * parameter names, JSON editors, and the automation. Full contract validation stays on the server.
 * Entry problems of lists and key/value maps are shown by those editors; they are counted here so
 * they block publishing.
 *
 * @returns {Record<string, string>} Error message per field path; empty when the form is valid.
 */
function testFormValues() {
    const errors = {};
    const values = globalThis.STATE.values;

    const testUrl = (text) => {
        try {
            const url = new URL(text);
            return url.protocol === 'http:' || url.protocol === 'https:';
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
        const jsonError = control === 'json' && isFilledText ? getJsonError(value, definition.schema.type) : '';

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

        // Map rows: a value needs a key, and keys are not repeated.
        if (control === 'map') {
            Object.assign(errors, testMapRows(name, value));
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
    const automationError = automationText.trim() === ''
        ? 'Required. Enter the bot automation as a JSON object.'
        : getJsonError(automationText, 'object');

    if (automationError !== '') {
        errors.automation = automationError;
    }

    return errors;
}

/**
 * Checks the entries of one add-entry list, with the same rules the list editor shows.
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
 * Checks the rows of one key/value map, with the same rules the key/value editor shows.
 *
 * @remarks
 * Compute-only. A value needs a key; a repeated key is reported on its later occurrence.
 *
 * @param {string} name - Map field name.
 * @param {{ key: string, value: string }[]} rows - Map rows as typed.
 * @returns {Record<string, string>} Error message per row path (`name.index.key`).
 */
function testMapRows(name, rows) {
    const errors = {};
    const firstIndexes = new Map();

    rows.forEach((row, index) => {
        const key = row.key.trim();

        // A value needs a key; a repeated key points back to its first occurrence.
        if (key === '' && row.value.trim() !== '') {
            errors[`${name}.${index}.key`] = 'Enter a key for this value.';
        } else if (key !== '' && firstIndexes.has(key)) {
            errors[`${name}.${index}.key`] = `Duplicate of key ${firstIndexes.get(key) + 1}.`;
        } else if (key !== '') {
            firstIndexes.set(key, index);
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
 * Renders the action bar: Publish, Reset to Defaults, and the status note.
 */
function writeActionBar() {
    // Publish and Reset to Defaults, with the test ids the page has always used.
    const actions = [
        { id: 'publish', label: 'Publish', testId: 'publish-flow-button', variant: 'primary' },
        { id: 'reset', label: 'Reset to Defaults', testId: 'reset-flow-to-defaults-button', variant: 'secondary' }
    ];

    document.getElementById('g4-actionbar').innerHTML = `
    <g4-action-bar actions="${convertToSafeHtml(actions)}"
                   note-duration="2500"
                   test-id="publish-flow-status"></g4-action-bar>`;
}

/**
 * Builds the collapsed Automation section: size, authentication and encoding notes, the token
 * warnings, and the editable bot JSON. The bot path is already in the page header.
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
    const sizeText = getAutomationSizeText(globalThis.STATE.automationText) || automation.sizeText;

    const bodyHtml = `
        <div class="flow-publisher-automation-meta">
            <span id="flow-automation-size" data-test-id="flow-automation-size">${convertToSafeHtml(sizeText)}</span>
            <span data-test-id="flow-automation-authentication">${authenticationText}</span>
            <span>Base64 encoded on publish</span>
        </div>
        <g4-notice-list id="flow-automation-warnings"
                        data-test-id="flow-automation-warnings"
                        role="status"
                        test-id="flow-automation-warning"
                        variant="warning"></g4-notice-list>
        ${writeField({
            controlHtml: `
            <g4-json-textarea data-automation="true"
                              json-type="object"
                              test-id="automation-json-textarea">${convertToSafeHtml(globalThis.STATE.automationText)}</g4-json-textarea>`,
            errorPath: 'automation',
            label: '',
            testId: 'automation-field'
        })}`;

    return writeSectionShell({
        bodyHtml,
        description: 'The bot automation that is published, as JSON. Edits are published and, after a successful publish, saved to the bot file with its authentication block restored.',
        id: 'automation',
        title: 'Automation'
    });
}

/**
 * Builds a field frame around a control: label, required mark, hint, and the error line.
 *
 * @param {{ controlHtml: string, errorPath: string, hint?: string, isRequired?: boolean, label: string, testId: string }} options - Field data.
 * @returns {string} Field HTML.
 */
function writeField(options) {
    // A field shows the error state holds for it (after a publish or a server answer).
    const error = globalThis.STATE.errors[options.errorPath] ?? '';
    const requiredAttribute = options.isRequired ? ' required' : '';
    const errorAttribute = error === '' ? '' : ` error="${convertToSafeHtml(error)}"`;

    return `
    <g4-field data-error-path="${convertToSafeHtml(options.errorPath)}"${errorAttribute}
              hint="${convertToSafeHtml(options.hint ?? '')}"
              label="${convertToSafeHtml(options.label)}"${requiredAttribute}
              test-id="${convertToSafeHtml(options.testId)}">${options.controlHtml}</g4-field>`;
}

/**
 * Builds one form field from its definition: the frame and the control that edits its value.
 *
 * @param {object} definition - Field definition.
 * @returns {string} Field HTML.
 */
function writeFieldControl(definition) {
    const name = definition.name;
    const value = globalThis.STATE.values[name];
    const pathAttribute = `data-path="${name}"`;
    let controlHtml;

    // An object (author) is a row of ordinary fields, one per property, with no wrapper label.
    if (definition.control === 'object') {
        return writeObjectField(definition);
    }

    // Pick the component that edits this field.
    switch (definition.control) {
        case 'markdown':
            controlHtml = `
            <g4-markdown-textarea ${pathAttribute}
                                  reference-note="${convertToSafeHtml(MARKDOWN_REFERENCE_NOTE)}"
                                  test-id="${name}-markdown-textarea">${convertToSafeHtml(value)}</g4-markdown-textarea>`;
            break;
        case 'list':
            controlHtml = `
            <g4-list-editor ${pathAttribute}
                            item-label="${convertToSafeHtml(definition.label)}"
                            max-length="${LIST_ENTRY_MAXIMUM_LENGTH}"
                            test-id="${name}-list-editor"
                            unique
                            value="${convertToSafeHtml(value)}"></g4-list-editor>`;
            break;
        case 'map':
            controlHtml = `
            <g4-key-value-editor ${pathAttribute}
                                 item-label="${convertToSafeHtml(definition.label)} entry"
                                 test-id="${name}-key-value-editor"
                                 value="${convertToSafeHtml(value)}"></g4-key-value-editor>`;
            break;
        case 'parameters':
            controlHtml = writeParametersField(definition);
            break;
        case 'json':
            controlHtml = `
            <g4-json-textarea ${pathAttribute}
                              json-type="${convertToSafeHtml(definition.schema.type)}"
                              test-id="${name}-json-textarea">${convertToSafeHtml(value)}</g4-json-textarea>`;
            break;
        default: {
            const inputType = definition.control === 'url' ? 'url' : 'text';

            controlHtml = `
            <g4-text-input type="${inputType}"
                           data-control="${definition.control}"
                           ${pathAttribute}
                           test-id="${name}-text-input"
                           value="${convertToSafeHtml(value)}"></g4-text-input>`;
        }
    }

    // Parameters: the section title and description already name the list, as in the settings
    // list sections, so the field has no label or hint.
    const isListOnly = definition.isLabelHidden === true;
    const hint = isListOnly ? '' : definition.hint;
    const label = isListOnly ? '' : definition.label;

    return writeField({
        controlHtml,
        errorPath: name,
        hint,
        isRequired: definition.isRequired,
        label,
        testId: `${name}-field`
    });
}

/**
 * Builds an object field (author) as one row of ordinary fields, one per property: "Author Name",
 * "Author Link", each with its own label, schema hint, input, and error line.
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
        const hint = FIELD_HINTS[path] ?? convertToSafeText(definition.schema.properties?.[property]?.description);

        return writeField({
            controlHtml: `
            <g4-text-input type="${inputType}"
                           data-path="${path}"
                           test-id="${definition.name}-${property}-text-input"
                           value="${convertToSafeHtml(value[property])}"></g4-text-input>`,
            errorPath: path,
            hint,
            label: `${definition.label} ${getLabelText(property)}`,
            testId: `${definition.name}-${property}-field`
        });
    }).join('');

    return `<div class="flow-publisher-field-row">${fieldsHtml}</div>`;
}

/**
 * Builds one parameter property control in its field: text input, Markdown or plain text box, or
 * toggle switch.
 *
 * @param {{ index: number, path: string, property: object, row: object }} options - Input data.
 * @returns {string} Control HTML.
 */
function writeParameterInput(options) {
    const { index, path, property, row } = options;
    const errorPath = `${path}.${index}.${property.name}`;
    const testId = `parameter-${index}-${property.name}`;
    const value = row.fields[property.name];
    const dataAttributes = `data-parameter-index="${index}" data-path="${path}" data-property="${property.name}"`;

    // Booleans render as toggle switches with their own label and hint.
    if (property.kind === 'checkbox') {
        const checkedAttribute = value ? ' checked' : '';

        return `
        <g4-toggle ${dataAttributes}${checkedAttribute}
                   hint="${convertToSafeHtml(property.hint)}"
                   label="${convertToSafeHtml(property.label)}"
                   test-id="${testId}-toggle"></g4-toggle>`;
    }

    // Every other property is a labelled field with its hint and error line.
    let controlHtml;

    if (property.kind === 'markdown') {
        controlHtml = `
        <g4-markdown-textarea ${dataAttributes}
                              reference-note="${convertToSafeHtml(MARKDOWN_REFERENCE_NOTE)}"
                              test-id="${testId}-markdown-textarea">${convertToSafeHtml(value)}</g4-markdown-textarea>`;
    } else if (property.kind === 'lines') {
        controlHtml = `
        <g4-code-textarea ${dataAttributes}
                          rows="2"
                          test-id="${testId}-code-textarea">${convertToSafeHtml(value)}</g4-code-textarea>`;
    } else {
        controlHtml = `
        <g4-text-input ${dataAttributes}
                       test-id="${testId}-text-input"
                       value="${convertToSafeHtml(value)}"></g4-text-input>`;
    }

    return writeField({
        controlHtml,
        errorPath,
        hint: property.hint,
        label: property.label,
        testId: `${testId}-field`
    });
}

/**
 * Builds one foldable parameter card: name, display name, type, and default in a row; the text
 * properties; the toggles; and the nested Values.
 *
 * @param {{ definition: object, index: number, properties: object[], row: object }} options - Row data.
 * @returns {string} Card HTML.
 */
function writeParameterRow(options) {
    const { definition, index, properties, row } = options;
    const path = definition.name;

    // Renders every property of one kind with the shared input writer.
    const writeInputs = (kind) => properties
        .filter((property) => property.kind === kind)
        .map((property) => writeParameterInput({ index, path, property, row }))
        .join('');

    // The card keeps its fold state across renders; its title follows the name and type.
    const openAttribute = row.isOpen ? ' open' : '';

    return `
    <g4-card data-card-kind="parameter"
             data-index="${index}"
             data-path="${path}"
             card-title="${convertToSafeHtml(writeParameterTitle(row, index))}"
             item-label="parameter ${index + 1}"${openAttribute}
             test-id="parameter-${index}">
        <div class="flow-publisher-field-row">${writeInputs('text')}</div>
        ${writeInputs('markdown')}
        ${writeInputs('lines')}
        <div class="flow-publisher-toggle-row">${writeInputs('checkbox')}</div>
        ${writeValuesField({ index, path, row })}
    </g4-card>`;
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
 * Builds the parameters editor: a list of foldable cards and an add button.
 *
 * @param {object} definition - The parameters field definition.
 * @returns {string} Card list HTML.
 */
function writeParametersField(definition) {
    const rows = globalThis.STATE.values[definition.name];
    const properties = getParameterProperties(definition);

    // One card per parameter, in the card list with its add button.
    const cardsHtml = rows
        .map((row, index) => writeParameterRow({ definition, index, properties, row }))
        .join('');

    return `
    <g4-card-list data-path="${definition.name}"
                  add-label="+ Add parameter"
                  empty-text="None."
                  test-id="parameters-card-list">${cardsHtml}</g4-card-list>`;
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
        ? writeFieldControl({ ...definitions[0], isLabelHidden: true })
        : definitions.map((definition) => writeFieldControl(definition)).join('');
    const previewHtml = '<div id="flow-publisher-key-preview" class="flow-publisher-key-preview" data-test-id="flow-key-preview" aria-live="polite"></div>';
    const bodyHtml = section.id === 'identity'
        ? `<div class="flow-publisher-field-row">${fieldsHtml}</div>${previewHtml}`
        : fieldsHtml;

    return writeSectionShell({ bodyHtml, description: section.description, id: section.id, title: section.title });
}

/**
 * Builds a foldable section around its content.
 *
 * @param {{ bodyHtml: string, description: string, id: string, title: string }} options - Section content.
 * @returns {string} Section HTML.
 */
function writeSectionShell(options) {
    // A section stays open or folded across renders.
    const openAttribute = globalThis.STATE.openSectionIds.has(options.id) ? ' open' : '';

    return `
    <g4-section data-section-id="${options.id}"
                description="${convertToSafeHtml(options.description)}"${openAttribute}
                section-title="${convertToSafeHtml(options.title)}"
                test-id="flow-${options.id}-section">${options.bodyHtml}</g4-section>`;
}

/**
 * Builds one foldable value card inside a parameter card: Name and Display Name side by side,
 * then the Description Markdown box.
 *
 * @param {{ index: number, path: string, valueIndex: number, valueRow: object }} options - Parameter row index, field name, and the value.
 * @returns {string} Value card HTML.
 */
function writeValueRow(options) {
    const { index, path, valueIndex, valueRow } = options;
    const idPrefix = `parameter-${index}-value-${valueIndex}`;
    const errorBase = `${path}.${index}.${PARAMETER_VALUES_PROPERTY}.${valueIndex}`;

    // One labelled field per value property; Name and Description are required.
    const writeValueField = (field) => {
        const testId = `${idPrefix}-${field.name}`;
        const rowAttributes = `data-parameter-index="${index}" data-path="${path}"`;
        const dataAttributes = `${rowAttributes} data-value-index="${valueIndex}" data-value-property="${field.name}"`;
        const controlHtml = field.name === 'description'
            ? `
            <g4-markdown-textarea ${dataAttributes}
                                  reference-note="${convertToSafeHtml(MARKDOWN_REFERENCE_NOTE)}"
                                  test-id="${testId}-markdown-textarea">${convertToSafeHtml(valueRow.description)}</g4-markdown-textarea>`
            : `
            <g4-text-input ${dataAttributes}
                           test-id="${testId}-text-input"
                           value="${convertToSafeHtml(valueRow[field.name])}"></g4-text-input>`;

        return writeField({
            controlHtml,
            errorPath: `${errorBase}.${field.name}`,
            hint: field.hint,
            isRequired: field.name !== 'displayName',
            label: field.label,
            testId: `${testId}-field`
        });
    };

    // Name and Display Name share a row; the card keeps its fold state across renders.
    const [nameField, displayNameField, descriptionField] = VALUE_FIELDS;
    const openAttribute = valueRow.isOpen ? ' open' : '';

    return `
    <g4-card data-card-kind="value"
             data-index="${index}"
             data-path="${path}"
             data-value-index="${valueIndex}"
             card-title="${convertToSafeHtml(writeValueTitle(valueRow, valueIndex))}"
             item-label="value ${valueIndex + 1}"${openAttribute}
             test-id="${idPrefix}">
        <div class="flow-publisher-field-row">${writeValueField(nameField)}${writeValueField(displayNameField)}</div>
        ${writeValueField(descriptionField)}
    </g4-card>`;
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
 * Builds the nested Values field of a parameter card: label, hint, value cards, and an add button.
 *
 * @param {{ index: number, path: string, row: object }} options - Parameter row index, field name, and row state.
 * @returns {string} Values field HTML.
 */
function writeValuesField(options) {
    const { index, path, row } = options;

    // One card per value, in the field's card list with its add button.
    const cardsHtml = row.values
        .map((valueRow, valueIndex) => writeValueRow({ index, path, valueIndex, valueRow }))
        .join('');

    return writeField({
        controlHtml: `
        <g4-card-list data-path="${path}"
                      data-values-of="${index}"
                      add-label="+ Add value"
                      empty-text="None."
                      test-id="parameter-${index}-values-card-list">${cardsHtml}</g4-card-list>`,
        errorPath: `${path}.${index}.${PARAMETER_VALUES_PROPERTY}`,
        hint: PARAMETER_HINTS[PARAMETER_VALUES_PROPERTY],
        label: 'Values',
        testId: `parameter-${index}-values-field`
    });
}
// Host messages: existence lookups and publish results.
window.addEventListener('message', onHostMessage); // NOSONAR - sandboxed webview; any origin accepted by design

startFlowPublisher();
