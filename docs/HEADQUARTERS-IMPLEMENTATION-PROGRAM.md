# YorpHives Headquarters — implementation program
**Scope:** private Headquarters, YorpMind, existing website development. This is a live engineering checklist, not a production attestation.

## Permanent authority boundary
- Founder alone may publish an exact reviewed release by **Preview → Go Live → personal OTP → final confirmation**.
- All assistant/admin grants and separate production delegation routes remain retired. AI roles, CI and service tokens cannot inherit founder identity or production write privileges.
- Autonomous development, investigation, QA, preview creation, research and ordinary learning require no founder approval, but work must stay in authorized test environments and within measured budgets.
- No new paid service, production data write, public website change or cost commitment is authorized by this program.

## Phase 1 — finish production readiness (blocking)
1. Maintain an exact-SHA private preview of the latest draft revision. Confirm Cloudflare's served SHA and preview identity after every change.
2. Run the protected real-browser QA workflow with Cloudflare Access, using exact SHA/deployment receipts; independently attest its results. A green offline screenshot job does not satisfy this check.
3. Audit the applied D1 migration ledger; apply any missing staging migration only after actual verified backup. Obtain SHA-256 of real R2 object bytes, complete a disposable full-schema/full-rows restore and verify cleanup. Historical or synthetic receipts do not suffice.
4. Reconcile GitHub branch and the actually served canonical Pages deployment without force-push or blind production promotion. Preserve the verified previous deployment ID for rollback.
5. Independently inspect cumulative changes, code permissions, secrets, supply chain and real authenticated owner-only mutations.
6. Verify actual Cloudflare usage/billing and prevent unapproved new spend. Policy thresholds do not prove provider-level billing caps.
7. Build and test the founder-only, one-use OTP release executor with exact-revision binding, branch compare-and-swap, audit receipts, post-release health and safe rollback. Keep executor disabled until every gate has independent evidence.
8. Run a final exact-candidate review in **Preview**. Only a verified founder identity and OTP can enable **Go Live**.

## Phase 2 — working YorpMind Engineering and QA
- The scheduled, model-free team scan can now persist **paired investigation proposals** to Engineering Lead and independent Quality Engineer from observed failed repair records. Reports are idempotent per day, bounded, source-linked, and explicitly not executed.
- **Next:** provision an isolated, no-production-credential execution environment for an approved development-only tool adapter; constrain command/filesystem/network access and use only installed, self-hosted model endpoints.
- **Next:** demonstrate exactly one real cycle: observed defect → Engineering branch patch → independent QA regression → verified private preview → audited learning receipt. Neither agent may self-approve code or production.
- Keep inference dispatch, tool use and retries within hard resource budgets. Record attempted/model output separately from independently checked results.

## Phase 3 — growth and revenue based on evidence
- Existing research, market signals and Business Intelligence remain hypotheses until real user demand and economics are verified.
- **Next:** connect observed traffic and existing tool activity to source-linked hypotheses; identify high-signal product experiments without making up Search Console, AdSense, conversion or revenue numbers.
- **Next:** test validated products in isolated environments; measure real outcomes before scaling or updating YorpMind memory. No automatic paid campaign or change to the public website.

## Evidence rules
A task is **implemented** only when source is committed and its tests pass. It is **verified live** only with real environment receipts for the exact revision. It is **production-ready** only after independent QA, recovery, cost, security, reconciliation and founder-exclusive release gates all pass. Do not equate a proposed work order, migration file, existing deployment, green CI, or OTP dry run with those later states.

**Current known constraints (recheck before use):** PR #48 is draft and substantial; the existing canonical HQ Pages revision and GitHub base branch differ; protected browser QA and current-schema recovery proof remain incomplete. No production authorization is present.

## Founder dashboard and Security workspace (14 November 2026)

