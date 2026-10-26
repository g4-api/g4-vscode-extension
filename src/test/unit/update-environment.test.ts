/*
 * Unit tests for the Update-Environment file parser (STU-05).
 *
 * Each test writes an environment file to a temporary folder and reads it with the command's parser.
 */
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { UpdateEnvironmentCommand } from '../../commands/update-environment';

// The parser is private; the tests reach it by name to check the file formats without the Hub.
const readEnvironment = (UpdateEnvironmentCommand as unknown as {
    readEnvironment: (environmentFilePath: string) => { environment?: Record<string, unknown>; error?: string; };
}).readEnvironment;

describe('UpdateEnvironmentCommand.readEnvironment', () => {
    let folder = '';

    beforeEach(() => {
        // Give every test its own folder, so files cannot leak between tests.
        folder = fs.mkdtempSync(path.join(os.tmpdir(), 'g4-environment-'));
    });

    afterEach(() => {
        // Remove the test files.
        fs.rmSync(folder, { force: true, recursive: true });
    });

    // Writes one environment file into the test folder and returns its path.
    const writeEnvironmentFile = (fileName: string, text: string): string => {
        const filePath = path.join(folder, fileName);
        fs.writeFileSync(filePath, text, 'utf8');

        return filePath;
    };

    it('splits each line at the first "=" so a value can contain "="', () => {
        const filePath = writeEnvironmentFile('AtpStudio.env', 'AtpQuery=a=b\r\nAtpUser = atp-user \r\n');

        assert.deepEqual(readEnvironment(filePath), { environment: { AtpQuery: 'a=b', AtpUser: 'atp-user' } });
    });

    it('keeps "KEY=" as an empty value and skips comments, blank lines and lines without a key', () => {
        const filePath = writeEnvironmentFile('AtpStudio.env', '# comment\n\nAtpCleared=\n=orphan\nno-separator\n');

        assert.deepEqual(readEnvironment(filePath), { environment: { AtpCleared: '' } });
    });

    it('parses a .json file as one object, ignoring a UTF-8 BOM', () => {
        const filePath = writeEnvironmentFile('AtpEnv.json', '\uFEFF{ "AtpPattern": "^a=b$", "AtpGreeting": "Hello" }');

        assert.deepEqual(readEnvironment(filePath), { environment: { AtpPattern: '^a=b$', AtpGreeting: 'Hello' } });
    });

    it('refuses a .json file that is not a JSON object', () => {
        const filePath = writeEnvironmentFile('AtpEnv.json', '["AtpPattern"]');

        const expectedError = 'The file must hold one JSON object of parameter names and values.';

        assert.deepEqual(readEnvironment(filePath), { error: expectedError });
    });

    it('refuses a .json file with a syntax error and names the reason', () => {
        const filePath = writeEnvironmentFile('AtpEnv.json', '{ "AtpPattern": ');
        const { environment, error } = readEnvironment(filePath);

        assert.equal(environment, undefined);
        assert.match(error ?? '', /^The file is not valid JSON: /);
    });

    it('refuses a file with no entries, so it is not uploaded as {}', () => {
        const filePath = writeEnvironmentFile('AtpEmpty.env', '# only a comment\n');

        assert.deepEqual(readEnvironment(filePath), { error: 'The file has no KEY=value lines.' });
    });
});
