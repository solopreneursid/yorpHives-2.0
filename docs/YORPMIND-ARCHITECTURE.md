# YorpMind — first-party intelligence engine for YorpHives

**Status:** Phase 1 foundation implemented on a draft branch. NOT a production or public AI release.

**Name:** YorpMind — *The intelligence behind YorpHives.*

YorpMind is a first-party shared intelligence layer for YorpHives Headquarters and future agent-friendly public products. It is **not** a Hermes fork, installation or runtime dependency. The implementation is Cloudflare V8-native JavaScript/TypeScript, private D1, existing Cloudflare Access and GitHub QA provenance.

## Operating policy

- Approved infrastructure: existing Cloudflare, existing ChatGPT/OpenAI-assisted development, and GitHub's free capabilities.
- No paid third-party provider, container, VPS, external managed memory, new database subscription or extra AI API is necessary.
- No inference is performed by YorpMind v1. The existing Headquarters inference quotas remain independent.
- Existing deterministic monitoring, CI, protected repair workflows and owner approval are retained.
- Skills are **plain-language reference procedures**, not code, shell scripts, API tool declarations or automatically executable workflows.
- No public YorpMind access, public user memory, automatic learning, release execution or privilege escalation is enabled in v1.

## Architecture

| Layer | V1 implementation | Trust boundary |
|---|---|---|
| Deterministic contracts | `functions/_lib/yorpmind.js` | V8-compatible validation, scoped summaries, JSON/Markdown |
| Private API | `functions/api/admin/yorpmind.ts` | Cloudflare Access, same-origin owner mutations, bounded JSON |
| Durable memory | `yorpmind_experiences` (migration 0024) | Private Headquarters D1 only, provenance keyed by exact QA SHA |
| Skill registry | `yorpmind_skills`, `yorpmind_skill_revisions` | Versioned text steps; source experience required |
| Owner review | `yorpmind_skill_reviews` | Immutable revision review; approval never grants execution |
| Founder interface | `admin/yorpmind.js` and `admin/yorpmind.css` | Responsive dark-mode workspace; evidence always rendered as text |
| QA | `tests/yorpmind-foundation.test.mjs` and authenticated staging smoke | No real model dispatch or test-initiated data writes |

## What v1 does

### 1. Experience memory

The founder can capture a lesson only when the selected repair job has all five valid exact-commit CI receipts plus matching founder-recorded QA that reproduced the old issue, passed the proposed fix and passed regressions.

The stored experience references the repair job ID and attested commit SHA. Records are explicitly labeled `founder_reported_qa`. That does not claim independently reproduced proof or that a GitHub branch is still at the same commit today. One experience per repair job and CI-attested SHA prevents accidental duplicate promotion.

No model may automatically create, update, delete or promote a memory record. Existing QA prose is not automatically copied into YorpMind; the founder enters a deliberate lesson.

### 2. Versioned skills

The founder may propose a named procedure with 2–8 plain-language steps, linking to an existing recorded experience. Proposals begin as drafts.

An explicit owner review can approve a **reference** skill or retire it. A review requires at least 40 characters of reasoning. A D1 trigger and unique versioned review record prevent an outdated or previously reviewed revision from being approved again.

A new revision retains historical steps, resets approval and enters draft status. Historic approvals are never silently transferred to newer content. Skills cannot introduce code execution permissions, model prompts for privilege changes, public API tools or release actions.

### 3. Private read access

`GET /api/admin/yorpmind` returns at most 30 recent experiences and 30 recent skill procedures. Its counters describe that bounded window, not the total historical database. The same authenticated endpoint supports `Accept: text/markdown` for approved machine consumers.

Only the private `/api/admin/` route reads these tables. No public endpoint or MCP tool exposes their content. Cloudflare Access service identities have read-only permissions under the existing shared Admin authorization module.

### 4. Owner mutations

`POST /api/admin/yorpmind` accepts only four discriminated actions:

- `capture_repair_experience`: save a QA-backed founder lesson.
- `propose_skill`: create a draft with a source experience.
- `revise_skill`: create a new version, explicitly resetting approval.
- `review_skill`: approve reference text or reject a draft.

Inputs are bounded to 8 KB, require same-origin JSON and are validated before D1 writes. Each authorized mutation is written in a D1 transactional batch with the existing administrative audit trail. Database conflicts and stale revisions fail closed. No third-party model, webhook or GitHub write is called by this endpoint.

## Roadmap integrated with Headquarters

The next stages are contingent on full release safety and measured business value, not extra subscriptions:

1. **Phase 1 — Private memory and reviewed skill registry:** this implementation.
2. **Phase 2 — Retrieval and provenance evaluation:** first-party indexed D1 queries; compare relevance and error rates against no-memory decisions. Do not infer that history is always applicable.
3. **Phase 3 — Bounded AI skill suggestions:** optional event-driven inference only when it adds value; suggestions remain drafts and cannot bypass review.
4. **Phase 4 — Controlled specialist delegation:** share contracts with existing mission engine, restrict each agent's tools and budgets, and use Workflows for durable retries.
5. **Phase 5 — Public YorpMind Assistant:** design separate visitor-scoped storage, authentication, data retention and abuse controls. Never share Headquarters D1 memory with public clients.
6. **Phase 6 — Agent-callable YorpHives products:** expose approved JSON/Markdown/MCP tools with per-product auth, quotas, capability declarations and pricing policies.
7. **Phase 7 — Learning evaluation:** measure successful user outcomes, safety incidents, net costs and actual revenue; promote only procedures whose independent results improve.

**YorpMind is a component of the existing YorpHives application and Headquarters roadmap, not a disconnected new project.**

## Staging verification (12 November 2026)

Applied migration 0024 exclusively to the existing private `yorphives-2-catalogue-preview` D1 database after confirming the database identity and reading a Time Travel bookmark. Verified the four private YorpMind tables and stale-review validation trigger were present after application. No public or production D1 database was modified.

Migration 0024 was applied with the Cloudflare SQL API rather than Wrangler's migration ledger. The canonical migration file is committed, and the SQL is idempotent. **Reconcile the official Wrangler migration ledger before any production rollout**; never falsely claim the ledger has already recorded the migration.

## Quality and production gates

The repository contract suite tests private reads, CI service read-only status, correct QA provenance, duplicate prevention, skill revisions, immutable reviews, input limits, authenticated Markdown and migration absence. Existing full-chain SQLite migration/restore tests now include 0024.

The authenticated Admin staging smoke uses a read-only service token for real API checks and browser-local synthetic GET data to test the UI, including inert rendering of markup-like lesson text. It does not submit real founder memory/skill changes.

Before production, we still need the cumulative Headquarters security review, live D1 recovery rehearsal, real repair-to-verified-preview execution, exact owner acceptance, rollback plan, and Cloudflare billing reconciliation. YorpMind has not been published as a paid product or activated for public visitors.

## Cost statement

Phase 1 adds no AI inference or new paid service. D1 writes, reads, storage and Pages requests still consume Cloudflare usage allocations; actual incremental billing is not verified because the Cloudflare connection currently lacks Billing Read permission. No absolute-zero-cost claim is made.
