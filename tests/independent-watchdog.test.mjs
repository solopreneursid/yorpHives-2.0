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

test('optional missing website discovery endpoints are coverage gaps, not outage alerts',async()=>{
  const targets=watchdogTargets();
  const events=[];
  const checks={
    'headquarters-ready':{state:'ready',reason:'runtime_dependencies_ready',http_status:200},
    'website-home':{state:'reachable',reason:'http_2xx_only',http_status:200},
    'website-tools':{state:'reachable',reason:'http_2xx_only',http_status:200},
    'website-studio':{state:'reachable',reason:'http_2xx_only',http_status:200},
    'website-discovery':{state:'unavailable',reason:'optional_endpoint_missing',http_status:404},
    'website-manifest':{state:'unavailable',reason:'optional_endpoint_missing',http_status:404}
  };
  const monitor=createIndependentWatchdog({targets,clock:time,emit:e=>events.push(e),
    check:async target=>({checked_at:time(),...checks[target.id]})});
  const value=await monitor.runOnce();
  assert.equal(value.state,'reachable');
  assert.equal(value.observations.length,6);
  assert.equal(value.observations.filter(x=>x.state==='unavailable').length,2);
  assert.equal(value.observations.find(x=>x.target==='website-studio').state,'reachable');
  assert.equal(events.length,6);
});

test('two advertised catalogue endpoints must agree on tool slugs before sync is verified',async()=>{
 const targets=watchdogTargets();
 let manifest=['a','b'];
 const events=[];
 const {createHash}=await import('node:crypto');
 const fingerprint=slugs=>createHash('sha256').update([...slugs].sort().join('\\n')).digest('hex');
 const monitor=createIndependentWatchdog({targets,clock:time,emit:e=>events.push(e),
   check:async target=>target.kind==='catalogue'||target.kind==='manifest'
     ? {checked_at:time(),state:'reachable',reason:'catalogue_contract_verified',
        fingerprint:fingerprint(target.kind==='catalogue'?['a','b']:manifest),http_status:200}
     : {checked_at:time(),state:target.kind==='readiness'?'ready':'reachable',
        reason:target.kind==='readiness'?'runtime_dependencies_ready':'http_2xx_only',http_status:200}});
 const first=await monitor.runOnce();
 assert.equal(first.state,'reachable');
 assert.deepEqual(first.observations.filter(x=>x.reason==='catalogue_sources_match').length,2);
 manifest=['b','c'];
 const drift=await monitor.runOnce();
 assert.equal(drift.state,'degraded');
 assert.equal(drift.observations.filter(x=>x.reason==='catalogue_sources_disagree').length,2);
 assert.equal(events.filter(x=>x.event==='regression').length,2);
 // No slugs, tool content or fingerprints may be persisted in observations.
 assert.doesNotMatch(JSON.stringify(drift),/"fingerprint"|"slugs"|"tools"/);
});
