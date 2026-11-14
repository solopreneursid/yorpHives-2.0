/**
 * Portable read-only open RSS/Atom technology signal adapter.
 * Public feeds are FROZEN and externally attributable. No scraping arbitrary
 * URLs, paid API, key, third-party agent execution or speculative revenue.
 * Items are candidate reading material for the founder, not verified demand.
 */
export const TECHNOLOGY_FEEDS=Object.freeze([
 Object.freeze({id:'cloudflare-developer-changelog',
  url:'https://developers.cloudflare.com/changelog/rss/developer-platform.xml'}),
 Object.freeze({id:'cloudflare-security-changelog',
  url:'https://developers.cloudflare.com/changelog/rss/application-security.xml'})
]);
const MAX_BYTES=196608;
const KEYWORD=/\b(?:agents?|mcp|webmcp|openapi|open.?source|security|cve|vulnerabilit|bot|x402|payment|billing|analytics|workers?|d1|ai|identity|access|updates?|migration|release)\b/i;
function text(value){
 return String(value||'').replace(/<!\[CDATA\[|\]\]>/g,'')
  .replace(/<[^>]*>/g,'')
  .replace(/&(?:amp|lt|gt|quot|apos);/g,x=>
   ({'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'"}[x]))
  .replace(/\s+/g,' ').trim().slice(0,220);
}
export function parseTechnologyFeed(xml,feed){
 if(!TECHNOLOGY_FEEDS.includes(feed))throw Error('Unknown fixed feed');
 if(typeof xml!=='string'||xml.length>MAX_BYTES||
    !/<(?:rss|feed)\b/i.test(xml.slice(0,800)))throw Error('Unverified RSS source format');
 const entries=[...xml.matchAll(/<(item|entry)\b[^>]*>([\s\S]*?)<\/\1>/gi)].slice(0,25);
 const out=[];
 for(const [,type,part] of entries){
  const title=text(part.match(/<title(?:\s+[^>]*)?>([\s\S]*?)<\/title>/i)?.[1]);
  const rssLink=text(part.match(/<link(?:\s+[^>]*)?>([\s\S]*?)<\/link>/i)?.[1]);
  const atomLink=part.match(/<link\s+[^>]*href=["']([^"']{1,500})["']/i)?.[1]||'';
  const link=type.toLowerCase()==='item'?rssLink:atomLink||rssLink;
  if(title.length<9||!KEYWORD.test(title))continue;
  let parsed;
  try{parsed=new URL(link);}catch{continue;}
  if(parsed.protocol!=='https:'||parsed.username||parsed.password||
     !['developers.cloudflare.com','blog.cloudflare.com'].includes(parsed.hostname)||
     parsed.searchParams.has('token')||parsed.pathname.length>350)continue;
  // Citations link back to the original first-party changelog item.
  const source=parsed.origin+parsed.pathname;
  out.push({title:title.slice(0,180),source,feed:feed.id,
   category:/security|cve|vulnerabilit|patch/i.test(title)?'security':'technology',
   priority:/critical|urgent|cve|breaking/i.test(title)?3:2,
   hypothesis_only:true});
  if(out.length>=8)break;
 }
 return out;
}
async function limited(res){
 if(!res.body)return '';
 const reader=res.body.getReader();const parts=[];let n=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;
   n+=value.byteLength;if(n>MAX_BYTES)throw Error('RSS size cap');
   parts.push(value);
 }}finally{await reader.cancel().catch(()=>{});}
 const bytes=new Uint8Array(n);let pos=0;
 for(const p of parts){bytes.set(p,pos);pos+=p.byteLength;}
 return new TextDecoder('utf-8',{fatal:true}).decode(bytes);
}
export async function collectTechnologyCandidates({
 fetcher=globalThis.fetch,timeoutMs=6500
}={}){
 const results=[],failures=[];
 for(const feed of TECHNOLOGY_FEEDS){
  try{
   const response=await fetcher(feed.url,{method:'GET',redirect:'manual',
    headers:{accept:'application/rss+xml,application/atom+xml,application/xml'},
    signal:AbortSignal.timeout(timeoutMs)});
   if(response.status!==200||
      !/(?:rss\+xml|atom\+xml|application\/xml|text\/xml)/i.test(
        response.headers.get('content-type')||''))
    throw Error('RSS unavailable');
   const document=await limited(response);
   results.push(...parseTechnologyFeed(document,feed));
  }catch{failures.push(feed.id);}
 }
 return {source:'fixed_public_changelog_feeds',candidates:results,
  failed_sources:failures,validated_market_demand:false,revenue_verified:false};
}
export async function storeTechnologyCandidates(db,report,{clock=()=>new Date().toISOString()}={}){
 if(!db?.prepare||report?.source!=='fixed_public_changelog_feeds'||
    !Array.isArray(report.candidates)||report.candidates.length>16)
  throw Error('Unverified technology candidate batch');
 let newly_seen=0;
 for(const entry of report.candidates){
  if(!entry.hypothesis_only||
    !['security','technology'].includes(entry.category)||
    typeof entry.source!=='string'||!entry.source.startsWith('https://')||
    typeof entry.title!=='string'||entry.title.length>180)
   throw Error('Invalid technology evidence');
  const hash=await crypto.subtle.digest('SHA-256',
   new TextEncoder().encode(entry.source));
  const key='radar-'+Array.from(new Uint8Array(hash).slice(0,16),
   v=>v.toString(16).padStart(2,'0')).join('');
  const res=await db.prepare(
    'INSERT OR IGNORE INTO monitor_signals (id,category,state,priority,title,evidence_ref,observed_at,founder_action) VALUES (?,?,?,?,?,?,?,?)'
   ).bind(key,entry.category,'unreviewed',entry.priority,
    ('Research candidate: '+entry.title).slice(0,235),
    entry.source,clock(),
    'Review this original changelog; verify customer demand, commercial opportunity, and compatibility before proposing a change.').run();
  if((res?.meta?.changes||0)>0)newly_seen++;
 }
 return {newly_seen,candidate_count:report.candidates.length,
  source_failures:report.failed_sources||[],production_modified:false,
  validated_opportunities:0};
}
