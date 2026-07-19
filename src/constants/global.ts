import { G4Client } from '../clients/g4-client';
import { Utilities } from '../extensions/utilities';
import { ExtensionLogger } from '../logging/extensions-logger';
import { Logger } from '../logging/logger';
import { Channels } from './channels';
import * as vscode from 'vscode';

export class Global {
    // The base URL for the G4 Hub API.
    private static _baseHubUrl: string;

    /** The base manifest for the G4 Hub API. */
    public static readonly BASE_MANIFEST: any = {
        "g4Server": {
            "schema": "http",
            "host": "localhost",
            "port": "9944"
        },
        "authentication": {
            "token": ""
        },
        "driverParameters": {
            "driver": "ChromeDriver",
            "driverBinaries": "http://localhost:4444/wd/hub"
        },
        "settings": {
            "automationSettings": {
                "loadTimeout": 60000,
                "maxParallel": 1,
                "returnFlatResponse": true,
                "returnStructuredResponse": true,
                "searchTimeout": 15000
            },
            "clientLogConfiguration": {
                "agentLogConfiguration": {
                    "enabled": true,
                    "interval": 1000
                },
                "logLevel": "information",
                "sourceOptions": {
                    "filter": "include",
                    "sources": []
                }
            },
            "clientReportSettings": {
                "autoView": true,
                "reportsFolder": ".",
                "saveReports": true
            },
            "recorderSettings": {
                "enabled": true,
                "useSandbox": false,
                "recorders": [
                    {
                        "enabled": true,
                        "mode": "standard",
                        "schema": "http",
                        "host": "localhost",
                        "port": "9955",
                        "driverParameters": {
                            "capabilities": {
                                "alwaysMatch": {
                                    "browserName": "Uia",
                                    "uia:options": {
                                        "label": "machine-a"
                                    }
                                }
                            },
                            "driver": "UiaDriver",
                            "driverBinaries": "http://localhost:4444/wd/hub",
                            "firstMatch": [
                                {}
                            ]
                        },
                        "thinkTimeSettings": {
                            "enabled": true,
                            "maxThinkTime": 10000,
                            "minThinkTime": 3000
                        },
                        "preScript": {
                            "enabled": false,
                            "shell": "powershell",
                            "script": ""
                        },
                        "postScript": {
                            "enabled": false,
                            "shell": "powershell",
                            "script": ""
                        }
                    },
                    {
                        "enabled": true,
                        "mode": "standard",
                        "schema": "http",
                        "host": "localhost",
                        "port": "9956",
                        "driverParameters": {
                            "capabilities": {
                                "alwaysMatch": {
                                    "browserName": "chrome",
                                    "goog:chromeOptions": {
                                        "binary": String.raw`C:\g4-sandbox\browsers\chrome\chrome.exe`,
                                        "args": [
                                            "--disable-gpu"
                                        ]
                                    }
                                }
                            },
                            "driver": "ChromeDriver",
                            "driverBinaries": "http://localhost:4444/wd/hub",
                            "firstMatch": [
                                {}
                            ]
                        },
                        "thinkTimeSettings": {
                            "enabled": false,
                            "maxThinkTime": 10000,
                            "minThinkTime": 3000
                        },
                        "preScript": {
                            "enabled": false,
                            "shell": "powershell",
                            "script": ""
                        },
                        "postScript": {
                            "enabled": false,
                            "shell": "powershell",
                            "script": ""
                        }
                    }
                ]
            },
            "exceptionsSettings": {
                "returnExceptions": true
            },
            "queueManagerSettings": {
                "properties": null,
                "type": null
            },
            "performancePointsSettings": {
                "returnPerformancePoints": true
            },
            "pluginsSettings": {
                "externalRepositories": null,
                "forceRuleReference": true
            },
            "screenshotsSettings": {
                "convertToBase64": false,
                "onExceptionOnly": false,
                "outputFolder": ".",
                "returnScreenshots": false
            }
        }
    };

    /**
     * Gets the base URL for the G4 Hub API.
     *
     * Behavior:
     * - Returns the cached base hub URL when it is already set.
     * - Resolves the URL from the extension configuration when missing.
     * - Falls back to the local G4 Hub default URL when no configured value exists.
     *
     * Used to construct API endpoints for communication with the G4 Hub.
     *
     * @returns The base URL used to communicate with the G4 Hub API.
     */
    public static get baseHubUrl(): string {
        // Resolve and cache the base hub URL only when it was not already initialized.
        if (!this._baseHubUrl) {
            this._baseHubUrl = Utilities.getG4Endpoint() || 'http://localhost:9944';
        }

        // Return the cached G4 Hub base URL.
        return this._baseHubUrl;
    }

    /**
     * Sets the base URL for the G4 Hub API.
     *
     * This allows callers to override the cached hub URL manually.
     * The value is stored as-is and is not validated or normalized here.
     *
     * @param value - The new base URL to use for the G4 Hub API.
     */
    public static set baseHubUrl(value: string) {
        // Store the provided hub URL so future reads use this value.
        this._baseHubUrl = value;
    }

    /**
     * Creates a G4 API client using the configured G4 Hub base URL.
     *
     * Behavior:
     * - Uses the resolved G4 Hub base URL.
     * - Creates and returns a new G4Client when the URL exists.
     * - Logs, shows a warning, and throws an error when the URL is missing.
     *
     * @returns A new G4Client instance configured with the G4 Hub base URL.
     * @throws Error when the G4 Hub URL is not configured.
     */
    public static get g4Client(): G4Client {
        // Resolve the configured G4 Hub base URL.
        const baseHubUrl = this.baseHubUrl;

        // If the hub URL exists, create a client using that URL.
        if (baseHubUrl) {
            return new G4Client(baseHubUrl);
        }

        // Build a clear configuration error message for logs and the VS Code UI.
        const message = 'G4 Hub URL is not set. ' +
            'Please configure the "g4Server" settings in ' +
            'your manifest and reload the extension to connect to the G4 Hub API.';

        // Write the warning to the extension logger.
        this.logger.warning(message);

        // Show the warning in the VS Code UI.
        vscode.window.showWarningMessage(message);

        // Stop execution because the client cannot be created safely without a URL.
        throw new Error(message);
    }

    /**
     * The logger instance for the extension.
     * This is used to log messages to the VS Code Output panel.
     */
    public static get logger(): Logger {
        return new ExtensionLogger(Channels.extension, 'ExtensionLogger', Utilities.getLogSettings());
    }
}
