import * as vscode from 'vscode';

import { EventCaptureService } from '../clients/g4-signalr-client';

import { StartRecorderCommand } from '../commands/start-recorder';

import { Utilities } from '../extensions/utilities';

import { G4RecorderViewProvider } from '../providers/g4-recorder-webview-view-provider';

/**
 * Dependencies the settings service needs to hot-apply manifest changes.
 *
 * @remarks
 * These are the live subsystems that hold or derive state from the manifest at activation time,
 * so applying settings without a window reload requires re-initializing them directly.
 */
export type SettingsServiceOptions = {
    /** The recorder command whose connection pool is rebuilt when recorder settings change. */
    startRecorderCommand: StartRecorderCommand;

    /** The recorder view re-rendered so the panel reflects the new recorder settings. */
    recorderView: G4RecorderViewProvider;

    /**
     * The shared recorder connection pool (also held by Stop-Recorder and the recorder view). It
     * is mutated in place during apply so every holder keeps observing the rebuilt set.
     */
    recorderConnections: Map<string, EventCaptureService>;
};

/**
 * Applies G4 settings to the running extension without a window reload.
 *
 * @remarks
 * Save writes the manifest to disk; this service is what makes the change take effect live. It
 * refreshes the global manifest snapshot, rebuilds the recorder connections, and re-renders the
 * recorder view. A few sections (g4Server, external repositories, MCP servers) are cached at
 * activation and cannot be safely re-initialized live, so a change to any of them is surfaced as
 * a window-reload prompt instead.
 */
export class G4SettingsService {
    // The recorder command whose connection pool is rebuilt on apply.
    private readonly _startRecorderCommand: StartRecorderCommand;

    // The recorder view re-rendered on apply.
    private readonly _recorderView: G4RecorderViewProvider;

    // The shared recorder connection pool, mutated in place on apply.
    private readonly _recorderConnections: Map<string, EventCaptureService>;

    /**
     * Creates a new settings service.
     *
     * @param options The live subsystems required to hot-apply manifest changes.
     */
    constructor(options: SettingsServiceOptions) {
        this._startRecorderCommand = options.startRecorderCommand;
        this._recorderView = options.recorderView;
        this._recorderConnections = options.recorderConnections;
    }

    /**
     * Hot-applies the current on-disk settings to the running extension.
     *
     * @remarks
     * Owns the apply flow: it guards an in-progress recording, refreshes the global manifest
     * snapshot, rebuilds the recorder subsystem only when its settings changed, and prompts for a
     * window reload only when a change touches a section that is cached at activation. Safe to run
     * from the Save action or the Apply Settings command.
     *
     * @returns A promise that resolves once the settings have been applied (or the user cancels).
     */
    public async updateSettings(): Promise<void> {
        // Snapshot the pre-refresh manifest so reload-only sections can be compared after refresh.
        const previousManifest = Utilities.getManifest();

        // Rebuilding recorder connections drops an active session's buffer, so confirm a stop first.
        if (this._startRecorderCommand.isRecording) {
            const isStopConfirmed = await this.showStopRecordingPrompt();

            if (!isStopConfirmed) {
                return;
            }

            // Stop the live recording before its connections are torn down and rebuilt.
            await vscode.commands.executeCommand('Stop-Recorder');
        }

        // Refresh the global snapshot so every getManifest() consumer sees the new values.
        const currentManifest = Utilities.updateManifest();

        // Avoid tearing down recorder services when the save touched only unrelated settings.
        const isRecorderSettingsChanged = !G4SettingsService.testDeepEqual(
            previousManifest?.settings?.recorderSettings,
            currentManifest?.settings?.recorderSettings);

        if (isRecorderSettingsChanged) {
            // Rebuild connections and re-render the panel only when its source settings changed.
            await this.updateRecorders();
        }

        // Sections cached at activation cannot be re-initialized live; offer a reload for those.
        const isReloadRequired = G4SettingsService.testReloadRequired(previousManifest, currentManifest);

        if (isReloadRequired) {
            await this.showReloadPrompt();
        }
    }

