# Module 6: Control your run output

[⬅ Back to overview](README.md) · [⬅ Module 5](05-see-whats-happening.md)

⏱️ **About 6 minutes**

After a run, G4 can produce a report, capture screenshots, and return extra data in the response. This module covers all the "what comes back" settings so you can make responses as rich — or as lean — as you need.

In this module, you will:

- Configure the HTML run report
- Decide whether and how screenshots are captured
- Toggle the extra response data (environments, exceptions, performance points)

---

## Step 1: `clientReportSettings` — the run report

**What it is** — controls the **HTML report** G4 produces after a run.

```json
"clientReportSettings": {
    "autoView": true,
    "reportsFolder": ".",
    "saveReports": true
}
```

- `saveReports: true` — writes the HTML report to disk.
- `reportsFolder` — the **parent path** under which a `reports/` subfolder is created. So `"."` writes the report under **`./reports/`**, not directly into `.`.
- `autoView: true` — opens the report in your default browser when the run finishes.

**When to use it:**

- **Defaults** suit most desktop users who want to see results immediately.
- **`autoView: false`** in headless/CI runs — nobody is at the screen, and opening a browser may fail.
- **Change `reportsFolder`** to a shared path when several machines collect reports in one place (it still creates a `reports/` subfolder there).
- **`saveReports: false`** if your pipeline collects reports another way and you don't want disk clutter.

> **⚠️ Pitfall:** `reportsFolder: "."` does **not** drop the file in the working directory — look one level down in `reports/`. The folder must be writable by the user running G4.

---

## Step 2: `screenshotsSettings` — pictures during a run

**What it is** — controls whether and how G4 captures **screenshots**.

```json
"screenshotsSettings": {
    "convertToBase64": false,
    "onExceptionOnly": false,
    "outputFolder": ".",
    "returnScreenshots": false
}
```

- `returnScreenshots: true` — screenshots come back in the response.
- `convertToBase64: true` — screenshots are embedded directly in the JSON (no separate files).
- `onExceptionOnly: true` — only capture when something goes wrong (cheap forensic mode).
- `outputFolder` — where screenshot files are written when not embedded.

**When to use it:**

- **All `false`** — no screenshots; smallest, fastest runs.
- **`onExceptionOnly: true` + `returnScreenshots: true`** — great for production: low overhead, but a picture when something fails.
- **`returnScreenshots: true` + `convertToBase64: true`** — when your client wants everything inline and self-contained.
- **`returnScreenshots: true` + `convertToBase64: false` + a real `outputFolder`** — when you'd rather have files on disk than huge JSON.

> **⚠️ Pitfall:** `convertToBase64: true` makes responses **much** larger — don't combine it with screenshots-every-step on long workflows. The `outputFolder` must be writable.

---

## Step 3: The response-data toggles

Three small settings decide whether extra detail is included in the response. Each is a simple on/off.

**`environmentsSettings`** — the environment data (the variables/configuration used during the run) and whether it comes back.

```json
"environmentsSettings": {
    "defaultEnvironment": "SystemParameters",
    "environmentVariables": null,
    "returnEnvironment": false
}
```

- `defaultEnvironment` — the environment used when a workflow doesn't pick one (default `SystemParameters`).
- `environmentVariables` — inline environment values, or `null` to use the defaults.
- `returnEnvironment` — set **`true`** to include the resolved environment in the response (traceability); leave **`false`** if it may hold sensitive data or you want a smaller response.

**`exceptionsSettings.returnExceptions`** — return error/exception details (type, message, usually a stack).

```json
"exceptionsSettings": {
    "returnExceptions": true
}
```

- **Keep `true`** during development and whenever you want to know *why* a run failed.
- **Set `false`** only for a smaller, cleaner response when you trust the run is healthy (rare).

**`performancePointsSettings.returnPerformancePoints`** — return timings at named checkpoints in a workflow.

```json
"performancePointsSettings": {
    "returnPerformancePoints": true
}
```

- **Keep `true`** if you track performance regressions or chart timings.
- **Set `false`** for the smallest response when you only care about pass/fail.

> **⚠️ Pitfall:** Both environments and exceptions can leak internal details (secrets, paths, internal IDs). If your responses are logged or exposed externally, consider turning these off.

---

## ✔ Check your work

- [ ] Reports go where you expect (remember the `reports/` subfolder), with `autoView` off for CI
- [ ] Screenshots match your need — off for speed, `onExceptionOnly` for cheap forensics, base64 only when a client needs it inline
- [ ] The response-data toggles are set with any sensitive-data concerns in mind

---

**Next up** 👉 [Module 7: Set up desktop recording](07-set-up-recording.md)
