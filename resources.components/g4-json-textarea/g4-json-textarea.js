/*
 * G4(TM) JSON text area component: <g4-json-textarea>.
 *
 * A numbered, non-wrapping JSON box that checks its text while you type, with a Check & Format
 * button and an Expand button (a large editor with line numbers and Format) in its corner.
 *
 * Contract:
 * - Initial text: the element's text content (escape it like any HTML text).
 * - Attributes: json-type ('object' | 'array' | none: the shape the text must parse to), rows
 *   (visible rows; default 10), label (expanded editor title when the box is not in a <g4-field>),
 *   test-id (prefix of every part's data-test-id).
 * - Properties: value (the text), error (the current JSON error, '' when the text is valid or empty).
 * - Methods: focus(), format(), selectRange(start, end).
 * - Events (bubble): g4-input { value } on every edit (typing, Format, expanded editor);
 *   g4-error { message } whenever the JSON error changes ('' when valid), also once when attached.
 *   A <g4-field> shows g4-error messages on its error line.
 */
(() => {
    'use strict';

    // Component name: the custom element tag, the template id prefix, and the default test id prefix.
    const COMPONENT_NAME = 'g4-json-textarea';

    // Visible rows of the box when the page does not set them.
    const DEFAULT_ROWS = 10;

    // Guidance appended to a JSON error while typing.
    const EDIT_GUIDANCE = 'Fix the highlighted text; this change won\'t be saved until it parses.';

    // Guidance appended to a JSON error when Format cannot parse the text.
    const FORMAT_GUIDANCE = 'Fix the highlighted text before formatting.';

    /**
     * Resolves a readable message from any caught value without default object stringification.
     *
     * @param {unknown} error - Value caught in a catch clause.
     * @returns {string} Readable message.
     */
    const resolveErrorMessage = (error) => {
        if (error instanceof Error) {
            return error.message;
        }

        return typeof error === 'string' ? error : 'Unknown error';
    };

    /**
     * Tests JSON text and describes the first problem.
     *
     * @remarks
     * Compute-only. Empty text is valid (the owner decides what an empty box stores). Besides
     * syntax, the parsed value must have the expected shape: an object or an array.
     *
     * @param {string} text - JSON text.
     * @param {string} expectedType - 'object', 'array', or '' for any value.
     * @param {string} guidance - Sentence appended to the error.
     * @returns {string} '' when the text is valid; otherwise the error line.
     */
    const getJsonError = (text, expectedType, guidance) => {
        if (text.trim() === '') {
            return '';
        }

        let value;

        try {
            value = JSON.parse(text);
        } catch (error) {
            return `Invalid JSON - ${resolveErrorMessage(error)}. ${guidance}`;
        }

        const isObject = value !== null && typeof value === 'object' && !Array.isArray(value);

        if (expectedType === 'object' && !isObject) {
            return `Enter a JSON object, for example { "key": "value" }. ${guidance}`;
        }

        if (expectedType === 'array' && !Array.isArray(value)) {
            return `Enter a JSON array, for example [ { "name": "One" } ]. ${guidance}`;
        }

        return '';
    };

    /**
     * JSON text box element.
     */
    class G4JsonTextarea extends HTMLElement {
        // Expanded editor while it is open.
        #editor = null;

        // Current JSON error ('' when valid).
        #error = '';

        // Whether the template has been rendered into this element.
        #isRendered = false;

        // Opens the expanded editor.
        #onExpandClick = () => {
            this.#showEditor();
        };

        // Formats from the corner button.
        #onFormatClick = () => {
            this.format();
        };

        // Checks the text and reports the edit.
        #onTextareaInput = () => {
            this.#setError(getJsonError(this.value, this.getAttribute('json-type') ?? '', EDIT_GUIDANCE));
            this.#dispatchInput();
        };

        // Text set before the element rendered, kept until it renders.
        #pendingValue = null;

        /**
         * The current JSON error; '' when the text is valid or empty.
         *
         * @returns {string} Error text.
         */
        get error() {
            return this.#error;
        }

        /**
         * The box text.
         *
         * @returns {string} Text.
         */
        get value() {
            return this.#getPart('textarea')?.value ?? this.#pendingValue ?? '';
        }

        /**
         * Replaces the box text and re-checks it (no g4-input: the owner made the change).
         *
         * @param {string} text - New text.
         */
        set value(text) {
            const textarea = this.#getPart('textarea');

            // Before the element renders, the value waits until it does.
            if (!textarea) {
                this.#pendingValue = text;
                return;
            }

            // Show the new text with its line numbers.
            textarea.value = text;
            this.querySelector('g4-line-numbers').refresh();
            this.#setError(getJsonError(text, this.getAttribute('json-type') ?? '', EDIT_GUIDANCE));
        }

        /**
         * Renders the box once, from the element's text content, and reports the initial error.
         */
        connectedCallback() {
            // An element moved in the page keeps its rendered parts and listeners.
            if (this.#isRendered) {
                return;
            }

            this.#isRendered = true;

            // The text comes from a value set in code, or the element's own text content.
            const text = this.#pendingValue ?? this.textContent;
            const content = this.#newContent();
            const textarea = content.querySelector('[data-part="textarea"]');

            // The box height comes from the rows attribute.
            textarea.rows = Number(this.getAttribute('rows')) || DEFAULT_ROWS;

            // Fill the box with the caret at the start, as a freshly opened box.
            textarea.value = text;
            textarea.setSelectionRange(0, 0);

            // Typing and the corner buttons report through this element.
            textarea.addEventListener('input', this.#onTextareaInput);
            content.querySelector('[data-part="format"]').addEventListener('click', this.#onFormatClick);
            content.querySelector('[data-part="expand"]').addEventListener('click', this.#onExpandClick);
            this.replaceChildren(content);

            // Report the initial JSON check, so the field shows an existing problem at once.
            this.#setError(getJsonError(text, this.getAttribute('json-type') ?? '', EDIT_GUIDANCE));
        }

        /**
         * Puts the caret in the box.
         */
        focus() {
            this.#getPart('textarea')?.focus();
        }

        /**
         * Checks and pretty-prints the text (4-space indent). Invalid text is left as it is and the
         * error says to fix it first.
         */
        format() {
            const text = this.value;

            // Invalid text is left as it is, with an error that says to fix it first.
            const error = getJsonError(text, this.getAttribute('json-type') ?? '', FORMAT_GUIDANCE);

            if (error !== '') {
                this.#setError(error);
                return;
            }

            // Valid text is pretty-printed and reported like an edit.
            this.value = text.trim() === '' ? '' : JSON.stringify(JSON.parse(text), null, 4);
            this.#dispatchInput();
        }

        /**
         * Selects a range of the text and scrolls its line near the top of the box.
         *
         * @param {number} start - Start offset.
         * @param {number} end - End offset.
         */
        selectRange(start, end) {
            const textarea = this.#getPart('textarea');

            if (!textarea) {
                return;
            }

            // Select the range, then bring its line near the top of the box.
            const lineHeight = Number.parseFloat(getComputedStyle(textarea).lineHeight) || 18;
            const lineIndex = textarea.value.slice(0, start).split('\n').length - 1;

            textarea.focus();
            textarea.setSelectionRange(start, end);
            textarea.scrollTop = Math.max(0, (lineIndex - 2) * lineHeight);
        }

        /**
         * Reports an edit to the page.
         */
        #dispatchInput() {
            this.dispatchEvent(new CustomEvent('g4-input', { bubbles: true, detail: { value: this.value } }));
        }

        /**
         * Builds the expanded editor title: the titles of the cards that hold the box (outermost
         * first), then the field label.
         *
         * @returns {string} Title text.
         */
        #getEditorTitle() {
            const titles = [];

            // Collect the titles of the cards that hold the box, innermost last.
            let card = this.closest('g4-card');

            while (card) {
                titles.unshift(card.getAttribute('card-title') ?? '');
                card = card.parentElement?.closest('g4-card');
            }

            const label = this.closest('g4-field')?.getAttribute('label') || this.getAttribute('label') || 'JSON';

            return [...titles, label].filter((text) => text !== '').join(' - ');
        }

        /**
         * Returns one rendered part.
         *
         * @param {string} name - Part name (data-part).
         * @returns {HTMLElement | null} The part.
         */
        #getPart(name) {
            return this.querySelector(`:scope > .g4-json-textarea__box [data-part="${name}"]`);
        }

        /**
         * Clones a template and prefixes every part's test id with this element's test-id.
         *
         * @param {string} [templateSuffix=''] - Template id suffix ('' for the main template).
         * @param {boolean} [isPrefixed=true] - Whether test ids get this element's prefix.
         * @returns {DocumentFragment} The markup.
         */
        #newContent(templateSuffix = '', isPrefixed = true) {
            const template = document.getElementById(`${COMPONENT_NAME}${templateSuffix}-template`);
            const content = template.content.cloneNode(true);
            const prefix = this.getAttribute('test-id') || COMPONENT_NAME;

            if (isPrefixed) {
                // Every part gets a unique, descriptive test id under this element's prefix.
                content.querySelectorAll('[data-test-id]').forEach((element) => {
                    element.dataset.testId = `${prefix}-${element.dataset.testId}`;
                });
            }

            return content;
        }

        /**
         * Stores the error, mirrors it in an open expanded editor, and reports it to the field.
         *
         * @param {string} message - Error text; '' when valid.
         */
        #setError(message) {
            // Keep the error, mirror it in an open expanded editor, and tell the field.
            this.#error = message;
            this.#editor?.setError(message);
            this.dispatchEvent(new CustomEvent('g4-error', { bubbles: true, detail: { message } }));
        }

        /**
         * Opens the expanded editor: typing there updates this box live; Format formats this box
         * and shows the result there.
         */
        #showEditor() {
            const textarea = this.#getPart('textarea');
            const editor = document.createElement('g4-expand-editor');
            const formatButton = this.#newContent('-editor-tools', false).firstElementChild;

            // Typing in the editor goes through the box's own input path (state, checks, line numbers).
            const onEditorInput = (event) => {
                textarea.value = event.detail.value;
                textarea.dispatchEvent(new Event('input', { bubbles: true }));
            };

            // Format formats this box, then shows the result and any error in the editor.
            const onEditorFormatClick = () => {
                this.format();
                editor.setText(this.value);
                editor.setError(this.#error);
            };

            // A closed editor no longer mirrors the error.
            const onEditorClose = () => {
                this.#editor = null;
            };

            // Open the editor titled after the field, where the caret was.
            editor.setAttribute('editor-title', this.#getEditorTitle());
            editor.addEventListener('g4-input', onEditorInput);
            formatButton.addEventListener('click', onEditorFormatClick);
            this.#editor = editor;
            editor.open({
                focusReturnElement: textarea,
                isErrorLineShown: true,
                selectionEnd: textarea.selectionEnd,
                selectionStart: textarea.selectionStart,
                text: textarea.value,
                tools: [formatButton]
            });
            editor.setError(this.#error);
            editor.closest('g4-modal')?.addEventListener('g4-close', onEditorClose);
        }
    }

    if (!customElements.get(COMPONENT_NAME)) {
        customElements.define(COMPONENT_NAME, G4JsonTextarea);
    }
})();
