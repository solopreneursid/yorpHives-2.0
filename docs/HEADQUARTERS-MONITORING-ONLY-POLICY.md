# YorpHives Headquarters — monitoring-only operating policy

**Effective:** 14 November 2026  
**Status:** Canonical, supersedes all Headquarters Preview → Go Live → OTP and autonomous-repair specifications.

## The product and ownership boundary

YorpHives Headquarters is the founder's private, self-hostable intelligence and monitoring system, **not the public YorpHives website** and **not a deployment console**.

| System | Repository | Responsibility |
| --- | --- | --- |
| Headquarters | `solopreneursid/yorpHives-2.0` | Observe, investigate, prioritize, report, remember evidence, suggest opportunities |
| Website | `solopreneursid/YorpHives` | Public pages, products, applications, traffic, ads and commercial operations |

A stateless ChatGPT or coding agent must read `AGENTS.md` and `PROJECT-IDENTITY.json` before making changes and verify the actual Git remote, then operate inside one project at a time. Legacy website previews inside Headquarters are not the production site's source.

## What Headquarters does

1. **Website and product monitoring:** Availability, tools, features, public routes, errors, UX signals, accessibility, SEO and performance. Distinguish a reachable URL from a working feature; avoid assuming an anonymous block means the service is down.
2. **Headquarters and infrastructure monitoring:** Private runtime readiness, dependency changes, operations, backups, monitoring coverage, vulnerabilities and configuration risks. Independent watchdogs must run outside the application they supervise.
3. **Technology intelligence:** Open-source model/framework changes, safety updates, new capabilities, obsolete dependencies and migration opportunities.
4. **Market and business intelligence:** Global needs, underserved problems, industry changes, competitors, emerging products, and source-backed opportunity hypotheses. Do not invent demand or equate mentions with sales.
5. **Revenue and growth intelligence:** Available advertising, product, subscription, affiliate, sponsored-content and operating-cost evidence. Clearly label disconnected account data, missing values and stale snapshots.
6. **Learning and reporting:** Deduplicate findings, preserve source/time/confidence, explain what happened in plain language, store verified outcomes, and keep the founder's Home/Inbox/Discover/Business/YorpMind/Investigations experience simple.

Observations may be written to the **private monitoring database** to support history and alerts. They must never grant authority to edit code, rotate production credentials, deploy, create financial commitments or write to the public website.

## What the founder does outside Headquarters

The founder chooses which problem or opportunity to act on, uses ChatGPT or their preferred development workflow to investigate and prepare an implementation **in the proper project repository**, tests it and decides whether and how to publish using an independent release process. After a change reaches production, Headquarters can observe its outcome and update monitoring history. The founder may request a plain-English summary or copyable issue handoff from Headquarters; no automatic code or deployment action follows.

**No Preview button. No Go Live button. No release OTP issuance. No production deployment or publication button.** These are retired Headquarters features, not deferred requirements. This does not dictate security controls in an independent production-deployment tool.

## Historical code and fail-closed boundaries

- The `go-live`, `go-live-plan`, and `go-live-otp` private HTTP endpoints return authenticated `410 MONITOR_ONLY`. Keep these routes inert even if old OTP flags, Cloudflare credentials or schema migration 0030 exist.
- The `Investigations` UI may read historical `release-evidence` records as **read-only investigation history**. It must never fetch a release plan or make publishing requests.
- Legacy release-policy documentation and unused helper modules are **archival only**. Do not infer a mandate to rebuild or enable the removed controls from their existence.
- Repair submission and automatic code-change dispatch remain prohibited. The emergency **Revoke legacy access** button in Security remains narrowly scoped to retired temporary permissions and does not publish, repair or change business data.
- Staging isolation, authenticated QA, real backup/restore, source identity and no-unapproved-spend guardrails still matter for **deploying Headquarters as software** through the external development workflow, but they are not buttons or approvals inside Headquarters.

## Core evidence contract

A monitored event should carry `observed_at`, `source`, `affected_system`, `observation_kind`, `evidence`, `confidence`, `freshness`, `impact`, `suggested_founder_action` and `verification_status` where available. Missing fields stay missing; do not fabricate source readings, uptime, sales, conversions, dollar amounts or successfully completed AI agent activities.

## Development verification

Run the repository's Node tests and offline desktop/mobile browser QA. Confirm that no active UI control, JavaScript navigation route, production mutation endpoint, OTP issuance or release execution has been reintroduced. Keep all changes in a reviewable development branch; no merge or production deployment without the founder's separate instruction.

**Principle:** Autonomous observation and intelligence. Human-led development and publication.
