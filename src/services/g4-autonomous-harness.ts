/*
 * Command lines and output readers of the agent command-line tools an autonomous run can start.
 *
 * RESOURCES:
 * Claude Code: claude --print --output-format stream-json --verbose (one JSON event per line)
 * Codex: codex exec --json (JSONL: thread.started, item.started, item.completed, turn.completed, turn.failed)
 * OpenCode: opencode run --format json (JSONL: step_start, text, tool_use, step_finish, error)
 */
import * as path from 'node:path';

import { RECORDER_HELPER_FILE_NAME } from './g4-autonomous-brief';

import type { AutonomousHarnessType } from './g4-autonomous-settings';

// Longest text kept for one event, so a huge tool input or answer cannot flood the page or the log.
const EVENT_TEXT_LIMIT = 400;

// Status Claude Code gives a tool server that started and answered.
const CONNECTED_STATUS = 'connected';

// Status given to a required tool server the agent does not have at all.
const NOT_CONFIGURED_STATUS = 'not configured';

// Status given to a tool server whose entry carries no status.
const UNKNOWN_STATUS = 'unknown';

// Name of the file the agent's final answer is written to, inside the run folder.
export const FINAL_MESSAGE_FILE_NAME = 'final-message.md';

// The quote that closes a quoted helper path, left in front of the helper's arguments.
// Linear: one anchored character.
const LEADING_QUOTE_PATTERN = /^"/;

// Runs of whitespace (newlines included) folded into one space for a one-line event text.
// Linear: a single character class with one quantifier.
const WHITESPACE_PATTERN = /\s+/g;

/**
 * Builds the command line of each harness and turns each line of its output into run events.
 *
 * @remarks
 * Compute-only, so every rule here is unit tested without starting a process. The prompt is never part
 * of the command line: every harness reads it from standard input, which keeps it out of process lists
 * and away from command-line quoting. Each tool streams one JSON object per line; a line that is not
 * JSON, or an event type this reader does not know, yields no events instead of failing the run.
 */
export class G4AutonomousHarness {
    /**
     * Turns one line of harness output into run events.
     *
     * @remarks
     * Compute-only. Blank lines and lines that are not a JSON object yield nothing, since tools also
     * print plain diagnostics on standard output.
     *
     * @param type - The harness type that printed the line.
     * @param line - One line of standard output.
     * @returns The events the line describes; often empty.
     */
    public static convertFromOutputLine(type: AutonomousHarnessType, line: string): AutonomousAgentEvent[] {
        // Only a JSON object line is an event.
        const output = G4AutonomousHarness.convertFromJsonLine(line);

        if (output === undefined) {
            return [];
        }

        // Each tool has its own event vocabulary.
        switch (type) {
            case 'claude':
                return G4AutonomousHarness.convertFromClaudeOutput(output);

            case 'codex':
                return G4AutonomousHarness.convertFromCodexOutput(output);

            default:
                return G4AutonomousHarness.convertFromOpenCodeOutput(output);
        }
    }

    /**
     * Builds the arguments passed to a harness for one run.
     *
     * @remarks
     * Compute-only. The harness's extra arguments from the manifest come first (for example a permission
     * mode for a machine run); the extension's arguments follow. An empty model or effort leaves the
     * tool's own default in place.
     *
     * @param options - The harness type, extra arguments, model, effort, and run folder.
     * @returns The argument list, without the executable.
     */
    public static getArguments(options: HarnessArgumentsOptions): string[] {
        switch (options.type) {
            case 'claude':
                return [...options.extraArguments, ...G4AutonomousHarness.getClaudeArguments(options)];

            case 'codex':
                return [...options.extraArguments, ...G4AutonomousHarness.getCodexArguments(options)];

            default:
                return [...options.extraArguments, ...G4AutonomousHarness.getOpenCodeArguments(options)];
        }
    }

    /**
     * Describes in one line what the agent started with: its tools, skills, and tool servers.
     *
     * @remarks
     * Compute-only. Every server is named with its status, so a server that did not connect is plain to
     * see in the console, for example `Agent ready: 48 tools, 36 skills. Tool servers: g4 connected,
     * g4-uia-recorder failed.`
     *
     * @param inventory - What the agent reported at its start.
     * @returns The line.
     */
    public static getInventoryText(inventory: AutonomousAgentInventory): string {
        // Count what the agent can use, then name each server with its status.
        const countsText = `Agent ready: ${inventory.toolCount} tools, ${inventory.skillCount} skills.`;
        const serverTexts = inventory.toolServers.map((server) => `${server.name} ${server.status}`);
        const serversText = serverTexts.length > 0
            ? `Tool servers: ${serverTexts.join(', ')}.`
            : 'No tool servers.';

        return `${countsText} ${serversText}`;
    }

