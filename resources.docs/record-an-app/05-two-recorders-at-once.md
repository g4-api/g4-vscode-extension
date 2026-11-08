# Module 5: Two recorders at once

[⬅ Back to overview](README.md) · [⬅ Module 4](04-why-vs-code-never-appears.md)

**Where you are:** Module 5 of 7

⏱️ **About 6 minutes**

Real tasks often cross applications: you copy a value from a desktop tool and paste it into a web page. If you enable more than one recorder, **Start** joins them all into one session and **Stop** gives you one workflow. In this module you record a desktop application and a browser together.

In this module, you will:

- Enable two recorders
- Start one session for both
- Read what happens when one recorder fails
- See how the Hub shapes the flow

---

## Step 1: Enable both recorders

1. Open the **Settings Editor** and expand **Automation Recorders**.
2. Turn **Enabled** on for a `UiaDriver` card and for a `ChromeDriver` card.
3. Click **Save**.
4. In the **G4 Recorder** panel, click the refresh button.

You see one row for each enabled recorder, each with its own light and its own pause button.

![The G4 Recorder panel with a UIA row and a Chromium row](images/05-two-rows.png)

`TODO(screenshot)`: capture the panel with two rows, one `UiaDriver` and one `ChromeDriver`.

## Step 2: Start one session

Click **Start**. The Hub connects to both recorders and launches the Chrome window for the browser recorder. Both lights turn green.

Each recorder has its own pre-script and post-script. Module 3 applies to each one separately.

## Step 3: Use both applications

Use the desktop application and the Chrome window as you like. You can pause one recorder with its own button while you keep recording the other. A suspended recorder drops its events, and the other recorder keeps capturing.

## Step 4: Know what happens when a recorder fails

| Situation | What you see | What happens |
| --- | --- | --- |
| One recorder does not answer | `Recorder <address> did not start: <reason>` | The session starts with the recorders that connected |
| One pre-script fails | `Pre-script failed for recorder <address>; this recorder will not start.` | That recorder stays out. The others start |
| A recorder is held by another session | `A recorder is already recording in another session: <reason>` | The start is refused. Stop the other session first |

A recorder holds only one session at a time. If you start a second session from another VS Code window while the first one runs, the second start is refused.

## Step 5: Stop and read the flow

Click **Stop**. The Hub builds one workflow:

- One stage holds the whole flow.
- Each run of events from one recorder becomes one job. When you switch back to an earlier recorder, its next job reuses that recorder's driver.
- The last job of each recorder ends with a `CloseBrowser` action.
- With one recorder, the flow uses that recorder's driver.

Each recorder's scripts land in that recorder's own jobs, as Module 3 describes.

---

## ✔ Check your work

- [ ] The panel shows one row for every enabled recorder
- [ ] **Start** turns both lights green, and **Stop** gives one workflow
- [ ] You know that a failed recorder does not stop the others
- [ ] You know why a second session on the same recorders is refused

---

**Next up** 👉 [Module 6: Name your recorded steps](06-name-your-recorded-steps.md)
