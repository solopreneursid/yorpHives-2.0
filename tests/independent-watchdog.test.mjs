import test from 'node:test';
import assert from 'node:assert/strict';
import { watchdogTargets, checkWatchdogTarget, createIndependentWatchdog } from '../self-host/watchdog.mjs';

const [hq, home] = watchdogTargets();
const time = () => '2026-11-14T00:00:00.000Z';
const options = response => ({ fetcher: async (_url, init) => {
  assert.equal(init.redirect, 'manual');
  assert.equal(init.method, 'GET');
  return response;
}, clock: time });

test('explicitly separates private HQ readiness from public website HTTP checks', () => {
  assert.equal(hq.url, 'http://127.0.0.1:8788/ready');
  assert.deepEqual([...new Set(watchdogTargets().map(t => t.system))], ['headquarters','website']);
  assert.equal(watchdogTargets('https://private.example.com').at(0).url, 'https://private.example.com/ready');
  for (const invalid of ['http://example.com','https://user:pass@example.com','https://example.com/path','file:///tmp', 'https://example.com/?token=123']) {
    assert.throws(() => watchdogTargets(invalid));
  }
});

test('HQ ready requires full verified dependency response, not just HTTP 200', async () => {
  const good = { service: 'YorpHives Headquarters', status: 'ready', database: 'available', monitoring: 'available' };
  const ok = await checkWatchdogTarget(hq, options(new Response(JSON.stringify(good), { headers: { 'content-type':'application/json' } })));
  assert.equal(ok.state, 'ready');
  const weaker = await checkWatchdogTarget(hq, options(new Response(JSON.stringify({ ...good, monitoring:'disabled' }), { headers: { 'content-type':'application/json' } })));
  assert.equal(weaker.state, 'degraded');
  const login = await checkWatchdogTarget(hq, options(new Response('<html>login</html>', { headers: { 'content-type':'text/html' } })));
  assert.equal(login.reason, 'readiness_not_json');
  const invalid = await checkWatchdogTarget(hq, options(new Response('broken', { headers: { 'content-type':'application/json' } })));
  assert.equal(invalid.reason, 'readiness_invalid_json');
  const huge = await checkWatchdogTarget(hq, options(new Response('x'.repeat(5000), { headers: { 'content-type':'application/json' } })));
  assert.equal(huge.reason, 'readiness_too_large');
});

test('website passes are labeled reachability only; redirects and authentication failures fail closed', async () => {
  const ok = await checkWatchdogTarget(home, options(new Response('ok', { status: 200 })));
  assert.deepEqual([ok.state,ok.reason], ['reachable','http_2xx_only']);
  assert.equal((await checkWatchdogTarget(home, options(new Response(null, { status: 301, headers: { location:'https://another.example/' } })))).reason, 'redirect_requires_review');
  assert.equal((await checkWatchdogTarget(home, options(new Response('blocked', { status: 403 })))).state, 'degraded');
  assert.equal((await checkWatchdogTarget(home, { fetcher: async () => { throw new Error('private secret in error'); }, clock:time })).reason, 'network_unavailable');
});

test('initial results, regressions and recoveries emit once while simultaneous polls coalesce', async () => {
  const events = [];
  let release;
  let state = 'reachable';
  const barrier = new Promise(resolve => { release = resolve; });
  let calls = 0;
  const watch = createIndependentWatchdog({ targets:[home], clock:time, emit:e=>events.push(e), check:async()=>{
    calls++;
    if (calls === 1) await barrier;
    return { state, reason:'test', http_status:200, checked_at:time() };
  }});
  const one = watch.runOnce();
  assert.equal(watch.runOnce(), one);
  release();
  assert.equal((await one).state, 'reachable');
  await watch.runOnce();
  state = 'degraded';
  assert.equal((await watch.runOnce()).state, 'degraded');
  await watch.runOnce();
  state = 'reachable';
  await watch.runOnce();
  assert.deepEqual(events.map(x=>x.event), ['initial','regression','recovery']);
  assert.equal(calls,5);
});
