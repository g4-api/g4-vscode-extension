/*
 * Packages a white-label VSIX: the extension's static labels and icons rewritten with a Hub branding.
 *
 * VS Code reads the display name, the command categories and titles, the view and editor names, and the icons
 * from the manifest before the extension runs. package.json names those labels as %key% placeholders, filled from
 * package.nls.json; the installed extension rewrites that file from the Hub branding at runtime and asks for a
 * reload. This script bakes one branding into a VSIX ahead of time instead, for example for a marketplace build: it
 * copies the extension into a staging folder, fills resources.branding/package.nls.template.json into the staging
 * package.nls.json, replaces the side-panel icon when the branding names one, and packages the copy with vsce. The
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

// The side-panel icon files, by the branding asset that replaces them. Each file gets the SVG with currentColor
// replaced by its color; null keeps currentColor, which VS Code tints to the theme.
const ICON_TARGETS = {
    asset: 'activityBarIcon',
    files: [{ color: null, path: 'resources.assets/g4-icon.svg' }]
};

// The repository entries the staging copy leaves out: version control, sources, test output, and packages,
// whose production part is copied separately.
const EXCLUDED_ENTRIES = new Set(['.git', '.rebrand', 'node_modules', 'out', 'src']);

// Splits the lines npm writes. Linear: an optional carriage return before a line feed.
const LINE_SEPARATOR_PATTERN = /\r?\n/;

// The character code of a byte order mark at the start of a file.
const BYTE_ORDER_MARK_CODE = 0xFEFF;

// The manifest labels VS Code fills the %key% placeholders of package.json from.
const LABELS_FILE = 'package.nls.json';

// The manifest labels in token form, such as "Open {product} Report", shipped with the extension.
const LABELS_TEMPLATE_FILE = path.join('resources.branding', 'package.nls.template.json');

// Matches one placeholder such as {engineTm}. Linear: a bounded run of word characters between braces.
const TOKEN_PATTERN = /\{(\w{1,64})\}/g;

// The largest icon accepted; an activity bar icon is a few kilobytes, so anything larger is not an icon.
const MAXIMUM_ICON_BYTES = 256 * 1024;

// Matches each run of characters that cannot appear in the VSIX file name suffix. Linear: one negated class.
const SLUG_SEPARATOR_PATTERN = /[^a-z0-9]+/g;

// Matches the opening of the root svg element. Linear: a literal followed by one character class.
const SVG_START_PATTERN = /^<svg[\s>]/i;

// Matches the slashes that end a base URL, so the route is joined with exactly one slash. Linear and anchored.
const TRAILING_SLASHES_PATTERN = /\/+$/;

// Matches a branding source that is a Hub URL rather than a file path.
const URL_SOURCE_PATTERN = /^https?:\/\//i;

// Matches an XML prolog such as <?xml version="1.0"?>. Linear: one bounded character class between literals.
const XML_PROLOG_PATTERN = /^<\?xml[^>]{0,256}\?>/;

// The repository root, one folder above this script.
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

await invokeRebrand(process.argv.slice(2));

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

    // Fill the manifest labels of the staging copy only; package.json keeps its %key% placeholders.
    updateManifestLabels(stagingFolder, branding.tokens);

    // Read the staging manifest, which names the VSIX and loses its build step below.
    const packagePath = path.join(stagingFolder, 'package.json');
    const manifest = JSON.parse(readFileSync(packagePath, 'utf8'));

    // The bundle is already built, and the copy holds no build tools, so vsce must not build again.
    delete manifest.scripts?.['vscode:prepublish'];
    writeFileSync(packagePath, `${JSON.stringify(manifest, null, 4)}\n`, 'utf8');

    // Replace the side-panel icon when the branding names one; the built-in double orbit stays otherwise.
    await updateIcons(stagingFolder, branding, options.branding);

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
 * @returns {Promise<{ assets?: Record<string, string>, productName?: string, tokens: Record<string, string> }>}
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
 * Reads the SVG icon a branding asset names.
 *
 * @param {string} icon - The asset value: a path served by the Hub, or an absolute URL.
 * @param {string} source - The branding source: a Hub base URL, or the wwwroot/branding.json the Hub writes.
 * @returns {Promise<string>} The SVG document.
 *
 * @remarks
 * A path is read from the Hub when the branding came from a Hub, and from the folder of branding.json, the Hub's
 * wwwroot, when it came from the file. Fails when the icon is missing, larger than 256 KB, or not an SVG document,
 * so a branded VSIX never ships a broken icon.
 */
