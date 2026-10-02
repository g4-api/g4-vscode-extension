/*
 * G4(TM) secret input component: <g4-secret-input>.
 *
 * A masked box (passwords, tokens) with an eye button that shows or hides the text.
 *
 * Contract:
 * - Attributes: value (initial text), label (accessible name when the box is not in a <g4-field>),
 *   test-id (prefix of every part's data-test-id).
 * - Properties: value (the text).
 * - Methods: focus().
 * - Events (bubble): g4-input { value } on every edit.
 */
(() => {
    'use strict';

    // Component name: the custom element tag, the template id prefix, and the default test id prefix.
    const COMPONENT_NAME = 'g4-secret-input';

    /**
     * Masked text box element.
     */
    class G4SecretInput extends HTMLElement {
        // Whether the template has been rendered into this element.
        #isRendered = false;

        // Reports the edit.
        #onInputInput = () => {
            this.dispatchEvent(new CustomEvent('g4-input', { bubbles: true, detail: { value: this.value } }));
        };

        // Shows or masks the text, and swaps the eye icon, tooltip, and accessible name to match.
        #onToggleClick = () => {
            const input = this.#getPart('input');
            const toggle = this.#getPart('toggle');

            // A masked box is revealed, a revealed one is masked again.
            const isRevealing = input.type === 'password';
            const label = isRevealing ? 'Hide' : 'Show';

            // The button always offers the opposite action, with the matching eye icon.
            input.type = isRevealing ? 'text' : 'password';
            toggle.title = label;
            toggle.setAttribute('aria-label', label);
            this.#getPart('show-icon').toggleAttribute('hidden', isRevealing);
            this.#getPart('hide-icon').toggleAttribute('hidden', !isRevealing);
        };

        // Text set before the element rendered, kept until it renders.
        #pendingValue = null;

        /**
         * The box text.
         *
         * @returns {string} Text.
         */
        get value() {
            return this.#getPart('input')?.value ?? this.#pendingValue ?? this.getAttribute('value') ?? '';
        }

        /**
         * Replaces the box text (no g4-input: the owner made the change).
         *
         * @param {string} text - New text.
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
         * Renders the box once.
         */
        connectedCallback() {
            // An element moved in the page keeps its rendered parts and listeners.
            if (this.#isRendered) {
                return;
            }

            this.#isRendered = true;

            const content = this.#newContent();
            const input = content.querySelector('[data-part="input"]');
            const accessibleName = this.closest('g4-field')?.getAttribute('label') || this.getAttribute('label');

            // The box starts from a value set in code, or the value attribute.
            input.value = this.#pendingValue ?? this.getAttribute('value') ?? '';

            if (accessibleName) {
                input.setAttribute('aria-label', accessibleName);
            }

            // Typing reports the value; the eye button only changes what is shown.
            input.addEventListener('input', this.#onInputInput);
            content.querySelector('[data-part="toggle"]').addEventListener('click', this.#onToggleClick);
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
         * @returns {Element | null} The part.
         */
        #getPart(name) {
            return this.querySelector(`:scope > .g4-secret-input__wrap [data-part="${name}"]`);
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
        customElements.define(COMPONENT_NAME, G4SecretInput);
    }
})();
