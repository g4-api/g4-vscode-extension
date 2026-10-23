/*
 * G4(TM) section component: <g4-section>.
 *
 * A foldable page section: chevron, title, and an optional warning in the header; a description,
 * the content, and an optional status line in the body. Clicking the header folds or unfolds it.
 *
 * Contract:
 * - Children: the section content (placed between the description and the status line);
 *   children with data-slot="header" go to the header, after the title (counts, a filter box).
 * - Attributes: section-title, description, open, flush (a body without padding, for content that
 *   brings its own), has-status (adds the status line), status and
 *   status-tone ('ok' | 'error' | none: the initial status), warning (short warning label in the
 *   header), warning-tooltip, test-id (prefix of every part's data-test-id).
 * - Properties: open.
 * - Methods: replaceContent(html) swaps the content and keeps everything else (fold state, status,
 *   scroll); setStatus(message, tone) writes the status line.
 * - Events (bubble): g4-toggle { open } after the user folds or unfolds the section.
 */
(() => {
    'use strict';

    // Component name: the custom element tag, the template id prefix, and the default test id prefix.
    const COMPONENT_NAME = 'g4-section';

    // Status line classes per tone.
    const STATUS_TONE_CLASSES = { error: 'g4-section__status--error', ok: 'g4-section__status--ok' };

    /**
     * Foldable section element.
     */
    class G4Section extends HTMLElement {
        // Attributes that update the rendered section when the page changes them.
        static observedAttributes = ['open', 'warning', 'warning-tooltip'];

        // Whether the template has been rendered into this element.
        #isRendered = false;

        // Folds or unfolds the section and tells the page; controls in the header (a filter box)
        // keep their clicks.
        #onHeaderClick = (event) => {
            if (event.target.closest('input, select, textarea, button, a')) {
                return;
            }

            this.open = !this.open;
            this.dispatchEvent(new CustomEvent('g4-toggle', { bubbles: true, detail: { open: this.open } }));
        };

        /**
         * Whether the section is unfolded.
         *
         * @returns {boolean} True when open.
         */
        get open() {
            return this.hasAttribute('open');
        }

        /**
         * Folds or unfolds the section (no event: the owner made the change).
         *
         * @param {boolean} isOpen - New state.
         */
        set open(isOpen) {
            this.toggleAttribute('open', isOpen === true);
        }

        /**
         * Updates the rendered section when an observed attribute changes.
         */
        attributeChangedCallback() {
            if (this.#isRendered) {
                this.#showState();
            }
        }

        /**
         * Renders the section once and moves the children into its body.
         */
        connectedCallback() {
            // An element moved in the page keeps its rendered parts and listeners.
            if (this.#isRendered) {
                return;
            }

            const children = [...this.childNodes];
            const content = this.#newContent();
            const description = content.querySelector('[data-part="description"]');
            const status = content.querySelector('[data-part="status"]');
            const descriptionText = this.getAttribute('description') ?? '';

            // Title and header clicks; the description is left out when empty.
            content.querySelector('[data-part="title"]').textContent = this.getAttribute('section-title') ?? '';
            content.querySelector('[data-part="header"]').addEventListener('click', this.#onHeaderClick);

            if (descriptionText === '') {
                description.remove();
            } else {
                description.textContent = descriptionText;
            }

            // Header extras go after the title; everything else is the content.
            const headerChildren = children.filter((child) => child.nodeType === Node.ELEMENT_NODE && child.dataset.slot === 'header');
            const bodyChildren = children.filter((child) => !headerChildren.includes(child));

            content.querySelector('[data-part="title"]').after(...headerChildren);
            status.before(...bodyChildren);

            if (this.hasAttribute('flush')) {
                content.querySelector('[data-part="body"]').classList.add('g4-section__body--flush');
            }

            if (!this.hasAttribute('has-status')) {
                status.remove();
            }

            // Show the section, then its initial status and fold state.
            this.replaceChildren(content);
            this.#isRendered = true;
            this.setStatus(this.getAttribute('status') ?? '', this.getAttribute('status-tone') ?? '');
            this.#showState();
        }

        /**
         * Swaps the section content for new markup; the fold state, description, and status stay.
         *
         * @param {string} html - New content markup.
         */
        replaceContent(html) {
            // Remove the old content but keep the description and the status line.
            const body = this.#getPart('body');
            const status = this.#getPart('status');
            const keptParts = new Set([this.#getPart('description'), status]);

            [...body.childNodes]
                .filter((node) => !keptParts.has(node))
                .forEach((node) => node.remove());

            // Parse the new markup and place it where the old content was.
            const template = document.createElement('template');
            template.innerHTML = html;

            if (status) {
                status.before(template.content);
            } else {
                body.append(template.content);
            }
        }

        /**
         * Writes the status line.
         *
         * @param {string} message - Status text; '' clears it.
         * @param {'ok' | 'error' | ''} [tone=''] - Status color.
         */
        setStatus(message, tone = '') {
            const status = this.#getPart('status');

            // A section without a status line has nothing to write.
            if (!status) {
                return;
            }

            // Replace the text and the color together, so an old color never stays.
            status.textContent = message ?? '';
            status.classList.remove(...Object.values(STATUS_TONE_CLASSES));

            if (STATUS_TONE_CLASSES[tone]) {
                status.classList.add(STATUS_TONE_CLASSES[tone]);
            }
        }

        /**
         * Returns one rendered part of this section (never of a nested element).
         *
         * @param {string} name - Part name (data-part).
         * @returns {HTMLElement | null} The part.
         */
        #getPart(name) {
            return this.querySelector(`:scope > [data-part="${name}"]`)
                ?? this.querySelector(`:scope > [data-part="header"] > [data-part="${name}"]`)
                ?? this.querySelector(`:scope > [data-part="body"] > [data-part="${name}"]`);
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
         * Applies the attributes to the rendered section: fold state and warning.
         */
        #showState() {
            const warning = this.getAttribute('warning') ?? '';
            const warningHolder = this.#getPart('warning');

            this.#getPart('chevron').classList.toggle('g4-section__chevron--open', this.open);
            this.#getPart('header').classList.toggle('g4-section__header--open', this.open);
            this.#getPart('body').classList.toggle('g4-section__body--collapsed', !this.open);

            // The warning holder is rebuilt only when its label changes.
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
        customElements.define(COMPONENT_NAME, G4Section);
    }
})();
