import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");

test("trust schema includes isolated principals, scoped credentials and explicit grants", async () => {
  const sql = await read("../migrations/0001_trust_commerce.sql");
  const limits = await read("../migrations/0002_spending_limits.sql");
  assert.match(limits, /daily_spending_limit_minor/);
  assert.match(limits, /monthly_spending_limit_minor/);
  for (const table of ["principals", "api_keys", "capability_grants", "entitlements", "rate_limit_windows"]) {
    assert.match(sql, new RegExp(`CREATE TABLE ${table}\\b`));
  }
  assert.match(sql, /secret_hash TEXT NOT NULL UNIQUE/);
  assert.match(sql, /scopes_json TEXT NOT NULL/);
  assert.match(sql, /UNIQUE\(principal_id, idempotency_key\)/);
});

test("financial and audit ledgers are append-only at the database layer", async () => {
  const sql = await read("../migrations/0001_trust_commerce.sql");
  for (const table of ["usage_ledger", "credits_ledger", "payment_events", "audit_events"]) {
    assert.match(sql, new RegExp(`CREATE TRIGGER ${table}_no_update BEFORE UPDATE ON ${table}`));
    assert.match(sql, new RegExp(`CREATE TRIGGER ${table}_no_delete BEFORE DELETE ON ${table}`));
  }
});

test("commerce endpoints use server-controlled packs and verify provider webhooks", async () => {
  const checkout = await read("../functions/api/v1/commerce/checkout.js");
  const webhook = await read("../functions/api/webhooks/stripe.js");
  const settlement = await read("../functions/_lib/stripe.js");
  assert.match(checkout, /YH_CREDIT_PACKS_JSON/);
  assert.match(checkout, /Idempotency-Key/);
  assert.doesNotMatch(checkout, /amount_minor.*request/i);
  assert.match(webhook, /verifyStripeSignature/);
  assert.match(settlement, /payment_status !== "paid"/);
  assert.match(settlement, /INSERT OR IGNORE INTO credits_ledger/);
});

test("production secrets are referenced only as runtime environment bindings", async () => {
  const routes = await read("../functions/api/v1/identity/provision.js");
  const checkout = await read("../functions/api/v1/commerce/checkout.js");
  const webhook = await read("../functions/api/webhooks/stripe.js");
  assert.match(routes, /env\.YH_BOOTSTRAP_SECRET/);
  assert.match(checkout, /env\.STRIPE_SECRET_KEY/);
  assert.match(webhook, /env\.STRIPE_WEBHOOK_SECRET/);
  assert.doesNotMatch(routes + checkout + webhook, /sk_live_[A-Za-z0-9]+/);
});

test("identity, grants and reconciliation are gated by distinct credentials", async () => {
  const grants = await read("../functions/api/v1/identity/grants.js");
  const reconcile = await read("../functions/api/v1/commerce/reconcile.js");
  const keys = await read("../functions/api/v1/identity/keys.js");
  assert.match(grants, /capabilities:grant/);
  assert.match(grants, /per_execution_limit_minor/);
  assert.match(reconcile, /YH_COMMERCE_RECONCILE_SECRET/);
  assert.match(reconcile, /settleStripeSession/);
  assert.match(keys, /New keys cannot exceed the caller's scopes/);
});

test("HTTP and MCP execution both share the same trust and metering layer", async () => {
  const http = await read("../functions/api/v1/execute.js");
  const mcp = await read("../functions/api/mcp.js");
  assert.match(http, /authorizeCapability/);
  assert.match(http, /recordUsage/);
  assert.match(mcp, /authorizeCapability/);
  assert.match(mcp, /recordUsage/);
});

test("credit debits are conditional, append-only and idempotent", async () => {
  const platform = await read("../functions/_lib/platform.js");
  assert.match(platform, /INSERT OR IGNORE INTO credits_ledger/);
  assert.match(platform, /SUM\(delta_credits\)/);
  assert.match(platform, /insufficient_credits/);
  assert.match(platform, /duplicate: true/);
});

test("purchase history is principal-scoped and requires its own read scope", async () => {\n  const orders = await read("../functions/api/v1/commerce/orders.js");\n  assert.match(orders, /commerce:orders:read/);\n  assert.match(orders, /WHERE principal_id = \?/);\n});\n