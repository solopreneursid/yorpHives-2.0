import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {persistMonitoringSnapshot,auditPublicSecurityHeaders}
 from '../monitoring/staging-watchdog.worker.mjs';
import {parseTechnologyFeed,collectTechnologyCandidates,storeTechnologyCandidates,
 TECHNOLOGY_FEEDS} from '../monitoring/open-technology-radar.mjs';
import {LIVE_WEBSITE_TARGETS} from '../admin-monitor/live-website-evidence.js';

const schema=readFileSync(new URL('../staging/monitor-only-schema-v1.sql',import.meta.url),'utf8');
function database(){
 const engine=new DatabaseSync(':memory:');engine.exec(schema);
 const queries=[];
 const db={prepare(sql){
  assert.match(sql,/^(?:SELECT|INSERT|UPDATE|DELETE)\b/i);
  assert.doesNotMatch(sql,/(?:ALTER|DROP|CREATE|ATTACH|DETACH|PRAGMA|REPAIR|GITHUB|PUBLISH)/i);
  queries.push(sql);
  const stmt=engine.prepare(sql);
  return{bind(...args){return {
   async run(){const x=stmt.run(...args);return {meta:{changes:x.changes}};},
   async all(){return {results:stmt.all(...args)};},
   async first(){return stmt.get(...args)||null;}
  }}};
 }};
 return{db,engine,queries,close(){engine.close();}};
}
const checked='2026-11-14T09:00:00.000Z';
const fakeSnapshot=()=>({
 source:'live_public_website_get_only',environment:'isolated_preview_only',
 monitor_only:true,production_deployment_authorized:false,
 observations:LIVE_WEBSITE_TARGETS.map((t,i)=>({
  id:t.id,title:t.title,url:'https://yorphives.com'+t.path,
  kind:t.kind,state:i===3?'degraded':i===4?'not_published':i<3?'reachable':'verified',
  http_status:i===4?404:200,reason:i===3?'not_json':i===4?'not_published':'valid_document'
 }))
});
const get=(d,sql)=>d.engine.prepare(sql).all();

test('independent cron persists all nine verified-route evidence records into only staged monitoring tables',async()=>{
 const x=database();
 try{
  const report=await persistMonitoringSnapshot(x.db,fakeSnapshot(),{clock:()=>checked});
  assert.equal(report.observations_written,9);
  assert.equal(report.review_items_found,2);
  assert.equal(report.production_modified,false);
  assert.equal(report.github_writes,false);
  const runs=get(x,'SELECT * FROM monitor_observation_runs');
  assert.equal(runs.length,1);
  assert.equal(runs[0].collector,'external-watchdog');
  assert.equal(runs[0].status,'completed');
  assert.equal(get(x,'SELECT * FROM monitor_observations').length,9);
  assert.equal(get(x,'SELECT * FROM monitor_targets').length,9);
  const signals=get(x,'SELECT * FROM monitor_signals');
  assert.equal(signals.length,2);
  assert.ok(signals.every(s=>s.state==='unreviewed'));
  assert.ok(signals.every(s=>s.founder_action.includes('independently')));
  assert.equal(x.queries.some(q=>/UPDATE monitor_signals|DELETE FROM monitor_signals/.test(q)),false);
 }finally{x.close();}
});
test('repeat checks create a history, but do not flood founder review signals',async()=>{
 const x=database();
 try{
  await persistMonitoringSnapshot(x.db,fakeSnapshot(),{clock:()=>checked});
  await persistMonitoringSnapshot(x.db,fakeSnapshot(),{clock:()=>new Date(Date.parse(checked)+300000).toISOString()});
  assert.equal(get(x,'SELECT COUNT(*) n FROM monitor_observation_runs')[0].n,2);
  assert.equal(get(x,'SELECT COUNT(*) n FROM monitor_observations')[0].n,18);
  assert.equal(get(x,'SELECT COUNT(*) n FROM monitor_signals')[0].n,2);
  assert.equal(get(x,'SELECT COUNT(*) n FROM monitor_targets')[0].n,9);
 }finally{x.close();}
});
test('any spoofed URL, extra target, wrong DB contract or production authority is refused before write',async()=>{
 const x=database();
 try{
  for(const snapshot of [
   {...fakeSnapshot(),production_deployment_authorized:true},
   {...fakeSnapshot(),observations:fakeSnapshot().observations.slice(1)},
   {...fakeSnapshot(),observations:fakeSnapshot().observations.map((y,i)=>i===1?
     {...y,url:'https://example.com/secret'}:y)}
  ]){
   await assert.rejects(persistMonitoringSnapshot(x.db,snapshot),/Unsafe|Invalid/);
  }
  assert.equal(get(x,'SELECT COUNT(*) n FROM monitor_observation_runs')[0].n,0);
 }finally{x.close();}
});
test('advisory HTTP header inspection never claims exploitable vulnerability',async()=>{
 const x=database();
 try{
  const result=await auditPublicSecurityHeaders(x.db,{
   fetcher:async(url,options)=>{
    assert.equal(url,'https://yorphives.com/');
    assert.equal(options.method,'HEAD');
    assert.equal(options.redirect,'manual');
    return new Response(null,{status:200,headers:{}});
   },clock:()=>checked
  });
  assert.equal(result.status,'review');
  assert.equal(result.reason,'hsts_header_missing');
  assert.equal(result.verified_vulnerability,false);
  assert.equal(get(x,'SELECT category FROM monitor_signals')[0].category,'security');
 }finally{x.close();}
});
const feedXml='<?xml version="1.0"?><rss><channel>'+
 '<item><title>New Agents and MCP security controls</title><link>https://developers.cloudflare.com/changelog/2026-11-10-agents/</link></item>'+
 '<item><title>Cloud platform features</title><link>https://attacker.example/escape</link></item>'+
 '</channel></rss>';
test('fixed public RSS adapter validates actual source and stores transparent technology candidates once',async()=>{
 const parsed=parseTechnologyFeed(feedXml,TECHNOLOGY_FEEDS[0]);
 assert.equal(parsed.length,1);
 assert.equal(parsed[0].hypothesis_only,true);
 assert.equal(parsed[0].source,'https://developers.cloudflare.com/changelog/2026-11-10-agents/');
 const x=database();
 try{
  const report={source:'fixed_public_changelog_feeds',candidates:parsed,failed_sources:[]};
  const first=await storeTechnologyCandidates(x.db,report,{clock:()=>checked});
  const second=await storeTechnologyCandidates(x.db,report,{clock:()=>checked});
  assert.equal(first.newly_seen,1);
  assert.equal(second.newly_seen,0);
  const s=get(x,'SELECT * FROM monitor_signals');
  assert.equal(s.length,1);
  assert.equal(s[0].state,'unreviewed');
  assert.match(s[0].title,/Research candidate/);
  assert.match(s[0].founder_action,/verify customer demand/i);
 }finally{x.close();}
});
test('RSS network faults are explicitly missing evidence, not market opportunity',async()=>{
 const list=await collectTechnologyCandidates({
  fetcher:async()=>{throw Error('offline');}
 });
 assert.equal(list.candidates.length,0);
 assert.equal(list.failed_sources.length,2);
 assert.equal(list.validated_market_demand,false);
 assert.equal(list.revenue_verified,false);
});
test('watchdog has no HTTP control plane',async()=>{
 const worker=(await import('../monitoring/staging-watchdog.worker.mjs')).default;
 const res=await worker.fetch(new Request('https://example.test/attempt-live'));
 assert.equal(res.status,404);
 assert.equal((await res.text()),'Not found');
});
