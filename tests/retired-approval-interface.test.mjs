import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
const source=path=>readFile(new URL("../"+path,import.meta.url),"utf8");

test("the Releases interface offers only Preview and Go Live, no legacy grant form",async()=>{
 const html=await source("admin/index.html");
 const from=html.indexOf('<section class="owner-delegation-panel"');
 const until=html.indexOf("</section>",from);
 assert.ok(from>0&&until>from);
 const legacy=html.slice(from,until);
 assert.doesNotMatch(legacy,/<form\b/i);
 assert.doesNotMatch(legacy,/step-up\/owner-delegations|prepare MFA approval/i);
 assert.match(legacy,/ARCHIVED HISTORY/);
 assert.match(html,/<a id="release-launch-preview"[^>]*>Preview<\/a>/);
 assert.match(html,/<button id="release-go-live"[^>]*\bdisabled\b[^>]*>Go Live<\/button>/);
});
test("old delegated-approval handlers are intentionally read-only",async()=>{
 const code=await source("admin/owner-delegation.js");
 assert.match(code,/retired_delegation_history/);
 assert.doesNotMatch(code,/method:\s*["']POST["']|method:\s*["']PATCH["']/);
 assert.doesNotMatch(code,/step-up\/owner-delegations/);
 const step=await source("functions/api/admin/step-up/assistant-permissions.ts");
 const get=step.slice(step.indexOf("export async function onRequestGet"),step.indexOf("export async function onRequestPost"));
 assert.doesNotMatch(get,/<form|Approve temporary help|name="agree"/);
 assert.match(get,/historical security record/);
 assert.match(step,/ASSISTANT_GRANTS_RETIRED/);
 const legacyApi=await source("functions/api/admin/owner-delegations.ts");
 assert.match(legacyApi,/retired_delegation_history/);
 assert.match(legacyApi,/LEGACY_APPROVAL_RETIRED/);
});

test("founder Home has no assistant-grant request or temporary-access OTP form",async()=>{
 const html=await source("admin/index.html");
 const start=html.indexOf('<details class="founder-permission-panel"');
 const end=html.indexOf('<details class="cockpit-reference">',start);
 assert.ok(start>0&&end>start);
 const panel=html.slice(start,end);
 assert.doesNotMatch(panel,/<form\b|founder-permission-submit|founder-secure-link/);
 assert.match(panel,/Archived access history/);
 assert.doesNotMatch(html,/id="founder-otp-dialog"/);
 const script=await source("admin/founder-control-center.js");
 assert.match(script,/retired/);
 assert.doesNotMatch(script,/method:\s*["']POST["']|send_test|action:"send"|action:"verify"/);
 assert.doesNotMatch(script,/step-up\/assistant-permissions/);
 assert.match(script,/action:"revoke_all"/);
 assert.match(script,/window.HQChooseAssistant/);
});
