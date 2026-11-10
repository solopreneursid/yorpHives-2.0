export async function onRequestGet({ env }) {
  const checks = { database: "unavailable", schema: "unknown", migrations: "unknown" };
  let status = 503;
  if (env.DB) {
    try {
      await env.DB.prepare("SELECT 1 AS ok").first();
      checks.database = "ok";
      const schema = await env.DB.prepare("SELECT COUNT(*) AS table_count FROM sqlite_master WHERE type = 'table' AND name IN ('principals','api_keys','capability_grants','entitlements','rate_limit_windows','usage_ledger','credits_ledger','orders','payment_events','audit_events','idempotency_records','d1_migrations')").first();
      checks.schema = schema.table_count === 12 ? "ok" : "incomplete";
      const migrations = await env.DB.prepare("SELECT COUNT(*) AS applied FROM d1_migrations WHERE name IN ('0001_trust_commerce.sql','0002_spending_limits.sql')").first();
      checks.migrations = migrations.applied === 2 ? "ok" : "pending";
      status = checks.schema === "ok" && checks.migrations === "ok" ? 200 : 503;
    } catch {
      checks.database = "error";
      status = 503;
    }
  }
  return new Response(JSON.stringify({ status: status === 200 ? "ok" : "degraded", service: "yorphives-api", checks, timestamp: new Date().toISOString() }), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" }
  });
}
