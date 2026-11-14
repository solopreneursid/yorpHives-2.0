import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectLiveHeadquartersIsolation} from '../scripts/headquarters-cloudflare-preflight.mjs';

const accountId='a'.repeat(32),apiToken='SECRET_NOT_TO_PRINT',now=new Date('2026-11-14T12:00:00.000Z');
const project = (preview='84c324ac-f7dc-4304-80bf-8da16da18c4c')=>({
  name:'yorphives-admin-staging',
  production_branch:'build/yorphives-admin-reliability',
  source:{type:'github',config:{owner:'solopreneursid',repo_name:'yorpHives-2.0',
    production_branch:'build/yorphives-admin-reliability'}},
  deployment_configs:{
    preview:{d1_databases:{DB:{id:preview}}},
    production:{d1_databases:{DB:{id:'e8690813-b139-44a2-a1c7-bea2d2777ead'}}}
  }
});
const fetcher=data=>async(url,opts)=>{
 assert.equal(url,'https://api.cloudflare.com/client/v4/accounts/'+accountId+'/pages/projects/yorphives-admin-staging');
 assert.equal(opts.method,'GET');
 assert.equal(opts.headers.authorization,'Bearer '+apiToken);
 return new Response(JSON.stringify({success:true,result:data}),{
  status:200,headers:{'content-type':'application/json'}
 });
};
test('real Cloudflare metadata with a separate preview DB gives read-only isolation evidence',async()=>{
 const x=await inspectLiveHeadquartersIsolation({accountId,apiToken,fetcher:fetcher(project()),clock:()=>now});
 assert.equal(x.d1_isolated,true);
 assert.equal(x.staging_safe_to_test,true);
 assert.equal(x.production_deployment_authorized,false);
 assert.equal(x.migration_allowed,false);
 assert.equal(x.cloud_resources_modified,false);
 assert.equal(x.source,'live_cloudflare_pages_project_metadata');
 assert.doesNotMatch(JSON.stringify(x),/SECRET_NOT_TO_PRINT|e8690813|84c324ac/);
});
test('current shared preview/canonical D1 always blocks staging live tests',async()=>{
 const x=await inspectLiveHeadquartersIsolation({accountId,apiToken,
  fetcher:fetcher(project('e8690813-b139-44a2-a1c7-bea2d2777ead')),clock:()=>now});
 assert.equal(x.d1_isolated,false);
 assert.equal(x.staging_safe_to_test,false);
 assert.equal(x.production_deployment_authorized,false);
});
test('API failures or unavailable credentials never produce green evidence or secrets',async()=>{
 const r=await inspectLiveHeadquartersIsolation({accountId,apiToken,
  fetcher:async()=>{throw Error('Bearer SECRET_NOT_TO_PRINT: network rejected');},clock:()=>now});
 assert.equal(r.d1_isolated,false);
 assert.doesNotMatch(JSON.stringify(r),/SECRET_NOT_TO_PRINT/);
 const missing=await inspectLiveHeadquartersIsolation({accountId:'',apiToken:'',clock:()=>now});
 assert.equal(missing.d1_isolated,false);
});
test('wrong Cloudflare project branch and owner fail closed',async()=>{
 const x=project();x.source.config.owner='attacker';
 const r=await inspectLiveHeadquartersIsolation({accountId,apiToken,fetcher:fetcher(x),clock:()=>now});
 assert.equal(r.d1_isolated,false);
});
