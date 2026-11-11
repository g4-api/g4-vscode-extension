/*
 * Writes the events the Hub sends (log entries, automation requests) to the extension log in a form a person can
 * read, and keeps the most recent ones so their JSON can be shown in full on request.
 *
 * An event can be very large: an automation request carries the whole automation, and a log entry can carry a
 * response or a page source. The Output panel cannot fold (VS Code turns folding off in its Output view), so an
 * event is written as a numbered summary line and a shortened, indented view of its JSON, the way a browser console
 * previews an object before it is expanded: the first levels in full, deeper objects and arrays as one-line markers,
 * long strings and arrays cut, and a cap on the lines one event takes. The Show-EventJson command adds any shortened
 * part of a kept event to the log in full, or copies it.
 *
 * Credentials never reach the log or the kept events: every value is masked when it arrives.
 */
import * as vscode from 'vscode';

import type { Logger } from '../logging/logger';

// Matches an object key that holds a credential. Linear: anchored alternation of literals.
const CREDENTIAL_KEY_PATTERN = /^(?:token|password)$/i;

// Matches a credential key with its opening quote (escaped or not), then the value up to its end. Linear: the value
// class cannot contain the quote or backslash that ends it.
const CREDENTIAL_TEXT_PATTERN = /(\\?"(?:token|password)\\?"\s*:\s*\\?")[^"\\]*/gi;

// The engine log levels that raise an event above the level its source wrote it at.
const ENGINE_LEVELS: Record<string, EventLogLevel> = {
    critical: 'error',
    error: 'error',
    warning: 'warning'
};

// The number of events kept for the Show-EventJson command; older ones are dropped.
const EVENT_HISTORY_SIZE = 50;

// The settings key that chooses how much of an event the log shows.
export const EVENT_LOG_DETAIL_SETTING = 'g4.eventLogDetail';

// Matches a key that can follow a dot in a path without quoting. Linear: anchored, two character classes.
const IDENTIFIER_PATTERN = /^[A-Za-z_$][\w$]*$/;

// The indent of every JSON line under its summary, so the block reads as part of one log entry.
const JSON_INDENT = '  ';

// The size from which a container inside a shortened part is offered on its own.
const LARGE_PART_BYTES = 1024;

// How many levels below a shortened part its large parts are looked for.
const LARGE_PART_DEPTH = 3;

// The severity of each level, so an engine level can only raise the level an event is written at.
const LEVEL_RANKS: Record<EventLogLevel, number> = {
    debug: 0,
    error: 3,
    information: 1,
    warning: 2
};

// Matches a line break, with or without a carriage return. Linear: one optional literal and one literal.
const LINE_BREAK_PATTERN = /\r?\n/;

// The text that stands for a masked credential.
const MASK_TEXT = '***';

// The most parts the Show-EventJson command offers for one event, so its list stays short enough to read.
const MAXIMUM_PARTS = 100;

// The number format of counts in the log: 3,400.
const NUMBER_LOCALE = 'en-US';

/**
 * The limits of the shortened view of an event's JSON.
 *
 * @remarks
 * Exported so the tests can use smaller limits; the log always uses these values.
 */
export const PREVIEW_LIMITS: PreviewLimits = {
    arrayItems: 5,
    depth: 2,
    lines: 40,
    stringLength: 200
};

// The longest message a summary line quotes.
const SUMMARY_MESSAGE_LENGTH = 120;

/**
 * Writes Hub events to the extension log and keeps the recent ones for the Show-EventJson command.
 *
 * @remarks
 * The rendering methods are static and compute-only, so they run in plain Node. The kept events live in static
 * state because the designer and the notification client both write events and the command reads them, and there
 * is one log per extension host.
 */
export class G4EventLogService {
    // The events kept for the Show-EventJson command, oldest first.
    private static readonly _events: EventRecord[] = [];

    // The number the next event gets; numbers start at 1 and never repeat in a session.
    private static _nextNumber = 1;

