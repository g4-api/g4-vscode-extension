# Module 10: Filter the designer toolbox

[⬅ Back to overview](README.md) · [⬅ Module 9](09-ready-made-recipes.md)

⏱️ **About 4 minutes**

The workflow designer has a **toolbox** with every plugin G4 knows. A big catalog can bury the few tools your team uses. `toolboxesFilter` hides the toolboxes and tools you do not want to see.

In this module, you will:

- Add a `toolboxesFilter` section to `manifest.json`
- Hide a whole toolbox, and hide or show single tools
- Know which rule wins when entries overlap

---

## Step 1: Where the filter lives

`toolboxesFilter` is a **top-level** key of `manifest.json`, next to `g4Server`. It is not inside `settings`. A new project does not include it, so you add it yourself.

```json
"toolboxesFilter": {
    "toolboxes": [
        { "name": "Http", "enabled": false }
    ],
    "tools": [
        { "name": "G4.Plugins.Common:SetCondition", "enabled": true }
    ]
}
```

- **`toolboxes`** — a list of entries. Each one names a **toolbox**, which is a plugin category.
- **`tools`** — a list of entries. Each one names a single **tool**, which is one plugin.
- Every entry has a `name` and an `enabled` value, `true` or `false`.

An entry with no `name`, or with an `enabled` that is not `true` or `false`, is **ignored**. A mistake in one entry can never hide a tool by accident.

---

## Step 2: Name a toolbox or a tool

- **Toolbox names** ignore upper and lower case and spaces. `UiControls` and `Ui Controls` are the same toolbox.
- **Tool names** ignore case. Write a tool in one of two ways:
    - **Qualified**, `Namespace:Key` (for example `G4.Plugins.Common:SetCondition`). It matches that plugin only.
    - **Bare**, just the key (for example `SetCondition`). It matches the key in **every** namespace.

> **📝 Note:** The **Containers** toolbox, which holds Stage and Job, is always shown. You cannot hide it.

---

## Step 3: Which rule wins

For each tool, the designer uses the **first** rule that matches:

1. The tool's **qualified** entry.
2. The tool's **bare** entry.
3. The entry for the tool's **toolbox**.
4. Otherwise the tool is **shown**.

If two entries name the same toolbox or tool, the **last one** wins.

This lets you hide a whole toolbox and still keep one tool from it:

```json
"toolboxesFilter": {
    "toolboxes": [
        { "name": "Http", "enabled": false }
    ],
    "tools": [
        { "name": "SendHttpRequest", "enabled": true }
    ]
}
```

Here every tool in `Http` is hidden except `SendHttpRequest`, because a tool entry beats a toolbox entry.

---

## Step 4: See the change

Save `manifest.json`. If a designer tab is open, it redraws its toolbox a moment after the save settles. You do not need to reopen the tab.

> **💡 Tip:** The designer also keeps a filter you set in its own filter button, in a browser cookie. When both name the same toolbox or tool, the **manifest entry wins**, and the designer locks that entry so the button cannot change it.

---

## ✔ Check your work

- [ ] `toolboxesFilter` sits at the top level of `manifest.json`, not inside `settings`
- [ ] Every entry has a `name` and a `true` or `false` value for `enabled`
- [ ] A tool entry is used to keep or hide a single tool, and a toolbox entry to hide a whole category
- [ ] After saving, the designer toolbox shows what you expect

---

**That's the path!** 🎉 For quick fixes see the [Troubleshooting checklist](troubleshooting.md); for terms see the [Glossary](glossary.md). Or head **back to** [the overview](README.md).
