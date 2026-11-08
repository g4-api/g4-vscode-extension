# Glossary

[⬅ Back to overview](README.md)

Plain-language definitions of the terms used across this path.

- **Automation** — a sequence of steps G4 runs against a target (browser, API, desktop, internal tool).
- **Driver** — the technology bridge between G4 and the target (e.g., ChromeDriver for Chrome, UiaDriver for Windows desktops). See [Module 3](03-pick-your-driver.md).
- **Selenium hub** — a service (usually at `:4444/wd/hub`) that hands out browser sessions to drivers.
- **UIA (UI Automation)** — Microsoft's standard way to identify desktop UI elements by name and role. See [Module 7](07-set-up-recording.md).
- **Plugin** — a G4 building block. Native plugins ship with G4; MCP tools become plugins via `pluginsSettings.servers`. See [Module 8](08-extend-g4.md).
- **Rule reference** — an internal G4 mechanism for resolving plugin rules at run time. See `forceRuleReference` in [Module 8](08-extend-g4.md).
- **Think time** — the pauses between user actions while recording, used to make replays behave like a human is driving them. See [Module 7](07-set-up-recording.md).
- **MCP (Model Context Protocol)** — a standard protocol for AI agents to talk to tools and data sources. G4 absorbs an MCP server's tools into its plugin catalog.
- **G4 tools dispatcher** — the component that lets AI agents discover and call G4 plugins (including those from MCP servers) on demand.
- **Performance points** — named checkpoints in a workflow whose timings G4 captures. See [Module 6](06-control-your-output.md).
- **Automation** — the complete description of one run: authentication, data source, driver parameters, settings and stages.
- **Bot** — an automation saved as a file in a project's `bots` folder (`.g4` or `.g4bot`). Studio opens it in the workflow editor.
- **Flow** — a complete automation published under a namespace-qualified key, so a client can find it and send it for execution as one unit.
- **Template** — a plugin that expands predefined rules into executable actions.
- **Stage** and **job** — an automation is made of stages, a stage is made of jobs, and a job is made of rules.
- **Rule** — one step of an automation. Rule types are Action, Content, DataCollector, Extraction, Switch and Transformer.
- **Plugin manifest** — a JSON file that describes one plugin: its key, type, parameters, properties and examples.
- **Project manifest** — the `manifest.json` file at the root of a Studio project. It holds the client settings you edit in these modules.
- **Toolbox** — a group of tools in the workflow designer. `toolboxesFilter` in the project manifest can hide toolboxes and tools.
- **Environment** — a named set of parameters stored by the engine. An automation picks one with `settings.environmentsSettings.defaultEnvironment`.
- **Parameter** — a named value stored in an environment. A rule reads it with `{{$ parameters.Name }}`.
- **Column** — one field of a data row. A rule reads it with `{{$ columns.Name }}`.
- **Data source** — the rows an automation iterates over, described by `type`, `source`, `repository` and `filter`.
- **Data collector** — a plugin that receives the data a rule extracted and writes it to a source and repository.
- **Macro** — a plugin that produces a value at run time, written as `{{$Name ...}}` inside an argument.
- **Transformer** — a rule type that changes the output value of another rule.
- **Recorder** — a tool that captures user actions on a target and sends them as events (Windows UIA, Chromium, SAP). See [Module 7](07-set-up-recording.md).
- **Hub** — the G4 Hub service. It exposes REST, MCP and SignalR in front of the engine.
- **Engine** — the G4 runtime that loads plugins, resolves macros and runs automations.
- **Worker** — a separate Hub process started with `run --hub <uri>`.
- **Sandbox** — the packaged local G4 environment installed by the `g4-sandbox` scripts.
- **`.g4rpt`** — a saved report: the Base64 encoding of the engine response JSON. See [Module 6](06-control-your-output.md).

---

**Back to** 👉 [the overview](README.md)
