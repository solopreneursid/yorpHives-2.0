/**
 * Private read-only handoff from an independent browser watchdog to Headquarters.
 * The watchdog writes one atomic 0600 snapshot; the HTTP server only reads it.
 * There is no unauthenticated push endpoint and no database migration.
 */
import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { mkdir, open, rename, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { FUNCTIONAL_PROBES } from './functional-checks.mjs';

const FILE = 'functional-checks.json';
const IDS = new Set(FUNCTIONAL_PROBES.map(check => check.id));
const STATES = new Set(['passed','failed','unavailable']);
const STALE_AFTER_MS = 25 * 60 * 1000;
const unavailable = reason => ({
  kind:'functional_browser_checks', availability:reason,
  observed_at:null, results:[], verified_passes:0, failures:0, unchecked:FUNCTIONAL_PROBES.length,
  monitoring_only:true, writes_performed:false
});

function validSnapshot(data) {
  if (!data || data.schema_version !== 1 || typeof data.observed_at !== 'string' ||
      !Number.isFinite(Date.parse(data.observed_at)) ||
      !Array.isArray(data.results) || data.results.length !== FUNCTIONAL_PROBES.length)
    return false;
  const seen = new Set();
  for (const row of data.results) {
    if (!row || !IDS.has(row.id) || seen.has(row.id) ||
        row.system !== 'website' || row.source !== 'chromium_browser_journey' ||
        !STATES.has(row.status) || typeof row.reason !== 'string' ||
        row.reason.length > 80 || !Number.isFinite(Date.parse(row.observed_at)) ||
        row.verification_status !== (row.status === 'passed' ? 'functionally_verified' : 'unverified')) return false;
    seen.add(row.id);
  }
  return true;
}

export async function writeFunctionalSnapshot(dataDirectory, results, observedAt = new Date().toISOString()) {
  const snapshot = {schema_version:1, observed_at:observedAt, results};
  if (!validSnapshot(snapshot)) throw new TypeError('Cannot persist unverified or incomplete browser evidence.');
  await mkdir(dataDirectory,{recursive:true,mode:0o700});
  const filename = resolve(dataDirectory,FILE);
  const temporary = resolve(dataDirectory,'.functional-checks-' + randomUUID() + '.tmp');
  try {
    const text = JSON.stringify(snapshot);
    if (Buffer.byteLength(text,'utf8') > 24576) throw new RangeError('Browser evidence snapshot too large.');
    await writeFile(temporary,text,{flag:'wx',mode:0o600});
    await rename(temporary,filename);
  } finally { await rm(temporary,{force:true}).catch(() => {}); }
  return snapshot;
}

export async function readFunctionalSnapshot(dataDirectory, now = Date.now()) {
  let handle;
  try {
    handle = await open(resolve(dataDirectory,FILE),constants.O_RDONLY | constants.O_NOFOLLOW);
    const info = await handle.stat();
    if (!info.isFile() || info.size > 24576 || info.size < 30) return unavailable('invalid');
    const data = JSON.parse(await handle.readFile({encoding:'utf8'}));
    if (!validSnapshot(data)) return unavailable('invalid');
    const age = now - Date.parse(data.observed_at);
    const fresh = age >= -120000 && age <= STALE_AFTER_MS;
    const counts = {
      verified_passes:data.results.filter(row => row.status === 'passed').length,
      failures:data.results.filter(row => row.status === 'failed').length,
      unchecked:data.results.filter(row => row.status === 'unavailable').length
    };
    return {
      kind:'functional_browser_checks', availability:fresh ? 'recorded':'stale',
      observed_at:data.observed_at, results:data.results, ...counts,
      monitoring_only:true, writes_performed:false
    };
  } catch (error) {
    return unavailable(error?.code === 'ENOENT' ? 'not_connected' : 'unavailable');
  } finally { await handle?.close().catch(() => {}); }
}
