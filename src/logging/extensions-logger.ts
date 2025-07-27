import * as vscode from "vscode";
import { Logger } from "./logger";
import { LoggerBase } from "./logger-base";

/**
 * Logger implementation that writes to a VS Code OutputChannel.
 * Extends the base LoggerBase with an option to also log to the console.
 */
export class ExtensionLogger extends LoggerBase {
    /**
     * When true, log messages will also be written to the browser console.
     */
    public readonly addConsole: boolean = true;

    /**
     * Creates a new ExtensionLogger.
     *
     * @param channel - The VS Code OutputChannel where log messages are sent.
     * @param logName - A name or category for the log, used as a prefix.
     */
    constructor(channel: vscode.OutputChannel, logName: string) {
        super(channel, logName);
    }

    /**
     * Creates a child logger with the same output channel but a different log name.
     *
     * @param logName - The name for the new child logger.
     * 
     * @returns A new ExtensionLogger instance.
     */
    public newLogger(logName: string): Logger {
        // Return a new logger that shares the same channel but tags messages with a new name
        return new ExtensionLogger(this.channel, logName);
    }
}
