import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeWebsiteSitemapUrl,normalizeWebsiteToolInventory}
 from '../admin-monitor/website-inventory-contract.js';
import {assessAssetRepresentation} from '../admin-monitor/asset-policy.js';

const versioned={
 schema_version:1,source:'yorphives-website',count:2,
 tools:[
  {slug:'json-formatter',name:'JSON Formatter',category:'text',public_url:'/free-tools/json-formatter/'},
  {slug:'merge-pdf',name:'Merge PDF',category:'pdf',public_url:'/free-tools/merge-pdf/'}
 ]
};

test('canonical and legacy first-party sitemap origins resolve to identical canonical website routes',()=>{
 const current=normalizeWebsiteSitemapUrl('https://yorphives.com/free-tools/json-formatter/');
 const legacy=normalizeWebsiteSitemapUrl('https://yorphives.pages.dev/free-tools/json-formatter/');
 assert.deepEqual(current,{path:'/free-tools/json-formatter/',legacy_origin:false});
 assert.deepEqual(legacy,{path:'/free-tools/json-formatter/',legacy_origin:true});
 for(const raw of [
  'https://evil.example/free-tools/json-formatter/',
  'http://yorphives.pages.dev/free-tools/json-formatter/',
  'https://yorphives.pages.dev.evil.example/free-tools/json-formatter/',
  'https://user:pass@yorphives.com/private',
  'https://yorphives.pages.dev:8443/free-tools/json-formatter/',
  'https://yorphives.pages.dev/free-tools/secure/?token=secret',
  'https://yorphives.com/free-tools/%2fadmin/'
 ])assert.equal(normalizeWebsiteSitemapUrl(raw),null,raw);
});

test('website-owned versioned tool catalogue and manifest normalize without inventing tool functionality',()=>{
 const tools=normalizeWebsiteToolInventory(versioned);
 assert.equal(tools.length,2);
 assert.deepEqual(tools.map(t=>t.slug),['json-formatter','merge-pdf']);
 assert.deepEqual(tools.map(t=>t.url),[
  '/free-tools/json-formatter/','/free-tools/merge-pdf/']);
 assert.equal(tools[0].processing,'browser_local');
 assert.equal(tools[0].title,'JSON Formatter');
 const legacy=[{slug:'json-formatter',title:'JSON Formatter',category:'text',
  url:'/free-tools/json-formatter/'}];
 assert.equal(normalizeWebsiteToolInventory(legacy).length,1);
 assert.equal(normalizeWebsiteToolInventory({data:legacy,count:1}).length,1);
});

test('invalid, cross-site, duplicate, unsupported and empty tool manifests are rejected',()=>{
 const invalid=[
  {schema_version:2,source:'yorphives-website',count:2,tools:versioned.tools},
  {...versioned,count:99},
  {...versioned,source:'impersonator'},
  {...versioned,tools:[versioned.tools[0],versioned.tools[0]]},
  {...versioned,tools:[{...versioned.tools[0],public_url:'/api/admin/'}]},
  {...versioned,tools:[{...versioned.tools[0],public_url:'https://evil.example/'}]},
  {...versioned,tools:[{...versioned.tools[0],slug:'../admin',public_url:'/free-tools/../admin/'}]},
  {data:[]},{count:0,tools:[]},
  {source:'yorphives-website',count:0,tools:[]},
  null,{},'<html>fallback</html>'
 ];
 for(const obj of invalid)assert.throws(()=>normalizeWebsiteToolInventory(obj),/contract/i);
});

test('machine assets reject HTML 200 despite successful HTTP status and accept source-owned v1',()=>{
 for(const path of ['/api/v1/free-tools','/free-tools/manifest.json']){
  const asset={type:path.startsWith('/api')?'api':'discovery',url:'https://yorphives.com'+path};
  const html=assessAssetRepresentation(asset,'text/html','<!doctype html><html>not a catalogue</html>');
  assert.equal(html.ok,false);
  assert.equal(html.code,'unexpected-representation');
  const good=assessAssetRepresentation(asset,'application/json',JSON.stringify(versioned));
  assert.equal(good.ok,true);
  assert.equal(good.kind,'json');
  const invalid=assessAssetRepresentation(asset,'application/json','{}');
  assert.equal(invalid.ok,false);
  assert.equal(invalid.code,'invalid-json');
 }
});
