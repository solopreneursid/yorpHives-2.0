# Founder cockpit and portable Headquarters

Headquarters now opens with a compact founder overview: open missions, reported
problems, research opportunities, recorded lessons, recent monitoring evidence
and a suggested next step. Each shortcut opens a real existing workspace. The
website-check shortcut runs the existing bounded public HTTP checker.

## Evidence contract

`GET /api/admin/cockpit` uses the existing private owner/authorized-read identity
boundary. All database queries are fixed and read-only. Mission counts cover the
whole owner-mission table, excluding staging rehearsals; activity samples contain
at most six rows. Monitoring counts use only the latest result for each enabled
monitor and distinguish failures, stale checks, absent checks and future timestamps.

Optional modules fail independently. Missing records appear as unavailable, never
as a healthy zero. Partial findings retain their known count without presenting
an incomplete total as complete. Revenue and billed costs stay unconnected until
an actual financial data source exists. Dashboard refresh never starts inference,
changes permissions or publishes code.

The mission desk, founder decisions, original logo, permission controls, emergency
stop and handoff dialogs remain available. Longer explanations are folded away.
The dashboard refreshes after mission changes and once per minute while visible.

## Run on your own infrastructure

See [the self-host instructions](../self-host/README.md). The optional Node 24
runtime uses local SQLite, private password sign-in and the same application
functions. A Node-only resolver supplies the local identity adapter; Cloudflare's
JWT verifier and hosted authorization behavior are unchanged.

The local database is separate from existing cloud records. Schema migrations are
checksum tracked, transactional and persistent. Local observation can run the
existing deterministic YorpMind scanners without inference. Cloud analytics,
remote repair execution and assistant identities are not silently emulated.

When `HQ_MODEL_URL` points at your own private OpenAI-compatible model server,
the local engine supplies the existing mission-service contract. It discovers the
loaded model, atomically claims one inference attempt, validates a structured
brief, saves the result and waits for founder review. It has no code execution,
browsing, publishing or payment tools. Interrupted work becomes an explicit
failure after restart; no inference is automatically repeated. Acknowledging a
brief does not create a verified lesson or a release approval.

## Verification

- SQLite-backed cockpit tests cover complete counts, missing modules, freshness,
  authentication and bounded outputs.
- Real HTTP runtime tests cover sign-in, cookie/session handling, request origin,
  Host checks, private-file denial, mission persistence and database transactions.
- Model-adapter tests cover single attempts, malformed output, restart handling,
  dispatch limits and shutdown during discovery.
- A complete HTTP workflow test connects the real owner session, mission API,
  local model adapter and cockpit. Its model server is a deterministic test
  double; it does not establish that a real model is installed or deployed.
- Credential-free browser CI checks desktop, tablet and mobile layout, navigation,
  dashboard refresh, unavailable data and safe handoffs. Authenticated hosted
  acceptance remains distinct from synthetic browser tests.

The existing protected Pages preview remains useful for reviewing the cloud
deployment. It does not acquire a mission engine merely because the portable
runtime exists. No public website release is part of this change.

## Configuration review scope

Two existing credential-free CI workflows now cover all pull-request bases and
the build/feature branch families at Node 24. Their permissions remain
`contents: read`; no secret, deployment authority or action dependency was added.
The static change-risk heuristic flags every workflow edit for review, even
these read-only changes. That review-required signal is retained; it is not a
failed application test or an authorization for production. The full historical
Headquarters stack still needs its separate cumulative release review.
