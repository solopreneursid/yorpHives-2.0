import test from 'node:test';
import assert from 'node:assert/strict';
import {
 LIVE_WEBSITE_TARGETS,checkLiveWebsiteTarget,runLiveWebsiteSnapshot
} from '../admin-monitor/live-website-evidence.js';

const origin='https://yorphives.com';
const registry={schema_version:1,source:'yorphives-website',count:2,
 tools:[{slug:'json-formatter',name:'JSON Formatter',category:'text',public_url:'/free-tools/json-formatter/'},
  {slug:'merge-pdf',name:'Merge PDF',category:'pdf',public_url:'/free-tools/merge-pdf/'}]};
const capability={schema_version:1,source:'yorphives-website',
 canonical_origin:origin,agentic_internet_model:'readable-discoverable-callable-payable',
 payable:{status:'not_enabled'},callable:{remote_mcp:{status:'not_published'},
  server_side_product_execution:{status:'not_published'},
  browser_local_webmcp:{tools:[]}},
 agent_identity:{web_bot_auth_verification_implemented:false}};
const xml=(host='yorphives.com')=>`<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://${host}/</loc></url><url><loc>https://${host}/free-tools/</loc></url></urlset>`;
const respond=(path)=>{
 if(['/', '/free-tools/','/free-tools/file-studio/'].includes(path))
  return new Response('<!doctype html><html><body>Page</body></html>',
   {status:200,headers:{'content-type':'text/html; charset=utf-8'}});
 if(['/api/v1/free-tools','/free-tools/manifest.json'].includes(path))
  return new Response(JSON.stringify(registry),{status:200,headers:{'content-type':'application/json'}});
 if(path==='/api/v1/agent-capabilities')
  return new Response(JSON.stringify(capability),{status:200,headers:{'content-type':'application/json'}});
 if(path==='/llms.txt')return new Response('# YorpHives\nReal public index\n',{headers:{'content-type':'text/plain'}});
 if(path==='/openapi.yaml')return new Response('openapi: 3.1.0\ninfo:\n  title: YorpHives\n',
  {headers:{'content-type':'text/yaml'}});
 if(path==='/sitemap.xml')return new Response(xml(),{headers:{'content-type':'application/xml'}});
 throw Error('Unexpected path: '+path);
};
function source(responder=respond){
 const visited=[];
 const fetcher=async(url,opts)=>{
  assert.equal(new URL(url).origin,origin);
  assert.equal(opts.method,'GET');
  assert.equal(opts.redirect,'manual');
  assert.equal(opts.cache,'no-store');
  assert.equal(opts.headers.authorization,undefined);
  visited.push(new URL(url).pathname);
  return responder(new URL(url).pathname);
 };
 return {fetcher,visited};
}

test('nine fixed first-party targets produce verified documents, pages only reachable, never actual feature verification',async()=>{
 const r=source();
 const snapshot=await runLiveWebsiteSnapshot({fetcher:r.fetcher});
 assert.equal(r.visited.length,9);
 assert.deepEqual(new Set(r.visited),new Set(LIVE_WEBSITE_TARGETS.map(t=>t.path)));
 assert.equal(snapshot.schema_version,1);
 assert.equal(snapshot.source,'live_public_website_get_only');
 assert.equal(snapshot.monitor_only,true);
 assert.equal(snapshot.production_deployment_authorized,false);
 assert.equal(snapshot.background_watchdog_installed,false);
 assert.equal(snapshot.stores_evidence,false);
 assert.equal(snapshot.tests.endpoint_validated,6);
 assert.equal(snapshot.tests.page_reachable_only,3);
 assert.equal(snapshot.tests.full_functional_browser_checks,0);
 assert.equal(snapshot.tests.degraded,0);
 assert.equal(snapshot.site_tool_count_verified,2);
 assert.equal(snapshot.catalogue_consistency,'verified');
 assert.equal(snapshot.integrations.first_party_revenue.state,'not_connected');
 assert.equal(snapshot.integrations.market_research.state,'not_connected');
 assert.equal(snapshot.integrations.independent_watchdog.state,'not_connected');
 assert.ok(snapshot.observations.every(x=>!Object.hasOwn(x,'_slug_set')));
});

