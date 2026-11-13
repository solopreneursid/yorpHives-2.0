import test from "node:test";
import assert from "node:assert/strict";
import {verifyHeadquartersD1Isolation} from "../functions/_lib/hq-resource-isolation.js";
const shared="e8690813-b139-44a2-a1c7-bea2d2777ead";
const independent="84c324ac-f7dc-4304-80bf-8da16da18c4c";
const project={
 name:"yorphives-admin-staging",
 production_branch:"build/yorphives-admin-reliability",
 source:{type:"github",config:{owner:"solopreneursid",repo_name:"yorpHives-2.0",
  production_branch:"build/yorphives-admin-reliability"}},
 deployment_configs:{
  preview:{d1_databases:{DB:{id:shared}}},production:{d1_databases:{DB:{id:shared}}}
 }
};
test("actual shared preview/canonical D1 binding blocks Go Live and migrations",()=>{
 const r=verifyHeadquartersD1Isolation(project);
 assert.equal(r.isolated,false);
 assert.equal(r.production_deployment_enabled,false);
 assert.equal(r.database_migration_allowed,false);
 assert.equal(r.database_restore_verified,false);
 assert.match(r.reason,/SAME D1 database/);
 assert.equal(JSON.stringify(r).includes(shared),false);
});
test("distinct, verified D1 bindings are still NOT proof of migration/restore",()=>{
 const altered={...project,deployment_configs:{
  preview:{d1_databases:{DB:{id:independent}}},
  production:{d1_databases:{DB:{id:shared}}}
 }};
 const r=verifyHeadquartersD1Isolation(altered);
 assert.equal(r.isolated,true);
 assert.equal(r.preview_and_canonical_d1_distinct,true);
 assert.equal(r.database_migration_allowed,false);
 assert.equal(r.database_restore_verified,false);
 assert.equal(r.production_deployment_enabled,false);
});
test("missing binding or forged project identity fails closed",()=>{
 const variants=[
  {...project,source:{...project.source,config:{...project.source.config,owner:"attacker"}}},
  {...project,production_branch:"main"},
  {...project,deployment_configs:null},
  {...project,deployment_configs:{production:project.deployment_configs.production}},
  {...project,deployment_configs:{...project.deployment_configs,preview:{d1_databases:{}}}},
  {...project,deployment_configs:{...project.deployment_configs,production:{d1_databases:{DB:{id:"fake"}}}}},
  {...project,deployment_configs:{...project.deployment_configs,
   preview:{d1_databases:{DB:{id:shared.toUpperCase()}}},
   production:{d1_databases:{DB:{id:shared}}}}}
 ];
 for(const p of variants){
  const r=verifyHeadquartersD1Isolation(p);
  assert.equal(r.isolated,false);
  assert.equal(r.production_deployment_enabled,false);
 }
});
