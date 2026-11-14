/** Read-only, provider-neutral Connect 2026 website capability verifier.
 * This verifies public METADATA, not real agent runtime, identity or payment.
 * No arbitrary URLs, credentials, customer inputs, transactions or execution.
 */
const JSON_TYPE=/^application\/json(?:\s*;|\s*$)/i;
const VALID_SLUG=/^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function inspectAgentCapabilitiesResponse(mediaType,raw) {
 const fail=reason=>({ok:false,reason});
 if(typeof mediaType!=='string'||!JSON_TYPE.test(mediaType)||
    typeof raw!=='string'||Buffer.byteLength(raw,'utf8')>65536)
   return fail('agentic_metadata_invalid');
 let data;
 try{data=JSON.parse(raw);}catch{return fail('agentic_metadata_invalid');}
 if(!data||typeof data!=='object'||Array.isArray(data)||
    data.schema_version!==1||data.source!=='yorphives-website'||
    data.canonical_origin!=='https://yorphives.com'||
    data.agentic_internet_model!=='readable-discoverable-callable-payable')
   return fail('agentic_metadata_invalid');
 if(data.readable?.status!=='available'||data.readable?.text_index!=='/llms.txt'||
    data.discoverable?.status!=='available'||
    data.discoverable?.catalogue!=='/api/v1/free-tools'||
    data.discoverable?.manifest!=='/free-tools/manifest.json')
   return fail('agentic_metadata_invalid');
 const web=data.callable?.browser_local_webmcp;
 const tools=web?.tools;
 if(web?.status!=='experimental-browser-dependent'||web.entrypoint!=='/free-tools/file-studio/'||
    !Array.isArray(tools)||tools.length<1||tools.length>32)
   return fail('agentic_metadata_invalid');
 const slugs=new Set(),names=new Set();
 for(const t of tools){
  if(!t||typeof t!=='object'||!VALID_SLUG.test(t.slug||'')||t.slug.length>90||
     t.execution!=='browser_local'||t.requires_browser_webmcp!==true||
     t.public_url!=='/free-tools/'+t.slug+'/'||
     !/^[a-z][a-z0-9_]{5,80}$/.test(t.tool_name||'')||
     slugs.has(t.slug)||names.has(t.tool_name))
     return fail('agentic_metadata_invalid');
  slugs.add(t.slug);names.add(t.tool_name);
 }
 if(data.agent_identity?.private_hq_exposed!==false||
    data.agent_identity?.web_bot_auth_verification_implemented!==false ||
    data.callable?.remote_mcp?.status!=='not_published' ||
    data.callable?.remote_mcp?.endpoint!==null ||
    data.callable?.server_side_product_execution?.status!=='not_published')
   return fail('agentic_metadata_invalid');
 const pay=data.payable;
 // HQ cannot infer a real payment from metadata: if a future branch enables
 // payment features, hold all "healthy agent commerce" claims for independent
 // identity, settlement and receipt verification before product classification.
 if(pay?.status!=='not_enabled'||pay.chargeable_endpoints!==0||
    !Array.isArray(pay.payment_protocols_enabled)||pay.payment_protocols_enabled.length)
   return fail('agentic_payment_unverified');
 return {ok:true,reason:'agentic_metadata_verified',
   capability_count:tools.length,payment_verified:false,
   webmcp_execution_verified:false,identity_verified:false};
}
