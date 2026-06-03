# G4 Configuration Guide (`manifest.json`)

A practical, friendly walkthrough of every setting in `manifest.json` — what it does, what changes when you flip it, **and when you should reach for it**. Written for operators, QA engineers, and business users who configure G4 without necessarily writing code.

> **What is G4?** G4 is a plugin-based automation engine. It runs controlled workflows across **browsers, APIs, desktop applications, and internal tools**, and it can be driven by humans (point-and-click workflows), other systems (CI/CD, schedulers), or AI agents. The `manifest.json` file is how you tell the engine where it lives, who it trusts, how to talk to the outside world, and what to send back after each run.

---

## Table of Contents

1. [How to read this guide](#1-how-to-read-this-guide)
2. [The shape of `manifest.json`](#2-the-shape-of-manifestjson)
3. [Editing safely — golden rules](#3-editing-safely--golden-rules)
4. [`clientLogConfiguration` — what G4 tells you while it runs](#4-clientlogconfiguration--what-g4-tells-you-while-it-runs)
   - 4.1 [`agentLogConfiguration`](#41-agentlogconfiguration)
   - 4.2 [`logLevel`](#42-loglevel)
   - 4.3 [`sourceOptions`](#43-sourceoptions)
5. [`g4Server` — where the engine lives](#5-g4server--where-the-engine-lives)
6. [`authentication` — who is allowed to use the engine](#6-authentication--who-is-allowed-to-use-the-engine)
7. [`driverParameters` — the default automation driver](#7-driverparameters--the-default-automation-driver)
8. [`settings.automationSettings` — runtime behavior of every workflow](#8-settingsautomationsettings--runtime-behavior-of-every-workflow)
   - 8.1 [`loadTimeout`](#81-loadtimeout)
   - 8.2 [`searchTimeout`](#82-searchtimeout)
   - 8.3 [`maxParallel`](#83-maxparallel)
   - 8.4 [`returnFlatResponse` / `returnStructuredResponse`](#84-returnflatresponse--returnstructuredresponse)
9. [`settings.clientReportSettings` — the run report](#9-settingsclientreportsettings--the-run-report)
10. [`settings.environmentsSettings`](#10-settingsenvironmentssettings)
11. [`settings.recorderSettings` — capturing desktop/UI sessions](#11-settingsrecordersettings--capturing-desktopui-sessions)
    - 11.1 [Top-level `enabled` and the `recorders` list](#111-top-level-enabled-and-the-recorders-list)
    - 11.2 [`mode`, `schema`, `host`, `port`](#112-mode-schema-host-port)
    - 11.3 [`driverParameters` inside a recorder](#113-driverparameters-inside-a-recorder)
    - 11.4 [`thinkTimeSettings` — the human-pause cap](#114-thinktimesettings--the-human-pause-cap)
12. [`settings.exceptionsSettings`](#12-settingsexceptionssettings)
13. [`settings.queueManagerSettings` (not yet useful)](#13-settingsqueuemanagersettings-not-yet-useful)
14. [`settings.performancePointsSettings`](#14-settingsperformancepointssettings)
15. [`settings.pluginsSettings`](#15-settingspluginssettings)
    - 15.1 [`externalRepositories`](#151-externalrepositories)
    - 15.2 [`forceRuleReference`](#152-forcerulereference)
16. [`settings.screenshotsSettings`](#16-settingsscreenshotssettings)
17. [`servers` — connecting MCP tools as G4 plugins](#17-servers--connecting-mcp-tools-as-g4-plugins)
18. [Common scenarios (copy-paste recipes)](#18-common-scenarios-copy-paste-recipes)
19. [Troubleshooting checklist](#19-troubleshooting-checklist)
20. [Glossary](#20-glossary)

---

## 1. How to read this guide

Each setting section follows the same shape so you can skim:

- **What it is** — one-sentence purpose.
- **What it does** — what changes when the value changes.
- **How to configure** — the JSON shape with an example.
- **When to use it** — concrete situations where you'd touch this setting.
- **Pitfalls** — common mistakes to avoid.

If you're new to G4, read sections 2–7 in order; the rest are reference material you can jump into when needed.

---

## 2. The shape of `manifest.json`

`manifest.json` is one JSON object with these top-level keys:

| Key                       | Purpose                                                            |
| ------------------------- | ------------------------------------------------------------------ |
| `clientLogConfiguration`  | Logging from G4 back to whoever called it                          |
| `g4Server`                | Address of the G4 engine                                           |
| `authentication`          | Token that proves you're allowed to use the engine                 |
| `driverParameters`        | The default automation driver (e.g., Chrome)                       |
| `settings`                | A container for all the run-behavior settings                      |
| `servers` *(optional)*    | MCP servers whose tools become G4 plugins                          |

Everything below `settings` controls **how runs behave** and **what comes back** after a run.

---

## 3. Editing safely — golden rules

1. **`manifest.json` is JSON.** Commas and braces matter. A missing comma anywhere breaks the whole file. If G4 won't start, validate the file in a JSON-aware editor (VS Code, Notepad++ with a JSON plugin, or an online validator).
2. **Make a backup before you edit.** Copy `manifest.json` to `manifest.json.bak` so you can roll back in one step.
3. **Change one thing at a time.** If something breaks, you'll know which change caused it.
4. **Restart G4 after changes.** Most settings are read at startup, not live.
5. **Never share the `authentication.token`.** It's effectively your license key — treat it like a password.

---

## 4. `clientLogConfiguration` — what G4 tells you while it runs

This section controls the **stream of progress messages** G4 sends back to whatever called it (your IDE, the Python wrapper, an agent, etc.).

```json
"clientLogConfiguration": {
    "agentLogConfiguration": {
        "enabled": true,
        "interval": 1000
    },
    "logLevel": "information",
    "sourceOptions": {
        "filter": "include",
        "sources": []
    }
}
```

### 4.1 `agentLogConfiguration`

- **What it is** — controls how often the engine pushes log batches to the client.
- **What it does** — when `enabled: true`, every `interval` milliseconds G4 ships any new log lines to the caller. With `enabled: false`, log lines are buffered and only available at the end (or via other mechanisms).
- **How to configure**

  ```json
  "agentLogConfiguration": {
      "enabled": true,
      "interval": 1000   // milliseconds
  }
  ```

- **When to use it**
  - **Keep enabled** for normal use — you'll see progress live in your IDE/console.
  - **Increase `interval`** (e.g., `5000`) on slow networks or when log volume is overwhelming.
  - **Disable** only in batch/headless runs where nobody is watching and you want maximum throughput.
- **Pitfalls** — setting `interval` very low (e.g., `50`) creates a flood of tiny messages and can slow the client.

### 4.2 `logLevel`

- **What it is** — the verbosity of log messages.
- **What it does** — filters which messages reach you. Levels go from quietest to noisiest, typically: `error` < `warning` < `information` < `debug` < `trace`.
- **How to configure**

  ```json
  "logLevel": "information"
  ```

- **When to use it**
  - **`information`** — default, good for everyday runs.
  - **`warning`** or **`error`** — production runs where you only want to see problems.
  - **`debug`** — when you're investigating why a workflow does the wrong thing.
  - **`trace`** — only when working with G4 support; very noisy.
- **Pitfalls** — `trace` and `debug` can produce huge logs. Don't leave them on in production.

### 4.3 `sourceOptions`

- **What it is** — a per-source filter (e.g., only show logs from a specific plugin or component).
- **What it does** — `filter: "include"` means "only show sources on the list"; `filter: "exclude"` means "show everything except those on the list". `sources` is the list itself.
- **How to configure**

  ```json
  "sourceOptions": {
      "filter": "include",
      "sources": ["MyPlugin", "Orchestrator"]
  }
  ```

- **When to use it**
  - Use **`include`** with a small list to focus on a single area when debugging.
  - Use **`exclude`** to silence a chatty plugin you don't care about.
  - For most users, leave `sources: []` and `filter: "include"` — the engine will fall back to its default source set.
- **Pitfalls** — `filter: "include"` with an empty `sources` list can mean "show nothing source-specific" on some configurations. If logs disappear after editing this, switch `filter` to `"exclude"` with an empty `sources` list to re-enable everything.

---

## 5. `g4Server` — where the engine lives

```json
"g4Server": {
    "schema": "http",
    "host": "localhost",
    "port": "9944"
}
```

- **What it is** — the address the client uses to reach the G4 engine.
- **What it does** — every automation request is sent to `<schema>://<host>:<port>`.
- **How to configure**
  - `schema`: `"http"` or `"https"`.
  - `host`: hostname or IP address.
  - `port`: the port the engine listens on (default `9944`).
- **When to use it**
  - **Default (`localhost:9944`)** — G4 is running on your own machine.
  - **Change `host`** when the engine runs on a different server (e.g., a shared automation host or a Docker container).
  - **Change `schema` to `https`** when your G4 instance is behind a TLS proxy or in a corporate network that requires encryption.
- **Pitfalls**
  - The `port` is a **string** (`"9944"`), not a number. Keep the quotes.
  - Make sure firewalls allow traffic to that port; "connection refused" usually means port or firewall.

---

## 6. `authentication` — who is allowed to use the engine

```json
"authentication": {
    "token": "<your-license-token>"
}
```

- **What it is** — your G4 license/identity token.
- **What it does** — G4 rejects every request without a valid token. The token also identifies which features and limits your license allows.
- **How to configure** — paste the token you were issued, in one line, between the quotes.
- **When to use it**
  - You'll set this once during initial setup and rarely touch it again.
  - Update it when you receive a new token (e.g., license renewal, plan change).
- **Pitfalls**
  - **Never commit a real token to source control or share it in screenshots.** Treat it like a password.
  - Don't add line breaks inside the token — JSON strings must be on one line.
  - If you start seeing "unauthorized" errors after working fine, your token may have expired or been rotated.

---

## 7. `driverParameters` — the default automation driver

```json
"driverParameters": {
    "driver": "ChromeDriver",
    "driverBinaries": "http://localhost:4444/wd/hub"
}
```

- **What it is** — the **default driver** G4 uses when a workflow doesn't pick its own. The driver is the bridge between G4 and the thing being automated (a browser, a desktop app, an API).
- **What it does** — sets which technology G4 will speak by default (Chrome, Edge, Firefox, etc.) and where to find the driver service.
- **How to configure**
  - `driver`: the driver name (`ChromeDriver`, `EdgeDriver`, `FirefoxDriver`, `UiaDriver`, etc.).
  - `driverBinaries`: the URL of the driver service (typically a Selenium hub at `:4444/wd/hub`).
- **When to use it**
  - **Default Chrome via local Selenium** — most users keep `ChromeDriver` + `http://localhost:4444/wd/hub`.
  - **Switch to Edge or Firefox** if your target application only works correctly in that browser.
  - **Point `driverBinaries` at a remote hub** when you run browsers on a different machine (e.g., a Selenium Grid, Docker container, or a cloud provider like BrowserStack/Sauce Labs — adapted to their URL).
- **Pitfalls**
  - The driver service must actually be running at that URL — "connection refused" or "session not created" usually means the hub isn't up.
  - The driver version must match the browser version on the target machine.

---

## 8. `settings.automationSettings` — runtime behavior of every workflow

```json
"automationSettings": {
    "loadTimeout": 60000,
    "maxParallel": 1,
    "returnFlatResponse": true,
    "returnStructuredResponse": true,
    "searchTimeout": 15000
}
```

### 8.1 `loadTimeout`

- **What it is** — the maximum time G4 waits for a page/screen to finish loading.
- **What it does** — if the page hasn't finished loading after this many milliseconds, G4 fails the step with a timeout error.
- **When to use it**
  - **60 000 ms (1 minute)** is a safe default for most web apps.
  - **Raise it** (e.g., `120000`) for slow internal apps, heavy dashboards, or congested networks.
  - **Lower it** (e.g., `15000`) in fast-feedback test loops where you'd rather fail quickly than wait.
- **Pitfalls** — too low means false failures on slow days; too high means tests hang for minutes when something's genuinely broken.

### 8.2 `searchTimeout`

- **What it is** — the maximum time G4 spends looking for an element (a button, field, etc.) before giving up.
- **What it does** — if the element doesn't appear within this many milliseconds, G4 fails the step with "element not found".
- **When to use it**
  - **15 000 ms (15 s)** is a good default.
  - **Raise it** for apps with very lazy/animated UIs.
  - **Lower it** when you're certain elements appear instantly (e.g., a fully static page) and want faster failure.
- **Pitfalls** — raising it hides flaky UIs by waiting them out. Sometimes you'd rather know the UI is slow.

### 8.3 `maxParallel`

- **What it is** — how many workflows G4 runs at the same time on this engine instance.
- **What it does** — `1` means strictly serial: one workflow at a time. Higher numbers let G4 run multiple workflows concurrently.
- **When to use it**
  - **Keep `1`** when workflows share resources (the same browser session, the same desktop, the same file).
  - **Raise it** (e.g., `4`) when you have isolated runs and want to finish faster — but only if your driver setup supports parallel sessions (e.g., a Selenium Grid).
- **Pitfalls** — running parallel workflows on a single desktop typically breaks both. Don't raise this above `1` for desktop/recorder workflows.

### 8.4 `returnFlatResponse` / `returnStructuredResponse`

- **What they are** — toggles for the **shape** of the response sent back after a run.
- **What they do**
  - `returnFlatResponse: true` — include a flat (simple key/value-ish) view.
  - `returnStructuredResponse: true` — include a rich, nested view with step trees, timings, errors, etc.
- **When to use them**
  - **Keep both `true`** unless your consumer specifically only wants one shape — being generous costs almost nothing.
  - **Turn one off** if you're hitting payload-size limits in your client.
- **Pitfalls** — turning both off means the client gets virtually no data back.

---

## 9. `settings.clientReportSettings` — the run report

```json
"clientReportSettings": {
    "autoView": true,
    "reportsFolder": ".",
    "saveReports": true
}
```

- **What it is** — controls the **HTML report** G4 produces after a run.
- **What it does**
  - `saveReports: true` — writes the HTML report to disk.
  - `reportsFolder` — the **parent path** under which a `reports/` subfolder is created. So `"."` means the report is written under **`./reports/`**, not directly into `.`.
  - `autoView: true` — automatically opens the report in your default browser when the run finishes.
- **When to use it**
  - **Default settings** are right for most desktop users who want to look at results immediately.
  - **`autoView: false`** in headless/CI runs — nobody is at the screen, and opening a browser may fail.
  - **Change `reportsFolder`** to a shared/network path when multiple machines must collect reports in one place. Remember it'll still create a `reports/` subfolder there.
  - **`saveReports: false`** if your pipeline already collects reports through another mechanism and you don't want disk clutter.
- **Pitfalls**
  - The reports folder must be writable by the user running G4.
  - `reportsFolder: "."` does **not** drop the file directly in the working directory — look one level down in `reports/`.

---

## 10. `settings.environmentsSettings`

```json
"environmentsSettings": {
    "returnEnvironments": true
}
```

- **What it is** — should G4 send back the **environment data** (the variables/configuration used during the run) along with the response?
- **What it does** — when `true`, the response includes the resolved environment state. Useful for auditing and reproducing runs.
- **When to use it**
  - **Keep `true`** for traceability — if a run misbehaves, you'll see which environment values it actually used.
  - **Set `false`** if environments contain sensitive data you don't want echoed back, or if response size matters.
- **Pitfalls** — environments can contain secrets. If your responses are logged anywhere, consider disabling this.

---

## 11. `settings.recorderSettings` — capturing desktop/UI sessions

The recorder is how G4 **observes a user clicking around a desktop application** and turns those actions into a workflow it can replay later.

```json
"recorderSettings": {
    "enabled": true,
    "recorders": [ { ... }, { ... } ]
}
```

### 11.1 Top-level `enabled` and the `recorders` list

- **`enabled` (top-level)** — master on/off switch for *all* recorders. If `false`, no recording happens regardless of what's inside the list.
- **`recorders`** — a list (array) of recorder definitions. Each entry describes one **machine/target** that can be recorded. You can have several and turn them on or off individually with their own `enabled` flag.
- **When to use multiple recorders**
  - You record across multiple machines (machine-a is your main desktop, machine-b is a secondary VM).
  - You want different settings per machine (e.g., longer think time on a slow VM).

### 11.2 `mode`, `schema`, `host`, `port`

```json
"mode": "user32",
"schema": "http",
"host": "localhost",
"port": "9955"
```

- **`mode`** — how the recorder hooks into the operating system. `user32` uses Windows native UI events (mouse, keyboard, window messages).
- **`schema` / `host` / `port`** — where the recorder service is listening. The default `localhost:9955` means it runs on the same machine as G4.
- **When to use it**
  - **Default `user32` on `localhost:9955`** for single-machine setups.
  - **Change `host`** when the recorder runs on a different machine than the engine.

### 11.3 `driverParameters` inside a recorder

```json
"driverParameters": {
    "capabilities": {
        "alwaysMatch": {
            "browserName": "Uia",
            "uia:options": { "label": "machine-a" }
        }
    },
    "driver": "UiaDriver",
    "driverBinaries": "http://localhost:5555/wd/hub",
    "firstMatch": [ {} ]
}
```

- **What it is** — the driver the recorder uses to *talk to* the desktop application while watching the user.
- **`browserName: "Uia"`** + **`driver: "UiaDriver"`** — uses Windows UI Automation, the standard way to identify desktop UI elements (buttons, fields, etc.) by name and role rather than pixel coordinates.
- **`uia:options.label`** — a friendly name for this target machine. Used in reports and when referring to the machine in workflows.
- **`driverBinaries`** — the UIA driver service URL (often `localhost:5555/wd/hub`).
- **When to use it**
  - **Keep defaults** for a typical Windows desktop on the same machine.
  - **Change `label`** to something meaningful like `accounting-pc` or `finance-vm` so reports are easy to read.
  - **Change `driverBinaries`** when the UIA driver lives elsewhere or on a different port.

### 11.4 `thinkTimeSettings` — the human-pause cap

```json
"thinkTimeSettings": {
    "enabled": true,
    "maxThinkTime": 2000,
    "minThinkTime": 2000
}
```

- **What it is** — how G4 records the **pauses between user actions** during recording.
- **What it does** (important — this is the most commonly misunderstood setting)
  - `maxThinkTime` is a **ceiling**, not a fixed delay. If the user idles longer than `maxThinkTime` between actions (e.g., goes to lunch), G4 clamps the recorded delay down to `maxThinkTime`. So a 30-minute lunch break does **not** become a 30-minute wait in the workflow — it becomes `maxThinkTime`.
  - `minThinkTime` is the **floor**. Pauses shorter than `minThinkTime` are bumped up to it.
  - `enabled: false` means think time isn't recorded at all — replays go as fast as the driver can fire actions.
- **When to use it**
  - **`enabled: true`** with reasonable values (e.g., `min: 200`, `max: 2000`) when the target app needs human-paced interactions to behave correctly (animations, modal transitions, server round-trips).
  - **`enabled: false`** for speed runs where the target app handles fast input fine.
  - **Set `min == max`** (like in the example: both `2000`) to use a **constant** pause between all actions, regardless of how fast or slow the user actually was.
- **Pitfalls**
  - Confusing `maxThinkTime` with "fixed pause" — it's a cap.
  - Setting `min` too low on a slow app produces flaky replays.

---

## 12. `settings.exceptionsSettings`

```json
"exceptionsSettings": {
    "returnExceptions": true
}
```

- **What it is** — should G4 include **error/exception details** in the response?
- **What it does** — when `true`, errors come back with type, message, and (typically) stack — useful for debugging.
- **When to use it**
  - **Keep `true`** during development and any time you want to know *why* a run failed.
  - **Set `false`** only if you trust the run is healthy and want a smaller, cleaner response (rare).
- **Pitfalls** — exception text can leak internal details (paths, internal IDs). If responses are exposed externally, consider how that data is handled.

---

## 13. `settings.queueManagerSettings` (not yet useful)

```json
"queueManagerSettings": {
    "properties": null,
    "type": null
}
```

- **Status** — only one provider exists today, so this section is effectively **inactive**. You can leave the defaults (`null`/`null`) and ignore it.
- **What it will be for (future)** — letting G4 pull jobs from a **queue** (RabbitMQ, Azure Service Bus, etc.) instead of being called directly.
- **When you'll touch it** — once additional providers exist and your team decides to drive G4 via a queue instead of synchronous calls. Until then, ignore.

---

## 14. `settings.performancePointsSettings`

```json
"performancePointsSettings": {
    "returnPerformancePoints": true
}
```

- **What it is** — should G4 include **performance measurements** (timings at named checkpoints in a workflow) in the response?
- **What it does** — when `true`, the response includes how long named steps took, useful for trending performance over time.
- **When to use it**
  - **Keep `true`** if you care about performance regressions or run reports that chart timings.
  - **Set `false`** for the smallest possible response when you only care about pass/fail.
- **Pitfalls** — none significant; this is a low-cost setting.

---

## 15. `settings.pluginsSettings`

```json
"pluginsSettings": {
    "externalRepositories": null,
    "forceRuleReference": true
}
```

### 15.1 `externalRepositories`

- **What it is** — a place to list **additional plugin sources** beyond the built-in/locally-installed plugins.
- **What it does** — when configured, G4 loads plugins from those external repositories at startup.
- **When to use it**
  - **`null`** (default) — you only use plugins that ship with G4 or that you've installed locally.
  - **Configure it** when your team maintains a central plugin repository and you want every G4 instance to pull from it.
- **Pitfalls** — depending on a remote repository means startup can fail if that repository is down or unreachable.

### 15.2 `forceRuleReference`

- **What it is** — controls whether G4 **recreates the rules reference** when an automation initializes.
- **What it does**
  - `true` (default) — at automation initialize, G4 **recreates** the rules reference fresh.
  - `false` — G4 **reuses the existing reference**.
- **When to use it**
  - **Keep `true`** as the safe default. Ensures the reference is consistent with the current state at the start of each run.
  - **Set `false`** only when you have a deliberate reason to preserve the existing reference between runs (e.g., advanced caching scenarios where you understand the consequences).
- **Pitfalls** — flipping this without understanding what "rules reference" means in your workflow can produce confusing run-to-run differences. When in doubt, leave it `true`.

---

## 16. `settings.screenshotsSettings`

```json
"screenshotsSettings": {
    "convertToBase64": false,
    "onExceptionOnly": false,
    "outputFolder": ".",
    "returnScreenshots": false
}
```

- **What it is** — controls whether and how G4 captures **screenshots** during a run.
- **What it does**
  - `returnScreenshots: true` — screenshots come back in the response payload.
  - `convertToBase64: true` — screenshots are embedded directly in the JSON response (no separate files).
  - `onExceptionOnly: true` — only capture screenshots when something goes wrong (cheap forensic mode).
  - `outputFolder` — where screenshot files are written when not embedded in the response.
- **When to use it**
  - **All `false` (current setup)** — no screenshots at all; smallest, fastest runs.
  - **`onExceptionOnly: true`** + **`returnScreenshots: true`** — great for production: low overhead, but when something fails you have a picture.
  - **`returnScreenshots: true`** + **`convertToBase64: true`** — when your client (an IDE plugin, a chat agent) wants everything inline and self-contained.
  - **`returnScreenshots: true`** + **`convertToBase64: false`** + a meaningful `outputFolder` — when you'd rather have files on disk than huge JSON responses.
- **Pitfalls**
  - `convertToBase64: true` makes responses **much** larger — don't combine with screenshots-every-step on long workflows or you'll blow up payload sizes.
  - The `outputFolder` must be writable by the user running G4.

---

## 17. `servers` — connecting MCP tools as G4 plugins

> This section may not exist in your `manifest.json` yet. Adding it is **optional**.

`servers` is a top-level block (sibling to `g4Server`, `authentication`, etc.) that uses **the same schema as `mcp.json`** — the standard configuration format for MCP (Model Context Protocol) servers.

- **What it is** — a way to plug **external MCP servers** into G4.
- **What it does** — every tool exposed by a connected MCP server is **automatically converted into a G4 plugin** at engine startup. Those generated plugins show up in the **plugin catalog** alongside built-in plugins, indistinguishable to the user.
- **How to use the resulting plugins**
  1. **Manually** — drag-and-drop from the plugin catalog into a workflow.
  2. **Agentically** — let an AI agent discover and call them through the **G4 tools dispatcher**.
- **How to configure**
  Use the same shape you already know from `mcp.json` (an object whose keys are server names and whose values describe how to launch/reach each server — command, args, env, transport, etc.). The exact field names follow the MCP standard.

  ```json
  "servers": {
      "my-database": {
          "command": "node",
          "args": ["./mcp-servers/db.js"],
          "env": { "DB_URL": "..." }
      },
      "my-jira": {
          "command": "python",
          "args": ["-m", "jira_mcp"]
      }
  }
  ```

- **When to use it**
  - You already use MCP servers (for an AI assistant or another tool) and you want those same capabilities available inside G4 workflows.
  - You want to give G4 access to a third-party system (Jira, Slack, a database, a CRM) without building a custom G4 plugin from scratch — if an MCP server for it exists, you can adopt it instantly.
  - You want AI agents driving G4 to **discover and orchestrate** external tools through one consistent interface.
- **Pitfalls**
  - The MCP server has to be reachable from the machine running G4.
  - Long startup times in an MCP server delay engine startup.
  - Tools from MCP servers run with the permissions of the user that started G4 — be deliberate about what you connect.

---

## 18. Common scenarios (copy-paste recipes)

### 18.1 "I want fast local development with full diagnostics"

```json
"clientLogConfiguration": { "logLevel": "debug", "agentLogConfiguration": { "enabled": true, "interval": 500 } },
"settings": {
    "automationSettings": { "loadTimeout": 60000, "searchTimeout": 15000, "maxParallel": 1, "returnFlatResponse": true, "returnStructuredResponse": true },
    "clientReportSettings": { "saveReports": true, "autoView": true, "reportsFolder": "." },
    "exceptionsSettings": { "returnExceptions": true },
    "performancePointsSettings": { "returnPerformancePoints": true },
    "screenshotsSettings": { "returnScreenshots": true, "onExceptionOnly": false, "convertToBase64": false, "outputFolder": "./shots" }
}
```

### 18.2 "I want lean, headless CI runs"

```json
"clientLogConfiguration": { "logLevel": "warning", "agentLogConfiguration": { "enabled": true, "interval": 2000 } },
"settings": {
    "automationSettings": { "loadTimeout": 60000, "searchTimeout": 15000, "maxParallel": 1, "returnFlatResponse": true, "returnStructuredResponse": true },
    "clientReportSettings": { "saveReports": true, "autoView": false, "reportsFolder": "./ci-reports" },
    "exceptionsSettings": { "returnExceptions": true },
    "screenshotsSettings": { "returnScreenshots": true, "onExceptionOnly": true, "convertToBase64": false, "outputFolder": "./ci-reports/shots" }
}
```

### 18.3 "I want to record a desktop app at steady, predictable pacing"

```json
"recorderSettings": {
    "enabled": true,
    "recorders": [
        {
            "enabled": true,
            "mode": "user32",
            "schema": "http",
            "host": "localhost",
            "port": "9955",
            "driverParameters": {
                "driver": "UiaDriver",
                "driverBinaries": "http://localhost:5555/wd/hub",
                "capabilities": { "alwaysMatch": { "browserName": "Uia", "uia:options": { "label": "my-desktop" } } },
                "firstMatch": [ {} ]
            },
            "thinkTimeSettings": { "enabled": true, "minThinkTime": 500, "maxThinkTime": 2500 }
        }
    ]
}
```

### 18.4 "I want my MCP tools to appear as G4 plugins"

Add a top-level `servers` block (sibling to `g4Server`):

```json
"servers": {
    "filesystem": { "command": "npx", "args": ["-y", "@modelcontextprotocol/server-filesystem", "C:\\work"] },
    "jira": { "command": "python", "args": ["-m", "jira_mcp_server"] }
}
```

Restart G4. Open the plugin catalog — your MCP tools now appear as plugins.

---

## 19. Troubleshooting checklist

| Symptom                                         | Likely cause                                      | What to check                                                                                   |
| ----------------------------------------------- | ------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| G4 won't start                                  | `manifest.json` has a syntax error                | Open in a JSON-aware editor; look for missing/extra commas or braces                            |
| "Unauthorized" on every request                 | Token expired, missing, or malformed              | Check `authentication.token`; re-paste from your license source on a single line                |
| "Connection refused" reaching G4                | Wrong host/port or G4 not running                 | Verify `g4Server` matches the actual engine address; confirm the engine process is running      |
| "Session not created" / driver errors           | Driver service not running or version mismatch    | Confirm Selenium/UIA hub is up at `driverBinaries` URL; match driver version to browser version |
| Workflows hang for a long time before failing   | Timeouts too high                                 | Lower `loadTimeout` / `searchTimeout` while debugging                                           |
| Reports don't appear where expected             | Look in `reportsFolder/reports/`                  | Reports go **inside** a `reports/` subfolder of `reportsFolder`                                 |
| Recordings replay with weird long pauses        | `maxThinkTime` too high, or `min == max` long     | Lower `maxThinkTime`; widen the range between `minThinkTime` and `maxThinkTime`                 |
| Recordings replay too fast and break the app    | Think time disabled or too low                    | Set `thinkTimeSettings.enabled: true` and raise `minThinkTime`                                  |
| Huge response payloads, client struggles        | Screenshots embedded as base64                    | Set `screenshotsSettings.convertToBase64: false`; consider `onExceptionOnly: true`              |
| No live logs in the IDE/console                 | Agent log push disabled or too slow               | Set `agentLogConfiguration.enabled: true`; lower `interval`                                     |
| Logs are completely silent                      | `sourceOptions.filter: "include"` with empty list | Switch to `"exclude"` with `[]`, or list specific sources                                       |
| MCP-derived plugins don't appear in the catalog | `servers` misconfigured or unreachable            | Confirm MCP server starts standalone; check G4 startup logs for MCP connection errors           |

---

## 20. Glossary

- **Automation** — a sequence of steps G4 runs against a target (browser, API, desktop, internal tool).
- **Driver** — the technology bridge between G4 and the target (e.g., ChromeDriver for Chrome, UiaDriver for Windows desktops).
- **Selenium hub** — a service (usually at `:4444/wd/hub`) that hands out browser sessions to drivers.
- **UIA (UI Automation)** — Microsoft's standard way to identify desktop UI elements by name and role.
- **Plugin** — a G4 building block. Native plugins ship with G4; MCP tools become plugins via the `servers` block.
- **Rule reference** — internal G4 mechanism for resolving plugin rules at run time. See `forceRuleReference`.
- **Think time** — the pauses between user actions while recording, used to make replays behave like a human is driving them.
- **MCP (Model Context Protocol)** — a standard protocol for AI agents to talk to tools and data sources. G4 absorbs MCP servers' tools into its plugin catalog.
- **G4 tools dispatcher** — the component that lets AI agents discover and call G4 plugins (including those from MCP servers) on demand.
- **Performance points** — named checkpoints in a workflow whose timings G4 captures.
