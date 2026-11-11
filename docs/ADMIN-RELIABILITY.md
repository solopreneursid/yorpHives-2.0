# YorpHives Admin & Site Reliability

## Scope

This is a separate, private operations surface. It does not add links to public navigation and does not change production deployment configuration.

The first slice provides:
- Cloudflare Access JWT verification with a strict email allowlist.
- A private /admin/ dashboard served through Pages Functions.
- D1 monitor, run, check, and finding records.
- Read-only HTTPS checks for a fixed YorpHives host allowlist.
- Deduplicated findings with recovery verification.
- Scheduled CodeQL analysis for JavaScript and TypeScript.

## Zero-cost operating model

The implementation uses the existing Cloudflare Pages Functions and D1 binding plus GitHub Actions. It does not add a paid AI API, Cloudflare Workflows, a paid uptime vendor, paid browser testing, or a new Cloudflare Worker. Usage remains subject to existing service free quotas and account entitlements.

The HTTP check endpoint is manual in this first slice. Do not add a scheduled caller until an authenticated automation credential can be provisioned without exposing a long-lived admin token. GitHub Actions runs scheduled repository security analysis.

## Required environment setup

On the preview Pages project only:

1. Apply migrations/0004_admin_reliability.sql to the preview D1 database.
2. Confirm the Pages project has the existing DB D1 binding.
3. Configure these Pages environment variables for preview:
   - CF_ACCESS_TEAM_DOMAIN: Cloudflare Access team domain, without scheme.
   - CF_ACCESS_AUD: the Access application's exact audience tag.
   - ADMIN_ALLOWED_EMAILS: comma-separated, lowercase email addresses allowed into this admin surface.
4. Create a Cloudflare Access self-hosted application protecting /admin/* and /api/admin/*.
5. Permit only the intended administrator identities in the Access policy.
6. Test a permitted identity, a non-allowlisted identity, and an unauthenticated request.

Never set these values on production until preview is verified and production deployment is explicitly approved. Do not commit Access tokens, API tokens, account IDs, or secrets.

## Current checks

The initial monitor list checks the production homepage, Free Tools directory, discovery API, llms.txt, and preview homepage. The runner rejects hosts outside the explicit HTTPS allowlist. It uses bounded requests and does not accept caller-supplied URLs.

A 2xx or 3xx response is considered reachable. This is HTTP reachability only, not browser testing, functional testing, SEO auditing, vulnerability scanning, or proof that client-side tools work.

## Permission boundary

- Automated: read-only HTTP checks, findings and run history, CodeQL analysis.
- Not automated: code changes, merges, production deploys, DNS, secrets, Cloudflare configuration, data deletion, or active vulnerability scans.
- Active security testing belongs on preview/test only and must be explicitly approved.

## Next implementation slices

1. Preview browser smoke tests with Playwright and artifacts.
2. Dependency and secret scanning with free GitHub security features where available.
3. Preview-only passive OWASP ZAP baseline scan.
4. SEO and agent-discovery contract checks.
5. Safe scheduled health-check trigger after authenticated automation is configured.
6. Approval queue and pull-request preparation; no autonomous merge or deployment.
