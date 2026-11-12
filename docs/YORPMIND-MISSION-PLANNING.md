# YorpMind — Phase 3: Founder-reviewed mission memory

## What is implemented

YorpMind is now available in the existing Headquarters mission planning UX. The integration reuses the private, authenticated, model-free retrieval API from Phase 2. It does **not** introduce a new service, database table, subscription, model invocation, automatic agent task, or public memory route.

In **Headquarters → Create a mission**, the founder can enter a descriptive mission title and acceptance criteria, then choose **Review past evidence**. In each existing mission card, **Review past evidence** provides the same read-only lookup using the saved mission title.

Both views display lexical matches from the private D1 registry, subject to the existing 120-recent-records-per-source window. No match is not evidence that no relevant older information exists.

### Opt-in evidence citations

Only the founder's **new, unsaved mission draft** supports optional citation attachment:

1. Search past evidence manually.
2. Review returned historical memory or approved *reference* skills.
3. Select up to three results.
4. Explicitly confirm **Attach source references**.
5. Review the resulting mission brief before saving it.
6. Start any paid AI brief only through the existing **separate dispatch action** after mission creation.

The citation block contains validated identifiers and historical commit/revision markers. It **never copies a lesson, procedure step, or model instruction** into the mission brief. It explicitly says that source references are historical, not live-verified, and do not authorize code execution or production publishing.

The original acceptance criteria must already be meaningful (at least ten characters). Attachment refuses a duplicate YorpMind citation section and respects the existing 4,000-character limit. The system does not silently rewrite existing mission text.

### Why this is the safe starting point

Persistent memory is untrusted reference material. Promoting arbitrary lesson prose to a model's system prompt, calling procedures automatically, or treating an old QA status as current truth would turn retrieval into an instruction-injection and safety risk.

Phase 3 therefore remains **founder-guided planning**: historical context is available, but the platform does not automatically choose a repair, launch a mission, call a model, write to GitHub, or change release controls.

If an explicitly cited mission is later dispatched through the existing Headquarters AI brief pipeline, the model sees only source identifiers and the warning. It does not receive historical lesson prose from this implementation and has no automatic retrieval tool.

### Source and response trust boundaries

The shared `admin/yorpmind-mission-policy.js` accepts only existing result types with correct UUID and historical SHA or approved skill revision, valid evidence levels, `safe_to_execute:false`, and `live_verified:false`. It rejects alternate provenance shapes, missing expected public safety flags, invalid relevance data, or any response declaring external inference, agent actions, public memory access, or production approval.

The browser UI renders all lesson text with `textContent`, not HTML, and uses secure same-origin read-only fetches. Stale searches can be aborted, and changing a mission title after retrieval invalidates attachment.

### Low cost

- No new D1 schema, vector search, embedding model, Workers AI call, external SaaS or AI API subscription.
- Each manual preview reuses the existing bounded private D1 search (two candidate queries).
- Nothing is fetched while the user is idle, merely types, or views a mission card.
- The extra frontend assets are small vanilla JavaScript/CSS modules with no new npm package.
- Actual Cloudflare billing is not confirmed without Billing Read permissions; bounded requests are not a guarantee of zero provider charges.

### Test evidence

`tests/yorpmind-mission-planning.test.mjs` covers bounded query building, strict source IDs, duplicate and stale references, blocked malicious prose, no execution permissions, explicit consent formatting, and brief length requirements.

The authenticated Admin staging smoke uses browser-local synthetic search responses containing HTML-shaped malicious content. It checks the founder's draft remains unchanged until an explicit selection and confirmation, then contains only source IDs and the historical SHA, without copying untrusted instructions. Browser smoke does not save a mission, call the AI model, or write to D1.

### What remains

Before any production release, finish the cumulative Headquarters security review, real D1 restore drill and Wrangler migration ledger reconciliation, live repair-to-verified-preview rehearsal, live actual billing audit, and explicit founder authorization.

Future work may add an approved, independently evaluated evidence ingestion process and a structured, owner-controlled mission reference ledger. Those are **not** enabled by this phase.
