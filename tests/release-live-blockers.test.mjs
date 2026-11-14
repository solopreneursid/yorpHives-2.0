import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
const read=path=>readFile(new URL("../"+path,import.meta.url),"utf8");

test("Investigation history has no release or production readiness controls",async()=>{
 const html=await read("admin/index.html");
 const start=html.indexOf('id="view-investigations"');
 const end=html.indexOf('id="view-security"',start);
 assert.ok(start>0&&end>start);
 const view=html.slice(start,end);
 assert.match(view,/id="release-evidence-summary"/);
 assert.match(view,/id="release-evidence-list"/);
 assert.match(view,/id="release-evidence-refresh"/);
 assert.doesNotMatch(view,/Go Live|>Preview<|release-launch|release-target|release-live-blockers|otp/i);
 assert.doesNotMatch(view,/id="founder-stop-all"|id="founder-permission-form"/);
});
test("historical source evidence is bounded and rendered as text, never HTML",async()=>{
 const js=await read("admin/release-evidence.js");
 assert.match(js,/Array\.isArray\(item\.blockers\)/);
 assert.match(js,/reason\.slice\(0, 320\)/);
 assert.match(js,/list\.replaceChildren\(\)/);
 assert.match(js,/element\.textContent = String\(value\)/);
 assert.doesNotMatch(js,/innerHTML|insertAdjacentHTML|goLive|loadGoLiveReadiness/);
});