    /**
     * Masks every credential value written inside text, with or without escaped quotes.
     *
     * @param text - The text.
     * @returns The text with every credential value masked; anything that is not text gives ''.
     */
    public static convertToMaskedText(text: unknown): string {
        // Only text can be logged; anything else carries nothing to show.
        if (typeof text !== 'string') {
            return '';
        }

        return text.replaceAll(CREDENTIAL_TEXT_PATTERN, `$1${MASK_TEXT}`);
    }

    /**
     * Masks every credential in a value: the value of a `token` or `password` key, and credentials written inside
     * text, such as a request logged as JSON.
     *
     * @remarks
     * Compute-only. Returns a new value; the input is not changed.
     *
     * @param value - The value, as JSON-compatible data.
     * @returns The masked value.
     */
    public static convertToMaskedValue(value: unknown): unknown {
        // Text can carry a credential written as JSON.
        if (typeof value === 'string') {
            return G4EventLogService.convertToMaskedText(value);
        }

        // Only containers have keys to mask.
        if (value === null || typeof value !== 'object') {
            return value;
        }

        if (Array.isArray(value)) {
            return value.map(item => G4EventLogService.convertToMaskedValue(item));
        }

        // A credential key hides any value it has; every other key is masked in depth.
        const entries = Object.entries(value).map(([key, item]) => {
            const isEmpty = item === null || item === undefined || item === '';
            const isCredential = CREDENTIAL_KEY_PATTERN.test(key) && !isEmpty;

            return [key, isCredential ? MASK_TEXT : G4EventLogService.convertToMaskedValue(item)];
        });

        return Object.fromEntries(entries);
    }

    /**
     * Gets the text of a size: `512 B`, `48 KB`, `3.2 MB`.
     *
     * @param bytes - The size in bytes.
     * @returns The size text.
     */
    public static convertToSizeText(bytes: number): string {
        if (bytes < 1024) {
            return `${bytes} B`;
        }

        if (bytes < 1024 * 1024) {
            return `${Math.round(bytes / 1024)} KB`;
        }

        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }

    /**
     * Gets the shortened parts of a value, the ones its preview shows as markers or cut, in the order they appear.
     *
     * @remarks
     * Compute-only. These are the parts the Show-EventJson command offers after the whole event.
     *
     * @param value - The masked event value.
     * @param limits - The preview limits.
     * @returns The shortened parts.
     */
    public static getCollapsedParts(value: unknown, limits: PreviewLimits = PREVIEW_LIMITS): EventPart[] {
        // Collect the parts the preview itself shortened.
        const previewParts: EventPart[] = [];

        G4EventLogService.addPreviewLines({
            depth: 0,
            limits,
            lines: [],
            parts: previewParts,
            path: [],
            prefix: '',
            suffix: '',
            value
        });

        // Follow each with the large parts inside it, so a deep part can be picked at once, without its parent.
        const parts: EventPart[] = [];

        for (const part of previewParts) {
            if (parts.length >= MAXIMUM_PARTS) {
                break;
            }

            parts.push(part);
            G4EventLogService.addLargeParts({
                depth: 0,
                limits,
                parts,
                path: part.path,
                value: G4EventLogService.getPartValue(value, part.path)
            });
        }

        return parts.slice(0, MAXIMUM_PARTS);
    }

    /**
     * Gets a copy of the kept events, newest first.
     *
     * @returns The kept events.
     */
    public static getEvents(): EventRecord[] {
        return [...G4EventLogService._events].reverse();
    }

