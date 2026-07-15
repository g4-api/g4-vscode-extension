# Module 7: Set up desktop recording

[⬅ Back to overview](README.md) · [⬅ Module 6](06-control-your-output.md)

⏱️ **About 6 minutes**

The recorder is how G4 **watches a user click around a desktop application** and turns those actions into a workflow it can replay later. `settings.recorderSettings` configures it. Out of the box it defines **two** recorders — a UIA (desktop) recorder on port `9955` and a Chromium (browser) recorder on port `9956`.

```json
"recorderSettings": {
    "enabled": true,
    "useSandbox": false,
    "recorders": [ { "...": "UIA on 9955" }, { "...": "Chromium on 9956" } ]
}
```

In this module, you will:

- Turn recording on and understand the recorders list
- Set where each recorder listens and how it captures
- Configure the recorder's driver and human-paced replay

---

## Step 1: `enabled`, `useSandbox`, and the `recorders` list

- **`enabled`** — the master on/off switch for *all* recorders. If `false`, no recording happens no matter what's inside the list.
- **`useSandbox`** — when `true`, G4 **auto-starts the bundled recorder services from your sandbox** for you (this is the manifest form of the **Use Sandbox** toggle in the recorder panel). Set it `false` when you run the recorder service yourself, locally or on another machine.
- **`recorders`** — an array of recorder definitions. Each entry describes one **machine/target** and has its own `enabled` flag, so you can turn each on or off individually. The defaults are a **UIA** recorder and a **Chromium** recorder.

**When to use multiple recorders:**

- You record across multiple machines (machine-a is your main desktop, machine-b a secondary VM).
- You want different settings per machine (e.g., longer think time on a slow VM).

---

## Step 2: `mode`, `schema`, `host`, `port`

Where each recorder listens, and how it captures input.

```json
"mode": "standard",
"schema": "http",
"host": "localhost",
"port": "9955"
```

- **`mode`** — the capture strategy. `standard` is the default; `user32` uses Windows native UI events (physical mouse, keyboard, window messages) and is a good, broadly compatible choice for desktop apps.
- **`schema` / `host` / `port`** — where the recorder service listens. `localhost:9955` is the default UIA recorder; the Chromium recorder uses `9956`.

**When to use it:**

- **Defaults** for single-machine setups.
- **Change `host`** when the recorder runs on a different machine than the engine.

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
- **`driverBinaries`** — the driver service URL. The UIA driver server often listens on `5555` (`http://localhost:5555/wd/hub`); a Selenium hub on `4444`.

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

## ✔ Check your work

- [ ] Top-level `enabled` is `true`, and each recorder you want is enabled
- [ ] `useSandbox` is `true` if you want G4 to start the bundled recorders for you
- [ ] Each recorder's `host`/`port` matches where its service listens (`9955` UIA, `9956` Chromium)
- [ ] `thinkTimeSettings` fits the app — a range, a constant (`min == max`), or disabled for speed

---

**Next up** 👉 [Module 8: Extend G4 — plugins & MCP](08-extend-g4.md)
