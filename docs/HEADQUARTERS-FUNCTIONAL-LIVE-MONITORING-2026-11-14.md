# Functional read-only Headquarters preview — live evidence v3

**Owner feedback, 14 November 2026:** The first `/admin-next/` preview rendered
only five synthetic records. It looked functional but did not monitor the
actual website, support investigation or provide business intelligence.
It was **a proof of private UI and isolated D1 connectivity**, not a real
monitoring product. This revision corrects that user-facing mistake.

## What is now real and interactive (staging source only)

`/admin-next/` provides:

- Owner-triggered **Run live checks**, with bounded, GET-only public website
  checks and page-visible refresh every 120 seconds. The 120-second polling
  only operates **while a signed-in browser tab is visible**. This is not an
  independent always-on watchdog and cannot guarantee alerting.
- Live status, checked-at time, HTTP code, response duration and a readable
  reason for each check; filters for verified, needs-attention, unpublished
  and all endpoints. Missing discovery APIs are never reported as zero tools.
- Nine fixed targets on `https://yorphives.com`: home, Free Tools directory,
  File Studio, official Free Tools API and manifest, agent capability
  metadata, llms text index, OpenAPI and sitemap.
- HTML pages with HTTP 200 are **reachable only**; no claim that their UI
  or actions work.
- Machine-readable documents must validate their MIME, bounded response,
  website-owned version/source, schema and content. An HTML fallback
  returned with HTTP 200 is **degraded**, never healthy. Catalogues must
  both be verified and agree on exactly the same slugs before a real
  Free Tools count appears.
- Public metadata claims for remote MCP, identity, and payments are verified
  against the known *not enabled* status; this is discovery status only,
  NOT signed agent identity, settlement proof or WebMCP functional QA.
- The current older `yorphives.pages.dev` sitemap is shown as an issue,
  not a complete site outage. Only the exact known legacy first-party
  origin is recognized; no user-selected URL probing.
- Revenue reporting, market research, vulnerability scanning and the
  independent always-on watchdog are shown **NOT CONNECTED**, never falsely
  presented as zero problems or zero earnings.
- Synthetic evidence remains available under a clearly separated staging
  tab, and is never counted as real live website performance.

## Trust and execution boundaries

- `GET /api/admin/live-website-v3` requires an independently verified
  Cloudflare Access owner JWT, and `HQ_MONITOR_V3_MODE=staging` in the
  isolated preview only. CI service-token identity is denied. Production
  lacks the preview feature flag.
- Only the nine build-time fixed HTTPS URLs may be fetched; no external
  URLs, query-controlled hostnames, customer data or SSRF.
- No database mutation, provider admin API, GitHub write, agent task
  execution, LLM inference, money movement, repair or publication endpoint.
- The live API intentionally **does not persist evidence** yet. Historical
  audit logging and an independent 24/7 watchdog need separately authorized
  self-hosted monitoring infrastructure. Do not confuse the browser's
  refresh interval with a durable monitoring service.
- The standalone external owner Go Live/OTP release component remains
  separate from this HQ preview. No production releases are authorized.

## Acceptance tests

`tests/headquarters-live-website-evidence.test.mjs` verifies nine fixed
targets, content contracts, mismatches, HTML fallback, legacy domain warning,
false payment states, redirects and missing optional capabilities.
`tests/headquarters-live-dashboard.test.mjs` verifies Access before
data collection, staging-only mode and interactive browser controls.

Before production:

1. CI, visual and security checks pass on the exact branch SHA.
2. Build a separate Cloudflare Pages **preview only** with isolated D1 and
   no privileged Service bindings; leave both auto-deployment switches off.
3. Owner opens `/admin-next/`, presses Run live checks, verifies nonempty
   live rows, filters, timestamps and evidence discrepancies.
4. Independently check that JSON API responses contain actual JSON; compare
   a directly opened `/api/admin/live-website-v3` document.
5. Connect and test a 24/7 **external** watchdog, reliable alerts,
   first-party revenue receipts and market source adapters, separately.
6. Restore the full canonical production DB to a separate target, retire
   legacy privileged worker in a founder-approved replacement, and install
   an external owner-authenticated OTP/release executor.
7. Owner independently approves final published preview and exact artifact
   SHA; HQ never performs or authorizes Go Live.

**Status until owner verifies new preview:** live code implemented in a
development PR, not certified production-ready.
