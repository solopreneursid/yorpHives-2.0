(function(){
'use strict';
/* No write endpoints, privilege grants, payment, repair, PR or deploy actions. */
const $=id=>document.getElementById(id);
let latest=null;
let selectedFilter='all';
let isChecking=false;
const views=['live','opportunities','history'];
const statusName={
 verified:'Verified',reachable:'Reachable only',degraded:'Needs review',
 unavailable:'Unavailable',not_published:'Not published'
};
const statusDetail={
 valid_website_tool_contract:'First-party versioned JSON catalogue is valid.',
 http_reachable_only:'HTTP 200 with HTML. Browser functionality not tested.',
 valid_discovery_metadata_only:'Capability status is readable, not proof of agent execution.',
 valid_readable_text_index:'Text discovery file structure confirmed.',
 openapi_discovery_present:'OpenAPI declaration detected (operations not executed).',
 valid_canonical_sitemap:'First-party sitemap points to canonical website.',
 legacy_sitemap_domain:'Sitemap URLs still use old Pages host; needs website release.',
 not_published:'No published endpoint at this path.',
 not_json:'Expected JSON but received another content type (possibly HTML).',
 malformed_json:'JSON response could not be parsed.',
 catalogue_version_or_owner_invalid:'Public metadata does not satisfy version/source/count contract.',
 catalogue_count_inconsistent:'Catalogue contains inconsistent or invalid tool entries.',
 agent_capabilities_unverified:'Agent capability claims are not independently valid.',
 invalid_text_index:'Expected YorpHives text index not present.',
 invalid_openapi:'OpenAPI declaration is missing or returned as HTML.',
 invalid_sitemap_xml:'A valid XML sitemap was not returned.',
 sitemap_contains_untrusted_origin:'Sitemap contains invalid or untrusted origins.',
 redirect_requires_review:'Redirect is not sufficient proof of an API.',
 fetch_or_contract_unavailable:'Provider/network error or unsupported response.',
 response_too_large:'Response exceeded the safe inspection limit.',
 timeout:'Website check exceeded the time limit.'
};
function setText(id,value){$(id).textContent=String(value);}
function prettyTime(timestamp){
 if(!timestamp)return 'Not checked';
 const date=new Date(timestamp);
 return Number.isNaN(date.getTime())?'Unknown time':date.toLocaleString();
}
function renderRows(id,records,toRow,empty){
 const target=$(id);
 target.replaceChildren();
 if(!Array.isArray(records)||records.length===0){target.textContent=empty;return;}
 for(const record of records){
  const data=toRow(record);
  const item=document.createElement('div');item.className='row';
  const label=document.createElement('strong');
  label.textContent=String(data.label||'Unlabeled evidence').slice(0,200);
  const detail=document.createElement('small');
  detail.textContent=String(data.detail||'').slice(0,420);
  item.append(label,detail);target.append(item);
 }
}
function badge(state){
 const b=document.createElement('span');
 b.className='badge status-'+state;
 b.textContent=statusName[state]||'Unverified';
 return b;
}
function acceptsFilter(item){
 if(selectedFilter==='verified')return item.state==='verified';
 if(selectedFilter==='attention')return ['degraded','unavailable'].includes(item.state);
 if(selectedFilter==='coverage')return item.state==='not_published';
 return true;
}
function td(text){
 const node=document.createElement('td');
 node.textContent=String(text??'—');
 return node;
}
function renderLive(){
 if(!latest)return;
 const data=latest;
 const counts=data.tests||{};
 setText('verified-count',counts.endpoint_validated??'—');
 setText('reachable-count',counts.page_reachable_only??'—');
 setText('degraded-count',(counts.degraded??0)+(counts.unavailable??0));
 setText('tools-count',data.site_tool_count_verified===null?'Unverified':data.site_tool_count_verified);
 setText('last-checked','Checked '+prettyTime(data.observed_at));
 setText('catalogue-status',data.catalogue_consistency==='verified'?
  'Free Tools API and manifest agree on the same website-owned slugs. This is a catalogue check, not a functional browser test.':
  data.catalogue_consistency==='mismatch'?
   '⚠️ Free Tools API and manifest disagree. Do not trust the tool inventory until reconciled.':
   'Tool count unverified: both website-owned discovery endpoints must publish matching valid JSON.');
 const body=$('live-rows');body.replaceChildren();
 const rows=(data.observations||[]).filter(acceptsFilter);
 if(!rows.length){const tr=document.createElement('tr'),cell=td('No checks match this filter.');
  cell.colSpan=5;tr.append(cell);body.append(tr);}
 for(const item of rows){
  const tr=document.createElement('tr');
  const first=document.createElement('td');
  const strong=document.createElement('strong');strong.textContent=item.title;
  const small=document.createElement('small');small.textContent=item.url;
  first.append(strong,small);
  const status=document.createElement('td');status.append(badge(item.state));
  const detail=item.detail||statusDetail[item.reason]||
    ('Check result: '+String(item.reason||'not_verified').replace(/_/g,' '));
  const message=td(detail);
  message.className='detail-cell';
  tr.append(first,status,td(item.http_status??'—'),
   td(item.response_ms===null?'—':item.response_ms+' ms'),message);
  body.append(tr);
 }
 const integrations=data.integrations||{};
 const cards=$('integration-list');cards.replaceChildren();
 const labels={
  first_party_revenue:'Revenue & monetization',
  market_research:'Market & opportunity research',
  security_vulnerability_scanner:'Vulnerability scanning',
  independent_watchdog:'Independent 24/7 watchdog'
 };
 for(const [key,title] of Object.entries(labels)){
  const state=integrations[key];
  const card=document.createElement('div');card.className='integration';
  const h=document.createElement('strong');h.textContent=title;
  const chip=badge('not_published');chip.textContent='Not connected';
  const p=document.createElement('small');
  p.textContent=state?.reason||'No verified source has been connected.';
  card.append(h,chip,p);cards.append(card);
 }
}
function selectFilter(value){
 selectedFilter=value;
 for(const button of document.querySelectorAll('[data-filter]')){
  const selected=button.dataset.filter===value;
  button.classList.toggle('selected',selected);
  button.setAttribute('aria-pressed',selected?'true':'false');
 }
 renderLive();
}
function selectView(value){
 if(!views.includes(value))return;
 for(const view of views)$(view+'-view').classList.toggle('hidden',view!==value);
 for(const button of document.querySelectorAll('[data-view]')){
  const selected=button.dataset.view===value;
  button.classList.toggle('is-active',selected);
  button.setAttribute('aria-pressed',selected?'true':'false');
 }
}
async function fetchPrivateJson(path){
 const res=await fetch(path,{
  method:'GET',redirect:'manual',credentials:'same-origin',
  headers:{accept:'application/json'},cache:'no-store',
  signal:AbortSignal.timeout(12000)
 });
 if(res.type==='opaqueredirect'||res.status!==200||
    !/^application\/json\b/i.test(res.headers.get('content-type')||''))
  throw Error('Private monitoring API returned an unverified response.');
 return await res.json();
}
async function runChecks(){
 if(isChecking)return;
 isChecking=true;
 const button=$('run-checks');
 button.disabled=true;
 button.textContent='Checking live site…';
 const notice=$('readiness');
 notice.classList.remove('warn');
 notice.textContent='Reading nine fixed public website endpoints. No website writes are permitted.';
 try{
  const data=await fetchPrivateJson('/api/admin/live-website-v3');
  if(data.schema_version!==1||data.source!=='live_public_website_get_only'||
    data.monitor_only!==true||data.production_deployment_authorized!==false||
    !Array.isArray(data.observations)||data.observations.length!==9)
   throw Error('Invalid evidence contract.');
  latest=data;
  renderLive();
  const failing=(data.tests?.degraded||0)+(data.tests?.unavailable||0);
  const unpublished=data.tests?.not_published||0;
  if(failing||unpublished)notice.classList.add('warn');
  notice.textContent='Live check complete: '+String(data.tests?.endpoint_validated||0)+
   ' validated machine-readable endpoints, '+String(data.tests?.page_reachable_only||0)+
   ' pages reachable only, '+failing+' require review, '+unpublished+
   ' not yet published. These are outside-in checks, not proof of working tools.';
 }catch{
  notice.classList.add('warn');
  notice.textContent='Live website evidence could not be verified. Check Cloudflare Access and the preview API. No production changes occurred.';
  setText('last-checked','Live check unavailable');
 }finally{
  isChecking=false;button.disabled=false;button.textContent='↻ Run live checks';
 }
}
async function loadStagingEvidence(){
 try{
  const data=await fetchPrivateJson('/api/admin/monitor-only-v3');
  if(data.schema_version!==1||data.monitor_only!==true||
    data.source!=='isolated_monitor_schema'||data.environment!=='isolated_preview_only')
   throw Error('Unverified staging schema.');
  for(const [id,name] of [['targets-count','targets'],
   ['observations-count','observations'],['signals-count','signals'],
   ['runs-count','observation_runs']])setText(id,data.counts?.[name]??'—');
  renderRows('target-list',data.targets,x=>({
   label:x.label,detail:x.kind+' · '+(x.enabled?'tracked':'paused')
  }),'No synthetic targets.');
  renderRows('signal-list',data.signals,x=>({
   label:x.title,detail:x.category+' · priority '+x.priority+' · '+x.state
  }),'No staging intelligence examples.');
  renderRows('observation-list',data.observations,x=>({
   label:x.target_id+' · '+x.status,
   detail:x.evidence_kind+' · '+x.observed_at+' · '+(x.note||'')
  }),'No synthetic observations.');
 }catch{
  setText('target-list','Isolated staging evidence unavailable.');
  setText('signal-list','No verified staging research evidence available.');
  setText('observation-list','No verified staging evidence available.');
 }
}
for(const button of document.querySelectorAll('[data-filter]'))
 button.addEventListener('click',()=>selectFilter(button.dataset.filter));
for(const button of document.querySelectorAll('[data-view]'))
 button.addEventListener('click',()=>selectView(button.dataset.view));
$('run-checks').addEventListener('click',runChecks);
selectView('live');
loadStagingEvidence();
runChecks();
// Page-visible refresh only. This is NOT an independent always-on watchdog.
setInterval(()=>{if(document.visibilityState==='visible')runChecks();},120000);
})();
