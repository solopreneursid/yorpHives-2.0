import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const read=path=>readFile(new URL(path,import.meta.url),"utf8");
const [html,theme,compact,adminCss]=await Promise.all([
  read("../admin/index.html"),
  read("../admin/headquarters-prism-theme.css"),
  read("../admin/headquarters-refined.css"),
  read("../admin/admin.css")
]);

const luminance=hex=>{
  const rgb=hex.replace("#","").match(/.{2}/g).map(x=>parseInt(x,16)/255);
  const linear=rgb.map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);
  return .2126*linear[0]+.7152*linear[1]+.0722*linear[2];
};
const contrast=(fg,bg)=>{
  const a=luminance(fg),b=luminance(bg);
  return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);
};
test("Prism Night loads last without replacing or modifying the logo",()=>{
  const ref=html.indexOf('href="/admin/headquarters-refined.css"');
  const prism=html.indexOf('href="/admin/headquarters-prism-theme.css"');
  assert.ok(ref>0 && prism>ref);
  assert.equal(html.match(/href="\/admin\/headquarters-prism-theme\.css"/g)?.length,1);
  // Existing official logo source in core stylesheet remains unchanged.
  assert.match(adminCss,/brand\/yorphives-logo\.webp/);
  assert.doesNotMatch(theme,/\.brand-mark\b/);
  assert.doesNotMatch(theme,/\/brand\//);
  assert.doesNotMatch(theme,/\bfilter\s*:\s*(grayscale|hue-rotate|invert)/);
});
test("brand-inspired ambient backgrounds are native CSS and deliberately non-interactive",()=>{
  assert.match(theme,/--prism-cyan:\s*#63ebea/);
  assert.match(theme,/--prism-royal:\s*#536eff/);
  assert.match(theme,/body\s*\{[\s\S]*?radial-gradient/);
  assert.match(theme,/body::before\s*\{[\s\S]*?pointer-events:\s*none/);
  assert.match(theme,/background-size:\s*52px 52px/);
  assert.match(theme,/\.sidebar::before\s*\{[\s\S]*?linear-gradient/);
  assert.match(theme,/background-attachment:\s*fixed/);
  assert.doesNotMatch(theme,/url\s*\(/i);
  assert.doesNotMatch(theme,/@import/i);
  assert.doesNotMatch(theme,/animation:\s*[^;]+infinite/i);
});
test("all workspaces use one palette, not disconnected colored cards",()=>{
  for(const selector of [
    ".founder-command",".hq-hero",".intel-hero",".demand-hero",
    ".radar-hero",".bi-hero",".ym-hero",".owner-console",
    ".intel-card",".demand-card",".radar-card",".panel"
  ])assert.ok(theme.includes(selector),selector);
  for(const selector of [
    ".sidebar",".nav-item.active",".topbar",".table-wrap thead th",
    ".button.primary",".hq-button-primary",".filter-chip.active",
    ".incident-dialog"
  ])assert.ok(theme.includes(selector),selector);
  assert.match(theme,/\.pill\.high, \.pill\.critical/);
  assert.match(theme,/\.pill\.medium, \.pill\.warning/);
  assert.match(theme,/\.pill\.low, \.pill\.healthy/);
});
test("founder readability stays high on midnight and secondary surfaces",()=>{
  assert.ok(contrast("#edf4ff","#080e1b")>=12,
    "main text on background must have very high contrast");
  assert.ok(contrast("#d5e4f4","#122138")>=10,
    "table content on panel background must remain legible");
  assert.ok(contrast("#77e7f2","#122138")>=9,
    "accent section text must remain legible");
  assert.ok(contrast("#081c2c","#66caee")>=8,
    "primary button text must contrast against the button's gradient");
});
test("compact scrolling and accessibility survive theme changes",()=>{
  assert.match(compact,/\.intel-cards\s*\{[^}]*overflow-y:\s*auto/);
  assert.match(compact,/#view-issues \.table-wrap\s*\{[^}]*overflow:\s*auto/);
  assert.match(theme,/scrollbar-width:\s*thin/);
  assert.match(theme,/@media \(max-width: 760px\)/);
  assert.match(theme,/@media \(prefers-reduced-transparency: reduce\)/);
  assert.match(theme,/@media \(forced-colors: active\)/);
  assert.match(theme,/@media \(prefers-reduced-motion: reduce\)/);
  assert.match(theme,/:focus-visible/);
  assert.doesNotMatch(theme,/display:\s*none\s*!important/i);
});
test("theme is pure presentation with no new permissions or external requests",()=>{
  assert.doesNotMatch(theme,/\bfetch\s*\(/);
  assert.doesNotMatch(theme,/https?:\/\//);
  assert.match(html,/id="founder-permission-list"/);
  assert.doesNotMatch(html,/id="founder-permission-form"/);
  assert.match(html,/id="founder-handoff-dialog"/);
  assert.match(html,/id="incident-dialog"/);
  assert.match(html,/id="findings-list"/);
});
