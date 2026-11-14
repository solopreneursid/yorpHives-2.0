import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHeadquartersServer } from '../self-host/server.mjs';
import { runFunctionalChecks } from '../self-host/functional-checks.mjs';
import { writeFunctionalSnapshot } from '../self-host/functional-state.mjs';

test('self-hosted Founder Pulse browser evidence is owner-only and read-only',async()=>{
  const directory = await mkdtemp(join(tmpdir(),'yorphives-browser-api-'));
  let runtime;
  try {
    const password = 'local-owner-test-password-123456789';
    runtime = await createHeadquartersServer({password,dataDirectory:directory,enableObservationSchedule:false});
    const endpoint = runtime.origin+'/api/admin/functional-checks';
    let response = await fetch(endpoint);
    assert.equal(response.status,401,'no unauthenticated browser evidence');
    response = await fetch(runtime.origin+'/auth/login',{
      method:'POST',redirect:'manual',
      headers:{origin:runtime.origin,'content-type':'application/x-www-form-urlencoded'},
      body:new URLSearchParams({password})
    });
    assert.equal(response.status,303);
    const cookie=response.headers.get('set-cookie').split(';')[0];
    const fetchOwner=(init={})=>fetch(endpoint,{headers:{cookie,origin:runtime.origin},...init});
    response=await fetchOwner();
    assert.equal(response.status,200);
    const missing=await response.json();
    assert.equal(missing.availability,'not_connected');
    assert.equal(missing.verified_passes,0);
    assert.equal(missing.monitoring_only,true);
    response=await fetchOwner({method:'POST',body:'{}'});
    assert.equal(response.status,405);
    assert.equal((await response.json()).error.code,'MONITOR_ONLY');
    const current = new Date().toISOString();
    const probes=await runFunctionalChecks({clock:()=>current});
    await writeFunctionalSnapshot(directory,probes,current);
    const recorded=await (await fetchOwner()).json();
    assert.equal(recorded.availability,'recorded');
    assert.equal(recorded.verified_passes,0,'missing browser cannot generate a passing claim');
    assert.equal(recorded.unchecked,4);
    assert.equal(recorded.results.length,4);
    response=await fetch(runtime.origin+'/runtime/functional-panel.js',{headers:{cookie}});
    assert.equal(response.status,200);
    assert.match(await response.text(),/browser tool checks|Browser-level tool checks/i);
    response=await fetch(runtime.origin+'/admin/',{headers:{cookie}});
    assert.equal(response.status,200);
    assert.match(await response.text(),/\/runtime\/functional-panel\.js/);
  } finally {
    if (runtime) await runtime.close();
    await rm(directory,{recursive:true,force:true});
  }
});
