import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac,generateKeyPairSync,randomBytes} from 'node:crypto';
import {releaseBlockers,issueIndependentReleaseApproval,
 verifyIndependentReleaseApproval,verifyTotpCounter}
 from '../release-control/owner-release-contract.mjs';

const time=Date.parse('2026-11-14T06:00:00Z');
const sha='a'.repeat(40);
const candidate={
 system:'headquarters',repository:'solopreneursid/yorpHives-2.0',
 cloudflare_project:'yorphives-admin-staging',source_sha:sha,
 preview_deployment_id:'00000000-0000-4000-8000-123456789012',
 preview_url:'https://headquarters-preview.example.test'
};
const evidence={
 authenticated_provider_reads:true,
 github_repository:candidate.repository,cloudflare_project:candidate.cloudflare_project,
 preview_sha:sha,preview_deployment_id:candidate.preview_deployment_id,
 preview_url:candidate.preview_url,preview_environment:'preview',
 preview_http_verified:true,founder_preview_review_verified:true,
 reviewed_preview_sha:sha,tests_sha:sha,required_ci_green:true,
 production_auto_deploy_disabled:true,rollback_artifact_verified:true,
 production_runtime_has_write_credentials:false,release_service_separate_from_hq:true,
 backup_restore_verified:true,observed_at:new Date(time).toISOString()
};
const identity={jwt_signature_verified:true,owner_role_verified:true,subject:'owner-test-subject'};
const totp=(secret,ms)=>{
 const b=Buffer.alloc(8);
 b.writeBigUInt64BE(BigInt(Math.floor(ms/30000)));
 const h=createHmac('sha1',secret).update(b).digest(),i=h.at(-1)&15;
 return String((h.readUInt32BE(i)&0x7fffffff)%1000000).padStart(6,'0');
};
const keypair=generateKeyPairSync('ed25519'),secret=randomBytes(32);
const controls=()=>({
 abuseLimiter:{enforce:async()=>true},
 oneTimeStore:{consume:async()=>true}
});

test('canonical HQ still fails release proof when privileged worker or full official recovery is missing',()=>{
 assert.deepEqual(releaseBlockers(candidate,{
  ...evidence,production_runtime_has_write_credentials:true,backup_restore_verified:false
 },identity,time),['production_write_credentials','recovery_unverified']);
});

test('no source, preview, CI, founder identity or OTP can be omitted or asserted by the HQ runtime',async()=>{
 const denied=await issueIndependentReleaseApproval({
  candidate,evidence:{...evidence,authenticated_provider_reads:false},
  identity,otp:totp(secret,time),otpSecret:secret,signingKey:keypair.privateKey,
  ...controls(),time
 });
 assert.equal(denied.approved,false);
 assert.ok(denied.blocked.includes('provider_evidence_unverified'));
 assert.equal(denied.production_deployed,false);
 const stale=releaseBlockers(candidate,{...evidence,observed_at:new Date(time-3600000).toISOString()},identity,time);
 assert.deepEqual(stale,['stale_provider_evidence']);
 const changed=releaseBlockers({...candidate,source_sha:'b'.repeat(40)},evidence,identity,time);
 assert.deepEqual(changed,['preview_sha_mismatch','owner_preview_not_reviewed','ci_unverified']);
});

test('one-time owner OTP produces signed exact-SHA receipt, not a production deploy',async()=>{
 const code=totp(secret,time);
 assert.equal(verifyTotpCounter({otp:code,secret,time}),Math.floor(time/30000));
 const seen=new Set();
 const store={consume:async(key,counter)=>{
  const k=key+':'+counter;
  if(seen.has(k))return false;
  seen.add(k);return true;
 }};
 const args={candidate,evidence,identity,otp:code,otpSecret:secret,
  signingKey:keypair.privateKey,abuseLimiter:{enforce:async()=>true},
  oneTimeStore:store,time};
 const first=await issueIndependentReleaseApproval(args);
 assert.equal(first.approved,true);
 assert.equal(first.production_deployed,false);
 assert.equal(first.approval.payload.source_sha,sha);
 assert.equal(verifyIndependentReleaseApproval({
  approval:first.approval,publicKey:keypair.publicKey,time:time+30000}),true);
 assert.equal(verifyIndependentReleaseApproval({
  approval:first.approval,publicKey:keypair.publicKey,time:time+121000}),false);
 const tampered=structuredClone(first.approval);
 tampered.payload.source_sha='b'.repeat(40);
 assert.equal(verifyIndependentReleaseApproval({
  approval:tampered,publicKey:keypair.publicKey,time}),false);
 const second=await issueIndependentReleaseApproval(args);
 assert.equal(second.approved,false);
 assert.deepEqual(second.blocked,['owner_otp_replayed']);
});

test('missing atomic store, rate limiter, signing key or owner OTP fails closed',async()=>{
 const valid={candidate,evidence,identity,otp:totp(secret,time),otpSecret:secret,
  signingKey:keypair.privateKey,time};
 assert.deepEqual((await issueIndependentReleaseApproval({...valid})).blocked,
  ['external_release_controls_not_configured']);
 assert.deepEqual((await issueIndependentReleaseApproval({
  ...valid,abuseLimiter:{enforce:async()=>false},oneTimeStore:{consume:async()=>true}
 })).blocked,['otp_rate_limited']);
 assert.deepEqual((await issueIndependentReleaseApproval({
  ...valid,otp:'00000x',...controls()
 })).blocked,['owner_otp_invalid']);
 assert.equal(verifyTotpCounter({otp:'123456',secret:Buffer.alloc(1),time}),null);
});

test('approval cannot be signed by an untrusted third party or serve as universal deployment permission',async()=>{
 const args={candidate,evidence,identity,otp:totp(secret,time),otpSecret:secret,
  signingKey:keypair.privateKey,...controls(),time};
 const r=await issueIndependentReleaseApproval(args);
 const untrusted=generateKeyPairSync('ed25519');
 assert.equal(verifyIndependentReleaseApproval({
  approval:r.approval,publicKey:untrusted.publicKey,time}),false);
 assert.equal(r.approval.payload.system,'headquarters');
 assert.equal(r.approval.payload.repository,candidate.repository);
 assert.equal(r.approval.payload.project,candidate.cloudflare_project);
 assert.doesNotMatch(JSON.stringify(r),new RegExp(secret.toString('hex')));
 assert.doesNotMatch(JSON.stringify(r),/OTP|token|password|admin_agent_service/i);
});
