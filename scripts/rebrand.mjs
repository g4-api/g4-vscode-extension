/*
 * Packages a white-label VSIX: the extension's static labels and icons rewritten with a Hub branding.
 *
 * VS Code reads the display name, the command categories and titles, the view and editor names, and the icons
 * from package.json once, so they cannot follow the Hub at runtime. This script copies the extension into a
 * staging folder, rewrites those labels and the "G4" mark of the icons there, and packages the copy with vsce. The
 * repository files are never changed. It never touches the extension identity (name, publisher, version), the
 * contribution ids, the when clauses, the menus, or the dependencies, so the branded VSIX installs as the same
 * extension. README, CHANGELOG, and the shipped docs keep their G4 text.
 *
 * Usage:
 *   node scripts/rebrand.mjs --branding <branding.json | Hub URL> [--out <folder>] [--no-package]
 *
 *   --branding    The wwwroot/branding.json the Hub writes, or a Hub base URL such as http://localhost:9944, whose
 *                 GET /api/v4/g4/integration/branding returns the same settings.
 *   --out         Where the VSIX is written; defaults to the repository root.
 *   --no-package  Stops after rewriting the staging folder and prints its path, for inspection.
 *
 * RESOURCES:
 * Extension manifest: https://code.visualstudio.com/api/references/extension-manifest
 * vsce: https://github.com/microsoft/vscode-vsce
 */
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// The Hub route that publishes the resolved branding, relative to the Hub base URL.
const BRANDING_ROUTE = 'api/v4/g4/integration/branding';

// The icons whose artwork draws the "G4" mark as SVG text, relative to the repository root.
const ICON_FILES = ['resources.assets/g4-icon.svg'];

// The repository entries the staging copy leaves out: version control, sources, test output, and packages,
// whose production part is copied separately.
const EXCLUDED_ENTRIES = new Set(['.git', '.rebrand', 'node_modules', 'out', 'src']);

// Splits the lines npm writes. Linear: an optional carriage return before a line feed.
const LINE_SEPARATOR_PATTERN = /\r?\n/;

// The character code of a byte order mark at the start of a file.
const BYTE_ORDER_MARK_CODE = 0xFEFF;

// The length of the G4 mark the icons were drawn for; a longer mark is fitted into MARK_WIDTH_PIXELS.
const DEFAULT_MARK_LENGTH = 2;

// The width, in the icons' 24-unit view box, that a longer mark is fitted into.
const MARK_WIDTH_PIXELS = 22;

// Matches the opening tag of an SVG text element whose content is the G4 mark. Linear: a negated class with one
// quantifier, then a literal.
const MARK_TEXT_ELEMENT_PATTERN = /<text[^>]*>(?=G4<\/text>)/g;

// Matches the SVG text element content that draws the mark: the literal G4 between the text tags.
const MARK_TEXT_PATTERN = />G4<\/text>/g;

