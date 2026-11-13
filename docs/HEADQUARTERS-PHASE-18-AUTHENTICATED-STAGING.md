# Headquarters Phase 18 — real signed-in staging check, without redeployment

## Why this phase exists

The former protected browser workflow created or reused another Pages
deployment when asked to test Headquarters. The source was reviewed,
but the workflow unnecessarily held a deployment-capable token for
a check intended to be read-only.

This phase separates **building a preview** from **checking an existing
preview**. It also adds verification of the new founder-first website
panel and both ChatGPT and YorpMind handoffs using actual private API
responses. The original YorpHives logo and public site remain unchanged.

## Live security setup observed on 13 November 2026

- Cloudflare Access already protects both the **Admin staging deployment
  alias** application and its private API; anonymous requests against
  the tested preview returned **HTTP 403** for both `/admin/` and
  `/api/admin/yorpmind-team`.
- The private Pages preview has a staging D1 binding and existing
  Access configuration for the owner and the isolated CI test identity.
- A dedicated **MFA step-up Access app is not configured** in the staging
  Pages environment. As a result, temporary elevated assistant
  privileges and release execution must stay locked.
- The existence of the CI Access policy does not prove a service token
  can successfully sign in. This requires a real authenticated run.

## What the protected workflow now does

1. Open and review the latest isolated Headquarters preview.
2. In GitHub Actions → **YorpHives authenticated Admin staging smoke
   tests** → **Run workflow**, select the matching development branch,
   then check the single box: **I reviewed the private Headquarters
   preview and want to run the read-only sign-in checks**. There are
   **no technical SHA or deployment IDs to copy**.
3. A protected `staging-deployments` environment must approve access
   before any credentials become available. Do **not** share API tokens,
   Access client secrets, or OTPs with an assistant.
4. The workflow confirms that the selected source is exactly the GitHub
   branch HEAD and refuses `main` or `master`.
5. It searches a bounded list of existing Cloudflare Pages previews,
   finds an already successful `yorphives-admin-staging` deployment
   whose exact branch and code SHA match the checked-out revision,
   and refuses all stale, production or untrusted hostnames. **It
   never creates a new deployment.**
6. Before sending credentials, it makes anonymous GET requests to
   `/admin/` and `/api/admin/yorpmind-team`. Both must return a
   legitimate Access denial. An anonymous HTTP 200, wrong redirect or
   uncertain response stops the test.
7. Only then does the protected Access test identity use the verified
   private preview for browser and API checks. It verifies website
   checks, both handoff buttons, six manager roles and source-linked
   coaching records in private staging D1.
8. The workflow uploads a **sanitized summary**, never raw private
   response bodies or credentials.

This version of the workflow does **not deploy anything**, create a new
preview or invoke Workers AI. The QA test may issue deliberately invalid
POST requests to verify their explicit denial; their success is NOT
expected or permitted. No production deployment is authorized.

## What would count as passing?

- Complete, already successful matching-SHA Pages deployment.
- Anonymously blocked web shell and private API.
- Genuine service-token authentication and 200 from the expected
  **private** read-only endpoints.
- Seven actual public website response checks (not fabricated demo data).
- Founder-friendly interface renders the seven items.
- ChatGPT handoff opens a visible copyable message; YorpMind handoff
  only fills the unsent investigation form.
- Engineering and Quality coaching reports appear with source evidence,
  no approved skills or false claims of independent repair verification.
- No unapproved job dispatch, automatic production publishing, or
  authenticated JavaScript errors.

**At the time this change was made, only the anonymous boundary test
had been independently executed. The protected signed-in CI workflow
has not yet been run for this new revision.**

## Before going live

There is still no verified owner MFA step-up approval application,
end-to-end production repair, controlled rollback rehearsal, or
cumulative stacked-source security signoff. Green public route checks
on a preview are **not** a release authorization. Existing YorpMind
coaching notes remain unapproved observations. The founder must
separately view a complete preview and approve exact scoped
production changes through the verified security process.

**Safety policy:** no live D1 writes, no new assistant permissions,
no AI dispatch, no production release and no skills approved in this
phase. The staged workflow must fail closed if any identity or source
verification cannot be completed.
