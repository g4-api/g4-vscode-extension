/*
 * Command to publish a bot automation from the workspace "bots" folder to the G4 Hub as a flow.
 *
 * RESOURCES:
 * VS Code command API reference: https://code.visualstudio.com/api/references/commands
 * Webview API reference: https://code.visualstudio.com/api/extension-guides/webview
 * Flows endpoint contract: PUT api/v4/g4/flows (G4FlowManifestModel, 204 on success)
 * Flow schema: swagger/flows/docs.json (components.schemas.G4FlowManifestModel)
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';

import { CommandBase } from './command-base';

import { G4Client } from '../clients/g4-client';

import { Channels } from '../constants/channels';

import { Utilities } from '../extensions/utilities';
import { WebviewComponents } from '../extensions/webview-components';

import { Logger } from '../logging/logger';

// Folder of the flow publisher component under resources.components.
const COMPONENT_FOLDER = 'automation-flow-publisher';

// Placeholder identity: the flows cache identifies a flow by namespace and key, not by id.
const EMPTY_FLOW_ID = '00000000-0000-0000-0000-000000000000';

// Every published bot defaults to the server's default namespace, where key-only lookups resolve.
const FLOW_NAMESPACE = 'G4.System';

// Splits a file name or typed key into words: every run of characters that is not a letter or digit.
// Linear: one negated character class with a single quantifier.
const KEY_SEPARATOR_PATTERN = /[^\p{L}\p{N}]+/u;

// Manifest fields the form never controls: the host always sets them.
const HOST_OWNED_FIELDS = ['automation', 'id', 'pluginType', 'source', 'type'];

// Default summary text; the form replaces {key} while the user has not edited the summary.
const SUMMARY_TEMPLATE = 'Runs the {key} bot automation.';

// Confirmation button of the parameter warnings dialog; a modal dialog adds its own Cancel.
const PUBLISH_ANYWAY_ACTION = 'Publish Anyway';

/**
 * Command that publishes one selected bot file as a flow in the G4 Hub through a webview form.
 *
 * @remarks
 * Flow: right-click a JSON bot under `<workspace>/bots` → "Publish as Flow" (the Explorer menu uses
 * the same rule as "Open in Workflow Editor", without base.bots) → read and parse the bot → open (or
 * reveal) the `automation-flow-publisher` component in an editor tab. The host reads the flow schema
 * from the Hub (falling back to a bundled copy), checks whether the default key already exists, and
 * injects both into the page. The page sends `lookupFlow` and `publish`; the host owns every Hub call,
 * builds the manifest (authentication removed, automation Base64-encoded), and answers with
 * `flowLookup` and `publishResult`. The automation is edited in the page (without its authentication
 * block); after a successful publish the host saves it back to the bot file, authentication restored.
 * The command is hidden from the Command Palette.
 */
export class UpdateFlowCommand extends CommandBase {
    /** Logger scoped to this command; publish outcomes are written here. */
    private readonly _logger: Logger;

    /** Hub client used for the schema, lookups, and publishing. */
    private readonly _client: G4Client;

    /** Open publisher tabs keyed by bot file path, so picking the same bot reveals its tab. */
    private readonly _panels = new Map<string, vscode.WebviewPanel>();

    /**
     * Creates the Update-Flow command.
     *
     * @param context - VS Code extension context that owns the command registration.
     * @param baseUri - Base URI of the G4 Hub API.
     */
    constructor(context: vscode.ExtensionContext, baseUri: string) {
        super(context);

        this._logger = this.logger?.newLogger('G4.UpdateFlow');
        this.command = 'Update-Flow';
        this._client = new G4Client(baseUri);
    }

    /**
     * Registers the 'Update-Flow' command and ties its disposal to the extension lifecycle.
     */
    protected async onRegister(): Promise<void> {
        const disposable = vscode.commands.registerCommand(
            this.command,
            async (args: any) => {
                await this.invokeCommand(args);
            },
            this
        );

        this.context.subscriptions.push(disposable);
    }

