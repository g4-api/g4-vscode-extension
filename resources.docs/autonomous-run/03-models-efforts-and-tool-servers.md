# Module 3: Models, efforts, and required tool servers

[⬅ Back to overview](README.md) · [⬅ Module 2](02-configure-a-harness.md)

**Where you are:** Module 3 of 8

⏱️ **About 6 minutes**

A harness can offer a list of **models** and **reasoning efforts** in the run form, and it can name the **tool servers** a run cannot work without. In this module you fill in those three lists and see how G4 passes your choices to each agent tool.

In this module, you will:

- Offer models and reasoning efforts in the run form
- See the command-line option each tool receives
- Name the tool servers a Claude Code run requires
- Read the start line that reports them

---

## Step 1: Add models and efforts

Open the harness card in the **Autonomous Runs** section. It has two lists:

| Field | Manifest key | What it does |
| --- | --- | --- |
| **Models** | `models` | The models offered in the run form. The first is the default. Empty means the tool uses its own default |
| **Reasoning Efforts** | `efforts` | The efforts offered in the run form. The first is the default. Empty means the tool uses its own default |

![The Models and Reasoning Efforts lists of a harness card](images/03-models-and-efforts.png)

`TODO(screenshot)`: capture the **Models** and **Reasoning Efforts** lists with two entries each.

Blank entries and repeated entries are dropped, and the order is kept. When a list is empty, the run form shows one choice, **Harness default**.

The efforts you can list are free text. The run form shows these values with friendly names:

| Value | Shown as |
| --- | --- |
| `minimal` | Minimal |
| `low` | Low |
| `medium` | Medium |
| `high` | High |
| `xhigh` | Extra High |
| `max` | Max |
| `ultra` | Ultra |

Any other value is shown as you typed it.

> **📝 Note:** G4 checks your pick at the start. A model or effort that is not in the harness list is refused with `The model "..." is not offered by the harness "..."` or `The effort "..." is not offered by the harness "..."`. When the list is empty, nothing is checked.

---

## Step 2: See how each tool receives your choice

G4 turns your model and effort into command-line options. The prompt is never part of the command line. Every tool reads it from standard input.

| Tool | Always passed | Model | Effort |
| --- | --- | --- | --- |
| Claude Code | `--print --output-format stream-json --verbose --add-dir <run folder>` | `--model <model>` | `--effort <effort>` |
| Codex | `exec --json --skip-git-repo-check -C <run folder> -o <run folder>\final-message.md -` | `-m <model>` | `-c model_reasoning_effort=<effort>` |
| OpenCode | `run --format json --dir <run folder>` | `--model <model>` | `--variant <effort>` |

Your **Extra Arguments** come first, then the arguments in the table. An empty model or effort leaves the option out.

---

## Step 3: Name the tool servers a run requires

Some runs are useless without a certain tool server, for example the recorder server that offers the screen tools. In **Required Tool Servers**, list the server names exactly as the agent tool knows them:

```json
{
    "requiredToolServers": [
        "g4",
        "g4-uia-recorder"
    ]
}
```

Here is how each tool is checked:

| Tool | What G4 checks |
| --- | --- |
| Claude Code | At start, Claude reports its tool servers and their status. A required server counts only when its status is `connected`. Names are compared without regard to case |
| Codex | Nothing. Codex does not report its tools, so the run is only announced |
| OpenCode | Nothing, for the same reason |

When a required server is missing in a Claude Code run, G4 stops the agent before it can work blind. The run ends as **failed** and the message names the server and its status, for example `"g4-uia-recorder" (failed)`. A server the agent does not have at all is reported as `not configured`.

---

## Step 4: Read the start line

The first line in the run console tells you what the agent started with. For Claude Code it looks like this:

```text
Agent ready: 48 tools, 36 skills. Tool servers: g4 connected, g4-uia-recorder failed.
```

For a tool that does not report its tools, the line reads `Agent ready. This harness does not report its tools.` If you listed required servers, it adds `The required tool servers (...) cannot be checked.`

---

## ✔ Check your work

- [ ] The run form offers your models and efforts, and the first of each is selected
- [ ] You can name the command-line option each tool uses for the model and the effort
- [ ] For a Claude Code harness, **Required Tool Servers** lists the servers your run needs
- [ ] You know that Codex and OpenCode runs do not check required servers

---

**Next up** 👉 [Module 4: Choose recorders and write the brief](04-choose-recorders-and-write-the-brief.md)
