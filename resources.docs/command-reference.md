# Command Reference: G4 Studio

[⬅ Back to the learning paths](g4-learning.md)

Every command and custom editor that G4 Studio contributes, plus the two recorder commands that the extension registers without a Command Palette entry. Command titles are the ones VS Code shows. Every title is listed under the `G4` category in the Command Palette, so type `G4:` to filter them.

Jump to a part:

- [Commands in the Command Palette](#commands-in-the-command-palette)
- [Commands in the Explorer menu](#commands-in-the-explorer-menu)
- [Commands without a menu entry](#commands-without-a-menu-entry)
- [Custom editors](#custom-editors)
- [Folder rules](#folder-rules)
- [Where the views start commands](#where-the-views-start-commands)

---

## Commands in the Command Palette

These commands appear in the Command Palette (**Ctrl+Shift+P**).

| Command id | Title | Where it appears | What it does | Notes |
| --- | --- | --- | --- | --- |
| `New-Project` | Create a New G4 Project | Command Palette | Scaffolds a G4 project in a folder you pick: the manifest, base bots and templates, `.vscode/mcp.json`, and the documentation. Opens the folder when it is done. | If the folder already holds `src/manifest.json`, a dialog offers **Open Existing Project** or **Overwrite Project**. See [Quick Start, Module 4](quick-start/04-create-your-first-project.md). |
| `Show-Workflow` | Open G4 Engine Embedded Application | Command Palette; the **Engine Client** view | Opens the G4 designer in an editor tab. | Run from the palette, it opens an empty designer. It also accepts `{ fileUri }`, which opens that bot. The designer files are downloaded from the Hub on every open, so the Hub must be running. |
| `Show-Settings` | Open Settings Editor | Command Palette; the **Engine Client** view; the Explorer menu for `manifest.json` | Opens the Settings Editor, a form over the project `manifest.json`. | See the [Settings Editor Reference](settings-editor-reference.md). |
| `Show-Autonomous` | Start Autonomous Exploratory Run | Command Palette; the **Engine Client** view | Opens the autonomous run tab, where an agent explores an application and records scenarios. | See [Autonomous Exploratory Run](autonomous-run/README.md). |
| `Apply-Settings` | Apply Settings | Command Palette | Applies the `manifest.json` on disk to the running extension without a window reload. | The Settings Editor runs it when you click Save. A change to the `g4Server` block, the external repositories or the MCP servers still prompts for a window reload. If a recording is running, it asks before stopping it. |
| `Show-Report` | Open G4 Report | Command Palette; opened by the designer after a run | Opens a report in a Report Viewer tab. | Needs a payload. It reads `content`, either a Base64 report or the path of a report file, and uses `id` as the tab title. Run from the palette without a payload, it opens an empty report tab titled "G4 Report". To open a saved report, use **Open in Report Viewer** instead. |
| `Sync-Cache` | Synchronize G4 Cache with Configured Externals and MCP Servers | Command Palette | Sends the external plugin repositories and MCP servers from the manifest to the Hub, so their plugins and tools are available. | Restarts the extension host when the tool sync succeeded. A failure is logged and shown as an error. See [Plugins, Externals and MCP](plugins-externals-and-mcp/README.md). |
| `Update-Documents` | Fetch latest documents version & refresh documentation | Command Palette | Refreshes the **G4 Documentations** tree. | The extension also runs it after it connects to the Hub. |
| `Update-Environment` | Update or Create Environment Variables | Command Palette | Lists the files in the `environments` folder, lets you pick one or more, and sends each one to the Hub as an environment. | A `.json` file must hold one non-empty object. Any other file is read as `KEY=value` lines. See [Environments and Parameters](environments-and-parameters/README.md). |
| `Update-Template` | Update or Create Template Definitions | Command Palette | Lists the files in the `templates` folder, lets you pick one or more, and sends each one to the Hub as a template. | Refreshes the Hub tools and restarts the extension host after at least one template is stored. See [Publish a Template, Module 7](publish-a-template/07-bulk-upload-with-update-template.md). |

---

## Commands in the Explorer menu

These commands are hidden from the Command Palette. Right-click a file in the Explorer to run them. Each one checks the file again when it runs, and shows a warning if the file does not qualify.

| Command id | Title | Where it appears | What it does | Notes |
| --- | --- | --- | --- | --- |
| `Open-Bot-As-Json` | Open as JSON | Explorer menu, on a `.g4` or `.g4bot` file below a `bots` folder | Opens the bot as a plain JSON text document, instead of in the designer. | The warning is "Select a .g4 or .g4bot file under the bots folder." |
| `Open-Bot-In-Workflow` | Open in Workflow Editor | Explorer menu, on a `.json` file below a `bots` or `base.bots` folder | Opens the bot in the designer through `Show-Workflow`. | The warning is "Select a JSON bot file under the bots or base.bots folder." See [Work in the Workflow Editor](work-in-the-workflow-editor/README.md). |
| `Update-Flow` | Open in Flow Publisher | Explorer menu, on a `.json` file below a `bots` folder (not `base.bots`) | Opens the Flow Publisher tab for the bot, where you name the flow, add parameters and publish it to the Hub. | Picking a bot whose tab is already open reveals that tab. See [Publish a Flow](publish-a-flow/README.md). |
| `Open-Template-Publisher` | Open in Template Publisher | Explorer menu, on a `.json` file below a `bots` folder or a `templates` folder | Opens the Template Publisher tab, where you turn a job or an existing template into a template and publish it. | The warning is "Select a JSON file under the templates or bots folder." See [Publish a Template](publish-a-template/README.md). |
| `Open-Report-Viewer` | Open in Report Viewer | Explorer menu, on a `.g4rpt` file directly below the workspace `reports` folder | Opens the report in the Report Viewer. | The menu entry shows only for files that G4 Studio found in the reports folder. The warning is "Select a .g4rpt file under the reports folder." |

`Show-Settings` also has an Explorer menu entry: right-click any file named `manifest.json` to open the Settings Editor.

---

## Commands without a menu entry

The extension registers two more commands. They are not contributed in `package.json`, so they are not in the Command Palette. The **G4 Recorder** view runs them.

| Command id | Title | Where it appears | What it does | Notes |
| --- | --- | --- | --- | --- |
| `Start-Recorder` | none | The Start button of the **G4 Recorder** view | Starts the sandbox recorders when asked, runs the pre-scripts, and asks the Hub to start a recording session. | Refuses to start when a session is already running: "A recording session is already running. Stop it before starting a new one." See [Record an App](record-an-app/README.md). |
| `Stop-Recorder` | none | The Stop button of the **G4 Recorder** view; run by Apply Settings when you confirm | Stops the Hub session, completes the recorded automation and opens it in the designer, then runs the post-scripts. | With no session running it shows "No recording session is running." A failed stop shows "Failed to stop recording:" and the reason. | See [Record an App, Module 2](record-an-app/02-start-suspend-resume-and-stop.md). |

---

## Custom editors

A custom editor opens a file type in a G4 view, instead of the plain text editor.

| View type | Display name | Opens | Notes |
| --- | --- | --- | --- |
| `g4.workflowEditor` | G4 Workflow Editor | `.g4` and `.g4bot` files below a `bots` folder (a `bots` folder at any depth) | The default editor for those files. Edits on the canvas are written to the file. A `.g4` or `.g4bot` file outside a `bots` folder opens in the text editor. Use **Open as JSON** for the text. |
| `g4.reportViewer` | G4 Report Viewer | `.g4rpt` files below a `reports` folder | The default editor for those files. The file must sit below the `reports` folder directly under a workspace folder. A `.g4rpt` file in any other `reports` folder is handed to the viewer, which reopens it in the default text editor. |

---

## Folder rules

The commands in the Explorer menu decide by folder. The rules differ in one important way.

| Rule | Applies to | Example that works | Example that does not |
| --- | --- | --- | --- |
| A path segment named `bots` below the workspace folder | `Open-Bot-As-Json`, `Open-Bot-In-Workflow`, `Update-Flow`, `Open-Template-Publisher` | `bots/login.json`, `bots/examples/login.json` | `src/login.json` |
| A path segment named `base.bots` | `Open-Bot-In-Workflow` only | `base.bots/chrome-automation-base.json` | `base.bots/chrome-automation-base.json` with `Update-Flow` |
| A path segment named `templates` | `Open-Template-Publisher` | `templates/my-template.json` | `src/other/my-template.json` |
| `reports` as the first folder below the workspace folder | `Open-Report-Viewer` and the `g4.reportViewer` editor | `reports/run.g4rpt`, `reports/sub/run.g4rpt` | `src/reports/run.g4rpt` |

Folder names are not case-sensitive. The Explorer menu tests the whole path for a `bots` segment, while the command tests the path below the workspace folder. If your workspace folder itself sits inside a folder called `bots`, the menu entry shows but the command refuses the file.

Because the `reports` folder is read from the workspace folder, a `reportsFolder` other than `.` in the manifest saves reports where the Report Viewer does not open them. See [Settings Editor Reference, Reports](settings-editor-reference.md#reports).

---

## Where the views start commands

| View | Control | Command it runs |
| --- | --- | --- |
| Engine Client | Open G4 Workflow Editor | `Show-Workflow` |
| Engine Client | Open Settings Editor | `Show-Settings` |
| Engine Client | Start Autonomous Exploratory Run | `Show-Autonomous` |
| G4 Recorder | Start | `Start-Recorder` |
| G4 Recorder | Stop | `Stop-Recorder` |
| Designer, after a run | Report is saved or shown | `Show-Report` |

Back to the [learning paths](g4-learning.md).
