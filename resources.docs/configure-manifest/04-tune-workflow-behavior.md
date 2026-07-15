# Module 4: Tune how workflows run

[⬅ Back to overview](README.md) · [⬅ Module 3](03-pick-your-driver.md)

⏱️ **About 5 minutes**

`settings.automationSettings` controls the **runtime behavior of every workflow** — how long G4 waits, how many run at once, and how much data comes back.

```json
"automationSettings": {
    "loadTimeout": 60000,
    "maxParallel": 1,
    "returnFlatResponse": true,
    "returnStructuredResponse": true,
    "searchTimeout": 15000
}
```

In this module, you will:

- Set page and element timeouts
- Choose how many workflows run in parallel
- Choose the shape of the response

---

## Step 1: `loadTimeout` — waiting for a page

**What it is** — the maximum time (milliseconds) G4 waits for a page or screen to finish loading before failing the step with a timeout.

**When to use it:**

- **60000 (1 minute)** is a safe default for most web apps.
- **Raise it** (e.g., `120000`) for slow internal apps, heavy dashboards, or congested networks.
- **Lower it** (e.g., `15000`) in fast-feedback test loops where you'd rather fail quickly.

> **⚠️ Pitfall:** Too low means false failures on slow days; too high means a workflow hangs for minutes when something is genuinely broken.

---

## Step 2: `searchTimeout` — waiting for an element

**What it is** — the maximum time (milliseconds) G4 spends looking for an element (a button, a field) before failing with "element not found".

**When to use it:**

- **15000 (15 s)** is a good default.
- **Raise it** for apps with very lazy or animated UIs.
- **Lower it** when elements appear instantly and you want faster failure.

> **⚠️ Pitfall:** Raising it hides flaky UIs by waiting them out — sometimes you'd rather know the UI is slow.

---

## Step 3: `maxParallel` — how many at once

**What it is** — how many workflows this engine runs at the same time. `1` means strictly one at a time; higher numbers run several concurrently.

**When to use it:**

- **Keep `1`** when workflows share resources (the same browser session, desktop, or file).
- **Raise it** (e.g., `4`) for isolated runs you want to finish faster — but only if your driver setup supports parallel sessions (like a Selenium Grid).

> **⚠️ Pitfall:** Running parallel workflows on a single desktop usually breaks both. Don't raise this above `1` for desktop or recorder workflows.

---

## Step 4: `returnFlatResponse` / `returnStructuredResponse`

**What they are** — toggles for the **shape** of the response sent back after a run.

- `returnFlatResponse: true` — include a flat, simple key/value view.
- `returnStructuredResponse: true` — include a rich, nested view with step trees, timings, and errors.

**When to use them:**

- **Keep both `true`** unless your consumer specifically wants only one shape — being generous costs almost nothing.
- **Turn one off** only if you're hitting payload-size limits in your client.

> **⚠️ Pitfall:** Turning both off means the client gets virtually no data back.

---

## ✔ Check your work

- [ ] `loadTimeout` and `searchTimeout` match how fast your target app really is
- [ ] `maxParallel` is `1` for shared-resource or desktop workflows
- [ ] At least one of the response toggles is `true`

---

**Next up** 👉 [Module 5: See what G4 is doing](05-see-whats-happening.md)
