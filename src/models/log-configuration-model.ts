/**
 * Configuration settings for agent logging.
 */
export type LogConfiguration = {
    /** 
     * Settings specific to the agent's own log output.
     */
    agentLogConfiguration: AgentLogConfiguration;

    /**
     * Minimum level of messages to log.
     * - 'none': no logs
     * - 'trace': very detailed logging
     * - 'debug': debug-level messages
     * - 'information': general informational messages
     * - 'warning': potential issues
     * - 'error': errors that occurred
     * - 'fatal': critical failures
     */
    logLevel: 'none'
    | 'trace'
    | 'debug'
    | 'information'
    | 'warning'
    | 'error'
    | 'fatal';

    /**
     * Optional settings to include or exclude specific log sources.
     */
    sourceOptions?: SourceOptions;
};

/**
 * Options to filter log messages by their source.
 */
type SourceOptions = {
    /**
     * Determines how to interpret the `sources` array:
     * - "include": only log messages from these sources
     * - "exclude": log messages from all sources except these
     */
    filter: 'include' | 'exclude';

    /**
     * List of source identifiers to include or exclude.
     * E.g., ['http', 'database', 'auth'].
     */
    sources: string[];
};

/**
 * Configuration for agent-specific logging behavior.
 */
type AgentLogConfiguration = {
    /**
     * Whether the agent should emit log entries.
     */
    enabled: boolean;

    /**
     * Interval, in milliseconds, at which the agent should flush or emit logs.
     */
    interval: number;
};