    /**
     * Finds the required tool servers the agent started without.
     *
     * @remarks
     * Compute-only. A required server counts only when the agent reports it as connected; a server that
     * failed, still waits for a login, or is missing altogether is returned with that status, in the order
     * of the required list. Names are compared without regard to case.
     *
     * @param requiredNames - The servers the harness requires.
     * @param inventory - What the agent reported at its start.
     * @returns The required servers that are not connected; empty when the run can go on.
     */
    public static getUnconnectedToolServers(requiredNames: string[], inventory: AutonomousAgentInventory): AutonomousToolServer[] {
        // Look each required server up; a missing one is reported as not configured.
        const unconnectedServers: AutonomousToolServer[] = [];

        for (const requiredName of requiredNames) {
            const server = inventory.toolServers.find((candidate) => candidate.name.toLowerCase() === requiredName.toLowerCase());
            const isConnected = server?.status === CONNECTED_STATUS;

            if (isConnected) {
                continue;
            }

            const unconnectedServer = server ?? { name: requiredName, status: NOT_CONFIGURED_STATUS };

            unconnectedServers.push(unconnectedServer);
        }

        return unconnectedServers;
    }

    /**
     * Reads the events of one Claude Code stream-json object.
     *
     * @remarks
     * Compute-only. `system/init` carries the session, `assistant` messages carry text and tool calls,
     * `user` messages carry tool results (only failed ones are reported), and `result` ends the run with
     * the final answer and its error flag.
     *
     * @param output - The parsed output object.
     * @returns The events it describes.
     */
    private static convertFromClaudeOutput(output: Record<string, any>): AutonomousAgentEvent[] {
        // The session starts with an init event that names it.
        const isInit = output.type === 'system' && output.subtype === 'init';

        if (isInit) {
            // It also lists what the agent can use, so the run can tell a missing tool server at once.
            const inventory = G4AutonomousHarness.getInventory(output);
            const readyEvent: AutonomousAgentEvent = {
                ...G4AutonomousHarness.newEvent('ready', G4AutonomousHarness.getInventoryText(inventory)),
                inventory
            };

            return [
                G4AutonomousHarness.newEvent('session', G4AutonomousHarness.convertToEventText(output.session_id)),
                readyEvent
            ];
        }

        // The final result carries the answer and whether the run failed.
        if (output.type === 'result') {
            const event = G4AutonomousHarness.newEvent('result', G4AutonomousHarness.convertToEventText(output.result));
            event.isError = output.is_error === true;
            event.fullText = typeof output.result === 'string' ? output.result : '';

            return [event];
        }

        // Messages carry a list of content blocks; anything else has nothing to show.
        const blocks: any[] = Array.isArray(output.message?.content) ? output.message.content : [];
        const events: AutonomousAgentEvent[] = [];

        for (const block of blocks) {
            const isText = output.type === 'assistant' && block?.type === 'text';
            const isToolUse = output.type === 'assistant' && block?.type === 'tool_use';
            const isFailedToolResult = output.type === 'user' && block?.type === 'tool_result' && block.is_error === true;

            if (isText) {
                events.push(G4AutonomousHarness.newEvent('text', G4AutonomousHarness.convertToEventText(block.text)));
            }

            if (isToolUse) {
                const toolText = G4AutonomousHarness.getToolText(block.name, block.input);
                events.push(G4AutonomousHarness.newEvent('tool', toolText));
            }

            if (isFailedToolResult) {
                const resultText = G4AutonomousHarness.getToolResultText(block.content);
                events.push(G4AutonomousHarness.newEvent('error', resultText));
            }
        }

        // Drop blocks that carried no text, such as an empty answer.
        return events.filter((event) => event.text.length > 0);
    }

    /**
     * Reads the events of one completed Codex item.
     *
     * @remarks
     * Compute-only. Agent messages are text and error items are errors; completed commands are not
     * repeated, since their start was already reported.
     *
     * @param item - The completed item.
     * @returns The events it describes.
     */
    private static convertFromCodexItem(item: Record<string, any>): AutonomousAgentEvent[] {
        if (item.type === 'agent_message') {
            return [G4AutonomousHarness.newEvent('text', G4AutonomousHarness.convertToEventText(item.text))];
        }

        if (item.type === 'error') {
            return [G4AutonomousHarness.newEvent('error', G4AutonomousHarness.convertToEventText(item.message))];
        }

        return [];
    }

