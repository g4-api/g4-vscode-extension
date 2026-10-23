/*
 * G4(TM) field component: <g4-field>.
 *
 * The frame around one control: label (with a required * and an optional suffix), hint, the control,
 * and an error line that takes space only while it shows an error.
 *
 * Contract:
 * - Children: the control (any element; usually a G4 control component).
 * - Attributes: label, hint, suffix (for example '(milliseconds)'), required (shows the * and enables
 *   testRequired), required-message (default 'Required.'), error (initial error from the page),
 *   test-id (prefix of every part's data-test-id).
 * - Properties: error (set: the page's error, cleared when the user edits the control; get: the
 *   error on show).
 * - Methods: focus() focuses the control; testRequired() shows the required message when the
 *   control is empty and returns false.
 * - Listens (from its own control, not from nested fields): g4-error { message } shows the control's
 *   own check result; g4-input and g4-change (an edit) clear the page's error.
 * - Reflects data-invalid="true|false" while an error is shown.
 */
(() => {
    'use strict';

    // Component name: the custom element tag, the template id prefix, and the default test id prefix.
    const COMPONENT_NAME = 'g4-field';

    // Message shown by testRequired when the page does not set one.
    const DEFAULT_REQUIRED_MESSAGE = 'Required.';

    /**
     * Tests whether a control value counts as empty for a required field.
     *
     * @remarks
     * Compute-only. Only text, numbers, and booleans are read as text; any other value (an object
     * from a custom control) counts as filled, so it is never stringified to '[object Object]'. A
     * list is empty when none of its entries has visible text.
     *
     * @param {unknown} value - The control's value.
     * @returns {boolean} True when the value is empty.
     */
    const testEmptyValue = (value) => {
        if (Array.isArray(value)) {
            return value.every((entry) => testEmptyValue(entry));
        }

        if (value === null || value === undefined) {
            return true;
        }

        const isPrimitive = ['string', 'number', 'boolean'].includes(typeof value);

        return isPrimitive ? String(value).trim() === '' : false;
    };

    /**
     * Field frame element.
     */
    class G4Field extends HTMLElement {
        // Error reported by the control's own check ('' when valid).
        #controlError = '';

        // Whether the template has been rendered into this element.
        #isRendered = false;

        // Shows the control's own check result.
        #onControlError = (event) => {
            // Errors of nested fields belong to those fields.
            if (!this.#isOwnControl(event.target)) {
                return;
            }

            this.#controlError = event.detail?.message ?? '';
            this.#showError();
        };

        // An edit clears the page's error (for example "Required." or a server message).
        #onControlInput = (event) => {
            // Edits inside nested fields do not touch this field's error.
            if (!this.#isOwnControl(event.target)) {
                return;
            }

            this.#pageError = '';
            this.#showError();
        };

        // Focuses the control when the label is clicked.
        #onLabelClick = () => {
            this.focus();
        };

        // Error set by the page ('' when none).
        #pageError = '';

        /**
         * The error on show: the control's own error first, then the page's.
         *
         * @returns {string} Error text.
         */
        get error() {
            return this.#controlError || this.#pageError;
        }

        /**
         * Shows an error from the page; '' clears it. The next edit of the control clears it too.
         *
         * @param {string} message - Error text.
         */
        set error(message) {
            this.#pageError = typeof message === 'string' ? message : '';
            this.#showError();
        }

        /**
         * Renders the frame once and moves the children into the control slot.
         */
        connectedCallback() {
            // A field moved in the page keeps its frame and its listeners.
            if (this.#isRendered) {
                return;
            }

            // Build the frame with the page's initial error, then follow the control's reports.
            this.#isRendered = true;
            this.#pageError = this.getAttribute('error') ?? '';
            this.#render();
            this.addEventListener('g4-error', this.#onControlError);
            this.addEventListener('g4-input', this.#onControlInput);
            this.addEventListener('g4-change', this.#onControlInput);
        }

        /**
         * Focuses the control.
         */
        focus() {
            const control = this.#getControl();

            // Only controls that can take focus are focused (a card list, for example, cannot).
            if (typeof control?.focus === 'function') {
                control.focus();
            }
        }

        /**
         * Checks a required field: an empty control gets the required message.
         *
         * @returns {boolean} True when the field is not required or has a value.
         */
        testRequired() {
            // An optional field always passes.
            if (!this.hasAttribute('required')) {
                return true;
            }

            // An empty control shows the required message; a filled one is left as it is.
            const isEmpty = testEmptyValue(this.#getControl()?.value);

            if (isEmpty) {
                this.error = this.getAttribute('required-message') || DEFAULT_REQUIRED_MESSAGE;
            }

            return !isEmpty;
        }

        /**
         * Returns the control: the first element in the control slot.
         *
         * @returns {HTMLElement | null} The control.
         */
        #getControl() {
            return this.querySelector(':scope > [data-part="control"]')?.firstElementChild ?? null;
        }

        /**
         * Tests whether an event came from this field's control rather than from a nested field.
         *
         * @param {EventTarget} target - Event target.
         * @returns {boolean} True for this field's own control.
         */
        #isOwnControl(target) {
            return target instanceof Element && target.closest('g4-field') === this;
        }

        /**
         * Clones a template and prefixes every part's test id with this element's test-id.
         *
         * @param {string} [templateSuffix=''] - Template id suffix ('' for the main template).
         * @returns {DocumentFragment} The markup.
         */
        #newContent(templateSuffix = '') {
            const template = document.getElementById(`${COMPONENT_NAME}${templateSuffix}-template`);
            const content = template.content.cloneNode(true);
            const prefix = this.getAttribute('test-id') || COMPONENT_NAME;

            // Every part gets a unique, descriptive test id under this field's prefix.
            content.querySelectorAll('[data-test-id]').forEach((element) => {
                element.dataset.testId = `${prefix}-${element.dataset.testId}`;
            });

            return content;
        }

        /**
         * Builds the frame around the children; parts without text are left out.
         */
        #render() {
            const children = [...this.childNodes];
            const content = this.#newContent();
            const label = content.querySelector('[data-part="label"]');
            const hint = content.querySelector('[data-part="hint"]');
            const suffix = content.querySelector('[data-part="suffix"]');
            const labelText = this.getAttribute('label') ?? '';
            const hintText = this.getAttribute('hint') ?? '';
            const suffixText = this.getAttribute('suffix') ?? '';

            // Label: text, then " *" when required, then the suffix (no space before the suffix).
            content.querySelector('[data-part="label-text"]').textContent = labelText;

            if (this.hasAttribute('required')) {
                suffix.before(' ', this.#newContent('-required').querySelector('[data-part="required"]'));
            }

            if (suffixText === '') {
                suffix.remove();
            } else {
                suffix.textContent = suffixText;
            }

            // A field without a label (a list that its section already names) has no label line.
            if (labelText === '') {
                label.remove();
            } else {
                label.addEventListener('click', this.#onLabelClick);
            }

            // An empty hint would add a gap, so it is left out.
            if (hintText === '') {
                hint.remove();
            } else {
                hint.textContent = hintText;
            }

            // The page's control moves into the slot; the error line starts from the initial error.
            content.querySelector('[data-part="control"]').append(...children);
            this.replaceChildren(content);
            this.#showError();
        }

        /**
         * Writes the error on show into the error line and reflects it in data-invalid.
         */
        #showError() {
            const errorLine = this.querySelector(':scope > [data-part="error"]');
            const message = this.error;

            // The line may not exist yet when the page sets an error before the field renders.
            if (errorLine) {
                errorLine.textContent = message;
            }

            this.dataset.invalid = message === '' ? 'false' : 'true';
        }
    }

    if (!customElements.get(COMPONENT_NAME)) {
        customElements.define(COMPONENT_NAME, G4Field);
    }
})();
