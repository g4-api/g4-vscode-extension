/**
 * Command that synchronizes external repositories and MCP servers with the G4 cache.
 *
 * RESOURCES:
 * VS Code command API reference: https://code.visualstudio.com/api/references/commands
 */
import * as vscode from 'vscode';
import { CommandBase } from './command-base';
import { Logger } from '../logging/logger';
import { G4Client } from '../clients/g4-client';
import { Utilities } from '../extensions/utilities';

export class SyncCacheCommand extends CommandBase {
    /** Logger scoped to this command for command-specific diagnostics. */
    private readonly _logger: Logger;

    /** Client used to send cache synchronization requests to the G4 API. */
    private readonly _client: G4Client;

    /**
     * Creates a new SyncCacheCommand instance.
     *
     * @param context The VS Code extension context used to manage disposables and state.
     * @param baseUri The base URI used for G4 API requests.
     */
    constructor(context: vscode.ExtensionContext, baseUri: string) {
        // Initialize the command base infrastructure.
        super(context);

        // Create a dedicated logger for this command.
        this._logger = this.logger?.newLogger('G4.SyncCache');

        // Set the VS Code command identifier.
        this.command = 'Sync-Cache';

        // Create the G4 API client for cache synchronization operations.
        this._client = new G4Client(baseUri);
    }

    /**
     * Registers the command with the VS Code command registry.
     */
    protected async onRegister(): Promise<void> {
        // Register the command callback that forwards execution to the base command flow.
        const disposable = vscode.commands.registerCommand(
            this.command,
            async (args: any) => {
                await this.invokeCommand(args);
            },
            this
        );

        // Track the command registration so it is disposed automatically when the extension unloads.
        this.context.subscriptions.push(disposable);
    }

    /**
     * Executes the cache synchronization flow and restarts the extension host after completion.
     *
     * @returns A promise that resolves when the synchronization and restart flow completes.
     */
    protected async onInvokeCommand(args: any): Promise<void> {
        // Read the configured external repositories from the current manifest.
        const externals = Utilities.getManifest()?.settings?.pluginsSettings?.externalRepositories || [];

        // Read the configured MCP servers from the current manifest.
        const mcpServers = Utilities.getManifest()?.settings?.pluginsSettings?.servers || {};

        // Synchronize configured external repositories and MCP servers with the G4 engine cache.
        await this._client.syncCache({
            repositories: externals,
            servers: mcpServers
        }).catch((error) => {
            // Log synchronization failures without aborting the established connection flow.
            this._logger.error(`Error syncing cache with G4 Engine: ${error}`);
        });

        // Synchronize tools with the G4 engine.
        await this._client.syncTools().then(async () => {
            const restart = args?.restart ?? true;
            
            // Restart the extension host so the refreshed tools are reloaded.
            if (restart) {
                await vscode.commands.executeCommand('workbench.action.restartExtensionHost');
            }
        });
    }
}
