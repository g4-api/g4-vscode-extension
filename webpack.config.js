//@ts-check

import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ESM replacement for CommonJS __dirname.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** @typedef {import('webpack').Configuration} WebpackConfig **/

/** @type WebpackConfig */
const extensionConfig = {
    target: 'node',

    // Keep output close to source for easier debugging.
    mode: 'none',

    // Entry point of the extension.
    entry: './src/extension.ts',

    output: {
        // package.json points to ./dist/extension.js
        path: path.resolve(__dirname, 'dist'),
        filename: 'extension.js',
        libraryTarget: 'commonjs2',

        // Makes source-map paths easier for VS Code to resolve.
        devtoolModuleFilenameTemplate: '../[resource-path]',

        // Cleans stale bundle/map files before each build.
        clean: true
    },

    externalsPresets: {
        node: true
    },

    externals: {
        // VS Code host module.
        vscode: 'commonjs vscode',

        // Native addon — keep OUT of the bundle.
        'uiohook-napi': 'commonjs uiohook-napi'
    },

    resolve: {
        extensions: ['.ts', '.js']
    },

    module: {
        rules: [
            {
                test: /\.ts$/,
                exclude: /node_modules/,
                use: [
                    {
                        loader: 'ts-loader'
                    }
                ]
            }
        ]
    },

    // Better for debugging than nosources-source-map.
    // Your package script can still override this for production:
    // webpack --mode production --devtool hidden-source-map
    devtool: 'source-map',

    infrastructureLogging: {
        level: 'log'
    }
};

export default [extensionConfig];