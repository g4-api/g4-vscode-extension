import { G4Client } from '../clients/g4-client';
import { Utilities } from '../extensions/utilities';
import { ExtensionLogger } from '../logging/extensions-logger';
import { Logger } from '../logging/logger';
import { Channels } from './channels';

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
            "password": null,
            "token": "",
            "username": null
        },
        "driverParameters": {
            "driver": "SimulatorDriver",
            "driverBinaries": "."
        },
        "settings": {
            "automationSettings": {
                "loadTimeout": 60000,
                "maxParallel": 1,
                "returnFlatResponse": true,
                "returnStructuredResponse": true,
                "searchTimeout": 15000
            },
            "clientLogSettings": {
                "agentLogSettings": {
                    "enabled": true,
                    "interval": 1000
                },
                "logLevel": "information",
                "sourceOptions": {
                    "filter": "include",
                    "sources": []
                }
            },
            "environmentsSettings": {
                "defaultEnvironment": "SystemParameters",
                "environmentVariables": null,
                "returnEnvironment": false
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
                "forceRuleReference": true,
                "servers": null
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
     * Used to construct API endpoints for communication with the G4 Hub.
     */
    public static get baseHubUrl(): string {
        return this._baseHubUrl;
    }

    /**
     * Sets the base URL for the G4 Hub API.
     * If the provided value is falsy, it defaults to "http://localhost:9944".
     *
     * @param value - The new base URL to use for the G4 Hub API.
     */
    public static set baseHubUrl(value: string) {
        if (!value) {
            value = 'http://localhost:9944';
        }
        this._baseHubUrl = value;
    }

    /**
     * Returns a singleton instance of the G4Client configured with the base hub URL.
     * This allows other parts of the extension to access the G4 API without needing to
     * create a new client instance each time.
     */
    public static get g4Client(): G4Client {
        return new G4Client(this.baseHubUrl);
    }

    /**
     * The logger instance for the extension.
     * This is used to log messages to the VS Code Output panel.
     */
    public static get logger(): Logger {
        return new ExtensionLogger(Channels.extension, 'ExtensionLogger', Utilities.getLogSettings());
    }
}
