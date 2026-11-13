import {
  adminJson, isAdminResponse, requireAdmin, type AdminRequestContext
} from "../../_lib/admin-auth";
import { checkPublicWebsite } from "../../_lib/website-proof.js";

interface SiteProofCheck {
  path:string;
  title:string;
  expected_format:string;
  status:"verified_basic"|"needs_attention"|"not_verified";
  http_status:number|null;
  content_type:string;
  note:string;
  security:{https_redirect_persistence:boolean;embedding_protection:boolean}|null;
}
interface SiteProofResponse {
  source:"real_public_http_get";
  origin:string;
  checked_at:string;
  total:number;
  basic_passed:number;
  needs_attention:number;
  unverified:number;
  overall:"needs_attention"|"inconclusive"|"basic_routes_passed";
  checks:SiteProofCheck[];
  documents_proven_fully_correct:false;
  previous_findings_auto_resolved:false;
  new_ai_model_calls:0;
  database_writes:0;
  production_changes:0;
}

function plainSummary(data:SiteProofResponse):Response {
  const rows=[
    "# Your website: direct public check",
    "",
    "Checked: "+data.checked_at,
    "Source: read-only requests to "+data.origin,
    "Result: "+data.overall.replaceAll("_"," "),
    "Basic checks passed: "+data.basic_passed+"/"+data.total,
    "Need attention: "+data.needs_attention,
    "Could not verify: "+data.unverified,
    "",
    "## Individual addresses",
    ...data.checks.map(item=>"- "+item.path+": "+item.status.replaceAll("_"," ")+
      " (HTTP "+(item.http_status??"unknown")+", expected "+item.expected_format+
      "). "+item.note),
    "",
    "These checks are not full security or functional audits.",
    "Old findings were not automatically closed.",
    "AI model calls: 0. Database writes: 0. Production changes: 0."
  ];
  return new Response(rows.join("\n")+"\n",{
    status:200,
    headers:{
      "content-type":"text/markdown; charset=utf-8",
      "cache-control":"no-store",
      "vary":"Accept",
      "x-content-type-options":"nosniff",
      "referrer-policy":"no-referrer"
    }
  });
}

export async function onRequestGet(context:AdminRequestContext):Promise<Response> {
  const identity = await requireAdmin(context);
  if (isAdminResponse(identity)) return identity;
  try {
    const data = await checkPublicWebsite() as SiteProofResponse;
    if(context.request.headers.get("accept")?.includes("text/markdown")) {
      return plainSummary(data);
    }
    const response=adminJson(data);
    response.headers.set("cache-control","no-store");
    response.headers.set("vary","Accept");
    response.headers.set("x-content-type-options","nosniff");
    response.headers.set("referrer-policy","no-referrer");
    return response;
  } catch {
    return adminJson({error:{
      code:"WEBSITE_PROOF_UNAVAILABLE",
      message:"The read-only website check is temporarily unavailable. Nothing was changed."
    },new_ai_model_calls:0,database_writes:0,production_changes:0},503);
  }
}
