# Module 3: The toolbox and its filter

[⬅ Back to overview](README.md) · [⬅ Module 2](02-canvas-and-text-side-by-side.md) · [Module 4 ➡](04-run-from-the-designer.md)

**Where you are:** Module 3 of 6

⏱️ **About 6 minutes**

The toolbox on the left of the canvas lists every plugin the Hub knows. That is a long list. A **filter** hides the toolboxes and tools you do not use. You can set it for yourself on the canvas, or for the whole project in `manifest.json`.

In this module, you will:

- Find a step with the toolbox search box
- Hide a toolbox and a single tool from the canvas
- Set the same filter for the whole project in `manifest.json`
- Know which one wins when the two disagree

---

## Step 1: Look at the toolbox

1. Open any bot on the canvas.
2. Look at the toolbox on the left.

The toolboxes are listed in alphabetical order. A **Containers** toolbox holds **Stage** and **Job**, and it is always shown. Type a name in the search box to keep only the steps that match.

---

## Step 2: Filter on the canvas

1. Click the funnel button next to the search box. Its tooltip reads **Filter toolboxes and tools**.

   ![The toolbox filter panel](images/03-filter-panel.png)

   `TODO(screenshot)`: capture the open filter panel with the **All** switch and a few toolboxes.

2. Read the header. It says **Toolboxes**, has an **All** switch, and a summary such as `12 of 15 shown`.
3. Turn off a toolbox switch. All its tools leave the toolbox on the canvas.
4. Click the arrow of a toolbox to list its tools, and turn a single tool off or on.

A switch has three states: on, off, and half-way (some of the tools of that toolbox are shown and some are hidden). The **All** switch works the same way for all toolboxes.

The filter is saved in a browser cookie named `g4-toolboxes-filter`, so it stays between visits to the canvas. The cookie is limited to 4000 characters. If your filter gets too large, the panel says **The filter is too large to save in the browser; turn fewer tools on or off.** `TODO(verify)`: whether the cookie survives closing VS Code was not checked.

---

## Step 3: Set the filter for the whole project

Add a `toolboxesFilter` section to the project's `manifest.json`:

```json
{
    "toolboxesFilter": {
        "toolboxes": [
            {
                "name": "Http",
                "enabled": false
            }
        ],
        "tools": [
            {
                "name": "G4.Plugins.Ui:SendKeys",
                "enabled": true
            }
        ]
    }
}
```

| Field | What it means |
| --- | --- |
| `toolboxes[].name` | The toolbox name. Case and spaces do not matter, so `UiControls` and `Ui Controls` are the same |
| `tools[].name` | The qualified tool name `Namespace:Key`, or only the key. A plugin without a namespace is in `G4.System`. Case does not matter |
| `enabled` | `true` shows it, `false` hides it |

An entry needs both a non-empty `name` and a true-or-false `enabled`. An entry that lacks either is ignored, so a typo can never hide a tool by accident. A missing or broken `toolboxesFilter` shows everything.

Save `manifest.json`. If a canvas tab is open, it picks up the change about a quarter of a second after the save. You do not need to reopen the bot.

---

## Step 4: Know which rule wins

For each tool, the first rule that matches decides:

1. A tool entry with its qualified name `Namespace:Key`
2. A tool entry with its bare key
3. The toolbox entry of the tool's toolbox
4. Nothing matched, so the tool is shown

If one name appears twice, the last entry wins. The manifest entries are placed after your cookie entries, so the project decides where the two disagree, one entry at a time. Your own entries for other names still apply.

In the panel, a switch that the manifest decides is locked. Point at it and the tooltip reads **Set by the project manifest**. The summary also says how many entries come from the manifest, for example `12 of 15 shown · 2 set by the project manifest`.

> **💡 Tip:** Tool entries can show one tool in a toolbox you hid. Hide the whole `Http` toolbox, then show only the one tool of it that you need, by its qualified name.

---

## ✔ Check your work

- [ ] You hid a toolbox on the canvas and the tools left the toolbox
- [ ] You added a `toolboxesFilter` section to `manifest.json` and saw the toolbox change after you saved
- [ ] You saw a locked switch with the tooltip **Set by the project manifest**
- [ ] You can say which rule decides when a toolbox and one of its tools disagree

---

**Next up** 👉 [Module 4: Run from the designer](04-run-from-the-designer.md)
