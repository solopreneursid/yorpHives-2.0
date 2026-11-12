# Headquarters v6 — Real Demand Evidence, not invented opportunity counts

## Why this milestone exists

YorpHives should find existing small and large tools, apps, sector solutions and agent-callable services with meaningful usage or pain points — not just invent products. Evidence should come from independent, attributed observations where possible. The existing Free Tools catalogue is an inventory, **not** a limit on technologies or business opportunities.

This phase connects two complementary sources without pretending to have complete worldwide demand or verified conversions:

1. **First-party Cloudflare production HTTP analytics:** sampled grouped request counts on canonical `/free-tools/<slug>/` page paths. This is actual recorded HTTP traffic evidence, but *not* unique users, page interaction, tool execution, user retention, conversions, ad revenue or distinct human/AI-agent demand.
2. **Public WordPress.org plugin listings and Stack Exchange questions:** evidence of existing software and public requests for help, **not** global search volume, verified opportunity size, paid adoption, or profitable customers.

Existing HN / GitHub adapters continue collecting separate public signals. Different evidence kinds remain separate; AI is never allowed to turn public install bands or votes into fabricated sales.

## Private infrastructure

- Additive staging D1 migrations `0018_headquarters_traffic_evidence.sql` and `0019_headquarters_public_market_sources.sql`.
- Protected `GET /api/admin/traffic-evidence` and `GET /api/admin/market-sources`: `application/json` or `text/markdown` via `Accept` / `?format=markdown`. Cloudflare Access is mandatory for humans and authorized read-only service identities.
- `POST /api/admin/traffic-evidence` with `{"action":"capture"}` requires signed Cloudflare Access allowlisted **human owner**, same-origin JSON guards and a max **one capture per UTC day**. CI service identities have no write access.
- The existing Admin Pages **preview** has `CF_ANALYTICS_API_TOKEN` already configured as a secret and uses `CF_ANALYTICS_ZONE_ID` if set, otherwise the same production zone ID used by the Admin analytics page. Never send the credential to the browser, store it in D1 or expose it in error messages.
- The capture makes **one** bounded (12-second timeout) Cloudflare GraphQL request for the trailing 7 days, with `requestSource:"eyeball"`, successful 2xx/3xx responses, Free Tools path prefix, top 250 path groups, and original YorpHives hostnames only.
- Only canonical path **slugs** and grouped counts are stored. No query strings, visitor identifiers, IPs, user agents, cookies, geography, email addresses, sessions or per-request logs are collected. `db.batch()` is transactional.
- Cloudflare Adaptive GraphQL may be sampled and top-N truncated. An unlisted tool must never be reported as zero usage. Requests are not uniquely counted people and may include bots. The UI and agent-readable Markdown explicitly disclose these limitations.
- Existing product titles are cross-referenced against the Free Tools manifest in the protected UI. This is only an inventory match. It does **not** establish the tool works, converts users or earns money.

## Public market evidence

The existing private Cloudflare Research Workflow now also collects, at most once per normal daily research run:

- Three rotating `api.wordpress.org` official plugin searches, five listings each, covering a changing sample of already available software.
- Two rotating `api.stackexchange.com` official question feeds, seven questions each, sampled across nondeveloper and developer communities.
- HTTPS only, hard-coded hosts, no redirects, a maximum of five provider requests per run, 8.5-second timeouts, capped payload sizes, public listing/question titles and limited excerpts only. No scraping login pages or user profiles.
- WordPress's reported `active_installs` value is an **approximate installation band**, never exact revenue or market size. Stack Exchange voting score is a public **question score**, not Google query volume or regional customer interest.
- Sources are persistently deduplicated and retain the public original URL and recorded timestamp. Failed providers are warnings, not synthetic filler.
- New sources are displayed in the Market Explorer with a link to their original public listing or question. They are not automatically turned into verified products or software builds.

This adapter adds **zero AI inference** calls beyond the existing bounded research synthesis. The Research Worker remains private; Workers.dev and preview URLs remain disabled. Its schedule stays at 03:30 UTC daily. The new public source feeds are not live-proven until a real Workflow run completes on the revised code.

## QA checklist and gates

1. Apply migrations 0018 then 0019 to the **private preview D1** only.
2. Run `npm run check` (unit tests, authenticated access tests, transaction rollback, first-party aggregation, official provider contract tests, existing site regressions).
3. Deploy the branch to `yorphives-admin-staging` **preview** only, with existing Access, D1 and private research service bindings.
4. Verify that `GET /api/admin/traffic-evidence` and `GET /api/admin/market-sources` are read-only and produce no invented measurements before their first capture.
5. After authenticated owner action, confirm the first Cloudflare GraphQL capture against the account's Admin analytics, including sampling caveats. A service token cannot capture.
6. Confirm the revised daily research Workflow reads and stores real official WordPress/Stack Exchange records and reports provider failures explicitly. Never bypass the existing scan quota to manufacture a successful result.
7. Do not release or merge directly into public `main` before focused infrastructure review, live owner-action verification, and release lineage reconciliation. The current branches are stacked draft developments.

## Next evidence integrations

Search Console query impressions/clicks and landing-page attribution, measured tool-action completions, consent-aware product analytics, verified pricing research, legitimate global multilingual sources, public competitor data and agent API/MCP invocation counters are still **pending**.

Future scoring should separate `existing_product`, `public_problem`, `first_party_http_requests`, `verified_search_clicks`, `tool_completion`, `agent_invocation`, and `revenue` as independently identified metrics. Never collapse those types into an arbitrary "proven demand" score.

Where Cloudflare Analytics is not configured or the API fails, the UI must report missing evidence rather than zero traffic. The protected owner capture is intentional: production traffic data should not silently enter a new AI pipeline without its data-quality and privacy controls being verified.
