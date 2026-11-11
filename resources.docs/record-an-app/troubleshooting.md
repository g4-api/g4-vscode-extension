# Troubleshooting: Record an App

[⬅ Back to overview](README.md)

Find the message or symptom in the table, then read its card. Each card gives the cause, how to check it, the fix, and where the message comes from in the extension source (paths are relative to the extension repository).

| Symptom or message | Card |
| --- | --- |
| `A recording session is already running...` | [Already running](#a-recording-session-is-already-running-stop-it-before-starting-a-new-one) |
| `No recorder is enabled...` | [No recorder enabled](#no-recorder-is-enabled-enable-a-recorder-in-the-g4-settings-first) |
| `No recorder started because every pre-script failed.` | [Every pre-script failed](#no-recorder-started-because-every-pre-script-failed) |
| `Pre-script failed for recorder ...` | [One pre-script failed](#pre-script-failed-for-recorder-address-this-recorder-will-not-start) |
| `Recorder ... did not start: ...` | [A recorder did not start](#recorder-address-did-not-start-reason) |
| `A recorder is already recording in another session...` | [Recorder in another session](#a-recorder-is-already-recording-in-another-session-reason) |
| `Failed to start recording: ...` | [Failed to start](#failed-to-start-recording-reason) |
| `Failed to stop recording: ...` | [Failed to stop](#failed-to-stop-recording-reason) |
| `Recording stopped. No recorded events found.` | [Empty recording](#recording-stopped-no-recorded-events-found) |
| `Post-script failed for recorder ...` | [Post-script failed](#post-script-failed-for-recorder-address-see-the-g4-log-for-details) |
| `Failed to suspend recorder ...` or `Failed to resume recorder ...` | [Suspend or resume failed](#failed-to-suspend-recorder-address-reason) |
| Messages that start with `Recorder sandbox ...` | [Sandbox messages](#recorder-sandbox-messages) |
| A recorder light that never turns green | [Light stays red](#the-light-stays-red) |
| A step from VS Code in the recording | [VS Code step](#a-vs-code-step-appears-in-the-recording) |
| `Recorder driver must be ChromeDriver or UiaDriver.` with an Android card | [Hub without Android](#recorder-driver-must-be-chromedriver-or-uiadriver-with-an-android-card) |
| `adb was not found on the recorder host...` | [No adb](#adb-was-not-found-on-the-recorder-host) |
| `No Android device is connected...` | [No device](#no-android-device-is-connected) |
| `More than one Android device is connected...` or `Device '...' is not connected...` | [Which device](#more-than-one-android-device-is-connected) |
| `Recorder app not found on the recorder host: ...` | [No recorder app](#recorder-app-not-found-on-the-recorder-host-path) |
| `Failed to start '...' on device '...'` | [App does not start](#failed-to-start-package-on-device-serial) |
| The Android row's light stays red | [Android light stays red](#the-android-light-stays-red) |
| Back is missing from an Android flow | [Back not recorded](#back-is-missing-from-an-android-flow) |
| A replayed Android flow does not scroll | [Scroll does nothing](#a-replayed-flow-does-not-scroll) |
| Replay fails with `failed to stat ... No such file or directory` | [Appium path too long](#replay-fails-with-failed-to-stat--no-such-file-or-directory) |

---

## A recording session is already running. Stop it before starting a new one

- **Cause:** You pressed **Start** while a session is open in this window.
- **Check:** The panel button reads **Stop**.
- **Fix:** Press **Stop**, then **Start**.
- **Source:** `src/commands/start-recorder.ts:167`

## No recorder is enabled. Enable a recorder in the G4 settings first

- **Cause:** Every recorder card is off, or **Enable Desktop Recording** is off.
- **Check:** Open **Automation Recorders** in the Settings Editor.
- **Fix:** Turn on **Enable Desktop Recording** and the **Enabled** switch of at least one card, then click **Save**.
- **Source:** `src/commands/start-recorder.ts:176`

## No recorder started because every pre-script failed

- **Cause:** Each enabled recorder has a pre-script that exited with a non-zero code, timed out, or could not start its shell.
- **Check:** Open the **G4 Extension** output channel and read the lines that start with `Running pre-script`.
- **Fix:** Fix the scripts, or turn off **Run a Script Before Recording Starts**.
- **Source:** `src/commands/start-recorder.ts:187`

## Pre-script failed for recorder ADDRESS; this recorder will not start

- **Cause:** The pre-script of that recorder failed. Only that recorder stays out of the session.
- **Check:** Look in the **G4 Extension** channel for `exited with code` or `timed out after 30000ms`, or for `Failed to launch` when the shell is missing, for example `pwsh` or `bash`.
- **Fix:** Fix the script, install the shell, or turn the pre-script off.
- **Source:** `src/commands/start-recorder.ts:235`, `src/services/g4-recorder-script-service.ts`

## Recorder ADDRESS did not start: REASON

- **Cause:** The session started, but the Hub could not connect that recorder.
- **Check:** Open the address in a browser followed by `/swagger`, or use the refresh button in the panel.
- **Fix:** Start that recorder, or turn on **Use Sandbox** to let G4 start it. The other recorders keep recording.
- **Source:** `src/commands/start-recorder.ts:280`

## A recorder is already recording in another session: REASON

- **Cause:** The Hub answered 409. Another window or client holds one of your recorders.
- **Check:** Look for a second VS Code window, or another recording client, with a running session.
- **Fix:** Stop that session, then start again.
- **Source:** `src/commands/start-recorder.ts:371`

## Failed to start recording: REASON

- **Cause:** The Hub refused the start. Common reasons are `Recorder driver must be AndroidDriver, ChromeDriver or UiaDriver.` (see [Module 7](07-record-sap-and-where-flow-generation-stops.md)) and `Recorder mode must be standard, user32, or coordinate.`.
- **Check:** Read the reason after the colon.
- **Fix:** Correct the recorder card named by the reason, then **Save** and start again.
- **Source:** `src/commands/start-recorder.ts:372`

## Failed to stop recording: REASON

- **Cause:** The Hub could not stop the session.
- **Check:** Read the reason. The session stays open unless the Hub lost it.
- **Fix:** Press **Stop** again. When the Hub is down, start it and try again.
- **Source:** `src/commands/stop-recorder.ts:119`

## Recording stopped. No recorded events found

- **Cause:** The session stopped with no captured events, so there is no flow to show.
- **Check:** Did the recorder stay suspended, or did you act in a window the recorder cannot see?
- **Fix:** Record again. For a desktop recorder, open the application before you press **Start**.
- **Source:** `src/commands/stop-recorder.ts:103-104`

## Post-script failed for recorder ADDRESS. See the G4 log for details

- **Cause:** The post-script exited with a non-zero code or timed out. The recording itself is saved and the workflow opened.
- **Check:** Read the **G4 Extension** channel for `post-script for recorder`.
- **Fix:** Fix the script. A post-script never blocks the workflow.
- **Source:** `src/commands/stop-recorder.ts:191`

## Failed to suspend recorder ADDRESS: REASON

- **Cause:** The Hub rejected the request, for example because the session already ended. The same card covers `Failed to resume recorder ADDRESS: REASON`.
- **Check:** Refresh the panel and read the light.
- **Fix:** Start a session first. The pause button works only on a connected recorder.
- **Source:** `src/providers/g4-recorder-webview-view-provider.ts:1049`

## Recorder sandbox messages

These appear as warnings when **Use Sandbox** is on and a recorder service cannot be started.

| Message starts with | Cause | Fix |
| --- | --- | --- |
| `Recorder sandbox startup skipped because the configured sandbox folder was not found.` | `G4 Sandbox` in the manifest points to a folder that does not exist | Fix the path. See the Quick Start module on changing your sandbox |
| `Recorder sandbox startup skipped because the recorder endpoint is incomplete.` | The recorder card has no usable host or port | Fill in **Recorder Host** and **Recorder Port** |
| `Recorder sandbox startup skipped because driver '...' is unsupported.` | The driver is not one the sandbox can start | Use a `UiaDriver` or `ChromeDriver` recorder |
| `Recorder sandbox process started but ... did not answer in time.` | The process started but the ping did not answer | Wait and press the refresh button. Check the recorder log |
| `Recorder sandbox launcher failed before process creation: ...` | The operating system could not start the process | Read the reason after the colon |
| Messages that name `dotnet runtime not found` or `recorder DLL not found` | The sandbox misses a file | Re-deploy the sandbox |

- **Source:** `src/services/g4-recorder-sandbox-service.ts:40, 281, 305, 336, 367, 432, 443-470`

## The light stays red

- **Cause:** The light is green only while that recorder is part of a running session. It is red before **Start**, after **Stop**, and when the recorder did not join.
- **Check:** Press **Start**. If it stays red, look for a `Recorder ... did not start` warning.
- **Fix:** Follow the card for that warning.
- **Source:** `src/providers/g4-recorder-webview-view-provider.ts:737-746`

## A VS Code step appears in the recording

- **Cause:** The process list that Studio sends to the Hub was empty, for example because the PowerShell query timed out, or the click was in an editor that is not this VS Code.
- **Check:** Look at the recorded steps for a window name that belongs to VS Code.
- **Fix:** Delete those steps and record again. See [Module 4](04-why-vs-code-never-appears.md).
- **Source:** `src/services/g4-recorder-self-identity-service.ts`

---

[⬅ Back to overview](README.md)

---

For messages from other parts of G4 Studio, see the [product-level troubleshooting page](../troubleshooting.md).

## Recorder driver must be ChromeDriver or UiaDriver, with an Android card

- **Cause:** The Hub is older than the Android recorder and does not know `AndroidDriver`.
- **Check:** The message lists only two drivers. A Hub that knows Android says `Recorder driver must be AndroidDriver, ChromeDriver or UiaDriver.`
- **Fix:** Update the Hub, or turn the Android card off.
- **Source:** the Hub's `src/G4.Services.Domain.V4/Repositories/RecordingsRepository.cs`

## adb was not found on the recorder host

- **Cause:** The Android recorder service cannot find adb. It looks in `ANDROID_HOME`, `ANDROID_SDK_ROOT`, `android/platform-tools` under the sandbox, and the `PATH`.
- **Check:** The message lists every path it tried.
- **Fix:** Install the Android SDK platform-tools, set `ANDROID_HOME` for the recorder service, and start the service again.
- **Source:** the recorders' `src/G4.Recorders.Android.Domain/Adb/AdbPathResolver.cs`

## No Android device is connected

- **Cause:** adb lists no device in the `device` state.
- **Check:** Run `adb devices`. A device listed as `unauthorized` waits for you to accept the prompt on its screen; `offline` needs a reconnect.
- **Fix:** Connect the phone with USB debugging on, or start an emulator, then press **Start** again.
- **Source:** the recorders' `src/G4.Recorders.Android.Domain/AndroidRecorderLauncher.cs`

## More than one Android device is connected

- **Cause:** Several devices are connected and the card does not say which one to use, or `appium:udid` names a device that is not connected.
- **Check:** Compare the serials in the message with `adb devices`.
- **Fix:** Set `appium:udid` in the card's capabilities to the serial you want, then click **Save**.
- **Source:** the recorders' `src/G4.Recorders.Android.Domain/AndroidRecorderLauncher.cs`

## Recorder app not found on the recorder host: PATH

- **Cause:** The recorder service was unpacked or built without its `G4.Recorders.Android.App.Drop` folder, which holds the app it installs on the device.
- **Check:** Look for `G4.Recorders.Android.App.Drop\g4-recorder.apk` next to the recorder program.
- **Fix:** Unpack the whole release asset again. A source build needs the app's Gradle build first, which fills the drop folder.
- **Source:** the recorders' `src/G4.Recorders.Android.Domain/AndroidRecorderLauncher.cs`

## Failed to start PACKAGE on device SERIAL

- **Cause:** `appium:appPackage` or `appium:appActivity` names an app or activity the device does not have.
- **Check:** Run `adb shell pm list packages` to find the package. Leave `appium:appActivity` empty to start the app's launcher activity.
- **Fix:** Correct the capability and click **Save**.
- **Source:** the recorders' `src/G4.Recorders.Android.Domain/AndroidRecorderLauncher.cs`

## The Android light stays red

- **Cause:** The recorder app on the device cannot reach the recorder service. The service maps port 9958 on the device to your computer with `adb reverse` when you press **Start**; a restart of adb removes that mapping.
- **Check:** Open **G4 Android Recorder** on the device. It shows the connection state and the last error. Run `adb reverse --list`.
- **Fix:** Press **Stop**, then **Start** again, so the service maps the port again. Do not run `adb root` or `adb kill-server` during a session.
- **Source:** the recorders' `src/G4.Recorders.Android.App/app/src/main/kotlin/com/g4/recorders/android/RecorderHubConnection.kt`

## Back is missing from an Android flow

- **Cause:** Only a real key press is recorded as `UndoNavigation`. The back gesture of gesture navigation sends no key event, and neither does `adb shell input keyevent`.
- **Check:** The flow has a `SwitchActivity` where you went back, but no `UndoNavigation` before it.
- **Fix:** Add an `UndoNavigation` action by hand, or switch the device to three-button navigation before you record.
- **Source:** the recorders' `src/G4.Recorders.Android.App/app/src/main/kotlin/com/g4/recorders/android/RecorderAccessibilityService.kt`

## A replayed flow does not scroll

- **Cause:** The G4 `InvokeScroll` action reads only its `Left` and `Top` parameters, while the Hub writes `--direction` and `--times`, so a recorded scroll does nothing at replay. Chromium recordings have the same gap.
- **Check:** The scroll action's argument starts with `{{$ --direction:`.
- **Fix:** Replace the recorded scroll with an action that scrolls the way your app needs.
- **Source:** the plugins' `src/G4.Plugins.Ui/Actions/InvokeScroll.cs`

## Replay fails with failed to stat ... No such file or directory

- **Cause:** On Windows, Appium installs its helper apps under `APPIUM_HOME`. When that path is deep, adb cannot open them, and Appium cannot start a session.
- **Check:** The Appium log shows `failed to stat` followed by a long path that ends in `.apk`.
- **Fix:** Set `APPIUM_HOME` to a short folder such as `C:\appium`, run `appium driver install uiautomator2` again, and restart Appium.
- **Source:** the Appium server log
