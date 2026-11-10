import * as vscode from 'vscode';
import { G4BrandingService } from '../services/g4-branding-service';

/**
 * Central registry for output channels used within the G4 extension and agent.
 * Provides dedicated channels for hub-level and extension-level logging, each
 * with G4 log syntax highlighting for structured log output.
 *
 * @remarks
 * Each channel is created on first use rather than when this module loads, so its display name comes from the
 * branding that activation reads first. A channel keeps its name for the session; a branding change from the Hub
 * applies to the names on the next start.
 */
export class Channels {
    // The extension-host channel, created on first use.
    private static _extension: vscode.OutputChannel | undefined;

    // The Hub channel, created on first use.
    private static _hub: vscode.OutputChannel | undefined;

    /**
     * Output channel for logging messages from the G4 Extension host.
     * This channel uses the 'g4log' language mode for syntax highlighting.
     */
    public static get extension(): vscode.OutputChannel {
        Channels._extension ??= vscode.window.createOutputChannel(G4BrandingService.getText('{product} Extension'), 'g4log');

        return Channels._extension;
    }

    /**
     * Output channel for logging messages from the G4 Hub component.
     * This channel uses the 'g4log' language mode for syntax highlighting.
     */
    public static get hub(): vscode.OutputChannel {
        Channels._hub ??= vscode.window.createOutputChannel(G4BrandingService.getText('{hub}'), 'g4log');

        return Channels._hub;
    }
}
