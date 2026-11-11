# Module 1: Pick a recorder and a capture mode

[⬅ Back to overview](README.md)

**Where you are:** Module 1 of 8

⏱️ **About 8 minutes**

A recording starts with two choices: which recorder watches the application, and how it stores each click. In this module you open the recorder settings, read the options on a recorder card, and pick a capture mode.

In this module, you will:

- Open the **Automation Recorders** section of the Settings Editor
- Tell the recorder families apart
- Choose Standard, User32, or Coordinate mode
- Decide whether to turn on **Use Offset**
- Leave noise such as `SubmitForm` out of the recorded flow

---

## Step 1: Open the Automation Recorders section

1. In the Explorer, right-click `manifest.json` and choose **Open Settings Editor**.
2. Expand the section **Automation Recorders**.

   ![The Automation Recorders section with its three switches and one card per recorder](images/01-automation-recorders-section.png)

   `TODO(screenshot)`: capture the **Automation Recorders** section with the three switches and the recorder cards collapsed.

The section starts with three switches that apply to every recorder:

| Switch | Manifest key | What it does |
| --- | --- | --- |
| **Enable Desktop Recording** | `settings.recorderSettings.enabled` | Master switch. When it is off, the **G4 Recorder** panel hides its controls |
| **Use Sandbox Recorders** | `settings.recorderSettings.useSandbox` | Starts the recorder services from your sandbox when they are not already running |
| **Turn Off the Chrome Network Sandbox** | `settings.recorderSettings.disableChromeNetworkSandbox` | Starts the recorder's Chrome without its network sandbox. Use it only when recorder pages stay blank |

Below the switches you see one card for each recorder. Click **+ Add Machine** to add another.

---

## Step 2: Tell the recorders apart

A recorder is chosen by its driver. A new project comes with three, and the Android one starts switched off:

| Recorder | Driver | Default port | What it watches |
| --- | --- | --- | --- |
| Desktop | `UiaDriver` | 9955 | Any Windows application, through UI Automation |
| Browser | `ChromeDriver` | 9956 | A Chrome window that the recorder launches for you |
| Android | `AndroidDriver` | 9958 | An Android device or emulator, through a recorder app the service installs for you |

Each card shows the driver in its title, for example `machine-a - UiaDriver`. Open a card to see its fields:

| Field | Manifest key | What it does |
| --- | --- | --- |
| **Enabled** | `enabled` | Turns this machine on or off without removing it |
| **Friendly Name** | `driverParameters.capabilities.alwaysMatch["uia:options"].label` | A readable name, for example `accounting-pc` |
| **Recorder Host** | `host` | The machine that runs the recorder service |
| **Recorder Port** | `port` | The port of the recorder service |
| **Mode** | `mode` | How a click is stored. See Step 3 |
| **Use Offset** | `useOffset` | Keeps where inside the element you clicked. See Step 4 |
| **Leave the DOM Context Out of the Recorded Flow** | `excludeDomContext` | Removes the markup snapshot the Hub adds to browser actions. On by default. See Step 5 |
| **Leave Out of the Recorded Flow** | `excludeEvents` | Actions removed from this machine's flow when you stop. See Step 5 |

> **📝 Note:** The Hub accepts three driver families for recording: `UiaDriver`, `AndroidDriver`, and any driver whose name contains `chrome`. A recorder with another driver is refused when you press **Start**. Module 7 shows the message.

### The Android card

The Android card's driver parameters are the values the flow replays with:

- **`driver`** is `AndroidDriver`.
- **`driverBinaries`** is the Appium server endpoint, `http://localhost:4723` by default.
- **`capabilities.alwaysMatch`**, with **`firstMatch`** next to it, are the W3C WebDriver new-session capabilities, with every Appium capability under the `appium:` prefix. The recorder service reads `appium:udid`, `appium:appPackage`, `appium:appActivity` and `appium:app` from `alwaysMatch` to choose the device and start your app.

