import test from 'node:test';
import assert from 'node:assert/strict';
import { assessRuntimeReadiness } from '../self-host/readiness.mjs';
import { createObservationScheduler } from '../self-host/scheduler.mjs';

const now = Date.now();
const db = { prepare: () => ({ first: async () => ({ count: 30 }) }) };
const healthy = { status: 'completed', checked_at: new Date(now).toISOString(), interval_ms: 1000 };
const observations = state => ({ status: () => state });

test('readiness distinguishes healthy, disabled, stale, failed and stopped monitoring', async () => {
  assert.equal((await assessRuntimeReadiness({ db, observations: observations(healthy), now })).status, 'ready');
  assert.equal((await assessRuntimeReadiness({ db, now })).monitoring, 'disabled');
  for (const state of [
    { ...healthy, checked_at: new Date(now - 2001).toISOString() },
    { ...healthy, checked_at: 'invalid' },
    { ...healthy, status: 'unavailable' },
    { ...healthy, stopped: true },
    { ...healthy, checked_at: new Date(now + 100).toISOString() }
  ]) assert.equal((await assessRuntimeReadiness({ db, observations: observations(state), now })).status, 'degraded');
});

test('database failure degrades readiness without exposing the error', async () => {
  const broken = { prepare() { throw new Error('private database path'); } };
  const result = await assessRuntimeReadiness({ db: broken, observations: observations(healthy), now });
  assert.equal(result.status, 'degraded');
  assert.equal(result.database, 'unavailable');
  assert.doesNotMatch(JSON.stringify(result), /private database path/);
});

test('scheduler rejects timer overflow and invalid intervals', () => {
  for (const intervalMs of [0, -1, NaN, Infinity, 2147483648]) {
    assert.throws(() => createObservationScheduler({ db, intervalMs }), RangeError);
  }
});
