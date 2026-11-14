import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluatePagesTopology,auditPagesTopology }
 from '../scripts/headquarters-cloudflare-topology.mjs';

const old='e8690813-b139-44a2-a1c7-bea2d2777ead';
const isolated='a5aa51d7-98c0-4adb-a304-0f4f555e01f5';
const project=(opts={})=>({
 name:'yorphives-admin-staging',
 production_branch:'build/yorphives-admin-reliability',
 source:{type:'github',config:{owner:'solopreneursid',repo_name:'yorpHives-2.0',
  production_branch:'build/yorphives-admin-reliability',
  production_deployments_enabled:opts.auto===true,
  preview_deployment_setting:opts.auto===true?'all':'none'}},
 deployment_configs:{
  production:{d1_databases:{DB:{id:old}},
   services:opts.productionService?{ADMIN_AGENT_SERVICE:{service:'yorphives-admin-agent'}}:{}},
  preview:{d1_databases:{DB:{id:opts.previewDB||isolated}},
   services:opts.previewService?{ADMIN_AGENT_SERVICE:{service:'yorphives-admin-agent'}}:{},
   env_vars:opts.otp?{FOUNDER_OTP_ENABLED:{type:'plain_text',value:'true'}}:{}}
 }
});
const archive=(options={})=>({
 name:'yorphives-2-preview',
 source:{type:'github',config:{owner:'solopreneursid',repo_name:'yorpHives-2.0',
  preview_deployment_setting:options.auto?'all':'none',
  production_deployments_enabled:false}},
 deployment_configs:{production:{d1_databases:{}},
  preview:{d1_databases:options.sharedDB?{DB:{id:old}}:{}}}
});

test('current verified Cloudflare controls pass while canonical privileged Worker remains a blocker',()=>{
 const r=evaluatePagesTopology(project({productionService:true}),archive());
 assert.equal(r.topology_hardened,false);
 assert.equal(r.blockers.length,1);
 assert.equal(r.blockers[0].name,'canonical_execution_service_retired');
 assert.equal(r.production_deployment_authorized,false);
 assert.equal(r.staging_schema_verified,false);
 assert.equal(r.historical_deployments_independently_audited,false);
 assert.doesNotMatch(JSON.stringify(r),new RegExp(old+'|'+isolated));
});
test('synthetic fully compliant topology is only a topology pass, never release permission',()=>{
 const r=evaluatePagesTopology(project(),archive());
 assert.equal(r.topology_hardened,true);
 assert.equal(r.blockers.length,0);
 assert.equal(r.production_deployment_authorized,false);
 assert.equal(r.no_current_canonical_release_assumed,true);
});
test('automatic production or preview deployment is a separate fail-closed condition',()=>{
 const r=evaluatePagesTopology(project({auto:true}),archive());
 assert.deepEqual(r.blockers.map(x=>x.name),['canonical_release_automation_disabled']);
});
test('shared bindings or old grants are separately blocked',()=>{
 const r=evaluatePagesTopology(project({previewDB:old,previewService:true,otp:true}),archive({sharedDB:true,auto:true}));
 assert.deepEqual(r.blockers.map(x=>x.name),[
  'future_preview_db_isolated','preview_execution_bindings_removed',
  'preview_otp_retired','archive_automatic_builds_disabled',
  'archive_database_unbound'
 ]);
});
test('wrong project ownership cannot pass even with unique D1',()=>{
 const p=project();
 p.source.config.owner='outsider';
 const r=evaluatePagesTopology(p,archive());
 assert.equal(r.topology_hardened,false);
 assert.deepEqual(r.blockers.map(x=>x.name),[
  'canonical_identity','future_preview_db_isolated','canonical_release_automation_disabled','canonical_execution_service_retired'
 ]);
});
test('provider inspector performs exactly two fixed GETs with no write or token in result',async()=>{
 const visited=[];
 const accountId='a'.repeat(32),apiToken='DO_NOT_ECHO_THIS_TOKEN';
 const fetcher=async (url,init)=>{
  visited.push({url,method:init.method});
  assert.equal(init.headers.authorization,'Bearer '+apiToken);
  assert.equal(init.redirect,'manual');
  const name=new URL(url).pathname.split('/').at(-1);
  return new Response(JSON.stringify({success:true,result:
   name==='yorphives-admin-staging'?project({productionService:true}):archive()
  }),{status:200,headers:{'content-type':'application/json'}});
 };
 const r=await auditPagesTopology({accountId,apiToken,fetcher});
 assert.deepEqual(visited,[
  {url:'https://api.cloudflare.com/client/v4/accounts/'+accountId+'/pages/projects/yorphives-admin-staging',method:'GET'},
  {url:'https://api.cloudflare.com/client/v4/accounts/'+accountId+'/pages/projects/yorphives-2-preview',method:'GET'}
 ]);
 assert.doesNotMatch(JSON.stringify(r),/DO_NOT_ECHO_THIS_TOKEN/);
 assert.equal(r.topology_hardened,false);
});
test('timeouts and API errors fail closed without echoing auth',async()=>{
 await assert.rejects(auditPagesTopology({accountId:'a'.repeat(32),apiToken:'DO_NOT_ECHO_THIS_TOKEN',
  fetcher:async()=>{throw Error('Bearer DO_NOT_ECHO_THIS_TOKEN failed');}
 }),/could not be independently read/);
});
