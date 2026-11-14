# YorpHives Headquarters — production hardening and verified blockers

> **Update — 14 November 2026:** This file contains the earlier, now historical
> shared-D1 finding and the initial remediation plan. The actual Cloudflare
> configuration has since been changed. The primary HQ preview is now bound to
> a new empty independent D1; obsolete preview Worker bindings and OTP secrets
> were removed. The older experimental Pages project no longer has D1 bindings
> or automatic preview builds. **The canonical HQ production deployment still
> binds a privileged Agent Worker, and launch is not ready.** Read
> [the verified updated topology](HEADQUARTERS-LIVE-TOPOLOGY-2026-11-14.md)
> and the read-only live topology gate before acting on this historical report.
>

**Review date:** 14 November 2026. **Status:** BLOCKED / NOT PRODUCTION-READY.  
**Scope:** Headquarters only (`solopreneursid/yorpHives-2.0`). The public YorpHives website is a separate repository and service.

## Verified provider facts, read-only

An authenticated Cloudflare account inspection on 14 November 2026 established:

- Account contains the Pages project `yorphives-admin-staging`, with canonical production branch `build/yorphives-admin-reliability`.
- **Both the Pages `production` and `preview` deployment configurations bind `DB` to the same physical D1 database**, UUID `e8690813-b139-44a2-a1c7-bea2d2777ead`, named `yorphives-2-catalogue-preview`. This is not isolated staging.
- The project has Cloudflare Access apps for `admin-staging.yorphives.com`, `yorphives-admin-staging.pages.dev`, and `*.yorphives-admin-staging.pages.dev`. Their account policies include owner-email allow rules; the wildcard deployment-alias app additionally has a service-token non-identity policy. These policy names alone do **not** prove authenticated application functionality, security posture, or per-deployment Access enforcement.
- The last inspected Pages deployment for that project was a **preview** from an earlier fix branch, not this hardening revision. New monitoring-only PRs are not live on that deployment.
- Separate repository draft PRs #52, #54, #55 and this hardening PR remain outside the live canonical release.

The provider inspection **did not modify** any Pages config, Access policy, database, deployment, billing setting, or website code. No D1 rows or user secrets were read.

## Risks remediated in source code

| Risk | Safe source fix |
| --- | --- |
| Shared-D1 configuration mistakenly declared production-ready | Added `scripts/headquarters-production-gate.mjs`, which fails closed unless independently verified data-isolation, Access, staging, CI, recovery and watchdog evidence are all present. Even successful technical evidence cannot authorize a deployment. |
| Old rehearsal Worker accidentally receiving D1, AI or Workflow authority | Removed D1, AI, Workflows and preview URL bindings from the archived `hq-engine/wrangler.rehearsal.jsonc`. Removed the import/export of `MissionWorkflow` from its inert 404 entrypoint. Updated readiness tests to prohibit restoring these privileges. |
| Cloudflare shared-D1 issue forgotten in future upgrades | Added `scripts/headquarters-cloudflare-preflight.mjs` plus a manually dispatched, read-only audit workflow. It checks **actual provider bindings** and fails when they are shared or metadata cannot be authenticated. Report excludes credentials and database IDs. |
| Retired founder OTP configuration reactivating old approval code | Replaced the active `/api/admin/founder-otp` implementation with authenticated read-only disabled status (GET) and HTTP 410 for POST. No OTP secret, mail sender, grant schema or runtime flag is consulted. |
| Misleading release wording in archived API/UI | Corrected selected read-only endpoints, static readiness requirements and independent QA labels to conform to monitoring-only Headquarters. |
| Local watchdog status file swapped or made accessible by another user | Reject unsafe owner-writable permissions, hardlinks and symlink swaps; use `O_NOFOLLOW`, fstat on the opened descriptor, strictly private parent directory, atomic writes. |

**These changes are development code; they do not change running Cloudflare configurations or install a watchdog.**

## What must happen before a safe Cloudflare production deployment

1. **Back up the current D1 source:** independently verify its schema, applied migration history, export integrity and retention, without writing to or restoring over the source.
2. **Obtain the founder's authorization for an isolated staging resource:** provision a separate **preview-only** D1 database with a distinct UUID. Never copy production personal data into staging without an explicit privacy/safety review. Keep canonical production binding unchanged.
3. **Rebind only the Pages preview environment:** record before/after project metadata, confirm the canonical D1 UUID remains the original, then rerun `headquarters-cloudflare-preflight`. Cloudflare write permissions and likely resource costs are required; source code alone cannot do this.
4. **Staging recovery and application verification:** apply approved schema only to that disposable staging database, test backup and restore into another independent target, verify tables and row fingerprints and invalidated credentials, run authenticated browser/monitoring-only tests against the exact reviewed code.
5. **Monitoring operations:** run Headquarters watchdog outside its own process (or deploy an independently managed monitor appropriate for the actual hosting stack), prove its heartbeat, restart and alert delivery without transmitting sensitive evidence.
6. **Security and release review:** validate actual Access policies and anonymous denial at every Admin domain and alias, GitHub lineage, audit results, CI, UI responsiveness, backup recovery and cost/usage. Verify legacy repair/release endpoints remain inert. The founder makes any final deployment decision through an **external** process.
7. **After an independently authorized release:** validate live private login, data integrity, health, rollbacks and monitoring outcome. New source code is not proof a hosted service was updated.

### Cloudflare preflight (read-only; no migrations)

A security-scoped Cloudflare API token with Pages project read capability is required; use the existing protected GitHub Actions environment. Dispatch `Headquarters provider safety audit (read-only)` manually on the hardening branch; this action issues only a GET for project metadata and uploads a redacted `live-provider-isolation.json` result. **Under the verified current shared-D1 configuration, the audit is expected to fail**. That is the correct safety behavior. It cannot create or change a database.

### Critical operational caveat

The existing `admin-monitor/wrangler.jsonc` still configures an active monitor Worker against the known D1 database. Do not deploy this config as a staging rehearsal or run new data migrations until its intended production/preview ownership, data separation and backup are independently reviewed. Its deployment was intentionally not modified during this source-only hardening.

### Standalone self-hosted path

Node/SQLite self-hosted Headquarters does not use the Cloudflare Pages D1 binding, so the above cloud-specific gate is not a self-hosted release certificate. It separately requires a secure server, private SQLite backups and restore, independent OS service supervision, restart/alert tests, owner-only authentication and real browser QA. No live owner server installation was performed.

**Permanent product policy:** Headquarters only monitors, investigates, researches and recommends. The founder implements, tests and publishes elsewhere.
