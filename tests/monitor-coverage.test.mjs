import test from 'node:test';
import assert from 'node:assert/strict';
import { createDatabase } from '../self-host/sqlite.mjs';
import { runAdminHealthChecks } from '../admin-monitor/admin-health.js';
import { createObservationScheduler } from '../self-host/scheduler.mjs';

test('bounded health batches rotate through every enabled monitor and verify founder fixes', async t => {
  t.mock.method(globalThis, 'fetch', async () => new Response('ok'));
  const db = await createDatabase({ filename: ':memory:' });
  t.after(() => db.close());
  await db.prepare('UPDATE admin_monitors SET enabled=0').run();
  for (let i = 0; i < 12; i++) {
    await db.prepare("INSERT INTO admin_monitors(id,name,url,environment) VALUES (?,?,?,'production')")
      .bind('test-' + i, 'Test ' + i, 'https://yorphives.com/test-' + i).run();
  }
  const first = await runAdminHealthChecks(db, 'scheduled');
  assert.equal(first.results.length, 10);
  const second = await runAdminHealthChecks(db, 'scheduled');
  assert.equal(new Set([...first.results, ...second.results].map(row => row.monitor_id)).size, 12);
  const id = second.results[0].monitor_id;
  await db.prepare("INSERT INTO admin_findings(id,fingerprint,monitor_id,severity,title,details,status,first_detected,last_verified) VALUES ('test-finding',?,?,'high','Failure','Test','fixed',?,?)")
    .bind('http-health:' + id, id, new Date().toISOString(), new Date().toISOString()).run();
  await db.prepare('UPDATE admin_monitors SET enabled=0 WHERE id<>?').bind(id).run();
  await runAdminHealthChecks(db, 'manual');
  assert.equal((await db.prepare("SELECT status FROM admin_findings WHERE id='test-finding'").first()).status, 'verified');
});

test('scheduler coalesces concurrent runs and reports failed checks as unavailable coverage', async t => {
  const db = await createDatabase({ filename: ':memory:' });
  let release;
  let calls = 0;
  const gate = new Promise(resolve => { release = resolve; });
  const schedule = createObservationScheduler({ db, runHealthChecks: async () => {
    calls++;
    await gate;
    throw new Error('runner failed');
  } });
  t.after(async () => { await schedule.close(); db.close(); });
  const first = schedule.runOnce();
  assert.equal(schedule.runOnce(), first);
  release();
  assert.equal((await first).status, 'unavailable');
  assert.equal(calls, 1);
  await schedule.close();
  await schedule.runOnce();
  assert.equal(calls, 1);
});
