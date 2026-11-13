# Headquarters Phase 8 — Staging mission evidence and provider usage

## Founder experience

Open **Headquarters → Missions → Check mission evidence** under a queued, running, failed, reviewable or acknowledged mission.

The private D1-backed view explains five separate recorded checkpoints:

1. Exactly one dispatch event.
2. Exactly one running event.
3. A durable model-attempt claim in agent_jobs.input_json.
4. A saved structured recommendation brief marked unverified.
5. The appropriate founder-review gate or subsequent planning-brief acknowledgement.

A mission that passes these recorded checks is **ready for the founder to inspect the planning brief**. It is not independently verified code, externally attested model execution, financial authorization or permission to deploy.

- GET /api/admin/mission-proof?job_id=UUID has no mutation path, no AI calls, Cloudflare Access authentication, no-store, bounded queries and JSON/Markdown content negotiation.
- The UI renders all stored text through DOM textContent and never interprets model prose as HTML or runnable instructions.
- Provider-reported token usage is stored with a successful brief if available. It is marked **billing not verified**; absence is unknown rather than zero.
- A failed mission remains failed. The owner must make a separate decision before any new paid mission.
- No new D1 migration, external service, model subscription or cron is required for this feature.

## Staging observations (13 November 2026)

The connected, privately scoped Cloudflare preview database contains an earlier failed owner mission. Read-only SQL inspection showed the following legacy events:

- mission_created
- mission_running
- mission_failed

Its saved failure was the invalid model JSON case. The **queue event** and the new **model-attempt claim** were not present. The Phase 8 evaluator therefore classified this actual record as recorded_failure and **not review-ready**. No staging records were changed during this inspection.

One separate, tightly bounded **direct Workers AI format probe** used the existing @cf/qwen/qwen3.8-27b model with safe synthetic QA instructions. Its response contained a complete JSON brief with the six required fields. The provider reported **123 prompt tokens and 349 completion tokens**, totaling **472 tokens**. This was *not* a Cloudflare Workflows execution, did not write a mission record, is not a verified invoice, and is not a claim that the QR generator was tested.

The existing staging HQ Pages preview has a private service binding to yorphives-hq-mission-engine, which is bound to the staging D1 database. The public yorphives.com Pages production project does not expose that binding. **The deployed staging Worker was not updated** during this phase, and its historical failure does not prove the new Worker implementation failed or succeeded.

## Remaining demonstration and release gate

A real successful **durable** mission requires all of the following, using the exact CI-approved and preview-reviewed staging Worker revision:

1. Complete platform unit/SQLite tests, authenticated Pages smoke, security review and inspect the cumulative stacked PR lineage.
2. Confirm Wrangler migrations 0024–0026 are reconciled; do not apply migration 0027 until staging recovery is separately tested. This Phase 8 feature uses existing mission tables.
3. Update the staging-only mission Worker in a rollback-capable manner, retaining its D1, AI and Workflow bindings; record deployment ID, version and exact Git SHA.
4. Using founder-authorized private Headquarters UI and the existing shared cap of six dispatched AI missions per UTC day, start **one** synthetic review-only mission with acceptance criteria.
5. Confirm the durable Worker shows awaiting_owner_approval, a complete unverified brief, five recorded checks, no duplicate AI attempt, usage metadata if the model returns it, and no hidden second inference.
6. Founder reviews the brief. Independent QA separately validates any factual or implementation claims; this is **not** a production release authorization.
7. Exercise database restore and production rollback drills, actual Cloudflare billing evidence, exact preview-to-commit attestation and independent MFA before any separate production executor is considered.

**Current status:** draft code and direct model-format probe passed; actual durable staging mission completion, full GitHub CI, browser validation and production authorization remain **unverified**. Production deployment remains disabled.
