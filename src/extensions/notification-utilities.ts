import * as vscode from 'vscode';

import { setTimeout } from 'node:timers/promises';

// Keeps transient success and lifecycle notices visible long enough to be read without lingering.
const INFORMATION_MESSAGE_TIMEOUT_MILLISECONDS = 5000;

/**
 * Shows an individually scoped information notification that closes after five seconds.
 *
 * @remarks
 * VS Code does not expose a timeout or disposable for `showInformationMessage`. A notification
 * progress item is used instead because resolving its task closes only this information notice;
 * warning and error notifications remain open until the user explicitly dismisses them. The
 * progress promise is intentionally not returned so callers retain their existing non-blocking
 * behavior.
 *
 * @param message - The information text shown to the user.
 */
export function showTemporaryInformationMessage(message: string): void {
    // Keep the notification alive for the configured reading window, then resolve its private
    // progress task so VS Code dismisses this notification without touching other messages.
    void vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: message,
            cancellable: false
        },
        () => setTimeout(INFORMATION_MESSAGE_TIMEOUT_MILLISECONDS)
    );
}
