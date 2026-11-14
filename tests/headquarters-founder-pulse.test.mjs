import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const base = new URL("../",import.meta.url);
const read = path => readFile(new URL(path,base),"utf8");
const ui = await read("admin/index.html");
const js = await read("admin/founder-pulse.js");
const css = await read("admin/founder-pulse.css");
const cockpit = await read("admin/cockpit.js");

test("the read-only founder feed is part of Headquarters Home", () => {
  assert.match(ui,/id="hq-pulse"/);
  assert.match(ui,/id="hq-pulse-feed"/);
  assert.match(ui,/role="tablist"/);
  assert.match(ui,/hq-mobile-dock/);
  assert.match(ui,/admin\/founder-pulse\.css/);
  assert.match(ui,/admin\/founder-pulse\.js/);
  assert.match(ui,/Your action inbox/);
  assert.doesNotMatch(ui,/id="founder-open-release"|id="founder-open-preview"/);
});
test("same authenticated read-only cockpit evidence; no second API or privileged action", () => {
  assert.match(cockpit,/yorphives:cockpit-evidence/);
  assert.match(js,/yorphives:cockpit-evidence/);
  assert.match(js,/read_only !== true/);
  assert.match(js,/\.replaceChildren/);
  assert.match(js,/\.textContent/);
  assert.doesNotMatch(js,/fetch\(|\.innerHTML\s*=|\.insertAdjacentHTML\(|method\s*:\s*["']POST/);
  assert.doesNotMatch(js,/localStorage|sessionStorage|analytics\.track|sendBeacon/);
});
test("only known private routes may be opened, with honest unavailable states", () => {
  assert.match(js,/const destinations = new Set/);
  assert.match(js,/\.nav-item\[data-view=/);
  assert.match(js,/An empty feed does not confirm/);
  assert.match(js,/not a live website probe/);
  assert.match(js,/data.availability === "unavailable"/);
  assert.match(js,/data.availability === "partial"/);
});
test("mobile quick bar and keyboard-accessible feed filters", () => {
  assert.match(css,/@media\(max-width:760px\)/);
  assert.match(css,/env\(safe-area-inset-bottom\)/);
  assert.match(js,/ArrowLeft/);
  assert.match(js,/aria-selected/);
  assert.match(css,/\.hq-mobile-dock/);
});
test("Watchtower cards cover all five founder concerns with no privileged controls", () => {
  for (const name of ["website","products","headquarters","market","revenue"]) {
    assert.match(ui,new RegExp('id="hq-watchtower-'+name+'-value"'),name);
    assert.match(ui,new RegExp('id="hq-watchtower-'+name+'-state"'),name);
  }
  assert.match(ui,/id="hq-watchtower-grid"/);
  assert.match(ui,/What Headquarters can actually see/);
  assert.match(js,/function renderWatchtower\(data\)/);
  assert.match(js,/product_functionality_verified|Functions|actual tool functions untested/i);
  assert.match(js,/private runtime uptime unverified/);
  assert.match(js,/Actual earnings and operating costs are not connected/);
  assert.doesNotMatch(ui,/id="release-go-live"|id="release-launch-preview"/);
});

test("Watchtower is swipeable and keyboard-accessible, and uses only saved evidence", () => {
  assert.match(css,/\.hq-watchtower-card:focus-visible/);
  assert.match(css,/scroll-snap-type:x mandatory/);
  assert.match(css,/overscroll-behavior-x:contain/);
  assert.match(js,/\.textContent = String\(value\)/);
  assert.match(js,/data\?\.sources\?\.coverage\?\.available === true/);
  assert.doesNotMatch(js,/fetch\(|innerHTML\s*=|insertAdjacentHTML\(/);
});
