/*
 * G4(TM) select component: <g4-select>.
 *
 * A themed dropdown as high as the text boxes, drawn like <g4-toggle-dropdown>: a button that
 * shows the picked choice, and a list of plain choices that floats over the page under it. The
 * list is drawn by the page, not the operating system, so it follows the VS Code theme. It is a
 * manual popover, so it sits in the browser's top layer: it never pushes the page down, and no
 * scrolling section or modal clips it. It opens above the button when there is more room there.
 * Children (for example a refresh button) are placed after the button, on the same row.
 *
 * Keyboard: on the closed button, Up and Down pick the previous or next choice, and Enter, Space,
 * or Alt+Down open the list. In the open list, Up, Down, Home, and End move the highlight, Enter
 * or Space picks it, and Escape or Tab closes the list. Typing letters jumps to the first matching
 * choice. Escape is kept from the modal under the dropdown, so closing the list never closes a
 * dialog.
 *
 * Contract:
 * - Attributes: choices (JSON array of { value, text }), value (selected value), disabled, title
 *   (tooltip), label (accessible name when the dropdown is not in a <g4-field>), test-id (prefix of
 *   every part's data-test-id).
 * - Properties: value (the selected value).
 * - Methods: focus().
 * - Events (bubble): g4-input { value } when the user picks a choice.
 */
