# Module 7: Set up desktop recording

[⬅ Back to overview](README.md) · [⬅ Module 6](06-control-your-output.md)

⏱️ **About 6 minutes**

The recorder is how G4 **watches a user click around a desktop application** and turns those actions into a workflow it can replay later. `settings.recorderSettings` configures it. Out of the box it defines **two** recorders — a UIA (desktop) recorder on port `9955` and a Chromium (browser) recorder on port `9956`.

```json
"recorderSettings": {
    "enabled": true,
    "disableChromeNetworkSandbox": false,
    "useSandbox": false,
    "recorders": [ { "...": "UIA on 9955" }, { "...": "Chromium on 9956" } ]
}
```

In this module, you will:

- Turn recording on and understand the recorders list
- Set where each recorder listens and how it captures
- Configure the recorder's driver and human-paced replay
- Run a script before or after a recording

---

## Step 1: `enabled`, `useSandbox`, and the `recorders` list

- **`enabled`** — the master on/off switch for *all* recorders. If `false`, no recording happens no matter what's inside the list.
- **`useSandbox`** — when `true`, G4 **auto-starts the bundled recorder services from your sandbox** for you (this is the manifest form of the **Use Sandbox** toggle in the recorder panel). Set it `false` when you run the recorder service yourself, locally or on another machine.
- **`disableChromeNetworkSandbox`** — when `true`, the Chromium recorder starts Chrome **without its network sandbox** (it adds `--disable-features=NetworkServiceSandbox` to the browser arguments at Start; your manifest is not changed). Leave it `false` unless every page in the recorder's Chrome stays blank; that happens when Chrome cannot read its own folder from its sandbox. This is the manifest form of the **Chrome Network Sandbox Off** toggle in the recorder panel.
- **`recorders`** — an array of recorder definitions. Each entry describes one **machine/target** and has its own `enabled` flag, so you can turn each on or off individually. The defaults are a **UIA** recorder and a **Chromium** recorder.

**When to use multiple recorders:**

- You record across multiple machines (machine-a is your main desktop, machine-b a secondary VM).
- You want different settings per machine (e.g., longer think time on a slow VM).

---

## Step 2: `mode`, `schema`, `host`, `port`

Where each recorder listens, and how it captures input.

```json
"mode": "standard",
"useOffset": false,
"schema": "http",
"host": "localhost",
"port": "9955"
```

- **`mode`** — the capture strategy. It has three values, and it applies to **UIA recorders only** (other recorders ignore it):
    - `standard` (the default) records element-based actions, such as a click on a located element.
    - `user32` uses Windows native input (physical mouse, keyboard, window messages) and still finds the element with a locator. It is a good, broadly compatible choice for desktop apps.
    - `coordinate` records physical input at **absolute screen positions**. The generated actions have no locator, so use it only when the app exposes no usable elements.
- **`useOffset`** — when `true`, the recorded pointer offset inside the element is added to mouse actions (`--OffsetX` and `--OffsetY`). It applies to `user32` capture only. Default `false`.
- **`schema` / `host` / `port`** — where the recorder service listens. `localhost:9955` is the default UIA recorder; the Chromium recorder uses `9956`.

**When to use it:**

- **Defaults** for single-machine setups.
- **Change `host`** when the recorder runs on a different machine than the engine.
- **`user32` with `useOffset: true`** when clicks must land on the same spot inside the element they were recorded on.
- **`coordinate`** for apps that draw their own surface, where the recorder cannot see elements.

---

## Step 3: `driverParameters` inside a recorder

The driver each recorder uses to *talk to* the target while watching the user. The two default recorders show the two common shapes.

**UIA recorder** (desktop, port `9955`) — uses Windows UI Automation to identify elements by name and role:

```json
"driverParameters": {
    "capabilities": {
        "alwaysMatch": {
            "browserName": "Uia",
            "uia:options": { "label": "machine-a" }
        }
    },
    "driver": "UiaDriver",
    "driverBinaries": "http://localhost:4444/wd/hub",
    "firstMatch": [ {} ]
}
```

**Chromium recorder** (browser, port `9956`) — records a Chrome browser session:

```json
"driverParameters": {
    "capabilities": {
        "alwaysMatch": {
            "browserName": "chrome",
            "goog:chromeOptions": {
                "binary": "C:\\g4-sandbox\\browsers\\chrome\\chrome.exe",
                "args": ["--disable-gpu"]
            }
        }
    },
    "driver": "ChromeDriver",
    "driverBinaries": "http://localhost:4444/wd/hub",
    "firstMatch": [ {} ]
}
```

- **`uia:options.label`** — a friendly name for a UIA target (used in reports); change it to something like `accounting-pc`.
- **`goog:chromeOptions.binary`** — the Chrome executable to launch; the sandbox fills this in for you.
- **`driverBinaries`** — the driver service URL or local driver folder. A sandbox-backed UIA recorder uses `<sandbox>\drivers\uia-driver-server`; the UIA driver server often listens on `5555` (`http://localhost:5555/wd/hub`), while a Selenium hub commonly uses `4444`.

