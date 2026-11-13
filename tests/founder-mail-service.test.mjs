import test from "node:test";
import assert from "node:assert/strict";
import worker from "../founder-mail/worker.mjs";
import {otpEnabled,sendFounderMail,founderEmailToken} from "../functions/_lib/founder-email-otp.js";

const FROM="security@approvals.yorphives.com";
const TO="owner@example.com";
const valid={
  from:FROM,to:TO,
  subject:"YorpHives Founder Control · one-time approval code",
  text:"Your YorpHives approval code is 512345\nAssistant: YorpMind\nWork: prepare_fixes / headquarters\nDuration: 15 minutes\n"
};
function ctx(body=valid,method="POST",headers={}){
  return new Request("https://founder-mail.internal/internal/founder-email",{
    method,headers:{"content-type":"application/json",...headers},
    ...(method==="POST"?{body:JSON.stringify(body)}:{})
  });
}
test("internal-only mail worker sends only verified recipient and expected email shape",async()=>{
  const outgoing=[];
  const env={FOUNDER_DESTINATION:TO,EMAIL:{send:async value=>{
    outgoing.push(value);return {messageId:"fixture"};
  }}};
  assert.equal((await worker.fetch(ctx(),env)).status,200);
  assert.equal(outgoing.length,1);
  assert.equal(outgoing[0].to,TO);
  assert.equal(outgoing[0].from,FROM);
  assert.equal((await worker.fetch(ctx({...valid,to:"outsider@example.com"}),env)).status,400);
  assert.equal((await worker.fetch(ctx({...valid,subject:"Other"}),env)).status,400);
  assert.equal((await worker.fetch(ctx({...valid,text:"Ping"}),env)).status,400);
  assert.equal((await worker.fetch(ctx(valid,"GET"),env)).status,404);
  assert.equal((await worker.fetch(ctx(),{FOUNDER_DESTINATION:TO})).status,503);
  assert.equal((await worker.fetch(ctx(),{FOUNDER_DESTINATION:TO,EMAIL:{
    send:async()=>{throw Error("failure");}
  }})).status,503);
  assert.equal(outgoing.length,1,"rejected email requests never hit the sender");
});
test("OTP sends through private service binding only after receipt",async()=>{
  const config={
    FOUNDER_OTP_ENABLED:"yes",FOUNDER_OTP_HMAC_KEY:"test test test 32 bytes and some extra characters",
    FOUNDER_OWNER_EMAIL:TO,FOUNDER_OTP_FROM:FROM,
    FOUNDER_MAIL:{fetch:async request=>{
      assert.equal(new URL(request.url).pathname,"/internal/founder-email");
      const value=await request.json();
      assert.equal(value.to,TO);
      return new Response(JSON.stringify({accepted:true}),{
        headers:{"content-type":"application/json"}});
    }}
  };
  assert.equal(otpEnabled(config,TO),true);
  assert.equal(otpEnabled({...config,FOUNDER_OTP_ENABLED:"no"},TO),false);
  assert.equal(otpEnabled(config,"not-owner@example.com"),false);
  assert.equal(await sendFounderMail(config,valid),true);
  await assert.rejects(()=>sendFounderMail({
    ...config,FOUNDER_MAIL:{fetch:async()=>Response.json({accepted:false})}
  },valid));
});

test("single copy/paste whitespace prefix is recognized without revealing the secret",()=>{
  const token="demo-a-32-character-or-longer-email-token-only";
  const config={FOUNDER_OTP_ENABLED:"yes",FOUNDER_OTP_HMAC_KEY:"a".repeat(48),
    FOUNDER_OWNER_EMAIL:TO,FOUNDER_OTP_FROM:FROM,
    FOUNDER_CF_ACCOUNT_ID:"123456789abcdef0123456789abcdef0",
    "\\tFOUNDER_EMAIL_API_TOKEN":token};
  // JavaScript interprets the key above as a literal backslash+t; mimic the
  // actual whitespace-prefixed key received from Cloudflare.
  delete config["\\tFOUNDER_EMAIL_API_TOKEN"];
  config["\tFOUNDER_EMAIL_API_TOKEN"]=token;
  assert.equal(founderEmailToken(config),token);
  assert.equal(otpEnabled(config,TO),true);
  assert.equal(founderEmailToken({...config,FOUNDER_EMAIL_API_TOKEN:"canonical"}),"canonical");
  assert.equal(founderEmailToken({...config," FOUNDER_EMAIL_API_TOKEN":"other"}),"");
  assert.equal(founderEmailToken({}),"");
});
