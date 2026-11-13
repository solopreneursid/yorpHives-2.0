# YorpHives Headquarters — one founder approval, only at Go Live

**Status:** Working policy and staging-only UI on a draft branch. The production release executor and OTP-bound Go Live action are not yet implemented. Do not deploy this branch to production without separate review.

## Final decision

The founder is the **only administrator**. No YorpMind, ChatGPT, manager, specialist or bot receives administrator privileges. Existing temporary grant features are superseded and must remain inactive; the legacy revocation control remains accessible for cleanup.

**No founder approval is needed** for an authorized worker to investigate, plan, write code, fix bugs, iterate on new features, run quality/security checks, open isolated development branches/PRs, or update nonproduction previews. Staging work must be constrained by its existing credential scopes, rate limits, budgets, and isolation boundaries. “Free to build” does **not** permit access to production databases/secrets, privileged account settings, customer data, paid purchases, or live resource mutation.

**One founder approval is required** to publish a specifically verified candidate to a production domain, or to perform equivalent production data/configuration changes. Independent production/security administration, billing changes, and spending remain founder-only operations, not routine development.

## Required experience

1. Developers and YorpMind work normally on isolated branches and staging; failures are triaged and retried without asking the founder to approve incomplete work.
2. Independent QA and security verify the exact revision; staging preview is demonstrably tied to that same commit SHA; backing data migrations, recovery and rollback are rehearsed and recorded.
3. After all checks pass, the private Releases screen shows **Production-ready**, the exact URL for **Open verified preview**, the human-readable change summary and risk/rollback details.
4. The founder reviews that preview and presses **Go Live**.
5. The server verifies an owner-only authenticated session and delivers a short-lived, single-use OTP bound to the exact candidate SHA, preview/deployment ID, environment, actions and expiry.
6. Server rechecks the exact immutable artifact and all release gates immediately before consuming OTP and publishing. Any change, expired code or failed check requires new review; no self-approval by AI.
7. The release executor writes an audit receipt, verifies production health and preserves a tested rollback candidate. Failed verification stops or triggers the approved recovery workflow.

The OTP must not be shown to or stored by assistants. If the same email is used for initial login and approval, email OTP alone is not an independent second factor; prefer stronger independent owner authentication for production.

## Stage implemented in this branch

- Founder home navigates directly to a compact **Preview → Go Live** review page; obsolete “Grant temporary access” controls are hidden.
- The private release desk deliberately renders **Not production-ready**, with no preview URL and a disabled **Go Live · OTP** control, because the existing D1 evidence endpoint cannot attest live SHA/preview/release readiness.
- Existing historical CI/QA details remain available in a collapsed technical section.
- Draft mission and repair notices are called **team work**, not production decisions; no production permissions are changed.
- Historical temporary-grant backend endpoints and revocation mechanism have not been rewritten. Confirm their feature flags are disabled, revoke any active grants, then remove old issuance routes in a separately tested cleanup.

## Work still required before enabling Go Live

Build a read-only server-side release-candidate verifier that joins an exact commit, real green CI, independent QA, verified Cloudflare preview, migration/recovery and rollback evidence, all using canonical sources; then implement an owner-only single-use OTP release executor with scope-limited production credentials and immediate post-release verification.

Do not enable this button with browser booleans, a record saying `needs_review`, draft PRs, owner-reported QA alone, or a historical D1 receipt. No new provider or spending authorized.
