import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
const read=path=>readFile(new URL("../"+path,import.meta.url),"utf8");

test("Publishing exposes a collapsed, source-backed blocker checklist without approving Go Live",async()=>{
 const html=await read("admin/index.html");
 const publishing=html.slice(html.indexOf('id="view-releases"'),html.indexOf('id="view-security"'));
 assert.match(publishing,/id="release-live-blockers"[^>]*hidden/);
 assert.match(publishing,/id="release-live-blockers-title"/);
 assert.match(publishing,/id="release-live-blockers-list" aria-live="polite"/);
 assert.match(publishing,/id="release-go-live"[^>]*disabled/);
 assert.doesNotMatch(publishing,/id="founder-stop-all"|id="founder-permission-form"/);
 const css=await read("admin/release-evidence.css");
 assert.match(css,/\.release-live-blockers\[hidden\]\{display:none\}/);
 assert.match(css,/\.release-live-blockers ul\{[^}]*max-height:230px;overflow-y:auto/);
});
test("live blocker UI accepts server-sourced strings as bounded inert text only",async()=>{
 const source=await read("admin/release-evidence.js");
 const start=source.indexOf("function renderLiveBlockers(");
 const end=source.indexOf("async function loadGoLiveReadiness(",start);
 assert.ok(start>0&&end>start);
 const render=source.slice(start,end);
 assert.match(render,/Array\.isArray\(values\)/);
 assert.match(render,/typeof x === "string"/);
 assert.match(render,/list\.replaceChildren\(\)/);
 assert.match(render,/list\.append\(el\("li", "", item\.slice\(0, 320\)\)\)/);
 assert.doesNotMatch(render,/innerHTML|insertAdjacentHTML/);
 assert.match(source,/renderLiveBlockers\(data\.blockers\)/);
 assert.match(source,/renderLiveBlockers\(\[\.\.\.\(data\.blockers\|\|\[\]\),drift\.reason\]/);
 assert.match(source,/renderLiveBlockers\(\["Live release checks could not be independently verified\."\]\)/);
 assert.match(source,/goLive\.disabled = true/);
 assert.match(source,/preview\.setAttribute\("aria-disabled", "true"\)/);
});
