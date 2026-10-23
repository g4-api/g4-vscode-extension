/*
 * G4(TM) action bar component: <g4-action-bar>.
 *
 * The bar that stays at the bottom of a page: its action buttons (for example Save and Reset to
 * Defaults), then a short note that shows for a moment after an action (for example
 * "Settings sent.").
 *
 * Contract:
 * - Attributes: actions (JSON array of { id, label, variant: 'primary' | 'secondary', testId }),
 *   note-duration (milliseconds a note stays; default 2500), test-id (prefix of every part's
 *   data-test-id).
 * - Methods: showNote(text) shows the note and fades it out; setAction(id, { label, disabled })
 *   changes one button; setDisabled(isDisabled) changes every button.
 * - Events (bubble): g4-action { id } when a button is pressed.
 */
(() => {
    'use strict';

    // Component name: the custom element tag, the template id prefix, and the default test id prefix.
    const COMPONENT_NAME = 'g4-action-bar';

    // How long a note stays when the page does not set it.
    const DEFAULT_NOTE_DURATION_MILLISECONDS = 2500;

    /**
     * Narrows an action value to text.
     *
     * @remarks
     * Compute-only. Only text is used, so a button never reads '[object Object]'.
     *
     * @param {unknown} value - Value from the page's action data.
     * @returns {string} The text, or '' for any other value.
     */
    const convertToText = (value) => (typeof value === 'string' ? value : '');

    /**
     * Reads the actions attribute.
     *
     * @param {string | null} text - JSON text of the actions.
     * @returns {{ id: string, label: string, variant?: string, testId?: string }[]} Actions.
     */
    const getActions = (text) => {
        try {
            const actions = JSON.parse(text ?? '[]');
            return Array.isArray(actions) ? actions : [];
        } catch {
            // Unreadable JSON renders a bar without buttons rather than breaking the page.
            return [];
        }
    };

    /**
     * Action bar element.
     */
    class G4ActionBar extends HTMLElement {
        // Whether the template has been rendered into this element.
        #isRendered = false;

        // Timer that fades the note out.
        #noteTimer = undefined;

        // Reports the pressed button.
        #onButtonsClick = (event) => {
            const button = event.target.closest('[data-action-id]');

            // A disabled button (for example Publish while publishing) reports nothing.
            if (!button || button.disabled) {
                return;
            }

            this.dispatchEvent(new CustomEvent('g4-action', { bubbles: true, detail: { id: button.dataset.actionId } }));
        };

        // Fades the note out.
        #onNoteElapsed = () => {
            this.querySelector('[data-part="note"]')?.classList.remove('g4-action-bar__note--shown');
        };

        /**
         * Renders the bar and its buttons once.
         */
        connectedCallback() {
            // A bar moved in the page keeps its buttons and listener.
            if (this.#isRendered) {
                return;
            }

            this.#isRendered = true;

            const content = this.#newContent();
            const buttons = content.querySelector('[data-part="buttons"]');
            const template = document.getElementById(`${COMPONENT_NAME}-button-template`);
            const prefix = this.getAttribute('test-id') || COMPONENT_NAME;

            // One button per action: its text, id, look, and a descriptive test id.
            getActions(this.getAttribute('actions')).forEach((action) => {
                const button = template.content.cloneNode(true).querySelector('[data-part="button"]');
                const id = convertToText(action.id);

                button.textContent = convertToText(action.label);
                button.dataset.actionId = id;
                button.dataset.testId = convertToText(action.testId) || `${prefix}-${id}-button`;
                button.classList.toggle('g4-action-bar__button--secondary', action.variant === 'secondary');
                buttons.append(button);
            });

            // One delegated listener reports every button.
            buttons.addEventListener('click', this.#onButtonsClick);
            this.replaceChildren(content);
        }

        /**
         * Changes one button.
         *
         * @param {string} id - Action id.
         * @param {{ label?: string, disabled?: boolean }} state - New label and/or disabled state.
         */
        setAction(id, state) {
            const button = this.querySelector(`[data-action-id="${id}"]`);

            // An unknown action id changes nothing.
            if (!button) {
                return;
            }

            // Only the parts the page passes are changed.
            if (typeof state.label === 'string') {
                button.textContent = state.label;
            }

            if (typeof state.disabled === 'boolean') {
                button.disabled = state.disabled;
            }
        }

        /**
         * Enables or disables every button.
         *
         * @param {boolean} isDisabled - New state.
         */
        setDisabled(isDisabled) {
            this.querySelectorAll('[data-action-id]').forEach((button) => {
                button.disabled = isDisabled;
            });
        }

        /**
         * Shows a note for a moment; a newer note restarts the timer.
         *
         * @param {string} text - Note text.
         */
        showNote(text) {
            const note = this.querySelector('[data-part="note"]');
            const duration = Number(this.getAttribute('note-duration')) || DEFAULT_NOTE_DURATION_MILLISECONDS;

            // Before the bar renders there is no note to show.
            if (!note) {
                return;
            }

            // Show the note now and fade it out after the duration; a newer note restarts the timer.
            note.textContent = text;
            note.classList.add('g4-action-bar__note--shown');
            clearTimeout(this.#noteTimer);
            this.#noteTimer = setTimeout(this.#onNoteElapsed, duration);
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

            // Every part gets a unique, descriptive test id under this bar's prefix.
            content.querySelectorAll('[data-test-id]').forEach((element) => {
                element.dataset.testId = `${prefix}-${element.dataset.testId}`;
            });

            return content;
        }
    }

    if (!customElements.get(COMPONENT_NAME)) {
        customElements.define(COMPONENT_NAME, G4ActionBar);
    }
})();
