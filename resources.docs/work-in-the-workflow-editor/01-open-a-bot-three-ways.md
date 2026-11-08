# Module 1: Open a bot three ways

[⬅ Back to overview](README.md) · [Module 2 ➡](02-canvas-and-text-side-by-side.md)

**Where you are:** Module 1 of 6

⏱️ **About 6 minutes**

A bot can be opened on the canvas or as plain text. Which way you pick decides which tab you get, and whether your canvas edits are written back to the file. In this module you try all three ways.

In this module, you will:

- Open a `.json` bot with **Open in Workflow Editor**
- Open a `.g4` or `.g4bot` bot straight on the canvas
- Open a `.g4` or `.g4bot` bot as JSON text
- Know what happens when the Hub is not running

---

## The three ways at a glance

| # | Way | Works on | Where | Tab you get | Canvas edits written to the file? |
| --- | --- | --- | --- | --- | --- |
| 1 | Right-click **Open in Workflow Editor** | `.json` | Under a `bots` or `base.bots` folder | A **G4 Workflow** tab named after the file | No. Use **Export Definition** to keep them |
| 2 | Double-click the file | `.g4` and `.g4bot` | Under a `bots` folder | A **G4 Workflow Editor** tab named after the file | Yes, into the open file. You save it with `Ctrl+S` |
| 3 | Right-click **Open as JSON** | `.g4` and `.g4bot` | Under a `bots` folder | A normal text tab with the JSON language | Not applicable. You edit the text |

A folder "under" `bots` means any level below your project's `src` folder. So `bots/login.json` and `bots/web/login.json` both count. The check is on whole folder names, so `my-bots` does not count, and `base.bots` does not count for ways 2 and 3.

> **📝 Note:** Both menu entries are in the Explorer right-click menu only. They are not in the Command Palette.

---

## Step 1: Open a `.json` bot with Open in Workflow Editor

1. In the Explorer, open the `bots` folder.
2. Right-click a `.json` bot.
3. Click **Open in Workflow Editor**.

   ![The Explorer right-click menu with Open in Workflow Editor](images/01-open-in-workflow-editor.png)

   `TODO(screenshot)`: capture the Explorer menu on a `.json` bot under `bots`.

A progress message **Opening G4 Workflow editor…** appears while the extension downloads the designer page from the Hub. Then a tab named after your file opens, with the canvas inside.

Files under `base.bots` show only **Open in Workflow Editor**. The base bots that **Create a New G4 Project** writes are there.

> **⚠️ Warning:** This tab holds a copy of the bot. Your canvas edits stay in the tab and are not written to the file. Click **Export Definition** to save your work (module 4).

---

## Step 2: Open a `.g4` or `.g4bot` bot on the canvas

1. In the Explorer, double-click a file that ends in `.g4` or `.g4bot` under `bots`.

   ![A .g4 bot open in the G4 Workflow Editor](images/01-g4-bot-in-the-canvas.png)

   `TODO(screenshot)`: capture a `.g4` bot open on the canvas, with its tab title visible.

The file opens on the canvas, not as text, because the **G4 Workflow Editor** is the default editor for these two file types. This editor is tied to the file: your canvas edits go into the file (module 2).

A `.g4` file that is **not** under a `bots` folder opens as normal text instead.

---

## Step 3: Open a `.g4` or `.g4bot` bot as JSON

1. Right-click a `.g4` or `.g4bot` file under `bots`.
2. Click **Open as JSON**.

   ![The Open as JSON menu entry](images/01-open-as-json.png)

   `TODO(screenshot)`: capture the Explorer menu on a `.g4` bot with **Open as JSON** shown.

A text tab opens. It is not a preview tab, so it stays open when you open another file, and VS Code uses the JSON language for colors and checks.

> **💡 Tip:** To switch the tab you are in, use VS Code's **View: Reopen Editor With...** and pick **G4 Workflow Editor** or **Text Editor**. The same file opens again in the other editor.

---

## Other ways to reach the canvas

- Run **G4: Open G4 Engine Embedded Application** from the Command Palette. It opens an empty canvas in a **G4 Workflow** tab. Use **Import Definition** (module 4) to fill it.
- Drag a bot file from the Explorer onto the canvas while you hold `Shift`. The canvas and the tab title change to that bot.

---

## When the Hub is not running

The designer page comes from the Hub, so no Hub means no canvas.

1. The tab shows a message that starts with `The G4 Workflow designer could not be loaded from the G4 Hub at`, followed by the Hub address and the reason.
2. The same text appears as a red notification.
3. A tab opened with **Open in Workflow Editor** closes itself after the notification. A tab for a `.g4` file stays open and shows the message.

Start the Hub, then open the bot again. See [Troubleshooting](troubleshooting.md).

---

## ✔ Check your work

- [ ] You opened a `.json` bot with **Open in Workflow Editor** and saw a **G4 Workflow** tab
- [ ] You opened a `.g4` or `.g4bot` bot by double-clicking and saw the canvas
- [ ] You opened a `.g4` or `.g4bot` bot with **Open as JSON** and saw text
- [ ] You can say which of the three ways writes canvas edits back to the file

---

**Next up** 👉 [Module 2: Canvas and text side by side](02-canvas-and-text-side-by-side.md)
