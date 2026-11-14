/**
 * Fixed-origin live WEBSITE evidence collector, intentionally independent of
 * Headquarters DB, agents and releases. All checks are outbound GET to exactly
 * nine published yorphives.com paths: no arbitrary URL/SSRF, credentials,
 * body uploads, mutations, provider administration, model execution or repair.
 *
 * This is ON-DEMAND outside-in evidence, NOT a background watchdog, uptime
 * SLA, full security scan, functional browser QA or revenue connector.
 */
import {normalizeWebsiteToolInventory,normalizeWebsiteSitemapUrl}
  from './website-inventory-contract.js';

export const LIVE_WEBSITE_TARGETS=Object.freeze([
  {id:'website-home',title:'Website homepage',path:'/',kind:'html',group:'Website',optional:false},
  {id:'website-tools',title:'Free Tools directory',path:'/free-tools/',kind:'html',group:'Website',optional:false},
  {id:'website-studio',title:'File Studio landing page',path:'/free-tools/file-studio/',kind:'html',group:'Website',optional:false},
  {id:'free-tools-api',title:'Free Tools API',path:'/api/v1/free-tools',kind:'catalogue',group:'Agent discovery',optional:true},
  {id:'free-tools-manifest',title:'Free Tools manifest',path:'/free-tools/manifest.json',kind:'catalogue',group:'Agent discovery',optional:true},
  {id:'agent-capabilities',title:'Agent capability declaration',path:'/api/v1/agent-capabilities',kind:'agent',group:'Agent discovery',optional:true},
  {id:'llms-index',title:'LLM-friendly site index',path:'/llms.txt',kind:'llms',group:'Agent discovery',optional:true},
  {id:'openapi-document',title:'OpenAPI discovery',path:'/openapi.yaml',kind:'openapi',group:'Agent discovery',optional:true},
  {id:'sitemap',title:'Public sitemap',path:'/sitemap.xml',kind:'sitemap',group:'Website',optional:false}
].map(x=>Object.freeze(x)));

