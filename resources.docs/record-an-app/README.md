# Record an App - Capture a Session and Turn It into a Flow

Welcome! 👋

Instead of building an automation action by action, you can **record** one. You start a recorder, use your application, and stop. G4 turns what you did into a workflow you can run, edit, and publish.

This path goes deeper than the Quick Start. It covers how to pick a capture mode, how to pause a recording, how to run your own scripts around it, what to do when you record more than one machine at once, and how to record an Android app. Plan for about **55 minutes**.

---

## Who is this for?

Anyone who finished the [Quick Start](../g4-learning.md) recording module and wants to control the recording instead of accepting the defaults. You do not need to write code. You will edit a few settings in the Settings Editor, and in one module you will write a short script.

## What you'll do

By the end you will be able to:

- Choose a recorder and a capture mode (Standard, User32, or Coordinate) and know when each fits
- Start, pause, resume, and stop a recording from the **G4 Recorder** panel
- Run a script before and after a recording, and decide whether it becomes a workflow step
- Explain why clicks inside VS Code never appear in your recording
- Record two machines or two kinds of application in one session
- Give the recorded steps readable names
- Know where the Hub stops building a flow for a SAP recording
- Record an Android app and replay it through Appium

## Prerequisites

- A G4 project open in VS Code with the G4 extension installed
- The G4 Hub running and reachable from the address in your `manifest.json`
- At least one recorder that works. The Quick Start module on verifying recorders shows how to check
- A G4 token in `manifest.json`

> **💡 New words:** A **recorder** is a small service that watches an application and reports each click and keystroke. A **session** is one start-to-stop recording. A **capture mode** decides how a click is stored: as an action on an element, or as a physical mouse click. A **job** is one block of steps in a workflow. The Hub builds one job for each run of events from one recorder.

---

## Modules

Work through these in order. Each one builds on the previous.

| # | Module | What you'll do | Time |
| --- | --- | --- | --- |
| 1 | [Pick a recorder and a capture mode](01-pick-a-recorder-and-a-capture-mode.md) | Choose Standard, User32, or Coordinate, and set Use Offset | ~8 min |
| 2 | [Start, suspend, resume, and stop](02-start-suspend-resume-and-stop.md) | Run a session from the G4 Recorder panel | ~8 min |
| 3 | [Scripts before and after](03-scripts-before-and-after.md) | Run a script around the session and add it to the flow | ~8 min |
| 4 | [Why VS Code never appears](04-why-vs-code-never-appears.md) | Understand how your own editor is kept out of the recording | ~4 min |
| 5 | [Two recorders at once](05-two-recorders-at-once.md) | Record a desktop app and a browser in one session | ~6 min |
| 6 | [Name your recorded steps](06-name-your-recorded-steps.md) | Replace default step names with readable ones | ~5 min |
| 7 | [Record SAP and where flow generation stops](07-record-sap-and-where-flow-generation-stops.md) | See what the SAP recorder does and what the Hub refuses | ~4 min |
| 8 | [Record an Android app](08-record-an-android-app.md) | Prepare a device and Appium, record a session, and replay it | ~15 min |

**Stuck along the way?** See [Troubleshooting](troubleshooting.md).

---

**Ready?** 👉 Start with [Module 1: Pick a recorder and a capture mode](01-pick-a-recorder-and-a-capture-mode.md)

[⬅ Back to the index](../g4-learning.md)
