/*
 * Unit tests for the designer load failure (N-11): the reason and the page shown when the G4 Hub
 * cannot serve the designer.
 */
import * as assert from 'node:assert/strict';

import { ShowWorkflowCommand } from '../../commands/show-workflow';

describe('ShowWorkflowCommand load failure', () => {
    it('names the network cause instead of the generic "fetch failed"', () => {
        // Node's fetch keeps the real reason on error.cause.
        const error = new TypeError('fetch failed', { cause: new Error('connect ECONNREFUSED 127.0.0.1:9944') });

        assert.equal(ShowWorkflowCommand.getLoadFailureReason(error), 'connect ECONNREFUSED 127.0.0.1:9944');
    });

    it('uses the error message when there is no cause', () => {
        const error = new Error('Failed to fetch resource list: 500 Internal Server Error');

        assert.equal(
            ShowWorkflowCommand.getLoadFailureReason(error),
            'Failed to fetch resource list: 500 Internal Server Error');
    });

    it('shows the failure on a page with the message escaped', () => {
        const html = ShowWorkflowCommand.getLoadFailureHtml('The G4 Hub at <http://localhost:9944> said "no" & left');

        assert.match(html, /The G4 Workflow designer could not be loaded/);
        assert.match(html, /The G4 Hub at &lt;http:\/\/localhost:9944&gt; said &quot;no&quot; &amp; left/);
        assert.doesNotMatch(html, /<http:\/\/localhost:9944>/);
    });
});
