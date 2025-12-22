# G4 Engine – Visual Sequential Workflow for VS Code

## Table of Contents

1. [Overview](#overview)
2. [Key Capabilities](#key-capabilities)
3. [Setup](#setup)
4. [Quick Start](#quick-start)
5. [How It Works](#how-it-works)
6. [Why VS Code](#why-vs-code)
7. [Project Structure](#project-structure)
8. [Advanced Configuration: `manifest.json`](#advanced-configuration-manifestjson)
9. [Requirements](#requirements)

---

## Overview

**G4 Engine – VS Code Extension** brings the **complete visual sequential workflow experience** directly into Visual Studio Code.

Powered by the **Sequential Workflow Designer**, this extension allows you to **design, edit, and run automation workflows visually**, without leaving your editor.

You can drag & drop automation assets **directly from the VS Code workspace** into the workflow canvas, combining code, configuration, AI, and orchestration in a single place.

This turns VS Code into a **full automation and orchestration IDE**.

---

## Key Capabilities

* **Visual Sequential Workflow Designer**

  * Full drag & drop workflow editing inside VS Code
  * Real-time rendering and updates
  * No external browser or standalone app

* **Workspace-Native Drag & Drop**

  * Drag automation files directly from the VS Code Explorer
  * Supports multi-select and standard VS Code drag behavior
  * Tight coupling between workflows and project files

* **Native VS Code Integration**

  * Commands via Command Palette
  * Status bar G4 connection indicator
  * Dedicated Activity Bar (tools panel) integration

* **Extensible & AI-Ready**

  * Works seamlessly with Copilot and other AI extensions
  * Integrates with Git, CI/CD tools, terminals, and debuggers

---

## Setup

### 1. Install the Extension

Install from the VS Code Marketplace or from a `.vsix` file:

```bash
code --install-extension g4-engine-client.vsix
```

---

### 2. Create a New G4 Project

Open the **Command Palette** and run:

```none
G4: Create New Project
```

This initializes the required G4 project structure in your workspace.

---

### 3. Verify G4 Connection

Check the **VS Code status bar**:

* A visible **G4 status indicator** confirms the backend is connected
* If disconnected, ensure the G4 backend is running and reachable

---

### 4. Open the G4 Workflow Editor

1. Click the **G4 icon** in the **Activity Bar** (left-side panel)
2. Select **“Open G4 Workflow Editor”**

The **Visual Sequential Workflow Designer** opens inside VS Code.

---

## Quick Start

1. Open the **G4 Workflow Editor**
2. In the VS Code **Explorer**, locate automation files
3. **Drag & drop files directly onto the workflow canvas**

   * Use the standard **VS Code Shift-drag trick** when needed
4. Visually connect steps and configure them
5. Save and run the workflow using G4 commands

Everything happens **inside VS Code**, with full workspace awareness.

---

## How It Works

The extension embeds the **Sequential Workflow Designer** using native VS Code APIs:

* **Tree Providers** expose G4 assets in the workspace
* **WebView Views** host the workflow editor and recorder UI
* **Commands** manage project creation, workflow loading, and execution
* **Status Bar Integration** reflects live connection state

This ensures performance, stability, and a first-class VS Code experience.

---

## Why VS Code

By running inside VS Code, G4 Engine automatically gains:

* AI assistance (Copilot, Chat, and custom AI extensions)
* Git and source control integrations
* CI/CD tooling and terminals
* Familiar shortcuts, theming, and layouts
* A massive extension ecosystem

G4 doesn’t replace your editor — it **turns it into an automation IDE**.

---

## Project Structure

The G4 project structure is **alphabetically ordered**, exactly as it appears in VS Code:

```none
.
├── .github/
│   └── instructions/
│       ├── copilot-new-bot.instructions.md
│       └── copilot-new-flow.instructions.md
├── .vscode/
│   └── mcp.json
├── bots/
├── configurations/
├── environments/
├── models/
├── prompts/
├── resources/
├── templates/
├── workflows/
├── .env
└── manifest.json
```

### Notes

* **`.github/instructions`**
  Copilot instruction files that guide AI-assisted creation of bots and workflows.

* **`.vscode/mcp.json`**
  MCP / Copilot integration configuration for VS Code.

* **Domain folders** (`bots`, `workflows`, `models`, etc.)
  First-class G4 concepts, directly usable from the workflow designer via drag & drop.

---

## Advanced Configuration: `manifest.json`

The `manifest.json` file is the **central runtime configuration** for a G4 project.

It controls connectivity, drivers, automation behavior, recorders, diagnostics, and artifacts.

### Client Logging

Controls client-side and agent logging behavior.

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

---

### G4 Server Connection

```json
"g4Server": {
  "schema": "http",
  "host": "localhost",
  "port": "9944"
}
```

Supports local, remote, clustered, or air-gapped deployments.

---

### Authentication

```json
"authentication": {
  "token": ""
}
```

Typically injected via `.env` or CI secrets.

---

### Driver Parameters

```json
"driverParameters": {
  "driver": "ChromeDriver",
  "driverBinaries": "http://localhost:4444/wd/hub"
}
```

Defines default execution drivers and remote hubs.

---

### Automation Settings

```json
"automationSettings": {
  "loadTimeout": 60000,
  "maxParallel": 1,
  "returnFlatResponse": true,
  "returnStructuredResponse": true,
  "searchTimeout": 15000
}
```

Controls execution limits, parallelism, and response formats.

---

### Recorder Settings

Supports local or distributed recording.

```json
"recorderSettings": {
  "enabled": false,
  "recorders": [ ... ]
}
```

Includes machine labeling, think-time simulation, and remote drivers.

---

### Diagnostics & Artifacts

* Exception handling
* Performance metrics
* Screenshot capture

Used for debugging, CI pipelines, and analytics.

---

### When to Modify `manifest.json`

Customize this file when:

* Connecting to remote or clustered G4 backends
* Enabling recorders or distributed execution
* Running in CI/CD pipelines
* Operating in offline or air-gapped environments

---

## Requirements

* **Visual Studio Code** `^1.105.0`
* Node.js (for extension development/build)
* A compatible **G4 Engine backend** (local or remote)