    /**
     * Gets the log text of an event: its summary line, its source and size, and its JSON as the detail asks.
     *
     * @remarks
     * Compute-only. The logger writes the text after `message:`, so the second line starts with `event:` and the JSON
     * lines are indented under it. The preview of an automation request stops at the header: it is the automation
     * that was just started, and often the largest event of a run.
     *
     * @param record - The kept event.
     * @param detail - How much of the event to show.
     * @returns The log text.
     */
    public static getEventText(record: EventRecord, detail: EventLogDetail): string {
        // Name the event's source and size under its summary.
        const event = G4EventLogService.convertToRecord(record.value);
        const objectType = event
            ? G4EventLogService.getTextField(event, 'objectType')
            : '';
        const sizeText = G4EventLogService.convertToSizeText(G4EventLogService.getSize(record.value));
        const eventFacts = [record.label, objectType, sizeText].filter(fact => fact !== '').join(' · ');
        const headerLines = [`#${record.number} ${record.summary}`, `event:       ${eventFacts}`];

        // The summary detail, and the preview of an automation request, stop at the header.
        const isAutomation = event !== undefined && G4EventLogService.getEventKind(event) === 'automation';

        if (detail === 'summary' || (detail === 'preview' && isAutomation)) {
            return headerLines.join('\n');
        }

        // Otherwise the JSON follows, shortened or in full.
        const jsonLines = detail === 'full'
            ? G4EventLogService.getFullLines(record.value)
            : G4EventLogService.getPreviewLines(record.value);

        return [...headerLines, ...jsonLines].join('\n');
    }

    /**
     * Gets the lines of a value as indented JSON, with nothing shortened.
     *
     * @remarks
     * Compute-only. A string is returned as its own lines rather than as one escaped JSON string, so a page source or
     * a stack trace reads as written.
     *
     * @param value - The value.
     * @returns The lines, each indented under the summary.
     */
    public static getFullLines(value: unknown): string[] {
        const text = typeof value === 'string'
            ? value
            : JSON.stringify(value, null, 2) ?? 'undefined';

        return text.split(LINE_BREAK_PATTERN).map(line => `${JSON_INDENT}${line}`);
    }

    /**
     * Gets the value a path leads to inside a value.
     *
     * @param value - The value.
     * @param path - The keys and indexes from the value to the part.
     * @returns The part, or undefined when the path leads nowhere.
     */
    public static getPartValue(value: unknown, path: PathSegment[]): unknown {
        let part = value;

        // Walk one key or index at a time; anything that is not a container ends the walk.
        for (const segment of path) {
            if (part === null || typeof part !== 'object') {
                return undefined;
            }

            part = (part as Record<number | string, unknown>)[segment];
        }

        return part;
    }

    /**
     * Gets the text of a path, as a reader would write it: `value.Response.Extractions[3]`.
     *
     * @param path - The keys and indexes.
     * @returns The path text; an empty path gives ''.
     */
    public static getPathText(path: PathSegment[]): string {
        // Indexes use brackets, keys that are not identifiers are quoted in brackets, and other keys use dots.
        const segments = path.map((segment, index) => {
            if (typeof segment === 'number') {
                return `[${segment}]`;
            }

            if (!IDENTIFIER_PATTERN.test(segment)) {
                return `[${JSON.stringify(segment)}]`;
            }

            return index === 0
                ? segment
                : `.${segment}`;
        });

        return segments.join('');
    }

    /**
     * Gets the shortened, indented view of a value.
     *
     * @remarks
     * Compute-only. Objects and arrays deeper than the depth limit become `{…7 keys}` or `[…120 items]`; strings
     * past the length limit end with `… (+3,400 chars)`; arrays show their first items and `… 115 more items`; and
     * the view stops at the line limit with a line that tells how large the event is in full.
     *
     * @param value - The masked event value.
     * @param limits - The preview limits.
     * @returns The lines, each indented under the summary.
     */
    public static getPreviewLines(value: unknown, limits: PreviewLimits = PREVIEW_LIMITS): string[] {
        const lines: string[] = [];

        G4EventLogService.addPreviewLines({ depth: 0, limits, lines, parts: [], path: [], prefix: '', suffix: '', value });

        // A view within the line limit is complete.
        if (lines.length <= limits.lines) {
            return lines.map(line => `${JSON_INDENT}${line}`);
        }

        // Past the limit, keep the first lines and tell how large the event is in full.
        const fullLineText = G4EventLogService.getFullLines(value).length.toLocaleString(NUMBER_LOCALE);
        const sizeText = G4EventLogService.convertToSizeText(G4EventLogService.getSize(value));
        const truncatedText = `… truncated (${sizeText}, ${fullLineText} lines in full)`;

        return [...lines.slice(0, limits.lines - 1), truncatedText].map(line => `${JSON_INDENT}${line}`);
    }

