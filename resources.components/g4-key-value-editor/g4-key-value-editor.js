/*
 * G4(TM) key/value editor component: <g4-key-value-editor>.
 *
 * Edits key/value pairs (headers, environment variables, protocol settings): one key box and one
 * value box per entry with a trash button, plus an add button. Entries keep their order. A value
 * without a key and a repeated key are reported under the entry while you type; the page drops
 * entries without a key when it saves.
 *
 * Contract:
 * - Attributes: value (JSON: an object, or an array of { key, value }), key-placeholder (default
 *   'Key'), value-placeholder (default 'Value'), add-label (default '+ Add entry'), empty-text
 *   (default 'None.'), item-label (names entries for screen readers and tooltips; default: the
 *   field label), test-id (prefix of every part's data-test-id; rows add their position, for
 *   example 'headers-0-key-input').
 * - Properties: value (copy of the entries: [{ key, value }], as typed).
 * - Methods: focus(), validate() (shows the entry errors; true when there are none).
 * - Events (bubble): g4-input { value } while typing; g4-change { value } after add or remove.
 */
(() => {
    'use strict';

    // Component name: the custom element tag, the template id prefix, and the default test id prefix.
    const COMPONENT_NAME = 'g4-key-value-editor';

    // Default texts when the page does not set them.
    const DEFAULT_ADD_LABEL = '+ Add entry';
    const DEFAULT_EMPTY_TEXT = 'None.';
    const DEFAULT_KEY_PLACEHOLDER = 'Key';
    const DEFAULT_VALUE_PLACEHOLDER = 'Value';

    /**
     * Reads the value attribute: an object (in key order) or an array of { key, value }.
     *
     * @param {string | null} text - JSON text of the entries.
     * @returns {{ key: string, value: string }[]} Entries; non-text values are shown as JSON.
     */
    const getEntries = (text) => {
        // Text stays text; any other value is shown as its JSON, never as '[object Object]'.
        const toText = (value) => (typeof value === 'string' ? value : JSON.stringify(value) ?? '');

        try {
            const value = JSON.parse(text ?? '[]');

            // An ordered list of pairs keeps its order and any blank or repeated keys.
            if (Array.isArray(value)) {
                return value.map((entry) => ({ key: toText(entry?.key ?? ''), value: toText(entry?.value ?? '') }));
            }

            // An object gives one entry per key, in key order.
            return value && typeof value === 'object'
                ? Object.entries(value).map(([key, entry]) => ({ key, value: toText(entry) }))
                : [];
        } catch {
            // Unreadable JSON starts an empty editor rather than breaking the page.
            return [];
        }
    };

    /**
     * Describes the problem of every entry.
     *
     * @remarks
     * Compute-only. A value needs a key; a repeated key is reported on its later occurrence.
     *
     * @param {{ key: string, value: string }[]} entries - Entries as typed.
     * @returns {string[]} One message per entry ('' when fine).
     */
    const getEntryErrors = (entries) => {
        const firstIndexes = new Map();

        return entries.map((entry, index) => {
            const key = entry.key.trim();

            // A blank row is fine; a value without a key would be lost on save.
            if (key === '') {
                return entry.value.trim() === '' ? '' : 'Enter a key for this value.';
            }

            // A repeated key points back to the first entry that uses it.
            if (firstIndexes.has(key)) {
                return `Duplicate of key ${firstIndexes.get(key) + 1}.`;
            }

            // The first occurrence stays clean and becomes the reference for later ones.
            firstIndexes.set(key, index);
            return '';
        });
    };

    /**
     * Key/value editor element.
     */
    class G4KeyValueEditor extends HTMLElement {
        // Entries as typed.
        #entries = [];

        // Whether the template has been rendered into this element.
        #isRendered = false;

        // Adds an empty entry and puts the caret in its key.
        #onAddClick = () => {
            // Store and render the new entry, then tell the page the entries changed.
            this.#entries.push({ key: '', value: '' });
            this.#renderRows();
            this.#dispatch('g4-change');

            // The new key box is ready for typing.
            const input = this.querySelector(`[data-index="${this.#entries.length - 1}"] [data-part="key"]`);

            input?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            input?.focus();
        };

        // Removes the entry whose trash button was pressed.
        #onRowsClick = (event) => {
            const button = event.target.closest('[data-part="remove"]');
            const index = Number(button?.closest('[data-index]')?.dataset.index);

            // Clicks outside the trash buttons change nothing.
            if (!button || !Number.isInteger(index)) {
                return;
            }

            // Drop the entry, show the rest, and tell the page.
            this.#entries.splice(index, 1);
            this.#renderRows();
            this.#dispatch('g4-change');
        };

        // Stores the typed key or value, re-checks the entries, and reports the edit.
        #onRowsInput = (event) => {
            const index = Number(event.target.closest('[data-index]')?.dataset.index);
            const part = event.target.dataset.part;

            // Only the key and value boxes of an entry are stored.
            if (!Number.isInteger(index) || (part !== 'key' && part !== 'value')) {
                return;
            }

            // Keep the text as typed, show any new problem, and report the edit.
            this.#entries[index][part] = event.target.value;
            this.validate();
            this.#dispatch('g4-input');
        };

        /**
         * A copy of the entries, as typed.
         *
         * @returns {{ key: string, value: string }[]} Entries.
         */
        get value() {
            const entries = this.#isRendered ? this.#entries : getEntries(this.getAttribute('value'));

            return entries.map((entry) => ({ ...entry }));
        }

        /**
         * Replaces the entries (no event: the owner made the change).
         *
         * @param {{ key: string, value: string }[]} entries - New entries.
         */
        set value(entries) {
            // Normalize through the same reader as the attribute, so every entry holds text.
            this.#entries = getEntries(JSON.stringify(entries ?? []));

            if (this.#isRendered) {
                this.#renderRows();
            }
        }

        /**
         * Renders the editor once, from the value attribute.
         */
        connectedCallback() {
            // An editor moved in the page keeps its rows and listeners.
            if (this.#isRendered) {
                return;
            }

            // Entries set through the value property win over the value attribute.
            this.#isRendered = true;

            if (this.#entries.length === 0) {
                this.#entries = getEntries(this.getAttribute('value'));
            }

            // Build the editor frame; the rows and the add button report through delegated listeners.
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
         * Puts the caret in the first key, or focuses the add button when there are no entries.
         */
        focus() {
            const firstKey = this.querySelector('[data-index="0"] [data-part="key"]');

            (firstKey ?? this.querySelector('[data-part="add"]'))?.focus();
        }

        /**
         * Shows the problem of every entry under it.
         *
         * @returns {boolean} True when no entry has a problem.
         */
        validate() {
            const errors = getEntryErrors(this.#entries);

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
            const itemLabel = this.getAttribute('item-label') || fieldLabel || 'Entry';

            // No entries: say so instead of showing no rows.
            if (this.#entries.length === 0) {
                const empty = this.#newContent('-empty');
                const emptyText = this.getAttribute('empty-text') || DEFAULT_EMPTY_TEXT;

                empty.querySelector('[data-part="empty"]').textContent = emptyText;
                rows.replaceChildren(empty);
                return;
            }

            // One row per entry; every box and button is named after the entry's position.
            const fragments = this.#entries.map((entry, index) => {
                const row = this.#newContent('-row', `${prefix}-${index}`);
                const key = row.querySelector('[data-part="key"]');
                const value = row.querySelector('[data-part="value"]');
                const remove = row.querySelector('[data-part="remove"]');
                const name = `${itemLabel} ${index + 1}`;

                row.querySelector('.g4-key-value-editor__entry').dataset.index = String(index);
                key.value = entry.key;
                key.placeholder = this.getAttribute('key-placeholder') || DEFAULT_KEY_PLACEHOLDER;
                key.setAttribute('aria-label', `${name} key`);
                value.value = entry.value;
                value.placeholder = this.getAttribute('value-placeholder') || DEFAULT_VALUE_PLACEHOLDER;
                value.setAttribute('aria-label', `${name} value`);
                remove.title = `Remove ${name}`;
                remove.setAttribute('aria-label', `Remove ${name}`);
                return row;
            });

            // Show the rows, then their key problems.
            rows.replaceChildren(...fragments);
            this.validate();
        }
    }

    if (!customElements.get(COMPONENT_NAME)) {
        customElements.define(COMPONENT_NAME, G4KeyValueEditor);
    }
})();
