import * as vscode from "vscode";
import { Utilities } from "../extensions/utilities";
import { LogEntry, Logger, LogLevel } from "./logger";
import { LogConfiguration } from "../models/log-configuration-model";

export abstract class LoggerBase implements Logger {
    /* eslint-disable @typescript-eslint/naming-convention */
    private static readonly _events: { [code: string]: string; } = {
        0: "Unknown, reason will be ignored when loggin.",
        1: "Rhino Agent is not running or cannot be directly interacted.",
        2: "The request sent to Rhino Agent yields no results or the results could not be parsed."
    };

    // members: state
    private readonly _configuration: LogConfiguration;
    private _logLevel: 'none' | 'trace' | 'debug' | 'information' | 'warning' | 'error' | 'fatal' = 'fatal';

    // properties
    public abstract readonly addConsole: boolean;
    public readonly channel: vscode.OutputChannel;
    public readonly logName: string;
    public isTraceEnabled: boolean;
    public isDebugEnabled: boolean;
    public isErrorEnabled: boolean;
    public isFatalEnabled: boolean;
    public isInformationEnabled: boolean;
    public isWarningEnabled: boolean;

    protected constructor(channel: vscode.OutputChannel, logName: string) {
        // default state
        this.isTraceEnabled = false;
        this.isDebugEnabled = false;
        this.isInformationEnabled = false;
        this.isWarningEnabled = false;
        this.isErrorEnabled = false;
        this.isFatalEnabled = false;

        // properties
        this.channel = channel;
        this.logName = logName;

        // new
        this._configuration = Utilities.getLogConfiguration();
        if (this._configuration.agentLogConfiguration.enabled) {
            LoggerBase.setLevel(this, this._configuration.logLevel);
        }
    }

    public trace(message: string): void;
    public trace(message: string, event?: string): void;
    public trace(message: string, event?: string, error?: Error | undefined): void;
    public trace(message: string, event?: string, error?: Error): void {
        if (!this.getTraceCompliance()) {
            return;
        }
        this.writeLog(LogLevel.trace, message, event, error);
    }

    public debug(message: string): void;
    public debug(message: string, event?: string): void;
    public debug(message: string, event?: string, error?: Error | undefined): void;
    public debug(message: string, event?: string, error?: Error): void {
        if (!this.getDebugCompliance()) {
            return;
        }
        this.writeLog(LogLevel.debug, message, event, error);
    }

    public error(message: string): void;
    public error(message: string, event?: string): void;
    public error(message: string, event?: string, error?: Error | undefined): void;
    public error(message: string, event?: string, error?: Error): void {
        if (this.addConsole && error !== null && error !== undefined) {
            console.error(error);
        }
        if (!this.getErrorCompliance()) {
            return;
        }
        this.writeLog(LogLevel.error, message, event, error);
    }

    public fatal(message: string): void;
    public fatal(message: string, event?: string): void;
    public fatal(message: string, event?: string, error?: Error | undefined): void;
    public fatal(message: string, event?: string, error?: Error): void {
        if (this.addConsole && error !== null && error !== undefined) {
            console.error(error);
        }
        if (!this.getFatalCompliance()) {
            return;
        }
        this.writeLog(LogLevel.fatal, message, event, error);
    }

    public information(message: string): void;
    public information(message: string, event?: string): void;
    public information(message: string, event?: string, error?: Error | undefined): void;
    public information(message: string, event?: string, error?: Error): void {
        if (!this.getInformationCompliance()) {
            return;
        }
        this.writeLog(LogLevel.information, message, event, error);
    }

    public warning(message: string): void;
    public warning(message: string, event?: string): void;
    public warning(message: string, event?: string, error?: Error | undefined): void;
    public warning(message: string, event?: string, error?: Error): void {
        if (!this.getWarningCompliance()) {
            return;
        }
        this.writeLog(LogLevel.warning, message, event, error);
    }

    public abstract newLogger(logName: string): Logger;

    protected onWriteLog(logEntry: LogEntry, error?: Error): void {
        logEntry = logEntry;
        error = error;
    }

    public getLogLevel(): "none" | "trace" | "debug" | "information" | "warning" | "error" | "fatal" {
        return this._logLevel;
    }

    public setLogLevel(logLevel: "none" | "trace" | "debug" | "information" | "warning" | "error" | "fatal"): Logger {
        // set
        LoggerBase.setLevel(this, logLevel);

        // get
        return this;
    }