test('HTTP 200 HTML fallback for expected JSON is degraded, never healthy',async()=>{
 const t=LIVE_WEBSITE_TARGETS.find(x=>x.id==='free-tools-api');
 const fake=source(path=>new Response('<!doctype html><html></html>',{
  status:200,headers:{'content-type':'text/html'}
 }));
 const r=await checkLiveWebsiteTarget(t,{fetcher:fake.fetcher});
 assert.deepEqual([r.state,r.reason,r.http_status],['degraded','not_json',200]);
 assert.equal(r.tool_count,null);
});

test('missing optional discovery is a coverage gap and never invents tool count zero',async()=>{
 const r=source(path=>{
  if(['/api/v1/free-tools','/free-tools/manifest.json','/api/v1/agent-capabilities','/llms.txt','/openapi.yaml'].includes(path))
   return new Response('Missing',{status:404});
  return respond(path);
 });
 const snapshot=await runLiveWebsiteSnapshot({fetcher:r.fetcher});
 assert.equal(snapshot.tests.not_published,5);
 assert.equal(snapshot.site_tool_count_verified,null);
 assert.equal(snapshot.catalogue_consistency,'unverified');
 assert.equal(snapshot.tests.endpoint_validated,1);
});

test('two valid JSON catalogues that disagree do not establish verified product count',async()=>{
 const fake=source(path=>{
  if(path==='/free-tools/manifest.json')
   return new Response(JSON.stringify({...registry,count:1,tools:registry.tools.slice(0,1)}),
    {headers:{'content-type':'application/json'}});
  return respond(path);
 });
 const r=await runLiveWebsiteSnapshot({fetcher:fake.fetcher});
 assert.equal(r.catalogue_consistency,'mismatch');
 assert.equal(r.site_tool_count_verified,null);
});

test('legacy sitemap domain yields actionable warning, not third-party trust',async()=>{
 const t=LIVE_WEBSITE_TARGETS.find(x=>x.id==='sitemap');
 const fake=source(()=>new Response(xml('yorphives.pages.dev'),{
  headers:{'content-type':'application/xml'}
 }));
 const r=await checkLiveWebsiteTarget(t,{fetcher:fake.fetcher});
 assert.equal(r.state,'degraded');
 assert.equal(r.reason,'legacy_sitemap_domain');
 assert.equal(r.document_count,2);
 assert.equal(r.website_uses_legacy_sitemap_host,true);
 const third=source(()=>new Response(xml('attacker.example'),{
  headers:{'content-type':'application/xml'}
 }));
 const reject=await checkLiveWebsiteTarget(t,{fetcher:third.fetcher});
 assert.equal(reject.state,'degraded');
 assert.equal(reject.reason,'sitemap_contains_untrusted_origin');
});

test('HTML-as-OpenAPI, false paid agent metadata, oversized content and 302 redirects are never healthy',async()=>{
 const openapi=LIVE_WEBSITE_TARGETS.find(x=>x.id==='openapi-document');
 const yaml=await checkLiveWebsiteTarget(openapi,{fetcher:source(()=>new Response('<html/>',{
  headers:{'content-type':'text/html'}
 })).fetcher});
 assert.deepEqual([yaml.state,yaml.reason],['degraded','invalid_openapi']);

 const agent=LIVE_WEBSITE_TARGETS.find(x=>x.id==='agent-capabilities');
 const badAgent=await checkLiveWebsiteTarget(agent,{fetcher:source(()=>new Response(JSON.stringify({
   ...capability,payable:{status:'available'}
 }),{headers:{'content-type':'application/json'}})).fetcher});
 assert.deepEqual([badAgent.state,badAgent.reason],['degraded','agent_capabilities_unverified']);

 const tools=LIVE_WEBSITE_TARGETS.find(x=>x.id==='free-tools-api');
 const big=await checkLiveWebsiteTarget(tools,{fetcher:source(()=>
  new Response(JSON.stringify(registry),{headers:{
   'content-type':'application/json','content-length':'999999'
  }})
 ).fetcher});
 assert.equal(big.reason,'response_too_large');
 const redirected=await checkLiveWebsiteTarget(tools,{fetcher:source(()=>new Response(null,{
  status:302,headers:{location:'https://attacker.example'}
 })).fetcher});
 assert.equal(redirected.state,'unavailable');
 assert.equal(redirected.reason,'redirect_requires_review');
});

test('only the frozen target objects are callable, no user-selected SSRF',async()=>{
 const fake={...LIVE_WEBSITE_TARGETS[0],path:'https://evil.example/internal'};
 await assert.rejects(checkLiveWebsiteTarget(fake,{fetcher:async()=>{throw Error('Never fetched');}}),
  /fixed approved website probe/);
});
