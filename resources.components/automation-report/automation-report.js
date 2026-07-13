// Creates a small circular LED/status icon.
        const LED = (fill) => `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" width="10" height="10">
            <path fill="${fill}" d="M64 320C64 178.6 178.6 64 320 64C461.4 64 576 178.6 576 320C576 461.4 461.4 576 320 576C178.6 576 64 461.4 64 320z"/>
        </svg>`;

        const SVG_CHEVRON = `
        <svg class="chev-r" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" width="13" height="13">
            <path fill="currentColor" d="M441.3 299.8C451.5 312.4 450.8 330.9 439.1 342.6L311.1 470.6C301.9 479.8 288.2 482.5 276.2 477.5C264.2 472.5 256.5 460.9 256.5 448L256.5 192C256.5 179.1 264.3 167.4 276.3 162.4C288.3 157.4 302 160.2 311.2 169.3L439.2 297.3L441.4 299.7z"/>
        </svg>
        <svg class="chev-d" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" width="13" height="13">
            <path fill="currentColor" d="M300.3 440.8C312.9 451 331.4 450.3 343.1 438.6L471.1 310.6C480.3 301.4 483 287.7 478 275.7C473 263.7 461.4 256 448.5 256L192.5 256C179.6 256 167.9 263.8 162.9 275.8C157.9 287.8 160.7 301.5 169.9 310.6L297.9 438.6L300.3 440.8z"/>
        </svg>`;

