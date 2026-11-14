# Next monitoring milestone — independent health, public catalogue contracts and Inbox triage

**Status:** Development only, 14 November 2026. This does not install a server supervisor, connect revenue systems, run verified end-to-end workflows for all YorpHives products or authorize production deployment. Headquarters does not provide Preview, Go Live or OTP buttons.

## 1. Outside-in watchdog: what is actually verified

- The separate process `self-host/watchdog.mjs` checks the self-hosted Headquarters `GET /ready` endpoint and a fixed allowlist of public YorpHives HTTP routes.
- A successful `/ready` response includes a functioning SQLite schema and a successful, fresh internal observation cycle. It does **not** prove all private features, the database backup/restore process, live revenue or general business operations.
- The watchdog saves a minimal private `watchdog-status.json` file after polling. The file has restricted permissions (`0600`), is written via atomic rename and contains only fixed target IDs, result enum codes, HTTP status and timestamps; no URLs, credentials or response bodies.
- After a real owner session, `GET /api/admin/watchdog-status` reads the snapshot. Missing, malformed, future-dated or stale snapshots are reported as **unavailable**, never green. The feature is only available to the self-hosted runtime with an installed separately running watchdog; hosted Pages without a local reader is explicitly not connected.
- The Watchtower Home tiles use this extra source only when valid: `EXTERNAL CHECK` for observed Headquarters dependency readiness, `RUNTIME ISSUE` on a failed ready probe. A passing Cloudflare Access check alone remains `RUNTIME UNVERIFIED`.

### Running separately in your own authorized development environment

Install Node 24+ and complete the existing `self-host/README.md` owner setup. For default paths and **two separate terminal sessions** in the Headquarters repository:

Terminal A (Headquarters application):

```sh
node self-host/start.mjs
```

Terminal B (independent monitoring process):

```sh
node self-host/watchdog.mjs
```

The default private file is `self-host/data/watchdog-status.json`. If you use a custom location for the private database with `YORPHIVES_DATA_DIR`, configure the watchdog's `HQ_WATCHDOG_STATUS_FILE` to the **same absolute directory** plus `/watchdog-status.json`. The optional `HQ_WATCHDOG_STATUS_FILE` setting in `self-host/start.mjs` overrides the runtime's reader location too. Run both under separate OS service supervisors when moving to a live server. Neither is installed merely because the source code exists. The watchdog currently logs change events/heartbeats locally and **does not yet deliver remote alerts**.

## 2. Public Free Tools catalogue contract checks

The watchdog also checks the fixed, read-only public HTTPS endpoints:

- `GET https://yorphives.com/api/v1/free-tools`
- `GET https://yorphives.com/free-tools/manifest.json`

Requests have no credentials, never follow redirects, and are bounded to 128 KiB per response. The validator rejects HTML fallback, invalid JSON, empty/unrecognized arrays, malformed/duplicated tool slugs, and oversized responses. Failures are marked as unverified or requiring investigation; a 403/429 is not automatically proof a visitor cannot use the service.

**Scope distinction:** A successful API/manifest contract confirms that a well-formed non-empty discovery list was returned. It does not run PDF compression, upload files, test client-side editing, assert conversion output, inspect payment flows, or prove individual products function. True end-to-end per-product checks need product-specific safe fixtures and test environments, and must not upload user/private data, spend money or create production mutations. These remain a future separate development slice.

## 3. Founder Inbox priority and evidence quality

`GET /api/admin/findings` now adds read-only presentation fields to recorded findings: `priority_rank`, `triage_level`, `evidence_state` (recent/stale/unverified), and `evidence_age_hours`.

- Critical/high severity remain above medium/low, so stale critical issues cannot be hidden by a newer low-severity item.
- Within a severity, recent evidence is shown before stale or unverified evidence.
- An unknown, invalid or future-dated `last_verified` cannot be marked recent. The current observation window is eight hours.
- The Inbox has **Priority first**, **Needs recheck**, and **Products & tools** tabs. These only change what is displayed. They do not accept risks, change issue states, dispatch code fixes or publish.
- The existing founder-only, audited **Mark investigating** and **Accept risk** controls retain their earlier intentional behavior; display filtering does not invoke them.

## Verification and next work

Automated Node/portable auth tests, browser QA with synthetic evidence, CodeQL and source identity checks run on each draft PR. Public website `solopreneursid/YorpHives` is a separate canonical repository and was not modified.

**Still pending:** real authenticated isolated staging QA, external server supervision/remote alert delivery, real product-by-product functional probes, error classification by symptom and a database evidence reconciliation, cost/revenue source integrations. Previous cloud project records warned that preview and canonical D1 bindings shared a physical database; recheck and obtain founder authorization **before** any environment rebind, migration or infrastructure mutation.

**Permanent rule:** Headquarters observes and recommends. Founder independently develops, tests and publishes.
