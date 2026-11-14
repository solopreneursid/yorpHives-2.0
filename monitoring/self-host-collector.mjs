/**
 * Independent self-hostable Node 24+ collector.
 * Portability alternative to the optional Cloudflare scheduled Worker.
 *
 * It uses a NEW private SQLite database, never the running HQ DB, GitHub,
 * Cloudflare account, model, payments, credentials or production filesystem.
 * Can be supervised by systemd or any open-source process manager.
 */
import {DatabaseSync} from 'node:sqlite';
import {readFile,chmod,lstat,mkdir} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {runLiveWebsiteSnapshot} from '../admin-monitor/live-website-evidence.js';
import {persistMonitoringSnapshot,auditPublicSecurityHeaders}
 from './staging-watchdog.worker.mjs';
import {collectTechnologyCandidates,storeTechnologyCandidates}
 from './open-technology-radar.mjs';
import {collectMarketCandidates,storeMarketCandidates}
 from './market-demand-sources.mjs';
import {createLocalYorpMindModel} from './yorpmind-local-model.mjs';
import {runYorpMindAnalysisCycle} from './yorpmind-os.mjs';

const root=dirname(fileURLToPath(import.meta.url));
const DEFAULT_DATABASE=resolve(root,'private-data/monitor-evidence.sqlite');
const MAX_INTERVAL=3600000;
function validatePath(path){
 if(typeof path!=='string'||!path.startsWith('/')||
   path.includes('\0')||!path.endsWith('.sqlite')||
   /\/\.\.?(?:\/|$)/.test(path))
  throw Error('Collector evidence database must be an absolute private SQLite path');
 return path;
}
export async function openPrivateEvidenceDatabase({
 path=DEFAULT_DATABASE,read=readFile,dbFactory=p=>new DatabaseSync(p)
}={}){
 const target=validatePath(path),folder=dirname(target);
 await mkdir(folder,{recursive:true,mode:0o700});
 const dir=await lstat(folder);
 if(!dir.isDirectory()||dir.isSymbolicLink()||(dir.mode&0o077))
  throw Error('Refusing non-private monitoring evidence directory');
 let existing;
 try{existing=await lstat(target);}catch(e){if(e.code!=='ENOENT')throw e;}
 if(existing&&(!existing.isFile()||existing.isSymbolicLink()||
   (existing.mode&0o077)))throw Error('Refusing unsafe monitoring SQLite file');
 const db=dbFactory(target);
 try{
  await chmod(target,0o600);
  const schema=await read(resolve(root,'../staging/monitor-only-schema-v1.sql'),'utf8');
  db.exec(schema);
  const agentSchema=await read(resolve(root,'../staging/yorpmind-readonly-os-v2.sql'),'utf8');
  db.exec(agentSchema);
 }catch(e){db.close();throw e;}
 const adapter={prepare(sql){
  const stmt=db.prepare(sql);
  return{bind(...values){
   return{async run(){const meta=stmt.run(...values);return{meta:{changes:meta.changes}};},
    async all(){return{results:stmt.all(...values)};},
    async first(){return stmt.get(...values)||null;}};
  }};
 }};
 return{adapter,close:()=>db.close(),path:target};
}
export async function runStandaloneCycle(adapter,{
 fetcher=globalThis.fetch,clock=()=>new Date().toISOString()
}={}){
 const snapshot=await runLiveWebsiteSnapshot({fetcher,clock});
 const outcome=await persistMonitoringSnapshot(adapter,snapshot,{clock});
 // Header check is advisory only and failure cannot erase a website receipt.
 let header={status:'unavailable'};
 try{header=await auditPublicSecurityHeaders(adapter,{fetcher,clock});}catch{}
 return {source:'selfhost_independent_watchdog',observed_at:clock(),
  observations:outcome.observations_written,header_advisory:header.status,
  production_modified:false};
}
export async function runStandaloneRadar(adapter,{fetcher=globalThis.fetch}={}){
 const feeds=await collectTechnologyCandidates({fetcher});
 const technology=await storeTechnologyCandidates(adapter,feeds);
 const discussions=await collectMarketCandidates({fetcher});
 const market=await storeMarketCandidates(adapter,discussions);
 return{technology,market,verified_market_demand:false,verified_revenue:false};
}
export async function runStandaloneYorpMind(adapter,{
 endpoint,modelName,fetcher=globalThis.fetch,clock=()=>new Date().toISOString()
}={}){
 if(!endpoint||!modelName)
  return{source:'private_open_weight_analyst_organization',status:'unconfigured',
   model_calls:0,employees_running:0,production_execution_enabled:false};
 const infer=createLocalYorpMindModel({endpoint,modelName,fetcher});
 return runYorpMindAnalysisCycle(adapter,{infer,clock,maxCalls:6});
}
async function main(){
 const interval=Number(process.env.HQ_WATCHDOG_INTERVAL_MS||300000);
 if(!Number.isSafeInteger(interval)||interval<60000||interval>MAX_INTERVAL)
  throw Error('Collector interval must be 60000–3600000 ms');
 const db=await openPrivateEvidenceDatabase({
  path:process.env.HQ_WATCHDOG_DB_PATH||DEFAULT_DATABASE});
 let stopping=false,busy=false,lastRadarDate='',lastModelBlock='';
 async function poll(){
  if(stopping||busy)return;
  busy=true;
  try{
   const result=await runStandaloneCycle(db.adapter);
   console.log(JSON.stringify({event:'monitor_heartbeat',at:result.observed_at,
    observations:result.observations,production_modified:false}));
   const now=new Date();
   const today=now.toISOString().slice(0,10);
   if(now.getUTCHours()===2&&lastRadarDate!==today){
    const findings=await runStandaloneRadar(db.adapter);
    lastRadarDate=today;
    console.log(JSON.stringify({event:'research_source_scan',
     technology_candidates:findings.technology.candidate_count,
     product_discussion_candidates:findings.market.total,
     unverified_market_demand:true,verified_revenue:false}));
   }
   // Private AI specialists only run when an explicit local open-weight
   // model is configured. Never substitute paid or Cloudflare AI endpoints.
   const block=new Date().toISOString().slice(0,10)+'-'+Math.floor(new Date().getUTCHours()/6);
   if(lastModelBlock!==block&&process.env.HQ_YORPMIND_MODEL_URL&&
      process.env.HQ_YORPMIND_MODEL_NAME){
    const analysis=await runStandaloneYorpMind(db.adapter,{
     endpoint:process.env.HQ_YORPMIND_MODEL_URL,
     modelName:process.env.HQ_YORPMIND_MODEL_NAME});
    lastModelBlock=block;
    console.log(JSON.stringify({event:'yorpmind_agent_organization',
     model_calls:analysis.model_calls,briefs_created:analysis.briefs_created,
     agent_failures:analysis.failed,insufficient_evidence:analysis.insufficient_evidence,
     execution_authorized:false}));
   }
  }catch{console.error(JSON.stringify({event:'monitor_failed',production_modified:false}));}
  finally{busy=false;}
 }
 await poll();
 const timer=setInterval(()=>{void poll();},interval);
 for(const signal of ['SIGTERM','SIGINT'])process.once(signal,()=>{
  stopping=true;clearInterval(timer);if(!busy)db.close();
 });
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url))
 await main();
