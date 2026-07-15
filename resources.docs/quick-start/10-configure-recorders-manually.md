# Module 10: Configure recorders manually (advanced)

[⬅ Back to overview](README.md)

⏱️ **About 5 minutes** · Advanced

On a fresh, sandbox-attached project your recorders are already set up — see [Module 7](07-verify-your-recorders.md). Reach for this module when you need to **add a recorder, fix a value, or point one somewhere custom** (for example a recorder running on another machine).

Each recorder is a **machine** entry in the **Automation Recorders** section of the Settings Editor.

In this module, you will:

- Configure the **UIA** recorder machine by hand
- Configure the **Chromium** recorder machine by hand

---

## Step 1: Open the Automation Recorders settings

Open the **Settings Editor** (right-click `manifest.json` → **Open Settings Editor**) and scroll to **Automation Recorders**. Make sure **Enable Desktop Recording** is **on**, then use **Add** to create a machine (or edit an existing one).

![The Automation Recorders section with Enable Desktop Recording on](images/07-desktop-recorders.png)

> **📝 Note:** **Use Sandbox Recorders** (in the recorder panel) auto-starts the bundled recorder services for you. Leave it on for the sandboxed workflow; turn it off only when you point at a recorder you run yourself, locally or remote.

Each machine has the same fields:

| Field | What it's for |
| --- | --- |
| **Enabled** | Turn this machine on/off without removing it — leave **on**. |
| **Friendly Name** | Any readable name (e.g. `UIA` or `Chromium`). |
| **Recorder Host** | The machine running the recorder service — `localhost`. |
| **Recorder Port** | `9955` for UIA, `9956` for Chromium. |
| **Mode** | Capture strategy for UIA recorders — the default (e.g. `User32`) is fine. |
| **Driver** | The technology to drive the app — `UiaDriver` or `ChromeDriver`. |
| **Driver Service URL or Path** | A Selenium hub URL, or a local driver folder. |
| **Capabilities (alwaysMatch)** | WebDriver capabilities JSON applied to every session. |

> **💡 Tip:** The **Pacing Between Actions** options (Pause like a human, Shortest/Longest pause) can stay at their defaults.
>
> **📝 About Mode:** For UIA, `User32` mode drives the app with **physical mouse and keyboard** input (it literally moves the pointer and types), rather than calling the UI Automation pattern on a control directly. It's a good, broadly compatible default — just don't move the real mouse while it's replaying.

---

## Step 2: Configure the UIA recorder

Add or edit a machine with these values:

| Field | Value |
| --- | --- |
| **Enabled** | On |
| **Friendly Name** | `UIA` (any name) |
| **Recorder Host** | `localhost` |
| **Recorder Port** | `9955` |
| **Mode** | default (e.g. `User32`) |
| **Driver** | `UiaDriver` |
| **Driver Service URL or Path** | `http://localhost:5555/wd/hub` (direct) or `http://localhost:4444/wd/hub` (grid) |

**Capabilities (alwaysMatch):**

```json
{
    "browserName": "Uia",
    "uia:options": {
    }
}
```

![The UIA recorder machine configured](images/07-uia-recorder.png)

---

## Step 3: Configure the Chromium recorder

Add a second machine for the browser:

| Field | Value |
| --- | --- |
| **Enabled** | On |
| **Friendly Name** | `Chromium` (any name) |
| **Recorder Host** | `localhost` |
| **Recorder Port** | `9956` |
| **Driver** | `ChromeDriver` |
| **Driver Service URL or Path** | `<sandbox>\drivers\chrome` (local driver folder) or `http://localhost:4444/wd/hub` (grid) |

**Capabilities (alwaysMatch)** — update the `binary` path to your sandbox:

```json
{
    "browserName": "chrome",
    "goog:chromeOptions": {
        "binary": "<sandbox>\\browsers\\chrome\\chrome.exe",
        "args": [
            "--disable-gpu"
        ]
    }
}
```

![The Chromium recorder machine configured](images/07-chromium-recorder.png)

> **💡 Tip:** Remember the JSON backslash rule — double every backslash in Windows paths (`C:\\g4-sandbox\\...`).

Click **Save** to apply your recorder settings.

---

## ✔ Check your work

- [ ] **Enable Desktop Recording** is on, and there's a **UIA** machine on port `9955` (Driver `UiaDriver`)
- [ ] There's a **Chromium** machine on port `9956` (Driver `ChromeDriver`)
- [ ] Both are **Enabled** and have their **Capabilities** JSON filled in
- [ ] You clicked **Save**

---

**Next** 👉 [Module 11: Change your project's sandbox](11-change-your-sandbox.md) · or **back to** [the overview](README.md)
