# G4 Engine – Visual Sequential Workflow for VS Code

**Design, run, and record automations visually — right inside VS Code.**

[![Build, Pack & Release G4™ VSCode Extension](https://github.com/g4-api/g4-vscode-extension/actions/workflows/pipeline.yaml/badge.svg)](https://github.com/g4-api/g4-vscode-extension/actions/workflows/pipeline.yaml)

[![VS Marketplace](https://img.shields.io/badge/VS%20Marketplace-Install-007ACC?logo=visualstudiocode&logoColor=white)](https://marketplace.visualstudio.com/items?itemName=g4-api.g4-engine-client)
![License](https://img.shields.io/github/license/g4-api/g4-vscode-extension)

---

## Overview

**G4 Engine** turns Visual Studio Code into a full automation and orchestration IDE.

G4 is a plugin-based automation engine that runs controlled workflows across **web browsers, desktop applications, APIs, and internal tools** — and those workflows can be driven by **people, CI/CD schedules, or AI agents**. This extension brings the **[Sequential Workflow Designer](https://github.com/nocode-js/sequential-workflow-designer)** straight into your editor: you build automations by **dragging and dropping** building blocks onto a canvas, connect them, and run them — no code required. When you *do* want code, it's right there too, next to Git, terminals, and your favorite AI assistants.

**What you can automate:** fill in and submit web forms, drive line-of-business desktop apps, call APIs, move data between systems — or record a person clicking through a task once and replay it on demand.

---

## Get Started

### Option 1 — Deploy the G4 sandbox (recommended)

One command installs everything you need — the engine, the tools, browser drivers, and a preconfigured copy of VS Code:

**Windows (PowerShell):**

```powershell
irm https://raw.githubusercontent.com/g4-api/g4-sandbox/main/install-g4-sandbox.ps1 | iex
```

**Linux:**

```bash
curl -fsSL https://raw.githubusercontent.com/g4-api/g4-sandbox/main/install-g4-sandbox.sh | bash
```

### Option 2 — Install the extension only

Already have VS Code and a G4 backend? Install **G4 Engine Client** from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=g4-api.g4-engine-client), or from a packaged `.vsix`:

```bash
code --install-extension g4-engine-client.vsix
```

👉 **New to G4?** The **[Quick Start](resources.docs/quick-start/README.md)** walks you from zero to your first running automation, click by click.

---

## Documentation

Two guided **learning paths** take you from zero to productive — each a self-contained folder of numbered modules:

* 📗 **[Quick Start](resources.docs/quick-start/README.md)** — deploy the sandbox, install the extension, and build and record your first automation, click by click.
* 📘 **[Configure `manifest.json`](resources.docs/configure-manifest/README.md)** — every runtime setting explained: what it does, when to change it, and copy-paste recipes.

---

## Key Capabilities

* **Visual [Sequential Workflow Designer](https://github.com/nocode-js/sequential-workflow-designer)** — full drag-and-drop workflow editing on a live canvas inside VS Code, with real-time rendering. No external browser or standalone app.
* **Workspace-native drag & drop** — drag automation files straight from the VS Code Explorer onto the canvas; workflows stay tightly coupled to your project files.
* **Record and replay** — capture a user clicking through a desktop or browser session and turn it into a workflow you can run again.
* **Native VS Code integration** — Command Palette commands, a dedicated Activity Bar tools panel, and a status-bar indicator for the live G4 connection.
* **Extensible & AI-ready** — works alongside Copilot and other AI extensions, and turns **MCP servers' tools into G4 plugins** automatically.

---

## Why VS Code

By running inside VS Code, G4 Engine inherits an ecosystem you already trust:

* AI assistance — Copilot, Chat, and custom AI extensions
* Git and source control
* CI/CD tooling, terminals, and debuggers
* Familiar shortcuts, theming, and layouts

G4 doesn't replace your editor — it **turns it into an automation IDE**.

---

## How It Works

The workflow canvas is powered by the **[Sequential Workflow Designer](https://github.com/nocode-js/sequential-workflow-designer)** and embedded in VS Code using native webview APIs. The extension talks to the G4 engine over HTTP:

* **Tree providers** surface G4 assets from your workspace.
* **Webview views** host the workflow editor and recorder UI.
* **Commands** manage project creation, workflow loading, and execution.
* **Status-bar integration** reflects the live engine connection.

The result is performance, stability, and a first-class VS Code experience.

---

## Project Structure

Running **G4: Create a New G4 Project** scaffolds the layout below and opens the **`src/`** folder as your workspace:

```none
<project-root>/
├── build/                              # build outputs
├── docs/
│   ├── examples/
│   └── G4 Manifest Configuration Guide.md
├── scripts/                            # custom scripts
└── src/                                # opened as the VS Code workspace
    ├── .agents/
    ├── .claude/
    ├── .github/
    ├── .vscode/
    │   └── mcp.json                    # MCP endpoint for Copilot / AI tools
    ├── base.bots/
    │   ├── chrome-automation-base.json
    │   └── uia-automation-base.json
    ├── base.templates/
    │   └── template-base.json
    ├── bots/                           # your automations
    ├── environments/
    ├── resources/
    ├── templates/
    └── manifest.json                   # project runtime configuration
```

> **📘 Configuration:** `manifest.json` is the project's runtime configuration — connectivity, drivers, run behavior, recorders, and more. See the [Configure `manifest.json`](resources.docs/configure-manifest/README.md) learning path for every setting.

---

## Requirements

* **Visual Studio Code** `^1.105.0`
* A compatible **G4 Engine backend** — local (via the sandbox) or remote
* Node.js — only for extension development/build