    // Utilities
    private writeLog(level: string, message: string, event?: string, error?: Error) {
        // setup
        const configuration = Utilities.getLogConfiguration(); // TODO: check where to cache this property.
        const applicationName = this.channel.name;
        const logName = this.logName;
        const logEntry = LoggerBase.getLogEntry(applicationName, logName, level, message, event, error);

        // plugin
        this.onWriteLog(logEntry, error);

        // build
        const logLevel = logEntry.logLevel.toUpperCase();
        const data = [
            `timestamp:   ${logEntry.timestamp}`,
            `level:       ${LoggerBase.getLevelSymbol(logLevel.toLowerCase())} ${logLevel}`,
            `application: ${logEntry.applicationName}`,
            `logger:      ${logEntry.logName}`,
            `message:     ${logEntry.message}`
        ];

        // add reason
        if (logEntry.reason && logEntry.reason !== '') {
            data.push(`reason:      ${logEntry.reason}`);
        }

        // add error
        if (error !== null && error !== undefined) {
            data.push('#---------------------------------#');
            data.push('# ERROR                           #');
            data.push('#---------------------------------#');
            data.push(`${error.stack}`);
        }
        data.push('\n');

        // build
        const log = data.join('\n');

        // filter
        const isFilter = LoggerBase.assertFilter(configuration, logEntry);
        if (isFilter) {
            return;
        }

        // write
        this.channel.appendLine(log);
    }

    private static getLogEntry(applicationName: string, logName: string, level: string, message: string): LogEntry;
    private static getLogEntry(applicationName: string, logName: string, level: string, message: string, event?: string): LogEntry;
    private static getLogEntry(applicationName: string, logName: string, level: string, message: string, event?: string, error?: Error): LogEntry;
    private static getLogEntry(
        applicationName: string,
        logName: string,
        level: string,
        message: string,
        event?: string,
        error?: Error): LogEntry {

        // setup
        const iserror = error !== null && error !== undefined;
        const isEvent = event !== null && event !== undefined && event !== LogEvents.unknown;
        const timestamp = Utilities.getTimestamp();
        const reason = isEvent ? this.getReason(event) : '';

        // setup entry
        let logEntry: LogEntry = {
            applicationName: applicationName,
            logName: logName,
            message: message,
            timestamp: timestamp,
            logLevel: level
        };

        if (iserror) {
            logEntry.error = error;
        }

        if (reason !== '') {
            logEntry.reason = reason;
        }

        // get
        return logEntry;
    }

    private static setLevel(instance: any, logLevel: "none" | "trace" | "debug" | "information" | "warning" | "error" | "fatal") {
        // get all log level properties
        var properties = this.getLogLevels(instance);

        // get property
        var property = properties.find(p => p.toUpperCase().match(logLevel.toUpperCase()));
        if (property === undefined) {
            return this;
        }

        // switch on selected level
        instance[property] = true;

        // switch off all other levels
        for (let i = 0; i < properties.length; i++) {
            const element = properties[i].toUpperCase();
            if (element !== property.toUpperCase()) {
                instance[properties[i]] = false;
            }
        }
    }

    /**
     * Extracts all property names from the given object whose values are boolean.
     *
     * @param instance - The object containing various properties.
     * 
     * @returns An array of property names for which the value is a boolean.
     */
    private static getLogLevels(instance: any): string[] {
        // reference the input object directly
        const obj = instance;

        // prepare an array to hold matching property names
        const properties: string[] = [];

        // examine each key in the object
        for (let member in obj) {
            const value = obj[member];
            // include this key only if its value is exactly a boolean
            if (typeof value === 'boolean') {
                properties.push(member);
            }
        }

        // return all boolean‑valued property names
        return properties;
    }

    /**
     * Maps a log level to its corresponding symbol.
     *
     * @param logLevel - The log level name (e.g., 'trace', 'debug', 'warning').
     * 
     * @returns The symbol associated with the given log level.
     */
    private static getLevelSymbol(logLevel: string): string {
        // Define the mapping of log levels to symbols
        const symbols: { [key: string]: string } = {
            'trace': '⚐',
            'debug': '⚑',
            'information': '🛈',
            'warning': '⚠',
            'error': '☢',
            'fatal': '☢',
        };

        // Return the symbol matching the provided log level key
        return symbols[logLevel];
    }

    /**
     * Retrieves the reason string associated with the specified event key.
     *
     * @param event - The key identifying which event reason to look up.
     * 
     * @returns The reason string for the event, or an empty string if the key is not found or an error occurs.
     */
    private static getReason(event: string): string {
        try {
            // Look up and return the reason for the given event key
            return this._events[event];
        } catch (error) {
            // If the lookup fails (e.g., key doesn't exist), return an empty string
            return '';
        }
    }

