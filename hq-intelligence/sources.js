// Fixed, allowlisted public endpoints. Never follow links suggested by source text.
const FETCH_LIMIT_MS=8000;
const MAX_HN_PER_FEED=11;
const MAX_REPOS_PER_TOPIC=8;
const TODAY_WINDOW_DAYS=120;
const GITHUB_TOPICS=["ai-agent","cloudflare-workers"];

async function safeJson(url,limitBytes=450000){
  const target=new URL(url);
  if(target.protocol!=="https:"||!["hacker-news.firebaseio.com","api.github.com"].includes(target.hostname))
    throw new Error("Public source host is not allowlisted.");
  const response=await fetch(url,{headers:{"accept":"application/json","user-agent":"YorpHives-Research/1.0"},
    redirect:"error",signal:AbortSignal.timeout(FETCH_LIMIT_MS)});
  if(!response.ok)throw new Error("Source "+target.hostname+" returned HTTP "+response.status);
  const size=Number(response.headers.get("content-length")||0);
  if(size>limitBytes)throw new Error("Source payload size exceeded the ingestion budget.");
  const content=await response.text();
  if(content.length>limitBytes)throw new Error("Source payload exceeded the character budget.");
  return JSON.parse(content);
}
function clean(text,limit=600){
  return String(text??"")
    .replace(/<[^>]*>/g," ").replace(/&(?:amp|#38);/g,"&").replace(/&(?:lt|#60);/g,"<")
    .replace(/&(?:gt|#62);/g,">").replace(/&(?:quot|#34);/g,'"')
    .replace(/&(?:apos|#39);/g,"'").replace(/\s+/g," ").trim().slice(0,limit);
}
const dateOf=unixSeconds=>{
  const d=new Date(Number(unixSeconds)*1000);
  return Number.isFinite(d.getTime())?d.toISOString():null;
};
async function hnFeed(kind){
 const path=kind==="hn_ask"?"askstories":"showstories";
 const ids=await safeJson("https://hacker-news.firebaseio.com/v0/"+path+".json");
 if(!Array.isArray(ids))throw new Error("HN story index was not an array.");
 const selected=ids.filter(n=>Number.isSafeInteger(n)&&n>0).slice(0,MAX_HN_PER_FEED);
 const out=[];
 // Four concurrent requests to limit upstream load.
 for(let i=0;i<selected.length;i+=4){
   const batch=await Promise.allSettled(selected.slice(i,i+4).map(id=>
     safeJson("https://hacker-news.firebaseio.com/v0/item/"+id+".json",85000)));
   for(const r of batch){
     if(r.status!=="fulfilled")continue;
     const item=r.value;
     if(!item||item.deleted||item.dead||!Number.isSafeInteger(item.id)||!item.title)continue;
     const title=clean(item.title,220);
     if(!title)continue;
     out.push({
       source_id:"hn:"+item.id,provider:kind,external_id:String(item.id),
       title,excerpt:clean(item.text||"",900),
       source_url:"https://news.ycombinator.com/item?id="+item.id,
       external_url:typeof item.url==="string"&&item.url.startsWith("https://")?item.url.slice(0,700):null,
       published_at:dateOf(item.time),
       popularity_count:Math.max(0,Math.min(100000,Number(item.score)||0))
     });
   }
 }
 return out;
}
async function githubTopics(){
  const threshold=new Date(Date.now()-TODAY_WINDOW_DAYS*86400000).toISOString().slice(0,10);
  const out=[];
  for(const topic of GITHUB_TOPICS){
    const q=encodeURIComponent("topic:"+topic+" pushed:>="+threshold+" archived:false");
    let payload;
    try{
      payload=await safeJson("https://api.github.com/search/repositories?q="+q+"&sort=updated&order=desc&per_page="+MAX_REPOS_PER_TOPIC,380000);
    }catch{continue;}
    for(const repo of (Array.isArray(payload?.items)?payload.items:[])){
      if(typeof repo?.full_name!=="string"||typeof repo?.html_url!=="string"||!Number.isSafeInteger(repo.id))continue;
      const url=repo.html_url;
      if(!/^https:\/\/github\.com\/[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+\/?$/.test(url))continue;
      out.push({
        source_id:"github:"+repo.id,provider:"github_repo",external_id:String(repo.id),
        title:clean(repo.full_name,220),excerpt:clean(repo.description||"",900),
        source_url:url,external_url:null,published_at:repo.created_at||null,
        popularity_count:Math.max(0,Math.min(10000000,Number(repo.stargazers_count)||0))
      });
    }
  }
  return out;
}
export async function collectPublicSignals(){
 const sources=[],errors=[];
 const feeds=[
  ["hn_ask",()=>hnFeed("hn_ask")],
  ["hn_show",()=>hnFeed("hn_show")],
  ["github_repo",githubTopics]
 ];
 for(const [name,fn] of feeds){
   try{sources.push(...await fn());}
   catch(error){errors.push(name+": "+(error instanceof Error?error.message:"unavailable"));}
 }
 const unique=new Map();
 for(const s of sources)unique.set(s.source_id,s);
 return {sources:[...unique.values()].slice(0,42),errors,
   provider_counts:Object.fromEntries(["hn_ask","hn_show","github_repo"].map(p=>[p,[...unique.values()].filter(v=>v.provider===p).length]))};
}
