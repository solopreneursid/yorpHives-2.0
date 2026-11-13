import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const CURRENT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const DEFAULT_MIGRATIONS = join(CURRENT_DIRECTORY, "..", "migrations");
const MIGRATION_PATTERN = /^(\d{4})_([A-Za-z0-9_-]+)\.sql$/;
const TYPES = Object.freeze(["table", "index", "trigger", "view"]);

const RULES = Object.freeze({
  table: /\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?["`]?([A-Za-z_][\w]*)/gi,
  index: /\bCREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?["`]?([A-Za-z_][\w]*)/gi,
  trigger: /\bCREATE\s+TRIGGER\s+(?:IF\s+NOT\s+EXISTS\s+)?["`]?([A-Za-z_][\w]*)/gi,
  view: /\bCREATE\s+VIEW\s+(?:IF\s+NOT\s+EXISTS\s+)?["`]?([A-Za-z_][\w]*)/gi,
  alter: /\bALTER\s+TABLE\s+["`]?([A-Za-z_][\w]*)["`]?\s+ADD\s+(?:COLUMN\s+)?["`]?([A-Za-z_][\w]*)/gi
});

export const WRANGLER_MIGRATION_TABLE_SQL =
  "CREATE TABLE IF NOT EXISTS d1_migrations (" +
  "id INTEGER PRIMARY KEY AUTOINCREMENT, " +
  "name TEXT UNIQUE, " +
  "applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL" +
  ")";

export function parseMigrationDefinition(name, text) {
  const parsed = MIGRATION_PATTERN.exec(name);
  if (!parsed || typeof text !== "string" || !text.trim()) {
    throw new TypeError("A numbered SQL migration filename and contents are required.");
  }
  const sql = text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/--[^\n]*/g, "");
  const result = { name, number: Number(parsed[1]), objects: [], addedColumns: [] };
  for (const type of TYPES) {
    for (const match of sql.matchAll(RULES[type])) {
      result.objects.push({ type, name: match[1] });
    }
  }
  for (const match of sql.matchAll(RULES.alter)) {
    result.addedColumns.push({ table: match[1], column: match[2] });
  }
  return result;
}

export async function readHeadquartersMigrations(directory = DEFAULT_MIGRATIONS) {
  const all = (await readdir(directory))
    .filter(name => MIGRATION_PATTERN.test(name))
    .sort();
  const definitions = await Promise.all(all.map(async name =>
    parseMigrationDefinition(name, await readFile(join(directory, name), "utf8"))
  ));
  validateMigrationSequence(definitions);
  return definitions;
}

export function validateMigrationSequence(definitions) {
  if (!Array.isArray(definitions) || definitions.length < 1) {
    throw new TypeError("A nonempty ordered migration inventory is required.");
  }
  for (let i = 0; i < definitions.length; i++) {
    const entry = definitions[i];
    if (!entry || !MIGRATION_PATTERN.test(entry.name) ||
        entry.number !== i + 1 ||
        Number(entry.name.slice(0, 4)) !== entry.number) {
      throw new Error("Migration sequence is missing, duplicated or unordered at position " + (i + 1));
    }
  }
  return definitions.length;
}

export function expectedSchemaNames(definitions) {
  validateMigrationSequence(definitions);
  const names = new Set();
  for (const entry of definitions) {
    for (const object of entry.objects) {
      if (!TYPES.includes(object.type) || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(object.name)) {
        throw new Error("Invalid schema identifier in migration " + entry.name);
      }
      const key = object.type + ":" + object.name;
      if (names.has(key)) {
        throw new Error("Duplicate schema declaration: " + key);
      }
      names.add(key);
    }
  }
  return names;
}

export function inspectHeadquartersSchema({
  definitions,
  observedObjects,
  columnsByTable = {},
  appliedMigrations = null
}) {
  const expected = expectedSchemaNames(definitions);
  if (!Array.isArray(observedObjects)) {
    throw new TypeError("Observed schema objects must be a list.");
  }

  const observed = new Set(
    observedObjects
      .filter(row => row && TYPES.includes(row.type) &&
        typeof row.name === "string" &&
        !row.name.startsWith("sqlite_") &&
        !row.name.startsWith("_cf_") &&
        row.name !== "d1_migrations" &&
        row.sql !== null)
      .map(row => row.type + ":" + row.name)
  );

  const missingObjects = [...expected].filter(name => !observed.has(name)).sort();
  const unexpectedObjects = [...observed].filter(name => !expected.has(name)).sort();
  const missingColumns = [];
  for (const entry of definitions) {
    for (const { table, column } of entry.addedColumns) {
      const available = columnsByTable[table];
      if (!Array.isArray(available) || !available.includes(column)) {
        missingColumns.push(table + "." + column);
      }
    }
  }

  const expectedMigrations = definitions.map(item => item.name);
  const migrationLedgerExists = Array.isArray(appliedMigrations);
  let ledgerMatches = false;
  let missingLedgerEntries = [...expectedMigrations];
  let unexpectedLedgerEntries = [];

  if (migrationLedgerExists) {
    const actual = appliedMigrations.map(row => String(row?.name ?? ""));
    const unique = new Set(actual);
    ledgerMatches = actual.length === expectedMigrations.length &&
      unique.size === actual.length &&
      actual.every((name, i) => name === expectedMigrations[i] &&
        Number(appliedMigrations[i]?.id) === i + 1);
    missingLedgerEntries = expectedMigrations.filter(name => !unique.has(name));
    unexpectedLedgerEntries = actual.filter(name => !expectedMigrations.includes(name));
  }

  const schemaMatches = missingObjects.length === 0 &&
    unexpectedObjects.length === 0 &&
    missingColumns.length === 0;

  return {
    checkedMigrations: expectedMigrations.length,
    expectedObjects: expected.size,
    observedObjects: observed.size,
    schemaMatches,
    ledgerMatches,
    ready: schemaMatches && ledgerMatches,
    migrationLedgerExists,
    missingObjects,
    unexpectedObjects,
    missingColumns,
    missingLedgerEntries,
    unexpectedLedgerEntries
  };
}

/**
 * Generates a plan, not an executor. The caller must explicitly opt into
 * applying these statements to a separately backed-up, audited database.
 * Never call this method after a partial migration or schema-drift finding.
 */
export function planMigrationLedgerReconciliation(report, definitions) {
  validateMigrationSequence(definitions);
  if (!report || !report.schemaMatches ||
      report.migrationLedgerExists ||
      report.checkedMigrations !== definitions.length ||
      report.expectedObjects !== report.observedObjects) {
    throw new Error("Cannot backfill migration history without a complete schema audit.");
  }
  return {
    createTable: WRANGLER_MIGRATION_TABLE_SQL,
    insertSql: "INSERT INTO d1_migrations(name) VALUES " +
      definitions.map(() => "(?)").join(","),
    parameters: definitions.map(item => item.name),
    note: "applied_at is the reconciliation date, not the original deployment date."
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const inventory = await readHeadquartersMigrations();
  const count = inventory.reduce((sum, entry) => sum + entry.objects.length, 0);
  process.stdout.write(JSON.stringify({
    source: "local-files-only",
    remoteDatabaseTouched: false,
    migrationFiles: inventory.length,
    schemaObjects: count,
    first: inventory[0].name,
    last: inventory.at(-1).name,
    note: "Use this report to compare live read-only D1 schema before updating the ledger."
  }, null, 2) + "\n");
}
