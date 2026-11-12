# YorpMind — Phase 2: Private, evidence-aware retrieval

## Scope

This is an incremental extension to YorpMind Phase 1 on the existing Headquarters development stack. It does **not** install Hermes or create an outside SaaS dependency.

**Implemented:** private, read-only `GET /api/admin/yorpmind-search?q=<query>&limit=5`, deterministic lexical relevance in `functions/_lib/yorpmind-retrieval.js`, a founder search panel in Headquarters → YorpMind, and dedicated regression and browser smoke tests.

**Not implemented:** model-powered RAG, embeddings, agent-autonomous use of retrieved procedures, public memory sharing, execution tools, public subscriptions or production publishing.

## Retrieval contract

- Access: the exact same Cloudflare Access allowlist as the private Headquarters Admin. Existing read-only CI service identity is permitted to read only; anonymous requests are denied.
- Input: 3–160-character search, 1–6 distinct meaningful terms, Unicode normalization and deterministic stopword filtering. A result limit of 1–8 (default 5) is enforced.
- Search domain: at most the most recent **120 recorded Headquarters experiences** and **120 approved current-revision reference skills**. Draft, retired, archived and non-Headquarters content is excluded.
- Ranking: exact lexical token matches in title (weight 6), purpose (weight 3) and lesson or steps (weight 1), plus a repeatable matched-term coverage bonus. Tie breaks are deterministic and stable.
- Retrieval output: the source record and historical QA SHA, source type and evidence level, ranked matched terms, and immutable-looking safety attributes `safe_to_execute:false` and `live_verified:false`.
- Response: authenticated JSON or `Accept: text/markdown`; `Cache-Control:no-store`, `Vary:Accept`, no external API requests.
- Inference: **zero model calls per search**.
- Mutation: **none**. The route exports only `onRequestGet`, creates no memories, and does not alter skill approval state or make release decisions.

## What provenance means

An experience is based on a repair with CI attestation and founder-recorded QA, not an automatically verified fix. Its SHA is a **historical** provenance marker. Searching it does not contact GitHub to check if the PR remains at that SHA.

An approved skill is plain-language **reference text** from an existing experience. It is not an agent tool, shell script, executable policy, permission grant, or authorization to modify anything.

All returned lesson text is untrusted content. Browser components render it only with `textContent`; machine-readable output explicitly warns consumers not to obey it as instructions.

## Cost / scaling limits

The endpoint retrieves two bounded D1 candidate sets and sorts them in the lightweight V8 isolate. The search itself does not need Workers AI, Vectorize, managed search, external embeddings or a new package.

This is deliberately **not an exhaustive history search**. If a relevant record falls outside the 120 most recent eligible records, it may not be found. The API exposes `source_window.exhaustive:false` and the actual examined counts rather than pretending the search has complete recall.

When real evidence volumes justify it, a future, separately reviewed step can implement a first-party term index in D1 and evaluate accuracy/latency versus this bounded baseline. It is premature to buy a vector search service merely for the initial private registry.

## Founder UX

Open **Headquarters → YorpMind** and use **Find what YorpMind remembers**. The result cards show matched terms, the originating case or experience, evidence status, the specific historical repair commit where applicable, and a clear warning that retrieved content is not live verified.

No execute/deploy/publish control is exposed. Search is manually triggered, and an earlier asynchronous search request is aborted when a newer one begins.

## Verification and remaining gates

`tests/yorpmind-retrieval.test.mjs` tests matching and ranking, strict source isolation, draft/retired suppression, query and result limits, access failures, migration absence, inert Markdown and zero inference.

Authenticated Admin staging smoke verifies the real private read-only endpoint, rejects anonymous access and displays a synthetic browser-local result containing HTML-shaped untrusted text without rendering an image. No real knowledge mutation is made by CI.

Inherited Headquarters blockers remain in force: cumulative stacked-PR security review, exact owner signoff, full real D1 recovery drill, operational AI repair-to-preview test, live Cloudflare billing evidence and controlled release/rollback testing.

The migration from Phase 1 remains **0024**. Retrieval introduces no new D1 tables or migrations. The staging D1 0024 schema was already applied and verified, but Wrangler migration ledger reconciliation is still required before production.
