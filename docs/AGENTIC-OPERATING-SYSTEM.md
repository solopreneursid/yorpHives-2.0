# YorpHives Agentic Operating System

## Mission

YorpHives is operated by a solo founder supported by a permanent, evidence-driven team of AI specialists. The system exists to increase sustainable business value: useful products, trusted services, international reach, durable user adoption and profitable revenue. Agent activity is not itself a success metric.

The owner is the founder and final decision-maker. Agents research, coordinate, build, test, review and recommend within explicit permissions. They never receive the owner's password, OTP, recovery codes or unrestricted administrative credentials.

## Operating model

The continuous business cycle is:

1. **Observe** — monitor platform health, product usage, user feedback, search visibility, costs, dependencies and public technology/market signals.
2. **Discover** — identify defects, friction, unmet needs, emerging opportunities and avoidable operating costs.
3. **Validate** — collect dated evidence, source links, confidence, alternatives, regional constraints, expected cost and plausible business value.
4. **Plan** — create a scoped work item with an owner, priority, risk, acceptance criteria and rollback strategy.
5. **Delegate** — the orchestrator assigns independent specialist work and records dependencies.
6. **Build** — engineering agents work on isolated Git branches and produce draft pull requests. They do not modify the live site.
7. **Verify** — independent QA, security, accessibility, performance, API and browser checks evaluate the exact candidate commit.
8. **Preview** — deploy the candidate to an isolated Pages preview and provide a usable before/after review with screenshots and a change summary.
9. **Approve** — the owner explicitly authorizes a specific immutable change digest after fresh Admin authentication and a verified OTP/MFA step-up.
10. **Release and measure** — publish only the approved digest, verify production health, preserve the prior stable deployment and measure business outcomes.
11. **Learn** — compare expected and actual outcomes; update priorities, playbooks and future recommendations.

## Specialist departments

| Department | Permanent responsibility |
| --- | --- |
| Orchestration & Owner Support | Prioritization, delegation, dependency management, approval queue and plain-language reporting. |
| Engineering & Operations | Platform engineering, application development, bug fixes, performance and maintainability. |
| Security & Reliability | Passive security monitoring, incident investigation, availability, data protection and release integrity. |
| Research & Innovation | Technology scouting, model/framework evaluation, compatibility, migration and total-cost analysis. |
| Global Market Intelligence | Regional demand, competitor research, language/accessibility needs, pricing context and market validation. |
| Product Development | User-problem validation, product specifications, catalogue integrity, roadmaps and product lifecycle. |
| Growth & Marketing | Search visibility, content strategy, acquisition, onboarding, conversion and retention. |
| Revenue & Business | Monetization, pricing, subscriptions, partnerships, margins and revenue performance. |
| Quality Assurance | Independent functional testing, browser journeys, accessibility, compatibility, regression and release evidence. |

The registry is model/provider neutral. An agent's identity, responsibilities, permissions, work history and output contracts must not depend on a specific AI vendor. Models are replaceable adapters selected for task quality, latency, privacy, availability and cost.

## Permission model

| Level | Allowed work | Restrictions |
| --- | --- | --- |
| Observe | Read approved telemetry, public information, repository content and monitoring results. | No mutations. |
| Recommend | Produce analysis, plans, reports, issue triage and proposals. | No external side effects. |
| Sandbox execute | Edit isolated branches, create draft PRs, run tests and deploy isolated previews. | No merge, production deployment, production data mutation, secret access or security-policy changes. |
| Owner approval | Publish a reviewed release, rollback production, change sensitive permissions or make a financial commitment. | Requires a fresh owner session, step-up OTP/MFA verification, an explicit action summary and final confirmation. |

Permissions are enforced by server-side capability checks, not by agent prompts or UI visibility. Default deny. Every mutating operation must have a bounded scope, idempotency strategy, audit record and cost limit.

## Release and OTP approval contract

A release candidate is immutable and identified by its repository, branch, commit SHA, preview deployment ID, test evidence and a canonical change digest.

Before a publish action is offered, the release gate must verify:
- The preview belongs to the exact candidate commit.
- All required CI jobs completed successfully; skipped, neutral, cancelled, timed-out or missing checks fail closed.
- Independent code review and QA are complete.
- Security, accessibility, performance and relevant functional checks meet the release policy.
- The change digest shown to the owner is the digest being approved.
- The production target and rollback candidate are known.
- Any database migration is backward-compatible or has a tested recovery plan.

