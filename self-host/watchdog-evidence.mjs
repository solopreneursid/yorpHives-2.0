/** Private, local-only snapshot of an independent read-only watchdog.
 * No URLs, cookies, tokens or error messages may appear in the saved evidence.
 * This file is managed by the watchdog process, NOT the HQ application.
 */
import { mkdir, open, rename, unlink } from 'node:fs/promises';
import { constants } from 'node:fs';
import { dirname, isAbsolute } from 'node:path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const DEFAULT_STATUS_FILE = fileURLToPath(new URL('./data/watchdog-status.json', import.meta.url));
export const WATCHDOG_EVIDENCE_LIMIT = 8192;
const STATES = new Set(['ready','reachable','degraded']);
const REASONS = new Set([
  'runtime_dependencies_ready','readiness_degraded_or_unverified','readiness_not_json',
  'readiness_invalid_json','readiness_too_large','redirect_requires_review',
  'http_unavailable','http_2xx_only','timeout','network_unavailable',
  'check_failed','unknown','catalogue_contract_verified','catalogue_contract_invalid',
  'catalogue_contract_unverified','catalogue_contract_too_large'
]);
const TARGETS = new Set([
  'headquarters-ready','website-home','website-tools','website-discovery','website-manifest'
]);
const safeTime = value => typeof value === 'string' &&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(value) &&
  Number.isFinite(Date.parse(value));

function cleanSnapshot(snapshot) {
  if (!snapshot || !safeTime(snapshot.checked_at) ||
      !Number.isSafeInteger(snapshot.interval_ms) ||
      snapshot.interval_ms < 10000 || snapshot.interval_ms > 3600000 ||
      !Array.isArray(snapshot.observations) ||
      snapshot.observations.length < 1 || snapshot.observations.length > TARGETS.size) throw Error('Invalid watchdog observation');
  const names = new Set();
  const observations = snapshot.observations.map(item => {
    if (!TARGETS.has(item.target) || names.has(item.target) ||
        !STATES.has(item.state) || !REASONS.has(item.reason) ||
        !safeTime(item.checked_at) ||
        !(item.http_status === null || (Number.isSafeInteger(item.http_status) &&
          item.http_status >= 100 && item.http_status <= 599))) throw Error('Invalid watchdog target');
    names.add(item.target);
    return {target:item.target,system:item.target === 'headquarters-ready' ? 'headquarters' : 'website',
      state:item.state,reason:item.reason,checked_at:item.checked_at,http_status:item.http_status};
  });
  if (!names.has('headquarters-ready')) throw Error('Independent HQ readiness check is required');
  return {schema_version:1,source:'independent_local_watchdog',checked_at:snapshot.checked_at,
    interval_ms:snapshot.interval_ms,observations,
    state:observations.some(item=>item.state==='degraded') ? 'degraded' : 'observed'};
}
function filePath(value) {
  if (typeof value !== 'string' || !isAbsolute(value) || !value.endsWith('.json') ||
      value.includes('\0')) throw Error('Watchdog status file must be an absolute JSON file');
  return value;
}

/** Atomic, owner-readable-only snapshot. Writes no external service or database. */
export async function writeWatchdogEvidence(path, snapshot) {
  const destination = filePath(path);
  const record = cleanSnapshot(snapshot);
  const data = JSON.stringify(record) + '\n';
  if (Buffer.byteLength(data) > WATCHDOG_EVIDENCE_LIMIT) throw Error('Watchdog snapshot too large');
  const folder = dirname(destination);
  await mkdir(folder,{recursive:true,mode:0o700});
  const staging = destination + '.' + randomBytes(8).toString('hex') + '.tmp';
  try {
    const file = await open(staging,'wx',0o600);
    try { await file.writeFile(data); await file.sync(); } finally { await file.close(); }
    await rename(staging,destination);
  } finally { await unlink(staging).catch(()=>{}); }
  return record;
}

/** Return only validated, fresh, minimal evidence to an authenticated reader. */
export async function readWatchdogEvidence(path,{ now = Date.now() } = {}) {
  const unavailable = {source:'independent_local_watchdog',connected:false,status:'unavailable',
    reason:'missing_or_stale_evidence',observations:[],observed_at:null,
    repairs_authorized:false,production_execution_enabled:false};
  try {
    const destination = filePath(path);
    // O_NOFOLLOW + fstat on the same descriptor closes the symlink swap
    // window between a separate lstat() and open(). Reject permissive files.
    const file = await open(destination,constants.O_RDONLY|constants.O_NOFOLLOW);
    let bytes;
    try {
      const stat = await file.stat();
      if (!stat.isFile() || stat.nlink !== 1 ||
          (stat.mode & 0o077) !== 0 ||
          (typeof process.getuid === 'function' && stat.uid !== process.getuid()) ||
          stat.size > WATCHDOG_EVIDENCE_LIMIT || stat.size < 10) return unavailable;
      bytes = await file.readFile();
    } finally { await file.close(); }
    if (bytes.byteLength > WATCHDOG_EVIDENCE_LIMIT) return unavailable;
    const record = JSON.parse(bytes.toString('utf8'));
    const validated = cleanSnapshot(record);
    // A changed format, future timestamp or stopped outside process cannot
    // be mistaken for a functioning watchdog.
    if (record.schema_version !== 1 || record.source !== 'independent_local_watchdog' ||
        !Number.isFinite(now) || Date.parse(validated.checked_at) > now ||
        now - Date.parse(validated.checked_at) > validated.interval_ms * 2 + 5000 ||
        validated.observations.some(item => Date.parse(item.checked_at) > now ||
          Date.parse(item.checked_at) > Date.parse(validated.checked_at))) return unavailable;
    const hq = validated.observations.find(item => item.target === 'headquarters-ready');
    return {source:'independent_local_watchdog',connected:true,
      status:hq.state === 'ready' ? 'ready' : 'degraded',
      observed_at:validated.checked_at,observations:validated.observations,
      repairs_authorized:false,production_execution_enabled:false};
  } catch { return unavailable; }
}
