import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateRetiredAccessApps,inspectRetiredAccess}
 from '../scripts/headquarters-retired-access-audit.mjs';

const base='yorphives-2-preview.pages.dev';
const idA='84d51a85-aea9-489c-9fbd-3ef5dbf3c4b3';
const idB='a7cee007-a186-48a4-a027-980fb6f5ed6f';
const appList=()=>[
 {id:idA,type:'self_hosted',domain:base},
 {id:idB,type:'self_hosted',domain:'*.'+base}
];
test('retired historical preview Access must protect base and wildcard with no allowed identities',()=>{
 const report=evaluateRetiredAccessApps(appList(),{[idA]:[],[idB]:[]});
 assert.equal(report.retired_preview_hostname_default_denied,true);
 assert.equal(report.anonymous_http_denial_verified,false);
 assert.equal(report.pages_deployment_history_audited,false);
 assert.equal(report.cloudflare_resources_modified,false);
 assert.equal(report.checks.length,2);
 assert.doesNotMatch(JSON.stringify(report),new RegExp(idA+'|'+idB));
});
test('missing wildcard, duplicate or wrong-type apps fail closed',()=>{
 for(const apps of [
  [appList()[0]],
  [...appList(),appList()[1]],
  [{...appList()[0],type:'saas'},appList()[1]]
 ]){
  assert.equal(evaluateRetiredAccessApps(apps,{[idA]:[],[idB]:[]})
   .retired_preview_hostname_default_denied,false);
 }
});
test('any historic Allow, bypass, or unknown policy blocks default-deny qualification',()=>{
 for(const decision of ['allow','bypass','non_identity','block']){
  const r=evaluateRetiredAccessApps(appList(),{[idA]:[],[idB]:[{decision}]});
  assert.equal(r.retired_preview_hostname_default_denied,false,decision);
  if(decision!=='block')assert.equal(r.checks[1].allow_policy_detected,true);
 }
});
test('provider Access inspection executes only fixed read-only GET requests',async()=>{
 const accountId='a'.repeat(32),apiToken='UNPRINTABLE_TEST_SECRET';
 const seen=[];
 const fetcher=async(url,options)=>{
  assert.equal(options.method,'GET');
  assert.equal(options.redirect,'manual');
  assert.equal(options.headers.authorization,'Bearer '+apiToken);
  seen.push(url);
  return new Response(JSON.stringify({success:true,result:
   url.endsWith('/access/apps')?appList():[]
  }),{status:200,headers:{'content-type':'application/json'}});
 };
 const r=await inspectRetiredAccess({accountId,apiToken,fetcher});
 assert.equal(r.retired_preview_hostname_default_denied,true);
 assert.equal(seen.length,3);
 assert.deepEqual(seen,[
  'https://api.cloudflare.com/client/v4/accounts/'+accountId+'/access/apps',
  'https://api.cloudflare.com/client/v4/accounts/'+accountId+'/access/apps/'+idA+'/policies',
  'https://api.cloudflare.com/client/v4/accounts/'+accountId+'/access/apps/'+idB+'/policies'
 ]);
 assert.doesNotMatch(JSON.stringify(r),/UNPRINTABLE_TEST_SECRET/);
});
test('unavailable policy read never becomes a successful Access attestation',async()=>{
 await assert.rejects(inspectRetiredAccess({
  accountId:'a'.repeat(32),apiToken:'UNPRINTABLE_TEST_SECRET',
  fetcher:async()=>{throw Error('Bearer UNPRINTABLE_TEST_SECRET failed');}
 }),/Access evidence unavailable/);
});
