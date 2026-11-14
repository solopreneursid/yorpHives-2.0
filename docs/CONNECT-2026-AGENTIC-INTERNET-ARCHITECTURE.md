# Headquarters: Cloudflare Connect 2026 agentic Internet & isolated monitoring architecture

**Owner requirement — permanent until superseded by founder:** Build both YorpHives
public website and private Headquarters to work on the open agentic Internet:
**readable, discoverable, callable, payable + verifiable identity**, while
remaining portable to independent self-hosted runtimes. Cloudflare Connect 2026
is a design reference, NOT a mandate to adopt proprietary Cloudflare compute,
Wallets, analytics, Workers AI or AI agent SDKs.

Primary source references (Cloudflare Connect 2026):
- https://www.cloudflare.com/connect/2026/session/building-an-open-agentic-internet-discoverable-callable-and-payable/
- https://blog.cloudflare.com/the-agentic-internet/
- https://blog.cloudflare.com/aeo/

## Permanent trust and ownership boundaries

**YorpHives Website** `solopreneursid/YorpHives` owns the live products,
stable public metadata, readable pages, browser-local WebMCP, any future remote
MCP/agent API, publisher identity and future payment/receipt systems.

**YorpHives Headquarters** `solopreneursid/yorpHives-2.0` is a separate
private monitoring, intelligence, research, opportunity and revenue analysis
workstation. Its watchdog makes read-only GET calls to a fixed website URL
allowlist, validates bounded schemas, compares catalogue fingerprints, and
surfaces evidence, discrepancies and human recommended actions. It never
deploys, edits the website, creates repair PRs, grants agent admin rights,
issues OTP approvals, handles customer payments or has a Go Live button.

**Founder-controlled development and deployment** live outside HQ, behind
review, independent QA, authenticated preview and explicit owner permission.
An accepted idea never automatically publishes itself. No shared writable
website/HQ database; no production D1 binding reused for preview.

## Cloudflare Connect 2026 requirements

| Open primitive | Website responsibility | HQ observation |
| --- | --- | --- |
| Readable | Human HTML, canonical metadata, dynamically generated `/llms.txt` | Check plain-text content type, canonical domain and freshness; do not label HTML fallback valid. |
| Discoverable | Site-owned `/api/v1/free-tools`, `/free-tools/manifest.json`, `/api/v1/agent-capabilities`, `/.well-known/yorphives.json`, OpenAPI | Compare validated public product slug fingerprints; probe optional agent-capability route, check version and source identity. |
| Callable | Browser-local optional WebMCP for six deterministic text tools only when compatible browser supports it; future remote MCP separately | Treat capability metadata as CLAIM, not function proof; independent browser-output checks before reporting functional confidence. |
| Payable | **Not enabled.** Future HTTP 402 open-protocol adapters must include authenticated identity, real processor, spend caps, idempotency and signed receipts. | Flag premature payment claims as `agentic_payment_unverified`; analyze verified revenue from separate first-party read-only reports. Never process a payment. |
| Identity | Future cryptographic Web Bot Auth / OAuth consent; fake User-Agent strings not proof | Do not trust unverified agent identity, simulated receipts or published credential claims. |

**Future compatibility:** MCP Streamable HTTP and browser WebMCP, OpenAPI,
JSON/HTTP, x402/MPP, Web Bot Auth, OAuth and A2A may be used only as needed
and when their real current specifications are validated. Agent payments
are not required for free tools. Keep payment, identity, runtime, vector
store, model, caching and edge security as swappable adapters, not locked
into Cloudflare APIs. Do not confuse a first-party `yorphives.json` metadata
file with a standardized A2A agent card.

## Verified 14 November 2026 staging facts

Cloudflare Pages project `yorphives-admin-staging` currently uses:
- Original canonical production D1 unchanged; historic production Agent
  Worker service binding remains (one unresolved privileged dependency).
- New isolated preview D1 `yorphives-hq-preview-isolated-20261114`.
- No auto preview/production builds for Headquarters; no privileged preview
  Agent/AI/Research service bindings or retired OTP secrets.
- Preview-only `staging/monitor-only-schema-v1.sql` was applied to the
  empty independent D1. Five tables and three indexes were independently
  read back; no login/repair/deploy/payment data structures are present.
- Five synthetic fixture rows were added (one schema receipt, one target,
  one observation run, one observation, one research signal).
- **Verified independent logical restore rehearsal:** copied only those
  preview-monitoring table definitions, three indexes and synthetic rows
  to a freshly created disposable D1. Five tables, three indexes and all
  five rows matched exactly; 0 foreign-key violations. The disposable
  restore DB was deleted after validation. No canonical D1 query ran.
- Cloudflare's official export job completed, but the signed SQL download
  returned HTTP 403 from the connected execution environment. Thus a full
  **official binary/SQL backup download and provider import** is still NOT
  demonstrated. A staging logical restore is NOT proof that the older
  60-table canonical production DB can be recovered.
- Existing production app still expects legacy tables, so the new isolated
  monitoring schema does not yet establish functional compatibility with
  the old admin UI. Do not deploy an old schema-dependent preview blindly.

## New source-based checks

- `staging/monitor-only-schema-v1.sql`: isolated evidence-only schema,
  deliberately outside automatic `migrations/` sequence.
- `tests/headquarters-isolated-schema.test.mjs`: node:sqlite load, unique
  records, relational integrity, no repair/pay/release tables.
- `self-host/agentic-internet-contract.mjs`: pure source-owned public
  agentic capability validator; 65 KiB max; no requests, credentials,
  payments or model execution.
- `self-host/watchdog.mjs`: new fixed optional
  `https://yorphives.com/api/v1/agent-capabilities` GET. Missing endpoint is
  a discovery gap; invalid payload/unverified payments are warnings.
- `self-host/watchdog-evidence.mjs`: bounded evidence enum only; no
  customer text or full manifest stored, no agent payments granted.

## Still outstanding before launch

1. Prove owner-authenticated and anonymous denied HTTP behavior for private HQ
   and historical Pages origins, not just Cloudflare Access configuration.
2. Safely replace canonical HQ's active `ADMIN_AGENT_SERVICE` before removing
   it; production code deployment requires separate founder approval.
3. Resolve historical Pages Function dependencies of
   `yorphives-hq-mission-engine`; normal deletion failed, so never force-delete
   without mapping those references and recovery.
4. Prove official source backup retention and provider-import restore for
   canonical DB and the actual production schema (no destructive writes).
5. Deploy exact reviewed monitor-only code into a genuinely isolated testing
   environment and verify first-party browser/agent behavior and status UI.
6. Install an externally supervised watchdog process and test alert and restart
   behavior. Passing unit tests does NOT demonstrate an installed service.
7. Independently approve external release of the website and HQ PRs, then
   validate live read-only synchronization, Access and rollback.

**Invariant:** Website → versioned public agent protocols → HQ read-only
evidence → founder decision → separate approved development and deployment.
