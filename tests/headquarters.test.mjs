import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { DatabaseSync } from 'node:sqlite';
const source = async path => readFile(new URL(path, import.meta.url), 'utf8');
const dataUrl = code => 'data:text/javascript;base64,' + Buffer.from(stripTypeScriptTypes(code)).toString('base64');
const authUrl = dataUrl(await source('../functions/_lib/admin-auth.ts'));
const domainUrl = dataUrl((await source('../functions/_lib/headquarters.ts')).replace('"./admin-auth"', JSON.stringify(authUrl)));
const routeUrl = dataUrl((await source('../functions/api/admin/headquarters.ts')).replace('"../../_lib/admin-auth"', JSON.stringify(authUrl)).replace('"../../_lib/headquarters"', JSON.stringify(domainUrl)));
const { onRequestGet, onRequestPost, onRequestPatch } = await import(routeUrl);
const { validMission, readBoundedJson } = await import(domainUrl);
const key = await crypto.subtle.generateKey({ name:'RSASSA-PKCS1-v1_5', modulusLength:2048, publicExponent:new Uint8Array([1,0,1]), hash:'SHA-256' },true,['sign','verify']);
const jwk = await crypto.subtle.exportKey('jwk',key.publicKey); jwk.kid='test';
const encode = x => Buffer.from(JSON.stringify(x)).toString('base64url');
async function token(extra={}) {
  const head = encode({alg:'RS256',kid:'test'}), payload = encode({iss:'https://hq-test.cloudflareaccess.com',aud:['hq-test'],exp:Math.floor(Date.now()/1000)+300,email:'owner@example.com',...extra});
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5',key.privateKey,new TextEncoder().encode(head+'.'+payload));
  return head+'.'+payload+'.'+Buffer.from(signature).toString('base64url');
}
const jwt = await token();
const db = new DatabaseSync(':memory:');
db.exec(await source('../migrations/0010_agentic_os_foundation.sql'));
db.exec(await source('../migrations/0011_headquarters_audit.sql'));
const adapter = { prepare(sql) { let values=[]; const item={bind(...v){values=v;return item;},async first(){return db.prepare(sql).get(...values)||null;},async all(){return {results:db.prepare(sql).all(...values),success:true};},async run(){const r=db.prepare(sql).run(...values);return {success:true,meta:{changes:Number(r.changes)}};}};return item;}};
const env = {DB:adapter,CF_ACCESS_TEAM_DOMAIN:'hq-test.cloudflareaccess.com',CF_ACCESS_AUD:'hq-test',ADMIN_ALLOWED_EMAILS:'owner@example.com',ADMIN_CI_SERVICE_TOKEN_IDS:'test-ci'};
function context(method,body,headers={}) { return {env,request:new Request('https://hq.example.com/api/admin/headquarters',{method,headers:{'cf-access-jwt-assertion':jwt,origin:'https://hq.example.com','content-type':'application/json',...headers},body:body===undefined?undefined:JSON.stringify(body)})}; }
const mission = {job_id:crypto.randomUUID(),title:'Verify headquarters',request_summary:'Verify persistence, audit records and permission boundaries.',agent_id:'engineering-lead',priority:'high'};
test('headquarters authenticated lifecycle, replay, conflict, cancellation and representation',async()=>{
  const originalFetch=globalThis.fetch;
  globalThis.fetch=async url=>{assert.equal(url,'https://hq-test.cloudflareaccess.com/cdn-cgi/access/certs');return Response.json({keys:[jwk]});};
  try {
    assert.equal((await onRequestGet(context('GET',undefined,{'cf-access-jwt-assertion':''}))).status,401);
    assert.equal((await onRequestPost(context('POST',mission,{origin:'https://evil.example'}))).status,403);
    const ci=await token({email:undefined,sub:'',common_name:'test-ci',service_token_status:true});
    assert.equal((await onRequestPost(context('POST',mission,{'cf-access-jwt-assertion':ci}))).status,403);
    assert.equal((await onRequestPost(context('POST',mission))).status,201);
    assert.equal((await onRequestPost(context('POST',mission))).status,200);
    assert.equal((await onRequestPost(context('POST',{...mission,title:'Another mission'}))).status,409);
    const snapshot=await (await onRequestGet(context('GET'))).json();
    assert.equal(snapshot.departments.length,9);
    assert.equal(snapshot.specialists.filter(a=>a.enabled).length,0);
    assert.equal(snapshot.missions.length,1);
    assert.equal(snapshot.events.length,1);
    const markdown=await onRequestGet(context('GET',undefined,{accept:'text/markdown'}));
    assert.match(markdown.headers.get('content-type'),/text\/markdown/);
    assert.match(await markdown.text(),/Verify headquarters/);
    const patch={job_id:mission.job_id,action:'cancel',expected_updated_at:snapshot.missions[0].updated_at};
    assert.equal((await onRequestPatch(context('PATCH',{...patch,expected_updated_at:'stale'}))).status,409);
    assert.equal((await onRequestPatch(context('PATCH',patch))).status,200);
    assert.equal((await onRequestPatch(context('PATCH',patch))).status,409);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM agent_job_events').get().n,2);
    assert.equal(db.prepare('SELECT status FROM agent_jobs').get().status,'cancelled');
  } finally {globalThis.fetch=originalFetch;db.close();}
});
test('rejects malformed and oversized mission payloads',async()=>{
  assert.equal(validMission(mission),true);
  for(const bad of [null,{}, {...mission,priority:'root'}, {...mission,title:'x'}, {...mission,request_summary:'x'.repeat(4001)}]) assert.equal(validMission(bad),false);
  await assert.rejects(readBoundedJson(new Request('https://example.com',{method:'POST',body:'x'.repeat(24001)})),/24 KB/);
});