The owner approval service must require a fresh Cloudflare Access authentication flow protected by an OTP/MFA policy. A short-lived, server-verified step-up assertion is bound to the owner, action type, target commit/deployment, change digest and expiry. The server consumes approval once. A browser-supplied boolean, timestamp, email, OTP value or client-generated token is never proof of approval.

OTP values, passwords, recovery codes and authentication secrets are never stored in D1, GitHub, Worker logs, job payloads or agent context. The agent receives only the result of a verified authorization decision and the narrowly scoped operation it is permitted to execute.

Publishing and rollback remain separate approvals. A rollback is also a production mutation and must identify the exact previous successful deployment. Pages rollback does not reverse D1 data, external APIs, payments, emails or other side effects; those require separate recovery procedures.

## Work records and evidence

The shared D1 control plane records:
- Departments and the specialist agent registry.
- Jobs, parent/child delegation, status, priority, risk and owner-approval requirement.
- Append-only job events with actor identity and timestamps.
- Artifact references for reports, diffs, test results, review results, screenshots, recordings, previews and release receipts.
- Approval records bound to an immutable change digest and verified authentication context.
- Estimated and actual execution cost in integer micro-USD units.

Work status follows a controlled lifecycle: observed → triaged → planned → queued → running → awaiting verification → awaiting owner approval → completed. Failed, cancelled and rolled-back are explicit terminal outcomes. State transitions are validated server-side and every transition is auditable.

The existing specialized Admin repair-job history remains intact during migration. The generic job ledger is introduced as a shared control-plane contract; adapters should reconcile or link legacy repair jobs rather than silently duplicate or discard them.

## Business intelligence and revenue discipline

Every material opportunity should include:
- Problem statement and target audience.
- Regions and eligibility constraints, supported by evidence rather than stereotypes.
- Source links, publication dates and confidence.
- Competitor and substitute analysis.
- Demand signals and known uncertainty.
- Proposed product or improvement and differentiation.
- Build and ongoing operating cost.
- Pricing and monetization hypotheses.
- Acquisition channels, risks and a measurable validation experiment.
- A stop/continue threshold.

Business scorecards prioritize revenue, recurring revenue, active and returning users, activation, conversion, retention, product adoption, acquisition cost, gross margin, operating cost and validated opportunities. Page views and agent task counts are supporting signals, not proof of business success.

Use aggregate analytics, public research and consented feedback. Do not infer sensitive personal traits, build sensitive profiles or expose raw customer data to agents without a separately approved purpose and data policy.

## Cloudflare and GitHub implementation boundaries

- **D1:** durable registry, jobs, events, artifacts and approval receipts.
- **Workers / Pages Functions:** authenticated APIs, policy enforcement and human/agent content negotiation.
- **Workflows:** durable multi-step tasks, retries, timeouts and reconciliation.
- **Durable Objects:** only where strongly consistent coordination, deduplication or release locks are required.
- **Workers AI and other model providers:** interchangeable inference adapters behind stable task contracts.
- **GitHub:** isolated branches, immutable commits, draft PRs, CI evidence and review history.
- **Pages previews:** reviewable candidate website builds; production release is a separate gated action.
- **R2:** optional storage for bounded reports and visual evidence where retention warrants it.

Keep domain contracts and business logic portable. Adopt a new framework or provider only when measured benefit exceeds migration, security, reliability and maintenance cost.

## Delivery phases

1. **Foundation:** shared registry, job/event/artifact/approval schema, explicit permissions and accurate status reporting.
2. **Orchestration:** durable coordinator, specialist task contracts, dependency handling, budgets, retry policy and deduplication.
3. **Engineering team:** issue-to-branch-to-PR workflow, independent reviewer, full test suite and isolated visual preview.
4. **Owner release desk:** fresh Admin authentication, OTP/MFA step-up, immutable approval receipt, publish and rollback.
5. **Business intelligence:** validated global research, product opportunity pipeline, revenue scorecards and growth experiments.
6. **Continuous improvement:** schedules, event-driven triggers, feedback loops, cost controls and provider/model replacement.

Each phase must ship through a draft PR and staging preview. Do not describe a department as operational until its workflow has run successfully and produced retained evidence.
