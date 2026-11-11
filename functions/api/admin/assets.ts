import { adminJson, isAdminResponse, requireAdmin, type AdminRequestContext } from "../../_lib/admin-auth";

const PUBLIC_ORIGIN = "https://yorphives.com";
interface AssetRow {
  id: string; asset_key: string; asset_type: string; title: string; url: string; source: string;
  last_status: string | null; last_http_status: number | null; last_checked_at: string | null;
  last_changed_at: string | null; last_duration_ms: number | null; last_title: string | null;
  last_description: string | null; last_canonical: string | null;
}
interface CatalogueApplication {
  id: string; slug: string; title: string; status: string; access_model: string;
  destination_url: string | null; updated_at: string; source?: string;
}
interface PublicCatalogueListing {
  id: string; slug: string; title: string; destination_url: string | null;
  access?: { model?: string }; updated_at: string;
}
interface PublicTool {
  slug: string; title: string; category: string; description: string; url: string;
  processing: string;
}
interface AssetFinding {
  id: string; asset_id: string; asset_key: string; asset_title: string; severity: string;
  category: string; title: string; details: string; recommendation: string; status: string;
  first_detected: string; last_verified: string;
}
interface PublicCatalogueResponse { data: PublicCatalogueListing[]; pagination?: { count?: number; limit?: number; offset?: number }; }
interface PublicToolsResponse { data: PublicTool[]; count?: number; }
interface PublicSourceResult<T> { data: T; error: string | null; }

function sameOriginUrl(value: string): URL | null {
  try {
    const url = new URL(value, PUBLIC_ORIGIN);
    if (url.origin !== PUBLIC_ORIGIN || url.protocol !== "https:" || url.username || url.password) return null;
    return url;
  } catch {
    return null;
  }
}

async function fetchPublicJson<T>(path: string): Promise<T> {
  const url = new URL(path, PUBLIC_ORIGIN);
  const response = await fetch(url, {
    headers: { accept: "application/json", "user-agent": "YorpHives-AdminInventory/1.0" },
    redirect: "manual",
    signal: AbortSignal.timeout(7000)
  });
  if (!response.ok) throw new Error("Public inventory source returned HTTP " + response.status + ".");
  if (response.url && new URL(response.url).origin !== PUBLIC_ORIGIN) throw new Error("Public inventory source redirected outside YorpHives.");
  return await response.json() as T;
}

async function loadPublicCatalogue(): Promise<PublicSourceResult<PublicCatalogueListing[]>> {
  const data: PublicCatalogueListing[] = [];
  let error: string | null = null;
  let total = 0;
  const pageSize = 50;
  const maxPages = 5;
  try {
    for (let page = 0; page < maxPages && (page === 0 || data.length < total); page++) {
      const url = new URL("/api/v1/catalogue", PUBLIC_ORIGIN);
      url.searchParams.set("type", "application");
      url.searchParams.set("limit", String(pageSize));
      url.searchParams.set("offset", String(data.length));
      const response = await fetchPublicJson<PublicCatalogueResponse>(url.pathname + url.search);
      if (!Array.isArray(response.data) || !response.pagination) throw new Error("Public application catalogue response is invalid.");
      total = Number(response.pagination.count || 0);
      data.push(...response.data.filter(item => item && typeof item.slug === "string" && typeof item.title === "string"));
      if (!response.data.length) break;
    }
    if (total > data.length) error = "Public catalogue returned " + data.length + " of " + total + " applications (display cap: " + maxPages * pageSize + ").";
  } catch (cause) {
    error = cause instanceof Error ? cause.message : "Public application catalogue could not be loaded.";
  }
  return { data, error };
}

async function loadPublicTools(): Promise<PublicSourceResult<PublicTool[]>> {
  try {
    const response = await fetchPublicJson<PublicToolsResponse>("/api/v1/free-tools");
    if (!Array.isArray(response.data)) throw new Error("Free Tools inventory response is invalid.");
    return { data: response.data.filter(item => item && typeof item.slug === "string" && typeof item.url === "string"), error: null };
  } catch (cause) {
    return { data: [], error: cause instanceof Error ? cause.message : "Free Tools inventory could not be loaded." };
  }
}

