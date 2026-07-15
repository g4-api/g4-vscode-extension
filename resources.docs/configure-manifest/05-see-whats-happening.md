# Module 5: See what G4 is doing

[⬅ Back to overview](README.md) · [⬅ Module 4](04-tune-workflow-behavior.md)

⏱️ **About 4 minutes**

`settings.clientLogSettings` controls the **stream of progress messages** G4 sends back to whatever called it — your IDE, a script, an agent. This module tunes how much you see and how often.

```json
"clientLogSettings": {
    "agentLogSettings": {
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

In this module, you will:

- Control how often logs are pushed
- Set the log verbosity
- Filter logs by source when debugging

---

## Step 1: `agentLogSettings` — how often logs arrive

**What it is** — controls how often the engine pushes log batches to the client. When `enabled: true`, every `interval` milliseconds G4 ships any new log lines. With `enabled: false`, lines are buffered and only available at the end.

**When to use it:**

- **Keep enabled** for normal use — you'll see progress live.
- **Increase `interval`** (e.g., `5000`) on slow networks or when log volume is overwhelming.
- **Disable** only in batch/headless runs where nobody is watching and you want maximum throughput.

> **⚠️ Pitfall:** A very low `interval` (e.g., `50`) creates a flood of tiny messages and can slow the client.

---

## Step 2: `logLevel` — how much detail

**What it is** — the verbosity of log messages. Levels run from quietest to noisiest: `error` < `warning` < `information` < `debug` < `trace`.

**When to use it:**

- **`information`** — default, good for everyday runs.
- **`warning`** or **`error`** — production runs where you only want to see problems.
- **`debug`** — when investigating why a workflow does the wrong thing.
- **`trace`** — only when working with G4 support; very noisy.

> **⚠️ Pitfall:** `trace` and `debug` can produce huge logs — don't leave them on in production.

---

## Step 3: `sourceOptions` — filtering by source

**What it is** — a per-source filter, so you can focus on (or silence) specific plugins or components.

- `filter: "include"` — show **only** the sources on the list.
- `filter: "exclude"` — show **everything except** the sources on the list.
- `sources` — the list itself.

```json
"sourceOptions": {
    "filter": "include",
    "sources": ["MyPlugin", "Orchestrator"]
}
```

**When to use it:**

- Use **`include`** with a small list to focus on one area while debugging.
- Use **`exclude`** to silence a chatty plugin you don't care about.
- For most users, leave `sources: []` and `filter: "include"` — the engine falls back to its default source set.

> **⚠️ Pitfall:** `filter: "include"` with an empty `sources` list can mean "show nothing source-specific" on some configurations. If logs disappear after editing this, switch `filter` to `"exclude"` with an empty list to re-enable everything.

---

## ✔ Check your work

- [ ] `agentLogSettings.enabled` is `true` when you want live progress
- [ ] `logLevel` matches the situation (`information` daily, `debug` when investigating)
- [ ] `sourceOptions` is left at its defaults unless you're deliberately filtering

---

**Next up** 👉 [Module 6: Control your run output](06-control-your-output.md)
