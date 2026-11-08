# Module 2: Canvas and text side by side

[⬅ Back to overview](README.md) · [⬅ Module 1](01-open-a-bot-three-ways.md) · [Module 3 ➡](03-the-toolbox-and-its-filter.md)

**Where you are:** Module 2 of 6

⏱️ **About 7 minutes**

A `.g4` or `.g4bot` bot opened on the canvas shares one document with every text tab of the same file. In this module you see that for yourself: you edit on the canvas, watch the text change, edit the text, watch the canvas change, and then undo.

In this module, you will:

- Put the canvas and the text of one bot next to each other
- Watch an edit travel in both directions
- Undo and redo a canvas edit
- Save, and know what the saved file looks like
- Know what happens when Git changes the file

---

## How the two stay in step

The canvas does not keep its own copy of a `.g4` or `.g4bot` bot. Each canvas edit is written into the open document, the same document a text tab shows. Any change to the document that did not come from the canvas, such as typing in a text tab, **Undo**, or Git, is loaded back into the canvas.

| You do this | What happens |
| --- | --- |
| Drag a step or change a field on the canvas | About 0.3 seconds after you stop, the whole document is rewritten. The tab shows the unsaved-changes dot |
| Type in a text tab of the same file | The canvas redraws from the new text |
| Press `Ctrl+Z` | The last canvas edit is undone. The canvas redraws from the document |
| Press `Ctrl+S` | The document is saved to the file |
| Git changes the file, for example a checkout or a pull | The canvas redraws from the new file |

This is the behavior of ways 2 and 3 from module 1. A `.json` bot opened with **Open in Workflow Editor** does not work this way (module 1).

---

## Step 1: Put the canvas and the text side by side

1. Double-click a `.g4` bot under `bots`. It opens on the canvas.
2. Right-click the same file in the Explorer and click **Open as JSON**. A text tab opens.
3. Drag the text tab to the right half of the editor area, until VS Code shows a drop zone, then let go.

   ![The canvas on the left and the JSON text on the right](images/02-side-by-side.png)

   `TODO(screenshot)`: capture the canvas and the JSON text of the same bot next to each other.

---

## Step 2: Edit on the canvas

1. On the canvas, click a step and change its **Display Name**.
2. Wait a moment.
3. Look at the text on the right.

The new name is in the text, and both tabs show the unsaved-changes dot. You did not save anything yet.

---

## Step 3: Edit the text

1. In the text, change the same name to something else.
2. Look at the canvas.

The step on the canvas shows the new name.

> **⚠️ Warning:** While the text is not valid JSON, the canvas keeps what it last drew. A canvas edit made in that moment replaces the whole text. Fix the text before you touch the canvas.

---

## Step 4: Undo and redo

1. Click the canvas, change a field, and wait a moment.
2. Press `Ctrl+Z`.

The field goes back to its old value, on the canvas and in the text. `Ctrl+Y` (`Cmd+Shift+Z` on a Mac) redoes it.

Each canvas edit is one undo step. Several quick changes in one field, such as typing a word, are sent together after you pause, so they are usually one step.

---

## Step 5: Save

1. Press `Ctrl+S`.

The dots go away and the file on disk holds your edit.

What the saved file looks like:

- The canvas writes JSON with a 4-space indent and the file's own line ending (LF or CRLF).
- A final newline is kept if the file had one.
- Top-level fields the canvas does not draw stay where they are. A field the canvas removes is dropped.
- The first canvas edit rewrites the whole file, so a file formatted another way shows a larger Git diff once.

> **📝 Note:** State that designer plugins keep for a bot, such as a collapsed region, is remembered for each bot file in the workspace, not in the file. They never mark the tab as changed and never appear in Git.

---

## Step 6: Git and other outside changes

Check out another branch, pull, or restore the file in the Source Control view. VS Code reloads the open document, and the canvas redraws from it. If you have unsaved edits when the file changes on disk, VS Code's usual file-conflict rules apply.

---

## ✔ Check your work

- [ ] You saw a canvas edit appear in the text
- [ ] You saw a text edit appear on the canvas
- [ ] **Undo** reverted a canvas edit
- [ ] You saved with `Ctrl+S` and the dots went away

---

**Next up** 👉 [Module 3: The toolbox and its filter](03-the-toolbox-and-its-filter.md)
