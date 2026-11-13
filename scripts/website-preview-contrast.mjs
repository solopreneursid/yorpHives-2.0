/**
 * Compare actual public responses against an existing isolated Pages preview.
 * The preview address must be a verified YorpHives Pages deployment ID.
 * No alternate hostname, browser credentials, write method or redirect follows.
 */
import {mkdir,writeFile} from "node:fs/promises";
import {resolve,dirname} from "node:path";
import {fileURLToPath} from "node:url";
import {
  checkPublicWebsite,WEBSITE_PROOF_ORIGIN,WEBSITE_PROOF_TARGETS
} from "../functions/_lib/website-proof.js";

const preview=(process.env.YORPHIVES_PAGES_PREVIEW||"").trim();
const previewSha=(process.env.YORPHIVES_PAGES_PREVIEW_SHA||"").trim();
const exactPreview=/^https:\/\/[a-f0-9]{8}\.yorphives-2-preview\.pages\.dev$/;
if(!exactPreview.test(preview)||!/^[a-f0-9]{40}$/.test(previewSha)){
  throw new Error("Only a pinned YorpHives preview URL and known SHA are permitted.");
}
const allowedPaths=new Set(WEBSITE_PROOF_TARGETS.map(x=>x.path));
const requests=[];
const previewFetch=async (requestUrl, options)=>{
  const url=new URL(requestUrl);
  if(url.origin!==WEBSITE_PROOF_ORIGIN||url.search||url.hash||
    !allowedPaths.has(url.pathname)||options?.method!=="GET"||
    options?.redirect!=="manual"){
    throw new Error("Preview verification tried an unapproved request.");
  }
  requests.push(url.pathname);
  return fetch(preview+url.pathname,options);
};

const production=await checkPublicWebsite();
const preliminary=await checkPublicWebsite(previewFetch);
if(requests.length!==7||
   requests.some(x=>!allowedPaths.has(x))||
   production.total!==7||preliminary.total!==7||
   production.new_ai_model_calls!==0||preliminary.new_ai_model_calls!==0||
   production.database_writes!==0||preliminary.database_writes!==0||
   production.production_changes!==0||preliminary.production_changes!==0){
  throw new Error("Read-only comparison failed its fixed-route safety contract.");
}
const pairs=WEBSITE_PROOF_TARGETS.map(item=>{
  const live=production.checks.find(x=>x.path===item.path);
  const staging=preliminary.checks.find(x=>x.path===item.path);
  return {
    path:item.path,live_status:live.status,live_content_type:live.content_type,
    live_http_status:live.http_status,live_reason:live.note,
    preview_status:staging.status,preview_content_type:staging.content_type,
    preview_http_status:staging.http_status,preview_reason:staging.note,
    improved:live.status!=="verified_basic"&&staging.status==="verified_basic",
    confirmed_against_matching_head:false
  };
});
const full={
  evidence_source:"actual_uncredentialed_http_get_from_github_runner",
  public_origin:WEBSITE_PROOF_ORIGIN,
  isolated_preview_origin:preview,
  preview_deployment_sha_recorded_in_cloudflare:previewSha,
  tested_repository_sha:process.env.GITHUB_SHA||null,
  preview_sha_matches_tested_repo:previewSha===(process.env.GITHUB_SHA||""),
  checked_at:new Date().toISOString(),
  live_summary:production.overall,
  preview_summary:preliminary.overall,
  improved_route_count:pairs.filter(x=>x.improved).length,
  compared:7,
  routes:pairs,
  does_not_verify_entire_application:true,
  no_automatic_release:true,
  no_automatic_learning_promotion:true,
  ai_calls:0,
  database_writes:0,
  production_changes:0
};
const folder=resolve(dirname(fileURLToPath(import.meta.url)),"../artifacts/website-public-proof");
await mkdir(folder,{recursive:true});
await writeFile(resolve(folder,"preview-comparison.json"),JSON.stringify(full,null,2)+"\n");
console.log("Public versus isolated preview (GET only):");
for(const p of pairs){
  console.log(p.path+": live "+p.live_status+" ("+p.live_content_type+
    ") → preview "+p.preview_status+" ("+p.preview_content_type+")");
}
console.log(JSON.stringify({
  public:full.live_summary,preview:full.preview_summary,
  improved:full.improved_route_count,compared:full.compared,
  preview_matches_current_code:full.preview_sha_matches_tested_repo,
  report:"artifacts/website-public-proof/preview-comparison.json",
  no_changes:full.production_changes===0
}));
