import * as vscode from 'vscode';

/**
 * Represents a structured logger interface used throughout the VS Code extension.
 * Provides methods for writing messages to both the VS Code Output Channel and the console.
 *
 * Each logging level (trace, debug, information, warning, error, fatal) can be enabled or disabled
 * to control verbosity. The interface also allows dynamic creation of new loggers and runtime
 * adjustment of log levels.
 */
export interface Logger {
    /** Indicates whether messages should also be written to the system console. */
    readonly addConsole: boolean;

    /** Reference to the VS Code Output Channel used for writing logs. */
    readonly channel: vscode.OutputChannel;

    /** The logical name of this logger (used to categorize log messages). */
    readonly logName: string;

    /** Whether debug-level logging is currently enabled. */
    isDebugEnabled: boolean;

    /** Whether error-level logging is currently enabled. */
    isErrorEnabled: boolean;

    /** Whether fatal-level logging is currently enabled. */
    isFatalEnabled: boolean;

    /** Whether information-level logging is currently enabled. */
    isInformationEnabled: boolean;

    /** Whether trace-level logging is currently enabled. */
    isTraceEnabled: boolean;

    /** Whether warning-level logging is currently enabled. */
    isWarningEnabled: boolean;

    /**
     * Creates and returns a new logger instance with the given name.
     * @param logName The name identifying the new logger.
     */
    newLogger(logName: string): Logger;

    /**
     * Sets the current log level for this logger.
     * @param logLevel The new log level to apply.
     * @returns The logger instance (for chaining).
     */
    setLogLevel(logLevel: LogLevel): Logger;

    /**
     * Returns the current log level for this logger.
     */
    getLogLevel(): LogLevel;

    /**
     * Writes a debug-level log message.
     * Typically used for developer diagnostics or internal state tracking.
     */
    debug(message: string): void;
    debug(message: string, event?: string): void;
    debug(message: string, event?: string, error?: Error | undefined): void;

    /**
     * Writes an error-level log message.
     * Used for recoverable errors or caught exceptions.
     */
    error(message: string): void;
    error(message: string, event?: string): void;
    error(message: string, event?: string, error?: Error | undefined): void;

    /**
     * Writes a fatal-level log message.
     * Indicates a critical failure that may prevent the extension from functioning.
     */
    fatal(message: string): void;
    fatal(message: string, event?: string): void;
    fatal(message: string, event?: string, error?: Error | undefined): void;

    /**
     * Writes an informational log message.
     * Used for general operational information (e.g., "Extension initialized").
     */
    information(message: string): void;
    information(message: string, event?: string): void;
    information(message: string, event?: string, error?: Error | undefined): void;

    /**
     * Writes a trace-level log message.
     * Used for very detailed information, such as function entry/exit or variable dumps.
     */
    trace(message: string): void;
    trace(message: string, event?: string): void;
    trace(message: string, event?: string, error?: Error | undefined): void;

    /**
     * Writes a warning-level log message.
     * Indicates unexpected behavior that did not stop execution.
     */
    warning(message: string): void;
    warning(message: string, event?: string): void;
    warning(message: string, event?: string, error?: Error | undefined): void;
}

/**
 * Defines the available severity levels for log messages.
 *
 * The order of verbosity (lowest → highest) is:
 *   none < trace < debug < information < warning < error < fatal
 */
export type LogLevel =
    | 'none'
    | 'trace'
    | 'debug'
    | 'information'
    | 'warning'
    | 'error'
    | 'fatal';

/**
 * Represents a single log entry created by the logger.
 * Can be serialized or transmitted for external logging or telemetry.
 */
export type LogEntry = {
    /** The name of the application or component emitting this log. */
    applicationName: string;

    /** Optional associated error object, if an exception occurred. */
    error?: Error;

    /** The textual representation of the log level (e.g., 'warning'). */
    logLevel: string;

    /** The name of the logger that emitted this log. */
    logName: string;

    /** The message text or description of the logged event. */
    message: string;

    /** ISO-8601 timestamp (with milliseconds) indicating when the log was created. */
    timestamp: string;

    /** Optional reason or context description for the log entry. */
    reason?: string;
};
