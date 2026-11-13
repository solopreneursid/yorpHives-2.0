import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  expectedAssetFormat, assessAssetRepresentation, isMachineReadableAsset
} from "../admin-monitor/asset-policy.js";
import { assessRepairIntake } from "../functions/_lib/repair-intake.js";
import { readWorkersAiText, parseWorkersAiJson } from "../admin-agent/model-output.js";

const asset=(path,type="discovery")=>({
  url:"https://yorphives.com"+path,type,title:"Evidence"
});

test("HTML canonical tags are not a requirement for discovery manifests, YAML or APIs",()=>{
  for(const [path,format] of [
    ["/free-tools/manifest.json","json"],
    ["/.well-known/yorphives.json","json"],
    ["/api/v1/free-tools","json"],
    ["/llms.txt","text"],
    ["/robots.txt","text"],
    ["/openapi.yaml","yaml"],
    ["/sitemap.xml","xml"]
  ]) {
    const item=asset(path,path.includes("/api/")?"api":"discovery");
    assert.equal(expectedAssetFormat(item),format);
    assert.equal(isMachineReadableAsset(item),true);
    const wrong=assessAssetRepresentation(item,"text/html; charset=utf-8",
      "<!doctype html><html><head><title>Fallback</title></head></html>");
    assert.equal(wrong.ok,false,path);
    assert.equal(wrong.code,"unexpected-representation",path);
    assert.equal(wrong.is_html_page,false,path);
  }
  assert.equal(expectedAssetFormat(asset("/","website_page")),"html");
  assert.equal(isMachineReadableAsset(asset("/","website_page")),false);
});

test("real discovery documents are validated by format without asking for HTML metadata",()=>{
  const valid=[
    [asset("/free-tools/manifest.json"),"application/json","[]","json"],
    [asset("/.well-known/yorphives.json"),"application/json",'{"name":"YorpHives"}',"json"],
    [asset("/api/v1/free-tools","api"),"application/json",'{"data":[]}',"json"],
    [asset("/llms.txt"),"text/plain","# YorpHives\nPublic discovery.","text"],
    [asset("/robots.txt"),"text/plain","User-agent: *\nAllow: /","text"],
    [asset("/openapi.yaml"),"text/yaml","openapi: 3.1.0\ninfo:\n  title: YorpHives","yaml"],
    [asset("/sitemap.xml"),"application/xml",'<?xml version="1.0"?><urlset></urlset>',"xml"],
    [asset("/","website_page"),"text/html","<!doctype html><html></html>","html"]
  ];
  for(const [item,format,body,expected] of valid){
    const response=assessAssetRepresentation(item,format,body);
    assert.equal(response.ok,true,item.url+":"+response.reason);
    assert.equal(response.kind,expected);
  }
  assert.equal(assessAssetRepresentation(asset("/free-tools/manifest.json"),
    "application/json","<html>wrong</html>").ok,false);
  assert.equal(assessAssetRepresentation(asset("/free-tools/manifest.json"),
    "application/json","{invalid").code,"invalid-json");
  assert.equal(assessAssetRepresentation(asset("/free-tools/manifest.json"),
    "application/json",'{"wrong":"shape"}').code,"invalid-json");
  assert.equal(assessAssetRepresentation(asset("/openapi.yaml"),
    "text/plain","<!doctype html><html></html>").ok,false);
});

test("unfixable monitoring categories never consume the restricted AI repair budget",()=>{
  const fixed={finding_source:"asset",status:"investigating",asset_type:"discovery",
    asset_url:"https://yorphives.com/openapi.yaml",finding_key:"missing-canonical",category:"seo"};
  const notEligible=assessRepairIntake(fixed);
  assert.equal(notEligible.permitted,false);
  assert.equal(notEligible.code,"SPECIALIST_REVIEW_REQUIRED");
  assert.equal(notEligible.spending_started,false);
  const relative = assessRepairIntake({...fixed,asset_url:"/openapi.yaml"});
  assert.equal(relative.code,"SPECIALIST_REVIEW_REQUIRED",
    "The actual D1 stores asset paths as relative paths.");
  assert.equal(assessRepairIntake({...fixed,asset_url:"https://evil.example/openapi.yaml"}).code,
    "INVALID_ASSET_URL");
  for(const path of ["/llms.txt","/api/v1/free-tools",
    "/free-tools/manifest.json","/.well-known/yorphives.json"]) {
    assert.equal(assessRepairIntake({...fixed,asset_url:"https://yorphives.com"+path}).permitted,false);
  }
  assert.equal(assessRepairIntake({...fixed,asset_type:"website_page",
    asset_url:"https://yorphives.com/free-tools/",category:"security",
    finding_key:"missing-hsts"}).code,"SECURITY_SPECIALIST_REQUIRED");
  assert.equal(assessRepairIntake({...fixed,asset_type:"website_page",
    asset_url:"https://yorphives.com/free-tools/",category:"seo",
    finding_key:"missing-title"}).permitted,true);
  assert.equal(assessRepairIntake({...fixed,asset_type:"website_page",
    asset_url:"/free-tools/",category:"seo",finding_key:"missing-title"}).permitted,true);
  assert.equal(assessRepairIntake({...fixed,status:"fixed"}).code,"FINDING_NOT_ACTIVE");
  assert.equal(assessRepairIntake({finding_source:"monitor",status:"verified"}).permitted,false);
});

test("Workers AI response reader supports wrappers but never executes its reasoning",()=>{
  const patch='{"summary":"Contains { braces }","changes":[{"path":"app.js","content":"let x = \\"{ok}\\";"}]}';
  assert.equal(readWorkersAiText({response:patch}),patch);
  assert.equal(readWorkersAiText({result:{response:patch}}),patch);
  assert.equal(readWorkersAiText({choices:[{message:{content:patch}}]}),patch);
  assert.equal(readWorkersAiText({output:[{type:"output_text",text:patch}]}),patch);
  assert.equal(parseWorkersAiJson("Here is the result:\n```json\n"+patch+"\n```").summary,
    "Contains { braces }");
  assert.throws(()=>readWorkersAiText({response:""}),/MODEL_OUTPUT_EMPTY/);
  assert.throws(()=>readWorkersAiText({reasoning_content:"private reasoning only"}),
    /MODEL_OUTPUT_EMPTY/);
  assert.throws(()=>readWorkersAiText({choices:[{finish_reason:"length",
    message:{content:patch}}]}),/MODEL_OUTPUT_TRUNCATED/);
  assert.throws(()=>parseWorkersAiJson("<think>just thoughts</think>"),/MODEL_JSON_INVALID/);
});

test("monitor maintains safe findings while retired repair route never dispatches",async()=>{
  const monitor=await readFile(new URL("../admin-monitor/asset-intelligence.js",import.meta.url),"utf8");
  const worker=await readFile(new URL("../admin-agent/worker.js",import.meta.url),"utf8");
  const router=await readFile(new URL("../functions/api/admin/repair-jobs.ts",import.meta.url),"utf8");
  assert.match(monitor,/assessAssetRepresentation\(asset, contentType, body\)/);
  assert.match(monitor,/isMachineReadableAsset\(asset\)/);
  assert.match(monitor,/classification: "not_applicable"/);
  assert.match(router,/MONITOR_ONLY/);
  assert.match(router,/dispatch_performed: false/);
  assert.match(worker,/readWorkersAiText\(response\)/);
  assert.match(worker,/reasoning_effort: "medium"/);
  assert.doesNotMatch(worker,/retries: \{ limit: 1/);
  assert.equal((worker.match(/retries: \{ limit: 0/g)||[]).length,2);
});
