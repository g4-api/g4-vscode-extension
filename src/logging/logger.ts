import * as vscode from 'vscode';

export interface Logger {
    /**
     * Gets a value indicating to add error level logs and above to the extension console.
     */
    readonly addConsole: boolean;
    
    /**
     * Gets the log channel.
     */
    readonly channel: vscode.OutputChannel;

    /**
     * Gets the log name.
     */
    readonly logName: string;

    /**
     * Determines if messages of priority "trace" will be logged.
     */
    isTraceEnabled: boolean;

    /**
     * Determines if messages of priority "debug" will be logged.
     */
    isDebugEnabled: boolean;

    /**
     * Determines if messages of priority "error" will be logged.
     */
    isErrorEnabled: boolean;

    /**
     * Determines if messages of priority "fatal" will be logged.
     */
    isFatalEnabled: boolean;

    /**
     * Determines if messages of priority "info" will be logged.
     */
    isInformationEnabled: boolean;

    /**
     * Determines if messages of priority "warn" will be logged.
     */
    isWarningEnabled: boolean;

    /**
     * Creates a new child logger with the same channel as the parent logger.
     * 
     * @param logName The logger name.
     */
    newLogger(logName: string): Logger;

    /**
     * Sets the log level.
     */
    setLogLevel(logLevel: 'none' | 'trace' | 'debug' | 'information' | 'warning' | 'error' | 'fatal'): Logger;
    
    /**
     * Gets the log level.
     */
    getLogLevel(): 'none' | 'trace' | 'debug' | 'information' | 'warning' | 'error' | 'fatal';

    /**
     * Logs a trace message.
     * 
     * @param message The message to log.
     * @param event   The log event id.
     * @param error   The error to log.
     */
    trace(message: string): void;
    trace(message: string, event?: string): void;
    trace(message: string, event?: string, error?: Error | undefined): void;

    /**
     * Logs a debug message.
     * 
     * @param message The message to log.
     * @param event   The log event id.
     * @param error   The error to log.
     */
    debug(message: string): void;
    debug(message: string, event?: string): void;
    debug(message: string, event?: string, error?: Error | undefined): void;

    /**
     * Logs an error message.
     * 
     * @param message The message to log.
     * @param event   The log event id.
     * @param error   The error to log.
     */
    error(message: string): void;
    error(message: string, event?: string): void;
    error(message: string, event?: string, error?: Error | undefined): void;

    /**
     * Logs a fatal message.
     * 
     * @param message The message to log.
     * @param event   The log event id.
     * @param error   The error to log.
     */
    fatal(message: string): void;
    fatal(message: string, event?: string): void;
    fatal(message: string, event?: string, error?: Error | undefined): void;

    /**
     * Logs an information message.
     * 
     * @param message The message to log.
     * @param event   The log event id.
     * @param error   The error to log.
     */
    information(message: string): void;
    information(message: string, event?: string): void;
    information(message: string, event?: string, error?: Error | undefined): void;

    /**
     * ogs a warning message.
     * 
     * @param message The message to log.
     * @param event   The log event id.
     * @param error   The error to log.
     */
    warning(message: string): void;
    warning(message: string, event?: string): void;
    warning(message: string, event?: string, error?: Error | undefined): void;
}

/**
 * Predefined log levels for controlling verbosity and severity of log output.
 * Using string literal types ensures only valid levels are assigned.
 */
export class LogLevel {
    /** No logging; disables all log output. */
    public static readonly none: 'none' = 'none';

    /** Trace-level logging; very detailed, intended for diagnosing issues. */
    public static readonly trace: 'trace' = 'trace';

    /** Debug-level logging; useful for development and debugging information. */
    public static readonly debug: 'debug' = 'debug';

    /** Informational messages; general runtime events and state changes. */
    public static readonly information: 'information' = 'information';

    /** Warning messages; potential issues that do not stop execution. */
    public static readonly warning: 'warning' = 'warning';

    /** Error messages; failures that should be investigated. */
    public static readonly error: 'error' = 'error';

    /** Fatal errors; unrecoverable conditions leading to shutdown. */
    public static readonly fatal: 'fatal' = 'fatal';
}

/**
 * Structure of a single log entry emitted by the application.
 */
export type LogEntry = {
    /** Name of the application or component generating this log. */
    applicationName: string;

    /** Optional JavaScript Error object when an exception occurred. */
    error?: Error;

    /** Severity level of the log, matching one of the `LogLevel` values. */
    logLevel: string;

    /** A short identifier for this log stream or category. */
    logName: string;

    /** Human-readable message describing the event or error. */
    message: string;

    /** ISO‑8601 timestamp (with milliseconds) indicating when the log was created. */
    timestamp: string;
    
    /** Optional textual reason or context for the log entry. */
    reason?: string;
};
