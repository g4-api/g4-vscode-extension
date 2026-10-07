/*
 * G4(TM) Template Publisher component.
 *
 * Renders a form for one G4PluginAttribute (a template manifest), built from the template schema that
 * the extension host reads from the Hub's OpenAPI document (swagger/templates/docs.json) and injects
 * through #g4-data. The page is assembled from the reusable G4 components (resources.components/g4-*):
 * sections, fields, text inputs, Markdown and JSON text areas, list and key/value editors, cards,
 * toggles, notice lists, the page header, and the action bar. This script owns only the template:
 * the form model, state, checks, token warnings, and the host messages.
 *
 * Host contract (update-template-publisher.ts):
 * - Injected #g4-data: { defaults, existingTemplate, file, isSchemaFallback, rules, schemas, source, summaryTemplate }.
 * - Webview → host: { command: 'lookupTemplate', requestId, namespace, key, fileName }
 *                   { command: 'publish', fileName, rulesText, values, warnings }
 * - Host → webview: { command: 'templateLookup', requestId, existingTemplate, isFileExisting }
 *                   { command: 'publishResult', isSuccess, isCancelled, message, fieldErrors, existingTemplate,
 *                     file, savedRulesText, savedValues, source }
 *
 * Tokens: the rules reference a parameter as `{{$ Parameters.Name }}` and a property as
 * `{{$ Properties.Name }}`; the words and the names are matched ignoring case. Unused parameters or
 * properties, unknown names, and broken tokens are warnings: they are shown on the page and listed
 * in a confirmation the host shows on Publish, but never block publishing.
 *
 * Properties are the rule schema's own inputs: a fixed set (PROPERTY_NAMES), each added at most once
 * from a list of the names still free. Parameters are free-named and unlimited.
 *
 * The page never talks to the network; the host owns every Hub call and every file write. The Rules
 * box edits the rules array as JSON; the host publishes it as it is and, after a successful publish,
 * saves the whole template to its file in the workspace templates folder.
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
    'author.name': 'The person or team that maintains this template.',
    aliases: 'Other names that also find and run this template. Up to 55 characters each.',
    categories: 'Groups the template appears under when browsing the G4 catalog. Add at least one, up to 55 characters each.',
    context: 'Extra data stored with the template, as a JSON object. Leave it empty for none.',
    description: 'Longer details: what the template needs, what it changes, and what it returns. Supports Markdown.',
    examples: 'Worked examples shown in the G4 catalog. Add at least one: a Markdown description and the rule that calls the template.',
    key: 'The template\'s unique name; it is also the plugin name that rules use to call it. Normalized to PascalCase when you leave the field.',
    namespace: 'Groups related templates. Leave it empty to use G4.System. The Hub identifies a template by key alone, so a key that exists under another namespace is rejected.',
    platforms: 'Where the template can run, for example Windows, Linux, or Any. Add at least one, up to 55 characters each.',
    projectUrl: 'Where to read more about the template, such as its repository or documentation.',
    properties: 'The rule inputs the template fills in, read by the rules as {{$ Properties.Name }}. Each of the six can be added once.',
    protocol: 'Key/value settings for the protocol the template uses. Leave it empty for none.',
    summary: 'A short explanation of what the template does, shown in the G4 catalog. Supports Markdown.',
    version: 'Your own version label for this template, for example 1.0.0.'
};

// UI policy layered over the schema: the section a field belongs to, its order, label, and any
// control that the schema type alone cannot express. Schema fields missing here are still rendered
// (Additional Fields section, by schema type), so a new backend field appears without a code change.
// Hidden fields are never edited here: the host keeps the stored values of entity, outputParameters,
// and ruleType, and always sets the identity fields (pluginType and source).
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
    properties: { section: 'properties', order: 1, label: 'Properties' },
    parameters: { section: 'parameters', order: 1, label: 'Parameters' },
    examples: { section: 'examples', order: 1, label: 'Examples', control: 'examples', isRequired: true },
    context: { section: 'context', order: 1, label: 'Context', control: 'json' },
    protocol: { section: 'context', order: 2, label: 'Protocol' },
    entity: { section: 'hidden' },
    id: { section: 'hidden' },
    outputParameters: { section: 'hidden' },
    pluginType: { section: 'hidden' },
    rules: { section: 'hidden' },
    ruleType: { section: 'hidden' },
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

// Delay after the last Key or Namespace edit before asking the host whether the template exists,
// so typing does not send one Hub request per keystroke.
const LOOKUP_DELAY_MILLISECONDS = 400;

// The properties of an example that the card edits; every other stored property is kept and sent back.
const EXAMPLE_EDITED_NAMES = ['description', 'rule'];

// A template file name: a plain name ending in .json, with no folder part and no character that a
// file name cannot hold. Linear: one negated character class followed by a literal.
const FILE_NAME_PATTERN = /^[^\\/:*?"<>|\u0000-\u001f]+\.json$/i;

// Anything that looks like a parameter or property token: the word parameters or properties (not
// part of a longer word) followed by a dot, with any braces, `$`, and spaces around it. Every match
// that is not exactly a strict token is a broken token. Linear: the character classes on either side
// of each quantifier are disjoint, so no position can be matched two ways.
const LOOSE_TOKEN_PATTERN = /(?:\{+[\s$]*)?(?<!\w)(?:parameters|properties)\s*\.\s*[^\s{}"]*[ \t]*\}*/gi;

// Root schema of the form.
const MANIFEST_SCHEMA_NAME = 'G4PluginAttribute';

// Sentence above the Markdown reference of every Markdown box on this page.
const MARKDOWN_REFERENCE_NOTE = 'Summary and description text is Markdown; each line is published as one entry. The most common syntax:';

// The rule properties a template can expose, in display order. The rule schema defines them, so the
// set is fixed and each name can be added once.
const PROPERTY_NAMES = ['argument', 'onElement', 'onAttribute', 'locator', 'locatorType', 'regularExpression'];

// Properties of a property card that the form does not edit: a property is never multiple.
const PROPERTY_HIDDEN_PROPERTIES = ['multiple'];

// The plus icon of the add-property button, embedded so the page needs no image file. It takes the
// button text color.
const PLUS_ICON_HTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" width="14" height="14" aria-hidden="true" focusable="false"><path fill="currentColor" d="M352 128C352 110.3 337.7 96 320 96C302.3 96 288 110.3 288 128L288 288L128 288C110.3 288 96 302.3 96 320C96 337.7 110.3 352 128 352L288 352L288 512C288 529.7 302.3 544 320 544C337.7 544 352 529.7 352 512L352 352L512 352C529.7 352 544 337.7 544 320C544 302.3 529.7 288 512 288L352 288L352 128z"/></svg>';

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

