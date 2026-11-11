/*
 * The brief an autonomous run hands to its agent: the user's prompt plus the G4 recording rules, or, for a
 * harness-only session, the prompt plus the G4 screen tools and ground rules.
 */
import * as path from 'node:path';
import { G4BrandingService } from '../services/g4-branding-service';

// File name of the recorder helper the extension copies into every recording run folder.
export const RECORDER_HELPER_FILE_NAME = 'g4-recorder.ps1';

/**
 * Writes the brief of an autonomous run.
 *
 * @remarks
 * Compute-only, so its wording is unit tested. The brief is the whole prompt the agent receives (on
 * standard input). It puts the user's request first. A recording run then gets the rules that make its
 * output usable: every scenario is recorded through the run's helper script, which owns the Hub calls and
 * the run ledger, so the agent only names the scenario it starts or stops. A harness-only session records
 * nothing, so it gets no recorder list, helper, or recording rules. Both point the agent at the G4 visual
 * skills and screen tools of its workspace and tell it to search for them before it concludes it cannot see
 * the screen, since tool-server tools are often loaded on demand. The brief never holds the G4
 * authentication; the helper reads it from the environment.
 */
export class G4AutonomousBrief {
    /**
     * Writes the brief text.
     *
     * @param options - The user's prompt, the run folder, whether the run records, and the picked recorders.
     * @returns The brief, as Markdown.
     */
    public static getBriefText(options: AutonomousBriefOptions): string {
        // A harness-only session works on the prompt; only a recording run explains the recorders and the helper.
        const workLines = options.isRecording
            ? G4AutonomousBrief.getRecordingLines(options)
            : G4AutonomousBrief.getSessionLines(options);
        const authenticationLines = options.isRecording
            ? ['- Never print, read, or write the G4_AUTONOMOUS_AUTHENTICATION environment variable.']
            : [];
        const doneLines = options.isRecording
            ? [
                'Make sure no recording is open, then end with a short summary: each scenario, its result,',
                'and anything the user should know.'
            ]
            : ['End with a short summary of what you did and anything the user should know.'];
        const recordedText = options.isRecording
            ? 'it is excluded from recording and runs this session.'
            : 'it runs this session.';

        const lines = [
            G4BrandingService.getText('# {product} autonomous exploratory run'),
            '',
            '## Your task',
            '',
            options.prompt.trim(),
            '',
            ...workLines,
            '## Seeing and controlling the screen',
            '',
            G4BrandingService.getText('Look at and act on the screen through the {product} visual skills of your workspace and the screen tools'),
            G4BrandingService.getText('of your {product} tool servers:'),
            '',
            '- Skills: g4-visual-observe (take a screenshot) and g4-visual-ground (point at an element).',
            '- Tools: GetScreenshot, ConvertScreenshotPoint, MovePointer, and ResolveGroundedElement.',
            '',
            'Tool-server tools may load only when searched for. If you do not see them, search your tools',
            '(for example for "GetScreenshot") before you decide you cannot see the screen. Use other',
            G4BrandingService.getText('computer-use tools only when the {product} ones are missing.'),
            '',
            '## Ground rules',
            '',
            `- Never use, click, or type into Visual Studio Code; ${recordedText}`,
            ...authenticationLines,
            '- Do not install software or change system settings.',
            '- If you still cannot see or control the screen after that search, stop and say so instead of guessing.',
            '',
            '## When you are done',
            '',
            ...doneLines
        ];

        return lines.join('\n');
    }

    /**
     * Returns the brief section of a recording run: how the run works, its recorders, and the recording rules.
     *
     * @param options - The brief inputs.
     * @returns The lines, ending with a blank line.
     */
    private static getRecordingLines(options: AutonomousBriefOptions): string[] {
        // Every command is spelled out with the absolute helper path, because a sandboxed agent starts
        // in its partition folder, not in the run folder.
        const helperPath = path.join(options.runFolder, RECORDER_HELPER_FILE_NAME);
        const helperCommand = `powershell -NoProfile -ExecutionPolicy Bypass -File "${helperPath}"`;
        const recorderLines = options.recorderNames.map((recorderName) => `- ${recorderName}`);

        return [
            '## How this run works',
            '',
            G4BrandingService.getText('You explore the application and record each scenario you are asked for as its own {product} flow.'),
            `Your run folder is \`${options.runFolder}\`. Write every file of this run there and nowhere else.`,
            '',
            G4BrandingService.getText('These {product} recorders capture what happens on the desktop while a recording is open:'),
            '',
            ...recorderLines,
            '',
            '## Recording rules',
            '',
            G4BrandingService.getText(`Record only through the helper \`${helperPath}\`. Never call the {hub} yourself.`),
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
            G4BrandingService.getText('and 2 means the {hub} failed the request. On 2, read the message, then retry once or skip the scenario.'),
            ''
        ];
    }

    /**
     * Returns the brief section of a harness-only session: where its files go, and that nothing is recorded.
     *
     * @param options - The brief inputs.
     * @returns The lines, ending with a blank line.
     */
    private static getSessionLines(options: AutonomousBriefOptions): string[] {
        return [
            '## How this session works',
            '',
            'Work on the task above. Nothing is recorded in this session.',
            `Your session folder is \`${options.runFolder}\`. Write every file of this session there and nowhere else.`,
            ''
        ];
    }
}

// Compile-time contracts are kept after the executable code: interfaces come before type aliases, and within
// each group a declaration is followed by the contracts it depends on, otherwise the order is A-Z.

/**
 * The inputs of an autonomous run brief.
 */
export interface AutonomousBriefOptions {
    /** Whether the run records scenarios through the helper; false for a harness-only session. */
    isRecording: boolean;

    /** What the user asked the agent to explore and record. */
    prompt: string;

    /** The display names of the recorders that take part, in manifest order; empty for a harness-only session. */
    recorderNames: string[];

    /** The absolute run folder. */
    runFolder: string;
}
