import * as vscode from 'vscode';

import { setTimeout } from 'node:timers/promises';

import type { Logger } from '../logging/logger';

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
    // Store the notice as information, the severity every notice had before warnings existed.
    await addNotice(context, { message, severity: 'information' });
}

/**
 * Stores a warning to show, and to write to the G4 Extension log, after the next activation.
 *
 * @remarks
 * Sync-Cache and template uploads restart the extension host right after they finish, which closes
 * open notifications and starts a new, empty output channel. A warning stored here survives that
 * restart: `showPendingNotices` shows it and logs it in the new channel.
 *
 * @param context - Extension context whose global state holds the notices.
 * @param message - The warning text.
 * @returns A promise that resolves once the warning is stored.
 */
export async function addPendingWarning(context: vscode.ExtensionContext, message: string): Promise<void> {
    // Store the warning next to any notice still waiting, so one activation shows them all.
    await addNotice(context, { message, severity: 'warning' });
}

/**
 * Shows and clears the notices stored for this window load.
 *
 * @remarks
 * Called once at activation. The notices are cleared before they are shown, so a reload while one
 * is open does not show it twice. A warning is also written to the log, because the output channel
 * of the previous extension host is gone. A notice stored as plain text by an earlier version is an
 * information notice.
 *
 * @param context - Extension context whose global state holds the notices.
 * @param logger - Logger that records the warnings; when absent they are only shown.
 * @returns A promise that resolves once the notices are cleared.
 */
export async function showPendingNotices(context: vscode.ExtensionContext, logger?: Logger): Promise<void> {
    // Take the waiting notices and clear them first.
    const notices = context.globalState.get<StoredNotice[]>(PENDING_NOTICES_KEY) ?? [];

    if (notices.length === 0) {
        return;
    }

    await context.globalState.update(PENDING_NOTICES_KEY, undefined);

    // Show each notice with its severity; both kinds stay in the notification centre.
    for (const storedNotice of notices) {
        const notice = convertToPendingNotice(storedNotice);

        if (notice.severity === 'warning') {
            logger?.warning(notice.message);
            void vscode.window.showWarningMessage(notice.message);
            continue;
        }

        void vscode.window.showInformationMessage(notice.message);
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

/**
 * Appends one notice to the notices waiting for the next activation.
 *
 * @param context - Extension context whose global state holds the notices.
 * @param notice - The notice to store.
 * @returns A promise that resolves once the notice is stored.
 */
async function addNotice(context: vscode.ExtensionContext, notice: PendingNotice): Promise<void> {
    // Append to any notice still waiting, so one load shows them all.
    const notices = context.globalState.get<StoredNotice[]>(PENDING_NOTICES_KEY) ?? [];

    await context.globalState.update(PENDING_NOTICES_KEY, [...notices, notice]);
}

/**
 * Reads one stored notice, accepting the plain text an earlier version stored.
 *
 * @remarks
 * Compute-only. Plain text becomes an information notice, as it was shown before; an object keeps
 * its severity, and anything unexpected falls back to information with its text.
 *
 * @param storedNotice - The notice as global state returned it.
 * @returns The notice with its severity.
 */
function convertToPendingNotice(storedNotice: StoredNotice): PendingNotice {
    // An earlier version stored only the text, which was always shown as information.
    if (typeof storedNotice === 'string') {
        return { message: storedNotice, severity: 'information' };
    }

    // Keep a stored warning a warning; any other value is information.
    const message = typeof storedNotice?.message === 'string' ? storedNotice.message : '';
    const severity = storedNotice?.severity === 'warning' ? 'warning' : 'information';

    return { message, severity };
}

// Compile-time contracts stay after the executable code: interfaces come before type aliases, and a
// caller precedes the declarations it depends on before A-Z order resumes.

/**
 * A notice waiting in global state for the next activation.
 */
interface PendingNotice {
    /** The text to show. */
    message: string;

    /** How the notice is shown; a warning is also written to the log. */
    severity: NoticeSeverity;
}

/**
 * How a pending notice is shown.
 */
type NoticeSeverity = 'information' | 'warning';

/**
 * A pending notice as global state holds it: an object, or plain text stored by an earlier version.
 */
type StoredNotice = PendingNotice | string;
