# Module 4: Why VS Code never appears

[⬅ Back to overview](README.md) · [⬅ Module 3](03-scripts-before-and-after.md)

**Where you are:** Module 4 of 7

⏱️ **About 4 minutes**

You press **Start** and **Stop** inside VS Code, yet those clicks are not in your recording. This is on purpose. In this module you learn how G4 keeps your own editor out of the flow, and what to do if a VS Code window does leak in.

In this module, you will:

- Understand why the desktop recorder needs a filter
- See what Studio sends to the Hub when you start
- Know the one case where the filter does not work

---

## Step 1: Understand the problem

The desktop (UIA) recorder watches the whole screen. It reports a click in any window, including the **G4 Recorder** panel and the **Stop** button you use to end the session. Without a filter, the last step of every recording would be a click in VS Code.

## Step 2: See what Studio sends

When you press **Start**, Studio works out which operating-system processes belong to this VS Code. It finds every process that has the same executable path as the running editor, and sends their process ids to the Hub in `excludedProcessIds`. The Hub drops every event whose window belongs to one of those processes.

Studio also sends one window title, `Extension Development Host`, in `excludedWindowTitles`. The Hub uses it as a fallback for the window that extension developers use to test an extension.

The check:

- Runs a PowerShell query that has a five-second limit.
- Keeps the answer for the rest of the VS Code window, once it found at least one process.
- Works on Windows only. UI Automation does not exist elsewhere, so the list is empty.

![The G4 Recorder panel and the Stop button are not in the recorded steps](images/04-recording-without-vs-code.png)

`TODO(screenshot)`: capture a recorded workflow of a short Notepad session, with no step that names a VS Code window.

## Step 3: Know the limit

If the query fails or times out, Studio sends an empty list and the recording continues without a filter. A failed query never blocks **Stop**. In that case, look through the recorded steps and delete any that name a VS Code window.

> **📝 Note:** The filter protects VS Code itself. To automate VS Code as an application, use the Chromium recorder instead, because VS Code is built on Chromium.

---

## ✔ Check your work

- [ ] You can say why the desktop recorder needs a filter
- [ ] You know that Studio sends process ids and one window title when you press **Start**
- [ ] You know the filter works on Windows only
- [ ] You know what to do if a VS Code step leaks into a recording

---

**Next up** 👉 [Module 5: Two recorders at once](05-two-recorders-at-once.md)
