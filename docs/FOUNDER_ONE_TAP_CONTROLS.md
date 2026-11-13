# Founder Control — one-screen permissions and fix approvals

## Founder request

YorpHives must make high-impact work simple: **click a button, receive a one-time code at the founder's verified email, enter it, and confirm**. This applies to (a) one exact proposed fix and (b) temporary access for YorpMind, ChatGPT or both. A persistent, prominent **End all assistant access** button must revoke rights immediately without an OTP.

The founder is the only permanent administrator. YorpMind and ChatGPT are peers. Neither may approve, renew or expand its own permissions.

## What is implemented in this draft

- The founder home displays a compact action strip: Review proposed fixes, Grant temporary access, End all assistant access.
- Temporary access form moves seldom-used scope, action and reason settings into Optional. When the email-verification backend reports ready, the form requests a six-digit code. If only the older separate security gate is configured, it still supports that legacy path.
- Emergency `PATCH /api/admin/assistant-permissions` with `{"action":"revoke_all"}` is owner-session-gated, same-origin-checked, atomic in D1 and audited. It revokes **all current active and pending individual grants** in one request, returning a verified count. It does **not** require an email code, a second identity challenge, or a functioning mail sender.
- A "Both together" option stays **disabled until email delivery, the migrated D1 challenge table, and separately authenticated assistant connections are all configured**. When enabled, one correct code atomically grants both assistant identities without production release rights. Existing per-grant stop buttons remain.
- Added `0029_founder_email_otp.sql`, `/api/admin/founder-otp`, a minimal one-time-code dialog, and a secure email transport adapter (restricted native `send_email` binding **or** Cloudflare Email Service REST).
- Email code is HMAC-protected, action-bound, stored only as a digest, valid for five minutes, limited to five attempts and three requests per hour. Replays, resends and emergency cancellation are rejected server-side.
- Emergency stop now also cancels in-flight and unspent email-code requests.
- Production releases, model calls, GitHub merges and unrestricted admin permissions remain locked.

**Not operational yet:** real email sending (sender, verified source domain, scoped API token or binding), D1 migration 0029 in the private preview, verified YorpMind/ChatGPT service identities and the private action service. Secure two-way assistant communications and exact-fix application are also pending. The email route and paired-grant path are coded but must fail closed until every dependency is verified. A private git-based Pages preview has been built; no existing Headquarters alias or public production website was changed.

## Target on-screen experience

1. "Fix ready" shows a short human-language change summary, what will be changed, revision identity, tests, preview and rollback. **Apply fix** sends a 6-digit code to the founder's saved verified email. After correct OTP, the server approves **only that exact fix**. Failed test/changed SHA means refuse and require fresh approval. Staging may be applied first; production requires checked release evidence and an independent release gate.
2. "Temporary access" offers **YorpMind**, **ChatGPT**, **Both together**, a short time (15/30/60 minutes), and optional advanced scope. **Grant access** starts the same per-request email-code dialog. Only one confirmed OTP is required for a joint grant.
3. Both assistants write and read a shared, provenance-linked task discussion. They can challenge each other's drafts, test patches, and record a lesson after the result is independently verified. Sharing a board does not confer the other's identity.
4. A fixed-status **End all assistant access** revokes both assistants' current and pending grants without OTP and works even if the email service is down. The server rejects subsequent actions. Already-running external operations also require cooperative cancellation checkpoints; a database revocation cannot undo external actions already completed.

## OTP protocol for implementation (server side, not browser-only)

- Require an existing signed-in, owner-only Headquarters session. Email is retrieved from the identity record, **never supplied by a browser form or AI agent**.
- For each high-risk action, store a canonical immutable payload: `type`, selected assistants, maximum capability, scope, duration, exact fix SHA/artifact ID when applicable, expiry, owner ID, idempotency key, and cryptographic payload digest.
- Create 6-digit codes with a CSPRNG. Do not store plaintext OTP. Store HMAC of challenge ID, action digest and code using a secret held outside D1. Enforce a 5-minute expiry, a small attempt limit (max 5), rate limits on sends and verification, and replay protection. Invalidate old challenges after resending.
- Use a **pluggable outgoing email transport** (self-hosted SMTP bridge or securely scoped Cloudflare Email Service binding) with a verified sender and fixed recipient. Sending failures must not produce active permission grants. Never email passwords, API keys, or broad bearer links.
- OTP verification and the corresponding grant/fix authorization are an **atomic single-use database operation**. Reject code reuse, changed fix content, expired scope, altered assistant selection, or wrong owner. Rechecks of identity, verified CI results and exact SHA occur immediately before any sensitive action.
- Avoid claiming email OTP is an independent second factor when the original login itself used the same email inbox. Keep an independent founder login mechanism and stronger device authentication as an optional upgrade.

