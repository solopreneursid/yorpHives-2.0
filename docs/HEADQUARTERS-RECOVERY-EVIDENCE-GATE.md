# Headquarters recovery: current blockers and required proof

**Read-only Cloudflare audit, 13 November 2026.** The staging D1 migration ledger currently has **29** records. The last migration is `0029_founder_email_otp.sql`, applied `2026-11-13 07:56:57 UTC`. The latest retained R2 backup under `backups/headquarters-staging/` is the earlier `2026-11-13-after-0028-with-ledger.json`, uploaded `2026-11-13T04:27:48.282Z`. This backup predates migration 0029 and cannot be used as current-schema recovery proof. Migration **0030** exists in source but is not installed in staging.

The source-controlled `headquarters-recovery-readiness.mjs` evaluator fails closed unless the full migration ledger matches the source, a later backup for the newest migration exists, and an independently verified restore receipt records identical schema and rows, zero foreign-key violations, backup SHA-256, ETag, and disposal of the temporary test database. The backup evidence must independently include the **full SHA-256 of the backup bytes** (`objects[].sha256`), and that digest must match `restoreReceipts[].backup_sha256`. R2 object ETags alone are not SHA-256 proof. A checksum supplied only by the restore receipt is not sufficient. The evidence collector must compute or obtain the backup digest independently and verify it against the actual R2 object; this evaluator does not download or hash that object.

This evaluator is evidence validation, **not** a fresh backup, proof of successful cloud restore, or live rollback. A valid receipt must come from a real disposable Cloudflare D1 restore, not data created by a test fixture. No new D1 instance, R2 object, migration, provider billing activity, or production change was created as part of this check.

Go Live remains disabled until the actual backup/restore rehearsal and the separate Pages production rollback/post-deployment recovery procedure have been completed and independently verified.

## Verify a downloaded R2 backup without changing cloud resources

After obtaining the R2 object and its metadata using an authorized read-only Cloudflare connection, save the backup bytes and metadata locally. The metadata JSON must contain the actual R2 `key`, `etag`, `last_modified` (UTC), and `size` (byte count). Then run:

```sh
node scripts/headquarters-backup-digest.mjs /path/to/downloaded-backup.json /path/to/trusted-r2-metadata.json
```

The utility opens a regular file without following a symlink, checks the on-disk byte count against the R2 size, hashes the bytes with SHA-256, checks file identity for changes while reading, and prints the backup evidence object expected by `evaluateHeadquartersRecovery`. It makes no API calls and never writes to D1 or R2. **This does not authenticate the origin of the supplied metadata or demonstrate successful restoration.** The evidence reviewer must verify the source of the R2 metadata and the downloaded object; independent disposable D1 restoration, full schema/row comparison, and cleanup receipts remain mandatory. Do not mark Go Live ready based on this checksum tool alone.