    /**
     * Gets the size of a value as JSON, in bytes.
     *
     * @param value - The value.
     * @returns The size in bytes.
     */
    public static getSize(value: unknown): number {
        return Buffer.byteLength(JSON.stringify(value) ?? '', 'utf8');
    }

    /**
     * Gets the summary of an event: what kind of event it is and the facts that tell it apart.
     *
     * @remarks
     * Compute-only. A log entry shows its level, logger, and message; an automation request shows its id and how
     * many stages, jobs, and rules it has; anything else shows its type.
     *
     * @param value - The masked event value.
     * @returns The summary, without the event number.
     */
    public static getSummaryText(value: unknown): string {
        const event = G4EventLogService.convertToRecord(value);

        // A value that is not an object is shown by its shape alone.
        if (!event) {
            return Array.isArray(value)
                ? `Array · ${G4EventLogService.convertToCountText(value.length, 'item')}`
                : 'Value';
        }

        const kind = G4EventLogService.getEventKind(event);
        const body = G4EventLogService.convertToRecord(G4EventLogService.getField(event, 'value'));

        // A log entry is told apart by its level, its logger, and its message.
        if (kind === 'log' && body) {
            const level = G4EventLogService.getTextField(body, 'LogLevel');
            const loggerName = G4EventLogService.getTextField(body, 'Logger');
            const message = G4EventLogService.convertToShortText(G4EventLogService.getTextField(body, 'Message'));
            const messageText = message === ''
                ? ''
                : JSON.stringify(message);

            return ['Log', level, loggerName, messageText].filter(fact => fact !== '').join(' · ');
        }

        // An automation request is told apart by its id and its size.
        if (kind === 'automation' && body) {
            const stages = G4EventLogService.getListField(body, 'stages');
            const jobs = stages.flatMap(stage => G4EventLogService.getListField(stage, 'jobs'));
            const rules = jobs.flatMap(job => G4EventLogService.getListField(job, 'rules'));
            const reference = G4EventLogService.convertToRecord(G4EventLogService.getField(body, 'reference'));
            const id = reference
                ? G4EventLogService.getTextField(reference, 'id')
                : '';
            const countsText = [
                G4EventLogService.convertToCountText(stages.length, 'stage'),
                G4EventLogService.convertToCountText(jobs.length, 'job'),
                G4EventLogService.convertToCountText(rules.length, 'rule')
            ].join(' · ');

            return ['Automation request', id, countsText].filter(fact => fact !== '').join(' · ');
        }

        // Any other event is shown by its type, or as an object when it has none.
        const typeText = G4EventLogService.getTextField(event, 'type') || 'Object';
        const objectType = G4EventLogService.getTextField(event, 'objectType');

        return [typeText, objectType].filter(fact => fact !== '').join(' · ');
    }

    /**
     * Reads how much of an event the log shows from the `g4.eventLogDetail` setting.
     *
     * @returns The detail; anything unknown reads as the preview.
     */
    public static readDetail(): EventLogDetail {
        const detail = vscode.workspace.getConfiguration().get<unknown>(EVENT_LOG_DETAIL_SETTING);

        return detail === 'summary' || detail === 'full'
            ? detail
            : 'preview';
    }

