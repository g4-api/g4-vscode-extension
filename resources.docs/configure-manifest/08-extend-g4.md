# Module 8: Extend G4 — plugins & MCP

[⬅ Back to overview](README.md) · [⬅ Module 7](07-set-up-recording.md)

⏱️ **About 5 minutes**

G4 is plugin-based, and you can grow its capabilities two ways: point it at more plugin sources, or connect **MCP servers** whose tools become G4 plugins automatically. Both live under `settings.pluginsSettings`. This module covers them, plus one setting reserved for the future.

In this module, you will:

- Configure `pluginsSettings`
- Connect MCP tools with `pluginsSettings.servers`
- Understand the (currently inactive) `queueManagerSettings`

---

## Step 1: `pluginsSettings`

```json
"pluginsSettings": {
    "externalRepositories": null,
    "forceRuleReference": true,
    "servers": null
}
```

**`externalRepositories`** — additional plugin sources beyond the built-in and locally-installed plugins. When configured, G4 loads plugins from those repositories at startup.

- **`null`** (default) — you only use plugins that ship with G4 or that you installed locally.
- **Configure it** when your team keeps a central plugin repository and you want every G4 instance to pull from it.
- **Pitfall:** depending on a remote repository means startup can fail if it's down or unreachable.

**`forceRuleReference`** — whether G4 recreates the rules reference when an automation initializes.

- **`true`** (default) — at initialize, G4 recreates the rules reference fresh, keeping it consistent with the current state at the start of each run.
- **`false`** — G4 reuses the existing reference. Only choose this when you have a deliberate reason (advanced caching where you understand the consequences).

> **⚠️ Pitfall:** Flipping `forceRuleReference` without understanding what "rules reference" means in your workflow can produce confusing run-to-run differences. When in doubt, leave it `true`.

---

## Step 2: `pluginsSettings.servers` — MCP tools as G4 plugins

`servers` is the **`pluginsSettings.servers`** object (not a top-level key). It uses **the same schema as `mcp.json`** — server names mapped to how each server is launched or reached.

**What it does** — every tool exposed by a connected MCP server is **automatically converted into a G4 plugin** at engine startup. Those generated plugins appear in the plugin catalog alongside built-in ones, indistinguishable to the user. You can then use them **manually** (drag from the catalog into a workflow) or **agentically** (an AI agent discovers and calls them through the G4 tools dispatcher).

```json
"pluginsSettings": {
    "externalRepositories": null,
    "forceRuleReference": true,
    "servers": {
        "my-database": {
            "command": "node",
            "args": ["./mcp-servers/db.js"],
            "env": { "DB_URL": "..." }
        },
        "my-jira": {
            "command": "python",
            "args": ["-m", "jira_mcp"]
        }
    }
}
```

**When to use it**

- You already run MCP servers and want those capabilities inside G4 workflows.
- You want G4 to reach a third-party system (Jira, Slack, a database, a CRM) without building a custom plugin — if an MCP server exists, you can adopt it instantly.
- You want AI agents to discover and orchestrate external tools through one consistent interface.

> **⚠️ Pitfall:** The MCP server must be reachable from the machine running G4, and a slow-starting server delays engine startup. MCP tools run with the permissions of the user who started G4 — be deliberate about what you connect.

---

## Step 3: `queueManagerSettings` (not yet useful)

```json
"queueManagerSettings": {
    "properties": null,
    "type": null
}
```

Only one provider exists today, so this section is effectively **inactive** — leave the defaults (`null`/`null`) and ignore it. In the future it will let G4 pull jobs from a **queue** (RabbitMQ, Azure Service Bus, and the like) instead of being called directly. You'll touch it once more providers exist and your team decides to drive G4 via a queue.

---

## ✔ Check your work

- [ ] `pluginsSettings.forceRuleReference` is `true` unless you have a deliberate reason otherwise
- [ ] Any MCP servers are under `pluginsSettings.servers` and point at servers that start and are reachable
- [ ] `queueManagerSettings` is left at its `null` defaults

---

**Next up** 👉 [Module 9: Ready-made recipes](09-ready-made-recipes.md)