    /**
     * Reads the events of one Codex `exec --json` object.
     *
     * @remarks
     * Compute-only. `thread.started` names the session, a started command is a tool call, a completed
     * agent message is text, error items and `error` events are errors, `turn.failed` fails the run,
     * and `turn.completed` ends it (the final answer is written to the final-message file by Codex).
     *
     * @param output - The parsed output object.
     * @returns The events it describes.
     */
    private static convertFromCodexOutput(output: Record<string, any>): AutonomousAgentEvent[] {
        const item = output.item ?? {};

        switch (output.type) {
            case 'thread.started':
                return [G4AutonomousHarness.newEvent('session', G4AutonomousHarness.convertToEventText(output.thread_id))];

            case 'item.started':
                return item.type === 'command_execution'
                    ? [G4AutonomousHarness.newEvent('tool', G4AutonomousHarness.getToolText('shell', { command: item.command }))]
                    : [];

            case 'item.completed':
                return G4AutonomousHarness.convertFromCodexItem(item);

            case 'error':
                return [G4AutonomousHarness.newEvent('error', G4AutonomousHarness.convertToEventText(output.message))];

            case 'turn.failed': {
                const event = G4AutonomousHarness.newEvent('result', G4AutonomousHarness.convertToEventText(output.error?.message));
                event.isError = true;

                return [event];
            }

            case 'turn.completed': {
                const event = G4AutonomousHarness.newEvent('result', '');
                event.isError = false;

                return [event];
            }

            default:
                return [];
        }
    }

    /**
     * Parses one output line when it holds a JSON object.
     *
     * @remarks
     * Compute-only. Arrays, scalars, and text that is not JSON are rejected, so every reader receives
     * an object.
     *
     * @param line - One line of standard output.
     * @returns The object, or `undefined` when the line is not a JSON object.
     */
    private static convertFromJsonLine(line: string): Record<string, any> | undefined {
        // A JSON object line starts with a brace; anything else is plain tool output.
        const text = line.trim();

        if (!text.startsWith('{')) {
            return undefined;
        }

        try {
            const value: unknown = JSON.parse(text);
            const isObject = value !== null && typeof value === 'object' && !Array.isArray(value);

            return isObject
                ? value as Record<string, any>
                : undefined;
        } catch {
            return undefined;
        }
    }

    /**
     * Reads the events of one OpenCode `run --format json` object.
     *
     * @remarks
     * Compute-only. The first event names the session (`sessionID`), `text` parts are text, `tool_use`
     * parts are tool calls (a failed one is also an error), `error` events are errors, and a step that
     * finishes for the reason `stop` ends the run.
     *
     * @param output - The parsed output object.
     * @returns The events it describes.
     */
    private static convertFromOpenCodeOutput(output: Record<string, any>): AutonomousAgentEvent[] {
        const part = output.part ?? {};

        switch (output.type) {
            case 'step_start':
                return [G4AutonomousHarness.newEvent('session', G4AutonomousHarness.convertToEventText(output.sessionID))];

            case 'text':
                return [G4AutonomousHarness.newEvent('text', G4AutonomousHarness.convertToEventText(part.text))]
                    .filter((event) => event.text.length > 0);

            case 'tool_use': {
                const events = [G4AutonomousHarness.newEvent('tool', G4AutonomousHarness.getToolText(part.tool, part.state?.input))];
                const isFailed = part.state?.status === 'error';

                if (isFailed) {
                    events.push(G4AutonomousHarness.newEvent('error', G4AutonomousHarness.convertToEventText(part.state?.error)));
                }

                return events;
            }

            case 'error':
                return [G4AutonomousHarness.newEvent('error', G4AutonomousHarness.getOpenCodeErrorText(output.error))];

            case 'step_finish': {
                const isStop = part.reason === 'stop';

                if (!isStop) {
                    return [];
                }

                const event = G4AutonomousHarness.newEvent('result', '');
                event.isError = false;

                return [event];
            }

            default:
                return [];
        }
    }

    /**
     * Turns any output value into one short line of text.
     *
     * @remarks
     * Compute-only. Text keeps its words on one line and is cut to the event limit; other values become
     * an empty string instead of '[object Object]'.
     *
     * @param value - The output value.
     * @returns One line of at most the event limit.
     */
    private static convertToEventText(value: unknown): string {
        if (typeof value !== 'string') {
            return '';
        }

        // Fold every line break and run of spaces, then cut long text with an ellipsis.
        const text = value.replaceAll(WHITESPACE_PATTERN, ' ').trim();
        const isTooLong = text.length > EVENT_TEXT_LIMIT;

        return isTooLong
            ? `${text.slice(0, EVENT_TEXT_LIMIT - 1)}…`
            : text;
    }

