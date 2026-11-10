# Module 2: Configure a harness

[⬅ Back to overview](README.md) · [⬅ Module 1](01-what-an-autonomous-run-is.md)

**Where you are:** Module 2 of 8

⏱️ **About 8 minutes**

A **harness** tells G4 which agent tool to start and where it lives. Until you add one, the run form has nothing to start. In this module you add a harness in the Settings Editor, choose between a sandbox launcher and a plain executable, and learn which launcher arguments G4 refuses.

In this module, you will:

- Open the **Autonomous Runs** section of the Settings Editor
- Add a harness for Claude Code, Codex, or OpenCode
- Choose a sandbox launcher or an executable on your machine
- Set the run folder and the time limit

---

## Step 1: Open the Autonomous Runs section

1. In the Explorer, right-click `manifest.json` and choose **Open Settings Editor**.
2. Scroll to the section **Autonomous Runs**.

   ![The Autonomous Runs section of the Settings Editor](images/02-autonomous-runs-section.png)

   `TODO(screenshot)`: capture the **Autonomous Runs** section with **Runs Folder**, **Time Limit**, and the **Harnesses** list.

The section starts with two fields:

| Field | Manifest key | Default | What it does |
| --- | --- | --- | --- |
| **Runs Folder** | `settings.autonomousSettings.runsFolder` | `autonomous-runs` | Where each run gets its own folder. Relative to the workspace, or an absolute path |
| **Time Limit** | `settings.autonomousSettings.timeoutMinutes` | empty (no limit) | The agent is stopped when a run takes longer than this many minutes. The run dialog starts from this value |

> **📝 Note:** An empty time limit, or one that is not a number above zero, means no limit: the agent runs until it ends or you press **Stop**. A limit above 35791 minutes (about 24 days) is cut to 35791.

---

## Step 2: Add a harness

1. Under **Harnesses**, click **+ Add Harness**.
2. Fill in the card that appears:

   | Field | Manifest key | What to enter |
   | --- | --- | --- |
   | **Name** | `name` | The label shown in the run form, for example `Claude (sandbox)`. Must be unique |
   | **Tool** | `type` | **Claude Code** (`claude`), **Codex** (`codex`), or **OpenCode** (`opencode`) |
   | **Launcher or Executable** | `executable` | The path or command that starts the tool. See Step 3 |

   ![A harness card with name, tool, and executable](images/02-harness-card.png)

   `TODO(screenshot)`: capture an open harness card with the **Name**, **Tool**, and **Launcher or Executable** fields filled in.

3. Click **Save**.

The same harness in `manifest.json` looks like this:

```json
{
    "settings": {
        "autonomousSettings": {
            "harnesses": [
                {
                    "arguments": [],
                    "efforts": [],
                    "executable": "<partition-folder>\\start-claude.cmd",
                    "models": [],
                    "name": "Claude (sandbox)",
                    "requiredToolServers": [],
                    "type": "claude"
                }
            ],
            "runsFolder": "autonomous-runs"
        }
    }
}
```

If you leave **Name** empty, G4 names the harness after its tool and position, for example `claude 1`. A name that appears twice keeps only its first entry.

---

## Step 3: Choose a sandbox launcher or an executable

G4 decides where the agent runs from the file extension of the executable:

| Executable | Where the agent runs | Login |
| --- | --- | --- |
| A `.cmd` or `.bat` file, such as a partition launcher `start-claude.cmd` | Inside its **sandbox partition**. The launcher points the agent's home, config, and temp folders into the partition | The login of the partition |
| Anything else, such as `claude` or `codex` on your path | On **this machine** | Your own login |

The run form shows which one you picked under the harness field: **Runs inside its sandbox partition.** or **Runs on this machine with your own login.**

> **💡 Tip:** A partition launcher is created by your sandbox setup, in a folder like `<partition-folder>\start-claude.cmd`. Browse for it with the folder button next to the field.

For a plain executable on your own machine, you can put extra command-line arguments in the **Extra Arguments** list, for example a permission mode. They are placed before the arguments G4 adds itself.

---

## Step 4: Know the argument rule for launchers

A `.cmd` or `.bat` launcher is started through `cmd.exe`. G4 refuses to start it when the launcher path or any argument holds a character that `cmd.exe` would expand or that would end a quoted argument early. The unsafe characters are:

- a double quote `"`
- a percent sign `%`
- a carriage return, a line feed, or a null character
- a trailing backslash `\` at the end of the path or argument

When one of them is present, the run does not start and the form shows `The run could not start: The argument "..." holds a character a launcher cannot pass on safely.` Remove the character and try again. A plain executable (not `.cmd` or `.bat`) is not checked this way.

---

## Step 5: Refresh the run form

The run form reads the harnesses when it opens. If you saved a harness while the dialog is open, click the **refresh** button next to the **Harness** field to read `manifest.json` again. The page also refreshes by itself about a quarter of a second after `manifest.json` changes.

If a harness entry cannot run, the form shows a notice that says why and skips the entry. The troubleshooting page has a card for each of these notices.

---

## ✔ Check your work

- [ ] The **Autonomous Runs** section shows your harness card
- [ ] The harness has a unique **Name**, a **Tool**, and a **Launcher or Executable**
- [ ] After **Save**, the harness appears in the **Harness** list of the run form
- [ ] The line under the harness field says where it runs (sandbox or this machine)

---

**Next up** 👉 [Module 3: Models, efforts, and required tool servers](03-models-efforts-and-tool-servers.md)
