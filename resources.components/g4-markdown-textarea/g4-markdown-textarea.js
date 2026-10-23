/*
 * G4(TM) Markdown text area component: <g4-markdown-textarea>.
 *
 * A numbered, non-wrapping text box for Markdown, with a Markdown reference button (a static table
 * of what to type and how it looks) and an Expand button (a large editor with line numbers and the
 * same reference button) in its corner. Text is kept exactly as typed: indentation, blank lines.
 *
 * Contract:
 * - Initial text: the element's text content (escape it like any HTML text).
 * - Attributes: rows (visible rows; default 2), reference-note (sentence above the reference table),
 *   label (expanded editor title when the box is not in a <g4-field>), test-id (prefix of every
 *   part's data-test-id).
 * - Properties: value (the text).
 * - Methods: focus().
 * - Events (bubble): g4-input { value } on every edit (typing or the expanded editor).
 */
(() => {
    'use strict';

    // Component name: the custom element tag, the template id prefix, and the default test id prefix.
    const COMPONENT_NAME = 'g4-markdown-textarea';

    // Sentence above the reference table when the page does not set one.
    const DEFAULT_REFERENCE_NOTE = 'This text supports Markdown. The most common syntax:';

    /**
     * Markdown text box element.
     */
    class G4MarkdownTextarea extends HTMLElement {
        // Whether the template has been rendered into this element.
        #isRendered = false;

        // Opens the expanded editor.
        #onExpandClick = () => {
            this.#showEditor();
        };

        // Opens the Markdown reference from the corner button.
        #onReferenceClick = (event) => {
            this.#showReference(event.currentTarget);
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
            const rows = Number(this.getAttribute('rows'));

            if (rows > 0) {
                textarea.rows = rows;
            }

            // Fill the box with the caret at the start, as a freshly opened box.
            textarea.value = text;
            textarea.setSelectionRange(0, 0);

            // Typing and the corner buttons report through this element.
            textarea.addEventListener('input', this.#onTextareaInput);
            content.querySelector('[data-part="reference"]').addEventListener('click', this.#onReferenceClick);
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
            return this.querySelector(`:scope > .g4-markdown-textarea__box [data-part="${name}"]`);
        }

        /**
         * Clones a template and, optionally, prefixes every part's test id with this element's test-id.
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
         * Opens the expanded editor: typing there updates this box live; its header has the
         * Markdown reference button.
         */
        #showEditor() {
            const textarea = this.#getPart('textarea');
            const editor = document.createElement('g4-expand-editor');
            const referenceButton = this.#newContent('-editor-tools', false).firstElementChild;

            // Typing in the editor goes through the box's own input path (state, checks, line numbers).
            const onEditorInput = (event) => {
                textarea.value = event.detail.value;
                textarea.dispatchEvent(new Event('input', { bubbles: true }));
            };

            // The reference opens over the editor; closing it returns focus to its button.
            const onEditorReferenceClick = () => {
                this.#showReference(referenceButton);
            };

            // Open the editor titled after the field, where the caret was.
            editor.setAttribute('editor-title', this.#getEditorTitle());
            editor.addEventListener('g4-input', onEditorInput);
            referenceButton.addEventListener('click', onEditorReferenceClick);
            editor.open({
                focusReturnElement: textarea,
                selectionEnd: textarea.selectionEnd,
                selectionStart: textarea.selectionStart,
                text: textarea.value,
                tools: [referenceButton]
            });
        }

        /**
         * Opens the static Markdown reference over the page (or over the expanded editor).
         *
         * @param {HTMLElement} opener - The button that opened it; it gets focus back on close.
         */
        #showReference(opener) {
            const modal = document.createElement('g4-modal');
            const content = this.#newContent('-reference', false);

            // The reference opens in its own modal, with the page's note above the table.
            content.querySelector('[data-part="reference-note"]').textContent = this.getAttribute('reference-note') || DEFAULT_REFERENCE_NOTE;
            modal.setAttribute('modal-title', 'Markdown reference');
            modal.setAttribute('size', 'reference');
            modal.setAttribute('test-id', 'markdown-reference');
            modal.append(content);
            modal.show(opener);

            // Focus the Close button, so Escape or Enter closes the reference at once.
            modal.querySelector('[data-part="close"]')?.focus();
        }
    }

    if (!customElements.get(COMPONENT_NAME)) {
        customElements.define(COMPONENT_NAME, G4MarkdownTextarea);
    }
})();
