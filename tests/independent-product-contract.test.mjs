import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectCatalogueResponse, reconcileCatalogueObservations } from '../self-host/catalogue-contract.mjs';
import { watchdogTargets, checkWatchdogTarget } from '../self-host/watchdog.mjs';

const targets=watchdogTargets();
const discovery=targets.find(x=>x.id==='website-discovery');
const manifest=targets.find(x=>x.id==='website-manifest');
const mock=(body, type='application/json',status=200)=>({
 fetcher:async (url,options)=>{
  assert.equal(options.method,'GET');
  assert.equal(options.redirect,'manual');
  assert.ok(options.signal);
  assert.ok(!options.headers.authorization);
  assert.equal(url,'https://yorphives.com/api/v1/free-tools');
  return new Response(body,{status,headers:{'content-type':type}});
 },clock:()=>new Date('2026-11-14T02:00:00Z').toISOString()
});

test('public discovery and manifest probes are fixed bounded GETs, not product write actions',()=>{
 assert.equal(discovery.kind,'catalogue');
 assert.equal(manifest.kind,'manifest');
 assert.equal(manifest.url,'https://yorphives.com/free-tools/manifest.json');
 assert.deepEqual(targets.map(x=>x.id),[
  'headquarters-ready','website-home','website-tools','website-studio','website-discovery','website-manifest'
 ]);
});

test('well-formed nonempty tool lists pass a public API contract, never a full tool workflow',async()=>{
 const x=await checkWatchdogTarget(discovery,mock('{"data":[{"slug":"word-counter"},{"slug":"pdf-tools"}]}'));
 assert.equal(x.state,'reachable');
 assert.equal(x.reason,'catalogue_contract_verified');
 assert.equal(inspectCatalogueResponse('manifest','application/json','[{"slug":"word-counter"}]').ok,true);
});

test('invalid structure, JSON fallback, empty or duplicate catalogues cannot be marked functional',async()=>{
 for(const body of [
  '<html><body>fallback</body></html>',
  '{}','{"data":[]}','{"data":[{"name":"no-slug"}]}',
  '{"data":[{"slug":"repeat"},{"slug":"repeat"}]}',
  '{"data":[{"slug":"../private"}]}','{"data":"not-an-array"}','not-json'
 ]){
  const r=await checkWatchdogTarget(discovery,mock(body));
  assert.equal(r.state,'degraded',body);
  assert.match(r.reason,/^catalogue_contract_(?:invalid|unverified)$/);
 }
 assert.equal((await checkWatchdogTarget(discovery,mock('{"data":[{"slug":"ok"}]}','text/html'))).reason,'catalogue_contract_invalid');
 assert.equal((await checkWatchdogTarget(discovery,mock('x'.repeat(131073)))).reason,'catalogue_contract_too_large');
});

test('unavailable/blocked endpoints are not treated as confirmed product functionality',async()=>{
 const response=await checkWatchdogTarget(discovery,mock('Blocked','text/plain',403));
 assert.equal(response.state,'unavailable');
 assert.equal(response.reason,'optional_endpoint_blocked');
});

test('versioned source-owned catalogue adapter returns deterministic fingerprint, no untrusted payload',()=>{
 const api=inspectCatalogueResponse('catalogue','application/json',JSON.stringify({
  schema_version:1,source:'yorphives-website',count:2,tools:[{slug:'image-resizer'},{slug:'json-formatter'}]
 }));
 const manifest=inspectCatalogueResponse('manifest','application/json',JSON.stringify({
  schema_version:1,source:'yorphives-website',tools:[{slug:'json-formatter'},{slug:'image-resizer'}]
 }));
 assert.equal(api.ok,true);
 assert.equal(api.fingerprint,manifest.fingerprint);
 assert.equal(api.count,2);
 assert.equal(api.contract_version,1);
 assert.equal(reconcileCatalogueObservations(
  {state:'reachable',reason:'catalogue_contract_verified',fingerprint:api.fingerprint},
  {state:'reachable',reason:'catalogue_contract_verified',fingerprint:manifest.fingerprint}
 ),true);
 assert.doesNotMatch(JSON.stringify(api),/data:|tools|description|image-resizer/);
});

test('a valid but inconsistent website catalogue cannot be represented as synchronized',()=>{
 const api=inspectCatalogueResponse('catalogue','application/json',JSON.stringify({data:[{slug:'a'}]}));
 const manifest=inspectCatalogueResponse('manifest','application/json',JSON.stringify([{slug:'b'}]));
 assert.equal(api.ok,true);assert.equal(manifest.ok,true);
 assert.equal(reconcileCatalogueObservations(
  {state:'reachable',reason:'catalogue_contract_verified',fingerprint:api.fingerprint},
  {state:'reachable',reason:'catalogue_contract_verified',fingerprint:manifest.fingerprint}
 ),false);
 assert.equal(inspectCatalogueResponse('catalogue','application/json',JSON.stringify({
  schema_version:2,source:'yorphives-website',tools:[{slug:'a'}]
 })).reason,'catalogue_contract_incompatible');
 assert.equal(inspectCatalogueResponse('catalogue','application/json',JSON.stringify({
  schema_version:1,source:'unauthorized',tools:[{slug:'a'}]
 })).ok,false);
 assert.equal(inspectCatalogueResponse('catalogue','application/json',JSON.stringify({
  schema_version:1,source:'yorphives-website',count:2,tools:[{slug:'a'}]
 })).ok,false);
});

test('missing optional discovery route is not a false production website outage',async()=>{
 const x=await checkWatchdogTarget(discovery,mock('Not Found','text/plain',404));
 assert.equal(x.state,'unavailable');
 assert.equal(x.reason,'optional_endpoint_missing');
 assert.equal(x.http_status,404);
 const studio=targets.find(item=>item.id==='website-studio');
 assert.equal(studio.url,'https://yorphives.com/free-tools/file-studio/');
 assert.equal(studio.optional,false);
});
