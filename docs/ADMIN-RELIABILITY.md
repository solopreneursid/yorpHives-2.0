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
- Weekly GitHub CodeQL analysis for JavaScript and TypeScript.\n- Playwright browser flows for homepage navigation, Free Tools search, JSON Formatter execution, and mobile navigation.\n- Sitemap-wide HTTP, title, description, canonical and internal-link checks.\n- Weekly Lighthouse reports for performance, accessibility, best practices and SEO.\n- Gitleaks repository secret scanning, Dependabot update proposals, dependency review on pull requests, and a passive OWASP ZAP baseline.\n- Six-hour SHA-256 snapshots of the production homepage, Free Tools directory, discovery API and agent discovery document, with protected change history in the admin dashboard.

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

- Automated: read-only HTTP checks, browser smoke tests, SEO/link checks, Lighthouse reports, Gitleaks, Dependabot proposals, dependency review, CodeQL, passive ZAP, and production content-hash change history.
- Not automated: code changes, merges, production deploys, DNS, secrets, Cloudflare configuration, data deletion, or active vulnerability scans.
- Active security testing belongs on preview/test only and must be explicitly approved.

## Next implementation slices

1. Preview browser smoke tests with Playwright and artifacts.
2. Dependency and secret scanning with free GitHub security features where available.
3. Preview-only passive OWASP ZAP baseline scan.
4. SEO and agent-discovery contract checks.
5. Agentic investigation and recommendations using deterministic rules first.
6. Approval queue and pull-request preparation; no autonomous merge or deployment.
