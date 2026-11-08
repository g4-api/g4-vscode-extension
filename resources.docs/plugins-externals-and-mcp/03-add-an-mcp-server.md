# Module 3: Add an MCP server

[⬅ Back to overview](README.md) · [⬅ Module 2](02-add-an-external-repository.md)

**Where you are:** Module 3 of 5

⏱️ **About 8 minutes**

An MCP server exposes tools over the Model Context Protocol. When you connect one, each of its tools becomes a G4 plugin. You can drag that plugin into a workflow, or let an AI agent find and call it. In this module you add a server card for a local process and for a remote address.

In this module, you will:

- Open the **MCP Servers** section
- Add a local (stdio) server
- Add a remote (HTTP or SSE) server
- Check the manifest shape

---

## Step 1: Open the MCP Servers section

1. In the **Settings Editor**, expand **MCP Servers**.
2. Click **+ Add MCP Server**. A card opens with **Name** and **Type**.

   ![A new MCP server card with Name and Type](images/03-new-server-card.png)

   `TODO(screenshot)`: capture a new MCP server card with **Name** and **Type** visible.

| Field | Rule |
| --- | --- |
| **Name** | Required. A short identifier. It is the key of the server in `manifest.json`. A name that is already in use is refused |
| **Type** | Required. **Local Process (stdio)**, **Remote (HTTP)**, or **Remote (SSE)** |
| **Timeout** | Optional connection timeout, a number of 0 or more. Leave it empty for the server default |

The card shows different fields for each type.

## Step 2: Add a local server

Choose **Type** **Local Process (stdio)**. G4 starts the program itself.

| Field | Manifest key | What it does |
| --- | --- | --- |
| **Command** | `command` | Required. The program that starts the server, for example `node`, `python`, or `npx` |
| **Arguments** | `args` | Passed to the command, in this order |
| **Working Directory** | `workingDirectory` | The folder the process runs in. Optional |
| **Environment Variables** | `env` | Passed to the process |

```json
{
    "settings": {
        "pluginsSettings": {
            "servers": {
                "jira": {
                    "type": "stdio",
                    "command": "python",
                    "args": [
                        "-m",
                        "jira_mcp_server"
                    ],
                    "env": {
                        "JIRA_URL": "https://jira.example.com"
                    }
                }
            }
        }
    }
}
```

## Step 3: Add a remote server

Choose **Type** **Remote (HTTP)** or **Remote (SSE)**. G4 connects to an address.

| Field | Manifest key | What it does |
| --- | --- | --- |
| **URL** | `url` | Required. The remote MCP endpoint, a full address such as `https://...` |
| **Headers** | `headers` | Optional HTTP headers sent with each request |

```json
{
    "settings": {
        "pluginsSettings": {
            "servers": {
                "docs-search": {
                    "type": "http",
                    "url": "https://mcp.example.com/mcp",
                    "headers": {
                        "Authorization": "Bearer <your-token>"
                    }
                }
            }
        }
    }
}
```

> **⚠️ Be careful:** MCP tools run with the permissions of the user who started G4, and a slow server delays start-up. Connect only servers you trust, and reach them from the machine that runs the Hub.

## Step 4: Save

Click **Save**. The reload prompt from Module 2 appears, because the server list is read when G4 connects. When no server is left, the editor leaves the `servers` key out of the saved file.

---

## ✔ Check your work

- [ ] You added one local server and one remote server
- [ ] You can name the field that is required for each type
- [ ] You know that **Name** is the key under `servers`
- [ ] You know that each MCP tool becomes a G4 plugin

---

**Next up** 👉 [Module 4: Sync-Cache and the restart](04-sync-cache-and-the-restart.md)
