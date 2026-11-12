// Bounded, curated taxonomy: established tool types, not a demand forecast.
// Never fetch these category labels from AI output or untrusted external text.
const entry=(key,title,scale,risk,pattern,userJob,agentJob,monetizationModel,inventoryPattern)=>({
 key,title,scale,risk,pattern,userJob,agentJob,monetizationModel,inventoryPattern
});
export const DEMAND_CATEGORIES=Object.freeze([
 entry("pdf_tools","PDF & document utilities","free_tool","medium",
   /\b(pdf|pdfs|pdfkit|pdfjs|pdf-lib|document converter|document processing)\b/i,
   "Merge, split, compress and convert documents.", "Transform uploaded documents through explicit authorized tools.",
   "Free utilities with contextual ads; privacy-preserving paid batch jobs.",/\b(pdf|jpg-to-pdf|document)\b/i),
 entry("image_tools","Image editing & conversion","free_tool","medium",
   /\b(image (?:compress|conver|resiz|optimiz|edit|crop)|photo (?:edit|resiz|compress)|webp|heic|background remov|png to jpg|jpeg to png)\w*/i,
   "Resize, compress, convert and adjust images.", "Transform permitted images through bounded processing APIs.",
   "Free processing plus optional paid bulk/automation.",/\b(image|webp|heic|background-remover|color-palette)\b/i),
 entry("qr_tools","QR code & data-sharing generators","free_tool","low",
   /\b(qr[ -]?code|wifi[ -]?qr|vcard[ -]?qr|qr[ -]?generator)\b/i,
   "Generate and scan reliable QR codes.", "Programmatically create downloadable codes for authorized links.",
   "Free generator; optional branded/bulk exports.",/\b(qr|vcard-qr|wifi-qr)\b/i),
 entry("text_tools","Writing & text utilities","free_tool","low",
   /\b(word counter|character counter|case convert|text diff|remove duplicates|grammar checker|readability tool|markdown editor|text formatter)\b/i,
   "Edit, check and transform everyday text.", "Normalize, validate and compare documents or text.",
   "Free SEO-entry utilities; paid batch workflow optional.",/\b(word|character|case-converter|text-diff|markdown|line-remover)\b/i),
 entry("calculators","Calculators & converters","free_tool","low",
   /\b(calculator|unit convert|age calculat|percentag|currency convert|timezone convert|measurement convert|interest calculator)\w*/i,
   "Quickly calculate everyday values.", "Call predictable arithmetic or conversion APIs with auditable inputs.",
   "Search-led free tools; optional no-ad pro bundles.",/\b(calculator|converter|unit-converter|timestamp|timezone)\b/i),
 entry("developer_tools","Developer utilities & validators","free_tool","low",
   /\b(json format|json validat|yaml|xml format|regex test|jwt decod|uuid generat|developer tool|api test|webhook tester|cron expression|base64 encoder)\w*/i,
   "Validate, convert and debug developer inputs.", "Execute isolated deterministic validation or conversion calls.",
   "Free developer utilities; paid team API quotas.",/\b(json|yaml|xml|regex|jwt|uuid|base64|cron|html-entity|url-encoder)\b/i),
 entry("seo_discovery","SEO & machine discoverability","free_tool","medium",
   /\b(seo|sitemap|robots\.txt|meta tag|canonical|structured data|llms\.txt|indexability|schema markup|ai crawler|search console)\b/i,
   "Improve website visibility and machine-readable metadata.", "Inspect structured discovery metadata with permission.",
   "Free audits; recurring paid monitored reports.",/\b(seo|meta-tag|sitemap|robots|llms|agent-readiness|json-ld)\b/i),
 entry("invoicing","Invoices & small-business documents","app","medium",
   /\b(invoice|invoicing|receipt generator|quotation generator|billing software|gst invoice)\w*/i,
   "Create and manage invoices or client paperwork.", "Generate authorized billing documents without initiating payments.",
   "Free generator, then paid templates and accounting history.",/\b(invoice|gst-calculator|saas-unit-economics)\b/i),
 entry("productivity","Personal productivity & focus","app","medium",
   /\b(productivit|to[ -]?do|task manager|habit track|pomodoro|focus timer|daily planner|personal dashboard|goal track|note[ -]?taking|calendar app)\w*/i,
   "Organize daily tasks, habits and attention.", "Create authorized scheduled plans and task updates.",
   "Freemium app; sync and AI assistance as paid features.",/\b(pomodoro|random-number|time|productivity)\b/i),
 entry("agent_services","MCP tools & agent-callable APIs","agent_service","high",
   /\b(mcp(?:[ -]?server)?|model context protocol|agent tools?|agent[ -]?callable|tool calling|x402|agentic service|agent protocol)\b/i,
   "Integrate business workflows into AI assistants.", "Discover, authenticate, invoke and optionally pay for bounded machine capabilities.",
   "Metered API use, paid automation and enterprise access.",/\b(agent|ai-crawler|llms|json-ld|robots)\b/i),
 entry("automation","Workflow automation & integrations","app","high",
   /\b(workflow automati|automation platform|zapier|n8n|workflow engine|event triggers?|integration builder|low[ -]?code automation)\w*/i,
   "Connect recurring tasks across digital services.", "Trigger workflows with scoped access and audit logs.",
   "Usage-based processing and subscription tiers.",/\b(cron|html-to-markdown|json-to-csv)\b/i),
 entry("privacy_security","Privacy & security utilities","free_tool","medium",
   /\b(password generator|privacy tool|security scanner|vulnerabilit|token checker|jwt|sha[ -]?256|metadata remov|tracking protection|secret scan)\w*/i,
   "Protect accounts, files and private data.", "Inspect sensitive inputs locally and enforce secure permissions.",
   "Free local utilities; paid privacy audits or team reporting.",/\b(password|sha256|jwt|metadata-remover|robots-ai)\b/i),
 entry("finance_tools","Personal finance & business math","free_tool","medium",
   /\b(finance|investment calculat|sip calculat|loan calculat|compound interest|tax calculat|profit margin|budget app|expense track)\w*/i,
   "Plan expenses, investments and financial calculations.", "Calculate financial scenarios without financial advice or unauthorized transactions.",
   "Free calculators with premium planning or exports.",/\b(sip|emi|finance|interest|gst|discount|saas-unit)\b/i),
 entry("ai_code_quality","AI code quality & release checks","app","high",
   /\b(ai[ -]?generated code|vibe[ -]?cod|code review|code quality|release gate|agent code audit|security code review)\w*/i,
   "Review code generated by AI or humans before deployment.", "Assess tool permissions, tests and deploy evidence.",
   "Developer freemium and team CI subscriptions.",/\b(json-validator|regex|agent-readiness|seo-analyzer)\b/i)
]);
export function demandMatches(source){
 const value=(String(source.title||"")+" "+String(source.excerpt||"")).slice(0,1400);
 return DEMAND_CATEGORIES.filter(category=>category.pattern.test(value));
}
export function evidenceKind(provider){
 return provider==="hn_ask"?"public_question":provider==="hn_show"?"public_showcase":"open_source_example";
}
export function researchPriority(observations){
 const unique=new Map(observations.map(x=>[x.source_id,x]));
 if(unique.size===0)return null;
 const sources=[...unique.values()],kinds=new Set(sources.map(x=>x.evidence_kind));
 const recent=sources.filter(x=>{const at=Date.parse(x.published_at||"");return Number.isFinite(at)&&Date.now()-at<60*86400000&&Date.now()>=at;}).length;
 return Math.min(80,20+Math.min(6,sources.length)*6+Math.min(3,kinds.size)*7+Math.min(4,recent)*3);
}

