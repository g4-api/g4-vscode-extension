/*
 * G4(TM) code text area component: <g4-code-textarea>.
 *
 * A numbered, non-wrapping plain text box (for example an inline script) with an Expand button (a
 * large editor with line numbers) in its corner.
 *
 * Contract:
 * - Initial text: the element's text content (escape it like any HTML text).
 * - Attributes: rows (visible rows; default 4), placeholder, label (expanded editor title when the
 *   box is not in a <g4-field>), test-id (prefix of every part's data-test-id).
 * - Properties: value (the text).
 * - Methods: focus().
 * - Events (bubble): g4-input { value } on every edit (typing or the expanded editor).
 */
(() => {
    'use strict';

    // Component name: the custom element tag, the template id prefix, and the default test id prefix.
    const COMPONENT_NAME = 'g4-code-textarea';

    // Visible rows of the box when the page does not set them.
    const DEFAULT_ROWS = 4;

    /**
     * Plain text box element.
     */
    class G4CodeTextarea extends HTMLElement {
        // Whether the template has been rendered into this element.
        #isRendered = false;

        // Opens the expanded editor.
        #onExpandClick = () => {
            this.#showEditor();
        };

        // Reports the edit.
        #onTextareaInput = () => {
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
            return this.#getPart('textarea')?.value ?? this.#pendingValue ?? '';
        }

        /**
         * Replaces the box text (no g4-input: the owner made the change).
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
        }

        /**
         * Renders the box once, from the element's text content.
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
            const placeholder = this.getAttribute('placeholder');

            // The box height and placeholder come from the attributes.
            textarea.rows = Number(this.getAttribute('rows')) || DEFAULT_ROWS;

            if (placeholder) {
                textarea.placeholder = placeholder;
            }

            // Fill the box with the caret at the start, as a freshly opened box.
            textarea.value = text;
            textarea.setSelectionRange(0, 0);

            // Typing and the corner buttons report through this element.
            textarea.addEventListener('input', this.#onTextareaInput);
            content.querySelector('[data-part="expand"]').addEventListener('click', this.#onExpandClick);
            this.replaceChildren(content);
        }

        /**
         * Puts the caret in the box.
         */
        focus() {
            this.#getPart('textarea')?.focus();
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

            const label = this.closest('g4-field')?.getAttribute('label') || this.getAttribute('label') || 'Text';

            return [...titles, label].filter((text) => text !== '').join(' - ');
        }

        /**
         * Returns one rendered part.
         *
         * @param {string} name - Part name (data-part).
         * @returns {HTMLElement | null} The part.
         */
        #getPart(name) {
            return this.querySelector(`:scope > .g4-code-textarea__box [data-part="${name}"]`);
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
         * Opens the expanded editor: typing there updates this box live.
         */
        #showEditor() {
            const textarea = this.#getPart('textarea');
            const editor = document.createElement('g4-expand-editor');

            // Typing in the editor goes through the box's own input path (state, checks, line numbers).
            const onEditorInput = (event) => {
                textarea.value = event.detail.value;
                textarea.dispatchEvent(new Event('input', { bubbles: true }));
            };

            // Open the editor titled after the field, where the caret was.
            editor.setAttribute('editor-title', this.#getEditorTitle());
            editor.addEventListener('g4-input', onEditorInput);
            editor.open({
                focusReturnElement: textarea,
                selectionEnd: textarea.selectionEnd,
                selectionStart: textarea.selectionStart,
                text: textarea.value
            });
        }
    }

    if (!customElements.get(COMPONENT_NAME)) {
        customElements.define(COMPONENT_NAME, G4CodeTextarea);
    }
})();
