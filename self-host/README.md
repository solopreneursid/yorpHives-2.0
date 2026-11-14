# Your self-hosted YorpHives Headquarters

Run the same Headquarters interface and application APIs on your own computer or server. Your missions, audit events and YorpMind records live in a private SQLite file. This optional runtime uses Node.js and SQLite, with no required Cloudflare account, subscription, proprietary model API or external identity provider.

This is a separate installation with a **new local database**. It does not copy your Cloudflare staging data or change your public website. Production publishing, release OTP issuance, code-repair workers and assistant administrator grants are intentionally absent from Headquarters. The founder handles fixes and releases outside this service. Cloud analytics is an optional separate read-only integration; do not fake missing records. The runtime reports these limits instead of inventing successful results.

## Start on your computer or server

Requires **Node.js 24.12 or later** (the application is tested on Node.js 24). Compiled styles are already included; the runtime itself needs no npm installation.

For a fresh checkout:

```sh
git clone --branch feature/headquarters-monitoring-only-20261114 --single-branch https://github.com/solopreneursid/yorpHives-2.0.git yorphives-headquarters
cd yorphives-headquarters
node --version
node self-host/setup.mjs
node self-host/start.mjs
```

If you already have this branch checked out, run the last two commands from the repository root.

Open **http://127.0.0.1:8788/admin/**. In a second terminal inside the same repository, read your generated owner password:

```sh
cat self-host/data/owner-password
```

Enter that password only into the local sign-in screen. `setup.mjs` preserves an existing password and protects the password directory/file with owner-only filesystem permissions. The startup log does not print it. For an externally managed password, set `YORPHIVES_OWNER_PASSWORD` in your server's private process environment instead. Never commit a real password or paste one into chat.

The first launch applies all existing schema migrations to `self-host/data/headquarters.sqlite`. Subsequent launches verify the migration checksums and apply only new migrations. A changed historical migration stops startup for investigation. Existing cloud migrations and databases are untouched.

## What works

- Private sign-in, logout, expiring owner sessions, and a responsive founder cockpit.
- Persistent mission creation, replay protection, cancellation, review and audit history using the actual existing Headquarters APIs.
- Genuine database totals, founder action queue, mission detail, team hierarchy, opportunity records and private YorpMind memory/skill review.
- Owner-requested fixed-route public website checks and saved monitor checks. They require internet access to your public website and do not modify it.
- A local observation loop runs after startup and every five minutes. Each run checks up to ten enabled HTTP monitors, selecting unchecked or oldest-checked routes first, then runs the existing daily/idempotent YorpMind team and evolution scanners. It proposes findings only from actual records; it makes **zero model calls**, dispatches no agents and grants no permissions. Set `HQ_OBSERVATION_SCHEDULE=no` to disable it.
- Optional real AI recommendation briefs from your own local model server, described below.

An empty new database correctly shows no historical work, revenue or proven lessons. Seeded specialists are records, not evidence that autonomous employees are already running. Scheduling observation does not create verified experiences from untested AI output.

## Connect your own model when ready

Use a self-hosted inference server such as llama.cpp or vLLM with its OpenAI-compatible **wire protocol**. This is a local HTTP interface, not a dependency on the OpenAI service. The server must support `/v1/models` and `/v1/chat/completions`; you provide the open-weight model and hardware.

If your model server is already running at the usual local port 8080:

```sh
HQ_MODEL_URL=http://127.0.0.1:8080/v1 node self-host/start.mjs
```

Headquarters discovers a served model from `/models`. Set `HQ_MODEL_NAME` only if you want a specific model ID reported by your inference server. The endpoint must be on loopback, a private IPv4 address, or a `.internal`, `.local` or `.lan` hostname. Browser mission content cannot change the model address. Public SaaS endpoints and embedded credentials are rejected.

Save a mission, then select **Start AI brief** on an enabled recommendation specialist. There is one bounded model attempt, at most three active missions and six owner-started dispatches per UTC day. A structured result becomes a reviewable recommendation. It does not execute shell commands, alter code, spend funds or publish a website. Empty or malformed output becomes a recorded failure; it is never silently retried or called a completed repair. Interrupted queued/running work becomes an explicit failure on restart rather than being replayed.

The model adapter is `self-host/mission-engine.mjs`; storage is `self-host/sqlite.mjs`; authentication is `self-host/auth.mjs`. They are independent of the browser interface and can be replaced while retaining the application contracts.

