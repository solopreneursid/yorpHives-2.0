# Headquarters — repair QA and source-qualified findings

## State on 12 November 2026

This branch is a **draft staging candidate**, not an authorized production release.

**Completed in source:** strict repair-commit verification; new source-qualified finding links; owner-configured repair-base branch; exhaustive Node tests including an isolated full-migration SQLite backup/restore exercise.

**Confirmed on private Cloudflare staging:** D1 database `yorphives-2-catalogue-preview` now contains `admin_repair_finding_links`, its index, and both source-existence validation triggers from migration `0022`. A D1 Time Travel bookmark was read before applying the additive migration. No production DB was modified.

**Important migration bookkeeping:** The staging migration was applied through the authorized Cloudflare D1 SQL API, not Wrangler's migration ledger. The SQL is idempotent (`IF NOT EXISTS` / `INSERT OR IGNORE`), so the normal `npx wrangler d1 migrations apply` flow may still list `0022` as pending. Do not mark the migration as applied in the Wrangler ledger without checking actual state and the official migration sequence.

## Incident → repair lifecycle

1. Open **Headquarters → Issues & risks → View case**.
2. Inspect source-specific evidence and any existing repair jobs.
3. Select **Prepare investigation**; this prepopulates the existing owner-controlled form without starting inference.
4. Confirm the proposed scope and submit the repair separately.
5. The private Worker reads the reviewed `REPAIR_BASE_BRANCH` configured in `admin-agent/wrangler.jsonc`. Browser input cannot choose another branch.
6. The repair agent proposes bounded source changes and a second AI inference independently reviews them.
7. An isolated `build/agent/repair-<job-id>` branch is created and its exact commit is checked with GitHub Actions.
8. The platform suite, **isolated Cloudflare Pages preview deploy**, browser/SEO tests, code-risk review and Lighthouse job must pass for the same branch and commit.
9. Only then is a draft PR eligible. The job status is **needs_review**, not fixed or verified. The draft PR must explain that the issue may still need reproduction and issue-specific QA.
10. A human reviewer must reproduce the original failure and independently verify the proposed fix on the preview. No automated code merge, release, billing action or production mutation is authorized.

## Verification contract

`admin-agent/repair-evidence.js` rejects mismatched branch, SHA or non-push events, missing or failed preview deployments, failed contract tests, failed reviewer jobs, incomplete Lighthouse, and a failed newer rerun. A mixed set of job results from unrelated runs cannot establish success.

The tests are in `tests/headquarters-repair-evidence.test.mjs`, `tests/headquarters-repair-links.test.mjs`, and `tests/headquarters-migration-recovery.test.mjs`. `scripts/admin-smoke.mjs` exercises the incident UI with synthetic browser-local GET fixtures and does not dispatch a repair.

## Finding association and migration order

Existing `admin_repair_jobs.finding_id` remains a foreign key to `admin_findings` for backward compatibility. The new `admin_repair_finding_links` table records `{job_id,finding_source,finding_id}` where the source is `monitor` or `asset`; migration triggers reject unknown findings.

The API uses one D1 batch to create the job and the link atomically. Until migration `0022` exists, legacy monitor requests still work, while asset-linked requests fail closed with an explicit 503. The UI prepares asset requests as general investigations on an unmigrated deployment.

The staging database schema was updated additively; the browser/API code must still pass a real staging validation run against that database.

## Cost and permission policy

Only Cloudflare, existing ChatGPT/OpenAI assistance, and GitHub free features are authorized. The repair pipeline uses **up to two Workers AI inference calls per job**, and the API limits requests to **two repair jobs per rolling 24 hours**. Owner recommendation briefs have a separate **six-dispatch-per-UTC-day** allowance. These are not billing totals or a guaranteed dollar cap.

The connected Cloudflare OAuth identity cannot read Cloudflare account billing usage (Billing Read returned 403). Actual USD consumption must remain marked unavailable until the owner provides read-only billing access or a verified export. No billing permission elevation or outside SaaS is part of this change.

## Remaining production blockers

- GitHub change-risk review flags `admin-agent/wrangler.jsonc` as sensitive configuration; preserve the required manual review instead of suppressing the rule.
- Actual repair-agent live execution, reproduction-specific tests, and independent preview QA remain unverified.
- The cumulative Headquarters lineage against `main` remains large and must receive separate security review and reconciliation.
- A real D1 staging restore exercise and production migration rehearsal must be done using isolated recovery resources. Local SQLite restore tests are not equivalent to live D1 restore proof.
- Exact founder authorization and a tested rollback plan are still prerequisites for publishing production.
