# Autonomous Exploratory Run - Let an Agent Record Your Scenarios

Welcome! 👋

You can ask an AI agent to explore an application for you. The agent clicks and types on the screen, and G4 records every scenario you ask for as its own **flow**. You describe the scenarios once, then watch the run or come back later and open the flows.

This path shows how to set that up, start a run, follow it, and use what it produces. Plan for about **45 minutes** the first time through, most of it spent on the first run.

---

## Who is this for?

Anyone who already has a G4 project with a working recorder and wants an agent (Claude Code, Codex, or OpenCode) to do the exploring. You do not need to write code. You do need to be comfortable editing a few settings in the Settings Editor.

## What you'll do

By the end you will be able to:

- Explain what an autonomous run is and what it leaves in your project
- Add an agent **harness** to your project, running either in a sandbox or on your own machine
- Choose a model, a reasoning effort, and the tool servers a run cannot work without
- Pick the recorders and write a prompt that gets one flow per scenario
- Start a run, watch it, and stop it
- Find every file a run writes, and read the run summary
- Open a recorded flow, replay it, and publish it
- Look up what the `g4-recorder.ps1` helper does and what its exit codes mean

## Prerequisites

- A G4 project open in VS Code with the **G4 extension** installed
- The G4 Hub running and reachable at the address in your project's `manifest.json`
- At least one recorder that works. Check it with the recorder panel before you start
- One of the agent tools installed or available as a sandbox launcher: Claude Code, Codex, or OpenCode
- A G4 token in `manifest.json`

> **💡 New words:** A **harness** is one entry in your settings that says which agent tool to start and where it lives. A **scenario** is one thing you want recorded, such as "create a purchase order". A **run** is one start-to-finish session of the agent. The **run folder** is the folder that run writes into.

---

## Modules

Work through these in order. Each one builds on the previous.

| # | Module | What you'll do | Time |
| --- | --- | --- | --- |
| 1 | [What an autonomous run is](01-what-an-autonomous-run-is.md) | See what the run does and what it produces | ~4 min |
| 2 | [Configure a harness](02-configure-a-harness.md) | Add Claude Code, Codex, or OpenCode to your settings | ~8 min |
| 3 | [Models, efforts, and required tool servers](03-models-efforts-and-tool-servers.md) | Offer choices in the run form and fail fast when a server is missing | ~6 min |
| 4 | [Choose recorders and write the brief](04-choose-recorders-and-write-the-brief.md) | Pick the recorders and write the prompt | ~6 min |
| 5 | [Start and watch a run](05-start-and-watch-a-run.md) | Start the agent, follow the console, and stop it | ~8 min |
| 6 | [The run folder](06-the-run-folder.md) | Find every file a run writes | ~5 min |
| 7 | [Replay and publish a scenario](07-replay-and-publish-a-scenario.md) | Open a recorded flow, run it, and share it | ~6 min |
| 8 | [The recorder helper reference](08-the-recorder-helper-reference.md) | Look up the actions and exit codes of `g4-recorder.ps1` | ~4 min |

**Stuck along the way?** See [Troubleshooting](troubleshooting.md). It has one card for every message this feature can show.

---

**Ready?** 👉 Start with [Module 1: What an autonomous run is](01-what-an-autonomous-run-is.md)

[⬅ Back to the index](../g4-learning.md)
