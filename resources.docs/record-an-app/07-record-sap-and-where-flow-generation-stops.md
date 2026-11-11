# Module 7: Record SAP and where flow generation stops

[⬅ Back to overview](README.md) · [⬅ Module 6](06-name-your-recorded-steps.md)

**Where you are:** Module 7 of 8

⏱️ **About 4 minutes**

There is a third recorder for SAP GUI. It records, but the Hub does not turn its events into a workflow. In this module you learn what the SAP recorder reports, where the process stops, and which messages you see if you try.

In this module, you will:

- Know what the SAP recorder is and which port it uses
- See the messages Studio shows for a refused recorder
- Know what to do with SAP events today

---

## Step 1: Know the SAP recorder

The SAP recorder runs as its own service, by default on port 9957. For each user action it can report two streams in one message:

| Stream | What it holds |
| --- | --- |
| `user32` | Mouse and keyboard input, named like the desktop recorder's events, resolved against the SAP screen |
| `nativeSap` | The SAP command that changed the screen, such as a text change, a button press, or a virtual key |

Values typed into password fields are redacted.

## Step 2: See where the Hub stops

When you press **Start**, the Hub checks every recorder:

- It accepts a driver named `UiaDriver` or `AndroidDriver`, or any driver whose name contains `chrome`. Any other driver, including a SAP driver, is refused.
- It accepts the modes `standard`, `user32`, and `coordinate` only.

So when a SAP recorder is enabled in your settings and you press **Start**, Studio shows an error that begins with `Failed to start recording:` followed by the Hub's reason. The Hub's reason for the driver is:

```text
Recorder driver must be AndroidDriver, ChromeDriver or UiaDriver.
```

The Hub builder that turns events into rules has no code for the `user32` and `nativeSap` streams. This is where flow generation stops.

![The error notification for a refused SAP recorder](images/07-sap-refused.png)

`TODO(screenshot)`: capture the error notification after you press **Start** with a SAP recorder enabled.

## Step 3: Work with it today

- **Keep the SAP recorder disabled** (**Enabled** off on its card) when you record other applications, so it does not refuse the whole session.
- **Read the events directly.** Connect your own client to the SAP recorder service and read the messages. The event format is described in the `g4-recorders` repository, in its events documentation.
- **Build the flow by hand** from what the events show, in the workflow designer.

> **📝 Note:** The older recorders client (`g4-recorders-client`) has the same limit. It accepts only `UiaDriver` and `ChromeDriver`.

---

## ✔ Check your work

- [ ] You know the SAP recorder reports two streams
- [ ] You can read the `Recorder driver must be AndroidDriver, ChromeDriver or UiaDriver.` message
- [ ] You know to keep a SAP recorder disabled when you record other applications

---

**Next up** 👉 [Module 8: Record an Android app](08-record-an-android-app.md)