## Collective assistant permissions

- The initial backend models a single immutable email challenge for the selected assistants and creates **two separately bound grants** in one transaction. A dedicated long-lived group record and shared workstream are still to be added; no broad admin role is ever issued.
- Verify the **same OTP** for the group. Activate both subordinate grants within one transaction. If either identity/connection is missing, do not grant partial shared access.
- Maintain strict separately validated assistant service identities, audit every action, and enforce least-privilege operations at the server. There is no root admin credential handed to an LLM.
- Shared discussion must run through authenticated tasks/messages, signed source IDs, and a durable log. Training updates are suggested from checked evidence; a model cannot mark its own fix as independently tested.
- Integration of the external ChatGPT conversation is **not automatic**: a distinct authorized connector/gateway must be connected. The current ChatGPT chat alone is not a signed, continuously running Headquarters service.

## Release safety and acceptance gates

**Emergency stop acceptance:** authenticated owner, same-origin operation revokes all active/pending grants as a single audited DB transaction; a second click yields count 0; wrong origin/identity and malformed payload are blocked; any follow-up assistant action is denied. Re-read permissions to display actual state.

**OTP acceptance:** correct email recipient, codes never logged/stored plaintext, wrong/old/replayed code denied, send throttling, no mutation before verification, payload-binding and exact SHA verified, action complete only after receipt.

**Collective acceptance:** a single OTP controls an all-or-nothing pair, no identity confusion, expiry/cancellation honored even during queues, no permission escalation, clear collaboration provenance and genuine tests.

**Fix application acceptance:** only pre-reviewed, signed/revision-pinned fixes, protected staging tests, visible diff and rollback, and separate verified production gate. No silent site deployment.

No production release until authenticated staging browser QA, D1 backup/restore, permissions tests, real email delivery, identity integration, cumulative security review and founder acceptance all pass.

## Private staging setup — exact requirements (not production)

1. Backup the **preview D1** database, rehearse recovery, apply `migrations/0029_founder_email_otp.sql`, then verify its schema and migration ledger. Do not use the production database.
2. Configure the owner-only preview environment settings:
   - `FOUNDER_OTP_ENABLED=yes` (only after tests pass)
   - `FOUNDER_OWNER_EMAIL` = the identity-provider-verified founder address
   - `FOUNDER_OTP_FROM` = verified YorpHives email sender
   - `FOUNDER_OTP_HMAC_KEY` = 32+ byte randomly generated secret (secret setting, never in Git)
   - Email transport: an allowed `FOUNDER_MAIL` binding, **or** `FOUNDER_EMAIL_API_TOKEN` as a restricted Cloudflare Email Sending API token secret plus `FOUNDER_CF_ACCOUNT_ID`. No generic Cloudflare deployment token.
3. Configure and verify a separate `CF_ACCESS_AGENT_AUD` and distinct `CF_ACCESS_YORPMIND_SERVICE_TOKEN_ID` / `CF_ACCESS_CHATGPT_SERVICE_TOKEN_ID`, and the private `ADMIN_AGENT_SERVICE` binding. Without this, no code can activate a grant.
4. Verify the sender with a real inbox-based test requested by the owner, check no credentials or codes appear in logs, and run integration tests for both, single and revoked grants.
5. Continue to require exact revision preview, independent browser tests, safe release authorization and recovery drills before any production activation.

**Caution:** email-only verification is not independent MFA if the same mailbox is the login method. Founder identity and permissions still depend on the already signed-in Cloudflare Access session. Prefer passkeys or another authenticator for high-value production releases.
