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
    "Discover Builder",
    "connect@yorphives.com",
  ]) {
    assert.ok(html.includes(phrase), `Missing homepage content: ${phrase}`);
  }
  for (const route of ["/free-tools/", "/explore/", "/builder/", "/connect/"]) {
    assert.ok(html.includes(`href="${route}"`), `Missing navigation route: ${route}`);
  }
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
  assert.match(listApi, /l\\.owner_type = 'yorphives'/);
  assert.match(detailApi, /l\\.owner_type = 'yorphives'/);
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
