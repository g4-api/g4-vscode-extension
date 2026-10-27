/*
 * Unit tests for G4Client.getCacheSyncIssues (N-07): the problems a successful cache sync reports.
 *
 * The bodies mirror what the Hub's POST cache/sync returns, including its omission of default values.
 */
import * as assert from 'node:assert/strict';

import { G4Client } from '../../clients/g4-client';

describe('G4Client.getCacheSyncIssues', () => {
    it('reports an MCP server that was not synchronized, with its error', () => {
        // The Hub omits isSynced (false) and pluginCount (0) for a server that failed.
        const body = {
            servers: [
                {
                    error: 'No connection could be made because the target machine actively refused it.',
                    name: 'atp-dead',
                    rejectedPlugins: {},
                    url: 'http://localhost:1/mcp'
                }
            ]
        };

        const issues = G4Client.getCacheSyncIssues(body);

        assert.deepEqual(issues, [
            "MCP server 'atp-dead' (http://localhost:1/mcp) was not synchronized: "
            + 'No connection could be made because the target machine actively refused it.'
        ]);
    });

    it('reports every tool the engine rejected from a server that synchronized', () => {
        const body = {
            servers: [
                {
                    isSynced: true,
                    name: 'atp-live',
                    pluginCount: 3,
                    rejectedPlugins: { 'g4.Broken': 'The tool could not be converted to a G4 manifest.' },
                    url: 'http://localhost:9944/api/v4/g4/mcp'
                }
            ]
        };

        const issues = G4Client.getCacheSyncIssues(body);

        assert.deepEqual(issues, [
            "MCP server 'atp-live' (http://localhost:9944/api/v4/g4/mcp): the tool 'g4.Broken' was rejected: "
            + 'The tool could not be converted to a G4 manifest.'
        ]);
    });

    it('reports nothing for servers that synchronized without rejections', () => {
        const body = {
            servers: [
                { isSynced: true, name: 'atp-live', pluginCount: 21, url: 'http://localhost:9944/api/v4/g4/mcp' }
            ]
        };

        assert.deepEqual(G4Client.getCacheSyncIssues(body), []);
    });

    it('reports nothing for a body without per-server results, such as an empty 204 answer', () => {
        assert.deepEqual(G4Client.getCacheSyncIssues(''), []);
        assert.deepEqual(G4Client.getCacheSyncIssues(undefined), []);
        assert.deepEqual(G4Client.getCacheSyncIssues({ servers: [] }), []);
    });

    it('names a failed server without a URL or error without printing empty values', () => {
        const issues = G4Client.getCacheSyncIssues({ servers: [{ name: 'local-tool' }] });

        assert.deepEqual(issues, ["MCP server 'local-tool' was not synchronized: no reason was given"]);
    });
});
