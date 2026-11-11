import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { onRequest } from "../functions/_middleware.js";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("homepage leads with custom build requests and the approved product navigation", async () => {
  const html = await read("../index.html");
  for (const phrase of [
    "Have an idea?",
    "Let's build it.",
    "Trending tools",
    "Recently added",
    "Join as a builder",
    "INDIVIDUALS",
    "STARTUPS",
    "CREATORS",
    "SMALL BUSINESSES",
    "ENTERPRISE",
    "connect@yorphives.com",
  ]) {
    assert.ok(html.includes(phrase), `Missing homepage content: ${phrase}`);
  }
  for (const route of ["/free-tools/", "/explore/", "/builder/", "/connect/"]) {
    assert.ok(html.includes(`href="${route}"`), `Missing navigation route: ${route}`);
  }
});

test("homepage trends use measured seven-day usage and recent releases combine tools with applications", async () => {
  const html = await read("../index.html");
  const app = await read("../app.js");
  const trending = await read("../functions/api/v1/trending.ts");
  assert.match(html, /last 7 days/);
  assert.match(app, /fetch\("\/api\/v1\/trending"/);
  assert.match(app, /type=tool&limit=6/);
  assert.match(app, /type=application&limit=6/);
  assert.match(app, /detail_views/);
  assert.match(app, /launches/);
  assert.match(trending, /SUM\(u\.detail_views \+ u\.launches\)/);
  assert.match(trending, /date\('now', '-6 days'\)/);
  assert.match(trending, /HAVING SUM\(u\.detail_views \+ u\.launches\) >= 3/);
});

test("listing detail and launch interactions are recorded as first-party daily aggregates", async () => {
  const script = await read("../listing/app.js");
  const endpoint = await read("../functions/api/v1/catalogue/[slug]/usage.ts");
  assert.match(script, /event: "detail_view"/);
  assert.match(script, /event: "launch"/);
  assert.match(endpoint, /origin !== new URL\(request\.url\)\.origin/);
  assert.match(endpoint, /catalogue_usage_daily/);
  assert.match(endpoint, /detail_views/);
  assert.match(endpoint, /launches/);
  assert.match(endpoint, /INVALID_EVENT/);
});

test("homepage provides accessible navigation and responsive stylesheet", async () => {
  const html = await read("../index.html");
  const css = await read("../styles.css");
  assert.match(html, /aria-label="Main navigation"/);
  assert.match(html, /aria-controls="mobile-nav"/);
  assert.match(html, /href="\/styles\.css"/);
  assert.match(css, /@media\s*\(max-width:\s*700px\)/);
  assert.match(css, /prefers-reduced-motion/);
});

test("agent overview accurately describes implemented and future capabilities", async () => {
  const overview = await read("../llms.txt");
  assert.match(overview, /being developed in stages/);
  assert.match(overview, /do not assume undocumented endpoints exist/);
  assert.match(overview, /Dodo Payments/);
  assert.match(overview, /MCP tools are not yet live/);
});

test("well-known manifest and OpenAPI document are published", async () => {
  const manifest = JSON.parse(await read("../.well-known/yorphives.json"));
  const openapi = await read("../openapi.yaml");
  assert.equal(manifest.name, "YorpHives");
  assert.equal(manifest.human_interfaces.free_tools, "/free-tools/");
  assert.equal(manifest.human_interfaces.applications, "/explore/");
  assert.equal(manifest.machine_interfaces.openapi, "/openapi.yaml");
  assert.match(openapi, /openapi: 3\.1\.0/);
  assert.match(openapi, /\/api\/v1\/catalogue/);
});

test("Explore catalogue APIs enforce YorpHives ownership", async () => {
  const listApi = await read("../functions/api/v1/catalogue.ts");
  const detailApi = await read("../functions/api/v1/catalogue/[slug].ts");
  const migration = await read("../migrations/0003_catalogue_ownership.sql");
  assert.match(listApi, /l\.owner_type = 'yorphives'/);
  assert.match(detailApi, /l\.owner_type = 'yorphives'/);
  assert.match(migration, /owner_type TEXT NOT NULL DEFAULT 'external'/);
});

test("homepage responds with Markdown when requested", async () => {
  const request = new Request("https://yorphives.com/", {
    headers: { accept: "text/markdown" },
  });
  const response = await onRequest({
    request,
    next: async () => new Response("<html>human UI</html>", {
      headers: { "content-type": "text/html" },
    }),
  });
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /text\/markdown/);
  assert.match(await response.text(), /^# YorpHives/);
});

test("homepage remains HTML for ordinary browser requests", async () => {
  const request = new Request("https://yorphives.com/", {
    headers: { accept: "text/html" },
  });
  const response = await onRequest({
    request,
    next: async () => new Response("<html>human UI</html>", {
      headers: { "content-type": "text/html" },
    }),
  });
  assert.equal(response.headers.get("content-type"), "text/html");
  assert.match(await response.text(), /human UI/);
});

test("Free Tools directory exposes substantial searchable browser-first catalogue", async () => {
  const html = await read("../free-tools/index.html");
  const manifest = JSON.parse(await read("../free-tools/manifest.json"));
  const runtime = await read("../free-tools/tool-runtime.js");
  const directory = await read("../free-tools/directory.js");
  const imageRuntime = await read("../free-tools/image-runtime.js");
  assert.ok(manifest.length >= 67, "Expected at least 55 published free tools");
  assert.match(html, /tool-search/);
  assert.match(html, /data-filter/);
  assert.match(html, /canonical/);
  assert.match(directory, /addEventListener\("input"/);
  assert.match(runtime, /crypto\.subtle\.digest/);
  assert.match(runtime, /crypto\.randomUUID/);
  for (const item of manifest) {
    assert.ok(["browser","library","network","planned"].includes(item.processing));
    assert.match(item.url, new RegExp(item.slug));
    const page = await read("../free-tools/" + item.slug + "/index.html");
    assert.match(page, new RegExp(item.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(page, /application\/ld\+json/);
    assert.match(page, /(?:tool-runtime|image-runtime|advanced-runtime|research-runtime)\.js/);
  }
});

test("Free Tools have an agent discovery API and machine-readable documentation", async () => {
  const api = await read("../functions/api/v1/free-tools.ts");
  const manifest = JSON.parse(await read("../.well-known/yorphives.json"));
  const llms = await read("../llms.txt");
  const openapi = await read("../openapi.yaml");
  assert.match(api, /text\/markdown/);
  assert.match(api, /FreeToolsResponse/);
  assert.match(api, /agent_execution: "not_available"/);
  assert.match(api, /"library" \| "network" \| "planned"/);
  assert.equal(manifest.machine_interfaces.free_tools, "/api/v1/free-tools");
  assert.match(llms, /api\/v1\/free-tools/);
  assert.match(openapi, /\/api\/v1\/free-tools/);
});

test("advanced Free Tools expose dedicated browser interfaces and disclosed processing modes", async () => {
  const manifest = JSON.parse(await read("../free-tools/manifest.json"));
  const runtime = await read("../free-tools/advanced-runtime.js");
  for (const slug of ["qr-code-generator","wifi-qr","vcard-qr","pdf-merger","pdf-splitter","pdf-compressor","jpg-to-pdf","pdf-to-jpg","heic-to-jpg","webp-converter","invoice-generator","sip-calculator","currency-converter","seo-analyzer","meta-tag-generator","sitemap-generator","youtube-thumbnail-downloader","social-image-sizes"]) {
    const item = manifest.find(entry => entry.slug === slug);
    assert.ok(item, "Missing manifest entry: " + slug);
    assert.ok(["browser","library","network"].includes(item.processing));
    const page = await read("../free-tools/" + slug + "/index.html");
    assert.match(page, /id="advanced-tool"/);
    assert.match(page, /advanced-runtime\.js/);
    assert.match(runtime, new RegExp(slug));
  }
  assert.equal(manifest.find(entry => entry.slug === "background-remover").processing, "library");
  for (const item of manifest) assert.equal(item.agent_execution, "not_available");
  assert.match(runtime, /background-removal/);
  assert.match(runtime, /<meta name="description" content=/);
  assert.match(runtime, /pdfjs-dist/);
  assert.match(runtime, /16-megapixel render limit/);
  assert.match(runtime, /quality/);
  assert.match(runtime, /Cross-origin fetch requires the target server to permit CORS/);
  assert.match(runtime, /maxPages/);
  assert.match(runtime, /same-origin crawl/i);
});


test("new researched Free Tools have unique manifest entries and dedicated pages", async () => {
 const manifest = JSON.parse(await read("../free-tools/manifest.json"));
 const slugs = manifest.map(item => item.slug);
 assert.equal(new Set(slugs).size, slugs.length, "Free Tool slugs must be unique");
 const runtime = await read("../free-tools/research-runtime.js");
 for (const slug of ["compound-interest-calculator","timezone-converter","bmr-calculator","sample-size-calculator","yaml-validator","xml-formatter","json-to-csv","json-ld-generator","cron-expression-helper","html-to-markdown","csv-to-markdown","llms-txt-generator","macro-calculator","saas-unit-economics-calculator","pdf-metadata-remover","color-palette-extractor","robots-ai-crawler-checker","ai-agent-readiness-checker"]) {
  const item = manifest.find(entry => entry.slug === slug);
  assert.ok(item, "Missing manifest entry: " + slug);
  assert.equal(item.agent_execution, "not_available");
  const page = await read("../free-tools/" + slug + "/index.html");
  assert.match(page, /id="research-tool"/);
  assert.match(page, /research-runtime\.js/);
  assert.match(runtime, new RegExp(slug));
  assert.ok(page.includes(item.title));
 }
});

test("second researched Free Tools batch has dedicated browser interfaces and truthful execution modes", async () => {
 const manifest = JSON.parse(await read("../free-tools/manifest.json"));
 const runtime = await read("../free-tools/next-tools-runtime.js");
 const slugs = ["macro-calculator","saas-unit-economics-calculator","pdf-metadata-remover","color-palette-extractor","robots-ai-crawler-checker","ai-agent-readiness-checker"];
 for (const slug of slugs) {
  const item = manifest.find(entry => entry.slug === slug);
  assert.ok(item, "Missing manifest entry: " + slug);
  assert.equal(item.agent_execution, "not_available");
  const page = await read("../free-tools/" + slug + "/index.html");
  assert.match(page, /id="next-tool"/);
  assert.match(page, /next-tools-runtime\.js/);
  assert.ok(page.includes(item.title));
  assert.match(runtime, new RegExp(slug));
 }
 assert.equal(new Set(manifest.map(item => item.slug)).size, manifest.length);
 assert.equal(manifest.length, 73);
});
