# Module 6: The run folder

[⬅ Back to overview](README.md) · [⬅ Module 5](05-start-and-watch-a-run.md)

**Where you are:** Module 6 of 8

⏱️ **About 5 minutes**

Every run writes into its own folder. Knowing what each file is lets you check what the agent was told, read what it did, and find the flows it recorded. This module lists every file the extension and the helper write, and shows the shape of the three JSON files.

In this module, you will:

- Find the run folder of a run
- Learn what each file holds and who writes it
- Read the ledger and the run summary

---

## Step 1: Find the run folder

The folder is `<runs folder>\yyyyMMdd-HHmmss`, built from the local time the run started. The runs folder is `autonomous-runs` unless you changed **Runs Folder** in the settings, and it is resolved against the first folder of your workspace. If two runs start in the same second, the second gets a counter, for example `20261108-143005-2`.

To open it, click **Open Run Folder** on the result view. The folder opens in your file manager.

![The result view with the Open Run Folder button](images/06-open-run-folder.png)

`TODO(screenshot)`: capture the result view with the **Open Run Folder** button.

---

## Step 2: Know the files

A harness-only session (**Record Scenarios** off) writes only `brief.md`, `run.json`, the agent output files (`events.jsonl`, `stderr.log`), and the agent's final message; it has no request file, helper, ledger, or scenario folders.

Here is a finished run folder of a recording run:

```text
autonomous-runs/
  20261108-143005/
    brief.md
    recording-request.json
    g4-recorder.ps1
    scenarios.json
    run.json
    events.jsonl
    stderr.log
    final-message.md
    scenarios/
      01-create-a-purchase-order/
        flow.json
      02-search-for-an-order/
        flow.json
```

| File | Written by | When | What it holds |
| --- | --- | --- | --- |
| `brief.md` | Extension | Before the agent starts | The full instructions the agent receives. See Module 4 |
| `recording-request.json` | Extension | Before the agent starts | The Hub address and the recording request: the picked recorders, and this VS Code excluded from recording. It never holds your token |
| `g4-recorder.ps1` | Extension | Before the agent starts | A copy of the recorder helper. See Module 8 |
| `scenarios.json` | Extension first, then the helper | Empty at the start, updated after every helper call | The ledger: one entry per scenario |
| `run.json` | Extension | At the start, and again when the run ends | The state of the run, and at the end the exit code and the scenario totals |
| `events.jsonl` | Extension | While the agent runs | The raw output of the agent, one line per line it printed. The console is built from it |
| `stderr.log` | Extension | While the agent runs | The error output of the agent |
| `final-message.md` | Extension, or Codex | When the run ends | The agent's final answer. For Claude Code the extension writes it from the final result. Codex writes the file itself. An OpenCode run reports no final text, so this file is not created |
| `scenarios/NN-name/flow.json` | Helper | When a recording is stopped | The recorded flow of one scenario, saved byte for byte as the Hub returned it |

The scenario folder name is the scenario number, two digits, then the scenario name in lower case: letters and digits only, other characters folded into single hyphens, at most 40 characters. A name with no letters or digits becomes `scenario`.

> **📝 Note:** You may see `scenarios.json.tmp` for a moment. Both the extension and the helper write the ledger to a temporary file first and then swap it in, so a reader never sees half a file.

---

## Step 3: Read the ledger

`scenarios.json` has a `version` and a list of scenarios. Each scenario has these fields:

| Field | Meaning |
| --- | --- |
| `index` | The scenario number, from 1 |
| `name` | The name the agent gave it |
| `folder` | The scenario folder, relative to the run folder |
| `recording` | `planned`, `recording`, `saved`, `empty`, `failed`, or `aborted` |
| `result` | `pending`, `passed`, `failed`, or `skipped` |
| `note` | The note the agent gave with its result |
| `error` | Why recording failed or was aborted. Empty otherwise |
| `flowPath` | The saved flow, relative to the run folder. Empty when none was saved |
| `ruleCount` | The number of actions in the saved flow |
| `sessionId` | The Hub session of the latest recording |
| `startedAt`, `stoppedAt` | When the latest recording started and stopped, as ISO times |

```json
{
    "scenarios": [
        {
            "error": "",
            "flowPath": "scenarios/01-create-a-purchase-order/flow.json",
            "folder": "scenarios/01-create-a-purchase-order",
            "index": 1,
            "name": "Create a purchase order",
            "note": "Order created with one line item.",
            "recording": "saved",
            "result": "passed",
            "ruleCount": 14,
            "sessionId": "0f3c2d7e-5a41-4b8e-9d3a-6b1f7c8e2a10",
            "startedAt": "2026-11-08T12:31:02.1480000Z",
            "stoppedAt": "2026-11-08T12:32:40.7710000Z"
        }
    ],
    "version": 1
}
```

---

## Step 4: Read the run summary

`run.json` is written once when the run starts, with the state at that moment, and again when it ends. The final file holds the state plus `exitCode` and `scenarios` totals:

```json
{
    "effort": "high",
    "finishedAt": "2026-11-08T12:41:15.002Z",
    "harnessName": "Claude (sandbox)",
    "isSandbox": true,
    "message": "The agent finished: 2 of 3 scenario flows saved.",
    "model": "claude-fable-5-1",
    "outcome": "completed",
    "phase": "finished",
    "recorderNames": [
        "machine-a (UiaDriver)"
    ],
    "runFolder": "autonomous-runs/20261108-143005",
    "sessionId": "9a1b2c3d-0000-4000-8000-000000000000",
    "startedAt": "2026-11-08T12:30:05.114Z",
    "toolServers": [
        {
            "name": "g4",
            "status": "connected"
        }
    ],
    "exitCode": 0,
    "scenarios": {
        "failed": 0,
        "passed": 2,
        "saved": 2,
        "total": 3
    }
}
```

In the real file, `runFolder` is the full path. `outcome` is one of `completed`, `failed`, `stopped`, or `timedOut`.

---

## Step 5: Look at the request file

`recording-request.json` shows exactly what the helper sends to the Hub. It is shortened here:

```json
{
    "hubUrl": "http://localhost:9944",
    "request": {
        "excludedProcessIds": [
            12040,
            15216
        ],
        "excludedWindowTitles": [
            "Extension Development Host"
        ],
        "recorders": [
            {
                "baseUrl": "http://localhost:9955",
                "driverParameters": {
                    "driver": "UiaDriver"
                },
                "enabled": true,
                "mode": "standard",
                "useOffset": false
            }
        ]
    }
}
```

The process ids belong to this VS Code window, so your own clicks in it never enter a flow. The file also carries the `thinkTimeSettings` of each recorder when your settings define them.

---

## ✔ Check your work

- [ ] You opened the run folder of a finished run
- [ ] You found `brief.md`, `scenarios.json`, `run.json`, and the `scenarios` folder
- [ ] You can tell which files the extension wrote and which the helper wrote
- [ ] `run.json` shows the outcome and the scenario totals

---

**Next up** 👉 [Module 7: Replay and publish a scenario](07-replay-and-publish-a-scenario.md)