// Page sections in display order. Identity, Template File, Description, and Rules start open; the
// rest start collapsed, exactly like the collapsed-by-default sections of the settings editor.
const SECTIONS = [
    {
        id: 'identity',
        isOpenByDefault: true,
        title: 'Identity',
        description: 'The key identifies the template in the G4 Hub; publishing the same key again overwrites it.'
    },
    {
        id: 'file',
        isOpenByDefault: true,
        title: 'Template File',
        description: 'The file in the workspace templates folder that holds this template.'
    },
    {
        id: 'description',
        isOpenByDefault: true,
        title: 'Description',
        description: 'Text shown for the template in the G4 catalog.'
    },
    {
        id: 'classification',
        isOpenByDefault: false,
        title: 'Classification',
        description: 'Categories, aliases, and platforms used to find and group the template.'
    },
    {
        id: 'author',
        isOpenByDefault: false,
        title: 'Author & Links',
        description: 'Who maintains the template and where to learn more about it.'
    },
    {
        id: 'properties',
        isOpenByDefault: false,
        title: 'Properties',
        description: 'The rule properties the template exposes: argument, onElement, onAttribute, locator, locatorType, and regularExpression, each at most once. Open a card to edit a property.'
    },
    {
        id: 'parameters',
        isOpenByDefault: false,
        title: 'Parameters',
        description: 'Named inputs the template accepts. Open a card to edit a parameter.'
    },
    {
        id: 'rules',
        isOpenByDefault: true,
        title: 'Rules',
        description: 'The rules the template runs, as a JSON array. Each rule needs a $type and a pluginName.'
    },
    {
        id: 'examples',
        isOpenByDefault: true,
        title: 'Examples',
        description: 'Worked examples shown in the G4 catalog. At least one is required.'
    },
    {
        id: 'context',
        isOpenByDefault: false,
        title: 'Context & Protocol',
        description: 'Extra data stored with the template: a JSON context object and protocol key/value settings.'
    },
    {
        id: 'additional',
        isOpenByDefault: false,
        title: 'Additional Fields',
        description: 'Fields published by the G4 Hub schema that have no dedicated editor yet.'
    }
];

