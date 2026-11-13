import test from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {mkdtemp,copyFile,symlink,rm,writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {compareHeadquartersSqliteRestore} from "../scripts/headquarters-sqlite-restore-compare.mjs";

const seeded=path=>{
 const db=new DatabaseSync(path);
 try{
  db.exec("PRAGMA foreign_keys=ON; CREATE TABLE accounts(id INTEGER PRIMARY KEY, name TEXT UNIQUE NOT NULL);"+
   "CREATE TABLE events(id INTEGER PRIMARY KEY, account_id INTEGER REFERENCES accounts(id), payload BLOB);"+
   "CREATE INDEX idx_events_account ON events(account_id);"+
   "CREATE VIEW active_accounts AS SELECT id,name FROM accounts;");
  db.prepare("INSERT INTO accounts(id,name) VALUES(?,?)").run(1,"alpha");
  db.prepare("INSERT INTO accounts(id,name) VALUES(?,?)").run(2,"βeta");
  db.prepare("INSERT INTO events(id,account_id,payload) VALUES(?,?,?)").run(1,1,Buffer.from([0,255,22]));
  db.prepare("INSERT INTO events(id,account_id,payload) VALUES(?,?,?)").run(2,2,Buffer.from([5,4,3]));
 }finally{db.close();}
};
async function fixture(work){
 const dir=await mkdtemp(join(tmpdir(),"hq-recovery-"));
 const source=join(dir,"source.sqlite"),restored=join(dir,"restored.sqlite");
 try{seeded(source);await copyFile(source,restored);await work({dir,source,restored});}
 finally{await rm(dir,{recursive:true,force:true});}
}
test("exact snapshot restore agrees on schema, BLOBs, FK integrity and all rows without authorizing release",async()=>{
 await fixture(async({source,restored})=>{
  const r=await compareHeadquartersSqliteRestore({sourcePath:source,restoredPath:restored});
  assert.equal(r.local_snapshots_match,true);
  assert.equal(r.schema_equal,true);
  assert.equal(r.all_rows_equal,true);
  assert.equal(r.foreign_key_violations,0);
  assert.equal(r.table_count,2);
  assert.equal(r.row_count,4);
  assert.deepEqual(r.differing_tables,[]);
  assert.match(r.source_fingerprint.data_sha256,/^[a-f0-9]{64}$/);
  assert.equal(r.source_fingerprint.data_sha256,r.restored_fingerprint.data_sha256);
  assert.equal(r.cloudflare_restore_attested,false);
  assert.equal(r.disposable_restore_destroyed,false);
  assert.equal(r.recovery_evidence_complete,false);
  assert.equal(r.production_approved,false);
  assert.equal(r.production_deployment_enabled,false);
 });
});
test("changed row and schema are detected even when row counts agree",async()=>{
 await fixture(async({source,restored})=>{
  const db=new DatabaseSync(restored);
  try{db.prepare("UPDATE accounts SET name=? WHERE id=?").run("changed",2);}finally{db.close();}
  const r=await compareHeadquartersSqliteRestore({sourcePath:source,restoredPath:restored});
  assert.equal(r.schema_equal,true);
  assert.equal(r.all_rows_equal,false);
  assert.equal(r.local_snapshots_match,false);
  assert.deepEqual(r.differing_tables,["accounts"]);
 });
 await fixture(async({source,restored})=>{
  const db=new DatabaseSync(restored);
  try{db.exec("CREATE TABLE extra(id INTEGER PRIMARY KEY);");}finally{db.close();}
  const r=await compareHeadquartersSqliteRestore({sourcePath:source,restoredPath:restored});
  assert.equal(r.schema_equal,false);
  assert.equal(r.local_snapshots_match,false);
  assert.ok(r.differing_tables.includes("extra"));
 });
});
test("rejects identical source path, symlinks, hot WAL and broken foreign keys",async()=>{
 await fixture(async({source,restored,dir})=>{
  await assert.rejects(compareHeadquartersSqliteRestore({sourcePath:source,restoredPath:source}),/independent/);
  const link=join(dir,"alias.sqlite");await symlink(restored,link);
  await assert.rejects(compareHeadquartersSqliteRestore({sourcePath:source,restoredPath:link}),/regular file/);
  const db=new DatabaseSync(restored);
  try{db.exec("PRAGMA foreign_keys=OFF; UPDATE events SET account_id=999 WHERE id=1;");}
  finally{db.close();}
  await assert.rejects(compareHeadquartersSqliteRestore({sourcePath:source,restoredPath:restored}),/foreign-key/);
  await writeFile(source+"-wal","running");
  await assert.rejects(compareHeadquartersSqliteRestore({sourcePath:source,restoredPath:restored}),/WAL/);
 });
});
