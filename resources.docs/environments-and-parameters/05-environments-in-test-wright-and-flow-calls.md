# Module 5: Environments in Test Wright and in flow calls

[⬅ Back to overview](README.md) · [⬅ Module 4](04-use-values-in-a-bot.md)

**Where you are:** Module 5 of 5

⏱️ **About 5 minutes**

The same environment files can drive a whole test suite in G4 Studio Test Wright, and they can drive a flow that you call from code. This module shows both, and the one difference that matters: who uploads the environment.

In this module, you will:

- Pick an environment for a Test Wright suite
- Know what Test Wright does before it runs
- Choose an environment in a flow call
- Know which setting wins when two disagree

---

## Step 1: Pick an environment in Test Wright

G4 Studio Test Wright reads the same `environments` folder. In its header, the **Environment** list shows the environments you can use.

1. Open Test Wright.
2. Click **Environment** in the header.

   ![The Test Wright Environment list](images/05-test-wright-environment-list.png)

   `TODO(screenshot)`: capture the **Environment** list with one usable and one greyed-out entry.

3. Pick an environment, for example `Staging`.
4. Run your plan.

What Test Wright does differently from Studio:

| Topic | Studio (`Update-Environment`) | Test Wright |
| --- | --- | --- |
| Which files it lists | Every file in `environments`, including sub-folders, `.json` or `KEY=value` | Only `.json` files directly in `environments` |
| Who uploads | You, with the command | Test Wright, **before every run**, with the file you picked |
| Values that are not text | Sent as they are, so write them in quotes | Turned into text for you: numbers and `true` or `false` become their text, objects and arrays become JSON, `null` becomes an empty text |
| Name check | The Hub refuses a bad name | The entry is greyed out with **cannot be used** when the name has anything but letters, digits, and `_` |

After the upload, Test Wright sets `settings.environmentsSettings.defaultEnvironment` on the request of **every bot** in the run to the environment you picked. It replaces the bot's own default for that run.

So a bot reads the picked environment when its macro leaves out `--Environment`:

```json
{
    "argument": "{{$Get-Parameter --Name:BaseUrl --Scope:Application}}"
}
```

A macro with `--Environment:Staging` always reads `Staging`, whatever you picked.

If an environment cannot be synced, the run still starts, and the run console shows one of these lines:

| Console line | What it means |
| --- | --- |
| `Environment '<name>' was not synced: the engine accepts only letters, digits, and _ in environment names. Rename the file.` | The name has a character the Hub refuses |
| `Environment '<name>' cannot be read; the engine copy (if any) is used.` | The file is missing or is not a JSON object. The bots use whatever the Hub already holds under that name |
| `Environment '<name>' was not synced to the engine: <reason>` | The Hub refused the upload or did not answer. The reason names the status or the failure |

---

## Step 2: Choose an environment in a flow call

A published flow runs on the Hub. The call does **not** upload anything, so upload the environment first (module 3).

1. Save this body as `invoke.json`:

   ```json
   {
       "parameters": {
           "Url": "https://staging.example.com"
       },
       "settings": {
           "environmentsSettings": {
               "defaultEnvironment": "Staging"
           }
       }
   }
   ```

2. Call the flow. Replace `login-check` with the key of your flow:

   ```bash
   curl -X POST "http://localhost:9944/api/v4/g4/flows/login-check/invoke" \
        -H "Content-Type: application/json" \
        -d @invoke.json
   ```

The body has two kinds of input, and they do different jobs:

| Field | What it fills |
| --- | --- |
| `parameters` | The `{{$ parameters.Url }}` placeholders in the flow (module 4) |
| `settings.environmentsSettings.defaultEnvironment` | The environment that `Get-Parameter` reads when its macro has no `--Environment` |

The caller's `settings` only fill what the flow leaves out. If the flow already has its own `environmentsSettings`, the flow keeps its own. To be sure which environment is read, write `--Environment:Staging` in the macro, or leave `environmentsSettings` out of the flow.

> **💡 Tip:** The route for a flow in another namespace is `/api/v4/g4/flows/{namespace}/{key}/invoke`. The Swagger page at `/swagger` documents both.

---

## ✔ Check your work

- [ ] You picked an environment in Test Wright and ran a plan
- [ ] You can say who uploads the environment in Studio and who in Test Wright
- [ ] You called a flow with `parameters` and a default environment
- [ ] You know that `--Environment` in a macro beats a default environment

---

**You finished the path.** 🎉 Go back to the [overview](README.md), or open [Troubleshooting](troubleshooting.md) when something goes wrong.
