import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FUNCTIONAL_PROBES, runFunctionalChecks } from '../self-host/functional-checks.mjs';
import { writeFunctionalSnapshot, readFunctionalSnapshot } from '../self-host/functional-state.mjs';
import { createFunctionalWatchdog } from '../self-host/functional-watchdog.mjs';

const instant = () => '2026-11-14T01:00:00.000Z';

function fakeChromium({ wrong = false, redirect = false, badStatus = false } = {}) {
  const state = { launch:0, closed:0, contextClosed:0, routes:0, visited:[], inputs:[] };
  const chromium = {async launch(options) {
    state.launch++;
    assert.equal(options.headless,true);
    return {
      async newContext(options) {
        assert.equal(options.acceptDownloads,false);
        assert.equal(options.ignoreHTTPSErrors,false);
        return {
          async route(_pattern, handler) {
            state.routes++;
            let action = '';
            await handler({
              request:() => ({url:()=>'http://127.0.0.1/private'}),
              continue:() => {action='continue';},
              abort:() => {action='abort';}
            });
            assert.equal(action,'abort','never allow website page to reach private hosts');
          },
          async newPage() {
            let operation = '', input = '', url = '';
            return {
              setDefaultTimeout(ms) {assert.equal(ms,12000);},
              async goto(location) {url=location;state.visited.push(location);return {status:() => badStatus ? 403:200};},
              url:() => redirect ? 'https://untrusted.example/' : url,
              locator(selector) {
                return {
                  async fill(value) {assert.equal(selector,'#textInput');input=value;state.inputs.push(value);},
                  async selectOption(value) {assert.equal(selector,'#textAction');operation=value;},
                  async click() {assert.equal(selector,'#runText');},
                  async textContent() {
                    assert.equal(selector,'#textOutput');
                    let result = '';
                    if (operation==='json-pretty' || operation==='json-minify')
                      result=JSON.stringify(JSON.parse(input),null,operation==='json-pretty'?2:0);
                    else if (operation==='base64-encode') result=Buffer.from(input).toString('base64');
                    else if (operation==='url-decode') result=decodeURIComponent(input);
                    return wrong ? result+'tampered' : result;
                  }
                };
              },
              async close() {}
            };
          },
          async close() {state.contextClosed++;}
        };
      },
      async close() {state.closed++;}
    };
  }};
  return {chromium,state};
}

test('browser journeys verify actual JSON, Base64 and URL outputs without third-party requests',async()=>{
  const {chromium,state}=fakeChromium();
  const results=await runFunctionalChecks({chromium,clock:instant});
  assert.equal(results.length,FUNCTIONAL_PROBES.length);
  assert.ok(results.every(row=>row.status==='passed' && row.verification_status==='functionally_verified'));
  assert.ok(results.every(row=>row.evidence?.expected_sha256===row.evidence?.observed_sha256));
  assert.equal(state.launch,1);
  assert.equal(state.closed,1);
  assert.equal(state.contextClosed,1);
  assert.equal(state.routes,1);
  assert.equal(state.visited.length,4);
});

test('incorrect user-visible output is a failed functional check, not HTTP success',async()=>{
  const {chromium}=fakeChromium({wrong:true});
  const results=await runFunctionalChecks({chromium,clock:instant});
  assert.ok(results.every(row=>row.status==='failed' && row.reason==='output_mismatch'));
  assert.ok(results.every(row=>row.verification_status==='unverified'));
  assert.ok(results.every(row=>row.evidence.expected_sha256!==row.evidence.observed_sha256));
});

test('redirects, blocked pages and missing Chromium never become a verified product pass',async()=>{
  for (const scenario of [{redirect:true},{badStatus:true}]) {
    const {chromium}=fakeChromium(scenario);
    const result=await runFunctionalChecks({chromium,clock:instant});
    assert.ok(result.every(row=>row.status==='failed' && row.reason==='page_unavailable'));
  }
  const absent=await runFunctionalChecks({clock:instant});
  assert.ok(absent.every(row=>row.status==='unavailable' && row.reason==='browser_not_installed'));
  await assert.rejects(runFunctionalChecks({timeoutMs:1}),RangeError);
  await assert.rejects(runFunctionalChecks({chromium:{},probes:[{id:'arbitrary'}]}),TypeError);
});

test('snapshot is private, validated, stale-aware and does not invent successful checks',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'yorphives-functional-'));
  try {
    assert.equal((await readFunctionalSnapshot(dir)).availability,'not_connected');
    const rows=await runFunctionalChecks({chromium:fakeChromium().chromium,clock:instant});
    await writeFunctionalSnapshot(dir,rows,instant());
    const saved=join(dir,'functional-checks.json');
    assert.equal((await stat(saved)).mode & 0o777,0o600);
    assert.equal((await readFunctionalSnapshot(dir,Date.parse(instant()))).verified_passes,4);
    const stale=await readFunctionalSnapshot(dir,Date.parse(instant())+26*60*1000);
    assert.equal(stale.availability,'stale');
    assert.equal(stale.verified_passes,4,'historical evidence remains visible but is labelled stale');
    await writeFile(saved,'{"schema_version":1,"results":[]}',{mode:0o600});
    assert.equal((await readFunctionalSnapshot(dir)).availability,'invalid');
    await assert.rejects(writeFunctionalSnapshot(dir,rows.slice(1),instant()),TypeError);
  } finally {await rm(dir,{force:true,recursive:true});}
});

test('independent process emits transition-only results, continuous heartbeats and coalesces polls',async()=>{
  const events=[];
  let resume, started=0, state='passed';
  const barrier=new Promise(r=>{resume=r;});
  const make=()=>FUNCTIONAL_PROBES.map(probe=>({
    id:probe.id, status:state, reason:'test', observed_at:instant()
  }));
  const watcher=createFunctionalWatchdog({
    dataDirectory:'/unused',clock:instant,emit:row=>events.push(row),
    persist:async()=>{},run:async()=>{started++;if(started===1)await barrier;return make();}
  });
  const first=watcher.runOnce();
  assert.strictEqual(watcher.runOnce(),first);
  resume();
  await first;
  await watcher.runOnce();
  state='failed';
  await watcher.runOnce();
  state='passed';
  await watcher.runOnce();
  assert.equal(started,4);
  assert.equal(events.filter(e=>e.event==='heartbeat').length,4);
  assert.deepEqual(events.filter(e=>e.target===FUNCTIONAL_PROBES[0].id).map(e=>e.event),
    ['initial','regression','recovery']);
});