    /**
     * Opens the publisher tab for the bot file the user right-clicked.
     *
     * @remarks
     * Applies the same rule as "Open in Workflow Editor" (bots folder only, not base.bots), so the
     * command also refuses a file passed some other way. The bot is read and parsed before the tab
     * opens, so an invalid file is reported without an empty form. A bot whose tab is already open
     * has that tab revealed instead of a second one opened.
     *
     * @param uri - The bot file from the Explorer context menu; the active editor's file otherwise.
     */
    protected async onInvokeCommand(uri?: vscode.Uri): Promise<void> {
        // Accept only JSON bot files under the bots folder.
        const targetUri = uri ?? vscode.window.activeTextEditor?.document.uri;

        if (!targetUri || !Utilities.testBotFile(targetUri, ['.json'], ['bots'])) {
            vscode.window.showWarningMessage('Select a JSON bot file under the bots folder.');
            return;
        }

        // Reveal an open tab for the same bot instead of opening a second one.
        const botFile = UpdateFlowCommand.newBotFile(targetUri.fsPath);
        const openPanel = this._panels.get(botFile.filePath);

        if (openPanel) {
            openPanel.reveal();
            return;
        }

        // Read the bot first so an unreadable or invalid file fails before the tab opens.
        const automation = this.readBotAutomation(botFile);

        if (!automation) {
            return;
        }

        await this.openPublisher(botFile, automation);
    }

    /**
     * Converts a bot file name (or typed key) into a PascalCase flow key.
     *
     * @remarks
     * Compute-only, and mirrored by the component script. The text is split on every character that
     * is not a letter or digit; each part gets an upper-case first character and keeps the rest of
     * its casing, so `google-demo` becomes `GoogleDemo` and `365-chatbot` becomes `365Chatbot`.
     *
     * @param fileBaseName - File name without directory or extension, or a key typed by the user.
     * @returns The PascalCase key, or an empty string when the text has no letters or digits.
     */
    public static convertToPascalCase(fileBaseName: string): string {
        return fileBaseName
            .split(KEY_SEPARATOR_PATTERN)
            .filter((part) => part !== '')
            .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
            .join('');
    }

    /**
     * Builds the default form values for a bot.
     *
     * @remarks
     * Compute-only. These are the values the form starts with; the user can change every one.
     *
     * @param botFile - Selected bot.
     * @returns Manifest-shaped default values.
     */
    public static newDefaultValues(botFile: BotFile): Record<string, unknown> {
        return {
            aliases: [],
            author: { name: 'G4 VS Code Extension', link: '' },
            categories: ['Bots'],
            context: {},
            description: [`Flow published from bots/${botFile.relativePath} by the G4 VS Code extension.`],
            key: botFile.key,
            namespace: FLOW_NAMESPACE,
            parameters: [],
            platforms: ['Any'],
            projectUrl: '',
            protocol: {},
            summary: [SUMMARY_TEMPLATE.replace('{key}', botFile.key)],
            version: '1.0.0'
        };
    }

