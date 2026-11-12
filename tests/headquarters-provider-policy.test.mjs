import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");

test("Business Intelligence contains no OpenSEO outbound dependency", async () => {
  const html = await read("../admin/index.html");
  assert.doesNotMatch(html, /app\.openseo\.so|OpenSEO\s*\/\s*connect/i);
  assert.match(html, /First-party evidence · new integrations require owner approval/);
});

test("Headquarters displays first-party mission quota and blocks exhausted dispatch UI", async () => {
  const html = await read("../admin/index.html");
  const script = await read("../admin/headquarters.js");
  assert.match(html, /id="hq-mission-budget"/);
  assert.match(script, /snapshot\.mission_budget/);
  assert.match(script, /remaining > 0/);
  assert.match(script, /allowance is exhausted/);
});
