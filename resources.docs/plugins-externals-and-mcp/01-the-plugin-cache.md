# Module 1: The plugin cache

[⬅ Back to overview](README.md)

**Where you are:** Module 1 of 5

⏱️ **About 5 minutes**

Before you add anything, it helps to know where plugins are kept. The Hub holds one list of every plugin it can offer. That list is the plugin cache. In this module you see what feeds it, when it is filled, and how to look inside.

In this module, you will:

- Name the three sources of the cache
- Know when G4 fills the cache for you
- Look at the cache in a browser
- Find the plugins in the **G4 Documentations** view

---

## Step 1: Know the three sources

| Source | Where it is set | What it adds |
| --- | --- | --- |
| Built-in and installed plugins | Shipped with the Hub | The standard catalog |
| External repositories | **Plugins** section, `settings.pluginsSettings.externalRepositories` | Plugins served from a web address |
| MCP servers | **MCP Servers** section, `settings.pluginsSettings.servers` | One plugin for each tool the server exposes |

Both settings live under `settings.pluginsSettings` in your `manifest.json`. There is no top-level `servers` key.

```json
{
    "settings": {
        "pluginsSettings": {
            "externalRepositories": [],
            "forceRuleReference": true,
            "servers": {}
        }
    }
}
```

## Step 2: Know when the cache is filled

G4 sends your repositories and servers to the Hub in two cases:

1. **When VS Code connects to the Hub.** The status bar shows **Loading G4 Engine Externals and MCPs...**, then **G4 Engine is Connected and Ready**. This sync never restarts the editor.
2. **When you run Sync-Cache yourself.** Module 4 covers this one.

Right after the first sync, G4 rebuilds the **G4 Documentations** view, so its plugin-type folders match the cache.

## Step 3: Look inside the cache

Open this address in a browser, with your Hub address in front:

```text
/api/v4/g4/integration/cache
```

For a Hub on the default port that is `http://localhost:9944/api/v4/g4/integration/cache`. The answer lists every plugin in the cache, including the external and MCP ones after a sync.

![The cache JSON in a browser tab](images/01-cache-in-browser.png)

`TODO(screenshot)`: capture the browser tab with the cache JSON after a sync that loaded an external plugin.

## Step 4: Find plugins in the editor

1. Click the **G4 icon** in the Activity Bar.
2. Open **G4 Documentations**.
3. Expand a plugin-type folder. MCP tools appear in it next to the built-in plugins.

![The G4 Documentations view with an MCP tool listed](images/01-documentations-view.png)

`TODO(screenshot)`: capture **G4 Documentations** with a plugin-type folder expanded and an MCP tool in it.

---

## ✔ Check your work

- [ ] You can name the three sources of the plugin cache
- [ ] You know that the sync at connection does not restart the editor
- [ ] You opened `/api/v4/g4/integration/cache` and saw the plugin list
- [ ] You found the **G4 Documentations** view

---

**Next up** 👉 [Module 2: Add an external repository](02-add-an-external-repository.md)
