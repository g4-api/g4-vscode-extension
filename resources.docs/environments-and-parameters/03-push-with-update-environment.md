# Module 3: Push with Update-Environment

[⬅ Back to overview](README.md) · [⬅ Module 2](02-write-an-environment-file.md) · [Module 4 ➡](04-use-values-in-a-bot.md)

**Where you are:** Module 3 of 5

⏱️ **About 7 minutes**

Your files are only files until the Hub has them. The command **Update or Create Environment Variables** (id `Update-Environment`) sends one or more of them to the Hub. In this module you run it, read its answer, and check the result on the Hub.

In this module, you will:

- Upload several environments at once
- Read the success and the failure messages
- Check the stored values on the Hub
- Know what an upload changes and what it leaves alone

---

## Step 1: Run the command

1. Press `Ctrl+Shift+P` to open the Command Palette.
2. Type `G4:` and pick **G4: Update or Create Environment Variables**.

   ![The environment picker with two environments](images/03-pick-environments.png)

   `TODO(screenshot)`: capture the picker titled **Select an environment to create or update** with `Qa` and `Staging` listed.

3. Tick one or more environments. The list is sorted by name and allows several picks.
4. Press `Enter`.

The picker lists every file in your project's `environments` folder, including files in sub-folders. Each one is named by its file name without the extension. If two files share that name, only one of them is listed.

If you close the picker without ticking anything, nothing happens.

---

## Step 2: Read the answer

While the files upload, the status bar shows **Updating environments**.

**All uploads worked.** A message appears in the status bar for 5 seconds:

- `Environment 'Staging' updated successfully.`
- `Environments 'Qa', 'Staging' updated successfully.`

**At least one failed.** A red notification lists each failure:

```text
Could not update 1 of 2 environment(s). 'Qa': The file has no KEY=value lines.
```

The text after the environment name is the reason. It is one of the messages from module 2, or a message about the Hub:

| Reason starts with | What it means | Fix |
| --- | --- | --- |
| `The G4 Hub answered 400` | The Hub refused the request, for example because of a name with a dash, or a value that is not text | Rename the file, or put the values in quotes |
| `The G4 Hub answered <status>` | The Hub answered with another error status | Read the text after the status |
| A text about a timeout or a refused connection | The Hub did not answer within 5 seconds, or is not running | Start the Hub and check `g4Server` in `manifest.json` |

One failed file never stops the others. Every outcome is also written to the **G4 Extension** output channel, for example `Environment 'Staging' updated successfully.`

---

## Step 3: Check the values on the Hub

The Hub shows what it stored. Open this address in your browser. Use your Hub's host and port, and your environment's name:

```text
http://localhost:9944/api/v4/g4/environments/Staging?decode=true
```

You should see the names and values from `Staging.json`. Without `?decode=true` the values show as Base64 text, because that is how the Hub stores them.

To see every environment, open `http://localhost:9944/api/v4/g4/environments`.

> **💡 Tip:** The Hub's Swagger page at `/swagger` has these routes under **Environments**, with a **Try it out** button.

---

## Step 4: Know what an upload changes

| You | The Hub |
| --- | --- |
| Upload an environment that does not exist yet | Creates it |
| Upload an environment that exists | Adds the names that are new and **replaces the values** of names that exist |
| Remove a line from a file and upload again | **Keeps** the old name and value. An upload never removes a name |
| Write `KEY=` and upload | Stores an empty value for `KEY` |

To remove things from the Hub, use its routes (open `/swagger` and use **Try it out**):

| To remove | Route |
| --- | --- |
| One value | `DELETE /api/v4/g4/environments/{environment}/parameter/{name}` |
| A whole environment | `DELETE /api/v4/g4/environments/{name}` |
| Every environment | `DELETE /api/v4/g4/environments` |

> **⚠️ Warning:** `DELETE /api/v4/g4/environments` clears every environment on the Hub, not only yours.

---

## ✔ Check your work

- [ ] You ran **G4: Update or Create Environment Variables** and ticked two environments
- [ ] The status bar said they were updated
- [ ] You opened the `?decode=true` address and saw your values
- [ ] You know that removing a line from a file does not remove it from the Hub

---

**Next up** 👉 [Module 4: Use values in a bot](04-use-values-in-a-bot.md)
