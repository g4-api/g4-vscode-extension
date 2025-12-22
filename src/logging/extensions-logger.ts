import * as vscode from "vscode";
import { Logger } from "./logger";
import { LoggerBase, LogSettings } from "./logger-base";

/**
 * Logger implementation that writes to a VS Code OutputChannel.
 * Extends the base LoggerBase with an option to also log to the console.
 */
export class ExtensionLogger extends LoggerBase {
    // Optional log settings for configuring log levels and sources
    private _logSettings: LogSettings | null = null;
    
    /**
     * When true, log messages will also be written to the browser console.
     */
    public readonly addConsole: boolean = true;

    /**
     * Creates a new ExtensionLogger.
     *
     * @param {vscode.OutputChannel} channel - The VS Code output channel used for logging messages.
     * @param {string} logName - Logical name of the logger, typically used as a category or prefix.
     * @param {LogSettings} [settings] - Optional logger configuration (log level, sources, etc.).
     */
    constructor(channel: vscode.OutputChannel, logName: string, settings?: LogSettings) {
        super(channel, logName, settings);
        // Store the log settings if provided for later use in child loggers creation
        this._logSettings = settings || null;
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
        return new ExtensionLogger(this.channel, logName, this._logSettings || undefined);
    }
}
