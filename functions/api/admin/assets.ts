import { adminJson, isAdminResponse, requireAdmin, type AdminRequestContext } from "../../_lib/admin-auth";

interface AssetRow {
  id: string; asset_key: string; asset_type: string; title: string; url: string; source: string;
  last_status: string | null; last_http_status: number | null; last_checked_at: string | null;
  last_changed_at: string | null; last_duration_ms: number | null; last_title: string | null;
  last_description: string | null; last_canonical: string | null;
}
interface CatalogueApplication { id: string; slug: string; title: string; status: string; access_model: string; destination_url: string | null; updated_at: string; }
interface AssetFinding {
  id: string; asset_id: string; asset_key: string; asset_title: string; severity: string;
  category: string; title: string; details: string; recommendation: string; status: string;
  first_detected: string; last_verified: string;
}
export async function onRequestGet(context: AdminRequestContext): Promise<Response> {
  const identity = await requireAdmin(context);
  if (isAdminResponse(identity)) return identity;
  const db = context.env.DB!;
  const [assets, findings, dependencies, catalogue] = await Promise.all([
    db.prepare("SELECT id, asset_key, asset_type, title, url, source, last_status, last_http_status, last_checked_at, last_changed_at, last_duration_ms, last_title, last_description, last_canonical FROM admin_assets WHERE active=1 ORDER BY CASE asset_type WHEN 'website_page' THEN 0 WHEN 'free_tool' THEN 1 WHEN 'product' THEN 2 ELSE 3 END, title").all<AssetRow>(),
    db.prepare(`SELECT f.id, f.asset_id, a.asset_key, a.title AS asset_title, f.severity, f.category, f.title, f.details, f.recommendation, f.status, f.first_detected, f.last_verified FROM admin_asset_findings f JOIN admin_assets a ON a.id=f.asset_id WHERE f.status IN ('open','investigating','awaiting_approval') ORDER BY CASE f.severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 ELSE 4 END, f.last_verified DESC LIMIT 200`).all<AssetFinding>(),
    db.prepare("SELECT dependency_key, package_name, current_version, latest_version, deprecated_message, source_url, status, checked_at, details FROM admin_dependency_observations ORDER BY CASE status WHEN 'deprecated' THEN 0 WHEN 'major_update' THEN 1 WHEN 'update_available' THEN 2 ELSE 3 END, package_name LIMIT 100").all(),
    db.prepare("SELECT id, slug, title, status, access_model, destination_url, updated_at FROM catalogue_listings WHERE owner_type='yorphives' AND listing_type='application' ORDER BY updated_at DESC LIMIT 150").all<CatalogueApplication>()
  ]);
  const counts = {
    assets: assets.results.length,
    website_pages: assets.results.filter(row => row.asset_type === "website_page").length,
    free_tools: assets.results.filter(row => row.asset_type === "free_tool").length,
    products: assets.results.filter(row => row.asset_type === "product").length,
    api_discovery: assets.results.filter(row => row.asset_type === "api" || row.asset_type === "discovery").length,
    healthy: assets.results.filter(row => row.last_status === "healthy").length,
    degraded: assets.results.filter(row => row.last_status === "degraded").length,
    unavailable: assets.results.filter(row => row.last_status === "unavailable").length,
    open_findings: findings.results.length,
    deprecated_dependencies: (dependencies.results || []).filter(row => row.status === "deprecated").length,
    updates_available: (dependencies.results || []).filter(row => ["update_available","major_update"].includes(row.status)).length
  };
  return adminJson({ identity: identity.email, counts: { ...counts, catalogue_applications: catalogue.results.length }, assets: assets.results, findings: findings.results, dependencies: dependencies.results || [], catalogue: catalogue.results || [] });
}
