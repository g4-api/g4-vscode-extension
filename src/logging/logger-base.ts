import * as vscode from "vscode";
import { LogEntry, Logger, LogLevel } from "./logger";

/**
 * Abstract base class providing core logging functionality for all derived loggers.
 * Implements shared logic for log level management, event definitions, and channel setup.
 * 
 * @abstract
 * @implements {Logger}
 */
export abstract class LoggerBase implements Logger {
    /**
     * Internal static dictionary mapping event codes to their human-readable messages.
     * These serve as standard reasons for common log events.
     * 
     * @private
     * @readonly
     */
    private static readonly _events: { [code: string]: string; } = {
        "EXT000": "Unknown event. No specific reason is available for this log entry.",
        "HUB001": "G4 Agent is unavailable or cannot be accessed directly at this time.",
        "HUB002": "The request to G4 Agent returned no results, or the results could not be parsed successfully."
    };

    /**
     * Logger configuration settings such as log level and source filters.
     * 
     * @private
     * @readonly
     */
    private readonly _settings: LogSettings;

    /**
     * Current log level for this logger instance. Defaults to 'none' unless overridden.
     * 
     * @private
     * @readonly
     */
    private readonly _logLevel: LogLevel = 'none';

    /**
     * Constructs a new logger instance with custom configuration.
     *
     * @protected
     * @param {vscode.OutputChannel} channel - The VS Code output channel used for logging messages.
     * @param {string} logName - Logical name of the logger, typically used as a category or prefix.
     * @param {LogSettings} [settings] - Optional logger configuration (log level, sources, etc.).
     */
    protected constructor(channel: vscode.OutputChannel, logName: string, settings?: LogSettings) {
        // Initialize basic channel and name used for all log entries
        this.channel = channel;
        this.logName = logName;

        // If custom settings are provided, assign them; otherwise, apply default settings
        if (settings) {
            this._settings = settings;
        }
        else {
            // Define default logging configuration used when no explicit settings are supplied
            // Only fatal messages logged by default
            this._settings = {
                logLevel: this._logLevel,
                sourceOptions: {
                    filter: 'include', // Include only whitelisted sources
                    sources: []        // Empty list means no specific filters
                }
            };
        }

        // If logging is enabled (log level not 'none'), apply it to the logger
        if (this._settings.logLevel !== 'none') {
            LoggerBase.publishLogLevel(this, this._settings.logLevel);
        }
    }

    /**
     * Determines whether logs are also written to the console
     * in addition to the VS Code OutputChannel.
     *
     * Implementations of LoggerBase must define this property
     * to indicate if console output should be active.
     *
     * @abstract
     * @type {boolean}
     */
    public abstract addConsole: boolean;

    /**
     * The VS Code OutputChannel instance where all log messages
     * will be written. This is typically created once per logger
     * and shared across related log sources.
     *
     * @readonly
     * @type {vscode.OutputChannel}
     */
    public readonly channel: vscode.OutputChannel;

    /**
     * Logical name of the logger, used as a prefix in output lines
     * or as an identifier for grouped log sources.
     *
     * Example: `G4.Agent`, `HubClient`, `AutomationEngine`
     *
     * @readonly
     * @type {string}
     */
    public readonly logName: string;

    /**
     * Indicates whether TRACE-level logging is currently enabled.
     * TRACE logs are the most verbose, often used for internal diagnostics.
     *
     * @default false
     * @type {boolean}
     */
    public isTraceEnabled: boolean = false;

    /**
     * Indicates whether DEBUG-level logging is currently enabled.
     * Useful for step-by-step analysis of control flow and variables.
     *
     * @default false
     * @type {boolean}
     */
    public isDebugEnabled: boolean = false;

    /**
     * Indicates whether ERROR-level logging is currently enabled.
     * Used for non-fatal errors that may affect specific components.
     *
     * @default false
     * @type {boolean}
     */
    public isErrorEnabled: boolean = false;

    /**
     * Indicates whether FATAL-level logging is currently enabled.
     * Fatal logs represent unrecoverable conditions that require immediate attention.
     *
     * @default false
     * @type {boolean}
     */
    public isFatalEnabled: boolean = false;

    /**
     * Indicates whether INFORMATION-level logging is currently enabled.
     * Used for general informational events (e.g., startup messages).
     *
     * @default false
     * @type {boolean}
     */
    public isInformationEnabled: boolean = false;

    /**
     * Indicates whether WARNING-level logging is currently enabled.
     * Used for potentially harmful situations or recoverable issues.
     *
     * @default false
     * @type {boolean}
     */
    public isWarningEnabled: boolean = false;

