/**
 * INDEPENDENT OWNER RELEASE CONTROLLER CONTRACT (NOT AN HQ ROUTE).
 *
 * This open-source, provider-neutral module must run in an independently
 * authenticated release service, NEVER in the Headquarters or website
 * runtime, NEVER with public endpoints, and NEVER with shared HQ credentials.
 *
 * It does not contain Cloudflare/GitHub deploy operations or real credentials.
 * A future external publisher must independently verify provider evidence,
 * review the exact preview hash and consume the signed approval only once.
 */
import {createHmac,randomUUID,sign,verify,timingSafeEqual} from 'node:crypto';

const SHA=/^[0-9a-f]{40}$/i;
const SYSTEMS=Object.freeze({
 website:{repo:'solopreneursid/YorpHives',project:'yorphives'},
 headquarters:{repo:'solopreneursid/yorpHives-2.0',project:'yorphives-admin-staging'}
});
const safeText=(v,n)=>typeof v==='string'&&v.length>0&&v.length<=n;
const nowMillis=v=>{
 const n=typeof v==='number'?v:new Date(v).getTime();
 return Number.isFinite(n)?n:NaN;
};
export function releaseBlockers(candidate,evidence,identity,time=Date.now()){
 const blocks=[];
 const fail=(condition,name)=>{if(!condition)blocks.push(name);};
 const spec=SYSTEMS[candidate?.system];
 fail(!!spec,'unknown_system');
 if(!spec)return blocks;
 fail(candidate?.repository===spec.repo,'repository_mismatch');
 fail(candidate?.cloudflare_project===spec.project,'project_mismatch');
 fail(SHA.test(String(candidate?.source_sha||'')),'invalid_sha');
 fail(safeText(candidate?.preview_deployment_id,64),'missing_preview_id');
 fail(safeText(candidate?.preview_url,256),'missing_preview_url');
 // The external release server MUST produce provider evidence from API GET,
 // not trust fields in a user-sent request.
 fail(evidence?.authenticated_provider_reads===true,'provider_evidence_unverified');
 fail(evidence?.github_repository===spec.repo,'source_provider_mismatch');
 fail(evidence?.cloudflare_project===spec.project,'deploy_provider_mismatch');
 fail(evidence?.preview_sha===candidate?.source_sha,'preview_sha_mismatch');
 fail(evidence?.preview_deployment_id===candidate?.preview_deployment_id,'preview_deployment_mismatch');
 fail(evidence?.preview_url===candidate?.preview_url,'preview_url_mismatch');
 fail(evidence?.preview_environment==='preview'&&evidence?.preview_http_verified===true,
   'preview_not_verified');
 fail(evidence?.reviewed_preview_sha===candidate?.source_sha &&
   evidence?.founder_preview_review_verified===true,'owner_preview_not_reviewed');
 fail(evidence?.tests_sha===candidate?.source_sha&&evidence?.required_ci_green===true,
   'ci_unverified');
 fail(evidence?.production_auto_deploy_disabled===true,'auto_deploy_enabled');
 fail(evidence?.rollback_artifact_verified===true,'rollback_unverified');
 fail(evidence?.production_runtime_has_write_credentials===false,'production_write_credentials');
 fail(evidence?.release_service_separate_from_hq===true,'hq_release_privilege');
 fail(evidence?.backup_restore_verified===true,'recovery_unverified');
 fail(identity?.jwt_signature_verified===true&&
   identity?.owner_role_verified===true&&
   safeText(identity?.subject,180),'owner_auth_unverified');
 const verifiedAt=nowMillis(evidence?.observed_at),now=nowMillis(time);
 fail(Number.isFinite(now)&&Number.isFinite(verifiedAt)&&
   verifiedAt<=now&&now-verifiedAt<=5*60*1000,'stale_provider_evidence');
 return blocks;
}
function totpAt(secret,counter){
 if(!Buffer.isBuffer(secret)||secret.length<20||!Number.isSafeInteger(counter)||counter<0)
  throw Error('OTP security configuration unavailable');
 const msg=Buffer.alloc(8);
 msg.writeBigUInt64BE(BigInt(counter));
 const digest=createHmac('sha1',secret).update(msg).digest();
 const offset=digest[digest.length-1]&15;
 const num=(digest.readUInt32BE(offset)&0x7fffffff)%1000000;
 return String(num).padStart(6,'0');
}
export function verifyTotpCounter({otp,secret,time=Date.now()}={}){
 if(typeof otp!=='string'||!/^[0-9]{6}$/.test(otp)||
    !Buffer.isBuffer(secret)||secret.length<20||
    !Number.isFinite(nowMillis(time)))return null;
 const counter=Math.floor(nowMillis(time)/30000);
 for(const drift of [-1,0,1]){
  const c=counter+drift;
  if(c<0)continue;
  const expected=Buffer.from(totpAt(secret,c),'utf8');
  if(timingSafeEqual(expected,Buffer.from(otp,'utf8')))return c;
 }
 return null;
}
export async function issueIndependentReleaseApproval({
 candidate,evidence,identity,otp,otpSecret,signingKey,
 abuseLimiter,oneTimeStore,time=Date.now()
}={}){
 const blockers=releaseBlockers(candidate,evidence,identity,time);
 if(blockers.length)return {approved:false,blocked:blocksRedacted(blockers),production_deployed:false};
 // All following are server-side adapters. Missing controls fail closed.
 if(typeof abuseLimiter?.enforce!=='function'||
    typeof oneTimeStore?.consume!=='function'||!signingKey)
  return {approved:false,blocked:['external_release_controls_not_configured'],
    production_deployed:false};
 const key=candidate.system+':'+identity.subject;
 const permitted=await abuseLimiter.enforce(key);
 if(permitted!==true)return {approved:false,blocked:['otp_rate_limited'],production_deployed:false};
 const counter=verifyTotpCounter({otp,secret:otpSecret,time});
 if(counter===null)return {approved:false,blocked:['owner_otp_invalid'],production_deployed:false};
 // Atomic durable uniqueness is required, not an in-memory Set in production.
 const consumed=await oneTimeStore.consume(key,counter);
 if(consumed!==true)return {approved:false,blocked:['owner_otp_replayed'],production_deployed:false};
 const issued=Math.floor(nowMillis(time));
 const payload=Object.freeze({
  version:1,mode:'independent_owner_review',system:candidate.system,
  repository:candidate.repository,project:candidate.cloudflare_project,
  source_sha:candidate.source_sha,preview_id:candidate.preview_deployment_id,
  issued_at:issued,expires_at:issued+120000,nonce:randomUUID(),
  // The executor must re-query source SHA/preview and require exact match.
  // The human founder is not allowed to publish using this module alone.
  production_deployment_authorized_for_exact_sha:true
 });
 const serialized=JSON.stringify(payload);
 const signature=sign(null,Buffer.from(serialized),signingKey).toString('base64url');
 return {approved:true,approval:{payload,signature},production_deployed:false};
}
function blocksRedacted(blocks){return blocks.slice(0,20);}
export function verifyIndependentReleaseApproval({approval,publicKey,time=Date.now()}={}){
 if(!approval||typeof approval.signature!=='string'||!approval.payload||
    !publicKey)return false;
 const p=approval.payload;
 if(p.version!==1||p.mode!=='independent_owner_review'||
   !SHA.test(String(p.source_sha||''))||
   !Number.isSafeInteger(p.issued_at)||!Number.isSafeInteger(p.expires_at)||
   nowMillis(time)>p.expires_at||nowMillis(time)<p.issued_at ||
   p.expires_at-p.issued_at!==120000||
   !safeText(p.nonce,64))return false;
 try{
  return verify(null,Buffer.from(JSON.stringify(p)),publicKey,
   Buffer.from(approval.signature,'base64url'));
 }catch{return false;}
}
export const RELEASE_SYSTEMS=SYSTEMS;
