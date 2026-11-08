# Troubleshooting: Environments and Parameters

[⬅ Back to overview](README.md)

Find your symptom in the first column. Messages are quoted as the extension shows them. A `<name>` in a message stands for text that changes. The last column names the place that writes the message or holds the rule (paths are relative to the Studio extension repository unless they start with `../`).

Jump to a group:

- [Uploading from Studio](#uploading-from-studio)
- [Reading values in a bot](#reading-values-in-a-bot)
- [Test Wright and flow calls](#test-wright-and-flow-calls)

---

## Uploading from Studio

| Symptom | Cause | Fix | Source |
| --- | --- | --- | --- |
| The picker **Select an environment to create or update** is empty | The `environments` folder has no files, or you opened a folder that is not the project's `src` folder | Add environment files to `src/environments`, and open the `src` folder in VS Code | `src/commands/update-environment.ts:77` |
| Red notification `Could not update <n> of <m> environment(s).` followed by `'<name>': <reason>` | One or more of the picked environments failed. The reason after each name says why | Fix each reason below. The environments that did not fail were uploaded | `src/commands/update-environment.ts:112` |
| `The file cannot be read: <reason>` | The file is missing, locked, or you cannot read it | Check the path and the permissions | `src/commands/update-environment.ts:166` |
| `The file is not valid JSON: <reason>` | A `.json` file has a syntax error | Fix the JSON. A missing comma or a quote is the usual cause | `src/commands/update-environment.ts:213` |
| `The file must hold one JSON object of parameter names and values.` | The JSON is a list, a number, or text | Wrap the values in `{ ... }` | `src/commands/update-environment.ts:221` |
| `The JSON object is empty.` | The object has no names | Add at least one name and value | `src/commands/update-environment.ts:225` |
| `The file has no KEY=value lines.` | A file that is not `.json` has no usable line. Every line was blank, a comment, or had no key | Write lines as `KEY=value` | `src/commands/update-environment.ts:201` |
| `'<name>': The G4 Hub answered 400: ...` | The Hub refused the request. The usual cause is a name with a character other than a letter, a digit, or `_`. Another cause is a value that is not text | Rename the file, for example `prod-eu.json` to `Prod_EU.json`. Put every value in quotes | `../g4-services/src/G4.Services.Hub.Api.V4/Controllers/EnvironmentsController.cs:175-177` |
| A timeout or a refused connection as the reason | The Hub did not answer within 5 seconds, or is not running | Start the Hub and check `g4Server` in `manifest.json` | `src/clients/g4-client.ts:213-234` |
| The status bar showed success, but the bot still sees an old value | The old name and value are still on the Hub. An upload adds and replaces, but it never removes a name | Delete the value with `DELETE /api/v4/g4/environments/{environment}/parameter/{name}`, or the whole environment with `DELETE /api/v4/g4/environments/{name}` | `../g4-api-client/src/G4.Api/Clients/EnvironmentsClient.cs:285-357` |
| The Output channel shows `Environment '<name>' was not uploaded: <reason>` or `Environment '<name>' was not updated: <reason>` | The log line for the same failure as in the red notification | Read the reason, as above | `src/commands/update-environment.ts:249`, `src/commands/update-environment.ts:260` |

---

## Reading values in a bot

| Symptom | Cause | Fix | Source |
| --- | --- | --- | --- |
| The bot uses an old value, although you changed the file | The Hub still holds the old copy. A run reads the Hub, never the file | Run **G4: Update or Create Environment Variables** again | `src/commands/update-environment.ts:81-93` |
| The macro `{{$Get-Parameter ...}}` stays in the text, or gives nothing | The value is missing in the environment, the environment name is wrong, or the macro has no `--Scope:Application`, so it reads the `Session` scope | Check the spelling of `--Name` and `--Environment`, and write `--Scope:Application`. Open `/api/v4/g4/environments/<name>?decode=true` to see what the Hub holds | `../g4-engine/src/G4.Plugins/PluginBase.cs:481-498` |
| A `User`, `Machine`, or `Process` value comes out wrong | The macro decodes the value as Base64 unless told not to. A plain word can look like valid Base64 | Add `--NoDecode` to the macro | `../g4-engine/src/G4.Plugins/PluginBase.cs:519-523`, `../g4-engine/src/G4.Extensions/DotnetExtensions.cs:270-285` |
| A name that does not exist in an existing environment may stop the rule with an error instead of giving an empty text | `TODO(verify)`: the code decodes a missing value without a null check. It was not run | Check the spelling of `--Name` against the `?decode=true` listing | `../g4-engine/src/G4.Plugins/PluginBase.cs:517-523` |
| `defaultEnvironment` has no effect | The key is misspelled `environmentSettings`, without the **s**, as in the base bots of a new project. The engine ignores it | Write `environmentsSettings` | `resources.base/chrome-automation-base.json:34`, `../g4-engine/src/G4.Models/SettingsModels.cs:48` |
| `{{$ parameters.Url }}` stays as written | Nothing supplied `Url`. It is filled only from a `--Url:value` pair of the rule, template, or flow that owns it, or from a flow call. Or the spacing is wrong | Supply the value. Use exactly one space after `{{$` and one before `}}`. For an environment value use `Get-Parameter` | `../g4-engine/src/G4.Plugins/Extensions/LocalExtensions.cs:179-198` |

---

## Test Wright and flow calls

| Symptom | Cause | Fix | Source |
| --- | --- | --- | --- |
| An environment in the Test Wright list is greyed out with **cannot be used** | The name has a character other than a letter, a digit, or `_`. Or the file is not valid JSON, or is not an object | Rename the file, or fix the JSON, then click **Refresh** | `../g4-test-wright-vscode-extension/src/services/bots-discovery-service.ts:94-109` |
| An environment file does not appear in the Test Wright list but works in Studio | Test Wright lists only `.json` files directly in `environments`. A `KEY=value` file or a file in a sub-folder is not listed | Use a `.json` file at the top level of `environments` | `../g4-test-wright-vscode-extension/src/services/bots-discovery-service.ts:76-92` |
| Run console: `Environment '<name>' was not synced: the engine accepts only letters, digits, and _ in environment names. Rename the file.` | The picked environment has a name the Hub refuses | Rename the file | `../g4-test-wright-vscode-extension/src/services/run-service.ts:390` |
| Run console: `Environment '<name>' cannot be read; the engine copy (if any) is used.` | The file is missing or is not a JSON object | Fix the file. Until then the bots use what the Hub already holds under that name | `../g4-test-wright-vscode-extension/src/services/run-service.ts:398` |
| Run console: `Environment '<name>' was not synced to the engine: <reason>` | The Hub refused the upload or did not answer | Read the reason. Check that the Hub is running | `../g4-test-wright-vscode-extension/src/services/run-service.ts:406` |
| Run console: `Environment '<name>' cannot be used: <issue>` or `Environment '<name>' was not found under environments/.` | The picked environment is flagged in the list, or its file disappeared | Fix the file or pick another environment | `../g4-test-wright-vscode-extension/resources.components/test-wright/modules/test-wright-environments.js:67-73` |
| A flow call reads a different environment than the one in the body | The flow has its own `environmentsSettings`, and the caller's settings only fill what the flow leaves out. Or the macro names an environment with `--Environment` | Write `--Environment:<name>` in the macro, or remove `environmentsSettings` from the flow | `../g4-engine/src/G4.Models/AutomationModels.cs:487-517` |
| A flow call finds no value | The environment was never uploaded. A flow call does not upload | Upload the environment first (module 3) | `../g4-services/src/G4.Services.Hub.Api.V4/Controllers/FlowsController.cs:129-150` |

---

For messages from other parts of G4 Studio, see the [product-level troubleshooting page](../troubleshooting.md).
