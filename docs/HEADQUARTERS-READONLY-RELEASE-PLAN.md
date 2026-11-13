# Founder-only read-only release plan

The private GET `/api/admin/go-live-plan` endpoint requires the real founder's Cloudflare Access identity (not a CI service token), independently verified HQ preview readiness, current GitHub canonical branch SHA, matching Cloudflare production deployment, and a strict GitHub fast-forward ancestry comparison from the verified base SHA to the exact reviewed preview SHA.

It can only return a **plan** with destination `yorphives-admin-staging`, release source `solopreneursid/yorpHives-2.0`, the expected previous branch SHA and previously served canonical Pages deployment ID for rollback. It cannot publish, does not call GitHub PATCH/merge, does not call Cloudflare rollback, does not consume OTP and returns `production_deployment_enabled:false`.

Public `yorphives.com` is **not** eligible for this plan: it belongs to another GitHub repository and requires independent cross-repo artifact promotion and a separate executor.

**Current state:** the GitHub canonical branch is two commits ahead of what Cloudflare serves, so the read-only plan **fails closed**. Recovery evidence, signed-in QA, cost checks, and founder-only release execution remain unfinished. No new token, database, storage or paid service was created by this change.

## Read-only founder drift diagnosis

The founder-only `GET /api/admin/go-live-plan` also reports a `drift` diagnostic before a release candidate is fully ready. It reads the canonical GitHub branch and Cloudflare project, and when their SHAs differ, reads GitHub ancestry from the **actually served** Cloudflare SHA to the current branch SHA. It reports the full source SHA, served SHA, prior production deployment ID and commit count only when the inspected identities match. It never creates a deployment, moves a branch or treats ancestry as authorization to publish. Missing read-only credentials, unverified identity, API failure, diverged history and stale evidence fail closed.

The founder's Release Evidence panel may display this mismatch as **Deployment mismatch · Go Live locked**. Other users and CI service identities cannot access the founder-only plan. This is diagnosis, not reconciliation. Do not change the source branch to silence this warning: first finish full-schema backup/restore proof, exact candidate QA, production rollback rehearsal, security review, cost visibility and founder OTP executor.

**Observed 14 November 2026 (read-only):** GitHub release branch `002596ece7bed88e26bb8ca3c521353640f0beb8` is **two commits ahead** of the successfully served Cloudflare canonical deployment `7843fa333e7e5c14e3219e7aa53df583eb066963` (deployment `77ffbf58-5ff8-4f01-90ba-6e657d9acfc0`). The most recent successful isolated preview verified in Cloudflare inventory belongs to older candidate `ad9f640e08ced5895b06d7509e5f0865ac260418`; it does **not** authenticate current PR head. These observations must be freshly rechecked before a future release.
