# Module 4: Run from the designer

[⬅ Back to overview](README.md) · [⬅ Module 3](03-the-toolbox-and-its-filter.md) · [Module 5 ➡](05-reports.md)

**Where you are:** Module 4 of 6

⏱️ **About 6 minutes**

The canvas is also where you run a bot. In this module you use the control bar: start a run, watch the steps change, stop a run, reset the canvas, and move a definition in and out as JSON.

In this module, you will:

- Start a run and read the frames on the steps
- Stop a run, and reset the canvas afterwards
- Know how the project token reaches a run
- Import a definition from pasted JSON or from a file
- Export a definition

---

## The control bar

Hover over the buttons of the control bar, from left to right, to see their tooltips:

| Tooltip | What it does |
| --- | --- |
| **Dark/Light Mode (follows the VS Code theme)** | Shown disabled. The canvas follows the VS Code theme |
| **Reset Definition** | Clears the run frames and makes the canvas editable again |
| **Export Definition** | Produces the bot as a JSON file |
| **Import Definition** | Opens an editor where you paste or load JSON |
| **Stop Definition** | Stops the run |
| **Start Definition** | Runs the bot on the canvas |

---

## Step 1: Start a run

1. Open a bot on the canvas.
2. Click **Start Definition**.

   ![A run in progress with frames on the steps](images/04-run-in-progress.png)

   `TODO(screenshot)`: capture a run in progress, with one step passed and one step running.

3. Watch the canvas.

While the run goes on:

- The canvas is read-only.
- Each step shows a running frame, then a passed or a failed frame.
- The cards in the header count up: **Actions Invoked**, **Avg. Action Time (sec.)**, and **Time Elapsed**.

The canvas sends the run to the Hub over SignalR, and the Hub runs it with the driver and settings that are in the bot.

### Where the token comes from

A run needs your G4 token. If the bot itself has no token, the extension adds the `authentication.token` from your project's `manifest.json` to that one run. The token is never written into the bot file and is never logged. A token typed on the canvas, or already in the bot, always wins. If the extension does not answer within 3 seconds, the run starts with the token it has.

---

## Step 2: Stop a run

1. While a run is going, click **Stop Definition**.

The run ends early, and the step that was running no longer shows a running frame.

---

## Step 3: Reset the canvas

1. After a run, click **Reset Definition**.

The frames disappear and the canvas is editable again.

---

## Step 4: What happens when a run ends

When the Hub sends the result back, the extension reads two settings of the project, under `settings.clientReportSettings` in `manifest.json`:

| Setting | In the Settings Editor | What it does |
| --- | --- | --- |
| `saveReports` | **Save a Report After Each Run** | Saves the result as a `.g4rpt` file in your project |
| `autoView` | **Open the Report Automatically** | Opens the report in a new tab |

The two settings are independent. You can save without opening, or open without saving. Module 5 shows where the file goes and how to open it.

A bot with a data source runs once for each row. The report then holds all the sessions.

---

## Step 5: Import a definition

1. Click **Import Definition**. A large editor opens with the hint `Type, paste or import a definition here...`.
2. Paste the JSON of a bot. Or click the import-file button, whose tooltip reads **Import a definition file (.json or .txt)**, and pick a file.
3. Click the apply button, whose tooltip reads **Apply the definition to the designer**.

The editor closes and the canvas shows the bot. If the text is not valid JSON, the editor marks it, and the canvas keeps what it had.

---

## Step 6: Export a definition

1. Click **Export Definition**.
2. Save the `.json` file when VS Code offers it.

The same JSON is also written to the **G4 Extension** output channel, in a block named `Automation Details` (module 6). Use this for a tab opened with **Open in Workflow Editor**, because that tab does not write to the bot file.

---

## ✔ Check your work

- [ ] You started a run and saw the frames change on the steps
- [ ] You stopped a run with **Stop Definition**
- [ ] **Reset Definition** made the canvas editable again
- [ ] You imported a definition and exported one
- [ ] You can say which two settings control saving and opening a report

---

**Next up** 👉 [Module 5: Reports](05-reports.md)
