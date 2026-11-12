# YorpHives Headquarters — staging and inference cost guardrails

## Approved operating model

YorpHives Headquarters runs on Cloudflare, existing ChatGPT/OpenAI-assisted development, and GitHub's free repository/CI features. OpenSEO and other commercial third-party integrations are not production dependencies. The first-party dashboard must remain useful if AI inference is unavailable.

No change in this branch authorizes a third-party integration, Cloudflare plan upgrade, production deploy, billing change, or production write.

## Cloudflare Pages preview idempotency

The existing GitHub Actions workflow posts a branch-specific deployment request to Cloudflare Pages. If Cloudflare responds HTTP 304 instead of a deployment object, the deployment client now performs one authenticated **read-only** listing of up to 50 preview deployments in the same approved Pages project.

The client reuses a deployment **only if all checks pass**:

- Environment is preview, not production.
- Deployment branch exactly equals the intended `build/*` branch.
- Commit SHA exactly equals the requested 40-hex commit.
- Latest deployment stage is `deploy` with status `success`.
- URL is HTTPS on an exact subdomain of the approved `<project>.pages.dev` hostname, without embedded credentials, port, query or fragment.

An absent, failed, pending or mismatched preview causes the job to fail. It cannot silently substitute production or another branch. New successful HTTP 200 deployment responses are also checked against the exact commit.

Browser and Lighthouse checks continue to run against the isolated preview URL returned by the workflow. Existing secrets remain in protected GitHub deployment environments and are not added to source.

## Mission brief dispatch cost allowance

The owner-controlled AI mission endpoint permits at most **six** dispatches per UTC day. The usage count comes from immutable `mission_queued` events in the existing private D1 audit ledger.

The final state transition checks both the three-active-mission limit and the six-daily-dispatch limit in one guarded SQL update. This guards against concurrent dispatches exceeding the limits. A queued event counts against the daily allowance even if inference subsequently fails; creating and cancelling planned missions does not count.

Headquarters presents `used / limit` and `remaining` counts in the mission screen and its authenticated JSON/Markdown response. At the limit the UI stops offering new AI briefs; existing monitoring, planned missions, review and repair operations remain available.

**These are dispatch counts, not financial charges.** Repair and research Workers have separate budgets. Workers AI tokens/neurons, Workflows steps, D1 operations, Cloudflare plan-level usage and GitHub storage are not yet available as reconciled currency costs in this dashboard. A six-dispatch allowance is not a Cloudflare bill cap; provider charges must be reviewed independently.

## Verification

Run:

- `npm run check` — repository syntax and Node SQLite contract tests.
- `npm run check:headquarters-readiness` — deterministic static preproduction audit.
- GitHub Actions browser/SEO and Lighthouse checks on isolated previews.
- Authenticated read-only Admin staging browser smoke.

The added Node tests cover exact preview matching, HTTP 304 reuse, failed and mismatched previews, the six-daily mission cap, and removal of the external SEO link.

## Remaining release blockers

- Full accumulated PR review against production `main`, not only child-branch diffs.
- Confirm authenticated owner review flows on real staging, including exhausted quota UI.
- Verify actual Cloudflare consumption and billing; apply provider-level notifications/limits when supported.
- Inspect global AI inference usage, including repair and research workers, before extending dispatch quotas.
- Complete D1 backup/restore, staging repair-to-preview, independent QA and production-release authorization tests.

This branch is a draft child of the production-readiness gate; no successful unit test or preview authorizes production publication.
