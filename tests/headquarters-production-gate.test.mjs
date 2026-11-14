import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateHeadquartersProductionEvidence,
  formatHeadquartersGateMarkdown } from '../scripts/headquarters-production-gate.mjs';

const at=new Date('2026-11-14T10:00:00.000Z');
const iso='2026-11-14T09:30:00.000Z';
const sha='a'.repeat(40);
const production='e8690813-b139-44a2-a1c7-bea2d2777ead';
const preview='84c324ac-f7dc-4304-80bf-8da16da18c4c';

const record = () => ({
  expectedSha:sha, now:at, ownerPermission:true,
  project:{
    name:'yorphives-admin-staging',production_branch:'build/yorphives-admin-reliability',
    source:{type:'github',config:{owner:'solopreneursid',repo_name:'yorpHives-2.0',
      production_branch:'build/yorphives-admin-reliability'}},
    deployment_configs:{preview:{d1_databases:{DB:{id:preview}}},
      production:{d1_databases:{DB:{id:production}}}}
  },
  access:{source:'provider_access_policies',owner_email_only:true,
    primary_domain_protected:true,pages_origin_protected:true,
    deployment_aliases_protected:true,anonymous_denial_verified:true,checked_at:iso},
  staging:{source:'isolated_authenticated_staging',sha,preview_d1_isolated:true,
    authenticated_browser_passed:true,anonymous_access_denied:true,
    monitor_only_verified:true,read_only_test:true,verified_at:iso},
  recovery:{source:'independent_restore_rehearsal',schema_equal:true,
    all_rows_equal:true,foreign_key_violations:0,disposable_restore_destroyed:true,
    source_database_isolated:true,verified_at:iso},
  watchdog:{source:'independent_local_watchdog',connected:true,status:'ready',
    repair_dispatch_enabled:false,alerts_tested:true,
    separate_os_supervisor_verified:true,observed_at:iso},
  ci:{source:'independent_ci',sha,platform_checks:'success',browser_qa:'success',
    codeql:'success',completed_at:iso,monitor_only_contract_passed:true,
    production_execution_enabled:false,automatic_repairs_enabled:false}
});

test('missing live evidence blocks launch even if the owner requests production readiness',()=>{
  const result=evaluateHeadquartersProductionEvidence({ownerPermission:true,now:at});
  assert.equal(result.technical_ready,false);
  assert.equal(result.production_deployment_authorized,false);
  assert.equal(result.automatic_production_deploy_allowed,false);
  assert.equal(result.owner_permission_declared,true);
  assert.equal(result.blockers.length,10);
  assert.doesNotMatch(JSON.stringify(result),/bearer|token|password/i);
});
test('real shared Cloudflare preview/canonical DB is a fatal independent blocker',()=>{
  const data=record();
  data.project.deployment_configs.preview.d1_databases.DB.id=production;
  const result=evaluateHeadquartersProductionEvidence(data);
  assert.equal(result.technical_ready,false);
  assert.deepEqual(result.blockers.map(b=>b.id),['d1-environment-isolation']);
  assert.match(result.blockers[0].detail,/SAME D1 database/);
  assert.doesNotMatch(JSON.stringify(result),new RegExp(production));
});
test('a complete coherent set of synthetic evidence passes only technical gates, not deployment authority',()=>{
  const result=evaluateHeadquartersProductionEvidence(record());
  assert.equal(result.technical_ready,true);
  assert.equal(result.blockers.length,0);
  assert.equal(result.production_deployment_authorized,false);
  assert.match(formatHeadquartersGateMarkdown(result),/Production deployment: NOT AUTHORIZED/);
  assert.equal(result.self_hosted_mode_not_evaluated,true);
});
test('stale or mismatched independent attestations fail closed',()=>{
  const data=record();
  data.ci.sha='b'.repeat(40);
  data.staging.verified_at='2026-11-12T10:00:00.000Z';
  data.watchdog.observed_at='2026-11-14T07:59:59.000Z';
  data.access.anonymous_denial_verified=false;
  const result=evaluateHeadquartersProductionEvidence(data);
  assert.deepEqual(result.blockers.map(x=>x.id),[
    'auth-access-boundaries','exact-revision-identity',
    'isolated-authenticated-staging','outside-in-monitoring'
  ]);
});
test('unverified restore, missing Access policy or fake source cannot pass',()=>{
  const data=record();
  data.recovery.all_rows_equal=false;
  data.access.source='browser_guess';
  data.watchdog.source='in_process_scheduler';
  const r=evaluateHeadquartersProductionEvidence(data);
  assert.deepEqual(r.blockers.map(x=>x.id),[
    'auth-access-boundaries','verified-recovery','outside-in-monitoring'
  ]);
});
test('invalid review time is rejected',()=>{
  assert.throws(()=>evaluateHeadquartersProductionEvidence({now:new Date('bad')}),/Invalid readiness review clock/);
});
