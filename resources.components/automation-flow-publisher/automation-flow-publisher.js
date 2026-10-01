/*
 * G4(TM) Flow Publisher component.
 *
 * Renders a form for one G4FlowManifestModel, built from the flow schema that the extension host
 * reads from the Hub's OpenAPI document (swagger/flows/docs.json) and injects through #g4-data.
 * The page looks and behaves like the G4 Settings editor: collapsible sections with a chevron,
 * labels with hints above their controls, one-per-line lists, toggle switches, JSON editors with a
 * Format button, collapsible item cards, and a sticky action bar. It keeps its own copy of that
 * look (no shared stylesheet or script) so the component stays isolated.
 *
 * Host contract (update-flow.ts):
 * - Injected #g4-data: { automation, defaults, existingFlow, isSchemaFallback, schemas, summaryTemplate }.
 * - Webview → host: { command: 'lookupFlow', requestId, namespace, key }
 *                   { command: 'publish', values }
 * - Host → webview: { command: 'flowLookup', requestId, existingFlow }
 *                   { command: 'publishResult', isSuccess, message, fieldErrors, existingFlow }
 *
 * The page never talks to the network; the host owns every Hub call. The `automation` field is
 * never edited here: the host builds it from the bot file (authentication removed, Base64 encoded).
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
    aliases: 'Other names that also find and run this flow.',
    categories: 'Groups the flow appears under when browsing the G4 catalog.',
    context: 'Extra data stored with the flow, as a JSON object. Leave it empty for none.',
    description: 'Longer details: what the flow needs, what it changes, and what it returns.',
    key: 'The flow\'s unique name within its namespace. Normalized to PascalCase when you leave the field.',
    namespace: 'Groups related flows. Leave it empty to use G4.System.',
    platforms: 'Where the flow can run, for example Windows, Linux, or Any.',
    projectUrl: 'Where to read more about the flow, such as its repository or documentation.',
    protocol: 'Key/value settings for the protocol the flow uses. Leave it empty for none.',
    summary: 'A short explanation of what the flow does, shown in the G4 catalog.',
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
    summary: { section: 'description', order: 1, label: 'Summary', isRequired: true },
    description: { section: 'description', order: 2, label: 'Description' },
    categories: { section: 'classification', order: 1, label: 'Categories' },
    aliases: { section: 'classification', order: 2, label: 'Aliases' },
    platforms: { section: 'classification', order: 3, label: 'Platforms' },
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

// Hint appended to every one-per-line field, since each line becomes one array entry.
const LINES_HINT = 'One entry per line.';

// Delay after the last Key or Namespace edit before asking the host whether the flow exists,
// so typing does not send one Hub request per keystroke.
const LOOKUP_DELAY_MILLISECONDS = 400;

// Root schema of the form.
const MANIFEST_SCHEMA_NAME = 'G4FlowManifestModel';

// One plain sentence per parameter property, in the voice of the settings editor hints.
const PARAMETER_HINTS = {
    default: 'The value used when the caller does not pass one.',
    description: 'What the parameter is for.',
    displayName: 'A friendly name shown in tools and forms.',
    mandatory: 'The caller must always pass this parameter.',
    multiple: 'The parameter accepts more than one value.',
    name: 'The name callers use to pass this value.',
    stringSyntax: 'Optional format hint for text values, for example Uri or Json.',
    type: 'The kind of value expected, for example String or Int.',
    values: 'The allowed values, as a JSON array of parameter objects. Leave it empty for any value.'
};

// Parameter properties the form does not edit. Their stored values are kept and sent back unchanged.
const PARAMETER_HIDDEN_PROPERTIES = ['dependsOn'];

// Parameter properties shown first in each parameter card; the rest follow in schema order.
const PARAMETER_PROPERTY_ORDER = ['name', 'displayName', 'type', 'default'];

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

// Collapse/expand chevron used by every section and card header (same icon as the settings editor).
const SVG_CHEVRON = `
<svg class="flow-publisher-chev-r" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" width="13" height="13">
    <path fill="currentColor" d="M441.3 299.8C451.5 312.4 450.8 330.9 439.1 342.6L311.1 470.6C301.9 479.8 288.2 482.5 276.2 477.5C264.2 472.5 256.5 460.9 256.5 448L256.5 192C256.5 179.1 264.3 167.4 276.3 162.4C288.3 157.4 302 160.2 311.2 169.3L439.2 297.3L441.4 299.7z"/>
</svg>
<svg class="flow-publisher-chev-d" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" width="13" height="13">
    <path fill="currentColor" d="M300.3 440.8C312.9 451 331.4 450.3 343.1 438.6L471.1 310.6C480.3 301.4 483 287.7 478 275.7C473 263.7 461.4 256 448.5 256L192.5 256C179.6 256 167.9 263.8 162.9 275.8C157.9 287.8 160.7 301.5 169.9 310.6L297.9 438.6L300.3 440.8z"/>
</svg>`;

// Trash icon for removing a key/value row. Embedded in this component on purpose (not a shared
// asset); currentColor lets it follow the theme like the settings icon buttons.
const SVG_TRASH = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" aria-hidden="true">
    <path fill="currentColor" d="M232.7 69.9C237.1 56.8 249.3 48 263.1 48L377 48C390.8 48 403 56.8 407.4 69.9L416 96L512 96C529.7 96 544 110.3 544 128C544 145.7 529.7 160 512 160L128 160C110.3 160 96 145.7 96 128C96 110.3 110.3 96 128 96L224 96L232.7 69.9zM128 208L512 208L512 512C512 547.3 483.3 576 448 576L192 576C156.7 576 128 547.3 128 512L128 208zM216 272C202.7 272 192 282.7 192 296L192 488C192 501.3 202.7 512 216 512C229.3 512 240 501.3 240 488L240 296C240 282.7 229.3 272 216 272zM320 272C306.7 272 296 282.7 296 296L296 488C296 501.3 306.7 512 320 512C333.3 512 344 501.3 344 488L344 296C344 282.7 333.3 272 320 272zM424 272C410.7 272 400 282.7 400 296L400 488C400 501.3 410.7 512 424 512C437.3 512 448 501.3 448 488L448 296C448 282.7 437.3 272 424 272z"/>
</svg>`;

// Validation message for URL fields.
const URL_ERROR_MESSAGE = 'Enter a full URL, for example https://example.com.';

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
    definitions: [],
    errors: {},
    existingFlow: null,
    isPublishing: false,
    isSummaryEdited: false,
    lookupRequestId: 0,
    lookupTimer: undefined,
    openSectionIds: new Set(SECTIONS.filter((section) => section.isOpenByDefault).map((section) => section.id)),
    publishResult: null,
    saveNoteTimer: undefined,
    values: {}
};

/**
 * Splits multi-line text into trimmed, non-empty entries.
 *
 * @param {string} text - Textarea content.
 * @returns {string[]} One entry per non-blank line.
 */
