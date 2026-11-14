# Headquarters Watchtower — evidence and UI contract

**Status:** Development milestone (14 November 2026). No production deployment has been performed.

## Purpose
A founder-friendly overview of **what is actually observable**, not a reassuring uptime score. Five independently named areas on Home: Website, Products & Tools, Headquarters, Market Signals, Revenue.

The Home interface uses a **single existing authenticated `GET /api/admin/cockpit` snapshot** and shares the same in-browser event with the read-only Founder Pulse. Watchtower does not send additional network requests, dispatch AI, scan arbitrary URLs, write source code, alter databases, publish, or perform finance operations.

## What counts as evidence

- **Website:** Already recorded, enabled **production** HTTPS checks for `yorphives.com` / `www.yorphives.com` that are **not** identified as specific product/tool routes.
- **Products & Tools:** Already recorded, enabled **production** HTTPS checks on known public tool/product paths, or the free-tools/catalogue APIs. These establish HTTP reachability **only**. A 200 response does *not* prove a PDF conversion, export, payment, form or other functional workflow succeeds.
- **Headquarters:** Already recorded, enabled **preview** access-gate checks on `admin-staging.yorphives.com`. An authenticated redirect or Access denial may confirm a boundary behaves as expected; it does *not* establish that the private API, scheduler, database, backups, or production Headquarters process is healthy. The independent watchdog must eventually supply a **separate** live runtime-readiness data source.
- **Market:** Counts of stored `hq_intelligence_ideas` research hypotheses from existing `sources.opportunities`. Saved/shortlisted ideas are *not* evidence of customer demand, sales, or willingness to pay.
- **Revenue:** Not connected until independently verified earnings and operating-cost sources are integrated. No estimated money or invented zero values.

The coverage scanner is a **bounded read-only SQL query** over `admin_monitors` and the latest `admin_checks` receipt, ordered by monitor ID, limited to `COVERAGE_LIMIT + 1` rows; only the first 200 are summarized. If there are more than 200, `truncated` and the source's partial flag are set: summaries represent an incomplete minimum, not an exhaustive portfolio.

Exactly matching HTTPS production website hostnames or private Headquarters staging hostname are allowed for classification; malformed and unknown routes are ignored. The UI receives only aggregated counts, never the URLs or credentials. The latest check must have a parseable, non-future UTC timestamp within the last eight hours to qualify as recent. Stale, future, invalid, absent and failed receipts are distinguishable. All sources fail closed as unavailable if the query or schema fails.

## Interface rules

- Accessible card buttons navigate only to existing private, read-only Headquarters views. No Preview, Go Live or OTP.
- Explicit badges state `RECENT HTTP`, `CHECK FAILURE`, `FUNCTIONS UNVERIFIED`, `RUNTIME UNVERIFIED`, `RESEARCH ONLY`, `NO VERIFIED DATA` as appropriate.
- Urgent issues appear before routine digest posts. Missing financial data is shown as a limitation, not a revenue decline.
- Desktop cards wrap to a grid; on narrow screens the five cards scroll *within their own strip*. Keyboard focus is visible; reduced motion is respected.
- When cockpit evidence becomes unavailable, the Watchtower values and badges clear rather than showing stale green data.

## Next implementation slices

1. **Functional tool checks:** Add independently repeatable browser/API end-to-end checks per public product with test fixtures, outputs, thresholds, and safe request budgets. This must not alter user data or create paid transactions.
2. **Headquarters runtime evidence:** Connect the separately supervised watchdog's authenticated, bounded readiness reports; do not treat a Cloudflare Access 403 as process uptime.
3. **Alert routing and history:** Persist deduplicated severity, first/last seen, current verification, evidence source and recommended founder action. Make Inbox show the highest-confidence unaddressed incidents.
4. **Read-only business sources:** Bring first-party traffic, revenue, expenses and relevant market evidence into private, timestamped snapshots with explicit missing-data states. Require founder consent and no third-party paid lock-in.
5. **Independent rollout verification:** Node platform tests, CodeQL, offline desktop/mobile visual QA, authenticated isolated staging and recovery checks must pass before the founder chooses to deploy Headquarters through a separate workflow.

For the dynamic website-owned discovery adapter, unpublished optional endpoints, source ownership and compatible v1 catalogue fingerprint validation see `docs/HEADQUARTERS-WEBSITE-SYNC-2026-11-14.md`.

**Headquarters observes and recommends. The founder implements and publishes elsewhere.**