The card leaves `SwitchActivity` and `InvokeLongClick` out of the flow, because no plugin replays them yet. [Module 8](08-record-an-android-app.md) walks through a whole Android session, from the device to the replay.

---

## Step 3: Choose a capture mode

The **Mode** list has three choices. It only applies to `UiaDriver` recorders. For any other driver the list is greyed out and the mode is saved as `standard`.

| Mode | Manifest value | A click is stored as | Pick it when |
| --- | --- | --- | --- |
| **Standard** | `standard` | An action on the element, for example `InvokeClick`, with a locator | The application exposes its controls well. The flow reads like a normal automation |
| **User32** | `user32` | A physical mouse click, with a locator for the element under the pointer | Standard clicks do nothing in the application, but you still want a locator to find the element |
| **Coordinate** | `coordinate` | A physical mouse click at fixed screen coordinates, with no locator | The application exposes no usable controls. The flow only replays correctly if the window sits in the same place |

Typed text follows the same split. Standard mode stores it as `SendKeys`. User32 and Coordinate store it as `SendUser32Keys`.

![The Mode list open on a recorder card](images/01-mode-list.png)

`TODO(screenshot)`: capture the **Mode** list open on a `UiaDriver` card, with **Standard**, **User32**, and **Coordinate** visible.

> **💡 Tip:** Start with **Standard**. Switch to **User32** only when a recorded click does nothing on replay. Use **Coordinate** as the last resort.

---

## Step 4: Decide on Use Offset

**Use Offset** adds the position of the pointer inside the element to each mouse action. Without it, a recorded click lands in the middle of the element. With it, the click lands where you clicked.

- The setting applies to **User32** mode only.
- It is off by default.
- Turn it on for large elements such as a canvas or a map, where the middle is the wrong place.

The same recorder in `manifest.json`:

```json
{
    "enabled": true,
    "mode": "user32",
    "useOffset": true,
    "schema": "http",
    "host": "localhost",
    "port": "9955",
    "driverParameters": {
        "capabilities": {
            "alwaysMatch": {
                "browserName": "Uia",
                "uia:options": {
                    "label": "machine-a"
                }
            }
        },
        "driver": "UiaDriver"
    }
}
```

Click **Save** in the Settings Editor to apply your choices.

---

## Step 5: Leave noise out of the flow

When you click a form's submit button in the browser, the Chromium recorder sees two things: your click and the form submission. Without a filter, the flow gets an `InvokeClick` followed by a `SubmitForm`. No plugin is called `SubmitForm`, so that second action fails on replay.

The **Leave Out of the Recorded Flow** list on a recorder card removes actions like this one when you stop the recording. A new project already lists `SubmitForm` on the Chromium card, so a submit click records one `InvokeClick`.

1. Open the recorder card and find the **Excluded Events** heading.
2. Add one action name per row, for example `SubmitForm`.
3. Click **Save**.

The same setting in `manifest.json`:

```json
"excludeEvents": [
    {
        "name": "SubmitForm"
    }
]
```

> **💡 Tip:** Copy the name from a recorded flow, where it appears as the action's plugin name. Names are compared without regard to case, and a list only affects the machine that holds it.

> **📝 Note:** A project created before this setting existed has no list, so it keeps every action. Add `SubmitForm` to its Chromium card to get the same result.

The same heading holds **Leave the DOM Context Out of the Recorded Flow**. The Chromium recorder sends the markup around each element it records, and the Hub adds it to the browser actions for AI tools that improve locators. The switch is on by default, so your flows stay small. Turn it off to keep the markup in the flow.

---

## ✔ Check your work

- [ ] You can open **Automation Recorders** from the `manifest.json` context menu
- [ ] You can name the driver of each recorder card
- [ ] You know that the **Mode** list works only on a `UiaDriver` card
- [ ] You can say which mode stores a click without a locator
- [ ] You know that **Use Offset** applies to User32 mode only
- [ ] The Chromium card lists `SubmitForm` under **Excluded Events**

---

**Next up** 👉 [Module 2: Start, suspend, resume, and stop](02-start-suspend-resume-and-stop.md)
