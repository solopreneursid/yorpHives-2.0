/**
 * Independent, read-only supervisor for YorpHives Headquarters and its public website.
 * Run in a separate OS process: the monitored application must not supervise itself.
 * No credentials, repair actions, agent dispatch, model calls or publishing controls.
 */
import { pathToFileURL } from 'node:url';
import { inspectCatalogueResponse } from './catalogue-contract.mjs';
import { DEFAULT_STATUS_FILE, writeWatchdogEvidence } from './watchdog-evidence.mjs';

const WEBSITE_ROUTES = Object.freeze([
  ['website-home', 'https://yorphives.com/'],
  ['website-tools', 'https://yorphives.com/free-tools/'],
  ['website-discovery', 'https://yorphives.com/api/v1/free-tools'],
  ['website-manifest', 'https://yorphives.com/free-tools/manifest.json']
]);

export function watchdogTargets(headquartersOrigin = 'http://127.0.0.1:8788') {
  const origin = new URL(headquartersOrigin);
  if (origin.username || origin.password || origin.search || origin.hash || origin.pathname !== '/' ||
      !['http:', 'https:'].includes(origin.protocol) ||
      (origin.protocol === 'http:' && !['127.0.0.1', 'localhost', '[::1]'].includes(origin.hostname))) {
    throw new Error('Headquarters origin must be an HTTPS origin or loopback HTTP origin, without credentials, paths or parameters.');
  }
  return Object.freeze([
    Object.freeze({ id: 'headquarters-ready', system: 'headquarters', url: new URL('/ready', origin).href, kind: 'readiness' }),
    ...WEBSITE_ROUTES.map(([id, url]) => Object.freeze({
      id, system: 'website', url,
      kind: id === 'website-discovery' ? 'catalogue' : id === 'website-manifest' ? 'manifest' : 'http'
    }))
  ]);
}

/** Bound a readiness response even when Content-Length is absent or dishonest. */
async function boundedRead(response, limit) {
  if (!response.body) return '';
  const reader = response.body.getReader();
  let size = 0;
  const parts = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) return null;
      parts.push(value);
    }
  } finally { await reader.cancel().catch(() => {}); }
  return new TextDecoder().decode(Buffer.concat(parts));
}

/** A 2xx public page is reachable, not proof that its features work. */
export async function checkWatchdogTarget(target, { fetcher = fetch, timeoutMs = 8000, clock = () => new Date().toISOString() } = {}) {
  const observation = { target: target.id, system: target.system, checked_at: clock(), state: 'degraded', reason: 'unverified', http_status: null };
  try {
    const response = await fetcher(target.url, {
      method: 'GET', redirect: 'manual', cache: 'no-store',
      headers: { accept: target.kind === 'readiness' ? 'application/json' : '*/*' },
      signal: AbortSignal.timeout(timeoutMs)
    });
    observation.http_status = response.status;
    if (response.status < 200 || response.status >= 300) {
      observation.reason = response.status >= 300 && response.status < 400 ? 'redirect_requires_review' : 'http_unavailable';
    } else if (target.kind === 'catalogue' || target.kind === 'manifest') {
      if (!/^(application\/json|[a-z0-9.+-]+\/[a-z0-9.+-]+\+json)(?:\s*;|\s*$)/i.test(
        response.headers.get('content-type') || '')) {
        observation.reason = 'catalogue_contract_invalid';
      } else if (Number(response.headers.get('content-length') || 0) > 131072) {
        observation.reason = 'catalogue_contract_too_large';
      } else {
        const body = await boundedRead(response, 131072);
        if (body === null) observation.reason = 'catalogue_contract_too_large';
        else {
          const outcome = inspectCatalogueResponse(target.kind,response.headers.get('content-type') || '',body);
          observation.state = outcome.ok ? 'reachable' : 'degraded';
          observation.reason = outcome.reason;
        }
      }
    } else if (target.kind !== 'readiness') {
      observation.state = 'reachable';
      observation.reason = 'http_2xx_only';
    } else {
      const contentType = response.headers.get('content-type') || '';
      if (!contentType.toLowerCase().includes('application/json')) {
        observation.reason = 'readiness_not_json';
      } else if (Number(response.headers.get('content-length') || 0) > 4096) {
        observation.reason = 'readiness_too_large';
      } else {
        // Never include private runtime data in logs or persisted observations.
        const body = await boundedRead(response, 4096);
        if (body === null) observation.reason = 'readiness_too_large';
        else {
          try {
            const data = JSON.parse(body);
            if (data?.service === 'YorpHives Headquarters' && data.status === 'ready' &&
                data.database === 'available' && data.monitoring === 'available') {
              observation.state = 'ready';
              observation.reason = 'runtime_dependencies_ready';
            } else observation.reason = 'readiness_degraded_or_unverified';
          } catch { observation.reason = 'readiness_invalid_json'; }
        }
      }
    }
    await response.body?.cancel().catch(() => {});
  } catch (error) {
    observation.reason = error?.name === 'TimeoutError' || error?.name === 'AbortError' ? 'timeout' : 'network_unavailable';
  }
  return observation;
}

