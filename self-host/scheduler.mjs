import { scanYorpMindEvolution } from '../hq-intelligence/yorpmind-evolution.js';
import { scanYorpMindTeam } from '../hq-intelligence/yorpmind-team-scan.js';

// Local, zero-inference observation. Existing scanners retain their daily
// idempotency limits; proposed lessons never grant execution or publishing.
export function createObservationScheduler({ db, intervalMs = 60 * 60 * 1000 }) {
  let running = null, stopped = false;
  let latest = { status: 'not_run', model_calls: 0, agent_dispatches: 0 };
  function runOnce() {
    if (stopped) return Promise.resolve(latest);
    if (running) return running;
    running = (async () => {
      try {
        const team = await scanYorpMindTeam(db);
        const evolution = await scanYorpMindEvolution(db);
        latest = { status: 'completed', checked_at: new Date().toISOString(), team, evolution, model_calls: 0, agent_dispatches: 0 };
      } catch {
        latest = { status: 'unavailable', checked_at: new Date().toISOString(), model_calls: 0, agent_dispatches: 0 };
      }
      return latest;
    })().finally(() => { running = null; });
    return running;
  }
  const timer = setInterval(() => { void runOnce(); }, intervalMs);
  timer.unref();
  return { runOnce, status: () => latest, async close() { stopped = true; clearInterval(timer); if (running) await running; } };
}
