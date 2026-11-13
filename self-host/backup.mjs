import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { mkdir, chmod } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export async function createBackup(dataDirectory) {
  const directory = resolve(dataDirectory, 'backups');
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const filename = resolve(directory, `headquarters-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID()}.sqlite`);
  const db = new DatabaseSync(resolve(dataDirectory, 'headquarters.sqlite'), { readOnly: true });
  try { db.exec("VACUUM INTO '" + filename.replaceAll("'", "''") + "'"); }
  finally { db.close(); }
  await chmod(filename, 0o600);
  return filename;
}
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const dataDirectory = resolve(process.env.YORPHIVES_DATA_DIR || new URL('./data/', import.meta.url).pathname);
  console.log('Private SQLite backup created:', await createBackup(dataDirectory));
}
