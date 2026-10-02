/*
 * Command to publish a template to the G4 Hub through a webview form: from a template file in the
 * workspace "templates" folder, or from the rules of one job of a bot in the workspace "bots" folder.
 *
 * RESOURCES:
 * VS Code command API reference: https://code.visualstudio.com/api/references/commands
 * Webview API reference: https://code.visualstudio.com/api/extension-guides/webview
 * Templates endpoint contract: PUT api/v4/g4/templates (G4PluginAttribute, 204 on success)
 * Template schema: swagger/templates/docs.json (components.schemas.G4PluginAttribute)
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';

import { CommandBase } from './command-base';
import { UpdateFlowCommand } from './update-flow';

import { G4Client } from '../clients/g4-client';

import { Channels } from '../constants/channels';

import { Utilities } from '../extensions/utilities';
import { WebviewComponents } from '../extensions/webview-components';

import { Logger } from '../logging/logger';

// Folder of the template publisher component under resources.components.
const COMPONENT_FOLDER = 'automation-template-publisher';

// Folder names (below a workspace folder) that make a file a template or a bot.
const BOTS_FOLDER = 'bots';
const TEMPLATES_FOLDER = 'templates';

// Every published template defaults to the server's default namespace.
const TEMPLATE_NAMESPACE = 'G4.System';

// A template file name: a plain name ending in .json, with no folder part and no character that a
// file name cannot hold. Linear: one negated character class followed by a literal. Mirrored by the
// component script.
const FILE_NAME_PATTERN = /^[^\\/:*?"<>|\u0000-\u001f]+\.json$/i;

// Manifest fields the form never controls: the host always sets them.
const HOST_OWNED_FIELDS = ['id', 'pluginType', 'rules', 'source', 'type'];

// The G4PluginAttribute properties the Hub accepts. Anything else a template file holds (for
// example manifestVersion or scopes) is kept in the file and never sent.
const HUB_FIELDS = [
    'aliases', 'author', 'categories', 'context', 'description', 'entity', 'examples', 'key', 'namespace',
    'outputParameters', 'parameters', 'platforms', 'pluginType', 'projectUrl', 'properties', 'protocol',
    'ruleType', 'rules', 'source', 'summary', 'version'
];

// Default summary text; the form replaces {key} while the user has not edited the summary.
const SUMMARY_TEMPLATE = 'Runs the {key} template.';

// Confirmation buttons of the token warnings notification.
const CANCEL_ACTION = 'Cancel';
const PUBLISH_ANYWAY_ACTION = 'Publish Anyway';

// Server messages (from TemplatesClient.AddTemplate and ConfirmTemplate) mapped onto form fields.
const CIRCULAR_REFERENCE_PATTERN = /circular reference/i;
const ALIAS_CONFLICT_PATTERN = /template alias/i;
const KEY_CONFLICT_PATTERN = /template key/i;

/**
 * Command that publishes one template (or one bot job's rules) as a template in the G4 Hub through a webview form.
 *
 * @remarks
 * Flow: right-click a JSON file under `<workspace>/templates` or `<workspace>/bots` → "Open with
 * Templates Publisher". A template file is read as a full manifest. A bot is read, the user picks the
 * stage and job (a Quick Pick of `#index · name`, only when there is a choice), and the job's rules
 * become the template rules. The host reads the template schema from the Hub (falling back to a
 * bundled copy), checks whether the default key already exists, and injects both into the page. The
 * page sends `lookupTemplate` and `publish`; the host owns every Hub call and file write, builds the
 * manifest, and answers with `templateLookup` and `publishResult`. After a successful publish the
 * template is saved to its file: the opened template file, or a new file in the templates folder
 * named on the page (required for a bot). The command is hidden from the Command Palette.
 */
export class UpdateTemplatePublisherCommand extends CommandBase {
    /** Logger scoped to this command; publish outcomes are written here. */
    private readonly _logger: Logger;

    /** Hub client used for the schema, lookups, and publishing. */
    private readonly _client: G4Client;

    /** Open publisher tabs keyed by source, so picking the same source reveals its tab. */
    private readonly _panels = new Map<string, vscode.WebviewPanel>();

    /**
     * Creates the Open-Template-Publisher command.
     *
     * @param context - VS Code extension context that owns the command registration.
     * @param baseUri - Base URI of the G4 Hub API.
     */
    constructor(context: vscode.ExtensionContext, baseUri: string) {
        super(context);

        this._logger = this.logger?.newLogger('G4.UpdateTemplatePublisher');
        this.command = 'Open-Template-Publisher';
        this._client = new G4Client(baseUri);
    }

