# YorpHives Headquarters — cumulative release and incident operations

## Status

This is a **draft staging-only** implementation. It does not authorize production publishing, provider purchases, model spending, or extra GitHub permissions.

## Release ancestry and independent review

The Headquarters preproduction CI now checks out full Git history and runs `npm run audit:headquarters-lineage`. The audit uses `main...HEAD` (through the actual merge base), not just the previous stacked branch.

It writes `artifacts/headquarters-readiness/full-lineage.json` and `full-lineage.md`, lists changed source files and classifies privilege-bearing API routes, migrations, CI workflows, Wrangler configuration, Admin, and public product files. It records the commit identifiers and behind/ahead state so the review can be reconciled after `main` changes.

The audit deliberately emits `production_approved:false` and `owner_security_review_required:true` regardless of the outcome. A file inventory is **not** an independent security assessment, and branch divergence must not be silently ignored.

At the initial observation on 12 November 2026 the in-progress release stack was hundreds of commits ahead of `main` and five commits behind it. The exact count changes as development continues; use the generated commit-specific JSON rather than relying on this text for final release evidence.

## Incident investigation UI

Open the private Admin, navigate to **Issues & risks**, and choose **View case** beside a finding.

The dialog displays:

- Severity, current status, affected environment, evidence text and timestamps.
- A verified first-party affected-page link when the URL matches a permitted YorpHives HTTPS host.
- Source-provided remediation guidance, or an explicit missing-evidence label.
- Recent repair jobs that record the same finding ID, including draft PR links restricted to this repository.

The **Prepare investigation** action navigates to the existing repair form and fills in the finding evidence. It does not issue any POST request, invoke Workers AI, change a finding, or publish a release. The founder still decides whether to submit the existing authenticated, quota-limited repair request.

### Known legacy asset-finding limitation

The original `admin_repair_jobs.finding_id` foreign key references `admin_findings` (monitor findings), but the Assets API also creates `admin_asset_findings`. A direct asset-finding ID could violate that foreign key during insert.

To avoid breaking the investigation experience, the new UI safely prepares **asset** findings as a general investigation with the evidence and asset finding ID preserved in the editable description. It does not falsely claim a persisted relationship. Monitor findings retain the normal reference. A reviewed additive association model and migration are required before reliable source-to-repair linking can be declared complete.

### Browser QA

`scripts/admin-smoke.mjs` exercises the new incident dialog using **browser-local synthetic GET response fixtures**. The tests check that evidence is visible, matching repair history appears, and the repair form can be prepared without dispatch. The synthetic data is not written to D1 or presented as a real incident.

The workflow's service identity remains read-only. Real founder mutations and repair-agent end-to-end operation still require separately authorized validation.

## Cost visibility and permitted providers

Approved services remain Cloudflare, existing ChatGPT/OpenAI assistance and free GitHub capabilities.

A read-only Cloudflare account-billing API lookup was attempted through the connected Cloudflare integration on 12 November 2026. It returned **HTTP 403** for both account usage and spend-policy APIs. The existing OAuth connection lacks the required Billing Read capability for the usage endpoint.

Therefore **actual billed costs are not verified**, and no dashboard or release report may translate inference dispatch counts into USD. No billing credential or additional plan was created. Billing reconciliation requires owner-authorized, least-privilege Cloudflare Billing Read access or a manual billing export; do not grant billing-write permissions to the application.

## Production blockers that remain

1. Independent security review of the whole diff since production `main`, including reconciliation of its diverged commits.
2. Full private staging migration audit and tested backup/restore.
3. Real repair-to-verified-preview rehearsal with independent QA; status must never imply that the repair is already verified.
4. Reviewed persistent association of monitor and asset findings to repair jobs, if required for production.
5. Actual Cloudflare usage/billing visibility and cost controls across mission, research and repair Workers.
6. Authenticated owner review and production-approval verification for the exact release commit.
7. Staging desktop/mobile accessibility, performance and no-regression acceptance.

No automated pipeline, agent or CI service account may waive these release blockers.
