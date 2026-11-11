const SITE_ORIGIN = "https://yorphives.com";
const MAX_ASSETS = 250;
const MAX_ASSETS_PER_RUN = 60;
const MAX_BODY_BYTES = 384 * 1024;
const MAX_DEPENDENCIES = 30;
const CONCURRENCY = 8;
const SITE_PAGES = [
  { key: "site:home", type: "website_page", title: "Homepage", url: "/" },
  { key: "site:free-tools", type: "website_page", title: "Free Tools directory", url: "/free-tools/" },
  { key: "site:tool-manifest", type: "discovery", title: "Free Tools manifest", url: "/free-tools/manifest.json" },
  { key: "site:explore", type: "website_page", title: "Explore marketplace", url: "/explore/" },
  { key: "site:builder", type: "website_page", title: "Builder", url: "/builder/" },
  { key: "site:connect", type: "website_page", title: "Connect", url: "/connect/" },
  { key: "site:sitemap", type: "discovery", title: "XML sitemap", url: "/sitemap.xml" },
  { key: "site:robots", type: "discovery", title: "Robots.txt", url: "/robots.txt" },
  { key: "site:llms", type: "discovery", title: "LLMs.txt", url: "/llms.txt" },
  { key: "site:openapi", type: "discovery", title: "OpenAPI document", url: "/openapi.yaml" },
  { key: "site:well-known", type: "discovery", title: "Agent discovery manifest", url: "/.well-known/yorphives.json" },
  { key: "site:tools-api", type: "api", title: "Free Tools discovery API", url: "/api/v1/free-tools" }
];

function safeInternalUrl(value) {
  try {
    const url = new URL(value, SITE_ORIGIN);
    if (url.origin !== SITE_ORIGIN || url.username || url.password || url.search || url.hash) return null;
    return url;
  } catch { return null; }
}

async function readLimited(response) {
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new Error("Page exceeded the monitoring response-size limit.");
      }
      chunks.push(part.value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}

async function sha256(bytes) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map(x => x.toString(16).padStart(2, "0")).join("");
}

function htmlText(html, expression) {
  const match = html.match(expression);
  return match?.[1]?.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim().slice(0, 500) || null;
}

function extractDependencies(html, pageUrl) {
  const dependencies = new Map();
  const pattern = /<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi;
  let match;
  while ((match = pattern.exec(html)) !== null) {
    try {
      const url = new URL(match[1], pageUrl);
      if (url.protocol !== "https:") continue;
      const parsed = parseNpmCdn(url);
      if (parsed) dependencies.set(parsed.key, parsed);
    } catch {}
  }
  return [...dependencies.values()];
}

function parseNpmCdn(url) {
  const match = url.pathname.match(/^\/(?:npm|package)\/(@[^/]+\/[^@/]+|[^/@]+)@([^/]+)(?:\/|$)/);
  if (!match) return null;
  return {
    key: match[1] + "@" + match[2],
    packageName: match[1],
    currentVersion: match[2],
    sourceUrl: url.origin + url.pathname
  };
}

function compareVersions(a, b) {
  const left = String(a).replace(/^v/, "").split(/[.+-]/).map(x => Number.parseInt(x, 10) || 0);
  const right = String(b).replace(/^v/, "").split(/[.+-]/).map(x => Number.parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    if ((left[i] || 0) > (right[i] || 0)) return 1;
    if ((left[i] || 0) < (right[i] || 0)) return -1;
  }
  return 0;
}

