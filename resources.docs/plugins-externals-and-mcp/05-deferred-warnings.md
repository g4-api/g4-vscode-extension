# Module 5: Deferred warnings

[⬅ Back to overview](README.md) · [⬅ Module 4](04-sync-cache-and-the-restart.md)

**Where you are:** Module 5 of 5

⏱️ **About 4 minutes**

A sync can succeed and still report problems: an MCP server that did not answer, or a tool that the engine refused. Because the editor restarts right after the sync, a warning shown at that moment would vanish. G4 saves such warnings and shows them again when the editor is back. In this module you learn the three warnings and where to read them.

In this module, you will:

- Read the two kinds of sync warning
- Know when a warning is shown at once, and when after a restart
- Find the same text in the log

---

## Step 1: Read the two warnings

| Warning | Meaning |
| --- | --- |
| `MCP server 'NAME' (URL) was not synchronized: REASON` | The server did not answer, or the Hub could not load it. The `(URL)` part appears for a remote server only |
| `MCP server 'NAME' (URL): the tool 'TOOL' was rejected: REASON` | The server synchronized, but the engine refused that one tool |

`REASON` is the text the Hub sent. When it sent none, the warning says `no reason was given`.

> **📝 Note:** The Hub reports a result for each MCP server. It does not yet report a result for each external repository. A repository that fails to load shows no warning here, so check it by opening the cache in a browser (Module 1).

## Step 2: Know when you see them

| How the sync ran | Where the warnings go |
| --- | --- |
| You ran Sync-Cache and the editor restarts | Stored, then shown as warning notifications after the restart, and written to the new log |
| You ran Sync-Cache and no restart follows | Shown at once as warning notifications |
| The sync ran by itself at connection | Written to the log only, so a known unreachable server does not raise a warning on every start |

The stored warnings live in the extension's saved state until the next start. They are cleared before they are shown, so a reload while one is open does not show it twice. Template uploads use the same mechanism.

![A warning notification about an MCP server after a restart](images/05-deferred-warning.png)

`TODO(screenshot)`: capture the warning notification that starts with `MCP server` after the restart.

## Step 3: Read the log

1. Open **View** then **Output**.
2. Choose **G4 Extension** in the list.
3. Look for the line with the same text as the warning.

---

## ✔ Check your work

- [ ] You can read both warning formats
- [ ] You know why a warning appears again after the restart
- [ ] You know that a failing external repository is not reported per repository
- [ ] You can find the warning in the **G4 Extension** output channel

---

**Done?** 👉 Check the [Troubleshooting](troubleshooting.md) page, or go **back to** [the overview](README.md).
