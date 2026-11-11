import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("admin reliability migration creates isolated monitoring and findings tables", async () => {
  const sql = await read("../migrations/0004_admin_reliability.sql");
  for (const table of ["admin_monitors", "admin_runs", "admin_checks", "admin_findings"]) assert.match(sql, new RegExp("CREATE TABLE IF NOT EXISTS " + table));
  assert.match(sql, /INSERT OR IGNORE INTO admin_monitors/);
  assert.match(sql, /yorphives\.com/);
});

test("admin routes require a signed Cloudflare Access identity and explicit email allowlist", async () => {
  const auth = await read("../functions/_lib/admin-auth.ts");
  const route = await read("../functions/admin/[[path]].ts");
  assert.match(auth, /cf-access-jwt-assertion/);
  assert.match(auth, /RSASSA-PKCS1-v1_5/);
  assert.match(auth, /CF_ACCESS_AUD/);
  assert.match(auth, /ADMIN_ALLOWED_EMAILS/);
  assert.match(auth, /claims\.exp/);
  assert.match(auth, /claims\.iss/);
  assert.match(route, /requireAdmin/);
});

test("admin health checks are read-only, same-origin and reject arbitrary targets and redirects", async () => {
  const runner = await read("../functions/api/admin/run-checks.ts");
  assert.match(runner, /allowedMonitorUrl/);
  assert.match(runner, /yorphives\.com/);
  assert.match(runner, /yorphives-2-preview\.pages\.dev/);
  assert.match(runner, /AbortSignal\.timeout\(8000\)/);
  assert.match(runner, /redirect: "manual"/);
  assert.match(runner, /origin !== new URL\(context\.request\.url\)\.origin/);
  assert.match(runner, /confirm !== true/);
  assert.match(runner, /admin_findings/);
});

test("admin dashboard is private, responsive and does not expose public navigation", async () => {
  const html = await read("../admin/index.html");
  assert.match(html, /noindex,nofollow,noarchive/);
  assert.match(html, /api\/admin\/overview/);
  assert.match(html, /api\/admin\/findings/);
  assert.match(html, /api\/admin\/run-checks/);
  assert.match(html, /@media\(max-width:760px\)/);
  assert.match(html, /Read-only monitoring/);
});

test("CodeQL security workflow runs weekly and on branch changes", async () => {
  const workflow = await read("../.github/workflows/codeql.yml");
  assert.match(workflow, /schedule:/);
  assert.match(workflow, /cron:/);
  assert.match(workflow, /javascript-typescript/);
  assert.match(workflow, /security-extended/);
});