async function syncInventory(db, assets, now, deactivateMissing = true) {
  const ids = [];
  for (const asset of assets.slice(0, MAX_ASSETS)) {
    const id = await db.prepare("SELECT id FROM admin_assets WHERE asset_key = ?").bind(asset.key).first();
    const assetId = id?.id || crypto.randomUUID();
    await db.prepare(`
      INSERT INTO admin_assets (id, asset_key, asset_type, title, url, source, active, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 1, ?)
      ON CONFLICT(asset_key) DO UPDATE SET asset_type=excluded.asset_type, title=excluded.title,
        url=excluded.url, source=excluded.source, active=1, updated_at=excluded.updated_at
    `).bind(assetId, asset.key, asset.type, asset.title, asset.url, asset.source, now).run();
    ids.push(asset.key);
  }
  if (ids.length && deactivateMissing) {
    const placeholders = ids.map(() => "?").join(",");
    await db.prepare("UPDATE admin_assets SET active=0, updated_at=? WHERE asset_key NOT IN (" + placeholders + ")")
      .bind(now, ...ids).run();
  }
}

async function upsertFinding(db, assetId, finding, now) {
  await db.prepare(`
    INSERT INTO admin_asset_findings
      (id, asset_id, finding_key, severity, category, title, details, recommendation, evidence_json, status, first_detected, last_verified)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?)
    ON CONFLICT(asset_id, finding_key) DO UPDATE SET
      severity=excluded.severity, category=excluded.category, title=excluded.title,
      details=excluded.details, recommendation=excluded.recommendation,
      evidence_json=excluded.evidence_json, last_verified=excluded.last_verified,
      status=CASE WHEN admin_asset_findings.status IN ('fixed','accepted_risk') THEN 'open' ELSE admin_asset_findings.status END,
      resolved_at=NULL
  `).bind(crypto.randomUUID(), assetId, finding.key, finding.severity, finding.category,
    finding.title, finding.details, finding.recommendation, JSON.stringify(finding.evidence || {}), now, now).run();
}

async function resolveMissingFindings(db, assetId, activeKeys, now) {
  const rows = await db.prepare("SELECT finding_key FROM admin_asset_findings WHERE asset_id=? AND category NOT IN ('dependency','change') AND status IN ('open','investigating','awaiting_approval')").bind(assetId).all();
  for (const row of rows.results || []) {
    if (!activeKeys.has(row.finding_key)) {
      await db.prepare("UPDATE admin_asset_findings SET status='fixed', resolved_at=?, last_verified=? WHERE asset_id=? AND finding_key=?")
        .bind(now, now, assetId, row.finding_key).run();
    }
  }
}

