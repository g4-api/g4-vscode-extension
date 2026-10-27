import * as vscode from 'vscode';

import { StartRecorderCommand } from '../commands/start-recorder';

import { Global } from '../constants/global';

import { showTemporaryInformationMessage } from '../extensions/notification-utilities';
import { Utilities } from '../extensions/utilities';

import { G4RecorderViewProvider } from '../providers/g4-recorder-webview-view-provider';

import { G4RecordingService } from './g4-recording-service';

/**
 * Options of one Apply-Settings run.
 *
 * @remarks
 * Passed by the Settings editor, which must write manifest.json only after the recording prompt,
 * so a cancelled prompt leaves the file unchanged. The palette command passes none.
 */
export type ApplySettingsOptions = {
    /** Writes manifest.json; resolves false when nothing was written (cancelled or failed), which stops the apply. */
    saveManifest?: () => Promise<boolean>;
};

/**
 * Dependencies the settings service needs to hot-apply manifest changes.
 *
 * @remarks
 * These are the live subsystems that hold or derive state from the manifest at activation time,
 * so applying settings without a window reload requires re-initializing them directly.
 */
export type SettingsServiceOptions = {
    /** The recorder command, read to confirm a stop before recorder settings change. */
    startRecorderCommand: StartRecorderCommand;

    /** The recorder view re-rendered so the panel reflects the new recorder settings. */
    recorderView: G4RecorderViewProvider;

    /**
     * The shared recording session owner (also held by Stop-Recorder and the recorder view). Its
     * recorder settings are replaced on apply so the next session uses the new endpoints.
     */
    recordingService: G4RecordingService;
};

/**
 * Applies G4 settings to the running extension without a window reload.
 *
 * @remarks
 * Save writes the manifest to disk; this service is what makes the change take effect live. It
 * refreshes the global manifest snapshot, applies the recorder settings, and re-renders the
 * recorder view. A few sections (g4Server, external repositories, MCP servers) are cached at
 * activation and cannot be safely re-initialized live, so a change to any of them is surfaced as
 * a window-reload prompt instead.
 */
export class G4SettingsService {
    // The recorder command, read to confirm a stop before recorder settings change.
    private readonly _startRecorderCommand: StartRecorderCommand;

    // The recorder view re-rendered on apply.
    private readonly _recorderView: G4RecorderViewProvider;

    // The shared recording session owner whose recorder settings are replaced on apply.
    private readonly _recordingService: G4RecordingService;

    /**
     * Creates a new settings service.
     *
     * @param options The live subsystems required to hot-apply manifest changes.
     */
    constructor(options: SettingsServiceOptions) {
        this._startRecorderCommand = options.startRecorderCommand;
        this._recorderView = options.recorderView;
        this._recordingService = options.recordingService;
    }

