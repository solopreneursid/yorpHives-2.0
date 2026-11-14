# Independent watchdog — implementation slice 1

**Project:** YorpHives Headquarters (`solopreneursid/yorpHives-2.0`). The live public YorpHives website remains in its own repository (`solopreneursid/YorpHives`). **Not deployed. Not a production attestation.**

## Purpose

`self-host/watchdog.mjs` is an **independent read-only Node process** that supervises the Headquarters runtime from the outside and checks three fixed public website routes. It does not run inside the monitored app's scheduler. It uses no AI model, credentials, repair agents, external monitoring SaaS or deployment integration.

The checks are intentionally different:

- **Headquarters**: calls `/ready`; only a JSON response from the named Headquarters service with `ready` plus available database and monitoring dependencies is reported as `ready`. A login redirect, 403, HTTP 200 containing HTML, stale scheduler or unreachable service is **degraded**.
- **Public website**: observes HTTP reachability of `/`, `/free-tools/` and `/api/v1/free-tools` at `yorphives.com`. A 2xx is labeled **reachable**, never `healthy` or proof that a PDF tool, ad, payment, or business flow works.
- **Failure evidence**: redirects are not followed; status, source ID, timestamp and a bounded reason are emitted. Responses cannot contain a credential or arbitrary exception text in logs. Readiness JSON is capped at 4 KiB.
- **Change events**: initial state, regressions and recoveries are emitted as newline-delimited JSON. Each completed poll also writes a heartbeat. Overlapping polls are coalesced.
- **Authority**: no fixes, new branches, spending, data modification, agent dispatch, OTP, Go Live or publication. Everything remains under the founder's control.

## Verify from a Headquarters checkout

Requires Node.js 24.12+ as used by the self-hosted runtime. Run:

```sh
node --check self-host/watchdog.mjs
node --test tests/independent-watchdog.test.mjs
```

Tests use stubbed responses and do not make live web requests. The whole platform test and browser/Access test pipelines must also pass before any deployment.

## Run as a separate process on your server

First start the self-hosted Headquarters process following `self-host/README.md`. On the **same server**, open a second shell in the Headquarters checkout and run:

```sh
node self-host/watchdog.mjs
```

Default: HQ at `http://127.0.0.1:8788/ready`, and the three canonical public website routes. Poll every 60 seconds with an eight-second timeout per target. Configure a private HTTPS HQ origin, if required, only from the server's private environment:

```sh
HQ_WATCHDOG_HEADQUARTERS_ORIGIN=https://headquarters.internal node self-host/watchdog.mjs
```

The HTTPS hostname above is an **illustration**, not an established deployed address. The origin must be a bare HTTPS origin without a path, token, fragment or embedded credentials; HTTP is allowed only for loopback. No owner passwords or Cloudflare Access service tokens are passed to the watchdog. If a protected private hostname blocks anonymous `/ready`, this process correctly reports degraded: do **not** weaken Access policy just to make the check green.

`HQ_WATCHDOG_INTERVAL_MS` accepts 10,000–3,600,000 milliseconds; default 60,000. For ongoing operation, use your own OS-level service supervisor with restart and logging. This repository does **not** install or enable such a service automatically. A stopped watchdog does not send alerts; a separate host supervisor and an alert route are still required for production.

## Outstanding before production

1. Install and supervise the independent process on the **actual** owner-controlled server; verify its real logs, crashes, restarts and alert delivery. No live deployment has been performed.
2. Connect supervisor evidence into the founder-facing Inbox without importing secrets or mistaking HTTP reachability for functional coverage.
3. Add real authenticated Headquarters browser/Access checks on isolated staging with explicit least-privilege supervision; anonymous access denial is not a successful application login.
4. Expand read-only website route and feature checks by evidence, handle legitimate canonical redirects after verifying the actual production URL, and measure monitoring coverage/freshness.
5. Resolve the already documented **shared preview/canonical D1 database** issue and complete backup/restore, exact-preview, independent QA, cost, drift and founder OTP release gates. Go Live remains locked.

This is a small tested implementation toward continuous independent monitoring, **not** a claim that every production blocker or autonomous research capability is complete.
