/** Release OTP bindings never carry administrator authority or permit publishing. */
export const RELEASE_OTP_TEST_ONLY=true;
const SHA=/^[0-9a-f]{40}$/;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function releaseOtpPayload(binding){
 return JSON.stringify(["yorphives_go_live_v1",binding.target,binding.sha,
  binding.deployment_id,binding.preview_url,binding.pr_number]);
}
export function validatedReleaseBinding(ready,target,sha,deploymentId){
 if(!ready||ready.target!==target||ready.status!=="verified_preview"||
  ready.ready_for_preview!==true||ready.production_approved!==false||
  ready.production_deployment_enabled!==false||!Array.isArray(ready.blockers)||
  ready.blockers.length!==0||!SHA.test(sha||"")||!UUID.test(deploymentId||"")||
  ready.candidate?.target!==target||ready.candidate?.sha!==sha||
  ready.preview?.deploymentId!==deploymentId||
  !Number.isSafeInteger(ready.candidate.number)||ready.candidate.number<1)return null;
 const url=String(ready.preview?.url||"");
 try{
  const u=new URL(url);
  const expected=target==="website"?"yorphives-2-preview":
   target==="headquarters"?"yorphives-admin-staging":null;
  if(!expected||u.protocol!=="https:"||!u.hostname.endsWith("."+expected+".pages.dev")||
   u.hostname.split(".").length!==4||!u.hostname.split(".")[0].match(/^[a-z0-9-]+$/)||
   u.username||u.password||u.port||u.search||u.hash||u.pathname!=="/")return null;
 }catch{return null;}
 return {target,sha,deployment_id:deploymentId,preview_url:url,
  pr_number:ready.candidate.number};
}
export function sameReleaseBinding(stored,ready){
 if(!stored||!ready)return false;
 const expected=validatedReleaseBinding(ready,stored.target,stored.commit_sha,
  stored.preview_deployment_id);
 return Boolean(expected&&expected.preview_url===stored.preview_url&&
  expected.pr_number===stored.pr_number);
}
export function constantTimeHexEqual(a,b){
 if(typeof a!=="string"||typeof b!=="string"||a.length!==64||b.length!==64||
  !/^[a-f0-9]{64}$/i.test(a)||!/^[a-f0-9]{64}$/i.test(b))return false;
 let diff=0;for(let i=0;i<64;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);
 return diff===0;
}
