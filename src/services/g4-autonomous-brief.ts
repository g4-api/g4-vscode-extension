/*
 * The brief an autonomous run hands to its agent: the user's prompt plus the G4 recording rules.
 */
import * as path from 'node:path';

// File name of the recorder helper the extension copies into every run folder.
export const RECORDER_HELPER_FILE_NAME = 'g4-recorder.ps1';

/**
 * Writes the brief of an autonomous run.
 *
 * @remarks
 * Compute-only, so its wording is unit tested. The brief is the whole prompt the agent receives (on
 * standard input). It puts the user's request first, then the rules that make the run's output usable:
 * every scenario is recorded through the run's helper script, which owns the Hub calls and the run
 * ledger, so the agent only names the scenario it starts or stops. It also points the agent at the G4
 * visual skills and screen tools of its workspace and tells it to search for them before it concludes
 * it cannot see the screen, since tool-server tools are often loaded on demand. The brief never holds
 * the G4 authentication; the helper reads it from the environment.
 */
export class G4AutonomousBrief {
    /**
     * Writes the brief text.
     *
     * @param options - The user's prompt, the run folder, and the picked recorders.
     * @returns The brief, as Markdown.
     */
    public static getBriefText(options: AutonomousBriefOptions): string {
        // Every command is spelled out with the absolute helper path, because a sandboxed agent starts
        // in its partition folder, not in the run folder.
        const helperPath = path.join(options.runFolder, RECORDER_HELPER_FILE_NAME);
        const helperCommand = `powershell -NoProfile -ExecutionPolicy Bypass -File "${helperPath}"`;
        const recorderLines = options.recorderNames.map((recorderName) => `- ${recorderName}`);

        const lines = [
            '# G4 autonomous exploratory run',
            '',
            '## Your task',
            '',
            options.prompt.trim(),
            '',
            '## How this run works',
            '',
            'You explore the application and record each scenario you are asked for as its own G4 flow.',
            `Your run folder is \`${options.runFolder}\`. Write every file of this run there and nowhere else.`,
            '',
            'These G4 recorders capture what happens on the desktop while a recording is open:',
            '',
            ...recorderLines,
            '',
            '## Recording rules',
            '',
            `Record only through the helper \`${helperPath}\`. Never call the G4 Hub yourself.`,
            '',
            '1. List the scenarios first. Plan each one:',
            `   \`${helperCommand} -Action plan -Scenario "<name>"\``,
            '2. For each scenario, in order:',
            '   1. Prepare the application for it (open screens, reset data). This part is not recorded.',
            `   2. Start the recording: \`${helperCommand} -Action start -Scenario "<name>"\``,
            '      Do nothing in the application until this command returns with exit code 0.',
            '   3. Perform the scenario with the screen tools below: screenshots, mouse clicks, and keys.',
            '      Take a screenshot before every click. Do only what the scenario needs, so the flow stays clean.',
            `   4. Stop the recording: \`${helperCommand} -Action stop -Scenario "<name>"\``,
            '      It saves the flow into the scenario folder.',
            '   5. Check the outcome and report it:',
            `      \`${helperCommand} -Action result -Scenario "<name>" -Status passed|failed|skipped -Note "<why>"\``,
            '3. Only one recording can be open at a time. Always stop a recording before you start the next one,',
            '   also when the scenario failed.',
            `4. Check progress at any time: \`${helperCommand} -Action status\``,
            '',
            'Exit codes: 0 is success, 1 means the call does not fit the current state (the message says why),',
            'and 2 means the G4 Hub failed the request. On 2, read the message, then retry once or skip the scenario.',
            '',
            '## Seeing and controlling the screen',
            '',
            'Look at and act on the screen through the G4 visual skills of your workspace and the screen tools',
            'of your G4 tool servers:',
            '',
            '- Skills: g4-visual-observe (take a screenshot) and g4-visual-ground (point at an element).',
            '- Tools: GetScreenshot, ConvertScreenshotPoint, MovePointer, and ResolveGroundedElement.',
            '',
            'Tool-server tools may load only when searched for. If you do not see them, search your tools',
            '(for example for "GetScreenshot") before you decide you cannot see the screen. Use other',
            'computer-use tools only when the G4 ones are missing.',
            '',
            '## Ground rules',
            '',
            '- Never use, click, or type into Visual Studio Code; it is excluded from recording and runs this session.',
            '- Never print, read, or write the G4_AUTONOMOUS_AUTHENTICATION environment variable.',
            '- Do not install software or change system settings.',
            '- If you still cannot see or control the screen after that search, stop and say so instead of guessing.',
            '',
            '## When you are done',
            '',
            'Make sure no recording is open, then end with a short summary: each scenario, its result,',
            'and anything the user should know.'
        ];

        return lines.join('\n');
    }
}

// Compile-time contracts are kept after the executable code: interfaces come before type aliases, and within
// each group a declaration is followed by the contracts it depends on, otherwise the order is A-Z.

/**
 * The inputs of an autonomous run brief.
 */
export interface AutonomousBriefOptions {
    /** What the user asked the agent to explore and record. */
    prompt: string;

    /** The display names of the recorders that take part, in manifest order. */
    recorderNames: string[];

    /** The absolute run folder. */
    runFolder: string;
}
