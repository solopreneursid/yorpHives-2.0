import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHeadquartersServer} from '../self-host/server.mjs';
import {writeWatchdogEvidence} from '../self-host/watchdog-evidence.mjs';

test('only a signed-in owner can read fresh independent readiness evidence',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'hq-watchdog-owner-'));
 const password=crypto.randomUUID()+'-local-only';
 const runtime=await createHeadquartersServer({password,dataDirectory:dir});
 t.after(async()=>{await runtime.close();await rm(dir,{recursive:true,force:true});});
 const url=runtime.origin+'/api/admin/watchdog-status';
 assert.equal((await fetch(url,{redirect:'manual'})).status,401);
 assert.equal((await fetch(url,{headers:{'cf-access-jwt-assertion':'forged'}})).status,401);
 const signed=await fetch(runtime.origin+'/auth/login',{method:'POST',redirect:'manual',
  headers:{origin:runtime.origin,'content-type':'application/x-www-form-urlencoded'},
  body:new URLSearchParams({password})});
 assert.equal(signed.status,303);
 const cookie=signed.headers.get('set-cookie').split(';')[0];
 const request=()=>fetch(url,{headers:{cookie},redirect:'manual'});
 const absent=await request();
 assert.equal(absent.status,503);
 assert.equal((await absent.json()).connected,false);
 const when=new Date().toISOString();
 await writeWatchdogEvidence(join(dir,'watchdog-status.json'),{
  checked_at:when,interval_ms:60000,observations:[
   {target:'headquarters-ready',system:'headquarters',checked_at:when,state:'ready',
    reason:'runtime_dependencies_ready',http_status:200},
   {target:'website-discovery',system:'website',checked_at:when,state:'reachable',
    reason:'catalogue_contract_verified',http_status:200}
  ]
 });
 const visible=await request();
 assert.equal(visible.status,200);
 assert.equal(visible.headers.get('cache-control'),'no-store');
 const data=await visible.json();
 assert.equal(data.source,'independent_local_watchdog');
 assert.equal(data.status,'ready');
 assert.equal(data.connected,true);
 assert.equal(data.observations.length,2);
 assert.equal(data.production_execution_enabled,false);
 assert.doesNotMatch(JSON.stringify(data),/password|cookie|watchdog-status\.json|localhost:/);
});