    /**
     * Writes a basic TRACE-level log message.
     *
     * Use this overload for simple text messages when no event code or error is required.
     *
     * Example:
     * ```ts
     * logger.trace("Starting initialization...");
     * ```
     *
     * @param {string} message - The log message to record.
     */
    public trace(message: string): void;

    /**
     * Writes a TRACE-level log message with an associated event code.
     *
     * Use this overload to include an optional event identifier
     * (e.g., `"HUB001"`) for correlation or standardized event tracking.
     *
     * Example:
     * ```ts
     * logger.trace("Agent ping request sent", "HUB001");
     * ```
     *
     * @param {string} message - The log message to record.
     * @param {string} [event] - Optional event code to categorize the message.
     */
    public trace(message: string, event?: string): void;

    /**
     * Writes a TRACE-level log message with an associated event and error context.
     *
     * Use this overload when you want to log diagnostic details alongside
     * an error or exception (stack trace, message, etc.).
     *
     * Example:
     * ```ts
     * logger.trace("Connection attempt failed", "HUB002", new Error("Timeout"));
     * ```
     *
     * @param {string} message - The log message to record.
     * @param {string} [event] - Optional event code for categorization.
     * @param {Error} [error] - Optional error instance to include diagnostic info.
     */
    public trace(message: string, event?: string, error?: Error | undefined): void;

    /**
     * Implementation for all TRACE overloads.
     *
     * This method ensures compliance with trace-level policies and delegates
     * the actual writing to the unified logger output routine.
     *
     * @param {string} message
     * @param {string} [event]
     * @param {Error} [error]
     * @returns {void}
     */
    public trace(message: string, event?: string, error?: Error): void {
        // Ensure TRACE-level logging is enabled for this logger instance.
        // If disabled by configuration, exit early to avoid unnecessary processing.
        if (!this.assertTraceCompliance()) {
            return;
        }

        // Write the log entry using the shared formatter/writer logic.
        // Handles message construction, timestamping, and channel output.
        this.writeLog("trace", message, event, error);
    }

    /**
     * Writes a DEBUG-level log message.
     *
     * Use this overload for simple debug text messages when
     * no event code or error is required.
     *
     * Example:
     * ```ts
     * logger.debug("Initializing component registry...");
     * ```
     *
     * @param {string} message - The log message to record.
     */
    public debug(message: string): void;

    /**
     * Writes a DEBUG-level log message with an associated event code.
     *
     * Use this overload to tag a debug message with an event identifier
     * (e.g., `"EXT000"`) for better correlation or categorization.
     *
     * Example:
     * ```ts
     * logger.debug("Cache refreshed", "EXT000");
     * ```
     *
     * @param {string} message - The log message to record.
     * @param {string} [event] - Optional event code used for grouping or diagnostics.
     */
    public debug(message: string, event?: string): void;

    /**
     * Writes a DEBUG-level log message with an event and error context.
     *
     * Use this overload to include exception details in debug output,
     * such as stack traces or specific error messages.
     *
     * Example:
     * ```ts
     * logger.debug("Socket connection failed", "NET001", new Error("Connection refused"));
     * ```
     *
     * @param {string} message - The log message to record.
     * @param {string} [event] - Optional event code describing the log context.
     * @param {Error} [error] - Optional error object containing diagnostic information.
     */
    public debug(message: string, event?: string, error?: Error | undefined): void;

    /**
     * Implementation of all DEBUG overloads.
     *
     * This method checks current debug compliance (e.g., log level permissions)
     * and delegates message output to the unified log writer.
     *
     * @param {string} message
     * @param {string} [event]
     * @param {Error} [error]
     * @returns {void}
     */
    public debug(message: string, event?: string, error?: Error): void {
        // Ensure DEBUG-level logging is enabled before writing.
        // This prevents unnecessary computation when debug output is disabled.
        if (!this.assertDebugCompliance()) {
            return;
        }

        // Write the log entry using the shared log writer.
        // Handles consistent formatting, timestamping, and output routing.
        this.writeLog("debug", message, event, error);
    }

    /**
     * Writes an ERROR-level log message.
     *
     * Use this overload for basic error messages that do not
     * require an event code or exception context.
     *
     * Example:
     * ```ts
     * logger.error("An unexpected validation error occurred.");
     * ```
     *
     * @param {string} message - The error message to record.
     */
    public error(message: string): void;

