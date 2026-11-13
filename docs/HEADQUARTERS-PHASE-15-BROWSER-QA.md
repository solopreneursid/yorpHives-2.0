# Headquarters Phase 15 — browser launch checks

## What this phase implements

The 13 November 2026 staging database reconstruction (Phase 14) is complete;
the next release gate is **real browser behavior**. Two distinct forms of
evidence are required, and they must never be confused.

### 1. Offline, no-credential visual checks (this change)

`scripts/headquarters-offline-visual.mjs` serves the **actual checked-out
frontend** through a loopback-only local server and opens real Chromium with
Playwright. It verifies:

- All 15 navigation destinations open and select the correct location.
- Desktop (1440 × 960), tablet (1024 × 768), and phone (390 × 844) layouts
  fit without page-wide sideways scrolling.
- The original YorpHives logo is still present and unfiltered.
- The Prism Night CSS and compact layout actually render.
- Long issue and research panels scroll independently; table headers stick.
- Suggested improvements begin collapsed, not mixed with urgent problems.
- ChatGPT handoff opens a copyable message **without sending anything**.
- YorpMind handoff prefills the existing request box and requires the
  founder's separate decision to start work.
- Temporary permission remains unavailable with no owner MFA.
- Test-created reports and six screenshots are stored as non-sensitive
  GitHub Actions artifacts.

**Security boundary:** every `/api/**` request is answered with a local
synthetic fixture; POST/PATCH/DELETE attempts get HTTP 405; all external
network requests are blocked; no Cloudflare, GitHub, D1, Workers AI or owner
identity is accessed. The test has no credentials or privileged app bindings.

The workflow `.github/workflows/headquarters-visual.yml` uses only
`contents:read`. It installs a pinned temporary Playwright version and
Chromium to generate consistent artifacts. No permanent application
dependencies, billing provider or runtime endpoints are added.

Run in a properly provisioned local development environment:

```bash
npm install --no-save --no-package-lock --ignore-scripts playwright@1.56.1
npx playwright install --with-deps chromium
npm run test:headquarters-visual
```

This test does **not** prove live data reads, actual Access login, correct
AI execution, Cloudflare billing or production-release readiness. Screenshot
checks are structural and require human visual review; they are not an
independent visual-quality judgment.

### 2. Real authenticated staging checks (still pending)

The separate `.github/workflows/admin-staging-quality.yml` is already a
manual Access-protected staging pipeline. Do not automatically run it with
untrusted pull-request code and privileged tokens.

For real sign-in checks, a trusted operator must:

1. Review the exact source SHA and deploy the corresponding private Pages
   preview, never the public website.
2. Configure protected `staging-deployments` environment credentials
   `CLOUDFLARE_API_TOKEN`, `CF_ACCESS_CLIENT_ID`, and
   `CF_ACCESS_CLIENT_SECRET` inside GitHub Actions **without pasting
   them into ChatGPT or YorpMind**. The Access service token must be
   restricted to that particular staging application.
3. Trigger the `YorpHives authenticated Admin staging smoke tests`
   workflow manually on the reviewed branch.
4. Check that the report's deployment SHA and final preview match the
   reviewed source; confirm actual HTTP 200 JSON read endpoints and
   ordinary founder actions in a browser.
5. Resolve failed checks or configuration gaps; a skipped, missing or
   unavailable credentialed test means **not yet verified**.
6. Review the 390px and desktop screenshots and the founder's actual task
   flows before clearing the browser QA gate.

**The live website, private Access policies, production database, release
executor, and AI permissions remain unchanged by this Phase 15 code.**

### Important launch blockers following this work

- Run authenticated staging workflow and independently inspect the founder UX.
- Demonstrate one real issue-specific repair and revision-matched QA that
  creates the first eligible YorpMind historical lesson.
- Configure and verify separate Cloudflare Access MFA and connected
  assistant service identities before permitting temporary assistant actions.
- Finish cumulative security review of the stacked draft PRs, actual spend
  receipts, founder preview approval and controlled release rehearsals.
