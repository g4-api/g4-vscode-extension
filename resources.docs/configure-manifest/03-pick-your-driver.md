# Module 3: Pick your automation driver

[⬅ Back to overview](README.md) · [⬅ Module 2](02-connect-to-the-engine.md)

⏱️ **About 4 minutes**

A **driver** is the bridge between G4 and the thing it automates — a browser, a desktop app, an API. This module sets the **default** driver G4 uses when a workflow doesn't pick its own.

In this module, you will:

- Set the default `driver`
- Point G4 at the driver service with `driverBinaries`

---

## Step 1: `driverParameters` — the default driver

**What it is** — the default driver and where to find its service. **What it does** — decides which technology G4 speaks by default (Chrome, Edge, Firefox, a Windows desktop, etc.).

```json
"driverParameters": {
    "driver": "ChromeDriver",
    "driverBinaries": "http://localhost:4444/wd/hub"
}
```

**How to configure:**

- `driver` — the driver name (`ChromeDriver`, `EdgeDriver`, `FirefoxDriver`, `UiaDriver`, and so on).
- `driverBinaries` — where the driver service lives: a **Selenium hub URL** (typically `:4444/wd/hub`), **a local driver folder** (for example a sandbox's `drivers\chrome`), or `.`.

> **📝 Note:** This top-level `driverParameters` is the **default** fallback. The real per-automation browser/driver — including the browser `binary` and launch `args` — lives in your **base bot files** (and the workflow editor), which the sandbox fills in for you. A freshly created project may even start as `driver: "SimulatorDriver"` with `driverBinaries: "."` until you point it at a real driver.

**When to use it:**

- **Default Chrome via local Selenium** — most users keep `ChromeDriver` + `http://localhost:4444/wd/hub`.
- **Switch to Edge or Firefox** if your target app only behaves correctly in that browser.
- **Point `driverBinaries` at a remote hub** when browsers run on a different machine — a Selenium Grid, a Docker container, or a cloud provider like BrowserStack or Sauce Labs (using their URL).

> **⚠️ Pitfall:** The driver service must actually be running at that URL — "connection refused" or "session not created" usually means the hub isn't up. Also, the driver version must match the browser version on the target machine.

---

## ✔ Check your work

- [ ] `driver` names the technology you want by default (e.g., `ChromeDriver`)
- [ ] `driverBinaries` points at a driver service that is actually running
- [ ] The driver version matches the target browser version

---

**Next up** 👉 [Module 4: Tune how workflows run](04-tune-workflow-behavior.md)
