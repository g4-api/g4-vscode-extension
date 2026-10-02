/*
 * G4(TM) number input component: <g4-number-input>.
 *
 * A number box with themed up/down steppers in place of the native spinners (which cannot follow
 * the editor theme). Typing and the keyboard arrows still change the value.
 *
 * Contract:
 * - Attributes: value (initial number or text), min, max (bounds for the steppers), label
 *   (accessible name when the box is not in a <g4-field>), test-id (prefix of every part's
 *   data-test-id).
 * - Properties: value (the box text, as typed).
 * - Methods: focus().
 * - Events (bubble): g4-input { value } on every edit or step; value is the box text, so the page
 *   decides how to store it (for example a port as text, a timeout as a number).
 */
(() => {
    'use strict';

    // Component name: the custom element tag, the template id prefix, and the default test id prefix.
    const COMPONENT_NAME = 'g4-number-input';

    /**
     * Narrows a value to the text a number box can show.
     *
     * @remarks
     * Compute-only. Numbers and text are shown as they are; anything else shows an empty box, so the
     * box never reads '[object Object]'.
     *
     * @param {unknown} value - Value from the page.
     * @returns {string} Box text.
     */
    const convertToText = (value) => {
        const isShowable = typeof value === 'number' || typeof value === 'string';

        return isShowable ? String(value) : '';
    };

    /**
     * Reads a numeric attribute.
     *
     * @param {HTMLElement} element - Element that holds the attribute.
     * @param {string} name - Attribute name.
     * @returns {number | null} The number, or null when missing or not a number.
     */
    const getNumberAttribute = (element, name) => {
        const text = element.getAttribute(name);
        const number = Number(text);

        return text === null || text.trim() === '' || !Number.isFinite(number) ? null : number;
    };

    /**
     * Number box element.
     */
    class G4NumberInput extends HTMLElement {
        // Whether the template has been rendered into this element.
        #isRendered = false;

        // Steps down by one.
        #onDecreaseClick = () => {
            this.#step(-1);
        };

        // Steps up by one.
        #onIncreaseClick = () => {
            this.#step(1);
        };

        // Reports the typed text.
        #onInputInput = () => {
            this.#dispatchInput();
        };

        // Text set before the element rendered, kept until it renders.
        #pendingValue = null;

        /**
         * The box text, as typed.
         *
         * @returns {string} Text.
         */
        get value() {
            return this.#getPart('input')?.value ?? this.#pendingValue ?? this.getAttribute('value') ?? '';
        }

        /**
         * Replaces the box text (no g4-input: the owner made the change).
         *
         * @param {string | number} value - New value.
         */
        set value(value) {
            const input = this.#getPart('input');

            // Before the box renders, the value waits until it does.
            if (!input) {
                this.#pendingValue = convertToText(value);
                return;
            }

            input.value = convertToText(value);
        }

        /**
         * Renders the box once.
         */
        connectedCallback() {
            // A box moved in the page keeps its steppers and listeners.
            if (this.#isRendered) {
                return;
            }

            this.#isRendered = true;

            const content = this.#newContent();
            const input = content.querySelector('[data-part="input"]');
            const increase = content.querySelector('[data-part="increase"]');
            const decrease = content.querySelector('[data-part="decrease"]');
            const minimum = getNumberAttribute(this, 'min');
            const maximum = getNumberAttribute(this, 'max');
            const fieldLabel = this.closest('g4-field')?.getAttribute('label');
            const accessibleName = fieldLabel || this.getAttribute('label');

            // The box starts from a value set in code, or the value attribute; bounds are optional.
            input.value = this.#pendingValue ?? this.getAttribute('value') ?? '';

            if (minimum !== null) {
                input.min = String(minimum);
            }

            if (maximum !== null) {
                input.max = String(maximum);
            }

            // The steppers name the value they change, like "Increase Port".
            if (accessibleName) {
                input.title = accessibleName;
                input.setAttribute('aria-label', accessibleName);
                increase.setAttribute('aria-label', `Increase ${accessibleName}`);
                decrease.setAttribute('aria-label', `Decrease ${accessibleName}`);
            }

            // Typing and both steppers report through the same event.
            input.addEventListener('input', this.#onInputInput);
            increase.addEventListener('click', this.#onIncreaseClick);
            decrease.addEventListener('click', this.#onDecreaseClick);
            this.replaceChildren(content);
        }

        /**
         * Puts the caret in the box.
         */
        focus() {
            this.#getPart('input')?.focus();
        }

        /**
         * Reports the box text to the page.
         */
        #dispatchInput() {
            this.dispatchEvent(new CustomEvent('g4-input', { bubbles: true, detail: { value: this.value } }));
        }

        /**
         * Returns one rendered part.
         *
         * @param {string} name - Part name (data-part).
         * @returns {HTMLElement | null} The part.
         */
        #getPart(name) {
            return this.querySelector(`:scope > .g4-number-input__wrap [data-part="${name}"]`);
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

            // Every part gets a unique, descriptive test id under this box's prefix.
            content.querySelectorAll('[data-test-id]').forEach((element) => {
                element.dataset.testId = `${prefix}-${element.dataset.testId}`;
            });

            return content;
        }

        /**
         * Steps the value by one, within the min/max bounds, and reports it.
         *
         * @param {number} direction - 1 to increase, -1 to decrease.
         */
        #step(direction) {
            const current = Number(this.value);
            const minimum = getNumberAttribute(this, 'min');
            const maximum = getNumberAttribute(this, 'max');

            // A box without a number steps from 0.
            let next = (Number.isFinite(current) ? current : 0) + direction;

            // Keep the result within the bounds.
            if (minimum !== null && next < minimum) {
                next = minimum;
            }

            if (maximum !== null && next > maximum) {
                next = maximum;
            }

            // Show the stepped value and report it like typing.
            this.value = next;
            this.#dispatchInput();
        }
    }

    if (!customElements.get(COMPONENT_NAME)) {
        customElements.define(COMPONENT_NAME, G4NumberInput);
    }
})();
