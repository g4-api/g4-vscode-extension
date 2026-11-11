# Module 3: Scripts before and after

[⬅ Back to overview](README.md) · [⬅ Module 2](02-start-suspend-resume-and-stop.md)

**Where you are:** Module 3 of 8

⏱️ **About 8 minutes**

A recorder can run a script on your machine before it starts and after it stops. Use a pre-script to open the application or reset test data. Use a post-script to clean up. You can also copy a script into the recorded workflow, so the replay does the same thing.

In this module, you will:

- Add a pre-script and a post-script to a recorder
- Learn what makes a script fail the start
- Use the `G4_RECORDER_*` variables inside a script
- Add a script to the workflow with **Add to Automation Flow**

---

## Step 1: Add a pre-script

1. Open the **Settings Editor** and expand **Automation Recorders**.
2. Open a recorder card and find **Pre-Recording Script**.
3. Turn on **Run a Script Before Recording Starts**.
4. Pick a **Shell** and type the **Script**.

   ![The Pre-Recording Script group of a recorder card](images/03-pre-script.png)

   `TODO(screenshot)`: capture the **Pre-Recording Script** group with the switch on, the **Shell** list, and a one-line script.

| Field | Manifest key | What it does |
| --- | --- | --- |
| **Run a Script Before Recording Starts** | `preScript.enabled` | Runs the script once on this machine before capture begins |
| **Shell** | `preScript.shell` | **PowerShell (Windows)** is `powershell`, **PowerShell 7 (pwsh)** is `pwsh`, **Bash** is `bash`, **Command Prompt (cmd)** is `cmd` |
| **Script** | `preScript.script` | The inline script |
| **Add to Automation Flow** | `preScript.addToAutomationFlow` | Also adds the script to the recorded workflow. See Step 4 |

The post-script group has the same fields under `postScript`, with the switch **Run a Script After Recording Stops**.

---

## Step 2: Know how a script runs

- The script runs on the machine that runs VS Code, with no profile and no prompts.
- G4 waits for it. A script that runs longer than 30 seconds is stopped and counts as failed.
- The script output goes to the **G4 Extension** output channel.

**A pre-script that fails keeps only its own recorder out of the session.** A failure is a non-zero exit code, a timeout, or a shell that cannot start. The warning reads:

```text
Pre-script failed for recorder http://localhost:9955; this recorder will not start.
```

The other recorders still start. When every pre-script fails, no session starts and the warning reads `No recorder started because every pre-script failed.`

**A post-script runs after the session stopped.** If it fails, the workflow still opens. The warning reads:

```text
Post-script failed for recorder http://localhost:9955. See the G4 log for details.
```

A script that is turned off or empty is skipped, and never blocks anything.

---

## Step 3: Use the recorder variables

Your script can read the recorder it belongs to:

| Variable | Value |
| --- | --- |
| `G4_RECORDER_PHASE` | `pre` or `post` |
| `G4_RECORDER_BASE_URL` | The recorder address, for example `http://localhost:9955` |
| `G4_RECORDER_MODE` | The capture mode, or empty |
| `G4_RECORDER_DRIVER` | The recorder driver, for example `UiaDriver` |
| `G4_RECORDER_LABEL` | The **Friendly Name** of the recorder |
| `G4_SESSION_TIMESTAMP` | The time the script started, in ISO format |

A PowerShell pre-script that starts Notepad and waits a moment:

```text
Start-Process notepad.exe; Start-Sleep -Seconds 2
```

---

## Step 4: Add a script to the workflow

Turn on **Add to Automation Flow** to make the recorded workflow run the same script when it is replayed.

| Script | Where the step goes | Step name |
| --- | --- | --- |
| Pre-script | The first step of the recorder's first job | `Pre-Recording Script (<shell>)` |
| Post-script | Just before `CloseBrowser` in the recorder's last job, or at the end of that job when there is none | `Post-Recording Script (<shell>)` |

The step is an `InvokeScript` action. It runs in the driver session on replay, so it only works for drivers that support that shell.

A script is **not** added when:

- **Add to Automation Flow** is off
- The script is empty
- The script contains `}}` or `{{`
- The script contains a space followed by `--` and a word, such as ` --force`

The last two rules exist because the script is carried inside a `{{$ --ScriptBlock:...}}` expression. The Settings Editor shows a notice under the script when it cannot be added.

![A notice under a script that contains double braces](images/03-unsafe-script-notice.png)

`TODO(screenshot)`: capture the notice under a script field that contains `{{`.

> **💡 Tip:** Keep scripts that you want in the flow short, and do not use `--` options in them. Use the pre-script for anything long, with **Add to Automation Flow** off.

---

## ✔ Check your work

- [ ] You added a pre-script and saw its output in the **G4 Extension** channel
- [ ] You know that a failing pre-script keeps only its own recorder out of the session
- [ ] You can name the three things that stop a script from being added to the flow
- [ ] You know where the pre-script and the post-script step land in the workflow

---

**Next up** 👉 [Module 4: Why VS Code never appears](04-why-vs-code-never-appears.md)
