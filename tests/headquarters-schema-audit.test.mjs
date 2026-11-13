import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import {
  parseMigrationDefinition,
  readHeadquartersMigrations,
  expectedSchemaNames,
  inspectHeadquartersSchema,
  planMigrationLedgerReconciliation,
  WRANGLER_MIGRATION_TABLE_SQL
} from "../scripts/headquarters-schema-audit.mjs";

async function withSchema() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys=ON;");
  const definitions = await readHeadquartersMigrations();
  for (const migration of definitions) {
    const sql = await readFile(
      new URL("../migrations/" + migration.name, import.meta.url),
      "utf8"
    );
    db.exec(sql);
  }
  return { db, definitions };
}

function observe(db, definitions, ledger = false) {
  const objects = db.prepare(
    "SELECT type,name,sql FROM sqlite_master " +
    "WHERE type IN ('table','index','trigger','view')"
  ).all();
  const columnsByTable = {};
  for (const entry of definitions) {
    for (const column of entry.addedColumns) {
      if (!columnsByTable[column.table]) {
        columnsByTable[column.table] = db.prepare(
          'PRAGMA table_info("' + column.table + '")'
        ).all().map(row => row.name);
      }
    }
  }
  const appliedMigrations = ledger ?
    db.prepare("SELECT id,name FROM d1_migrations ORDER BY id").all() : null;
  return inspectHeadquartersSchema({
    definitions, observedObjects: objects, columnsByTable, appliedMigrations
  });
}

test("repository contains a complete numbered 29-migration schema chain", async () => {
  const inventory = await readHeadquartersMigrations();
  assert.equal(inventory.length, 29);
  assert.equal(inventory[0].name, "0001_catalogue.sql");
  assert.equal(inventory.at(-1).name, "0029_founder_email_otp.sql");
  assert.equal(expectedSchemaNames(inventory).size, 147);
  assert.deepEqual(
    parseMigrationDefinition(
      "0029_sample.sql",
      "CREATE TABLE IF NOT EXISTS sample(id TEXT); " +
        "CREATE UNIQUE INDEX idx_sample ON sample(id);"
    ).objects,
    [
      { type: "table", name: "sample" },
      { type: "index", name: "idx_sample" }
    ]
  );
});

test("a complete schema without a ledger is never marked release-ready", async () => {
  const { db, definitions } = await withSchema();
  try {
    const audit = observe(db, definitions);
    assert.equal(audit.schemaMatches, true);
    assert.equal(audit.ledgerMatches, false);
    assert.equal(audit.ready, false);
    assert.equal(audit.checkedMigrations, 29);
    assert.equal(audit.expectedObjects, 147);
    assert.equal(audit.missingObjects.length, 0);
    assert.equal(audit.unexpectedObjects.length, 0);
    assert.equal(audit.missingColumns.length, 0);
    const plan = planMigrationLedgerReconciliation(audit, definitions);
    assert.equal(plan.createTable, WRANGLER_MIGRATION_TABLE_SQL);
    assert.equal(plan.parameters.length, 29);
    assert.match(plan.note, /reconciliation date/);
  } finally {
    db.close();
  }
});

test("reconciled Wrangler ledger is ordered, idempotent and verifiable", async () => {
  const { db, definitions } = await withSchema();
  try {
    const plan = planMigrationLedgerReconciliation(
      observe(db, definitions), definitions
    );
    db.exec(plan.createTable);
    db.prepare(plan.insertSql).run(...plan.parameters);
    const audit = observe(db, definitions, true);
    assert.equal(audit.schemaMatches, true);
    assert.equal(audit.ledgerMatches, true);
    assert.equal(audit.ready, true);
    assert.equal(audit.missingLedgerEntries.length, 0);
    assert.equal(audit.unexpectedLedgerEntries.length, 0);
    assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
    assert.throws(
      () => planMigrationLedgerReconciliation(audit, definitions),
      /complete schema audit/
    );
    assert.throws(
      () => db.prepare("INSERT INTO d1_migrations(name) VALUES(?)").run(
        definitions.at(-1).name
      ),
      /UNIQUE/
    );
  } finally {
    db.close();
  }
});

test("missing columns, indexes and ledger entries block the ready decision", async () => {
  const { db, definitions } = await withSchema();
  try {
    db.exec(WRANGLER_MIGRATION_TABLE_SQL);
    const plan = planMigrationLedgerReconciliation(
      observe(db, definitions), definitions
    );
    db.prepare(plan.insertSql).run(...plan.parameters);
    const index = "idx_founder_grant_actions_recent";
    db.exec("DROP INDEX " + index);
    const drift = observe(db, definitions, true);
    assert.equal(drift.ready, false);
    assert.ok(drift.missingObjects.includes("index:" + index));
    assert.throws(
      () => planMigrationLedgerReconciliation(drift, definitions),
      /complete schema audit/
    );
    db.prepare("DELETE FROM d1_migrations WHERE name=?").run(
      definitions.at(-1).name
    );
    const missing = observe(db, definitions, true);
    assert.ok(missing.missingLedgerEntries.includes(
      "0029_founder_email_otp.sql"
    ));
    assert.equal(missing.ledgerMatches, false);

    const fakeColumns = inspectHeadquartersSchema({
      definitions,
      observedObjects: db.prepare(
        "SELECT type,name,sql FROM sqlite_master"
      ).all(),
      columnsByTable: {},
      appliedMigrations: db.prepare(
        "SELECT id,name FROM d1_migrations ORDER BY id"
      ).all()
    });
    assert.ok(fakeColumns.missingColumns.includes("catalogue_listings.owner_type"));
    assert.equal(fakeColumns.ready, false);
  } finally {
    db.close();
  }
});

test("an unnumbered, repeated or skipped migration cannot be reconciled", () => {
  assert.throws(
    () => parseMigrationDefinition("fancy_new_feature.sql", "CREATE TABLE example(x);"),
    /numbered SQL migration/
  );
  assert.throws(
    () => expectedSchemaNames([
      parseMigrationDefinition("0001_one.sql", "CREATE TABLE test(x);"),
      parseMigrationDefinition("0003_three.sql", "CREATE TABLE other(y);")
    ]),
    /sequence/
  );
  assert.throws(
    () => expectedSchemaNames([
      parseMigrationDefinition("0001_one.sql", "CREATE TABLE one(x);"),
      parseMigrationDefinition("0002_two.sql", "CREATE TABLE one(y);")
    ]),
    /Duplicate schema declaration/
  );
});
