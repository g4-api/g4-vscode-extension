# Module 7: Replay and publish a scenario

[⬅ Back to overview](README.md) · [⬅ Module 6](06-the-run-folder.md)

**Where you are:** Module 7 of 8

⏱️ **About 6 minutes**

A scenario the agent recorded is an ordinary G4 flow. In this module you open it in the workflow viewer, run it again to check it, move it into your `bots` folder, and publish it so others can find it.

In this module, you will:

- Open a recorded flow from the result view
- Run the flow again
- Copy the flow into the `bots` folder
- Publish it from the Flow Publisher

---

## Step 1: Open the flow

1. In the result view, find a scenario with a saved flow. Its recording state is `saved`.
2. Click **Open Flow** next to it.

   ![A scenario row with the Open Flow button](images/07-open-flow.png)

   `TODO(screenshot)`: capture a scenario row with the `saved` badge and the **Open Flow** button.

The flow opens in the workflow viewer, the same editor you use for your own bots. You can read each action the agent recorded, change a value, or delete an action.

> **📝 Note:** The button opens only files inside the run folder. If the scenario has no flow, there is no button. A recording that captured no actions is marked `empty` and saves no flow.

You can also open the file yourself. Open the run folder, go to `scenarios`, and open the `flow.json` of the scenario in the editor.

---

## Step 2: Check the flow before you replay it

Before you press **Play**, open the driver settings in the workflow viewer and check that they fit the application and the machine you replay on. Quick Start Module 6 shows where those settings are. A recorded flow replays the clicks and keys of the scenario, so the application should start in the same state it had when the agent began the scenario.

The agent's note and error for each scenario are in the result view, under the scenario name. If the agent marked a scenario `failed` or `skipped`, read its note first. A failed scenario can still have a flow, and that flow holds what was recorded up to the failure.

---

## Step 3: Run the flow again

1. In the workflow viewer, click **Play** at the bottom.
2. Watch the application. When the run ends, read the report.

   ![The workflow viewer with the recorded actions and the Play button](images/07-replay-the-flow.png)

   `TODO(screenshot)`: capture the workflow viewer with a recorded flow open.

If the replay fails, fix the action that failed, such as a locator or a value, and run it again.

---

## Step 4: Move the flow into the bots folder

The Flow Publisher and the Template Publisher open from the Explorer context menu, and only for `.json` files inside a folder named `bots`. A `flow.json` in the run folder does not get these menu entries.

1. In the Explorer, copy the `flow.json` of the scenario into the `bots` folder of your project.
2. Rename the copy to something readable, for example `create-purchase-order.json`.

   ![The Explorer with the flow copied into the bots folder](images/07-copy-to-bots.png)

   `TODO(screenshot)`: capture the Explorer with the renamed file in `bots`.

> **💡 Tip:** Keep the original in the run folder as the record of what the agent did. Edit the copy.

---

## Step 5: Publish the flow

1. In the Explorer, right-click the copy in `bots`.
2. Choose **Open in Flow Publisher**.
3. Fill in the form and click **Publish**.

The Publish a Flow guide in your learning paths explains every box of the form. To share only one job of the flow, choose **Open in Template Publisher** instead.

---

## ✔ Check your work

- [ ] You opened a saved flow with **Open Flow**
- [ ] You ran the flow again and read the report
- [ ] A readable copy of the flow is in your `bots` folder
- [ ] **Open in Flow Publisher** appears when you right-click the copy

---

**Next up** 👉 [Module 8: The recorder helper reference](08-the-recorder-helper-reference.md)
