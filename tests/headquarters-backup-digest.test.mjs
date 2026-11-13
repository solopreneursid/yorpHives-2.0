import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {mkdtemp,writeFile,symlink,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {verifyHeadquartersBackupBytes} from "../scripts/headquarters-backup-digest.mjs";

test("hash downloaded backup bytes, match R2 metadata, and reject alterations",async()=>{
 const dir=await mkdtemp(join(tmpdir(),"hq-backup-"));
 try{
  const filePath=join(dir,"download.json");
  const bytes=Buffer.from(JSON.stringify({migration:30,data:"x".repeat(2048)}));
  await writeFile(filePath,bytes);
  const meta={filePath,key:"backups/headquarters-staging/2026-11-13-after-0030-with-ledger.json",
   etag:"af168e669bbaa6ca7ceba08ddc84bd94",
   lastModified:"2026-11-13T14:05:00.000Z",expectedSize:bytes.length};
  const proof=await verifyHeadquartersBackupBytes(meta);
  assert.equal(proof.sha256,createHash("sha256").update(bytes).digest("hex"));
  assert.equal(proof.size,bytes.length);
  assert.equal(proof.key,meta.key);
  assert.equal(proof.last_modified,meta.lastModified);
  assert.equal(proof.etag,meta.etag);
  await assert.rejects(verifyHeadquartersBackupBytes({...meta,expectedSize:bytes.length+1}),/size differs/);
  await assert.rejects(verifyHeadquartersBackupBytes({...meta,etag:""}),/Invalid/);
  await assert.rejects(verifyHeadquartersBackupBytes({...meta,lastModified:"not-a-date"}),/Invalid/);
  await assert.rejects(verifyHeadquartersBackupBytes({...meta,key:"backups/other/2026.json"}),/Invalid/);
  const alias=join(dir,"link.json");
  await symlink(filePath,alias);
  await assert.rejects(verifyHeadquartersBackupBytes({...meta,filePath:alias}));
 }finally{await rm(dir,{recursive:true,force:true});}
});
