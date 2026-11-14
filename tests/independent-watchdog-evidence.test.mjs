import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeWatchdogEvidence, readWatchdogEvidence } from '../self-host/watchdog-evidence.mjs';

const date = '2026-11-14T02:00:00.000Z';
const record = () => ({checked_at:date,interval_ms:60000,observations:[
  {target:'headquarters-ready',system:'headquarters',checked_at:date,state:'ready',
    reason:'runtime_dependencies_ready',http_status:200},
  {target:'website-home',system:'website',checked_at:date,state:'reachable',
    reason:'http_2xx_only',http_status:200},
  {target:'website-discovery',system:'website',checked_at:date,state:'reachable',
    reason:'catalogue_contract_verified',http_status:200}
]});
const fixture = async t => {
  const dir = await mkdtemp(join(tmpdir(),'hq-wd-'));
  t.after(()=>rm(dir,{recursive:true,force:true}));
  return join(dir,'private','watchdog-status.json');
};

test('watchdog atomically records only fixed redacted observations in owner-private file',async t=>{
  const path=await fixture(t);
  const original={...record(),debug_url:'https://private.example/?token=should-not-leak'};
  await writeWatchdogEvidence(path,original);
  const saved=await readFile(path,'utf8');
  assert.doesNotMatch(saved,/debug_url|private\.example|token|password/);
  assert.equal((await stat(path)).mode & 0o777,0o600);
  const report=await readWatchdogEvidence(path,{now:Date.parse(date)+30000});
  assert.equal(report.connected,true);
  assert.equal(report.status,'ready');
  assert.equal(report.observations.length,3);
  assert.equal(report.repairs_authorized,false);
  assert.equal(report.production_execution_enabled,false);
});

test('stale, future, corrupted and symlinked evidence all fail closed',async t=>{
  const path=await fixture(t);
  await writeWatchdogEvidence(path,record());
  assert.equal((await readWatchdogEvidence(path,{now:Date.parse(date)+130000})).connected,false);
  assert.equal((await readWatchdogEvidence(path,{now:Date.parse(date)-1})).connected,false);
  await writeFile(path,'not-json');
  assert.equal((await readWatchdogEvidence(path,{now:Date.parse(date)+500})).connected,false);
  const link=path+'.json';
  await symlink(path,link);
  assert.equal((await readWatchdogEvidence(link,{now:Date.parse(date)+500})).connected,false);
});

test('unknown IDs, injected reasons and missing HQ readiness cannot enter the private report',async t=>{
  const path=await fixture(t);
  const bad=[
    {...record(),observations:[{...record().observations[0],target:'unknown-site'}]},
    {...record(),observations:record().observations.slice(1)},
    {...record(),observations:[{...record().observations[0],reason:'secret=abcd'}]},
    {...record(),observations:[record().observations[0],record().observations[0]]},
    {...record(),interval_ms:0},
  ];
  for(const item of bad)await assert.rejects(()=>writeWatchdogEvidence(path,item));
  assert.equal((await readWatchdogEvidence(path)).connected,false);
});

test('a degraded HQ runtime remains degraded even when website checks pass',async t=>{
  const path=await fixture(t),ob=record();
  ob.observations[0].state='degraded';
  ob.observations[0].reason='readiness_degraded_or_unverified';
  await writeWatchdogEvidence(path,ob);
  const result=await readWatchdogEvidence(path,{now:Date.parse(date)+1000});
  assert.equal(result.connected,true);
  assert.equal(result.status,'degraded');
});
