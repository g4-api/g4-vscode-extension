# Troubleshooting checklist

[⬅ Back to overview](README.md)

When something's off, scan this table for your symptom, then check the likely cause. The last column points at the module with the full explanation.

| Symptom | Likely cause | What to check |
| --- | --- | --- |
| G4 won't start | `manifest.json` has a syntax error | Open in a JSON-aware editor; look for missing or extra commas or braces ([Module 1](01-meet-manifest.md)) |
| "Unauthorized" on every request | Token expired, missing, or malformed | Check `authentication.token`; re-paste from your license source on a single line ([Module 2](02-connect-to-the-engine.md)) |
| "Connection refused" reaching G4 | Wrong host/port, or G4 not running | Verify `g4Server` matches the actual engine address; confirm the engine is running ([Module 2](02-connect-to-the-engine.md)) |
| "Session not created" / driver errors | Driver service down or version mismatch | Confirm the Selenium/UIA hub is up at `driverBinaries`; match driver version to browser version ([Module 3](03-pick-your-driver.md)) |
| Workflows hang a long time before failing | Timeouts too high | Lower `loadTimeout` / `searchTimeout` while debugging ([Module 4](04-tune-workflow-behavior.md)) |
| Reports don't appear where expected | Reports go inside a `reports/` subfolder | Look in `reportsFolder/reports/` ([Module 6](06-control-your-output.md)) |
| Recordings replay with weird long pauses | `maxThinkTime` too high, or `min == max` long | Lower `maxThinkTime`; widen the range between `minThinkTime` and `maxThinkTime` ([Module 7](07-set-up-recording.md)) |
| Recordings replay too fast and break the app | Think time disabled or too low | Set `thinkTimeSettings.enabled: true` and raise `minThinkTime` ([Module 7](07-set-up-recording.md)) |
| Huge response payloads, client struggles | Screenshots embedded as base64 | Set `convertToBase64: false`; consider `onExceptionOnly: true` ([Module 6](06-control-your-output.md)) |
| No live logs in the IDE/console | Agent log push disabled or too slow | Set `agentLogSettings.enabled: true`; lower `interval` ([Module 5](05-see-whats-happening.md)) |
| Logs are completely silent | `sourceOptions.filter: "include"` with an empty list | Switch to `"exclude"` with `[]`, or list specific sources ([Module 5](05-see-whats-happening.md)) |
| MCP-derived plugins don't appear | `pluginsSettings.servers` misconfigured or unreachable | Confirm the MCP server starts standalone; check G4 startup logs ([Module 8](08-extend-g4.md)) |

---

**Back to** 👉 [the overview](README.md)
