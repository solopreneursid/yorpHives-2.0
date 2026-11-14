import test from 'node:test';
import assert from 'node:assert/strict';
import {checkMonitor} from '../admin-monitor/admin-health.js';

const monitor=(path,id='test-monitor')=>({
 id,name:'Fixed first-party read-only check',environment:'production',
 url:'https://yorphives.com'+path
});
const tool={schema_version:1,source:'yorphives-website',count:1,
 tools:[{slug:'json-formatter',name:'JSON Formatter',category:'text',public_url:'/free-tools/json-formatter/'}]};
const probe=async(t,response)=>{
 const old=globalThis.fetch;
 globalThis.fetch=async(url,init)=>{
  assert.equal(url,t.url);
  assert.equal(init.redirect,'manual');
  assert.equal(init.method,'GET');
  assert.ok(!init.headers.authorization);
  return response;
 };
 try{return await checkMonitor(t);}
 finally{globalThis.fetch=old;}
};

test('API health fails closed when HTTP 200 returns HTML instead of catalogue JSON',async()=>{
 const r=await probe(monitor('/api/v1/free-tools'),
  new Response('<!doctype html><html><body>Fallback</body></html>',
   {status:200,headers:{'content-type':'text/html'}}));
 assert.equal(r.ok,false);
 assert.equal(r.status_code,200);
 assert.match(r.error_message,/content invalid/i);
});

test('API health fails for JSON MIME with unsupported, empty, or invalid JSON',async()=>{
 const t=monitor('/api/v1/free-tools');
 for(const input of ['{}','[]','{invalid json}','<html>fallback</html>']){
  const r=await probe(t,new Response(input,{status:200,headers:{'content-type':'application/json'}}));
  assert.equal(r.ok,false,input);
 }
});

test('API health accepts published source-owned v1 JSON and detects legacy bad list',async()=>{
 const t=monitor('/api/v1/free-tools');
 const ok=await probe(t,new Response(JSON.stringify(tool),{status:200,headers:{'content-type':'application/json'}}));
 assert.equal(ok.ok,true);
 assert.equal(ok.status_code,200);
 const bad=await probe(t,new Response(JSON.stringify({data:[{slug:'json-formatter'}]}),
  {status:200,headers:{'content-type':'application/json'}}));
 assert.equal(bad.ok,false);
});

test('sitemap 200 HTML and HTTP redirect are not successful website discovery health checks',async()=>{
 const sitemap=monitor('/sitemap.xml');
 const body=await probe(sitemap,new Response('<html>Fallback</html>',{status:200,headers:{'content-type':'text/html'}}));
 assert.equal(body.ok,false);
 const redirect=await probe(sitemap,new Response(null,{status:302,headers:{location:'https://evil.example/'}}));
 assert.equal(redirect.ok,false);
});

test('monitoring remains GET-only and an ordinary page 200 is reachability only',async()=>{
 const result=await probe(monitor('/free-tools/'),new Response('hello',{status:200}));
 assert.equal(result.ok,true);
});
