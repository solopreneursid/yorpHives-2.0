# YorpHives Headquarters — Global Intelligence & Product Discovery

## Purpose

Discover useful tools, apps, plugins, agent-native services, platforms and longer-term business directions from *traceable* public signals. Headquarters keeps observations, AI-generated hypotheses, owner decisions, and independently verified outcomes separate.

This is **a source-linked discovery engine**, not a claim to represent global demand or predict profits. All growth and pricing assertions remain experiments until evidence is collected. Initial communities (Hacker News and GitHub) overrepresent English-speaking technical users; regional intelligence is explicitly `unverified`.

## Architecture

```text
Cloudflare private Cron (daily UTC 03:30) / authenticated owner request
            ↓
Standalone private Worker: yorphives-global-intelligence
            ↓
Durable Workflow (1 active run, 1 model call/run, ≤2 manual runs/day)
            ↓
Public source adapters → bounded, allowlisted HTTPS API calls
  • Hacker News official Ask HN list + item API
  • Hacker News official Show HN list + item API
  • GitHub public repository search (ai-agent, cloudflare-workers)
            ↓
D1: public source records + original URLs and timestamps
            ↓
Workers AI: @cf/meta/llama-3.3-70b-instruct-fp8-fast
  • strict JSON output, 1–3 cited sources/idea
  • reject invented source IDs and incomplete proposals
  • no browsing/tool calls/production privileges in model
            ↓
D1: unvalidated hypotheses, evidence associations, run ledger
            ↓
Cloudflare Access-protected /admin/#intelligence
  • choose shortlist/dismiss/reopen/create planned validation mission
  • optimistic revision checks + immutable decision events
  • no spending, publication, auto-dispatch, or release permissions
```

## Provider restrictions and data handling

- Outbound Worker requests are hard-coded to `hacker-news.firebaseio.com` and `api.github.com`, HTTPS only, no redirects, bounded response sizes, ≤8 second timeouts and bounded object counts. Source content is sanitized and treated as untrusted prompt data.
- 11 Ask HN items, 11 Show HN items, and up to 16 GitHub public repositories per scan. News discussions and repositories are *inspiration*, not survey statistics.
- Model output must cite actual source IDs collected **during that scan**. One model attempt generates up to three hypotheses. A D1 compare-and-swap claim prevents repeat paid inference if a Workflow step replays. Every idea includes problem, audience, MVP, differentiation, distribution, validation experiment, monetization *hypothesis*, risks, and source references.
- A deterministic 0–85 **triage priority** considers recency, source diversity and implementation shape. It is not market confidence, economic feasibility, conversion probability or expected revenue.
- Persistent source and idea records are de-duplicated by public source identity and normalized idea title fingerprint. Owner decisions are not overwritten by later discoveries.
- Failed providers, incomplete AI results and partial runs are recorded. If research fails, the interface does not fabricate replacement ideas. A scan is bounded by a Workflow quota and never runs without a database record.

## API / machine consumption

- `GET /api/admin/intelligence`: authenticated JSON; send `Accept: text/markdown` or `?format=markdown` for clean agent-readable summaries.
- `POST /api/admin/intelligence`: same-origin allowlisted owner only; commands `scan`, `shortlist`, `dismiss`, `reopen`, `create_mission`.
- Triaging requires `expected_revision` as a nonnegative integer; only legitimate state transitions succeed. This prevents stale UI races.
- `create_mission` inserts one **planned**, source-linked mission into existing `agent_jobs`; a D1 trigger updates idea status, protecting against partial promotion. Explicit AI mission execution and founder release authorization remain separate.

## Deployment checklist

1. Run `npm run check` and all signed-JWT, source-contract, SQLite, and Workflow tests in CI.
2. Apply `migrations/0015_headquarters_global_intelligence.sql` **only to the private Admin staging D1 database** after 0014. No modification to the public product DB.
3. Upload `hq-intelligence/worker.js`, `sources.js`, `synthesis.js` as one module Worker per `wrangler.jsonc`, with Workers AI, preview D1 and Workflow binding. The private Worker must have **Workers.dev disabled and preview URLs disabled**.
4. Register Workflow `yorphives-global-research` with class `ResearchWorkflow`. Test one Workflow via Cloudflare before enabling the daily Cron schedule.
5. Add an `INTELLIGENCE_SERVICE` binding only to the **Admin Pages preview** pointing to `yorphives-global-intelligence`, preserving `ADMIN_AGENT_SERVICE` and `HQ_ENGINE_SERVICE`.
6. Deploy the branch to isolated Admin Pages preview. Verify Cloudflare Access, JSON and Markdown output, authenticated mobile navigation, bounded manual scan and readable source links.
7. After a verified live run, enable the 03:30 UTC daily schedule on the private Worker. Cost depends on actual Workers AI and Workflow usage; inspect billing before raising quotas. **No paid external data APIs** are called.
8. Keep the work in draft until focused security review and authenticated human-owner action tests pass. Do not merge into public `main`; production website and live monetization stay unchanged.

## Long-term design

Adding a new research market should mean registering a new **allowlisted source adapter**, not rewriting the UI, database or agent. Future candidates include independent country/language research, customer feedback, release changelogs, opt-in analytics, market sizing, competitive analysis and agent-compatible distribution.

Market research must preserve who said what, where and when; data-collection terms, copyright and attribution constraints; region and language coverage; independent QA; and bias controls. Prioritize experiments over speculative forecasts. YorpHives should remain model/provider replaceable while using Cloudflare as the execution fabric.
