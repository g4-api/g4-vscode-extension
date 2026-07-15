# Module 9: Ready-made recipes

[⬅ Back to overview](README.md) · [⬅ Module 8](08-extend-g4.md)

⏱️ **About 3 minutes**

Sometimes you just want a known-good starting point. Copy the recipe closest to your situation, paste it into `manifest.json`, and adjust paths and your token.

In this module, you will:

- Pick a recipe for your situation
- Understand what each one optimizes for

> **⚠️ Important:** These snippets show the relevant keys only. Merge them into your existing `manifest.json` (don't replace the whole file), keep your real `authentication.token`, and mind the JSON commas.

---

## Step 1: Fast local development with full diagnostics

Verbose logs, live progress, reports that open themselves, screenshots on every step — everything on, for when you're building and debugging.

```json
"settings": {
    "clientLogSettings": { "logLevel": "debug", "agentLogSettings": { "enabled": true, "interval": 500 } },
    "automationSettings": { "loadTimeout": 60000, "searchTimeout": 15000, "maxParallel": 1, "returnFlatResponse": true, "returnStructuredResponse": true },
    "clientReportSettings": { "saveReports": true, "autoView": true, "reportsFolder": "." },
    "exceptionsSettings": { "returnExceptions": true },
    "performancePointsSettings": { "returnPerformancePoints": true },
    "screenshotsSettings": { "returnScreenshots": true, "onExceptionOnly": false, "convertToBase64": false, "outputFolder": "./shots" }
}
```

---

## Step 2: Lean, headless CI runs

Quieter logs, no auto-opening browser, screenshots only when something fails — tuned for pipelines where nobody is watching.

```json
"settings": {
    "clientLogSettings": { "logLevel": "warning", "agentLogSettings": { "enabled": true, "interval": 2000 } },
    "automationSettings": { "loadTimeout": 60000, "searchTimeout": 15000, "maxParallel": 1, "returnFlatResponse": true, "returnStructuredResponse": true },
    "clientReportSettings": { "saveReports": true, "autoView": false, "reportsFolder": "./ci-reports" },
    "exceptionsSettings": { "returnExceptions": true },
    "screenshotsSettings": { "returnScreenshots": true, "onExceptionOnly": true, "convertToBase64": false, "outputFolder": "./ci-reports/shots" }
}
```

---

## Step 3: Record a desktop app at steady, predictable pacing

A single UIA recorder with a think-time range, so replays feel human-paced.

```json
"recorderSettings": {
    "enabled": true,
    "useSandbox": false,
    "recorders": [
        {
            "enabled": true,
            "mode": "standard",
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

---

## Step 4: Make MCP tools appear as G4 plugins

Add a `servers` object under `settings.pluginsSettings`, then restart G4 and open the plugin catalog — your MCP tools now appear as plugins.

```json
"pluginsSettings": {
    "externalRepositories": null,
    "forceRuleReference": true,
    "servers": {
        "filesystem": { "command": "npx", "args": ["-y", "@modelcontextprotocol/server-filesystem", "C:\\work"] },
        "jira": { "command": "python", "args": ["-m", "jira_mcp_server"] }
    }
}
```

---

## ✔ Check your work

- [ ] You merged the recipe into your existing `manifest.json` (kept your token, valid JSON)
- [ ] You adjusted folders and paths to your machine
- [ ] You restarted G4 so the changes take effect

---

**That's the path!** 🎉 For quick fixes see the [Troubleshooting checklist](troubleshooting.md); for terms see the [Glossary](glossary.md). Or head **back to** [the overview](README.md).
