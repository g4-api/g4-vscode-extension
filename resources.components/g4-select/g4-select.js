/*
 * G4(TM) select component: <g4-select>.
 *
 * A themed dropdown as high as the text boxes. Children (for example a refresh button) are placed
 * after the dropdown, on the same row.
 *
 * Contract:
 * - Attributes: choices (JSON array of { value, text }), value (selected value), disabled, title
 *   (tooltip), label (accessible name when the dropdown is not in a <g4-field>), test-id (prefix of
 *   every part's data-test-id).
 * - Properties: value (the selected value).
 * - Methods: focus().
 * - Events (bubble): g4-input { value } when the user picks a choice.
 */
(() => {
    'use strict';

    // Component name: the custom element tag, the template id prefix, and the default test id prefix.
    const COMPONENT_NAME = 'g4-select';

    /**
     * Narrows a choice value to text.
     *
     * @remarks
     * Compute-only. Text, numbers, and booleans become text; anything else becomes '', so an option
     * never reads '[object Object]'.
     *
     * @param {unknown} value - Value from the page's choice data.
     * @returns {string} Text for the option.
     */
    const convertToText = (value) => {
        const isPrimitive = ['string', 'number', 'boolean'].includes(typeof value);

        return isPrimitive ? String(value) : '';
    };

    /**
     * Reads the choices attribute.
     *
     * @param {string | null} text - JSON text of the choices.
     * @returns {{ value: string, text: string }[]} Choices; [] when the text is not a JSON array.
     */
    const getChoices = (text) => {
        try {
            const choices = JSON.parse(text ?? '[]');
            return Array.isArray(choices) ? choices : [];
        } catch {
            // Unreadable JSON renders an empty dropdown rather than breaking the page.
            return [];
        }
    };

    /**
     * Dropdown element.
     */
    class G4Select extends HTMLElement {
        // Whether the template has been rendered into this element.
        #isRendered = false;

        // Reports the picked choice.
        #onSelectChange = () => {
            this.dispatchEvent(new CustomEvent('g4-input', { bubbles: true, detail: { value: this.value } }));
        };

        /**
         * The selected value.
         *
         * @returns {string} Value.
         */
        get value() {
            return this.#getSelect()?.value ?? this.getAttribute('value') ?? '';
        }

        /**
         * Selects a value (no g4-input: the owner made the change).
         *
         * @param {string} value - Value to select.
         */
        set value(value) {
            const select = this.#getSelect();

            // Before the dropdown renders, the value waits in the attribute it renders from.
            if (select) {
                select.value = value;
            } else {
                this.setAttribute('value', value);
            }
        }

        /**
         * Renders the dropdown once, with the children after it.
         */
        connectedCallback() {
            // A dropdown moved in the page keeps its options and listener.
            if (this.#isRendered) {
                return;
            }

            this.#isRendered = true;

            const children = [...this.childNodes];
            const content = this.#newContent();
            const select = content.querySelector('[data-part="select"]');
            const value = this.getAttribute('value') ?? '';
            const title = this.getAttribute('title');
            const fieldLabel = this.closest('g4-field')?.getAttribute('label');
            const accessibleName = fieldLabel || this.getAttribute('label');

            // One option per choice; the current value is selected.
            getChoices(this.getAttribute('choices')).forEach((choice) => {
                const option = document.createElement('option');

                option.value = convertToText(choice?.value);
                option.textContent = convertToText(choice?.text) || option.value;
                option.selected = option.value === value;
                select.append(option);
            });

            // State, tooltip, and accessible name come from the attributes and the field.
            select.disabled = this.hasAttribute('disabled');

            if (title) {
                select.title = title;
            }

            if (accessibleName) {
                select.setAttribute('aria-label', accessibleName);
            }

            // The page's children (a refresh button) sit after the dropdown, on its row.
            select.addEventListener('change', this.#onSelectChange);
            content.querySelector('[data-part="wrap"]').append(...children);
            this.replaceChildren(content);
        }

        /**
         * Focuses the dropdown.
         */
        focus() {
            this.#getSelect()?.focus();
        }

        /**
         * Returns the rendered dropdown.
         *
         * @returns {HTMLSelectElement | null} The dropdown.
         */
        #getSelect() {
            return this.querySelector(':scope > .g4-select__wrap > [data-part="select"]');
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

            // Every part gets a unique, descriptive test id under this dropdown's prefix.
            content.querySelectorAll('[data-test-id]').forEach((element) => {
                element.dataset.testId = `${prefix}-${element.dataset.testId}`;
            });

            return content;
        }
    }

    if (!customElements.get(COMPONENT_NAME)) {
        customElements.define(COMPONENT_NAME, G4Select);
    }
})();
