# Headquarters — issue-specific repair QA

## Purpose

GitHub CI verifies that a proposed code revision passes platform and browser checks. It does **not** by itself verify the original incident was reproduced or resolved.

The Founder Operations Console now separates these stages. A draft repair PR may become **needs_review** only after exact-commit CI verification. The founder may then record a separate, auditable issue-specific QA report. **Neither step publishes production.**

No external SaaS or paid provider is required: private Cloudflare D1, Cloudflare Access and the existing GitHub repository are the only runtime dependencies. ChatGPT/OpenAI is not needed to record QA.

## First-party evidence model

Migration `0023_admin_repair_qa_evidence.sql` creates:

- `admin_repair_ci_verifications`: one trusted CI attestation per repair job, pinned to the **exact** SHA and five GitHub quality checks. Only the private repair Worker writes this record when it records a `needs_review` job.
- `admin_repair_qa_reports`: an owner-authored QA report per `(job_id,commit_sha)`. Old reports are retained after a branch changes.

The Cloudflare Worker records the job status, CI attestation and audit event in a single D1 batch. No incomplete AI review or CI failure can generate the trusted attestation.

The authenticated `/api/admin/repair-qa` endpoint verifies the current GitHub PR head belongs to the isolated `build/agent/repair-<job-id>` branch in the approved repository and still equals the **trusted CI-attested SHA** before accepting a report.

The frontend form records three distinct outcomes:

1. Was the original bug reproduced?
2. Did the proposed fix work on the preview?
3. Did relevant regression tests pass?

A full, currently pinned QA report requires `reproduced`, `passed`, and `passed` respectively, plus 30–3000 characters of concrete evidence. The form must never silently substitute a successful CI run for these observations.

## Founder UI

Navigate to **Headquarters → Issues & risks → View case**. For a linked repair with a draft PR awaiting review, choose **Record issue-specific QA**.

The dialog explains that saving a report is not production authorization, shows the reviewed commit, supports mobile, and uses the existing Cloudflare Access owner session. It makes no calls to AI and creates no release.

The same private API serves JSON and authenticated Markdown representations, with `production_approved:false` in every response.

## Stale-commit behavior

When a draft repair branch changes after QA has been recorded:

- A previous report remains in D1 as historical evidence.
- The read endpoint marks its status `changed` or `unavailable`, rather than `current`.
- The existing QA record does not qualify as issue-specific verification of the new branch head.
- A new report **cannot** be saved until the private repair process has independently verified the new exact SHA and recorded a corresponding CI attestation.

If GitHub is inaccessible, the API never invents a current verification status.

## Security and costs

- Cloudflare Access authentication and owner authorization are required on all QA API operations.
- Cloudflare Access CI service identities are read-only; QA mutations are denied.
- POST requires same-origin JSON and enforces bounded evidence lengths.
- Audit events record the founder identity and review state; owner prose is stored as text, not executed or rendered as HTML.
- GitHub is accessed only for read-only PR head verification and is an approved provider.
- No new third-party software, plan upgrade, product hosting service, or subscription is introduced.

## Verification and rollout

Tests in `tests/headquarters-repair-qa.test.mjs` cover authorized persistence, historical revision retention, missing CI attestation, changed branch SHA, GitHub outage, invalid origin, invalid inputs, service identity denial, migration failure and Markdown. Authenticated staging browser tests display the form using synthetic read-only fixtures and never submit an actual review.

Before allowing live founder QA:

1. Back up or bookmark the **private staging D1** database.
2. Apply migration 0023 in private staging and verify both tables and their indexes.
3. Confirm the repair Worker writes CI attestation only after all five exact-commit checks pass.
4. Confirm draft PR Head SHA matching, owner-only POST restrictions and audit events against staging.
5. Keep production publishing locked until the entire release candidate passes the cumulative security and release acceptance gates.

If migration 0023 is applied with Cloudflare's SQL API rather than Wrangler migrations, the Wrangler migration ledger may not mark it applied. Verify actual schema and migration bookkeeping before the normal migration workflow is used.

## Release blocker

A recorded owner QA report is **self-reported test evidence**, not a cryptographic proof of test execution or a substitute for independent regression testing. Even when the three observations pass, production publication requires a separately reviewed release, owner approval and rollback readiness.

## Staging-only execution evidence — 12 November 2026

Verified the connected Cloudflare database identity before making any change:

- Database name: `yorphives-2-catalogue-preview`.
- Database ID: `e8690813-b139-44a2-a1c7-bea2d2777ead`.
- Confirmed neither QA table existed before migration.
- Read a D1 Time Travel bookmark before the additive SQL migration.
- Applied migration `0023` through the Cloudflare D1 SQL API (not production).
- Read back and verified both tables `admin_repair_ci_verifications` and `admin_repair_qa_reports`, plus their indexes.

This validates **schema presence only**. It does not prove the new repair Worker is deployed, that a real AI repair can finish, or that an authenticated founder has successfully submitted QA. The official Wrangler migration ledger may not reflect SQL-API-applied migrations and must be reconciled before release.
