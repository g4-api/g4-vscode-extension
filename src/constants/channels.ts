import * as vscode from 'vscode';

/**
 * Central registry for output channels used within the G4 extension and agent.
 * Provides dedicated channels for hub-level and extension-level logging, each
 * with JSON syntax highlighting for structured log output.
 */
export class Channels {
    /**
     * Output channel for logging messages from the G4 Hub component.
     * This channel uses 'json' mode to enable JSON syntax highlighting.
     */
    public static readonly hub: vscode.OutputChannel = vscode.window.createOutputChannel(
        'G4 Hub', // Display name in the VS Code Output panel
        'g4log'   // Language mode for syntax highlighting
    );

    /**
     * Output channel for logging messages from the G4 Extension host.
     * This channel uses 'json' mode to enable JSON syntax highlighting.
     */
    public static readonly extension: vscode.OutputChannel = vscode.window.createOutputChannel(
        'G4 Extension', // Display name in the VS Code Output panel
        'g4log'         // Language mode for syntax highlighting
    );
}
