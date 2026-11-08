# Troubleshooting: G4 Studio

[⬅ Back to the learning paths](g4-learning.md)

Find the message you see, then read the cause, the check and the fix. Messages are quoted as G4 Studio shows them. A word in capitals, such as `REASON`, stands for text that changes.

Each learning path also has its own troubleshooting page. When a path already explains a message in full, the card here points to it.

Jump to a group:

- [Projects and settings](#projects-and-settings)
- [Bots, reports and the workflow editor](#bots-reports-and-the-workflow-editor)
- [Publishing flows and templates](#publishing-flows-and-templates)
- [Environments, templates and the cache](#environments-templates-and-the-cache)
- [Recording and autonomous runs](#recording-and-autonomous-runs)
- [Messages inside forms](#messages-inside-forms)

---

## Projects and settings

### No G4 sandbox was auto-detected. Please browse to it

**Cause:** Create a New G4 Project looks for the newest local sandbox and found none.

**Check:** Is the sandbox deployed on this machine? See [Quick Start, Module 1](quick-start/01-deploy-the-sandbox.md).

**Fix:** Browse to the sandbox folder in the picker that opens next. To change it later, see [Quick Start, Module 11](quick-start/11-change-your-sandbox.md).

**Source:** `src/commands/new-project.ts:1109`

### This folder already holds a G4 project

**Cause:** The folder you picked already has `src\manifest.json`. The dialog offers to open the existing project or overwrite it.

**Check:** Read the dialog text before you choose. Overwrite replaces the generated files.

**Fix:** Choose **Open Existing Project** to keep your work, **Overwrite Project** to replace it, or pick an empty folder. See [Quick Start, Module 4](quick-start/04-create-your-first-project.md).

**Source:** `src/commands/new-project.ts:1200`

### No G4 Sandbox was auto-detected. Browse manually for the G4 Sandbox

**Cause:** **Auto-Detect** in the Settings Editor looks for the newest local sandbox and found none.

**Check:** Is a sandbox deployed on this machine?

**Fix:** Use the browse control next to the **G4 Sandbox** field and pick the folder.

**Source:** `src/commands/show-settings.ts:295`

### Restore factory settings?

**Cause:** You clicked **Restore Factory Settings**. A factory reset clears the license token and the sandbox path, so G4 asks first.

**Check:** Do you want to lose the token and the sandbox path?

**Fix:** Choose **Restore Factory Settings** only if you do. Choose Cancel to keep your settings.

**Source:** `src/commands/show-settings.ts:275`

### manifest.json changed outside the G4 Settings editor after it was loaded

**Cause:** The file on disk differs from what the Settings Editor loaded. Another editor or a tool changed it.

**Check:** Open `manifest.json` as text and compare it with the form.

**Fix:** Choose **Reload Settings** to show the file's values, or **Overwrite** to save the form over the file. Cancel leaves the form as it is and writes nothing.

**Source:** `src/commands/show-settings.ts:367`

### Could not save G4 settings: REASON

**Cause:** The manifest could not be written. The reason names the problem, for example a permission error.

**Check:** Can you write to `src\manifest.json`? Is the file open and locked by another program?

**Fix:** Fix the cause named after the colon, then save again.

**Source:** `src/commands/show-settings.ts:398`

### Open a G4 project folder before saving settings

**Cause:** No folder is open in VS Code, so there is no manifest to write.

**Check:** Does the Explorer show a project folder?

**Fix:** Open the project folder (**File** > **Open Folder**), then save again.

**Source:** `src/commands/show-settings.ts:420`

### Could not apply G4 settings: REASON

**Cause:** The save worked but Apply Settings failed. The reason names the step.

**Check:** Read the **G4 Extension** output channel for the logged error. See [Work in the Workflow Editor, Module 6](work-in-the-workflow-editor/06-logs.md).

**Fix:** Fix the cause, then save again.

**Source:** `src/commands/show-settings.ts:433`

### A recording is in progress. Stop it and apply the settings?

**Cause:** Applying settings re-reads the recorder settings, which would break a running session.

**Check:** Is the **G4 Recorder** panel showing **Stop**?

**Fix:** Choose **Stop & Apply** to end the recording and apply. Cancel writes nothing, so the file and the applied settings never disagree.

**Source:** `src/services/g4-settings-service.ts:238`

### G4 Hub URL is not set

The full message reads: `G4 Hub URL is not set. Please configure the "g4Server" settings in your manifest and reload the extension to connect to the G4 Hub API.`

**Cause:** The manifest has no usable `g4Server` address.

**Check:** Open the Settings Editor and look at the **Connection** section. See [Configure `manifest.json`, Module 2](configure-manifest/02-connect-to-the-engine.md).

**Fix:** Set the address, save, and reload the window.

**Source:** `src/constants/global.ts:232`

### Changes to the G4 server, external repositories, or MCP servers need a window reload to refresh the cache

**Cause:** These settings are read when the extension starts.

**Check:** Did you save a change to one of the three areas?

**Fix:** Choose **Reload Window**. **Later** keeps the old cache until you reload yourself. See [Plugins, Externals, and MCP, Module 4](plugins-externals-and-mcp/04-sync-cache-and-the-restart.md).

**Source:** `src/services/g4-settings-service.ts:214`

### A warning appears right after the window restarts

**Cause:** The sync found a problem, then restarted the extension host. G4 keeps the warning and shows it again on the next start.

**Check:** Read the warning text. It names the server or repository.

**Fix:** See [Plugins, Externals, and MCP, Module 5](plugins-externals-and-mcp/05-deferred-warnings.md).

**Source:** `src/extensions/notification-utilities.ts:76`

---

## Bots, reports and the workflow editor

### Select a .g4 or .g4bot file under the bots folder

**Cause:** **Open as JSON** ran on a file that is not a `.g4` or `.g4bot` file under `bots`.

**Check:** Look at the file extension and its folder.

**Fix:** Use **Open as JSON** only on those bots. See [Work in the Workflow Editor, Module 1](work-in-the-workflow-editor/01-open-a-bot-three-ways.md).

**Source:** `src/extension.ts:175`

### Select a JSON bot file under the bots or base.bots folder

**Cause:** **Open in Workflow Editor** ran on something other than a `.json` bot under `bots` or `base.bots`.

**Check:** Is the file a `.json` bot in one of those folders?

**Fix:** Right-click a `.json` bot. For a `.g4` bot, double-click it.

**Source:** `src/extension.ts:198`

### Select a .g4rpt file under the reports folder

**Cause:** **Open in Report Viewer** ran on a file that is not a report, or one outside the reports folder.

**Check:** The viewer opens files whose first folder under the workspace folder is `reports`.

**Fix:** Right-click a `.g4rpt` file inside `reports`. See [Work in the Workflow Editor, Module 5](work-in-the-workflow-editor/05-reports.md).

**Source:** `src/extension.ts:216`

### The G4 Workflow designer could not be loaded from the G4 Hub at URL: REASON

**Cause:** The designer page is downloaded from the Hub each time. The Hub is stopped, or the address is wrong.

**Check:** Open the URL in a browser. Check `g4Server` in `manifest.json`.

**Fix:** Start the Hub, correct the address, and open the bot again.

**Source:** `src/commands/show-workflow.ts:131`

### G4 could not open the report: REASON

**Cause:** The report file could not be read or decoded.

**Check:** Does the file still exist? Was it edited by hand?

**Fix:** Run the bot again to make a new report, or restore the file.

**Source:** `src/commands/show-report.ts:81`

### FILE is not a readable G4 report

**Cause:** The report viewer could not decode the file. A report is Base64 text of the engine response.

**Check:** Open the file as text. It should be one long Base64 line.

**Fix:** Run the bot again, or restore the file.

**Source:** `src/providers/g4-report-custom-editor-provider.ts:96`

### No workspace folder is open. Please open a folder before saving workflow reports

**Cause:** A run finished in the designer, but reports are saved to disk and no folder is open.

**Check:** Does the Explorer show a folder?

**Fix:** Open the project folder and run again.

**Source:** `src/commands/show-workflow.ts:937`

### Failed to save report: REASON

**Cause:** The report folder or file could not be written.

**Check:** Can you create files in `<reportsFolder>\reports`?

**Fix:** Fix the cause named after the colon, or change `reportsFolder`. See [Configure `manifest.json`, Module 6](configure-manifest/06-control-your-output.md).

**Source:** `src/commands/show-workflow.ts:961`

### No markdown content on this item

**Cause:** The item you clicked in the **Documentations** view holds no document.

**Check:** Does the item have a document under it?

**Fix:** Pick another item, or run **G4: Fetch latest documents version & refresh documentation**.

**Source:** `src/providers/g4-documents-tree-provider.ts:648`

---

## Publishing flows and templates

### Select a JSON bot file under the bots folder

**Cause:** **Open in Flow Publisher** ran on a file that is not a `.json` file under `bots`.

**Check:** Look at the file extension and its folder.

**Fix:** Right-click a `.json` bot under `bots`. See [Publish a Flow, Module 1](publish-a-flow/01-open-the-flow-publisher.md).

**Source:** `src/commands/update-flow.ts:142`

### Select a JSON file under the templates or bots folder

**Cause:** **Open in Template Publisher** ran on a file outside `templates` and `bots`.

**Check:** Look at the file's folder.

**Fix:** Right-click a `.json` file in one of those folders. See [Publish a Template, Module 1](publish-a-template/01-open-the-template-publisher.md).

**Source:** `src/commands/update-template-publisher.ts:165`

### Flow 'NAME' has parameter warnings. Publish anyway?

**Cause:** The flow publishes, but a parameter looks unused or wrong.

**Check:** Read the list in the dialog.

**Fix:** Choose **Publish Anyway**, or cancel and fix the parameters. See [Publish a Flow troubleshooting](publish-a-flow/troubleshooting.md).

**Source:** `src/commands/update-flow.ts:269`

### Template 'NAME' has token warnings. Publish anyway?

**Cause:** The template publishes, but a property token looks unused or wrong.

**Check:** Read the list in the dialog.

**Fix:** Choose **Publish Anyway**, or cancel and fix the tokens. See [Publish a Template troubleshooting](publish-a-template/troubleshooting.md).

**Source:** `src/commands/update-template-publisher.ts:394`

### bots/FILE changed after this publisher tab opened

**Cause:** The bot file was edited after the Flow Publisher tab loaded it. Publishing might lose those edits.

**Check:** Open the file and see what changed.

**Fix:** Choose **Publish and Overwrite** to publish the tab's copy, or **Reload from File** to rebuild the tab from the file. Cancel unlocks the page without publishing.

**Source:** `src/commands/update-flow.ts:730`

### A publish failure with a Show Log button

**Cause:** Publishing failed. The warning shows the Hub's reason.

**Check:** Click **Show Log** to open the **G4 Extension** output channel.

**Fix:** Fix the cause. See the [Publish a Flow](publish-a-flow/troubleshooting.md) or [Publish a Template](publish-a-template/troubleshooting.md) page for the common ones.

**Source:** `src/commands/update-flow.ts:771`, `src/commands/update-template-publisher.ts:1176`

---

## Environments, templates and the cache

### Could not update N of M environment(s)

**Cause:** The upload of one or more environment files failed. The message lists each failure with its reason.

**Check:** Is the Hub running? Is each file valid JSON or `KEY=value` lines?

**Fix:** See [Environments and Parameters troubleshooting](environments-and-parameters/troubleshooting.md).

**Source:** `src/commands/update-environment.ts:115`

### Could not update N of M template(s)

**Cause:** The upload of one or more template files failed. The message lists each failure.

**Check:** Is each file valid JSON? Is the Hub running?

**Fix:** Fix the files named in the message, then run **G4: Update or Create Template Definitions** again. See [Publish a Template, Module 7](publish-a-template/07-bulk-upload-with-update-template.md).

**Source:** `src/commands/update-template.ts:115`

### Templates were stored, but the G4 tool sync failed: REASON

**Cause:** The templates reached the Hub, but the refresh of the Hub's tools failed.

**Check:** Is the Hub still running?

**Fix:** Run **G4: Synchronize G4 Cache with Configured Externals and MCP Servers**. See [Plugins, Externals, and MCP troubleshooting](plugins-externals-and-mcp/troubleshooting.md).

**Source:** `src/commands/update-template.ts:144`

---

## Recording and autonomous runs

These messages are explained in full in [Record an App troubleshooting](record-an-app/troubleshooting.md) and [Autonomous Exploratory Run troubleshooting](autonomous-run/troubleshooting.md).

| Message | What it means | Where it is explained | Source |
| --- | --- | --- | --- |
| A recording session is already running. Stop it before starting a new one | A second Start was refused | [Record an App](record-an-app/troubleshooting.md) | `src/commands/start-recorder.ts:168` |
| No recorder is enabled. Enable a recorder in the G4 settings first | Recording has no recorder to start | [Record an App](record-an-app/troubleshooting.md) | `src/commands/start-recorder.ts:176` |
| No recorder started because every pre-script failed | Each recorder's pre-script failed | [Record an App](record-an-app/troubleshooting.md) | `src/commands/start-recorder.ts:187` |
| Pre-script failed for recorder ADDRESS; this recorder will not start | One recorder was skipped | [Record an App](record-an-app/troubleshooting.md) | `src/commands/start-recorder.ts:237` |
| Recorder ADDRESS did not start: REASON | The Hub could not start that recorder | [Record an App](record-an-app/troubleshooting.md) | `src/commands/start-recorder.ts:282` |
| A recorder is already recording in another session: REASON | The recorder is reserved by another client | [Record an App](record-an-app/troubleshooting.md) | `src/commands/start-recorder.ts:375` |
| Failed to start recording: REASON | The Hub refused the start | [Record an App](record-an-app/troubleshooting.md) | `src/commands/start-recorder.ts:375` |
| Failed to stop recording: REASON | The stop failed; the session may remain | [Record an App](record-an-app/troubleshooting.md) | `src/commands/stop-recorder.ts:121` |
| Post-script failed for recorder ADDRESS. See the G4 log for details | A post-script failed after the stop | [Record an App](record-an-app/troubleshooting.md) | `src/commands/stop-recorder.ts:192` |
| Failed to ACTION recorder ADDRESS: REASON | Suspend or resume failed for one recorder | [Record an App](record-an-app/troubleshooting.md) | `src/providers/g4-recorder-webview-view-provider.ts:1049` |
| Sandbox start messages from the recorder sandbox service | A recorder service did not start from the sandbox | [Record an App](record-an-app/troubleshooting.md) | `src/commands/start-recorder.ts:334` |
| G4 autonomous run: REASON | An autonomous run could not start or end | [Autonomous Exploratory Run](autonomous-run/troubleshooting.md) | `src/commands/show-autonomous.ts:464` |

---

## Messages inside forms

These appear inside a tab, not as a VS Code notification.

### Invalid JSON - REASON

**Cause:** A JSON box holds text that does not parse, or parses to the wrong shape (an object where an array is expected, or the other way round). The text after the dash is the parser's reason, followed by a hint.

**Check:** Look for a missing comma, a missing quote or an extra bracket near the position the reason names.

**Fix:** Correct the text. An empty box is valid.

**Source:** `resources.components/g4-json-textarea/g4-json-textarea.js:69`

### Fix N field(s) before publishing

**Cause:** The Flow Publisher or Template Publisher found fields that are not valid, and it does not send anything to the Hub until they are fixed.

**Check:** Look for fields marked in red.

**Fix:** Correct each field, then press **Publish** again. See [Publish a Flow, Module 6](publish-a-flow/06-publish-your-flow.md) and [Publish a Template, Module 6](publish-a-template/06-publish-your-template.md).

**Source:** `resources.components/automation-flow-publisher/automation-flow-publisher.js:1192`, `resources.components/automation-template-publisher/automation-template-publisher.js:1566`

---

## Still stuck?

Open the **G4 Extension** output channel and raise the log level. See [Configure `manifest.json`, Module 5](configure-manifest/05-see-whats-happening.md). For ready-made solutions to common jobs, see the [recipes](recipes.md).