const SITE_ORIGIN='https://yorphives.com';
const MAX_BYTES=131072;
const MAX_TEXT=1024;
const MIME={
 html:/^text\/html(?:\s*;|$)/i,
 json:/^application\/(?:json|[a-z0-9.+-]+\+json)(?:\s*;|$)/i,
 xml:/^(?:text|application)\/xml(?:\s*;|$)/i,
 text:/^text\/plain(?:\s*;|$)/i,
 yaml:/^(?:application|text)\/(?:yaml|x-yaml|plain)(?:\s*;|$)/i
};
function safeResult(target,time){
 return {id:target.id,title:target.title,group:target.group,kind:target.kind,
   url:SITE_ORIGIN+target.path,optional:target.optional,
   checked_at:time,state:'unavailable',reason:'not_checked',
   http_status:null,response_ms:null,detail:null,tool_count:null,
   document_count:null,capability_count:null,website_uses_legacy_sitemap_host:false};
}
async function boundedBody(res,max=MAX_BYTES){
 if(!res.body)return '';
 const reader=res.body.getReader();
 const buffer=[];
 let total=0;
 try{
  while(true){
   const {value,done}=await reader.read();
   if(done)break;
   total+=value.byteLength;
   if(total>max)throw Error('response_too_large');
   buffer.push(value);
  }
 }finally{await reader.cancel().catch(()=>{});}
 const combined=new Uint8Array(total);
 let position=0;
 for(const item of buffer){combined.set(item,position);position+=item.byteLength;}
 return new TextDecoder('utf-8',{fatal:true}).decode(combined);
}
function validCatalogue(payload){
 if(!payload||payload.schema_version!==1||
    payload.source!=='yorphives-website'||
    !Number.isSafeInteger(payload.count)||payload.count<1||payload.count>200)
   throw Error('catalogue_version_or_owner_invalid');
 const tools=normalizeWebsiteToolInventory(payload);
 if(tools.length!==payload.count)throw Error('catalogue_count_inconsistent');
 return tools;
}
function schemaResponse(result,type,body){
 if(result.kind==='catalogue'){
  if(!MIME.json.test(type))throw Error('not_json');
  let parsed;
  try{parsed=JSON.parse(body);}catch{throw Error('malformed_json');}
  const tools=validCatalogue(parsed);
  result.state='verified';
  result.reason='valid_website_tool_contract';
  result.tool_count=tools.length;
  // This is a portable exact set comparison, not a claim of functionality.
  return tools.map(t=>t.slug).sort().join(',');
 }
 if(result.kind==='agent'){
  if(!MIME.json.test(type))throw Error('not_json');
  let data;
  try{data=JSON.parse(body);}catch{throw Error('malformed_json');}
  if(data?.schema_version!==1||data?.source!=='yorphives-website'||
    data.canonical_origin!==SITE_ORIGIN||
    data.agentic_internet_model!=='readable-discoverable-callable-payable'||
    data.callable?.remote_mcp?.status!=='not_published'||
    data.callable?.server_side_product_execution?.status!=='not_published'||
    data.payable?.status!=='not_enabled'||
    data.agent_identity?.web_bot_auth_verification_implemented!==false||
    !Array.isArray(data.callable?.browser_local_webmcp?.tools)||
    data.callable.browser_local_webmcp.tools.length>32)
   throw Error('agent_capabilities_unverified');
  result.state='verified';
  result.reason='valid_discovery_metadata_only';
  result.capability_count=data.callable.browser_local_webmcp.tools.length;
  result.detail='Browser WebMCP described as experimental; no remote MCP or payments verified.';
  return null;
 }
 if(result.kind==='llms'){
  if(!MIME.text.test(type)||!/^# YorpHives\b/m.test(body.slice(0,MAX_TEXT)))
   throw Error('invalid_text_index');
  result.state='verified';result.reason='valid_readable_text_index';
  return null;
 }
 if(result.kind==='openapi'){
  if(!MIME.yaml.test(type)||!/^\s*openapi:\s*['"]?3\./m.test(body.slice(0,MAX_TEXT)))
   throw Error('invalid_openapi');
  result.state='verified';result.reason='openapi_discovery_present';
  return null;
 }
 if(result.kind==='sitemap'){
  if(!MIME.xml.test(type)||!/<urlset\b/.test(body.slice(0,MAX_TEXT)))
   throw Error('invalid_sitemap_xml');
  const urls=[...body.matchAll(/<loc>([^<]{1,500})<\/loc>/g)].map(m=>m[1].replace(/&amp;/g,'&'));
  if(!urls.length||urls.length>500)throw Error('sitemap_entries_invalid');
  const normalized=urls.map(normalizeWebsiteSitemapUrl);
  if(normalized.some(x=>!x))throw Error('sitemap_contains_untrusted_origin');
  const legacy=normalized.some(x=>x.legacy_origin);
  result.website_uses_legacy_sitemap_host=legacy;
  result.state=legacy?'degraded':'verified';
  result.reason=legacy?'legacy_sitemap_domain':'valid_canonical_sitemap';
  result.document_count=urls.length;
  if(legacy)result.detail='Sitemap still points to the older Pages domain. Canonical site release remains pending.';
  return null;
 }
 throw Error('unsupported_document_type');
}

/** Single fixed target. Callers cannot supply user-provided URLs. */
export async function checkLiveWebsiteTarget(target,{
 fetcher=globalThis.fetch,clock=()=>new Date().toISOString(),timeoutMs=4500
}={}){
 if(!LIVE_WEBSITE_TARGETS.includes(target))throw Error('Not a fixed approved website probe');
 const result=safeResult(target,clock());
 const started=Date.now();
 let response;
 try{
  response=await fetcher(SITE_ORIGIN+target.path,{
   method:'GET',redirect:'manual',cache:'no-store',
   headers:{accept:target.kind==='html'?'text/html':'*/*'},
   signal:AbortSignal.timeout(timeoutMs)
  });
  result.response_ms=Math.max(0,Date.now()-started);
  result.http_status=response.status;
  if(response.status!==200){
   result.state=target.optional&&[404,410].includes(response.status)?
     'not_published':'unavailable';
   result.reason=result.state==='not_published'?'not_published':
     response.status>=300&&response.status<400?'redirect_requires_review':
     'http_'+response.status;
   return result;
  }
  const type=(response.headers.get('content-type')||'').trim();
  if(target.kind==='html'){
   result.state=MIME.html.test(type)?'reachable':'degraded';
   result.reason=result.state==='reachable'?'http_reachable_only':'html_content_type_invalid';
   result.detail='HTTP 200 and HTML type; interactive page behavior was not tested.';
   return result;
  }
  if(Number(response.headers.get('content-length')||0)>MAX_BYTES)
   throw Error('response_too_large');
  const body=await boundedBody(response);
  result._slug_set=schemaResponse(result,type,body);
  return result;
 }catch(err){
  const code=err?.message;
  result.state='degraded';
  result.reason=[
   'response_too_large','not_json','malformed_json','catalogue_version_or_owner_invalid',
   'catalogue_count_inconsistent','agent_capabilities_unverified','invalid_text_index',
   'invalid_openapi','invalid_sitemap_xml','sitemap_entries_invalid',
   'sitemap_contains_untrusted_origin','unsupported_document_type'
  ].includes(code)?code:
   err?.name==='AbortError'||err?.name==='TimeoutError'?'timeout':'fetch_or_contract_unavailable';
  return result;
 }finally{
  try{await response?.body?.cancel();}catch{}
 }
}

export async function runLiveWebsiteSnapshot({
 fetcher=globalThis.fetch,clock=()=>new Date().toISOString(),timeoutMs=4500
}={}){
 const observations=await Promise.all(LIVE_WEBSITE_TARGETS.map(t=>
   checkLiveWebsiteTarget(t,{fetcher,clock,timeoutMs})));
 const catalogues=observations.filter(x=>
   ['free-tools-api','free-tools-manifest'].includes(x.id));
 const fullyVerified=catalogues.every(x=>x.state==='verified');
 const mismatch=fullyVerified&&catalogues[0]._slug_set!==catalogues[1]._slug_set;
 const same=fullyVerified&&!mismatch;
 // Never turn unverified or missing metadata into a synthetic count of zero.
 const count=same?catalogues[0].tool_count:null;
 const withoutInternal=observations.map(({_slug_set,...rest})=>rest);
 return {
  schema_version:1,source:'live_public_website_get_only',environment:'isolated_preview_only',
  observed_at:clock(),monitor_only:true,production_deployment_authorized:false,
  stores_evidence:false,background_watchdog_installed:false,
  live_websites_queried:1,tests:functionalTruth(withoutInternal),
  site_tool_count_verified:count,
  catalogue_consistency:same?'verified':mismatch?'mismatch':'unverified',
  observations:withoutInternal,
  integrations:{
   first_party_revenue:{state:'not_connected',reason:'No verified read-only revenue connector configured'},
   market_research:{state:'not_connected',reason:'No validated external research feed configured'},
   security_vulnerability_scanner:{state:'not_connected',reason:'No authenticated vulnerability scanner configured'},
   independent_watchdog:{state:'not_connected',reason:'No externally supervised watchdog report connected'}
  }
 };
}
function functionalTruth(rows){
 return {
  endpoint_validated:rows.filter(x=>x.state==='verified').length,
  page_reachable_only:rows.filter(x=>x.state==='reachable').length,
  degraded:rows.filter(x=>x.state==='degraded').length,
  unavailable:rows.filter(x=>x.state==='unavailable').length,
  not_published:rows.filter(x=>x.state==='not_published').length,
  total:rows.length,
  full_functional_browser_checks:0
 };
}
