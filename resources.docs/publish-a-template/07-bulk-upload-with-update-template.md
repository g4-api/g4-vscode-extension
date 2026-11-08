# Module 7: Bulk-upload with Update-Template

[⬅ Back to overview](README.md) · [⬅ Module 6](06-publish-your-template.md)

⏱️ **About 4 minutes**

The Template Publisher sends **one** template at a time. Sometimes you have many template files already, for example after a teammate copied a `templates` folder into your project, or after you reset the Hub. The **Update-Template** command uploads several of them in one go.

In this module, you will:

- Run the command from the Command Palette
- Pick the template files to upload
- Read the result, and know about the restart that follows

---

## Step 1: Put the files in the `templates` folder

The command reads the **`templates`** folder of your project. Every file in that folder, and in its sub-folders, is offered, and the file name without its extension is the name you see in the list.

Each file must hold a template as valid JSON, the same shape the Template Publisher saves. A file that is not valid JSON is skipped and reported (see Step 4).

> **💡 Tip:** Templates you published with the Template Publisher are already in this folder (see [Module 6](06-publish-your-template.md)). You can upload them again with this command at any time.

---

## Step 2: Run the command

In VS Code:

1. Press **`Ctrl` + `Shift` + `P`** to open the Command Palette.
2. Type **`template definitions`**.
3. Select **G4: Update or Create Template Definitions**.

![The Command Palette with G4: Update or Create Template Definitions selected](images/07-update-template-command.png)


TODO(screenshot): the Command Palette showing the command.

> **📝 Note:** This command is in the Command Palette only. It has no right-click entry.

---

## Step 3: Pick the templates

A list opens with the title **Select a template to create or update**. The names are sorted from A to Z. You can pick more than one: tick each template you want, then press **Enter**.

![The list of template names with several ticked](images/07-pick-templates.png)

TODO(screenshot): the multi-select list with two or more templates ticked.

Closing the list, or confirming with nothing ticked, stops the command and nothing is sent.

---

## Step 4: Read the result

G4 sends the templates to the Hub one at a time, under a small **Updating templates** progress item in the status bar. One bad template does not stop the others.

- **All uploaded** — the status bar says **Template 'Name' updated successfully.** (or **Templates 'A', 'B' updated successfully.**) for 5 seconds.
- **Some failed** — an error box says **Could not update N of M template(s).** and lists each one as `'name': reason`. Typical reasons are a file that cannot be read as JSON, and a template the Hub rejects.

When at least one template was stored, G4 then asks the Hub to refresh its tools from the stored templates. If that refresh fails, you see **Templates were stored, but the G4 tool sync failed** with the reason.

> **⚠️ Important:** After a successful upload, VS Code **restarts the extension host**. Open tabs and notifications close for a moment, and G4 shows the outcome again once it is back. Save your work before you run the command.

---

## ✔ Check your work

- [ ] You found **G4: Update or Create Template Definitions** in the Command Palette
- [ ] You ticked more than one template in the list
- [ ] You saw a success message, or you know which template failed and why

---

**You did it** 🎉 You can now publish templates one at a time with the form, or many at once with the command. For problems, see [Troubleshooting](troubleshooting.md).
