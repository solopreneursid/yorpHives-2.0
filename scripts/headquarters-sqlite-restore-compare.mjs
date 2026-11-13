/**
 * Read-only verification of two CLOSED local SQLite snapshot files.
 * This proves local snapshot equality only. It DOES NOT authenticate a D1
 * source, perform a Cloudflare restore, prove disposable D1 destruction,
 * or satisfy the production recovery gate.
 */
import {createHash} from "node:crypto";
import {lstat,stat} from "node:fs/promises";
import {resolve} from "node:path";
import {DatabaseSync} from "node:sqlite";
import {fileURLToPath} from "node:url";

const MAX_FILE_BYTES=250*1024*1024;
const MAX_TABLE_ROWS=200000;
const MAX_TOTAL_ROWS=300000;
const ident=name=>'"'+name.replaceAll('"','""')+'"';
const hash=value=>createHash("sha256").update(value).digest("hex");
const regular=async path=>{
 if(typeof path!=="string"||!path.trim())throw Error("A local SQLite snapshot path is required.");
 const abs=resolve(path),info=await lstat(abs);
 if(!info.isFile()||!Number.isSafeInteger(info.size)||info.size<100||
    info.size>MAX_FILE_BYTES)throw Error("Snapshot must be a bounded regular file, not a symlink.");
 for(const suffix of ["-wal","-shm"]){
  try{await stat(abs+suffix);throw Error("SQLite snapshot has a live WAL/SHM companion file.");}
  catch(e){if(e?.code!=="ENOENT")throw e;}
 }
 return {path:abs,dev:info.dev,ino:info.ino,size:info.size,mtimeMs:info.mtimeMs};
};
const unchanged=async before=>{
 const after=await lstat(before.path);
 if(!after.isFile()||after.dev!==before.dev||after.ino!==before.ino||
    after.size!==before.size||after.mtimeMs!==before.mtimeMs)
  throw Error("SQLite snapshot changed during verification.");
};
const canonical=v=>{
 if(v===null)return ["null"];
 if(typeof v==="bigint")return ["integer",v.toString()];
 if(typeof v==="number"){
  if(!Number.isFinite(v))throw Error("Non-finite SQLite value.");
  return ["number",Object.is(v,-0)?"-0":String(v)];
 }
 if(typeof v==="string")return ["text",v];
 if(v instanceof Uint8Array)return ["blob",Buffer.from(v).toString("hex")];
 throw Error("Unsupported SQLite column type.");
};
function inspect(path){
 const db=new DatabaseSync(path,{readOnly:true});
 try{
  db.exec("PRAGMA query_only=ON");
  const quick=db.prepare("PRAGMA quick_check").all();
  if(quick.length!==1||quick[0]?.quick_check!=="ok")
   throw Error("Snapshot SQLite integrity check failed.");
  const violation=db.prepare("PRAGMA foreign_key_check").get();
  if(violation)throw Error("Snapshot contains foreign-key violations.");
  const objects=db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master "+
   "WHERE name NOT LIKE 'sqlite_%' OR name='sqlite_sequence' "+
   "ORDER BY type,name").all();
  if(!objects.length)throw Error("Snapshot has no database objects.");
  const schema=objects.map(o=>[o.type,o.name,o.tbl_name,o.sql]);
  const config={
   user_version:db.prepare("PRAGMA user_version").get().user_version,
   application_id:db.prepare("PRAGMA application_id").get().application_id
  };
  const schemaSha=hash(JSON.stringify({schema,config}));
  const names=objects.filter(o=>o.type==="table").map(o=>o.name);
  let total=0;
  const tables=[];
  for(const name of names){
   const stmt=db.prepare("SELECT * FROM "+ident(name));
   if(typeof stmt.setReadBigInts==="function")stmt.setReadBigInts(true);
   const rows=[];
   for(const row of stmt.iterate()){
    if(rows.length>=MAX_TABLE_ROWS||total>=MAX_TOTAL_ROWS)
     throw Error("SQLite snapshot exceeds bounded verification row count.");
    rows.push(hash(JSON.stringify(Object.values(row).map(canonical))));
    total++;
   }
   rows.sort();
   const fingerprint=hash(JSON.stringify({table:name,rows}));
   tables.push({name,row_count:rows.length,sha256:fingerprint});
  }
  return {schema_sha256:schemaSha,data_sha256:hash(JSON.stringify(tables)),
   table_count:tables.length,row_count:total,tables,
   foreign_key_violations:0};
 }finally{db.close();}
}
export async function compareHeadquartersSqliteRestore({sourcePath,restoredPath}){
 const source=await regular(sourcePath),restored=await regular(restoredPath);
 if(source.dev===restored.dev&&source.ino===restored.ino)
  throw Error("Source and restored snapshot must be independent files.");
 const left=inspect(source.path),right=inspect(restored.path);
 await Promise.all([unchanged(source),unchanged(restored)]);
 const schemaEqual=left.schema_sha256===right.schema_sha256;
 const rowsEqual=schemaEqual&&left.data_sha256===right.data_sha256&&
   left.row_count===right.row_count&&left.table_count===right.table_count;
 return Object.freeze({
  schema_version:1,comparison:"closed_local_sqlite_snapshots",
  schema_equal:schemaEqual,all_rows_equal:rowsEqual,
  table_count:left.table_count,row_count:left.row_count,
  foreign_key_violations:0,
  source_fingerprint:{schema_sha256:left.schema_sha256,data_sha256:left.data_sha256},
  restored_fingerprint:{schema_sha256:right.schema_sha256,data_sha256:right.data_sha256},
  differing_tables:sourceDiff(left,right),
  local_snapshots_match:schemaEqual&&rowsEqual,
  cloudflare_restore_attested:false,disposable_restore_destroyed:false,
  recovery_evidence_complete:false,production_approved:false,
  production_deployment_enabled:false
 });
}
function sourceDiff(left,right){
 const byName=new Map(right.tables.map(t=>[t.name,t]));
 return left.tables.filter(x=>{
  const t=byName.get(x.name);
  return !t||t.row_count!==x.row_count||t.sha256!==x.sha256;
 }).map(x=>x.name).concat(right.tables.filter(x=>
  !left.tables.some(y=>y.name===x.name)).map(x=>x.name)).sort().slice(0,30);
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1])){
 if(process.argv.length!==4)throw Error(
  "Usage: node scripts/headquarters-sqlite-restore-compare.mjs <source-snapshot.sqlite> <restored-snapshot.sqlite>");
 const result=await compareHeadquartersSqliteRestore({
  sourcePath:process.argv[2],restoredPath:process.argv[3]
 });
 console.log(JSON.stringify(result,null,2));
 if(!result.local_snapshots_match)process.exitCode=1;
}
