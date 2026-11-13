import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read=relative=>readFile(new URL(relative,import.meta.url),"utf8");
const [html,css,js,admin]=await Promise.all([
  read("../admin/index.html"),
  read("../admin/headquarters-refined.css"),
  read("../admin/headquarters-refined.js"),
  read("../admin/admin.js")
]);

test("Headquarters has one navigation destination for every preserved workspace",()=>{
  const expected=[
    "headquarters","yorpmind","issues","agents","intelligence","demand",
    "business","radar","departments","overview","monitoring","analytics",
    "updates","releases","activity"
  ];
  const actual=[...html.matchAll(/<button\s+class="nav-item(?: active)?"\s+data-view="([^"]+)"/g)]
    .map(match=>match[1]);
  assert.deepEqual(actual.sort(),expected.sort());
  assert.match(html,/id="nav-group-explore"/);
  assert.match(html,/id="nav-group-tools"/);
  assert.match(html,/<summary>Ideas &amp; opportunities<\/summary>/);
  assert.match(html,/<summary>Tools &amp; records<\/summary>/);
});

test("compact refinement is loaded after other styling and remains progressive",()=>{
  const style=html.indexOf('href="/admin/headquarters-refined.css"');
  const earlier=html.indexOf('href="/admin/business-intelligence.css"');
  assert.ok(style>earlier);
  assert.match(html,/src="\/admin\/headquarters-refined\.js" defer/);
  assert.match(js,/DOMContentLoaded/);
  assert.match(js,/document\.createElement\("details"\)/);
  assert.doesNotMatch(js,/innerHTML\s*=/);
  assert.doesNotMatch(js,/fetch\s*\(/);
});

test("each long workspace has an independently scrollable region",()=>{
  for(const selector of [
    ".hq-mission-list",".hq-event-list",".owner-task-list",".intel-cards",
    ".intel-sidebar",".demand-cards",".demand-sidebar",".radar-cards"
  ])assert.ok(css.includes(selector),selector);
  assert.match(css,/overscroll-behavior-y:\s*contain/);
  assert.match(css,/\.intel-cards\s*\{[^}]*overflow-y:\s*auto/);
  assert.match(css,/\.demand-sidebar\s*\{[^}]*overflow-y:\s*auto/);
  assert.match(css,/\.radar-cards\s*\{[^}]*overflow-y:\s*auto/);
  assert.match(css,/#view-issues \.table-wrap\s*\{[^}]*overflow:\s*auto/);
  assert.match(css,/\.table-wrap thead th\s*\{[^}]*position:\s*sticky/);
  assert.match(js,/setAttribute\("tabindex", "0"\)/);
});

test("every new page opens at the top and reveals the active sidebar group",()=>{
  const start=admin.indexOf("function showView(name)");
  const end=admin.indexOf("async function loadView(name)",start);
  assert.ok(start>0&&end>start);
  const method=admin.slice(start,end);
  assert.match(method,/window\.scrollTo\(0, 0\)/);
  assert.match(method,/scrollingElement\.scrollTop = 0/);
  assert.match(method,/item\.closest\("\.sidebar-group"\)/);
  assert.match(method,/group\.open = true/);
  assert.match(method,/aria-current/);
  assert.match(admin,/history\.scrollRestoration = "manual"/);
});

test("issues remain linked to their full evidence, while suggestions start closed",()=>{
  assert.match(html,/id="hq-findings-count"/);
  assert.match(html,/id="incident-chatgpt"/);
  assert.match(html,/id="incident-prepare"/);
  assert.match(html,/id="findings-list"/);
  assert.match(html,/id="hq-ideas-fold"/);
  assert.match(html,/<summary><span>Suggestions to improve later/);
  assert.match(html,/id="asset-findings-list"/);
  assert.match(html,/role="region" tabindex="0" aria-label="Scrollable reported problems"/);
  assert.match(admin,/window\.HQIncidentWorkspace\.open\(item/);
  assert.match(admin,/td\.title = original\.textContent/);
  assert.match(css,/\.hq-issue-title/);
  assert.match(css,/\.hq-issue-detail/);
});

test("responsive layout never requires permanently visible technical sidebars",()=>{
  assert.match(css,/@media \(max-width: 950px\)/);
  assert.match(css,/@media \(max-width: 760px\)/);
  assert.match(css,/\.hq-workgrid,\.intel-grid,\.demand-workspace \{ grid-template-columns: 1fr; \}/);
  assert.match(js,/wrapOptional\("#view-demand \.hq-market-feed"/);
  assert.match(js,/wrapOptional\("#view-demand \.hq-activity-panel"/);
  // Data is still in-place and the scheduled worker/security boundaries have
  // not been changed by the purely presentational route.
  assert.match(html,/id="repair-form"/);
  assert.match(html,/id="founder-permission-form"/);
});
