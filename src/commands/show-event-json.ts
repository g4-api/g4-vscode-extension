/**
 * Command that shows the JSON of a recent Hub event, in full, in the extension log.
 *
 * The log writes each event as a numbered summary and a shortened view of its JSON, because the Output panel cannot
 * fold and an event can be very large. This command is how a reader drills in without leaving the log: it lists the
 * recent events, then the parts of the chosen event that the log shortened, and adds the chosen part to the end of
 * the log in full. Each part can be copied instead. Nothing is written to disk and no editor tab opens.
 *
 * RESOURCES:
 * VS Code quick pick API reference: https://code.visualstudio.com/api/references/vscode-api#QuickPick
 */
import * as vscode from 'vscode';

import { CommandBase } from './command-base';

import { Channels } from '../constants/channels';
import { Logger } from '../logging/logger';
import { G4BrandingService } from '../services/g4-branding-service';
import { G4EventLogService } from '../services/g4-event-log-service';

import type { EventPart, EventRecord } from '../services/g4-event-log-service';

// The tooltip of the copy button on each part.
const COPY_TOOLTIP = 'Copy JSON';

// The time format of the event list: 12:04:31.
const TIME_FORMAT: Intl.DateTimeFormatOptions = { hour: '2-digit', hour12: false, minute: '2-digit', second: '2-digit' };

/**
 * The Show-EventJson command: drills into one of the last events the extension log wrote.
 *
 * @remarks
 * The events and their masked values come from G4EventLogService; this command only lets the reader choose and
 * writes or copies the choice.
 */
export class ShowEventJsonCommand extends CommandBase {
    /** Logger the chosen parts are written with. */
    private readonly _logger: Logger;

    /**
     * Creates a new ShowEventJsonCommand instance.
     *
     * @param context The VS Code extension context used to manage disposables.
     */
    constructor(context: vscode.ExtensionContext) {
        // Initialize the command base infrastructure.
        super(context);

        // Write the chosen parts under their own logger name, so they read apart from the events.
        this._logger = this.logger?.newLogger('G4.EventJson');

        // Set the VS Code command identifier.
        this.command = 'Show-EventJson';
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
     * Lets the reader pick a recent event and a part of it, then writes that part to the log or copies it.
     *
     * @remarks
     * Two short lists open in turn at the top of the window and close as soon as a choice is made, so the focus
     * returns to where it was. A written part is shown in the log without taking the focus.
     *
     * @returns A promise that resolves when the reader has chosen or dismissed the lists.
     */
    protected async onInvokeCommand(): Promise<void> {
        // Without kept events there is nothing to pick from.
        const records = G4EventLogService.getEvents();

        if (records.length === 0) {
            const message = G4BrandingService.getText('No {hub} events yet. Events appear here once a run sends them.');

            void vscode.window.showInformationMessage(message);

            return;
        }

        // Let the reader pick an event, newest first.
        const record = await ShowEventJsonCommand.selectRecord(records);

        if (!record) {
            return;
        }

        // Then a part of it: the whole event, or one the log shortened.
        const selection = await ShowEventJsonCommand.selectPart(record);

        if (!selection) {
            return;
        }

        // Copy the part, or add it to the end of the log and show the log without taking the focus.
        if (selection.isCopy) {
            const value = G4EventLogService.getPartValue(record.value, selection.part.path);
            const text = typeof value === 'string'
                ? value
                : JSON.stringify(value, null, 2) ?? '';

            await vscode.env.clipboard.writeText(text);
            vscode.window.setStatusBarMessage(`Copied the JSON of event #${record.number}.`, 3000);

            return;
        }

        G4EventLogService.writePart({ logger: this._logger, part: selection.part, record });
        Channels.extension.show(true);
    }

    /**
     * Lets the reader pick a part of an event: the whole event first, then each part the log shortened.
     *
     * @remarks
     * Picking a part writes it; the copy button on a part copies it instead.
     *
     * @param record - The event.
     * @returns The chosen part and whether to copy it, or undefined when the list was dismissed.
     */
    private static async selectPart(record: EventRecord): Promise<PartSelection | undefined> {
        // List the whole event, then the shortened parts, each with its size and a copy button.
        const copyButton: vscode.QuickInputButton = { iconPath: new vscode.ThemeIcon('copy'), tooltip: COPY_TOOLTIP };
        const wholeEvent: EventPart = {
            path: [],
            sizeText: G4EventLogService.convertToSizeText(G4EventLogService.getSize(record.value))
        };
        const parts = [wholeEvent, ...G4EventLogService.getCollapsedParts(record.value)];
        const items: PartItem[] = parts.map(part => ({
            buttons: [copyButton],
            description: part.sizeText,
            label: part.path.length === 0
                ? '(whole event)'
                : G4EventLogService.getPathText(part.path),
            part
        }));

        const quickPick = vscode.window.createQuickPick<PartItem>();

        quickPick.items = items;
        quickPick.matchOnDescription = true;
        quickPick.placeholder = `Event #${record.number}: pick a part to add to the log in full, or copy it`;
        quickPick.title = `#${record.number} ${record.summary}`;

        // Settle on the first choice: a pick writes, the copy button copies, and closing the list chooses nothing.
        const selection = await new Promise<PartSelection | undefined>(resolve => {
            quickPick.onDidAccept(() => {
                const [item] = quickPick.selectedItems;

                resolve(item ? { isCopy: false, part: item.part } : undefined);
                quickPick.hide();
            });

            quickPick.onDidTriggerItemButton(event => {
                resolve({ isCopy: true, part: event.item.part });
                quickPick.hide();
            });

            quickPick.onDidHide(() => resolve(undefined));
            quickPick.show();
        });

        // The list is done with once a choice is made.
        quickPick.dispose();

        return selection;
    }

    /**
     * Lets the reader pick one of the kept events.
     *
     * @param records - The kept events, newest first.
     * @returns The chosen event, or undefined when the list was dismissed.
     */
    private static async selectRecord(records: EventRecord[]): Promise<EventRecord | undefined> {
        // Show each event as the log names it, with the time it arrived; typing filters on any of it.
        const items: RecordItem[] = records.map(record => ({
            description: record.timestamp.toLocaleTimeString('en-GB', TIME_FORMAT),
            label: `#${record.number}  ${record.summary}`,
            record
        }));

        const item = await vscode.window.showQuickPick(items, {
            matchOnDescription: true,
            placeHolder: 'Pick an event to show its JSON (the number is the one in the log)'
        });

        return item?.record;
    }
}

// Contracts are kept after the executable code. Interfaces come before type aliases; within each group a contract
// comes before the contracts only it depends on, and the rest sort A-Z.

/**
 * A part in the parts list.
 */
interface PartItem extends vscode.QuickPickItem {
    /** The part the item stands for. */
    part: EventPart;
}

/**
 * The reader's choice in the parts list.
 */
interface PartSelection {
    /** True when the copy button was used; false when the part was picked to be written. */
    isCopy: boolean;

    /** The chosen part. */
    part: EventPart;
}

/**
 * An event in the events list.
 */
interface RecordItem extends vscode.QuickPickItem {
    /** The event the item stands for. */
    record: EventRecord;
}