The Home founder bar now shows only **Development issues**, **Preview** and **Go Live** shortcuts. Both release shortcuts open the Publishing workspace, where the separately rendered Preview link and disabled Go Live button remain authoritative. A Home shortcut cannot publish or issue an OTP.

**Tools & records → Security & access** is the sole interface location for emergency **Revoke legacy access**, historical assistant permission records and archived delegated-release records. The emergency button keeps the original founder-authenticated PATCH `revoke_all` route. That route only cancels older assistant grants and pending legacy email challenges; it does not remove the founder identity, production credentials, YorpMind memory or other provider tokens. The assistant-grant creation and step-up forms remain retired; Security has no permission issuance controls.

The protected browser QA now checks that legacy revocation is visible in Security, absent from Home and Publishing, the three Home controls are present and Go Live remains locked. It **does not click the destructive revoke button** or try to publish.

## Verified anonymous Access redirects

The staging Access preflight accepts redirects only to the verified private preview's own HTTPS `/cdn-cgi/access/` path or an HTTPS `*.cloudflareaccess.com` Access path, without embedded credentials or a nondefault port. An unrelated site using the same URL path is not accepted. The attestor requires the preflight's explicit denial provenance for both tested paths. A direct 401/403 is recorded as an HTTP authentication denial—not cryptographic proof of an Access login. Authenticated browser QA remains necessary before marking the private boundary fully verified for any exact release.

## Critical environment finding — shared D1 database (14 November 2026)

**Verified directly from read-only Cloudflare Pages metadata and D1 table/migration queries:**

- Pages project `yorphives-admin-staging`, **preview** D1 binding `DB` and **canonical/production** D1 binding `DB` both point to the *same physical database* UUID `e8690813-b139-44a2-a1c7-bea2d2777ead` (`yorphives-2-catalogue-preview`).
- The physical D1 has **29 applied migrations**, latest `0029_founder_email_otp.sql`; `0030` and its dedicated Go Live challenge table are not applied.
- The account's R2 inventory shows `yorphives-processing-temp`; this is not verified as a durable Headquarters recovery backup bucket. The Pages project does not expose an R2 binding for HQ backups.
- The previous assumption that the Headquarters database was absent was **incorrect**. The actual blocker is that it is **shared with the canonical environment** and cannot safely be treated as disposable staging data.

**Implemented hard controls:**

1. `verifyHeadquartersD1Isolation` validates Cloudflare Pages project provenance and requires independently identified, different physical D1 UUIDs for preview and canonical configurations.
2. Both live release readiness and exact-revision fast-forward planning **fail closed** when the D1 databases are shared.
3. The founder-only read-only release plan surfaces the isolation status alongside source/deployment drift.
4. Protected staging browser preflight checks database isolation from real Cloudflare Pages metadata **before sending test credentials**. Independent QA attestation rejects missing isolation evidence.
5. These are readiness blockers, **not authorization to create a new D1**, apply migrations, change bindings, take backups, or publish.

**Owner intervention required before isolated staging QA and migration 0030:**

- Explicitly authorize a *new dedicated preview-only D1* under the existing Cloudflare account, after confirming the free-tier/cost impact. This must be created with a new unique database ID, then **only preview** Pages DB binding `DB` can be moved to it. Do not overwrite the currently shared D1 or modify the canonical production binding.
- Verify backup and restore evidence for the original canonical database and a separate, *disposable*, appropriately budgeted restoration target before modifying production-related configuration.
- Rerun a full schema audit and necessary **staging-only** migrations on the new isolated preview database, with a post-migration backup, restore test, and cleanup evidence.
- Run signed-in protected browser QA on a fresh exact-SHA preview. An isolated binding alone is not proof that the browser workflow passed.
- Never share founder OTPs, Cloudflare API tokens, or database dumps in chat. Owner credentials remain in the provider's secure UI.

**Go Live stays disabled.** Shared data cannot be fixed by simply changing a green CI flag or marking a checklist complete.
