// Independent, bounded market adapters. Records refer to public pages only.
// External text is untrusted. No individual users, API keys, private content,
// crawling of product sites, engagement estimates or inferred search volume.
const ALLOWED=new Set(["api.wordpress.org","api.stackexchange.com"]);
const MAX_BODY=350000;
const LIMIT=60;
const SEARCH_TERMS=Object.freeze([
 "pdf","image compression","seo","invoice","appointment booking","translation",
 "accessibility","membership","forms","ecommerce","education","podcast",
 "security","productivity","analytics","backup","ai assistant","automation"
]);
const SE_SITES=Object.freeze(["webapps","superuser","graphicdesign","money","diy","gamedev","academia","wordpress"]);
const clean=(raw,max=900)=>String(raw??"")
 .replace(/<[^>]*>/g," ")
 .replace(/&(?:amp|#38);/gi,"&").replace(/&(?:lt|#60);/gi,"<")
 .replace(/&(?:gt|#62);/gi,">").replace(/&(?:quot|#34);/gi,'"')
 .replace(/&(?:apos|#39);/gi,"'").replace(/&nbsp;/gi," ")
 .replace(/\s+/g," ").trim().slice(0,max);
const asTime=source=>{
 if(!source)return null;
 const timestamp=typeof source==="number"?source*1000:Date.parse(source);
 const date=new Date(timestamp);
 return Number.isFinite(date.getTime())?date.toISOString():null;
};
const n=(value,min,max)=>Math.max(min,Math.min(max,Math.trunc(Number(value)||0)));
async function readJson(url,send=fetch){
 const target=new URL(url);
 if(target.protocol!=="https:"||!ALLOWED.has(target.hostname))throw Error("Market research provider is not allowed.");
 const response=await send(url,{
  method:"GET",redirect:"manual",signal:AbortSignal.timeout(8500),
  headers:{"accept":"application/json","user-agent":"YorpHives-Research/1.0"}
 });
 if(!response.ok)throw Error(target.hostname+" HTTP "+response.status);
 if(Number(response.headers.get("content-length")||0)>MAX_BODY)throw Error("Provider response exceeds size budget.");
 const text=await response.text();
 if(text.length>MAX_BODY)throw Error("Provider response exceeded size budget.");
 return JSON.parse(text);
}
function wordpressSearch(term,send){
 const url=new URL("https://api.wordpress.org/plugins/info/1.2/");
 url.searchParams.set("action","query_plugins");
 url.searchParams.set("request[search]",term);
 url.searchParams.set("request[per_page]","5");
 url.searchParams.set("request[page]","1");
 url.searchParams.set("request[fields][sections]","0");
 url.searchParams.set("request[fields][versions]","0");
 return readJson(url.href,send).then(body=>{
  if(!Array.isArray(body?.plugins))throw Error("WordPress plugin search returned no result array.");
  return body.plugins.slice(0,5).flatMap(plugin=>{
   const slug=typeof plugin?.slug==="string"?plugin.slug:"";
   if(!/^[a-z0-9][a-z0-9-]{1,75}$/.test(slug)||!plugin.name)return [];
   return [{
    signal_key:"wordpress:"+slug,provider:"wordpress_plugins",
    evidence_kind:"existing_product",source_id:slug,source_query:term,
    title:clean(plugin.name,220),excerpt:clean(plugin.short_description||plugin.description||"",500),
    source_url:"https://wordpress.org/plugins/"+slug+"/",
    published_at:asTime(plugin.last_updated),
    public_metric_label:"active_install_band",
    public_metric_value:n(plugin.active_installs,0,1000000000),
    is_exact_metric:0
   }];
  });
 });
}
function stackExchangeSite(site,send){
 const url=new URL("https://api.stackexchange.com/2.3/questions");
 url.searchParams.set("site",site);
 url.searchParams.set("sort","creation");
 url.searchParams.set("order","desc");
 url.searchParams.set("pagesize","7");
 url.searchParams.set("filter","default");
 return readJson(url.href,send).then(body=>{
  if(!Array.isArray(body?.items))throw Error("Stack Exchange returned no question array.");
  return body.items.slice(0,7).flatMap(question=>{
   if(!Number.isSafeInteger(question?.question_id)||!question.title)return [];
   const id=String(question.question_id);
   return [{
    signal_key:"stackexchange:"+site+":"+id,provider:"stackexchange_questions",
    evidence_kind:"public_question",source_id:site+":"+id,source_query:site,
    title:clean(question.title,220),
    excerpt:clean(Array.isArray(question.tags)?question.tags.join(", "):"",350),
    source_url:site==="superuser"?"https://superuser.com/questions/"+id:"https://"+site+".stackexchange.com/questions/"+id,
    published_at:asTime(question.creation_date),
    public_metric_label:"question_score",
    public_metric_value:n(question.score,-10000,1000000000),
    is_exact_metric:0
   }];
  });
 });
}
export async function collectMarketSources(now=new Date(),send=fetch){
 const day=Math.floor(now.getTime()/86400000);
 const work=[];
 for(let i=0;i<3;i++){
  const term=SEARCH_TERMS[(day+i*6)%SEARCH_TERMS.length];
  work.push({provider:"wordpress_plugins",id:term,run:()=>wordpressSearch(term,send)});
 }
 for(let i=0;i<2;i++){
  const site=SE_SITES[(day+i*4)%SE_SITES.length];
  work.push({provider:"stackexchange_questions",id:site,run:()=>stackExchangeSite(site,send)});
 }
 const sources=[],warnings=[];
 // At most five official API requests per scan; sequential to limit load.
 for(const entry of work){
  try{sources.push(...await entry.run());}
  catch(error){warnings.push(entry.provider+":"+entry.id+" "+String(error instanceof Error?error.message:error).slice(0,160));}
 }
 const unique=new Map();
 for(const item of sources)unique.set(item.signal_key,item);
 return {signals:[...unique.values()].slice(0,LIMIT),warnings,requests:work.length,
  attribution:"WordPress.org plugin listings and Stack Exchange public questions; independent user demand not verified."};
}
export async function storeMarketSources(db,runId,collection){
 let inserted=0;
 for(const record of collection.signals.slice(0,LIMIT)){
  const already=await db.prepare("SELECT 1 AS found FROM hq_public_market_signals WHERE signal_key=?").bind(record.signal_key).first();
  const row=await db.prepare(
   "INSERT INTO hq_public_market_signals(signal_key,provider,evidence_kind,source_id,source_query,title,"+
   "excerpt,source_url,published_at,public_metric_label,public_metric_value,is_exact_metric) "+
   "VALUES (?,?,?,?,?,?,?,?,?,?,?,?) "+
   "ON CONFLICT(signal_key) DO UPDATE SET title=excluded.title,excerpt=excluded.excerpt,"+
   "source_url=excluded.source_url,source_query=excluded.source_query,published_at=excluded.published_at,"+
   "public_metric_value=excluded.public_metric_value,last_seen_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') "+
   "RETURNING signal_key,first_seen_at,last_seen_at"
  ).bind(record.signal_key,record.provider,record.evidence_kind,record.source_id,
   record.source_query,record.title,record.excerpt,record.source_url,record.published_at,
   record.public_metric_label,record.public_metric_value,record.is_exact_metric).first();
  if(!row?.signal_key)throw Error("Could not store market evidence.");
  if(!already)inserted++;
 }
 await db.prepare(
  "INSERT INTO hq_public_market_runs(run_id,observed_count,inserted_count,warnings_json) "+
  "VALUES (?,?,?,?) ON CONFLICT(run_id) DO UPDATE SET "+
  "observed_count=excluded.observed_count,inserted_count=excluded.inserted_count,"+
  "warnings_json=excluded.warnings_json"
 ).bind(runId,collection.signals.length,inserted,JSON.stringify(collection.warnings.slice(0,8))).run();
 return {observed_count:collection.signals.length,inserted_count:inserted,warnings:collection.warnings};
}
