# Headquarters Phase 7 — Founder Action Center & AI mission reliability

## Objective

Show the founder **what action to take next** without converting an AI recommendation into permission to modify production. Stabilize the existing one-inference Workers AI mission pipeline before increasing the number of manager or specialist bot calls.

## Delivered in this draft

### Founder Action Center

- Add a high-visibility, mobile-responsive decision inbox **above** Headquarters mission controls.
- Read-only private GET `/api/admin/action-center`, protected by existing Cloudflare Access; JSON and Markdown representations via Accept header or format=markdown.
- Priority from **actual D1 records**: failed missions, results awaiting owner review, repair review requests, fresh scoped MFA requests, YorpMind manager reports, missing team migration and stale monitoring.
- Show **why the action exists**, **what the founder should do**, and an **Open workspace** button. Mission failure opens the failed filter; review opens the review filter.
- Only record-supported advice; bounded to 50 recent missions and six visible actions, with non-exhaustiveness disclosed.
- No POST/PATCH/action executor on this route. It does not start a model, modify D1, authenticate an OTP, merge GitHub PRs or deploy.
- No HTML sinks for untrusted model text; all output uses textContent. Cloudflare Access read rules remain authoritative and service identities stay read-only.

### Mission reliability

- Extract valid JSON from Workers AI result envelopes, fenced messages and complete JSON objects surrounded by commentary or stripped `<think>` text.
- Validate required fields and size limits. Never synthesize missing claims, verification steps or QA evidence.
- Persist a **compare-and-set claim in existing agent_jobs.input_json** before calling Workers AI. Resumed/duplicate step attempts cannot claim a second provider call for the same job.
- Disable automatic paid step retries. A malformed response stays a failed mission; a new mission requires separate founder dispatch and the existing 6/day AI limit.
- Record a safe diagnostic code and explicit operator action without exposing arbitrary provider errors or declaring completion.
- Existing mission result acknowledgement still does NOT count as independent QA, owner MFA, release approval or production changes.
- Add parser, API and action-queue regression tests; extend the existing mission workflow tests with a durable one-attempt assertion.
- Extend the existing authenticated staging smoke with action-center GET and Headquarters readiness inventory.

### UI behavior

- Badges use **ACT FIRST**, **NEEDS ATTENTION**, and **WHEN READY** instead of generic AI confidence.
- One action card explains next steps in plain language.
- Buttons navigate to the existing private workflow; they do not execute risky actions.
- New Failed filter ensures the previously recorded malformed-output case is discoverable.
- Evidence loading failures display an explicit lock, not an all-clear status.

## Independent release gates still open

1. All stacked PRs from `main` through this draft require a cumulative security, dependency and functional review.
2. Prior staging migrations 0024–0026 were applied via SQL API; Wrangler migration ledger must be reconciled. Migration 0027 is not yet applied.
3. Exercise the exact mission code in a private staging Worker and perform one owner-authorized, bounded inference rehearsal with successful persisted output and human verification.
4. Independently verify a Pages preview deployment ID bound to the exact reviewed Git SHA and the real repair regression tests.
5. Configure and exercise a separate Cloudflare Access MFA/OTP application; never share or store codes in YorpMind or ChatGPT.
6. Review D1 restore/rollback, actual billing receipts, fresh CI status and post-deploy production health.
7. Only then prepare a separately reviewed, one-time, scoped release executor. It remains OFF.

**Current status:** draft code and automated test definitions, not an operational production release. Successful Cloudflare Pages preview upload is not CI, owner QA, MFA or independent release approval.
