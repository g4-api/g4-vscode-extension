# Troubleshooting

[⬅ Back to overview](README.md)

Quick fixes for the bumps you're most likely to hit during the quick start. Find your symptom below.

---

## G4 Engine won't connect

**Symptom:** The VS Code status bar keeps saying *"Waiting for G4 Engine…"* or *"Connection Failed. Retrying…"* and never reaches **G4 Engine is Connected and Ready**.

Work through these in order:

1. **Give it a moment.** On a fresh start the engine can take up to a minute to warm up. Wait, then check the status bar again.

2. **Is a sandbox-attached project open?** The engine starts on demand once you open a project that's attached to a sandbox ([Module 4](04-create-your-first-project.md)). With no project open — or a project with no sandbox — there's nothing to connect to yet.

3. **Reload the window.** **`Ctrl` + `Shift` + `P`** → **Developer: Reload Window**. VS Code retries the connection on startup.

4. **Check the sandbox is set.** Open the Settings Editor → **Connection** and confirm the **G4 Sandbox** field points at a valid sandbox, then click **Test Connection**. See [Module 11](11-change-your-sandbox.md).

5. **Start the engine yourself (fallback).** From the sandbox folder run **`start-hub.cmd`**, or bring up the whole stack with **`start-dev-environment.cmd`** — see [Module 9](09-start-full-environment.md). If the Hub reports a red error like a port already in use, another copy is running; close it and try again.

> **💡 Tip:** The engine listens locally on the ports the Hub prints when it starts. A port clash with another local server is the usual culprit — close the conflicting app and reload.

---

## "Create a New G4 Project" scattered files everywhere

**Symptom:** After creating a project, files landed loose on your Desktop or drive root instead of in a tidy project folder.

**Cause:** The command fills the folder you select — it does **not** create a container folder for you.

**Fix:**

1. Create a **new, empty folder** (e.g. `C:\Work\my-first-g4`).
2. Run **G4: Create a New G4 Project** again and select that empty folder.
3. Clean up the stray files from the wrong location.

See [Module 4](04-create-your-first-project.md) for the full walkthrough.

---

## The G4 icon didn't appear after installing the extension

**Symptom:** You installed the `.vsix` but there's no G4 icon in the Activity Bar.

**Fix:** The extension needs a window reload to activate.

1. **`Ctrl` + `Shift` + `P`** → **Developer: Reload Window**.
2. If it still doesn't show, reopen the Extensions view (four-squares icon), confirm **g4-engine-client** is in the **INSTALLED** list, and reload again.

See [Module 3](03-install-the-g4-extension.md).

---

## A recorder LED stays red

**Symptom:** In the G4 Recorder panel you click **Start**, but the indicator stays **red** instead of turning green.

Check these:

1. **Is Use Sandbox on?** In the G4 Recorder panel, the **Use Sandbox** toggle should be **on** — that's what starts the bundled recorder for you. Turn it on and click **Start** again.
2. **Is the recorder enabled and on the right port?** In Settings → **Automation Recorders**, the recorder must be **Enabled** with the correct port (`9955` for UIA, `9956` for Chromium). See [Module 7](07-verify-your-recorders.md) (or [Module 10](10-configure-recorders-manually.md) to change it).
3. **Start it yourself (fallback).** Run **`start-recorder.cmd`**, or bring up the full environment ([Module 9](09-start-full-environment.md)), then try again.

---

**Back to** 👉 [the overview](README.md)
