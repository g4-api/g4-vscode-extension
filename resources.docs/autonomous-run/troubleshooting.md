# Troubleshooting: Autonomous Exploratory Run

[⬅ Back to overview](README.md)

Every message this feature can show has a card here. Find the message in the run form, the console, the result view, the VS Code notification, the helper output, or the **G4 Extension** output channel, then follow the card.

Each card has the same four parts: the cause, how to check it, the fix, and where the message comes from in the extension source (paths are relative to the extension repository).

Jump to a group:

- [Messages in a VS Code notification](#messages-in-a-vs-code-notification)
- [Messages when you press Start](#messages-when-you-press-start)
- [Notices in the run form](#notices-in-the-run-form)
- [Harness entries that are skipped](#harness-entries-that-are-skipped)
- [Messages while and after the run](#messages-while-and-after-the-run)
- [Scenario errors](#scenario-errors)
- [Output channel lines](#output-channel-lines)
- [Messages from the recorder helper](#messages-from-the-recorder-helper)

---

## Messages in a VS Code notification

### G4 autonomous run: REASON

- **Cause:** A request from the run page failed in the extension, for example opening a file or starting the Settings Editor. The notification is `G4 autonomous run: ` followed by the reason. It is the only autonomous message shown as a VS Code error notification.
- **Check:** Open the **G4 Extension** output channel. The same reason is logged as `Autonomous run page request failed: REASON`.
- **Fix:** Fix what the reason names, then repeat the action on the page.
- **Source:** `src/commands/show-autonomous.ts:458-465`

---

## Messages when you press Start

These messages come back to the run form as a red notice. Nothing is written to disk when one of them appears, except for the last two cards of this group.

### An autonomous run is already running

- **Cause:** A run is starting, running, or stopping. Only one run can run at a time.
- **Check:** Look at the running view, or open the tab again with **G4: Start Autonomous Exploratory Run**.
- **Fix:** Wait for the run to end, or click **Stop**, then start the new run.
- **Source:** `src/services/g4-autonomous-run-service.ts:723`

### A manual recording is running. Stop it before starting an autonomous run

- **Cause:** A recording started from the G4 Recorder panel is still open. It holds the same recorders the agent needs.
- **Check:** Open the G4 Recorder panel and look at the recorder light.
- **Fix:** Stop the manual recording, then click **Start** again.
- **Source:** `src/services/g4-autonomous-run-service.ts:727`

### The harness "NAME" is not configured in the G4 settings

- **Cause:** The harness you picked is no longer in `settings.autonomousSettings.harnesses`, for example because it was renamed or removed after the form opened.
- **Check:** Open the **Autonomous Runs** section of the Settings Editor.
- **Fix:** Add or rename the harness, click **Save**, click the refresh button next to **Harness**, and pick it again.
- **Source:** `src/services/g4-autonomous-run-service.ts:732`

### The model "MODEL" is not offered by the harness "NAME"

- **Cause:** The harness has a **Models** list and the model you picked is not in it.
- **Check:** Open the harness card and look at **Models**.
- **Fix:** Pick a model from the list, or add the model to the list and refresh the form.
- **Source:** `src/services/g4-autonomous-run-service.ts:739`

### The effort "EFFORT" is not offered by the harness "NAME"

- **Cause:** The harness has a **Reasoning Efforts** list and the effort you picked is not in it.
- **Check:** Open the harness card and look at **Reasoning Efforts**.
- **Fix:** Pick an effort from the list, or add it to the list and refresh the form.
- **Source:** `src/services/g4-autonomous-run-service.ts:743`

### Pick at least one recorder that is configured in the G4 settings

- **Cause:** None of the recorders you switched on exists in `settings.recorderSettings.recorders` any more.
- **Check:** Open the **Recorders** section of the Settings Editor.
- **Fix:** Add or restore the recorder, click **Save**, refresh the form, and switch it on.
- **Source:** `src/services/g4-autonomous-run-service.ts:748`

### Describe what the agent should explore and record

- **Cause:** The **Prompt** is empty or only spaces.
- **Check:** Look at the **Prompt** field.
- **Fix:** Write the scenarios you want recorded. Module 4 has an example.
- **Source:** `src/services/g4-autonomous-run-service.ts:752`

### Open a G4 project folder before starting an autonomous run

- **Cause:** No workspace folder is open, so the extension has nowhere to create the run folder.
- **Check:** Look at the Explorer. It should show your project.
- **Fix:** Use **File** then **Open Folder** to open your G4 project, then start again.
- **Source:** `src/services/g4-autonomous-run-service.ts:756`

### The G4 Hub does not answer at URL. Start the Hub, then start the run again

- **Cause:** The extension pings the Hub before it starts the agent, and the ping at `/api/v4/g4/ping` failed. The URL is the address of your G4 server, or `http://localhost:9944` when the manifest names none.
- **Check:** Open `URL/api/v4/g4/ping` in a browser. It should answer.
- **Fix:** Start the Hub, or fix the G4 server address in `manifest.json`, then click **Start** again.
- **Source:** `src/services/g4-autonomous-run-service.ts:271`

### The run could not start: REASON

- **Cause:** The run folder was created, but something failed before the agent began. The run is closed as **failed**, and the same text appears in the result view. Common reasons are a launcher argument that cannot be passed safely, a missing partition launcher file, or a sandbox recorder that did not start.
- **Check:** Read the reason after the colon. Open the **G4 Extension** output channel for the same line.
- **Fix:** Fix the reason, then start a new run. The failed run's folder stays on disk.
- **Source:** `src/services/g4-autonomous-run-service.ts:315`

### The argument "VALUE" holds a character a launcher cannot pass on safely

- **Cause:** The harness executable is a `.cmd` or `.bat` launcher, and its path or one of its arguments contains a double quote, a percent sign, a line break, a null character, or ends with a backslash. `cmd.exe` would expand or misread it. It appears inside `The run could not start: ...`.
- **Check:** Look at **Launcher or Executable** and **Extra Arguments** on the harness card.
- **Fix:** Remove the character. For a path, drop a trailing backslash.
- **Source:** `src/services/g4-autonomous-process.ts:76-84`

---

## Notices in the run form

### Recording is turned off. Turn on Recorders in the Settings Editor, or switch off Record Scenarios to run the agent only

- **Cause:** `settings.recorderSettings.enabled` is `false` while **Record Scenarios** is on. The **Recorders** field is disabled, and the note beside **Start** reads `Recording is turned off in the settings. Switch off Record Scenarios to run the agent only.`
- **Check:** Open the **Recorders** section of the Settings Editor.
- **Fix:** Turn recorders on, click **Save**, and refresh the form. The notice has an **Open Settings** button. To run the agent without recording, switch off **Record Scenarios**.
- **Source:** `resources.components/automation-autonomous/automation-autonomous.js:1362` and `:892`

### No recorders are configured. Add one under Recorders in the Settings Editor, or switch off Record Scenarios

- **Cause:** `settings.recorderSettings.recorders` is empty while **Record Scenarios** is on. The note beside **Start** reads `No recorders are configured. Switch off Record Scenarios to run the agent only.`
- **Check:** Open the **Recorders** section of the Settings Editor.
- **Fix:** Add a recorder, click **Save**, and refresh the form, or switch off **Record Scenarios**.
- **Source:** `resources.components/automation-autonomous/automation-autonomous.js:1373` and `:896`

### No harness is configured. Add Claude Code, Codex, or OpenCode under Autonomous Runs in the Settings Editor

- **Cause:** No usable harness exists. The note beside **Start** reads `No harness is configured.`
- **Check:** Open **Autonomous Runs** in the Settings Editor. Skipped entries are explained in the next group.
- **Fix:** Add a harness (Module 2), click **Save**, and refresh the form.
- **Source:** `resources.components/automation-autonomous/automation-autonomous.js:1382` and `:900`

### Switch on at least one recorder, or switch off Record Scenarios

- **Cause:** **Record Scenarios** is on and every recorder in the **Recorders** field is switched off. This is the note beside **Start**, and **Start** is disabled.
- **Check:** Open the **Recorders** drop-down.
- **Fix:** Switch on the recorders the agent may use, or switch off **Record Scenarios** to run the agent only.
- **Source:** `resources.components/automation-autonomous/automation-autonomous.js:904`

### Write a prompt for the agent

- **Cause:** The **Prompt** is empty. This is the note beside **Start**, and **Start** is disabled.
- **Check:** Look at the **Prompt** field.
- **Fix:** Describe the scenarios to record.
- **Source:** `resources.components/automation-autonomous/automation-autonomous.js:908`

---

## Harness entries that are skipped

These notices appear in the run form when `settings.autonomousSettings.harnesses` has an entry that cannot run. The entry is left out of the **Harness** list.

### Harness N is not an object and was skipped

- **Cause:** Entry number N (counting from 1) is not a JSON object, for example a string or a number.
- **Check:** Open `manifest.json` and look at the `harnesses` list.
- **Fix:** Replace the entry with a harness object, or add it again in the Settings Editor.
- **Source:** `src/services/g4-autonomous-settings.ts:189`

### Harness N has an unknown type "TYPE"; use claude, codex, or opencode

- **Cause:** The `type` of entry N is not one of the three tools. The comparison ignores case and spaces at the ends.
- **Check:** Look at the **Tool** field of the harness card.
- **Fix:** Choose **Claude Code**, **Codex**, or **OpenCode**.
- **Source:** `src/services/g4-autonomous-settings.ts:197`

### Harness "NAME" has no executable and was skipped

- **Cause:** The `executable` of the harness is empty.
- **Check:** Look at **Launcher or Executable** on the harness card.
- **Fix:** Enter the path or command that starts the tool.
- **Source:** `src/services/g4-autonomous-settings.ts:205`

### Harness "NAME" is listed more than once; only the first entry is used

- **Cause:** Two harnesses have the same name. The later ones are dropped, so the form's choice stays unambiguous.
- **Check:** Look for duplicate names in the **Harnesses** list.
- **Fix:** Rename or remove the duplicate.
- **Source:** `src/services/g4-autonomous-settings.ts:103`

---

## Messages while and after the run

### Agent ready. This harness does not report its tools

- **Cause:** This is information, not an error. Codex and OpenCode do not report their tools at the start, so G4 cannot count them or check tool servers. If you listed required servers, the line adds `The required tool servers (...) cannot be checked.`
- **Check:** Look at the first console line.
- **Fix:** Nothing is needed. Use Claude Code if you need the check.
- **Source:** `src/services/g4-autonomous-run-service.ts:375-378`

### The agent's required tool server "NAME" (STATUS) did not connect

- **Cause:** A server listed in **Required Tool Servers** was not `connected` when a Claude Code run started. The status is what the agent reported, such as `failed`, `needs-auth`, `pending`, or `not configured` when the agent has no such server. With several servers the text reads `The agent's required tool servers ... did not connect`. It ends with `Start it (for example the G4 Hub or the recorder), then run again.` (`Start them` for several servers.)
- **Check:** Read the first console line. It lists every tool server and its status.
- **Fix:** Start the server or sign in to it, then start a new run. Check the spelling of the name in **Required Tool Servers**.
- **Source:** `src/services/g4-autonomous-run-service.ts:399-410`

### Stopping the agent: a required tool server is missing

- **Cause:** This is the status the extension sets while it stops the agent because of the problem in the previous card. The run then ends as **failed**.
- **Check:** Read the outcome notice in the result view.
- **Fix:** See the previous card.
- **Source:** `src/services/g4-autonomous-run-service.ts:414`

### Failed to start "EXECUTABLE": REASON

- **Cause:** The operating system could not start the harness executable, for example because the file does not exist or is not allowed to run. The run ends as **failed** with `The run failed (Failed to start "EXECUTABLE": REASON): 0 of 0 scenario flows saved.`
- **Check:** Run the executable in a terminal, or check the path on the harness card.
- **Fix:** Correct the path, or install the tool, then start a new run.
- **Source:** `src/services/g4-autonomous-process.ts:133`

### The run failed (REASON): X of Y scenario flows saved

- **Cause:** The agent exited with an error, or it exited with a code other than 0. REASON is the first of these that exists: the agent's own failed result, its last error event, the last line it wrote to standard error, or `the agent exited with code CODE`.
- **Check:** Read the last `error` lines in the console, then `stderr.log` and `events.jsonl` in the run folder.
- **Fix:** Fix what the reason names. The flows that were saved are still usable.
- **Source:** `src/services/g4-autonomous-run-service.ts:689` and `:624`

### The run reached its time limit and was stopped: X of Y scenario flows saved

- **Cause:** The run took longer than its **Time Limit (minutes)**, so the agent was stopped. A run has a limit only when one was set in the run dialog.
- **Check:** Look at **Elapsed** and **Time Limit** on the running view, and at **Time Limit** in the **Autonomous Runs** section, which the dialog starts from.
- **Fix:** Ask for fewer scenarios per run, raise the limit, or leave it empty for no limit.
- **Source:** `src/services/g4-autonomous-run-service.ts:677`

### The run was stopped: X of Y scenario flows saved

- **Cause:** You clicked **Stop**.
- **Check:** Nothing to check. Any open recording was stopped and saved.
- **Fix:** Start a new run for the scenarios that are missing.
- **Source:** `src/services/g4-autonomous-run-service.ts:674`

---

## Scenario errors

These texts appear under a scenario name, as its `error`.

### The run ended while this scenario was recording; the extension stopped the recording

- **Cause:** The agent ended, was stopped, or failed while a recording was open. The extension stopped the recording through the Hub so no recorder stays reserved, and saved what it captured. The scenario is marked `aborted`.
- **Check:** Open the flow if there is one. It holds the actions recorded before the end.
- **Fix:** Review the flow, then record the scenario again if it is incomplete.
- **Source:** `src/services/g4-autonomous-run-service.ts:515`

### The run ended while this scenario was recording, and the recording could not be stopped: REASON

- **Cause:** As above, but the Hub could not stop the recording, for example because it lost the session or was not reachable.
- **Check:** Check that the Hub is running, and read the reason.
- **Fix:** Start the Hub again. Record the scenario again in a new run.
- **Source:** `src/services/g4-autonomous-run-service.ts:527`

---

## Output channel lines

These lines are written to the **G4 Extension** output channel only.

### Autonomous run: could not close open recordings: REASON

- **Cause:** The extension tried to stop recordings the agent left open and the attempt failed as a whole, for example because the ledger could not be written.
- **Check:** Open the Recorder panel and look for a recorder that stays reserved.
- **Fix:** Fix the reason, then stop the recording from the Recorder panel if one is still open.
- **Source:** `src/services/g4-autonomous-run-service.ts:559`

### Autonomous run page could not re-read the manifest: REASON

- **Cause:** After `manifest.json` changed, the page could not read it again. The page keeps the harnesses and recorders it had.
- **Check:** Open `manifest.json` and look for invalid JSON.
- **Fix:** Fix the file, then click the refresh button next to **Harness**.
- **Source:** `src/commands/show-autonomous.ts:422`

### Autonomous run: a listener failed: REASON

- **Cause:** A part of the page that listens for run changes raised an error. Other listeners and the run are not affected.
- **Check:** Close and reopen the tab.
- **Fix:** If it repeats, report the reason.
- **Source:** `src/services/g4-autonomous-run-service.ts:872`

---

## Messages from the recorder helper

The agent sees these lines when it calls `g4-recorder.ps1`. The exit code is in brackets. You see them in the console as tool results, in `events.jsonl`, or when you run the helper by hand.

### Scenario 'NAME' is still recording. Stop it before starting another

- **Cause:** The agent called `start` while another recording was open. Only one recording can be open at a time. Exit code 1.
- **Check:** Run `-Action status` and look for a scenario with `recording: recording`.
- **Fix:** Call `-Action stop`, then `start` again.
- **Source:** `resources.autonomous/g4-recorder.ps1:646`

### Recording did not start for 'NAME'

- **Cause:** The Hub refused or failed the start request. The Hub's own explanation follows. The scenario is marked `failed` with that text as its `error`. Exit code 2.
- **Check:** Read the text after the message. A conflict often means another session holds a recorder.
- **Fix:** Fix the reason, then call `start` again. The scenario is already planned.
- **Source:** `resources.autonomous/g4-recorder.ps1:684`

### Warning: recorder URL did not start: REASON

- **Cause:** The recording started, but one recorder could not connect. The session still records with the others. Exit code 0.
- **Check:** Open the recorder panel and check that recorder.
- **Fix:** If you need that recorder, stop the recording, fix the recorder, and record the scenario again.
- **Source:** `resources.autonomous/g4-recorder.ps1:702`

### No scenario is recording

- **Cause:** The agent called `stop` and no scenario is recording. Exit code 1.
- **Check:** Run `-Action status`.
- **Fix:** None needed if the scenario was already stopped.
- **Source:** `resources.autonomous/g4-recorder.ps1:740`

### Scenario 'NAME' is recording, not 'OTHER'

- **Cause:** The agent called `stop` for a different scenario than the one that is recording. The message continues with `Stop 'NAME' first.` Exit code 1.
- **Check:** Run `-Action status`.
- **Fix:** Stop the scenario that is recording, or call `stop` without `-Scenario`.
- **Source:** `resources.autonomous/g4-recorder.ps1:746`

### Recording of 'NAME' could not be stopped yet; run stop again

- **Cause:** The Hub was not reachable or answered with a server error. The recording may still be running, so the scenario stays open. Exit code 2.
- **Check:** Check that the Hub is running.
- **Fix:** Call `-Action stop` again.
- **Source:** `resources.autonomous/g4-recorder.ps1:762`

### Recording of 'NAME' could not be stopped

- **Cause:** The Hub answered with a status other than success, for example because it lost the session. The scenario is closed as `failed` and cannot be stopped again. Exit code 2.
- **Check:** Read the Hub's explanation after the message.
- **Fix:** Record the scenario again with `start`.
- **Source:** `resources.autonomous/g4-recorder.ps1:783`

### Recording of 'NAME' stopped, but it captured no actions; no flow was saved

- **Cause:** The recording was empty, so the Hub answered 204. The scenario is marked `empty`. Exit code 0.
- **Check:** Check that the recorders are connected and that the agent really did something between `start` and `stop`.
- **Fix:** Record the scenario again.
- **Source:** `resources.autonomous/g4-recorder.ps1:773`

### The G4 Hub could not be reached: REASON

- **Cause:** The helper got no answer from the Hub within 120 seconds, or the connection failed. Exit code 2. It appears inside the messages of the start and stop cards above.
- **Check:** Open the `/api/v4/g4/ping` address of the Hub in a browser.
- **Fix:** Start the Hub, then call the helper again.
- **Source:** `resources.autonomous/g4-recorder.ps1:222`

### The G4 Hub answered CODE: REASON

- **Cause:** The Hub answered with an error. The reason is the problem detail or title the Hub sent, or its raw text. Exit code 2.
- **Check:** Read the reason. Look at the Hub's own log for more.
- **Fix:** Fix what the reason names.
- **Source:** `resources.autonomous/g4-recorder.ps1:244`

### Scenario 'NAME' is not planned

- **Cause:** The agent called `result` for a scenario that was never planned or started. Exit code 1.
- **Check:** Run `-Action status` and compare the names.
- **Fix:** Call `plan` or `start` first, or fix the spelling.
- **Source:** `resources.autonomous/g4-recorder.ps1:871`

### The ACTION action needs -Scenario

- **Cause:** `plan`, `start`, or `result` was called without a scenario name, or with only spaces. Exit code 1.
- **Check:** Look at the command.
- **Fix:** Add `-Scenario "NAME"`.
- **Source:** `resources.autonomous/g4-recorder.ps1:831`

### The run folder is not usable: REASON

- **Cause:** The helper could not read a file it needs, or a file holds something invalid. Exit code 1. The next three cards are the specific reasons.
- **Check:** Make sure the helper is in the run folder, next to `recording-request.json`.
- **Fix:** Fix the reason. Do not move `g4-recorder.ps1` out of its run folder.
- **Source:** `resources.autonomous/g4-recorder.ps1:889`

### recording-request.json has no hubUrl or no request

- **Cause:** The request file is missing either property, for example after a hand edit.
- **Check:** Open `recording-request.json` and compare it with the sample in Module 6.
- **Fix:** Restore both properties, or start a new run.
- **Source:** `resources.autonomous/g4-recorder.ps1:552`

### The G4_AUTONOMOUS_AUTHENTICATION environment variable is not valid JSON

- **Cause:** The variable is set, but its value does not parse as JSON. The message never prints the value, because it would show your token.
- **Check:** In your terminal, print only the length of the variable, not its value.
- **Fix:** Set it to JSON such as `{"token":"<your-g4-token>"}`. In a normal run the extension sets it for you.
- **Source:** `resources.autonomous/g4-recorder.ps1:566`

### The scenario folder 'FOLDER' is outside the run folder

- **Cause:** The ledger was edited by hand and a scenario `folder` climbs out of the run folder. The helper refuses to write there.
- **Check:** Open `scenarios.json` and look at the `folder` values.
- **Fix:** Use a folder like `scenarios/01-name`, or start a new run.
- **Source:** `resources.autonomous/g4-recorder.ps1:374`

---

**Back to** 👉 [the overview](README.md)

---

For messages from other parts of G4 Studio, see the [product-level troubleshooting page](../troubleshooting.md).
