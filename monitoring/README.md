# Independent Headquarters evidence pipeline — staging first

**Hard boundary:** This is a MONITOR, not a YorpHives company executor.
It only reads a fixed list of public website URLs and writes short,
sanitized evidence into a **physically isolated monitoring database**.
It can never change production, repair source, approve a PR, dispatch agents,
hold a GitHub token, deploy a website, settle payments or issue OTP.

## What's implemented

1. Every five minutes, `monitoring/staging-watchdog.worker.mjs` reads
   nine fixed public YorpHives URLs, validates actual JSON/XML/text metadata
   where expected, and records the result and time in the **preview D1**.
   An old 200 HTML fallback produces a review finding, not "healthy".
   Deduplicated signals go to the private founder queue. No customer
   payloads, raw HTML or secret headers are stored.
2. A separate HEAD check flags missing transport security headers for
   **manual review only**. It is not a vulnerability scan and never claims
   a confirmed exploit.
3. At 02:00 UTC, two publicly documented Cloudflare developer/security
   changelog RSS feeds are read; short, source-linked items become
   **unvalidated technology/security research candidates**. This does not
   prove customer demand, opportunity value or expected revenue.
4. An independent evidence history endpoint
   `GET /api/admin/evidence-history-v3` lets an authenticated founder
   inspect the last 30 runs, last 270 observations and last 100 short
   review/research entries. A heartbeat is "fresh" ONLY if the latest
   external cycle completed successfully within 15 minutes.
5. The monitoring UI shows current external heartbeat, history,
   prioritized evidence, source links as text, stale warnings and a
   separate synthetic-fixture section. No buttons to repair/publish.
6. `monitoring/self-host-collector.mjs` implements the **same check and
   persistence contract** on Node 24 + private local SQLite, for migration
   to owner-operated servers.

## Security and deployment invariants

The optional staging Cloudflare Worker:
- Is a **new, dedicated Worker**. It must have **no public HTTP route,
  no workers.dev exposure**, no custom domain, no Service bindings,
  no API tokens, no GitHub bindings, no R2, no AI, no KV, no Durable Objects.
- Must bind **only** the disposable-isolated Pages preview D1 with ID
  `a5aa51d7-98c0-4adb-a304-0f4f555e01f5`; NEVER the canonical
  production D1 `e8690813-b139-44a2-a1c7-bea2d2777ead`.
- Uses only two cron triggers: `*/5 * * * *` and `0 2 * * *`.
  Any unknown cron value is ignored/blocked. No public request can
  trigger a scan, change stored data, or override targets.
- Runs independently of any open browser tab.
- Its operation and billing must be inspected separately; do not
  assume a new Cloudflare resource is cost-free or an own-server runtime.
- Retains 30 days of observations/runs; deduplicated review findings
  retain their own history until a separately reviewed retention policy.
- Requires at least **two cron cycles, a DB receipt match and correct
  stale-state behavior** before "always-on" may be marked connected.

## Self-hosted alternative (requires your own server)

Node 24+ with built-in SQLite, no npm modules, proprietary API, hosted
model or SaaS dependency:

```bash
git clone --branch feature/headquarters-evidence-pipeline-20261114 --single-branch https://github.com/solopreneursid/yorpHives-2.0.git yorphives-headquarters
cd yorphives-headquarters
node monitoring/self-host-collector.mjs
```

The local monitor creates its own private
`monitoring/private-data/monitor-evidence.sqlite`, validates
`staging/monitor-only-schema-v1.sql` and runs until stopped.
It does **not** access, edit or migrate the canonical HQ D1.
It needs a separate OS supervisor (systemd/OpenRC/s6) for guaranteed
restart and a separate authenticated connector if its data should
appear in the Cloudflare Pages UI. A local installation is not claimed
until configured and tested on the owner's actual host.

## Explicit coverage still missing

- Complete vulnerability scans, dependency SBOM/CVE matching, DNS/TLS
  misconfiguration checks, real tool end-to-end browser functionality.