    /**
     * Builds the flow manifest from the form values and the bot automation.
     *
     * @remarks
     * Compute-only. Form values are applied first, then every host-owned field is set, so the page
     * can never change the automation, identity, or type. The `authentication` block is removed
     * before encoding so tokens and credentials are never stored in the Hub. Fields that the schema
     * does not publish (entity, examples, output parameters, properties) keep fixed empty values.
     *
     * @param options - Parsed bot JSON and the values submitted by the form.
     * @returns A G4FlowManifestModel payload ready for PUT api/v4/g4/flows.
     */
    public static newFlowManifest(options: { automation: any; values: Record<string, unknown> }): any {
        const { automation, values } = options;

        // Drop host-owned fields from the submitted values before merging.
        const formValues = Object.fromEntries(
            Object.entries(values ?? {}).filter(([name]) => !HOST_OWNED_FIELDS.includes(name)));

        // Normalize the identity the same way the form does, and default an empty namespace.
        const key = UpdateFlowCommand.convertToPascalCase(typeof formValues.key === 'string' ? formValues.key : '');
        const namespaceText = typeof formValues.namespace === 'string' ? formValues.namespace.trim() : '';

        // Drop credentials from a copy so the caller's parsed object is left untouched.
        const { authentication: _authentication, ...automationWithoutAuthentication } = automation;
        const encodedAutomation = Buffer
            .from(JSON.stringify(automationWithoutAuthentication), 'utf8')
            .toString('base64');

        return {
            entity: [],
            examples: [],
            outputParameters: [],
            properties: [],
            ...formValues,
            automation: encodedAutomation,
            id: EMPTY_FLOW_ID,
            key,
            namespace: namespaceText === '' ? FLOW_NAMESPACE : namespaceText,
            pluginType: 'Flow',
            source: 'Flow'
        };
    }

    /**
     * Asks the user to confirm publishing a flow that has parameter token warnings.
     *
     * @remarks
     * A modal VS Code dialog lists the warnings and waits for an answer: unlike a notification it
     * never hides itself, so the page cannot be left locked on "Publishing…". Publish Anyway
     * continues; Cancel or closing the dialog stops this publish only. Warnings never block
     * publishing.
     *
     * @param flowName - Namespace and key of the flow, for the message.
     * @param warnings - The warning sentences sent by the page.
     * @returns True when the user chose Publish Anyway.
     */
    private async confirmPublishWarnings(flowName: string, warnings: string[]): Promise<boolean> {
        const choice = await vscode.window.showWarningMessage(
            `Flow '${flowName}' has parameter warnings. Publish anyway?`,
            { detail: warnings.join('\n'), modal: true },
            PUBLISH_ANYWAY_ACTION);

        return choice === PUBLISH_ANYWAY_ACTION;
    }

    /**
     * Serializes component data for injection into a textarea without breaking the HTML.
     *
     * @remarks
     * Compute-only. A textarea decodes character references and ends at `</textarea>`, so `<` and
     * `&` are written as JSON unicode escapes; JSON.parse restores them unchanged.
     *
     * @param data - Component data.
     * @returns HTML-safe JSON text.
     */
    private static convertToInjectedJson(data: Record<string, unknown>): string {
        // Keep the escaped backslashes: String.raw`<` is decoded to '<' by the TypeScript
        // compiler, which would silently disable this escaping.
        return JSON.stringify(data)
            .replaceAll('<', '\\u003c') // NOSONAR
            .replaceAll('&', '\\u0026'); // NOSONAR
    }

    /**
     * Reads the flow schema from the Hub, falling back to the copy bundled with the component.
     *
     * @returns The schemas and whether the bundled fallback was used.
     */
    private async getFlowSchema(): Promise<{ isSchemaFallback: boolean; schemas: Record<string, any> }> {
        const schemas = await this._client.getFlowSchema();

        if (schemas) {
            return { isSchemaFallback: false, schemas };
        }

        // The Hub is unreachable or does not publish the flows document; use the bundled schema.
        this._logger.warning('Flow schema not available from the G4 Hub; using the bundled schema.');
        const bundledText = Utilities.getResource(`resources.components/${COMPONENT_FOLDER}/${COMPONENT_FOLDER}.schema.json`);

        return { isSchemaFallback: true, schemas: JSON.parse(bundledText) };
    }

    /**
     * Names a publisher tab after the flow key, or the bot file when there is no key yet.
     *
     * @remarks
     * Compute-only. The same title is used when the tab opens, while the key is typed, and after a
     * publish, so the tab always names the flow the page would publish.
     *
     * @param key - PascalCase key from the form; empty while the key has no letters or digits.
     * @param botFile - The tab's bot.
     * @returns The tab title.
     */
    private static getPanelTitle(key: string, botFile: BotFile): string {
        const name = key === '' ? path.basename(botFile.filePath) : key;

        return `Publish Flow · ${name}`;
    }

