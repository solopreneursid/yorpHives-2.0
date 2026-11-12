# YorpMind — Founder-authorized delegated administration

## Product decision

YorpMind may **prepare, verify, preview and propose changes autonomously**. After the founder reviews the *exact* proposed operation and its working preview, the founder can complete an independent Cloudflare Access OTP/MFA step-up to authorize the scoped operation.

An MFA event is **not a transferable superuser password**. No agent receives a TOTP, passkey, Access cookie, root Cloudflare token, reusable GitHub token or broad human session. YorpMind receives only a narrow, short-lived, server-side authorization record for the **exact reviewed target**. Different changes require another review and authorization.

**Current rollout:** This branch implements the founder review and MFA authorization **foundation**. A production deploy executor is still explicitly disabled in `functions/_lib/owner-delegation.js` and is not connected to the private release workflow. A recorded authorization therefore does **not** deploy production.

## What a review request contains

`POST /api/admin/owner-delegations` must be submitted by an allowlisted interactive founder with same-origin JSON. It requires:

- A real existing repair job with status `needs_review`.
- An exact GitHub 40-character SHA linked to the isolated repair branch.
- Five recorded first-party CI checks (including browser, staged deployment, review and Lighthouse) successful **for that SHA**.
- Founder-recorded issue-specific QA for that same SHA, with reproduction, fix and regression all passing.
- A live GitHub PR head lookup to establish that the current PR is still open at the **exact reviewed SHA**, from the expected repository and restricted development branch.
- A safe HTTPS Cloudflare Pages preview URL in one of our approved preview projects.
- Six explicit founder checklist attestations covering visual preview, working functionality, mobile experience, QA, security and rollback.
- At least 40 characters of owner review notes.

The preview URL itself is owner-supplied. The CI staging check is tied to the commit, but **this phase does not independently prove that the supplied URL resolves to that exact deployment**. The upcoming executor must verify the Cloudflare Pages deployment ID and exact branch/commit through Cloudflare before performing any release.

The request is stored in private D1 migration `0026_yorpmind_owner_delegation.sql` with immutable job, SHA, action, preview, checklist and owner notes. Duplicate requests for a job+SHA+action are denied. Unapproved requests expire 15 minutes after creation.

## Independent OTP/MFA checkpoint

The secure approval page is **`/api/admin/step-up/owner-delegations?id=<approved_request_id>`**. It must be protected by a **separate, more-specific Cloudflare Access self-hosted application policy**, *not* by the same general Headquarters audience alone.

Required Cloudflare Access setup, after explicit founder review:

1. Keep the existing private Headquarters Access application and its allowed-founder email list.
2. Add a **distinct Access application** matching the approval endpoint path (and ideally the entire `/api/admin/step-up/*` path). Ensure Cloudflare's most-specific path policy wins over any broader general Admin Access policy.
3. Permit **only the same founder identity**—not CI service tokens or additional public users.
4. Enable **independent MFA** (TOTP in the Cloudflare login UI, or a stronger authenticator such as a security key) for this application. Configure it to **require MFA on every login**.
5. Set the application session lifetime to **five minutes or less**, and independently exercise logout/login, expired tokens, missing OTP, wrong audience, service-token rejection and MFA reauthentication.
6. Configure the application's **distinct audience** as `CF_ACCESS_STEP_UP_AUD` for the private Admin Pages environment. Only after proving the MFA app works, set `CF_ACCESS_STEP_UP_MFA_POLICY_CONFIRMED=yes`. Do not reuse a general `CF_ACCESS_AUD` value.

The server cryptographically verifies the Cloudflare Access JWT signing key, expected issuer and dedicated audience, the allowlisted human email, a **fresh issued-at time within five minutes**, and a maximum 10-minute token lifetime. It rejects CI/service-token identities.

**Do not add any OTP field to Headquarters or request OTP over ChatGPT, Slack, email, or GitHub.** OTP/TOTP is entered only in the separate Cloudflare/identity-provider authentication challenge. The application never receives or stores the OTP itself.

After MFA, the founder sees the exact job, PR number, commit SHA and reviewed preview again. A second, explicit HTML confirmation and 40–1000-character reason is required before the step-up endpoint updates D1.

## Delegation scope and consumption

A successful approval records:

- Exactly `deploy_verified_release` for one SHA and repair job.
- `authorized_by` equal to the original founder preview reviewer.
- Authorization timestamp and **10-minute expiry**.
- Immutable audit event with exact release scope.
- `execution_enabled:false` and `production_deployed:false` until the separately reviewed executor is ready.

This is a *delegated intent*, not an immediate deployment or root administrator session.

The future executor must atomically claim each authorization **once**, re-verify the live GitHub SHA and Cloudflare Pages deployment, recheck full cumulative security and release gates, prohibit stale/expired grants, and record the resulting production deployment/rollback evidence. It must never accept client-supplied `production_approved:true` as an authority signal.

For skill changes, the same philosophy will use a separately reviewed exact skill ID + revision + contents hash. A release OTP approval should **never** automatically authorize unrelated skills, financial spending or permissions changes.

## Security defaults

- No configuration or change to the existing Cloudflare Access policies was made in this PR.
- If the dedicated MFA app is absent or its distinct audience has not been confirmed, the step-up endpoint returns an explicit error and creates **no authorization**.
- The normal Admin JWT cannot be used as a substitute for the dedicated MFA JWT.
- Static files and public routes must not be permitted to invoke production executor secrets or D1 approval consumption directly.
- The separate MFA page uses no external JS, includes a restrictive CSP, and submits same-origin forms.
- CI service identities can read the ordinary delegation inventory if otherwise allowed under Access; they cannot create or MFA-authorize delegation grants.
- The form, approval record and returned data contain **no OTP or credential**.

## Costs and release readiness

This foundation uses existing Cloudflare Access, Pages, D1 and the existing GitHub repository; it requires no new paid provider or subscription. GitHub plan-specific environment approval protections must be verified before selecting a deployment workflow; do not assume private-repository GitHub Free includes required reviewers.

The connected Cloudflare account currently has no confirmed Billing Read authorization, so actual infrastructure spending is not certified.

**Private staging SQL evidence:** Migration 0026 was applied only to `yorphives-2-catalogue-preview` after confirming database ID and a Time Travel bookmark. The approval table, unique indexes and immutability trigger were read back. The SQL API does **not** reconcile Wrangler's migration ledger; that bookkeeping must be checked before official production migration.

**Remaining blockers:** Actual Access MFA application and policy configuration; owner challenge end-to-end test with a real TOTP; verified Pages deployment-to-SHA binding; cumulative stacked PR security review; isolated D1 restore and rollback drill; real owner-only approval and one-time executor claim; deployment and post-deploy monitoring; founder explicit production release authorization.

YorpMind is permitted to **execute owner-approved admin operations in the future**, but this branch does not yet give an agent administrative credentials or enable production publishing.
