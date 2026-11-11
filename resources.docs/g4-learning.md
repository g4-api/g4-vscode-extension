# G4 Learning Paths

<!-- When you add a path, add a row to "Paths at a glance" and a section below. -->

Welcome! 👋 These guided **learning paths** take you from "nothing installed" to building, configuring, and recording real automations with G4 — click by click, in plain language.

Each path is a **self-contained folder of numbered modules** you can work through in order, or dip into whenever you need a specific answer. There are **nine paths** — pick one from the table below.

> **💡 New here?** Start with the **[Quick Start](quick-start/README.md)** — it gets you from zero to your first running automation.

---

## Paths at a glance

| # | Path | Best for | What you'll do | Time | Level |
| --- | --- | --- | --- | --- | --- |
| 1 | [📗 Quick Start](quick-start/README.md) | Starting from nothing | Deploy the sandbox, build and record your first automation | ~40 min | Beginner |
| 2 | [📘 Configure `manifest.json`](configure-manifest/README.md) | Tuning a project | Set up the engine, driver, reports, recorders, and the designer toolbox | ~45 min | All levels |
| 3 | [📙 Publish a Flow](publish-a-flow/README.md) | Sharing a finished bot | Name, describe, add parameters, and publish it to the Hub | ~20 min | Beginner |
| 4 | [📕 Publish a Template](publish-a-template/README.md) | Reusing part of a bot | Pick a job, expose properties, add an example, publish, and bulk-upload | ~30 min | Beginner |
| 5 | [📒 Autonomous Exploratory Run](autonomous-run/README.md) | Letting an agent explore and record | Configure an agent, start a run, and publish the flows it records | ~45 min | Intermediate |
| 6 | [🎬 Record an App](record-an-app/README.md) | Controlling a recording | Pick a capture mode, pause and resume, run scripts, record two machines, name the steps, and record an Android app | ~55 min | Intermediate |
| 7 | [🔌 Plugins, Externals, and MCP](plugins-externals-and-mcp/README.md) | Adding more actions | Add an external repository or an MCP server, sync the cache, and read the warnings | ~30 min | Intermediate |
| 8 | [📓 Work in the Workflow Editor](work-in-the-workflow-editor/README.md) | Working on the canvas | Open bots, edit, filter the toolbox, run, and read reports and logs | ~35 min | Intermediate |
| 9 | [📔 Environments and Parameters](environments-and-parameters/README.md) | Running bots in many places | Write environment files, push them, and read their values in bots | ~30 min | Intermediate |

---

## Paths

### 📗 Quick Start

Deploy the G4 sandbox, set up VS Code, and build and record your first automation — every step illustrated.

**You'll learn to:**

- Deploy the sandbox and start VS Code
- Install the G4 extension and create your first project
- Build an automation (open a page, wait, close the browser) and run it
- Record a desktop or browser session and replay it

**Format:** 8 core modules (+ 3 advanced) · troubleshooting · ~40 minutes · beginner-friendly

👉 **[Start the Quick Start »](quick-start/README.md)**