/**
         * Escapes a value so it can be safely rendered as HTML text or inside
         * double-quoted HTML attributes.
         *
         * Behavior:
         * - Converts null or undefined values into an empty string.
         * - Converts all other values into strings.
         * - Escapes HTML-sensitive characters:
         *   - & becomes &amp;
         *   - < becomes &lt;
         *   - > becomes &gt;
         *   - " becomes &quot;
         *
         * @param {*} s - The value to escape.
         * @returns {string} The escaped HTML-safe string.
         */
        function clearString(s) {
            // Convert null/undefined to an empty string, then normalize to string.
            return String(s ?? '')

                // Escape ampersand first so we do not double-break generated entities.
                .replaceAll('&', '&amp;')

                // Escape opening angle brackets to prevent HTML tag injection.
                .replaceAll('<', '&lt;')

                // Escape closing angle brackets for safe HTML rendering.
                .replaceAll('>', '&gt;')

                // Escape double quotes so the value is safe in double-quoted attributes.
                .replaceAll('"', '&quot;');
        }

        /**
         * Converts .NET ticks into milliseconds.
         *
         * A .NET tick is 100 nanoseconds.
         * There are 10,000 ticks in 1 millisecond.
         *
         * @param {number} ticks - The tick value to convert.
         * @returns {number} The equivalent value in milliseconds.
         */
        function convertToMilliseconds(ticks) {
            // Convert ticks to milliseconds.
            return ticks / 10000;
        }

        /**
         * Filters the plugin tree by plugin name and keeps matching branches visible.
         *
         * Behavior:
         * - Finds the tree root by stage/session id.
         * - Normalizes the search query to lowercase.
         * - Processes plugin nodes from leaves to parents.
         * - Shows nodes that match the query.
         * - Shows parent nodes when one of their descendants matches.
         * - Expands matching branches so nested matches are visible.
         *
         * @param {string} sid - The stage/session id suffix used to locate the tree root.
         * @param {string} query - The text used to filter plugin nodes.
         */
        function filterTree(sid, query) {
            // Resolve the tree root for the selected stage/session.
            const root = document.getElementById('tr-' + sid);

            // If the tree root does not exist, there is nothing to filter.
            if (!root) {
                return;
            }

            // Normalize the search query for case-insensitive matching.
            const q = String(query ?? '').trim().toLowerCase();

            // Process leaves first, using reverse document order.
            // This lets parent nodes check whether their descendants are still visible.
            const nodes = Array
                .from(root.querySelectorAll('.p-node'))
                .reverse();

            // Evaluate each plugin node against the filter query.
            for (const node of nodes) {
                // Check whether the current node matches the query.
                const self = (node.dataset.name || '').includes(q);

                // Check whether any descendant plugin node is currently visible.
                const hasMatchingDescendant = Array
                    .from(node.querySelectorAll('.p-node'))
                    .some(descendant => !descendant.classList.contains('is-filter-hidden'));

                // Show this node when:
                // - The query is empty.
                // - The node itself matches.
                // - One of its descendants matches.
                const isShow = !q || self || hasMatchingDescendant;

                // Apply the visibility result.
                node.classList.toggle('is-filter-hidden', !isShow);

                // When a descendant matches, expand this node so the match is visible.
                if (q && hasMatchingDescendant) {
                    // Resolve the direct child plugin container for this node.
                    const nestedElements = node.querySelector(':scope > .p-children');

                    // If this node has no direct nested container, continue to the next node.
                    if (!nestedElements) {
                        continue;
                    }

                    // Expand the nested child container.
                    nestedElements.classList.remove('hidden');

                    // Resolve the matching chevron icon from the child container id.
                    // Example: ck-p1 -> p1 -> ci-p1
                    const icon = document.getElementById(
                        'ci-' + nestedElements.id.slice(3)
                    );

                    // Mark the chevron as open when available.
                    if (icon) {
                        icon.classList.add('open');
                    }
                }
            }
        }

        /**
         * Finds machine/session information from a report stage collection.
         *
         * Behavior:
         * - Iterates over all stages.
         * - Iterates over all jobs inside each stage.
         * - Flattens each job's plugin tree.
         * - Searches plugin extractions for session metadata.
         * - Returns the first session that contains a machine name.
         * - Returns null when no machine information is found.
         *
         * @param {Array<object>|null|undefined} stages - The report stages to search.
         * @returns {object|null} The first session object containing machine information, or null.
         */
        function findMachineInformation(stages) {
            // Iterate over each stage in the report.
            // If stages is null/undefined, use an empty array.
            for (const stage of (stages || [])) {
                // Iterate over each job in the current stage.
                for (const job of (stage.jobs || [])) {
                    // Flatten the job plugin tree so nested plugins are searched too.
                    for (const plugin of groupPlugins(job.plugins)) {
                        // Check all extraction results produced by the plugin.
                        for (const extraction of (plugin?.extractions || [])) {
                            // Return the first session that contains machine information.
                            if (extraction.session?.machineName) {
                                return extraction.session;
                            }
                        }
                    }
                }
            }

            // No machine/session information was found.
            return null;
        }

        /**
         * Formats a byte value into a readable text value.
         *
         * Behavior:
         * - Returns an em dash when the byte value is missing.
         * - Displays values smaller than 1024 as bytes.
         * - Displays values of 1024 bytes or higher as kilobytes.
         *
         * @param {number|null|undefined} bytes - The byte value to format.
         * @returns {string} A human-readable byte size string.
         */
        function formatBytes(bytes) {
            // No byte value was provided.
            if (bytes == null) {
                return 'â€”';
            }

            // Display values of 1024 bytes or more as kilobytes.
            if (bytes >= 1024) {
                return (bytes / 1024).toFixed(1) + ' KB';
            }

            // Display small values as raw bytes.
            return bytes + ' B';
        }

        /**
         * Formats a duration value from .NET ticks into a readable text value.
         *
         * Behavior:
         * - Returns an em dash when the duration is missing.
         * - Converts ticks into milliseconds.
         * - Displays seconds when the duration is 1000 ms or higher.
         * - Displays whole milliseconds when the duration is at least 1 ms.
         * - Displays "< 1 ms" for very small durations.
         *
         * @param {number|null|undefined} ticks - Duration value in .NET ticks.
         * @returns {string} A human-readable duration string.
         */
        function formatDuration(ticks) {
            // No duration value was provided.
            if (ticks == null) {
                return 'â€”';
            }

            // Convert .NET ticks into milliseconds.
            const m = convertToMilliseconds(ticks);

            // Display long durations in seconds.
            if (m >= 1000) {
                return (m / 1000).toFixed(2) + ' s';
            }

            // Display normal durations in whole milliseconds.
            if (m >= 1) {
                return m.toFixed(0) + ' ms';
            }

            // Display very small durations below 1 millisecond.
            return '< 1 ms';
        }

        /**
         * Formats an ISO date/time value into a readable local date/time string.
         *
         * Behavior:
         * - Returns an em dash when the value is missing.
         * - Parses the provided ISO date/time string.
         * - Formats the date/time using the user's current locale.
         * - Uses medium date and medium time formatting.
         *
         * @param {string|null|undefined} iso - The ISO date/time value to format.
         * @returns {string} A human-readable local date/time string.
         */
        function formatDateTime(iso) {
            // No date/time value was provided.
            if (!iso) {
                return 'â€”';
            }

            // Convert the ISO string into a Date and format it using the local locale.
            return new Date(iso).toLocaleString(
                undefined,
                {
                    dateStyle: 'medium',
                    timeStyle: 'medium'
                }
            );
        }

        /**
         * Formats an ISO date/time value into a local time string.
         *
         * Behavior:
         * - Returns an em dash when the value is missing.
         * - Parses the provided ISO date/time string.
         * - Formats the time using 24-hour format.
         * - Includes hours, minutes, seconds, and milliseconds.
         *
         * @param {string|null|undefined} iso - The ISO date/time value to format.
         * @returns {string} A human-readable local time string.
         */
        function formatTime(iso) {
            // No time value was provided.
            if (!iso) {
                return 'â€”';
            }

            // Convert the ISO string into a Date and format only the time portion.
            return new Date(iso).toLocaleTimeString(
                'en-US',
                {
                    // Use 24-hour time instead of AM/PM.
                    hour12: false,

                    // Always show two-digit hours, minutes, and seconds.
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',

                    // Include milliseconds in the formatted time.
                    fractionalSecondDigits: 3
                }
            );
        }

        /**
         * Gets the plugin type from a plugin report object.
         *
         * @param {object|null|undefined} plugin - The plugin object to inspect.
         * @returns {string} The resolved plugin type.
         */
        function getPluginType(plugin) {
            // Resolve the plugin type from the performance point reference metadata.
            // Default to "Action" when the type is missing or unavailable.
            return plugin?.performancePoint?.reference?.type || 'Action';
        }

        /**
         * Collects assertion/extraction entities from a nested plugin tree.
         *
         * Behavior:
         * - Iterates over each plugin.
         * - Reads extraction entities from `plugin.extractions`.
         * - Adds each entity as a flat assertion object.
         * - Includes the entity content, source element, and extraction session.
         * - Recursively processes child plugins from `plugin.plugins`.
         *
         * @param {Array<object>|null|undefined} plugins - The plugin collection to scan.
         * @param {Array<object>} out - The output array used to collect assertions.
         * @returns {Array<object>} A flat list of assertion/extraction results.
         */
        function groupAssertions(plugins, out = []) {
            // Iterate over the current plugin level.
            // If plugins is null/undefined, use an empty array.
            for (const plugin of (plugins || [])) {
                // Iterate over all extractions created by the current plugin.
                for (const extraction of (plugin.extractions || [])) {
                    // Iterate over all entities found in the current extraction.
                    for (const entity of (extraction.entities || [])) {
                        // Add a normalized assertion item to the flat output list.
                        out.push({
                            // Extracted entity content.
                            content: entity?.content || {},

                            // The element/locator from the plugin rule, if available.
                            onElement: plugin?.rule?.onElement || '',

                            // Session metadata associated with the extraction.
                            session: extraction?.session
                        });
                    }
                }

                // Recursively collect assertions from child plugins.
                groupAssertions(plugin.plugins, out);
            }

            // Return the accumulated assertion list.
            return out;
        }

        /**
         * Flattens a nested plugin tree into a single plugin list.
         *
         * Behavior:
         * - Iterates over the provided plugin collection.
         * - Adds each plugin to the output array.
         * - Recursively adds child plugins from `plugin.plugins`.
         * - Returns the same output array so callers can reuse or extend it.
         *
         * @param {Array<object>|null|undefined} plugins - The plugin collection to flatten.
         * @param {Array<object>} out - The output array used to collect flattened plugins.
         * @returns {Array<object>} A flat list of all plugins.
         */
        function groupPlugins(plugins, out = []) {
            // Iterate over the current plugin level.
            // If plugins is null/undefined, use an empty array.
            for (const plugin of (plugins || [])) {
                // Add the current plugin to the flat output list.
                out.push(plugin);

                // Recursively add any child plugins owned by this plugin.
                groupPlugins(plugin?.plugins, out);
            }

            // Return the accumulated flat plugin list.
            return out;
        }

        /**
         * Resolves the report schema type and returns the object that should be used
         * as the report root.
         *
         * Supported shapes:
         * - Response schema: root object contains `sessions`.
         * - Wrapped response schema: first object value contains `sessions`.
         * - Request schema: root object contains `stages[0].jobs[0].rules`.
         * - Unknown schema: fallback when the structure does not match known formats.
         *
         * @param {object|null|undefined} data - The parsed report/request data.
         * @returns {{ type: string, root: object }} The resolved schema type and root object.
         */
        function resolveSchema(data) {
            // Response schema:
            // The object itself contains sessions, so it is already the report root.
            if (data?.sessions) {
                return {
                    type: 'response',
                    root: data
                };
            }

            // Some responses may be wrapped under a dynamic top-level key.
            // Example:
            // {
            //   "some-id": {
            //     "sessions": [...]
            //   }
            // }
            const values = Object.values(data || {});

            // Wrapped response schema:
            // Use the first object value as the report root when it contains sessions.
            if (values.length && values[0]?.sessions) {
                return {
                    type: 'response',
                    root: values[0]
                };
            }

            // Request schema:
            // Automation request data usually contains stages, jobs, and rules.
            if (data?.stages?.[0]?.jobs?.[0]?.rules) {
                return {
                    type: 'request',
                    root: data
                };
            }

            // Unknown schema:
            // Return the original data when available, otherwise use an empty object.
            return {
                type: 'unknown',
                root: data || {}
            };
        }

        /**
         * Truncates a value to a maximum number of characters.
         *
         * Behavior:
         * - Converts null or undefined values into an empty string.
         * - Converts all other values into strings.
         * - Returns the original string when it is within the requested length.
         * - Cuts the string and appends an ellipsis when it exceeds the limit.
         *
         * @param {*} s - The value to truncate.
         * @param {number} maxLength - The maximum number of characters to keep before adding the ellipsis.
         * @returns {string} The original or truncated string.
         */
        function setTruncates(s, maxLength) {
            // Convert null/undefined to an empty string, then normalize to string.
            s = String(s ?? '');

            // If the string is longer than the allowed length, cut it and append ellipsis.
            return s.length > maxLength
                ? s.slice(0, maxLength) + 'â€¦'
                : s;
        }

        /**
         * Resolves a bounded CSS depth class suffix for nested report rows.
         *
         * @param {number} depth - The source tree depth.
         * @returns {number} A depth value between 0 and 12.
         */
        function getDepthClass(depth) {
            // Normalize invalid values to the root depth class.
            const parsedDepth = Number(depth);

            if (!Number.isFinite(parsedDepth) || parsedDepth < 0) {
                return 0;
            }

            // Keep generated class names inside the CSS range.
            return Math.min(12, Math.floor(parsedDepth));
        }

        /**
         * Toggles the visibility of an HTML element and updates its icon state.
         *
         * Behavior:
         * - Finds the target element by id.
         * - Finds the optional icon element by icon id.
         * - Hides the target element when it is currently visible.
         * - Shows the target element when it is currently hidden.
         * - Adds or removes the `open` class on the icon to match the visible state.
         *
         * @param {string} id - The id of the element to show or hide.
         * @param {string} iconId - The id of the icon element to update.
         */
        function toggleElement(id, iconId) {
            // Resolve the target element that should be toggled.
            const element = document.getElementById(id);

            // Resolve the optional icon that visually represents the toggle state.
            const icon = document.getElementById(iconId);

            // If the target element does not exist, there is nothing to toggle.
            if (!element) {
                return;
            }

        // The element should be hidden when it is currently visible.
        const isHide = !element.classList.contains('is-collapsed');

        // Toggle the element display state.
        element.classList.toggle('is-collapsed', isHide);

            // If no icon exists, only the element visibility is toggled.
            if (!icon) {
                return;
            }

            // Update the icon open state.
            // When hiding the element, remove "open".
            // When showing the element, add "open".
            isHide
                ? icon.classList.remove('open')
                : icon.classList.add('open');
        }

        /**
         * Toggles a plugin node's child plugin container and updates its chevron icon.
         *
         * Behavior:
         * - Finds the child plugin container by id using the `ck-` prefix.
         * - Finds the matching chevron icon by id using the `ci-` prefix.
         * - Expands the child container when it is currently collapsed.
         * - Collapses the child container when it is currently expanded.
         * - Adds or removes the `open` class on the icon to match the expanded state.
         *
         * @param {string} id - The plugin node id suffix.
         */
        function togglePlugin(id) {
            // Resolve the child plugin container.
            const children = document.getElementById('ck-' + id);

            // Resolve the chevron icon used to show expanded/collapsed state.
            const icon = document.getElementById('ci-' + id);

            // If the child container does not exist, there is nothing to toggle.
            if (!children) {
                return;
            }

            // The plugin is collapsed when the children container has the hidden class.
            const isCollapsed = children.classList.contains('hidden');

            // If it was collapsed, show it.
            // If it was expanded, hide it.
            children.classList.toggle('hidden', !isCollapsed);

            // If no icon exists, only the children container is toggled.
            if (!icon) {
                return;
            }

            // Update the chevron visual state.
            // Expanded = open class exists.
            // Collapsed = open class removed.
            isCollapsed
                ? icon.classList.add('open')
                : icon.classList.remove('open');
        }

