# YorpHives Headquarters v8 — Unified Business Intelligence

## Mission

Help YorpHives discover established products and useful emerging opportunities across **any** industry, technology, product format or geography, while distinguishing real evidence from speculation. The existing 73 Free Tools in the development manifest are current inventory, not limits. The public production catalogue can differ from the feature-branch manifest; treat discrepancies as reconciliation findings.

## What is implemented

The Cloudflare Access-protected **Business Intelligence** view (`/admin/#business`) shows a single founder decision board. Source adapters remain independently accountable:

| Input | Stored source | What it supports | What it cannot prove |
| --- | --- | --- | --- |
| Production Free Tools requests | `hq_traffic_captures` + `hq_traffic_tool_paths` | A route received HTTP requests in an Adaptive top-N sample | Unique humans, tool completion or revenue |
| Browser completion counters | `hq_tool_activity_daily` | A browser reported a successful action | Independently validated humans, conversions or real customer outcomes; staging QA may be included |
| Private authenticated API executions | `hq_tool_activity_daily` | A scoped Access credential executed a bounded server tool | Public agent demand, true autonomous identity or paid API usage |
| Existing online software | `hq_public_market_signals` | Publicly listed third-party products | Verified search volume, exact active users or monetization |
| Public problems and questions | `hq_public_market_signals` | At least one public participant raised a problem | Global market representativeness, frequency or commercial intent |
| Source-backed hypotheses | `hq_demand_categories` + `hq_demand_evidence` | AI research with surviving attributed public references | Independent demand verification, viable economics or actual adoption |
| Owner research experiments | `hq_validation_experiments` | Owner reported results of a structured validation experiment | Independent or statistically reliable market validation |

External data sources are not retroactively normalized into an invented universal score. Each opportunity exposes the original evidence class, number and unit (when present), what the observation supports, what it **does not** support, missing evidence, original HTTPS links and a concrete next research step. Its numerical **investigation priority** orders internal work only and never estimates demand, money, probability of success or product quality.

### Source coverage dashboard

The board explicitly reports whether each evidence stream is observed, missing a collection, an unverified proxy, restricted, or **not ingested**. Crucially, it reports **Search Console**, **GA4** and **revenue/AdSense/billing** as *not ingested*. They receive no fabricated zero-valued metrics.

YorpHives Headquarters must not depend on OpenSEO or any new third-party subscription. The prior OpenSEO experiment is **not a production dependency**. Search Console, GA4 and verified advertising/billing data remain **not ingested**. The owner must explicitly authorize any future integration, including any Google property connection, before engineering begins that integration. First-party Cloudflare observations and first-party product events remain the supported baseline.

### Founder review

`migrations/0021_headquarters_business_opportunity_board.sql` adds:

- `hq_business_opportunity_reviews`, independent of the candidate's industry or technical implementation. Candidate keys include `tool:<slug>`, `api:<slug>`, `market:<public_signal_key>`, and `idea:<source_backed_category_key>`.
- `hq_business_opportunity_events`, append-only audit events recorded by SQL triggers on initial review and subsequent revision updates.
- Optimistic `revision` locking, no owner-review mutation for a candidate not currently present in the source-linked board.

`GET /api/admin/business-intelligence` offers bounded JSON or clean Markdown (`Accept: text/markdown` or `?format=markdown`), including full evidence qualifiers and missing integrations. A signed, allowlisted Cloudflare Access identity is required. CI service credentials are read-only.

`POST /api/admin/business-intelligence` accepts only `action:"review"`, a visible candidate ID, expected revision, a research review status, and a bounded optional note. It requires a real human owner and same-origin JSON; status changes are audited. Replays are idempotent, stale revisions return HTTP 409, nonexistent/unverified IDs return HTTP 404. A review **never** creates an engineering job, dispatches an AI model, changes pricing, spends money, marks demand independently validated or authorizes a release.

### User interface

The responsive dark-mode **Business Intelligence** workspace contains:

- Connected/missing source cards, emphasizing Search Console, GA4, and revenue gaps.
- Source-separated opportunity cards for live tool-route observations, publicly listed existing software, public questions, source-backed original ideas, and restricted authenticated tool executions.
- Original evidence links, evidence qualifiers, missing research, and owner-review status.
- Type/review filters, accessible review dialog and machine-readable Markdown link.
- Safe text nodes and HTTPS-only external links. No user-supplied source text is interpreted as HTML.

## Security and QA

1. Apply additive migration `0021` only to the **private Headquarters staging D1**, after migrations `0014`–`0020`.
2. Run `npm run check` and the dedicated Node SQLite contract suite. Tests prove absent-data honesty, source-class separation, novel nonstandard industries, signed Access read/write permissions, service-account write denial, origin restrictions, repeated review idempotence, optimistic concurrency, immutable audit records, and no automatic approvals.
3. Verify authenticated GitHub staging browser smoke and check mobile/desktop responsiveness, untrusted source rendering and review dialog behavior.
4. Treat automated branch-relative change-risk analysis as an incremental review. The **whole stacked PR lineage** still requires full security review before merging into production `main`.
5. Keep `CF_ACCESS_*` credentials, signed API tokens, D1 bindings and all research Workers inside the existing private infrastructure. Never expose internal provenance APIs publicly.
6. Do not perform live owner-authenticated mutations through a CI read-only token. Founder-controlled review and any external Google connection remain explicit owner actions.

## Current limitations and next work

- GSC and GA4 are **not ingested**. No new Google or third-party provider integration is authorized for the production Headquarters.
- No verified AdSense, subscriptions, transaction or profit data is available to Headquarters yet.
- Existing public-source collectors require further independently verified international and nondeveloper coverage.
- First-party Cloudflare Analytics has produced read-only real-zone observations, but the owner-controlled staging capture ledger is separate and must not be forged by an automated actor.
- The browser activity report is spoofable and can contain earlier staging QA events. Do not claim customer conversions.
- Instrumented private agent service tools are not public MCP products and do not prove paid autonomous-agent traffic.
- Review actions are decisions to **investigate**, not approval to build.

The next milestone is to strengthen first-party evidence verification, reconcile real production tool inventory, verify actual operations and AI costs, and turn shortlisted opportunities into independently validated experiments. External search or financial integrations remain blocked pending explicit founder approval.