[⬆ Back to the index](#paths-at-a-glance)

---

### 📘 Configure `manifest.json`

Understand the file that controls a G4 project — every runtime setting, what it does, when to change it, and ready-made recipes.

**You'll learn to:**

- Connect to the engine and authenticate
- Choose the automation driver and tune how workflows run
- Control logging, reports, screenshots, and recorders
- Extend G4 with plugins and MCP tools
- Hide designer toolboxes and tools you do not use

**Format:** 10 modules · troubleshooting & glossary · ~45 minutes · all levels

👉 **[Start Configure `manifest.json` »](configure-manifest/README.md)**

[⬆ Back to the index](#paths-at-a-glance)

---

### 📙 Publish a Flow

Share a finished bot with the G4 Hub as a reusable flow — name it, describe it, add parameters, and publish.

**You'll learn to:**

- Open a bot in the Flow Publisher
- Name, describe, and classify your flow
- Add parameters and understand the warnings
- Publish and fix the most common problems

**Format:** 6 modules · troubleshooting · ~20 minutes · beginner-friendly

👉 **[Start Publish a Flow »](publish-a-flow/README.md)**

[⬆ Back to the index](#paths-at-a-glance)

---

### 📕 Publish a Template

Turn one job of a bot into a reusable building block — choose the rule settings it exposes, add an example, and publish.

**You'll learn to:**

- Pick a stage and job and open the Template Publisher
- Name the template and choose its file
- Expose properties and parameters, and connect them with tokens
- Add the required example and publish
- Upload many template files at once with Update-Template

**Format:** 7 modules · troubleshooting · ~30 minutes · beginner-friendly

👉 **[Start Publish a Template »](publish-a-template/README.md)**

[⬆ Back to the index](#paths-at-a-glance)

---

### 📒 Autonomous Exploratory Run

Let an AI agent explore your application while G4 records each scenario you ask for as its own flow.

**You'll learn to:**

- Add a Claude Code, Codex, or OpenCode harness, in a sandbox or on your machine
- Choose models, reasoning efforts, and the tool servers a run requires
- Pick recorders, write the prompt, then start, watch, and stop a run
- Find every file a run writes, then replay and publish a recorded flow

**Format:** 8 modules · troubleshooting with a card for every message · ~45 minutes · intermediate

👉 **[Start Autonomous Exploratory Run »](autonomous-run/README.md)**

[⬆ Back to the index](#paths-at-a-glance)

---

### 🎬 Record an App

Take control of a recording: choose a capture mode, pause one recorder, run scripts around the session, and give the recorded steps readable names.

**You'll learn to:**

- Choose Standard, User32, or Coordinate mode and set Use Offset
- Start, suspend, resume, and stop a session from the G4 Recorder panel
- Run a script before and after a recording and add it to the flow
- Record a desktop app and a browser in one session
- Know where the Hub stops building a flow for SAP
- Record an Android app and replay it through Appium

**Format:** 8 modules · troubleshooting · ~55 minutes · intermediate

👉 **[Start Record an App »](record-an-app/README.md)**

[⬆ Back to the index](#paths-at-a-glance)

---

### 🔌 Plugins, Externals, and MCP

Bring more actions into G4 from an external plugin repository or an MCP server, and keep the plugin cache in sync.

**You'll learn to:**

- Explain what the plugin cache holds and when it is filled
- Add an external repository with headers and credentials
- Add a local or a remote MCP server
- Run Synchronize G4 Cache and read the warnings it leaves

**Format:** 5 modules · troubleshooting · ~30 minutes · intermediate

👉 **[Start Plugins, Externals, and MCP »](plugins-externals-and-mcp/README.md)**

[⬆ Back to the index](#paths-at-a-glance)

---

### 📓 Work in the Workflow Editor

Get comfortable on the canvas: open a bot in each way, edit it next to its text, shape the toolbox, run it, and find the report and the logs.

**You'll learn to:**

- Open a bot from the Explorer in three ways and know which one writes edits back to the file
- Edit on the canvas and in the text of the same file, and undo
- Hide toolboxes and tools for yourself or for the whole project
- Start, stop, and reset a run, then open the saved report in the Report Viewer
- Read the output channels and set the log level

**Format:** 6 modules · troubleshooting · ~35 minutes · intermediate

👉 **[Start Work in the Workflow Editor »](work-in-the-workflow-editor/README.md)**

[⬆ Back to the index](#paths-at-a-glance)

---

### 📔 Environments and Parameters

Keep the values that change from place to place out of your bots: write an environment file, push it to the Hub, and read it in a bot, in Test Wright, and in a flow call.

**You'll learn to:**

- Write an environment as JSON or as `KEY=value` lines
- Push one or more environments with a single command and check them on the Hub
- Read a value with `Get-Parameter`, and choose a default environment
- Tell an environment value from a `{{$ parameters.X }}` placeholder
- Pick an environment in Test Wright and in a flow call

**Format:** 5 modules · troubleshooting · ~30 minutes · intermediate

👉 **[Start Environments and Parameters »](environments-and-parameters/README.md)**

[⬆ Back to the index](#paths-at-a-glance)

---

## Quick help

Four pages cover the whole extension, apart from any one path. The **New Project** command copies them into the project's `docs` folder, next to this index.

| Page | Best for | What it covers |
| --- | --- | --- |
| [🛠 Troubleshooting](troubleshooting.md) | A message you do not understand | Every notification the extension shows, with cause, check and fix |
| [🍳 Recipes](recipes.md) | A common job | Eight short recipes: assert, environments, data rows, branches, recording, flows and templates |
| [⚙️ Settings Editor Reference](settings-editor-reference.md) | Looking up a setting | Every field of the Settings Editor, the manifest key it writes, its default, and the Save, Reset and Apply behavior |
| [⌨️ Command Reference](command-reference.md) | Looking up a command | Every command and custom editor, where it appears, what it does, and the folder rules |

[⬆ Back to the index](#paths-at-a-glance)

---

## How these work

- **Self-contained** — everything (text and images) lives in this folder, so the guides work offline and travel with your project.
- **Numbered modules** — follow them in order for a smooth ramp, or jump straight to the one you need.
- **Check your work** — every module ends with a short checklist so you always know you're on track.

Happy automating! 🎉