/** Change-only alerts; every cycle still returns an inspectable snapshot. */
export function createIndependentWatchdog({
  targets = watchdogTargets(), check = checkWatchdogTarget, emit = () => {}, clock = () => new Date().toISOString()
} = {}) {
  let previous = new Map();
  let inflight = null;
  function runOnce() {
    if (inflight) return inflight;
    inflight = (async () => {
      const settled = await Promise.all(targets.map(async target => {
        try { return await check(target); }
        catch { return { target: target.id, system: target.system, checked_at: clock(), state: 'degraded', reason: 'check_failed', http_status: null }; }
      }));
      const observations = settled.map((result, index) => ({
        target: targets[index].id, system: targets[index].system, checked_at: result.checked_at || clock(),
        state: result.state === 'ready' || result.state === 'reachable' ? result.state : 'degraded',
        reason: typeof result.reason === 'string' ? result.reason : 'unknown',
        http_status: Number.isInteger(result.http_status) ? result.http_status : null
      }));
      for (const result of observations) {
        const old = previous.get(result.target);
        if (old !== result.state) emit({ event: old === undefined ? 'initial' : result.state === 'degraded' ? 'regression' : 'recovery', ...result });
        previous.set(result.target, result.state);
      }
      return { checked_at: clock(), state: observations.every(item => item.state !== 'degraded') ? 'reachable' : 'degraded', observations };
    })().finally(() => { inflight = null; });
    return inflight;
  }
  return { runOnce };
}

async function main() {
  const intervalMs = Number(process.env.HQ_WATCHDOG_INTERVAL_MS || 60000);
  if (!Number.isSafeInteger(intervalMs) || intervalMs < 10000 || intervalMs > 3600000) throw new Error('HQ_WATCHDOG_INTERVAL_MS must be 10000–3600000.');
  const targets = watchdogTargets(process.env.HQ_WATCHDOG_HEADQUARTERS_ORIGIN);
  const watcher = createIndependentWatchdog({ targets, emit: record => console.log(JSON.stringify(record)) });
  const statusPath = process.env.HQ_WATCHDOG_STATUS_FILE || DEFAULT_STATUS_FILE;
  let stopped = false;
  async function poll() {
    if (stopped) return;
    const snapshot = await watcher.runOnce();
    // Atomic private snapshot makes the outside process observable by Headquarters.
    // It contains only fixed target IDs, enum reasons and timestamps.
    await writeWatchdogEvidence(statusPath,{...snapshot,interval_ms:intervalMs});
    // Machine-readable heartbeat lets a supervisor detect a stopped watchdog.
    console.log(JSON.stringify({ event: 'heartbeat', checked_at: snapshot.checked_at, state: snapshot.state, targets_checked: snapshot.observations.length }));
  }
  const timer = setInterval(() => { void poll().catch(() => console.error(JSON.stringify({ event: 'watchdog_error' }))); }, intervalMs);
  for (const signal of ['SIGTERM','SIGINT']) process.once(signal, () => { stopped = true; clearInterval(timer); });
  await poll();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