// This starter taxonomy is optional reference material, NOT a limitation on
// industries, business models, technologies or future product formats.
// Every AI-generated idea with real source references creates a separate,
// source-linked discovery node without needing to match these patterns.
const LIMIT_SOURCES_PER_REFRESH=150;
const LIMIT_HYPOTHESES_PER_REFRESH=100;
export async function indexDemand(db,sources,trigger="research_workflow",researchRunId=null){
 if(!["owner","research_workflow"].includes(trigger))throw new Error("Unsupported research ingestion trigger.");
 if(researchRunId!==null&&!/^[0-9a-f-]{36}$/i.test(researchRunId))throw new Error("Invalid research run identifier.");
 const statements=DEMAND_CATEGORIES.map(c=>db.prepare(
   "INSERT INTO hq_demand_categories(category_key,title,summary,scale,user_job,agent_job,monetization_model,implementation_risk) "+
   "VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(category_key) DO UPDATE SET "+
   "title=excluded.title,summary=excluded.summary,scale=excluded.scale,"+
   "user_job=excluded.user_job,agent_job=excluded.agent_job,"+
   "monetization_model=excluded.monetization_model,implementation_risk=excluded.implementation_risk "+
   "WHERE hq_demand_categories.origin='reference'"
 ).bind(c.key,c.title,"Reference category — opportunity evidence remains unverified.",
   c.scale,c.userJob,c.agentJob,c.monetizationModel,c.risk));
 await db.batch(statements);
 let observed=0,added=0,candidates=0;
 for(const source of sources.slice(0,LIMIT_SOURCES_PER_REFRESH)){
   for(const category of demandMatches(source)){
     observed++;
     const row=await db.prepare(
       "INSERT INTO hq_demand_evidence(category_key,source_id,evidence_kind) VALUES (?,?,?) "+
       "ON CONFLICT(category_key,source_id) DO NOTHING RETURNING source_id"
     ).bind(category.key,source.source_id,evidenceKind(source.provider)).first();
     if(row?.source_id)added++;
   }
 }
 const query=db.prepare(
   "SELECT idea_id,title,kind,problem,solution,monetization_hypothesis "+
   "FROM hq_intelligence_ideas "+
   (researchRunId?"WHERE run_id=? ":"")+
   "ORDER BY created_at DESC LIMIT "+LIMIT_HYPOTHESES_PER_REFRESH
 );
 const ideas=researchRunId?await query.bind(researchRunId).all():await query.all();
 for(const idea of ideas.results){
   const evidence=await db.prepare(
     "SELECT e.source_id,s.provider FROM hq_intelligence_evidence e "+
     "JOIN hq_intelligence_sources s ON s.source_id=e.source_id "+
     "WHERE e.idea_id=? LIMIT 3"
   ).bind(idea.idea_id).all();
   // Never promote an AI hypothesis unless actual source references survive.
   if(evidence.results.length===0)continue;
   const key="hypothesis:"+idea.idea_id;
   const record=await db.prepare(
     "INSERT INTO hq_demand_categories(category_key,title,summary,scale,origin,origin_idea_id,"+
     "user_job,agent_job,monetization_model,implementation_risk) "+
     "VALUES (?,?,?,?,'hypothesis',?,?,?,?,'unknown') "+
     "ON CONFLICT(category_key) DO NOTHING RETURNING category_key"
   ).bind(key,idea.title,idea.problem,idea.kind,idea.idea_id,idea.solution,
     "Agent use not established; verify explicit use cases and authorization.",
     "Unverified hypothesis: "+idea.monetization_hypothesis).first();
   if(record?.category_key)candidates++;
   for(const source of evidence.results){
     const inserted=await db.prepare(
       "INSERT INTO hq_demand_evidence(category_key,source_id,evidence_kind) VALUES (?,?,?) "+
       "ON CONFLICT(category_key,source_id) DO NOTHING RETURNING source_id"
     ).bind(key,source.source_id,evidenceKind(source.provider)).first();
     if(inserted?.source_id)added++;
   }
 }
 for(const source of sources.slice(0,LIMIT_SOURCES_PER_REFRESH)){
   const linked=await db.prepare(
     "SELECT 1 AS found FROM hq_demand_evidence WHERE source_id=? LIMIT 1"
   ).bind(source.source_id).first();
   if(linked){
     await db.prepare("DELETE FROM hq_demand_unclassified_sources WHERE source_id=?").bind(source.source_id).run();
   }else{
     await db.prepare(
       "INSERT INTO hq_demand_unclassified_sources(source_id) VALUES (?) "+
       "ON CONFLICT(source_id) DO UPDATE SET last_detected_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')"
     ).bind(source.source_id).run();
   }
 }
 const id=crypto.randomUUID();
 const saved=await db.prepare(
   "INSERT INTO hq_demand_refresh_runs(refresh_id,trigger_source,source_count,observed_matches,added_links,generated_candidates,research_run_id) "+
   "VALUES (?,?,?,?,?,?,?) ON CONFLICT(research_run_id) DO NOTHING RETURNING refresh_id"
 ).bind(id,trigger,Math.min(sources.length,LIMIT_SOURCES_PER_REFRESH),observed,added,candidates,researchRunId).first();
 return {refresh_id:saved?.refresh_id||null,source_count:Math.min(sources.length,LIMIT_SOURCES_PER_REFRESH),
  observed_matches:observed,added_links:added,generated_candidates:candidates,
  searches_performed:0,ai_calls:0,demand_verified:false,category_ceiling:false};
}