    /**
     * Builds the Claude Code arguments.
     *
     * @remarks
     * Compute-only. `--print` with `stream-json` (which requires `--verbose`) streams one event per line;
     * `--add-dir` lets the agent write the run folder even though a partition launcher starts it in the
     * partition folder.
     *
     * @param options - The model, effort, and run folder.
     * @returns The arguments.
     */
    private static getClaudeArguments(options: HarnessArgumentsOptions): string[] {
        const argumentsList = ['--print', '--output-format', 'stream-json', '--verbose'];

        if (options.model) {
            argumentsList.push('--model', options.model);
        }

        if (options.effort) {
            argumentsList.push('--effort', options.effort);
        }

        argumentsList.push('--add-dir', options.runFolder);

        return argumentsList;
    }

    /**
     * Builds the Codex arguments.
     *
     * @remarks
     * Compute-only. `exec --json` streams JSONL, `-C` makes the run folder the agent's working root, `-o`
     * writes the final answer into the run folder, the effort is a configuration override, and the
     * trailing `-` reads the prompt from standard input.
     *
     * @param options - The model, effort, and run folder.
     * @returns The arguments.
     */
    private static getCodexArguments(options: HarnessArgumentsOptions): string[] {
        const finalMessagePath = path.join(options.runFolder, FINAL_MESSAGE_FILE_NAME);
        const argumentsList = [
            'exec',
            '--json',
            '--skip-git-repo-check',
            '-C',
            options.runFolder,
            '-o',
            finalMessagePath
        ];

        if (options.model) {
            argumentsList.push('-m', options.model);
        }

        if (options.effort) {
            argumentsList.push('-c', `model_reasoning_effort=${options.effort}`);
        }

        argumentsList.push('-');

        return argumentsList;
    }

    /**
     * Reads what Claude Code started with from its `system/init` event.
     *
     * @remarks
     * Compute-only. `tools` and `skills` are name lists and `mcp_servers` lists each server with its
     * status (`connected`, `failed`, `needs-auth`, `pending`); anything else in a field is skipped, so a
     * changed event shape yields zero counts instead of failing the run.
     *
     * @param output - The init event.
     * @returns The inventory.
     */
    private static getInventory(output: Record<string, any>): AutonomousAgentInventory {
        // Count the tools and skills the agent was given.
        const tools: unknown[] = Array.isArray(output.tools) ? output.tools : [];
        const skills: unknown[] = Array.isArray(output.skills) ? output.skills : [];
        const servers: unknown[] = Array.isArray(output.mcp_servers) ? output.mcp_servers : [];

        // Keep each named server with its status; a server without a status is reported as unknown.
        const toolServers = servers
            .map((server) => {
                const entry = (server ?? {}) as Record<string, unknown>;

                return {
                    name: G4AutonomousHarness.convertToEventText(entry.name),
                    status: G4AutonomousHarness.convertToEventText(entry.status) || UNKNOWN_STATUS
                };
            })
            .filter((server) => server.name.length > 0);

        return {
            skillCount: skills.length,
            toolCount: tools.length,
            toolServers
        };
    }

    /**
     * Builds the OpenCode arguments.
     *
     * @remarks
     * Compute-only. `run --format json` streams JSONL, `--dir` makes the run folder the agent's working
     * folder, and the effort is the model variant; the prompt comes from standard input.
     *
     * @param options - The model, effort, and run folder.
     * @returns The arguments.
     */
    private static getOpenCodeArguments(options: HarnessArgumentsOptions): string[] {
        const argumentsList = ['run', '--format', 'json', '--dir', options.runFolder];

        if (options.model) {
            argumentsList.push('--model', options.model);
        }

        if (options.effort) {
            argumentsList.push('--variant', options.effort);
        }

        return argumentsList;
    }

    /**
     * Reads the message of an OpenCode error event.
     *
     * @remarks
     * Compute-only. OpenCode nests a provider message under `data.message`; simpler errors carry a
     * `message` or only a `name`.
     *
     * @param error - The event's error object.
     * @returns One line of text.
     */
    private static getOpenCodeErrorText(error: any): string {
        const providerMessage = G4AutonomousHarness.convertToEventText(error?.data?.message);

        if (providerMessage.length > 0) {
            return providerMessage;
        }

        const message = G4AutonomousHarness.convertToEventText(error?.message);

        return message || G4AutonomousHarness.convertToEventText(error?.name);
    }

