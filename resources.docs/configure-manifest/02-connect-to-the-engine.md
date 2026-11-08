# Module 2: Connect to the engine

[⬅ Back to overview](README.md) · [⬅ Module 1](01-meet-manifest.md)

⏱️ **About 4 minutes**

Two settings decide **where** the engine is and **who** is allowed to use it. Get these right and G4 will talk to you; get them wrong and nothing else matters.

In this module, you will:

- Point the client at the G4 engine with `g4Server`
- Authenticate with your license token
- Tell G4 where your sandbox lives with `sandbox`

---

## Step 1: `g4Server` — where the engine lives

**What it is** — the address the client uses to reach the G4 engine. Every automation request is sent to `<schema>://<host>:<port>`.

```json
"g4Server": {
    "schema": "http",
    "host": "localhost",
    "port": "9944"
}
```

**How to configure:**

- `schema` — `"http"` or `"https"`.
- `host` — hostname or IP address.
- `port` — the port the engine listens on (default `9944`).

**When to use it:**

- **Default (`localhost:9944`)** — G4 runs on your own machine.
- **Change `host`** when the engine runs on a different server (a shared automation host or a Docker container).
- **Change `schema` to `https`** when your G4 instance is behind a TLS proxy or a network that requires encryption.

> **⚠️ Pitfall:** `port` is a **string** (`"9944"`), not a number — keep the quotes. And make sure firewalls allow traffic to that port; "connection refused" usually means a port or firewall problem.

---

## Step 2: `authentication` — who is allowed in

**What it is** — your G4 license/identity token. G4 rejects every request without a valid one, and the token also identifies which features and limits your license allows.

```json
"authentication": {
    "token": "<your-license-token>",
    "username": null,
    "password": null
}
```

**How to configure** — paste the token you were issued, on a single line, between the quotes. The `username` and `password` fields support alternate authentication schemes and are normally left `null`; a standard license uses `token`.

**When to use it:**

- You'll set this once during initial setup and rarely touch it again.
- Update it when you receive a new token (license renewal, plan change).

> **⚠️ Important:** **Never** commit a real token to source control or show it in screenshots — treat it like a password. Don't add line breaks inside it (JSON strings are one line). If you start seeing "unauthorized" errors after working fine, the token may have expired or been rotated.

---

## Step 3: `sandbox` — where your G4 sandbox lives

**What it is** — an optional key at the **top level** of `manifest.json` (not inside `settings`). It holds the folder of your local G4 sandbox, the packaged environment with the Hub, browsers and drivers.

```json
"sandbox": "C:\\g4-sandbox\\g4-sandbox-2026.11.01"
```

**What it does** — the extension uses it to find the sandbox when it starts things for you: the bundled recorder services (**Use Sandbox** in [Module 7](07-set-up-recording.md), also for autonomous runs) and the G4 Hub. If it is empty or missing, the extension cannot start them from the sandbox.

**How to configure** — you rarely type it. **Create a New G4 Project** fills it when you choose a sandbox. To change it later, open the Settings Editor and use the **G4 Sandbox** field: **Browse** picks a folder, and **Auto-Detect** finds the newest sandbox. Clearing the field removes the key from the file.

**When to use it:**

- **Set it** when you want G4 to start the Hub or the recorders from your sandbox.
- **Leave it out** when the engine and recorders run elsewhere (a server, a container, another machine).

> **⚠️ Pitfall:** Double the backslashes in a Windows path inside JSON (`C:\\g4-sandbox\\...`).

---

## ✔ Check your work

- [ ] `g4Server` points at the actual engine address (default `localhost:9944`, `port` in quotes)
- [ ] `authentication.token` holds your license token on a single line
- [ ] Your token is kept private — not committed or shared
- [ ] `sandbox` points at your sandbox folder, or is left out on purpose

---

**Next up** 👉 [Module 3: Pick your automation driver](03-pick-your-driver.md)