    /**
     * Writes an ERROR-level log message with an associated event code.
     *
     * Use this overload to associate the error with a known event ID
     * (e.g., `"HUB001"`, `"EXT000"`) for consistent categorization.
     *
     * Example:
     * ```ts
     * logger.error("Failed to connect to G4 Agent.", "HUB001");
     * ```
     *
     * @param {string} message - The error message to record.
     * @param {string} [event] - Optional event code describing the context.
     */
    public error(message: string, event?: string): void;

    /**
     * Writes an ERROR-level log message with an event code and error context.
     *
     * Use this overload to include detailed exception data, such as
     * stack traces or error messages, for debugging and diagnostics.
     *
     * Example:
     * ```ts
     * logger.error("Failed to parse response.", "HUB002", new Error("Invalid JSON"));
     * ```
     *
     * @param {string} message - The error message to record.
     * @param {string} [event] - Optional event code describing the context.
     * @param {Error} [error] - Optional error instance with diagnostic details.
     */
    public error(message: string, event?: string, error?: Error | undefined): void;

    /**
     * Unified ERROR-level logging implementation.
     *
     * This method routes errors both to the VS Code OutputChannel and, if
     * `addConsole` is enabled, to the Node.js console using `console.error()`.
     * It ensures compliance with the current error-level settings before writing.
     *
     * @param {string} message
     * @param {string} [event]
     * @param {Error} [error]
     * @returns {void}
     */
    public error(message: string, event?: string, error?: Error): void {
        // If console logging is enabled and an error object is provided,
        // print the full error (including stack trace) to the console.
        if (this.addConsole && error !== null && error !== undefined) {
            console.error(error);
        }

        // Verify that error-level logging is enabled and allowed by configuration.
        // Exit early if disabled to avoid unnecessary processing.
        if (!this.assertErrorCompliance()) {
            return;
        }

        // Write the log entry using the unified log writer.
        // The writer handles timestamping, formatting, and output routing.
        this.writeLog("error", message, event, error);
    }

    /**
     * Writes a FATAL-level log message.
     *
     * Use this overload to record a critical error message without
     * an event code or exception. Fatal logs represent unrecoverable
     * conditions that usually terminate execution or major components.
     *
     * Example:
     * ```ts
     * logger.fatal("Critical failure in workflow manager.");
     * ```
     *
     * @param {string} message - The fatal error message to record.
     */
    public fatal(message: string): void;

    /**
     * Writes a FATAL-level log message with an associated event code.
     *
     * Use this overload to associate the fatal condition with a known
     * event ID for tracking and root cause identification.
     *
     * Example:
     * ```ts
     * logger.fatal("Agent service unavailable.", "HUB001");
     * ```
     *
     * @param {string} message - The fatal error message to record.
     * @param {string} [event] - Optional event code describing the failure context.
     */
    public fatal(message: string, event?: string): void;

    /**
     * Writes a FATAL-level log message with an event code and error context.
     *
     * Use this overload when a fatal error is accompanied by an exception or
     * system error that should be logged in full (including stack trace).
     *
     * Example:
     * ```ts
     * logger.fatal("Engine startup failed.", "ENG001", new Error("Missing configuration"));
     * ```
     *
     * @param {string} message - The fatal error message to record.
     * @param {string} [event] - Optional event code describing the context.
     * @param {Error} [error] - Optional error instance with detailed diagnostic information.
     */
    public fatal(message: string, event?: string, error?: Error | undefined): void;

    /**
     * Unified FATAL-level logging implementation.
     *
     * This method handles all overloads and ensures proper compliance
     * with fatal-level configuration. If `addConsole` is enabled, the
     * provided error (if any) is written directly to the console using
     * `console.error()` before being forwarded to the unified log writer.
     *
     * @param {string} message
     * @param {string} [event]
     * @param {Error} [error]
     * @returns {void}
     */
    public fatal(message: string, event?: string, error?: Error): void {
        // If console output is enabled and an error object is available,
        // print it to the Node.js console for immediate visibility.
        if (this.addConsole && error !== null && error !== undefined) {
            console.error(error);
        }

        // Ensure FATAL-level logging is allowed by the current settings.
        // If not enabled, skip writing to avoid unnecessary output.
        if (!this.assertFatalCompliance()) {
            return;
        }

        // Write the fatal log entry using the unified logging mechanism.
        // This typically handles formatting, timestamps, and output routing.
        this.writeLog("fatal", message, event, error);
    }

    /**
     * Writes an INFORMATION-level log message.
     *
     * Use this overload for general informational events such as
     * startup notifications, successful operations, or status updates.
     *
     * Example:
     * ```ts
     * logger.information("G4 Engine started successfully.");
     * ```
     *
     * @param {string} message - The informational message to record.
     */
    public information(message: string): void;

