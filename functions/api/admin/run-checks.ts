import { adminJson, isAdminResponse, requireAdmin, type AdminRequestContext } from "../../_lib/admin-auth";
interface MonitorRow { id: string; name: string; url: string; environment: "production" | "preview"; }
interface CheckResult { monitor_id: string; ok: boolean; status_code: number | null; duration_ms: number; error_message: string | null; }

function allowedMonitorUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    const allowedHost = url.hostname === "yorphives.com" || url.hostname === "www.yorphives.com" || url.hostname === "yorphives-2-preview.pages.dev";
    if (url.protocol !== "https:" || !allowedHost || url.username || url.password || url.port || url.search || url.hash) return null;
    return url;
  } catch { return null; }
}
async function checkMonitor(monitor: MonitorRow): Promise<CheckResult> {
  const url = allowedMonitorUrl(monitor.url);
  if (!url) return { monitor_id: monitor.id, ok: false, status_code: null, duration_ms: 0, error_message: "Monitor URL is outside the approved HTTPS host allowlist." };
  const started = Date.now();
  try {
    const response = await fetch(url.toString(), {
      method: "GET",
      headers: { "user-agent": "YorpHives-SiteHealth/1.0", "range": "bytes=0-1023" },
      redirect: "manual",
      signal: AbortSignal.timeout(8000),
    });
    const duration = Date.now() - started;
    const ok = response.status >= 200 && response.status < 400;
    await response.body?.cancel();
    return { monitor_id: monitor.id, ok, status_code: response.status, duration_ms: duration, error_message: ok ? null : "HTTP " + response.status };
  } catch (error) {
    return { monitor_id: monitor.id, ok: false, status_code: null, duration_ms: Date.now() - started, error_message: error instanceof Error ? error.message.slice(0, 240) : "Network check failed." };
  }
}
export async function onRequestPost(context: AdminRequestContext): Promise<Response> {
  const identity = await requireAdmin(context);
  if (isAdminResponse(identity)) return identity;
  const origin = context.request.headers.get("origin");
  if (!origin || origin !== new URL(context.request.url).origin) return adminJson({ error: { code: "INVALID_ORIGIN", message: "Admin actions must originate from this site." } }, 403);
  if (!context.request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return adminJson({ error: { code: "INVALID_CONTENT_TYPE", message: "A JSON request body is required." } }, 415);
  const db = context.env.DB!;
  const body = await context.request.json().catch(() => ({})) as { confirm?: boolean };
  if (body.confirm !== true) return adminJson({ error: { code: "CONFIRMATION_REQUIRED", message: "Send { confirm: true } to run the approved read-only HTTP checks." } }, 400);
  const monitorRows = await db.prepare("SELECT id, name, url, environment FROM admin_monitors WHERE enabled = 1 ORDER BY environment, name LIMIT 10").all<MonitorRow>();
  const monitors = monitorRows.results;
  if (monitors.length === 0) return adminJson({ error: { code: "NO_MONITORS", message: "No enabled monitors are configured." } }, 409);
  const runId = crypto.randomUUID();
  const startedAt = new Date().toISOString();
  await db.prepare("INSERT INTO admin_runs (id, trigger_source, status, started_at, monitor_count) VALUES (?, 'manual', 'running', ?, ?)").bind(runId, startedAt, monitors.length).run();
  const results = await Promise.all(monitors.map(checkMonitor));
  const completedAt = new Date().toISOString();
  const passed = results.filter((result) => result.ok).length;
  const failed = results.length - passed;
  const statements = results.map((result) => db.prepare(`
    INSERT INTO admin_checks (id, run_id, monitor_id, ok, status_code, duration_ms, error_message, checked_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(crypto.randomUUID(), runId, result.monitor_id, result.ok ? 1 : 0, result.status_code, result.duration_ms, result.error_message, completedAt));
  for (const result of results) {
    const monitor = monitors.find((item) => item.id === result.monitor_id)!;
    const fingerprint = "http-health:" + monitor.id;
    if (result.ok) {
      statements.push(db.prepare("UPDATE admin_findings SET status = 'verified', resolved_at = ?, last_verified = ? WHERE fingerprint = ? AND status IN ('open', 'investigating', 'awaiting_approval')").bind(completedAt, completedAt, fingerprint));
    } else {
      const severity = monitor.environment === "production" ? "high" : "medium";
      const detail = result.error_message || "HTTP check failed.";
      statements.push(db.prepare(`
        INSERT INTO admin_findings (id, fingerprint, monitor_id, run_id, severity, title, details, status, first_detected, last_verified)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?, ?)
        ON CONFLICT(fingerprint) DO UPDATE SET run_id = excluded.run_id, severity = excluded.severity,
          details = excluded.details, last_verified = excluded.last_verified,
          status = CASE WHEN admin_findings.status IN ('fixed', 'verified') THEN 'open' ELSE admin_findings.status END,
          resolved_at = NULL
      `).bind(crypto.randomUUID(), fingerprint, monitor.id, runId, severity, monitor.name + " is not healthy", detail, completedAt, completedAt));
    }
  }
  statements.push(db.prepare("UPDATE admin_runs SET status = 'completed', completed_at = ?, passed_count = ?, failed_count = ? WHERE id = ?").bind(completedAt, passed, failed, runId));
  await db.batch(statements);
  return adminJson({ run: { id: runId, status: "completed", started_at: startedAt, completed_at: completedAt, monitor_count: monitors.length, passed_count: passed, failed_count: failed }, results }, failed > 0 ? 207 : 200);
}