    /**
     * Registers the 'Open-Template-Publisher' command and ties its disposal to the extension lifecycle.
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
     * Opens the publisher tab for the file the user right-clicked.
     *
     * @remarks
     * A file under the templates folder opens as a template; a file under the bots folder opens as
     * the rules of one of its jobs. When a path holds both folder names, the deeper one decides. The
     * file is read (and, for a bot, the stage and job are picked) before the tab opens, so an invalid
     * file or a cancelled pick is reported without an empty form. A source whose tab is already open
     * has that tab revealed instead of a second one opened.
     *
     * @param uri - The file from the Explorer context menu; the active editor's file otherwise.
     */
    protected async onInvokeCommand(uri?: vscode.Uri): Promise<void> {
        const targetUri = uri ?? vscode.window.activeTextEditor?.document.uri;
        const kind = targetUri ? UpdateTemplatePublisherCommand.getSourceKind(targetUri) : undefined;

        // Accept only JSON files under the templates or bots folder.
        if (!targetUri || !kind) {
            vscode.window.showWarningMessage('Select a JSON file under the templates or bots folder.');
            return;
        }

        const source = kind === 'template'
            ? this.readTemplateSource(targetUri.fsPath)
            : await this.readBotSource(targetUri.fsPath);

        if (!source) {
            return;
        }

        // Reveal an open tab for the same source instead of opening a second one.
        const openPanel = this._panels.get(source.panelKey);

        if (openPanel) {
            openPanel.reveal();
            return;
        }

        await this.openPublisher(source);
    }

    /**
     * Decides whether a file is a template file or a bot file.
     *
     * @remarks
     * Compute-only apart from the workspace folder check. A file under both a `templates` and a
     * `bots` folder (for example `templates/bots/x.json`) belongs to the deeper folder.
     *
     * @param uri - File to classify.
     * @returns 'template', 'bot', or `undefined` when the file is neither.
     */
    public static getSourceKind(uri: vscode.Uri): 'bot' | 'template' | undefined {
        const isTemplate = Utilities.testBotFile(uri, ['.json'], [TEMPLATES_FOLDER]);
        const isBot = Utilities.testBotFile(uri, ['.json'], [BOTS_FOLDER]);

        if (isTemplate && isBot) {
            const segments = path.normalize(uri.fsPath).toLowerCase().split(path.sep);
            return segments.lastIndexOf(TEMPLATES_FOLDER) > segments.lastIndexOf(BOTS_FOLDER) ? 'template' : 'bot';
        }

        if (isTemplate) {
            return 'template';
        }

        return isBot ? 'bot' : undefined;
    }

    /**
     * Reads a property by name, ignoring case, so bots written with either casing are understood.
     *
     * @param value - Object to read from; anything else yields `undefined`.
     * @param name - Property name.
     * @returns The property value, or `undefined`.
     */
    public static getValue(value: any, name: string): any {
        if (value === null || typeof value !== 'object') {
            return undefined;
        }

        const wanted = name.toLowerCase();
        const match = Object.keys(value).find((candidate) => candidate.toLowerCase() === wanted);

        return match === undefined ? undefined : value[match];
    }

    /**
     * Builds the default form values for a source.
     *
     * @remarks
     * Compute-only. These are the values the form starts with; the user can change every one. A
     * template file keeps its own values; the defaults only fill what the file leaves out.
     *
     * @param options - Default key, description line, and the stored manifest (empty for a bot).
     * @returns Manifest-shaped default values (without the rules, which the page holds separately).
     */
    public static newDefaultValues(options: { description: string; key: string; manifest: any }): Record<string, unknown> {
        const { description, key, manifest } = options;
        const { rules: _rules, ...storedValues } = manifest ?? {};
        const namespace = typeof storedValues.namespace === 'string' ? storedValues.namespace.trim() : '';

        return {
            aliases: [],
            author: { name: 'G4 VS Code Extension', link: '' },
            categories: ['CustomTemplates'],
            context: {},
            description: [description],
            examples: [],
            namespace: TEMPLATE_NAMESPACE,
            parameters: [],
            platforms: ['Any'],
            projectUrl: '',
            properties: [],
            protocol: {},
            summary: [SUMMARY_TEMPLATE.replace('{key}', key)],
            version: '1.0.0',
            ...storedValues,
            key: typeof storedValues.key === 'string' && storedValues.key.trim() !== '' ? storedValues.key : key,
            ...(namespace === '' ? { namespace: TEMPLATE_NAMESPACE } : {})
        };
    }

    /**
     * Builds the template manifests from the form values and the rules.
     *
     * @remarks
     * Compute-only. Form values are applied over the stored manifest (a template file keeps every
     * field the form does not edit, such as entity or manifestVersion), then every host-owned field
     * is set, so the page can never change the rules' wrapper, identity, or type. The Hub receives
     * only the fields of G4PluginAttribute; the file receives the whole manifest.
     *
     * @param options - Stored manifest, parsed rules, and the values submitted by the form.
     * @returns The `hub` payload for PUT api/v4/g4/templates and the `file` manifest to save.
     */
    public static newTemplateManifests(options: { manifest: any; rules: any[]; values: Record<string, unknown> }): { file: any; hub: any } {
        const { manifest, rules, values } = options;

        // Drop host-owned fields from the submitted values before merging.
        const formValues = Object.fromEntries(
            Object.entries(values ?? {}).filter(([name]) => !HOST_OWNED_FIELDS.includes(name)));

        // Normalize the identity the same way the form does, and default an empty namespace.
        const key = UpdateFlowCommand.convertToPascalCase(typeof formValues.key === 'string' ? formValues.key : '');
        const namespaceText = typeof formValues.namespace === 'string' ? formValues.namespace.trim() : '';

        // A bot has no stored manifest; its template starts with the fields the form never edits.
        const baseManifest = manifest ?? { entity: [], outputParameters: [] };
        const fileManifest = {
            ...baseManifest,
            ...formValues,
            key,
            namespace: namespaceText === '' ? TEMPLATE_NAMESPACE : namespaceText,
            pluginType: 'Action',
            rules,
            source: 'Template'
        };
        const hubManifest = Object.fromEntries(
            Object.entries(fileManifest).filter(([name]) => HUB_FIELDS.includes(name)));

        return { file: fileManifest, hub: hubManifest };
    }