async function loadOpenApi(): Promise<PublicSourceResult<string[]>> {
  try {
    const url = new URL("/openapi.yaml", PUBLIC_ORIGIN);
    const response = await fetch(url, {
      headers: { accept: "application/yaml,text/yaml,text/plain", "user-agent": "YorpHives-AdminInventory/1.0" },
      redirect: "manual",
      signal: AbortSignal.timeout(7000)
    });
    if (!response.ok) throw new Error("OpenAPI document returned HTTP " + response.status + ".");
    const spec = await response.text();
    if (spec.length > 2_000_000) throw new Error("OpenAPI document exceeded the 2 MB inventory limit.");
    const lines = spec.split(/\r?\n/);
    const paths = new Set<string>();
    for (let index = 0; index < lines.length; index++) {
      const match = lines[index].match(/^  (\/[^:]+):\s*$/);
      if (!match) continue;
      const path = match[1];
      if (!path.startsWith("/api/") || path.startsWith("/api/admin/") || path.includes("{") || path.includes("}")) continue;
      let hasGet = false;
      for (let next = index + 1; next < lines.length && !/^  \S/.test(lines[next]); next++) {
        if (/^    get:\s*$/.test(lines[next])) { hasGet = true; break; }
      }
      if (hasGet && sameOriginUrl(path)) paths.add(path);
    }
    return { data: [...paths], error: null };
  } catch (cause) {
    return { data: [], error: cause instanceof Error ? cause.message : "OpenAPI registry could not be loaded." };
  }
}

async function loadSitemap(): Promise<PublicSourceResult<string[]>> {
  try {
    const response = await fetch(new URL("/sitemap.xml", PUBLIC_ORIGIN), {
      headers: { accept: "application/xml,text/xml", "user-agent": "YorpHives-AdminInventory/1.0" },
      redirect: "manual",
      signal: AbortSignal.timeout(7000)
    });
    if (!response.ok) throw new Error("Sitemap returned HTTP " + response.status + ".");
    const xml = await response.text();
    if (xml.length > 2_000_000) throw new Error("Sitemap exceeded the 2 MB inventory limit.");
    const paths = new Set<string>();
    for (const match of xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)) {
      const url = sameOriginUrl(match[1].replace(/&amp;/g, "&").trim());
      if (!url || url.pathname === "/sitemap.xml" || url.pathname === "/free-tools/manifest.json") continue;
      paths.add(url.pathname);
    }
    return { data: [...paths], error: null };
  } catch (cause) {
    return { data: [], error: cause instanceof Error ? cause.message : "Sitemap could not be loaded." };
  }
}

function virtualAsset(assetKey: string, assetType: string, title: string, url: string, source: string): AssetRow {
  return {
    id: "discovered:" + assetKey, asset_key: assetKey, asset_type: assetType, title, url, source,
    last_status: "not_checked", last_http_status: null, last_checked_at: null,
    last_changed_at: null, last_duration_ms: null, last_title: null, last_description: null, last_canonical: null
  };
}

function titleFromPath(path: string): string {
  if (path === "/") return "Homepage";
  return path.split("/").filter(Boolean).slice(-1)[0].replace(/[-_]/g, " ").replace(/\b\w/g, letter => letter.toUpperCase());
}

