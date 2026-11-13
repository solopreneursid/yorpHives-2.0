import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHeadquartersServer } from './server.mjs';
const dataDirectory = resolve(process.env.YORPHIVES_DATA_DIR || new URL('./data/', import.meta.url).pathname);
const password = process.env.YORPHIVES_OWNER_PASSWORD || await readFile(resolve(dataDirectory, 'owner-password'), 'utf8').then(value => value.trim()).catch(() => '');
const modelUrl = process.env.HQ_MODEL_URL;
const modelName = process.env.HQ_MODEL_NAME;
if (modelName && !modelUrl) throw new Error('HQ_MODEL_NAME requires HQ_MODEL_URL.');
const runtime = await createHeadquartersServer({
  password,
  ownerEmail: process.env.YORPHIVES_OWNER_EMAIL || 'owner@localhost',
  hostname: process.env.YORPHIVES_HOST || '127.0.0.1',
  port: Number(process.env.YORPHIVES_PORT || 8788),
  publicOrigin: process.env.YORPHIVES_PUBLIC_ORIGIN,
  dataDirectory,
  enableObservationSchedule: process.env.HQ_OBSERVATION_SCHEDULE !== 'no',
  ...(modelUrl ? { createMissionEngine: async ({ db }) => {
    const { createLocalMissionEngine } = await import('./mission-engine.mjs');
    return createLocalMissionEngine({ db, modelUrl, modelName });
  } } : {})
});
console.log('YorpHives Headquarters:', runtime.origin + '/admin/');
console.log('Storage: your private SQLite database. AI briefs:', modelUrl ? 'local model configured' : 'not connected (missions can still be saved and reviewed)');
let stopping = false;
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => {
  if (stopping) return;
  stopping = true;
  await runtime.close();
  process.exit(0);
});
