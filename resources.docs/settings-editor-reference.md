# Settings Editor Reference: G4 Studio

[⬅ Back to the learning paths](g4-learning.md)

The Settings Editor is a form over the project `manifest.json`. This page lists every field of the form, the manifest key it writes, and the value the form starts with when a key is missing.

Open the editor with the **Open Settings Editor** command (`Show-Settings`). For a guided tour, follow [Configure `manifest.json`](configure-manifest/README.md).

Jump to a part:

- [How the editor works](#how-the-editor-works)
- [The 12 sections](#the-12-sections)
- [The buttons and actions](#the-buttons-and-actions)
- [Keys the editor does not show](#keys-the-editor-does-not-show)

---

## How the editor works

- The form opens from the manifest on disk, laid over the editor's starting values. A key that the file lacks shows its starting value, and the first Save writes it.
- Keys are written with a dot path. For example, `settings.automationSettings.loadTimeout` is the `loadTimeout` key inside `automationSettings` inside `settings`.
- Nothing is written until you click **Save**.
- Before Save sends anything, the form checks itself. Empty required fields show `Required.`, repeated or keyless list entries are marked, and a port must be a whole number from 1 to 65535. Sections and cards that hold a problem open, and nothing is saved while a problem remains.
- Ports are shown as numbers but stored as text, for example `"9944"`.
- Blank entries in the list editors are dropped when the manifest is saved.
- The starting values below are the ones the editor uses. They are not always the values a new project's `manifest.json` holds, so check your file when a default matters.

The sections appear in this order: Connection, License, Default Browser, Run Behavior, Logging, Reports, Response Data, Screenshots, Plugins, MCP Servers, Automation Recorders, Autonomous Runs.

---

## The 12 sections

### Connection

Where the G4 engine lives. This section opens by default.

| Label | Manifest key | Default | Notes |
| --- | --- | --- | --- |
| Protocol | `g4Server.schema` | `http` | `http` or `https`. Use HTTPS only behind a secure proxy. |
| Engine Address | `g4Server.host` | `localhost` | Required. |
| Port | `g4Server.port` | `9944` | Stored as text. |
| G4 Sandbox | `sandbox` | not set | Local sandbox folder for bundled browsers and drivers. Browse picks a folder. Auto-Detect picks the newest local sandbox. An empty box removes the key from the file. |

A change to the `g4Server` block needs a window reload. See [After you click Save](#after-you-click-save).

### License

The token that proves you may use the engine.

| Label | Manifest key | Default | Notes |
| --- | --- | --- | --- |
| License Token | `authentication.token` | empty | Shown as a secret. Keep it on one line with no spaces or line breaks. |

The section also has a **Fetch Free Token Automatically** button. See [Fetch Free Token](#fetch-free-token).

### Default Browser

The default automation driver. The same four fields appear inside every recorder card.

| Label | Manifest key | Default | Notes |
| --- | --- | --- | --- |
| Driver | `driverParameters.driver` | `ChromeDriver` | The list comes from the engine. **Refresh Driver List** fetches it again. |
| Driver Service URL or Path | `driverParameters.driverBinaries` | `http://localhost:4444/wd/hub` | A Selenium hub URL, or a local folder that holds the driver. |
| Capabilities (alwaysMatch) | `driverParameters.capabilities.alwaysMatch` | not set | Advanced. A JSON object of WebDriver capabilities applied to every session, such as the browser binary and launch arguments. |

### Run Behavior

How a run behaves.

| Label | Manifest key | Default | Notes |
| --- | --- | --- | --- |
| Page Load Timeout | `settings.automationSettings.loadTimeout` | `60000` | Milliseconds. |
| Find Element Timeout | `settings.automationSettings.searchTimeout` | `15000` | Milliseconds. |
| Parallel Workflows | `settings.automationSettings.maxParallel` | `1` | The lowest allowed value is 1. A smaller value is raised to 1 on Save. |
| Include Simple Results | `settings.automationSettings.returnFlatResponse` | on | A flat view of the results. |
| Include Detailed Results | `settings.automationSettings.returnStructuredResponse` | on | A nested view with step trees, timings and errors. |

### Logging

What G4 Studio tells you while it runs. These keys sit under `settings.clientLogConfiguration`, which is the key the Settings Editor writes. The extension's own output log reads `settings.clientLogSettings` instead (`src/extensions/utilities.ts:397-401`), so these fields do not change it.

| Label | Manifest key | Default | Notes |
| --- | --- | --- | --- |
| Show Live Progress | `settings.clientLogConfiguration.agentLogConfiguration.enabled` | on | Streams log messages while a run is in progress. |
| Update Frequency | `settings.clientLogConfiguration.agentLogConfiguration.interval` | `1000` | Milliseconds. |
| Detail Level | `settings.clientLogConfiguration.logLevel` | `information` | Choices: `error`, `warning`, `information`, `debug`, `trace`. |
| Source Filter Mode | `settings.clientLogConfiguration.sourceOptions.filter` | `include` | `include` shows only the listed sources. `exclude` hides them. |
| Sources | `settings.clientLogConfiguration.sourceOptions.sources` | empty list | Repeated entries are reported. If logs go silent, switch the mode to `exclude` and leave the list empty. |

### Reports

What happens to a run report.

| Label | Manifest key | Default | Notes |
| --- | --- | --- | --- |
| Save a Report After Each Run | `settings.clientReportSettings.saveReports` | on | The report is saved as a `.g4rpt` file. The hint under the field still says "HTML report". |
| Open the Report Automatically | `settings.clientReportSettings.autoView` | on | Turn off for headless or CI runs. |
| Reports Folder | `settings.clientReportSettings.reportsFolder` | `.` | A `reports` subfolder is created here. The Report Viewer opens a file only when `reports` is the first folder under a workspace folder, so keep this at `.` unless you have a reason. |

### Response Data

What the engine puts in a run response.

| Label | Manifest key | Default | Notes |
| --- | --- | --- | --- |
| Include Environment Values | `settings.environmentsSettings.returnEnvironments` | on | The variables used during the run. They may contain secrets. |
| Include Error Details | `settings.exceptionsSettings.returnExceptions` | on | Error type, message and stack trace. |
| Include Performance Timings | `settings.performancePointsSettings.returnPerformancePoints` | on | How long named checkpoints took. |

### Screenshots

Screenshot capture for runs.

| Label | Manifest key | Default | Notes |
| --- | --- | --- | --- |
| Capture Screenshots | `settings.screenshotsSettings.returnScreenshots` | off | Off gives the smallest and fastest runs. |
| Only When Something Fails | `settings.screenshotsSettings.onExceptionOnly` | off | Captures a picture only on errors. |
| Embed Images in the Response | `settings.screenshotsSettings.convertToBase64` | off | Makes responses much larger. Off keeps images as separate files. |
| Screenshots Folder | `settings.screenshotsSettings.outputFolder` | `.` | Where image files are written when they are not embedded. |

### Plugins

Where G4 loads its building blocks from.

| Label | Manifest key | Default | Notes |
| --- | --- | --- | --- |
| Rebuild Rules at the Start of Every Run | `settings.pluginsSettings.forceRuleReference` | on | Recommended on. |
| External Plugin Repositories | `settings.pluginsSettings.externalRepositories` | empty list | One card per repository. **Add Repository** appends a card. |

Each repository card holds these fields. They sit under `settings.pluginsSettings.externalRepositories[N]`.

| Label | Manifest key | Default | Notes |
| --- | --- | --- | --- |
| Name | `name` | empty | Required. A unique name, up to 155 characters. |
| URL | `url` | empty | Required. Must be a URL. |
| Version | `version` | `1` | Required. A whole number, at least 1. |
| Timeout | `timeout` | `300` | Seconds. |
| Capabilities | `capabilities` | empty object | Advanced. Extra key and value pairs sent to the repository. |
| Headers | `headers` | empty object | Optional HTTP headers sent with each request. |
| Credentials | `credentials` | not set | None, Basic (`username`, `password`) or Bearer (`token`). |

A change to the external repositories needs a window reload. See [After you click Save](#after-you-click-save).

### MCP Servers

External Model Context Protocol servers whose tools become G4 plugins. They are stored as an object under `settings.pluginsSettings.servers`, one key per server name, and the card order is the key order. The key is left out of the file when no server exists.

**Add MCP Server** appends a local (`stdio`) server named `server-N` with an empty command. Each card holds these fields, under `settings.pluginsSettings.servers.<name>`.

| Label | Manifest key | Default | Notes |
| --- | --- | --- | --- |
| Name | the object key | `server-N` | Required. Renaming is stored when you leave the box. |
| Type | `type` | `stdio` | `stdio` (Local Process), `http` (Remote HTTP) or `sse` (Remote SSE). The type decides which fields show. |
| Command | `command` | empty | Local only. Required. The program that starts the server. |
| Arguments | `args` | empty list | Local only. Passed to the command in this order. |
| Working Directory | `workingDirectory` | not set | Local only. Optional. |
| URL | `url` | empty | Remote only. Required. |
| Headers | `headers` | not set | Remote only. Optional HTTP headers. |
| Environment Variables | `env` | not set | Local only. Passed to the server process. |
| Timeout | `timeout` | not set | Optional. A number, at least 0. Empty removes the key. |

A change to the MCP servers needs a window reload. See [After you click Save](#after-you-click-save).

### Automation Recorders

Recording of desktop and browser sessions.

| Label | Manifest key | Default | Notes |
| --- | --- | --- | --- |
| Enable Desktop Recording | `settings.recorderSettings.enabled` | on | Master switch for every recorder below. |
| Use Sandbox Recorders | `settings.recorderSettings.useSandbox` | off | Starts the bundled recorder services from the sandbox when they are not running. |
| Turn Off the Chrome Network Sandbox | `settings.recorderSettings.disableChromeNetworkSandbox` | off | Use it only when recorder pages stay blank. |
| Machines | `settings.recorderSettings.recorders` | two machines | One card per recorder. **Add Machine** copies the first shipped recorder and leaves it disabled. |

Each recorder card holds these fields, under `settings.recorderSettings.recorders[N]`.

| Label | Manifest key | Default | Notes |
| --- | --- | --- | --- |
| Enabled | `enabled` | on for the first machine | Turns the machine on or off without removing it. |
| Friendly Name | `driverParameters.capabilities.alwaysMatch["uia:options"].label` | `machine-N` | A readable name, such as `accounting-pc`. |
| Recorder Host | `host` | `localhost` | The machine that runs the recorder service. |
| Recorder Port | `port` | `9955` | Stored as text. |
| Mode | `mode` | `standard` | `standard`, `user32` or `coordinate`. Only the UIA driver uses it. The list is disabled for other drivers, and Save sets their mode to `standard`. |
| Use Offset | `useOffset` | off | Adds the recorded pointer offset to mouse actions. Applies to User32 capture. |
| Driver, Driver Service URL or Path, Capabilities | `driverParameters.*` | UIA driver | The same fields as [Default Browser](#default-browser). The first machine starts at `http://localhost:5555/wd/hub`. |
| Pause Like a Human Between Actions | `thinkTimeSettings.enabled` | on for the first machine | Off replays as fast as possible. |
| Shortest Pause | `thinkTimeSettings.minThinkTime` | `2000` | Milliseconds. Shorter pauses are raised to it. |
| Longest Pause | `thinkTimeSettings.maxThinkTime` | `2000` | Milliseconds. A cap. Equal to the shortest gives a constant pause. |
| Run a Script Before Recording Starts | `preScript.enabled` | off | Runs once before capture begins. |
| Shell | `preScript.shell` | `powershell` | `powershell`, `pwsh`, `bash` or `cmd`. |
| Script | `preScript.script` | empty | Inline script. A non-zero exit or a timeout aborts this recorder's start. |
| Add to Automation Flow | `preScript.addToAutomationFlow` | off | Adds the script as the first `InvokeScript` action. |
| Run a Script After Recording Stops | `postScript.enabled` | off | Runs once after capture ends. |
| Shell | `postScript.shell` | `powershell` | Same choices as the pre-script. |
| Script | `postScript.script` | empty | Inline script. A failure is reported and does not block teardown. |
| Add to Automation Flow | `postScript.addToAutomationFlow` | off | Adds the script as an `InvokeScript` action just before Close Browser. |

A script that is added to the automation flow cannot contain `}}`, `{{`, or a space followed by `--` and a word character (for example ` --force`). Newlines are fine. The card shows a notice under the script, and the script is not added to the flow.

### Autonomous Runs

Settings for the agent that explores an application. For a full walk-through, see [Autonomous Exploratory Run](autonomous-run/README.md).

| Label | Manifest key | Default | Notes |
| --- | --- | --- | --- |
| Runs Folder | `settings.autonomousSettings.runsFolder` | `autonomous-runs` | Each run gets its own folder here, relative to the workspace. |
| Time Limit | `settings.autonomousSettings.timeoutMinutes` | not set (no limit) | Optional. Minutes, at least 1. Empty removes the key, so runs have no limit. The run dialog starts from this value. |
| Harnesses | `settings.autonomousSettings.harnesses` | empty list | One card per agent tool. **Add Harness** appends a card named `harness-N`. |

Each harness card holds these fields, under `settings.autonomousSettings.harnesses[N]`.

| Label | Manifest key | Default | Notes |
| --- | --- | --- | --- |
| Name | `name` | `harness-N` | Required. Up to 80 characters. Shown in the run form. |
| Tool | `type` | `claude` | `claude` (Claude Code), `codex` (Codex) or `opencode` (OpenCode). |
| Launcher or Executable | `executable` | empty | Required. A `.cmd` or `.bat` partition launcher runs sandboxed. Any other path or command runs on this machine. Browse opens a file picker. |
| Models | `models` | empty list | Offered in the run form. The first is the default. Empty uses the tool's own default. |
| Reasoning Efforts | `efforts` | `low`, `medium`, `high`, `xhigh`, `max` | Trim the list to what the tool accepts. The first is the default. |
| Required Tool Servers | `requiredToolServers` | empty list | MCP server names a run needs. A Claude Code run stops at once when one does not connect. |
| Extra Arguments | `arguments` | empty list | Advanced. Placed before the run's own arguments. |

---

## The buttons and actions

### The action bar

| Button | What it does |
| --- | --- |
| Save | Checks the form, then sends the settings to G4 Studio, which runs **Apply Settings** (`Apply-Settings`). |
| Reset to Defaults | Puts every field back to the values the editor opened with and draws the form again. It undoes this session's edits. Nothing is written. |
| Restore Factory Settings | Asks for confirmation in a dialog with the button **Restore Factory Settings**. After you confirm, the form takes the editor's starting values. This clears the license token and the sandbox path. Nothing is written until you click Save. |

### After you click Save

1. If a recording is in progress, a dialog asks: "A recording is in progress. Stop it and apply the settings?" Choose **Stop & Apply**, or Cancel to write nothing.
2. If `manifest.json` changed outside the editor after the form loaded it, a dialog says so. **Overwrite** replaces those changes with the form's values. **Reload Settings** discards the unsaved values in the form and loads the file. Cancel leaves everything as it is. Neither Reload Settings nor Cancel writes the file.
3. The file is written with a 4-space indent.
4. Most settings apply at once, including the recorders. If the `g4Server` block, the external repositories or the MCP servers changed, a prompt says: "Changes to the G4 server, external repositories, or MCP servers need a window reload to refresh the cache. Reload now?" Choose **Reload Window** or **Later**. The prompt starts with "G4 settings saved." when the Settings Editor saved the file. With **Later**, the saved settings take effect on the next window load. When no reload is needed, a short notification says "G4 settings saved."

If no folder is open, Save shows "Open a G4 project folder before saving settings." If the write fails, it shows "Could not save G4 settings:" followed by the reason.

### Test Connection

The **Test Connection** button sits in the Connection section. It asks the engine at the address in the form for its ping page. The section status shows `Connected` or `Could not connect`. The test uses the values in the form, not the saved file.

### Fetch Free Token

The **Fetch Free Token Automatically** button sits in the License section. It downloads the latest free development token from GitHub and puts it in the License Token box. The status reads `Free token added. Click Save to apply it.` When GitHub cannot be reached, the box stays unchanged and the status points at the manual link. The computer needs internet access.

### Refresh Driver List

The small button next to a Driver list fetches the driver names from the engine. The status reads `Driver list refreshed.` When the engine cannot be reached or returns no drivers, the status reads `Could not refresh driver list. Using the built-in driver list.` The editor also fetches the list quietly when the page opens.

### Auto-Detect

Next to the **G4 Sandbox** box, **Auto-Detect** fills the box with the newest local sandbox. When none is found, a warning says: "No G4 Sandbox was auto-detected. Browse manually for the G4 Sandbox."

---

## Keys the editor does not show

These manifest keys exist, but the form has no field for them. Edit `manifest.json` directly.

| Manifest key | Default | What it does |
| --- | --- | --- |
| `settings.queueManagerSettings` | `type` and `properties` are both `null` | The engine request's queue manager settings (`type` and `properties`). The editor keeps the block as it is. |
| `toolboxesFilter` | not set | Hides or shows designer toolboxes and tools. See [Configure `manifest.json`, Module 10](configure-manifest/10-filter-the-designer-toolbox.md). |

Back to the [learning paths](g4-learning.md).
