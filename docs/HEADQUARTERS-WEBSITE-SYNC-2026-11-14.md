# Website ↔ Headquarters: source-owned, versioned observability

**Date:** 14 November 2026  
**Status:** Development adapter implemented in Headquarters; website publisher awaiting GitHub repository write permission. **No production code or data deployed.**

## Ownership / operating model

| Component | Canonical repository | Authority |
|---|---|---|
| Public website, products, tool registry, customer-facing APIs, advertising, payments | `solopreneursid/YorpHives` | The website alone serves real users and owns its product/route definitions. |
| Private Headquarters, read-only monitoring, alerts, private evidence history and opportunity intelligence | `solopreneursid/yorpHives-2.0` | HQ observes and advises. No website code writes, no site deploy, no shared writable DB, no OTP or release controls. |
| Development and release process | Independent human-led GitHub workflow | Reviews, tests, builds, backup/recovery and publishes changes **outside** Headquarters. |

**Current verified mismatch:** The public website's main branch contains a small static website and a browser-based `/free-tools/file-studio/` backed by `functions/free-tools/[tool].js`, with 21 currently defined tool slugs. The large `free-tools/` preview and `functions/api/v1/` tree inside Headquarters is **NOT** the canonical public website. Do not count those experiments as deployed public products.

GitHub's current connected integration can **read** `solopreneursid/YorpHives` but its attempt to create a website feature branch returned `403 Resource not accessible by integration`. Therefore a website publication or PR has **not** been performed. A ready-to-apply website patch is supplied separately in the conversation. Restore website write permission through the GitHub integration before code can be committed there, and still use review/CI/independent deployment controls.

## Unidirectional public metadata contract

A future website branch adds these two **public, fixed GET-only** routes, both derived from the actual website's `TOOLS` registry in `functions/free-tools/[tool].js`:

- `GET https://yorphives.com/api/v1/free-tools`
- `GET https://yorphives.com/free-tools/manifest.json`

They return bounded JSON with `schema_version:1`, `source:"yorphives-website"`, `count`, and an array of `tools` containing only public `slug`, `name`, `category` and `public_url`. **No private configuration, user/customer information, orders, revenue values, token, analytics key or Cloudflare credential is included.** One code-level source defines the actual slugs; API and manifest are two projections of the same source.

HQ's independently supervised watchdog observes the public website over fixed HTTPS URLs using read-only GET, bounded response size/timeouts and no cookies/authentication. HQ validates `schema_version:1` while continuing to accept the older bounded array/`data` layouts for transition, then compares the **sorted actual tool-slug fingerprint** of both successful public responses. Only a match earns `catalogue_sources_match`; two HTTP 200 responses that disagree yield `catalogue_sources_disagree`.

Until **the website itself publishes** either route, HTTP 404/410 is recorded as `optional_endpoint_missing` / state `unavailable` instead of falsely declaring a site outage. The public homepage, Free Tools directory and File Studio remain independently monitored. A 401/403/429 on an optional endpoint means unavailable/unverified, not confirmed downtime. An existing endpoint returning malformed JSON, unsupported schema or mismatched slugs warrants investigation. These findings are only about public catalogue metadata—not proof that PDF conversion, uploads, form submissions or tool actions work.

The founder Home/Watchtower shows `CATALOGUES MATCH`, `DISCOVERY NOT CONNECTED`, `PARTIAL SYNC`, or `API NEEDS REVIEW` with explicit evidence limitations. It never mutates the website.

## Evolution without coupling

1. **Add a product:** change only the public website's actual tool registry and implementation. The two discovery routes derive their list from that registry. HQ discovers changes automatically on its next externally supervised poll.
2. **Replace a model or framework:** website runtime upgrades independently; HQ only needs the compatible public metadata contract. Versioned readers support an upgrade window.
3. **Split products into dedicated applications:** allow each product to publish its own public, versioned, read-only capability manifest with a declared owner and bounded schema. HQ ingests through adapters and treats an unavailable manifest as unknown, not an outage, until officially adopted.
4. **Collect real traffic/revenue:** ingest timestamped receipts from first-party/self-hosted analytics, checkout, payment and accounting stores through separately scoped **read-only connectors**. Public metadata **must never expose confidential financial or user details**.
5. **Human release boundary:** observations and research suggestions travel into the founder's private inbox. Implementation, testing and deployment happen in the correct repository through external workflow; HQ cannot start a release.
6. **Hosting independence:** use standard HTTPS/JSON rather than a proprietary cross-cloud service or shared Cloudflare D1. Storage and AI brains are replaceable on private servers. Avoid implicit cross-project imports or copying live production customer data into preview.
7. **Deployment safety:** Cloudflare HQ Pages preview and canonical currently share the same D1 UUID; the hardening PR #56 blocks unsafe preview deployment. Website metadata development must not rely on that HQ database; do not deploy HQ staging until physically isolated.

## Acceptance gates

- Website `TOOLS` export only; no change to existing route's HTML response.
- Exactly one public tool registry; API and manifest arrays agree on slug set.
- GET-only, bounded, explicit content type, no user input URLs or write endpoints.
- HQ tests must prove 404 optional route is a coverage gap and mismatched catalogues trigger degraded evidence.
- HQ should never claim a product works merely because its catalogue slug exists.
- Separate website tests and HQ Node tests/CodeQL/browser QA must pass. Publish only after source review, correct repo permissions and founder-managed release process.

**Invariant:** Source of truth flows **website → read-only metadata → HQ evidence → founder decision → independent development**. Never HQ → automatic website change.
