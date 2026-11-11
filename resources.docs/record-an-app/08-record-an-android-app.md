# Module 8: Record an Android app

[⬅ Back to overview](README.md) · [⬅ Module 7](07-record-sap-and-where-flow-generation-stops.md)

**Where you are:** Module 8 of 8

⏱️ **About 15 minutes**

The Android recorder records an app on an Android phone or emulator, and the flow it produces replays through Appium. In this module you prepare the device and the replay server, fill in the Android card, record a session from the **G4 Recorder** panel, and replay the flow.

In this module, you will:

- Prepare adb, a device, and an Appium server
- Fill in the Android card: the driver, the Appium endpoint, and the session capabilities
- Start the Android recorder service
- Record a session and read what each action became
- Replay the flow on the device

---

## How the pieces fit

Four programs take part. Only the recorder service and the Hub are G4 programs; adb and Appium come from the Android world.

| Program | Where it runs | What it does |
| --- | --- | --- |
| Android recorder service (`G4.Recorders.Android`) | Your computer, port 9958 | Installs the recorder app on the device over adb, switches it on, and relays its events |
| G4 Android Recorder app | The device | Sees each tap, typed text, scroll and Back, and sends them to the recorder service |
| G4 Hub | Your computer, port 9944 | Starts and stops the recorder, and turns its events into a flow |
| Appium server with the UiAutomator2 driver | Your computer, port 4723 | Replays the flow on the device. Recording does not use it |

> **📝 Note:** Recording needs a G4 Hub that knows the Android recorder. An older Hub refuses the card with `Recorder driver must be ChromeDriver or UiaDriver.`

---

## Step 1: Prepare adb and a device

The recorder service and Appium both reach the device through adb, the Android Debug Bridge. adb is part of the Android SDK platform-tools. The G4 sandbox does not ship it.

1. Install the Android SDK platform-tools.
2. Set `ANDROID_HOME` to the SDK folder. The recorder service also finds adb on your `PATH`.
3. Connect a phone with **USB debugging** on, or start an emulator.
4. Run the command below.

   ```bash
   adb devices
   ```

5. Check that the device is listed with the state `device`. A device listed as `unauthorized` waits for you to accept the prompt on its screen.

---

## Step 2: Prepare the Appium server

You need Appium only to replay. You can record first and set it up later.

1. Install Node.js, Java 17 or later, and set `ANDROID_HOME` as in Step 1.
2. Install Appium and its Android driver.

   ```bash
   npm install -g appium
   appium driver install uiautomator2
   ```

3. Start the server.

   ```bash
   appium --port 4723
   ```

4. Open `http://localhost:4723/status` in a browser and check that it reports `"ready": true`.

> **⚠️ Pitfall:** On Windows, Appium installs its drivers under `APPIUM_HOME`, by default `%USERPROFILE%\.appium`. When that path is deep, adb cannot open the helper apps Appium installs, and every session fails with `failed to stat ... No such file or directory`. Set `APPIUM_HOME` to a short folder, such as `C:\appium`, before you install the driver.

---

## Step 3: Fill in the Android card

A new project already has an Android card, switched off. Open the Settings Editor, expand **Automation Recorders**, and open the card whose title ends in `AndroidDriver`.

The card's **driver parameters** are the same values the flow replays with:

| Part | Value | What it is |
| --- | --- | --- |
| **Driver** (`driver`) | `AndroidDriver` | The G4 driver that replays the flow. The Hub also uses it to treat this card as an Android recorder |
| **Driver Service URL or Path** (`driverBinaries`) | `http://localhost:4723` | The Appium server endpoint the flow replays on. Appium 2 and later serve at the root; an Appium 1 server needs `/wd/hub` at the end |
| **Capabilities** (`capabilities.alwaysMatch`) and `firstMatch` | The capabilities every session needs, and a list of alternatives | The W3C WebDriver new-session capabilities. G4 sends both to Appium in the new-session request |

The capabilities follow the W3C WebDriver rules. Standard capabilities such as `platformName` have no prefix, and every Appium capability carries the `appium:` vendor prefix. `alwaysMatch` holds what every session needs; `firstMatch` holds alternatives, and a single `{}` entry means none. G4 keeps `firstMatch` next to `capabilities` in `driverParameters`, and puts the two together when it opens the session.

The recorder service reads four of these capabilities when you press **Start**. Appium reads all of them when you replay.

| Capability | Recorder service | Appium at replay |
| --- | --- | --- |
| `platformName` | Ignored | `android`. Required |
| `appium:automationName` | Ignored | `UiAutomator2`. Required |
| `appium:udid` | The adb serial of the device to record. Leave it empty when one device is connected | The device to replay on |
| `appium:appPackage` | The app to start and record. Empty records every app on the device | The app to start |
| `appium:appActivity` | The activity to start, such as `.MainActivity`. Empty starts the app's launcher activity | The activity to start |
| `appium:app` | An APK on your computer to install first. Leave it empty when the app is installed | The APK to install first |

The same card in `manifest.json`, set up to record the Android Settings app:

