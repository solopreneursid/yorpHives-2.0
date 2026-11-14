# AGENTS.md — READ FIRST IN EVERY NEW CHAT / AGENT SESSION

> **PROJECT IDENTITY: HEADQUARTERS.** This repository is **NOT** the production YorpHives website.
> Never rely on conversation memory or project name similarities to choose a workspace.
> Confirm the actual Git origin before reading, editing, testing or deploying files.

## Identity matrix (authoritative)

| Project | Sibling checkout | Git origin | What it owns |
| --- | --- | --- | --- |
| **YorpHives Headquarters** | `headquarters/` | `solopreneursid/yorpHives-2.0` | Private monitoring and intelligence for products, infrastructure, revenue, research, security and market opportunities; no publishing controls |
| **YorpHives Website** | `website/` | `solopreneursid/YorpHives` | Production public site, products, free tools, SEO, ads, commercial pages and public deployment |

Each directory is a **different Git repository** with its own history, tests, environment and deployment. Neither is a child application of the other. Read `docs/PROJECT-DIRECTORIES.md`.

## Mandatory pre-edit protocol for ChatGPT / Codex / coding agents

1. Read this `AGENTS.md`, `PROJECT-IDENTITY.json` and `docs/PROJECT-DIRECTORIES.md` — even when no prior chat exists.
2. Run `git rev-parse --show-toplevel`, `git remote get-url origin` and `git branch --show-current` in the chosen checkout. Or run `node scripts/workspace-boundaries.mjs identify`.
3. State in your work log: **project, checkout absolute path, exact Git origin, branch/commit and deployment target**.
4. A request about **Headquarters** only authorizes working in `headquarters/`. A request about the **website** only authorizes working in `website/`. If both are required, produce independent commits, tests and approvals. Never change the other project opportunistically.
5. For HQ-only changes run `node scripts/workspace-boundaries.mjs guard headquarters <file-relative-to-HQ-root>` before writing. This fails closed for website-only, unknown and shared paths. Unknown/shared files require explicit dependency review.
6. For Headquarters, verify code and independent QA on a development branch. **Never merge or deploy without founder instruction.** Headquarters itself is NOT a release-control surface: there are no Preview, Go Live, OTP issuance, fix or production publishing actions. The founder codes and publishes separately, outside Headquarters. Testing an isolated development build is not a user-facing Headquarters publishing feature.

## Headquarters-owned code

`admin/` = **Headquarters user interface** (not public website);
`functions/api/admin/`, `functions/admin/` = private APIs;
`admin-monitor/`, `hq-intelligence/`, `hq-engine/` = monitoring/research;
`self-host/` = self-hosted runtime and database. `admin-agent/` is historical code: its presence **does not authorize automatic repair**. HQ observes both properties and reports issues; the founder makes fixes and controls deployment.

## Misleading old paths inside THIS HQ repository

Historical **website-preview** files still exist here: root `index.html`, `app.js`, `styles.css`, `free-tools/`, `discover/`, `explore/`, `listing/`, `builder/`, `connect/`, `functions/api/v1/`, `openapi.yaml`, etc. **They are not the live website's canonical source.** Do NOT build public products in them or confuse them with Headquarters. Existing HQ tests/preview tooling depend on some of them. Their removal requires a gated migration; see `docs/HEADQUARTERS-LEGACY-WEBSITE-EXTRACTION.md`.

`brand/`, `functions/_lib/`, `functions/_middleware.js`, `migrations/`, root configuration and generic tests/docs are **shared/ambiguous**. Never assume ownership or copy secrets/data between projects.

## Permanent agentic-internet design mandate (Cloudflare Connect 2026)

