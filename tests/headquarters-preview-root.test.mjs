import test from "node:test";
import assert from "node:assert/strict";
import {onRequest,isHeadquartersPreviewRoot} from "../functions/_middleware.js";

const preview="https://3de503ca.yorphives-admin-staging.pages.dev";
async function request(url,{method="GET",accept="text/html"}={}){
 let passed=false;
 const response=await onRequest({
  request:new Request(url,{method,headers:{accept}}),
  next:async()=>{passed=true;return new Response("Unchanged public website",{status:200});}
 });
 return {response,passed};
}
test("Headquarters-only preview root redirects safely to its private dashboard",async()=>{
 const {response,passed}=await request(preview+"/?utm_source=chatgpt.com");
 assert.equal(passed,false);
 assert.equal(response.status,302);
 assert.equal(response.headers.get("location"),"/admin/");
 assert.equal(response.headers.get("cache-control"),"no-store, private");
 assert.equal(response.headers.get("referrer-policy"),"no-referrer");
 assert.equal(response.headers.get("strict-transport-security"),"max-age=31536000");
 assert.equal(response.headers.get("location").includes("utm_source"),false);
 const head=await request(preview+"/",{method:"HEAD"});
 assert.equal(head.response.status,302);
});
test("public YorpHives and other Pages projects keep their own homepage",async()=>{
 for(const origin of [
  "https://yorphives.com",
  "https://www.yorphives.com",
  "https://yorphives-2-preview.pages.dev",
  "https://8c21d1ed.yorphives-2-preview.pages.dev",
  "https://3de503ca.yorphives-admin-staging.pages.dev.attacker.example",
  "https://yorphives-admin-staging.pages.dev"
 ]){
  const {response,passed}=await request(origin+"/");
  assert.equal(response.status,200,origin);
  assert.equal(passed,true,origin);
 }
});
test("markdown, API and dashboard routes retain existing behavior",async()=>{
 for(const path of ["/admin/","/api/admin/go-live","/free-tools/"]){
  const {response,passed}=await request(preview+path);
  assert.equal(response.status,200);
  assert.equal(passed,true);
 }
 const markdown=await request(preview+"/?format=markdown");
 assert.equal(markdown.response.status,200);
 assert.match(markdown.response.headers.get("content-type"),/text\/markdown/);
 const acceptMarkdown=await request(preview+"/",{accept:"text/markdown"});
 assert.equal(acceptMarkdown.response.status,200);
 assert.equal(isHeadquartersPreviewRoot(new URL(preview+"/"),"POST",false),false);
});
