# Founder Go Live OTP — preproduction dry-run only

The release OTP route is separate from the retired assistant-admin grant flow. `POST /api/admin/go-live-otp` supports issue and verify **only** when `HQ_GO_LIVE_OTP_TEST_ENABLED=yes` is explicitly configured in a private staging environment. Production remains impossible: this route has no deployment capability and returns `production_deployed:false` and `production_approved:false` in every case.

It requires a verified founder identity (no CI or assistant tokens), exact owner email, same-origin JSON, configured private email transport, and migration 0030. The code is random six digits, HMAC stored rather than plaintext, bound to the exact target, SHA, preview deployment ID and reviewed PR. Failed attempts are limited; a code expires in five minutes and cannot be replayed. The exact live GitHub/Cloudflare release evidence is checked **both when issuing and when verifying**. Successful dry-run verification is audit-logged but never approves or publishes.

Normal development and isolated staging previews never require OTP. Do not set the staging test flag or execute this workflow during routine QA. Do not use the old `founder_otp_challenges` assistant-grant table for releases. The email OTP is not a substitute for independent login MFA if both use the same mailbox.

**Not implemented:** real independent production recovery proof, protected production executor, post-deploy verification/rollback, deployed website changes, billing read receipts. The founder's Go Live button stays disabled until these gates are complete and verified. Migration 0030 has not been applied to live or staging D1 by this branch commit.


## Zero-cost policy

Preproduction readiness reports now target **US$0 additional recurring infrastructure spend**. These static numbers are policy requirements, not spend enforcement: live Cloudflare billing remains unverified and optional AI work must remain limited until real usage receipts and provider-level controls are checked. No paid service is enabled by this branch.

## Permanent founder-only release contract

The founder is the **sole production release authority**. The everyday Headquarters release interface is **[ Preview ] [ Go Live ]**, side by side. Preview opens the exact version already tested in an isolated deployment. Go Live requires the founder's own verified Cloudflare Access human identity, an OTP delivered to the configured founder address, and a final confirmation bound to that exact version. Any new commit or changed verification evidence invalidates the release and requires another check.

**No administrator delegation for Go Live.** YorpMind, ChatGPT, other AI employees, CI service accounts and other signed-in human collaborators must not issue, verify, consume, or approve a production Go Live OTP. They must not be granted temporary or permanent administrator privileges as a publishing workaround. An otherwise valid service token carrying the founder's email still fails release authorization. The retired delegation API may expose historical records but must never generate new production rights.

Routine research, coding, repair, security review, independent QA and preview deployment proceed under narrowly scoped development permissions **without** founder approval. Production configuration changes, live data writes and new financial commitments require separately authorized owner controls, not AI-assumed admin power. Only the authenticated founder's explicit Go Live action and one-time code may authorize the exact reviewed production release.

The current route implements OTP **dry-run only**. Until a separately reviewed, narrowly scoped founder-only publishing executor and rollback/health checks are proven, the Go Live button stays disabled. Neither the current OTP test flag nor any workflow/service identity grants publishing authority.
