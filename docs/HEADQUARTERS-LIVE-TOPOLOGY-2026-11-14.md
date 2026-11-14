# Headquarters infrastructure correction — live state on 14 November 2026

**Status: containment improved, NOT launch-ready.** Changes were made in the connected
Cloudflare account, not inferred from source code. These statements are time-scoped
snapshots, not a promise of continuous safety.

## Verified Cloudflare state after changes

**Primary private Headquarters Pages project** `yorphives-admin-staging`:
- Canonical production branch remains `build/yorphives-admin-reliability`.
- Automatic **production and preview** deployments from GitHub were disabled.
  An independently authorized external release/build action is now required
  before changing either Pages environment; the current canonical deployment
  remains running and unchanged.
- Canonical D1 binding `DB` **remains exactly as before**:
  `yorphives-2-catalogue-preview` (60 tables at inspection).
- The **preview** environment now binds a new, distinct D1 database:
  `yorphives-hq-preview-isolated-20261114` (0 tables at inspection).
  No production customer records were copied; no migration has been applied.
- Removed preview-only Service bindings `ADMIN_AGENT_SERVICE`,
  `HQ_ENGINE_SERVICE`, `INTELLIGENCE_SERVICE`.
- Removed preview-only retired OTP settings
  `FOUNDER_EMAIL_API_TOKEN`, `FOUNDER_OTP_HMAC_KEY`,
  `FOUNDER_OTP_ENABLED`, `FOUNDER_OTP_FROM`.
  Cloudflare production configuration and production Access policy were not changed.
- **Production continues to bind `ADMIN_AGENT_SERVICE` to
  `yorphives-admin-agent`.** That Worker has an existing GitHub credential.
  This is an unresolved **production execution authority** that contradicts
  the long-term read-only Headquarters product policy. Do not claim it is
  retired merely because newer source code turns legacy routes off.

**Retired experimental project** `yorphives-2-preview`:
- Production and preview have **no current D1 bindings**.
- Automatic preview deployments disabled
  (`source.config.preview_deployment_setting="none"`).
- Production deployments already disabled. The project/history remain.
- Historical preview deployments might retain prior deployment-time bindings,
  secrets or public URLs. Their access/security has **not** been independently
  proven safe by changing current project settings. Keep them out of founder
  release/recovery workflows until their routes are audited or retired.

**Public website** `yorphives`: unchanged and independently deployed from
`solopreneursid/YorpHives`. Its tool metadata development is in website
draft PR #7; corresponding read-only HQ integration is draft PR #57.

**Cloudflare operations performed**: disabled primary HQ automatic production
and preview GitHub deployments in addition to one new empty D1 database, one preview-only
D1 rebind, one preview-only removal of three privileged Service bindings,
one preview-only removal of four legacy OTP configuration entries, legacy
project automatic preview disabled and legacy project D1 unbound. There were
no production D1 SQL operations, Pages production changes or public site releases.

## Security invariants for future architectures

1. **Website owns public products and user-facing APIs.** HQ consumes fixed,
   versioned, bounded, public GET capabilities with no shared writable database.
2. **HQ is a monitoring and intelligence read-only surface.** No auto-repair,
   GitHub writes, AI administrative grants, release OTP or production publish
   routes in HQ. Developers change the correct repository via external review.
3. **Environment and privileges are explicit.** No preview D1 may point at
   the canonical D1. Preview must have no direct repair/AI/Workflow Service
   bindings, deploy tokens or retired OTP secrets.
4. **Live provider evidence outranks source declarations.** The new topology
   checker reads *both* Cloudflare Pages projects, verifies expected metadata,
   detects canonical privileged Worker binding and never logs database IDs
   or secrets. Its result is read-only and cannot authorize a release.
5. **No platform lock-in in product contracts.** HQ's internal data model,
   business intelligence and watchdog must work with any self-hosted HTTP/JSON
   adapter or supported private SQL engine. Cloudflare-specific topology code
   is an optional infrastructure verifier, not the HQ business logic.
6. **Owner-controlled release remains outside HQ.** Even every technical gate
   passing does not authorize a deployment. The founder independently reviews
   and publishes an externally prepared change.
7. **Fail closed on missing evidence.** An empty D1 has not passed schema,
   backup recovery, authenticated browser QA or independent outside-in
   watchdog requirements. An old successful test run is not new live proof.

## Priority follow-up work before any HQ live release

1. Inspect/restrict historical `yorphives-2-preview` deployment URLs,
   including known old deployment-time D1/Access authority; do not infer
   historical immutability from current project bindings.
2. Build and test **monitoring-only** staging schema on the new isolated
   D1 with synthetic data and a disposable independent restore. Never
   copy real user data without a privacy/security review.
3. Rebuild the active HQ Pages preview using the latest monitoring-only
   code; prove anonymous Access denial and authenticated browser behavior
   with exact SHA and synthetic test accounts.
4. Migrate away from the **canonical production `ADMIN_AGENT_SERVICE`**
   dependency, after establishing a functional read-only replacement.
   Then remove the legacy credentialed Worker only after a documented
   dependency check/rollback. Do not simply delete it today.
5. Install and independently supervise the local watchdog and its alert path,
   with fresh uptime/failure/recovery evidence.
6. Verify current private D1 backup retention and independently restore into
   another disposable D1/SQLite target. No restore to the canonical database.
7. Complete the stacked PR review and independent founder-led release.
   The new `scripts/headquarters-production-gate.mjs` and
   `scripts/headquarters-cloudflare-topology.mjs` must not report
   a false green state.

## Scope and cost note

A new preview-only D1 resource may create resource usage/billing. No paid
service, third-party AI or proprietary dependency was intentionally added.
The old canonical Cloudflare footprint remains until verified migration;
self-hosting can replace it in a future controlled rollout.

**Permanent policy:** Headquarters watches and recommends; the founder
develops, reviews, and publishes independently.
