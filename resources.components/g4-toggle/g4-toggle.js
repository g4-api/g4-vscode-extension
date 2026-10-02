/*
 * G4(TM) toggle component: <g4-toggle>.
 *
 * An on/off switch with its label and an optional hint beside it. Clicking the label flips it.
 *
 * Contract:
 * - Attributes: label, hint, checked (initially on), test-id (prefix of every part's data-test-id).
 * - Properties: value (true when on).
 * - Methods: focus().
 * - Events (bubble): g4-input { value } when the user flips the switch.
 */
(() => {
    'use strict';

    // Component name: the custom element tag, the template id prefix, and the default test id prefix.
    const COMPONENT_NAME = 'g4-toggle';

    /**
     * On/off switch element.
     */
    class G4Toggle extends HTMLElement {
        // Whether the template has been rendered into this element.
        #isRendered = false;

        // Reports the new state.
        #onInputChange = () => {
            this.dispatchEvent(new CustomEvent('g4-input', { bubbles: true, detail: { value: this.value } }));
        };

        /**
         * Whether the switch is on.
         *
         * @returns {boolean} True when on.
         */
        get value() {
            return this.#getInput()?.checked ?? this.hasAttribute('checked');
        }

        /**
         * Turns the switch on or off (no g4-input: the owner made the change).
         *
         * @param {boolean} isChecked - New state.
         */
        set value(isChecked) {
            const input = this.#getInput();

            // Before the switch renders, the state waits in the checked attribute.
            if (input) {
                input.checked = isChecked === true;
            } else {
                this.toggleAttribute('checked', isChecked === true);
            }
        }

        /**
         * Renders the switch once.
         */
        connectedCallback() {
            // An element moved in the page keeps its rendered parts and listeners.
            if (this.#isRendered) {
                return;
            }

            this.#isRendered = true;

            const content = this.#newContent();
            const input = content.querySelector('[data-part="input"]');
            const hint = content.querySelector('[data-part="hint"]');
            const hintText = this.getAttribute('hint') ?? '';

            // The switch starts from the checked attribute, with its label.
            input.checked = this.hasAttribute('checked');
            content.querySelector('[data-part="title"]').textContent = this.getAttribute('label') ?? '';

            // An empty hint would add a gap, so it is left out.
            if (hintText === '') {
                hint.remove();
            } else {
                hint.textContent = hintText;
            }

            // Flipping the switch reports the new state.
            input.addEventListener('change', this.#onInputChange);
            this.replaceChildren(content);
        }

        /**
         * Focuses the switch.
         */
        focus() {
            this.#getInput()?.focus();
        }

        /**
         * Returns the rendered checkbox.
         *
         * @returns {HTMLInputElement | null} The checkbox.
         */
        #getInput() {
            return this.querySelector(':scope > .g4-toggle__label > [data-part="input"]');
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
        customElements.define(COMPONENT_NAME, G4Toggle);
    }
})();
