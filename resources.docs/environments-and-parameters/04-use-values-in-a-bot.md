# Module 4: Use values in a bot

[⬅ Back to overview](README.md) · [⬅ Module 3](03-push-with-update-environment.md) · [Module 5 ➡](05-environments-in-test-wright-and-flow-calls.md)

**Where you are:** Module 4 of 5

⏱️ **About 7 minutes**

The Hub now holds your environment. In this module you read one of its values inside a rule, set a default environment for a whole bot, and see how the `{{$ parameters.X }}` placeholder differs.

In this module, you will:

- Read an environment value with the `Get-Parameter` macro
- Choose a default environment in the bot's settings
- Know the five scopes of `Get-Parameter`
- Know what `{{$ parameters.X }}` is for

---

## Step 1: Read a value with Get-Parameter

1. Open a bot on the canvas.
2. Select a rule, for example a **SendKeys** step.
3. In its **Argument** field, type the macro below. In the JSON file this is the rule's `argument`.

   ```json
   {
       "$type": "Action",
       "pluginName": "SendKeys",
       "argument": "{{$Get-Parameter --Name:UserName --Scope:Application --Environment:Staging}}",
       "locator": "CssSelector",
       "onElement": "#user"
   }
   ```

   ![The Argument field with a Get-Parameter macro](images/04-get-parameter-argument.png)

   `TODO(screenshot)`: capture the step editor with the macro in the **Argument** field.

4. Run the bot (see the workflow editor path).

Before the rule runs, the engine replaces the macro with the value of `UserName` in `Staging`, which is `tester`. The step types `tester` into the field.

The parts of the macro:

| Part | What it does |
| --- | --- |
| `--Name:UserName` | The name of the value. Required |
| `--Scope:Application` | Where to read from. **The default is `Session`, not `Application`**, so write `Application` to read an environment |
| `--Environment:Staging` | Which environment. Optional, see step 2 |
| `--NoDecode` | Optional flag. Keeps the value as stored instead of decoding it |

The Hub stores environment values as Base64, and the macro decodes them for you. You never see the Base64 in the bot.

---

## Step 2: Choose a default environment

If you leave out `--Environment`, the macro reads from the bot's **default environment**. You set it in the bot's settings:

```json
{
    "settings": {
        "environmentsSettings": {
            "defaultEnvironment": "Staging",
            "returnEnvironment": false
        }
    }
}
```

With this setting, `{{$Get-Parameter --Name:UserName --Scope:Application}}` reads from `Staging`. An `--Environment` in the macro always wins over the setting.

| Setting | Default | What it does |
| --- | --- | --- |
| `defaultEnvironment` | `SystemParameters` | The environment that `Get-Parameter` reads when it has no `--Environment` |
| `returnEnvironment` | `false` | Adds the environment information to the response of the run |

> **⚠️ Warning:** The base bots that **Create a New G4 Project** writes into `base.bots` use the key `environmentSettings`, without the **s** after `environment`. The engine reads `environmentsSettings`, with the **s**, so the key in those files has no effect. Write `environmentsSettings` when you set a default environment.

---

## Step 3: Know the five scopes

`--Scope` picks where `Get-Parameter` looks:

| Scope | Where the value comes from |
| --- | --- |
| `Application` | The environment stored on the Hub. This is the one that this path is about |
| `User` | The operating-system environment variable of the user, on the machine where the engine runs |
| `Machine` | The operating-system environment variable of the machine, on the machine where the engine runs |
| `Process` | The operating-system environment variable of the engine process |
| `Session` | A value saved in the current automation session. This is the default scope |

For `User`, `Machine`, and `Process`, add `--NoDecode`. Those values are plain text, not Base64, and a plain word can look like valid Base64 and be decoded into nonsense.

```json
{
    "argument": "{{$Get-Parameter --Name:USERNAME --Scope:User --NoDecode}}"
}
```

---

## Step 4: Know what `{{$ parameters.X }}` is for

A parameter placeholder looks like this:

```json
{
    "$type": "Action",
    "pluginName": "OpenUrl",
    "argument": "{{$ parameters.Url }}"
}
```

It does **not** read an environment. The engine fills it from a `--Url:value` pair in the argument of the rule, template, or flow that owns it, or from the `parameters` of a flow call (module 5). The rules:

- There must be exactly **one space** after `{{$` and one before `}}`. `{{$parameters.Url}}` is not matched.
- Names are matched without regard to case.
- A placeholder with no value stays exactly as written.

So in a plain bot that you run from the canvas, no caller supplies `{{$ parameters.Url }}`, and the text stays as it is. Use `Get-Parameter` for values that come from an environment. Use `{{$ parameters.X }}` in templates and published flows, whose callers supply the values.

| | `Get-Parameter` | `{{$ parameters.X }}` |
| --- | --- | --- |
| Value comes from | An environment on the Hub, or the machine | The caller of a template or flow |
| Needs an upload first | Yes, for `Application` | No |
| Works in a bot run from the canvas | Yes | Only when a template or flow supplies the value |

---

## ✔ Check your work

- [ ] You put a `Get-Parameter` macro with `--Scope:Application` in a rule and the bot used the value
- [ ] You set `defaultEnvironment` with the key `environmentsSettings`
- [ ] You can name the default scope of `Get-Parameter`
- [ ] You can explain why `{{$ parameters.Url }}` stays as written in a plain bot

---

**Next up** 👉 [Module 5: Environments in Test Wright and in flow calls](05-environments-in-test-wright-and-flow-calls.md)
