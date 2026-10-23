# Publish a Flow — Share Your Automation with the G4 Hub

Welcome! 👋

You built an automation (a **bot**) that works. Now you want to **share it** — so you, your team, or other projects can find it and run it again without rebuilding anything.

In G4, a shared automation is called a **flow**, and the place where flows live is the **G4 Hub**. The **Flow Publisher** is a form inside VS Code that turns your bot file into a flow and sends it to the Hub. No code, no commands: you fill in a few boxes and press **Publish**.

Plan for about **20 minutes** the first time through.

---

## Who is this for?

Anyone who has a working bot in the `bots` folder and wants to share it — testers, analysts, and developers alike. You do not need to understand JSON or the Hub's inner workings. Every box on the form is explained in plain words.

## What you'll do

By the end you will be able to:

- Open any bot in the **Flow Publisher** with a right-click
- Give your flow a **name** (key), a version, and a clear description
- File it under **categories** and **platforms** so people can find it
- Add **parameters** — the blanks people fill in each time they run the flow
- Understand the **warnings** the form shows, and why they never block you
- **Publish** the flow, and fix the most common problems

## Prerequisites

- A G4 project open in VS Code with the **G4 extension** installed (see the [quick start](../quick-start/README.md))
- At least one bot file in the project's `bots` folder (the quick start builds one in [Module 6](../quick-start/06-build-your-first-automation.md))
- The G4 engine running — the status bar at the bottom of VS Code says **G4 Engine is Connected and Ready**

> **💡 New words:** A **bot** is your automation file. A **flow** is a bot that has been published to the Hub with a name and a description. The **Hub** is the shared catalog that stores flows (and templates). A **key** is the flow's unique name.

---

## Modules

Work through these in order. Each one builds on the previous.

| # | Module | What you'll do | Time |
| --- | --- | --- | --- |
| 1 | [Open the Flow Publisher](01-open-the-flow-publisher.md) | Right-click a bot and find your way around the page | ~3 min |
| 2 | [Name and describe your flow](02-name-and-describe-your-flow.md) | Set the key, namespace, version, summary, and description | ~4 min |
| 3 | [Make your flow easy to find](03-make-your-flow-easy-to-find.md) | Add categories, aliases, platforms, and author details | ~3 min |
| 4 | [Add parameters](04-add-parameters.md) | Create the blanks that people fill in when they run your flow | ~5 min |
| 5 | [Review the automation](05-review-the-automation.md) | See exactly what will be published, and why the secret stays hidden | ~2 min |
| 6 | [Publish your flow](06-publish-your-flow.md) | Press **Publish**, handle warnings, and read the result | ~4 min |

**Stuck along the way?** See [Troubleshooting](troubleshooting.md).

> **📝 Note:** Want to share a **piece** of a bot (just one job's rules) instead of the whole bot? That is a **template**. See the sister guide: [Publish a Template](../publish-a-template/README.md).

---

**Ready?** 👉 Start with [Module 1: Open the Flow Publisher](01-open-the-flow-publisher.md)
