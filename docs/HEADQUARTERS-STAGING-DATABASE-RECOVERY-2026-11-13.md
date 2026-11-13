# Headquarters launch gate — staging database completion

**Recorded:** 13 November 2026 (UTC)  
**Scope:** PRIVATE `yorphives-2-catalogue-preview` D1 database only  
**Database UUID:** `e8690813-b139-44a2-a1c7-bea2d2777ead`  
**Source:** `solopreneursid/yorpHives-2.0`, `design/headquarters-prism-brand-theme` (PR #40)  
**Production state:** No production website, release executor, public Worker or
user permissions were changed.

## Outcome

The private staging database contained migrations 0001–0026 as real schema
objects, but had **no Wrangler `d1_migrations` ledger**, and did not yet
contain the four tables supplied by migrations 0027 and 0028.

The complete step has now been executed and checked:

1. **Full private logical recovery backup taken before any schema changes.**
   54 application tables / 529 records. Stored in R2 with verified SHA-256.
2. **Actual restore drill:** an isolated temporary Cloudflare D1 database was
   created, 54 table definitions and all 529 rows restored, indexes and
   triggers recreated. All 54 datasets matched the original records exactly,
   with 0 foreign-key violations and identical schema objects.
3. Migrations `0027_yorpmind_team_management.sql` and
   `0028_founder_temporary_grants.sql` were applied **first to the restored
   test database**, then to the real preview D1, using only the audited
   additive DDL and seed SQL. Both runs passed.
4. **Staging now has six YorpMind manager roles**, two private manager tables,
   and two temporary-permission tables. No assistant permissions were granted.
5. **Historical migration reconciliation:** compared ALL 28 checked-in
   migration files to 143 expected schema objects (58 application tables,
   62 explicit indexes and 23 triggers). The real staging schema had exactly
   143 matching objects, no missing/unexpected names, and the required
   ALTER-added column was present.
6. Recreated the standard Wrangler `d1_migrations` table after this audit:
   all 28 migration filenames are now listed in exact order, IDs 1–28.
   Added an internal audit event recording this reconciliation.
7. **Post-update private backup** saved and verified. A disposable restore-test
   database was deleted after its checks completed.

### Verified private recovery objects

Bucket: `yorphives-processing-temp`. Public managed and custom domains were
disabled when checked. Its lifecycle rules expire only the `inputs/` and
`outputs/` prefixes; the `backups/headquarters-staging/` path is not covered
by those short-lived expiration rules.

| Recovery object | What it contains | SHA-256 |
|---|---|---|
| `backups/headquarters-staging/2026-11-13-before-team-and-permission-migrations.json` | Original 54-table / 529-row private snapshot | `ff6bfcd0920ddc720bed64c89caf1db16ecc384eb77d0104320cec69987c1b3e` |
| `backups/headquarters-staging/2026-11-13-immediate-pre-0027-0028.json` | Fresh exact pre-migration snapshot, 54 tables / 529 rows | `597e621a61f9f8b2b8204891b8f07c4881d902fb2aaabe75888a0d2a97ba7ad4` |
| `backups/headquarters-staging/2026-11-13-after-0028-with-ledger.json` | After schema and ledger completion, 59 application/ledger tables / 564 rows | `9b8231b43f579f5997d5d7b0807394d7504733a31a5b166e9a9993023bdd23f8` |

The backup files are private, **logical JSON snapshots**, not raw SQL dumps or
a binary SQLite file. Do **not** pass them directly to Wrangler D1 SQL import.

Cloudflare's native D1 export was also generated, but its temporary signed
download was inaccessible in this execution environment. Native exports
therefore are **not** counted as durable recovery artifacts. The verified
R2 JSON backups and D1 Time Travel recovery points are the recovery evidence.

### Exact migration source

- `0027_yorpmind_team_management.sql` Git blob
  `a03d6a22152d3f01a166ca13be0b495b501ccd5f`
- `0028_founder_temporary_grants.sql` Git blob
  `21fdfa5d8b648f711475cae14014c011a0049ed2`

Both migrations had 7 executable SQL statements accepted by D1 in the restored
test database and private staging. The leading `PRAGMA foreign_keys=ON;` was
omitted when invoking the Cloudflare SQL API because D1 already enforces
foreign-key integrity and does not permit all PRAGMA changes.

### Restoring safely from the private logical snapshot

**Never restore directly into the live or current staging D1 as a first step.**

1. Create a fresh, unbound, private D1 database for recovery, with no public
   route, service binding or cron.
2. Retrieve the JSON snapshot privately from R2. Confirm its SHA-256 against
   the receipt above. Verify its `format`, source database ID and `schema`.
3. Create all schema objects of type `table` except SQLite/Cloudflare
   internal objects. Do not create indexes/triggers yet.
4. Insert records in foreign-key dependency order. Recreate the exact column
   lists with parameterized statements. Keep each query below the D1 SQL
   variable limit; one row per statement is safe. The original restore test
   used batches of 22 one-row inserts.
5. Recreate manually declared `index` and `trigger` schema objects.
6. Check source/restored row content for every table, compare schema SQL
   strings, run `PRAGMA foreign_key_check`, and confirm required unique
   indexes and triggers. For the original restore, 54/54 datasets and
   all 529/529 records matched, with no FK violations.
7. Only after independent review, decide whether to attach a separate
   recovered copy or use Cloudflare's D1 Time Travel restore to a known
   bookmark. Do not automatically replace any live database.

The previous pre-migration Time Travel bookmark was recorded as
`00000128-00000000-00005122-66b069d10fbcffda0deb03d0a7bf3e95`.
Time Travel retention is limited; the private R2 snapshots are the durable
recovery copy. **No destructive rollback was required or exercised against
the real staging database.**

### Important migration-ledger caveat

These migrations were first installed before Wrangler tracking was in use.
The initial applications' original dates are not reliably known.

The `d1_migrations.applied_at` values created during the reconciliation
represent the **reconciliation date**, not necessarily the original date
the first 26 scripts were executed. The internal audit event records this
difference. The reason for backfilling was to stop future Wrangler operations
from incorrectly replaying historical migrations.

The next migration **must** use a new consecutive filename (`0029_...`).
New changes should be applied through a reviewed, source-controlled migration
path; never silently alter the production D1.

## Ongoing automated verification

`scripts/headquarters-schema-audit.mjs` reads numbered SQL files and
deterministically checks table/index/trigger definitions, ALTER-added columns,
and the ordered Wrangler ledger. It is read-only by default and **does not
connect to Cloudflare**. Its ledger-reconciliation method only returns a
SQL plan; it never executes the plan without a separate caller.

`tests/headquarters-schema-audit.test.mjs` exercises both the complete
reconciled state and drift / missing-ledger failures in a disposable local
SQLite database. The previous 28-migration backup-and-restore regression
test remains intact.

## Still blocking production

- Authenticate and browser-test the founder's real **My Home → work with
  ChatGPT / YorpMind → review** journey against the exact preview.
- Prove a real issue-specific repair and automatic YorpMind memory capture.
- Configure a separate actual Cloudflare Access MFA application, distinct
  verified assistant identities, and time-bound permission enforcement.
  None were set up by this database migration; current assistant grants: **0**.
- Complete cumulative stacked PR review, production D1 recovery assessment,
  runtime cost receipts, independent production deployment/rollback QA and
  founder approval for the exact change.

**Status:** Database migration blocker resolved in private staging, production
authorization unchanged.