    /**
     * Normalizes the rules before they are published and saved.
     *
     * @remarks
     * Compute-only. Each top-level rule loses its `reference` (the identity of the bot's rule, which
     * a template's rules must not carry), then every field whose value is null, an empty string, an
     * empty object, or an empty array is removed, at any depth inside the rule. `false` and `0` are
     * kept because they are values. Array entries are never removed, so the rule count and the
     * order of nested lists do not change. Anything that is not a rule object is kept as it is.
     *
     * @param rules - Parsed rules array.
     * @returns A new array of normalized rules; the input is not changed.
     */
    public static normalizeRules(rules: any[]): any[] {
        const isObject = (value: unknown): value is Record<string, unknown> =>
            value !== null && typeof value === 'object' && !Array.isArray(value);

        const isEmpty = (value: unknown): boolean =>
            value === null
            || value === undefined
            || value === ''
            || (Array.isArray(value) && value.length === 0)
            || (isObject(value) && Object.keys(value).length === 0);

        // Prunes children first, so an object that only held empty fields is empty itself.
        const prune = (value: unknown): unknown => {
            if (Array.isArray(value)) {
                return value.map(prune);
            }

            if (!isObject(value)) {
                return value;
            }

            const entries = Object.entries(value)
                .map(([name, child]) => [name, prune(child)] as const)
                .filter(([, child]) => !isEmpty(child));

            return Object.fromEntries(entries);
        };

        return rules.map((rule) => {
            if (!isObject(rule)) {
                return rule;
            }

            const { reference: _reference, ...ruleWithoutReference } = rule;

            return prune(ruleWithoutReference);
        });
    }

    /**
     * Describes the stage or job choices as Quick Pick entries: `#index · name`, with the position
     * counted from 1.
     *
     * @remarks
     * Compute-only. The number is always shown so that stages or jobs that share a name can be told
     * apart by their position in the bot.
     *
     * @param items - Names and detail text, in bot order.
     * @param kind - 'stage' or 'job', used for the text of an unnamed entry.
     * @returns Quick Pick items carrying their zero-based index.
     */
    public static newIndexedPickItems(items: PickEntry[], kind: string): IndexedPickItem[] {
        return items.map((item, index) => ({
            description: item.detail,
            index,
            label: `#${index + 1} · ${item.name === '' ? `Unnamed ${kind}` : item.name}`
        }));
    }

