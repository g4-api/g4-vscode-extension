# Module 1: What an autonomous run is

[⬅ Back to overview](README.md)

**Where you are:** Module 1 of 8

⏱️ **About 4 minutes**

Before you set anything up, it helps to know who does what. In an autonomous run, an **agent** drives the application and **G4 records** what the agent does. This module shows the moving parts and what you get at the end.

In this module, you will:

- Learn who does what during a run
- Open the Autonomous Exploratory Run dialog
- See what a finished run leaves behind

---

## Step 1: Meet the parts

A run has four parts:

| Part | What it does |
| --- | --- |
| **You** | Pick the recorders and the agent, and write the prompt |
| **The extension** | Prepares a run folder, starts the agent, follows its output, and closes the run |
| **The agent** | Plans the scenarios, looks at the screen, clicks and types, and reports a result for each scenario |
| **The G4 Hub** | Runs every recording and turns it into a flow |

The agent never calls the Hub directly. The extension copies a small helper script, `g4-recorder.ps1`, into the run folder. The agent calls that script to plan a scenario, start its recording, stop it, and report its result. The script keeps a ledger file, `scenarios.json`, so the extension can show progress. Module 8 describes the helper in detail.

> **📝 Note:** The extension itself never records anything. If the agent leaves a recording open when the run ends, the extension stops it through the Hub so no recorder stays reserved, and marks that scenario `aborted`.

---

## Step 2: Open the dialog

You can open the Autonomous Exploratory Run dialog two ways:

1. In the **G4 view** in the Activity Bar, click **Start Autonomous Exploratory Run**.
2. Or press **`Ctrl` + `Shift` + `P`** and run **G4: Start Autonomous Exploratory Run**.

   ![The G4 view with the Start Autonomous Exploratory Run button](images/01-open-the-dialog.png)

   `TODO(screenshot)`: capture the G4 view with the **Start Autonomous Exploratory Run** button visible.

A tab named **G4 Autonomous Run** opens, and the dialog **Autonomous Exploratory Run** opens straight away with the run form. If you close the dialog, an **Open Run Dialog** button stays on the tab so you can open it again.

> **💡 Tip:** Only one tab is open at a time. Running the command again brings the open tab to the front.

---

## Step 3: See what you get

Every run writes a new folder under your project, named after the time the run started, for example `20261108-143005`. By default these folders live in `autonomous-runs`, inside the first folder of your workspace. Inside you find:

- One folder per scenario, with the recorded `flow.json`
- `final-message.md`, the agent's own summary
- `events.jsonl`, the agent's raw output
- `run.json`, a summary of the run

Module 6 lists every file.

When the run ends, the dialog shows a **result view** with one of four outcomes: **completed**, **failed**, **stopped**, or **timed out**. Each scenario is listed with its recording state, its result, and an **Open Flow** button when a flow was saved.

---

## ✔ Check your work

- [ ] You can name the four parts of a run and what each one does
- [ ] You opened the **Autonomous Exploratory Run** dialog
- [ ] You know that each run gets its own folder inside `autonomous-runs` by default

---

**Next up** 👉 [Module 2: Configure a harness](02-configure-a-harness.md)
