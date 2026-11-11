# Troubleshooting: Work in the Workflow Editor

[⬅ Back to overview](README.md)

Find your symptom in the first column. Messages are quoted as the extension shows them. A `<name>` in a message stands for text that changes. The last column names the place in the extension source that writes the message (paths are relative to the extension repository).

Jump to a group:

- [Opening a bot](#opening-a-bot)
- [Editing and the toolbox](#editing-and-the-toolbox)
- [Running and reports](#running-and-reports)
- [Logs](#logs)

---

## Opening a bot

| Symptom | Cause | Fix | Source |
| --- | --- | --- | --- |
| Message `The G4 Workflow designer could not be loaded from the G4 Hub at <url>: <reason>`, and an empty canvas tab or a tab that closes | The designer page is downloaded from the Hub each time. The Hub is stopped, the address in `manifest.json` is wrong, or the Hub answered with an error | Start the Hub, check `g4Server` in `manifest.json`, then open the bot again. The reason after the colon names the failure, for example a refused connection | `src/commands/show-workflow.ts:127` |
| Warning `Select a .g4 or .g4bot file under the bots folder.` | **Open as JSON** was run on a file that is not a `.g4` or `.g4bot` file, or that is not under a `bots` folder | Use **Open as JSON** only on `.g4` and `.g4bot` bots under `bots` | `src/extension.ts:175` |
| Warning `Select a JSON bot file under the bots or base.bots folder.` | **Open in Workflow Editor** was run on a file that is not a `.json` file under `bots` or `base.bots` | Use it on a `.json` bot. For a `.g4` bot, double-click it | `src/extension.ts:198` |
| A `.g4` file opens as text, not on the canvas | The file is not under a folder named `bots` below the project folder, so the workflow editor refuses it | Move the file under `bots`, or use **View: Reopen Editor With...** to pick the editor yourself | `src/providers/g4-workflow-custom-editor-provider.ts:69-71` |
| Canvas edits are not in the file | The bot was opened with **Open in Workflow Editor**. That tab holds a copy | Click **Export Definition** to save the bot, or open a `.g4` or `.g4bot` bot, whose edits go into the file | `src/providers/g4-workflow-custom-editor-provider.ts:183` |
| The canvas stays empty after the tab opens, and the Output panel shows `Workflow designer was not ready in time; ready signal skipped.` | The designer was not ready within its wait time, so the bot was never loaded | Close the tab and open the bot again. If it repeats, check that the Hub is healthy and reachable | `src/commands/show-workflow.ts:833` |
| `Could not read file: <reason>` | The extension could not read the bot file | Check that the file still exists and that you can read it, then open it again | `src/commands/show-workflow.ts:1150` |

---

## Editing and the toolbox

| Symptom | Cause | Fix | Source |
| --- | --- | --- | --- |
| Typing in the text does not change the canvas | The text is not valid JSON, so the canvas keeps what it last drew | Fix the JSON. Do not edit on the canvas while the text is invalid, because that replaces the whole text | `src/providers/g4-workflow-custom-editor-provider.ts:101` (newDocumentText), `src/commands/show-workflow.ts:882` |
| A tool you hid with `toolboxesFilter` is still in the toolbox | The entry lacks a non-empty `name` or a true-or-false `enabled`, so it is ignored. Or a more specific tool entry shows it | Check the entry. Remember the order: qualified tool name, bare key, toolbox, then shown | `src/commands/show-workflow.ts:265`, `../g4-services/src/G4.Services.Hub/wwwroot/js/toolboxes-filter.js:268-287` |
| A tool is hidden and you did not hide it | Your filter in the browser cookie or the manifest hides its toolbox | Open the filter panel and check the toolbox. A locked switch with **Set by the project manifest** comes from `manifest.json` | `src/commands/show-workflow.ts:1609` |
| The filter panel says `The filter is too large to save in the browser; turn fewer tools on or off.` | The cookie that keeps the filter would pass 4000 characters | Turn fewer entries off, or put the filter in `manifest.json` | `../g4-services/src/G4.Services.Hub/wwwroot/components/g4-toolboxes-filter/g4-toolboxes-filter.js:31` |
| Changes to `toolboxesFilter` do not appear | The save did not reach the open tab. The log may hold `The designer could not apply the manifest toolboxes filter: <reason>` | Read the reason in the **G4 Extension** channel, fix `manifest.json`, and save it again | `src/commands/show-workflow.ts:1633` |

---

## Running and reports

| Symptom | Cause | Fix | Source |
| --- | --- | --- | --- |
| No report file appears after a run | **Save a Report After Each Run** (`saveReports`) is off | Turn it on in the Settings Editor and save | `src/commands/show-workflow.ts:1068-1074` |
| No report tab opens after a run | **Open the Report Automatically** (`autoView`) is off | Turn it on, or open the saved file from `reports` | `src/commands/show-workflow.ts:1077-1081` |
| `No workspace folder is open. Please open a folder before saving workflow reports.` | A report must be saved to disk, and no folder is open in VS Code | Open your project's `src` folder, then run again | `src/commands/show-workflow.ts:938` |
| `Failed to save report: <reason>` | The extension could not write the report file, for example because of a permission error or a full disk | Fix what the reason names. Check `reportsFolder` too | `src/commands/show-workflow.ts:962` |
| A report opens as one long line of letters and digits | The file is not directly under `reports` below the project folder, so the Report Viewer refuses it. A `reportsFolder` other than `.` does this | Set `reportsFolder` to `.`, or move the file under `reports`. Use **Open With...** and **Text Editor** to look at the text | `src/providers/g4-report-custom-editor-provider.ts:79-82` |
| **Open in Report Viewer** is missing from the menu | The file does not follow the folder rule, or it was created a moment ago and the list is not rebuilt yet | Check the folder. Wait about a second and right-click again | `src/extension.ts:293` |
| Warning `Select a .g4rpt file under the reports folder.` | **Open in Report Viewer** was run on a file outside the rule | Move the file under `reports`, then try again | `src/extension.ts:216` |
| `<file name> is not a readable G4 report.` | The file is not Base64 of a JSON document, for example because it was edited or only half written | Run the bot again to make a new report. Look at the text with **Open With...** and **Text Editor** | `src/providers/g4-report-custom-editor-provider.ts:96` |
| `G4 could not open the report: <reason>` | The report tab could not read its data | Read the reason. Log text in the **G4 Extension** channel starts with `Show-Report could not read the report` | `src/commands/show-report.ts:81` |
| **G4: Open G4 Report** opens an empty report | The command was run without a report to show | Open reports from the Explorer, or run a bot | `src/commands/show-report.ts:282-286` |

---

## Logs

| Symptom | Cause | Fix | Source |
| --- | --- | --- | --- |
| The **G4 Hub** channel is empty | In this version of the extension nothing writes to it | Read **G4 Extension** instead | `src/constants/channels.ts:14` |
| Fewer log entries than expected | `logLevel` is `warning` or `error`, or a source filter hides the logger | Set the **Detail Level** to `information` or `debug`. Check **Source Filter Mode** and **Sources** | `src/logging/logger-base.ts:1030-1085` |
| Log level changed but the output did not | Loggers read the settings when they are created, and most are created at start | Run **Developer: Reload Window** | `src/commands/command-base.ts:43` |
| The Settings Editor logging fields do not change the output log | The Settings Editor writes `clientLogConfiguration`, but the extension reads `clientLogSettings` | Put the section under `clientLogSettings` in `manifest.json` | `src/extensions/utilities.ts:397-401` |
| **G4: Show Event JSON** says there are no events, or the event you want is not in the list | Only the last 50 events are kept, in memory, and nothing survives a restart of VS Code | Run the bot again, then run the command while the event is among the last 50 | `src/services/g4-event-log-service.ts:33` |
| A Hub event in the log shows `{…9 keys}` or `… truncated` instead of its JSON | The log shortens large events, because the Output panel cannot fold | Run **G4: Show Event JSON** to add the part in full, or set **G4: Event Log Detail** to `full` | `src/services/g4-event-log-service.ts:480` |

---

For messages from other parts of G4 Studio, see the [product-level troubleshooting page](../troubleshooting.md).
