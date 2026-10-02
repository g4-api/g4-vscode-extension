/*
 * G4(TM) page header component: <g4-page-header>.
 *
 * The bar at the top of a page: the page title and one line of details under it, and optional
 * items (for example a badge) on the right.
 *
 * Contract:
 * - Children: items shown on the right end of the bar.
 * - Attributes: page-title, meta (details line; left out when empty), test-id (prefix of every
 *   part's data-test-id).
 */
(() => {
    'use strict';

    // Component name: the custom element tag, the template id prefix, and the default test id prefix.
    const COMPONENT_NAME = 'g4-page-header';

    /**
     * Page header element.
     */
    class G4PageHeader extends HTMLElement {
        // Whether the template has been rendered into this element.
        #isRendered = false;

        /**
         * Renders the header once.
         */
        connectedCallback() {
            // An element moved in the page keeps its rendered parts and listeners.
            if (this.#isRendered) {
                return;
            }

            this.#isRendered = true;

            const children = [...this.childNodes];
            const content = this.#newContent();
            const right = content.querySelector('[data-part="right"]');
            const meta = content.querySelector('[data-part="meta"]');
            const metaText = this.getAttribute('meta') ?? '';

            // Title, then the details line (left out when empty).
            content.querySelector('[data-part="title"]').textContent = this.getAttribute('page-title') ?? '';

            if (metaText === '') {
                meta.remove();
            } else {
                meta.textContent = metaText;
            }

            // Right-side items, or no right part at all.
            if (children.some((child) => child.nodeType === Node.ELEMENT_NODE)) {
                right.append(...children);
            } else {
                right.remove();
            }

            this.replaceChildren(content);
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

            // Every part gets a unique, descriptive test id under this element's prefix.
            content.querySelectorAll('[data-test-id]').forEach((element) => {
                element.dataset.testId = `${prefix}-${element.dataset.testId}`;
            });

            return content;
        }
    }

    if (!customElements.get(COMPONENT_NAME)) {
        customElements.define(COMPONENT_NAME, G4PageHeader);
    }
})();