// Matches a standalone G4 word, not one inside an identifier such as G4Log. Linear: a literal and a lookahead.
const PRODUCT_WORD_PATTERN = /\bG4(?=[ :.,)'’-]|$)/g;

// Matches each run of characters that cannot appear in the VSIX file name suffix. Linear: one negated class.
const SLUG_SEPARATOR_PATTERN = /[^a-z0-9]+/g;

// Matches the slashes that end a base URL, so the route is joined with exactly one slash. Linear and anchored.
const TRAILING_SLASHES_PATTERN = /\/+$/;

// Matches a branding source that is a Hub URL rather than a file path.
const URL_SOURCE_PATTERN = /^https?:\/\//i;

// The repository root, one folder above this script.
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

await invokeRebrand(process.argv.slice(2));

/**
 * Converts text that names the product into its branded text.
 *
 * @param {string} text - The label text, for example "Open G4 Report".
 * @param {Record<string, string>} tokens - The branding placeholder values.
 * @returns {string} The branded text.
 *
 * @remarks
 * Longer names are replaced first, so "G4 Engine Client" is not read as "G4 Engine" followed by "Client". A G4
 * that is part of an identifier, such as G4Log or g4.reportFiles, is left as written.
 */
function convertToBrandedText(text, tokens) {
    // Replace the product names, longest first, then the marked and the plain product name.
    return text
        .replaceAll('G4 Engine Client', tokens.engineClient)
        .replaceAll('G4 Engine', tokens.engine)
        .replaceAll('G4 Hub', tokens.hub)
        .replaceAll('G4 Studio', tokens.studio)
        .replaceAll('G4 Test Wright', tokens.testWright)
        .replaceAll('G4™', tokens.productTm)
        .replaceAll(PRODUCT_WORD_PATTERN, tokens.product);
}

/**
 * Escapes the characters that carry meaning in XML text.
 *
 * @param {string} value - The text to escape.
 * @returns {string} The escaped text.
 */
function convertToEscapedXml(value) {
    return value
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;');
}

/**
 * Reads the command-line options.
 *
 * @param {string[]} argumentsList - The arguments after the script path.
 * @returns {{ branding: string, isPackaging: boolean, outputFolder: string }} The options.
 */
function getOptions(argumentsList) {
    // Read each option by name, so the order of the arguments does not matter.
    const getValue = (name) => {
        const index = argumentsList.indexOf(name);

        return index >= 0 ? argumentsList[index + 1] : undefined;
    };

    const branding = getValue('--branding');

    // Refuse a call without a branding source, since there is nothing to apply.
    if (!branding) {
        throw new Error('Pass --branding <branding.json | Hub URL>.');
    }

    return {
        branding,
        isPackaging: !argumentsList.includes('--no-package'),
        outputFolder: path.resolve(getValue('--out') ?? repositoryRoot)
    };
}

/**
 * Runs the rebrand: reads the branding, stages a copy, rewrites its labels and icons, and packages it.
 *
 * @param {string[]} argumentsList - The arguments after the script path.
 */
async function invokeRebrand(argumentsList) {
    // Read the options and the branding before any file is copied, so a bad source fails fast.
    const options = getOptions(argumentsList);
    const branding = await readBranding(options.branding);
    const slug = branding.productName?.toLowerCase().replaceAll(SLUG_SEPARATOR_PATTERN, '-') || 'branded';

    // Build the bundle in the repository, where the build tools are installed; dist/ is a build output.
    startBuild();

    // Stage a copy of the extension with the bundle and real copies of its production packages only.
    const stagingFolder = mkdtempSync(path.join(tmpdir(), `rebrand-${slug}-`));
    newStagingCopy(stagingFolder);

    // Rewrite the static labels of package.json and the mark of each icon in the staging copy only.
    const packagePath = path.join(stagingFolder, 'package.json');
    const manifest = JSON.parse(readFileSync(packagePath, 'utf8'));
    updateManifestLabels(manifest, branding.tokens);

    // The bundle is already built, and the copy holds no build tools, so vsce must not build again.
    delete manifest.scripts?.['vscode:prepublish'];
    writeFileSync(packagePath, `${JSON.stringify(manifest, null, 4)}\n`, 'utf8');

    for (const iconFile of ICON_FILES) {
        updateIconMark(path.join(stagingFolder, iconFile), branding.assets?.markText ?? branding.tokens.mark);
    }

    // Stop here when only the staging copy was asked for, and leave it for inspection.
    if (!options.isPackaging) {
        console.log(`Rebranded staging copy: ${stagingFolder}`);

        return;
    }

    // Package the copy with vsce.
    const vsixPath = path.join(options.outputFolder, `${manifest.name}-${manifest.version}-${slug}.vsix`);
    const isPackaged = startVsce(stagingFolder, vsixPath);

    // Remove the staging copy, which holds only copies, and report the outcome.
    rmSync(stagingFolder, { force: true, recursive: true });

    if (!isPackaged) {
        process.exitCode = 1;

        return;
    }

    console.log(`Rebranded VSIX: ${vsixPath}`);
}

/**
 * Copies the extension into the staging folder without version control, sources, and development packages.
 *
 * @param {string} stagingFolder - The empty staging folder.
 *
 * @remarks
 * The production packages are copied, not linked, so vsce resolves them inside the copy and deleting the copy can
 * never reach the repository.
 */
function newStagingCopy(stagingFolder) {
    // Copy every entry except the excluded ones and earlier VSIX files.
    cpSync(repositoryRoot, stagingFolder, {
        filter: (sourcePath) => {
            const relativePath = path.relative(repositoryRoot, sourcePath);
            const [firstEntry] = relativePath.split(path.sep);

            return !EXCLUDED_ENTRIES.has(firstEntry) && !relativePath.endsWith('.vsix');
        },
        recursive: true
    });

    // Copy each installed production package, so the VSIX ships the same runtime dependencies.
    const listing = spawnSync('npm ls --omit=dev --parseable --all', { cwd: repositoryRoot, encoding: 'utf8', shell: true });
    const packageFolders = listing.stdout
        .split(LINE_SEPARATOR_PATTERN)
        .map((line) => line.trim())
        .filter((line) => line !== '' && path.resolve(line) !== repositoryRoot);

    for (const packageFolder of packageFolders) {
        const relativePath = path.relative(repositoryRoot, packageFolder);

        cpSync(packageFolder, path.join(stagingFolder, relativePath), { recursive: true });
    }
}

/**
 * Reads the branding from a branding.json file or from a Hub.
 *
 * @param {string} source - A file path or a Hub base URL.
 * @returns {Promise<{ assets?: { markText?: string }, productName?: string, tokens: Record<string, string> }>}
 *     The resolved branding.
 */
async function readBranding(source) {
    // Ask the Hub when the source is a URL, otherwise read the file the Hub writes.
    const isUrl = URL_SOURCE_PATTERN.test(source);
    let branding;

    if (isUrl) {
        const response = await fetch(new URL(BRANDING_ROUTE, `${source.replace(TRAILING_SLASHES_PATTERN, '')}/`));

        if (!response.ok) {
            throw new Error(`The Hub at ${source} answered ${response.status} for its branding.`);
        }

        branding = await response.json();
    } else {
        // Drop a byte order mark, which JSON.parse refuses.
        const fileText = readFileSync(path.resolve(source), 'utf8');
        const isMarked = fileText.charCodeAt(0) === BYTE_ORDER_MARK_CODE;

        branding = JSON.parse(isMarked ? fileText.slice(1) : fileText);
    }

    // Refuse a source without placeholder values, so the labels can never be blanked.
    if (typeof branding?.tokens !== 'object' || branding.tokens === null) {
        throw new Error(`${source} holds no branding tokens.`);
    }

    return branding;
}

/**
 * Builds the production bundle in the repository with the extension's own package script.
 *
 * @remarks
 * Fails the rebrand when the build fails, so a VSIX is never packaged from an old bundle.
 */
function startBuild() {
    // Run the same build the release pipeline runs before packaging.
    const result = spawnSync('npm run package', { cwd: repositoryRoot, shell: true, stdio: 'inherit' });

    if (result.status !== 0) {
        throw new Error('The extension build failed; fix it before packaging a rebranded VSIX.');
    }
}

/**
 * Starts vsce in the staging folder and waits for the VSIX.
 *
 * @param {string} stagingFolder - The rebranded staging copy.
 * @param {string} vsixPath - Where the VSIX is written.
 * @returns {boolean} True when vsce wrote the VSIX.
 *
 * @remarks
 * Uses vsce from the PATH, as the release pipeline installs it, and falls back to npx @vscode/vsce.
 */
function startVsce(stagingFolder, vsixPath) {
    // Try the installed vsce first, then the npx package, both through the shell so .cmd shims resolve.
    const commands = [`vsce package --out "${vsixPath}"`, `npx --yes @vscode/vsce package --out "${vsixPath}"`];

    for (const command of commands) {
        const result = spawnSync(command, { cwd: stagingFolder, shell: true, stdio: 'inherit' });

        if (result.status === 0 && existsSync(vsixPath)) {
            return true;
        }
    }

    console.error('vsce could not package the rebranded copy; install it with npm install -g @vscode/vsce.');

    return false;
}

/**
 * Replaces the "G4" mark drawn by an SVG icon with the branding mark text.
 *
 * @param {string} iconPath - The staged icon file.
 * @param {string} markText - The short mark text, for example "G4".
 */
function updateIconMark(iconPath, markText) {
    // Skip an icon that does not exist in this version of the extension.
    if (!existsSync(iconPath)) {
        return;
    }

    // Fit a mark longer than the two G4 letters into the icon width, so a longer mark is narrowed, not clipped.
    const isLongMark = markText.length > DEFAULT_MARK_LENGTH;
    const fitAttributes = isLongMark ? ` textLength="${MARK_WIDTH_PIXELS}" lengthAdjust="spacingAndGlyphs"` : '';

    // Replace the drawn letters, and add the fit attributes to each text element that draws them.
    const svg = readFileSync(iconPath, 'utf8')
        .replaceAll(MARK_TEXT_ELEMENT_PATTERN, (textTag) => `${textTag.slice(0, -1)}${fitAttributes}>`)
        .replaceAll(MARK_TEXT_PATTERN, `>${convertToEscapedXml(markText)}</text>`);

    writeFileSync(iconPath, svg, 'utf8');
}

/**
 * Rewrites the static labels of the extension manifest with the branding.
 *
 * @param {object} manifest - The parsed package.json of the staging copy; changed in place.
 * @param {Record<string, string>} tokens - The branding placeholder values.
 *
 * @remarks
 * Only display text changes: the display name and description, command titles and categories, view container
 * titles, view names, welcome contents, custom editor names, and the first language alias. Ids, when clauses,
 * menus, and the extension identity stay as written.
 */
function updateManifestLabels(manifest, tokens) {
    // Brand one label field of an entry when it holds text.
    const setLabel = (entry, fieldName) => {
        if (typeof entry?.[fieldName] === 'string') {
            entry[fieldName] = convertToBrandedText(entry[fieldName], tokens);
        }
    };

    const contributes = manifest.contributes ?? {};

    // Brand the marketplace and Extensions view text.
    setLabel(manifest, 'displayName');
    setLabel(manifest, 'description');

    // Brand the Command Palette entries.
    for (const command of contributes.commands ?? []) {
        setLabel(command, 'category');
        setLabel(command, 'shortTitle');
        setLabel(command, 'title');
    }

    // Brand the activity bar and panel containers, and the views inside them.
    for (const containers of Object.values(contributes.viewsContainers ?? {})) {
        for (const container of containers) {
            setLabel(container, 'title');
        }
    }

    for (const views of Object.values(contributes.views ?? {})) {
        for (const view of views) {
            setLabel(view, 'contextualTitle');
            setLabel(view, 'name');
        }
    }

    // Brand the welcome text, the editor names in "Reopen Editor With", and the language mode name.
    for (const welcome of contributes.viewsWelcome ?? []) {
        setLabel(welcome, 'contents');
    }

    for (const editor of contributes.customEditors ?? []) {
        setLabel(editor, 'displayName');
    }

    for (const language of contributes.languages ?? []) {
        const isBrandedAlias = language.aliases?.[0]?.startsWith('G4');

        if (isBrandedAlias) {
            language.aliases[0] = `${tokens.product}${language.aliases[0].slice(2)}`;
        }
    }
}
