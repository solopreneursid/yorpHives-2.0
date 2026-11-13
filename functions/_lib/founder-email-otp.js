/**
 * Founder-only, action-bound email OTP primitives.
 * No code or key may be logged, returned to browsers, or given to agents.
 */
export const otpUUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const encoder=new TextEncoder();
export const validEmailAddress=(value)=>typeof value==="string" &&
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length<=254;
export const otpEnabled=(env,email)=>env?.FOUNDER_OTP_ENABLED==="yes" &&
  typeof env?.FOUNDER_OTP_HMAC_KEY==="string" &&
  encoder.encode(env.FOUNDER_OTP_HMAC_KEY).byteLength>=32 &&
  validEmailAddress(env?.FOUNDER_OTP_FROM) &&
  validEmailAddress(env?.FOUNDER_OWNER_EMAIL) &&
  env.FOUNDER_OWNER_EMAIL.toLowerCase()===String(email).toLowerCase() &&
  typeof env?.FOUNDER_MAIL?.send==="function";

export function generateSixDigitCode(){
  const sample=new Uint32Array(1);
  const range=1_000_000;
  const maximum=Math.floor(4294967296/range)*range;
  do{crypto.getRandomValues(sample);}while(sample[0]>=maximum);
  return String(sample[0]%range).padStart(6,"0");
}
export function normalizeGrantRequest(input){
  if(!input||typeof input!=="object"||Array.isArray(input)||
      !["yorpmind","chatgpt","both"].includes(input.assistant)||
      !["website","headquarters","both"].includes(input.scope)||
      !["review_findings","prepare_fixes","manage_staging"].includes(input.permission)||
      ![15,30,60].includes(input.duration_minutes)||
      input.confirm!==true||typeof input.purpose!=="string")return null;
  const purpose=input.purpose.trim();
  if(purpose.length<40||purpose.length>700||
     /[\u0000-\u001f\u007f]/.test(purpose))return null;
  return {assistant:input.assistant,scope:input.scope,
    permission:input.permission,duration_minutes:input.duration_minutes,purpose};
}
export function canonicalGrantPayload(input){
  return JSON.stringify([
    "assistant_grant_v1",input.assistant,input.scope,input.permission,
    input.duration_minutes,input.purpose
  ]);
}
const bytesToHex=(bytes)=>Array.from(bytes,x=>x.toString(16).padStart(2,"0")).join("");
export async function otpDigest(secret,id,owner,payload,code){
  if(!otpUUID.test(id)||!validEmailAddress(owner)||
    typeof code!=="string"||!/^[0-9]{6}$/.test(code)||
    typeof secret!=="string"||encoder.encode(secret).byteLength<32)
    throw new Error("Invalid OTP context");
  const key=await crypto.subtle.importKey("raw",encoder.encode(secret),
    {name:"HMAC",hash:"SHA-256"},false,["sign"]);
  const signed=await crypto.subtle.sign("HMAC",key,
    encoder.encode("yorphives-otp-v1\n"+id+"\n"+owner.toLowerCase()+
      "\n"+payload+"\n"+code));
  return bytesToHex(new Uint8Array(signed));
}
