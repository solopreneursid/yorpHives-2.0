import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectAgentCapabilitiesResponse} from '../self-host/agentic-internet-contract.mjs';
import {watchdogTargets,checkWatchdogTarget} from '../self-host/watchdog.mjs';

const base={
 schema_version:1,source:'yorphives-website',canonical_origin:'https://yorphives.com',
 agentic_internet_model:'readable-discoverable-callable-payable',
 readable:{status:'available',text_index:'/llms.txt'},
 discoverable:{status:'available',catalogue:'/api/v1/free-tools',
  manifest:'/free-tools/manifest.json'},
 callable:{browser_local_webmcp:{status:'experimental-browser-dependent',
   entrypoint:'/free-tools/file-studio/',
   tools:[{slug:'json-formatter',tool_name:'yorphives_format_json',
    execution:'browser_local',requires_browser_webmcp:true,public_url:'/free-tools/json-formatter/'}]},
  remote_mcp:{status:'not_published',endpoint:null},
  server_side_product_execution:{status:'not_published'}},
 payable:{status:'not_enabled',payment_protocols_enabled:[],chargeable_endpoints:0},
 agent_identity:{private_hq_exposed:false,web_bot_auth_verification_implemented:false}
};
const json=o=>JSON.stringify(o);
const copy=()=>structuredClone(base);
const route=watchdogTargets().find(x=>x.id==='website-agent-capabilities');
const options=(body,contentType='application/json',status=200)=>({
 fetcher:async(url,opts)=>{
  assert.equal(url,'https://yorphives.com/api/v1/agent-capabilities');
  assert.equal(opts.method,'GET');
  assert.equal(opts.redirect,'manual');
  assert.equal(opts.headers.authorization,undefined);
  return new Response(body,{status,headers:{'content-type':contentType}});
 },clock:()=>new Date('2026-11-14T06:00:00Z').toISOString()
});

test('Connect 2026 public metadata is a bounded source-owned read-only observation, never payment proof',async()=>{
 const x=inspectAgentCapabilitiesResponse('application/json',json(base));
 assert.equal(x.ok,true);
 assert.equal(x.reason,'agentic_metadata_verified');
 assert.equal(x.capability_count,1);
 assert.equal(x.payment_verified,false);
 assert.equal(x.webmcp_execution_verified,false);
 assert.equal(x.identity_verified,false);
 assert.doesNotMatch(json(x),/json-formatter|yorphives_format_json/);
 const observation=await checkWatchdogTarget(route,options(json(base)));
 assert.deepEqual([observation.state,observation.reason],['reachable','agentic_metadata_verified']);
});
test('not-published optional agent capabilities are not a website outage',async()=>{
 const observation=await checkWatchdogTarget(route,options('not found','text/html',404));
 assert.deepEqual([observation.state,observation.reason],['unavailable','optional_endpoint_missing']);
 assert.equal(route.optional,true);
});
test('a guessed paid flag, remote MCP, or Web Bot Auth claim cannot establish real readiness',async()=>{
 for(const edit of [
  d=>{d.payable.status='enabled';d.payable.chargeable_endpoints=1;},
  d=>{d.callable.remote_mcp.status='available';},
  d=>{d.agent_identity.web_bot_auth_verification_implemented=true;}
 ]){
  const d=copy();edit(d);
  const x=inspectAgentCapabilitiesResponse('application/json',json(d));
  assert.equal(x.ok,false);
  const obs=await checkWatchdogTarget(route,options(json(d)));
  assert.equal(obs.state,'degraded');
 }
});
test('malformed oversized or untrusted capability declarations do not pass',()=>{
 for(const raw of ['','<html>fallback</html>','{}','[]','not json','x'.repeat(65537)]){
  assert.equal(inspectAgentCapabilitiesResponse('application/json',raw).ok,false);
 }
 assert.equal(inspectAgentCapabilitiesResponse('text/html',json(base)).ok,false);
 const x=copy();x.callable.browser_local_webmcp.tools.push(x.callable.browser_local_webmcp.tools[0]);
 assert.equal(inspectAgentCapabilitiesResponse('application/json',json(x)).ok,false);
});