```json
{
    "enabled": true,
    "mode": "standard",
    "useOffset": false,
    "excludeDomContext": true,
    "excludeEvents": [
        {
            "name": "SwitchActivity"
        },
        {
            "name": "InvokeLongClick"
        }
    ],
    "schema": "http",
    "host": "localhost",
    "port": "9958",
    "driverParameters": {
        "capabilities": {
            "alwaysMatch": {
                "platformName": "android",
                "appium:automationName": "UiAutomator2",
                "appium:udid": "",
                "appium:appPackage": "com.android.settings",
                "appium:appActivity": ".Settings",
                "appium:app": ""
            }
        },
        "driver": "AndroidDriver",
        "driverBinaries": "http://localhost:4723",
        "firstMatch": [
            {}
        ]
    }
}
```

1. Turn **Enabled** on.
2. Fill in `appium:appPackage`, and `appium:appActivity` if you want a particular screen.
3. Fill in `appium:udid` only when `adb devices` lists more than one device.
4. Click **Save**.

> **💡 Tip:** You can add any other Appium capability to `alwaysMatch`, for example `appium:noReset`. The recorder service ignores what it does not read, and Appium applies it at replay.

The **Mode** list stays greyed out: the Android recorder always records in Standard mode.

---

## Step 4: Start the Android recorder service

Start the recorder service before you press **Start** in the panel.

1. Open the folder of the Android recorder release, or `bot-utilities\android-recorder-x64` in a sandbox that includes it.
2. Run `G4.Recorders.Android.exe` on Windows, or `dotnet G4.Recorders.Android.dll` on Linux and macOS. With a sandbox, `start-android-recorder.cmd` does the same.
3. Check that it answers.

   ```bash
   curl http://localhost:9958/api/v4/g4/recorders/android/ping
   ```

When **Use Sandbox** is on in the panel, Studio starts the service from the sandbox for you. The service still needs adb from Step 1.

---

## Step 5: Record a session

1. Open the **G4 Recorder** panel. The Android card appears as a row with the driver `AndroidDriver` and the address `localhost:9958`.
2. Press **Start**.
3. Watch the device. The recorder service installs the **G4 Android Recorder** app, switches on its accessibility service, and starts your app. The row's light turns green.
4. Use the app: tap, type into fields, scroll, and press Back.
5. Press **Stop**. The recorder service switches the accessibility service off again, stops your app, and Studio opens the recorded workflow.

Each thing you do becomes one action:

| You do | Action in the flow | Replays |
| --- | --- | --- |
| Tap a button, row, or field | `InvokeClick` with the element's XPath | Yes |
| Type into a field | One `SendKeys` with the final text, written when you leave the field | Yes |
| Scroll a list | `InvokeScroll` | No, see the note below |
| Close the on-screen keyboard | `HideSoftKeyboard` | Yes |
| Press the Back key | `UndoNavigation` | Yes |
| Long-press | `InvokeLongClick` | Left out of the flow by the card's `excludeEvents` |
| Open another screen | `SwitchActivity` | Left out of the flow by the card's `excludeEvents` |

The flow ends with `CloseBrowser`, which closes the Appium session on replay.

Element locators use the XPath vocabulary of the Appium page source, so they work at replay as they are. For example:

```text
//android.widget.EditText[@resource-id='com.example.app:id/email']
//android.widget.TextView[@text='Network & internet']/ancestor::android.widget.LinearLayout[1]
```

> **📝 Note:** Only a real key press is recorded as Back. The back gesture of gesture navigation sends no key event, and neither does `adb shell input keyevent`.

> **⚠️ Warning:** A recorded scroll does not move anything at replay. The G4 `InvokeScroll` action reads only its `Left` and `Top` parameters, while the Hub writes `--direction` and `--times`. Chromium recordings have the same gap. Replace the action by hand when your flow depends on a scroll.

---

## Step 6: Replay the flow

1. Check that the Appium server from Step 2 is running and the device is connected.
2. Run the recorded workflow from the workflow designer, as you run any flow.
3. Watch the device. Appium starts your app, and each action runs in turn.

The flow carries the card's driver parameters, so it replays on the Appium endpoint and with the capabilities you set in Step 3. To replay on another device, change `appium:udid` in the flow's driver parameters.

---

## ✔ Check your work

- [ ] `adb devices` lists your device as `device`
- [ ] `http://localhost:4723/status` reports `"ready": true`
- [ ] The Android card has the driver `AndroidDriver`, the Appium endpoint in `driverBinaries`, and your app in `appium:appPackage`
- [ ] The recorder service answers its ping on port 9958
- [ ] A session recorded taps and typed text as `InvokeClick` and `SendKeys`
- [ ] The recorded flow replays on the device through Appium

---

## 🎉 You did it

You can now choose a capture mode, pause and resume, run scripts around a session, record two machines at once, name the steps, and record and replay an Android app. From here:

- Replay a recording and publish it with [Publish a Flow](../g4-learning.md)
- Look up every recorder setting in [Configure `manifest.json`](../g4-learning.md)

Or go **back to** [the overview](README.md).