    /**
     * Extracts field errors and a readable message from the Hub's failure text.
     *
     * @remarks
     * Compute-only. The client returns the error body as JSON text (GenericErrorModel/ProblemDetails
     * with an `errors` map); anything else (a timeout, an unreachable Hub) becomes one readable
     * sentence.
     *
     * @param failure - Failure text returned by G4Client.updateFlow.
     * @returns The banner message and the errors map for the form.
     */
    private static getPublishFailure(failure: string): { fieldErrors: Record<string, unknown>; message: string } {
        // Parse the problem body; non-JSON failure text (for example a timeout) becomes one sentence.
        let body: any;

        try {
            body = JSON.parse(failure);
        } catch {
            return { fieldErrors: {}, message: Utilities.convertToHubFailureText(failure, 'flow') };
        }

        // Prefer the field messages, then the problem title, then the raw text.
        const isErrorsMap = body !== null && typeof body?.errors === 'object';
        const fieldErrors = isErrorsMap ? body.errors : {};
        const messages = Object.values(fieldErrors)
            .flat()
            .filter((message) => typeof message === 'string');
        const title = typeof body?.title === 'string' ? body.title : failure;
        const message = messages.length > 0 ? messages.join(' ') : title;

        return { fieldErrors, message: `The Hub rejected the flow: ${message}` };
    }

    /**
     * Loads the component HTML and fills its placeholders.
     *
     * @param panel - Publisher panel, used to create webview resource URIs.
     * @param data - Component data for #g4-data.
     * @returns The final HTML.
     */
    private getPublisherHtml(panel: vscode.WebviewPanel, data: Record<string, unknown>): string {
        const componentUri = vscode.Uri.joinPath(this.context.extensionUri, 'resources.components', COMPONENT_FOLDER);
        const styleUri = panel.webview.asWebviewUri(vscode.Uri.joinPath(componentUri, `${COMPONENT_FOLDER}.css`));
        const scriptUri = panel.webview.asWebviewUri(vscode.Uri.joinPath(componentUri, `${COMPONENT_FOLDER}.js`));
        const html = WebviewComponents.setComponentHtml({
            html: Utilities.getResource(`resources.components/${COMPONENT_FOLDER}/${COMPONENT_FOLDER}.html`),
            rootPath: vscode.Uri.joinPath(this.context.extensionUri, 'resources.components').fsPath,
            toUri: (filePath) => panel.webview.asWebviewUri(vscode.Uri.file(filePath)).toString()
        });

        // The components are filled first, so the injected data is never searched for placeholders.
        // Replacer functions keep any `$` in the data from being read as a replacement pattern.
        return html
            .replace('{{$ flow.publisher.data }}', () => UpdateFlowCommand.convertToInjectedJson(data))
            .replace('{{$ component.style.uri }}', () => styleUri.toString())
            .replace('{{$ component.script.uri }}', () => scriptUri.toString());
    }

    /**
     * Describes a bot file: its path, the path below its `bots` folder, and the default flow key.
     *
     * @remarks
     * Compute-only. The relative path starts after the last `bots` segment so a bot in a subfolder
     * keeps its subfolder (`examples/find-something.json`), with forward slashes on every platform.
     *
     * @param filePath - Absolute path of the bot file.
     * @returns The bot file description.
     */
    private static newBotFile(filePath: string): BotFile {
        const segments = path.normalize(filePath).split(path.sep);
        const botsIndex = segments.map((segment) => segment.toLowerCase()).lastIndexOf('bots');
        const relativeSegments = botsIndex === -1 ? [path.basename(filePath)] : segments.slice(botsIndex + 1);
        const key = UpdateFlowCommand.convertToPascalCase(path.basename(filePath, path.extname(filePath)));

        return { filePath, key, relativePath: relativeSegments.join('/') };
    }

