# Module 8: The recorder helper reference

[⬅ Back to overview](README.md) · [⬅ Module 7](07-replay-and-publish-a-scenario.md)

**Where you are:** Module 8 of 8

⏱️ **About 4 minutes**

The agent never talks to the G4 Hub itself. It calls `g4-recorder.ps1`, a script the extension copies into every run folder. This page is the reference for that script: its actions, its parameters, its exit codes, and the environment variables a run uses. You only need it when you debug a run or want to try the helper by hand.

In this module, you will:

- Look up the five actions
- Read the exit codes
- Know what the helper reads and writes
- Run the helper yourself

---

## Step 1: The actions

The helper runs in Windows PowerShell 5.1 or `pwsh`. The `-Action` parameter is required and takes one of five values:

| Action | Needs `-Scenario` | What it does |
| --- | --- | --- |
| `plan` | Yes | Adds the scenario to the ledger. Does nothing when a scenario of that name is already planned |
| `start` | Yes | Starts a Hub recording for the scenario, planning it first when it is not planned. Returns once the recorders record |
| `stop` | Optional | Stops the open recording and saves its flow into the scenario folder. When `-Scenario` is given, it must be the scenario that is recording |
| `result` | Yes | Records the `-Status` and optional `-Note` of the scenario |
| `status` | No | Prints every scenario with its recording state and result |

Scenario names are compared without regard to case. Only one recording can be open at a time, because the recorders capture the whole desktop.

---

## Step 2: The parameters

| Parameter | Used by | Values | Default |
| --- | --- | --- | --- |
| `-Action` | All | `plan`, `start`, `stop`, `result`, `status` | None. Required |
| `-Scenario` | `plan`, `start`, `result`, optionally `stop` | The scenario name, for example `"Create purchase order"` | Empty |
| `-Status` | `result` | `passed`, `failed`, `skipped` | `passed` |
| `-Note` | `result` | A short note, for example why a scenario failed | Empty |

---

## Step 3: The exit codes

| Code | Meaning | What the agent should do |
| --- | --- | --- |
| `0` | Success | Go on |
| `1` | The call does not fit the current state, or the run folder is not usable. The message says why | Fix the call. For example, stop the open recording before starting another |
| `2` | The G4 Hub failed the request | Read the message, then retry once or skip the scenario |

The helper prints one readable line per outcome. It also never prints a stack trace for an unusable run folder. The troubleshooting page lists each message.

---

## Step 4: What the helper reads and writes

The helper works only inside the folder that holds the script, which is the run folder.

| Item | Kind | Used for |
| --- | --- | --- |
| `recording-request.json` | File, read | The Hub address (`hubUrl`) and the recording request (`request`). Both are required |
| `scenarios.json` | File, read and written | The ledger. It is written to a temporary file and swapped in, so a reader never sees half a file |
| `scenarios/NN-name/flow.json` | File, written | The flow of a stopped recording |
| `G4_AUTONOMOUS_AUTHENTICATION` | Environment variable, read | Your G4 authentication as JSON. The extension sets it for the agent's process only. It is never written to disk and never printed. A value that is not valid JSON is reported without its text |
| `G4_AUTONOMOUS_RUN_FOLDER` | Environment variable, set by the extension | The absolute path of the run folder, available to the agent's process |

The helper calls the Hub at these routes:

| Action | Route |
| --- | --- |
| `start` | `POST {hubUrl}/api/v4/g4/recordings` |
| `stop` | `POST {hubUrl}/api/v4/g4/recordings/{sessionId}/stop` |

Each request waits up to 120 seconds, because starting waits for every recorder to connect, and stopping flushes the recorders and converts the flow. A Hub that does not answer in that time counts as unreachable.

How `stop` treats the Hub's answer:

| Hub answer | Result | Scenario recording state |
| --- | --- | --- |
| Not reachable, or a server error (500 and above) | Exit code 2. The scenario stays open, so `stop` can be run again | `recording` |
| 204, an empty recording | Exit code 0. No flow is saved | `empty` |
| 200 | Exit code 0. The flow is saved to `flow.json` | `saved` |
| Any other answer | Exit code 2. The Hub lost the session, so the scenario is closed | `failed` |

For `start`, a Hub answer of 200 or 201 that carries a session id marks the scenario `recording`. Any other answer marks it `failed` and keeps the Hub's explanation in the scenario's `error`.

---

## Step 5: Try it by hand

Open a terminal in a run folder and run the helper. Set `G4_AUTONOMOUS_AUTHENTICATION` first if your Hub needs a token:

```powershell
$env:G4_AUTONOMOUS_AUTHENTICATION = '{"token":"<your-g4-token>"}'
powershell -NoProfile -ExecutionPolicy Bypass -File .\g4-recorder.ps1 -Action plan -Scenario "Create purchase order"
powershell -NoProfile -ExecutionPolicy Bypass -File .\g4-recorder.ps1 -Action status
```

The second command prints a line like `1. Create purchase order - recording: planned, result: pending`.

> **📝 Note:** Do not start a hand recording in a run folder while the agent is working in it. Both would change the same ledger, and only one recording can be open.

---

## ✔ Check your work

- [ ] You can name the five actions and which ones need `-Scenario`
- [ ] You know what exit codes 0, 1, and 2 mean
- [ ] You know that the token reaches the helper only through `G4_AUTONOMOUS_AUTHENTICATION`
- [ ] You ran `-Action status` in a run folder

---

**Back to** 👉 [the overview](README.md) or the [troubleshooting page](troubleshooting.md)
