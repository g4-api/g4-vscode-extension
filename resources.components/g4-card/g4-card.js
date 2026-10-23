/*
 * G4(TM) card component: <g4-card>.
 *
 * A foldable item card in a list (a recorder machine, a repository, a parameter): chevron, title,
 * an optional warning, and move up / move down / trash buttons in the header; the content in the
 * body. Clicking the header (not its buttons) folds or unfolds the card.
 *
 * Contract:
 * - Children: the card content (placed in the body).
 * - Attributes: card-title, title-mono (monospace title), open, first and last (disable a move
 *   button; set by <g4-card-list>), item-label (names the card in tooltips, for example
 *   'machine 2'; default: the title), warning (short warning label in the header), warning-tooltip,
 *   test-id (prefix of every part's data-test-id).
 * - Properties: cardTitle, open.
 * - Events (bubble): g4-card-move { offset: -1 | 1 } and g4-card-remove (handled by
 *   <g4-card-list>); g4-toggle { open } after the user folds or unfolds the card.
 */
(() => {
    'use strict';

    // Component name: the custom element tag, the template id prefix, and the default test id prefix.
    const COMPONENT_NAME = 'g4-card';

    /**
     * Foldable card element.
     */
    class G4Card extends HTMLElement {
        // Attributes that update the rendered card when the page changes them.
        static observedAttributes = ['card-title', 'first', 'last', 'open', 'warning', 'warning-tooltip'];

        // Whether the template has been rendered into this element.
        #isRendered = false;

        // Header buttons move or remove the card; any other header click folds or unfolds it.
        #onHeaderClick = (event) => {
            const button = event.target.closest('[data-action]');
            const action = button?.dataset.action;

            // The trash button asks the card list to remove this card.
            if (action === 'remove') {
                this.dispatchEvent(new CustomEvent('g4-card-remove', { bubbles: true }));
                return;
            }

            // A move button asks the card list to move this card one place.
            if (action === 'move-up' || action === 'move-down') {
                const offset = action === 'move-up' ? -1 : 1;

                this.dispatchEvent(new CustomEvent('g4-card-move', { bubbles: true, detail: { offset } }));
                return;
            }

            // Any other header click folds or unfolds the card and tells the page.
            this.open = !this.open;
            this.dispatchEvent(new CustomEvent('g4-toggle', { bubbles: true, detail: { open: this.open } }));
        };

        /**
         * The card title.
         *
         * @returns {string} Title text.
         */
        get cardTitle() {
            return this.getAttribute('card-title') ?? '';
        }

        /**
         * Replaces the title (for example while the user types the name it comes from).
         *
         * @param {string} text - New title.
         */
        set cardTitle(text) {
            this.setAttribute('card-title', text ?? '');
        }

        /**
         * Whether the card is unfolded.
         *
         * @returns {boolean} True when open.
         */
        get open() {
            return this.hasAttribute('open');
        }

        /**
         * Folds or unfolds the card (no event: the owner made the change).
         *
         * @param {boolean} isOpen - New state.
         */
        set open(isOpen) {
            this.toggleAttribute('open', isOpen === true);
        }

        /**
         * Updates the rendered card when an observed attribute changes.
         */
        attributeChangedCallback() {
            if (this.#isRendered) {
                this.#showState();
            }
        }

        /**
         * Renders the card once and moves the children into its body.
         */
        connectedCallback() {
            // An element moved in the page keeps its rendered parts and listeners.
            if (this.#isRendered) {
                return;
            }

            const children = [...this.childNodes];
            const content = this.#newContent();

            // The page's content becomes the body; the header handles folding and the buttons.
            content.querySelector('[data-part="body"]').append(...children);
            content.querySelector('[data-part="header"]').addEventListener('click', this.#onHeaderClick);

            if (this.hasAttribute('title-mono')) {
                content.querySelector('[data-part="title"]').classList.add('g4-card__title--mono');
            }

            // Show the card, then apply its title, fold state, move limits, and warning.
            this.replaceChildren(content);
            this.#isRendered = true;
            this.#showState();
        }

        /**
         * Returns one rendered part of this card (never of a nested card).
         *
         * @param {string} name - Part name (data-part).
         * @returns {HTMLElement | null} The part.
         */
        #getPart(name) {
            return this.querySelector(`:scope > [data-part="${name}"]`)
                ?? this.querySelector(`:scope > [data-part="header"] [data-part="${name}"]`);
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

            // Every part gets a unique, descriptive test id under this element's prefix.
            content.querySelectorAll('[data-test-id]').forEach((element) => {
                element.dataset.testId = `${prefix}-${element.dataset.testId}`;
            });

            return content;
        }

        /**
         * Applies the attributes to the rendered card: title, fold state, move limits, and warning.
         */
        #showState() {
            const title = this.cardTitle;
            const itemLabel = this.getAttribute('item-label') || title || 'card';
            const warning = this.getAttribute('warning') ?? '';
            const warningHolder = this.#getPart('warning');

            // Names every button after the card, for screen readers and tooltips.
            const setButton = (part, label, isDisabled) => {
                const button = this.#getPart(part);

                button.title = label;
                button.setAttribute('aria-label', label);
                button.disabled = isDisabled;
            };

            this.#getPart('title').textContent = title;
            this.#getPart('chevron').classList.toggle('g4-card__chevron--open', this.open);
            this.#getPart('body').classList.toggle('g4-card__body--collapsed', !this.open);
            setButton('move-up', `Move ${itemLabel} up`, this.hasAttribute('first'));
            setButton('move-down', `Move ${itemLabel} down`, this.hasAttribute('last'));
            setButton('remove', `Remove ${itemLabel}`, false);

            // The warning holder is rebuilt only when its label changes, so it is never recreated
            // under the mouse while nothing changed.
            if (warningHolder.dataset.label !== warning) {
                warningHolder.dataset.label = warning;
                warningHolder.replaceChildren();

                if (warning !== '') {
                    const content = this.#newContent('-warning');
                    content.querySelector('[data-part="warning-label"]').textContent = warning;
                    warningHolder.append(content);
                }
            }

            warningHolder.title = this.getAttribute('warning-tooltip') ?? '';
        }
    }

    if (!customElements.get(COMPONENT_NAME)) {
        customElements.define(COMPONENT_NAME, G4Card);
    }
})();
