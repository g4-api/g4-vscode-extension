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
import { HttpResult } from '../clients/http-client';
import { addPendingWarning } from '../extensions/notification-utilities';
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
     * @remarks
     * The status bar shows progress while the Hub syncs (up to 60 seconds). A failed cache or tool
     * sync is logged and shown as an error notification, and the extension host restarts only when
     * the tool sync succeeded, because a restart cannot load tools the Hub did not refresh. A cache
     * sync that succeeded can still report an MCP server that was not synchronized or tools the
     * engine rejected: each is logged as a warning, and shown as a warning after the restart (or at
     * once when no restart follows); the sync at activation only logs them.
     *
     * @param args - Optional `{ restart: boolean }`; activation passes `false`, the command default is `true`.
     * @returns A promise that resolves when the synchronization and restart flow completes.
     */
    protected async onInvokeCommand(args: any): Promise<void> {
        // Read the configured external repositories from the current manifest.
        const externals = Utilities.getManifest()?.settings?.pluginsSettings?.externalRepositories || [];

        // Read the configured MCP servers from the current manifest.
        const mcpServers = Utilities.getManifest()?.settings?.pluginsSettings?.servers || {};

        // Sync the cache, then the tools, under one status bar progress item that clears itself.
        const progressOptions = {
            location: vscode.ProgressLocation.Window,
            title: 'Syncing the G4 cache'
        };

        const { cacheResult, toolsResult } = await vscode.window.withProgress(progressOptions, async () => {
            // Synchronize configured external repositories and MCP servers with the G4 engine cache.
            const cacheResult = await this._client.syncCache({
                repositories: externals,
                servers: mcpServers
            });

            // Synchronize tools with the G4 engine; it still runs after a failed cache sync, so
            // templates stored in the Hub stay available as tools.
            const toolsResult = await this._client.syncTools();

            return { cacheResult, toolsResult };
        });

        // Report each failure with its reason, without aborting the established connection flow.
        this.showFailure('The G4 cache sync failed', cacheResult);
        this.showFailure('The G4 tool sync failed', toolsResult);

        // Log every source the Hub could not synchronize and every tool the engine rejected; a
        // successful sync still reports them in its body.
        const syncIssues = cacheResult.ok
            ? G4Client.getCacheSyncIssues(cacheResult.body)
            : [];

        for (const syncIssue of syncIssues) {
            this._logger.warning(syncIssue);
        }

        // Restart the extension host so the refreshed tools are reloaded, only when they were refreshed.
        const isUserSync = args?.restart ?? true;
        const isRestart = isUserSync && toolsResult.ok;

        if (isRestart) {
            // The restart closes notifications and empties the log channel, so keep the problems for
            // the next activation, which shows and logs them again.
            for (const syncIssue of syncIssues) {
                await addPendingWarning(this.context, syncIssue);
            }

            await vscode.commands.executeCommand('workbench.action.restartExtensionHost');
            return;
        }

        // Without a restart, show the problems now when the user ran the sync; the sync at activation
        // only logs them, so a known unreachable server does not raise a warning on every start.
        if (!isUserSync) {
            return;
        }

        for (const syncIssue of syncIssues) {
            void vscode.window.showWarningMessage(syncIssue);
        }
    }

    // Logs a failed sync and shows it as an error notification; a successful result is ignored.
    private showFailure(subject: string, result: HttpResult): void {
        // Nothing to report for a successful sync.
        if (result.ok) {
            return;
        }

        // Log and show the same message, so the notification and the G4 Extension log agree.
        const message = `${subject}: ${G4Client.getFailureMessage(result)}`;

        this._logger.error(message);
        void vscode.window.showErrorMessage(message);
    }
}