    /**
     * Writes an INFORMATION-level log message with an associated event code.
     *
     * Use this overload to link the informational message to a known event
     * (e.g., `"EXT000"`, `"SYS001"`) for consistency and traceability.
     *
     * Example:
     * ```ts
     * logger.information("Plugin initialized.", "EXT000");
     * ```
     *
     * @param {string} message - The informational message to record.
     * @param {string} [event] - Optional event code describing the context.
     */
    public information(message: string, event?: string): void;

    /**
     * Writes an INFORMATION-level log message with an event and optional error context.
     *
     * Although information-level logs typically represent successful or neutral outcomes,
     * you can use this overload to include error details for mild recoverable conditions
     * or diagnostics that don't represent failures.
     *
     * Example:
     * ```ts
     * logger.information("Retry succeeded after temporary timeout.", "NET_RETRY", new Error("Previous timeout"));
     * ```
     *
     * @param {string} message - The informational message to record.
     * @param {string} [event] - Optional event code describing the context.
     * @param {Error} [error] - Optional error instance containing additional details.
     */
    public information(message: string, event?: string, error?: Error | undefined): void;

    /**
     * Unified INFORMATION-level logging implementation.
     *
     * This method handles all overloads and ensures the current log level
     * allows information messages before writing them using the unified
     * logging pipeline.
     *
     * @param {string} message
     * @param {string} [event]
     * @param {Error} [error]
     * @returns {void}
     */
    public information(message: string, event?: string, error?: Error): void {
        // Ensure INFORMATION-level logging is permitted under the current settings.
        // If disabled, skip logging entirely to reduce unnecessary output.
        if (!this.assertInformationCompliance()) {
            return;
        }

        // Write the informational log entry using the shared log writer.
        // This handles formatting, timestamps, and channel routing.
        this.writeLog("information", message, event, error);
    }

    /**
     * Writes a WARNING-level log message.
     *
     * Use this overload to record general warnings that indicate
     * potentially problematic or unexpected situations that do not
     * interrupt program flow.
     *
     * Example:
     * ```ts
     * logger.warning("Configuration file missing optional section.");
     * ```
     *
     * @param {string} message - The warning message to record.
     */
    public warning(message: string): void;

    /**
     * Writes a WARNING-level log message with an associated event code.
     *
     * Use this overload to tag a warning with an event identifier for
     * categorization and easier filtering in log analysis.
     *
     * Example:
     * ```ts
     * logger.warning("Connection took longer than expected.", "NET_WARN01");
     * ```
     *
     * @param {string} message - The warning message to record.
     * @param {string} [event] - Optional event code describing the warning context.
     */
    public warning(message: string, event?: string): void;

    /**
     * Writes a WARNING-level log message with an event and error context.
     *
     * Use this overload when the warning relates to a recoverable issue
     * or non-critical exception that still warrants developer attention.
     *
     * Example:
     * ```ts
     * logger.warning("Retry operation succeeded after transient failure.", "NET_WARN02", new Error("Timeout"));
     * ```
     *
     * @param {string} message - The warning message to record.
     * @param {string} [event] - Optional event code describing the context.
     * @param {Error} [error] - Optional error instance containing diagnostic details.
     */
    public warning(message: string, event?: string, error?: Error | undefined): void;

    /**
     * Unified WARNING-level logging implementation.
     *
     * Handles all overloads and ensures the current log configuration
     * permits warning messages. Delegates message formatting and routing
     * to the shared `writeLog()` implementation.
     *
     * @param {string} message
     * @param {string} [event]
     * @param {Error} [error]
     * @returns {void}
     */
    public warning(message: string, event?: string, error?: Error): void {
        // Check if WARNING-level logging is currently enabled.
        // Skip writing if warnings are disabled by configuration.
        if (!this.assertWarningCompliance()) {
            return;
        }

        // Write the warning message using the unified logging mechanism.
        // Handles timestamping, channel writing, and output formatting.
        this.writeLog("warning", message, event, error);
    }

    /**
     * Creates a new logger instance that inherits the current configuration
     * (such as log level and console behavior) but uses a different logical name.
     *
     * This method is typically used to create context-specific loggers,
     * allowing subsystems or modules to maintain their own log identity
     * while sharing the same underlying output channel.
     *
     * Example:
     * ```ts
     * const mainLogger = this.newLogger("Main");
     * const apiLogger = this.newLogger("API.Client");
     * apiLogger.debug("Initialized REST client");
     * ```
     *
     * @abstract
     * @param {string} logName - The logical name of the new logger (e.g., "Agent.Core", "UI.Events").
     * @returns {Logger} A new logger instance configured with the same settings but a distinct name.
     */
    public abstract newLogger(logName: string): Logger;

