/*
 * The labels of documentation nodes, resolved from the documents themselves, the way the learning paths name them
 * for readers. Used by the G4 Documentations view and by New Project, which names the copied learning-path folders.
 *
 * A learning path is a folder of numbered modules with a README whose H1 names the path ("Record an App - Capture a
 * Session and Turn It into a Flow") and whose table names every module. The docs root has its own index
 * (g4-learning.md, copied to a project as "G4 Learning Paths.md") that names the paths
 * ("[📘 Configure `manifest.json`](configure-manifest/README.md)") and the reference files the same way. Turning
 * file names into Title Case cannot rebuild those names: punctuation, small words, and acronyms are lost
 * ("Plugins Externals And Mcp", "Publish A Flow"). So a node is named by the link text its index gives it, then by
 * its own title (a folder's README H1, a file's H1), and only then by its name on disk.
 *
 * Everything here is compute-only over Markdown text, so it runs without VS Code. The Test Wright extension keeps
 * the same rules in its DocumentLabelService.
 */

// Matches where a link target's anchor or query starts. Linear: one character class.
const ANCHOR_PATTERN = /[#?]/;

// Matches the "./" a link target may start with. Linear: anchored literals.
const CURRENT_FOLDER_PATTERN = /^\.\//;

// Matches a fence line that opens or closes a code block. Linear: anchored, one bounded class, then a run of one
// repeated character.
const FENCE_PATTERN = /^[ \t]{0,3}(`{3,}|~{3,})/;

// Matches an H1 heading line and captures its text. Linear: anchored, a literal, one bounded class, then the rest.
const HEADING_PATTERN = /^#[ \t]{1,8}(\S.*)$/;

// Matches the emoji, marks, and spaces some link texts start with ("📗 Quick Start"). Linear: anchored, one class.
const LEADING_SYMBOLS_PATTERN = /^[^\p{L}\p{N}]+/u;

// Matches a line break, with or without a carriage return. Linear: one optional literal and one literal.
const LINE_BREAK_PATTERN = /\r?\n/;

// Matches a Markdown link on one line: its text and its target. Linear: two bounded character classes, each
// between literals that the classes cannot contain.
const LINK_PATTERN = /\[([^\]\n]{1,200})\]\(([^)\s]{1,300})\)/g;

// File extensions read as Markdown links to documents.
const MARKDOWN_EXTENSIONS = ['.markdown', '.md', '.mdx'];

// The longest heading or link text read; a longer line is not a name.
const MAXIMUM_LABEL_LENGTH = 200;

// Matches the "Module 3:" prefix of a module heading. Linear: anchored literals around one bounded digit run.
const MODULE_PREFIX_PATTERN = /^Module[ \t]{1,8}\d{1,4}[ \t]{0,8}:[ \t]{0,8}/i;

// The name of a folder's own index, without its extension; a link to it names the folder.
const README_NAME = 'readme';

// The separators between a document's name and its subtitle, in the order they are tried.
const TITLE_SEPARATORS = [': ', ' — ', ' – ', ' - '];

/**
 * Resolves the labels of the Documentation view from Markdown text.
 *
 * @remarks
 * Static and compute-only: the provider reads the files and passes their text, so the rules can be tested in plain
 * Node and do not depend on where the documents live.
 */
export class G4DocumentLabelService {
    /**
     * Returns the label of a Markdown file.
     *
     * @remarks
     * The link text of the folder's index wins, because it is the name the learning path gives the file. Without
     * one, the file's H1 is used without its "Module N:" prefix and its subtitle; without an H1, the file name.
     *
     * @param options - The file name, the file text, and the link labels of the folder's index.
     * @returns The label.
     */
    public static getFileLabel(options: FileLabelOptions): string {
        const { fileName, fileText, linkLabels } = options;

        // Prefer the name the folder's index gives the file.
        const linkLabel = linkLabels.get(fileName.toLowerCase());

        if (linkLabel !== undefined) {
            return linkLabel;
        }

        // Fall back to the file's own title, then to its name without the extension.
        const heading = G4DocumentLabelService.getHeading(fileText).replace(MODULE_PREFIX_PATTERN, '');
        const title = G4DocumentLabelService.getTitle(heading);
        const extensionIndex = fileName.lastIndexOf('.');
        const baseName = extensionIndex > 0
            ? fileName.substring(0, extensionIndex)
            : fileName;

        return title || baseName;
    }

    /**
     * Returns the label of a folder.
     *
     * @remarks
     * The link text the parent's index gives the folder wins ("Configure manifest.json"); then the README's H1
     * without its subtitle ("Record an App"). A folder with neither gets its lower-kebab-case name in Title Case
     * ("publish-a-flow" becomes "Publish A Flow"); a name without hyphens
     * only gets its first letter capitalized.
     *
     * @param options - The folder name, the link labels of the parent's index, and the folder's README text.
     * @returns The label.
     */
    public static getFolderLabel(options: FolderLabelOptions): string {
        const { folderName, linkLabels, readmeText } = options;

        // Prefer the name the parent's index gives the folder.
        const linkLabel = linkLabels.get(`${folderName.toLowerCase()}/`);

        if (linkLabel !== undefined) {
            return linkLabel;
        }

        // Then the learning path's own title.
        const title = G4DocumentLabelService.getTitle(G4DocumentLabelService.getHeading(readmeText));

        if (title !== '') {
            return title;
        }

        // Fall back to the folder name, one capitalized word per segment.
        return folderName
            .split('-')
            .filter((word) => word !== '')
            .map((word) => word.charAt(0).toUpperCase() + word.substring(1))
            .join(' ');
    }

    /**
     * Reads the names an index gives the documents and folders next to it.
     *
     * @remarks
     * A link to a Markdown file in the same folder names that file, keyed by its lower-case name
     * ("[Recipes](recipes.md)" gives `recipes.md`). A link to the README of a subfolder, or to the subfolder itself,
     * names the subfolder, keyed by its lower-case name and a slash ("[Quick Start](quick-start/README.md)" gives
     * `quick-start/`). Other links, and links inside code blocks, do not count. The first link to a target wins,
     * because an index names its documents in its table before it mentions them again in its text.
     *
     * @param indexText - The text of the index (a README, or the docs root index).
     * @returns The labels, keyed by the lower-case file name, or the lower-case folder name and a slash.
     */
    public static getLinkLabels(indexText: string): Map<string, string> {
        const labels = new Map<string, string>();

        for (const line of G4DocumentLabelService.getProseLines(indexText)) {
            for (const match of line.matchAll(LINK_PATTERN)) {
                // Keep only links that name a document or a subfolder of this index, the first time.
                const key = G4DocumentLabelService.convertToLinkKey(match[2]);
                const label = G4DocumentLabelService.convertToLabelText(match[1]);
                const isNamedTarget = key !== '' && label !== '' && !labels.has(key);

                if (isNamedTarget) {
                    labels.set(key, label);
                }
            }
        }

        return labels;
    }

    /**
     * Converts the text of a link or heading to plain label text.
     *
     * @param text - The Markdown text.
     * @returns The text without emphasis, code marks, and leading symbols.
     */
    private static convertToLabelText(text: string): string {
        // Drop the Markdown marks a name may be written with, then the emoji it may start with.
        const plainText = text
            .replaceAll('**', '')
            .replaceAll('__', '')
            .replaceAll('`', '')
            .trim()
            .replace(LEADING_SYMBOLS_PATTERN, '');

        return plainText.length <= MAXIMUM_LABEL_LENGTH
            ? plainText.trim()
            : '';
    }

    /**
     * Converts a link target to the key of the document or subfolder it names.
     *
     * @param target - The link target, for example `01-deploy-the-sandbox.md#step-1` or `quick-start/README.md`.
     * @returns `<file>` for a Markdown file in the same folder, `<folder>/` for a subfolder or its README, or an
     *     empty string for any other target.
     */
    private static convertToLinkKey(target: string): string {
        // Drop the anchor and the query, then read encoded characters such as %20.
        const anchorIndex = target.search(ANCHOR_PATTERN);
        const targetPath = anchorIndex >= 0
            ? target.substring(0, anchorIndex)
            : target;
        let relativePath: string;

        try {
            relativePath = decodeURIComponent(targetPath).replace(CURRENT_FOLDER_PATTERN, '').toLowerCase();
        } catch {
            return '';
        }

        // A same-folder Markdown file names a document.
        const segments = relativePath.split('/');
        const testMarkdown = (name: string): boolean => MARKDOWN_EXTENSIONS.some((extension) => name.endsWith(extension));
        const isDocument = segments.length === 1 && segments[0] !== '' && testMarkdown(segments[0]);

        if (isDocument) {
            return segments[0];
        }

        // A subfolder, or its README, names the subfolder; deeper links and other files name nothing.
        const isSubfolder = segments.length === 2 && segments[0] !== '' && segments[0] !== '..';
        const lastSegment = segments.at(-1) ?? '';
        const isFolderIndex = lastSegment === '' || (testMarkdown(lastSegment) && lastSegment.startsWith(`${README_NAME}.`));

        return isSubfolder && isFolderIndex
            ? `${segments[0]}/`
            : '';
    }

    /**
     * Returns the text of the first H1 outside code blocks.
     *
     * @param text - The Markdown text.
     * @returns The heading text, or an empty string when there is none.
     */
    private static getHeading(text: string): string {
        for (const line of G4DocumentLabelService.getProseLines(text)) {
            const heading = HEADING_PATTERN.exec(line);

            if (heading !== null) {
                return G4DocumentLabelService.convertToLabelText(heading[1]);
            }
        }

        return '';
    }

    /**
     * Returns the lines of a Markdown text that are outside fenced code blocks.
     *
     * @remarks
     * A code block may hold lines that look like headings or links (a shell comment, an example), which are not
     * names. A block ends at a fence of the same character that opened it.
     *
     * @param text - The Markdown text.
     * @returns The prose lines, in order.
     */
    private static getProseLines(text: string): string[] {
        const lines: string[] = [];
        let fenceCharacter = '';

        for (const line of text.split(LINE_BREAK_PATTERN)) {
            const fence = FENCE_PATTERN.exec(line);

            // A fence opens a block, or closes the block its character opened; it is never prose.
            if (fence !== null) {
                const character = fence[1].charAt(0);

                if (fenceCharacter === '') {
                    fenceCharacter = character;
                } else if (fenceCharacter === character) {
                    fenceCharacter = '';
                }

                continue;
            }

            // Keep the line only outside a block.
            if (fenceCharacter === '') {
                lines.push(line);
            }
        }

        return lines;
    }

    /**
     * Returns a heading without its subtitle.
     *
     * @remarks
     * A learning-path heading is a name and a subtitle ("Publish a Flow — Share Your Automation with the G4 Hub"); the
     * first separator found ends the name. A heading without a separator is a name already.
     *
     * @param heading - The heading text.
     * @returns The name.
     */
    private static getTitle(heading: string): string {
        // Cut at the earliest separator, so a subtitle with its own colon or dash stays out.
        const positions = TITLE_SEPARATORS
            .map((separator) => heading.indexOf(separator))
            .filter((position) => position > 0);
        const end = positions.length > 0
            ? Math.min(...positions)
            : heading.length;

        return heading.substring(0, end).trim();
    }
}

// Compile-time contracts stay after the executable code. Interfaces come before type aliases, and a contract
// follows the contracts that depend on it before A-Z order resumes.

/**
 * Inputs of {@link G4DocumentLabelService.getFileLabel}.
 */
export interface FileLabelOptions {
    /** The file name, with its extension. */
    fileName: string;

    /** The file text; empty when it could not be read. */
    fileText: string;

    /** The names the folder's index gives its documents, as {@link G4DocumentLabelService.getLinkLabels} returns them. */
    linkLabels: ReadonlyMap<string, string>;
}

/**
 * Inputs of {@link G4DocumentLabelService.getFolderLabel}.
 */
export interface FolderLabelOptions {
    /** The folder name on disk. */
    folderName: string;

    /**
     * The names the parent's index gives its documents and folders, as
     * {@link G4DocumentLabelService.getLinkLabels} returns them.
     */
    linkLabels: ReadonlyMap<string, string>;

    /** The text of the folder's README; empty when it has none. */
    readmeText: string;
}