function convertToLines(text) {
    return text
        .split(LINE_BREAK_PATTERN)
        .map((line) => line.trim())
        .filter((line) => line !== '');
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
    // Chooses the control for a resolved schema: text, lines, parameters, object, map, or json.
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
            return 'lines';
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
            } else if (property.kind === 'lines') {
                parameter[property.name] = convertToLines(rawValue);
            } else if (property.kind === 'json') {
                parameter[property.name] = rawValue.trim() === '' ? [] : JSON.parse(rawValue);
            } else {
                parameter[property.name] = rawValue.trim();
            }
        }

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
            case 'lines':
                values[definition.name] = convertToLines(value);
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
 * Describes the editable properties of one parameter row, from the parameter item schema.
 *
 * @remarks
 * Compute-only. Strings become text inputs, booleans toggle switches, string arrays one-per-line
 * text, and nested object arrays (such as `values`) a JSON editor behind a toggle. Identifying
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
            kind = 'lines';
        }

        const hint = PARAMETER_HINTS[name] ?? propertySchema.description ?? '';

        return { name, kind, label: getLabelText(name), hint, jsonType: schema.type };
    });
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
            case 'lines':
                values[definition.name] = isArrayValue ? value.filter((item) => typeof item === 'string').join('\n') : '';
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
 * Compute-only. Properties the schema does not describe are kept in `extra` and sent back
 * unchanged, so loading and re-publishing an existing flow never drops data the form cannot show.
 * Cards start closed, like the settings item cards.
 *
 * @param {Record<string, unknown>} parameter - Stored parameter.
 * @param {object} definition - The parameters field definition.
 * @returns {{ extra: object, fields: object, isJsonOpen: boolean, isOpen: boolean }} Row state.
 */
