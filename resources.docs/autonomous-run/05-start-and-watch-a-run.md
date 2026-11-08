# Module 5: Start and watch a run

[⬅ Back to overview](README.md) · [⬅ Module 4](04-choose-recorders-and-write-the-brief.md)

**Where you are:** Module 5 of 8

⏱️ **About 8 minutes**

Everything is ready. In this module you start the agent, read the running view, use the console tools, stop a run, and read the result. A run keeps going when you close the tab, so you do not have to watch it.

In this module, you will:

- Start a run
- Read the running view
- Use the console and its tools
- Stop a run, or let it finish
- Read the result view

---

## Step 1: Start the run

1. In the run form, check the recorders, the harness, the model, the effort, and the prompt.
2. Click **Start**.

   ![The run form with Start enabled](images/05-click-start.png)

   `TODO(screenshot)`: capture the completed run form with the **Start** button enabled.

While the extension checks everything and prepares the run folder, **Start** is disabled and the note beside it reads **Starting...** If a check fails, the form comes back with a red notice that says why. See the troubleshooting page for each message.

When the run starts, the dialog switches to the **running view** and the status line reads **The agent is running.** until the agent reports its first step.

---

## Step 2: Read the running view

The running view shows a robot animation, and under it:

| Part | What it shows |
| --- | --- |
| **Status line** | The agent's latest step. Before the first step it shows the run's own message, and before that **Starting the agent...** |
| **Harness**, **Model**, **Reasoning**, **Recorders** | What you picked for this run |
| **Elapsed** | The time since the run started, as `mm:ss`. Minutes keep counting past 59 |
| **Scenarios** | The scenarios the agent plans, each with its recording state and its result, and a count such as `2 of 3 recorded` |
| **Console** | The agent's steps, one line each |

![The running view with the scenarios and the console](images/05-running-view.png)

`TODO(screenshot)`: capture the running view with at least one scenario and several console lines.

Each scenario shows two badges:

| Badge | Values |
| --- | --- |
| Recording state | `planned`, `recording`, `saved`, `empty`, `failed`, `aborted` |
| Result | `pending`, `passed`, `failed`, `skipped` |

A scenario gets an **Open Flow** button as soon as its flow is saved. The ledger is read every second, so the list follows the agent closely.

---

## Step 3: Use the console

The console shows one line per agent event, with the time it arrived. The line kinds are `ready`, `text`, `tool`, `error`, and `result`. Long lines are cut to 400 characters, and the console keeps the latest 200 lines. The full text is the tooltip of each line.

The buttons in the console header:

| Button | What it does |
| --- | --- |
| **Latest** | Appears when you scroll up. It jumps to the newest line and follows new lines again |
| Wrap | Wraps long lines instead of cutting them |
| Clear | Clears the console. The transcript still keeps every line |
| Copy | Copies the console lines to the clipboard. The status bar says **G4: Autonomous run console copied.** for three seconds |
| Transcript | Opens `events.jsonl`, the agent's raw output, in the editor |

---

## Step 4: Stop the run, or let it end

Click **Stop** to end the agent. G4 ends the agent's whole process tree, because a launcher starts the real tool as a grandchild, and the tool starts its own shells. The **Stop** button reads **Stopping...** Then the run closes like any other run: a recording the agent left open is stopped through the Hub and saved, and that scenario is marked `aborted`.

A run also ends when:

- The agent finishes. The outcome is **completed** when the agent exits with code 0 and its final result is not an error.
- The time limit is reached. The agent is stopped and the outcome is **timed out**. The default limit is 60 minutes.
- The agent fails or cannot start. The outcome is **failed**, and the message gives the reason.
- A required tool server is missing in a Claude Code run. The outcome is **failed**.

> **📝 Note:** Closing the tab does not stop the run. Run the command again to open a tab that shows it. Reloading the VS Code window ends the agent, because the agent belongs to the extension host.

---

## Step 5: Read the result view

When the run ends, the dialog shows the **result view**:

![The result view with the outcome and the scenario flows](images/05-result-view.png)

`TODO(screenshot)`: capture the result view of a completed run with two saved flows.

- A notice with the outcome, for example `The agent finished: 2 of 3 scenario flows saved.`
- The facts: **Harness**, **Model**, **Scenarios**, and **Elapsed**
- The scenario list with an **Open Flow** button for each saved flow
- The console, still open
- Buttons: **Open Run Folder**, **Summary** (`final-message.md`), **Brief** (`brief.md`), **Transcript** (`events.jsonl`), and **New Run**

**New Run** goes back to the form with your last choices. Only one run can run at a time.

---

## ✔ Check your work

- [ ] You started a run and saw the running view with its status line
- [ ] The scenario list filled in as the agent planned and recorded
- [ ] You used at least one console button
- [ ] The run ended and the result view shows an outcome and your scenarios

---

**Next up** 👉 [Module 6: The run folder](06-the-run-folder.md)
