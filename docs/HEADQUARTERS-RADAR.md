# YorpHives Headquarters: Opportunity Radar

## What ships

Opportunity Radar is a private first-party intelligence ledger attached to the existing Headquarters. It does not invent market demand, revenue figures, competitive research or usage statistics. It learns only from already-recorded reliability, asset-quality, security and discoverability observations.

The underlying monitor has an existing six-hour Cloudflare cron. Its enhanced ingestion step copies at most 250 recently observed monitor findings and 250 asset findings into a durable, deduplicated D1 signal ledger. Source IDs, timestamps, original URL, severity, category and current resolution state are preserved. A source becoming resolved does not erase the historical signal or its founder decisions.

Categorization is deterministic and documented, not an AI-verified inference. All signals are explicitly labeled first-party observations. The UI offers a read-only source link, a stale-observation badge, filtering, and manual triage. Clicking 'Sync monitoring records' does not call external websites or Workers AI; it ingests data that monitoring already recorded.

Owner decisions are authenticated using Cloudflare Access JWT validation and same-origin JSON guards. Service tokens cannot make changes. Triage transitions require the signal version timestamp. SQLite triggers write immutable audit events for new signals, status changes and mission promotion.

Promoting a still-active signal creates a single 'planned' owner mission with stored evidence and an independent-verification requirement. It cannot silently dispatch AI, publish, change access, release, or spend. A partial SQL failure cannot mark a signal as promoted without creating its mission.

The service exposes GET /api/admin/radar as JSON by default or Markdown when requested via Accept: text/markdown or ?format=markdown. POST supports sync, investigate, dismiss, reopen, and create_mission; all POST actions require a human owner.

## Preview deployment order

1. Apply migrations/0014_headquarters_opportunity_radar.sql to the existing private Admin preview D1 database, after migrations 0010–0013. Never apply it to the public product database.
2. Run npm run check, including SQLite tests of provenance, idempotency, authorization, audit events and mission promotion.
3. Deploy this branch to the isolated Admin Pages preview and verify the Access-protected desktop/mobile Radar and authenticated read-only API.
4. Sync pre-existing observations, review the actual evidence cards, and manually create a planned test mission from a verified active finding if one exists.
5. Update admin-monitor/worker.js with the existing admin-monitor/wrangler.jsonc, preserving the original six-hour cron, D1 binding and all existing health/security monitors. Radar ingestion is non-blocking and logs its own errors.
6. Do not merge into public main or alter production release authorization. Complete focused security review and owner-session mutation validation first.

## Intentional limits

External market research, regional demand intelligence, verified analytics, pricing opportunities, autonomous research planning and independent QA are separate upcoming integrations. None is represented as available by this phase.
Source volume above 500 recent findings requires pagination in a future upgrade; the signal ledger is persistent so older ingested records are retained.
Every action remains evidence-based and reviewable. Agent execution is a separate explicit owner action in Headquarters.
