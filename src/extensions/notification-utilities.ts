import * as vscode from 'vscode';

import { setTimeout } from 'node:timers/promises';

// Keeps transient success and lifecycle notices visible long enough to be read without lingering.
const INFORMATION_MESSAGE_TIMEOUT_MILLISECONDS = 5000;

// Global state key of the notices waiting for the next window load.
const PENDING_NOTICES_KEY = 'g4.pendingNotices';

/**
 * Stores a notice to show after the next window load.
 *
 * @remarks
 * New-Project opens the created folder right away, which reloads the window and discards any open
 * notification. A notice stored here is shown by `showPendingNotices` when the extension activates
 * in the new window, and it stays in the notification centre until dismissed.
 *
 * @param context - Extension context whose global state holds the notices.
 * @param message - The notice text.
 * @returns A promise that resolves once the notice is stored.
 */
export async function addPendingNotice(context: vscode.ExtensionContext, message: string): Promise<void> {
    // Append to any notice still waiting, so one load shows them all.
    const notices = context.globalState.get<string[]>(PENDING_NOTICES_KEY) ?? [];

    await context.globalState.update(PENDING_NOTICES_KEY, [...notices, message]);
}

/**
 * Shows and clears the notices stored for this window load.
 *
 * @remarks
 * Called once at activation. The notices are cleared before they are shown, so a reload while one
 * is open does not show it twice.
 *
 * @param context - Extension context whose global state holds the notices.
 * @returns A promise that resolves once the notices are cleared.
 */
export async function showPendingNotices(context: vscode.ExtensionContext): Promise<void> {
    // Take the waiting notices and clear them first.
    const notices = context.globalState.get<string[]>(PENDING_NOTICES_KEY) ?? [];

    if (notices.length === 0) {
        return;
    }

    await context.globalState.update(PENDING_NOTICES_KEY, undefined);

    // Show each as a regular notification, which stays in the notification centre.
    for (const notice of notices) {
        void vscode.window.showInformationMessage(notice);
    }
}

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