    /**
     * Optional hook invoked whenever a log entry is written.
     *
     * Derived logger implementations can override this method to perform
     * custom actions such as persisting logs to a database, sending telemetry,
     * or writing to additional sinks (e.g., files, HTTP endpoints).
     *
     * The default implementation is empty, allowing subclasses to extend it
     * without requiring a `super` call.
     *
     * Example override:
     * ```ts
     * protected onWriteLog(logEntry: LogEntry, error?: Error): void {
     *     if (error) {
     *         this.telemetryClient.trackException(error);
     *     }
     *     this.fileWriter.append(JSON.stringify(logEntry));
     * }
     * ```
     *
     * @protected
     * @param {LogEntry} _logEntry - The structured log entry being written.
     * @param {Error} [_error] - Optional error associated with this log event.
     * @returns {void}
     */
    protected onWriteLog(_logEntry: LogEntry, _error?: Error): void {
        // Default implementation intentionally left blank.
        // Override this in derived classes to provide additional persistence or telemetry.
    }

    /**
     * Retrieves the current log level of this logger instance.
     *
     * Use this method to check which level of logging is currently active
     * (e.g., `"fatal"`, `"error"`, `"warning"`, `"information"`, `"debug"`, `"trace"`).
     * This is typically used for conditional logging or runtime diagnostics.
     *
     * Example:
     * ```ts
     * if (logger.getLogLevel() === "debug") {
     *     logger.debug("Verbose diagnostics enabled.");
     * }
     * ```
     *
     * @public
     * @returns {LogLevel} The current active log level for this logger.
     */
    public getLogLevel(): LogLevel {
        // Return the currently active log level (default: 'fatal' unless changed).
        return this._logLevel;
    }

    /**
     * Sets the log level for this logger instance.
     *
     * Adjusting the log level controls which messages are emitted.
     * Higher levels (e.g., `"fatal"`) produce less output,
     * while lower levels (e.g., `"trace"`) include all messages.
     *
     * Example:
     * ```ts
     * logger.setLogLevel("debug");
     * logger.debug("Debug logging enabled.");
     * ```
     *
     * @public
     * @param {LogLevel} logLevel - The new log level to apply (e.g., `"fatal"`, `"error"`, `"debug"`).
     * @returns {Logger} The current logger instance for method chaining.
     */
    public setLogLevel(logLevel: LogLevel): Logger {
        // Delegate to the static helper that updates internal state and enables matching flags.
        LoggerBase.publishLogLevel(this, logLevel);

        // Return 'this' to support fluent method chaining (e.g., logger.setLogLevel(...).debug(...))
        return this;
    }

    /**
     * Writes a formatted log entry to the output channel.
     *
     * This is the core logging method invoked by all level-specific methods
     * (`trace`, `debug`, `information`, `warning`, `error`, `fatal`).
     * It constructs a structured `LogEntry`, applies filtering rules,
     * and writes the formatted output to the configured channel.
     *
     * Subclasses may customize behavior by overriding {@link onWriteLog},
     * which is called before the log is written.
     */
    private writeLog(
        level: LogLevel,
        message: string,
        event?: string,
        error?: Error
    ): void {
        // If the message is empty or consists only of whitespace, skip logging.
        if(!message || message.trim() === '') {
            return;
        }

        // Retrieve the logical application and logger names for this output source.
        const applicationName = this.channel.name;
        const logName = this.logName;

        // Build a structured log entry object with all available metadata.
        // Includes timestamp, log level, event code, message, and optional error.
        const logEntry = LoggerBase.getLogEntry(
            applicationName,
            logName,
            level,
            message,
            event,
            error
        );

        // Allow subclasses to perform additional processing (e.g., telemetry, persistence).
        // This hook runs before final log formatting and output.
        this.onWriteLog(logEntry, error);

        // Uppercase log level for readability (e.g., "ERROR", "INFO").
        const logLevel = logEntry.logLevel.toUpperCase();

        // Retrieve a visual symbol for the log level (e.g., ⚠, ❗, ℹ).
        const symbol = LoggerBase.getLevelSymbol(level);

        // Build the formatted output lines for this log entry.
        const data = [
            `timestamp:   ${logEntry.timestamp}`,
            `level:       ${symbol} ${logLevel}`,
            `application: ${logEntry.applicationName}`,
            `logger:      ${logEntry.logName}`,
            `message:     ${logEntry.message}`
        ];

        // Append the reason if present (e.g., standardized event description).
        if (logEntry.reason && logEntry.reason !== '') {
            data.push(`reason:      ${logEntry.reason}`);
        }

        // If an error object is provided, append a formatted error section with the stack trace.
        if (error !== null && error !== undefined) {
            data.push(
                '#---------------------------------#',
                '# ERROR                           #',
                '#---------------------------------#',
                `${error.stack}`
            );
        }

        // Add a blank line for spacing between log entries.
        data.push('\n');

        // Combine all formatted parts into a single multi-line string.
        const log = data.join('\n');

        // Apply source-level filtering. If the entry does not pass the filter, skip writing.
        const isFilter = LoggerBase.assertFilter(this._settings, logEntry);
        if (isFilter) {
            return;
        }

        // Finally, write the formatted log entry to the configured VS Code OutputChannel.
        this.channel.appendLine(log);
    }