    /**
     * Builds the data injected into the component's #g4-data holder.
     *
     * @remarks
     * Compute-only. The editable automation text is exactly what will be encoded (authentication
     * removed), in full, so the page can edit and publish it.
     *
     * @param options - Bot, parsed automation, schemas, schema source, and any stored flow.
     * @returns The component data object.
     */
    private static newPublisherData(options: PublisherDataOptions): Record<string, unknown> {
        const { automation, botFile, existingFlow, isSchemaFallback, schemas } = options;

        // Describe exactly what will be encoded: the automation without its authentication block.
        const { authentication: _authentication, ...automationWithoutAuthentication } = automation;
        const sizeKilobytes = Buffer.byteLength(JSON.stringify(automationWithoutAuthentication), 'utf8') / 1024;

        // Assemble the page data: automation editor, defaults, schema, and any stored flow.
        return {
            automation: {
                automationText: JSON.stringify(automationWithoutAuthentication, null, 4),
                isAuthenticationRemoved: 'authentication' in automation,
                relativePath: botFile.relativePath,
                sizeText: `${sizeKilobytes.toFixed(1)} KB`
            },
            defaults: UpdateFlowCommand.newDefaultValues(botFile),
            existingFlow: existingFlow ?? null,
            isSchemaFallback,
            schemas,
            summaryTemplate: SUMMARY_TEMPLATE
        };
    }

    /**
     * Builds the bot JSON to save: the edited automation with the file's authentication block put
     * back where it was.
     *
     * @remarks
     * Compute-only. The page never shows the authentication block, so the file's block always wins
     * and keeps its original position among the top-level properties. When the file has none, the
     * edited automation is saved as it is.
     *
     * @param editedAutomation - Automation submitted by the page.
     * @param fileAutomation - Automation currently in the bot file.
     * @returns The bot JSON to write.
     */
    private static newSavedAutomation(editedAutomation: any, fileAutomation: any): any {
        if (!('authentication' in fileAutomation)) {
            return editedAutomation;
        }

        const { authentication: _authentication, ...editedWithoutAuthentication } = editedAutomation;
        const entries = Object.entries(editedWithoutAuthentication);
        const authenticationIndex = Math.min(Object.keys(fileAutomation).indexOf('authentication'), entries.length);

        entries.splice(authenticationIndex, 0, ['authentication', fileAutomation.authentication]);

        return Object.fromEntries(entries);
    }

    /**
     * Handles one message from a publisher tab.
     *
     * @param options - The tab, its bot, the parsed automation, and the message.
     */
    private async onPublisherMessage(options: PublisherMessageOptions): Promise<void> {
        const { botFile, message, panel } = options;

        // Existence lookup for the key and namespace currently in the form.
        if (message?.command === 'lookupFlow') {
            // Narrow the page's values to text; an empty namespace means the default namespace.
            const namespaceText = typeof message.namespace === 'string' ? message.namespace.trim() : '';
            const key = typeof message.key === 'string' ? message.key : '';
            const flowNamespace = namespaceText === '' ? FLOW_NAMESPACE : namespaceText;
            const existingFlow = await this._client.getFlow(flowNamespace, key);

            // The tab names the flow by the key being typed, as the template tab follows its file name.
            panel.title = UpdateFlowCommand.getPanelTitle(key, botFile);

            await panel.webview.postMessage({
                command: 'flowLookup',
                existingFlow: existingFlow ?? null,
                requestId: message.requestId
            });
            return;
        }

        if (message?.command === 'publish') {
            await this.updateFlow(options);
        }
    }