> **⚠️ Pitfall:** Double backslashes in Windows paths inside JSON (`C:\\g4-sandbox\\...`) — a single backslash is an escape character and will break the file.

---

## Step 4: `thinkTimeSettings` — the human-pause cap

How G4 records the **pauses between user actions**. This is the most commonly misunderstood setting, so read carefully.

```json
"thinkTimeSettings": {
    "enabled": true,
    "maxThinkTime": 10000,
    "minThinkTime": 3000
}
```

- `maxThinkTime` is a **ceiling**, not a fixed delay. If the user idles longer than this between actions (goes to lunch), G4 clamps the recorded delay down to `maxThinkTime`. A 30-minute break does **not** become a 30-minute wait — it becomes `maxThinkTime`.
- `minThinkTime` is the **floor**. Pauses shorter than this are bumped up to it.
- `enabled: false` means think time isn't recorded at all — replays go as fast as the driver can fire actions.

**When to use it:**

- **`enabled: true`** with a range (like `min 3000` / `max 10000`) when the target app needs human-paced interaction (animations, modal transitions, server round-trips).
- **`enabled: false`** for speed runs where the app handles fast input fine.
- **Set `min == max`** for a **constant** pause between all actions, regardless of how fast or slow the user actually was.

> **⚠️ Pitfall:** Don't confuse `maxThinkTime` with a fixed pause — it's a cap. And setting `min` too low on a slow app produces flaky replays.

---

## Step 5: `preScript` and `postScript` — run a script around a recording

Each recorder can run one script **before** capture starts and one **after** it stops. Use them to open the app you want to record, or to clean up afterwards.

```json
"preScript": {
    "enabled": true,
    "shell": "powershell",
    "script": "Start-Process notepad.exe",
    "addToAutomationFlow": false
},
"postScript": {
    "enabled": false,
    "shell": "powershell",
    "script": "",
    "addToAutomationFlow": false
}
```

- **`enabled`** — turns the script on. Both scripts are off by default.
- **`shell`** — the interpreter: `powershell`, `pwsh` (PowerShell 7), `bash` or `cmd`.
- **`script`** — the inline script text.
- **`addToAutomationFlow`** — when `true`, the script is **also** added to the recorded automation as an `InvokeScript` action: the pre-script as the **first** action, the post-script just **before Close Browser**. It only runs on replay for drivers that support the chosen shell.

How the scripts behave while recording:

- Each script runs once, on the machine that runs VS Code, and is stopped after **30 seconds**.
- A pre-script that exits with a non-zero code, or times out, **aborts that recorder's start**.
- A post-script failure is reported but does **not** block the shutdown of the recorder.

> **⚠️ Pitfall:** A script marked `addToAutomationFlow` cannot contain `}}`, `{{` or a space followed by `--` and a word. Those sequences break the macro that carries the script, so the script is **not added** to the automation, and the Settings Editor shows a notice under the script box. The script still runs while recording.

---

## Step 6: `excludeEvents` — leave actions out of the recorded flow

The recorders report everything they see, and the Hub turns every event into an action. Some of those actions are noise. For example, clicking a form's submit button makes the Chromium recorder report a click **and** a form submission, so the flow gets an `InvokeClick` followed by a `SubmitForm` that no plugin can run.

Each recorder can list the actions VS Code removes from its part of the flow when the recording stops:

```json
"excludeEvents": [
    {
        "name": "SubmitForm"
    }
]
```

- **`name`** — the action as it appears in the flow, which is the rule's `pluginName`. Names are compared without regard to case.
- An exclusion only applies to the jobs this recorder produced. Another recorder keeps the same action unless it lists it too.
- A missing or empty list keeps every action. New projects list `SubmitForm` for the Chromium recorder.
- The list is applied by VS Code when you stop a recording, and to the flows of an autonomous run. The recorders and the Hub never see it.

> **⚠️ Pitfall:** Desktop recorders name their actions after the capture mode (for example `InvokeUser32Click` in `user32` mode). Copy the name from a recorded flow rather than from the recorder's event name.

---

## ✔ Check your work

- [ ] Top-level `enabled` is `true`, and each recorder you want is enabled
- [ ] `useSandbox` is `true` if you want G4 to start the bundled recorders for you
- [ ] Each recorder's `host`/`port` matches where its service listens (`9955` UIA, `9956` Chromium)
- [ ] `thinkTimeSettings` fits the app — a range, a constant (`min == max`), or disabled for speed
- [ ] `mode` is the one you want (`standard`, `user32` or `coordinate`), and `useOffset` is on only for `user32`
- [ ] Any pre- or post-script uses a `shell` your machine has, and exits with `0`
- [ ] The Chromium recorder lists `SubmitForm` in `excludeEvents`, so a submit click records one action

---

**Next up** 👉 [Module 8: Extend G4 — plugins & MCP](08-extend-g4.md)
