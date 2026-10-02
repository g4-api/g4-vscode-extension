/*
 * G4(TM) expand editor component: <g4-expand-editor>.
 *
 * A large editor for the text of a small text box: opens in a <g4-modal>, numbers its lines with
 * <g4-line-numbers>, never wraps, and reports every edit so the owner can keep its own box in step.
 *
 * Contract:
 * - Attributes: editor-title (modal title), test-id (prefix of every part's data-test-id; the modal
 *   uses the same prefix; default 'expand-editor').
 * - Methods: open(options) shows the editor; setText(text) replaces the text (for example after a
 *   Format); setError(message) fills the error line; close() closes the modal.
 * - Events: g4-input { value } on every edit.
 */
(() => {
    'use strict';

    // Component name: the custom element tag and the template id prefix.
    const COMPONENT_NAME = 'g4-expand-editor';

    // Default test id prefix, matching the editor's role on every page.
    const DEFAULT_TEST_ID = 'expand-editor';

    /**
     * Expanded text editor element.
     */
    class G4ExpandEditor extends HTMLElement {
        // Whether the template has been rendered into this element.
        #isRendered = false;

        // The modal that holds the editor while it is open.
        #modal = null;

        /**
         * Reports every edit to the owner.
         *
         * @param {Event} event - Input event of the editor's text area.
         */
        #onTextareaInput = (event) => {
            this.dispatchEvent(new CustomEvent('g4-input', { detail: { value: event.target.value } }));
        };

        /**
         * Closes the editor's modal.
         */
        close() {
            this.#modal?.close();
        }

        /**
         * Renders the editor once, when the element is first attached.
         */
        connectedCallback() {
            // An element moved in the page keeps its rendered parts and listeners.
            if (this.#isRendered) {
                return;
            }

            this.#isRendered = true;

            // Build the editor and report every edit to the owner.
            this.replaceChildren(this.#newContent());
            this.#getPart('textarea').addEventListener('input', this.#onTextareaInput);
        }

        /**
         * Opens the editor over the page.
         *
         * @param {object} options - Open options.
         * @param {string} options.text - Text to edit.
         * @param {number} [options.selectionStart=0] - Caret or selection start to restore.
         * @param {number} [options.selectionEnd=0] - Selection end to restore.
         * @param {HTMLElement} [options.focusReturnElement] - Element that gets focus back on close.
         * @param {HTMLElement[]} [options.tools=[]] - Buttons for the modal header.
         * @param {boolean} [options.isErrorLineShown=false] - Whether the editor shows an error line.
         */
        open(options) {
            const { text, selectionStart = 0, selectionEnd = 0, focusReturnElement = null, tools = [], isErrorLineShown = false } = options;
            const modal = document.createElement('g4-modal');

            // The modal carries the title, the header tools, and this editor as its content.
            modal.setAttribute('modal-title', this.getAttribute('editor-title') ?? '');
            modal.setAttribute('size', 'editor');
            modal.setAttribute('test-id', this.getAttribute('test-id') || DEFAULT_TEST_ID);

            tools.forEach((tool) => {
                tool.dataset.slot = 'tools';
                modal.append(tool);
            });

            modal.append(this);
            modal.show(focusReturnElement);
            this.#modal = modal;

            // The editor is rendered now: fill it and open where the caret was.
            const textarea = this.#getPart('textarea');

            if (!isErrorLineShown) {
                this.#getPart('error').remove();
            }

            textarea.value = text;
            this.querySelector('g4-line-numbers').refresh();
            textarea.focus();
            textarea.setSelectionRange(selectionStart, selectionEnd);
        }

        /**
         * Shows an error under the text; '' clears it.
         *
         * @param {string} message - Error text.
         */
        setError(message) {
            const error = this.#getPart('error');

            if (error) {
                error.textContent = message;
            }
        }

        /**
         * Replaces the text, for example after the owner formatted it.
         *
         * @param {string} text - New text.
         */
        setText(text) {
            const textarea = this.#getPart('textarea');

            textarea.value = text;
            this.querySelector('g4-line-numbers').refresh();
            textarea.focus();
        }

        /**
         * Returns one rendered part.
         *
         * @param {string} name - Part name (data-part).
         * @returns {HTMLElement | null} The part.
         */
        #getPart(name) {
            return this.querySelector(`[data-part="${name}"]`);
        }

        /**
         * Clones the template and prefixes every part's test id with this element's test-id.
         *
         * @returns {DocumentFragment} The editor markup.
         */
        #newContent() {
            const template = document.getElementById(`${COMPONENT_NAME}-template`);
            const content = template.content.cloneNode(true);
            const prefix = this.getAttribute('test-id') || DEFAULT_TEST_ID;

            // Every part gets a unique, descriptive test id under this element's prefix.
            content.querySelectorAll('[data-test-id]').forEach((element) => {
                element.dataset.testId = `${prefix}-${element.dataset.testId}`;
            });

            return content;
        }
    }

    if (!customElements.get(COMPONENT_NAME)) {
        customElements.define(COMPONENT_NAME, G4ExpandEditor);
    }
})();
