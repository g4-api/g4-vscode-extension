import * as vscode from 'vscode';

/**
 * Represents the text and range data of an open document in the editor.
 */
export type DocumentData = {
    /**
     * Array of document lines as strings.
     */
    lines: string[];
    
    /**
     * Full range covering the document (start to end).
     */
    range: vscode.Range;

    /**
     * Optional mapping between Rhino positions and actual document line indices.
     */
    rhinoRange?: RhinoRangeMap[];
};

/**
 * Generic key/value map for plugin-specific data.
 */
export type PluginData = Record<string, string>;

/**
 * Maps a VS Code position to an actual line number in the original source.
 */
export type RhinoRangeMap = {
    /**
     * Position in the Rhino-processed document.
     */
    rhinoPosition: vscode.Position;

    /**
     * The corresponding line index in the source document.
     */
    actualLine: number;
};

/**
 * Model describing a diagnostic rule to apply against document text.
 * Encapsulates matching logic, severity, and metadata for reported issues.
 */
export class DiagnosticModel {
    /** Type category of the diagnostic (e.g., 'positive', 'negative'). */
    public type: string;

    /** Optional code object containing target identifier and value. */
    public code?: Code;

    /** Detailed description of the diagnostic rule. */
    public description: string;

    /** Regular expression used to match patterns in the document. */
    public expression: RegExp;

    /** Unique identifier for this diagnostic rule. */
    public id: string;

    /** Whether the regex should be applied across multiple lines. */
    public multiline: boolean;

    /** Optional named sections or contexts for grouping diagnostics. */
    public sections?: string[];

    /** Severity level (Error, Warning, Information, Hint). */
    public severity: vscode.DiagnosticSeverity;

    /** Optional source string to attribute the diagnostic. */
    public source?: string;

    /** Optional tags for additional diagnostic metadata. */
    public tags?: vscode.DiagnosticTag;

    /** Entities that this diagnostic applies to (e.g., Plugin, Test, Model). */
    public entities: ("Plugin" | "Test" | "Model")[];

    /**
     * Initializes a new DiagnosticModel with default settings.
     */
    constructor() {
        // Default category for diagnostics
        this.type = 'positive';
        this.description = '';

        // Match all text by default
        this.expression = new RegExp(/.*/);
        this.id = '';

        // Allow multi-line matching
        this.multiline = true;

        // Default severity hint
        this.severity = vscode.DiagnosticSeverity.Hint;

        // Initialize empty entity list
        this.entities = [];
    }
}

/**
 * Represents a code snippet mapping for diagnostics.
 */
class Code {
    /** Target identifier for the code (e.g., property or field name). */
    public target: string = '';

    /** Value associated with the target code snippet. */
    public value: string = '';
}
