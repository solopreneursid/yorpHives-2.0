# YorpHives Headquarters — executable mission briefs

This phase extends the existing founder workspace without replacing the verified repair, monitoring, login or public marketplace systems.

## Architecture and trust

- A private Cloudflare Worker (`yorphives-hq-mission-engine`) owns a dedicated durable Workflow, `MissionWorkflow`.
- Admin Pages Functions authenticate the human owner using verified, allowlisted Cloudflare Access JWTs, reject CI service-token writes and enforce same-origin JSON requests.
- The Pages project accesses the Worker through a **private service binding** named `HQ_ENGINE_SERVICE`. Do not enable Workers.dev or attach public routes to the engine.
- Owner missions are saved `planned`. Clicking **Start AI brief** is a distinct authenticated action. A compare-and-swap update queues the job only when the timestamp and owner match. At most three owner missions may be queued or running.
- The Worker reloads the mission and specialist directly from D1; it never trusts model prompts or client-supplied titles, roles, or status.
- Only enabled and ready specialists with autonomy level `recommend` may run this bounded inference. Engineering and independent QA specialists remain disabled pending real isolated execution and independent review.
- A durable Workflow writes explicit `queued → running → awaiting_owner_approval` states. SQLite triggers record transitions with actor attribution.
- Result JSON contains an actionable AI-generated brief, assumptions, risks, and required independent verification. Evidence explicitly reports `verified:false`, `source_count:0`, because the first phase has no live browsing, analytics, or repo examination.
- There is no production deployment, repository write, destructive tool, financial API, release control, or auto-approval in this engine. The `awaiting_owner_approval` state means **review this planning brief**, not authorization to publish.

## Setup

1. Deploy `hq-engine/worker.js` using `hq-engine/wrangler.jsonc`, with D1, Workers AI, and Workflow bindings intact.
2. Verify the private Worker health endpoint through a service binding, not by attaching a public route.
3. Add a preview-only Pages `HQ_ENGINE_SERVICE` service binding to `yorphives-hq-mission-engine`; keep the existing `ADMIN_AGENT_SERVICE` binding untouched.
4. Apply `migrations/0012_headquarters_execution.sql` to the existing private staging D1 database **only after** the new mission engine is healthy. The migration is additive, rerunnable, and enables seven recommendation specialists.
5. Deploy the Headquarters feature branch to isolated Pages previews. Run `npm run check` and `npm test`.
6. Inspect authenticated desktop/mobile Headquarters, mission creation, explicit start, durable completion, failed model handling, and audit trail before any production promotion.

`GET /api/admin/headquarters` supports JSON and Markdown negotiation and exposes `engine_available` based on its binding. `PATCH /api/admin/headquarters` accepts `cancel` or `dispatch` with a mission ID and version timestamp. Dispatch is limited to the requesting human owner; status cannot be set directly.

The AI provider is Workers AI model `@cf/qwen/qwen3.8-27b`. Calls consume actual inference usage; no cost or research capability is claimed until measured. Production change authority remains with the founder.

## Inference budget

The Qwen 3.8 27B model is configured with low reasoning effort, disabled internal thinking for bounded founder briefs, and a completion-token cap of 1,800. This reduces latency and usage relative to the model's default xhigh reasoning. These settings do not establish a guaranteed price or completion time; inspect actual Workers AI billing and Workflow executions before raising concurrency.

## Closing a founder review

The `review_brief` and `discard_brief` PATCH actions accept the mission UUID and current `updated_at`. They operate only on the requesting owner's `awaiting_owner_approval` AI recommendation briefs. `review_brief` acknowledges a planning artifact and moves it to `completed`; it does **not** verify its claims. `discard_brief` closes it as `cancelled`. A database trigger records acknowledgements. Neither action inserts into `agent_approvals`, grants production permissions, or authorizes spending. Apply migration `0013_headquarters_brief_review.sql` after `0012` on the private preview D1 database.
