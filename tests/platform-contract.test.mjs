import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { onRequest } from "../functions/_middleware.js";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("homepage communicates all five platform pathways", async () => {
  const html = await read("../index.html");
  for (const phrase of [
    "Discover tools",
    "Build solutions",
    "Find ways to earn",
    "Adopt applications",
    "Connect capabilities",
  ]) {
    assert.ok(html.includes(phrase), `Missing platform pathway: ${phrase}`);
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

test("agent overview does not claim unbuilt pathways are live", async () => {
  const overview = await read("../llms.txt");
  assert.match(overview, /being developed in stages/);
  assert.match(overview, /do not assume undocumented endpoints exist/);
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