    /**
     * Gets the level an event is written at: the level its source wrote it at, raised to warning or error when the
     * engine logged it as one.
     *
     * @remarks
     * Compute-only. The level is never lowered, so an engine debug entry stays as visible as it was before.
     *
     * @param sourceLevel - The level its source wrote it at.
     * @param value - The event value.
     * @returns The level to write it at.
     */
    public static resolveLevel(sourceLevel: EventLogLevel, value: unknown): EventLogLevel {
        // Read the engine level of a log entry; other events have none.
        const event = G4EventLogService.convertToRecord(value);
        const body = event
            ? G4EventLogService.convertToRecord(G4EventLogService.getField(event, 'value'))
            : undefined;
        const engineLevelText = body
            ? G4EventLogService.getTextField(body, 'LogLevel').toLowerCase()
            : '';
        const engineLevel = ENGINE_LEVELS[engineLevelText];

        // Keep the more severe of the two.
        const isRaised = engineLevel !== undefined && LEVEL_RANKS[engineLevel] > LEVEL_RANKS[sourceLevel];

        return isRaised
            ? engineLevel
            : sourceLevel;
    }

    /**
     * Masks an event, keeps it for the Show-EventJson command, and writes it to the log.
     *
     * @remarks
     * Explicit context: the logger and the source level come from the caller, and the event is added to the kept
     * events, dropping the oldest past the history size.
     *
     * @param options - The event and where to write it.
     * @returns The kept event.
     */
    public static writeEvent(options: WriteEventOptions): EventRecord {
        // Mask before anything is kept or written, so a credential never reaches either.
        const value = G4EventLogService.convertToMaskedValue(options.value);

        // Number the event and keep it, dropping the oldest past the history size.
        const record: EventRecord = {
            label: G4EventLogService.convertToMaskedText(options.label ?? '').trim(),
            number: G4EventLogService._nextNumber,
            summary: G4EventLogService.getSummaryText(value),
            timestamp: new Date(),
            value
        };

        G4EventLogService._nextNumber += 1;
        G4EventLogService._events.push(record);

        if (G4EventLogService._events.length > EVENT_HISTORY_SIZE) {
            G4EventLogService._events.shift();
        }

        // Write it at its level, with as much JSON as the setting asks for.
        const text = G4EventLogService.getEventText(record, options.detail ?? G4EventLogService.readDetail());
        const level = G4EventLogService.resolveLevel(options.level, value);

        G4EventLogService.writeText(options.logger, level, text);

        return record;
    }

    /**
     * Writes a part of a kept event to the log in full.
     *
     * @param options - The event, the part, and the logger.
     */
    public static writePart(options: WritePartOptions): void {
        const { logger, part, record } = options;

        // Name the part by its event number and path, then write all of it.
        const pathText = part.path.length === 0
            ? 'whole event'
            : G4EventLogService.getPathText(part.path);
        const header = `#${record.number} ${pathText} (${part.sizeText})`;
        const lines = G4EventLogService.getFullLines(G4EventLogService.getPartValue(record.value, part.path));

        logger.information([header, ...lines].join('\n'));
    }

    /**
     * Writes a text at a level.
     *
     * @param logger - The logger.
     * @param level - The level.
     * @param text - The text.
     */
    public static writeText(logger: Logger, level: EventLogLevel, text: string): void {
        switch (level) {
            case 'debug':
                logger.debug(text);
                break;

            case 'error':
                logger.error(text);
                break;

            case 'warning':
                logger.warning(text);
                break;

            default:
                logger.information(text);
                break;
        }
    }

