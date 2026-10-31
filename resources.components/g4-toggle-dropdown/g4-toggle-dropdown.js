/*
 * G4(TM) toggle dropdown component: <g4-toggle-dropdown>.
 *
 * A dropdown for picking several choices: the button shows what is picked, and opens a list of
 * on/off switches (<g4-toggle>) under it, one per choice. A click outside, or Escape, closes the
 * list; Escape is kept from the modal under it, so closing the list never closes a dialog.
 *
 * Contract:
 * - Attributes: choices (JSON array of { value, text, hint }), value (JSON array of picked values),
 *   placeholder (button text when nothing is picked, and the list text when there are no choices),
 *   disabled, label (accessible name when the dropdown is not in a <g4-field>), test-id (prefix of
 *   every part's data-test-id).
 * - Properties: value (the picked values, in choice order).
 * - Methods: focus().
 * - Events (bubble): g4-input { value } when the user flips a switch. The switches' own g4-input
 *   events stay inside the dropdown.
 */
(() => {
    'use strict';

    // Component name: the custom element tag, the template id prefix, and the default test id prefix.
    const COMPONENT_NAME = 'g4-toggle-dropdown';

    // Names of picked choices the button lists before it switches to a "+N" count, so a long pick
    // still fits on one line.
    const SUMMARY_NAME_LIMIT = 2;

    // Characters of a choice value that are not allowed in a test id; each becomes a hyphen.
    // Linear: one negated character class, matched one character at a time.
    const TEST_ID_SEPARATOR_PATTERN = /[^a-z0-9]/gi;

    /**
     * Narrows a choice field to text.
     *
     * @remarks
     * Compute-only. Text, numbers, and booleans become text; anything else becomes '', so a switch
     * never reads '[object Object]'.
     *
     * @param {unknown} value - Value from the page's choice data.
     * @returns {string} Text for the switch.
     */
    const convertToText = (value) => {
        const isPrimitive = ['string', 'number', 'boolean'].includes(typeof value);

        return isPrimitive ? String(value) : '';
    };

    /**
     * Reads a JSON array attribute.
     *
     * @remarks
     * Compute-only. Unreadable JSON renders an empty list rather than breaking the page.
     *
     * @param {string | null} text - JSON text of the attribute.
     * @returns {unknown[]} The array; [] when the text is not a JSON array.
     */
    const getArray = (text) => {
        try {
            const items = JSON.parse(text ?? '[]');

            return Array.isArray(items) ? items : [];
        } catch {
            return [];
        }
    };

    /**
     * Reads the choices attribute into clean { value, text, hint } entries.
     *
     * @remarks
     * Compute-only. A choice without text shows its value, so no switch is left without a label.
     *
     * @param {string | null} text - JSON text of the choices.
     * @returns {{ value: string, text: string, hint: string }[]} The choices.
     */
    const getChoices = (text) => {
        return getArray(text).map((choice) => {
            const value = convertToText(choice?.value);

            return {
                value,
                text: convertToText(choice?.text) || value,
                hint: convertToText(choice?.hint)
            };
        });
    };

    /**
     * Multi-pick dropdown element.
     */
    class G4ToggleDropdown extends HTMLElement {
        // Choices read from the attribute when the dropdown renders.
        #choices = [];

        // Whether the template has been rendered into this element.
        #isRendered = false;

        // Picked values, kept in a set so a switch flip is a single add or delete.
        #pickedValues = new Set();

        // Closes the list when the user presses anywhere outside the dropdown. Installed only while
        // the list is open, so a closed dropdown costs nothing.
        #onDocumentPointerDown = (event) => {
            if (this.contains(event.target)) {
                return;
            }

            this.#hidePanel();
        };

        // Closes the open list on Escape and keeps the key from the modal under the dropdown, so the
        // user closes one layer at a time.
        #onKeyDown = (event) => {
            const isOpenPanelEscape = event.key === 'Escape' && this.#testPanelOpen();

            if (!isOpenPanelEscape) {
                return;
            }

            event.preventDefault();
            event.stopPropagation();
            this.#hidePanel();
            this.#getTrigger()?.focus();
        };

        // Turns a switch flip into this dropdown's own g4-input with every picked value.
        #onPanelInput = (event) => {
            const toggle = event.target.closest('g4-toggle');

            // The switch's boolean event stays inside; the page hears the value list instead.
            event.stopPropagation();

            if (!toggle) {
                return;
            }

            // Record the flip before the summary and the event read the picked values.
            if (event.detail?.value === true) {
                this.#pickedValues.add(toggle.dataset.value);
            } else {
                this.#pickedValues.delete(toggle.dataset.value);
            }

            // Refresh the button text, then report the new pick.
            this.#updateSummary();
            this.dispatchEvent(new CustomEvent('g4-input', { bubbles: true, detail: { value: this.value } }));
        };

        // Opens or closes the list from the button.
        #onTriggerClick = () => {
            if (this.#testPanelOpen()) {
                this.#hidePanel();
                return;
            }

            this.#showPanel();
        };

        /**
         * The picked values, in choice order.
         *
         * @returns {string[]} The picked values.
         */
        get value() {
            // Before the dropdown renders, the pick waits in the attribute it renders from.
            if (!this.#isRendered) {
                return getArray(this.getAttribute('value')).map(convertToText);
            }

            return this.#choices
                .map((choice) => choice.value)
                .filter((value) => this.#pickedValues.has(value));
        }

        /**
         * Picks the given values (no g4-input: the owner made the change).
         *
         * @param {string[]} values - Values to pick; values that are not choices are ignored.
         */
        set value(values) {
            const pickedValues = Array.isArray(values) ? values.map(convertToText) : [];

            // Before the dropdown renders, the pick waits in the attribute it renders from.
            if (!this.#isRendered) {
                this.setAttribute('value', JSON.stringify(pickedValues));
                return;
            }

            // Replace the pick, then move every switch and the button text to match it.
            this.#pickedValues = new Set(pickedValues);

            this.querySelectorAll(':scope g4-toggle[data-value]').forEach((toggle) => {
                toggle.value = this.#pickedValues.has(toggle.dataset.value);
            });

            this.#updateSummary();
        }

        /**
         * Renders the dropdown once, when the element is first attached.
         */
        connectedCallback() {
            // An element moved in the page keeps its rendered parts and listeners.
            if (this.#isRendered) {
                return;
            }

            // Read the choices and the starting pick before the markup is built from them.
            this.#choices = getChoices(this.getAttribute('choices'));
            this.#pickedValues = new Set(getArray(this.getAttribute('value')).map(convertToText));
            this.#isRendered = true;

            // Build the button and the list, then name the button after its field.
            const content = this.#newContent();
            const trigger = content.querySelector('[data-part="trigger"]');
            const panel = content.querySelector('[data-part="panel"]');
            const fieldLabel = this.closest('g4-field')?.getAttribute('label');
            const accessibleName = fieldLabel || this.getAttribute('label');
            const isEmpty = this.#choices.length === 0;

            if (accessibleName) {
                trigger.setAttribute('aria-label', accessibleName);
                panel.setAttribute('aria-label', accessibleName);
            }

            // A dropdown without choices, or one the page disables, cannot open.
            trigger.disabled = this.hasAttribute('disabled') || isEmpty;

            // One switch per choice, or a line saying there is nothing to pick.
            panel.append(...this.#newOptions());

            // Wire the button, the switches, and Escape; the outside-click listener waits for the list to open.
            trigger.addEventListener('click', this.#onTriggerClick);
            panel.addEventListener('g4-input', this.#onPanelInput);
            this.addEventListener('keydown', this.#onKeyDown);

            // Show the markup, then write the button text from the starting pick.
            this.replaceChildren(content);
            this.#updateSummary();
        }

        /**
         * Removes the outside-click listener when the dropdown leaves the page with its list open.
         */
        disconnectedCallback() {
            document.removeEventListener('pointerdown', this.#onDocumentPointerDown);
        }

        /**
         * Focuses the button.
         */
        focus() {
            this.#getTrigger()?.focus();
        }

        /**
         * Returns the rendered list.
         *
         * @returns {HTMLElement | null} The list.
         */
        #getPanel() {
            return this.querySelector(':scope > .g4-toggle-dropdown__wrap > [data-part="panel"]');
        }

        /**
         * Returns the button text for the current pick.
         *
         * @remarks
         * Compute-only over the choices and the picked values. Lists up to SUMMARY_NAME_LIMIT names,
         * then a "+N" count, so the button stays one line.
         *
         * @returns {{ text: string, isPlaceholder: boolean }} The text, and whether it is the placeholder.
         */
        #getSummary() {
            const pickedNames = this.#choices
                .filter((choice) => this.#pickedValues.has(choice.value))
                .map((choice) => choice.text);

            // Nothing picked: the page's placeholder, shown dimmed.
            if (pickedNames.length === 0) {
                return { text: this.getAttribute('placeholder') ?? '', isPlaceholder: true };
            }

            // Name the first picks and count the rest.
            const shownNames = pickedNames.slice(0, SUMMARY_NAME_LIMIT).join(', ');
            const hiddenCount = pickedNames.length - SUMMARY_NAME_LIMIT;
            const hiddenText = hiddenCount > 0
                ? ` +${hiddenCount}`
                : '';

            return { text: `${shownNames}${hiddenText}`, isPlaceholder: false };
        }

        /**
         * Returns the test id prefix of this element's parts.
         *
         * @returns {string} The prefix.
         */
        #getTestIdPrefix() {
            return this.getAttribute('test-id') || COMPONENT_NAME;
        }

        /**
         * Returns the rendered button.
         *
         * @returns {HTMLButtonElement | null} The button.
         */
        #getTrigger() {
            return this.querySelector(':scope > .g4-toggle-dropdown__wrap > [data-part="trigger"]');
        }

        /**
         * Closes the list and stops listening for outside clicks.
         */
        #hidePanel() {
            this.#getPanel()?.toggleAttribute('hidden', true);
            this.#getTrigger()?.setAttribute('aria-expanded', 'false');
            document.removeEventListener('pointerdown', this.#onDocumentPointerDown);
        }

        /**
         * Clones the template and prefixes every part's test id with this element's test-id.
         *
         * @returns {DocumentFragment} The markup.
         */
        #newContent() {
            const template = document.getElementById(`${COMPONENT_NAME}-template`);
            const content = template.content.cloneNode(true);
            const prefix = this.#getTestIdPrefix();

            // Every part gets a unique, descriptive test id under this element's prefix.
            content.querySelectorAll('[data-test-id]').forEach((element) => {
                element.dataset.testId = `${prefix}-${element.dataset.testId}`;
            });

            return content;
        }

        /**
         * Builds the list rows: one switch per choice, or one empty line.
         *
         * @remarks
         * Compute-only over the choices and the starting pick. Each switch keeps its choice value in
         * data-value, so a flip is matched to its choice without searching by label.
         *
         * @returns {HTMLElement[]} The rows.
         */
        #newOptions() {
            const prefix = this.#getTestIdPrefix();

            // No choices: one line with the placeholder, so the open list is never blank.
            if (this.#choices.length === 0) {
                const empty = document.createElement('div');

                empty.className = 'g4-toggle-dropdown__empty';
                empty.dataset.testId = `${prefix}-empty`;
                empty.textContent = this.getAttribute('placeholder') ?? '';

                return [empty];
            }

            // One row with a switch per choice, flipped on when the choice starts picked.
            return this.#choices.map((choice) => {
                const row = document.createElement('div');
                const toggle = document.createElement('g4-toggle');
                const slug = choice.value.replaceAll(TEST_ID_SEPARATOR_PATTERN, '-');

                row.className = 'g4-toggle-dropdown__option';
                toggle.dataset.value = choice.value;
                toggle.setAttribute('label', choice.text);
                toggle.setAttribute('hint', choice.hint);
                toggle.setAttribute('test-id', `${prefix}-${slug}-toggle`);
                toggle.toggleAttribute('checked', this.#pickedValues.has(choice.value));
                row.append(toggle);

                return row;
            });
        }

        /**
         * Opens the list and starts listening for outside clicks.
         */
        #showPanel() {
            this.#getPanel()?.toggleAttribute('hidden', false);
            this.#getTrigger()?.setAttribute('aria-expanded', 'true');
            document.addEventListener('pointerdown', this.#onDocumentPointerDown);
        }

        /**
         * Tests whether the list is open.
         *
         * @returns {boolean} True while the list shows.
         */
        #testPanelOpen() {
            const panel = this.#getPanel();

            return panel !== null && !panel.hidden;
        }

        /**
         * Writes the button text and tooltip for the current pick.
         */
        #updateSummary() {
            const summary = this.querySelector(':scope > .g4-toggle-dropdown__wrap [data-part="summary"]');

            if (!summary) {
                return;
            }

            // The placeholder is dimmed; a pick also shows in full as the tooltip.
            const { text, isPlaceholder } = this.#getSummary();

            summary.textContent = text;
            summary.classList.toggle('g4-toggle-dropdown__summary--placeholder', isPlaceholder);
            this.#getTrigger()?.setAttribute('title', text);
        }
    }

    if (!customElements.get(COMPONENT_NAME)) {
        customElements.define(COMPONENT_NAME, G4ToggleDropdown);
    }
})();
