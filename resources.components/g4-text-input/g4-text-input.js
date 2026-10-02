/*
 * G4(TM) text input component: <g4-text-input>.
 *
 * A single-line text or URL box. A URL box checks its text while you type.
 *
 * Contract:
 * - Attributes: value (initial text), type ('text' | 'url'; a URL box is checked), placeholder,
 *   max-length, label (accessible name when the box is not in a <g4-field>), test-id (prefix of
 *   every part's data-test-id).
 * - Properties: value (the text).
 * - Methods: focus().
 * - Events (bubble): g4-input { value } on every edit; g4-change { value } when the user leaves a
 *   changed box; g4-error { message } with the URL check result (URL boxes only, also once when
 *   attached).
 */
(() => {
    'use strict';

    // Component name: the custom element tag, the template id prefix, and the default test id prefix.
    const COMPONENT_NAME = 'g4-text-input';

    // Message for a URL box whose text is not a full http(s) URL.
    const URL_ERROR_MESSAGE = 'Enter a full URL, for example https://example.com.';

    /**
     * Checks a URL box's text.
     *
     * @remarks
     * Compute-only. Empty text is valid (a required box is checked by its field on save).
     *
     * @param {string} text - Box text.
     * @returns {string} '' when valid; otherwise the error line.
     */
    const getUrlError = (text) => {
        const trimmedText = text.trim();

        if (trimmedText === '') {
            return '';
        }

        try {
            const url = new URL(trimmedText);
            const isWebUrl = url.protocol === 'http:' || url.protocol === 'https:';

            return isWebUrl ? '' : URL_ERROR_MESSAGE;
        } catch {
            return URL_ERROR_MESSAGE;
        }
    };

    /**
     * Single-line text box element.
     */
    class G4TextInput extends HTMLElement {
        // Whether the template has been rendered into this element.
        #isRendered = false;

        // Reports a committed change.
        #onInputChange = () => {
            this.dispatchEvent(new CustomEvent('g4-change', { bubbles: true, detail: { value: this.value } }));
        };

        // Checks a URL box and reports the edit.
        #onInputInput = () => {
            this.#reportError();
            this.dispatchEvent(new CustomEvent('g4-input', { bubbles: true, detail: { value: this.value } }));
        };

        // Text set before the element rendered, kept until it renders.
        #pendingValue = null;

        /**
         * The box text.
         *
         * @returns {string} Text.
         */
        get value() {
            return this.#getInput()?.value ?? this.#pendingValue ?? this.getAttribute('value') ?? '';
        }

        /**
         * Replaces the box text (no g4-input: the owner made the change).
         *
         * @param {string} text - New text.
         */
        set value(text) {
            const input = this.#getInput();

            // Before the element renders, the value waits until it does.
            if (!input) {
                this.#pendingValue = text;
                return;
            }

            input.value = text;
            this.#reportError();
        }

        /**
         * Renders the box once and reports the URL check of the initial text.
         */
        connectedCallback() {
            // An element moved in the page keeps its rendered parts and listeners.
            if (this.#isRendered) {
                return;
            }

            this.#isRendered = true;

            const content = this.#newContent();
            const input = content.querySelector('[data-part="input"]');
            const placeholder = this.getAttribute('placeholder');
            const maxLength = Number(this.getAttribute('max-length'));
            const accessibleName = this.closest('g4-field')?.getAttribute('label') || this.getAttribute('label');

            // The box type, text, and limits come from the attributes.
            input.type = this.getAttribute('type') === 'url' ? 'url' : 'text';
            input.value = this.#pendingValue ?? this.getAttribute('value') ?? '';

            if (placeholder) {
                input.placeholder = placeholder;
            }

            if (maxLength > 0) {
                input.maxLength = maxLength;
            }

            // The field label (or the label attribute) names the box for screen readers.
            if (accessibleName) {
                input.setAttribute('aria-label', accessibleName);
            }

            // Typing reports every edit; leaving a changed box reports the commit.
            input.addEventListener('input', this.#onInputInput);
            input.addEventListener('change', this.#onInputChange);

            // Show the box and report the URL check of the initial text.
            this.replaceChildren(content);
            this.#reportError();
        }

        /**
         * Puts the caret in the box.
         */
        focus() {
            this.#getInput()?.focus();
        }

        /**
         * Returns the rendered input.
         *
         * @returns {HTMLInputElement | null} The input.
         */
        #getInput() {
            return this.querySelector(':scope > [data-part="input"]');
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

        /**
         * Reports the URL check result (URL boxes only).
         */
        #reportError() {
            // Only URL boxes are checked.
            if (this.getAttribute('type') !== 'url') {
                return;
            }

            const message = getUrlError(this.value);

            this.dispatchEvent(new CustomEvent('g4-error', { bubbles: true, detail: { message } }));
        }
    }

    if (!customElements.get(COMPONENT_NAME)) {
        customElements.define(COMPONENT_NAME, G4TextInput);
    }
})();
