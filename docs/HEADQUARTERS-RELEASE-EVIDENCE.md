# Headquarters Releases — First-party evidence and owner review

The private Releases screen now presents a read-only summary of recent repair work and remaining production gates. Its purpose is to help the founder quickly identify what is already evidenced, what is still missing, and why publishing is locked.

## Data sources

- Private Cloudflare D1: `admin_repair_jobs`, `admin_repair_ci_verifications`, `admin_repair_qa_reports`.
- Authorized GitHub repository: draft PR links recorded by the private repair Worker. The Release screen itself does **not** perform live GitHub reads.
- Private `GET /api/admin/release-evidence`: Cloudflare Access authentication, cache-disabled JSON or Markdown content negotiation.

The API examines only the **25 most recent** repair jobs and excludes internal permission-probe records. It validates that each CI attestation contains exactly the five configured checks, with correct commit SHA, distinct check types, success status and positive GitHub run/job identifiers. It only counts founder QA when the reproduction, fix and regression outcomes all pass for the **same D1-attested SHA**.

## Founder journey

Navigate to **Headquarters → Releases**.

The first-party overview shows four counts: recent investigations, attested CI, matching founder QA and production authorizations (always zero). Each repair entry has recorded status, evidence chips, a safely scoped link to its GitHub draft PR, and a collapsible list of unresolved gates.

The screen avoids equating:

- An AI proposal with a verified fix.
- CI passing with issue-specific QA.
- D1-stored commit attestations with *live* GitHub HEAD verification.
- Founder QA with release approval.
- Static migrations with tested D1 recovery.
- Bounded inference jobs with actual Cloudflare billing.

The UI is responsive and uses first-party dark-mode styles, plain text rendering and no third-party UI packages.

## Production protection

This iteration **does not introduce** a release POST endpoint, merge operation, production Worker token, production Pages deploy action or an automatic approval state.

Every API response includes `production_deployment_enabled:false` and `production_approved:false`. Missing D1 QA migration causes HTTP 503, not a fabricated healthy status. Read-only CI service identities may fetch summary data if authorized by Access but cannot mutate QA, repair jobs or releases.

JSON and Markdown representations state that current GitHub PR HEAD, full-release security review, founder release authorization, real Cloudflare spending and staging restore have not been verified by this dashboard.

## Testing

`tests/headquarters-release-evidence.test.mjs` validates:

- Correct five-job CI receipt recognition.
- Rejection of missing, malformed, duplicate, mismatched or failing receipts.
- Exclusion of stale commit-specific QA records.
- No production approval, including when all recorded checks and human QA pass.
- Cloudflare Access denial, absent schema failure and authenticated Markdown representation.

The authenticated browser smoke suite injects synthetic read-only release evidence and confirms the Releases screen shows a locked production status without an actionable deployment button. No real repair, release or staging data is written by this browser check.

## Remaining release blockers

- Independent cumulative review of the stacked Headquarters development lineage against `main`.
- Real owner review and incident-specific QA of an actual repair PR.
- Deployment of the latest private repair Worker implementation, plus staging rehearsal.
- Live Cloudflare D1 restore to isolated resources and rollback drill.
- Actual Cloudflare billing read access/verified usage export.
- Explicit founder authorization for an exact audited release commit, executed through a separately verified mechanism.

This panel is evidence visibility, **not production readiness certification**. No new paid service or external SaaS dependency is added.
