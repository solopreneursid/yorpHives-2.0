/** Provider-neutral, read-only public website inventory adapters.
 * Headquarters must not mistake a HTML fallback, legacy Cloudflare Pages
 * sitemap host, or unsupported API shape for a healthy tool registry.
 * No remote calls, persistence, repairs, PRs or publication here.
 */
export const WEBSITE_CANONICAL_ORIGIN='https://yorphives.com';
const LEGACY_SITEMAP_ORIGIN='https://yorphives.pages.dev';
const SLUG=/^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const simple=(v,min,max)=>typeof v==='string'&&v.trim().length>=min&&v.length<=max;
const invalid=()=>new Error('Website Free Tools source is missing, incomplete, or has an unsupported JSON contract.');
const allowedPath=(value,slug)=>{
 if(typeof value!=='string'||!value.startsWith('/'))return false;
 try{
  const u=new URL(value,WEBSITE_CANONICAL_ORIGIN);
  return u.origin===WEBSITE_CANONICAL_ORIGIN&&
    !u.search&&!u.hash&&!u.username&&!u.password&&
    u.pathname==='/free-tools/'+slug+'/'&&
    value===u.pathname;
 }catch{return false;}
};
/** Maps one explicitly verified older first-party sitemap domain to the canonical
 * website path. Never follows third-party links or makes network requests.
 * @returns {{path:string,legacy_origin:boolean}|null}
 */
export function normalizeWebsiteSitemapUrl(raw){
 try{
  const u=new URL(raw);
  if(u.protocol!=='https:'||u.username||u.password||u.port||
     u.search||u.hash|| ![WEBSITE_CANONICAL_ORIGIN,LEGACY_SITEMAP_ORIGIN].includes(u.origin))
   return null;
  if(!u.pathname.startsWith('/')||/\%2f|\%5c/i.test(u.pathname))return null;
  return {path:u.pathname,legacy_origin:u.origin===LEGACY_SITEMAP_ORIGIN};
 }catch{return null;}
}
/** Normalize current v1 official website catalogue and historical array/data
 * layouts to one strictly bounded, website-owned DTO.
 * Do not treat missing publisher endpoints as an empty official product list.
 */
export function normalizeWebsiteToolInventory(payload){
 let records;
 if(payload?.schema_version===1 && payload?.source==='yorphives-website' &&
    Array.isArray(payload.tools) && payload.count===payload.tools.length)
   records=payload.tools;
 else if(Array.isArray(payload))records=payload;
 else if(payload && typeof payload==='object' && Array.isArray(payload.data))
   records=payload.data;
 else throw invalid();
 if(records.length<1||records.length>200)throw invalid();
 const result=[],unique=new Set();
 for(const t of records){
  if(!t||typeof t!=='object'||Array.isArray(t)||!simple(t.slug,2,90)||
      !SLUG.test(t.slug)||unique.has(t.slug))
   throw invalid();
  const title=t.name??t.title;
  const url=t.public_url??t.url;
  if(!simple(title,1,160)||!allowedPath(url,t.slug))throw invalid();
  const category=t.category??'uncategorized';
  if(!simple(category,1,80))throw invalid();
  unique.add(t.slug);
  result.push({
   slug:t.slug,title,category,description:typeof t.description==='string'?t.description.slice(0,400):'',
   url,processing:t.processing==='planned'?'planned':'browser_local'
  });
 }
 return result;
}