    /**
     * Opens the publisher tab for a bot: reads the schema and any stored flow, injects the data,
     * and wires the message handler.
     *
     * @param botFile - Selected bot.
     * @param automation - Parsed bot JSON.
     */
    private async openPublisher(botFile: BotFile, automation: any): Promise<void> {
        // Read the schema and the stored flow (if any) behind a progress notification, since the
        // Hub calls can take up to their timeouts when the Hub is down.
        const [schemaResult, existingFlow] = await vscode.window.withProgress(
            { location: vscode.ProgressLocation.Notification, title: `Opening flow publisher for bots/${botFile.relativePath}…` },
            () => Promise.all([this.getFlowSchema(), this._client.getFlow(FLOW_NAMESPACE, botFile.key)]));

        // Create the tab with access to the component and font resources only.
        const panel = vscode.window.createWebviewPanel(
            'g4-flow-publisher',
            UpdateFlowCommand.getPanelTitle(botFile.key, botFile),
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                localResourceRoots: [
                    vscode.Uri.joinPath(this.context.extensionUri, 'resources.fonts'),
                    vscode.Uri.joinPath(this.context.extensionUri, 'resources.components')
                ],
                retainContextWhenHidden: true
            }
        );

        // Track the tab per bot, and forget it when the user closes it.
        this._panels.set(botFile.filePath, panel);
        panel.onDidDispose(() => this._panels.delete(botFile.filePath), undefined, this.context.subscriptions);

        // Inject the data and render the component.
        const data = UpdateFlowCommand.newPublisherData({ automation, botFile, existingFlow, ...schemaResult });
        panel.webview.html = this.getPublisherHtml(panel, data);