    /**
     * Evaluates whether a given log entry should be filtered out based on
     * the configured `LogSettings`. This method supports both `include`
     * and `exclude` filtering modes to control which logger sources produce output.
     *
     * - **Include Mode:** Only sources listed in `settings.sourceOptions.sources` are logged.  
     * - **Exclude Mode:** All sources are logged *except* those explicitly listed.
     *
     * If no filtering configuration is defined, this method defaults to allowing
     * all logs (returns `false`, meaning *do not filter*).
     */
    private static assertFilter(settings: LogSettings, logEntry: LogEntry): boolean {
        try {
            // Extract the filter type ('include' or 'exclude') and list of sources.
            const type = settings.sourceOptions?.filter;
            const sources = settings.sourceOptions?.sources;

            // Determine whether filter type and source list are defined.
            const isType = type !== null && type !== undefined;
            const isSources = sources !== null && sources !== undefined && sources.length > 0;

            // If both type and sources exist, use them; otherwise, fallback to an empty list.
            const logTypes: string[] = isType && isSources ? sources : [];

            // Default to 'include' if filter type is missing.
            const filterType = isType ? type : 'include';

            // If no source filters are defined, allow all logs.
            if (!isSources) {
                return false;
            }

            // Normalize source names for case-insensitive comparison.
            const isSource = logTypes
                .map(name => name.toUpperCase())
                .includes(logEntry.logName.toUpperCase());

            // Exclude mode → filter (skip) if the source *is* in the list.
            if (filterType === 'exclude' && isSource) {
                return true;
            }

            // Include mode → filter (skip) if the source *is not* in the list.
            if (filterType === 'include' && !isSource) {
                return true;
            }

            // Otherwise, allow the log entry.
            return false;
        } catch {
            // On any error (e.g., invalid settings), allow logging to continue.
            return false;
        }
    }

    /**
     * Builds a structured {@link LogEntry} object that represents a single log event.
     *
     * This method is used internally by all log writers to construct a consistent
     * log record containing metadata such as timestamp, level, event code, and message.
     * It supports multiple overloads for flexibility and automatically resolves
     * event reasons and error details when provided.
     */
    private static getLogEntry(applicationName: string, logName: string, level: string, message: string): LogEntry;
    private static getLogEntry(applicationName: string, logName: string, level: string, message: string, event?: string): LogEntry;
    private static getLogEntry(applicationName: string, logName: string, level: string, message: string, event?: string, error?: Error): LogEntry;
    private static getLogEntry(
        applicationName: string,
        logName: string,
        level: string,
        message: string,
        event?: string,
        error?: Error
    ): LogEntry {
        // Determine if an error and/or event were provided.
        const isError = error !== null && error !== undefined;
        const isEvent = event !== null && event !== undefined && event !== LogEvents.UNKNOWN;

        // Create a timestamp for this log entry (e.g., ISO string or formatted date).
        const timestamp = this.newTimestamp();

        // Retrieve a human-readable reason from the event code if available.
        const reason = isEvent ? this.getReason(event) : '';

        // Initialize a minimal LogEntry structure with core fields.
        let logEntry: LogEntry = {
            applicationName: applicationName,
            logName: logName,
            message: message,
            timestamp: timestamp,
            logLevel: level
        };

        // Attach the error object if one was provided.
        if (isError) {
            logEntry.error = error;
        }

        // Include a descriptive reason if the event is recognized and mapped.
        if (reason !== '') {
            logEntry.reason = reason;
        }

        // Return the fully constructed log entry.
        return logEntry;
    }

