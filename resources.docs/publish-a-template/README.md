# Publish a Template — Turn a Piece of a Bot into a Reusable Building Block

Welcome! 👋

Some parts of your automations get repeated: log in, search for a word, fill in a form. Instead of rebuilding that piece every time, you can turn it into a **template** — a named, reusable building block that any bot can call with a single step.

The **Template Publisher** is a form inside VS Code. You right-click a bot, pick the part you want to reuse, fill in a few boxes, and press **Publish**. G4 sends the template to the **G4 Hub** and saves a copy as a file in your project.

Plan for about **25 minutes** the first time through.

---

## Who is this for?

Anyone who builds automations and wants to reuse part of them — testers, analysts, and developers. You do not need to read JSON. Where JSON appears, the guide explains what to look at and what to leave alone.

## What you'll do

By the end you will be able to:

- Open the Template Publisher from a bot (or from an existing template)
- Choose which **stage** and **job** to turn into a template
- Name the template, choose its **file name**, and describe it
- Expose **properties** (the fixed rule settings) and **parameters** (your own blanks)
- Understand the **rules**, the token warnings, and what G4 cleans up for you
- Add the **example** that every template needs
- **Publish** and fix the most common problems

## Prerequisites

- A G4 project open in VS Code with the **G4 extension** installed (see the [quick start](../quick-start/README.md))
- A bot in the `bots` folder with the steps you want to reuse
- The G4 engine running — the status bar says **G4 Engine is Connected and Ready**

> **💡 New words:** A **bot** is your automation file. A **rule** is one step inside a bot (for example "click this button"). A **template** is a group of rules that has been given a name so other bots can call it. A **key** is the template's unique name. The **Hub** is the shared catalog that stores templates and flows.

---

## Modules

Work through these in order. Each one builds on the previous.

| # | Module | What you'll do | Time |
| --- | --- | --- | --- |
| 1 | [Open the Template Publisher](01-open-the-template-publisher.md) | Right-click, pick a stage and job, and read the page | ~4 min |
| 2 | [Name, save, and describe](02-name-save-and-describe.md) | Set the key, the file name, and the description | ~4 min |
| 3 | [Properties and parameters](03-properties-and-parameters.md) | Choose the rule settings and the blanks the template exposes | ~6 min |
| 4 | [Understand the rules](04-understand-the-rules.md) | See what is published, and how tokens and clean-up work | ~4 min |
| 5 | [Add an example](05-add-an-example.md) | Show how a rule calls your template | ~3 min |
| 6 | [Publish your template](06-publish-your-template.md) | Press **Publish**, handle warnings, and read the result | ~4 min |

**Stuck along the way?** See [Troubleshooting](troubleshooting.md).

> **📝 Note:** Want to share a **whole bot** instead of one piece? That is a **flow**. See the sister guide: [Publish a Flow](../publish-a-flow/README.md).

---

**Ready?** 👉 Start with [Module 1: Open the Template Publisher](01-open-the-template-publisher.md)
