/*
 * G4(TM) list editor component: <g4-list-editor>.
 *
 * Edits a list of short texts: one text box per entry with a trash button (and move up/down buttons
 * when order matters), plus an add button. Entries are kept as typed; the page drops blank entries
 * when it saves. Repeated entries (ignoring case and blank entries) and entries over the length
 * limit are reported under the entry while you type; the first occurrence stays clean.
 *
 * Contract:
 * - Attributes: value (JSON array of strings), unique (report repeated entries), ordered (move
 *   buttons), max-length (longest entry), placeholder (default 'Entry'), add-label (default
 *   '+ Add entry'), empty-text (default 'None.'), item-label (names entries for screen readers and
 *   tooltips; default: the field label), test-id (prefix of every part's data-test-id; rows add
 *   their position, for example 'sources-0-input').
 * - Properties: value (copy of the entries, as typed).
 * - Methods: focus(), validate() (shows the entry errors; true when there are none).
 * - Events (bubble): g4-input { value } while typing; g4-change { value } after add, remove, or move.
 */
(() => {
    'use strict';

    // Component name: the custom element tag, the template id prefix, and the default test id prefix.
    const COMPONENT_NAME = 'g4-list-editor';

    // Default texts when the page does not set them.
    const DEFAULT_ADD_LABEL = '+ Add entry';
    const DEFAULT_EMPTY_TEXT = 'None.';
    const DEFAULT_PLACEHOLDER = 'Entry';

    /**
     * Reads the value attribute.
     *
     * @param {string | null} text - JSON text of the entries.
     * @returns {string[]} Entries; non-string items are dropped.
     */
    const getEntries = (text) => {
        try {
            // Only text entries can be edited in a text box; anything else is dropped.
            const entries = JSON.parse(text ?? '[]');
            return Array.isArray(entries) ? entries.filter((entry) => typeof entry === 'string') : [];
        } catch {
            // Unreadable JSON starts an empty list rather than breaking the page.
            return [];
        }
    };

    /**
     * Describes the problem of every entry.
     *
     * @remarks
     * Compute-only. Blank entries are ignored. A repeated entry is reported on its later occurrence.
     *
     * @param {string[]} entries - Entries as typed.
     * @param {{ isUnique: boolean, maximumLength: number }} rules - The list rules.
     * @returns {string[]} One message per entry ('' when fine).
     */
    const getEntryErrors = (entries, rules) => {
        const firstIndexes = new Map();

        return entries.map((entry, index) => {
            const text = entry.trim();
            const comparable = text.toLowerCase();

            // Blank entries are dropped on save, so they are never an error.
            if (text === '') {
                return '';
            }

            if (rules.maximumLength > 0 && text.length > rules.maximumLength) {
                return `Use ${rules.maximumLength} characters or fewer.`;
            }

            // A repeated entry (ignoring case) points back to its first occurrence.
            if (rules.isUnique && firstIndexes.has(comparable)) {
                return `Duplicate of entry ${firstIndexes.get(comparable) + 1}.`;
            }

            // The first occurrence stays clean and becomes the reference for later ones.
            firstIndexes.set(comparable, index);
            return '';
        });
    };

    /**
     * List editor element.
     */
    class G4ListEditor extends HTMLElement {
        // Entries as typed.
        #entries = [];

        // Whether the template has been rendered into this element.
        #isRendered = false;

        // Adds an empty entry and puts the caret in it.
        #onAddClick = () => {
            // Store and render the new entry, then tell the page the list changed.
            this.#entries.push('');
            this.#renderRows();
            this.#dispatch('g4-change');

            // The new entry is ready for typing.
            const input = this.#getRowInput(this.#entries.length - 1);

            input?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            input?.focus();
        };

        // Moves or removes the entry whose button was pressed.
        #onRowsClick = (event) => {
            const button = event.target.closest('[data-action]');
            const index = Number(button?.closest('[data-index]')?.dataset.index);

            // Clicks outside the row buttons (the text box) change nothing.
            if (!button || !Number.isInteger(index)) {
                return;
            }

            // Remove the entry, or swap it with its neighbor when that neighbor exists.
            const action = button.dataset.action;
            const target = action === 'move-up' ? index - 1 : index + 1;

            if (action === 'remove') {
                this.#entries.splice(index, 1);
            } else if (target >= 0 && target < this.#entries.length) {
                [this.#entries[index], this.#entries[target]] = [this.#entries[target], this.#entries[index]];
            } else {
                return;
            }

            // Show the new order and tell the page the list changed.
            this.#renderRows();
            this.#dispatch('g4-change');
        };

        // Stores the typed entry, re-checks the list, and reports the edit.
        #onRowsInput = (event) => {
            const index = Number(event.target.closest('[data-index]')?.dataset.index);

            // Only entry text boxes carry an entry position.
            if (!Number.isInteger(index)) {
                return;
            }

            // Keep the entry as typed, show any new duplicate, and report the edit.
            this.#entries[index] = event.target.value;
            this.validate();
            this.#dispatch('g4-input');
        };

        /**
         * A copy of the entries, as typed.
         *
         * @returns {string[]} Entries.
         */
        get value() {
            return [...(this.#isRendered ? this.#entries : getEntries(this.getAttribute('value')))];
        }

        /**
         * Replaces the entries (no event: the owner made the change).
         *
         * @param {string[]} entries - New entries.
         */
        set value(entries) {
            // Only text entries are kept; anything else could not be shown in a text box.
            this.#entries = Array.isArray(entries) ? entries.filter((entry) => typeof entry === 'string') : [];

            if (this.#isRendered) {
                this.#renderRows();
            }
        }

        /**
         * Renders the list once, from the value attribute.
         */
        connectedCallback() {
            // A list moved in the page keeps its rows and listeners.
            if (this.#isRendered) {
                return;
            }

            // Entries set through the value property win over the value attribute.
            this.#isRendered = true;

            if (this.#entries.length === 0) {
                this.#entries = getEntries(this.getAttribute('value'));
            }

            // Build the list frame; the rows and the add button report through delegated listeners.
            const content = this.#newContent();
            const rows = content.querySelector('[data-part="rows"]');
            const add = content.querySelector('[data-part="add"]');

            add.textContent = this.getAttribute('add-label') || DEFAULT_ADD_LABEL;
            add.addEventListener('click', this.#onAddClick);
            rows.addEventListener('click', this.#onRowsClick);
            rows.addEventListener('input', this.#onRowsInput);
            this.replaceChildren(content);
            this.#renderRows();
        }

        /**
         * Puts the caret in the first entry, or focuses the add button of an empty list.
         */
        focus() {
            (this.#getRowInput(0) ?? this.querySelector('[data-part="add"]'))?.focus();
        }

        /**
         * Shows the problem of every entry under it.
         *
         * @returns {boolean} True when no entry has a problem.
         */
        validate() {
            const errors = getEntryErrors(this.#entries, {
                isUnique: this.hasAttribute('unique'),
                maximumLength: Number(this.getAttribute('max-length')) || 0
            });

            // Write every entry's message, so a fixed entry loses its old error.
            errors.forEach((message, index) => {
                const error = this.querySelector(`[data-index="${index}"] [data-part="error"]`);

                if (error) {
                    error.textContent = message;
                }
            });

            return errors.every((message) => message === '');
        }

        /**
         * Reports the entries to the page.
         *
         * @param {string} name - Event name.
         */
        #dispatch(name) {
            this.dispatchEvent(new CustomEvent(name, { bubbles: true, detail: { value: this.value } }));
        }

        /**
         * Returns the text box of one entry.
         *
         * @param {number} index - Entry position.
         * @returns {HTMLInputElement | null} The text box.
         */
        #getRowInput(index) {
            return this.querySelector(`[data-index="${index}"] [data-part="input"]`);
        }

        /**
         * Clones a template and prefixes every part's test id.
         *
         * @param {string} templateSuffix - Template id suffix ('' for the main template).
         * @param {string} prefix - Test id prefix.
         * @returns {DocumentFragment} The markup.
         */
        #newContent(templateSuffix = '', prefix = this.getAttribute('test-id') || COMPONENT_NAME) {
            const template = document.getElementById(`${COMPONENT_NAME}${templateSuffix}-template`);
            const content = template.content.cloneNode(true);

            // Every part gets a unique, descriptive test id under the given prefix.
            content.querySelectorAll('[data-test-id]').forEach((element) => {
                element.dataset.testId = `${prefix}-${element.dataset.testId}`;
            });

            return content;
        }

        /**
         * Renders one row per entry (or the empty text) and shows the entry errors.
         */
        #renderRows() {
            const rows = this.querySelector('[data-part="rows"]');
            const prefix = this.getAttribute('test-id') || COMPONENT_NAME;
            const fieldLabel = this.closest('g4-field')?.getAttribute('label');
            const itemLabel = this.getAttribute('item-label') || fieldLabel || 'List';
            const isOrdered = this.hasAttribute('ordered');
            const maximumLength = Number(this.getAttribute('max-length')) || 0;
            const count = this.#entries.length;

            // An empty list says so instead of showing no rows.
            if (count === 0) {
                const empty = this.#newContent('-empty');
                const emptyText = this.getAttribute('empty-text') || DEFAULT_EMPTY_TEXT;

                empty.querySelector('[data-part="empty"]').textContent = emptyText;
                rows.replaceChildren(empty);
                return;
            }

            // One row per entry, each named after its position.
            const fragments = this.#entries.map((entry, index) => {
                const row = this.#newContent('-row', `${prefix}-${index}`);
                const entryElement = row.querySelector('.g4-list-editor__entry');
                const input = row.querySelector('[data-part="input"]');
                const name = `${itemLabel} entry ${index + 1}`;

                // Name every control after its entry, for screen readers and tooltips.
                const setButton = (part, label, isDisabled) => {
                    const button = row.querySelector(`[data-part="${part}"]`);

                    button.title = label;
                    button.setAttribute('aria-label', label);
                    button.disabled = isDisabled;
                };

                entryElement.dataset.index = String(index);
                input.value = entry;
                input.placeholder = this.getAttribute('placeholder') || DEFAULT_PLACEHOLDER;
                input.setAttribute('aria-label', name);

                if (maximumLength > 0) {
                    input.maxLength = maximumLength;
                }

                // Move buttons only where order matters; the ends cannot move further.
                if (isOrdered) {
                    setButton('move-up', `Move ${name} up`, index === 0);
                    setButton('move-down', `Move ${name} down`, index === count - 1);
                } else {
                    row.querySelector('[data-part="move-up"]').remove();
                    row.querySelector('[data-part="move-down"]').remove();
                }

                setButton('remove', `Remove ${name}`, false);
                return row;
            });

            // Show the rows, then their duplicate and length errors.
            rows.replaceChildren(...fragments);
            this.validate();
        }
    }

    if (!customElements.get(COMPONENT_NAME)) {
        customElements.define(COMPONENT_NAME, G4ListEditor);
    }
})();
