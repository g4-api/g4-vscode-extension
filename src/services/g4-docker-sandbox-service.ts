/*
 * Defaults for projects that run against the G4 Docker sandbox (the sandbox docker-compose stack).
 *
 * RESOURCES:
 * Sandbox compose file: g4-sandbox/src/docker-compose/docker-compose.yml
 */

/**
 * Owns the values a project needs to work with the G4 Docker sandbox, and the checks that depend on them.
 *
 * @remarks
 * In the Docker sandbox the Hub, the Selenium Grid and the Chromium recorder run as compose services. The
 * extension on the host reaches the Hub through its published port, but the Hub reaches the Grid and the
 * recorder by their compose service names. Every such name lives here so New-Project and Start-Recorder
 * cannot drift apart. All members are compute-only: nothing here reads files, opens UI or keeps state.
 */
export class G4DockerSandboxService {
    /** Value of the manifest `sandboxType` field that marks a Docker sandbox project. */
    public static readonly sandboxType: string = 'docker';

    // Driver identity of the Chromium recorder entry in the manifest; the only recorder the compose stack has.
    private static readonly _chromeDriverName: string = 'ChromeDriver';

    // Host used for the recording browser link when the manifest does not name the Hub host.
    private static readonly _defaultHost: string = 'localhost';

    // Selenium Grid endpoint as the Hub container sees it: the compose service name of the Grid router.
    private static readonly _gridUrl: string = 'http://router:4444/wd/hub';

    // Recorder host as the Hub container sees it: the compose service name of the Chromium recorder.
    private static readonly _recorderHost: string = 'chromium-recorder';

    // Host port the compose file publishes for the recorder container's noVNC viewer (container port 7900).
    private static readonly _recordingBrowserPort: number = 7901;

    /**
     * Rewrites Chrome automation-base content so it runs on the Docker sandbox.
     *
     * @remarks
     * Compute-only. The driver endpoint becomes the Grid router and the browser binary is removed, because the
     * Grid node and the recorder container each bring their own Chrome and a host path would not exist there.
     * Content that cannot be parsed is returned unchanged so a resource defect does not block project creation.
     *
     * @param resourceContent - Serialized Chrome automation base.
     * @returns Serialized automation base for the Docker sandbox.
     */
    public static getChromeBaseContent(resourceContent: string): string {
        try {
            // Parse the complete resource so every field outside the driver parameters is kept as packaged.
            const chromeAutomationBase = JSON.parse(resourceContent) as DockerAutomationBase;
            const driverParameters = chromeAutomationBase.driverParameters;

            // Leave a base without driver parameters untouched rather than inventing a section for it.
            if (driverParameters === undefined) {
                return resourceContent;
            }

            // Point the driver at the Grid and drop the host browser path, as every Docker driver entry needs.
            this.setDriverDefaults(driverParameters);

            // Serialize the complete parsed object so unmodeled packaged fields remain intact.
            return JSON.stringify(chromeAutomationBase, null, '\t');
        } catch {
            // Return the untouched resource when parsing fails so the rest of the project is still created.
            return resourceContent;
        }
    }

    /**
     * Gets the address of the browser the Docker sandbox records, shown through the recorder's noVNC viewer.
     *
     * @remarks
     * Compute-only. Chrome opens inside the recorder container, so the user watches and drives it through this
     * page instead of a window on the desktop. The host is the Hub host from the manifest, because the Hub and
     * the recorder are published by the same Docker machine.
     *
     * @param manifest - The project manifest.
     * @returns The viewer address, or undefined when the project does not use the Docker sandbox.
     */
    public static getRecordingBrowserUrl(manifest: DockerSandboxManifest | null | undefined): string | undefined {
        // Only a Docker sandbox project has a recording browser behind a viewer page.
        if (!this.testDockerSandbox(manifest)) {
            return undefined;
        }

        // Narrow the Hub host to a usable string so an unexpected manifest value cannot reach the address.
        const hostValue = manifest?.g4Server?.host;
        const isHostAvailable = typeof hostValue === 'string' && hostValue.trim().length > 0;
        const host = isHostAvailable
            ? hostValue.trim()
            : this._defaultHost;

        // Connect on load and scale the remote screen to the tab so the user lands directly on the browser.
        return `http://${host}:${this._recordingBrowserPort}/?autoconnect=1&resize=scale`;
    }

    /**
     * Applies the Docker sandbox defaults to a project manifest.
     *
     * @remarks
     * Mutates only the manifest passed by the caller. Used for a new project and when the settings page turns
     * the Docker sandbox on for an existing one. The local sandbox folder is removed because a Docker project
     * has none. The Chromium recorder is switched on because it is the only recorder the compose stack has;
     * the desktop, SAP and Android recorders are left as they are. Local recorder start is switched off
     * because the recorder already runs as a compose service.
     *
     * @param manifest - The manifest to change: a new project's clone, or the settings page's working copy.
     */
    public static setManifestDefaults(manifest: DockerSandboxManifest): void {
        // Mark the project so later commands know the sandbox is the compose stack, not a local folder.
        manifest.sandboxType = this.sandboxType;

        // Remove the local sandbox folder so nothing tries to start services from it beside the compose stack.
        delete manifest.sandbox;

        // Point project-level automation at the Grid router the Hub container can reach.
        if (manifest.driverParameters !== undefined) {
            manifest.driverParameters.driverBinaries = this._gridUrl;
        }

        // Leave a manifest without recorder settings as it is rather than assuming their schema defaults.
        const recorderSettings = manifest.settings?.recorderSettings;

        if (recorderSettings === undefined) {
            return;
        }

        // Keep local recorder start off so the extension never launches a second recorder on the host.
        recorderSettings.useSandbox = false;

        // Match the Chromium recorder by driver identity so recorder order in the manifest does not matter.
        const chromiumRecorder = (recorderSettings.recorders ?? []).find(recorder => {
            return recorder.driverParameters?.driver === this._chromeDriverName;
        });

        if (chromiumRecorder === undefined) {
            return;
        }

        // Address the recorder by its compose service name and switch it on so recording works right away.
        chromiumRecorder.host = this._recorderHost;
        chromiumRecorder.enabled = true;

        // Give the recorder the Grid endpoint and no host browser path, so an existing project's local
        // values cannot reach the recorder container.
        if (chromiumRecorder.driverParameters !== undefined) {
            this.setDriverDefaults(chromiumRecorder.driverParameters);
        }
    }