function newParameterRow(parameter, definition) {
    // Split the stored parameter into schema properties and pass-through extras.
    const properties = getParameterProperties(definition);
    const knownNames = new Set(properties.map((property) => property.name));
    const extra = Object.fromEntries(Object.entries(parameter ?? {}).filter(([name]) => !knownNames.has(name)));
    const fields = {};

    // Convert each schema property into the shape its input edits.
    for (const property of properties) {
        const value = parameter?.[property.name];
        const isArrayValue = Array.isArray(value);
        const isJsonPresent = isArrayValue ? value.length > 0 : value !== null && value !== undefined;

        if (property.kind === 'checkbox') {
            fields[property.name] = value === true;
        } else if (property.kind === 'lines') {
            fields[property.name] = isArrayValue ? value.join('\n') : '';
        } else if (property.kind === 'json') {
            fields[property.name] = isJsonPresent ? JSON.stringify(value, null, 4) : '';
        } else {
            fields[property.name] = convertToSafeText(value);
        }
    }

    return { extra, fields, isJsonOpen: false, isOpen: false };
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

    // JSON Format checks and pretty-prints one editor in place.
    if (action === 'format-json') {
        setFormattedJson(target.dataset.targetId);
        return;
    }

    // Every other action mutates state first; the form is re-rendered from it below.
    switch (action) {
        case 'remove-map-row':
        case 'remove-parameter':
            state.values[path].splice(index, 1);
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
        case 'toggle-parameter-json':
            state.values[path][index].isJsonOpen = !state.values[path][index].isJsonOpen;
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

    // Parameter row property; the card title follows the name and type as they are typed.
    if (dataset.parameterIndex !== undefined) {
        const rowIndex = Number(dataset.parameterIndex);
        state.values[dataset.path][rowIndex].fields[dataset.property] = value;
        setFieldError(dataset.errorPath, '');
        setJsonEditorError(target);
        showParameterTitle(dataset.path, rowIndex);
        return;
    }

    // Key/value map row part.
    if (dataset.mapIndex !== undefined) {
        state.values[dataset.path][Number(dataset.mapIndex)][dataset.part] = value;
        setFieldError(dataset.errorPath, '');
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
 * Applies messages from the extension host: existence lookups and publish results.
 *
 * @param {MessageEvent} event - Message from the host.
 */
function onHostMessage(event) {
    const message = event.data;
    const state = globalThis.STATE;

    // Maps server field errors (C# property names) onto form paths; unknown keys stay in the banner.
    const getServerErrors = (fieldErrors) => {
        const errors = {};

        for (const [name, messages] of Object.entries(fieldErrors)) {
            const path = name.charAt(0).toLowerCase() + name.slice(1);
            const texts = [messages].flat().filter((text) => typeof text === 'string');

            if (getDefinition(path) && texts.length > 0) {
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

    // Record the publish outcome and attach server field errors to the matching fields.
    const isSuccess = message.isSuccess === true;

    state.isPublishing = false;
    state.publishResult = { isSuccess, message: convertToSafeText(message.message) };
    state.errors = getServerErrors(message.fieldErrors ?? {});

    if (message.existingFlow) {
        state.existingFlow = message.existingFlow;
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
        document.querySelector('[data-invalid="true"] input, [data-invalid="true"] textarea')?.focus();
        return;
    }

    // Lock the action bar until the host answers with publishResult.
    state.isPublishing = true;
    state.publishResult = null;
    showActionBar();
    showBanners();
    showSaveNote('Sending the flow to the G4 Hub…');
    globalThis.VSCODE?.postMessage({ command: 'publish', values: getManifestValues() });
}

/**
 * Restores every field to the bot's defaults (Reset to Defaults), like the settings editor's reset.
 */
function onResetClick() {
    const state = globalThis.STATE;
    const injected = globalThis.INJECTED ?? {};

    // Rebuild the values from the defaults; the default summary follows the key again.
    state.values = newFormValues(injected.defaults ?? {}, state.definitions);
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
        const [name, rowIndex, property] = path.split('.');
        const definition = getDefinition(name);

        if (!definition) {
            continue;
        }

        state.openSectionIds.add(definition.section);

        // A parameter error also opens its card, and its JSON editor when the error is in one.
        const isParameterError = definition.control === 'parameters' && rowIndex !== undefined;

        if (isParameterError) {
            const row = state.values[name][Number(rowIndex)];
            const isJsonPropertyError = getParameterProperties(definition)
                .some((item) => item.name === property && item.kind === 'json');

            row.isOpen = true;
            row.isJsonOpen = row.isJsonOpen || isJsonPropertyError;
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
 * Renders the banner stack: schema fallback, overwrite notice, and the last publish result.
 */
function showBanners() {
    const container = document.getElementById('flow-publisher-banners');

    if (container) {
        container.innerHTML = writeBanners().trim();
    }
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

    // Build the form model from the schema, then seed it with the host defaults.
    state.definitions = getFieldDefinitions(injected.schemas ?? {});
    state.values = newFormValues(injected.defaults ?? {}, state.definitions);
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
}

/**
 * Validates the whole form.
 *
 * @remarks
 * Compute-only over state. Checks required fields, key normalization, URLs, map keys, parameter
 * names, and JSON editors. Full contract validation stays on the server.
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

        // Required fields: empty text, or no lines.
        const isEmptyText = isTextValue && !isFilledText;
        const isEmptyLines = control === 'lines' && convertToLines(value).length === 0;
        const isEmpty = isEmptyText || isEmptyLines;

        if (definition.isRequired && isEmpty) {
            errors[name] = 'Required.';
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

        // Map rows: a value needs a key.
        if (control === 'map') {
            value.forEach((row, index) => {
                const isValueWithoutKey = row.key.trim() === '' && row.value.trim() !== '';

                if (isValueWithoutKey) {
                    errors[`${name}.${index}.key`] = 'Enter a key for this value.';
                }
            });
        }

        // Parameter rows: a name is required and JSON editors must parse.
        if (control === 'parameters') {
            const jsonProperties = getParameterProperties(definition).filter((property) => property.kind === 'json');

            value.forEach((row, index) => {
                if ((row.fields.name ?? '').trim() === '') {
                    errors[`${name}.${index}.name`] = 'Enter a parameter name.';
                }

                for (const property of jsonProperties) {
                    const text = row.fields[property.name];
                    const rowJsonOptions = { expectedType: property.jsonType, guidance: JSON_EDIT_GUIDANCE };
                    const rowJsonError = text.trim() === '' ? '' : getJsonError(text, rowJsonOptions);

                    if (rowJsonError !== '') {
                        errors[`${name}.${index}.${property.name}`] = rowJsonError;
                    }
                }
            });
        }
    }

    return errors;
}

/**
 * Builds the collapsed Automation section: bot path, size, and a decoded preview.
 *
 * @returns {string} Section HTML.
 */
function writeAutomationSection() {
    const automation = globalThis.INJECTED?.automation;

    if (!automation) {
        return '';
    }

    const authenticationText = automation.isAuthenticationRemoved
        ? 'authentication removed'
        : 'no authentication block';

    const bodyHtml = `
        <div class="flow-publisher-automation-meta">
            <span data-test-id="flow-automation-source">bots/${convertToSafeHtml(automation.relativePath)}</span>
            <span data-test-id="flow-automation-size">${convertToSafeHtml(automation.sizeText)}</span>
            <span data-test-id="flow-automation-authentication">${authenticationText}</span>
            <span>Base64 encoded on publish</span>
        </div>
        <pre class="flow-publisher-code" data-test-id="flow-automation-preview">${convertToSafeHtml(automation.previewText)}</pre>`;

    return writeSectionShell({
        bodyHtml,
        description: 'The bot automation that is published. The authentication block is removed and the rest is Base64 encoded.',
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
 * Builds the field error line; its id lets setFieldError update it in place.
 *
 * @remarks
 * An empty line takes no space, except under JSON editors, which reserve it like the settings
 * Capabilities box so the layout does not jump while the user types.
 *
 * @param {string} path - Error path.
 * @param {boolean} [isReserved=false] - Keep the line's height even when it is empty.
 * @returns {string} Error line HTML.
 */
function writeError(path, isReserved = false) {
    const message = globalThis.STATE.errors[path] ?? '';
    const testId = `${path.replaceAll('.', '-')}-error-message`;
    const reservedClass = isReserved ? ' flow-publisher-field-error--reserved' : '';

    return `
    <div id="error-${path}"
         class="flow-publisher-field-error${reservedClass}"
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

    // Field-level markers: invalid state, required mark, and the one-per-line hint.
    const isInvalid = state.errors[definition.name] !== undefined;
    const requiredMark = definition.isRequired ? ' <span class="flow-publisher-required-mark">*</span>' : '';
    const linesHint = definition.control === 'lines' ? LINES_HINT : '';
    const hintText = [definition.hint, linesHint].filter((text) => text !== '').join(' ');
    const hintHtml = hintText === '' ? '' : `<div class="flow-publisher-field-hint">${convertToSafeHtml(hintText)}</div>`;

    // An object (author) is a row of ordinary fields, one per property, with no wrapper label.
    if (definition.control === 'object') {
        return writeObjectField(definition);
    }

    // Pick the control body for this field.
    let bodyHtml;

    switch (definition.control) {
        case 'lines':
            bodyHtml = writeTextArea({ path: definition.name, value });
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
        ${writeError(definition.name, definition.control === 'json')}
    </div>`;
}

/**
 * Builds a JSON editor that behaves like the settings Capabilities box: a monospace textarea that
 * is validated while typing, with a Format button revealed on hover or focus.
 *
 * @param {{ errorPath: string, jsonType: string, path: string, value: string, dataAttributes?: string, textareaId?: string, testId?: string }} options - Editor data; jsonType is the schema type the text must parse to.
 * @returns {string} Editor HTML.
 */
function writeJsonEditor(options) {
    const textareaId = options.textareaId ?? `field-${options.path}`;
    const testId = options.testId ?? `${options.path}-json-textarea`;
    const dataAttributes = options.dataAttributes ?? `data-path="${options.path}"`;

    return `
    <div class="flow-publisher-json-wrap">
        <textarea id="${textareaId}"
                  class="flow-publisher-json-textarea"
                  data-error-path="${options.errorPath}"
                  data-json-type="${options.jsonType}"
                  data-kind="json"
                  data-test-id="${testId}"
                  ${dataAttributes}
                  rows="10"
                  spellcheck="false">${convertToSafeHtml(options.value)}</textarea>
        <button type="button"
                class="flow-publisher-btn flow-publisher-btn-ghost flow-publisher-btn-sm flow-publisher-json-format-btn"
                title="Check &amp; Format JSON"
                data-action="format-json"
                data-target-id="${textareaId}"
                data-test-id="${testId}-format-button">Format</button>
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
                <button type="button"
                        class="flow-publisher-btn flow-publisher-btn-ghost flow-publisher-btn-sm flow-publisher-icon-btn"
                        title="Remove entry"
                        data-action="remove-map-row"
                        data-index="${index}"
                        data-path="${definition.name}"
                        data-test-id="remove-${definition.name}-${index}-row-button"
                        aria-label="Remove ${label} entry ${index + 1}">${SVG_TRASH}</button>
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
 * Builds one parameter property control: text input, one-per-line text, toggle switch, or JSON editor.
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

    // JSON properties use the Format-enabled editor.
    const isInvalid = globalThis.STATE.errors[errorPath] !== undefined;
    const labelHtml = `<label class="flow-publisher-field-label" for="${inputId}">${convertToSafeHtml(property.label)}</label>`;
    const hintText = property.kind === 'lines' ? `${property.hint} ${LINES_HINT}`.trim() : property.hint;
    const hintHtml = hintText === '' ? '' : `<div class="flow-publisher-field-hint">${convertToSafeHtml(hintText)}</div>`;
    let controlHtml;

    if (property.kind === 'json') {
        controlHtml = writeJsonEditor({
            dataAttributes,
            errorPath,
            jsonType: property.jsonType,
            path,
            testId: `${testId}-json-textarea`,
            textareaId: inputId,
            value
        });
    } else if (property.kind === 'lines') {
        controlHtml = `
        <textarea id="${inputId}"
                  data-error-path="${errorPath}"
                  data-kind="lines"
                  data-test-id="${testId}-textarea"
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
        ${writeError(errorPath, property.kind === 'json')}
    </div>`;
}

/**
 * Builds one collapsible parameter item card, shaped like the settings recorder cards: chevron,
 * title, move and Remove buttons in the header; fields, toggles, and the JSON editor in the body.
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

    // Header buttons: move up, move down, remove (their clicks never fold the card).
    const writeHeaderButton = (buttonOptions) => {
        const disabledAttribute = buttonOptions.isDisabled ? 'disabled' : '';

        return `
        <button type="button"
                class="flow-publisher-btn flow-publisher-btn-ghost flow-publisher-btn-sm"
                title="${buttonOptions.title}"
                data-action="${buttonOptions.action}"
                data-index="${index}"
                data-path="${path}"
                data-test-id="${buttonOptions.action}-${index}-button"
                ${disabledAttribute}>${buttonOptions.label}</button>`;
    };

    // JSON properties sit behind a toggle that names what they edit.
    const jsonProperties = properties.filter((property) => property.kind === 'json');
    const jsonNames = jsonProperties.map((property) => property.name).join(', ');
    const jsonToggleVerb = row.isJsonOpen ? 'Hide' : 'Edit';
    const jsonEditorsHtml = row.isJsonOpen ? writeInputs('json') : '';
    const jsonToggleHtml = jsonProperties.length === 0
        ? ''
        : `
        <div class="flow-publisher-field">
            <div>
                <button type="button"
                        class="flow-publisher-btn flow-publisher-btn-ghost flow-publisher-btn-sm"
                        data-action="toggle-parameter-json"
                        data-index="${index}"
                        data-path="${path}"
                        data-test-id="toggle-parameter-${index}-json-button">{ } ${jsonToggleVerb} ${convertToSafeHtml(jsonNames)} as JSON</button>
            </div>
        </div>`;

    // Fold state: the card body and chevron follow row.isOpen.
    const chevronOpenClass = row.isOpen ? ' flow-publisher-is-open' : '';
    const bodyCollapsedClass = row.isOpen ? '' : ' flow-publisher-is-collapsed';

    return `
    <div class="flow-publisher-item-card" data-test-id="parameter-${index}-card">
        <div class="flow-publisher-item-card-hdr"
             data-action="toggle-parameter-card"
             data-index="${index}"
             data-path="${path}"
             data-test-id="toggle-parameter-${index}-card">
            <i id="parameter-${index}-chevron" class="flow-publisher-chev${chevronOpenClass}">${SVG_CHEVRON}</i>
            <span id="parameter-${index}-title" class="flow-publisher-item-card-title">${convertToSafeHtml(writeParameterTitle(row, index))}</span>
            <span class="flow-publisher-item-card-spacer"></span>
            ${writeHeaderButton({ action: 'move-parameter-up', isDisabled: index === 0, label: '↑', title: 'Move up' })}
            ${writeHeaderButton({ action: 'move-parameter-down', isDisabled: index === rowCount - 1, label: '↓', title: 'Move down' })}
            ${writeHeaderButton({ action: 'remove-parameter', isDisabled: false, label: 'Remove', title: 'Remove parameter' })}
        </div>
        <div id="parameter-${index}-body" class="flow-publisher-item-card-body${bodyCollapsedClass}">
            <div class="flow-publisher-field-row">${writeInputs('text')}</div>
            ${writeInputs('lines')}
            <div class="flow-publisher-toggle-row">${writeInputs('checkbox')}</div>
            ${jsonToggleHtml}
            ${jsonEditorsHtml}
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
        </div>
        <div id="section-${options.id}-body" class="flow-publisher-section-body${bodyCollapsedClass}">
            <div class="flow-publisher-section-desc">${convertToSafeHtml(options.description)}</div>
            ${options.bodyHtml}
        </div>
    </div>`;
}

/**
 * Builds a one-per-line textarea (summary, description, categories, aliases, platforms).
 *
 * @param {{ path: string, value: string }} options - Textarea data.
 * @returns {string} Textarea HTML.
 */
function writeTextArea(options) {
    return `
    <textarea id="field-${options.path}"
              data-error-path="${options.path}"
              data-kind="lines"
              data-path="${options.path}"
              data-test-id="${options.path}-textarea">${convertToSafeHtml(options.value)}</textarea>`;
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

// Host messages: existence lookups and publish results.
window.addEventListener('message', onHostMessage); // NOSONAR - sandboxed webview; any origin accepted by design

startFlowPublisher();