    /**
     * Hot-applies the current on-disk settings to the running extension.
     *
     * @remarks
     * Owns the apply flow: it guards an in-progress recording, lets the Settings editor write the
     * file, refreshes the global manifest snapshot, rebuilds the recorder subsystem only when its
     * settings changed, and prompts for a window reload only when a change touches a section that
     * is cached at activation. Safe to run from the Save action or the Apply Settings command.
     *
     * The recording prompt comes before the write, so cancelling it leaves the file unchanged and
     * the file and the applied settings never disagree.
     *
     * @param options - Optional save step of the Settings editor, run after the recording prompt.
     * @returns True when the settings were applied; false when the user cancelled or the save failed.
     */
    public async updateSettings(options?: ApplySettingsOptions): Promise<boolean> {
        // Snapshot the pre-refresh manifest so reload-only sections can be compared after refresh.
        const previousManifest = Utilities.getManifest();

        // Changing recorder settings during a session would leave the panel out of sync, so confirm a stop first.
        if (this._startRecorderCommand.isRecording) {
            const isStopConfirmed = await this.showStopRecordingPrompt();

            if (!isStopConfirmed) {
                return false;
            }

            // Stop the live recording before the recorder settings are replaced, then re-render the
            // panel so it no longer shows Stop, whether or not the recorder settings change.
            await vscode.commands.executeCommand('Stop-Recorder');
            this._recorderView.updateView();
        }

        // Let the Settings editor write the file now that nothing can cancel the apply.
        const saveManifest = options?.saveManifest;
        const isSaveRequested = saveManifest !== undefined;
        const isSaved = saveManifest === undefined || await saveManifest();

        if (!isSaved) {
            return false;
        }

        // Refresh the global snapshot so every getManifest() consumer sees the new values.
        const currentManifest = Utilities.updateManifest();

        // Avoid tearing down recorder services when the save touched only unrelated settings.
        const isRecorderSettingsChanged = !G4SettingsService.testDeepEqual(
            previousManifest?.settings?.recorderSettings,
            currentManifest?.settings?.recorderSettings);

        if (isRecorderSettingsChanged) {
            // Replace the recorder settings and re-render the panel only when its source settings changed.
            await this.updateRecorders();
        }

        // Sections cached at activation cannot be re-initialized live; offer a reload for those. The
        // prompt also confirms the save: a short-lived "saved" notification closing next to it would
        // take the prompt off the screen, so a click meant for Reload Window would miss it.
        const isReloadRequired = G4SettingsService.testReloadRequired(previousManifest, currentManifest);

        if (isReloadRequired) {
            await this.showReloadPrompt(isSaveRequested);
            return true;
        }

        // Confirm a save that needs no reload with a short notification.
        if (isSaveRequested) {
            showTemporaryInformationMessage('G4 settings saved.');
        }

        return true;
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

        // A missing list and an empty list both mean "no repositories" (older manifests stored null),
        // so switching between them is not a change that needs a reload.
        const isExternalRepositoriesChanged = !G4SettingsService.testDeepEqual(
            previousManifest?.settings?.pluginsSettings?.externalRepositories ?? [],
            currentManifest?.settings?.pluginsSettings?.externalRepositories ?? []);

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
     * settings in place so they take effect on the next window load. After a save the prompt also
     * confirms it, since no separate "saved" notification is shown next to it.
     *
     * @param isSaved - True when the Settings editor just saved, so the prompt starts with the confirmation.
     * @returns A promise that resolves after the user chooses (and any reload is triggered).
     */
    private async showReloadPrompt(isSaved: boolean): Promise<void> {
        const reloadAction = 'Reload Window';
        const laterAction = 'Later';
        const savedText = isSaved ? 'G4 settings saved. ' : '';
        const message = `${savedText}Changes to the G4 server, external repositories, or MCP servers need a `
            + 'window reload to refresh the cache. Reload now?';

        const choice = await vscode.window.showWarningMessage(message, reloadAction, laterAction);

        // Record the answer, so a reload that does not happen can be traced to the prompt or the command.
        Global.logger.information(`Settings reload prompt answered: ${choice ?? 'dismissed'}.`);

        if (choice === reloadAction) {
            await vscode.commands.executeCommand('workbench.action.reloadWindow');
            Global.logger.information('Settings reload prompt: the window reload was requested.');
        }
    }

    /**
     * Prompts to stop an in-progress recording before applying settings.
     *
     * @remarks
     * Owns a modal UI prompt. Returns the user's intent so the caller decides whether to proceed;
     * it does not stop the recording itself. The modal dialog adds its own Cancel button.
     *
     * @returns A promise resolving to true when the user chose to stop and apply.
     */
    private async showStopRecordingPrompt(): Promise<boolean> {
        const stopAction = 'Stop & Apply';
        const message = 'A recording is in progress. Stop it and apply the settings?';

        const choice = await vscode.window.showWarningMessage(
            message,
            { modal: true },
            stopAction);

        return choice === stopAction;
    }

    /**
     * Applies the refreshed recorder settings and re-renders the view.
     *
     * @remarks
     * Owns the recorder re-initialization. The Hub owns recorder connections, so applying settings
     * only replaces the shared service's recorder list (used by the next session) and re-renders the
     * recorder panel.
     *
     * @returns A promise that resolves once the settings are applied and the view re-rendered.
     */
    private async updateRecorders(): Promise<void> {
        // Resolve the recorder endpoints from the refreshed manifest for the next session.
        const options = Utilities.resolveEventsCaptureOptions();
        this._recordingService.updateRecorders(options);

        // Re-render the recorder panel so it reflects the new endpoints and status.
        this._recorderView.updateView();
    }
}
