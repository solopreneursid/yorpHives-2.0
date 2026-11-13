import test from "node:test";
import assert from "node:assert/strict";
import { normalizeModelUsage } from "../hq-engine/usage-receipt.js";

test("model usage accepts bounded provider totals, never invents an invoice",()=>{
  const reported=normalizeModelUsage({usage:{prompt_tokens:123,completion_tokens:349,total_tokens:472}});
  assert.deepEqual(reported,{
    input_tokens:123,output_tokens:349,total_tokens:472,
    source:"provider_response",billing_verified:false,actual_cost_usd:null
  });
  assert.deepEqual(normalizeModelUsage({result:{usage:{
    prompt_tokens:10,completion_tokens:20
  }}}).total_tokens,30);
});
test("invalid, missing or model-authored usage cannot become validated spending",()=>{
  for(const bad of [null,{}, {usage:{prompt_tokens:"5",completion_tokens:12}},
    {usage:{prompt_tokens:-1,completion_tokens:4}},
    {usage:{prompt_tokens:Infinity,completion_tokens:3}},
    {usage:{prompt_tokens:3,completion_tokens:4,total_tokens:2}},
    {response:'{"usage":{"prompt_tokens":4,"completion_tokens":8}}'},
    {usage:{prompt_tokens:10000001,completion_tokens:1}}]){
    assert.equal(normalizeModelUsage(bad),null);
  }
});
