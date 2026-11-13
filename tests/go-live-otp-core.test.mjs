import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {DatabaseSync} from "node:sqlite";
import {
 validatedReleaseBinding,sameReleaseBinding,releaseOtpPayload,constantTimeHexEqual,
 RELEASE_OTP_TEST_ONLY
} from "../functions/_lib/go-live-otp-core.js";

const sha="b".repeat(40),uuid="123e4567-e89b-42d3-a456-000000000001";
const preview="https://12abcd34.yorphives-2-preview.pages.dev";
const ready={target:"website",status:"verified_preview",ready_for_preview:true,
 production_deployment_enabled:false,production_approved:false,blockers:[],
 candidate:{target:"website",sha,number:84},
 preview:{url:preview,deploymentId:uuid}};
test("exact candidate, preview and protected target form the immutable authorization",()=>{
 const bound=validatedReleaseBinding(ready,"website",sha,uuid);
 assert.equal(bound.sha,sha);
 assert.equal(bound.preview_url,preview);
 assert.equal(sameReleaseBinding({
  target:"website",commit_sha:sha,preview_deployment_id:uuid,preview_url:preview,pr_number:84
 },ready),true);
 assert.equal(validatedReleaseBinding({...ready,production_deployment_enabled:true},"website",sha,uuid),null);
 assert.equal(validatedReleaseBinding({...ready,ready_for_preview:false},"website",sha,uuid),null);
 assert.equal(validatedReleaseBinding({...ready,blockers:["QA missing"]},"website",sha,uuid),null);
 assert.equal(validatedReleaseBinding(ready,"website","a".repeat(40),uuid),null);
 assert.equal(validatedReleaseBinding(ready,"website",sha,"not-a-uuid"),null);
 assert.equal(validatedReleaseBinding({...ready,preview:{url:"https://attacker.example",deploymentId:uuid}},"website",sha,uuid),null);
 assert.equal(sameReleaseBinding({target:"website",commit_sha:sha,preview_deployment_id:uuid,preview_url:preview,pr_number:85},ready),false);
 assert.notEqual(releaseOtpPayload(bound),releaseOtpPayload({...bound,sha:"a".repeat(40)}));
 assert.equal(RELEASE_OTP_TEST_ONLY,true);
});
test("OTP digest equality is length-checked and constant-work for valid hashes",()=>{
 const a="f".repeat(64),b="f".repeat(63)+"e";
 assert.equal(constantTimeHexEqual(a,a),true);
 assert.equal(constantTimeHexEqual(a,b),false);
 assert.equal(constantTimeHexEqual(a,"x".repeat(64)),false);
 assert.equal(constantTimeHexEqual(a,""),false);
});
test("staging release OTP schema prevents binding tampering and overlapping pending codes",async()=>{
 const db=new DatabaseSync(":memory:");
 try{
  db.exec(await readFile(new URL("../migrations/0030_go_live_otp.sql",import.meta.url),"utf8"));
  const add=db.prepare("INSERT INTO hq_go_live_challenges(challenge_id,owner_email,target,commit_sha,preview_deployment_id,preview_url,pr_number,code_hmac,state,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)");
  const base=[uuid,"founder@example.org","website",sha,
   "123e4567-e89b-42d3-a456-000000000002",preview,84,"c".repeat(64),"sent",
   "2026-11-13T00:00:00Z","2026-11-13T00:05:00Z"];
  add.run(...base);
  assert.throws(()=>db.prepare("UPDATE hq_go_live_challenges SET commit_sha=? WHERE challenge_id=?").run("a".repeat(40),uuid),/immutable/);
  assert.throws(()=>add.run("123e4567-e89b-42d3-a456-000000000003",...base.slice(1)),/UNIQUE/);
  db.prepare("UPDATE hq_go_live_challenges SET state='verified' WHERE challenge_id=?").run(uuid);
  add.run("123e4567-e89b-42d3-a456-000000000003",...base.slice(1));
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM hq_go_live_challenges").get().n,2);
 }finally{db.close();}
});
