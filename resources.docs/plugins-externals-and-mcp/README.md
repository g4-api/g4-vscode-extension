# Plugins, Externals, and MCP - Bring More Actions into G4

Welcome! 👋

G4 ships with a catalog of building blocks called **plugins**. You are not limited to it. You can load more plugins from an **external repository**, and you can connect an **MCP server** so that each of its tools becomes a G4 plugin. This path shows how to add either one, how G4 keeps its plugin cache up to date, and what to do when something does not load.

Plan for about **30 minutes**.

---

## Who is this for?

Anyone who needs an action that the built-in catalog does not have: a team that keeps a shared plugin repository, or a project that already runs MCP servers for tools such as Jira, a database, or a browser. You do not need to write code. You edit a few cards in the Settings Editor.

## What you'll do

By the end you will be able to:

- Explain what the plugin cache is and when it is filled
- Add an external plugin repository with credentials and headers
- Add an MCP server, local or remote
- Run **Synchronize G4 Cache** and know why the editor restarts
- Read the warnings that appear after a restart

## Prerequisites

- A G4 project open in VS Code with the G4 extension installed
- The G4 Hub running and reachable from the address in your `manifest.json`
- For an external repository, its address and, if it needs one, a username and password or a token
- For an MCP server, the command that starts it or its address

> **💡 New words:** The **plugin cache** is the Hub's list of every plugin it can offer. An **external repository** is a web address that serves extra plugins. An **MCP server** exposes tools over the Model Context Protocol. A **synchronization** loads your repositories and servers into the cache.

---

## Modules

Work through these in order. Each one builds on the previous.

| # | Module | What you'll do | Time |
| --- | --- | --- | --- |
| 1 | [The plugin cache](01-the-plugin-cache.md) | See what the cache holds and when it is filled | ~5 min |
| 2 | [Add an external repository](02-add-an-external-repository.md) | Fill in a repository card | ~7 min |
| 3 | [Add an MCP server](03-add-an-mcp-server.md) | Connect a local or a remote server | ~8 min |
| 4 | [Sync-Cache and the restart](04-sync-cache-and-the-restart.md) | Run the sync and understand the restart | ~6 min |
| 5 | [Deferred warnings](05-deferred-warnings.md) | Read problems that appear after a restart | ~4 min |

**Stuck along the way?** See [Troubleshooting](troubleshooting.md).

---

**Ready?** 👉 Start with [Module 1: The plugin cache](01-the-plugin-cache.md)

[⬅ Back to the index](../g4-learning.md)