**Founder requirement:** Both website and Headquarters must support the open
agentic Internet: readable, discoverable, callable, payable, and verifiable
identity, with standard HTTP/JSON/OpenAPI/MCP/WebMCP and optional x402/MPP
rather than provider-locked SaaS. This is **an architecture mandate, not a
claim that payments, signed bots or remote MCP are already live**.
Website owns published tools and all future calls/commerce; HQ ONLY checks
read-only public contracts and independent signals, never executes those
operations or handles payments. Read
`docs/CONNECT-2026-AGENTIC-INTERNET-ARCHITECTURE.md` before modifying
agents, product discovery, revenue, payment, security or website-monitoring
contracts. The new isolated preview D1 has a **monitor-only schema with only
synthetic rows**. Its successful logical restore does NOT imply the older
production D1 is recoverable or that the live admin UI is staging-compatible.
Do not re-enable automatic HQ deployments or grant canonical Agent Worker
permissions as a workaround.

## Latest canonical policy: MONITORING ONLY (14 November 2026)

Headquarters watches the live website, its products, itself, infrastructure/security, trends, markets, users, performance and revenue using observable evidence. It collects findings, keeps monitored history and suggests decisions in the Home/Inbox/Discover/Business/YorpMind/Investigations interface. **It does not implement fixes or change production code.** The founder independently prepares, tests and publishes changes using separate development/release tooling and may return to Headquarters to verify observed results.

**DO NOT add back publishing controls.** The retired `/api/admin/go-live`, `/api/admin/go-live-plan` and `/api/admin/go-live-otp` endpoints must remain inert and authenticated (HTTP 410, `MONITOR_ONLY`); do not issue OTPs or contact a release executor. Historical release/investigation records can remain read-only. Old release/OTP specifications are archival, not active requirements. For Home and frontend monitoring improvements, read `docs/HEADQUARTERS-WATCHTOWER-COVERAGE.md`: recorded HTTP checks establish reachability only, not product functionality or private Headquarters uptime. Revenue is never assumed connected. Separate private credentials, databases, backups and environments permanently. Refer to `docs/HEADQUARTERS-MONITORING-ONLY-POLICY.md`. **Cross-repo contract:** Read `docs/HEADQUARTERS-WEBSITE-SYNC-2026-11-14.md` before any work touching tools or website monitoring. The canonical website is the separate `solopreneursid/YorpHives` repository (currently 21 public tool slugs), NOT the legacy experimental Free Tools tree in Headquarters. GitHub connector permissions now allow writes to both repositories, but the website change is only in draft website PR #7; never confuse a preview build with a published website. HQ may only consume versioned public GET metadata; optional metadata URLs absent from live website are coverage gaps, not confirmed outages. Do not bypass website repo review via direct cloud deployment. **PRODUCTION SAFETY:** Read `docs/HEADQUARTERS-PRODUCTION-HARDENING-2026-11-14.md` before any live operation. The **historical** Pages preview/canonical D1 sharing was corrected on 14 November 2026: the current primary preview now binds a NEW EMPTY distinct D1, old `yorphives-2-preview` lost its D1 binding, and both HQ projects' automatic preview/production deployments were disabled where applicable. **This does not make staging functional:** no schema or independent restore evidence exists for the new database, and OLD preview deployments may still carry historical bindings. The canonical production HQ still binds privileged `ADMIN_AGENT_SERVICE`. Read `docs/HEADQUARTERS-LIVE-TOPOLOGY-2026-11-14.md` and run `scripts/headquarters-cloudflare-topology.mjs` via the read-only provider workflow. Do not deploy, migrate, re-enable auto builds or certify readiness until independent authenticated staging, recovery, historical preview access and legacy execution-service gates pass. Never turn historical OTP/repair modules back on. For independent runtime evidence, product-discovery contract probes and Inbox freshness, read `docs/HEADQUARTERS-FUNCTIONAL-WATCHDOG-INBOX.md`. Do not call catalogue HTTP checks end-to-end functional tests or claim a local watchdog is installed without evidence.

**If this file is being read without chat memory, the correct first action is to identify the repository and project, not to invent or inherit earlier context.**