    /**
     * Reads the text of a failed tool result.
     *
     * @remarks
     * Compute-only. Claude reports a result as text or as a list of text blocks.
     *
     * @param content - The tool result content.
     * @returns One line of text.
     */
    private static getToolResultText(content: unknown): string {
        if (typeof content === 'string') {
            return G4AutonomousHarness.convertToEventText(content);
        }

        const blocks: any[] = Array.isArray(content) ? content : [];
        const text = blocks
            .map((block) => (typeof block?.text === 'string' ? block.text : ''))
            .join(' ');

        return G4AutonomousHarness.convertToEventText(text);
    }

    /**
     * Describes one tool call in a line: the tool and its most telling input.
     *
     * @remarks
     * Compute-only. A shell command, a description, a file path, or a URL is preferred, in that order,
     * since they say what the agent is doing; other inputs show the tool name only.
     *
     * @param name - The tool name.
     * @param input - The tool input.
     * @returns One line, for example `PowerShell: Get-Process`.
     */
    private static getToolText(name: unknown, input: unknown): string {
        const toolName = G4AutonomousHarness.convertToEventText(name) || 'tool';
        const toolInput = (input ?? {}) as Record<string, unknown>;
        const detailValue = [toolInput.command, toolInput.description, toolInput.file_path, toolInput.filePath, toolInput.url]
            .find((value) => typeof value === 'string' && value.trim().length > 0);
        const commandText = G4AutonomousHarness.convertToEventText(detailValue);

        // A recorder helper call is named by the helper, so its action and scenario stay in view instead of
        // the long run-folder path.
        const helperPosition = commandText.indexOf(RECORDER_HELPER_FILE_NAME);
        const isHelperCall = helperPosition >= 0;
        const helperArguments = commandText
            .slice(helperPosition + RECORDER_HELPER_FILE_NAME.length)
            .replace(LEADING_QUOTE_PATTERN, '');
        const detail = isHelperCall
            ? `${RECORDER_HELPER_FILE_NAME}${helperArguments}`
            : commandText;

        return detail
            ? G4AutonomousHarness.convertToEventText(`${toolName}: ${detail}`)
            : toolName;
    }

    /**
     * Creates one run event.
     *
     * @param kind - What the event reports.
     * @param text - The event text.
     * @returns The event.
     */
    private static newEvent(kind: AutonomousAgentEventKind, text: string): AutonomousAgentEvent {
        return { kind, text };
    }
}

// Compile-time contracts are kept after the executable code: interfaces come before type aliases, and within
// each group a declaration is followed by the contracts it depends on, otherwise the order is A-Z.

/**
 * One thing the agent reported while it ran.
 */
export interface AutonomousAgentEvent {
    /** The untrimmed final answer of a `result` event, when the tool prints it; absent otherwise. */
    fullText?: string;

    /** What the agent started with; set only on a `ready` event. */
    inventory?: AutonomousAgentInventory;

    /** Whether a `result` event ends the run as failed; absent on other events. */
    isError?: boolean;

    /** What the event reports. */
    kind: AutonomousAgentEventKind;

    /** One line of text: the session id, what the agent started with, its words, the tool call, or the error. */
    text: string;
}

/**
 * What an agent reported at its start: how many tools and skills it has, and the state of its tool servers.
 *
 * @remarks
 * Only Claude Code reports this; it lets a run stop before the agent works without the screen tools.
 */
export interface AutonomousAgentInventory {
    /** The number of skills the agent loaded. */
    skillCount: number;

    /** The number of tools the agent can call, tool-server tools included. */
    toolCount: number;

    /** Each tool server (MCP server) the agent knows, with its status. */
    toolServers: AutonomousToolServer[];
}

/**
 * One agent tool server (MCP server) and its state at the agent's start.
 *
 * @remarks
 * Models only the name and status of a Claude Code `mcp_servers` entry; its source and any other field are
 * not used by the start check.
 */
export interface AutonomousToolServer {
    /** The server name, as the agent's configuration names it. */
    name: string;

    /** `connected`, `failed`, `needs-auth`, `pending`, `not configured`, or `unknown`. */
    status: string;
}

/**
 * The inputs of a harness command line.
 */
export interface HarnessArgumentsOptions {
    /** The reasoning effort; empty for the tool's default. */
    effort: string;

    /** Extra arguments from the manifest, placed first. */
    extraArguments: string[];

    /** The model; empty for the tool's default. */
    model: string;

    /** The absolute run folder the agent works in. */
    runFolder: string;

    /** The harness type. */
    type: AutonomousHarnessType;
}

/**
 * What one run event reports: the session, what the agent started with, the agent's words, a tool call, an
 * error, or the end of the run.
 */
export type AutonomousAgentEventKind = 'error' | 'ready' | 'result' | 'session' | 'text' | 'tool';
