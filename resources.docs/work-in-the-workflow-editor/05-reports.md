# Module 5: Reports

[⬅ Back to overview](README.md) · [⬅ Module 4](04-run-from-the-designer.md) · [Module 6 ➡](06-logs.md)

**Where you are:** Module 5 of 6

⏱️ **About 6 minutes**

Every run can leave a report file. In this module you find that file, open it in the Report Viewer, and learn the folder rule that decides whether the viewer or a plain text editor opens it.

In this module, you will:

- Know what a `.g4rpt` file is and where a run saves it
- Open a saved report in the Report Viewer
- Understand why a report sometimes opens as text
- Read what the Report Viewer shows

---

## What a `.g4rpt` file is

A `.g4rpt` file holds the result of one run. The result is a JSON document, and the file stores it as **Base64** text, so the file looks like one long line of letters and digits if you open it as text. The Report Viewer decodes it for you.

The file name is the time the run ended, in the form `yyyy-MM-dd-hhmmssfff.g4rpt`, for example `2026-11-08-141530123.g4rpt`.

---

## Step 1: Find the saved report

A run saves a report when **Save a Report After Each Run** is on (`settings.clientReportSettings.saveReports`).

1. Run a bot from the canvas (module 4).
2. In the Explorer, open the `reports` folder.

   ![The reports folder with a report file](images/05-reports-folder.png)

   `TODO(screenshot)`: capture the Explorer with `reports` expanded and one `.g4rpt` file.

The folder is `<reportsFolder>/reports`. The setting `settings.clientReportSettings.reportsFolder` is the folder that holds `reports`. Its default is `.`, which means the project's `src` folder, so the default is `src/reports`. The extension creates the folder when it is missing.

If no folder is open in VS Code, there is nowhere to save, and the extension shows **No workspace folder is open. Please open a folder before saving workflow reports.**

---

## Step 2: Open a report in the Report Viewer

There are three ways:

1. **After a run**, with **Open the Report Automatically** on (`autoView`). A report tab opens by itself. Its title is the file name without `.g4rpt`.
2. **Double-click** a `.g4rpt` file under `reports`. It opens in the **G4 Report Viewer**.
3. **Right-click** the file and click **Open in Report Viewer**.

   ![The Open in Report Viewer menu entry](images/05-open-in-report-viewer.png)

   `TODO(screenshot)`: capture the Explorer menu on a `.g4rpt` file with **Open in Report Viewer**.

---

## The folder rule

The viewer opens a report only when `reports` is the **first folder below your project's `src` folder**. So these are fine:

- `reports/2026-11-08-141530123.g4rpt`
- `reports/nightly/2026-11-08-141530123.g4rpt`

These are not:

- `build/reports/2026-11-08-141530123.g4rpt`
- a `reports` folder outside your project folder

A file outside the rule opens in a plain text editor and shows the Base64 text. The **Open in Report Viewer** entry is not shown for it either. The entry appears only for files that follow the rule, and the list of such files is rebuilt a moment after any file is created or deleted below a `reports` folder.

> **⚠️ Warning:** This rule has a side effect on the `reportsFolder` setting. The run always saves to `<reportsFolder>/reports`. If you set `reportsFolder` to anything but `.`, for example `build`, the files land in `build/reports`, and the viewer shows them as text. A folder outside the project is also shown as text. Keep `reportsFolder` at `.` if you want the Report Viewer.

---

## Step 3: Read the report

![The Report Viewer](images/05-report-viewer.png)

`TODO(screenshot)`: capture a report with the summary cards and the sections.

The report opens with the header **G4™ Automation Report**, then summary cards, then sections.

| Part | What it shows |
| --- | --- |
| Summary cards | **Total Actions**, **Avg. Action Time**, **Total Runtime**, **Failed Assertions**, **Total Exceptions**, **Total Timeouts** |
| **Execution Timeline** | Every action in order. **Expand every action in the timeline** and **Collapse every action in the timeline** open and close them all |
| **Plugin Tree** | The plugins that ran. Type in **Filter plugins** to keep only the plugin names that match |
| **Assertions** | The assertions of the run. A failed one shows its expected value and its actual value |
| **Error Summary** | Each exception. **Show or hide the stack trace** opens its stack trace |

A failed run shows the failed assertion with the expected value and the actual value.

---

## When a report cannot be read

If the file is not Base64 of a JSON document, for example a half-written or edited file, two things happen:

1. A warning reads `<file name> is not a readable G4 report.`
2. The tab shows the same sentence and a hint to right-click the file, choose **Open With...**, and pick **Text Editor**.

> **💡 Tip:** **G4: Open G4 Report** in the Command Palette opens a report tab without a result to show, so the report is empty. Use the Explorer or run a bot to see a real report.

---

## ✔ Check your work

- [ ] You found a `.g4rpt` file in `reports` after a run
- [ ] You opened it in the Report Viewer by double-clicking it
- [ ] You opened it again with **Open in Report Viewer**
- [ ] You can explain why a report in `build/reports` opens as text

---

**Next up** 👉 [Module 6: Logs](06-logs.md)
