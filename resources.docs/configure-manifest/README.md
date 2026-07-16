# Configure G4 with `manifest.json`

Welcome! 👋

`manifest.json` is the single file that tells the G4 engine **where it lives, who it trusts, how to talk to the outside world, and what to send back after each run**. This path walks you through it setting by setting — in plain language, with a JSON example each time, and clear advice on **when you'd actually reach for it**.

No coding required. If you can edit a text file carefully, you can configure G4.

> **💡 New to G4?** If you haven't set up the engine and run your first automation yet, do the [quick-start](../quick-start/README.md) first — then come back here to fine-tune the configuration.

---

## Who is this for?

Operators, QA engineers, and business users who configure G4 without necessarily writing code. If you know what you want G4 to *do*, this path shows you which setting to change.

## What you'll do

By the end you will be able to:

- Read and safely edit `manifest.json`
- Point G4 at the right engine and authenticate to it
- Choose the automation driver and tune how workflows run
- Control logging, reports, screenshots, and what comes back after a run
- Set up desktop recording, and extend G4 with plugins and MCP tools
- Reach for a ready-made recipe when you just want a known-good setup

## Prerequisites

- A working G4 setup (see the [quick-start](../quick-start/README.md))
- A text editor — ideally a JSON-aware one like VS Code, so it flags mistakes

> **⚠️ Important:** `manifest.json` is JSON — commas and braces matter, and a single typo can stop G4 from starting. Module 1 covers the golden rules for editing safely; read it first.

---

## Modules

Work through these in order, or jump to the setting you need.

| # | Module | What you'll do | Time |
| --- | --- | --- | --- |
| 1 | [Meet manifest.json](01-meet-manifest.md) | Learn the file's shape and the rules for editing it safely | ~5 min |
| 2 | [Connect to the engine](02-connect-to-the-engine.md) | Set where the engine lives and the token that authenticates you | ~4 min |
| 3 | [Pick your automation driver](03-pick-your-driver.md) | Choose the default driver and where its service lives | ~4 min |
| 4 | [Tune how workflows run](04-tune-workflow-behavior.md) | Timeouts, parallelism, and the shape of the response | ~5 min |
| 5 | [See what G4 is doing](05-see-whats-happening.md) | Control the live log stream — verbosity and filtering | ~4 min |
| 6 | [Control your run output](06-control-your-output.md) | Reports, screenshots, and the data returned after a run | ~6 min |
| 7 | [Set up desktop recording](07-set-up-recording.md) | Configure recorders and human-paced replay | ~6 min |
| 8 | [Extend G4 — plugins & MCP](08-extend-g4.md) | Add plugin sources and turn MCP tools into G4 plugins | ~5 min |
| 9 | [Ready-made recipes](09-ready-made-recipes.md) | Copy-paste configurations for common situations | ~3 min |

**Reference pages:** [Troubleshooting checklist](troubleshooting.md) · [Glossary](glossary.md)

---

**Ready?** 👉 Start with [Module 1: Meet manifest.json](01-meet-manifest.md)
