# Environments and Parameters - Keep Changing Values Out of Your Bots

Welcome! 👋

A bot often needs values that change from place to place: a web address, a user name, an expected text. If you write them inside every bot, moving from staging to production means editing every bot. An **environment** keeps those values in one file, and a bot reads them by name.

This path shows how to write an environment file, push it to the Hub, read its values in a bot, and use the same file in Test Wright and in a flow call. It also explains the other kind of value, the **parameter** placeholder, so you never mix the two up.

Plan for about **30 minutes**.

---

## Who is this for?

Anyone who runs the same bots against more than one place, or who does not want passwords and addresses inside bot files. You do not need to write code.

## What you'll do

By the end you will be able to:

- Explain what an environment is and where its file lives
- Write an environment file as JSON or as `KEY=value` lines
- Push one or more environments to the Hub with one command
- Read an environment value in a bot with `Get-Parameter`
- Tell an environment value from a `{{$ parameters.X }}` placeholder
- Pick an environment in Test Wright and in a flow call

## Prerequisites

- A G4 project open in VS Code with the **G4 extension** installed. The folder you open is the project's `src` folder
- The G4 Hub running and reachable at the address in your project's `manifest.json`
- A bot you can run, for example the one from the Quick Start path

> **💡 New words:** An **environment** is a named set of values that the Hub stores. A **parameter** is one named value in it. A **scope** says where a value is read from.

---

## Modules

Work through these in order. Each one builds on the previous.

| # | Module | What you'll do | Time |
| --- | --- | --- | --- |
| 1 | [What an environment is](01-what-an-environment-is.md) | See where the files live and how a value travels | ~4 min |
| 2 | [Write an environment file](02-write-an-environment-file.md) | Write a JSON file and a `KEY=value` file | ~7 min |
| 3 | [Push with Update-Environment](03-push-with-update-environment.md) | Upload one or more environments and check them on the Hub | ~7 min |
| 4 | [Use values in a bot](04-use-values-in-a-bot.md) | Read a value with `Get-Parameter` and know when `{{$ parameters.X }}` applies | ~7 min |
| 5 | [Environments in Test Wright and in flow calls](05-environments-in-test-wright-and-flow-calls.md) | Pick an environment for a suite or a flow call | ~5 min |

**Stuck along the way?** See [Troubleshooting](troubleshooting.md).

---

**Ready?** 👉 Start with [Module 1: What an environment is](01-what-an-environment-is.md)

[⬅ Back to the index](../g4-learning.md)
