import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("discovery page is connected to the canonical catalogue API", async () => {
  const html = await read("../discover/index.html");
  const script = await read("../discover/app.js");
  assert.match(html, /id="search-form"/);
  assert.match(html, /id="empty-state"/);
  assert.match(html, /id="load-more"/);
  assert.match(script, /fetch\("\/api\/v1\/catalogue\?/);
  assert.match(script, /encodeURIComponent\(listing\.slug\)/);
  assert.match(script, /textContent = listing\.title/);
});

test("discovery UI offers the five audience types without sample listings", async () => {
  const html = await read("../discover/index.html");
  for (const audience of ["people", "businesses", "creators", "application_users", "ai_agents"]) {
    assert.ok(html.includes(audience), "Missing audience filter: " + audience);
  }
  assert.match(html, /No verified listings yet/);
  assert.match(html, /won't fill this space with unverified or placeholder listings/);
  assert.doesNotMatch(html, /Featured Tool|Trending App|Top Rated Tool/);
});

test("listing detail page loads by slug and validates external destinations", async () => {
  const html = await read("../listing/index.html");
  const script = await read("../listing/app.js");
  assert.match(html, /id="listing-content"/);
  assert.match(script, /\/api\/v1\/catalogue\//);
  assert.match(script, /url\.protocol === "https:" \|\| url\.protocol === "http:"/);
  assert.match(script, /rel.*noopener noreferrer|rel = "noopener noreferrer"/);
});
