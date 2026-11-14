/**
 * Standalone SCHEDULED staging-only watchdog (Cloudflare adapter).
 *
 * Exact allowed capability set: GET nine public YorpHives website routes and
 * INSERT/UPDATE short evidence records in the physically isolated HQ preview D1.
 * No HTTP administration, repair, GitHub, production D1, email, secrets,
 * Cloudflare API, agent tools, payment, user-provided URLs, or deployment.
 *
 * This Worker MUST have no public route / workers.dev subdomain, and binds
 * ONLY a preview D1 database. The same public evidence source can be run by
 * the future independent self-hosted Node+SQLite adapter.
 */
import {runLiveWebsiteSnapshot,LIVE_WEBSITE_TARGETS} from '../admin-monitor/live-website-evidence.js';
import {collectTechnologyCandidates,storeTechnologyCandidates} from './open-technology-radar.mjs';

const TARGET_KIND=Object.freeze({website:'website',security:'security'});
const MONITOR_SOURCE='hq-staging-independent-watchdog-v1';
const allowedStates=new Set(['verified','degraded','unavailable','reachable','not_published']);
const iso=()=>new Date().toISOString();
const safeId=value=>String(value).replace(/[^a-z0-9-]/gi,'-').slice(0,110);
const statusOf=value=>value==='verified'||value==='reachable'?'verified':
  value==='degraded'?'degraded':value==='unavailable'?'unavailable':'unknown';
const priorityOf=observation=>observation.state==='unavailable'?4:
  observation.state==='degraded'?3:2;
const safeNote=observation=>{
 const reason=String(observation.reason||'unverified').replace(/[^a-z0-9_-]/gi,'').slice(0,90);
 const code=Number.isInteger(observation.http_status)?String(observation.http_status):'none';
 const classification=observation.state==='reachable'?'http_only':
  observation.state==='not_published'?'coverage_gap':'schema_checked';
 return [MONITOR_SOURCE,classification,reason,'HTTP '+code].join(' · ').slice(0,500);
};

/** SQL is an explicit fixed allowlist; no dynamic table or column names. */
export async function persistMonitoringSnapshot(db,snapshot,{clock=iso}={}){
 if(!db?.prepare || snapshot?.source!=='live_public_website_get_only'||
   snapshot?.environment!=='isolated_preview_only'||
   snapshot?.monitor_only!==true||
   snapshot?.production_deployment_authorized!==false||
   !Array.isArray(snapshot.observations)||snapshot.observations.length!==9)
  throw Error('Unsafe or incomplete watchdog evidence');
 const now=clock(),runId='watch-'+crypto.randomUUID();
 const ids=new Set();
 for(const row of snapshot.observations){
  const target=LIVE_WEBSITE_TARGETS.find(t=>t.id===row?.id);
  if(!target||!row||!allowedStates.has(row.state)||
     typeof row.id!=='string'||!/^[-a-z0-9]{4,90}$/.test(row.id)||
     ids.has(row.id)||row.title!==target.title||row.kind!==target.kind||
     row.url!=='https://yorphives.com'+target.path||
     typeof row.reason!=='string'||row.reason.length>100)
    throw Error('Invalid fixed-target watchdog row');
  ids.add(row.id);
 }
 if(ids.size!==LIVE_WEBSITE_TARGETS.length)
  throw Error('Incomplete frozen-target evidence');
 await db.prepare(
  'INSERT INTO monitor_observation_runs (id,started_at,collector,status) VALUES (?,?,?,?)'
 ).bind(runId,now,'external-watchdog','running').run();

 let stored=0,issues=0;
 try{
  for(const row of snapshot.observations){
   const id='watch-target-'+row.id;
   await db.prepare(
    'INSERT OR IGNORE INTO monitor_targets (id,kind,label,public_url,enabled) VALUES (?,?,?,?,?)'
   ).bind(id,TARGET_KIND.website,row.title,row.url,1).run();
   const receipt='watch-receipt-'+crypto.randomUUID();
   await db.prepare(
    'INSERT INTO monitor_observations (id,run_id,target_id,observed_at,status,evidence_kind,note) VALUES (?,?,?,?,?,?,?)'
   ).bind(receipt,runId,id,now,statusOf(row.state),
     row.kind==='catalogue'?'catalogue-consistency':'http-status',safeNote(row)).run();
   stored++;
   if(row.state==='degraded'||row.state==='unavailable'||row.state==='not_published'){
    const kind=row.state==='not_published'?'product':'reliability';
    const priority=row.state==='not_published'?2:priorityOf(row);
    // Deterministic finding IDs suppress repeated alerts every five minutes
    // and never reset a founder's review/dismissal state.
    const signal='watch-signal-'+safeId(row.id)+'-'+safeId(row.reason).slice(0,30);
    const evidenceRef='website:'+row.id+':'+row.reason;
    const title=(row.state==='not_published'?'Missing public agent interface: ': 'Website check needs review: ')+row.title;
    await db.prepare(
     'INSERT OR IGNORE INTO monitor_signals (id,category,state,priority,title,evidence_ref,observed_at,founder_action) VALUES (?,?,?,?,?,?,?,?)'
    ).bind(signal,kind,'unreviewed',priority,title.slice(0,235),
      evidenceRef.slice(0,510),now,
      'Review live evidence and independently approve any website source change; Headquarters cannot repair or publish.').run();
    issues++;
   }
  }
  await db.prepare(
   'UPDATE monitor_observation_runs SET status=?,finished_at=? WHERE id=?'
  ).bind('completed',clock(),runId).run();
  // Rolling privacy-conscious evidence retention; staging only.
  const cutoff=new Date(Date.parse(now)-30*86400000).toISOString();
  await db.prepare('DELETE FROM monitor_observations WHERE observed_at < ?').bind(cutoff).run();
  await db.prepare('DELETE FROM monitor_observation_runs WHERE started_at < ?').bind(cutoff).run();
 }catch(err){
  await db.prepare(
   'UPDATE monitor_observation_runs SET status=?,finished_at=? WHERE id=?'
  ).bind('failed',clock(),runId).run().catch(()=>{});
  throw err;
 }
 return {source:MONITOR_SOURCE,run_id:runId,observations_written:stored,
  review_items_found:issues,production_modified:false,github_writes:false};
}

