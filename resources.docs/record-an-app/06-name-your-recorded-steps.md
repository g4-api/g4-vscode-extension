# Module 6: Name your recorded steps

[⬅ Back to overview](README.md) · [⬅ Module 5](05-two-recorders-at-once.md)

**Where you are:** Module 6 of 7

⏱️ **About 5 minutes**

A recording is correct, but not yet friendly. The steps carry the names the Hub gave them, and a flow with thirty of them is hard to read. In this module you give the steps short, meaningful names. Studio has no button that renames steps for you, so this module shows where the names live and one way to change them in bulk.

In this module, you will:

- Find where a step name is stored
- Rename steps by hand
- Know a naming convention that keeps flows readable
- Know where agent-based renaming lives

---

## Step 1: Find where the name lives

Each step in a recorded flow is a rule. A rule keeps its readable name in `capabilities.displayName`, and the flow keeps its own name in `reference.name`. The workflow designer shows `displayName` on the canvas.

```json
{
    "$type": "Action",
    "pluginName": "InvokeClick",
    "onElement": "//*[@AutomationId='SearchButton']",
    "capabilities": {
        "displayName": "Click Search"
    }
}
```

The pre-script and post-script steps from Module 3 already come with a name, for example `Pre-Recording Script (powershell)`. The wait steps that the Hub adds for think time are named `Think Time (<seconds> seconds)`.

## Step 2: Rename a step

1. Open the recorded workflow. If you closed the tab, open the saved file from the `bots` folder: right-click it and choose **Open in Workflow Editor**.
2. To edit the JSON instead, right-click a `.g4` or `.g4bot` file in `bots` and choose **Open as JSON**.
3. Change `capabilities.displayName` of each step, and `reference.name` at the root.
4. Save the file.

![A recorded flow in the designer with readable step names](images/06-renamed-steps.png)

`TODO(screenshot)`: capture the designer with a recorded flow whose steps have short names such as `Open Data Grid tab`.

> **📝 Note:** `TODO(verify)`: after **Stop**, the extension opens the recorded flow in the designer and does not write a file itself. How the designer saves it is part of the Hub's embedded application, which this repository does not contain. Check the save control of the designer tab in your version.

## Step 3: Use a naming convention

Short names read well on the canvas. A pattern that works:

| Pattern | Example |
| --- | --- |
| Verb plus target | `Open Data Grid tab` |
| Typed text | `Type search: Pump` |
| Selection | `Select zone North` |
| Reset | `Clear filters` |

Keep each name under about five words. Leave the `Think Time` steps as they are.

## Step 4: Let an agent do it in bulk

The G4 agent skill `g4-visual-recording` records through the Hub Recordings API, drives the application on the screen, and can rename every step by that convention. It changes only `capabilities.displayName` and the root `reference.name`. The skill lives in the G4 skills repository and is separate from Studio.

---

## ✔ Check your work

- [ ] You know that a step name is `capabilities.displayName`
- [ ] You renamed at least three steps and the root `reference.name`
- [ ] You can name two patterns that keep a name short
- [ ] You know that Studio itself does not rename steps for you

---

**Next up** 👉 [Module 7: Record SAP and where flow generation stops](07-record-sap-and-where-flow-generation-stops.md)
