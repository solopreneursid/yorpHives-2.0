# YorpMind — resource-aware manager of YorpHives bots

## Product direction

YorpMind is the chief reporting manager inside private YorpHives Headquarters, reporting to the founder. Five subordinate logical managers supervise the existing agent registry:

| Role | Department | Reports to |
| --- | --- | --- |
| YorpMind | Chief manager and escalation | Founder |
| YorpMind 1 | Engineering and Operations | YorpMind |
| YorpMind 2 | Research and Innovation | YorpMind |
| YorpMind 3 | Product and Growth | YorpMind |
| YorpMind 4 | Revenue and Business | YorpMind |
| YorpMind 5 | Quality and Security observation | YorpMind, with independent owner release judgment |

These are coordination roles, not six new paid AI inference sessions or privileged Cloudflare identities. Existing specialist bots remain the workers.

## Implemented in this draft

- Additive private D1 migration 0027: staff hierarchy, immutable evidence-based supervisor reports, owner review state and per-day deduplication.
- Deterministic allocation planner: classify agent department, aggregate active work, detect failed/stalled/waiting jobs, recommend reuse of previous same-title mission results without assuming correctness, and recommend prospective dispatch only under existing capacity rules.
- At most 100 recent jobs and 80 existing bots analyzed per view or daily scan. Maximum three global active recommendation jobs and six owner AI dispatches per UTC day remain authoritative. Per-agent and per-manager limits are additionally considered. If quota is unknown, routing advice fails closed.
- Existing intelligence cron records up to eight daily, non-executable D1 recommendations. SQL enforces the per-day cap and duplicate key restriction. The scan performs no AI inference, retry, code change, new paid service, or deployment.
- Existing private Headquarters YorpMind UI gains a responsive staff chart, current routing advice and daily report inbox.
- Authenticated read-only GET /api/admin/yorpmind-team offers JSON and Markdown content negotiation. Founder PATCH can acknowledge or dismiss one immutable report, with a reason and auditable D1 event. CI identities cannot change reports.
- No text from untrusted task titles or model replies is copied into generated supervisor instructions or reports. Evidence contains only IDs, statuses, timestamps, and bounded capability flags.

## Resource efficiency rules

1. Reuse before rerunning: consult historical evidence and compare applicability; prior completion never means independently verified success.
2. Avoid duplicated AI managers: managerial supervision begins as deterministic D1 metadata, not a new paid process per personality.
3. Route by actual recorded capacity and specialist capability, not agent name or confidence.
4. Escalate failed and stale jobs rather than automatically retrying or spending more tokens.
5. Keep a global budget: existing Headquarters dispatch endpoint, not a reporting model, remains the authority for inference jobs.
6. Isolate independent QA: YorpMind 5 can flag defects but is not an independent final release approver.
7. Report outcome metrics only when measured: completed work, repeat failures, independent QA evidence, model calls, actual spend, acquired users and realized revenue.

## How approved change execution must work

Worker bot → supervisor report → chief YorpMind review → isolated proposed repair and exact-commit tests → real preview bound to verified deploy SHA → independent QA → founder reads preview and checks scope → separate Cloudflare Access MFA / OTP challenge → short-lived one-time exact-operation authorization → independently audited executor → postdeploy health / rollback.

The current existing Phase 5 owner delegation feature records founder-approved intent but has its production executor disabled. This branch does not enable it. No YorpMind receives OTP codes, Cloudflare owner sessions, root permissions, reusable superuser tokens, or permission to approve its own work.

## Recommendations for the next stages

- Founder-editable department/supervisor mapping with immutable audit and a real task-claim lease.
- Genuine subordinate-manager planning workflows, but only if measured demand justifies new inference sessions. Avoid one Durable Object per merely registered staff identity.
- Structured worker output contracts (evidence, limitations, risk, suggested patch, tests), scored separately by QA and chief YorpMind.
- Verified GitHub/Cloudflare Pages preview-to-SHA binding, release executor atomically consuming scoped owner authorization, and real rollback rehearsal.
- Resource accounting per inference call and workflow; dynamic scaling only within existing hard spend quotas.
- Separate public-facing website machine-readable JSON/Markdown/MCP endpoints without exposing any private Headquarters D1 tables, admin policies or report data.

## Status and deployment limits

Draft-only feature stacked on existing unmerged YorpMind Phase 5 branch. No production deployment, new external subscription, Access MFA policy change, or production database migration was performed. Private D1 migration 0027 has not been applied to staging. Previous staging migrations 0024–0026 were applied through SQL API, not Wrangler ledger, and require careful reconciliation before production migration use.

Local deterministic / SQLite tests and CI are needed before attempting staging rollout; a true bot-to-bot execution and audited release remain future work.

Additional Workers AI calls: zero for supervisor scan. D1 usage and Cloudflare requests may still be metered, so zero additional billing is not guaranteed without account-level invoice and usage evidence.