        // Route every page message through one handler.
        panel.webview.onDidReceiveMessage(
            (message) => this.onPublisherMessage({ automation, botFile, message, panel }),
            undefined,
            this.context.subscriptions
        );
    }

    /**
     * Reads and parses the selected bot file.
     *
     * @remarks
     * Failures are logged and shown as a warning with a log shortcut; the caller simply stops.
     *
     * @param botFile - Bot file to read.
     * @returns The parsed bot object, or `undefined` when the file cannot be used.
     */
    private readBotAutomation(botFile: BotFile): any {
        // Parse the file; unreadable or invalid JSON is reported instead of opened.
        let automation: any;

        try {
            automation = JSON.parse(fs.readFileSync(botFile.filePath, 'utf8'));
        } catch (error) {
            const reason = error instanceof Error ? error.message : 'the file could not be read or parsed';
            this.showFailure(`Cannot publish 'bots/${botFile.relativePath}': ${reason}.`);
            return undefined;
        }

        // A flow wraps one automation, so the file must hold a single JSON object.
        const isAutomationObject = automation !== null && typeof automation === 'object' && !Array.isArray(automation);

        if (!isAutomationObject) {
            this.showFailure(`Cannot publish 'bots/${botFile.relativePath}': the file must contain a single JSON object.`);
            return undefined;
        }

        return automation;
    }

    /**
     * Saves the published automation back to the bot file, with its authentication block restored.
     *
     * @remarks
     * The file is written only when its JSON actually changes, with a 4-space indent and the file's
     * trailing newline kept. The caller saved any open editor of the bot before publishing, so the
     * page's automation is written over saved state: the page is the source of what is published.
     *
     * @param botFile - The tab's bot.
     * @param editedAutomation - Automation that was just published.
     * @param openedAutomation - Automation read when the tab opened; its authentication block is
     * used when the file can no longer be read.
     * @returns The saved automation text (authentication removed) and a sentence for the page banner.
     */
    private saveBotAutomation(botFile: BotFile, editedAutomation: any, openedAutomation: any): SaveResult {
        // Read the file as it is now; fall back to the copy read when the tab opened.
        let fileText = '';
        let fileAutomation = openedAutomation;

        try {
            fileText = fs.readFileSync(botFile.filePath, 'utf8');
            fileAutomation = JSON.parse(fileText);
        } catch {
            this._logger.warning(`Could not read 'bots/${botFile.relativePath}' before saving; using the copy read when the tab opened.`);
        }

        // Build the JSON to save and the text the page restores on Reset to Defaults.
        const savedAutomation = UpdateFlowCommand.newSavedAutomation(editedAutomation, fileAutomation);
        const { authentication: _authentication, ...savedWithoutAuthentication } = savedAutomation;
        const savedAutomationText = JSON.stringify(savedWithoutAuthentication, null, 4);

        // Nothing changed: leave the file and its formatting alone.
        if (JSON.stringify(savedAutomation) === JSON.stringify(fileAutomation)) {
            return { note: '', savedAutomationText };
        }

        // Write the file, keeping its trailing newline.
        const newLine = fileText.endsWith('\n') ? '\n' : '';

        try {
            fs.writeFileSync(botFile.filePath, `${JSON.stringify(savedAutomation, null, 4)}${newLine}`, 'utf8');
        } catch (error) {
            const reason = error instanceof Error ? error.message : 'the file could not be written';
            this.showFailure(`Published, but 'bots/${botFile.relativePath}' was not saved: ${reason}.`);
            return { note: ` bots/${botFile.relativePath} was not saved: ${reason}.` };
        }

        this._logger.information(`Saved the published automation to 'bots/${botFile.relativePath}'.`);

        return { note: ` Saved bots/${botFile.relativePath}.`, savedAutomationText };
    }

    /**
     * Logs a failure and shows it as a warning with a shortcut to the log.
     *
     * @param message - Failure message.
     */
    private showFailure(message: string): void {
        this._logger.error(message);

        const onSelection = (selection: string | undefined) => {
            if (selection === 'Show Log') {
                Channels.extension.show(true);
            }
        };

        vscode.window.showWarningMessage(message, 'Show Log').then(onSelection);
    }

    /**
     * Publishes the flow submitted by a publisher tab and reports the result back to the tab.
     *
     * @remarks
     * The automation comes from the page's editor and must be a JSON object. An open editor of the
     * bot with unsaved edits is saved before anything is sent; when that save fails, nothing is
     * published. On success the edited
     * automation is saved to the bot file, the tab stays open, its title follows the published key,
     * and the stored flow is sent back so the page shows the overwrite notice from then on. On
     * failure the Hub's field errors are forwarded so the page can mark the matching fields.
     *
     * @param options - The tab, its bot, the automation read when the tab opened, and the publish message.
     */
    private async updateFlow(options: PublisherMessageOptions): Promise<void> {
        const { automation: openedAutomation, botFile, message, panel } = options;

        // Parse the edited automation; the page validates it too, so this only guards the contract.
        let automation: any;

        try {
            automation = JSON.parse(typeof message.automationText === 'string' ? message.automationText : '');
        } catch {
            automation = undefined;
        }

        const isAutomationObject = automation !== null && typeof automation === 'object' && !Array.isArray(automation);

        if (!isAutomationObject) {
            await panel.webview.postMessage({
                command: 'publishResult',
                fieldErrors: { automation: ['Enter the bot automation as a JSON object.'] },
                isSuccess: false,
                message: 'The automation is not a JSON object.'
            });
            return;
        }

        // Build the manifest from the submitted values; host-owned fields always win.
        const manifest = UpdateFlowCommand.newFlowManifest({ automation, values: message.values ?? {} });
        const flowName = `${manifest.namespace}/${manifest.key}`;

        // An empty key after normalization is answered locally; nothing is sent to the Hub.
        if (manifest.key === '') {
            await panel.webview.postMessage({
                command: 'publishResult',
                fieldErrors: { key: ['Enter at least one letter or digit.'] },
                isSuccess: false,
                message: 'The flow key is empty.'
            });
            return;
        }

        // Parameter token warnings never block, but the user confirms them first.
        const warnings = Array.isArray(message.warnings)
            ? message.warnings.filter((warning: unknown) => typeof warning === 'string')
            : [];
        const isConfirmed = warnings.length === 0 || await this.confirmPublishWarnings(flowName, warnings);

        if (!isConfirmed) {
            this._logger.information(`Publishing flow '${flowName}' was cancelled at the parameter warnings.`);
            await panel.webview.postMessage({ command: 'publishResult', isCancelled: true, isSuccess: false, message: '' });
            return;
        }

        // An editor with unsaved edits of the bot is saved first, so publishing always starts from
        // saved state and the file write below never meets pending editor changes.
        const isEditorSaved = await Utilities.saveOpenDocument(botFile.filePath);

        if (!isEditorSaved) {
            const unsavedMessage = `bots/${botFile.relativePath} has unsaved changes that could not be saved, so the flow was not published.`;

            await panel.webview.postMessage({ command: 'publishResult', fieldErrors: {}, isSuccess: false, message: unsavedMessage });
            return;
        }

        // Send the manifest; the client returns the server's failure text when the Hub rejects it.
        vscode.window.setStatusBarMessage(`$(sync~spin) Updating flow '${flowName}'...`, 5000);
        const failure = await this._client.updateFlow(manifest);

        if (failure) {
            const { fieldErrors, message: failureMessage } = UpdateFlowCommand.getPublishFailure(failure);
            this._logger.error(`Flow '${flowName}' (bots/${botFile.relativePath}) was rejected: ${failure}`);
            await panel.webview.postMessage({
                command: 'publishResult',
                fieldErrors,
                isSuccess: false,
                message: failureMessage
            });
            return;
        }

        // Confirm success in the log, status bar, and tab title, then save the bot file.
        this._logger.information(`Flow '${flowName}' updated from 'bots/${botFile.relativePath}'.`);
        vscode.window.setStatusBarMessage(`$(check) Flow '${flowName}' updated.`, 5000);
        panel.title = UpdateFlowCommand.getPanelTitle(manifest.key, botFile);

        const saveResult = this.saveBotAutomation(botFile, automation, openedAutomation);
        const existingFlow = await this._client.getFlow(manifest.namespace, manifest.key);

        await panel.webview.postMessage({
            command: 'publishResult',
            existingFlow: existingFlow ?? null,
            fieldErrors: {},
            isSuccess: true,
            message: `Published ${flowName}.${saveResult.note}`,
            savedAutomationText: saveResult.savedAutomationText
        });
    }
}