// The strict token: `{{$ Parameters.Name }}` or `{{$ Properties.Name }}` (any case) with exactly one space after
// `{{$` and one before `}}`. The name is everything up to that space. Linear: one negated class
// between literals.
const STRICT_TOKEN_PATTERN = /\{\{\$ (parameters|properties)\.([^\s{}"]+) \}\}/gi;

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
    definitions: [],
    errors: {},
    existingTemplate: null,
    fileName: '',
    isFileExisting: false,
    isFileNameEdited: false,
    isPublishing: false,
    isSummaryEdited: false,
    lookupRequestId: 0,
    lookupTimer: undefined,
    openSectionIds: new Set(SECTIONS.filter((section) => section.isOpenByDefault).map((section) => section.id)),
    propertyPick: '',
    publishResult: null,
    rulesText: '',
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
 * Normalizes text into a PascalCase template key.
 *
 * @remarks
 * Compute-only, and identical to UpdateTemplatePublisherCommand.convertToPascalCase on the host: split on every
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
 * Describes the rules text for the Rules section: the rule count and the compact JSON size.
 *
 * @param {string} text - Rules JSON text.
 * @returns {string} Text such as '4 rules · 1.2 KB', or '' when the text does not parse.
 */
function getRulesSummaryText(text) {
    try {
        const rules = JSON.parse(text);
        const compactText = JSON.stringify(rules);
        const sizeText = `${(new TextEncoder().encode(compactText).length / 1024).toFixed(1)} KB`;
        const count = Array.isArray(rules) ? rules.length : 0;

        return `${count} ${count === 1 ? 'rule' : 'rules'} · ${sizeText}`;
    } catch {
        return '';
    }
}

/**
 * Builds the banner notices: schema fallback, overwrite notices, and the last publish result.
 *
 * @returns {object[]} Notices for the banner list.
 */
function getBannerNotices() {
    const state = globalThis.STATE;
    const notices = [];

    // Schema source: the form falls back to the bundled schema when the Hub is unreachable.
    if (globalThis.INJECTED?.isSchemaFallback) {
        notices.push({ testId: 'schema-fallback-banner', text: 'Using the built-in template schema; the G4 Hub could not be reached.' });
    }

    // Overwrite notice, with a shortcut to load the stored values into the form.
    if (state.existingTemplate) {
        const templateNamespace = convertToSafeText(state.existingTemplate.namespace) || 'G4.System';
        const templateKey = convertToSafeText(state.existingTemplate.key);

        notices.push({
            action: { id: 'load-existing', label: 'Load existing values', testId: 'load-existing-template-values-button' },
            testId: 'template-overwrite-banner',
            text: `${templateNamespace}/${templateKey} already exists in the G4 Hub; publishing will overwrite it.`
        });
    }

    // A bot-derived template is saved to a new file; tell the user when that file is already taken.
    const isNewFile = globalThis.INJECTED?.file?.kind === 'bot';

    if (isNewFile && state.isFileExisting && state.fileName.trim() !== '') {
        notices.push({
            testId: 'template-file-overwrite-banner',
            text: `templates/${state.fileName.trim()} already exists; publishing will overwrite it.`
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
 * Builds the ordered field definitions from the template schema and the UI policy.
 *
 * @remarks
 * Compute-only. Each definition carries the resolved schema, the control derived from the schema
 * type (unless the policy names one), the section, label, help text, and required flag.
 *
 * @param {Record<string, object>} schemas - components.schemas from the template OpenAPI document.
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
 * Compute-only. Only schema fields are sent; the host leaves the host-owned fields to the host.
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

        // A rule property is one value, never a repeated one, and is published with the rule
        // schema's own spelling (a stored "Argument" is published as "argument").
        if (getIsPropertyField(definition)) {
            parameter.multiple = false;
            parameter.name = getPropertyName(parameter.name);
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
            case 'examples':
                values[definition.name] = value.map((row) => ({
                    ...row.extra,
                    description: convertToLines(row.description),
                    rule: JSON.parse(row.rule)
                }));
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
 * Tells whether a field definition is the fixed-set Properties field (not the free Parameters list).
 *
 * @param {{ name: string }} definition - A field definition with the parameters control.
 * @returns {boolean} True for the properties field.
 */
function getIsPropertyField(definition) {
    return definition?.name === 'properties';
}

/**
 * Returns the rule schema's spelling of a property name.
 *
 * @remarks
 * Compute-only. Property names are matched ignoring case (a template file may hold "Argument"),
 * but the published name always uses the spelling in PROPERTY_NAMES. A name that matches none is
 * returned as it is; the form does not publish it, since its card is flagged as an error.
 *
 * @param {string} name - Property name as stored or typed (already trimmed).
 * @returns {string} The PROPERTY_NAMES spelling, or the name unchanged.
 */
function getPropertyName(name) {
    const key = name.toLowerCase();

    return PROPERTY_NAMES.find((propertyName) => propertyName.toLowerCase() === key) ?? name;
}

/**
 * Describes why a property card's name is not allowed.
 *
 * @remarks
 * Compute-only. A property name must be one of PROPERTY_NAMES (ignoring case) and used by one card
 * only; a repeated name is reported on its later card, so the first one stays clean.
 *
 * @param {{ fields: { name?: string } }} row - Property card state.
 * @param {number} index - Position of the card.
 * @returns {string} '' when the name is allowed; otherwise the error line.
 */
function getPropertyNameError(row, index) {
    const getKey = (name) => (name ?? '').trim().toLowerCase();
    const key = getKey(row.fields.name);

    if (!PROPERTY_NAMES.some((name) => name.toLowerCase() === key)) {
        return `Use one of: ${PROPERTY_NAMES.join(', ')}.`;
    }

    const rows = globalThis.STATE.values.properties ?? [];
    const firstIndex = rows.findIndex((item) => getKey(item.fields.name) === key);

    return firstIndex < index ? `Duplicate of property ${firstIndex + 1}.` : '';
}

/**
 * Returns the fixed property names that no property card uses yet, in display order.
 *
 * @remarks
 * Compute-only. Names are compared ignoring case and surrounding spaces.
 *
 * @returns {string[]} Free names from PROPERTY_NAMES.
 */
function getFreePropertyNames() {
    const rows = globalThis.STATE.values.properties ?? [];
    const usedNames = new Set(rows.map((row) => (row.fields.name ?? '').trim().toLowerCase()));

    return PROPERTY_NAMES.filter((name) => !usedNames.has(name.toLowerCase()));
}

/**
 * Returns the names of the parameters and properties in the form, trimmed, without blank names.
 *
 * @returns {{ parameters: string[], properties: string[] }} Names in form order, by token kind.
 */
function getTokenNames() {
    const getNames = (fieldName) => {
        const definition = globalThis.STATE.definitions.find((item) => item.name === fieldName && item.control === 'parameters');
        const rows = definition ? globalThis.STATE.values[fieldName] : [];

        return rows
            .map((row) => (row.fields.name ?? '').trim())
            .filter((name) => name !== '');
    };

    return { parameters: getNames('parameters'), properties: getNames('properties') };
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
    // A property card also hides `multiple`, which is always false for a rule property.
    const hiddenNames = getIsPropertyField(definition)
        ? [...PARAMETER_HIDDEN_PROPERTIES, ...PROPERTY_HIDDEN_PROPERTIES]
        : PARAMETER_HIDDEN_PROPERTIES;
    const entries = Object.entries(itemSchema.properties ?? {})
        .filter(([name]) => !hiddenNames.includes(name))
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

        // A property card words its hints about a property, not a parameter.
        const parameterHint = PARAMETER_HINTS[name] ?? propertySchema.description ?? '';
        const hint = getIsPropertyField(definition)
            ? parameterHint.replaceAll('parameter', 'property')
            : parameterHint;

        return { name, kind, label: getLabelText(name), hint };
    }).filter((property) => property.kind !== 'json');
}

/**
 * Finds parameter and property token problems in the rules text.
 *
 * @remarks
 * Compute-only. A strict token names a parameter or a property, ignoring case. A parameter or
 * property that no strict token names is unused, and a strict token naming nothing in its list is
 * unknown. An unknown property says whether the name is not a rule property at all or is one that
 * has no card yet. Any token-like text that is not exactly a strict token is broken.
 *
 * @param {string} text - Rules JSON text.
 * @param {{ parameters: string[], properties: string[] }} names - Names in the form (blank names excluded).
 * @returns {{ broken: object[], unknown: object[], unused: string[], unusedProperties: string[] }} Issues; positions are offsets into the text.
 */
function getTokenIssues(text, names) {
    const getLine = (offset) => text.slice(0, offset).split('\n').length;
    const getKey = (name) => name.toLowerCase();

    // Strict tokens: the names they reference and the ranges they cover.
    const strictMatches = [...text.matchAll(STRICT_TOKEN_PATTERN)];
    const strictRanges = strictMatches.map((match) => [match.index, match.index + match[0].length]);
    const getUsedKeys = (kind) => new Set(strictMatches
        .filter((match) => getKey(match[1]) === kind)
        .map((match) => getKey(match[2])));
    const usedParameterKeys = getUsedKeys('parameters');
    const usedPropertyKeys = getUsedKeys('properties');

    // Unknown names, each with the reason: not a rule property at all, or a property without a card.
    const unknown = strictMatches
        .map((match) => ({ kind: getKey(match[1]), match }))
        .filter(({ kind, match }) => !names[kind].some((name) => getKey(name) === getKey(match[2])))
        .map(({ kind, match }) => ({
            end: match.index + match[0].length,
            isFixedName: kind === 'properties' && PROPERTY_NAMES.some((name) => getKey(name) === getKey(match[2])),
            kind,
            line: getLine(match.index),
            name: match[2],
            start: match.index
        }));

    // Broken tokens: token-like text that no strict token covers exactly.
    const broken = [...text.matchAll(LOOSE_TOKEN_PATTERN)]
        .filter((match) => !strictRanges.some(([start, end]) => start === match.index && end === match.index + match[0].length))
        .map((match) => ({ end: match.index + match[0].length, line: getLine(match.index), start: match.index, text: match[0] }));

    // Unused parameters and properties, once each, in form order.
    const getUnused = (kind, usedKeys) => [...new Set(names[kind])].filter((name) => !usedKeys.has(getKey(name)));

    return {
        broken,
        unknown,
        unused: getUnused('parameters', usedParameterKeys),
        unusedProperties: getUnused('properties', usedPropertyKeys)
    };
}

/**
 * Builds the warning notices of the Rules section: one line per issue; line issues select their
 * text in the Rules box when pressed.
 *
 * @param {object} issues - Result of getTokenIssues.
 * @returns {object[]} Notices for the warning list.
 */
function getTokenWarningNotices(issues) {
    const code = (text) => ({ isCode: true, text });
    const text = (value) => ({ text: value });
    const selectAction = (issue) => ({ data: { end: issue.end, start: issue.start }, id: 'select-rules-text' });

    // Unused entries have no position; unknown and broken tokens select their text when pressed.
    return [
        ...issues.unused.map((name) => ({
            parts: [text('Unused parameter '), code(name), text(': the rules have no '), code(`{{$ Parameters.${name} }}`), text('.')]
        })),
        ...issues.unusedProperties.map((name) => ({
            parts: [text('Unused property '), code(name), text(': the rules have no '), code(`{{$ Properties.${name} }}`), text('.')]
        })),
        ...issues.unknown.map((issue) => ({
            action: selectAction(issue),
            parts: [
                text(`Line ${issue.line}: unknown ${issue.kind === 'parameters' ? 'parameter' : 'property'} `),
                code(issue.name),
                text('.'),
                ...getUnknownHintParts(issue)
            ]
        })),
        ...issues.broken.map((issue) => ({
            action: selectAction(issue),
            parts: [
                text(`Line ${issue.line}: broken token `),
                code(issue.text),
                text('. Use '),
                code('{{$ Parameters.Name }}'),
                text(' or '),
                code('{{$ Properties.Name }}'),
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
 * Describes what to do about an unknown property token, as notice parts.
 *
 * @remarks
 * Compute-only. A parameter token needs no extra hint.
 *
 * @param {{ isFixedName: boolean, kind: string }} issue - An unknown token issue.
 * @returns {object[]} Notice parts, empty for a parameter.
 */
function getUnknownHintParts(issue) {
    if (issue.kind !== 'properties') {
        return [];
    }

    return issue.isFixedName
        ? [{ text: ' Add it in Properties.' }]
        : [{ text: ` The rule properties are ${PROPERTY_NAMES.join(', ')}.` }];
}

/**
 * Lists the token warnings as plain sentences, for the publish confirmation and the tooltips.
 *
 * @param {object} issues - Result of getTokenIssues.
 * @returns {string[]} One sentence per warning.
 */
function getTokenWarningTexts(issues) {
    return [
        ...issues.unused.map((name) => `Unused parameter '${name}': the rules have no {{$ Parameters.${name} }}.`),
        ...issues.unusedProperties.map((name) => `Unused property '${name}': the rules have no {{$ Properties.${name} }}.`),
        ...issues.unknown.map((issue) => {
            const kindText = issue.kind === 'parameters' ? 'parameter' : 'property';
            const hintText = getUnknownHintParts(issue).map((part) => part.text).join('');

            return `Line ${issue.line}: unknown ${kindText} '${issue.name}'.${hintText}`;
        }),
        ...issues.broken.map((issue) => `Line ${issue.line}: broken token '${issue.text}'. Use {{$ Parameters.Name }} or {{$ Properties.Name }}.`)
    ];
}

/**
 * Tests the rules text and describes the first problem.
 *
 * @remarks
 * Compute-only. The text must be a non-empty JSON array whose entries are objects with a `$type`
 * (the rule kind: Action, Content, Extraction, Switch, or Transformer) and a `pluginName`. Nested
 * rules and every other property are checked by the Hub.
 *
 * @param {string} text - Rules JSON text.
 * @returns {string} '' when the rules are valid; otherwise the error line.
 */
function getRulesError(text) {
    if (text.trim() === '') {
        return 'Required. Enter the template rules as a JSON array.';
    }

    // Syntax and shape first, in the JSON text area's wording.
    const jsonError = getJsonError(text, 'array');

    if (jsonError !== '') {
        return jsonError;
    }

    // Then the minimum every rule needs.
    const rules = JSON.parse(text);

    if (rules.length === 0) {
        return 'Add at least one rule.';
    }

    const getHasText = (value) => typeof value === 'string' && value.trim() !== '';
    const invalidIndex = rules.findIndex((rule) => {
        const isObject = rule !== null && typeof rule === 'object' && !Array.isArray(rule);
        return !isObject || !getHasText(rule.$type) || !getHasText(rule.pluginName);
    });

    return invalidIndex === -1
        ? ''
        : `Rule ${invalidIndex + 1} needs a "$type" and a "pluginName".`;
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
 * Builds one example card state from a stored example (or an empty one).
 *
 * @remarks
 * Compute-only. The description is edited as Markdown (one array entry per line) and the rule as
 * JSON text; every other stored property (such as the example context) is kept in `extra` and sent
 * back unchanged. Cards start closed, like the parameter cards.
 *
 * @param {Record<string, unknown>} example - Stored example.
 * @returns {{ description: string, extra: object, isOpen: boolean, rule: string }} Row state.
 */
function newExampleRow(example) {
    const extra = Object.fromEntries(Object.entries(example ?? {}).filter(([name]) => !EXAMPLE_EDITED_NAMES.includes(name)));
    const description = Array.isArray(example?.description)
        ? example.description.filter((line) => typeof line === 'string').join('\n')
        : '';
    const rule = example?.rule !== null && typeof example?.rule === 'object'
        ? JSON.stringify(example.rule, null, 4)
        : '';

    return { description, extra, isOpen: false, rule };
}

/**
 * Converts a manifest (defaults, stored template) into form state values.
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
            case 'examples':
                values[definition.name] = (isArrayValue ? value : []).map((example) => newExampleRow(example));
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
 * so loading and re-publishing an existing template never drops data the form cannot show. Stored
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
 * Handles notice actions: loading the stored template, dismissing the result banner, and selecting a
 * warning's text in the Rules box.
 *
 * @param {CustomEvent} event - g4-action event of a notice list.
 */
function onAppAction(event) {
    const state = globalThis.STATE;
    const { data, id } = event.detail;

    // A token warning selects its text in the Rules box.
    if (id === 'select-rules-text') {
        document.querySelector('[data-rules="true"]')?.selectRange(data.start, data.end);
        return;
    }

    // The stored template replaces the form values; old errors no longer apply.
    if (id === 'load-existing') {
        setFormFromManifest(state.existingTemplate);
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
 * Adds the property picked in the property picker as a new open card.
 *
 * @param {MouseEvent} event - Click event of the app; only the picker's add button is handled.
 */
function onAppClick(event) {
    if (!event.target.closest('[data-property-add]')) {
        return;
    }

    const state = globalThis.STATE;
    const name = state.propertyPick;

    // The pick must still be free; the picker only offers free names, so this guards stale state.
    if (!getFreePropertyNames().includes(name)) {
        return;
    }

    const newRow = newParameterRow({ name }, getDefinition('properties'));

    // Cards follow the fixed order of the names, so the list reads the same however names were added.
    const rows = state.values.properties;
    const getRank = (row) => PROPERTY_NAMES.findIndex((item) => item.toLowerCase() === (row.fields.name ?? '').trim().toLowerCase());
    const insertIndex = rows.findIndex((row) => getRank(row) > getRank(newRow));

    rows.splice(insertIndex === -1 ? rows.length : insertIndex, 0, { ...newRow, isOpen: true });

    // Structural edits invalidate indexed error paths, so stale errors are dropped.
    state.errors = {};
    state.openSectionIds.add('properties');
    showForm();
}

/**
 * Applies a card list change: add a parameter, property, example, or value, move one, or remove one,
 * then renders the form again from state.
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
        let newRow;

        if (isValueList) {
            newRow = newValueRow({});
        } else if (path === 'examples') {
            newRow = newExampleRow({ rule: { $type: 'Action', pluginName: '' } });
        } else {
            newRow = newParameterRow({}, getDefinition(path));
        }

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
        const nameSelector = `[data-path="${path}"][data-parameter-index="${parameterIndex}"][data-value-index="${rows.length - 1}"]`;

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

    // Property picker: remembers which free property the add button adds.
    if (dataset.propertyPicker !== undefined) {
        state.propertyPick = value;
        return;
    }

    // Rules editor: kept apart from the manifest values; the host normalizes it when publishing.
    if (dataset.rules !== undefined) {
        state.rulesText = value;
        showRulesSummary();
        showTokenWarnings();
        return;
    }

    // Template file name: once typed, it stops following the key; the host reports whether it exists.
    if (dataset.fileName !== undefined) {
        state.fileName = value;
        state.isFileNameEdited = true;
        startTemplateLookup();
        return;
    }

    // Example card field (description or rule).
    if (dataset.exampleIndex !== undefined) {
        state.values.examples[Number(dataset.exampleIndex)][dataset.exampleProperty] = value;
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

    // Parameter or property row field; the card title follows the name and type as they are typed.
    if (dataset.parameterIndex !== undefined) {
        const rowIndex = Number(dataset.parameterIndex);
        state.values[dataset.path][rowIndex].fields[dataset.property] = value;
        showParameterTitle(dataset.path, rowIndex);
        showTokenWarnings();
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
        startTemplateLookup();
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

    // Parameter, example, and value cards keep their fold state in their rows.
    const dataset = target.dataset;
    const row = state.values[dataset.path]?.[Number(dataset.index)];
    const isRowCard = dataset.cardKind === 'parameter' || dataset.cardKind === 'example';

    if (isRowCard && row) {
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

    // Maps server field errors (C# property names) onto form paths, including the rules editor and
    // the file name; unknown keys stay in the banner.
    const getServerErrors = (fieldErrors) => {
        const errors = {};

        for (const [name, messages] of Object.entries(fieldErrors)) {
            const path = name.charAt(0).toLowerCase() + name.slice(1);
            const texts = [messages].flat().filter((text) => typeof text === 'string');
            const isFormPath = getDefinition(path) !== undefined || path === 'rules' || path === 'fileName';

            if (isFormPath && texts.length > 0) {
                errors[path] = texts.join(' ');
            }
        }

        return errors;
    };

    // Existence lookup: ignore answers that a newer key, namespace, or file name edit has already superseded.
    if (message?.command === 'templateLookup') {
        if (message.requestId !== state.lookupRequestId) {
            return;
        }

        state.existingTemplate = message.existingTemplate ?? null;
        state.isFileExisting = message.isFileExisting === true;
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

    if (message.existingTemplate) {
        state.existingTemplate = message.existingTemplate;
    }

    // The template file now holds the published template: Reset to Defaults restores it, and a
    // template made from a bot is from now on an ordinary template file.
    const injected = globalThis.INJECTED;
    const isSaved = isSuccess && injected && message.savedValues;

    if (isSaved) {
        injected.defaults = message.savedValues;
        injected.rules = { ...injected.rules, rulesText: convertToSafeText(message.savedRulesText) };

        // The editor shows the rules as published: normalized, without references or empty fields.
        state.rulesText = injected.rules.rulesText;
        injected.file = message.file ?? injected.file;
        state.fileName = convertToSafeText(injected.file?.fileName) || state.fileName;
        state.isFileExisting = false;
    }

    // The header names the template's source; a bot job's template now names its template file.
    const sourceLabel = convertToSafeText(message.source?.label);

    if (injected && sourceLabel !== '') {
        injected.source = { ...injected.source, label: sourceLabel };
        showHeader();
    }

    // Open whatever holds an error, re-render, and bring the result banner into view.
    setErrorSectionsOpen();
    showForm();
    showActionBar();
    showSaveNote(isSuccess ? 'Template published.' : 'Publish failed.');
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
    showSaveNote('Sending the template to the G4 Hub…');

    // Token warnings travel with the publish; the host asks for confirmation when there are any.
    const issues = getTokenIssues(state.rulesText, getTokenNames());

    globalThis.VSCODE?.postMessage({
        command: 'publish',
        fileName: state.fileName.trim(),
        rulesText: state.rulesText,
        values: getManifestValues(),
        warnings: getTokenWarningTexts(issues)
    });
}

/**
 * Restores every field to the opened template's defaults (Reset to Defaults), like the settings
 * editor's reset.
 */
function onResetClick() {
    const state = globalThis.STATE;
    const injected = globalThis.INJECTED ?? {};

    // Rebuild the values from the defaults and the rules; the default summary and file name follow the key again.
    state.values = newFormValues(injected.defaults ?? {}, state.definitions);
    state.rulesText = convertToSafeText(injected.rules?.rulesText);
    state.fileName = convertToSafeText(injected.file?.fileName);
    state.errors = {};
    state.isFileNameEdited = false;
    state.isSummaryEdited = false;
    state.publishResult = null;

    // Re-render and re-check whether the default identity already exists.
    showForm();
    showSaveNote('Defaults restored.');
    startTemplateLookup();
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
 * Opens every section and card that contains an error, so no error is hidden in a collapsed section.
 */
function setErrorSectionsOpen() {
    const state = globalThis.STATE;

    for (const path of Object.keys(state.errors)) {
        const [name, rowIndex, property, valueIndex] = path.split('.');
        const definition = getDefinition(name);

        // The rules editor and the file name have their own sections and no field definition.
        if (name === 'rules') {
            state.openSectionIds.add('rules');
            continue;
        }

        if (name === 'fileName') {
            state.openSectionIds.add('file');
            continue;
        }

        if (!definition) {
            continue;
        }

        state.openSectionIds.add(definition.section);

        // An example error also opens its card.
        const isExampleError = definition.control === 'examples' && rowIndex !== undefined;

        if (isExampleError && state.values[name][Number(rowIndex)]) {
            state.values[name][Number(rowIndex)].isOpen = true;
            continue;
        }

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
 * @param {Record<string, unknown> | null} manifest - Stored template manifest.
 */
function setFormFromManifest(manifest) {
    if (!manifest) {
        return;
    }

    // Stored values replace the form, rules included; the stored summary is the user's text, so it
    // stops following the key.
    const state = globalThis.STATE;
    state.values = newFormValues(manifest, state.definitions);
    state.isSummaryEdited = true;
    state.publishResult = { isSuccess: true, message: 'Loaded the stored values of this template.' };

    if (Array.isArray(manifest.rules)) {
        state.rulesText = JSON.stringify(manifest.rules, null, 4);
    }
}

/**
 * Applies a normalized key: updates state, refreshes the summary and file name defaults, preview,
 * and lookup.
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

    // A new file name follows the key until the user types one; an opened template file keeps its name.
    const isFileNameFollowing = !state.isFileNameEdited && globalThis.INJECTED?.file?.kind === 'bot' && key !== '';

    if (isFileNameFollowing) {
        state.fileName = `${key}.json`;

        const fileNameBox = document.querySelector('[data-file-name="true"]');

        if (fileNameBox) {
            fileNameBox.value = state.fileName;
        }
    }

    // Refresh the preview and ask whether the new identity already exists.
    showKeyPreview();
    startTemplateLookup();
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
 * Updates the rule count and size in the Rules section while the JSON is edited.
 *
 * @remarks
 * Text that does not parse keeps the last summary until it parses again.
 */
function showRulesSummary() {
    const summaryElement = document.getElementById('template-rules-size');
    const summaryText = getRulesSummaryText(globalThis.STATE.rulesText);

    if (summaryElement && summaryText !== '') {
        summaryElement.textContent = summaryText;
    }
}

/**
 * Shows the banner stack: schema fallback, overwrite notice, and the last publish result.
 */
function showBanners() {
    const banners = document.getElementById('template-publisher-banners');

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
    <div class="template-publisher-main">
        <g4-notice-list id="template-publisher-banners"
                        data-test-id="template-publisher-banners"
                        test-id="template-publisher-banner"></g4-notice-list>
        ${sectionsHtml}
        <div class="template-publisher-page-spacer"></div>
    </div>`;

    showBanners();
    showKeyPreview();
    showTokenWarnings();
}

/**
 * Renders the page header.
 */
function showHeader() {
    const label = convertToSafeText(globalThis.INJECTED?.source?.label);

    document.getElementById('g4-header').innerHTML = `
    <g4-page-header meta="${convertToSafeHtml(label)}"
                    page-title="G4&#x2122; Publish Template"
                    test-id="template-publisher-header"></g4-page-header>`;
}

/**
 * Updates the "Will publish as" preview under the key field.
 */
function showKeyPreview() {
    const preview = document.getElementById('template-publisher-key-preview');

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
    const card = document.querySelector(`g4-card[data-card-kind="parameter"][data-path="${path}"][data-index="${rowIndex}"]`);
    const row = globalThis.STATE.values[path]?.[rowIndex];

    // The card may not be rendered (for example during a re-render).
    if (card && row) {
        card.cardTitle = writeParameterTitle(row, rowIndex, path);
    }
}

/**
 * Shows the token warnings in place: the Parameters and Rules section headers, each unused
 * parameter's card header, and the warning list in the Rules section.
 *
 * @remarks
 * Only the warning holders change (and only when their text changes), so typing in the rules or a
 * parameter name keeps focus and the caret where they are.
 */
function showTokenWarnings() {
    const issues = getTokenIssues(globalThis.STATE.rulesText, getTokenNames());
    const getKey = (name) => name.toLowerCase();
    const unusedKeys = { parameters: new Set(issues.unused.map(getKey)), properties: new Set(issues.unusedProperties.map(getKey)) };
    const rulesCount = issues.unused.length + issues.unusedProperties.length + issues.unknown.length + issues.broken.length;

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
        document.querySelector('g4-section[data-section-id="properties"]'),
        issues.unusedProperties.length > 0 ? 'Unused Property(ies)' : '',
        issues.unusedProperties.join(', '));
    setWarning(
        document.querySelector('g4-section[data-section-id="rules"]'),
        rulesCount > 0 ? 'Token Warning(s)' : '',
        getTokenWarningTexts(issues).join('\n'));

    // Card headers: every parameter or property card whose (trimmed) name no token reads.
    const cardKinds = [
        { kind: 'parameters', label: 'Unused Parameter', tokenWord: 'Parameters' },
        { kind: 'properties', label: 'Unused Property', tokenWord: 'Properties' }
    ];

    for (const { kind, label, tokenWord } of cardKinds) {
        document.querySelectorAll(`g4-card[data-card-kind="parameter"][data-path="${kind}"]`).forEach((card) => {
            const rows = globalThis.STATE.values[kind] ?? [];
            const name = (rows[Number(card.dataset.index)]?.fields.name ?? '').trim();
            const isUnused = unusedKeys[kind].has(getKey(name));

            setWarning(card, isUnused ? label : '', isUnused ? `No {{$ ${tokenWord}.${name} }} in the rules.` : '');
        });
    }

    // Rules warning list.
    const list = document.getElementById('template-rules-warnings');

    if (list) {
        list.notices = getTokenWarningNotices(issues);
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
    const cardSelector = `[data-path="${options.path}"][data-index="${options.rowIndex}"][data-value-index="${options.valueIndex}"]`;
    const card = document.querySelector(`g4-card[data-card-kind="value"]${cardSelector}`);
    const valueRow = globalThis.STATE.values[options.path]?.[options.rowIndex]?.values[options.valueIndex];

    if (card && valueRow) {
        card.cardTitle = writeValueTitle(valueRow, options.valueIndex);
    }
}

/**
 * Schedules an existence lookup for the current namespace, key, and file name.
 *
 * @remarks
 * Debounced by LOOKUP_DELAY_MILLISECONDS. Each request carries an id so an older answer that
 * arrives late cannot overwrite the result of a newer edit. The host answers for the Hub (does the
 * template exist) and for the templates folder (does the file exist).
 */
function startTemplateLookup() {
    const state = globalThis.STATE;

    const onLookupDelayElapsed = () => {
        // Ask the host, tagging the request so late answers to older requests are ignored.
        state.lookupRequestId++;
        globalThis.VSCODE?.postMessage({
            command: 'lookupTemplate',
            fileName: state.fileName.trim(),
            key: convertToPascalCase(state.values.key ?? ''),
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
function startTemplatePublisher() {
    const injected = globalThis.INJECTED ?? {};
    const state = globalThis.STATE;

    // Build the form model from the schema, then seed it with the host defaults and the rules.
    state.definitions = getFieldDefinitions(injected.schemas ?? {});
    state.values = newFormValues(injected.defaults ?? {}, state.definitions);
    state.rulesText = convertToSafeText(injected.rules?.rulesText);
    state.existingTemplate = injected.existingTemplate ?? null;
    state.fileName = convertToSafeText(injected.file?.fileName);
    state.isFileExisting = injected.file?.isExisting === true;

    // Render every region.
    showHeader();
    showForm();
    writeActionBar();

    // Delegated listeners survive re-renders of #app: every component reports through events.
    const app = document.getElementById('app');

    app.addEventListener('click', onAppClick);
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
 * Checks the example cards: at least one, and each rule a JSON object with a plugin name.
 *
 * @remarks
 * Compute-only. The Markdown description is optional; the rule is what the Hub catalog shows.
 *
 * @param {string} name - Examples field name.
 * @param {{ rule: string }[]} rows - Example card states.
 * @returns {Record<string, string>} Error message per path (`examples`, or `examples.index.rule`).
 */
function testExamples(name, rows) {
    const errors = {};

    if (rows.length === 0) {
        errors[name] = 'Add at least one example.';
        return errors;
    }

    rows.forEach((row, index) => {
        const ruleText = row.rule.trim();
        let ruleError = ruleText === ''
            ? 'Required. Enter the rule as a JSON object.'
            : getJsonError(row.rule, 'object');

        // A syntactically valid rule still has to name the plugin it calls.
        if (ruleError === '' && String(JSON.parse(row.rule).pluginName ?? '').trim() === '') {
            ruleError = 'The rule needs a "pluginName".';
        }

        if (ruleError !== '') {
            errors[`${name}.${index}.rule`] = ruleError;
        }
    });

    return errors;
}

/**
 * Validates the whole form.
 *
 * @remarks
 * Compute-only over state. Checks required fields, key normalization, URLs, list entries, map keys,
 * parameter names, JSON editors, the examples, the rules, and the file name. Full contract
 * validation stays on the server. Entry problems of lists and key/value maps are shown by those
 * editors; they are counted here so they block publishing.
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

        // Examples have their own checks: a required count and a rule per card.
        if (control === 'examples') {
            Object.assign(errors, testExamples(name, value));
            continue;
        }

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

        // Parameter and property rows: a name is required (a property name must also be one of the
        // fixed names, used once), and every value card is checked.
        if (control === 'parameters') {
            value.forEach((row, index) => {
                const propertyNameError = getIsPropertyField(definition) ? getPropertyNameError(row, index) : '';

                if ((row.fields.name ?? '').trim() === '') {
                    errors[`${name}.${index}.name`] = getIsPropertyField(definition) ? propertyNameError : 'Enter a name.';
                } else if (propertyNameError !== '') {
                    errors[`${name}.${index}.name`] = propertyNameError;
                }

                Object.assign(errors, testParameterValues(`${name}.${index}.${PARAMETER_VALUES_PROPERTY}`, row.values));
            });
        }
    }

    // The rules are published as-is, so they must be a JSON array of rules.
    const rulesError = getRulesError(globalThis.STATE.rulesText);

    if (rulesError !== '') {
        errors.rules = rulesError;
    }

    // A template made from a bot needs a valid file name in the templates folder.
    if (globalThis.INJECTED?.file?.kind === 'bot') {
        const fileName = globalThis.STATE.fileName.trim();

        if (fileName === '') {
            errors.fileName = 'Required. Enter the name of the file to save, for example SearchBing.json.';
        } else if (!FILE_NAME_PATTERN.test(fileName)) {
            errors.fileName = 'Enter a plain file name that ends in .json, without folders or special characters.';
        }
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
        { id: 'publish', label: 'Publish', testId: 'publish-template-button', variant: 'primary' },
        { id: 'reset', label: 'Reset to Defaults', testId: 'reset-template-to-defaults-button', variant: 'secondary' }
    ];

    document.getElementById('g4-actionbar').innerHTML = `
    <g4-action-bar actions="${convertToSafeHtml(actions)}"
                   note-duration="2500"
                   test-id="publish-template-status"></g4-action-bar>`;
}

/**
 * Builds the example cards editor: a list of foldable cards and an add button.
 *
 * @param {object} definition - The examples field definition.
 * @returns {string} Card list HTML.
 */
function writeExamplesField(definition) {
    const rows = globalThis.STATE.values[definition.name];

    // One card per example, in the card list with its add button.
    const cardsHtml = rows
        .map((row, index) => writeExampleRow({ index, row }))
        .join('');

    return `
    <g4-card-list data-path="${definition.name}"
                  add-label="+ Add example"
                  empty-text="None. Add at least one."
                  test-id="examples-card-list">${cardsHtml}</g4-card-list>`;
}

/**
 * Builds one foldable example card: the Markdown description and the rule that calls the template.
 *
 * @param {{ index: number, row: object }} options - Row index and row state.
 * @returns {string} Card HTML.
 */
function writeExampleRow(options) {
    const { index, row } = options;
    const path = 'examples';
    const testId = `example-${index}`;
    const dataAttributes = (property) => `data-example-index="${index}" data-example-property="${property}"`;
    const openAttribute = row.isOpen ? ' open' : '';

    // Description (Markdown, optional) and rule (JSON object, required), each in its own field.
    const descriptionHtml = writeField({
        controlHtml: `
        <g4-markdown-textarea ${dataAttributes('description')}
                              reference-note="${convertToSafeHtml(MARKDOWN_REFERENCE_NOTE)}"
                              test-id="${testId}-description-markdown-textarea">${convertToSafeHtml(row.description)}</g4-markdown-textarea>`,
        errorPath: `${path}.${index}.description`,
        hint: 'What this example shows. Supports Markdown.',
        label: 'Description',
        testId: `${testId}-description-field`
    });
    const ruleHtml = writeField({
        controlHtml: `
        <g4-json-textarea ${dataAttributes('rule')}
                          json-type="object"
                          test-id="${testId}-rule-json-textarea">${convertToSafeHtml(row.rule)}</g4-json-textarea>`,
        errorPath: `${path}.${index}.rule`,
        hint: 'The rule that calls the template, as a JSON object with the template key as its pluginName.',
        isRequired: true,
        label: 'Rule',
        testId: `${testId}-rule-field`
    });

    return `
    <g4-card data-card-kind="example"
             data-index="${index}"
             data-path="${path}"
             card-title="Example ${index + 1}"
             item-label="example ${index + 1}"${openAttribute}
             test-id="${testId}">
        ${descriptionHtml}
        ${ruleHtml}
    </g4-card>`;
}

/**
 * Builds the Template File section: for a template opened from the templates folder, the file it
 * is saved back to; for a template made from a bot, the required name of the file to create.
 *
 * @returns {string} Section HTML, or '' when the host sent no file.
 */
function writeFileSection() {
    const file = globalThis.INJECTED?.file;

    if (!file) {
        return '';
    }

    // A bot-derived template needs a new file name; an opened template file is shown, not edited.
    const isNewFile = file.kind === 'bot';
    const bodyHtml = isNewFile
        ? writeField({
            controlHtml: `
            <g4-text-input data-file-name="true"
                           test-id="template-file-name-text-input"
                           value="${convertToSafeHtml(globalThis.STATE.fileName)}"></g4-text-input>`,
            errorPath: 'fileName',
            hint: 'The file the template is saved to in the workspace templates folder, for example SearchBing.json. It follows the key until you edit it; an existing file with this name is overwritten.',
            isRequired: true,
            label: 'File Name',
            testId: 'template-file-name-field'
        })
        : `
        <div class="template-publisher-meta">
            <span data-test-id="template-file-name">templates/${convertToSafeHtml(file.fileName)}</span>
            <span>Saved back to this file after publishing</span>
        </div>`;

    return writeSectionShell({
        bodyHtml,
        description: isNewFile
            ? 'Required. The template is saved to the workspace templates folder when it is published.'
            : 'The template file in the workspace templates folder; it is updated when you publish.',
        id: 'file',
        title: 'Template File'
    });
}

/**
 * Builds the Rules section: rule count and size, the token warnings, and the editable rules JSON.
 *
 * @returns {string} Section HTML.
 */
function writeRulesSection() {
    const summaryText = getRulesSummaryText(globalThis.STATE.rulesText);

    const bodyHtml = `
        <div class="template-publisher-meta">
            <span id="template-rules-size" data-test-id="template-rules-size">${convertToSafeHtml(summaryText)}</span>
            <span>Published as a JSON array, not encoded</span>
        </div>
        <g4-notice-list id="template-rules-warnings"
                        data-test-id="template-rules-warnings"
                        role="status"
                        test-id="template-rules-warning"
                        variant="warning"></g4-notice-list>
        ${writeField({
            controlHtml: `
            <g4-json-textarea data-rules="true"
                              json-type="array"
                              test-id="rules-json-textarea">${convertToSafeHtml(globalThis.STATE.rulesText)}</g4-json-textarea>`,
            errorPath: 'rules',
            label: '',
            testId: 'rules-field'
        })}`;

    return writeSectionShell({
        bodyHtml,
        description: 'The rules the template runs, as a JSON array. Edits are published and, after a successful publish, saved to the template file.',
        id: 'rules',
        title: 'Rules'
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
        case 'examples':
            controlHtml = writeExamplesField(definition);
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

    return `<div class="template-publisher-field-row">${fieldsHtml}</div>`;
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
    const testId = `${path}-${index}-${property.name}`;
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

    // A property card names its property in the title, so the name input is shown only to fix a
    // stored name that is not allowed (unknown or repeated).
    const isFixedName = getIsPropertyField(definition) && getPropertyNameError(row, index) === '';
    const kindWord = getIsPropertyField(definition) ? 'property' : 'parameter';

    // Renders every property of one kind with the shared input writer.
    const writeInputs = (kind) => properties
        .filter((property) => property.kind === kind)
        .filter((property) => !(isFixedName && property.name === 'name'))
        .map((property) => writeParameterInput({ index, path, property, row }))
        .join('');

    // The card keeps its fold state across renders; its title follows the name and type.
    const openAttribute = row.isOpen ? ' open' : '';

    return `
    <g4-card data-card-kind="parameter"
             data-index="${index}"
             data-path="${path}"
             card-title="${convertToSafeHtml(writeParameterTitle(row, index, path))}"
             item-label="${kindWord} ${index + 1}"${openAttribute}
             test-id="${path}-${index}">
        <div class="template-publisher-field-row">${writeInputs('text')}</div>
        ${writeInputs('markdown')}
        ${writeInputs('lines')}
        <div class="template-publisher-toggle-row">${writeInputs('checkbox')}</div>
        ${writeValuesField({ index, path, row })}
    </g4-card>`;
}

/**
 * Builds a parameter or property card title: "name - type", like the settings "machine - driver"
 * card titles.
 *
 * @param {object} row - Parameter or property row state.
 * @param {number} index - Row index, used when the name is still empty.
 * @param {string} path - Field name: 'parameters' or 'properties'.
 * @returns {string} Title text.
 */
function writeParameterTitle(row, index, path) {
    const nameText = convertToSafeText(row.fields.name).trim();
    const typeText = convertToSafeText(row.fields.type).trim();
    const emptyTitle = path === 'properties' ? `Property ${index + 1}` : `Parameter ${index + 1}`;
    const title = nameText === '' ? emptyTitle : nameText;

    return typeText === '' ? title : `${title} - ${typeText}`;
}

/**
 * Builds the parameters editor: a list of foldable cards and an add button. The Properties editor
 * is the same list with a picker for the fixed names instead of the add button.
 *
 * @param {object} definition - The parameters field definition.
 * @returns {string} Card list HTML.
 */
function writeParametersField(definition) {
    const rows = globalThis.STATE.values[definition.name];
    const properties = getParameterProperties(definition);
    const isPropertyField = getIsPropertyField(definition);

    // One card per parameter, in the card list with its add button.
    const cardsHtml = rows
        .map((row, index) => writeParameterRow({ definition, index, properties, row }))
        .join('');

    const listHtml = `
    <g4-card-list data-path="${definition.name}"
                  add-label="${isPropertyField ? '+ Add property' : '+ Add parameter'}"
                  empty-text="${isPropertyField ? 'None. Pick a property above and add it.' : 'None.'}"
                  test-id="${definition.name}-card-list">${cardsHtml}</g4-card-list>`;

    // The picker sits above the cards, so adding never needs a scroll past the list.
    return isPropertyField ? `${writePropertyPicker()}${listHtml}` : listHtml;
}

/**
 * Builds the picker that adds a property: a dropdown of the names not used yet and its add button.
 *
 * @remarks
 * The card list's own add button is hidden for properties (see the page CSS); this picker replaces
 * it, so a name is chosen before the card exists and can be used once. When every name is used the
 * picker is replaced by a note.
 *
 * @returns {string} Picker HTML.
 */
function writePropertyPicker() {
    const freeNames = getFreePropertyNames();

    if (freeNames.length === 0) {
        return '<div class="template-publisher-property-note" data-test-id="property-picker-full">All six properties are added.</div>';
    }

    // The remembered pick survives a re-render while it is still free.
    const state = globalThis.STATE;
    const pick = freeNames.includes(state.propertyPick) ? state.propertyPick : freeNames[0];
    const choices = freeNames.map((name) => ({ text: name, value: name }));

    state.propertyPick = pick;

    return `
    <div class="template-publisher-property-picker">
        <g4-select data-property-picker="true"
                   choices="${convertToSafeHtml(JSON.stringify(choices))}"
                   label="Property to add"
                   test-id="property-picker"
                   value="${convertToSafeHtml(pick)}"></g4-select>
        <button type="button"
                class="g4-card-list__button template-publisher-icon-button"
                aria-label="Add property"
                title="Add property"
                data-property-add="true"
                data-test-id="add-property-button">${PLUS_ICON_HTML}</button>
    </div>`;
}

/**
 * Builds one field section from the section definition and the fields assigned to it.
 *
 * @param {{ id: string, title: string, description: string }} section - Section definition.
 * @returns {string} Section HTML, or '' when no field belongs to the section.
 */
function writeSection(section) {
    // The file and rules sections hold fields that are not schema properties.
    if (section.id === 'file') {
        return writeFileSection();
    }

    if (section.id === 'rules') {
        return writeRulesSection();
    }

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
    const previewHtml = '<div id="template-publisher-key-preview" class="template-publisher-key-preview" data-test-id="template-key-preview" aria-live="polite"></div>';
    const bodyHtml = section.id === 'identity'
        ? `<div class="template-publisher-field-row">${fieldsHtml}</div>${previewHtml}`
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
                test-id="template-${options.id}-section">${options.bodyHtml}</g4-section>`;
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
    const idPrefix = `${path}-${index}-value-${valueIndex}`;
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
        <div class="template-publisher-field-row">${writeValueField(nameField)}${writeValueField(displayNameField)}</div>
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
                      test-id="${path}-${index}-values-card-list">${cardsHtml}</g4-card-list>`,
        errorPath: `${path}.${index}.${PARAMETER_VALUES_PROPERTY}`,
        hint: PARAMETER_HINTS[PARAMETER_VALUES_PROPERTY],
        label: 'Values',
        testId: `${path}-${index}-values-field`
    });
}
// Host messages: existence lookups and publish results.
window.addEventListener('message', onHostMessage); // NOSONAR - sandboxed webview; any origin accepted by design

startTemplatePublisher();
