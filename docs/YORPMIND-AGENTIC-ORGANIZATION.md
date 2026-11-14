# YorpMind — the continuously improving monitoring AI operating system
**Design owner:** YorpHives founder • **Scope:** Headquarters only • **Architecture version:** 2026-11-14

## The founder's original mission

YorpHives Headquarters is **not** merely a dashboard, uptime monitor,
repair console, website builder or release tool. It is a private, evolving
**agentic organization for continuous monitoring and business intelligence**.

YorpMind is its orchestration/learning OS. It manages a growing team of
read-only specialist agents and bounded smart bots with shared, evidence-linked
memory, periodic work schedules and feedback from independently verified
outcomes. The organization must pursue three permanent missions:

1. **Guard and improve the ecosystem:** monitor BOTH the live YorpHives website
   and Headquarters for page/function/API failures, unexpected changes,
   vulnerabilities, dependencies, configuration drift and needed upgrades;
   investigate causes and propose reproducible tests.
2. **Discover products, users, agent traffic and sustainable revenue:** scan
   public user problems, markets, competing tools, emerging protocols,
   developer forums, technological change, security advisories and open
   commercial opportunities. Prioritize products and growth ideas only after
   source quality, expected demand, acquisition distribution and monetization
   are independently tested. Advertising and financial data require verified
   first-party read-only sources. Public interest is not proof of revenue.
3. **Evolve YorpMind itself:** retain historical signals, versioned source
   evidence, proposed decisions, founder reviews, observable outcomes and
   approved learning. Propose new bot specialties, investigation procedures
   and open-weight models, but never apply self-modifying code or
   permission changes inside Headquarters.

## Department design

| Employee | Department | Evidence it analyzes | What it produces |
|---|---|---|---|
| Reliability investigator | Engineering | Website/HQ HTTP & catalogue results, verified incidents | Reproducible bug/risk investigation |
| Security investigator | Security | Read-only HTTP response policy and verified advisories | Bounded security review recommendation |
| Problem discovery researcher | Market | Original public Ask HN / Show HN discussions; technology candidates | Unvalidated tool/app opportunity hypothesis |
| Agentic distribution researcher | Growth | Product/discovery findings and public audience problems | SEO and agent discovery experiment hypothesis |
| Monetization investigator | Revenue | Research leads; future first-party revenue receipts | Monetization test requiring verified demand |
| YorpMind evolution architect | Evolution | Two or more **founder-verified** feedback outcomes | Proposed investigation/agent improvement |

Each department is replaceable: provider-neutral bounded evidence contracts,
a private open-weight model adapter and a limited run/memory SQL schema.

## Existing, implemented building blocks

- Cloudflare staging-only scheduled Worker, with no public Worker URL, no
  production DB, no GitHub/API token, no AI cloud binding and exactly two
  schedules: 5-minute website/HQ checks and daily public research.
- At least three actual five-minute runs observed on 14 November 2026
  (09:05, 09:10, 09:15 UTC); 27 real website observations retained.
- Nine fixed website GET checks, plus an **anonymous** HQ Access-gate
  check and non-invasive HTTP-header advisory. A working access challenge
  is not a private Headquarters functionality test or security scan.
- Public fixed-source RSS and official HN API research adapters. They
  produce **unvalidated leads**, never fabricated traffic or revenue.
- Persistent 30-day observations, deduplicated findings and explicit
  missing/expired collector heartbeat reporting.
- YorpMind stage-only v2 SQL with six configured employee roles,
  evidence-linked model/bot run receipts, founder-review briefs and
  feedback memory. No code/repair/payment/deploy permission tables.
- Deterministic evidence bot coordinator, triggered by scheduled evidence,
  that creates **bounded founder-review proposals without model calls**.
- Private-only optional model adapter for a founder-operated llama.cpp or
  vLLM OpenAI-compatible endpoint on `http://127.0.0.1:PORT/v1`.
  It accepts no public/third-party API endpoint, and no agent tools.
- An authenticated private staging-only `GET /api/admin/yorpmind-os-v3`
  endpoint and a dashboard that distinguishes configured roles,
  completed deterministic bot reviews and **actual completed private-model
  inference**. Never classify bot-only work as AI inference.

## Important gaps — do not represent these as operational yet

- There is **no connected self-hosted open-weight inference server**.
  YorpMind's actual LLM employees are *not* proven running. The
  deterministic bots can prepare recommendations, but cannot reason like
  a continuous autonomous LLM without the model runtime.
- The self-hosted Node/SQLite source operates in a **different data store**
  from the Cloudflare preview's D1. A secure one-way evidence bridge or
  a fully self-hosted HQ deployment is needed before remotely completed
  private-model briefs can appear in the current Cloudflare UI. Never
  expose a private model port directly to the internet.
- No installed externally supervised 24/7 agent compute server
  (systemd/s6 process watchdog + real inference), no operator
  onboarding/recovery plan and no bounded self-model upgrade workflow.
- No validated worldwide demand research, first-party AdSense/commerce
  receipts, actual acquisition channel metrics or revenue connectors.
- No comprehensive web vulnerability scanner, dependency CVE auditor,
  behavioral browser QA, or private HQ code-integrity check in the
  new monitor-only runtime. HEAD checks are advisory, not pentesting.
- No verified out-of-band alerts (SMTP/SMS/push), and no proof that the
  external worker will meet an uptime guarantee.
- Website protocol endpoints in sibling draft PRs #7/#8 are not live
  until the founder authorizes the website release.
- Legacy production Headquarters still has privileged Agent Worker
  dependencies; no production migration is authorized by this plan.
- The separate founder Go Live + real OTP release executor is still
  uninstalled and unverified.

## Non-negotiable independence and production boundary

Evidence collection can **write sanitized observations to an isolated
monitoring store**. That is not equivalent to permission to modify website
source, product configurations, Cloudflare/GitHub access, payment accounts,
agent definitions or production deployment state. Those are external
human-controlled development and release workflows.

Read-only YorpMind organization -> founder recommendations ->
independently tested code changes outside HQ -> final preview reviewed
by founder -> external OTP approval -> separately authorized release.
Cloudflare is an optional edge adapter; self-hosted Node, SQLite/Postgres,
a self-hosted open-weight inference runtime and an independent scheduler
are the strategic long-term portability path.

**Acceptance:** Show the actual evidence, source timestamp, role that
examined it, model vs deterministic bot provenance, founder-reviewed
outcome and independent release audit. If any link in that chain is
missing, report coverage as *unknown*, not as healthy, complete,
profitable, or self-evolving.
