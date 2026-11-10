# Module 4: Choose recorders and write the brief

[⬅ Back to overview](README.md) · [⬅ Module 3](03-models-efforts-and-tool-servers.md)

**Where you are:** Module 4 of 8

⏱️ **About 6 minutes**

The run form has four things to fill in: the recorders, the harness with its model and effort, and the **prompt**. Your prompt becomes the first part of the **brief**, the full set of instructions the agent receives. This module covers the recorders and the prompt, and shows what G4 adds around your words.

In this module, you will:

- Pick the recorders the agent may record with
- Write a prompt that gets one flow per scenario
- Read the brief G4 builds from your prompt
- Know what G4 checks before it starts the agent

---

## Step 1: Pick the recorders

The **Recorders** field lists every recorder in `settings.recorderSettings.recorders` of your `manifest.json`, including the ones that are switched off. Recorders that are **enabled** in the manifest start switched on in the form. Switch on the ones the agent may record with.

![The Recorders drop-down with two recorders](images/04-pick-recorders.png)

`TODO(screenshot)`: capture the **Recorders** drop-down open with at least two recorders.

Each recorder is shown by its label and driver, for example `machine-a (UiaDriver)`, with its address underneath. A recorder without a label is shown by its driver alone, and a recorder without a driver is shown as **Recorder**.

Two things can disable the field:

- Recording is turned off in the settings. The form shows **Recording is turned off. Turn on Recorders in the Settings Editor to start a run.**
- No recorder is configured. The form shows **No recorders are configured. Add one under Recorders in the Settings Editor.**

Both notices have an **Open Settings** button.

> **📝 Note:** If your settings use the sandbox for recorders (`useSandbox` on), G4 starts the sandboxed recorder apps before the agent begins, as it does for a manual recording.

---

## Step 2: Pick the harness, model, and effort

1. Choose a **Harness**. Under it, a line tells you whether it runs in a sandbox partition or on this machine.
2. Choose a **Model**. This is the model that plans and drives every step.
3. Choose a **Reasoning Effort**. This sets how long the model thinks before each step.
4. Optionally set a **Time Limit (minutes)**. The agent is stopped when the run takes longer. Leave it empty for no limit. It starts from the **Time Limit** in the settings and applies to this run only.

The **Model** and **Reasoning Effort** lists follow the harness you picked. Module 3 shows where they come from.

---

## Step 3: Write the prompt

The **Prompt** field is required. Describe the scenarios to record, what to look for, and what to avoid. Ask for several scenarios to get one flow each.

![The Prompt field with a list of three scenarios](images/04-write-the-prompt.png)

`TODO(screenshot)`: capture the **Prompt** field with a short list of scenarios.

Here is a prompt that asks for three flows:

```text
Explore the Purchase Orders application. Record these scenarios, each as its own flow:

1. Create a purchase order with one line item.
2. Search for an order by number and open it.
3. Cancel an open order.

Do not change any existing orders. Stop and report if a screen asks for a password.
```

The agent plans and records the scenarios in order, one recording at a time.

---

## Step 4: Know what the agent receives

G4 writes your prompt into `brief.md` in the run folder, and sends the same text to the agent on standard input. The brief has these parts:

| Part | What it holds |
| --- | --- |
| **Your task** | Your prompt, as you wrote it |
| **How this run works** | The run folder path, and the list of recorders with their addresses |
| **Recording rules** | The exact `g4-recorder.ps1` commands for plan, start, stop, result, and status, and the rule that only one recording is open at a time |
| **Seeing and controlling the screen** | The G4 visual skills (`g4-visual-observe`, `g4-visual-ground`) and the screen tools (`GetScreenshot`, `ConvertScreenshotPoint`, `MovePointer`, `ResolveGroundedElement`) |
| **Ground rules** | Never use Visual Studio Code, never print the authentication variable, do not install software, and stop if the screen cannot be seen |
| **When you are done** | Make sure no recording is open, then end with a short summary |

The brief never holds your G4 token. The helper reads it from an environment variable.

> **💡 Tip:** You can open `brief.md` from the result view with the **Brief** button, or from the run folder.

---

## Step 5: Know the checks before the start

When you click **Start**, the extension checks these things in order and stops at the first problem:

1. No other autonomous run is running.
2. No manual recording is running.
3. The harness, model, and effort are ones your settings offer.
4. At least one configured recorder is picked.
5. The prompt is not empty.
6. A workspace folder is open.
7. The G4 Hub answers at the address of your G4 server (the default is `http://localhost:9944`).

The **Start** button also stays disabled, with a note beside it, while the form is not complete. The note tells you what to fix next. The troubleshooting page lists every message.

---

## ✔ Check your work

- [ ] At least one recorder is switched on in the **Recorders** field
- [ ] A harness, a model, and a reasoning effort are selected
- [ ] The **Prompt** names the scenarios you want, one flow each
- [ ] The **Start** button is enabled, with no note beside it

---

**Next up** 👉 [Module 5: Start and watch a run](05-start-and-watch-a-run.md)