export async function onRequestGet(context: AdminRequestContext): Promise<Response> {
  const identity = await requireAdmin(context);
  if (isAdminResponse(identity)) return identity;
  const db = context.env.DB!;
  const [assets, findings, dependencies, localCatalogue, publicCatalogue, publicTools, sitemap, openapi] = await Promise.all([
    db.prepare("SELECT id, asset_key, asset_type, title, url, source, last_status, last_http_status, last_checked_at, last_changed_at, last_duration_ms, last_title, last_description, last_canonical FROM admin_assets WHERE active=1 ORDER BY CASE asset_type WHEN 'website_page' THEN 0 WHEN 'free_tool' THEN 1 WHEN 'product' THEN 2 ELSE 3 END, title").all<AssetRow>(),
    db.prepare(`SELECT f.id, f.asset_id, a.asset_key, a.title AS asset_title, f.severity, f.category, f.title, f.details, f.recommendation, f.status, f.first_detected, f.last_verified FROM admin_asset_findings f JOIN admin_assets a ON a.id=f.asset_id WHERE f.status IN ('open','investigating','awaiting_approval') ORDER BY CASE f.severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 ELSE 4 END, f.last_verified DESC LIMIT 200`).all<AssetFinding>(),
    db.prepare("SELECT dependency_key, package_name, current_version, latest_version, deprecated_message, source_url, status, checked_at, details FROM admin_dependency_observations ORDER BY CASE status WHEN 'deprecated' THEN 0 WHEN 'major_update' THEN 1 WHEN 'update_available' THEN 2 ELSE 3 END, package_name LIMIT 100").all(),
    db.prepare("SELECT id, slug, title, status, access_model, destination_url, updated_at FROM catalogue_listings WHERE owner_type='yorphives' AND listing_type='application' ORDER BY updated_at DESC LIMIT 150").all<CatalogueApplication>(),
    loadPublicCatalogue(),
    loadPublicTools(),
    loadSitemap(),
    loadOpenApi()
  ]);

  const catalogueBySlug = new Map<string, CatalogueApplication>();
  for (const item of localCatalogue.results || []) catalogueBySlug.set(item.slug, { ...item, source: "staging catalogue" });
  for (const item of publicCatalogue.data) catalogueBySlug.set(item.slug, {
    id: item.id, slug: item.slug, title: item.title, status: "available",
    access_model: item.access?.model || "unknown", destination_url: item.destination_url,
    updated_at: item.updated_at, source: "public catalogue"
  });
  const catalogue = [...catalogueBySlug.values()].sort((a, b) => b.updated_at.localeCompare(a.updated_at));

  const discovered = new Map<string, AssetRow>();
  for (const item of assets.results) discovered.set(item.asset_key, item);
  for (const tool of publicTools.data) {
    const destination = sameOriginUrl(tool.url);
    if (!destination) continue;
    const key = "tool:" + tool.slug;
    const existing = discovered.get(key);
    if (tool.processing === "planned") {
      if (existing) existing.last_status = "planned";
      else {
        const planned = virtualAsset(key, "free_tool", tool.title, destination.pathname, "public Free Tools API");
        planned.last_status = "planned";
        discovered.set(key, planned);
      }
    } else if (!existing) {
      discovered.set(key, virtualAsset(key, "free_tool", tool.title, destination.pathname, "public Free Tools API"));
    }
  }
  for (const product of publicCatalogue.data) {
    if (!product.destination_url) continue;
    const destination = sameOriginUrl(product.destination_url);
    if (!destination) continue;
    const key = "product:" + product.id;
    if (!discovered.has(key)) discovered.set(key, virtualAsset(key, "product", product.title, destination.pathname, "public catalogue API"));
  }
  const knownPaths = new Set([...discovered.values()].map(item => item.url));
  for (const path of sitemap.data) {
    if (knownPaths.has(path)) continue;
    const toolMatch = path.match(/^\/free-tools\/([a-z0-9-]+)\/$/);
    const slug = toolMatch?.[1];
    const key = slug ? "tool:" + slug : "page:" + path;
    if (!discovered.has(key)) discovered.set(key, virtualAsset(key, slug ? "free_tool" : "website_page", titleFromPath(path), path, "sitemap.xml"));
    knownPaths.add(path);
  }

  for (const path of openapi.data) {
    const key = "api:" + path;
    if (!discovered.has(key)) discovered.set(key, virtualAsset(key, "api", "API " + path, path, "public OpenAPI registry"));
  }

  const allAssets = [...discovered.values()].sort((a, b) => {
    const rank: Record<string, number> = { website_page: 0, free_tool: 1, product: 2, api: 3, discovery: 4 };
    return (rank[a.asset_type] ?? 5) - (rank[b.asset_type] ?? 5) || a.title.localeCompare(b.title);
  });
  const counts = {
    assets: allAssets.length,
    website_pages: allAssets.filter(row => row.asset_type === "website_page").length,
    free_tools: allAssets.filter(row => row.asset_type === "free_tool").length,
    products: allAssets.filter(row => row.asset_type === "product").length,
    api_discovery: allAssets.filter(row => row.asset_type === "api" || row.asset_type === "discovery").length,
    healthy: allAssets.filter(row => row.last_status === "healthy").length,
    degraded: allAssets.filter(row => row.last_status === "degraded").length,
    unavailable: allAssets.filter(row => row.last_status === "unavailable").length,
    open_findings: findings.results.length,
    deprecated_dependencies: (dependencies.results || []).filter(row => row.status === "deprecated").length,
    updates_available: (dependencies.results || []).filter(row => ["update_available","major_update"].includes(row.status)).length,
    catalogue_applications: catalogue.length
  };
  return adminJson({
    identity: identity.email,
    counts,
    assets: allAssets,
    findings: findings.results,
    dependencies: dependencies.results || [],
    catalogue,
    source_errors: { catalogue: publicCatalogue.error, free_tools: publicTools.error, sitemap: sitemap.error, openapi: openapi.error }
  });
}
