# Founder-only read-only release plan

The private GET `/api/admin/go-live-plan` endpoint requires the real founder's Cloudflare Access identity (not a CI service token), independently verified HQ preview readiness, current GitHub canonical branch SHA, matching Cloudflare production deployment, and a strict GitHub fast-forward ancestry comparison from the verified base SHA to the exact reviewed preview SHA.

It can only return a **plan** with destination `yorphives-admin-staging`, release source `solopreneursid/yorpHives-2.0`, the expected previous branch SHA and previously served canonical Pages deployment ID for rollback. It cannot publish, does not call GitHub PATCH/merge, does not call Cloudflare rollback, does not consume OTP and returns `production_deployment_enabled:false`.

Public `yorphives.com` is **not** eligible for this plan: it belongs to another GitHub repository and requires independent cross-repo artifact promotion and a separate executor.

**Current state:** the GitHub canonical branch is two commits ahead of what Cloudflare serves, so the read-only plan **fails closed**. Recovery evidence, signed-in QA, cost checks, and founder-only release execution remain unfinished. No new token, database, storage or paid service was created by this change.