async function readIcon(icon, source) {
    // Resolve where the icon lives: an absolute URL as written, otherwise next to the branding source.
    const isUrlIcon = URL_SOURCE_PATTERN.test(icon);
    const isUrlSource = URL_SOURCE_PATTERN.test(source);
    let iconBytes;

    if (isUrlIcon || isUrlSource) {
        const baseUrl = isUrlSource ? source.replace(TRAILING_SLASHES_PATTERN, '') : 'http://localhost';
        const iconUrl = new URL(icon, `${baseUrl}/`);
        const response = await fetch(iconUrl);

        if (!response.ok) {
            throw new Error(`The icon ${iconUrl.href} answered ${response.status}.`);
        }

        iconBytes = Buffer.from(await response.arrayBuffer());
    } else {
        iconBytes = readFileSync(path.join(path.dirname(path.resolve(source)), icon));
    }

    // Refuse a large file and anything that is not an SVG document.
    if (iconBytes.length > MAXIMUM_ICON_BYTES) {
        throw new Error(`The icon ${icon} is larger than 256 KB.`);
    }

    const iconText = iconBytes.toString('utf8');
    const unmarkedText = iconText.charCodeAt(0) === BYTE_ORDER_MARK_CODE ? iconText.slice(1) : iconText;
    const markup = unmarkedText.trimStart().replace(XML_PROLOG_PATTERN, '').trimStart();
    const isSvg = SVG_START_PATTERN.test(markup) && markup.trimEnd().toLowerCase().endsWith('</svg>');

    if (!isSvg) {
        throw new Error(`The icon ${icon} is not an SVG file.`);
    }

    return iconText;
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
 * Replaces the side-panel icon files of the staging copy with the icon the branding names.
 *
 * @param {string} stagingFolder - The staging copy.
 * @param {{ assets?: Record<string, string> }} branding - The resolved branding.
 * @param {string} source - The branding source, used to resolve an icon path.
 *
 * @remarks
 * An empty asset keeps the built-in icon. The branded icon also replaces the built-in copies under
 * resources.assets/defaults, so the branded extension falls back to the branded icon, not the G4 double orbit, when
 * the user clears the local setting or connects to a Hub without an icon.
 */
async function updateIcons(stagingFolder, branding, source) {
    // Keep the built-in icon when the branding names none.
    const icon = branding.assets?.[ICON_TARGETS.asset]?.trim() ?? '';

    if (icon === '') {
        return;
    }

    // Write the icon into each target file, with the color that file needs.
    const iconText = await readIcon(icon, source);

    for (const target of ICON_TARGETS.files) {
        const svg = target.color === null ? iconText : iconText.replaceAll('currentColor', target.color);

        const defaultPath = path.join(path.dirname(target.path), 'defaults', path.basename(target.path));

        writeFileSync(path.join(stagingFolder, target.path), svg, 'utf8');
        writeFileSync(path.join(stagingFolder, defaultPath), svg, 'utf8');
    }
}

/**
 * Fills the manifest label template with the branding and writes it as the staging package.nls.json.
 *
 * @param {string} stagingFolder - The staging copy of the extension; its package.nls.json is replaced.
 * @param {Record<string, string>} tokens - The branding placeholder values.
 *
 * @remarks
 * The template holds every manifest label that names the product, keyed like the %key% placeholders of
 * package.json: the display name and description, command titles and categories, view container titles, view
 * names, welcome contents, custom editor names, and the settings title and descriptions. Ids, when clauses, menus,
 * and the extension identity stay as written. An unknown placeholder is kept as written.
 */
function updateManifestLabels(stagingFolder, tokens) {
    // Read the token template shipped with the extension.
    const template = JSON.parse(readFileSync(path.join(stagingFolder, LABELS_TEMPLATE_FILE), 'utf8'));
    const labels = {};

    // Replace each known placeholder of each label with its branded value.
    for (const [key, labelText] of Object.entries(template)) {
        labels[key] = labelText.replaceAll(TOKEN_PATTERN, (placeholder, tokenName) => tokens[tokenName] ?? placeholder);
    }

    // Write the labels in the shipped layout, so VS Code fills the manifest placeholders with the branded text.
    writeFileSync(path.join(stagingFolder, LABELS_FILE), `${JSON.stringify(labels, null, 4)}\n`, 'utf8');
}