(() => {
    'use strict';

    // Component name: the custom element tag, the template id prefix, and the default test id prefix.
    const COMPONENT_NAME = 'g4-select';

    // Tallest the open list grows before it scrolls, the same as g4-toggle-dropdown.
    const PANEL_MAXIMUM_HEIGHT_PIXELS = 240;

    // Gap kept between the open list and the window edge, so the list never touches it.
    const PANEL_VIEWPORT_MARGIN_PIXELS = 8;

    // Characters of a choice value that are not allowed in a test id; each becomes a hyphen.
    // Linear: one negated character class, matched one character at a time.
    const TEST_ID_SEPARATOR_PATTERN = /[^a-z0-9]/gi;

    // Pause after which typed letters start a new search, the same feel as a native dropdown.
    const TYPE_AHEAD_RESET_MILLISECONDS = 600;

    // Counter that gives every dropdown on the page unique element ids for its list and options.
    // Module-level on purpose: ids must stay unique across every instance in the document.
    let instanceCount = 0;

    /**
     * Narrows a choice field to text.
     *
     * @remarks
     * Compute-only. Text, numbers, and booleans become text; anything else becomes '', so an option
     * never reads '[object Object]'.
     *
     * @param {unknown} value - Value from the page's choice data.
     * @returns {string} Text for the option.
     */
    const convertToText = (value) => {
        const isPrimitive = ['string', 'number', 'boolean'].includes(typeof value);

        return isPrimitive ? String(value) : '';
    };

    /**
     * Reads the choices attribute into clean { value, text } entries.
     *
     * @remarks
     * Compute-only. Unreadable JSON renders an empty dropdown rather than breaking the page, and a
     * choice without text shows its value, so no row is left without a label.
     *
     * @param {string | null} text - JSON text of the choices.
     * @returns {{ value: string, text: string }[]} The choices; [] when the text is not a JSON array.
     */
    const getChoices = (text) => {
        let items = [];

        try {
            const parsed = JSON.parse(text ?? '[]');

            items = Array.isArray(parsed) ? parsed : [];
        } catch {
            items = [];
        }

        return items.map((choice) => {
            const value = convertToText(choice?.value);

            return { value, text: convertToText(choice?.text) || value };
        });
    };

    /**
     * Single-pick dropdown element.
     */
    class G4Select extends HTMLElement {
        // Index of the highlighted row while the list is open; -1 when nothing is highlighted.
        #activeIndex = -1;

        // Choices read from the attribute when the dropdown renders.
        #choices = [];

        // Unique id prefix of this dropdown's list and option elements.
        #elementId = '';

        // Whether the template has been rendered into this element.
        #isRendered = false;

        // Letters typed in quick succession, matched against the start of the choice texts.
        #typeAheadText = '';

        // Timer that clears the typed letters after a pause.
        #typeAheadTimer = 0;

        // The picked value; '' when nothing is picked.
        #value = '';

        // Closes the list when the user presses anywhere outside the dropdown. Installed only while
        // the list is open, so a closed dropdown costs nothing.
        #onDocumentPointerDown = (event) => {
            if (this.contains(event.target)) {
                return;
            }

            this.#hidePanel();
        };

        // Closes the list when the focus leaves the dropdown (Tab, or a click elsewhere), so an
        // open list never stays behind a field the user moved to.
        #onFocusOut = (event) => {
            if (this.contains(event.relatedTarget)) {
                return;
            }

            this.#hidePanel();
        };

        // Routes a key to the closed-button or open-list behavior, so each state reads on its own.
        #onKeyDown = (event) => {
            const isFromTrigger = event.target === this.#getTrigger();

            // Keys on the page's own children (a refresh button) keep their usual meaning.
            if (!isFromTrigger) {
                return;
            }

            if (this.#testPanelOpen()) {
                this.#invokeOpenKey(event);
                return;
            }

            this.#invokeClosedKey(event);
        };

        // Picks the clicked row, closes the list, and returns the focus to the button.
        #onPanelClick = (event) => {
            const option = event.target.closest('[role="option"]');

            if (!option) {
                return;
            }

            this.#setPick({ value: option.dataset.value, isUserPick: true });
            this.#hidePanel();
            this.#getTrigger()?.focus();
        };

        // Keeps the focus on the button while a row is pressed, so the focusout listener does not
        // close the list before the click picks the row.
        #onPanelPointerDown = (event) => {
            event.preventDefault();
        };

        // Moves the highlight to the row under the mouse, so the mouse and the keyboard share one
        // highlight and Enter picks what the user sees.
        #onPanelPointerMove = (event) => {
            const option = event.target.closest('[role="option"]');

            if (!option) {
                return;
            }

            this.#setActiveIndex(Number(option.dataset.index));
        };

        // Opens or closes the list from the button.
        #onTriggerClick = () => {
            if (this.#testPanelOpen()) {
                this.#hidePanel();
                return;
            }

            this.#showPanel();
        };

        // Clears the typed letters after a pause in typing, so the next letter starts a new search.
        #onTypeAheadPause = () => {
            this.#typeAheadText = '';
        };

        // Keeps the floating list under its button while the page scrolls or the window resizes.
        // Scrolling inside the list itself does not move the button, so it is skipped.
        #onViewportChange = (event) => {
            if (event?.target === this.#getPanel()) {
                return;
            }

            this.#updatePanelPosition();
        };

        /**
         * The selected value.
         *
         * @returns {string} Value.
         */
        get value() {
            // Before the dropdown renders, the value waits in the attribute it renders from.
            if (!this.#isRendered) {
                return this.getAttribute('value') ?? '';
            }

            return this.#value;
        }

        /**
         * Selects a value (no g4-input: the owner made the change).
         *
         * @param {string} value - Value to select; a value that is not a choice clears the pick.
         */
        set value(value) {
            const text = convertToText(value);

            // Before the dropdown renders, the value waits in the attribute it renders from.
            if (!this.#isRendered) {
                this.setAttribute('value', text);
                return;
            }

            this.#setPick({ value: text, isUserPick: false });
        }

        /**
         * Renders the dropdown once, with the children after the button.
         */
        connectedCallback() {
            // A dropdown moved in the page keeps its parts and listeners.
            if (this.#isRendered) {
                return;
            }

            // Read the choices and the starting value before the markup is built from them. Like a
            // native dropdown, a value that is not a choice falls back to the first choice.
            const children = [...this.childNodes];
            const startValue = this.getAttribute('value') ?? '';

            this.#choices = getChoices(this.getAttribute('choices'));

            const firstValue = this.#choices[0]?.value ?? '';
            const isStartChoice = this.#choices.some((choice) => choice.value === startValue);

            this.#value = isStartChoice ? startValue : firstValue;
            this.#elementId = `${COMPONENT_NAME}-${++instanceCount}`;
            this.#isRendered = true;

            // Build the button and the list, then wire the button to the list for screen readers.
            const content = this.#newContent();
            const trigger = content.querySelector('[data-part="trigger"]');
            const panel = content.querySelector('[data-part="panel"]');
            const title = this.getAttribute('title');
            const fieldLabel = this.closest('g4-field')?.getAttribute('label');
            const accessibleName = fieldLabel || this.getAttribute('label');

            panel.id = `${this.#elementId}-list`;
            trigger.setAttribute('aria-controls', panel.id);

            if (accessibleName) {
                trigger.setAttribute('aria-label', accessibleName);
                panel.setAttribute('aria-label', accessibleName);
            }

            // The page's tooltip wins; without one, the button shows the picked text in full.
            if (title) {
                trigger.dataset.title = title;
            }

            // A dropdown without choices, or one the page disables, cannot open.
            const isPageDisabled = this.hasAttribute('disabled');
            const isEmpty = this.#choices.length === 0;

            trigger.disabled = isPageDisabled || isEmpty;

            // One plain row per choice.
            panel.append(...this.#newOptions());

            // Wire the button, the rows, and the keys; the outside-click listener waits for the list to open.
            trigger.addEventListener('click', this.#onTriggerClick);
            panel.addEventListener('click', this.#onPanelClick);
            panel.addEventListener('pointerdown', this.#onPanelPointerDown);
            panel.addEventListener('pointermove', this.#onPanelPointerMove);
            this.addEventListener('keydown', this.#onKeyDown);
            this.addEventListener('focusout', this.#onFocusOut);

            // The page's children (a refresh button) sit after the button, on its row.
            content.querySelector('[data-part="row"]').append(...children);

            // Show the markup, then write the button text and the selected row from the starting value.
            this.replaceChildren(content);
            this.#updatePick();
        }

        /**
         * Removes the document and window listeners and the typing timer when the dropdown leaves
         * the page. The browser closes a popover that leaves the page on its own.
         */
        disconnectedCallback() {
            this.#removePanelListeners();
            clearTimeout(this.#typeAheadTimer);
        }

        /**
         * Focuses the button.
         */
        focus() {
            this.#getTrigger()?.focus();
        }

        /**
         * Returns the index of the first choice whose text starts with the typed letters.
         *
         * @remarks
         * Compute-only over the choices. The search wraps around the list. One letter, or the same
         * letter typed again, starts after the current row, so it moves to the next choice with that
         * letter; a longer word starts at the current row, so the row stays while it still matches.
         *
         * @param {string} text - Typed letters, lower case.
         * @param {number} fromIndex - Index of the current row; -1 when there is none.
         * @returns {number} The matching index, or -1 when no choice matches.
         */
        #findTypeAheadIndex(text, fromIndex) {
            const count = this.#choices.length;

            // Repeating one letter cycles through the choices with that letter.
            const isRepeatedLetter = text.length > 1 && [...text].every((letter) => letter === text[0]);
            const searchText = isRepeatedLetter ? text[0] : text;

            // Without a current row the search starts at the first choice; otherwise a cycling
            // search skips the current row and a word search includes it.
            const isCycling = searchText.length === 1 || fromIndex < 0;
            const startOffset = isCycling ? 1 : 0;

            // Walk every choice once, wrapping past the end, and stop at the first text match so the
            // search is linear in the number of choices.
            for (let offset = startOffset; offset < count + startOffset; offset++) {
                const index = (fromIndex + offset + count) % count;
                const isMatch = this.#choices[index].text.toLowerCase().startsWith(searchText);

                if (isMatch) {
                    return index;
                }
            }

            return -1;
        }

        /**
         * Returns the rendered list.
         *
         * @returns {HTMLElement | null} The list.
         */
        #getPanel() {
            return this.querySelector(':scope > .g4-select__wrap > [data-part="panel"]');
        }

        /**
         * Returns the index of the picked choice.
         *
         * @returns {number} The index, or -1 when nothing is picked.
         */
        #getPickIndex() {
            return this.#choices.findIndex((choice) => choice.value === this.#value);
        }

        /**
         * Returns the test id prefix of this element's parts.
         *
         * @returns {string} The prefix.
         */
        #getTestIdPrefix() {
            return this.getAttribute('test-id') || COMPONENT_NAME;
        }

        /**
         * Returns the rendered button.
         *
         * @returns {HTMLButtonElement | null} The button.
         */
        #getTrigger() {
            return this.querySelector(':scope > .g4-select__wrap > .g4-select__row > [data-part="trigger"]');
        }

        /**
         * Closes the list, clears the highlight, and stops listening for outside clicks.
         */
        #hidePanel() {
            // Close the popover only when it is open; hiding a closed popover throws.
            if (this.#testPanelOpen()) {
                this.#getPanel().hidePopover();
            }

            // Mark the button closed, drop the listeners the open list needed, and clear the highlight.
            this.#getTrigger()?.setAttribute('aria-expanded', 'false');
            this.#removePanelListeners();
            this.#setActiveIndex(-1);
        }

        /**
         * Applies a key pressed on the closed button: the arrows step through the choices without
         * opening the list, as a native dropdown does, and Alt+Down opens it.
         *
         * @param {KeyboardEvent} event - The key event.
         */
        #invokeClosedKey(event) {
            // The steps are measured from the picked choice, the row the button shows.
            const pickIndex = this.#getPickIndex();
            const lastIndex = this.#choices.length - 1;

            // Alt+Down is the usual "open the list" key of a dropdown.
            if (event.key === 'ArrowDown' && event.altKey) {
                event.preventDefault();
                this.#showPanel();
                return;
            }

            // Arrows, Home, and End pick a neighbor or an end choice directly.
            const stepIndexes = {
                ArrowDown: Math.min(pickIndex + 1, lastIndex),
                ArrowUp: Math.max(pickIndex - 1, 0),
                End: lastIndex,
                Home: 0
            };

            if (event.key in stepIndexes) {
                event.preventDefault();
                this.#setPickIndex(stepIndexes[event.key]);
                return;
            }

            // A letter picks the next choice that starts with the typed text.
            const typedIndex = this.#readTypeAheadIndex(event, pickIndex);

            if (typedIndex >= 0) {
                this.#setPickIndex(typedIndex);
            }
        }

        /**
         * Applies a key pressed while the list is open: the keys move the highlight, and Enter or
         * Space picks it.
         *
         * @param {KeyboardEvent} event - The key event.
         */
        #invokeOpenKey(event) {
            const lastIndex = this.#choices.length - 1;

            // Escape closes the list and stays out of the modal under the dropdown.
            if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                this.#hidePanel();
                return;
            }

            // Tab closes the list and lets the focus move on as usual.
            if (event.key === 'Tab') {
                this.#hidePanel();
                return;
            }

            // Enter and Space pick the highlighted row; preventDefault keeps the button from also
            // seeing a click that would open the list again.
            const isPickKey = event.key === 'Enter' || event.key === ' ';

            if (isPickKey) {
                event.preventDefault();

                if (this.#activeIndex >= 0) {
                    this.#setPickIndex(this.#activeIndex);
                }

                this.#hidePanel();
                return;
            }

            // Arrows, Home, and End move the highlight without picking.
            const moveIndexes = {
                ArrowDown: Math.min(this.#activeIndex + 1, lastIndex),
                ArrowUp: Math.max(this.#activeIndex - 1, 0),
                End: lastIndex,
                Home: 0
            };

            if (event.key in moveIndexes) {
                event.preventDefault();
                this.#setActiveIndex(moveIndexes[event.key]);
                return;
            }

            // A letter moves the highlight to the next choice that starts with the typed text.
            const typedIndex = this.#readTypeAheadIndex(event, this.#activeIndex);

            if (typedIndex >= 0) {
                this.#setActiveIndex(typedIndex);
            }
        }

        /**
         * Clones the template and prefixes every part's test id with this element's test-id.
         *
         * @returns {DocumentFragment} The markup.
         */
        #newContent() {
            const template = document.getElementById(`${COMPONENT_NAME}-template`);
            const content = template.content.cloneNode(true);
            const prefix = this.#getTestIdPrefix();

            // Every part gets a unique, descriptive test id under this dropdown's prefix.
            content.querySelectorAll('[data-test-id]').forEach((element) => {
                element.dataset.testId = `${prefix}-${element.dataset.testId}`;
            });

            return content;
        }

        /**
         * Builds the list rows: one plain text row per choice.
         *
         * @remarks
         * Compute-only over the choices. Each row keeps its choice value and index in data
         * attributes, so a click or a key is matched to its choice without searching by text.
         *
         * @returns {HTMLElement[]} The rows.
         */
        #newOptions() {
            const prefix = this.#getTestIdPrefix();

            return this.#choices.map((choice, index) => {
                const option = document.createElement('div');
                const slug = choice.value.replaceAll(TEST_ID_SEPARATOR_PATTERN, '-');

                option.id = `${this.#elementId}-option-${index}`;
                option.className = 'g4-select__option';
                option.dataset.index = String(index);
                option.dataset.testId = `${prefix}-option-${slug}`;
                option.dataset.value = choice.value;
                option.setAttribute('aria-selected', 'false');
                option.setAttribute('role', 'option');
                option.textContent = choice.text;

                return option;
            });
        }

        /**
         * Adds a typed letter to the search text and finds the choice it matches.
         *
         * @remarks
         * Owns the typing timer: the typed text is cleared after a pause, so a new word starts a
         * new search. Keys with a modifier, and keys that are not single characters, are ignored.
         *
         * @param {KeyboardEvent} event - The key event.
         * @param {number} fromIndex - Index the search starts after.
         * @returns {number} The matching index, or -1 when the key is not a letter or nothing matches.
         */
        #readTypeAheadIndex(event, fromIndex) {
            // Only a plain printable key (not Space, which picks) on a dropdown with choices searches.
            const isModified = event.altKey || event.ctrlKey || event.metaKey;
            const isCharacter = event.key.length === 1 && event.key !== ' ';
            const isEmpty = this.#choices.length === 0;
            const isIgnoredKey = isModified || !isCharacter || isEmpty;

            if (isIgnoredKey) {
                return -1;
            }

            // Extend the typed text and restart the pause timer that clears it, so a new word
            // starts a new search.
            event.preventDefault();
            this.#typeAheadText += event.key.toLowerCase();
            clearTimeout(this.#typeAheadTimer);
            this.#typeAheadTimer = setTimeout(this.#onTypeAheadPause, TYPE_AHEAD_RESET_MILLISECONDS);

            // When the typed word matches nothing, start a new search from the last letter, as a
            // native dropdown does, so a quick second letter still jumps.
            const wordIndex = this.#findTypeAheadIndex(this.#typeAheadText, fromIndex);
            const isFinalSearch = wordIndex >= 0 || this.#typeAheadText.length === 1;

            if (isFinalSearch) {
                return wordIndex;
            }

            this.#typeAheadText = event.key.toLowerCase();

            return this.#findTypeAheadIndex(this.#typeAheadText, fromIndex);
        }

        /**
         * Removes the listeners that only an open list needs: the outside press, and the page
         * scroll and window resize that move the list with its button.
         */
        #removePanelListeners() {
            document.removeEventListener('pointerdown', this.#onDocumentPointerDown);
            globalThis.removeEventListener('scroll', this.#onViewportChange, true);
            globalThis.removeEventListener('resize', this.#onViewportChange);
        }

        /**
         * Moves the highlight to a row and scrolls it into view.
         *
         * @param {number} index - Row index; -1 clears the highlight.
         */
        #setActiveIndex(index) {
            const panel = this.#getPanel();
            const trigger = this.#getTrigger();

            // A dropdown that has not rendered has no rows to highlight.
            if (!panel || !trigger) {
                return;
            }

            // Record the highlight first, so Enter picks the row the user now sees.
            this.#activeIndex = index;

            // Exactly one row carries the highlight class.
            panel.querySelectorAll('[role="option"]').forEach((option) => {
                option.classList.toggle('g4-select__option--active', Number(option.dataset.index) === index);
            });

            // The button names the highlighted row for screen readers, or names none when cleared.
            const activeOption = panel.querySelector('.g4-select__option--active');

            if (!activeOption) {
                trigger.removeAttribute('aria-activedescendant');
                return;
            }

            trigger.setAttribute('aria-activedescendant', activeOption.id);
            activeOption.scrollIntoView({ block: 'nearest' });
        }

        /**
         * Picks a value and refreshes the button and the rows.
         *
         * @remarks
         * The only place the pick changes. A user pick that changes the value reports g4-input; an
         * owner's change through the value property, or a pick of the same value, stays silent.
         *
         * @param {{ value: string, isUserPick: boolean }} options - The value, and whether the user picked it.
         */
        #setPick(options) {
            const { value, isUserPick } = options;

            // A value that is not a choice clears the pick, as a native dropdown does.
            const isChoice = this.#choices.some((choice) => choice.value === value);
            const nextValue = isChoice ? value : '';
            const isChanged = nextValue !== this.#value;

            // Store the pick, then move the button text and the selected row to match it.
            this.#value = nextValue;
            this.#updatePick();

            // Only a real change made by the user is reported to the page.
            const isReported = isUserPick && isChanged;

            if (isReported) {
                this.dispatchEvent(new CustomEvent('g4-input', { bubbles: true, detail: { value: this.#value } }));
            }
        }

        /**
         * Picks the choice at an index as a user pick.
         *
         * @param {number} index - Choice index.
         */
        #setPickIndex(index) {
            const choice = this.#choices[index];

            if (!choice) {
                return;
            }

            this.#setPick({ value: choice.value, isUserPick: true });
        }

        /**
         * Opens the list under the button with the picked row highlighted, and starts listening for
         * outside clicks, page scrolls, and window resizes.
         */
        #showPanel() {
            const panel = this.#getPanel();

            // A dropdown that has not rendered has no list to open.
            if (!panel) {
                return;
            }

            // Show the popover first, so the list has a size to place it by, then put it under the button.
            panel.showPopover();
            this.#updatePanelPosition();
            this.#getTrigger()?.setAttribute('aria-expanded', 'true');

            // While open, an outside press closes the list, and scrolling or resizing moves it with the button.
            document.addEventListener('pointerdown', this.#onDocumentPointerDown);
            globalThis.addEventListener('scroll', this.#onViewportChange, true);
            globalThis.addEventListener('resize', this.#onViewportChange);

            this.#setActiveIndex(Math.max(this.#getPickIndex(), 0));
        }

        /**
         * Tests whether the list is open.
         *
         * @returns {boolean} True while the list shows.
         */
        #testPanelOpen() {
            const panel = this.#getPanel();

            return panel !== null && panel.matches(':popover-open');
        }

        /**
         * Places the open list under its button, or above it when there is more room there.
         *
         * @remarks
         * Owns the list's position: the list is a popover in the top layer, so it is placed in
         * window coordinates from the button's box. The list is as wide as the button, at most
         * PANEL_MAXIMUM_HEIGHT_PIXELS high, and never taller than the room on its side. A button
         * scrolled out of the window closes the list, so it never floats away from its button.
         */
        #updatePanelPosition() {
            const panel = this.#getPanel();
            const trigger = this.#getTrigger();

            // Only an open list has a place to update.
            const isRendered = panel !== null && trigger !== null;

            if (!isRendered || !this.#testPanelOpen()) {
                return;
            }

            // A button that left the window takes its list with it.
            const triggerBox = trigger.getBoundingClientRect();
            const isTriggerOutside = triggerBox.bottom < 0 || triggerBox.top > globalThis.innerHeight;

            if (isTriggerOutside) {
                this.#hidePanel();
                return;
            }

            // Match the button's width, then measure the list at its full height.
            panel.style.left = `${triggerBox.left}px`;
            panel.style.width = `${triggerBox.width}px`;
            panel.style.maxHeight = `${PANEL_MAXIMUM_HEIGHT_PIXELS}px`;

            const panelHeight = panel.offsetHeight;
            const spaceBelow = globalThis.innerHeight - triggerBox.bottom - PANEL_VIEWPORT_MARGIN_PIXELS;
            const spaceAbove = triggerBox.top - PANEL_VIEWPORT_MARGIN_PIXELS;

            // Open upward only when the list does not fit below and there is more room above.
            const isAbove = panelHeight > spaceBelow && spaceAbove > spaceBelow;
            const roomHeight = isAbove ? spaceAbove : spaceBelow;
            const shownHeight = Math.min(panelHeight, roomHeight);
            const top = isAbove
                ? triggerBox.top - shownHeight
                : triggerBox.bottom;

            // Fit the list into its room and attach it to the button's matching edge.
            panel.style.maxHeight = `${Math.min(PANEL_MAXIMUM_HEIGHT_PIXELS, roomHeight)}px`;
            panel.style.top = `${top}px`;
            panel.classList.toggle('g4-select__panel--above', isAbove);
        }

        /**
         * Writes the button text, the tooltip, and the selected row for the current pick.
         */
        #updatePick() {
            const trigger = this.#getTrigger();
            const summary = trigger?.querySelector('[data-part="summary"]');

            // A dropdown that has not rendered keeps its value in the attribute until it does.
            if (!trigger || !summary) {
                return;
            }

            // The button shows the picked text; the page's tooltip wins over the text as tooltip.
            const pickText = this.#choices[this.#getPickIndex()]?.text ?? '';

            summary.textContent = pickText;
            trigger.title = trigger.dataset.title || pickText;

            // Exactly one row is marked as the selected one.
            this.#getPanel()?.querySelectorAll('[role="option"]').forEach((option) => {
                const isSelected = option.dataset.value === this.#value;

                option.setAttribute('aria-selected', String(isSelected));
                option.classList.toggle('g4-select__option--selected', isSelected);
            });
        }
    }

    if (!customElements.get(COMPONENT_NAME)) {
        customElements.define(COMPONENT_NAME, G4Select);
    }
})();
