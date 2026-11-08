# Module 1: What an environment is

[⬅ Back to overview](README.md) · [Module 2 ➡](02-write-an-environment-file.md)

**Where you are:** Module 1 of 5

⏱️ **About 4 minutes**

Before you write anything, it helps to know where an environment lives and how a value gets from a file on your disk into a running bot. This module is the map for the rest of the path.

In this module, you will:

- Find the `environments` folder of your project
- Follow a value from the file to the bot
- Learn the rule for environment names
- Learn how an environment differs from a parameter

---

## Step 1: Find the environments folder

1. In the Explorer, look inside your project's `src` folder.
2. Find the `environments` folder.

   ![The environments folder in the Explorer](images/01-environments-folder.png)

   `TODO(screenshot)`: capture the Explorer with the `environments` folder next to `bots` and `templates`.

**Create a New G4 Project** creates this folder, and it starts empty. Each file you put in it is one environment. The **name** of the environment is the file name without its extension. So `Staging.json` is the environment `Staging`, and `Staging.env` is the same environment name.

---

## Step 2: Follow a value from the file to the bot

```text
environments/Staging.json
        |
        |  G4: Update or Create Environment Variables
        v
G4 Hub  (stores the environment "Staging", values encoded as Base64)
        |
        |  {{$Get-Parameter --Name:BaseUrl --Scope:Application --Environment:Staging}}
        v
a rule in your bot  (gets the decoded value)
```

| Stage | What happens |
| --- | --- |
| The file | You write names and values. Nothing reads the file during a run |
| The upload | The command sends the file to the Hub. Until you upload, the Hub does not know your values |
| The Hub | It stores the environment by name. Values are stored Base64-encoded |
| The bot | A rule asks for one value by its name and by the environment name. The value arrives decoded |

> **⚠️ Warning:** A run uses the copy on the **Hub**, not the file on your disk. If you change a file and forget to upload it, the bot still sees the old value. Test Wright uploads for you before a run (module 5). The Studio canvas does not.

---

## Step 3: Learn the name rule

The Hub accepts an environment name only when it is made of letters, digits, and the underscore `_`. That means:

| File name | Environment name | Accepted? |
| --- | --- | --- |
| `Staging.json` | `Staging` | Yes |
| `Prod_EU.json` | `Prod_EU` | Yes |
| `prod-eu.json` | `prod-eu` | No. The Hub answers `400` |

Rename a file that has a dash, a space, or a dot inside its name.

The Hub also has one environment of its own, `SystemParameters`. It is the **default environment**: a rule that does not name an environment reads from the one in `settings.environmentsSettings.defaultEnvironment`, and that setting starts as `SystemParameters` (module 4).

---

## Step 4: Tell an environment from a parameter

Both hold named values, but they come from different places and are used in different ways.

| | Environment value | Parameter placeholder |
| --- | --- | --- |
| Looks like | `{{$Get-Parameter --Name:BaseUrl --Scope:Application --Environment:Staging}}` | `{{$ parameters.BaseUrl }}` |
| Comes from | The environment stored on the Hub | A `--BaseUrl:value` pair in the argument of the rule, template, or flow that owns the placeholder, or a flow call |
| Best for | Values that differ per place: addresses, users, expected texts | Values a template or a published flow takes from its caller |

Module 4 shows both with an example.

---

## ✔ Check your work

- [ ] You found the `environments` folder of your project
- [ ] You can explain why a changed file needs an upload
- [ ] You know that a dash in a file name makes the Hub refuse the environment
- [ ] You can tell `Get-Parameter` from `{{$ parameters.X }}`

---

**Next up** 👉 [Module 2: Write an environment file](02-write-an-environment-file.md)