    /**
     * Updates the log level of the provided logger instance and synchronizes
     * its internal state by enabling only the corresponding level flag.
     *
     * This method ensures that only one log level is active at a time
     * (e.g., enabling `isErrorEnabled` disables all others).
     */
    private static publishLogLevel(instance: any, logLevel: LogLevel): void {
        /**
         * Retrieves all boolean properties from a given logger instance.
         * 
         * The resulting property list is then used to toggle which levels
         * are active or inactive when changing the log level.
         */
        const getLogLevels = (instance: any): string[] => {
            // Initialize an array to hold discovered boolean property names.
            const properties: string[] = [];

            // Iterate through all enumerable members of the object.
            for (let member in instance) {
                const value = instance[member];

                // Collect only members whose value type is boolean (true/false).
                if (typeof value === 'boolean') {
                    properties.push(member);
                }
            }

            // Return the list of boolean property names (typically is*Enabled flags).
            return properties;
        };

        // Retrieve the list of all log-level-related boolean property names
        // (e.g., ['isTraceEnabled', 'isDebugEnabled', 'isInformationEnabled', ...]).
        const properties = getLogLevels(instance);

        // Build a case-insensitive regex to match the provided log level
        // against the property names.
        const regex = new RegExp(logLevel, "i");

        // Find the property name that corresponds to the requested log level.
        const property = properties.find(i => regex.exec(i));

        // If no matching property exists, exit without making changes.
        if (property === undefined) {
            return;
        }

        // Enable the matching log-level flag (e.g., `isDebugEnabled = true`).
        instance[property] = true;

        // Disable all other log-level flags to maintain exclusive activation.
        for (const prop of properties) {
            const element = prop.toUpperCase();

            // Skip the active property; disable all others.
            if (element !== property.toUpperCase()) {
                instance[prop] = false;
            }
        }
    }

    /**
     * Returns a visual symbol representing the given log level.
     *
     * Each log level is mapped to a distinct Unicode symbol to make
     * log entries easier to scan visually in the output channel.
     * If no symbol is defined for the provided level, a generic bullet (`•`) is returned.
     */
    private static getLevelSymbol(logLevel: LogLevel): string {
        // Symbol mapping for each supported log level.
        const symbols: { [key: string]: string } = {
            'trace': '⚐',
            'debug': '⚑',
            'information': '🛈',
            'warning': '⚠',
            'error': '☢',
            'fatal': '☢',
        };

        // Convert the provided level to lowercase and return the corresponding symbol.
        // If no match exists, fall back to a generic bullet.
        return symbols[`${logLevel}`.toLowerCase()] || '•';
    }

    /**
     * Retrieves a human-readable reason or description for a given event code.
     *
     * This method looks up the provided event identifier in the internal
     * `_events` dictionary and returns the corresponding explanation text.
     * If the event is not recognized, it falls back to the `"EXT000"`
     * (unknown) event message.
     */
    private static getReason(event: string): string {
        // Check if the event code exists in the predefined _events dictionary.
        // If found, return its associated reason string; otherwise return the default "unknown" reason.
        return Object.hasOwn(this._events, event)
            ? this._events[event]
            : this._events[LogEvents.UNKNOWN];
    }

    /**
     * Generates a timestamp string in the format `DD/MM/YY, HH:MM:SS.mmm`.
     */
    private static newTimestamp(): string {
        // Create a new Date instance representing the current date and time
        const date = new Date();

        // Define formatting options for day, month, year, hour, minute, and second
        const options: Intl.DateTimeFormatOptions = {
            year: '2-digit',   // two‑digit year (e.g., "25")
            month: '2-digit',  // two‑digit month (e.g., "07" for July)
            day: '2-digit',    // two‑digit day of month (e.g., "21")
            hour: '2-digit',   // two‑digit hour (24‑hour clock)
            minute: '2-digit', // two‑digit minute
            second: '2-digit', // two‑digit second
            hour12: false      // use 24‑hour clock rather than AM/PM
        };

        // Format date/time according to 'en-GB' locale (produces "DD/MM/YY, HH:MM:SS")
        const base = date.toLocaleString('en-GB', options);

        // Append milliseconds (three digits) for higher precision
        const ms = date.getMilliseconds().toString().padStart(3, '0');

        // Return the complete timestamp in the format "DD/MM/YY, HH:MM:SS.mmm"
        return `${base}.${ms}`;
    }

    /**
     * Determines whether TRACE-level logging is permitted.
     *
     * TRACE is the most verbose level, typically used for deep internal diagnostics.
     */
    private readonly assertTraceCompliance = (): boolean => this.isTraceEnabled;

