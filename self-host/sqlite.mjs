import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, chmod } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

class Statement {
  constructor(database, query, values = []) { this.database = database; this.query = query; this.values = values; }
  bind(...values) { return new Statement(this.database, this.query, values); }
  async first(column) {
    const row = this.database.prepare(this.query).get(...this.values);
    return row ? (column === undefined ? row : row[column]) : null;
  }
  async all() { return { success: true, results: this.database.prepare(this.query).all(...this.values) }; }
  execute() {
    const statement = this.database.prepare(this.query);
    if (statement.columns().length) {
      const results = statement.all(...this.values);
      return { success: true, results, meta: { changes: Number(this.database.prepare('SELECT changes() AS changes').get().changes) } };
    }
    const result = statement.run(...this.values);
    return { success: true, results: [], meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) } };
  }
  async run() { return this.execute(); }
}

export async function createDatabase({ filename, migrationsDirectory = new URL('../migrations/', import.meta.url) }) {
  if (filename !== ':memory:') await mkdir(dirname(resolve(filename)), { recursive: true, mode: 0o700 });
  const raw = new DatabaseSync(filename);
  if (filename !== ':memory:') await chmod(filename, 0o600);
  raw.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
  raw.exec('CREATE TABLE IF NOT EXISTS self_host_migrations (name TEXT PRIMARY KEY, sha256 TEXT NOT NULL, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)');
  try {
    const files = (await readdir(migrationsDirectory)).filter(name => /^\d{4}_[a-z0-9_]+\.sql$/.test(name)).sort();
    for (const name of files) {
      const sql = await readFile(new URL(name, migrationsDirectory instanceof URL ? migrationsDirectory : pathToFileURL(resolve(migrationsDirectory) + '/')), 'utf8');
      const digest = createHash('sha256').update(sql).digest('hex');
      const previous = raw.prepare('SELECT sha256 FROM self_host_migrations WHERE name = ?').get(name);
      if (previous) {
        if (previous.sha256 !== digest) throw new Error(`Migration changed after application: ${name}. Restore the original migration or migrate a backed-up database deliberately.`);
        continue;
      }
      raw.exec('BEGIN IMMEDIATE');
      try {
        raw.exec(sql);
        raw.prepare('INSERT INTO self_host_migrations(name, sha256) VALUES (?, ?)').run(name, digest);
        raw.exec('COMMIT');
      } catch (error) { raw.exec('ROLLBACK'); throw error; }
    }
    return {
      raw,
      prepare(query) { return new Statement(raw, query); },
      async batch(statements) {
        if (!statements.every(item => item instanceof Statement && item.database === raw)) throw new TypeError('Batch statements must belong to this database.');
        raw.exec('BEGIN IMMEDIATE');
        try {
          const results = statements.map(item => item.execute());
          raw.exec('COMMIT');
          return results;
        } catch (error) { raw.exec('ROLLBACK'); throw error; }
      },
      close() { raw.close(); }
    };
  } catch (error) { raw.close(); throw error; }
}
