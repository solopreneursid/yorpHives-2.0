import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';

const raw=await readFile(new URL('../functions/api/admin/live-website-v3.ts',import.meta.url),'utf8');
const auth=[
 "export const adminJson=(data,status=200)=>Response.json(data,{status,headers:{'cache-control':'no-store'}});",
 "export const isAdminResponse=x=>x instanceof Response;",
 "export const requireAdmin=async c=>{const token=c.request.headers.get('x-test-identity');return token==='owner'?{email:'owner-test@invalid.example',serviceToken:false}:token==='service'?{email:'service-test@invalid.example',serviceToken:true}:new Response('Unauthorized',{status:401});};"
].join('\n');
const evidence=[
 "export const runLiveWebsiteSnapshot=async()=>({schema_version:1,source:'live_public_website_get_only',monitor_only:true,production_deployment_authorized:false,observations:[{id:'website-home',state:'reachable'}]});"
].join('\n');
const encoded=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64');
let moduleSource=stripTypeScriptTypes(raw);
const oldAuth=/from ["']\.\.\/\.\.\/_lib\/admin-auth["']/;
const oldProbe=/from ["']\.\.\/\.\.\/\.\.\/admin-monitor\/live-website-evidence\.js["']/;
assert.match(moduleSource,oldAuth);
assert.match(moduleSource,oldProbe);
moduleSource=moduleSource.replace(oldAuth,'from '+JSON.stringify(encoded(auth)));
moduleSource=moduleSource.replace(oldProbe,'from '+JSON.stringify(encoded(evidence)));
const route=await import(encoded(moduleSource));
const ctx=({token='owner',mode='staging'}={})=>({
 request:new Request('https://admin-staging.yorphives.com/api/admin/live-website-v3',
  {headers:{'x-test-identity':token}}),
 env:{HQ_MONITOR_V3_MODE:mode}
});

test('live website route requires owner JWT before a public probe runs',async()=>{
 assert.equal((await route.onRequestGet(ctx({token:'anonymous'}))).status,401);
 assert.equal((await route.onRequestGet(ctx({token:'service'}))).status,403);
});

test('old canonical runtime cannot query live monitoring; missing preview opt-in fails closed',async()=>{
 const res=await route.onRequestGet(ctx({mode:'production'}));
 assert.equal(res.status,503);
 assert.equal((await res.json()).production_deployment_authorized,false);
});

test('owner, isolated staging only: read-only GET evidence, no-cache and no deployment grant',async()=>{
 const res=await route.onRequestGet(ctx());
 assert.equal(res.status,200);
 assert.match(res.headers.get('content-type'),/^application\/json/);
 assert.match(res.headers.get('cache-control'),/no-store/);
 const obj=await res.json();
 assert.equal(obj.monitor_only,true);
 assert.equal(obj.source,'live_public_website_get_only');
 assert.equal(obj.production_deployment_authorized,false);
 assert.equal(obj.observations[0].state,'reachable');
});

test('UI provides actual refresh, filter and tab controls but no write or release route',async()=>{
 const [html,js]=await Promise.all([
  readFile(new URL('../admin-next/index.html',import.meta.url),'utf8'),
  readFile(new URL('../admin-next/app.js',import.meta.url),'utf8')
 ]);
 for(const id of ['run-checks','live-rows','live-view','history-view','opportunities-view',
  'integration-list','catalogue-status','signal-list','tools-count'])
   assert.ok(html.includes('id="'+id+'"'),id);
 assert.match(js,/fetchPrivateJson\('\/api\/admin\/live-website-v3'\)/);
 assert.match(js,/\.addEventListener\('click',runChecks\)/);
 assert.match(js,/\[data-filter\]/);
 assert.match(js,/\[data-view\]/);
 assert.match(js,/method:'GET'/);
 assert.match(js,/credentials:'same-origin'/);
 assert.doesNotMatch(js,/innerHTML|document\.write|location\.href/);
 assert.doesNotMatch(js,/method:\s*['"](?:POST|PUT|PATCH|DELETE)['"]/);
 assert.doesNotMatch(raw,/onRequestPost|onRequestPut|onRequestDelete|\.run\(|\.batch\(|ADMIN_AGENT_SERVICE|github\.com/);
});
