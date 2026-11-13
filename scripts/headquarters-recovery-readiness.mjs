/**
 * Fail-closed recovery evidence for private HQ D1. This does not restore,
 * migrate, deploy, or approve production. Evidence must come from Cloudflare.
 */
const MIGRATION=/^(\d{4})_[a-z0-9_]+\.sql$/;
const BACKUP=/^backups\/headquarters-staging\/[a-z0-9-]+\.json$/;
const DIGEST=/^[a-f0-9]{64}$/;
export function appliedUtc(value){
 if(typeof value!=="string")return NaN;
 const normalized=/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/.test(value)?
  value.replace(" ","T")+"Z":value;
 if(!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/.test(normalized))return NaN;
 return Date.parse(normalized);
}
export function evaluateHeadquartersRecovery({
 migrations,objects,restoreReceipts,sourceMigrationCount=30,now=Date.now()
}){
 const problems=[];
 const missing=message=>problems.push(message);
 if(!Array.isArray(migrations)||!Number.isSafeInteger(sourceMigrationCount)||
    sourceMigrationCount<1)missing("D1 migration inventory is invalid.");
 else{
  const sorted=[...migrations].sort((a,b)=>a.id-b.id);
  if(sorted.length!==sourceMigrationCount||
     sorted.some((row,i)=>row.id!==i+1||!MIGRATION.test(String(row.name||""))||
      Number(row.name.slice(0,4))!==i+1))
   missing("D1 migrations are incomplete or do not match checked-in migration numbering.");
 }
 const latest=Array.isArray(migrations)&&migrations.length?
  [...migrations].sort((a,b)=>b.id-a.id)[0]:null;
 const applied=appliedUtc(latest?.applied_at);
 if(!Number.isFinite(applied)||applied>now)
  missing("Latest D1 migration timestamp is unverified.");
 const current=Number.isSafeInteger(latest?.id)?latest.id:null;
 const candidates=Array.isArray(objects)?objects.filter(o=>
  typeof o?.key==="string"&&BACKUP.test(o.key)&&
  new RegExp("(?:^|-)after-"+String(sourceMigrationCount).padStart(4,"0")+"(?:-|\\.)").test(o.key.split("/").at(-1))&&
  Number.isSafeInteger(o.size)&&o.size>1024&&
  typeof o.etag==="string"&&o.etag.length>0&&
  // A restore receipt cannot authenticate its own digest. The expected
  // digest must be supplied separately from verified backup evidence.
  DIGEST.test(String(o.sha256||""))&&
  Number.isFinite(Date.parse(o.last_modified||""))&&
  Date.parse(o.last_modified)>applied&&
  Date.parse(o.last_modified)<=now
 ): [];
 if(!candidates.length)missing("No current post-migration R2 backup matches the full schema and timestamp.");
 const verified=Array.isArray(restoreReceipts)?restoreReceipts.some(receipt=>{
  const backup=candidates.find(x=>x.key===receipt?.backup_key);
  if(!backup)return false;
  const when=Date.parse(receipt.verified_at||"");
  return receipt.migration_id===sourceMigrationCount&&
   receipt.backup_key===backup.key&&receipt.backup_etag===backup.etag&&
   DIGEST.test(String(receipt.backup_sha256||""))&&
   receipt.backup_sha256===backup.sha256&&
   Number.isSafeInteger(receipt.table_count)&&receipt.table_count>=1&&
   Number.isSafeInteger(receipt.row_count)&&receipt.row_count>=0&&
   receipt.foreign_key_violations===0&&receipt.schema_equal===true&&
   receipt.all_rows_equal===true&&receipt.disposable_restore_destroyed===true&&
   Number.isFinite(when)&&when>=Date.parse(backup.last_modified)&&when<=now;
 }):false;
 if(!verified)missing("A matching independently verified disposable D1 restore receipt is missing.");
 return Object.freeze({
  target:"headquarters",source_migrations:sourceMigrationCount,
  applied_migrations:current,latest_migration:latest?.name||null,
  eligible_backup_count:candidates.length,
  recovery_evidence_complete:problems.length===0,
  production_approved:false,production_deployment_enabled:false,
  blockers:problems
 });
}