    /**
     * Determines whether DEBUG-level logging is permitted.
     *
     * DEBUG output is allowed if either TRACE or DEBUG is enabled,
     * ensuring that higher verbosity levels automatically include lower ones.
     */
    private readonly assertDebugCompliance = (): boolean =>
        this.assertTraceCompliance() || this.isDebugEnabled;

    /**
     * Determines whether INFORMATION-level logging is permitted.
     *
     * INFORMATION output is allowed if any higher verbosity level (TRACE, DEBUG)
     * or the INFORMATION level itself is enabled.
     */
    private readonly assertInformationCompliance = (): boolean =>
        this.assertDebugCompliance() || this.isInformationEnabled;

    /**
     * Determines whether WARNING-level logging is permitted.
     *
     * WARNING output is allowed if any more verbose level (TRACE, DEBUG, INFORMATION)
     * or the WARNING level itself is enabled.
     */
    private readonly assertWarningCompliance = (): boolean =>
        this.assertInformationCompliance() || this.isWarningEnabled;

    /**
     * Determines whether ERROR-level logging is permitted.
     *
     * ERROR output is allowed if any more verbose level (TRACE, DEBUG, INFORMATION, WARNING)
     * or the ERROR level itself is enabled.
     */
    private readonly assertErrorCompliance = (): boolean =>
        this.assertWarningCompliance() || this.isErrorEnabled;

    /**
     * Determines whether FATAL-level logging is permitted.
     *
     * FATAL represents the highest severity — this method effectively allows
     * logging if *any* level is active, since fatal messages are always critical.
     */
    private readonly assertFatalCompliance = (): boolean =>
        this.assertErrorCompliance() || this.isFatalEnabled;
}

/**
 * Defines standardized event codes used throughout the logging
 * and telemetry system. Each code represents a specific operational
 * or error scenario to help categorize log entries consistently.
 *
 * Event codes follow a structured naming convention:
 * - **HUB*** — Issues related to G4 Hub or Agent communication.
 * - **EXT*** — External or undefined events (fallback category).
 *
 * Example:
 * ```ts
 * logger.error("Failed to connect to hub.", LogEvents.NO_CONNECTION);
 * ```
 */
export class LogEvents {
    /**
     * **HUB001:** Indicates that the application failed to establish a connection to the hub.
     *
     * Typical causes include:
     * - The G4 Agent is unavailable or offline.
     * - Network issues preventing socket connection.
     * - Invalid or missing endpoint configuration.
     */
    public static readonly NO_CONNECTION: string = 'HUB001';

    /**
     * **HUB002:** Indicates that an operation against the hub returned no results.
     *
     * This may occur when:
     * - A hub query completed successfully but produced no data.
     * - The result set was empty or filtered out.
     * - The data could not be parsed into a valid structure.
     */
    public static readonly NO_RESULTS: string = 'HUB002';

    /**
     * **EXT000:** Fallback event code for unknown, unclassified, or unexpected events.
     *
     * Used when no specific event code matches the condition being logged.
     * Ensures all logs have at least one standardized code reference.
     */
    public static readonly UNKNOWN: string = 'EXT000';
}

/**
 * Represents the runtime logging configuration applied to a logger instance.
 *
 * This object defines both the active log level and the optional
 * source filtering rules that determine which loggers are allowed
 * to produce output.
 *
 * Example:
 * ```ts
 * const settings: LogSettings = {
 *     logLevel: "debug",
 *     sourceOptions: {
 *         filter: "exclude",
 *         sources: ["Telemetry", "PerformanceTracker"]
 *     }
 * };
 * ```
 */
export type LogSettings = {
    /**
     * The active minimum log level.
     *
     * Supported values typically include:
     * `'none' | 'fatal' | 'error' | 'warning' | 'information' | 'debug' | 'trace'`
     */
    logLevel: LogLevel;

    /**
     * Optional configuration controlling which log sources are included
     * or excluded from output.
     */
    sourceOptions?: SourceOptions;
};

/**
 * Defines how log source filtering is applied across logger instances.
 *
 * - **Include Mode:** Only loggers listed in `sources` are allowed to emit logs.  
 * - **Exclude Mode:** All loggers except those listed in `sources` are allowed.
 *
 * Example:
 * ```ts
 * const filter: SourceOptions = {
 *     filter: "include",
 *     sources: ["Hub.Client", "Automation.Controller"]
 * };
 * ```
 */
export type SourceOptions = {
    /**
     * Determines whether to include or exclude the listed sources.
     * - `"include"` → Allow only specified loggers.
     * - `"exclude"` → Block specified loggers.
     */
    filter: 'include' | 'exclude';

    /**
     * Array of logger names (e.g., `logName` values) to which the filter applies.
     */
    sources: string[];
};
