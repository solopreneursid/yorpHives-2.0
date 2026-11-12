# YorpHives Headquarters — Open-Ended Market Explorer

## Business principle

The 73 current Free Tools (10 manifest categories) are **inventory, never strategic boundaries**. YorpHives may independently implement, improve or distribute established applications, utilities, sector-specific platforms, APIs, MCP services, downloadable apps and future technologies. New opportunities do not need to match an existing tool, known technology label, or current Cloudflare product. Cloudflare is today's execution fabric, not the company's product taxonomy.

Prefer proven everyday utility categories where real demand evidence supports them, but also investigate overlooked sectors and structural technology changes. All implementation, revenue and growth forecasts remain hypotheses until measured. Existing competitors are evidence that something exists, **not** proof of significant searches, conversion, agent demand, or commercial viability.

## Data model (migration 0017)

`hq_demand_categories`: two origins:
- `reference`: a **non-exhaustive set of starting examples** such as document utilities, calculators, image tools, small-business apps, security software and MCP services. The reference registry is a research aid, not a whitelist.
- `hypothesis`: an **open-ended discovery** anchored to an actual `hq_intelligence_ideas` record. Its label, format and prospective use come from that proposal, not from a hard-coded category list. The `scale` column permits future format names without changing an enumerated constraint.

Every discovered idea must have surviving public-source references in `hq_intelligence_evidence`. Source links are copied to `hq_demand_evidence` for independent inspection. Future sectors do not require an administrator to add a category definition first.

`hq_demand_unclassified_sources` retains public source records that matched neither a reference category nor a source-backed idea. They are not automatically rejected or assumed irrelevant. A source later associated with an opportunity leaves the unclassified queue, but remains in the original source ledger.

`hq_demand_refresh_runs` records indexing actions and makes scheduled research ingestion replay-safe by linking to the unique original research run. `hq_demand_events` audits every founder triage transition. Research can be reindexed from already saved D1 sources without external calls or model charges. Owner triage state is preserved on refresh.

## Working flow

1. Research Worker collects sources only from its allowlisted adapters (currently HN Ask/Show and public GitHub repositories). The source-adapter inventory must expand independently for language and industry diversity.
2. Cloudflare Workers AI proposes up to three structured ideas per run and is limited to one paid inference attempt. These proposals are unverified.
3. Durable Workflow persists the public sources and proposals, then calls the demand indexer. Known reference-category matches are stored, arbitrary source-backed proposals are indexed as discoveries, and unmatched sources stay visible.
4. The protected `/admin/#demand` Market Explorer shows both origins, original source links, unknown-sector signals and manual founder triage. It is not restricted by any current category or product type.
5. The Explorer loads `/free-tools/manifest.json` in the browser and gives **keyword-only existing-tool overlap hints**; these are not verified feature-equivalence claims. A possible overlap should prompt an improvement/reuse assessment before building new functionality.
6. Owner-only `POST /api/admin/demand` actions `refresh`, `investigate`, `shortlist`, `dismiss` and `reopen` require Cloudflare Access JWT and same-origin guards. CI service accounts cannot mutate. Version locks prevent stale triage. No action directly builds code, invokes AI, approves production, or spends money.

## Machine-readable access

`GET /api/admin/demand` returns bounded JSON; `Accept: text/markdown` or `?format=markdown` returns concise structured Markdown. Private authorization remains mandatory for both formats.

The internal research priority is a deterministic source-diversity and recency heuristic and **not** traffic, market confidence, conversion probability or estimated revenue. Neither humans nor agents should treat a catalogue overlap, GitHub star or community comment as proof of market demand.

## Release and staged verification

1. Apply `migrations/0017_headquarters_existing_tool_demand.sql` only to the private Admin staging D1 database after migrations 0015 and 0016.
2. Run `npm run check`. Tests must cover novel source-backed fields absent from the starter taxonomy, unmatched sources, uncited candidate rejection, idempotent scheduled indexing, owner authorization, no duplicate inference, data persistence and no release approvals.
3. Upload `hq-intelligence/worker.js`, `sources.js`, `synthesis.js`, `demand.js` together, preserving the existing private D1, AI and Workflow bindings and daily cron. Workers.dev and preview URLs must stay disabled.
4. Deploy the feature branch as a **private Admin Pages preview** and run authenticated browser tests, including Market Explorer navigation, JSON API and Markdown output.
5. Existing stored source-backed ideas can be indexed into staging without calling AI. Owner can click **Index stored research** to run the full reference and unmatched-source indexing; the next scheduled research scan indexes the current sources automatically.
6. Keep the stacked draft PR open until a focused infrastructure-risk review and human owner-clicked action verification. No direct merge or deployment into the public site.

## Remaining work and constraints

The current research adapters are **not comprehensive** and disproportionately reflect English-speaking developers. Connecting verified search-demand indicators, first-party traffic, multi-language communities, independent user research, agent invocation data, compliant competitor intelligence, and industry-specific sources is still pending. Do not claim that the platform now monitors all world technologies. The architecture accepts new sectors and product types; gathering representative demand evidence remains a separate technical and research challenge.

Better future decisions require linking discovery to catalogue inventory, SEO rank and impressions, real tool launches, retention, acquisition costs, revenue, infrastructure cost and release QA. Instrument these with privacy and user consent, and distinguish proxies from audited measurements.

## Open-world AI synthesis policy

There is **no required number of ideas per research scan**. The structured model can return 0–3 proposals with verified-in-ledger public source IDs. A zero-candidate run is a valid research result, not an instruction to fabricate opportunities. Industry, technology, country, user type, business model and product-size examples in prompts are **illustrative**, never a whitelist. Private operational access and legal/security constraints still apply. The retrieval/source adapters themselves are currently limited, so coverage of all international markets is **not** claimed.
