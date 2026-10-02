/*
 * G4(TM) path input component: <g4-path-input>.
 *
 * A folder path box with a Browse button (search icon) and an optional text button that finds the
 * path automatically. The page owns the folder picker and the detection (the webview has no file
 * system access) and writes the result back through the value property.
 *
 * Contract:
 * - Attributes: value (initial path), browse-label (Browse tooltip and accessible name), detect-label
 *   (text of the detect button; no button when missing), detect-title (its tooltip), label
 *   (accessible name and tooltip of the box when it is not in a <g4-field>), test-id (prefix of
 *   every part's data-test-id).
 * - Properties: value (the path).
 * - Methods: focus().
 * - Events (bubble): g4-input { value } on every edit; g4-browse when Browse is pressed; g4-detect
 *   when the detect button is pressed.
 */
(() => {
    'use strict';

    // Component name: the custom element tag, the template id prefix, and the default test id prefix.
    const COMPONENT_NAME = 'g4-path-input';

    // Browse tooltip when the page does not set one.
    const DEFAULT_BROWSE_LABEL = 'Browse';

    /**
     * Folder path box element.
     */
    class G4PathInput extends HTMLElement {
        // Whether the template has been rendered into this element.
        #isRendered = false;

        // Asks the page to open its folder picker.
        #onBrowseClick = () => {
            this.dispatchEvent(new CustomEvent('g4-browse', { bubbles: true }));
        };

        // Asks the page to find the path.
        #onDetectClick = () => {
            this.dispatchEvent(new CustomEvent('g4-detect', { bubbles: true }));
        };

        // Reports the edit.
        #onInputInput = () => {
            this.dispatchEvent(new CustomEvent('g4-input', { bubbles: true, detail: { value: this.value } }));
        };

        // Path set before the element rendered, kept until it renders.
        #pendingValue = null;

        /**
         * The path.
         *
         * @returns {string} Path text.
         */
        get value() {
            return this.#getPart('input')?.value ?? this.#pendingValue ?? this.getAttribute('value') ?? '';
        }

        /**
         * Replaces the path (no g4-input: the owner made the change).
         *
         * @param {string} text - New path.
         */
        set value(text) {
            const input = this.#getPart('input');

            // Before the element renders, the value waits until it does.
            if (!input) {
                this.#pendingValue = text;
                return;
            }

            input.value = text;
        }

        /**
         * Renders the box and its buttons once.
         */
        connectedCallback() {
            // An element moved in the page keeps its rendered parts and listeners.
            if (this.#isRendered) {
                return;
            }

            this.#isRendered = true;

            const content = this.#newContent();
            const input = content.querySelector('[data-part="input"]');
            const browse = content.querySelector('[data-part="browse"]');
            const detect = content.querySelector('[data-part="detect"]');
            const browseLabel = this.getAttribute('browse-label') || DEFAULT_BROWSE_LABEL;
            const detectLabel = this.getAttribute('detect-label') ?? '';
            const accessibleName = this.getAttribute('label') || this.closest('g4-field')?.getAttribute('label');

            // The box starts from a value set in code, or the value attribute.
            input.value = this.#pendingValue ?? this.getAttribute('value') ?? '';

            if (accessibleName) {
                input.title = accessibleName;
                input.setAttribute('aria-label', accessibleName);
            }

            // The icon-only Browse button is named by its tooltip and accessible name.
            browse.title = browseLabel;
            browse.setAttribute('aria-label', browseLabel);

            // The detect button names itself by its text, with an optional longer tooltip.
            if (detectLabel === '') {
                detect.remove();
            } else {
                const detectTitle = this.getAttribute('detect-title') || detectLabel;

                detect.textContent = detectLabel;
                detect.title = detectTitle;
                detect.setAttribute('aria-label', detectTitle);
                detect.addEventListener('click', this.#onDetectClick);
            }

            // Typing reports the path; Browse asks the page to pick a folder.
            input.addEventListener('input', this.#onInputInput);
            browse.addEventListener('click', this.#onBrowseClick);
            this.replaceChildren(content);
        }

        /**
         * Puts the caret in the box.
         */
        focus() {
            this.#getPart('input')?.focus();
        }

        /**
         * Returns one rendered part.
         *
         * @param {string} name - Part name (data-part).
         * @returns {HTMLElement | null} The part.
         */
        #getPart(name) {
            return this.querySelector(`:scope > .g4-path-input__wrap > [data-part="${name}"]`);
        }

        /**
         * Clones the template and prefixes every part's test id with this element's test-id.
         *
         * @returns {DocumentFragment} The markup.
         */
        #newContent() {
            const template = document.getElementById(`${COMPONENT_NAME}-template`);
            const content = template.content.cloneNode(true);
            const prefix = this.getAttribute('test-id') || COMPONENT_NAME;

            // Every part gets a unique, descriptive test id under this element's prefix.
            content.querySelectorAll('[data-test-id]').forEach((element) => {
                element.dataset.testId = `${prefix}-${element.dataset.testId}`;
            });

            return content;
        }
    }

    if (!customElements.get(COMPONENT_NAME)) {
        customElements.define(COMPONENT_NAME, G4PathInput);
    }
})();
