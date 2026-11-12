# YorpMind Phase 4 — Controlled specialist memory and governed self-evolution

**Status:** Implemented on a draft Headquarters development branch. This is an incremental, permission-limited evolution loop—not autonomous code rewriting or self-approved production deployment.

## Mission integration

The existing `hq-engine/worker.js` keeps the **same owner-dispatched mission Workflow, same Workers AI model, same max output tokens and same dispatch quotas**.

Before the existing single AI inference, the engine performs one read-only, bounded, deterministic lookup through `hq-engine/yorpmind-context.js`. It considers the mission title, at most 60 recent recorded founder-QA memories and 40 approved current-revision reference skills. The returned model payload contains **IDs and historical SHAs/revisions only**, never source lesson prose, code, shell commands or procedure steps.

Each specialist receives an explicit warning: this metadata is historical, not independently current-verified, and cannot grant tool use or authority. `agent_jobs.evidence_json` separately records how many historical reference identifiers were consulted with `verified:false`. This is not new factual evidence from live browsing.

If YorpMind tables are missing, malformed, or temporarily unavailable, historical context degrades to `unavailable` with no references. It does not make a new model call, dispatch a mission or bypass the founder's separate brief review.

## Self-evolving discovery — daily deterministic loop

The existing `hq-intelligence/worker.js` already has a daily scheduled Cloudflare trigger. The YorpMind evolution scan now runs **inside that existing scheduled Worker**, using its existing private D1 binding. It does not add a second Cron schedule, paid service, model provider, or Worker instance.

`hq-intelligence/yorpmind-evolution.js`:

1. Confirms migration 0025 is present; otherwise marks the scan `migration_required` and changes nothing.
2. Claims one run per UTC date using a unique D1 row. Replays are idempotent.
3. Reads at most 100 recorded founder-reported repair experiences and 100 approved reference skills.
4. Uses deterministic title-token overlap across **different source repair IDs** to find candidate recurring themes.
5. Emits **at most three proposals per day**, each backed by 2–5 historical experience IDs and a fixed, non-model rationale.
6. Classifies a proposal as either `new_reference_skill` or `review_reference_skill` (when an approved matching reference skill already exists).
7. Persists an immutable evidence record and a daily scan receipt with observed counts, candidate counts, completion status and failures.
8. **Does not create, revise, review, approve, execute or publish any skill, code, credential, payment or production release.**

The scanner never inserts untrusted lesson text into an AI model prompt. A recurring word pattern is **a hypothesis**, not proof of the same technical root cause. Low-volume or noisy data may produce no proposals or false positives. No self-learning quality gain is claimed until later independent evaluation compares outcomes.

## Founder-only evolution review

The new private `GET /api/admin/yorpmind-evolution` returns up to 30 recent proposals and seven scan receipts, with JSON or Markdown content negotiation. Read access requires the existing Cloudflare Access policy. CI Access service identities remain read-only.

`PATCH /api/admin/yorpmind-evolution` lets an authenticated same-origin founder `acknowledge` or `dismiss` one proposal with a 40–1000-character reason. This writes an auditable decision, **not** a skill change. The existing YorpMind proposal/revision/approval workflow is still required to turn a supported suggestion into a documented reference skill.

The UI under **Headquarters → YorpMind → YorpMind Evolution** displays the last run, count of pending and reviewed suggestions, source experience IDs and history, and explicit zero-extra-model-call and production-lock notices. It never renders HTML from untrusted sources or exposes a publish/execute command.

## Permissions and cost

- **Extra AI inference:** zero from the scheduled scanner; zero additional model calls per mission. Existing owner-dispatched Workers AI brief is unchanged.
- **D1:** bounded reads and at most three new proposal writes per day plus run bookkeeping. Normal Cloudflare usage is still billable beyond allocations.
- **External providers:** none added. No Hermes runtime, separate container, hosted vector database, paid API or subscription.
- **Autonomy:** observation and proposal creation only. The founder decides which suggestions deserve investigation.
- **Production:** no merge, no public website publication, no automatic code repair, no capability self-modification and no self-granted permissions.

## Verification

New `tests/yorpmind-evolution.test.mjs` uses real local SQLite and tests topic classification, distinct repair provenance, duplicate prevention, zero model calls, existing-skill recognition, immutable source evidence, founder read/write authorization, repeated review rejection and absence of automatic skill revisions.

Existing mission Worker tests now also assert that an AI specialist receives **only source IDs and an explicitly unverified status**, never the historical QA lesson text, while `evidence_json` retains the consulted SHA and continues to mark the generated analysis unverified.

Existing intelligence Worker tests include the new module and preserve scheduled research functionality.

The authenticated Admin staging smoke reads the real private evolution endpoint with the existing CI Access service identity, verifies its zero-inference/no-autonomous-approval policy, denies CI PATCH and public GET, and displays a browser-local synthetic proposal without performing a real mutation.

## Private D1 staging evidence — 12 November 2026

Before running any SQL, the connected Cloudflare account confirmed database ID `e8690813-b139-44a2-a1c7-bea2d2777ead` was named `yorphives-2-catalogue-preview`. A D1 Time Travel bookmark was available and the new tables did not yet exist.

Applied additive migration **0025** with the existing Cloudflare SQL API to **private staging only**. Read-back verified `yorpmind_evolution_runs`, `yorpmind_evolution_proposals`, their indexes, and the immutable-evidence trigger. No production database was changed.

The API migration did **not** record a Wrangler migration-ledger entry. Before normal staging/production migration rollouts, safely reconcile the official migration history rather than claiming 0025 has been tracked by Wrangler.

The scheduled intelligence Worker itself is not being published or triggered by this draft PR; **daily self-evolution will not run live until a separately authorized Worker deployment**. Do not describe it as continuously active today.

## Remaining release and expansion gates

1. Finish cumulative independent review of the stacked Headquarters lineage and sensitive Worker changes against `main`.
2. Reconcile the Wrangler migration ledger and verify a real isolated D1 restore and rollback drill.
3. Test the approved staging Worker deployment, Cron execution, D1 proposal evidence and a founder-only review flow without affecting production.
4. Obtain authoritative Cloudflare billing evidence; current Billing Read access is unavailable.
5. Verify actual long-term proposal usefulness and false-positive rate before considering any automation beyond **proposal-only**.
6. Require explicit founder authorization for an exact production commit and a tested rollback plan.

**YorpMind is self-observing and self-proposing in source code, but not self-authorizing or self-rewriting.**
