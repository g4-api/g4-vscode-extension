# Module 2: Add an external repository

[⬅ Back to overview](README.md) · [⬅ Module 1](01-the-plugin-cache.md)

**Where you are:** Module 2 of 5

⏱️ **About 7 minutes**

An external repository serves plugins that are not in the built-in catalog. A team can keep one in a central place and let every project load from it. In this module you add a repository card, fill in its fields, and save.

In this module, you will:

- Open the **Plugins** section of the Settings Editor
- Add a repository card and fill in its fields
- Set headers and credentials
- Save and read the reload prompt

---

## Step 1: Open the Plugins section

1. In the Explorer, right-click `manifest.json` and choose **Open Settings Editor**.
2. Expand the section **Plugins**.

   ![The Plugins section with the rules switch and the repository list](images/02-plugins-section.png)

   `TODO(screenshot)`: capture the **Plugins** section with **Rebuild Rules at the Start of Every Run** and an empty repository list.

The section starts with one switch:

| Switch | Manifest key | Default | What it does |
| --- | --- | --- | --- |
| **Rebuild Rules at the Start of Every Run** | `settings.pluginsSettings.forceRuleReference` | on | Recommended on. Keeps each run consistent with the current state |

Below it, **External Plugin Repositories** says: *Load extra plugins from remote repositories at startup. Leave empty to use built-in plugins only.*

## Step 2: Add a card

1. Click **+ Add Repository**. A card titled **Repository 1** opens.
2. Fill in the fields:

   | Field | Manifest key | Rule |
   | --- | --- | --- |
   | **Name** | `name` | Required. A unique name, up to 155 characters. The card title follows it |
   | **URL** | `url` | Required. The repository endpoint, a full address such as `https://...` |
   | **Version** | `version` | Required. The repository API version, a whole number of 1 or more |
   | **Timeout** | `timeout` | In seconds. The default is 300 |
   | **Capabilities** | `capabilities` | Advanced. Extra key and value pairs sent to the repository |
   | **Headers** | `headers` | Optional HTTP headers sent with each request |
   | **Credentials** | `credentials` | Optional authentication for the endpoint |

   ![A repository card with name, URL, version, and timeout filled in](images/02-repository-card.png)

   `TODO(screenshot)`: capture an open repository card with **Name**, **URL**, **Version**, and **Timeout** filled in.

## Step 3: Set credentials

**Credentials** has three choices:

| Choice | Fields | Stored as |
| --- | --- | --- |
| **None** | none | No `credentials` value |
| **Basic (Username & Password)** | **Username**, **Password** | `{ "type": "basic", "username": ..., "password": ... }` |
| **Bearer (Token)** | **Token** | `{ "type": "bearer", "token": ... }` |

The password and the token fields are secret fields in the editor.

> **⚠️ Be careful:** The values are saved as plain text in `manifest.json`. Do not commit the file with real credentials in it.

## Step 4: See it in the manifest

A repository with a bearer token and one header:

```json
{
    "settings": {
        "pluginsSettings": {
            "externalRepositories": [
                {
                    "name": "team-plugins",
                    "url": "https://plugins.example.com",
                    "version": 4,
                    "timeout": 300,
                    "headers": {
                        "X-Team": "qa"
                    },
                    "credentials": {
                        "type": "bearer",
                        "token": "<your-token>"
                    }
                }
            ],
            "forceRuleReference": true,
            "servers": {}
        }
    }
}
```

## Step 5: Save and reload

Click **Save**. Because the repository list is read when G4 connects, a prompt appears:

```text
Changes to the G4 server, external repositories, or MCP servers need a window reload to refresh the cache. Reload now?
```

- **Reload Window** reloads VS Code. On start-up G4 syncs the cache with your repository.
- **Later** keeps your settings on disk. They take effect the next time the window loads, or when you run Sync-Cache in Module 4.

> **📝 Note:** Going from no list to an empty list is not a change, so it never raises the prompt.

---

## ✔ Check your work

- [ ] You added a card with a **Name**, a **URL**, and a **Version**
- [ ] You know the default **Timeout** is 300 seconds
- [ ] You can choose between **None**, **Basic**, and **Bearer** credentials
- [ ] You know why the reload prompt appears

---

**Next up** 👉 [Module 3: Add an MCP server](03-add-an-mcp-server.md)
