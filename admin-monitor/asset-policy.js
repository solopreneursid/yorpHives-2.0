/**
 * Read-only contract for public website assets.
 *
 * HTML search metadata is meaningful only for HTML pages. Machine-readable
 * discovery routes have their own representation contracts and must not be
 * "repaired" by inserting HTML canonical tags into JSON/YAML/text.
 *
 * The functions accept only strings and the already approved asset record.
 * No network requests, AI calls, or database writes happen in this module.
 */
const MACHINE_ROUTES = Object.freeze(new Map([
  ["/free-tools/manifest.json", "json"],
  ["/.well-known/yorphives.json", "json"],
  ["/api/v1/free-tools", "json"],
  ["/llms.txt", "text"],
  ["/robots.txt", "text"],
  ["/openapi.yaml", "yaml"],
  ["/sitemap.xml", "xml"]
]));

function pathOf(asset) {
  try {
    return new URL(String(asset?.url || ""), "https://yorphives.com").pathname;
  } catch {
    return "";
  }
}

export function expectedAssetFormat(asset) {
  const path = pathOf(asset);
  if (MACHINE_ROUTES.has(path)) return MACHINE_ROUTES.get(path);
  if (asset?.type === "api") return "json";
  if (asset?.type === "website_page" || asset?.type === "free_tool") return "html";
  if (/\.json$/i.test(path)) return "json";
  if (/\.ya?ml$/i.test(path)) return "yaml";
  if (/\.xml$/i.test(path)) return "xml";
  if (/\.txt$/i.test(path)) return "text";
  // Unknown discovery endpoints should not be assumed to be HTML pages.
  return asset?.type === "discovery" ? "discovery" : "html";
}

export function assessAssetRepresentation(asset, rawType, rawBody) {
  const expected = expectedAssetFormat(asset);
  const contentType = String(rawType || "").split(";")[0].trim().toLowerCase().slice(0, 100);
  const body = typeof rawBody === "string" ? rawBody : "";
  const start = body.slice(0, 2500).trimStart();
  const html = /^(?:<!doctype\s+html\b|<html\b)/i.test(start);
  const failure = (code, reason) => ({
    ok: false, kind: expected, expected, code, reason, content_type: contentType,
    is_html_page: false, json: null
  });
  const success = (kind, json = null) => ({
    ok: true, kind, expected, code: null, reason: null,
    content_type: contentType, is_html_page: kind === "html", json
  });

  if (expected !== "html" && html) {
    return failure("unexpected-representation",
      "This machine-readable route returned an HTML document instead of its expected " +
      expected.toUpperCase() + " format. Check the actual deployed route, content negotiation and redirects.");
  }

  if (expected === "html") {
    if (!/^text\/html$/i.test(contentType) || !html) {
      return failure("unexpected-representation",
        "This public page must return a complete HTML document with a text/html response type.");
    }
    return success("html");
  }
  if (expected === "json") {
    if (!/^(application\/json|[a-z0-9.+-]+\/[a-z0-9.+-]+\+json)$/.test(contentType)) {
      return failure("unexpected-representation",
        "This JSON endpoint did not declare a JSON response type.");
    }
    let json;
    try { json = JSON.parse(body); }
    catch {
      return failure("invalid-json", "This endpoint declared JSON but its response could not be parsed.");
    }
    const path = pathOf(asset);
    if (path === "/free-tools/manifest.json" && !Array.isArray(json)) {
      return failure("invalid-json", "The Free Tools manifest must contain a JSON array.");
    }
    if ((path === "/.well-known/yorphives.json" || path === "/api/v1/free-tools") &&
        (!json || typeof json !== "object" || Array.isArray(json))) {
      return failure("invalid-json", "The machine-readable discovery response must contain a JSON object.");
    }
    return success("json", json);
  }
  if (expected === "yaml") {
    if (!["application/yaml", "application/x-yaml", "text/yaml", "text/x-yaml",
      "text/plain", "application/octet-stream"].includes(contentType) ||
        !/^\s*(?:openapi|swagger)\s*:\s*['"]?[23]/i.test(start)) {
      return failure("unexpected-representation",
        "The OpenAPI route must return YAML beginning with its OpenAPI version, not an HTML fallback.");
    }
    return success("yaml");
  }
  if (expected === "xml") {
    if (!["text/xml", "application/xml", "application/rss+xml"].includes(contentType) ||
        !/^(?:<\?xml[^>]*>\s*)?<(?:urlset|sitemapindex)\b/i.test(start)) {
      return failure("unexpected-representation",
        "The sitemap must be an XML sitemap, not HTML or another representation.");
    }
    return success("xml");
  }
  if (expected === "text") {
    if (!["text/plain", "text/markdown"].includes(contentType) || !body.trim()) {
      return failure("unexpected-representation",
        "This discovery text file must be nonempty plain text or Markdown, not HTML.");
    }
    return success("text");
  }
  // Unclassified routes are monitored for HTTP availability, but their
  // representation cannot be inferred without a declared contract.
  return success("discovery");
}

export function isMachineReadableAsset(asset) {
  return expectedAssetFormat(asset) !== "html";
}