    /**
     * Asks the user to confirm publishing a template that has token warnings.
     *
     * @remarks
     * A short VS Code warning notification (bottom right) asks for confirmation; the warnings
     * themselves stay on the page, where they are marked in the Parameters and Rules sections.
     * Publish Anyway continues, and Cancel or closing the notification stops this publish only.
     * Warnings never block publishing.
     *
     * @param templateName - Namespace and key of the template, for the message.
     * @returns True when the user chose Publish Anyway.
     */
    private async confirmPublishWarnings(templateName: string): Promise<boolean> {
        const choice = await vscode.window.showWarningMessage(
            `Template '${templateName}' has token warnings. Publish anyway?`,
            PUBLISH_ANYWAY_ACTION,
            CANCEL_ACTION);

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
     * Describes a file below a folder: the path after the last segment with that name, with forward slashes.
     *
     * @remarks
     * Compute-only. A file in a subfolder keeps its subfolder (`examples/search.json`) on every platform.
     *
     * @param filePath - Absolute path of the file.
     * @param folderName - Folder name to measure from (`bots` or `templates`).
     * @returns The relative path.
     */
    private static getRelativePath(filePath: string, folderName: string): string {
        const segments = path.normalize(filePath).split(path.sep);
        const folderIndex = segments.map((segment) => segment.toLowerCase()).lastIndexOf(folderName);
        const relativeSegments = folderIndex === -1 ? [path.basename(filePath)] : segments.slice(folderIndex + 1);

        return relativeSegments.join('/');
    }

    /**
     * Extracts field errors and a readable message from the Hub's failure text.
     *
     * @remarks
     * Compute-only. The client returns the error body as JSON text (GenericErrorModel/ProblemDetails
     * with an `errors` map); anything else is shown verbatim. The Hub reports every manifest problem
     * under one `InvalidManifest` entry, so its message is also attached to the field it names: a
     * circular reference to the rules, an alias conflict to the aliases, and a key or namespace
     * conflict to the key.
     *
     * @param failure - Failure text returned by G4Client.publishTemplate.
     * @returns The banner message and the errors map for the form.
     */
    private static getPublishFailure(failure: string): { fieldErrors: Record<string, unknown>; message: string } {
        // Parse the problem body; non-JSON failure text (for example a timeout) is shown verbatim.
        let body: any;

        try {
            body = JSON.parse(failure);
        } catch {
            return { fieldErrors: {}, message: `The Hub rejected the template: ${failure}` };
        }

        // Prefer the field messages, then the problem title, then the raw text.
        const isErrorsMap = body !== null && typeof body?.errors === 'object';
        const fieldErrors: Record<string, unknown> = isErrorsMap ? { ...body.errors } : {};
        const messages = Object.values(fieldErrors)
            .flat()
            .filter((message): message is string => typeof message === 'string');
        const title = typeof body?.title === 'string' ? body.title : failure;
        const message = messages.length > 0 ? messages.join(' ') : title;

        // Attach manifest problems to the field they are about.
        const invalidManifest = messages.find((text) => CIRCULAR_REFERENCE_PATTERN.test(text) || ALIAS_CONFLICT_PATTERN.test(text) || KEY_CONFLICT_PATTERN.test(text));

        if (invalidManifest !== undefined) {
            let fieldName = 'Key';

            if (CIRCULAR_REFERENCE_PATTERN.test(invalidManifest)) {
                fieldName = 'Rules';
            } else if (ALIAS_CONFLICT_PATTERN.test(invalidManifest)) {
                fieldName = 'Aliases';
            }

            fieldErrors[fieldName] = [invalidManifest];
        }

        return { fieldErrors, message: `The Hub rejected the template: ${message}` };
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
            .replace('{{$ template.publisher.data }}', () => UpdateTemplatePublisherCommand.convertToInjectedJson(data))
            .replace('{{$ component.style.uri }}', () => styleUri.toString())
            .replace('{{$ component.script.uri }}', () => scriptUri.toString());
    }

    /**
     * Reads the template schema from the Hub, falling back to the copy bundled with the component.
     *
     * @returns The schemas and whether the bundled fallback was used.
     */
    private async getTemplateSchema(): Promise<{ isSchemaFallback: boolean; schemas: Record<string, any> }> {
        const schemas = await this._client.getTemplateSchema();

        if (schemas) {
            return { isSchemaFallback: false, schemas };
        }

        // The Hub is unreachable or does not publish the templates document; use the bundled schema.
        this._logger.warning('Template schema not available from the G4 Hub; using the bundled schema.');
        const bundledText = Utilities.getResource(`resources.components/${COMPONENT_FOLDER}/${COMPONENT_FOLDER}.schema.json`);

        return { isSchemaFallback: true, schemas: JSON.parse(bundledText) };
    }

    /**
     * Resolves the absolute path of a file in the workspace templates folder.
     *
     * @remarks
     * Compute-only. A file name that is not a plain `.json` name (folders, drive letters, special
     * characters) is refused, so the page can never write outside the templates folder.
     *
     * @param fileName - File name typed on the page.
     * @returns The absolute path, or `undefined` when there is no workspace folder or the name is not valid.
     */
    private static getTemplateFilePath(fileName: string): string | undefined {
        const hasWorkspace = (vscode.workspace.workspaceFolders ?? []).length > 0;
        const isValidName = FILE_NAME_PATTERN.test(fileName) && path.basename(fileName) === fileName;

        return hasWorkspace && isValidName
            ? path.join(Utilities.getSystemFolderPath('templates'), fileName)
            : undefined;
    }

    /**
     * Builds the data injected into the component's #g4-data holder.
     *
     * @remarks
     * Compute-only. The editable rules text is exactly what will be published, in full, so the page
     * can edit and publish it.
     *
     * @param options - Source, schemas, schema source, any stored template, and whether the file exists.
     * @returns The component data object.
     */
    private static newPublisherData(options: PublisherDataOptions): Record<string, unknown> {
        const { existingTemplate, isFileExisting, isSchemaFallback, schemas, source } = options;

        return {
            defaults: source.defaults,
            existingTemplate: existingTemplate ?? null,
            file: {
                fileName: source.fileName,
                isExisting: isFileExisting,
                kind: source.kind
            },
            isSchemaFallback,
            rules: { rulesText: JSON.stringify(source.rules, null, 4) },
            schemas,
            source: { label: source.label },
            summaryTemplate: SUMMARY_TEMPLATE
        };
    }

    /**
     * Handles one message from a publisher tab.
     *
     * @param options - The tab, its source, and the message.
     */
    private async onPublisherMessage(options: PublisherMessageOptions): Promise<void> {
        const { message, panel, source } = options;

        // Existence lookup for the key and file name currently in the form.
        if (message?.command === 'lookupTemplate') {
            const key = typeof message.key === 'string' ? message.key : '';
            const fileName = typeof message.fileName === 'string' ? message.fileName : '';
            const existingTemplate = key === '' ? undefined : await this._client.getTemplate(key);
            const filePath = source.kind === 'bot' ? UpdateTemplatePublisherCommand.getTemplateFilePath(fileName) : undefined;

            // The tab shows the template file name; a valid typed name replaces it as it is edited.
            if (filePath !== undefined) {
                panel.title = path.basename(filePath);
            }

            await panel.webview.postMessage({
                command: 'templateLookup',
                existingTemplate: existingTemplate ?? null,
                isFileExisting: filePath !== undefined && fs.existsSync(filePath),
                requestId: message.requestId
            });
            return;
        }

        if (message?.command === 'publish') {
            await this.publishTemplate(options);
        }
    }

    /**
     * Opens the publisher tab for a source: reads the schema and any stored template, injects the
     * data, and wires the message handler.
     *
     * @param source - The template or bot job to publish.
     */
    private async openPublisher(source: PublisherSource): Promise<void> {
        // Read the schema and the stored template (if any) behind a progress notification, since the
        // Hub calls can take up to their timeouts when the Hub is down.
        const [schemaResult, existingTemplate] = await vscode.window.withProgress(
            { location: vscode.ProgressLocation.Notification, title: `Opening template publisher for ${source.label}…` },
            () => Promise.all([this.getTemplateSchema(), this._client.getTemplate(source.defaults.key as string)]));

        // Create the tab with access to the component and font resources only.
        const panel = vscode.window.createWebviewPanel(
            'g4-template-publisher',
            path.basename(source.kind === 'bot' ? source.fileName : source.filePath),
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

        // Track the tab per source, and forget it when the user closes it.
        this._panels.set(source.panelKey, panel);
        panel.onDidDispose(() => this._panels.delete(source.panelKey), undefined, this.context.subscriptions);

        // Inject the data and render the component.
        const filePath = source.kind === 'bot' ? UpdateTemplatePublisherCommand.getTemplateFilePath(source.fileName) : undefined;
        const isFileExisting = filePath !== undefined && fs.existsSync(filePath);
        const data = UpdateTemplatePublisherCommand.newPublisherData({ existingTemplate, isFileExisting, source, ...schemaResult });
        panel.webview.html = this.getPublisherHtml(panel, data);

        // Route every page message through one handler.
        panel.webview.onDidReceiveMessage(
            (message) => this.onPublisherMessage({ message, panel, source }),
            undefined,
            this.context.subscriptions
        );
    }

    /**
     * Lets the user pick one stage or job by `#index · name` when there is a choice.
     *
     * @remarks
     * A single entry is taken without asking. The Quick Pick text explains the number: the entry's
     * position in the bot, starting at 1, which tells apart entries that share a name.
     *
     * @param items - Names and detail text, in bot order.
     * @param kind - 'stage' or 'job'.
     * @returns The zero-based index, or `undefined` when the user cancelled.
     */
    private async pickIndex(items: PickEntry[], kind: string): Promise<number | undefined> {
        if (items.length === 1) {
            return 0;
        }

        const pick = await vscode.window.showQuickPick(
            UpdateTemplatePublisherCommand.newIndexedPickItems(items, kind),
            {
                placeHolder: `#number · name: the number is the ${kind}'s position in the bot, starting at 1; it tells apart ${kind}s that share a name.`,
                title: `Select the ${kind} to take the rules from`
            });

        return pick?.index;
    }

    /**
     * Publishes the template submitted by a publisher tab and reports the result back to the tab.
     *
     * @remarks
     * The rules come from the page's editor and must be a JSON array. On success the template is
     * saved to its file, the tab stays open, its title is the saved file name, and the stored
     * template is sent back so the page shows the overwrite notice from then on. A template made from
     * a bot becomes an ordinary template file from then on. On failure the Hub's field errors are
     * forwarded so the page can mark the matching fields.
     *
     * @param options - The tab, its source, and the publish message.
     */
    private async publishTemplate(options: PublisherMessageOptions): Promise<void> {
        const { message, panel, source } = options;

        // Answers the page with a failed result and an optional field error list.
        const fail = async (failureMessage: string, fieldErrors: Record<string, unknown> = {}) => {
            await panel.webview.postMessage({ command: 'publishResult', fieldErrors, isSuccess: false, message: failureMessage });
        };

        // Parse the edited rules; the page validates them too, so this only guards the contract.
        let rules: any;

        try {
            rules = JSON.parse(typeof message.rulesText === 'string' ? message.rulesText : '');
        } catch {
            rules = undefined;
        }

        if (!Array.isArray(rules) || rules.length === 0) {
            await fail('The rules are not a JSON array.', { rules: ['Enter the template rules as a JSON array.'] });
            return;
        }

        // The Hub and the file receive the normalized rules: no reference, no empty fields.
        rules = UpdateTemplatePublisherCommand.normalizeRules(rules);

        // Build the manifests from the submitted values; host-owned fields always win.
        const manifests = UpdateTemplatePublisherCommand.newTemplateManifests({
            manifest: source.kind === 'template' ? source.manifest : undefined,
            rules,
            values: message.values ?? {}
        });
        const templateName = `${manifests.hub.namespace}/${manifests.hub.key}`;

        // An empty key after normalization is answered locally; nothing is sent to the Hub.
        if (manifests.hub.key === '') {
            await fail('The template key is empty.', { key: ['Enter at least one letter or digit.'] });
            return;
        }

        // Resolve the file to save: the opened template file, or the named file in the templates folder.
        const fileName = typeof message.fileName === 'string' ? message.fileName.trim() : '';
        const targetPath = source.kind === 'template'
            ? source.filePath
            : UpdateTemplatePublisherCommand.getTemplateFilePath(fileName);

        if (!targetPath) {
            const hasWorkspace = (vscode.workspace.workspaceFolders ?? []).length > 0;
            const reason = hasWorkspace
                ? 'Enter a plain file name that ends in .json, without folders or special characters.'
                : 'Open a workspace folder first: the template is saved to its templates folder.';

            await fail('The template file name is not valid.', { fileName: [reason] });
            return;
        }

        // Token warnings never block, but the user confirms them first.
        const warnings = Array.isArray(message.warnings)
            ? message.warnings.filter((warning: unknown) => typeof warning === 'string')
            : [];
        const isConfirmed = warnings.length === 0 || await this.confirmPublishWarnings(templateName);

        if (!isConfirmed) {
            this._logger.information(`Publishing template '${templateName}' was cancelled at the token warnings.`);
            await panel.webview.postMessage({ command: 'publishResult', isCancelled: true, isSuccess: false, message: '' });
            return;
        }

        // Send the manifest; the client returns the server's failure text when the Hub rejects it.
        vscode.window.setStatusBarMessage(`$(sync~spin) Updating template '${templateName}'...`, 5000);
        const failure = await this._client.publishTemplate(manifests.hub);

        if (failure) {
            const { fieldErrors, message: failureMessage } = UpdateTemplatePublisherCommand.getPublishFailure(failure);
            this._logger.error(`Template '${templateName}' (${source.label}) was rejected: ${failure}`);
            await fail(failureMessage, fieldErrors);
            return;
        }

        // Confirm success in the log, status bar, and tab title, then save the template file.
        this._logger.information(`Template '${templateName}' updated from ${source.label}.`);
        vscode.window.setStatusBarMessage(`$(check) Template '${templateName}' updated.`, 5000);
        panel.title = path.basename(targetPath);

        const saveResult = this.saveTemplateFile(targetPath, manifests.file);

        // A saved file is from now on the template's source: the page switches to template-file mode.
        if (saveResult.isSaved) {
            source.kind = 'template';
            source.filePath = targetPath;
            source.manifest = manifests.file;
            source.fileName = UpdateTemplatePublisherCommand.getRelativePath(targetPath, TEMPLATES_FOLDER);
        }

        const existingTemplate = await this._client.getTemplate(manifests.hub.key);
        const { rules: _rules, ...savedValues } = manifests.file;

        await panel.webview.postMessage({
            command: 'publishResult',
            existingTemplate: existingTemplate ?? null,
            fieldErrors: {},
            file: saveResult.isSaved ? { fileName: source.fileName, isExisting: true, kind: 'template' } : undefined,
            isSuccess: true,
            message: `Published ${templateName}.${saveResult.note}`,
            savedRulesText: saveResult.isSaved ? JSON.stringify(rules, null, 4) : undefined,
            savedValues: saveResult.isSaved ? savedValues : undefined
        });
    }

    /**
     * Reads a bot file, asks which stage and job to take the rules from, and describes the result as a source.
     *
     * @remarks
     * Failures are logged and shown as a warning with a log shortcut; the caller simply stops. The
     * stage is asked first (only when the bot has more than one), then the job of that stage (only
     * when it has more than one). All rules of the chosen job are taken, nested rules included.
     *
     * @param filePath - Absolute path of the bot file.
     * @returns The source, or `undefined` when the file cannot be used or the user cancelled a pick.
     */
    private async readBotSource(filePath: string): Promise<PublisherSource | undefined> {
        const relativePath = UpdateTemplatePublisherCommand.getRelativePath(filePath, BOTS_FOLDER);
        const label = `bots/${relativePath}`;

        // Parse the file; unreadable or invalid JSON is reported instead of opened.
        let automation: any;

        try {
            automation = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        } catch (error) {
            const reason = error instanceof Error ? error.message : 'the file could not be read or parsed';
            this.showFailure(`Cannot publish '${label}': ${reason}.`);
            return undefined;
        }

        // Pick the stage, then the job.
        const stages: any[] = [UpdateTemplatePublisherCommand.getValue(automation, 'stages')].flat().filter((stage) => stage !== null && typeof stage === 'object');

        if (stages.length === 0) {
            this.showFailure(`Cannot publish '${label}': the bot has no stages.`);
            return undefined;
        }

        const getName = (value: any) => String(
            UpdateTemplatePublisherCommand.getValue(value, 'name')
            ?? UpdateTemplatePublisherCommand.getValue(UpdateTemplatePublisherCommand.getValue(value, 'reference'), 'name')
            ?? '').trim();
        const getJobs = (stage: any): any[] => [UpdateTemplatePublisherCommand.getValue(stage, 'jobs')].flat().filter((job) => job !== null && typeof job === 'object');
        const getRules = (job: any): any[] => [UpdateTemplatePublisherCommand.getValue(job, 'rules')].flat().filter((rule) => rule !== null && typeof rule === 'object');

        const stageIndex = await this.pickIndex(
            stages.map((stage) => ({ detail: `${getJobs(stage).length} job(s)`, name: getName(stage) })),
            'stage');

        if (stageIndex === undefined) {
            return undefined;
        }

        const stage = stages[stageIndex];
        const jobs = getJobs(stage);

        if (jobs.length === 0) {
            this.showFailure(`Cannot publish '${label}': stage #${stageIndex + 1} has no jobs.`);
            return undefined;
        }

        const jobIndex = await this.pickIndex(
            jobs.map((job) => ({ detail: `${getRules(job).length} rule(s)`, name: getName(job) })),
            'job');

        if (jobIndex === undefined) {
            return undefined;
        }

        // Take every rule of the chosen job, as it is.
        const job = jobs[jobIndex];
        const rules = getRules(job);

        if (rules.length === 0) {
            this.showFailure(`Cannot publish '${label}': job #${jobIndex + 1} has no rules.`);
            return undefined;
        }

        // The default key is the bot name plus the job name; the file name follows the key.
        const stageName = getName(stage);
        const jobName = getName(job);
        const fileKey = UpdateFlowCommand.convertToPascalCase(path.basename(filePath, path.extname(filePath)));
        const jobKey = UpdateFlowCommand.convertToPascalCase(jobName);
        const key = jobKey === '' || jobKey === fileKey ? fileKey : `${fileKey}${jobKey}`;
        const location = `${stageName === '' ? `stage #${stageIndex + 1}` : stageName} › ${jobName === '' ? `job #${jobIndex + 1}` : jobName}`;
        const description = `Template created from ${label} (${location}) by the G4 VS Code extension.`;

        return {
            defaults: UpdateTemplatePublisherCommand.newDefaultValues({ description, key, manifest: undefined }),
            fileName: key === '' ? '' : `${key}.json`,
            filePath,
            kind: 'bot',
            label: `Publish ${label} › ${location} as a template`,
            manifest: undefined,
            panelKey: `${filePath}#${stageIndex}/${jobIndex}`,
            rules
        };
    }

    /**
     * Reads a template file and describes it as a source.
     *
     * @remarks
     * Failures are logged and shown as a warning with a log shortcut; the caller simply stops. A
     * template file holds one manifest object; a missing `rules` array becomes an empty list for
     * the user to fill in.
     *
     * @param filePath - Absolute path of the template file.
     * @returns The source, or `undefined` when the file cannot be used.
     */
    private readTemplateSource(filePath: string): PublisherSource | undefined {
        const relativePath = UpdateTemplatePublisherCommand.getRelativePath(filePath, TEMPLATES_FOLDER);
        const label = `templates/${relativePath}`;

        // Parse the file; unreadable or invalid JSON is reported instead of opened.
        let manifest: any;

        try {
            manifest = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        } catch (error) {
            const reason = error instanceof Error ? error.message : 'the file could not be read or parsed';
            this.showFailure(`Cannot publish '${label}': ${reason}.`);
            return undefined;
        }

        // A template file holds one manifest object.
        const isManifestObject = manifest !== null && typeof manifest === 'object' && !Array.isArray(manifest);

        if (!isManifestObject) {
            this.showFailure(`Cannot publish '${label}': the file must contain a single JSON object.`);
            return undefined;
        }

        const key = UpdateFlowCommand.convertToPascalCase(path.basename(filePath, path.extname(filePath)));
        const description = `Template published from ${label} by the G4 VS Code extension.`;

        return {
            defaults: UpdateTemplatePublisherCommand.newDefaultValues({ description, key, manifest }),
            fileName: relativePath,
            filePath,
            kind: 'template',
            label: `Publish ${label} to the G4 Hub as a template`,
            manifest,
            panelKey: filePath,
            rules: Array.isArray(manifest.rules) ? manifest.rules : []
        };
    }

    /**
     * Saves the published template to its file.
     *
     * @remarks
     * The file is written only when its JSON actually changes, with a 4-space indent and the file's
     * trailing newline kept (a new file ends with one). A file open with unsaved changes in an editor
     * is never overwritten: the save is skipped with a warning, so the user's editor changes are
     * kept. The folder is created when it does not exist.
     *
     * @param filePath - Absolute path of the template file.
     * @param manifest - The published template, including the fields the Hub does not take.
     * @returns Whether the file now holds the template, and a sentence for the page banner.
     */
    private saveTemplateFile(filePath: string, manifest: any): SaveResult {
        const normalizedPath = path.normalize(filePath).toLowerCase();
        const relativePath = UpdateTemplatePublisherCommand.getRelativePath(filePath, TEMPLATES_FOLDER);
        const openDocument = vscode.workspace.textDocuments.find((document) => path.normalize(document.uri.fsPath).toLowerCase() === normalizedPath);

        // Never overwrite edits the user has not saved yet.
        if (openDocument?.isDirty) {
            const note = `templates/${relativePath} has unsaved changes in an editor, so the template was not saved to the file.`;
            this._logger.warning(note);
            vscode.window.showWarningMessage(note);
            return { isSaved: false, note: ` ${note}` };
        }

        // Read the file as it is now (it may not exist yet).
        let fileText = '';

        try {
            fileText = fs.readFileSync(filePath, 'utf8');
        } catch {
            fileText = '';
        }

        // Nothing changed: leave the file and its formatting alone.
        const newLine = fileText === '' || fileText.endsWith('\n') ? '\n' : '';
        const nextText = `${JSON.stringify(manifest, null, 4)}${newLine}`;

        if (fileText !== '' && UpdateTemplatePublisherCommand.getIsSameJson(fileText, manifest)) {
            return { isSaved: true, note: '' };
        }

        // Write the file, creating its folder first.
        try {
            fs.mkdirSync(path.dirname(filePath), { recursive: true });
            fs.writeFileSync(filePath, nextText, 'utf8');
        } catch (error) {
            const reason = error instanceof Error ? error.message : 'the file could not be written';
            this.showFailure(`Published, but 'templates/${relativePath}' was not saved: ${reason}.`);
            return { isSaved: false, note: ` templates/${relativePath} was not saved: ${reason}.` };
        }

        this._logger.information(`Saved the published template to 'templates/${relativePath}'.`);

        return { isSaved: true, note: ` Saved templates/${relativePath}.` };
    }

    /**
     * Tests whether file text already holds the same JSON as a manifest.
     *
     * @param fileText - Current file text.
     * @param manifest - Manifest about to be saved.
     * @returns True when the parsed file equals the manifest; false when it differs or does not parse.
     */
    private static getIsSameJson(fileText: string, manifest: any): boolean {
        try {
            return JSON.stringify(JSON.parse(fileText)) === JSON.stringify(manifest);
        } catch {
            return false;
        }
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
}

// Contracts are kept after executable code; interfaces precede type aliases, and local dependency
// chains take priority over A-Z sorting.

/**
 * One Quick Pick entry that carries the position of the stage or job it stands for.
 */
interface IndexedPickItem extends vscode.QuickPickItem {
    /** Zero-based position in the bot. */
    index: number;
}

/**
 * A stage or job offered in a Quick Pick.
 */
interface PickEntry {
    /** Text after the number: the number of jobs or rules it holds. */
    detail: string;

    /** The stage or job name; empty when it has none. */
    name: string;
}

/**
 * Inputs for the component data injected into #g4-data.
 */
interface PublisherDataOptions {
    /** Stored template for the default key, or undefined when none exists or the Hub is unreachable. */
    existingTemplate: any;

    /** True when the default file name already exists in the templates folder (bot sources only). */
    isFileExisting: boolean;

    /** True when the bundled schema is used because the Hub schema was not available. */
    isSchemaFallback: boolean;

    /** components.schemas from the templates OpenAPI document. */
    schemas: Record<string, any>;

    /** The template or bot job being published. */
    source: PublisherSource;
}

/**
 * One message from a publisher tab, with the context needed to answer it.
 */
interface PublisherMessageOptions {
    /** Message posted by the page: lookupTemplate or publish. */
    message: any;

    /** The tab that posted the message. */
    panel: vscode.WebviewPanel;

    /** The tab's source; updated when a bot's template is saved as a template file. */
    source: PublisherSource;
}

/**
 * What a publisher tab publishes: an opened template file, or the rules of one bot job.
 */
interface PublisherSource {
    /** Default form values (manifest-shaped, without the rules). */
    defaults: Record<string, unknown>;

    /** Name shown in the Template File section: the template's path in the templates folder, or the default new file name. */
    fileName: string;

    /** Absolute path of the file that was opened (the bot, or the template file). */
    filePath: string;

    /** 'template' when the tab edits a template file; 'bot' while the template is still to be saved to a new file. */
    kind: 'bot' | 'template';

    /** Page header text. */
    label: string;

    /** The stored manifest of a template file; undefined for a bot. */
    manifest: any;

    /** Key that identifies the tab, so the same source reveals its open tab. */
    panelKey: string;

    /** The template rules the page starts with. */
    rules: any[];
}

/**
 * Outcome of saving the published template to its file.
 */
interface SaveResult {
    /** True when the file now holds the template. */
    isSaved: boolean;

    /** Sentence appended to the publish banner (starts with a space), or '' when nothing needs saying. */
    note: string;
}
