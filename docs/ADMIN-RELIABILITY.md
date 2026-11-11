# YorpHives Admin & Site Reliability

## Scope

This is a separate, private operations surface. It does not add links to public navigation and does not change production Cloudflare configuration.

The first slice provides:
- Cloudflare Access JWT verification with a strict email allowlist.
- A private /admin/ dashboard served through Pages Functions.
- D1 monitor, run, check, and finding records.
- Read-only HTTPS checks for a fixed YorpHives host allowlist.
- Deduplicated findings with recovery verification.
- A separate scheduled Worker that runs the same health-check logic every six hours.
- Weekly GitHub CodeQL analysis for JavaScript and TypeScript.
- Playwright browser flows for homepage navigation, Free Tools search, JSON Formatter execution, and mobile navigation.
- Sitemap-wide HTTP, title, description, canonical and internal-link checks.
- Weekly Lighthouse reports for performance, accessibility, best practices and SEO.
- Gitleaks repository secret scanning, Dependabot update proposals, dependency review on pull requests, and a passive OWASP ZAP baseline.
- Six-hour SHA-256 snapshots of the production homepage, Free Tools directory, discovery API and agent discovery document, with protected change history in the admin dashboard.

## Zero-cost operating model

The implementation uses the existing Cloudflare Pages Functions and D1 binding, one lightweight Cron Worker, and GitHub Actions. It does not add a paid AI API, Cloudflare Workflows, a paid uptime vendor, paid browser testing, or a new D1 database.

The Cron Worker uses one trigger every six hours. It checks the five configured HTTPS monitors and captures bounded (512 KiB maximum per response) SHA-256 snapshots for four fixed production URLs. Runs, checks, findings, snapshots and detected changes are stored in the existing preview D1 database. Browser/SEO and Lighthouse checks run weekly through GitHub Actions and retain reports for 30 days. This is designed to remain within Cloudflare Workers and D1 free quotas at the current monitor count and cadence; usage is still subject to the account's actual plan and aggregate usage. No cost guarantee applies if account-wide free quotas are exceeded.

## Preview setup

The preview Pages project and preview D1 database are the only deployment targets for this initial implementation.

1. The preview D1 database already has the admin tables from migration 0004 and the preview monitor target from migration 0005.
2. The Pages project uses the existing DB binding.
3. The Cron Worker is deployed as yorphives-admin-monitor, with workers.dev and preview URLs disabled. Its only trigger is 0 */6 * * *.
4. Configure these Pages environment variables for preview:
   - CF_ACCESS_TEAM_DOMAIN: Cloudflare Access team domain, without scheme.
   - CF_ACCESS_AUD: the Access application's exact audience tag.
   - ADMIN_ALLOWED_EMAILS: comma-separated, lowercase email addresses allowed into this admin surface.
5. Enable Cloudflare Access for the Pages project's preview deployments and restrict its policy to the intended administrator.
6. Test a permitted identity, a non-allowlisted identity, and an unauthenticated request.

Never set these values on production until preview is verified and production deployment is explicitly approved. Do not commit Access tokens, API tokens, account IDs, or secrets. The Pages admin endpoints fail closed while Access configuration is absent.

## Current checks

The monitor list checks the production homepage, Free Tools directory, discovery API, llms.txt, and the feature-branch preview alias. The runner rejects hosts outside the explicit HTTPS allowlist, refuses redirects, uses bounded requests, and does not accept caller-supplied URLs.

A 2xx or 3xx response is considered reachable. The Playwright suite exercises the public homepage, Free Tools search, JSON Formatter execution and mobile navigation. The sitemap crawler checks each listed page for HTTP 200, title, description and canonical metadata, and checks internal links. Lighthouse measures public homepage and Free Tools performance, accessibility, best practices and SEO. ZAP runs its passive baseline spider against production; it does not run active attack rules. Secret scanning checks repository content and history.

The dashboard's manual run button and the scheduled Cron Worker call the same shared health-check module. Scheduled runs are persisted with trigger source scheduled.

## Permission boundary

- Automated: read-only HTTP checks, browser smoke tests, SEO/link checks, Lighthouse reports, Gitleaks, Retire.js browser-library vulnerability inventory, Dependabot proposals, dependency review, CodeQL, passive ZAP, and production content-hash change history.
- Not automated: code changes, merges, production deploys, DNS, secrets, Cloudflare configuration, data deletion, or active vulnerability scans.
- Active security testing belongs on preview/test only and must be explicitly approved.

## Future improvements

1. Add per-tool deterministic input/output tests for the highest-usage tools, extending the current all-tool page/control smoke coverage.
2. Add authenticated preview browser testing so proposed branch changes can be tested before merge without exposing Access credentials to public workflows.
3. Add explicit API schema and product-catalogue contract drift checks.
4. Add a reviewed recommendation-to-pull-request workflow, retaining human approval for code changes, merges and production deployment.
5. Add history-based performance and availability trends to distinguish regressions from normal variation.


## Asset intelligence and improvement recommendations

The asset-intelligence monitor expands coverage from a handful of uptime URLs to the public website, the Free Tools catalogue and available first-party product destinations.

- It discovers all tool routes from the production `/free-tools/manifest.json` instead of maintaining a second hand-written tool list.
- It discovers available first-party product destinations from the preview D1 catalogue. Only destinations resolving to the approved `https://yorphives.com` origin are fetched; external destinations are not crawled.
- It checks the homepage, Free Tools, Explore, Builder, Connect, sitemap, robots.txt, llms.txt, OpenAPI, the well-known agent manifest and Free Tools API.
- For each route it records HTTP status, response time, page title, meta description, canonical URL and a SHA-256 content fingerprint.
- It records missing metadata, unavailable routes, invalid JSON and content changes as deduplicated findings with evidence and suggested actions.
- It extracts version-pinned npm package references from script tags served by npm-compatible CDNs, checks npm registry deprecation metadata and latest stable tags, and surfaces deprecated versions, same-major updates and major upgrades separately.
- Upgrade recommendations are advisory. A newer version is not installed automatically; major releases require compatibility and regression review.
- Manual scans are protected by Cloudflare Access, same-origin checks and explicit confirmation. The scheduled Worker runs the same scan every six hours and writes only to the preview D1 database.

The monitor intentionally does not fetch arbitrary catalogue URLs, follow redirects, execute third-party code, or modify production. Browser-level Free Tools smoke checks are run by GitHub Actions against the public production website. The Playwright job opens every manifest-listed tool and verifies its page, tool mount point, at least one interactive control and absence of uncaught page errors. This is a smoke test, not a claim that every possible input/output combination has been exhaustively tested.

The npm registry comparison currently covers version-pinned npm CDN references found in HTML script tags. It does not yet establish compatibility, security status or upgrade availability for every arbitrary CDN, model file, browser API, external SaaS integration or unpinned remote asset. Retire.js and the passive security workflow provide a complementary browser-library vulnerability inventory.

## Admin dashboard additions

The dashboard now includes:
- Asset inventory grouped by website page, discovery/API route, Free Tool and first-party product.
- Current availability, HTTP status, response time and last-check timestamp.
- Prioritized recommendations with category, evidence and suggested action.
- Dependency observations showing current version, latest npm stable version, deprecation status and last registry check.
- Summary counts for monitored assets, degraded/unavailable routes, deprecated packages and updates worth reviewing.

Findings are signals for investigation, not automatic approval to change the site. Keep updates in a branch, run the browser/SEO/security suites, review the diff and obtain approval before merging or deploying to production.
