# Module 2: Start, suspend, resume, and stop

[⬅ Back to overview](README.md) · [⬅ Module 1](01-pick-a-recorder-and-a-capture-mode.md)

**Where you are:** Module 2 of 7

⏱️ **About 8 minutes**

You drive a recording from the **G4 Recorder** panel in the G4 side bar. In this module you start a session, read the status light, pause one recorder without ending the session, and stop to get your workflow.

In this module, you will:

- Find the **G4 Recorder** panel and read its controls
- Start a session and read the status light
- Suspend and resume a single recorder
- Stop and open the recorded workflow
- Handle the messages that can appear

---

## Step 1: Read the panel

1. Click the **G4 icon** in the Activity Bar.
2. Open the **G4 Recorder** view.

   ![The G4 Recorder panel with Start, two switches, and one row per recorder](images/02-recorder-panel.png)

   `TODO(screenshot)`: capture the **G4 Recorder** panel before a session, with the **Start** button, the two switches, the refresh button, and the recorder rows.

| Control | What it does |
| --- | --- |
| **Start** / **Stop** | Starts or stops the session. While it works the button shows **Starting...** or **Closing...** |
| **Use Sandbox** | Starts the recorder services from your sandbox for the next start only |
| **Chrome Network Sandbox Off** | Starts the recorder's Chrome without its network sandbox for the next start only |
| Refresh | Checks the connection to each recorder again |
| One row per enabled recorder | The recorder's name, driver, address, status light, and a pause button |

> **📝 Note:** The two switches in the panel are held in memory. They do not change `manifest.json`. To change the saved value, use the Settings Editor from Module 1.

---

## Step 2: Start a session

1. Click **Start**.
2. Wait until the button changes to **Stop**.

For a browser recorder, a Chrome window opens. For a desktop recorder, open the application you want to record.

Read the light on each row:

| Light | Meaning |
| --- | --- |
| Green and pulsing | **Recording**. This recorder is in the session |
| Amber and pulsing | **Recording paused**. The recorder is suspended |
| Red | **Not recording**. Before you start, after you stop, or the recorder did not join the session |

The light shows whether this recorder is recording, not whether its process is running.

![The panel during a session with a green light and a Stop button](images/02-session-running.png)

`TODO(screenshot)`: capture the panel while a session runs, with a green light and the **Stop** button.

---

## Step 3: Suspend and resume one recorder

Sometimes you need to do something in the application that you do not want in the flow, such as logging in with real data. Suspend the recorder first.

1. Click the pause button on the recorder's row. Its tooltip reads **Suspend this recorder - stop capturing events (the hub connection stays open).**
2. The light turns amber. Do the actions you want to leave out.
3. Click the same button, now a play icon. Its tooltip reads **Resume this recorder - continue capturing events.**

The button is disabled until the recorder is connected. Its tooltip then reads **Start the recorder to enable suspend.**

> **📝 Note:** A suspended recorder stays connected. Its events are dropped until you resume.

---

## Step 4: Stop and open the workflow

1. Click **Stop**.
2. The notification reads **Recording stopped.** A **G4 Workflow** tab opens with your steps.

If you did nothing while recording, the notification reads **Recording stopped. No recorded events found.** and no tab opens.

The recorded flow carries the `settings` block of your `manifest.json`, placed after its driver parameters. A recorder that produced no events adds no job.

---

## Step 5: Know the messages

| Message | What it means | What to do |
| --- | --- | --- |
| `A recording session is already running. Stop it before starting a new one.` | You pressed **Start** during a session | Press **Stop** first |
| `No recorder is enabled. Enable a recorder in the G4 settings first.` | Every recorder is off, or **Enable Desktop Recording** is off | Turn one on in Module 1, then **Save** |
| `Recorder <address> did not start: <reason>` | One recorder could not join. The others keep recording | Fix that recorder, or stop and start again |
| `A recorder is already recording in another session: <reason>` | Another VS Code window, or another client, holds the recorder | Stop that session first |
| `Failed to start recording: <reason>` | The Hub refused the start | Read the reason. Module 7 shows two common ones |
| `Failed to stop recording: <reason>` | The Hub could not stop the session. The session stays open for a retry | Press **Stop** again |
| `A recording is in progress. Stop it and apply the settings?` | You saved settings during a session | Choose **Stop & Apply**, or **Cancel** to keep recording |

---

## ✔ Check your work

- [ ] **Start** turns the light green and the button into **Stop**
- [ ] The pause button turns the light amber, and the play button turns it green again
- [ ] **Stop** opens a **G4 Workflow** tab with your steps
- [ ] An empty session shows **No recorded events found.** and opens no tab
- [ ] You can say why **Use Sandbox** in the panel does not change `manifest.json`

---

**Next up** 👉 [Module 3: Scripts before and after](03-scripts-before-and-after.md)