    /**
     * Adds the large parts inside a shortened part: containers of at least the large-part size and strings past the
     * string limit, a few levels down.
     *
     * @remarks
     * Explicit context: the parts list belongs to the caller and grows as the value is walked. Small entries, such as
     * the rows of a long list, are not offered on their own, so the list stays short enough to read.
     *
     * @param context - The value, where it sits, and the list to add to.
     */
    private static addLargeParts(context: LargePartsContext): void {
        const { depth, limits, parts, path, value } = context;

        // Only containers have parts inside them, and the walk stops a few levels below the shortened part.
        if (value === null || typeof value !== 'object' || depth >= LARGE_PART_DEPTH) {
            return;
        }

        const entries: [PathSegment, unknown][] = Array.isArray(value)
            ? value.map((item, index): [PathSegment, unknown] => [index, item])
            : Object.entries(value);

        for (const [key, item] of entries) {
            if (parts.length >= MAXIMUM_PARTS) {
                return;
            }

            // A long string is offered on its own; a large container is offered, then walked one level deeper.
            const itemPath = [...path, key];

            if (typeof item === 'string' && item.length > limits.stringLength) {
                parts.push({ path: itemPath, sizeText: G4EventLogService.convertToCountText(item.length, 'char') });
                continue;
            }

            const isContainer = item !== null && typeof item === 'object';

            if (!isContainer || G4EventLogService.getSize(item) < LARGE_PART_BYTES) {
                continue;
            }

            parts.push({ path: itemPath, sizeText: G4EventLogService.getContainerSizeText(item) });
            G4EventLogService.addLargeParts({ depth: depth + 1, limits, parts, path: itemPath, value: item });
        }
    }

    /**
     * Adds the preview lines of one value, and records each part the preview shortens.
     *
     * @remarks
     * Explicit context: the lines and parts lists belong to the caller and grow as the value is walked. `prefix` is
     * the text before the value on its first line (the indent and the key), `suffix` the comma after it.
     *
     * @param context - The value, where it sits, and the lists to add to.
     */
    private static addPreviewLines(context: PreviewContext): void {
        const { depth, limits, lines, parts, path, prefix, suffix, value } = context;

        // A long string is cut, and its full text becomes a part.
        if (typeof value === 'string') {
            const isCut = value.length > limits.stringLength;
            const hiddenText = G4EventLogService.convertToCountText(value.length - limits.stringLength, 'char');
            const shownText = isCut
                ? `${JSON.stringify(`${value.slice(0, limits.stringLength)}…`)} (+${hiddenText})`
                : JSON.stringify(value);

            lines.push(`${prefix}${shownText}${suffix}`);

            if (isCut) {
                parts.push({ path, sizeText: G4EventLogService.convertToCountText(value.length, 'char') });
            }

            return;
        }

        // Numbers, booleans, and null are written as they are.
        if (value === null || typeof value !== 'object') {
            lines.push(`${prefix}${JSON.stringify(value) ?? 'null'}${suffix}`);

            return;
        }

        // Read a container as its entries, with the brackets and size text of its kind.
        const isArray = Array.isArray(value);
        const entries: [PathSegment, unknown][] = isArray
            ? value.map((item, index): [PathSegment, unknown] => [index, item])
            : Object.entries(value);
        const [openText, closeText] = isArray
            ? ['[', ']']
            : ['{', '}'];
        const sizeText = G4EventLogService.getContainerSizeText(value);

        // An empty container is complete on one line.
        if (entries.length === 0) {
            lines.push(`${prefix}${openText}${closeText}${suffix}`);

            return;
        }

        // Past the depth limit, a container becomes a one-line marker, and a part.
        if (depth >= limits.depth) {
            lines.push(`${prefix}${openText}…${sizeText}${closeText}${suffix}`);
            parts.push({ path, sizeText });

            return;
        }

        // Within the limit, write the entries one level deeper; an array shows only its first items, and a cut array
        // is a part, listed before its own shortened items.
        const indent = '  '.repeat(depth + 1);
        const shownEntries = isArray
            ? entries.slice(0, limits.arrayItems)
            : entries;
        const hiddenCount = entries.length - shownEntries.length;

        lines.push(`${prefix}${openText}`);

        if (hiddenCount > 0) {
            parts.push({ path, sizeText });
        }

        shownEntries.forEach(([key, item], index) => {
            const isLast = index === shownEntries.length - 1 && hiddenCount === 0;
            const keyText = isArray
                ? ''
                : `${JSON.stringify(key)}: `;

            G4EventLogService.addPreviewLines({
                depth: depth + 1,
                limits,
                lines,
                parts,
                path: [...path, key],
                prefix: `${indent}${keyText}`,
                suffix: isLast ? '' : ',',
                value: item
            });
        });

        // Close the container, after the count of the items an array left out.
        if (hiddenCount > 0) {
            lines.push(`${indent}… ${G4EventLogService.convertToCountText(hiddenCount, 'more item')}`);
        }

        lines.push(`${'  '.repeat(depth)}${closeText}${suffix}`);
    }

