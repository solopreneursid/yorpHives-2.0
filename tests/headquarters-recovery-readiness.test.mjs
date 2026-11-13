import test from "node:test";
import assert from "node:assert/strict";
import {evaluateHeadquartersRecovery,appliedUtc} from "../scripts/headquarters-recovery-readiness.mjs";
const now=Date.parse("2026-11-13T16:00:00Z");
const migrations=Array.from({length:30},(_,i)=>({
 id:i+1,name:String(i+1).padStart(4,"0")+"_example.sql",
 applied_at:i===29?"2026-11-13 14:00:00":"2026-11-13 04:25:24"
}));
const backup={key:"backups/headquarters-staging/2026-11-13-after-0030-with-ledger.json",
 size:356200,last_modified:"2026-11-13T14:05:00.000Z",etag:"abcdef012345"};
const receipt={backup_key:backup.key,backup_etag:backup.etag,
 backup_sha256:"a".repeat(64),migration_id:30,table_count:64,row_count:603,
 foreign_key_violations:0,schema_equal:true,all_rows_equal:true,
 disposable_restore_destroyed:true,verified_at:"2026-11-13T14:25:00.000Z"};
const assess=opts=>evaluateHeadquartersRecovery({
 migrations,objects:[backup],restoreReceipts:[receipt],now,...opts
});
test("D1 timestamps use strict UTC, not server-local timezone",()=>{
 assert.equal(appliedUtc("2026-11-13 14:00:00"),Date.parse("2026-11-13T14:00:00Z"));
 assert.equal(Number.isNaN(appliedUtc("yesterday")),true);
});
test("current migration + later backup + independently verified disposable restore can be eligible",()=>{
 const result=assess();
 assert.equal(result.recovery_evidence_complete,true);
 assert.equal(result.production_approved,false);
 assert.equal(result.production_deployment_enabled,false);
});
test("actual old staging state is NOT recoverable at current 0030 schema",()=>{
 const old=migrations.slice(0,29);
 const stale={key:"backups/headquarters-staging/2026-11-13-after-0028-with-ledger.json",
  size:326197,last_modified:"2026-11-13T04:27:48.282Z",etag:"af168e669bbaa6ca7ceba08ddc84bd94"};
 const result=assess({migrations:old,objects:[stale],restoreReceipts:[]});
 assert.equal(result.recovery_evidence_complete,false);
 assert.ok(result.blockers.some(x=>x.includes("incomplete")));
 assert.ok(result.blockers.some(x=>x.includes("post-migration")));
 assert.ok(result.blockers.some(x=>x.includes("restore receipt")));
});
test("a stale, mismatched or unverified receipt fails closed",()=>{
 for(const partial of [
 {objects:[{...backup,last_modified:"2026-11-13T13:50:00Z"}]},
 {objects:[{...backup,key:"backups/headquarters-staging/2026-11-13-after-00300-with-ledger.json"}],restoreReceipts:[{...receipt,backup_key:"backups/headquarters-staging/2026-11-13-after-00300-with-ledger.json"}]},
 {objects:[{...backup,key:"backups/headquarters-staging/2026-11-13-after-00301-with-ledger.json"}],restoreReceipts:[{...receipt,backup_key:"backups/headquarters-staging/2026-11-13-after-00301-with-ledger.json"}]},
 {objects:[backup],restoreReceipts:[{...receipt,backup_etag:"other"}]},
 {restoreReceipts:[{...receipt,backup_sha256:"INVALID"}]},
 {restoreReceipts:[{...receipt,foreign_key_violations:1}]},
 {restoreReceipts:[{...receipt,all_rows_equal:false}]},
 {restoreReceipts:[{...receipt,disposable_restore_destroyed:false}]},
 {restoreReceipts:[{...receipt,migration_id:29}]},
 {migrations:migrations.map((x,i)=>i===5?{...x,name:"0010_wrong.sql"}:x)}
 ])assert.equal(assess(partial).recovery_evidence_complete,false);
});
