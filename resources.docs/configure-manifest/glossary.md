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

---

**Back to** 👉 [the overview](README.md)