// Contracts are kept after executable code; interfaces precede type aliases, and local dependency
// chains take priority over A-Z sorting.

/**
 * Inputs for the component data injected into #g4-data.
 */
interface PublisherDataOptions {
    /** Parsed bot JSON, including any authentication block (removed from the preview). */
    automation: any;

    /** Selected bot. */
    botFile: BotFile;

    /** Stored flow for the default key, or undefined when none exists or the Hub is unreachable. */
    existingFlow: any;

    /** True when the bundled schema is used because the Hub schema was not available. */
    isSchemaFallback: boolean;

    /** components.schemas from the flows OpenAPI document. */
    schemas: Record<string, any>;
}

/**
 * One message from a publisher tab, with the context needed to answer it.
 */
interface PublisherMessageOptions {
    /** Bot JSON read when the tab opened; its authentication block is the save fallback. */
    automation: any;

    /** The tab's bot. */
    botFile: BotFile;

    /** Message posted by the page: lookupFlow or publish. */
    message: any;

    /** The tab that posted the message. */
    panel: vscode.WebviewPanel;
}

/**
 * Outcome of saving the published automation back to the bot file.
 */
interface SaveResult {
    /** Sentence appended to the publish banner (starts with a space), or '' when nothing needs saying. */
    note: string;

    /** Saved automation without authentication, as the page shows it; absent when the file was not saved. */
    savedAutomationText?: string;
}

/**
 * One bot file offered for publishing.
 */
interface BotFile {
    /** Absolute path of the bot JSON file. */
    filePath: string;

    /** Default PascalCase flow key derived from the file name; empty when the name has no letters or digits. */
    key: string;

    /** Path relative to the bots folder with forward slashes, e.g. `examples/find-something-on-bing.json`. */
    relativePath: string;
}
