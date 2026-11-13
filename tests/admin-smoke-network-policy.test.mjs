import test from "node:test";
import assert from "node:assert/strict";
import {privatePreviewOrigin,isAllowedPreviewBrowserRequest,
 makePrivatePreviewAccessRouter} from "../scripts/admin-smoke-network-policy.mjs";
const origin="https://aaa7346f.yorphives-admin-staging.pages.dev";
test("browser access credentials are scoped to one real private Pages preview",()=>{
 assert.equal(privatePreviewOrigin(origin),true);
 for(const value of [
  "https://yorphives.com","http://aaa7346f.yorphives-admin-staging.pages.dev",
  "https://abc.yorphives-admin-staging.pages.dev",
  "https://aaa7346f.yorphives-admin-staging.pages.dev.attacker.example",
  "https://aaa7346f.yorphives-admin-staging.pages.dev/login",
  "https://aaa7346f.yorphives-admin-staging.pages.dev?query=1"
 ])assert.equal(privatePreviewOrigin(value),false);
 assert.equal(isAllowedPreviewBrowserRequest(origin+"/admin/",origin),true);
 assert.equal(isAllowedPreviewBrowserRequest(origin+"/api/admin/yorpmind",origin),true);
 assert.equal(isAllowedPreviewBrowserRequest("https://evil.example/steal",origin),false);
 assert.equal(isAllowedPreviewBrowserRequest("https://aaa7346f.yorphives-admin-staging.pages.dev.evil.example/steal",origin),false);
});
test("external resource cannot receive a service token, and redirects are never followed",async()=>{
 const invoked=[];
 const router=makePrivatePreviewAccessRouter({origin,clientId:"test-id",clientSecret:"test-secret"});
 const fake=url=>({
  request(){return {url:()=>url,headers:()=>({accept:"text/html"})};},
  async abort(reason){invoked.push({action:"blocked",reason})},
  async fetch(options){invoked.push({action:"fetch",options});return new Response(null,{status:302,headers:{location:"https://evil.example"}})},
  async fulfill(options){invoked.push({action:"fulfill",response:options.response.status})}
 });
 await router(fake("https://evil.example/attack"));
 assert.equal(invoked[0].action,"blocked");
 assert.equal(invoked.some(x=>x.action==="fetch"),false);
 await router(fake(origin+"/admin/"));
 assert.equal(invoked[1].action,"fetch");
 assert.equal(invoked[1].options.maxRedirects,0);
 assert.equal(invoked[1].options.headers["CF-Access-Client-Secret"],"test-secret");
 assert.equal(invoked[2].action,"fulfill");
 assert.equal(invoked[2].response,302);
 await router(fake("https://evil.example/redirect"));
 assert.equal(invoked.at(-1).action,"blocked");
});
test("browser smoke cannot leak Access credentials through context-wide headers",async()=>{
 const {readFile}=await import("node:fs/promises");
 const content=await readFile(new URL("../scripts/admin-smoke.mjs",import.meta.url),"utf8");
 assert.match(content,/serviceWorkers: "block"/);
 assert.match(content,/context\.routeWebSocket/);
 assert.match(content,/makePrivatePreviewAccessRouter/);
 assert.doesNotMatch(content,/extraHTTPHeaders:\s*accessHeaders/);
});
