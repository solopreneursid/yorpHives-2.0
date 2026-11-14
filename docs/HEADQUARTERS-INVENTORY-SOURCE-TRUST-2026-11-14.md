# Monitoring inventory source trust correction — 14 November 2026

Evidence observed in the **authenticated** older Headquarters UI at
`admin-staging.yorphives.com/admin/`:

- Monitoring summary displayed **5 website pages, 0 Free Tools and 0 apps**.
- JSON inventory sources reported `Unexpected token '<', '<!doctype ...' is
  not valid JSON`.
- Prior asset-scan rows misleadingly called HTTP 200 API/discovery routes
  `Healthy` despite the live inventory parser rejecting their bodies.

## Verified source causes

1. The deployed public website `solopreneursid/YorpHives` `main`
   `sitemap.xml` currently contains 24 `<loc>` values using the
   historical `https://yorphives.pages.dev` origin. The Headquarters
   inventory accepted only `https://yorphives.com`, silently dropping
   first-party tool paths. The corrected canonical sitemap is **only in
   unmerged website draft PR #8**, not the live site.
2. The public website `/api/v1/free-tools` metadata endpoint and
   `/free-tools/manifest.json` public contract are still only developed
   on website draft PRs #7–8. An HTML fallback with HTTP 200 is not
   a valid JSON tool registry. Legacy Headquarters expected a
   `{data:[...]}` or array layout and could not consume the new
   website-owned version 1 `{source,schema_version,count,tools}` contract.
3. The old running admin revision is **not** the newer monitored-only PR;
   greening its previous HTTP checks does not establish functionality.

## Corrective changes — code only, NOT a live deploy

- Introduce strict, bounded, origin-constrained
  `admin-monitor/website-inventory-contract.js`.
  Known older first-party sitemap `pages.dev` URLs are remapped to
  *paths* on the canonical `yorphives.com` only; third-party or
  credentialed URLs remain prohibited. Warn about the legacy sitemap
  origin until the public website fixes it.
- Accept the website-owned versioned Free Tools API/manifest and valid
  older arrays, without trusting missing, duplicate or invented tools.
- Asset intelligence and GET inventory fail closed on HTTP 200 HTML
  instead of showing a parser exception or an empty authoritative list.
- Health-check machine-readable URLs validate HTTP status,
  content-type and actual bounded response body, not just HTTP 200.
- Previously stored 'healthy' badges are marked **unverified in the API
  response** whenever independent current source validation fails.
  Original audit records are not deleted or modified.
- Monitoring UI explains source gaps and shows **Unverified**, rather
  than simply zero tools when the official catalogue is unavailable.

## Follow-up gates

- Review stacked draft PR #59 and this fix PR without deploying.
- After website PR #7/#8 is independently approved and published,
  verify `/api/v1/free-tools` and `/free-tools/manifest.json`
  respond with valid matching JSON on **yorphives.com** and
  `/sitemap.xml` uses only canonical `yorphives.com` URLs.
- After authenticated testing of a freshly built monitoring-only
  Headquarters preview, rerun its asset scan and review statuses
  against actual source payloads and tool functionality.
- The older HQ deployment still contains historical UI/release
  code and binds privileged Agent Worker. This PR is a monitoring
  correctness fix only; it does not resolve production migration
  or permit an automatic release.

**Permanent invariant:** 200 = reachable, not functional. HTML fallback
is never a healthy JSON/YAML/XML endpoint. Missing inventory = unknown
coverage, not proof of zero products.
