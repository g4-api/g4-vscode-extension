# Module 4: Sync-Cache and the restart

[⬅ Back to overview](README.md) · [⬅ Module 3](03-add-an-mcp-server.md)

**Where you are:** Module 4 of 5

⏱️ **About 6 minutes**

You can wait for the next window load, or you can send your repositories and servers to the Hub right now. The command **Synchronize G4 Cache with Configured Externals and MCP Servers** does that. It also restarts the extension host, so the refreshed tools are loaded. In this module you run it and read what it does.

In this module, you will:

- Run the Sync-Cache command
- Know the two requests it sends
- Understand why the editor restarts, and when it does not
- Tell the manual sync from the sync at connection

---

## Step 1: Run the command

1. Press `Ctrl+Shift+P` to open the Command Palette.
2. Type `Synchronize G4 Cache`.
3. Choose **G4: Synchronize G4 Cache with Configured Externals and MCP Servers**.

![The Command Palette with the synchronize command](images/04-command-palette.png)

`TODO(screenshot)`: capture the Command Palette filtered on `Synchronize G4 Cache`.

The status bar shows **Syncing the G4 cache** while the Hub works. The Hub gets up to 60 seconds to load every repository and server.

## Step 2: Know what it sends

The command reads `externalRepositories` and `servers` from your saved `manifest.json`, then makes two requests to the Hub:

| Order | Request | What it does |
| --- | --- | --- |
| 1 | `POST /api/v4/g4/integration/cache/sync` with `{ "repositories": [...], "servers": {...} }` | Loads your external repositories and MCP servers into the cache |
| 2 | `GET /api/v4/g4/mcp/sync` | Refreshes the tool catalog from the cache |

The second request runs even when the first one failed. That way, templates stored in the Hub stay available as tools.

## Step 3: Understand the restart

When the sync is done, VS Code restarts the extension host. The G4 views reload and the status bar runs through its connection messages. This is on purpose: the tools are loaded when the extension host starts, so a restart is the way to see the new ones.

| Case | Restart? |
| --- | --- |
| You ran the command and the tool sync succeeded | Yes |
| You ran the command and the tool sync failed | No. A restart cannot load tools the Hub did not refresh |
| The sync ran by itself when VS Code connected to the Hub | No |

> **📝 Note:** A restart closes open notifications and starts an empty **G4 Extension** output channel. Module 5 explains how G4 keeps the warnings that matter across the restart.

## Step 4: Read a failure

If a request fails, a notification shows the reason and the same text goes to the log:

| Message starts with | Meaning |
| --- | --- |
| `The G4 cache sync failed:` | The cache sync request failed |
| `The G4 tool sync failed:` | The tool sync request failed |

After it, you read either `The G4 Hub answered <status>: <reason>`, or the reason a request that got no answer carries, or `No response from the G4 Hub.`

![An error notification for a failed cache sync](images/04-sync-failed.png)

`TODO(screenshot)`: capture the error notification after a sync with the Hub stopped.

---

## ✔ Check your work

- [ ] You ran the command from the Command Palette
- [ ] You can name the two requests it sends
- [ ] You know that the editor restarts only after a manual sync whose tool sync succeeded
- [ ] You can tell the two failure messages apart

---

**Next up** 👉 [Module 5: Deferred warnings](05-deferred-warnings.md)
