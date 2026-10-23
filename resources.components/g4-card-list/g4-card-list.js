/*
 * G4(TM) card list component: <g4-card-list>.
 *
 * A stack of <g4-card> elements with an add button (or an empty message). It marks the first and
 * last card (their move buttons are disabled) and turns its cards' move and remove buttons into
 * list events that carry every card's open state after the change, so the page can update its
 * data, render the list again, and give each card back its own state.
 *
 * Contract:
 * - Children: <g4-card> elements, in order.
 * - Attributes: add-label (default '+ Add'), empty-text, empty-style ('note': a bordered note;
 *   default: a muted line), test-id (prefix of every part's data-test-id).
 * - Properties: openStates (whether each card is open, in order).
 * - Methods: setOpenStates(states) opens or folds the cards in order.
 * - Events (bubble): g4-add; g4-move { from, to, openStates }; g4-remove { index, openStates }.
 *   openStates is in the order the cards will have after the change.
 */
(() => {
    'use strict';

    // Component name: the custom element tag, the template id prefix, and the default test id prefix.
    const COMPONENT_NAME = 'g4-card-list';

    // Add button text when the page does not set one.
    const DEFAULT_ADD_LABEL = '+ Add';

    /**
     * Card list element.
     */
    class G4CardList extends HTMLElement {
        // Whether the template has been rendered into this element.
        #isRendered = false;

        // Asks the page to add an item.
        #onAddClick = () => {
            this.dispatchEvent(new CustomEvent('g4-add', { bubbles: true }));
        };

        // Turns a card's move button into a list move, with the open states after the move.
        #onCardMove = (event) => {
            const from = this.#getCardIndex(event);

            // A card of a nested list belongs to that list.
            if (from === -1) {
                return;
            }

            // This list handles the card's request; outer lists never see it.
            event.stopPropagation();

            const openStates = this.openStates;
            const to = from + event.detail.offset;

            // The first card cannot move up and the last cannot move down.
            if (to < 0 || to >= openStates.length) {
                return;
            }

            // The open states follow the cards to their new places.
            [openStates[from], openStates[to]] = [openStates[to], openStates[from]];
            this.dispatchEvent(new CustomEvent('g4-move', { bubbles: true, detail: { from, openStates, to } }));
        };

        // Turns a card's trash button into a list remove, with the open states after the removal.
        #onCardRemove = (event) => {
            const index = this.#getCardIndex(event);

            // A card of a nested list belongs to that list.
            if (index === -1) {
                return;
            }

            // This list handles the card's request; outer lists never see it.
            event.stopPropagation();

            // The removed card's state goes; the others keep theirs, in their new positions.
            const openStates = this.openStates;

            openStates.splice(index, 1);
            this.dispatchEvent(new CustomEvent('g4-remove', { bubbles: true, detail: { index, openStates } }));
        };

        /**
         * Whether each card is open, in order.
         *
         * @returns {boolean[]} Open states.
         */
        get openStates() {
            return this.#getCards().map((card) => card.open);
        }

        /**
         * Renders the list once and moves the child cards into it.
         */
        connectedCallback() {
            // An element moved in the page keeps its rendered parts and listeners.
            if (this.#isRendered) {
                return;
            }

            this.#isRendered = true;

            const cards = [...this.children].filter((child) => child.localName === 'g4-card');
            const content = this.#newContent();
            const items = content.querySelector('[data-part="items"]');
            const add = content.querySelector('[data-part="add"]');

            // Mark the ends so their move buttons are disabled.
            cards.forEach((card, index) => {
                card.toggleAttribute('first', index === 0);
                card.toggleAttribute('last', index === cards.length - 1);
            });

            // The cards move into the list, or the empty message takes their place.
            if (cards.length === 0) {
                items.append(this.#newEmpty());
            } else {
                items.append(...cards);
            }

            // The add button and the cards' move and remove buttons all report as list events.
            add.textContent = this.getAttribute('add-label') || DEFAULT_ADD_LABEL;
            add.addEventListener('click', this.#onAddClick);
            this.addEventListener('g4-card-move', this.#onCardMove);
            this.addEventListener('g4-card-remove', this.#onCardRemove);
            this.replaceChildren(content);
        }

        /**
         * Opens or folds the cards in order.
         *
         * @param {boolean[]} states - Open state per card.
         */
        setOpenStates(states) {
            this.#getCards().forEach((card, index) => {
                card.open = states[index] === true;
            });
        }

        /**
         * Returns the position of the card that sent an event, when the card belongs to this list.
         *
         * @param {Event} event - Card event.
         * @returns {number} Card position, or -1 for a card of a nested list.
         */
        #getCardIndex(event) {
            const card = event.target;

            return card.closest('g4-card-list') === this ? this.#getCards().indexOf(card) : -1;
        }

        /**
         * Returns this list's cards (not the cards of nested lists).
         *
         * @returns {HTMLElement[]} Cards in order.
         */
        #getCards() {
            return [...this.querySelectorAll(':scope > [data-part="items"] > g4-card')];
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
         * Builds the empty message.
         *
         * @returns {DocumentFragment} The empty message markup.
         */
        #newEmpty() {
            const content = this.#newContent('-empty');
            const empty = content.querySelector('[data-part="empty"]');

            empty.textContent = this.getAttribute('empty-text') ?? '';

            // A note-style message is a bordered box; the default is a muted line.
            if (this.getAttribute('empty-style') === 'note') {
                empty.classList.add('g4-card-list__empty--note');
            }

            return content;
        }
    }

    if (!customElements.get(COMPONENT_NAME)) {
        customElements.define(COMPONENT_NAME, G4CardList);
    }
})();
