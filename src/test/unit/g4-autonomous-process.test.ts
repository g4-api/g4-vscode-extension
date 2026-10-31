/*
 * Unit tests for the autonomous agent process: how a native executable and a partition launcher are
 * started, which launcher arguments are refused, and a real child that receives the brief on standard
 * input and streams it back line by line.
 */
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { G4AutonomousProcess } from '../../services/g4-autonomous-process';

// How long stopping a process tree may take; taskkill can be slow on a busy machine.
const STOP_TIMEOUT_MILLISECONDS = 15000;

describe('G4AutonomousProcess invocation', () => {
    it('passes the arguments of a native executable as a list', () => {
        const invocation = G4AutonomousProcess.getInvocation('codex.exe', ['exec', '--json', '-C', String.raw`E:\runs\a b`]);

        assert.deepEqual(invocation, {
            argumentsList: ['exec', '--json', '-C', String.raw`E:\runs\a b`],
            command: 'codex.exe',
            isVerbatim: false
        });
    });

    it('starts a partition launcher through cmd.exe with every part quoted', () => {
        const invocation = G4AutonomousProcess.getInvocation(
            String.raw`E:\partitions\g4 explorer\start-claude.cmd`,
            ['--print', '--add-dir', String.raw`E:\runs\a b`]);

        assert.equal(invocation.isVerbatim, true);
        assert.deepEqual(invocation.argumentsList, [
            '/d',
            '/s',
            '/c',
            String.raw`""E:\partitions\g4 explorer\start-claude.cmd" "--print" "--add-dir" "E:\runs\a b""`
        ]);
    });

    it('refuses launcher arguments that cmd.exe would expand or that would end a quote', () => {
        // The last argument ends with a backslash, which the tool would read as an escaped quote.
        const trailingBackslashFolder = 'E:\\runs\\'; // NOSONAR
        const unsafeArguments = ['100%', 'say "hi"', 'line\nbreak', trailingBackslashFolder];

        for (const unsafeArgument of unsafeArguments) {
            assert.throws(() => G4AutonomousProcess.getInvocation('start-claude.cmd', [unsafeArgument]), /cannot pass on safely/);
        }
    });
});

describe('G4AutonomousProcess run', () => {
    it('writes the input, streams the output lines, and reports the exit code', async () => {
        // A Node child that echoes its input and exits with 3 once the input ends.
        const agentProcess = new G4AutonomousProcess();
        const outputLines: string[] = [];
        const echoScript = 'process.stdin.pipe(process.stdout); process.stdin.on("end", () => process.exit(3));';

        agentProcess.start({
            argumentsList: ['-e', echoScript],
            environment: process.env,
            executable: process.execPath,
            inputText: 'first line\r\nsecond line\nlast line without ending',
            onError: () => undefined,
            onErrorLine: () => undefined,
            onOutputLine: (line) => outputLines.push(line),
            workingDirectory: os.tmpdir()
        });

        // The lines come back without their endings, the last one too, and the exit code is kept.
        const exitCode = await agentProcess.exited;

        assert.equal(exitCode, 3);
        assert.deepEqual(outputLines, ['first line', 'second line', 'last line without ending']);
    });

    it('stops a running process and every process it started', async function () {
        this.timeout(STOP_TIMEOUT_MILLISECONDS);

        // A Node child that never ends on its own.
        const agentProcess = new G4AutonomousProcess();

        agentProcess.start({
            argumentsList: ['-e', 'setInterval(() => undefined, 1000);'],
            environment: process.env,
            executable: process.execPath,
            inputText: '',
            onError: () => undefined,
            onErrorLine: () => undefined,
            onOutputLine: () => undefined,
            workingDirectory: os.tmpdir()
        });

        // Stopping ends it, so it never reports a clean exit.
        await agentProcess.stop();
        const exitCode = await agentProcess.exited;

        assert.notEqual(exitCode, 0);
    });

    it('passes launcher arguments with spaces through cmd.exe unchanged', async function () {
        // Batch launchers exist on Windows only.
        if (process.platform !== 'win32') {
            this.skip();
        }

        const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'g4 autonomous '));
        const launcherPath = path.join(folder, 'start-echo.cmd');
        const outputLines: string[] = [];
        const agentProcess = new G4AutonomousProcess();

        // A launcher that prints its first two arguments, each in brackets, from a folder with a space.
        fs.writeFileSync(launcherPath, '@echo off\r\necho [%~1]\r\necho [%~2]\r\nexit /b 0\r\n');

        try {
            agentProcess.start({
                argumentsList: [String.raw`E:\runs\a b`, '--model=claude-opus-5-5'],
                environment: process.env,
                executable: launcherPath,
                inputText: '',
                onError: () => undefined,
                onErrorLine: () => undefined,
                onOutputLine: (line) => outputLines.push(line),
                workingDirectory: folder
            });

            assert.equal(await agentProcess.exited, 0);
            assert.deepEqual(outputLines, [String.raw`[E:\runs\a b]`, '[--model=claude-opus-5-5]']);
        } finally {
            fs.rmSync(folder, { force: true, recursive: true });
        }
    });
});
