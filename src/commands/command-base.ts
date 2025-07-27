import * as vscode from 'vscode';
import { Channels } from '../constants/channels';
import { ExtensionLogger } from '../logging/extensions-logger';
import { G4Client } from '../clients/g4-client';
import { Logger } from '../logging/logger';
import { TmLanguageCreateModel } from '../models/tm-create-model';
import { Utilities } from '../extensions/utilities';

/**
 * Base class for all VS Code commands interacting with the Rhino API.
 * Provides common properties like logger, client, context, and manifest,
 * as well as helper methods for registering and invoking commands.
 */
export abstract class CommandBase {
    /** Logger instance scoped to this command. */
    public readonly logger: Logger;

    /** HTTP client for interacting with the G4 API. */
    public readonly client: G4Client;

    /** VS Code extension context for registering disposables. */
    public readonly context: vscode.ExtensionContext;

    /** The command identifier used to register in VS Code. */
    public command: string;

    /** Base endpoint URL for API calls (defaults to localhost). */
    public endpoint: string;

    /** The extension's manifest data (package.json). */
    public manifest: any;

    /** Model used when creating or updating a TextMate language definition. */
    public createModel: TmLanguageCreateModel;

    /**
     * Creates a new CommandBase instance.
     * @param context - VS Code extension context for lifecycle management.
     * @param createModel - Optional model for TextMate language creation.
     */
    constructor(context: vscode.ExtensionContext, createModel?: TmLanguageCreateModel) {
        // initialize command identifier to an empty string for derived classes to set
        this.command = '';

        // default API endpoint, can be overridden
        this.endpoint = 'http://localhost:9944';

        // logger writes to the VS Code output channel and optionally to console
        this.logger = new ExtensionLogger(Channels.extension, 'CommandBase');

        // HTTP client configured with endpoint from utilities
        this.client = new G4Client(Utilities.getG4Endpoint());

        // retain the extension context for command registration and disposables
        this.context = context;

        // load extension manifest (package.json) for metadata or versioning
        this.manifest = Utilities.getManifest();

        // assign provided create model or initialize with an empty object
        this.createModel = createModel ?? {};
    }

    /**
     * Entry point to register this command with VS Code's command registry.
     * Delegates to the subclass-specific onRegister implementation.
     *
     * @param args - Optional parameters provided during registration (unused by default).
     * @returns A promise that resolves when the command registration is complete.
     */
    public register(args?: any): Promise<any> {
        return this.onRegister();
    }

    /**
     * Hook invoked during extension activation to register the command with VS Code.
     * Subclasses must implement this to wire up their specific command identifier and callback.
     *
     * @param args - Optional parameters provided during registration (unused by default).
     * @returns A promise that resolves when registration is complete.
     */
    protected abstract onRegister(args?: any): Promise<any>;

    /**
     * Executes this command by delegating to the subclass-specific handler.
     * This method is invoked when the user triggers the command in VS Code.
     *
     * @param args - Optional arguments passed from the VS Code command invocation API.
     * @returns A promise resolving with the result of the command execution.
     */
    public invokeCommand(args?: any): Promise<any> {
        // Delegate to the implementation hook for command execution
        return this.onInvokeCommand(args);
    }

    /** Implementation hook for command invocation. */
    protected abstract onInvokeCommand(args?: any): Promise<any>;

    /**
     * Saves the currently active text document, if one exists.
     */
    public async saveOpenDocument(): Promise<void> {
        const activeEditor = vscode.window.activeTextEditor;
        if (activeEditor) {
            // persist changes in the active document
            await activeEditor.document.save();
        }
    }

    /**
     * Saves all open text documents in the workspace.
     */
    public async saveAllDocuments(): Promise<void> {
        // persist changes across all open editors
        await vscode.workspace.saveAll();
    }
}