    /**
     * Tests whether a manifest belongs to a Docker sandbox project.
     *
     * @remarks
     * Compute-only. The comparison ignores letter case so a hand-edited manifest still matches.
     *
     * @param manifest - The project manifest; absent when no project is open.
     * @returns True when the manifest is marked as a Docker sandbox project.
     */
    public static testDockerSandbox(manifest: DockerSandboxManifest | null | undefined): boolean {
        // Narrow the marker to text first, because the manifest is not typed at its source and any other value
        // means the project was never marked as a Docker sandbox.
        const sandboxType = manifest?.sandboxType;

        if (typeof sandboxType !== 'string') {
            return false;
        }

        return sandboxType.trim().toLowerCase() === this.sandboxType;
    }

    /**
     * Points one Chrome driver entry at the Docker sandbox.
     *
     * @remarks
     * Mutates the driver parameters passed by the caller. Shared by the base bot and the recorder entry so
     * both always get the same endpoint.
     *
     * @param driverParameters - The driver settings to change.
     */
    private static setDriverDefaults(driverParameters: DockerDriverParameters): void {
        // Send sessions to the Grid router, the only driver endpoint the Hub container can reach.
        driverParameters.driverBinaries = this._gridUrl;

        // Drop a host browser path so the container that starts Chrome uses its own browser.
        const chromeOptions = driverParameters.capabilities?.alwaysMatch?.['goog:chromeOptions'];

        if (chromeOptions !== undefined) {
            delete chromeOptions.binary;
        }
    }
}

// Compile-time contracts are kept after the executable code: interfaces come before type aliases, and within
// each group a declaration is followed by the contracts it depends on, otherwise the order is A-Z.

/**
 * Automation-base fields rewritten for the Docker sandbox.
 *
 * @remarks
 * Packaged base files contain many more properties; only the driver parameters are modeled because they are
 * the only part this service changes. JSON serialization keeps every other parsed property.
 */
interface DockerAutomationBase {
    /** Driver settings whose endpoint and browser path are rewritten. */
    driverParameters?: DockerDriverParameters;
}

/**
 * Minimal manifest fields read or changed for a Docker sandbox project.
 *
 * @remarks
 * The full manifest has authentication, automation and logging sections; this partial contract models only
 * the marker, the Hub host and the driver and recorder settings this service touches.
 */
export interface DockerSandboxManifest {
    /** Project-level driver settings; absent in a partial manifest, which is then left unchanged. */
    driverParameters?: DockerDriverParameters;

    /** Hub endpoint; only the host is read, to build the recording browser address. */
    g4Server?: {
        /** Candidate Hub host; `unknown` because the manifest is not typed at its source. */
        host?: unknown;
    };

    /** Local sandbox folder; removed for a Docker sandbox project, which has none. */
    sandbox?: unknown;

    /** Sandbox kind marker; `docker` for a Docker sandbox project, absent for every other project. */
    sandboxType?: unknown;

    /** Settings subset that holds the recorder configuration. */
    settings?: {
        /** Recorder settings; absent in a partial manifest, which is then left unchanged. */
        recorderSettings?: {
            /** Recorder entries, searched by driver identity rather than array position. */
            recorders?: DockerRecorderConfiguration[];

            /** Whether the extension starts recorder processes from a local sandbox folder. */
            useSandbox?: boolean;
        };
    };
}

/**
 * Recorder fields changed for the Docker sandbox.
 *
 * @remarks
 * Recorder mode, think time and scripts stay outside this partial contract because the Docker defaults
 * change only where the recorder is and whether it is on.
 */
interface DockerRecorderConfiguration {
    /** Driver settings used to recognize the Chromium recorder. */
    driverParameters?: DockerDriverParameters;

    /** Whether the recorder takes part in a recording session. */
    enabled?: boolean;

    /** Recorder host as the Hub sees it. */
    host?: string;
}

/**
 * Driver fields read or rewritten for the Docker sandbox.
 *
 * @remarks
 * The complete driver contract has more capability groups and matching rules; only the identity, the
 * endpoint and the Chrome browser path are modeled.
 */
interface DockerDriverParameters {
    /** W3C capability groups sent to the driver. */
    capabilities?: {
        /** Capabilities applied to every session. */
        alwaysMatch?: {
            /** Chrome options, which hold the browser path. */
            'goog:chromeOptions'?: {
                /** Browser executable path; removed because it would point at the host. */
                binary?: string;
            };
        };
    };

    /** Stable driver identity, for example `ChromeDriver`. */
    driver?: string;

    /** Local directory or remote endpoint used to resolve the driver service. */
    driverBinaries?: string;
}
