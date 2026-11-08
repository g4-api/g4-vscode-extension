# Troubleshooting: Plugins, Externals, and MCP

[⬅ Back to overview](README.md)

Find the message or symptom in the table, then read its card. Each card gives the cause, how to check it, the fix, and where the message comes from in the extension source (paths are relative to the extension repository).

| Symptom or message | Card |
| --- | --- |
| `The G4 cache sync failed: ...` | [Cache sync failed](#the-g4-cache-sync-failed-reason) |
| `The G4 tool sync failed: ...` | [Tool sync failed](#the-g4-tool-sync-failed-reason) |
| `MCP server ... was not synchronized: ...` | [Server not synchronized](#mcp-server-name-url-was-not-synchronized-reason) |
| `MCP server ...: the tool ... was rejected: ...` | [Tool rejected](#mcp-server-name-url-the-tool-tool-was-rejected-reason) |
| `Changes to the G4 server, external repositories, or MCP servers need a window reload...` | [Reload prompt](#changes-to-the-g4-server-external-repositories-or-mcp-servers-need-a-window-reload-to-refresh-the-cache-reload-now) |
| `G4 Engine SignalR Connection Failed. Retrying...` | [Connection retry](#g4-engine-signalr-connection-failed-retrying) |
| `Loading G4 Engine externals and MCPs failed: ...` | [Loading failed](#loading-g4-engine-externals-and-mcps-failed-reason) |
| An external plugin is missing | [Plugin missing](#a-plugin-from-an-external-repository-is-missing) |
| MCP tools are missing after a save | [Tools missing](#mcp-tools-are-missing-after-saving-the-settings) |
| The editor did not restart after the sync | [No restart](#the-editor-did-not-restart-after-the-sync) |

---

## The G4 cache sync failed: REASON

- **Cause:** The request that loads your repositories and servers into the cache failed. The reason is either `The G4 Hub answered <status>: <problem>`, `The G4 Hub answered <status>.`, the text of a request that got no answer, or `No response from the G4 Hub.`
- **Check:** Open `/api/v4/g4/ping` on your Hub address. Look in the **G4 Extension** channel for the same line.
- **Fix:** Start the Hub, correct the address in **Connection**, and run the sync again. A `400` problem names the field that the Hub did not accept.
- **Source:** `src/commands/sync-cache.ts:101, 148`, `src/clients/g4-client.ts:93-105`

## The G4 tool sync failed: REASON

- **Cause:** The request that refreshes the tool catalog failed. It runs even after a failed cache sync.
- **Check:** Same as the card above.
- **Fix:** Fix the Hub problem and run the sync again. The editor does not restart after this failure, because a restart cannot load tools the Hub did not refresh.
- **Source:** `src/commands/sync-cache.ts:102, 148`

## MCP server 'NAME' (URL) was not synchronized: REASON

- **Cause:** The Hub could not load that server. The reason is the Hub's text, or `no reason was given`.
- **Check:** For a local server, run its **Command** and **Arguments** in a terminal on the Hub machine. For a remote server, open its **URL**. Check the **Headers** or **Environment Variables**.
- **Fix:** Correct the card, **Save**, and run the sync again. The other servers keep working.
- **Source:** `src/clients/g4-client.ts:61-66`

## MCP server 'NAME' (URL): the tool 'TOOL' was rejected: REASON

- **Cause:** The server answered, but the engine refused one of its tools as a plugin.
- **Check:** Read the reason. It names what the engine did not accept in that tool.
- **Fix:** Fix the tool on the server, or ignore the warning if you do not need that tool. The other tools of the server are loaded.
- **Source:** `src/clients/g4-client.ts:70-76`

## Changes to the G4 server, external repositories, or MCP servers need a window reload to refresh the cache. Reload now?

- **Cause:** You saved a change to **Connection**, **Plugins**, or **MCP Servers**. These are read when VS Code connects.
- **Check:** The prompt offers **Reload Window** and **Later**.
- **Fix:** Choose **Reload Window**. Choose **Later** to keep working. The saved settings take effect the next time the window loads, or after you run Sync-Cache.
- **Source:** `src/services/g4-settings-service.ts:211-212`

## G4 Engine SignalR Connection Failed. Retrying

- **Cause:** VS Code could not connect to the Hub. It tries again every five seconds, and syncs the cache once it connects.
- **Check:** Open `/api/v4/g4/ping` on your Hub address.
- **Fix:** Start the Hub, or fix **Connection**. No sync runs until the connection is made.
- **Source:** `src/extension.ts:426`

## Loading G4 Engine externals and MCPs failed: REASON

- **Cause:** The sync at connection threw an unexpected error. It is written to the **G4 Extension** log only.
- **Check:** Read the reason in the log.
- **Fix:** Run Sync-Cache by hand (Module 4) to see the failure as a notification.
- **Source:** `src/extension.ts:440`

## A plugin from an external repository is missing

- **Cause:** The Hub reports a result for each MCP server, but not for each external repository. A repository that fails to load shows no warning.
- **Check:** Open `/api/v4/g4/integration/cache` and search for the plugin. Check the **URL**, the **Version**, the **Headers**, and the **Credentials** on the card.
- **Fix:** Correct the card and run Sync-Cache.
- **Source:** `src/clients/g4-client.ts:482-489`

## MCP tools are missing after saving the settings

- **Cause:** Saving writes the card to `manifest.json`. The tools reach the cache only when a sync runs.
- **Check:** Did you choose **Later** on the reload prompt?
- **Fix:** Choose **Reload Window**, or run Sync-Cache.
- **Source:** `src/services/g4-settings-service.ts:178-194`, `src/commands/sync-cache.ts:75-78`

## The editor did not restart after the sync

- **Cause:** The restart follows only a manual sync whose tool sync succeeded. The sync at connection never restarts.
- **Check:** Look for a `The G4 tool sync failed` message.
- **Fix:** Fix the tool sync failure and run the command again.
- **Source:** `src/commands/sync-cache.ts:116-117`

---

[⬅ Back to overview](README.md)

---

For messages from other parts of G4 Studio, see the [product-level troubleshooting page](../troubleshooting.md).