async function checkAsset(db, asset, now) {
  const url = safeInternalUrl(asset.url);
  if (!url) return { ok: false, reason: "Asset URL is outside the approved YorpHives origin." };
  const started = Date.now();
  let status = "healthy";
  let httpStatus = null;
  let pageTitle = null;
  let description = null;
  let canonical = null;
  let contentHash = null;
  let dependencies = [];
  let details = {};
  const findings = [];
  try {
    const response = await fetch(url.toString(), {
      method: "GET",
      headers: { "user-agent": "YorpHives-AssetMonitor/1.0", "accept": "text/html,application/json,text/plain,*/*" },
      redirect: "manual",
      signal: AbortSignal.timeout(7000)
    });
    httpStatus = response.status;
    if (response.status !== 200) {
      status = response.status >= 500 ? "unavailable" : "degraded";
      findings.push({
        key: "http-status", severity: response.status >= 500 ? "critical" : "high",
        category: "availability", title: asset.title + " is returning HTTP " + response.status,
        details: "The monitored URL returned HTTP " + response.status + ".",
        recommendation: "Inspect the route, deployment output and upstream dependencies; restore a successful response.",
        evidence: { url: url.toString(), status: response.status }
      });
      await response.body?.cancel();
    } else {
      const bytes = await readLimited(response);
      contentHash = await sha256(bytes);
      const contentType = response.headers.get("content-type") || "";
      const body = new TextDecoder().decode(bytes);
      if (contentType.includes("text/html") || /^\s*<!doctype html|^\s*<html/i.test(body)) {
        pageTitle = htmlText(body, /<title[^>]*>([\s\S]*?)<\/title>/i);
        description = htmlText(body, /<meta\s+[^>]*name=["']description["'][^>]*content=["']([^"']*)["'][^>]*>/i) ||
          htmlText(body, /<meta\s+[^>]*content=["']([^"']*)["'][^>]*name=["']description["'][^>]*>/i);
        canonical = htmlText(body, /<link\s+[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)["'][^>]*>/i) ||
          htmlText(body, /<link\s+[^>]*href=["']([^"']+)["'][^>]*rel=["']canonical["'][^>]*>/i);
        dependencies = extractDependencies(body, url);
        if (!pageTitle) findings.push({
          key: "missing-title", severity: "medium", category: "seo",
          title: asset.title + " is missing a page title",
          details: "The HTML response does not contain a detectable <title> element.",
          recommendation: "Add a unique, descriptive title that reflects the page's purpose."
        });
        if (!description) findings.push({
          key: "missing-description", severity: "low", category: "seo",
          title: asset.title + " is missing a meta description",
          details: "No meta description was detected in the HTML response.",
          recommendation: "Add a concise, unique description that accurately summarizes the page."
        });
        if (!canonical && asset.type !== "website_page") findings.push({
          key: "missing-canonical", severity: "low", category: "seo",
          title: asset.title + " has no canonical URL",
          details: "No canonical link was detected.",
          recommendation: "Add a canonical URL when this route can be reached through alternate URLs."
        });
      } else if (contentType.includes("application/json")) {
        try { details = { json_valid: true, json_keys: Object.keys(JSON.parse(body)).slice(0, 20) }; }
        catch {
          status = "degraded";
          findings.push({ key: "invalid-json", severity: "high", category: "functionality",
            title: asset.title + " returned invalid JSON", details: "The endpoint declared JSON but its body could not be parsed.",
            recommendation: "Validate the response serialization and API error handling." });
        }
      }
    }
  } catch (error) {
    status = "unavailable";
    findings.push({
      key: "request-failed", severity: "critical", category: "availability",
      title: asset.title + " could not be checked",
      details: error instanceof Error ? error.message.slice(0, 300) : "Network request failed.",
      recommendation: "Verify the route, DNS, TLS, Cloudflare deployment and any upstream service."
    });
  }

  const previous = await db.prepare("SELECT id, last_content_hash FROM admin_assets WHERE asset_key=?").bind(asset.key).first();
  if (previous?.last_content_hash && contentHash && previous.last_content_hash !== contentHash) {
    findings.push({
      key: "content-changed", severity: "info", category: "change",
      title: asset.title + " content changed",
      details: "The response SHA-256 differs from the previous successful check. This may be an expected update or an unexpected regression.",
      recommendation: "Review the change against the latest release and confirm the page still works as intended.",
      evidence: { previous_hash: previous.last_content_hash.slice(0, 16), current_hash: contentHash.slice(0, 16) }
    });
  }
  const assetRow = await db.prepare("SELECT id FROM admin_assets WHERE asset_key=?").bind(asset.key).first();
  const assetId = assetRow.id;
  await db.prepare(`
    INSERT INTO admin_asset_checks (id, asset_id, checked_at, status, http_status, duration_ms, content_hash, page_title, meta_description, canonical_url, details_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(crypto.randomUUID(), assetId, now, status, httpStatus, Date.now() - started,
    contentHash, pageTitle, description, canonical, JSON.stringify(details)).run();
  await db.prepare(`
    UPDATE admin_assets SET last_status=?, last_http_status=?, last_checked_at=?, last_content_hash=COALESCE(?,last_content_hash),
      last_duration_ms=?, last_title=?, last_description=?, last_canonical=?, last_changed_at=CASE WHEN ? THEN ? ELSE last_changed_at END
    WHERE id=?
  `).bind(status, httpStatus, now, contentHash, Date.now() - started, pageTitle, description, canonical,
    findings.some(f => f.key === "content-changed") ? 1 : 0, now, assetId).run();

  const activeKeys = new Set(findings.map(f => f.key));
  for (const finding of findings) await upsertFinding(db, assetId, finding, now);
  await resolveMissingFindings(db, assetId, activeKeys, now);
  return { asset_key: asset.key, status, http_status: httpStatus, duration_ms: Date.now() - started, dependencies };
}

async function checkNpmDependency(db, dependency, now) {
  try {
    const response = await fetch("https://registry.npmjs.org/" + encodeURIComponent(dependency.packageName), {
      headers: { "accept": "application/vnd.npm.install-v1+json", "user-agent": "YorpHives-DependencyMonitor/1.0" },
      signal: AbortSignal.timeout(6000)
    });
    if (!response.ok) throw new Error("npm registry HTTP " + response.status);
    const metadata = await response.json();
    const latest = metadata["dist-tags"]?.latest || null;
    const deprecatedMessage = metadata.versions?.[dependency.currentVersion]?.deprecated || null;
    const currentMajor = Number(dependency.currentVersion.split(".")[0]);
    const latestMajor = Number(String(latest || "").split(".")[0]);
    const newer = latest && compareVersions(latest, dependency.currentVersion) > 0;
    const status = deprecatedMessage ? "deprecated" : !latest ? "unknown" : newer ? (latestMajor > currentMajor ? "major_update" : "update_available") : "current";
    const details = deprecatedMessage ? String(deprecatedMessage).slice(0, 500) :
      newer ? "Latest registry version is " + latest + "; current CDN pin is " + dependency.currentVersion + "." :
      "Pinned version matches the current npm latest tag.";
    await db.prepare(`
      INSERT INTO admin_dependency_observations
        (id, dependency_key, package_name, current_version, latest_version, deprecated_message, source_url, status, checked_at, details)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(dependency_key) DO UPDATE SET
        latest_version=excluded.latest_version, deprecated_message=excluded.deprecated_message,
        status=excluded.status, checked_at=excluded.checked_at, details=excluded.details
    `).bind(crypto.randomUUID(), dependency.key, dependency.packageName, dependency.currentVersion,
      latest, deprecatedMessage ? String(deprecatedMessage).slice(0, 500) : null,
      dependency.sourceUrl, status, now, details).run();
    return { ...dependency, latest, status, deprecated: Boolean(deprecatedMessage), details };
  } catch (error) {
    const details = error instanceof Error ? error.message.slice(0, 500) : "Registry lookup failed";
    await db.prepare(`
      INSERT INTO admin_dependency_observations
        (id, dependency_key, package_name, current_version, latest_version, deprecated_message, source_url, status, checked_at, details)
      VALUES (?, ?, ?, ?, NULL, NULL, ?, 'unknown', ?, ?)
      ON CONFLICT(dependency_key) DO UPDATE SET
        latest_version=NULL, deprecated_message=NULL, status='unknown',
        checked_at=excluded.checked_at, details=excluded.details
    `).bind(crypto.randomUUID(), dependency.key, dependency.packageName, dependency.currentVersion,
      dependency.sourceUrl, now, details).run();
    return { ...dependency, status: "unknown", details };
  }
}

async function recordDependencyFinding(db, assetKey, dependency, now) {
  const asset = await db.prepare("SELECT id, title FROM admin_assets WHERE asset_key=?").bind(assetKey).first();
  if (!asset) return;
  let finding = null;
  if (dependency.deprecated) finding = {
    key: "dependency-deprecated:" + dependency.key, severity: "high", category: "dependency",
    title: dependency.packageName + " " + dependency.currentVersion + " is deprecated",
    details: dependency.details,
    recommendation: "Review the package maintainer's deprecation guidance, identify a supported replacement and test it before updating."
  };
  else if (dependency.status === "major_update") finding = {
    key: "dependency-major-update:" + dependency.key, severity: "low", category: "dependency",
    title: dependency.packageName + " has a newer major release",
    details: "Current CDN pin: " + dependency.currentVersion + ". Latest: " + dependency.latest + ". Major versions may contain breaking changes.",
    recommendation: "Review the release notes and compatibility impact; upgrade only after regression tests pass."
  };
  else if (dependency.status === "update_available") finding = {
    key: "dependency-update:" + dependency.key, severity: "info", category: "dependency",
    title: dependency.packageName + " has an update available",
    details: "Current CDN pin: " + dependency.currentVersion + ". Latest: " + dependency.latest + ".",
    recommendation: "Review the changelog and security advisories, then test the newer version before adopting it."
  };
  if (finding) {
    await upsertFinding(db, asset.id, finding, now);
  } else if (dependency.status === "current") {
    const staleKeys = ["dependency-deprecated:", "dependency-major-update:", "dependency-update:"].map(prefix => prefix + dependency.key);
    for (const key of staleKeys) {
      await db.prepare("UPDATE admin_asset_findings SET status='fixed', resolved_at=?, last_verified=? WHERE asset_id=? AND finding_key=? AND status IN ('open','investigating','awaiting_approval')")
        .bind(now, now, asset.id, key).run();
    }
  }
}

async function mapLimit(items, limit, mapper) {
  const output = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      output[index] = await mapper(items[index], index);
    }
  });
  await Promise.all(workers);
  return output;
}

export async function runAssetIntelligence(db) {
  const now = new Date().toISOString();
  const inventory = [...SITE_PAGES.map(item => ({ ...item, source: "site" }))];
  let manifestError = null;
  try {
    const response = await fetch(SITE_ORIGIN + "/free-tools/manifest.json", {
      headers: { "accept": "application/json", "user-agent": "YorpHives-AssetMonitor/1.0" },
      redirect: "manual",
      signal: AbortSignal.timeout(7000)
    });
    if (!response.ok) throw new Error("Manifest returned HTTP " + response.status);
    const manifest = await response.json();
    if (!Array.isArray(manifest)) throw new Error("Tool manifest is not an array.");
    for (const tool of manifest) {
      if (!tool || typeof tool.slug !== "string" || typeof tool.url !== "string" || !/^[a-z0-9-]{2,80}$/.test(tool.slug)) continue;
      const url = safeInternalUrl(tool.url);
      if (!url) continue;
      inventory.push({ key: "tool:" + tool.slug, type: "free_tool", title: String(tool.title || tool.slug).slice(0, 160), url: url.pathname, source: "free-tools/manifest.json" });
    }
  } catch (error) { manifestError = error instanceof Error ? error.message : "Tool manifest fetch failed"; }

  let sitemapError = null;
  try {
    const response = await fetch(SITE_ORIGIN + "/sitemap.xml", {
      headers: { "accept": "application/xml,text/xml", "user-agent": "YorpHives-AssetMonitor/1.0" },
      redirect: "manual",
      signal: AbortSignal.timeout(7000)
    });
    if (!response.ok) throw new Error("Sitemap returned HTTP " + response.status);
    const xml = await response.text();
    const knownPaths = new Set(inventory.map(item => item.url));
    const discovered = new Map();
    for (const match of xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)) {
      const url = safeInternalUrl(match[1].replace(/&amp;/g, "&").trim());
      if (!url || url.pathname === "/sitemap.xml" || url.pathname === "/free-tools/manifest.json" || knownPaths.has(url.pathname)) continue;
      const path = url.pathname || "/";
      const toolMatch = path.match(/^\/free-tools\/([a-z0-9-]+)\/$/);
      const slug = toolMatch?.[1];
      const key = slug ? "tool:" + slug : "page:" + path;
      if (!discovered.has(key)) discovered.set(key, {
        key,
        type: slug ? "free_tool" : "website_page",
        title: path === "/" ? "Homepage" : path.split("/").filter(Boolean).slice(-1)[0].replace(/[-_]/g, " ").replace(/\b\w/g, letter => letter.toUpperCase()),
        url: path,
        source: slug ? "sitemap.xml (tool fallback)" : "sitemap.xml"
      });
      knownPaths.add(path);
    }
    for (const asset of discovered.values()) inventory.push(asset);
  } catch (error) {
    sitemapError = error instanceof Error ? error.message : "Sitemap fetch failed";
  }

  let catalogueError = null;
  try {
    let offset = 0;
    let total = 0;
    const pageSize = 50;
    const maxPages = 5;
    for (let page = 0; page < maxPages && (page === 0 || offset < total); page++) {
      const endpoint = new URL("/api/v1/catalogue", SITE_ORIGIN);
      endpoint.searchParams.set("type", "application");
      endpoint.searchParams.set("limit", String(pageSize));
      endpoint.searchParams.set("offset", String(offset));
      const response = await fetch(endpoint, {
        headers: { "accept": "application/json", "user-agent": "YorpHives-AssetMonitor/1.0" },
        redirect: "manual",
        signal: AbortSignal.timeout(7000)
      });
      if (!response.ok) throw new Error("Public catalogue returned HTTP " + response.status);
      const payload = await response.json();
      if (!Array.isArray(payload.data) || !payload.pagination) throw new Error("Public catalogue response is invalid.");
      total = Number(payload.pagination.count || 0);
      for (const product of payload.data) {
        if (!product || typeof product.slug !== "string" || typeof product.title !== "string") continue;
        const destination = safeInternalUrl(product.destination_url);
        if (!destination) continue;
        inventory.push({
          key: "product:" + String(product.id || product.slug),
          type: "product",
          title: String(product.title || product.slug).slice(0, 160),
          url: destination.pathname,
          source: "api/v1/catalogue"
        });
      }
      offset += payload.data.length;
      if (!payload.data.length) break;
    }
    if (total > offset) catalogueError = "Public catalogue discovery was capped at " + offset + " of " + total + " applications.";
  } catch (error) {
    catalogueError = error instanceof Error ? error.message : "Public catalogue fetch failed";
  }

  const trackedInventory = inventory.slice(0, MAX_ASSETS);
  await syncInventory(db, trackedInventory, now, !manifestError && !sitemapError && !catalogueError);
  const checkState = await db.prepare("SELECT asset_key, last_checked_at FROM admin_assets WHERE active=1").all();
  const lastChecked = new Map((checkState.results || []).map(row => [row.asset_key, row.last_checked_at || ""]));
  const coreAssets = trackedInventory.filter(asset => asset.source === "site");
  const rotatingAssets = trackedInventory.filter(asset => asset.source !== "site").sort((a, b) => {
    const left = lastChecked.get(a.key) || "";
    const right = lastChecked.get(b.key) || "";
    return left.localeCompare(right);
  });
  const selectedAssets = [
    ...coreAssets,
    ...rotatingAssets.slice(0, Math.max(0, MAX_ASSETS_PER_RUN - coreAssets.length))
  ];
  const checked = await mapLimit(selectedAssets, CONCURRENCY, asset => checkAsset(db, asset, now));
  const dependencies = new Map();
  for (const result of checked) {
    for (const dependency of result.dependencies || []) dependencies.set(dependency.key, dependency);
  }
  const dependencyResults = await mapLimit([...dependencies.values()].slice(0, MAX_DEPENDENCIES), 5,
    dependency => checkNpmDependency(db, dependency, now));
  for (const result of checked) {
    for (const dependency of result.dependencies || []) {
      const observed = dependencyResults.find(item => item.key === dependency.key);
      if (observed) await recordDependencyFinding(db, result.asset_key, observed, now);
    }
  }

  return {
    checked_at: now,
    assets: checked.length,
    healthy: checked.filter(item => item.status === "healthy").length,
    degraded: checked.filter(item => item.status === "degraded").length,
    unavailable: checked.filter(item => item.status === "unavailable").length,
    dependencies: dependencyResults.length,
    manifest_error: manifestError,
    sitemap_error: sitemapError,
    discovered: { website_pages: trackedInventory.filter(item => item.type === "website_page").length, free_tools: trackedInventory.filter(item => item.type === "free_tool").length, products: trackedInventory.filter(item => item.type === "product").length },
    results: checked
  };
}
