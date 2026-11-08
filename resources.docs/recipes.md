# Recipes: G4 Studio

[⬅ Back to the learning paths](g4-learning.md)

Short, step-by-step answers for common jobs. Each recipe lists the steps, how to check that it worked, and where to read more. JSON samples are the content of a bot file or a part of it. Menu names and commands are the ones the extension shows.

Jump to a recipe:

- [Open a page and check its title](#open-a-page-and-check-its-title)
- [Log in with values from an environment](#log-in-with-values-from-an-environment)
- [Repeat a bot for every row of data](#repeat-a-bot-for-every-row-of-data)
- [Do one thing or another depending on a page](#do-one-thing-or-another-depending-on-a-page)
- [Record a Windows app and clean up the step names](#record-a-windows-app-and-clean-up-the-step-names)
- [Record a web app with pauses between steps](#record-a-web-app-with-pauses-between-steps)
- [Turn a bot into a flow with parameters](#turn-a-bot-into-a-flow-with-parameters)
- [Turn a job into a template and upload many at once](#turn-a-job-into-a-template-and-upload-many-at-once)

---

## The recipes

### Open a page and check its title

**Steps:**

1. Create a file named `open-and-check.json` in the `bots` folder of your project.
2. Paste this bot into it and save.

   ```json
   {
       "driverParameters": {
           "driver": "ChromeDriver",
           "driverBinaries": ".",
           "capabilities": {
               "alwaysMatch": {
                   "browserName": "chrome"
               }
           },
           "firstMatch": [
               {}
           ]
       },
       "reference": {
           "id": "open-and-check",
           "name": "Open a page and check its title"
       },
       "stages": [
           {
               "reference": {
                   "name": "Main stage"
               },
               "jobs": [
                   {
                       "reference": {
                           "name": "Main job"
                       },
                       "rules": [
                           {
                               "$type": "Action",
                               "pluginName": "OpenUrl",
                               "argument": "http://example.com"
                           },
                           {
                               "$type": "Action",
                               "pluginName": "Assert",
                               "argument": "{{$ --Condition:PageTitle --Operator:Match --Expected:Example}}"
                           },
                           {
                               "$type": "Action",
                               "pluginName": "CloseBrowser"
                           }
                       ]
                   }
               ]
           }
       ]
   }
   ```

3. Right-click the file and choose **Open in Workflow Editor**.
4. Run the bot from the designer.

**Verify:** The run reports the assert as passed. With the default settings (`saveReports` on), a `.g4rpt` file appears under `reports`.

**Related:** The module "What an automation is" in the engine repository's "Understand a G4 Automation" path, [Work in the Workflow Editor, Module 4](work-in-the-workflow-editor/04-run-from-the-designer.md), [Work in the Workflow Editor, Module 5](work-in-the-workflow-editor/05-reports.md).

---

### Log in with values from an environment

**Steps:**

1. Create `Staging.json` in the `environments` folder of your project.

   ```json
   {
       "UserName": "demo-user",
       "Password": "demo-password"
   }
   ```

2. Press `Ctrl+Shift+P`, run **G4: Update or Create Environment Variables**, tick `Staging`, and press `Enter`.
3. In your bot, make `Staging` the default environment.

   ```json
   {
       "settings": {
           "environmentsSettings": {
               "defaultEnvironment": "Staging"
           }
       }
   }
   ```

4. Read the values in the rules that fill the login form.

   ```json
   [
       {
           "$type": "Action",
           "pluginName": "SendKeys",
           "argument": "{{$Get-Parameter --Name:UserName --Scope:Application}}",
           "locator": "CssSelector",
           "onElement": "#user"
       },
       {
           "$type": "Action",
           "pluginName": "SendKeys",
           "argument": "{{$Get-Parameter --Name:Password --Scope:Application}}",
           "locator": "CssSelector",
           "onElement": "#password"
       }
   ]
   ```

**Verify:** The status bar shows that the environment was updated, and the run types the values into the form.

**Related:** [Environments and Parameters, Module 3](environments-and-parameters/03-push-with-update-environment.md) and [Module 4](environments-and-parameters/04-use-values-in-a-bot.md). The setting key is `environmentsSettings`, with an `s`; the base bots use the wrong spelling `environmentSettings`, which the engine ignores.

---

### Repeat a bot for every row of data

**Steps:**

1. Add a data source to the bot. Each item of the array is one row.

   ```json
   {
       "dataSource": {
           "type": "Json",
           "source": "[{\"page\":\"1\"},{\"page\":\"2\"},{\"page\":\"3\"}]"
       }
   }
   ```

2. Use a column in a rule. The name after `columns.` matches the property name, and the match ignores case.

   ```json
   {
       "$type": "Action",
       "pluginName": "OpenUrl",
       "argument": "https://books.toscrape.com/catalogue/page-{{$ columns.page }}.html"
   }
   ```

3. Run the bot. It runs once for each row.

**Verify:** The report shows one iteration for each row.

**Related:** The module "Parameters and environments" in the engine repository's "Understand a G4 Automation" path. The `source` can also be a path to a file that holds a JSON array. `TODO(verify)`: a CSV source type was not found in the engine data models, so convert a CSV file to a JSON array first.

---

### Do one thing or another depending on a page

**Steps:**

1. Add a `SetCondition` rule. It must be a `Switch` rule, because only that type has `branches`.

   ```json
   {
       "$type": "Switch",
       "pluginName": "SetCondition",
       "argument": "{{$ --Condition:ElementText --Operator:Equal --Expected:Welcome back!}}",
       "locator": "CssSelector",
       "onElement": "#welcomeMessage",
       "branches": {
           "TRUE": [
               {
                   "$type": "Action",
                   "pluginName": "InvokeClick",
                   "locator": "CssSelector",
                   "onElement": "#proceedButton"
               }
           ],
           "FALSE": [
               {
                   "$type": "Action",
                   "pluginName": "NoAction"
               }
           ]
       }
   }
   ```

2. Run the bot.

**Verify:** When the text matches, the click runs. Otherwise nothing runs. A missing branch also runs nothing.

**Related:** The module "Flow control" in the engine repository's "Understand a G4 Automation" path.

---

### Record a Windows app and clean up the step names

**Steps:**

1. Run **G4: Open Settings Editor** and open the recorders section. Enable the UIA recorder.
2. Open the **G4 Recorder** view in the G4 side bar.
3. Click **Start**. Wait until the button changes to **Stop** and the light turns green.
4. Use the application you want to record.
5. Click **Stop**. The recorded workflow opens.
6. Give each step a short name of about five words. Leave the `Think Time` steps as they are.

**Verify:** The workflow opens in the designer, and each step has your name.

**Related:** [Record an App, Module 1](record-an-app/01-pick-a-recorder-and-a-capture-mode.md), [Module 2](record-an-app/02-start-suspend-resume-and-stop.md) and [Module 6](record-an-app/06-name-your-recorded-steps.md).

---

### Record a web app with pauses between steps

**Steps:**

1. In the Settings Editor, open the recorders section and select the Chrome recorder.
2. Turn on its think time. In `manifest.json` this is the `thinkTimeSettings` entry of that recorder.

   ```json
   {
       "thinkTimeSettings": {
           "enabled": true,
           "minThinkTime": 2000,
           "maxThinkTime": 5000
       }
   }
   ```

3. Click **Start** in the **G4 Recorder** view, use the web app, then click **Stop**.

**Verify:** The recorded workflow has waits named `Think Time (N seconds)` between actions. A wait is added only where the gap between two actions is longer than `minThinkTime`. The wait is never longer than `maxThinkTime`. Both values are in milliseconds.

**Related:** [Record an App, Module 6](record-an-app/06-name-your-recorded-steps.md). The Hub builds the waits in `AutomationBuilder.cs` of the `g4-services` repository.

---

### Turn a bot into a flow with parameters

**Steps:**

1. Right-click the bot file in `bots` and choose **Open in Flow Publisher**.
2. Fill in the name and description, and add the parameters the caller can set.
3. Press **Publish**. If a dialog asks whether to publish despite warnings, read the list, then choose **Publish Anyway** or cancel and fix it.

**Verify:** The publisher reports success. The flow is on the Hub and can be called with its parameters.

**Related:** [Publish a Flow](publish-a-flow/README.md), start with [Module 1](publish-a-flow/01-open-the-flow-publisher.md) and finish with [Module 6](publish-a-flow/06-publish-your-flow.md). Troubleshooting: [Publish a Flow troubleshooting](publish-a-flow/troubleshooting.md).

---

### Turn a job into a template and upload many at once

**Steps:**

1. Right-click a bot and choose **Open in Template Publisher**. Pick a stage and a job.
2. Expose the properties, add an example, and press **Publish**. The template is saved as a file in the `templates` folder.
3. Copy or edit more template files in `templates`.
4. Press `Ctrl+Shift+P`, run **G4: Update or Create Template Definitions**, tick the templates, and press `Enter`.

**Verify:** A status bar item shows the progress. If no message reports a failure, the Hub has stored every template you ticked.

**Related:** [Publish a Template](publish-a-template/README.md) and [Module 7](publish-a-template/07-bulk-upload-with-update-template.md).

---

## More help

For error messages, see the [troubleshooting page](troubleshooting.md).
