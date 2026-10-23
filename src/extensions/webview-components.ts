/*
 * Loads reusable webview components (resources.components/g4-*) into a component page.
 *
 * RESOURCES:
 * Custom elements: https://developer.mozilla.org/docs/Web/API/Web_components/Using_custom_elements
 * Webview resources: https://code.visualstudio.com/api/extension-guides/webview#loading-local-content
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

// Accepted component names: lowercase words joined by hyphens, starting with the g4- prefix.
// Linear: literal prefix, then one character class with a single quantifier.
const COMPONENT_NAME_PATTERN = /^g4-[a-z0-9-]+$/;

// Reads the components a component builds on, from its first template:
// <template id="g4-json-textarea-template" data-dependencies="g4-line-numbers g4-expand-editor">.
// Linear: literal text, then one negated character class with a single quantifier.
const DEPENDENCIES_PATTERN = /data-dependencies="([^"]*)"/i;

// Splits a space-separated name list. Linear: one character class with a single quantifier.
const NAME_SEPARATOR_PATTERN = /\s+/;

// Reads the component names a page declares: <meta name="g4-components" content="g4-section g4-field">.
// Linear: literal text, then one negated character class with a single quantifier.
const PAGE_COMPONENTS_PATTERN = /<meta\s+name="g4-components"\s+content="([^"]*)"/i;

// Page placeholder filled with the components' scripts.
const SCRIPTS_PLACEHOLDER = '{{$ components.scripts }}';

// Page placeholder filled with the components' stylesheet links.
const STYLES_PLACEHOLDER = '{{$ components.styles }}';

// Page placeholder filled with the components' templates.
const TEMPLATES_PLACEHOLDER = '{{$ components.templates }}';

/**
 * Loads reusable webview components into component pages.
 *
 * @remarks
 * A reusable component lives in its own folder under resources.components and ships its markup
 * (`<name>.html`, one or more `<template>` elements), its styles (`<name>.css`, which imports the
 * parameters, layout, and visual files), and its behavior (`<name>.js`, a custom element). A page
 * lists the components it uses in a `g4-components` meta tag; components list the components they
 * build on in their template's `data-dependencies`. Every component is loaded once, after the
 * components it depends on.
 */
export class WebviewComponents {
    /**
     * Orders the components a page needs so every component comes after the ones it builds on.
     *
     * @remarks
     * Depth-first over each component's `data-dependencies`; a name already placed (or being
     * placed, in a cycle) is skipped, so each component appears once.
     *
     * @param rootPath - Absolute path of the resources.components folder.
     * @param pageNames - Components the page declares.
     * @returns Component names in load order.
     */
    public static resolveComponentNames(rootPath: string, pageNames: string[]): string[] {
        const orderedNames: string[] = [];
        const visitedNames = new Set<string>();

        const addComponent = (name: string): void => {
            // A component already placed (or being placed, in a cycle) is not added twice.
            if (visitedNames.has(name)) {
                return;
            }

            visitedNames.add(name);

            // The components it builds on come first, then the component itself.
            const html = WebviewComponents.readComponentFile(rootPath, name, 'html');
            const dependencyNames = WebviewComponents.readNames(DEPENDENCIES_PATTERN.exec(html)?.[1]);

            dependencyNames.forEach(addComponent);
            orderedNames.push(name);
        };

        // Walk from the page's own components, in the order the page lists them.
        pageNames.forEach(addComponent);

        return orderedNames;
    }

    /**
     * Fills a page's component placeholders with the stylesheets, templates, and scripts of the
     * components it declares, and of every component those build on.
     *
     * @remarks
     * Reads the component files synchronously; pages are small and built once per panel. A page
     * without a `g4-components` meta tag is returned with empty placeholders.
     *
     * @param options - Page HTML, components folder, and the URI converter.
     * @returns The page HTML with the placeholders filled.
     */
    public static setComponentHtml(options: ComponentHtmlOptions): string {
        const { html, rootPath, toUri } = options;

        // Resolve every component the page needs: its own, and the ones those build on.
        const pageNames = WebviewComponents.readNames(PAGE_COMPONENTS_PATTERN.exec(html)?.[1]);
        const names = WebviewComponents.resolveComponentNames(rootPath, pageNames);

        // Builds the webview URI of one component file.
        const getFileUri = (name: string, extension: string): string => toUri(path.join(rootPath, name, `${name}.${extension}`));

        // One link, one template block, and one script per component, in dependency order.
        const styles = names
            .map((name) => `<link rel="stylesheet" href="${getFileUri(name, 'css')}">`)
            .join('\n');
        const templates = names
            .map((name) => WebviewComponents.readComponentFile(rootPath, name, 'html'))
            .join('\n');
        const scripts = names
            .map((name) => `<script src="${getFileUri(name, 'js')}"></script>`)
            .join('\n');

        // Replacer functions keep any `$` in the inserted markup from being read as a pattern.
        return html
            .replace(STYLES_PLACEHOLDER, () => styles)
            .replace(TEMPLATES_PLACEHOLDER, () => templates)
            .replace(SCRIPTS_PLACEHOLDER, () => scripts);
    }

    /**
     * Reads one file of a component.
     *
     * @param rootPath - Absolute path of the resources.components folder.
     * @param name - Component name (also its folder and file base name).
     * @param extension - File extension without the dot.
     * @returns The file text.
     * @throws Error when the name is not a component name or the file is missing.
     */
    private static readComponentFile(rootPath: string, name: string, extension: string): string {
        // Only g4-* names are read, so a page cannot point the loader at any other path.
        if (!COMPONENT_NAME_PATTERN.test(name)) {
            throw new Error(`'${name}' is not a component name.`);
        }

        return fs.readFileSync(path.join(rootPath, name, `${name}.${extension}`), 'utf8');
    }

    /**
     * Splits a space-separated name list.
     *
     * @param text - The list text, or undefined.
     * @returns The names, without empty entries.
     */
    private static readNames(text: string | undefined): string[] {
        return (text ?? '')
            .trim()
            .split(NAME_SEPARATOR_PATTERN)
            .filter((name) => name !== '');
    }
}

// Compile-time contracts stay after the executable code. Interfaces come before type aliases, and
// a contract follows the contracts that depend on it before A-Z order resumes.

/**
 * Options for filling a page's component placeholders.
 */
export interface ComponentHtmlOptions {
    /** Page HTML that declares its components and holds the three placeholders. */
    html: string;

    /** Absolute path of the resources.components folder. */
    rootPath: string;

    /** Converts an absolute file path into a URI the webview can load. */
    toUri: (filePath: string) => string;
}
