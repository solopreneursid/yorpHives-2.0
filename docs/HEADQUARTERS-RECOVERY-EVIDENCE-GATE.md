# Headquarters recovery: current blockers and required proof

**Read-only Cloudflare audit, 13 November 2026.** The staging D1 migration ledger currently has **29** records. The last migration is `0029_founder_email_otp.sql`, applied `2026-11-13 07:56:57 UTC`. The latest retained R2 backup under `backups/headquarters-staging/` is the earlier `2026-11-13-after-0028-with-ledger.json`, uploaded `2026-11-13T04:27:48.282Z`. This backup predates migration 0029 and cannot be used as current-schema recovery proof. Migration **0030** exists in source but is not installed in staging.

A new source-controlled `headquarters-recovery-readiness.mjs` evaluator fails closed unless the full migration ledger matches the source, a later backup for the newest migration exists, and an independently verified restore receipt records identical schema and rows, zero foreign-key violations, backup SHA-256, ETag, and disposal of the temporary test database.

This evaluator is evidence validation, **not** a fresh backup, proof of successful cloud restore, or live rollback. A valid receipt must come from a real disposable Cloudflare D1 restore, not data created by a test fixture. No new D1 instance, R2 object, migration, provider billing activity, or production change was created as part of this check.

Go Live remains disabled until the actual backup/restore rehearsal and the separate Pages production rollback/post-deployment recovery procedure have been completed and independently verified.
