/**
 * An isolated preview is untrusted code. Never attach Cloudflare Access
 * service secrets to BrowserContext.extraHTTPHeaders (including redirect hops).
 * This read-only proxy requests ONLY the exact approved Pages origin and does
 * not follow redirects; foreign hosts are blocked before network dispatch.
 */
const HOST=/^[a-f0-9]{8}\.yorphives-admin-staging\.pages\.dev$/;

export function privatePreviewOrigin(value){
 try{
  const u=new URL(value);
  return u.protocol==="https:"&&HOST.test(u.hostname)&&u.port===""&&
   !u.username&&!u.password&&u.pathname==="/"&&u.search===""&&u.hash==="";
 }catch{return false;}
}
export function isAllowedPreviewBrowserRequest(value,origin){
 if(!privatePreviewOrigin(origin))return false;
 try{
  const u=new URL(value);
  return u.origin===new URL(origin).origin&&u.protocol==="https:"&&
   !u.username&&!u.password;
 }catch{return false;}
}
export function makePrivatePreviewAccessRouter({origin,clientId,clientSecret}){
 if(!privatePreviewOrigin(origin)||!clientId||!clientSecret)
  throw Error("An exact private preview and Access service credentials are required.");
 return async route=>{
  if(!isAllowedPreviewBrowserRequest(route.request().url(),origin)){
   await route.abort("blockedbyclient");return;
  }
  // The Playwright request proxy never follows a Location redirect itself.
  // If the browser subsequently requests the Location, this handler evaluates
  // that new URL and blocks anything outside this precise private origin.
  const headers={...route.request().headers(),
   "CF-Access-Client-Id":clientId,
   "CF-Access-Client-Secret":clientSecret};
  const response=await route.fetch({headers,maxRedirects:0,timeout:15000});
  await route.fulfill({response});
 };
}
