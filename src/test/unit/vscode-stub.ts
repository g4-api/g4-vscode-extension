/*
 * Stand-in for the 'vscode' module, so unit tests can load extension code in plain Node.
 *
 * Loaded by mocha with --require before any test file. The real 'vscode' module exists only inside
 * the VS Code extension host; extension modules import it at load time (for example Channels creates
 * its output channels), so without a stand-in every import of extension code fails.
 */
import Module = require('node:module');

/**
 * Creates a stand-in value that accepts any use: every property read, call and construction
 * returns another stand-in.
 *
 * @remarks
 * Tests that need real behaviour (for example a logger) inject it; the stand-in only lets modules
 * load and lets unrelated calls do nothing. It reports no `then`, so awaiting it does not hang, and
 * it converts to an empty string and iterates as an empty list.
 *
 * @returns A callable, constructible proxy.
 */
const newStandIn = (): any => {
    // A function target makes the proxy callable and constructible.
    const target = function standIn(): void { /* Stand-in calls do nothing. */ };

    return new Proxy(target, {
        apply: () => newStandIn(),
        construct: () => newStandIn(),
        get: (_target, property) => {
            // A stand-in must not look like a promise, or awaiting it would never settle.
            if (property === 'then') {
                return undefined;
            }

            // Let string conversion and iteration work instead of throwing.
            if (property === Symbol.toPrimitive) {
                return () => '';
            }

            if (property === Symbol.iterator) {
                return function* emptyIterator(): Generator<never> { /* No items. */ };
            }

            return newStandIn();
        }
    });
};

// The stand-in served for every import of 'vscode'.
const vscodeStandIn = newStandIn();

// Node's internal module loader; patched so 'vscode' resolves to the stand-in.
const moduleLoader = Module as unknown as { _load: (request: string, ...rest: unknown[]) => unknown; };
const loadModule = moduleLoader._load;

moduleLoader._load = (request: string, ...rest: unknown[]): unknown => {
    // Serve the stand-in for 'vscode' and load every other module normally.
    return request === 'vscode'
        ? vscodeStandIn
        : loadModule(request, ...rest);
};
