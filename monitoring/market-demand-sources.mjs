/** Public-signal market and product research collector.
 * HN's official public API gives topical problem/launch conversations, NOT
 * verified buyer intent, monetization potential or a market-size estimate.
 * Never fetch story-supplied external URLs. Exactly two official list APIs
 * and at most twelve bounded official item APIs; no arbitrary-domain SSRF.
 */
const HOST='https://hacker-news.firebaseio.com';
export const HN_SIGNAL_STREAMS=Object.freeze([
 Object.freeze({id:'ask-hn',path:'/v0/askstories.json',category:'market'}),
 Object.freeze({id:'show-hn',path:'/v0/showstories.json',category:'product'})
]);
const MAX_STORIES_PER_STREAM=6;
const MAX_BYTES=65536;
const RELEVANT=/\b(?:ai|agents?|mcp|tool|app|software|website|web|search|automation|analytics|privacy|business|workflow|founder|marketing|security|customer|problem|need|product|saas|open.source|model|small business|pdf|image)\b/i;
async function boundedJson(response,maxBytes=MAX_BYTES){
 if(response.status!==200||!/^application\/json\b/i.test(response.headers.get('content-type')||''))
  throw Error('Unverified official item API');
 if(Number(response.headers.get('content-length')||0)>maxBytes)
  throw Error('Oversized public item');
 const bytes=await response.arrayBuffer();
 if(bytes.byteLength>maxBytes)throw Error('Oversized public item');
 try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}
 catch{throw Error('Invalid public JSON');}
}
export function classifyHackerNewsItem(item,stream){
 if(!HN_SIGNAL_STREAMS.includes(stream)||!item||!Number.isSafeInteger(item.id)||
   item.id<=0||typeof item.title!=='string')return null;
 const title=item.title.replace(/[\x00-\x1f<>]/g,' ').replace(/\s+/g,' ').trim().slice(0,160);
 const expected=stream.id==='ask-hn'?/^Ask HN\s*:/i:/^Show HN\s*:/i;
 if(!expected.test(title)||!RELEVANT.test(title)||title.length<14||
    item.deleted===true||item.dead===true)return null;
 return{
  id:'hn-'+item.id,category:stream.category,title,source:
   'https://news.ycombinator.com/item?id='+item.id,
  source_kind:stream.id,
  points:Number.isSafeInteger(item.score)&&item.score>=0?Math.min(9999,item.score):0,
  priority:Number.isSafeInteger(item.score)&&item.score>=80?3:2,
  evidence_type:'public_discussion_unverified',
  validated_demand:false,verified_revenue:false,
  observed_at:new Date().toISOString()
 };
}
export async function collectMarketCandidates({
 fetcher=globalThis.fetch,timeoutMs=6500
}={}){
 const found=[],failures=[];
 for(const stream of HN_SIGNAL_STREAMS){
  try{
   const list=await boundedJson(await fetcher(HOST+stream.path,{
    method:'GET',redirect:'manual',signal:AbortSignal.timeout(timeoutMs),
    headers:{accept:'application/json'},cache:'no-store'}),2048);
   if(!Array.isArray(list)||list.length>1000)throw Error('Invalid story listing');
   const ids=list.filter(id=>Number.isSafeInteger(id)&&id>0).slice(0,MAX_STORIES_PER_STREAM);
   for(const id of ids){
    try{
     const item=await boundedJson(await fetcher(HOST+'/v0/item/'+id+'.json',{
      method:'GET',redirect:'manual',signal:AbortSignal.timeout(timeoutMs),
      headers:{accept:'application/json'},cache:'no-store'}),8192);
     if(item?.id!==id)continue;
     const candidate=classifyHackerNewsItem(item,stream);
     if(candidate)found.push(candidate);
    }catch{continue;}
   }
  }catch{failures.push(stream.id);}
 }
 return{source:'fixed_public_problem_and_product_discussions',
  candidates:found.slice(0,12),failed_sources:failures,validated_demand:false,
  verified_revenue:false,model_calls:0};
}
export async function storeMarketCandidates(db,report,{
 clock=()=>new Date().toISOString()
}={}){
 if(!db?.prepare||report?.source!=='fixed_public_problem_and_product_discussions'||
    !Array.isArray(report.candidates)||report.candidates.length>12)
  throw Error('Untrusted market research batch');
 let added=0;
 for(const c of report.candidates){
  const match=/^https:\/\/news\.ycombinator\.com\/item\?id=([1-9][0-9]{0,12})$/.exec(c?.source||'');
  if(!match||c.id!=='hn-'+match[1]||
     !['market','product'].includes(c.category)||
     !['ask-hn','show-hn'].includes(c.source_kind)||
     c.evidence_type!=='public_discussion_unverified'||c.validated_demand!==false||
     c.verified_revenue!==false||![2,3].includes(c.priority)||
     typeof c.title!=='string'||c.title.length<14||c.title.length>160)
   throw Error('Invalid public market candidate');
  const key='market-'+c.id;
  const statement=db.prepare(
   'INSERT OR IGNORE INTO monitor_signals (id,category,state,priority,title,evidence_ref,observed_at,founder_action) VALUES (?,?,?,?,?,?,?,?)'
  );
  const response=await statement.bind(key,c.category,'unreviewed',c.priority,
   ('Market research candidate: '+c.title).slice(0,235),c.source,clock(),
   'Read original HN discussion; validate customer demand, differentiation, user/agent distribution, legal constraints and monetization before proposing a product.').run();
  if((response?.meta?.changes||0)>0)added++;
 }
 return{added,source:'official_public_HN_api',
  total:report.candidates.length,failed_sources:report.failed_sources||[],
  validated_ideas:0,revenue_verified:false,production_modified:false};
}
