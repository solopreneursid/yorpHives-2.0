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

## November 14 security follow-up (draft branch only)

The retired `admin-agent/worker.js` was reduced to GET-only health and
read-only issue evidence. It no longer contains GitHub mutation helpers,
AI code generation, repair queue dispatch, or draft PR creation.
`AdminRepairWorkflow.run()` remains a throwing compatibility stub for old
instances. Its Wrangler source configuration no longer requests DB, Workers
AI or repair Workflow bindings. These are **unmerged source changes**;
deployed bindings and secrets have not been inspected or revoked.

### Deployment blockers / operator-controlled security tasks

1. Audit every deployed Worker/service binding and credential, including
   `GITHUB_TOKEN`. Revoke the legacy write-capable credential; if issue
   reading is still needed, provision a *new* least-privilege read-only token
   and verify its effective permissions. Do not print or commit secrets.
2. Verify the host/platform accepts removal of the old Workflow binding,
   and determine whether any historical queued instances need retention
   or archival before changing a deployed service.
3. Check any client of `/health` that previously expected legacy repair
   readiness fields. The endpoint now reports the monitor-only contract,
   not the obsolete repair service's health.
4. Test private issue listing, denied POST requests, authentication and
   all dependent UI pages in staging before merging or deployment.
5. Prove that the other live workers, not only the retired repair worker,
   lack GitHub-write and infrastructure-mutation permissions.
6. Independently verify local-model inference, monitoring freshness,
   restore/rollback, founder approval and OTP before declaring readiness.

**Critical:** a worker returning `monitor_only` does not prove the deployed
credential itself is read-only. A successful CI run cannot prove it either.
No production deployment or credential rotation was performed by this change.

### Token revocation and tokenless public issue evidence (November 14)

The founder confirmed deletion of the former GitHub **YorpHives Repair Agent**
fine-grained PAT (previously allowing Actions, code and pull-request writes).
Connected Cloudflare inspection showed the `GITHUB_TOKEN` secret removed from
the saved Worker settings, while the historical deployment remained active.
Do not infer that a saved configuration is serving traffic.

The repository `solopreneursid/yorpHives-2.0` was verified as public.
The revised read-only `/issue-inbox` Worker performs an unauthenticated
**GET** to GitHub's public issues API, with no token dependency. This is
direct public-source access, not MCP or a third-party AI provider.
Normal GitHub API quotas and outages may make evidence temporarily unavailable;
the UI must report that as unavailable, never claim an empty issue list.
If the repository becomes private, the design must be reviewed instead of
silently reintroducing a write-capable token.

The retired `/health` endpoint intentionally returns HTTP 503
(`retired_pending_cloudflare_cleanup`), not a false healthy claim. It does
not imply that uptime monitoring itself has failed.

**Uncompleted:** the deployed Worker source has not been replaced with the
hardened branch, obsolete workflow/AI/DB bindings have not been detached from
the active Worker, and historical Workflow instances have not been audited.
The saved token-free Cloudflare version is *not* the same as this hardened
source revision. Never promote it as though it contains the newer code.
