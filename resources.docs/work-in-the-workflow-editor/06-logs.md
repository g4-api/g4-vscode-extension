# Module 6: Logs

[⬅ Back to overview](README.md) · [⬅ Module 5](05-reports.md)

**Where you are:** Module 6 of 6

⏱️ **About 6 minutes**

When something does not work, the log tells you why. In this module you find the two G4 output channels, read a log entry and a Hub event, and choose how much the extension writes.

In this module, you will:

- Open the **G4 Extension** output channel
- Read the parts of a log entry
- Read a Hub event and open any part of its JSON in full
- Use the **Show Log** button on a warning
- Set the log level and the source filter

---

## The two output channels

VS Code collects log text in the **Output** panel. G4 adds two channels there:

| Channel | What it holds |
| --- | --- |
| **G4 Extension** | Everything the extension writes: commands, requests to the Hub, the messages the canvas forwards, and the results of publishing and uploading |
| **G4 Hub** | Created by the extension at start. In this version nothing in the extension writes to it, so it stays empty |

Both channels use the `g4log` language, so levels and fields are colored.

---

## Step 1: Open the G4 Extension channel

1. In VS Code, click **View**, then **Output**.
2. Open the drop-down on the right of the Output panel and pick **G4 Extension**.

   ![The Output panel with the G4 Extension channel](images/06-output-channel.png)

   `TODO(screenshot)`: capture the Output panel with **G4 Extension** picked and a few entries.

Run a bot from the canvas (module 4) and watch new entries arrive. What the canvas prints to its own console is forwarded here, and the extension masks credentials in those lines before it writes them.

---

## Step 2: Read an entry

Each entry has these lines:

| Line | What it holds |
| --- | --- |
| `timestamp` | When the entry was written |
| `level` | A symbol and the level in capitals, such as `INFORMATION` or `ERROR` |
| `application` | The name of the application that logs |
| `logger` | The source of the entry, such as `HttpClient` or `G4.UpdateEnvironment`. The source filter below uses this name |
| `message` | What happened |
| `reason` | A standard description of the event. It appears only for some entries |

An entry that carries an error ends with a block headed `ERROR` and the stack trace.

---

## Step 3: Read a Hub event

While a bot runs, the Hub sends events: one for the automation it starts and one for every log entry the engine writes. An event can be very large, and the Output panel cannot fold, so the extension writes each one as a numbered summary and a shortened view of its JSON:

```text
message:     #42 Log · Information · G4.Plugins.InvokeClick · "Element was clicked"
event:       LogEventArgs · 43 KB
  {
    "id": "4f2a91c0",
    "type": "Log",
    "value": {
      "LogLevel": "Information",
      "Message": "Element was clicked",
      "Rule": {…9 keys},
      "Response": {…2 keys}
    }
  }
```

| Part | What it means |
| --- | --- |
| `#42` | The event number. It is unique until VS Code restarts |
| The summary | For a log entry, the engine level, the logger, and the first line of the message. For an automation request, its id and how many stages, jobs, and rules it has |
| `event` | The kind of event and its size as JSON |
| `{…9 keys}`, `[…120 items]` | A part deeper than two levels, written on one line |
| `"…" (+3,400 chars)` | A string cut after 200 characters |
| `… 115 more items` | An array that shows only its first 5 items |
| `… truncated (48 KB, 1,200 lines in full)` | The event reached 40 lines, the most one event takes |

An automation request shows only its summary: it is the automation you just started, and often the largest event of a run. An event the engine logged as a warning or an error is written at that level.

The JSON is colored: keys, strings, numbers, and `true`, `false`, and `null` each have their own color, and the shortened parts are dimmed. Credentials (`token`, `password`) are masked as `***` everywhere, also in what the extension keeps for the next step.

### Open a part in full

1. Note the event number, such as `#42`.
2. Press **Ctrl+Shift+P** and run **G4: Show Event JSON**.
3. Pick the event. The list shows the last 50 events, newest first; type the number or any word of the summary to filter.
4. Pick a part. The list starts with **(whole event)**, then every part the log shortened and the large parts inside them, each with its size, such as `value.Response.Extractions  120 items`.

The extension adds the part, in full and indented, at the end of the **G4 Extension** channel, under a line such as `#42 value.Response.Extractions (120 items)`. A string, such as a page source, is written as its own lines. The lists close as soon as you pick, and the focus goes back to where it was.

To copy a part instead, click the copy button at the right of the part in the list. Nothing is written to disk, and no tab opens.

> **📝 Note:** Only the last 50 events are kept, in memory. An older event, or one from before VS Code restarted, can no longer be opened.

### Choose how much of each event is written

The VS Code setting **G4: Event Log Detail** (`g4.eventLogDetail`) decides how much of each event the log shows. Open it with **File > Preferences > Settings** and search for `eventLogDetail`.

| Value | What the log shows |
| --- | --- |
| `summary` | The summary and the `event` line only |
| `preview` (the default) | The summary and the shortened JSON shown above |
| `full` | The summary and the complete JSON of every event |

The setting applies to the next event; no reload is needed.

---

## Step 4: Use Show Log

Some warnings have a **Show Log** button. The warnings of the Flow Publisher and the Template Publisher have it. Click the button and VS Code opens the **G4 Extension** channel, without taking the focus from where you were.

---

## Step 5: Choose how much is written

The extension's output log reads its settings from `settings.clientLogSettings` in `manifest.json`. The **Logging** section of the Settings Editor writes the same fields under `settings.clientLogConfiguration`, which is a different key (see the note below).

| Setting | In the Settings Editor | What it does |
| --- | --- | --- |
| `logLevel` | **Detail Level** | The least severe level that is written. The Settings Editor offers `error`, `warning`, `information` (the default), `debug`, and `trace` |
| `sourceOptions.filter` | **Source Filter Mode** | `include` writes only the listed sources. `exclude` writes everything except the listed sources |
| `sourceOptions.sources` | **Sources** | The logger names the filter works on. Names match without regard to case |

```json
{
    "settings": {
        "clientLogSettings": {
            "logLevel": "debug",
            "sourceOptions": {
                "filter": "exclude",
                "sources": [
                    "HttpClient"
                ]
            }
        }
    }
}
```

Levels from the quietest to the noisiest are `none`, `fatal`, `error`, `warning`, `information`, `debug`, and `trace`. A level writes itself and everything more severe, so `warning` writes warnings, errors, and fatal entries. `none` writes nothing. The manifest also accepts `none` and `fatal`, which the Settings Editor does not list.

When `sources` is empty, nothing is filtered out and every source is written.

> **📝 Note:** The starter manifest and the Settings Editor use the key `clientLogConfiguration`, but the extension reads `clientLogSettings` only (`src/extensions/utilities.ts:397-401`). To change what the output log writes, put the section under `clientLogSettings` in `manifest.json`.
>
> **💡 Tip:** Loggers read these settings when the extension creates them, and most are created at start. After you change the level or the filter, run **Developer: Reload Window** so every logger uses the new values.

---

## ✔ Check your work

- [ ] You opened **G4 Extension** in the Output panel and saw entries
- [ ] You can name the lines of an entry
- [ ] You opened a shortened part of a Hub event in full with **G4: Show Event JSON**
- [ ] You know that **G4 Hub** stays empty in this version
- [ ] You set the **Detail Level** to `debug` and saw more entries after a reload

---

**You finished the path.** 🎉 Go back to the [overview](README.md), or open [Troubleshooting](troubleshooting.md) when something goes wrong.
