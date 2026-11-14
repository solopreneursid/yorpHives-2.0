import { adminJson, isAdminResponse, requireAdmin, type AdminRequestContext } from "../../_lib/admin-auth";
import { prioritizeFindingRecords } from "../../_lib/finding-priority.js";

interface FindingRow {
  id: string; severity: string; title: string; details: string; status: string;
  first_detected: string; last_verified: string; resolved_at: string | null;
  monitor_name: string | null; monitor_url: string | null; environment: string | null;
  source_type: "monitor" | "asset"; recommendation?: string; category?: string;
}
interface AssetFindingRow {
  id: string; severity: string; title: string; details: string; status: string;
  first_detected: string; last_verified: string; resolved_at: string | null;
  asset_title: string; asset_url: string; asset_key: string; category: string; recommendation: string;
}
interface FindingActionRequest { id?: string; status?: "open" | "investigating" | "accepted_risk"; }

export async function onRequestGet(context: AdminRequestContext): Promise<Response> {
  const identity = await requireAdmin(context);
  if (isAdminResponse(identity)) return identity;
  const status = new URL(context.request.url).searchParams.get("status") || "active";
  if (!["active", "all", "resolved"].includes(status)) {
    return adminJson({ error: { code: "INVALID_STATUS", message: "Status must be active, all, or resolved." } }, 400);
  }
  const where = status === "active"
    ? "WHERE f.status IN ('open', 'investigating', 'awaiting_approval')"
    : status === "resolved" ? "WHERE f.status IN ('fixed', 'verified', 'accepted_risk')" : "";
  const assetWhere = status === "active"
    ? "WHERE f.status IN ('open', 'investigating', 'awaiting_approval')"
    : status === "resolved" ? "WHERE f.status IN ('fixed', 'accepted_risk')" : "";
  const [monitors, assets] = await Promise.all([
    context.env.DB!.prepare(`
      SELECT f.id, f.severity, f.title, f.details, f.status, f.first_detected, f.last_verified, f.resolved_at,
        m.name AS monitor_name, m.url AS monitor_url, m.environment, 'monitor' AS source_type
      FROM admin_findings f LEFT JOIN admin_monitors m ON m.id = f.monitor_id
      ${where}
      ORDER BY CASE f.severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 ELSE 4 END,
        f.last_verified DESC LIMIT 150
    `).all<FindingRow>(),
    context.env.DB!.prepare(`
      SELECT f.id, f.severity, f.title, f.details, f.status, f.first_detected, f.last_verified, f.resolved_at,
        a.title AS asset_title, a.url AS asset_url, a.asset_key, f.category, f.recommendation
      FROM admin_asset_findings f JOIN admin_assets a ON a.id = f.asset_id
      ${assetWhere}
      ORDER BY CASE f.severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 ELSE 4 END,
        f.last_verified DESC LIMIT 200
    `).all<AssetFindingRow>()
  ]);
  const monitorRows = monitors.results.map(item => ({ ...item, source_type: "monitor" as const }));
  const assetRows = assets.results.map(item => ({
    id: item.id, severity: item.severity, title: item.title, details: item.details, status: item.status,
    first_detected: item.first_detected, last_verified: item.last_verified, resolved_at: item.resolved_at,
    monitor_name: item.asset_title, monitor_url: item.asset_url, environment: "production",
    source_type: "asset" as const, recommendation: item.recommendation, category: item.category, asset_key: item.asset_key
  }));
  const data = [...monitorRows, ...assetRows].sort((a, b) => {
    const rank: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
    return (rank[a.severity] ?? 5) - (rank[b.severity] ?? 5) || b.last_verified.localeCompare(a.last_verified);
  });
  return adminJson({ data: prioritizeFindingRecords(data.slice(0, 250)) });
}

export async function onRequestPatch(context: AdminRequestContext): Promise<Response> {
  const identity = await requireAdmin(context);
  if (isAdminResponse(identity)) return identity;
  const origin = context.request.headers.get("origin");
  if (!origin || origin !== new URL(context.request.url).origin) {
    return adminJson({ error: { code: "INVALID_ORIGIN", message: "Admin actions must originate from this site." } }, 403);
  }
  if (!context.request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return adminJson({ error: { code: "INVALID_CONTENT_TYPE", message: "A JSON request body is required." } }, 415);
  }
  const body = await context.request.json().catch(() => null) as FindingActionRequest | null;
  if (!body?.id || !["open", "investigating", "accepted_risk"].includes(body.status || "")) {
    return adminJson({ error: { code: "INVALID_ACTION", message: "Provide a finding id and an allowed triage status." } }, 400);
  }
  const db = context.env.DB!;
  const monitor = await db.prepare("SELECT id,status FROM admin_findings WHERE id=?").bind(body.id).first<{ id: string; status: string }>();
  const asset = monitor ? null : await db.prepare("SELECT id,status FROM admin_asset_findings WHERE id=?").bind(body.id).first<{ id: string; status: string }>();
  if (!monitor && !asset) return adminJson({ error: { code: "FINDING_NOT_FOUND", message: "Finding was not found." } }, 404);
  const existing = monitor || asset!;
  const table = monitor ? "admin_findings" : "admin_asset_findings";
  const timestamp = new Date().toISOString();
  const resolvedAt = body.status === "accepted_risk" ? timestamp : null;
  await db.prepare("UPDATE " + table + " SET status=?,resolved_at=? WHERE id=?").bind(body.status, resolvedAt, body.id).run();
  await db.prepare("INSERT INTO admin_audit_events (id,actor,action,resource_type,resource_id,details_json,created_at) VALUES (?,?,?,?,?,?,?)")
    .bind(crypto.randomUUID(), identity.email, "finding_status_changed", monitor ? "finding" : "asset_finding", body.id,
      JSON.stringify({ from: existing.status, to: body.status }), timestamp).run();
  return adminJson({ success: true, id: body.id, status: body.status, source_type: monitor ? "monitor" : "asset" });
}