    /**
     * Gets the text of a count with its noun, singular for one: `1 key`, `9 keys`, `3,400 chars`.
     *
     * @param count - The count.
     * @param noun - The singular noun; its last word gets the plural `s`.
     * @returns The count text.
     */
    private static convertToCountText(count: number, noun: string): string {
        const nounText = count === 1
            ? noun
            : `${noun}s`;

        return `${count.toLocaleString(NUMBER_LOCALE)} ${nounText}`;
    }

    /**
     * Narrows a value to a plain object.
     *
     * @param value - The value.
     * @returns The object, or undefined when the value is not a plain object.
     */
    private static convertToRecord(value: unknown): Record<string, unknown> | undefined {
        return value !== null && typeof value === 'object' && !Array.isArray(value)
            ? value as Record<string, unknown>
            : undefined;
    }

    /**
     * Cuts a message to one short line for a summary.
     *
     * @param text - The message.
     * @returns The first line of the message, cut to the summary length.
     */
    private static convertToShortText(text: string): string {
        const firstLine = text.split(LINE_BREAK_PATTERN)[0].trim();

        return firstLine.length > SUMMARY_MESSAGE_LENGTH
            ? `${firstLine.slice(0, SUMMARY_MESSAGE_LENGTH)}…`
            : firstLine;
    }

    /**
     * Gets how large a container is: `120 items` for an array, `9 keys` for an object.
     *
     * @param value - The container.
     * @returns The size text.
     */
    private static getContainerSizeText(value: object): string {
        return Array.isArray(value)
            ? G4EventLogService.convertToCountText(value.length, 'item')
            : G4EventLogService.convertToCountText(Object.keys(value).length, 'key');
    }

    /**
     * Tells what kind of event a value is, from the type the Hub gave it.
     *
     * @param event - The event.
     * @returns `log`, `automation`, or `other`.
     */
    private static getEventKind(event: Record<string, unknown>): 'automation' | 'log' | 'other' {
        const typeText = G4EventLogService.getTextField(event, 'type').toLowerCase();
        const objectType = G4EventLogService.getTextField(event, 'objectType');

        if (typeText === 'log' || objectType === 'LogEventArgs') {
            return 'log';
        }

        if (typeText === 'automation' || objectType === 'G4AutomationModel') {
            return 'automation';
        }

        return 'other';
    }

    /**
     * Reads a field of an object by its name in any letter case, because the Hub writes its own keys in camelCase and
     * the engine's log keys in PascalCase.
     *
     * @param record - The object.
     * @param name - The field name.
     * @returns The field value, or undefined when the object has no such field.
     */
    private static getField(record: Record<string, unknown>, name: string): unknown {
        if (name in record) {
            return record[name];
        }

        const lowerName = name.toLowerCase();
        const key = Object.keys(record).find(item => item.toLowerCase() === lowerName);

        return key === undefined
            ? undefined
            : record[key];
    }

    /**
     * Reads a list field of an object as a list of objects.
     *
     * @param record - The object.
     * @param name - The field name.
     * @returns The objects in the list; anything else gives an empty list.
     */
    private static getListField(record: Record<string, unknown>, name: string): Record<string, unknown>[] {
        const list = G4EventLogService.getField(record, name);

        if (!Array.isArray(list)) {
            return [];
        }

        return list
            .map(item => G4EventLogService.convertToRecord(item))
            .filter((item): item is Record<string, unknown> => item !== undefined);
    }

