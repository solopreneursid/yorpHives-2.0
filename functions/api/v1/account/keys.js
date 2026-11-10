import { requireSession } from "../../../_lib/session.js";
import { readJson, json } from "../../../_lib/http.js";
import { createApiSecret, sha256Hex } from "../../../_lib/security.js";
import { audit } from "../../../_lib/platform.js";
const ALLOWED=new Set(["identity:read","capability:execute","usage:read","credits:read","keys:manage","commerce:checkout","commerce:orders:read"]);
export async function onRequestPost({request,env}){
 const auth=await requireSession(request,env,{csrf:true});if(!auth.ok)return auth.response;
 const parsed=await readJson(request),b=parsed.value;if(!parsed.ok||!b||typeof b!=="object"||typeof b.label!=="string"||b.label.trim().length<1||b.label.length>80||!Array.isArray(b.scopes)||!b.scopes.length||b.scopes.some(s=>!ALLOWED.has(s))||new Set(b.scopes).size!==b.scopes.length)return json({error:{code:"INVALID_KEY_POLICY",message:"Provide a label and valid, unique API scopes."}},422);
 const appId=b.application_id||null;if(appId){const app=await env.DB.prepare("SELECT id FROM applications WHERE id=? AND owner_principal_id=? AND status='active'").bind(appId,auth.session.id).first();if(!app)return json({error:{code:"APPLICATION_NOT_FOUND",message:"The application is not owned by this account."}},404);}
 const {secret,prefix}=createApiSecret(),id=crypto.randomUUID(),now=new Date().toISOString();
 await env.DB.prepare("INSERT INTO api_keys (id,principal_id,prefix,secret_hash,label,scopes_json,created_at,application_id) VALUES (?,?,?,?,?,?,?,?)").bind(id,auth.session.id,prefix,await sha256Hex(secret),b.label.trim(),JSON.stringify(b.scopes),now,appId).run();
 await audit(env,{actorId:auth.session.id,action:"api_key.created",targetType:"api_key",targetId:id,metadata:{scopes:b.scopes,application_id:appId}});
 return json({data:{id,prefix,label:b.label.trim(),scopes:b.scopes,secret,shown_once:true}},201,{"Cache-Control":"no-store"});
}
export async function onRequestDelete({request,env}){
 const auth=await requireSession(request,env,{csrf:true});if(!auth.ok)return auth.response;
 const id=new URL(request.url).searchParams.get("id");if(!id)return json({error:{code:"MISSING_KEY_ID",message:"Provide a key id."}},400);
 const result=await env.DB.prepare("UPDATE api_keys SET revoked_at=? WHERE id=? AND principal_id=? AND revoked_at IS NULL").bind(new Date().toISOString(),id,auth.session.id).run();
 if(!result.meta?.changes)return json({error:{code:"KEY_NOT_FOUND",message:"No active key exists for this account."}},404);
 await audit(env,{actorId:auth.session.id,action:"api_key.revoked",targetType:"api_key",targetId:id});
 return json({data:{id,revoked:true}},200,{"Cache-Control":"no-store"});
}
