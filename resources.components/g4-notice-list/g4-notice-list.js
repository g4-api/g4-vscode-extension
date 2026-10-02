/*
 * G4(TM) notice list component: <g4-notice-list>.
 *
 * A stack of notices: banners (a note with an optional action button, for example "already exists
 * - Load existing values") or warning lines (a triangle and text; a line can be pressed, for example
 * to select the text it is about). The list takes no space while it is empty.
 *
 * Contract:
 * - Attributes: variant ('banner' | 'warning'; default 'banner'), test-id (default test id of the
 *   items when a notice has none).
 * - Properties: notices, an array of:
 *   { parts: [{ text, isCode }] or text, tone: 'ok' | 'error' | none, testId,
 *     action: { id, label, testId, data } }
 *   A banner shows action as a button; a warning line with an action is itself the button.
 *   The list is rebuilt only when the notices change, so an item under the mouse is never
 *   recreated mid-click.
 * - Events (bubble): g4-action { id, data } when an action is pressed.
 */
(() => {
    'use strict';

    // Component name: the custom element tag, the template id prefix, and the default test id prefix.
    const COMPONENT_NAME = 'g4-notice-list';

    // Banner text classes per tone.
    const TONE_CLASSES = { error: 'g4-notice-list__text--error', ok: 'g4-notice-list__text--ok' };

    /**
     * Narrows a notice value to text.
     *
     * @remarks
     * Compute-only. Text, numbers, and booleans are shown as text; anything else is shown as
     * nothing, so a notice never reads '[object Object]'.
     *
     * @param {unknown} value - Value from the page's notice data.
     * @returns {string} Text to show.
     */
    const convertToText = (value) => {
        const isPrimitive = ['string', 'number', 'boolean'].includes(typeof value);

        return isPrimitive ? String(value) : '';
    };

    /**
     * Notice list element.
     */
    class G4NoticeList extends HTMLElement {
        // Actions of the rendered notices, by item position.
        #actions = [];

        // The notices as JSON, to skip rebuilding when nothing changed.
        #noticesText = '';

        // Reports the pressed action.
        #onClick = (event) => {
            const actionElement = event.target.closest('[data-action-index]');
            const action = this.#actions[Number(actionElement?.dataset.actionIndex)];

            // Clicks on text without an action change nothing.
            if (!action) {
                return;
            }

            const detail = { data: action.data ?? null, id: action.id };

            this.dispatchEvent(new CustomEvent('g4-action', { bubbles: true, detail }));
        };

        /**
         * Sets the notices and rebuilds the list when they changed.
         *
         * @param {object[]} notices - Notices to show.
         */
        set notices(notices) {
            const list = Array.isArray(notices) ? notices : [];
            const text = JSON.stringify(list);

            // Unchanged notices keep their elements, so a click in progress is never lost.
            if (text === this.#noticesText) {
                return;
            }

            this.#noticesText = text;
            this.#render(list);
        }

        /**
         * Starts listening for actions and hides the empty list.
         */
        connectedCallback() {
            this.addEventListener('click', this.#onClick);

            // A list that never received notices takes no space.
            if (this.#noticesText === '') {
                this.hidden = true;
            }
        }

        /**
         * Stops listening while detached.
         */
        disconnectedCallback() {
            this.removeEventListener('click', this.#onClick);
        }

        /**
         * Builds one notice.
         *
         * @param {object} notice - Notice data.
         * @param {number} index - Notice position.
         * @returns {HTMLElement} The notice element.
         */
        #newNotice(notice, index) {
            const isWarning = this.getAttribute('variant') === 'warning';
            const warningTemplate = notice.action ? 'warning-button' : 'warning';
            const templateName = isWarning ? warningTemplate : 'banner';
            const template = document.getElementById(`${COMPONENT_NAME}-${templateName}-template`);
            const content = template.content.cloneNode(true);
            const element = content.querySelector('[data-part="notice"]');
            const text = content.querySelector('[data-part="text"]');
            const parts = Array.isArray(notice.parts) ? notice.parts : [{ text: notice.text }];

            // Text and code parts, in order; code parts are set in a monospace <code>.
            text.replaceChildren(...parts.map((part) => {
                if (!part.isCode) {
                    return document.createTextNode(convertToText(part.text));
                }

                const code = document.createElement('code');
                code.textContent = convertToText(part.text);
                return code;
            }));

            element.dataset.testId = notice.testId || `${this.getAttribute('test-id') || COMPONENT_NAME}-item`;

            // A warning line with an action is itself the button.
            if (isWarning) {
                if (notice.action) {
                    element.dataset.actionIndex = String(index);
                }

                return element;
            }

            // Banner: errors are announced, other banners are polite status.
            const actionButton = content.querySelector('[data-part="action"]');

            element.setAttribute('role', notice.tone === 'error' ? 'alert' : 'status');

            if (TONE_CLASSES[notice.tone]) {
                text.classList.add(TONE_CLASSES[notice.tone]);
            }

            // A banner action is a trailing button; a banner without one has none.
            if (!notice.action) {
                actionButton.remove();
                return element;
            }

            actionButton.textContent = convertToText(notice.action.label);
            actionButton.dataset.actionIndex = String(index);
            actionButton.dataset.testId = notice.action.testId || `${element.dataset.testId}-action-button`;

            return element;
        }

        /**
         * Rebuilds the list from the notices.
         *
         * @param {object[]} notices - Notices to show.
         */
        #render(notices) {
            // Remember each item's action, then show the items; an empty list takes no space.
            this.#actions = notices.map((notice) => notice.action ?? null);
            this.replaceChildren(...notices.map((notice, index) => this.#newNotice(notice, index)));
            this.hidden = notices.length === 0;
        }
    }

    if (!customElements.get(COMPONENT_NAME)) {
        customElements.define(COMPONENT_NAME, G4NoticeList);
    }
})();
