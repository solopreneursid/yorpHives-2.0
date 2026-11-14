# YorpMind owned workforce — implementation foundation

**Repository:** solopreneursid/yorpHives-2.0 (Headquarters, not the live website).
**Branch:** build/yorpmind-owned-readonly-workforce-20261114.
**State:** Proposed source change for founder review; not merged, deployed, installed, or production-ready.

## Founder mandate

Headquarters / YorpMind can monitor the website and Headquarters; investigate,
research, store private evidence, make recommendations, and record founder feedback.
It **cannot** change source code, create or merge PRs, run repair jobs, deploy,
publish, change infrastructure, change secrets, or grant itself permission.
Only the founder (or a separately engaged coding assistant acting outside the
Headquarters runtime) makes changes. Any live release requires the founder to
review the exact preview and complete the separate Go Live / OTP authorization.

The `hq-intelligence/workforce-policy.js` module provides a fail-closed operation
vocabulary and a first-party bot inventory. **It is not an authorization service**:
every API route, worker binding, runtime credential, storage permission and
production release boundary still needs independent technical enforcement.
Existing monitor-only endpoint defenses must remain in place.

## Owned bots, not third-party agent middleware

No MCP integration or external hosted model is an allowed architectural
dependency. The eventual runtime uses internal first-party communication
and owner-controlled storage. Direct HTTP visits to public, permitted sources,
and founder-authorized read-only reporting imports remain allowable.
No private memory or sensitive operational records are sent to untrusted AI
providers. Existing Cloudflare inference bindings are **not replaced or
disabled by this patch**; migrating to a verified private inference server
remains a production blocker.

Every candidate bot has state `planned` and version `0.0.0` until its
deployment and exact revision are independently verified. A project name
in `upstream_reference` is only an inspiration/research lead; copying
requires license, dependency, provenance and vulnerability checks.

## Evolution / source management

Maintain per-bot ID, internal semantic version, exact upstream commit/tag,
verified license, internal patch history, dependency lockfile, rollback SHA,
security check result, owner review and deployment evidence.
Upgrade one component at a time in a separate reviewable development branch.
The YorpMind service can **propose** upgrades based on evidence but cannot
fetch-and-execute unknown code or self-upgrade.

## Cost posture

Prefer deterministic lightweight monitors, bounded event-triggered private
inference, existing hardware, SQLite initially and no new subscriptions.
Software license cost can be zero; server, storage, power and bandwidth are
not free. Never claim a budget until actual infrastructure usage is measured.

## Verification

Run `node --test tests/yorpmind-owned-workforce-policy.test.mjs`.
This covers the manifest's constraints, not production enforcement. Existing
`tests/headquarters-monitor-only.test.mjs` and full Headquarters QA must pass
as well.

## Open production gates

- Reconcile every worker/API binding with deny-by-default authority and remove
  any residual GitHub-write/repair capability from deployed service credentials.
- Verify isolated private inference, actual model uptime, cost and evidence sync.
- Build/review persistent version-tracking and alert visibility in Headquarters.
- Prove real authentication, actual staging/browser checks, independent watchdog,
  backups, restore, monitoring freshness, and cost limits.
- Keep release authority outside the YorpMind runtime; verify founder exact
  preview, OTP, audit record, rollback and production recovery.
- Do not merge, publish or announce readiness based on this module alone.
