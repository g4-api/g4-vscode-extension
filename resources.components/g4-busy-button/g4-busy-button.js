/*
 * G4(TM) busy button component: <g4-busy-button>.
 *
 * A small ghost button for work that takes a moment (test a connection, fetch a token, refresh a
 * list). While busy it is disabled and shows a spinning refresh icon; a text button keeps its width.
 *
 * Contract:
 * - Attributes: label (button text, or the tooltip and accessible name of an icon-only button),
 *   icon-only (shows the refresh icon instead of the text), size ('field': as high as a text box),
 *   busy, disabled, test-id (prefix of every part's data-test-id).
 * - Properties: busy, disabled.
 * - Events: the inner button's native click bubbles through the element.
 */
(() => {
    'use strict';

    // Component name: the custom element tag, the template id prefix, and the default test id prefix.
    const COMPONENT_NAME = 'g4-busy-button';

    /**
     * Busy button element.
     */
    class G4BusyButton extends HTMLElement {
        // Whether the template has been rendered into this element.
        #isRendered = false;

        /**
         * Whether the work runs (the button is disabled and its icon spins).
         *
         * @returns {boolean} True while busy.
         */
        get busy() {
            return this.hasAttribute('busy');
        }

        /**
         * Starts or stops the busy state.
         *
         * @param {boolean} isBusy - New state.
         */
        set busy(isBusy) {
            this.toggleAttribute('busy', isBusy === true);
            this.#showState();
        }

        /**
         * Whether the button is disabled.
         *
         * @returns {boolean} True when disabled.
         */
        get disabled() {
            return this.hasAttribute('disabled');
        }

        /**
         * Enables or disables the button.
         *
         * @param {boolean} isDisabled - New state.
         */
        set disabled(isDisabled) {
            this.toggleAttribute('disabled', isDisabled === true);
            this.#showState();
        }

        /**
         * Renders the button once.
         */
        connectedCallback() {
            // An element moved in the page keeps its rendered parts and listeners.
            if (this.#isRendered) {
                return;
            }

            this.#isRendered = true;

            const content = this.#newContent();
            const button = content.querySelector('[data-part="button"]');
            const label = this.getAttribute('label') ?? '';

            content.querySelector('[data-part="label"]').textContent = label;

            // An icon-only button names itself through its tooltip and accessible name.
            if (this.hasAttribute('icon-only')) {
                button.classList.add('g4-busy-button__button--icon');
                button.title = label;
                button.setAttribute('aria-label', label);
            }

            if (this.getAttribute('size') === 'field') {
                button.classList.add('g4-busy-button__button--field');
            }

            this.replaceChildren(content);
            this.#showState();
        }

        /**
         * Focuses the button.
         */
        focus() {
            this.querySelector('[data-part="button"]')?.focus();
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
         * Applies the busy and disabled states to the rendered button.
         */
        #showState() {
            const button = this.querySelector('[data-part="button"]');

            if (!button) {
                return;
            }

            // A busy button cannot be pressed again; its spinner shows while busy.
            button.disabled = this.busy || this.disabled;
            button.classList.toggle('g4-busy-button__button--busy', this.busy);
        }
    }

    if (!customElements.get(COMPONENT_NAME)) {
        customElements.define(COMPONENT_NAME, G4BusyButton);
    }
})();