    /**
     * Compares two manifest values for equality by structural serialization.
     *
     * @remarks
     * Compute-only. Both values come from parsed manifests with a consistent key order, so a
     * serialized comparison is a reliable change check without a deep-equality dependency.
     *
     * @param left  The first value to compare.
     * @param right The second value to compare.
     * @returns True when the two values serialize identically.
     */
    private static testDeepEqual(left: any, right: any): boolean {
        return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
    }

    /**
     * Tests whether a manifest change requires a window reload rather than a live apply.
     *
     * @remarks
     * Compute-only. The g4Server endpoint, external repositories, and MCP servers are read into
     * caches at activation (hub connection and the plugin/tool cache), so a live re-init is
     * unsafe; a change to any of them needs a reload to refresh that cache.
     *
     * @param previousManifest The manifest snapshot before the refresh.
     * @param currentManifest  The manifest snapshot after the refresh.
     * @returns True when a window reload is required to fully apply the change.
     */
    private static testReloadRequired(previousManifest: any, currentManifest: any): boolean {
        const isServerChanged = !G4SettingsService.testDeepEqual(
            previousManifest?.g4Server,
            currentManifest?.g4Server);

        const isExternalRepositoriesChanged = !G4SettingsService.testDeepEqual(
            previousManifest?.settings?.pluginsSettings?.externalRepositories,
            currentManifest?.settings?.pluginsSettings?.externalRepositories);

        const isServersChanged = !G4SettingsService.testDeepEqual(
            previousManifest?.settings?.pluginsSettings?.servers,
            currentManifest?.settings?.pluginsSettings?.servers);

        return isServerChanged || isExternalRepositoriesChanged || isServersChanged;
    }

    /**
     * Offers a window reload for settings that cannot be applied live.
     *
     * @remarks
     * Owns a UI prompt and an optional reload side effect. Choosing Later leaves the on-disk
     * settings in place so they take effect on the next window load.
     *
     * @returns A promise that resolves after the user chooses (and any reload is triggered).
     */
    private async showReloadPrompt(): Promise<void> {
        const reloadAction = 'Reload Window';
        const laterAction = 'Later';
        const message = 'Changes to the G4 server, external repositories, or MCP servers need a '
            + 'window reload to refresh the cache. Reload now?';

        const choice = await vscode.window.showWarningMessage(message, reloadAction, laterAction);

        if (choice === reloadAction) {
            await vscode.commands.executeCommand('workbench.action.reloadWindow');
        }
    }

    /**
     * Prompts to stop an in-progress recording before applying settings.
     *
     * @remarks
     * Owns a modal UI prompt. Returns the user's intent so the caller decides whether to proceed;
     * it does not stop the recording itself.
     *
     * @returns A promise resolving to true when the user chose to stop and apply.
     */
    private async showStopRecordingPrompt(): Promise<boolean> {
        const stopAction = 'Stop & Apply';
        const cancelAction = 'Cancel';
        const message = 'A recording is in progress. Stop it and apply the settings?';

        const choice = await vscode.window.showWarningMessage(
            message,
            { modal: true },
            stopAction,
            cancelAction);

        return choice === stopAction;
    }

    /**
     * Rebuilds the recorder connection pool from the refreshed manifest and re-renders the view.
     *
     * @remarks
     * Owns the recorder re-initialization. It rebuilds the command's connections from the new
     * endpoint options, syncs the shared pool Map in place so Stop-Recorder and the view keep
     * their reference, and re-renders the recorder panel.
     *
     * @returns A promise that resolves once the pool is rebuilt and the view re-rendered.
     */
    private async updateRecorders(): Promise<void> {
        // Resolve the recorder endpoints from the refreshed manifest and rebuild the command pool.
        const options = Utilities.resolveEventsCaptureOptions();
        await this._startRecorderCommand.updateConnections(options);

        // Sync the shared pool in place so other holders observe the rebuilt services.
        this._recorderConnections.clear();

        for (const [endpoint, service] of this._startRecorderCommand.connections) {
            this._recorderConnections.set(endpoint, service);
        }

        // Re-render the recorder panel so it reflects the new endpoints and status.
        this._recorderView.updateView();
    }
}
