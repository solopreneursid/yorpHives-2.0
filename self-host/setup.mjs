import { mkdir, open, chmod } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
const directory = resolve(process.env.YORPHIVES_DATA_DIR || new URL('./data/', import.meta.url).pathname);
await mkdir(directory, { recursive: true, mode: 0o700 });
await chmod(directory, 0o700);
const path = resolve(directory, 'owner-password');
try {
  const file = await open(path, 'wx', 0o600);
  try { await file.writeFile(randomBytes(32).toString('base64url') + '\n'); }
  finally { await file.close(); }
  console.log('Created your private owner password file:', path);
} catch (error) {
  if (error.code !== 'EEXIST') throw error;
  console.log('Keeping your existing private owner password file:', path);
}
console.log('Start: node self-host/start.mjs');
console.log('Read the password locally when signing in. Never commit or share this file.');