    /**
     * Applies the configured source filter to determine whether a log entry should be excluded.
     *
     * @param configuration - The log configuration, including sourceOptions with a filter mode and a list of sources.
     * @param logEntry - The log entry to evaluate against the filter.
     * 
     * @returns `true` if the entry should be filtered out (excluded); otherwise `false` (included).
     */
    private static assertFilter(configuration: LogConfiguration, logEntry: LogEntry): boolean {
        try {
            // Retrieve the filter mode (e.g. 'include' or 'exclude') if it exists
            let type = configuration.sourceOptions?.filter;

            // Retrieve the list of source names to include or exclude
            const sources = configuration.sourceOptions?.sources;

            // Determine if a filter mode was explicitly provided
            const isType = type !== null && type !== undefined;

            // Determine if there is at least one source configured
            const isSources = sources !== null && sources !== undefined && sources.length > 0;

            // Build the effective list of log types to check: use provided sources only when both type and sources exist
            const logTypes: string[] = isType && isSources ? sources : [];

            // Default to 'include' mode if no type was specified
            const filterType = isType ? type : 'include';

            // If there are no sources to filter by, do not exclude this entry
            if (!isSources) {
                return false;
            }

            // Check if the entry's logName matches any configured source (case-insensitive)
            const isSource = logTypes
                .map(name => name.toUpperCase())
                .includes(logEntry.logName.toUpperCase());

            // When in 'exclude' mode, filter out entries from matching sources
            if (filterType === 'exclude' && isSource) {
                return true;
            }
            // When in 'include' mode, filter out entries not in the configured sources
            if (filterType === 'include' && !isSource) {
                return true;
            }

            // Otherwise, do not exclude the entry
            return false;
        } catch (error: any) {
            // On any unexpected error, include the entry (i.e., do not filter it out)
            return false;
        }
    }

    /**
     * Determines if 'trace' level logging is currently enabled.
     * 
     * @returns {boolean} True if trace logging is enabled.
     */
    private getTraceCompliance = (): boolean =>
        // Directly check the trace flag
        this.isTraceEnabled;

    /**
     * Determines if 'debug' level logging should be emitted.
     * Debug logs are allowed when trace is enabled or debug is enabled.
     * 
     * @returns {boolean} True if debug logging is permitted.
     */
    private getDebugCompliance = (): boolean =>
        // Allow debug if trace is on (more verbose) or debug is explicitly on
        this.getTraceCompliance() || this.isDebugEnabled;

    /**
     * Determines if 'information' level logging should be emitted.
     * Information logs require at least debug or information enabled.
     * 
     * @returns {boolean} True if informational logging is permitted.
     */
    private getInformationCompliance = (): boolean =>
        // Allow information if debug/compliance cascade returns true, or information is on
        this.getDebugCompliance() || this.isInformationEnabled;

    /**
     * Determines if 'warning' level logging should be emitted.
     * Warning logs require at least information or warning enabled.
     * 
     * @returns {boolean} True if warning logging is permitted.
     */
    private getWarningCompliance = (): boolean =>
        // Warnings allowed if information compliance or warning flag is on
        this.getInformationCompliance() || this.isWarningEnabled;

    /**
     * Determines if 'error' level logging should be emitted.
     * Error logs require at least warning or error enabled.
     * 
     * @returns {boolean} True if error logging is permitted.
     */
    private getErrorCompliance = (): boolean =>
        // Errors allowed if warning compliance or error flag is on
        this.getWarningCompliance() || this.isErrorEnabled;

    /**
     * Determines if 'fatal' level logging should be emitted.
     * Fatal logs require at least error or fatal enabled.
     * 
     * @returns {boolean} True if fatal logging is permitted.
     */
    private getFatalCompliance = (): boolean =>
        // Fatal allowed if error compliance or fatal flag is on
        this.getErrorCompliance() || this.isFatalEnabled;
}

/**
 * Standardized event codes used for logging and telemetry within the application.
 * Each code corresponds to a specific scenario or error condition.
 */
export class LogEvents {
    /**
     * EXT000: Fallback event code for unknown or uncategorized events.
     */
    public static readonly unknown: string = 'EXT000';

    /**
     * HUB001: Indicates that the application failed to establish a connection to the hub.
     */
    public static readonly noConnection: string = 'HUB001';

    /**
     * HUB002: Indicates that an operation against the hub returned no results.
     */
    public static readonly noResults: string = 'HUB002';
}
