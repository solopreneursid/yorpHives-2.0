# Headquarters Phase 9 — Durable Staging Mission Rehearsals

## Verified scope — 13 November 2026 (UTC)

Two independent, bounded, synthetic recommendation-only missions completed on Cloudflare Workflows and persisted valid unverified decision briefs to the **preview D1 database**. Both jobs have origin_type=staging_rehearsal and created_by=headquarters-staging-rehearsal. Neither was created by a founder's authenticated browser session; neither is an owner approval or a production release.

No source in this document is evidence that any QR Code Generator implementation, UI or browser test was actually performed. AI responses are suggestions for a later independent reviewer.

### Isolated Worker rehearsal

- Worker: yorphives-hq-mission-rehearsal
- Worker version: d55af90f-373f-4b34-9883-9e854384d9eb
- Worker deployment: 56597cfc-6c01-4c0d-ac18-865d751829ba
- Workflow: yorphives-hq-missions-rehearsal (concurrency limit 1)
- Workflow version: 9709a7e9-2303-48af-a48f-b63dd496f6a1
- Workflow instance: mission-864d967d-1ea8-473b-87f4-7d82a5295a97
- D1 job: 864d967d-1ea8-473b-87f4-7d82a5295a97
- Cloudflare Workflow status: complete
- D1 mission status: awaiting_owner_approval (technical state only; not a real founder approval)
- Five of five D1 evidence checks recorded: queued event, running event, model-attempt claim, structured unverified brief, review-state event.
- Model-reported usage: input 402, output 435, total 837 tokens.
- Worker HTTP subdomain disabled; imported Workflow class is the only executable entrypoint. The exported HTTP fetch always returns 404.
- No automated cron, additional provider, public domain binding or production D1 access.

### Main staging Headquarters Worker integration

- Worker: yorphives-hq-mission-engine
- Previous Worker version (rollback): 63d7f149-4927-442c-a2a4-3c36d260a91f
- New staged Worker version: e0d7cb11-fd93-455e-be09-924431284c98
- New staging deployment: 33617544-0af7-405f-bb86-859947aab7e7
- Workflow: yorphives-hq-missions
- Re-registered Workflow version: 3da36d12-9d00-45f0-93b7-610414aad654
- Workflow instance: mission-5cb199a2-f0ac-46bf-888c-4e149bba78e6
- D1 job: 5cb199a2-f0ac-46bf-888c-4e149bba78e6
- Cloudflare Workflow status: complete
- D1 mission status: awaiting_owner_approval (synthetic staging state, not a founder authorization)
- Workflow steps: claim-queued-mission, retrieve-historical-yorpmind-context, generate-reviewable-mission-brief, persist-brief-and-review-gate.
- Real D1 events: mission_created, mission_queued, mission_running, mission_awaiting_owner_approval.
- Model attempt claimed in input_json once before the provider call.
- Saved result: recommendation_brief, verified=false, four suggested actions, three verification steps.
- Saved D1 evidence entries: ai_reasoning_only, yorpmind_historical_references, provider_usage_report.
- Model-reported usage: input 391, output 241, total 632 tokens.
- No production changes: public yorphives.com remains on main. The public Pages project has no HQ_ENGINE_SERVICE binding, and the staged Worker has its workers.dev subdomain disabled.
- One daily AI dispatch is counted for each staging test, correctly reflecting actual model use. Both tests together reported 1,469 tokens; this is **not** a verified invoice or a dollar amount.

### Founder UI safety

Synthetic jobs are tagged at source (origin_type=staging_rehearsal) and are displayed in the new Headquarters **Staging rehearsals** mission filter. Their cards show read-only evidence and token counts. They cannot invoke the owner-dispatched mission review, discard, skills or memory actions.

The private founder Action Center can suggest inspecting the staging result. It does not count staging jobs as founder dispatch failures, pending owner reviews or successful owner missions. YorpMind manager planning likewise excludes staging_rehearsal rows. Real provider use still counts toward the UTC-day mission dispatch budget.

## Rollback and release restrictions

The previous staging version remains available. A rollback of the staging Worker requires a reviewed Cloudflare Worker deployment with:

- strategy=percentage
- versions=[{ version_id: 63d7f149-4927-442c-a2a4-3c36d260a91f, percentage: 100 }]

The existing yorphives-hq-missions Workflow registration must also be checked after rollback; its definition must point to the intended deployed MissionWorkflow class. No rollback was necessary during these successful rehearsals. This note documents the recovery option but does not constitute a production rollback drill.

**Never** deploy these draft branches to the public site without cumulative CI/security review, exact preview-to-Git-SHA verification, D1 recovery testing, independent QA and scoped founder MFA approval. No OTP was requested or used.

## Remaining validation

- Complete GitHub Actions CI and Node/SQLite regression suite; pure JavaScript policy tests alone do not establish whole-platform readiness.
- Test the private Pages admin-to-HQ_ENGINE_SERVICE service-binding dispatch route with an actual authenticated owner session. The synthetic rehearsal jobs were inserted through the account's Cloudflare staging API and Workflow REST API, intentionally **not** through the owner-authenticated UI.
- Verify the real desktop/mobile admin experience and private Access policy, including the read-only staging filter and in-card proof inspector.
- Reconcile D1 migration ledger 0024–0026; restore-test staging; apply migration 0027 only after a verified backup and explicit migration authorization.
- Independent QA against a real product/browser preview; model recommendations do not verify themselves.
- Confirm Cloudflare billing, staging Worker rollback, and exact release-to-commit attestation.
- Founder preview inspection and independent time-limited MFA before any **separate** scoped production executor is enabled.

**Overall:** Durable AI execution and structured D1 persistence are **verified in staging**, not released to public production. The synthetic test bypassed the normal founder HTTP dispatch path by design and is explicitly identified as synthetic.