const DATA = JSON.parse(document.getElementById('g4-data').value);

/**
         * Renders the top-level report summary cards.
         *
         * Behavior:
         * - Flattens all jobs from the stage collection.
         * - Flattens all plugins/actions from each job.
         * - Collects assertion results from each job.
         * - Counts failed assertions and exceptions.
         * - Calculates average action runtime.
         * - Calculates total runtime spent on timeout-related actions.
         * - Returns the summary cards as an HTML string.
         *
         * @param {object} performancePoint - The main report performance point.
         * @param {Array<object>} stages - The report stages to summarize.
         * @returns {string} HTML markup for the summary cards.
         */
        function writeCards(performancePoint, stages) {
            // Flatten all jobs from all stages.
            const jobs = stages.flatMap(stage => stage.jobs || []);

            // Flatten all plugins/actions from all jobs, including nested plugins.
            const plugins = jobs.flatMap(job => groupPlugins(job.plugins));

            // Collect all assertion/extraction entities from all jobs.
            const asserts = jobs.flatMap(job => groupAssertions(job.plugins));

            // Count assertions where the evaluation result explicitly failed.
            const fails = asserts
                .filter(assert => assert.content?.Evaluation === false)
                .length;

            // Count all exceptions found across all plugins/actions.
            const exceptions = plugins.reduce(
                (sum, p) => sum + (p.exceptions || []).length,
                0
            );

            // Calculate average runtime per plugin/action.
            const averageRuntime = plugins.length > 0
                ? performancePoint.runTime / plugins.length
                : null;

            // Sum runtime for plugins/actions that contain timeout-related exceptions.
            const timeouts = plugins
                .filter(plugin =>
                    (plugin.exceptions || []).some(exception =>
                        (exception.type || '').includes('Timeout')
                    )
                )
                .reduce(
                    (sum, plugin) => sum + (plugin.performancePoint?.runTime || 0),
                    0
                );

            // Build the card model used by the HTML template.
            const items = [
                { label: 'Total Runtime', value: formatDuration(performancePoint.runTime) },
                { label: 'Avg. Action Time', value: averageRuntime ? formatDuration(averageRuntime) : 'â€”' },
                { label: 'Total Actions', value: String(plugins.length) },
                { label: 'Total Exceptions', value: String(exceptions) },
                { label: 'Failed Assertions', value: String(fails) },
                { label: 'Total Timeouts', value: timeouts > 0 ? formatDuration(timeouts) : 'â€”' },
            ];

            // Render all summary cards as HTML.
            return `
            <div class="cards cards-6">
                ${items.map(i => `
                    <div class="card"><div class="card-label">${clearString(i.label)}</div>
                    <div class="card-value">${clearString(i.value)}</div></div>`
            ).join('')}
            </div>`;
        }

/**
         * Renders the error summary section for failed assertions and exceptions.
         *
         * Behavior:
         * - Builds failed assertion rows when assertion failures exist.
         * - Builds exception rows when plugin exceptions exist.
         * - Displays compact count badges in the section header.
         * - Uses a collapsible section body controlled by `toggleElement`.
         * - Returns the complete Error Summary HTML block.
         *
         * @param {Array<object>} asserts - Failed assertion items to render.
         * @param {Array<object>} exceptions - Exception items to render.
         * @param {string|number} sid - Unique section id suffix used for collapse/expand behavior.
         * @returns {string} HTML markup for the error summary section.
         */
        function writeErrorSummary(asserts, exceptions, sid) {
            // Render all failed assertion rows.
            const assertRows = asserts.map(assert => {
                // Assertion content contains the evaluation details.
                const content = assert.content || {};

                return `
                <tr>
                    <td class="mono">${clearString(assert.onElement || 'â€”')}</td>
                    <td class="mono">${clearString(content.Condition || 'â€”')}</td>
                    <td class="mono">${clearString(content.Operator || 'â€”')}</td>
                    <td class="mono">${clearString(content.Expected ?? 'â€”')}</td>
                    <td class="mono">${clearString(String(content.Actual ?? 'â€”'))}</td>
                    <td class="reason">${clearString(content.ReasonPhrase || 'â€”')}</td>
                </tr>`;
            }).join('');

            // Render all exception rows.
            const exceptionRows = exceptions.map(i => `
                <tr>
                    <td class="mono">${clearString(i.pluginName || '?')}</td>
                    <td class="mono">${clearString(i.type || 'â€”')}</td>
                    <td>${clearString(i.exception?.Message || 'â€”')}</td>
                    <td class="reason">${clearString(i.reasonPhrase || 'â€”')}</td>
                </tr>`).join('');

            // Build the failed assertions table.
            const assertBlockHtml = `
            <div class="es-label meta-text">Failed Assertions</div>
            <table class="assert-tbl">
                <thead>
                    <tr>
                        <th>Element</th>
                        <th>Condition</th>
                        <th>Operator</th>
                        <th>Expected</th>
                        <th>Actual</th>
                        <th>Reason</th>
                    </tr>
                </thead>
                <tbody>${assertRows}</tbody>
            </table>`;

            // Only show the assertion block when there are failed assertions.
            const assertBlock = asserts.length > 0
                ? assertBlockHtml
                : '';

            // Add a visual separator before the exception block when assertions exist.
            const exceptionCssClass = asserts.length > 0
                ? ' es-sep'
                : '';

            // Build the exceptions table.
            const exceptionBlockHtml = `
            <div class="es-label meta-text${exceptionCssClass}">Exceptions</div>
            <table class="assert-tbl">
                <thead>
                    <tr>
                        <th>Plugin</th>
                        <th>Type</th>
                        <th>Message</th>
                        <th>Reason</th>
                    </tr>
                </thead>
                <tbody>${exceptionRows}</tbody>
            </table>`;

            // Only show the exception block when there are exceptions.
            const exceptionBlock = exceptions.length > 0
                ? exceptionBlockHtml
                : '';

            // Build compact header count badges.
            const counts = [];

            // Add failed assertion count when failures exist.
            if (asserts.length > 0) {
                counts.push(
                    `<span class="assert-count">${LED('#ef4444')}${asserts.length} failed</span>`
                );
            }

            // Add exception count when exceptions exist.
            if (exceptions.length > 0) {
                const suffix = exceptions.length > 1
                    ? 's'
                    : '';

                counts.push(
                    `<span class="assert-count">${LED('#ef4444')}${exceptions.length} exception${suffix}</span>`
                );
            }

            // Render the complete collapsible error summary section.
            return `
            <div class="section section-mt-lg">
                <div class="section-hdr" onclick="toggleElement('es-${sid}','esi-${sid}')">
                    <i class="chev open" id="esi-${sid}">${SVG_CHEVRON}</i>
                    Error Summary
                    ${counts.join('')}
                </div>
                <div class="section-body" id="es-${sid}">${assertBlock}${exceptionBlock}</div>
            </div>`;
        }

