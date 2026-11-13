# Headquarters Phase 17 — actual public website proof

**Purpose:** Give the founder a simple, truthful answer to "Is the website
working?" before asking ChatGPT or YorpMind to fix anything.

## Implementation

- A new small, scrollable dark Prism Night panel on **Problems to fix**
  offers **Check website now**. It loads nothing automatically.
- `/api/admin/website-proof` requires the ordinary verified Cloudflare
  Access admin session before making any network requests. It has no write
  handler or D1 dependency and supports JSON and clean Markdown.
- The implementation checks exactly seven fixed public site paths:
  homepage, Free Tools page, Free Tools manifest, `llms.txt`, OpenAPI
  YAML, well-known agent discovery manifest, and Free Tools API.
- Network target is **hard-coded** to `https://yorphives.com`: no user
  input can supply a URL or cause an unexpected external request.
- Every check is GET-only, no redirect following, no secrets, capped to
  384 KiB / response and 5.5 seconds; at most two concurrent checks.
  The browser throttles repeated requests for 30 seconds.
- Successful HTTP 200 means only that a basic document-format or response
  header check passed. The result deliberately declares
  `documents_proven_fully_correct:false`.
- HTTP 401/403/429, response too large and network errors become
  **Could not verify**, never silently transformed into a site outage.
- Wrong document type, invalid manifest, non-200 public errors or missing
  basic HTTPS/framing protection become **Needs attention**, with a
  human-readable explanation.
- Earlier Headquarters findings are **not** changed, closed or used as
  fabricated QA attestations by this check.

## Founder options

Both buttons use the **existing** shared handoff flow:

- **Copy results for ChatGPT** opens a reviewable message in the
  existing ChatGPT handoff dialog. It is never posted automatically.
- **Prepare for YorpMind** fills the existing investigation request
  input without submitting it. The founder must explicitly choose
  whether to run it. Restricted repair-policy checks still apply.

The original logo and production website styles remain untouched.

## Actual external evidence

A separate `.github/workflows/website-public-evidence.yml` does
**uncredentialed GET-only** checks from a GitHub-hosted runner. It stores a
short route-by-route JSON report containing statuses and content types,
not response bodies, secrets, cookies or account data. The workflow
intentionally succeeds even when a website problem is observed: a green
workflow proves the check **ran**, not that the website is fixed. Review
`report.json` and the recorded overall verdict.

The offline Chromium workflow tests the same seven-row UI with
**synthetic** responses and records screenshots. It is never evidence
of an actual live website success.

## YorpMind learning boundaries

YorpMind's previous four incident-linked coaching reports in staging
remain in `proposed` state. A real observation can guide a worker's
next investigation; it is not an approved skill. A reusable, verified
YorpMind experience still requires a genuine repair draft, actual
reproduction, matching GitHub revision, independent QA and the
existing founder review. An inaccessible response is *not* a failure
to be trained as a verified fix.

## Required before production

1. Inspect the new private preview and website check results as founder.
2. Review the public HTTP evidence artifact; establish whether any
   machine-readable routes are serving HTML fallbacks.
3. Review an exact-SHA fix on an isolated source branch, verify its
   preview and run signed-in staging smoke.
4. Run a real monitor scan with the revised Worker **after** the
   signed-in scope and deployment are approved, so old false-positive
   findings can be correctly reclassified.
5. Independently verify a real repair and its regression tests before
   allowing YorpMind to record an approved reusable lesson.
6. Obtain founder approval via the separate, working MFA/OTP flow for
   every scoped production change. This PR grants no such permission.

**No production Worker deployment, automatic issue closure, model
inference, temporary admin grant, approved YorpMind skill or production
website release occurs in this phase.**