/** Non-invasive HTTP security-header audit: absence is a review hint, not proof
 * of an exploitable vulnerability. No scanners, fuzzing or invasive probes. */
export async function auditPublicSecurityHeaders(db,{
 fetcher=globalThis.fetch,clock=iso
}={}){
 if(!db?.prepare)throw Error('Read-only header audit needs staging storage');
 let status='unverified',reason='headers_not_verified',http=null;
 try{
  const response=await fetcher('https://yorphives.com/',{
   method:'HEAD',redirect:'manual',cache:'no-store',
   signal:AbortSignal.timeout(5000)
  });
  http=response.status;
  if(http===200){
   if(!response.headers.get('strict-transport-security')){
    status='review';reason='hsts_header_missing';
   }else if(!response.headers.get('x-content-type-options')){
    status='review';reason='nosniff_header_missing';
   }else{status='observed';reason='basic_transport_headers_present';}
  }else reason='header_probe_http_'+http;
  await response.body?.cancel().catch(()=>{});
 }catch{reason='header_probe_unavailable';}
 if(status==='review'){
  const id='security-header-'+reason;
  await db.prepare(
   'INSERT OR IGNORE INTO monitor_signals (id,category,state,priority,title,evidence_ref,observed_at,founder_action) VALUES (?,?,?,?,?,?,?,?)'
  ).bind(id,'security','unreviewed',2,
   reason==='hsts_header_missing'?'Review website HSTS coverage':'Review website nosniff header',
   'website:homepage:'+reason,clock(),
   'Inspect website response headers and security policy; do not treat absence alone as a confirmed exploit.').run();
 }
 return {source:'public_http_header_advisory',status,reason,
  http_status:http,verified_vulnerability:false,production_modified:false};
}

export default {
 async fetch(){return new Response('Not found',{status:404,headers:{'cache-control':'no-store'}});},
 async scheduled(event,env,ctx){
  const task=(async()=>{
   if(!env?.DB?.prepare)throw Error('Isolated watchdog database binding required');
   if(event.cron==='0 2 * * *'){
    const report=await collectTechnologyCandidates();
    const result=await storeTechnologyCandidates(env.DB,report);
    console.log(JSON.stringify({event:'staging-technology-radar',
      candidates:result.candidate_count,unverified_sources:result.source_failures.length}));
   }else if(event.cron==='*/5 * * * *'){
    const snapshot=await runLiveWebsiteSnapshot();
    const outcome=await persistMonitoringSnapshot(env.DB,snapshot);
    const audit=await auditPublicSecurityHeaders(env.DB);
    console.log(JSON.stringify({event:'staging-watchdog-complete',
     observations:outcome.observations_written,review_items:outcome.review_items_found,
     header_advisory:audit.status,production_modified:false}));
   }else throw Error('Unknown cron schedule refused');
  })();
  ctx.waitUntil(task.catch(()=>console.error(JSON.stringify({
   event:'staging-monitoring-schedule-failed',no_production_mutations:true
  }))));
 }
};