// Incremental id used to generate unique plugin/process node ids.
        // These ids are used by the report tree expand/collapse behavior.
        let _processId = 0;

        // Incremental id used to generate unique exception/stack-trace row ids.
        // These ids are used by the exception stack trace expand/collapse behavior.
        let _exceptionId = 0;

        /**
         * Renders an exceptions table for a plugin/action level.
         *
         * Behavior:
         * - Creates one table row for each exception.
         * - Shows plugin name, exception type, message, and reason.
         * - Adds an expandable stack trace row when stack trace data exists.
         * - Uses the current depth to visually indent the exception table.
         *
         * @param {Array<object>} exceptions - The exception items to render.
         * @param {number} depth - The nesting depth used to indent the table.
         * @returns {string} HTML markup for the exceptions table.
         */
        function writeExceptions(exceptions, depth) {
            // Render all exception rows.
            const rows = exceptions.map(ex => {
                // Resolve the stack trace text when available.
                const stack = ex.exception?.StackTrace || '';

                // Generate a unique id for the expandable stack trace row.
                const eid = 'e' + (_exceptionId++);

                // Render the stack trace toggle cell only when stack trace data exists.
                const stackToggle = stack
                    ? `<td class="exc-stack-toggle" onclick="toggleElement('${eid}','${eid}-ic')"><i class="chev" id="${eid}-ic">${SVG_CHEVRON}</i></td>`
                    : '<td>â€”</td>';

                // Render the hidden stack trace row.
                // It is expanded/collapsed by clicking the stack trace toggle cell.
            const stackRow = stack
                ? `<tr id="${eid}" class="is-collapsed"><td colspan="5"><pre class="exc-stack">${clearString(stack)}</pre></td></tr>`
                    : '';

                // Render the main exception row and optional stack trace row.
                return `
                <tr>
                    <td class="mono">${clearString(ex.pluginName || '?')}</td>
                    <td class="mono">${clearString(ex.type || 'â€”')}</td>
                    <td>${clearString(ex.exception?.Message || 'â€”')}</td>
                    <td class="reason">${clearString(ex.reasonPhrase || 'â€”')}</td>
                    ${stackToggle}
                </tr>${stackRow}`;
            }).join('');

            // Render the exceptions table.
            // The left padding is increased by depth so nested plugin exceptions
            // visually align under their owning plugin/action.
            return `
        <div class="assertion-depth assertion-depth--${getDepthClass(depth)}">
            <table class="assert-tbl">
                <thead>
                    <tr>
                        <th>Plugin</th>
                        <th>Type</th>
                        <th>Message</th>
                        <th>Reason</th>
                        <th>Stack Trace</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
                </table>
            </div>`;
        }

        /**
         * Renders a plugin/action row and all of its nested child plugins.
         *
         * Behavior:
         * - Resolves plugin metadata from the performance point reference and rule.
         * - Calculates runtime percentage relative to the parent job/plugin runtime.
         * - Marks plugins with exceptions using a warning/error LED color.
         * - Marks hot plugins using the provided hotSet.
         * - Renders exception details when exceptions exist.
         * - Recursively renders nested plugins.
         *
         * @param {object} plugin - The plugin/action report object to render.
         * @param {number} depth - The current nesting depth used for indentation.
         * @param {number} jobRunTime - The parent job or plugin runtime in ticks.
         * @param {Set<string>} hotSet - Set of plugin reference ids marked as hot/slow.
         * @returns {string} HTML markup for the plugin row and its children.
         */
        function writePlugins(plugin, depth, jobRunTime, hotSet = new Set()) {
            // Generate a unique id used for expand/collapse behavior.
            const id = 'p' + (_processId++);

            // Resolve commonly used plugin report sections.
            const reference = plugin.performancePoint?.reference || {};
            const performancePoint = plugin.performancePoint || {};
            const rule = plugin.rule || {};

            // Resolve plugin identity and display metadata.
            const type = reference.type || 'Action';
            const name = reference.name || rule.pluginName || '?';
            const display = rule.capabilities?.displayName || name;

            // Resolve rule details shown next to the plugin name.
            const argument = rule.argument || '';
            const onElement = rule.onElement || '';

            // Resolve runtime in ticks.
            const runTime = performancePoint.runTime || 0;

            // Calculate the runtime bar width relative to the parent runtime.
            const barPct = jobRunTime > 0
                ? Math.min(
                    100,
                    (convertToMilliseconds(runTime) / convertToMilliseconds(jobRunTime)) * 100
                )
                : 0;

            // Determine whether this plugin has nested child plugins.
            const isNestedPlugins = (plugin.plugins || []).length > 0;

            // Resolve plugin exceptions.
            const exceptions = plugin.exceptions || [];

            // Detect timeout-related exceptions so they can use a warning color.
            const isTimeout = exceptions.some(e =>
                (e.type || '').includes('Timeout')
            );

            // Timeout exceptions are warning-colored; other exceptions are error-colored.
            const timeoutColor = isTimeout
                ? '#eab308'
                : '#ef4444';

            // Green means success, yellow means timeout, red means other exception.
            const ledColor = exceptions.length === 0
                ? '#22c55e'
                : timeoutColor;

            // Mark this plugin as hot when its reference id exists in the hot set.
            const isHot = hotSet.has(reference.id);

            // Render nested child plugins when available.
            const nestedPluginsHtml = isNestedPlugins
                ? `<div class="p-children hidden" id="ck-${id}">${(plugin.plugins || []).map(c => writePlugins(c, depth + 1, runTime || jobRunTime, hotSet)).join('')}</div>`
                : '';

            // Render exception details when this plugin contains exceptions.
            const exceptionsHtml = exceptions.length > 0
                ? writeExceptions(exceptions, depth)
                : '';

            // Use the reference description as a tooltip when available.
            const title = reference.description
                ? clearString(setTruncates(reference.description, 200))
                : '';

            // Render the plugin node.
            return `
            <div class="p-node" data-name="${clearString(display.toLowerCase())}">
            <div class="plugin-row plugin-row--depth-${getDepthClass(depth)}" onclick="togglePlugin('${id}')" title="${title}">
                    <div class="p-toggle">${isNestedPlugins ? `<i class="chev" id="ci-${id}">${SVG_CHEVRON}</i>` : '<span class="p-toggle-spacer"></span>'}</div>
                        <svg class="p-led" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" width="8" height="8">
                            <path fill="${ledColor}" d="M64 320C64 178.6 178.6 64 320 64C461.4 64 576 178.6 576 320C576 461.4 461.4 576 320 576C178.6 576 64 461.4 64 320z"/>
                        </svg>
                        <span class="p-name">${clearString(display)}</span>
                        ${argument ? `<span class="p-arg">${clearString(setTruncates(argument, 55))}</span>` : ''}
                        ${onElement ? `<span class="p-elem">&#x2022; ${clearString(setTruncates(onElement, 40))}</span>` : ''}
                        <span class="p-spacer"></span>
                    <div class="p-bar-wrap">
                        <progress class="p-runtime p-bar bar-${clearString(type)}" value="${barPct.toFixed(1)}" max="100"></progress>
                    </div>
                    <span class="p-dur${isHot ? ' p-hot' : ''}">${formatDuration(runTime)}</span>
                </div>
                ${exceptionsHtml}
                ${nestedPluginsHtml}
            </div>`;
        }

        /**
         * Renders a single request rule as a plugin/action row.
         *
         * Behavior:
         * - Resolves the display name from rule capabilities or plugin name.
         * - Shows the rule argument when available.
         * - Shows the target element/locator when available.
         * - Returns HTML markup compatible with the report plugin row layout.
         *
         * @param {object} rule - The request rule to render.
         * @returns {string} HTML markup for the request rule row.
         */
        function writeRequestRule(rule) {
            // Resolve the rule display name.
            // Prefer the friendly display name, then fall back to the plugin name.
            const name = rule.capabilities?.displayName || rule.pluginName || '?';

            // Resolve the rule argument shown beside the plugin name.
            const argument = rule.argument || '';

            // Resolve the rule target element/locator.
            const element = rule.onElement || '';

            // Render the request rule as a plugin-style row.
            return `
            <div class="plugin-row">
                <div class="p-toggle"><span class="p-toggle-spacer"></span></div>
                <svg class="p-led" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" width="8" height="8">
                    <path fill="currentColor" d="M64 320C64 178.6 178.6 64 320 64C461.4 64 576 178.6 576 320C576 461.4 461.4 576 320 576C178.6 576 64 461.4 64 320z"/>
                </svg>
                <span class="p-name">${clearString(name)}</span>
                ${argument ? `<span class="p-arg">${clearString(setTruncates(argument, 55))}</span>` : ''}
                ${element ? `<span class="p-elem">&#x2022; ${clearString(setTruncates(element, 40))}</span>` : ''}
                <span class="p-spacer"></span>
            </div>`;
        }

        /**
         * Renders the request view for automation request data.
         *
         * Behavior:
         * - Builds summary cards for request-level metrics.
         * - Flattens stages, jobs, and rules for counting.
         * - Renders a collapsible rule tree grouped by stage and job.
         * - Renders a simple execution timeline based on rule order.
         *
         * @param {object} data - The automation request data to render.
         * @returns {string} HTML markup for the request report view.
         */
        function writeRequestView(data) {
            // Resolve all stages from the request data.
            const stages = data.stages || [];

            // Flatten all jobs from all stages.
            const allJobs = stages.flatMap(st => st.jobs || []);

            // Flatten all rules/actions from all jobs.
            const allRules = allJobs.flatMap(j => j.rules || []);

            // Build request summary cards.
            // Runtime-related values are not available in request mode,
            // because this view represents the automation request before execution.
            const cards = [
                { label: 'Total Runtime', value: 'â€”' },
                { label: 'Avg. Action Time', value: 'â€”' },
                { label: 'Total Actions', value: String(allRules.length) },
                { label: 'Total Exceptions', value: 'â€”' },
                { label: 'Failed Assertions', value: 'â€”' },
                { label: 'Total Timeouts', value: 'â€”' },
            ];

            // Renders all jobs for a given stage, including their nested rules.
            const writeJobsHtml = (jobs) => {
                return jobs.map(job => {
                    // Resolve rules/actions for the current job.
                    const rules = job.rules || [];

                    // Resolve a stable job id when available.
                    // Generate a fallback id when the request does not include one.
                    const jid = job.reference?.id ||
                        ('j' + Math.random().toString(36).slice(2));

                    // Resolve the job display name.
                    const jname = job.reference?.name || 'Job';

                    // Render the current job and its request rules.
                    return `
                        <div class="tree-job">
                            <div class="tree-job-hdr" onclick="toggleElement('rj-${clearString(jid)}','rji-${clearString(jid)}')">
                                <i class="chev open" id="rji-${clearString(jid)}">${SVG_CHEVRON}</i>
                                ${clearString(jname)}
                                <span class="meta-text">${rules.length} action${rules.length > 1 ? 's' : ''}</span>
                            </div>
                            <div id="rj-${clearString(jid)}">${rules.map(r => writeRequestRule(r)).join('')}</div>
                        </div>`;
                }).join('')
            };

            // Render all stages and their nested jobs/rules.
            const stagesHtml = stages.map(stage => {
                // Resolve jobs for the current stage.
                const jobs = stage.jobs || [];

                // Resolve a stable stage id when available.
                // Generate a fallback id when the request does not include one.
                const sid = stage.reference?.id ||
                    ('s' + Math.random().toString(36).slice(2));

                // Resolve the stage display name.
                const sname = stage.reference?.name || 'Stage';

                // Render the current stage.
                return `
                <div class="tree-stage">
                    <div class="tree-stage-hdr" onclick="toggleElement('rs-${clearString(sid)}','ri-${clearString(sid)}')">
                        <i class="chev open" id="ri-${clearString(sid)}">${SVG_CHEVRON}</i>
                        ${clearString(sname)}
                        <span class="meta-text">${jobs.length} job${jobs.length > 1 ? 's' : ''}</span>
                    </div>
                    <div id="rs-${clearString(sid)}">
                        ${writeJobsHtml(jobs)}
                    </div>
                </div>`;
            }).join('');

            // Render the complete request view:
            // - Summary cards
            // - Rule tree
            // - Request timeline
            return `
            <div class="cards cards-6 cards-req">
                ${cards.map(c => `
                    <div class="card">
                        <div class="card-label">${clearString(c.label)}</div>
                        <div class="card-value">${clearString(c.value)}</div>
                    </div>`).join('')}
            </div>
            <div class="section">
                <div class="section-hdr" onclick="toggleElement('req-tree','req-tree-chev')">
                    <i class="chev open" id="req-tree-chev">${SVG_CHEVRON}</i>
                    Rule Tree <span class="meta-text">${stages.length} stage${stages.length > 1 ? 's' : ''} &bull; ${allJobs.length} job${allJobs.length > 1 ? 's' : ''} &bull; ${allRules.length} action${allRules.length > 1 ? 's' : ''}</span>
                </div>
                <div class="section-body" id="req-tree">${stagesHtml}</div>
            </div>
            <div class="section section-mt">
                <div class="section-hdr" onclick="toggleElement('req-tl','req-tl-chev')">
                <i class="chev open" id="req-tl-chev">${SVG_CHEVRON}</i>
                Execution Timeline
                <span class="meta-text">${allRules.length} action${allRules.length > 1 ? 's' : ''}</span>
                </div>
                <div class="section-body" id="req-tl">${writeRequestTimeline(stages)}</div>
            </div>`;
        }

        /**
         * Renders the full execution tree for all report stages.
         *
         * Behavior:
         * - Returns a "No stages" message when no stages exist.
         * - Renders each stage as a collapsible section.
         * - Renders each job inside its owning stage.
         * - Renders each plugin/action inside its owning job.
         * - Calculates the top slowest plugins per job and marks them as hot.
         *
         * @param {Array<object>|null|undefined} stages - The report stages to render.
         * @returns {string} HTML markup for the execution tree.
         */
        function writeTree(stages) {
            const writeJob = (job) => {
                // Resolve the top-level plugins/actions for the current job.
                const plugins = job.plugins || [];

                // Build the plugin label suffix.
                const pluginSuffix = plugins.length > 1 || plugins.length === 0
                    ? 's'
                    : '';

                // Resolve the total runtime for the current job.
                const jobRunTime = job.performancePoint?.runTime || 0;

                // Build a set of the top 3 slowest plugin reference ids.
                // These are later highlighted by writePlugins().
                const hotSet = new Set(
                    groupPlugins(plugins)
                        .sort((a, b) =>
                            (b.performancePoint?.runTime || 0) -
                            (a.performancePoint?.runTime || 0)
                        )
                        .slice(0, 3)
                        .map(p => p.performancePoint?.reference?.id)
                        .filter(Boolean)
                );

                // Render the current job and all of its plugins.
                return `
                <div class="tree-job">
                    <div class="tree-job-hdr" onclick="toggleElement('jb-${clearString(job.id)}','ji-${clearString(job.id)}')">
                        <i class="chev open" id="ji-${clearString(job.id)}">${SVG_CHEVRON}</i>
                        ${clearString(job.name)}
                        <span class="meta-text">${plugins.length} plugin${pluginSuffix} &bull; ${formatDuration(jobRunTime)}</span>
                    </div>
                    <div id="jb-${clearString(job.id)}">
                        ${plugins.map(p => writePlugins(p, 0, jobRunTime, hotSet)).join('')}
                    </div>
                </div>`;
            }

            const writeStage = (stage) => {
                // Resolve the jobs for the current stage.
                const jobs = stage.jobs || [];

                // Build the job label suffix.
                const jobSuffix = jobs.length > 1 || jobs.length === 0
                    ? 's'
                    : '';

                // Render the current stage and all of its jobs.
                return `
                <div class="tree-stage">
                    <div class="tree-stage-hdr" onclick="toggleElement('st-${clearString(stage.id)}','si-${clearString(stage.id)}')">
                        <i class="chev open" id="si-${clearString(stage.id)}">${SVG_CHEVRON}</i>
                        ${clearString(stage.name)}
                        <span class="meta-text">${jobs.length} job${jobSuffix}</span>
                    </div>
      
                    <div id="st-${clearString(stage.id)}">
                        ${jobs.map(job => writeJob(job)).join('')}
                    </div>
                </div>`;
            }

            // If the report does not contain stages, show an empty-state message.
            if (!stages?.length) {
                return '<div class="no-data">No stages.</div>';
            }

            // Render all stages.
            return stages.map(stage => writeStage(stage)).join('');
        }

/**
         * Renders a simple request timeline for automation request rules.
         *
         * Behavior:
         * - Flattens all rules from all stages and jobs.
         * - Shows an empty-state message when no rules exist.
         * - Renders each rule as one SVG row.
         * - Places each rule as an equal-width segment across the timeline.
         * - Uses the rule display name or plugin name as the row label.
         *
         * @param {Array<object>|null|undefined} stages - The request stages to render.
         * @returns {string} HTML markup for the request timeline.
         */
        function writeRequestTimeline(stages) {
            // SVG layout constants.
            const ROW = 24;
            const LW = 155;
            const CW = 740;
            const PAD = 6;

            // Flatten all rules from all jobs in all stages.
            const rules = (stages || [])
                .flatMap(st => st.jobs || [])
                .flatMap(j => j.rules || []);

            // Total number of actions/rules in the request.
            const total = rules.length;

            // Show an empty-state message when no rules exist.
            if (!total) {
                return '<div class="no-data">No actions to display.</div>';
            }

            // Calculate the SVG height based on the number of rule rows.
            const svgHeight = ROW * total + PAD * 2;

            // Each rule gets an equal-width segment in the chart area.
            const segmentWidth = CW / total;

            // Render each rule as a label and a timeline segment.
            const rowsSvg = rules.map((rule, i) => {
                // Resolve the friendly rule name.
                // Prefer displayName, then fall back to pluginName.
                const name = rule.capabilities?.displayName || rule.pluginName || '?';

                // Calculate the vertical row position.
                const y = PAD + i * ROW;

                // Calculate the horizontal segment start position.
                const xStartPosition = LW + i * segmentWidth;

                // Keep at least 2px width so every rule remains visible.
                const width = Math.max(2, segmentWidth - 1);

                // Render the rule label and its timeline segment.
                return `
                <text x="${LW - 4}" y="${y + ROW / 2 + 4}" text-anchor="end" fill="currentColor" font-size="11" font-family="Segoe UI,sans-serif">
                    ${clearString(setTruncates(name, 18))}
                </text>
                <rect x="${xStartPosition.toFixed(1)}" y="${y + 5}" width="${width.toFixed(1)}" height="${ROW - 10}" fill="currentColor">
                    <title>${clearString(setTruncates(name, 18))}</title>
                </rect>`;
            }).join('');

            // Render the complete timeline SVG.
            return `
            <div class="tl-wrap">
                <svg class="svg-block" width="${LW + CW + PAD}" height="${svgHeight}" xmlns="http://www.w3.org/2000/svg">
                    ${rowsSvg}
                </svg>
            </div>`;
        }

        /**
         * Renders a timeline chart for all plugins/actions in the report.
         *
         * Behavior:
         * - Converts the session start/end values into millisecond timestamps.
         * - Flattens all plugins from all stages/jobs into timeline rows.
         * - Calculates each plugin bar position relative to the full session duration.
         * - Renders an SVG timeline with duration axis, plugin labels, bars, and durations.
         *
         * @param {Array<object>|null|undefined} stages - The report stages to render.
         * @param {string} sessionStart - The session start date/time.
         * @param {string} sessionEnd - The session end date/time.
         * @returns {string} HTML markup for the timeline section.
         */
        function writeTimeline(stages, sessionStart, sessionEnd) {
            // Flattens a nested plugin tree into timeline items.
            //
            // Behavior:
            // - Iterates over the provided plugin collection.
            // - Resolves each plugin name and type from its performance reference or rule.
            // - Resolves start/end timestamps using plugin timing data.
            // - Falls back to the session start/end when plugin timing is missing.
            // - Tracks nesting depth so child plugins can be rendered indented.
            // - Recursively processes child plugins.
            const groupPlugins = (plugins, depth, out) => {
                // Iterate over the current plugin level.
                // If plugins is null/undefined, use an empty array.
                for (const plugin of (plugins || [])) {
                    // Resolve plugin reference metadata when available.
                    const reference = plugin?.performancePoint?.reference || {};

                    // Resolve the display name from reference metadata first,
                    // then fall back to the rule plugin name.
                    const name = reference.name || plugin?.rule?.pluginName || '?';

                    // Resolve the plugin type, defaulting to Action when missing.
                    const type = reference.type || 'Action';

                    // Resolve plugin start time.
                    // If the plugin does not include a start time, fall back to sessionStart.
                    const start = new Date(
                        plugin?.performancePoint?.start || sessionStart
                    ).getTime();

                    // Resolve plugin end time.
                    // If the plugin does not include an end time, fall back to sessionEnd.
                    const end = new Date(
                        plugin?.performancePoint?.end || sessionEnd
                    ).getTime();

                    // Add the normalized plugin timeline item to the output collection.
                    out.push({
                        name,
                        type,
                        depth,
                        start,
                        end
                    });

                    // Recursively collect child plugin timeline items.
                    groupPlugins(plugin?.plugins, depth + 1, out);
                }
            };

            // Convert the session start and end values into millisecond timestamps.
            const startTime = new Date(sessionStart).getTime();
            const endTime = new Date(sessionEnd).getTime();

            // Calculate the full session span.
            // Use at least 1 ms to avoid division by zero.
            const span = Math.max(endTime - startTime, 1);

            // Timeline rows created from all plugins/actions.
            const rows = [];

            // Collect all plugin timeline rows from all stages and jobs.
            for (const stage of (stages || [])) {
                for (const job of (stage.jobs || [])) {
                    groupPlugins(job.plugins, 0, rows);
                }
            }

            // Show an empty-state message when no plugin timing data exists.
            if (!rows.length) {
                return '<div class="no-data">No timeline data.</div>';
            }

            // Height of each plugin/action row in the timeline.
            const ROW = 24;

            // Width reserved on the left for plugin/action labels.
            const LW = 155;

            // Width of the main timeline chart area.
            const CW = 680;

            // Width reserved on the right for duration text.
            const DW = 80;

            // Outer padding around the SVG content.
            const PAD = 6;

            // Number of time segments shown on the timeline axis.
            // TICKS + 1 grid lines are rendered.
            const TICKS = 6;

            // Calculate the full SVG height based on the row count.
            const svgHeight = ROW * rows.length + 20 + PAD * 2;

            // Render the timeline axis grid lines and labels.
            const axisTicks = Array.from({ length: TICKS + 1 }, (_, i) => {
                // Calculate the x position for this tick.
                const x = LW + (i / TICKS) * CW;

                // Calculate the elapsed time represented by this tick.
                const milliseconds = (i / TICKS) * span;

                // Format the tick label as seconds or milliseconds.
                const label = milliseconds >= 1000
                    ? (milliseconds / 1000).toFixed(1) + 's'
                    : Math.round(milliseconds) + 'ms';

                return `
                <line x1="${x}" y1="${PAD}" x2="${x}" y2="${PAD + ROW * rows.length}" stroke="currentColor" stroke-width="1" opacity="0.15"/>
                <text x="${x}" y="${PAD + ROW * rows.length + 14}" text-anchor="middle" fill="currentColor" font-size="10" font-family="Segoe UI,sans-serif">
                    ${label}
                </text>`;
            }).join('');

            // Render each plugin row as a label, bar, tooltip, and duration value.
            const rowsSvg = rows.map((r, i) => {
                // Calculate the vertical position for the row.
                const y = PAD + i * ROW;

                // Calculate the start position of the plugin bar.
                const xStartPosition = LW + ((r.start - startTime) / span) * CW;

                // Calculate the plugin bar width.
                // Use at least 3 px so very fast actions are still visible.
                const barWidth = Math.max(3, ((r.end - r.start) / span) * CW);

                // Convert elapsed milliseconds back to ticks for the existing duration formatter.
                const duration = formatDuration((r.end - r.start) * 10000);

                // Indent nested plugin labels based on their depth.
                const indent = LW - 4 - r.depth * 14;

                return `
                <text x="${indent}" y="${y + ROW / 2 + 4}" text-anchor="end" fill="currentColor" font-size="11" font-family="Segoe UI,sans-serif">
                    ${clearString(setTruncates(r.name, 18))}
                </text>
                <rect x="${xStartPosition.toFixed(1)}" y="${y + 5}" width="${barWidth.toFixed(1)}" height="${ROW - 10}" fill="currentColor">
                    <title>${clearString(r.name)}: ${duration} (${formatTime(new Date(r.start).toISOString())} - ${formatTime(new Date(r.end).toISOString())})</title>
                </rect>
                <text x="${LW + CW + 6}" y="${y + ROW / 2 + 4}" text-anchor="start" fill="currentColor" font-size="10" font-family="Segoe UI,sans-serif">${duration}</text>`;
            }).join('');

            // Render the complete timeline wrapper and SVG.
            return `
            <div class="tl-wrap">
                <svg class="svg-block" width="${LW + CW + DW + PAD}" height="${svgHeight}" xmlns="http://www.w3.org/2000/svg">
                    ${axisTicks}
                    ${rowsSvg}
                </svg>
            </div>`;
        }

/**
         * Renders the assertion results table.
         *
         * Behavior:
         * - Shows an empty-state message when no assertion data exists.
         * - Renders each assertion as a table row.
         * - Displays assertion element, condition, operator, expected value, actual value,
         *   result status, and reason phrase.
         * - Uses a green LED for passed assertions.
         * - Uses a red LED for failed assertions.
         * - Uses the default text color when the evaluation result is missing or unknown.
         *
         * @param {Array<object>} assertions - The assertion items to render.
         * @returns {string} HTML markup for the assertion table.
         */
        function writeAssertions(assertions) {
            // Show an empty-state message when there are no assertions to display.
            if (!assertions.length) {
                return '<div class="no-data">No assertion data found.</div>';
            }

            // Render all assertion rows.
            const rows = assertions.map(assertion => {
                // Assertion content contains the condition, expected value,
                // actual value, evaluation result, and reason phrase.
                const content = assertion.content || {};

                // Resolve the assertion evaluation result.
                // Expected values are usually true, false, or undefined/null.
                const evaluation = content.Evaluation;

                // Failed assertions are shown in red.
                // Unknown/missing evaluation uses the current text color.
                const evaluationColor = evaluation === false
                    ? '#ef4444'
                    : 'currentColor';

                // Passed assertions are shown in green.
                // Failed assertions use red.
                // Unknown/missing results use the fallback evaluation color.
                const ledFill = evaluation === true
                    ? '#22c55e'
                    : evaluationColor;

                // Build the assertion result LED icon.
                const ledSvg = `
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" width="10" height="10">
                    <path fill="${ledFill}" d="M64 320C64 178.6 178.6 64 320 64C461.4 64 576 178.6 576 320C576 461.4 461.4 576 320 576C178.6 576 64 461.4 64 320z"/>
                </svg>`;

                // Render one assertion result row.
                return `
                <tr>
                    <td class="mono">${clearString(assertion.onElement || 'â€”')}</td>
                    <td class="mono">${clearString(content.Condition || 'â€”')}</td>
                    <td class="mono">${clearString(content.Operator || 'â€”')}</td>
                    <td class="mono">${clearString(content.Expected ?? 'â€”')}</td>
                    <td class="mono">${clearString(String(content.Actual ?? 'â€”'))}</td>
                    <td class="td-center">${ledSvg}</td>
                    <td class="reason">${clearString(content.ReasonPhrase || 'â€”')}</td>
                </tr>`;
            }).join('');

            // Render the complete assertions table.
            return `
            <table class="assert-tbl">
                <thead>
                    <tr>
                        <th>Element</th>
                        <th>Condition</th>
                        <th>Operator</th>
                        <th>Expected</th>
                        <th>Actual</th>
                        <th>Result</th>
                        <th>Reason Phrase</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>`;
        }

/**
         * Renders the report header section.
         *
         * @param {object|null|undefined} automationReference - The automation reference metadata.
         * @param {object|null|undefined} performancePoint - The main performance point for the report.
         * @returns {string} HTML markup for the report header.
         */
        function renderHeader(automationReference, performancePoint) {
            // Resolve the automation name shown in the report header.
            const name = automationReference?.name || 'Untitled Automation';

            // Resolve the automation start time from the performance point.
            const start = performancePoint?.start;

            // Render the report header.
            return `
            <div class="header">
                <div>
                    <div class="header-title">G4&#x2122; Automation Report</div>
                    <div class="header-meta">${clearString(name)} &bull; ${clearString(formatDateTime(start))}</div>
                </div>
            </div>`;
        }

(() => {
            // Renders the request configuration view.
            //
            // Behavior:
            // - Reads driver and browser information from the resolved request schema.
            // - Writes the request header into the `g4-header` container.
            // - Writes the request body into the `app` container.
            // - Uses `writeRequestView()` to render the request stages, jobs, and rules.
            const resolveRequest = (schema) => {
                // Resolve the request root object.
                const root = schema.root || {};

                // Resolve the configured driver.
                // Falls back to an em dash when the driver is missing.
                const driver = root.driverParameters?.driver || 'â€”';

                // Resolve the configured browser name from WebDriver capabilities.
                // Falls back to an em dash when the browser is missing.
                const browser = root.driverParameters?.capabilities?.alwaysMatch?.browserName || 'â€”';

                // Render the request configuration header.
                document.getElementById('g4-header').innerHTML = `
                <div class="header">
                    <div>
                        <div class="header-title">G4&#x2122; Request Configuration</div>
                        <div class="header-meta">${clearString(driver)} &bull; ${clearString(browser)}</div>
                    </div>
                    <div class="header-right">
                        <span class="tag tag-neutral">Request</span>
                    </div>
                </div>`;

                // Render the request view into the main app container.
                document.getElementById('app').innerHTML =
                    `<div class="main">${writeRequestView(root)}</div>`;
            };

            /**
             * Renders the fallback view when the report data cannot be recognized.
             *
             * Behavior:
             * - Shows the standard automation report header.
             * - Displays a "No session data found" message in the header metadata.
             * - Replaces the main app content with an error message.
             * - Explains the expected G4 response shape.
             */
            const resolveNoData = () => {
                // Render the fallback report header.
                document.getElementById('g4-header').innerHTML = `
                <div class="header">
                    <div>
                        <div class="header-title">G4&#x2122; Automation Report</div>
                        <div class="header-meta">${clearString('No session data found')}</div>
                    </div>
                </div>`;

                // Render the fallback body for unrecognized report formats.
                document.getElementById('app').innerHTML = `
                <div class="main">
                    <div class="error-body">
                        <div class="error-title">Unrecognized format</div>
                        <div class="error-desc">Expected a G4 response with <code class="code-tag">sessions</code> and <code class="code-tag">responseTree</code> keys.</div>
                    </div>
                </div>`;
            };

            // Resolve the input data shape so the renderer knows whether this is
            // a G4 request, a G4 response, or an unknown payload.
            const schema = resolveSchema(DATA);

            // Use the resolved root object.
            // For response data, this is the object that contains the sessions dictionary.
            // For request data, this is the request configuration object.
            const root = schema.root;

            // Resolve the root-level performance point.
            // This usually contains overall execution timing information for the report.
            const performancePoint = root.performancePoint || {};

            // Resolve the sessions dictionary.
            // Each key represents a session id and each value contains that session result.
            const sessions = root.sessions || {};

            // Extract all available session ids from the sessions dictionary.
            const sids = Object.keys(sessions);

            // If this payload is a request configuration, render the request view
            // and stop because request data does not contain execution sessions.
            if (schema.type === 'request') {
                resolveRequest(schema);
                return;
            }

            // If there are no sessions, render the fallback/no-data view
            // and stop because there is no execution data to display.
            if (!sids.length) {
                resolveNoData();
                return;
            }

            // Holds automation metadata used by the report header.
            // It is resolved from the first available session/stage below.
            let automationReference = {};

            // Resolve automation metadata from the first session when possible.
            if (sids.length) {
                // Get the first session result from the sessions dictionary.
                const first = sessions[sids[0]];

                // Resolve the response stages from the first session response tree.
                const stages = first.responseTree?.stages || [];

                // The automation reference is stored on the first stage.
                if (stages.length) {
                    automationReference = stages[0].automationReference || {};
                }
            }

            /**
             * Renders all execution sessions into HTML.
             *
             * Behavior:
             * - Iterates over all session ids from the response `sessions` dictionary.
             * - Resolves session performance data, stages, jobs, plugins, assertions, and exceptions.
             * - Renders machine information only when it exists.
             * - Renders session summary cards, error summary, plugin tree, timeline, and assertions.
             * - Separates sessions with a visual divider.
             *
             * Notes:
             * - `sessions` is expected to be a dictionary/map where each key is a session id.
             * - `findMachineInformation()` may return null, so machine fields must be rendered conditionally.
             */
            const sessionHtml = sids.map((sid) => {
                // Resolve the current session from the sessions dictionary.
                const session = sessions[sid] || {};

                // Resolve the session-level performance point.
                const spp = session.performancePoint || {};

                // Resolve all stages from the session response tree.
                const stages = session.responseTree?.stages || [];

                // Flatten all jobs from all stages.
                const allJobs = stages.flatMap(stage => stage.jobs || []);

                // Flatten all plugins/actions from all jobs, including nested plugins.
                const allPlugs = allJobs.flatMap(job => groupPlugins(job.plugins));

                // Collect all assertion/extraction entities from all jobs.
                const asserts = allJobs.flatMap(job => groupAssertions(job.plugins));

                // Count failed assertions.
                const fails = asserts
                    .filter(assertion => assertion.content?.Evaluation === false)
                    .length;

                // Count passed assertions.
                const passes = asserts
                    .filter(assertion => assertion.content?.Evaluation === true)
                    .length;

                // Keep only failed assertions for the error summary section.
                const failedAsserts = asserts
                    .filter(assertion => assertion.content?.Evaluation === false);

                // Collect all exceptions from all plugins/actions.
                const allExceptions = allPlugs.flatMap(plugin => plugin.exceptions || []);

                // Resolve machine/session information when available.
                const machine = findMachineInformation(stages);

                // Escape the session id once because it is reused in ids, handlers, and visible text.
                const safeSid = clearString(sid);

                // Build plural suffixes for labels.
                const stageSuffix = stages.length > 1 || stages.length === 0 ? 's' : '';
                const jobSuffix = allJobs.length > 1 || allJobs.length === 0 ? 's' : '';
                const failSuffix = fails > 1 || fails === 0 ? 's' : '';
                const passSuffix = passes > 1 || passes === 0 ? 'es' : '';

                // Render machine details only when machine information exists.
                // This prevents errors when findMachineInformation(stages) returns null.
                const machineHtml = machine
                    ? `
                        <div class="si-item">
                            <div class="si-label">Machine</div>
                            <div class="si-value">${clearString(machine.machineName || 'â€”')}</div>
                        </div>
                        <div class="si-item">
                            <div class="si-label">IP</div>
                            <div class="si-value">${clearString(machine.machineIp || 'â€”')}</div>
                        </div>`
                    : '';

                // Render the full session block.
                return `
                <div>
                    <!-- Session title bar -->
                    <div class="session-title-bar">
                        <span class="session-label">Session</span>
                        <span class="mono session-id">${safeSid}</span>
                    </div>

                    <!-- Session info strip -->
                    <div class="session-info">
                        ${machineHtml}

                        <div class="si-item">
                            <div class="si-label">Start</div>
                            <div class="si-value">${clearString(formatTime(spp.start))}</div>
                        </div>
                        <div class="si-item">
                            <div class="si-label">End</div>
                            <div class="si-value">${clearString(formatTime(spp.end))}</div>
                        </div>
                        <div class="si-item">
                            <div class="si-label">Plugins Run</div>
                            <div class="si-value">${allPlugs.length}</div>
                        </div>
                        <div class="si-item">
                            <div class="si-label">Stages</div>
                            <div class="si-value">${stages.length}</div>
                        </div>
                        <div class="si-item">
                            <div class="si-label">Jobs</div>
                            <div class="si-value">${allJobs.length}</div>
                        </div>
                    </div>

                    <!-- Stat cards -->
                    ${writeCards(spp, stages)}

                    <!-- Error summary -->
                    ${(failedAsserts.length + allExceptions.length) > 0
                        ? writeErrorSummary(failedAsserts, allExceptions, sid)
                        : ''}

                    <!-- Plugin tree -->
                    <div class="section section-mt-lg">
                        <div class="section-hdr" onclick="toggleElement('tr-${safeSid}','ti-${safeSid}')">
                            <i class="chev open" id="ti-${safeSid}">${SVG_CHEVRON}</i>
                            Plugin Tree
                            <span class="meta-text">${stages.length} stage${stageSuffix} &bull; ${allJobs.length} job${jobSuffix} &bull; ${allPlugs.length} total plugins</span>

                            <input 
                                class="tree-filter"
                                type="text"
                                placeholder="Filterâ€¦"
                                oninput="filterTree('${safeSid}', this.value)"
                                onclick="event.stopPropagation()" />
                        </div>

                        <div class="section-body" id="tr-${safeSid}">
                            ${writeTree(stages)}
                        </div>
                    </div>

                    <!-- Execution timeline -->
                    <div class="section section-mt">
                        <div class="section-hdr" onclick="toggleElement('tl-${safeSid}','tli-${safeSid}')">
                            <i class="chev open" id="tli-${safeSid}">${SVG_CHEVRON}</i>
                            Execution Timeline
                        </div>
                        <div class="section-body" id="tl-${safeSid}">
                            ${writeTimeline(stages, spp.start, spp.end)}
                        </div>
                    </div>

                    <!-- Assertions -->
                    <div class="section section-mt">
                        <div class="section-hdr" onclick="toggleElement('as-${safeSid}','ai-${safeSid}')">
                            <i class="chev open" id="ai-${safeSid}">${SVG_CHEVRON}</i>
                            Assertions
                            ${fails > 0 ? `<span class="assert-count">${LED('#ef4444')}${fails} Fail${failSuffix}</span>` : ''}
                            ${passes > 0 ? `<span class="assert-count">${LED('#22c55e')}${passes} Pass${passSuffix}</span>` : ''}
                        </div>
                        <div id="as-${safeSid}">
                            ${writeAssertions(asserts)}
                        </div>
                    </div>
                </div>`;
            }).join('<div class="session-divider"></div>');

            // Render the report header into the header container.
            // The header includes automation metadata such as the automation name
            // and the root performance start time.
            document.getElementById('g4-header').innerHTML =
                renderHeader(automationReference, performancePoint);

            // Render all session report sections into the main application container.
            // `sessionHtml` already contains the full HTML for each session, including
            // summary cards, plugin tree, timeline, assertions, and error summary.
            document.getElementById('app').innerHTML =
                `<div class="main">${sessionHtml}</div>`;
        })();