## Keep your records safe

Create a consistent online backup, including committed WAL data. Each backup has a unique filename so simultaneous requests preserve independent copies:

```sh
node self-host/backup.mjs
```

The command creates a timestamped private SQLite backup under `self-host/data/backups/` and prints its path. It works while Headquarters is running. Keep a separate encrypted copy on storage you own. Keep your owner password separately; it is not inside the SQLite database. Sessions expire after restart.

To restore a chosen backup, stop Headquarters, preserve the current database, replace `self-host/data/headquarters.sqlite` with the chosen backup, remove the stopped database's obsolete `headquarters.sqlite-wal` and `headquarters.sqlite-shm` files, and start Headquarters again. Use a deliberate selected backup; do not overwrite a live database. Migration checks run again on startup.

## Access from another device

The default process binds only to `127.0.0.1`. Running this command here does not install Headquarters on your own server; its address and connection have not been supplied. Remote deployment needs that actual server address. Use your existing SSH connection or private VPN to reach it.

For permanent remote access, place the process behind your own HTTPS reverse proxy and set `YORPHIVES_HOST` plus `YORPHIVES_PUBLIC_ORIGIN` to your actual private hostname. Remote binding is refused without an explicit HTTPS origin. Forward the exact Host header. The runtime ignores client-supplied forwarding/Cloudflare authentication headers and validates both Host and request Origin.

Configuration variables:

| Variable | Default / purpose |
| --- | --- |
| `YORPHIVES_DATA_DIR` | `self-host/data`; SQLite, backups and generated owner password |
| `YORPHIVES_OWNER_PASSWORD` | Optional private environment override for the generated password |
| `YORPHIVES_OWNER_EMAIL` | `owner@localhost`; local audit identity, not a public email account |
| `YORPHIVES_HOST` | `127.0.0.1` |
| `YORPHIVES_PORT` | `8788` |
| `YORPHIVES_PUBLIC_ORIGIN` | Optional exact HTTPS origin behind your reverse proxy |
| `HQ_MODEL_URL` | Optional private model endpoint ending in `/v1` |
| `HQ_MODEL_NAME` | Optional model ID; otherwise discovered from the private server |
| `HQ_OBSERVATION_SCHEDULE` | Enabled by CLI; set `no` to disable |

## Verify the runtime

```sh
node --test tests/portable-runtime.test.mjs tests/portable-mission-engine.test.mjs tests/portable-workflow.test.mjs
```

Tests cover actual HTTP sign-in and mission persistence, rejected forged/cross-origin requests, private-file denial, body limits, login throttling, atomic database rollback, migration history, local observation idempotency, and the model execution contract. Model tests use a controlled test server/fixture; they do not claim a real model is installed on your machine.

The optional Node module-resolution adapter is activated only by this runtime. It attaches a verified owner identity to an exact in-process Request object. No HTTP header or environment string becomes an authentication bypass. The existing Cloudflare Access verifier remains unchanged for Pages deployments.

## Runtime supervision

`GET /health` reports process liveness. `GET /ready` returns HTTP 200 only when the database migration table is readable and the observation scheduler has completed a successful scan within two configured intervals. Failed, stopped, stale or disabled observations return HTTP 503. These endpoints expose only service status and require the configured Host header. An independent supervisor can poll `/ready` and alert you when coverage is degraded. Configuring that external supervisor on your server remains a deployment step. This readiness result covers the local runtime dependencies, not release approval or external data integrations.

## Independent outside-in watchdog (development addition)

The local observation scheduler runs **inside** Headquarters, so it cannot detect its own process stopping. The separate read-only supervisor at `self-host/watchdog.mjs` observes the local `/ready` endpoint and the public website's canonical home, tools directory and discovery API every minute. It labels public 2xx responses as *reachable only*, never as proof that individual tools work. Regressions and recoveries are printed as JSON records; no fix, AI task, release or third-party service is triggered.

Run `node self-host/watchdog.mjs` in a **second process** on your own server and see `docs/HEADQUARTERS-INDEPENDENT-WATCHDOG.md` for tests, HTTPS origin options, limitations and OS-level supervision. This is not yet installed on your live server and has no remote alert delivery. Headquarters does not contain Preview, Go Live or OTP publishing controls. The founder develops and publishes separately. The watchdog is a second process; its private status file is now readable through an authenticated Headquarters endpoint when that process is installed.
