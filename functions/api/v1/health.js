export async function onRequestGet({ env }) {
  const checks = { database: "unavailable" };
  let status = 503;
  if (env.DB) {
    try {
      await env.DB.prepare("SELECT 1 AS ok").first();
      checks.database = "ok";
      status = 200;
    } catch {
      checks.database = "error";
    }
  }
  return new Response(JSON.stringify({ status: status === 200 ? "ok" : "degraded", service: "yorphives-api", checks, timestamp: new Date().toISOString() }), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" }
  });
}