    /**
     * Reads a text field of an object.
     *
     * @param record - The object.
     * @param name - The field name.
     * @returns The text, or '' when the field is missing or not text.
     */
    private static getTextField(record: Record<string, unknown>, name: string): string {
        const field = G4EventLogService.getField(record, name);

        return typeof field === 'string'
            ? field
            : '';
    }
}

// Contracts are kept after the executable code. Interfaces come before type aliases; within each group a contract
// comes before the contracts only it depends on, a shared one after its last user, and the rest sort A-Z.

/**
 * The state of one step of the walk for large parts inside a shortened part.
 */
interface LargePartsContext {
    /** How many levels below the shortened part the value sits; the shortened part itself is 0. */
    depth: number;

    /** The preview limits; the string limit decides which strings are large. */
    limits: PreviewLimits;

    /** The parts found so far; the walk adds to it. */
    parts: EventPart[];

    /** The keys and indexes from the event to the value. */
    path: PathSegment[];

    /** The value. */
    value: unknown;
}

/**
 * The state of one step of the preview walk.
 */
interface PreviewContext {
    /** How deep the value sits; the event itself is 0. */
    depth: number;

    /** The preview limits. */
    limits: PreviewLimits;

    /** The lines written so far; the walk adds to it. */
    lines: string[];

    /** The parts shortened so far; the walk adds to it. */
    parts: EventPart[];

    /** The keys and indexes from the event to the value. */
    path: PathSegment[];

    /** The text before the value on its first line: the indent and the key. */
    prefix: string;

    /** The text after the value on its last line: a comma, or nothing for the last entry. */
    suffix: string;

    /** The value. */
    value: unknown;
}

/**
 * The limits of the shortened view of an event's JSON.
 */
export interface PreviewLimits {
    /** The items an array shows before `… N more items`. */
    arrayItems: number;

    /** The levels shown in full; deeper objects and arrays become markers. */
    depth: number;

    /** The most lines one event takes, the truncation line included. */
    lines: number;

    /** The characters a string shows before it is cut. */
    stringLength: number;
}

/**
 * What to write and where.
 */
export interface WriteEventOptions {
    /** How much of the event to show; when absent, the `g4.eventLogDetail` setting decides. */
    detail?: EventLogDetail;

    /** The text its source wrote next to it, such as a console prefix. */
    label?: string;

    /** The level its source wrote it at; the engine level can raise it. */
    level: EventLogLevel;

    /** The logger to write to. */
    logger: Logger;

    /** The event, as JSON-compatible data. */
    value: unknown;
}

/**
 * Which part of which kept event to write, and where.
 */
export interface WritePartOptions {
    /** The logger to write to. */
    logger: Logger;

    /** The part to write. */
    part: EventPart;

    /** The kept event. */
    record: EventRecord;
}

/**
 * A part of an event the preview shortened, which the Show-EventJson command can show in full.
 */
export interface EventPart {
    /** The keys and indexes from the event to the part; empty for the whole event. */
    path: PathSegment[];

    /** How large the part is: `9 keys`, `120 items`, or `40,000 chars`. */
    sizeText: string;
}

/**
 * A kept event: its number, what the log showed for it, and its masked value.
 */
export interface EventRecord {
    /** The text its source wrote next to it, such as a console prefix; often empty. */
    label: string;

    /** The number shown in the log as `#42`; unique in the session. */
    number: number;

    /** The summary line, without the number. */
    summary: string;

    /** When the event arrived. */
    timestamp: Date;

    /** The event, with every credential masked. */
    value: unknown;
}

/**
 * How much of an event the log shows: the summary only, the summary and a shortened view, or everything.
 */
export type EventLogDetail = 'full' | 'preview' | 'summary';

/**
 * The levels an event can be written at.
 */
export type EventLogLevel = 'debug' | 'error' | 'information' | 'warning';

/**
 * One step of a path inside an event: an object key or an array index.
 */
export type PathSegment = number | string;