- Cloudflare account-wide analytics, AdSense revenue and payments: **not
  connected**. Zero income is NOT inferred from a missing feed.
- Public RSS discovery is a **research candidate feed**, not an AI
  validation agent or worldwide market study.
- Out-of-band alerts such as SMTP, mobile push or phone notifications:
  **not connected**. Historical review queue can be seen only in HQ.
- The older canonical HQ remains privileged and must be replaced only
  following independent, real founder Go Live + OTP approval.

**Portability target:** HTTP/JSON -> pure data validator -> SQLite/D1
evidence adapter -> read-only owner UI. Replace Cloudflare's scheduler
with a self-hosted process or another open-source scheduler without
changing the protocol or product logic.


## YorpMind AI employees (distinct from deterministic smart bots)

The six monitoring/research employees are defined by the separate
`staging/yorpmind-readonly-os-v2.sql` schema:

- Engineering reliability, security investigations, global market research,
  product/user-and-agent growth, revenue hypotheses, and learning/evolution.
- `monitoring/yorpmind-os.mjs` independently selects verified-source
  signals per role and invokes `monitoring/yorpmind-local-model.mjs`
  with an explicitly owner-configured, **loopback-only** open-weight
  inference endpoint compatible with llama.cpp/vLLM.
- The local collector can use two optional environment variables:
  `HQ_YORPMIND_MODEL_URL` (e.g. the private loopback model server
  `http://127.0.0.1:8080/v1`) and
  `HQ_YORPMIND_MODEL_NAME` (the actual loaded local model name).
  Without both, **no AI inference runs**, no bogus recommendations are
  generated, and the dashboard says `configured only`.
- Once a real model is configured, inference is budgeted at **six calls
  per six-hour window** in the self-hosted process. The specialist output
  is bounded JSON with evidence, founder recommendation and verification
  plan, not code edits, payment operations or instructions to act.
- Real decisions and run receipts live in the private staging-only
  `yorpmind_decision_briefs` and `yorpmind_analysis_runs` tables.
  Local analysis memory belongs to the **self-hosted** SQLite database.
  Cloudflare staging's six configured agents are only visible as a
  roster until a separately authenticated data transfer/connector is
  implemented. Do not pretend a local model wrote to Cloudflare D1.
- `yorpmind_feedback_memory` will contain only founder-verified
  outcomes. The evolution analyst requires at least two verified lessons.
  There is no autonomous change to model prompts, code, permissions or
  production architecture.
- `GET /api/admin/yorpmind-os-v3` is owner-authenticated and
  staging-gated. The YorpMind tab distinguishes configured employees
  from real completed model runs.

Global market intelligence currently starts with public **Ask HN** and
**Show HN** discussions, plus first-party developer/security changelogs.
These are **candidate sources**, not comprehensive international market
coverage. Extend through interchangeable open RSS/JSON adapters, with
independent provenance and quality thresholds.

The standalone external monitor also checks whether **Headquarters'
Cloudflare Access boundary** challenges anonymous requests. This is an
external access-policy indicator, NOT evidence that internal HQ
components, databases, jobs or application features are healthy.

## Verified staging deployment state (14 November 2026)

- Cloudflare Workers script `yorphives-hq-preview-evidence-20261114`
  is a new, cron-only staging collector with **no enabled public
  workers.dev hostname**, exactly one D1 binding to the isolated
  preview database, and cron schedules `*/5 * * * *` plus
  `0 2 * * *`.
- A real completed external watchdog run and **nine stored public
  website observations** were independently read from the preview D1
  at `2026-11-14T09:05:45.547Z` (last observation time).
- The version 2 isolated YorpMind SQL tables exist and all **six
  configured agent roles** were independently read back. There
  are **zero real model inference runs and zero real AI-generated
  decision briefs** in the connected staging D1 at that inspection.
- Successful cron activation and one completed run do not guarantee
  uninterrupted availability or alerts. Confirm multiple cycles,
  heartbeat expiry, failure reporting and the alert channel separately.
- Running canonical Headquarters and the public YorpHives site
  remain unchanged; no production feature or deploy was authorized.
