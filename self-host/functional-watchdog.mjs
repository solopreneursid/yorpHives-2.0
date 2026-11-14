/**
 * Outside-in Chromium watchdog. Run as a SECOND, independently supervised
 * process with the same private data directory as Headquarters.
 *
 * Polls the production website; never changes production, starts missions,
 * approves code, collects user uploads, or calls an external SaaS API.
 */
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { runFunctionalChecks } from './functional-checks.mjs';
import { writeFunctionalSnapshot } from './functional-state.mjs';

export function createFunctionalWatchdog({
  run = runFunctionalChecks,
  persist = writeFunctionalSnapshot,
  dataDirectory,
  chromium,
  clock = () => new Date().toISOString(),
  emit = () => {}
}) {
  let previous = new Map(), running = null;
  function runOnce() {
    if (running) return running;
    running = (async () => {
      const checkedAt = clock();
      let results;
      try { results = await run({chromium,clock}); }
      catch {
        // Do not leave a previous green snapshot looking current after a
        // crashed or missing browser runtime. Persist unavailable coverage.
        results = await runFunctionalChecks({clock});
      }
      // Even unavailable browser probes are evidence of a coverage gap; do
      // not silently keep showing an old passing snapshot as current.
      await persist(dataDirectory,results,checkedAt);
      for (const result of results) {
        const old = previous.get(result.id);
        const next = result.status;
        if (old !== next) {
          emit({
            event:old === undefined ? 'initial' : next === 'passed' ? 'recovery':'regression',
            target:result.id, system:'website', source:'chromium_browser_journey',
            status:next, reason:result.reason, observed_at:result.observed_at
          });
        }
        previous.set(result.id,next);
      }
      const passes = results.filter(result => result.status === 'passed').length;
      const failures = results.filter(result => result.status === 'failed').length;
      const unchecked = results.filter(result => result.status === 'unavailable').length;
      const summary = { event:'heartbeat', checked_at:checkedAt,
        status:failures ? 'degraded' : unchecked ? 'coverage_unavailable':'verified',
        verified_passes:passes, failures, unchecked, checked:results.length };
      emit(summary);
      return summary;
    })().finally(() => {running=null;});
    return running;
  }
  return {runOnce};
}

async function main() {
  const intervalMs = Number(process.env.HQ_FUNCTIONAL_INTERVAL_MS || 10 * 60 * 1000);
  if (!Number.isSafeInteger(intervalMs) || intervalMs < 60000 || intervalMs > 3600000)
    throw new Error('HQ_FUNCTIONAL_INTERVAL_MS must be 60000–3600000.');
  const dataDirectory = resolve(process.env.YORPHIVES_DATA_DIR || new URL('./data/',import.meta.url).pathname);
  // Missing Playwright or Chromium is explicitly recorded as unavailable, not
  // evidence that the website is broken.
  const chromium = await import('playwright').then(module => module.chromium).catch(() => null);
  const watcher = createFunctionalWatchdog({
    chromium, dataDirectory, emit:row => console.log(JSON.stringify(row))
  });
  let stopped = false, timer;
  const poll = () => watcher.runOnce().catch(() =>
    console.error(JSON.stringify({event:'functional_watchdog_error',status:'unavailable'})));
  timer = setInterval(() => {if (!stopped) void poll();},intervalMs);
  for (const signal of ['SIGINT','SIGTERM']) process.once(signal,() => {stopped=true;clearInterval(timer);});
  await poll();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
