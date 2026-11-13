/**
 * Read-only byte verification of a downloaded Headquarters R2 backup.
 * Caller must independently retrieve authentic Cloudflare R2 metadata.
 * This does not authenticate metadata, restore D1, or approve production.
 */
import {createHash} from "node:crypto";
import {open,stat} from "node:fs/promises";
import {constants} from "node:fs";
import {fileURLToPath} from "node:url";

const BACKUP_KEY=/^backups\/headquarters-staging\/[a-z0-9-]+\.json$/;
const ETAG=/^[a-zA-Z0-9-]{8,128}$/;
const UTC=/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/;
export async function verifyHeadquartersBackupBytes({filePath,key,etag,lastModified,expectedSize}){
 if(typeof filePath!=="string"||!filePath||
    typeof key!=="string"||!BACKUP_KEY.test(key)||
    typeof etag!=="string"||!ETAG.test(etag)||
    typeof lastModified!=="string"||!UTC.test(lastModified)||
    !Number.isFinite(Date.parse(lastModified))||
    !Number.isSafeInteger(expectedSize)||expectedSize<=1024)
  throw Error("Invalid independently sourced R2 backup metadata.");
 // O_NOFOLLOW prevents substituting a symlink for the selected backup.
 const handle=await open(filePath,constants.O_RDONLY|constants.O_NOFOLLOW);
 try{
  const info=await handle.stat();
  if(!info.isFile()||info.size!==expectedSize)
   throw Error("Backup is not a regular file or its size differs from R2 metadata.");
  const hash=createHash("sha256");
  const buffer=Buffer.allocUnsafe(64*1024);
  let bytes=0;
  while(true){
   const {bytesRead}=await handle.read(buffer,0,buffer.length,bytes);
   if(!bytesRead)break;
   hash.update(buffer.subarray(0,bytesRead));
   bytes+=bytesRead;
  }
  const after=await handle.stat();
  if(bytes!==expectedSize||after.size!==expectedSize||
     after.mtimeMs!==info.mtimeMs||after.ino!==info.ino||
     after.dev!==info.dev)
   throw Error("Backup bytes or file identity changed during verification.");
  return Object.freeze({key,size:bytes,etag,last_modified:lastModified,
   sha256:hash.digest("hex")});
 }finally{await handle.close();}
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 const [filePath,metadataPath]=process.argv.slice(2);
 if(!filePath||!metadataPath||process.argv.length!==4)
  throw Error("Usage: node scripts/headquarters-backup-digest.mjs <downloaded-backup-file> <trusted-r2-metadata-json>");
 const {readFile}=await import("node:fs/promises");
 const meta=JSON.parse(await readFile(metadataPath,"utf8"));
 const result=await verifyHeadquartersBackupBytes({
  filePath,key:meta.key,etag:meta.etag,
  lastModified:meta.last_modified,expectedSize:meta.size
 });
 process.stdout.write(JSON.stringify(result,null,2)+"\n");
}
