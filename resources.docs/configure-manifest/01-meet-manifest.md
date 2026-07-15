# Module 1: Meet manifest.json

[⬅ Back to overview](README.md)

⏱️ **About 5 minutes**

Before you change anything, it helps to know the lay of the land: what `manifest.json` is, how it's organized, and the handful of rules that keep you out of trouble.

In this module, you will:

- Learn what `manifest.json` is and its top-level shape
- Learn how each setting is described in this guide
- Learn the golden rules for editing it safely

---

## Step 1: What manifest.json is

`manifest.json` is **one JSON object** that configures the G4 engine. It has a small set of top-level keys:

| Key | Purpose |
| --- | --- |
| `g4Server` | Address of the G4 engine |
| `authentication` | Token that proves you're allowed to use the engine |
| `driverParameters` | The default automation driver (e.g., Chrome) |
| `settings` | A container for all run-behavior settings (logging, timeouts, reports, plugins, recorders, and more) |

Everything under `settings` controls **how runs behave** and **what comes back** after a run — including plugins and MCP servers (there's no top-level `servers` key; they live under `settings.pluginsSettings`). The rest of this path walks through each area in turn.

---

## Step 2: How to read this guide

Each setting is described the same way, so you can skim to what you need:

- **What it is** — a one-sentence purpose.
- **What it does** — what changes when the value changes.
- **How to configure** — the JSON shape, with an example.
- **When to use it** — concrete situations where you'd touch it.
- **Pitfalls** — common mistakes to avoid.

> **💡 Tip:** If you're new, read Modules 1–3 in order (the essentials to reach the engine). The later modules are reference material you can jump into when a need comes up.

---

## Step 3: The golden rules for editing safely

`manifest.json` is JSON, and JSON is unforgiving. Follow these every time:

1. **Commas and braces matter.** A single missing comma anywhere breaks the whole file. Edit in a JSON-aware editor (like VS Code) so mistakes are flagged.
2. **Back up before you edit.** Copy `manifest.json` to `manifest.json.bak` so you can roll back in one step.
3. **Change one thing at a time.** If something breaks, you'll know exactly which change caused it.
4. **Restart G4 after changes.** Most settings are read at startup, not live.
5. **Never share `authentication.token`.** It's effectively your license key — treat it like a password.

> **⚠️ Important:** If G4 won't start after an edit, the cause is almost always a JSON syntax error. Validate the file in a JSON-aware editor before looking anywhere else.

---

## ✔ Check your work

- [ ] You can name the top-level keys of `manifest.json` (`g4Server`, `authentication`, `driverParameters`, `settings`, optional `servers`)
- [ ] You made a `.bak` copy of your `manifest.json`
- [ ] You know to restart G4 after changing settings

---

**Next up** 👉 [Module 2: Connect to the engine](02-connect-to-the-engine.md)
