import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, copyFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";

const migrationRoot = new URL("../migrations/", import.meta.url);
const expectedMigrations = Array.from({ length: 27 }, (_, index) => index + 1);

test("complete D1 SQL migration chain can be restored from a disposable SQLite backup", async () => {
  const dir = await mkdtemp(join(tmpdir(), "yorphives-hq-restore-"));
  const source = join(dir, "staging-fixture.sqlite");
  const backup = join(dir, "hq-backup.sqlite");
  const restored = join(dir, "restored-copy.sqlite");
  let db;
  let recovery;
  try {
    const filenames = (await readdir(migrationRoot)).filter(name => /^\d{4}_.*\.sql$/.test(name)).sort();
    const ids = filenames.map(name => Number(name.slice(0, 4)));
    assert.deepEqual(ids, expectedMigrations, "Migration history must be complete and contiguous from 0001");
    db = new DatabaseSync(source);
    db.exec("PRAGMA foreign_keys=ON;");
    for (const filename of filenames) {
      const sql = await readFile(new URL(filename, migrationRoot), "utf8");
      db.exec(sql);
    }

    assert.equal(databaseHas(db, "admin_repair_finding_links"), true);
    assert.equal(databaseHas(db, "admin_repair_qa_reports"), true);
    assert.equal(databaseHas(db, "yorpmind_experiences"), true);
    assert.equal(databaseHas(db, "yorpmind_skill_reviews"), true);
    assert.equal(databaseHas(db, "yorpmind_evolution_runs"), true);
    assert.equal(databaseHas(db, "yorpmind_evolution_proposals"), true);
    assert.equal(databaseHas(db, "yorpmind_owner_delegations"), true);
    assert.equal(databaseHas(db, "yorpmind_staff"), true);
    assert.equal(databaseHas(db, "yorpmind_team_reports"), true);
    assert.equal(databaseHas(db, "agent_jobs"), true);
    assert.equal(databaseHas(db, "admin_audit_events"), true);
    const before = db.prepare("PRAGMA foreign_key_check").all();
    assert.deepEqual(before, [], "Source DB must have no FK violations");

    const sentinel = "hq-backup-integrity-fixture";
    db.prepare("INSERT INTO admin_audit_events(id,actor,action,resource_type,resource_id,details_json,created_at) VALUES (?,?,?,?,?,?,?)")
      .run(sentinel, "fixture", "backup_test", "test", sentinel, JSON.stringify({ verified: true }), "2026-11-12T00:00:00Z");
    db.exec("VACUUM INTO '" + backup.replaceAll("'", "''") + "';");
    await copyFile(backup, restored);
    db.close();
    db = null;

    recovery = new DatabaseSync(restored);
    recovery.exec("PRAGMA foreign_keys=ON");
    assert.equal(databaseHas(recovery, "admin_repair_finding_links"), true);
    const row = recovery.prepare("SELECT action,details_json FROM admin_audit_events WHERE id=?").get(sentinel);
    assert.equal(row.action, "backup_test");
    assert.equal(JSON.parse(row.details_json).verified, true);
    assert.deepEqual(recovery.prepare("PRAGMA foreign_key_check").all(), []);
    assert.equal(recovery.prepare("PRAGMA integrity_check").get().integrity_check, "ok");
  } finally {
    if (recovery) recovery.close();
    if (db) db.close();
    await rm(dir, { recursive: true, force: true });
  }
});

function databaseHas(db, name) {
  return Boolean(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(name));
}
