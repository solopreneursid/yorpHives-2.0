import { assessAssetRepresentation } from "../../admin-monitor/asset-policy.js";

/**
 * Small read-only public route check for a founder-requested diagnosis.
 * Never reads cookies, accesses D1, starts a repair, or follows redirects.
 * The origin and allowed URLs are constants rather than request parameters.
 */
export const WEBSITE_PROOF_ORIGIN = "https://yorphives.com";
export const WEBSITE_PROOF_TARGETS = Object.freeze([
  Object.freeze({ path: "/", type: "website_page", title: "Homepage", security: true }),
  Object.freeze({ path: "/free-tools/", type: "website_page", title: "Free Tools page", security: true }),
  Object.freeze({ path: "/free-tools/manifest.json", type: "discovery", title: "Free Tools list", security: false }),
  Object.freeze({ path: "/llms.txt", type: "discovery", title: "AI information file", security: false }),
  Object.freeze({ path: "/openapi.yaml", type: "discovery", title: "API documentation", security: false }),
  Object.freeze({ path: "/.well-known/yorphives.json", type: "discovery", title: "AI discovery file", security: false }),
  Object.freeze({ path: "/api/v1/free-tools", type: "api", title: "Free Tools API", security: false })
]);

const MAX_BYTES = 384 * 1024;
const CHECK_TIMEOUT_MS = 5500;
const MAX_PARALLEL = 2;

function sanitizeType(value) {
  return String(value || "").trim().slice(0, 100);
}

async function readBoundedBody(response) {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks = [];
  let bytes = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > MAX_BYTES) {
        await reader.cancel();
        throw new Error("BODY_SIZE_LIMIT");
      }
      chunks.push(chunk.value);
    }
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.length;
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(body);
}

export function inspectWebsiteSecurity(headers) {
  const hsts = String(headers.get("strict-transport-security") || "");
  const xfo = String(headers.get("x-frame-options") || "").trim().toLowerCase();
  const csp = String(headers.get("content-security-policy") || "");
  const maxAge = /(?:^|;)\s*max-age\s*=\s*(\d+)/i.exec(hsts);
  const hasHsts = !!maxAge && Number(maxAge[1]) >= 86400;
  const protectedFrame = /(?:^|;)\s*frame-ancestors\s+(?:'none'|'self'|https?:\/\/)/i.test(csp) ||
    xfo === "deny" || xfo === "sameorigin";
  return { https_redirect_persistence: hasHsts,
    embedding_protection: protectedFrame };
}

function outcome(target, status, httpStatus, contentType, note, security = null) {
  return {
    path: target.path,
    title: target.title,
    expected_format: target.type === "api" ? "json" :
      target.path.endsWith(".json") ? "json" :
      target.path.endsWith(".yaml") ? "yaml" :
      target.path.endsWith(".txt") ? "text" : "html",
    status, http_status: httpStatus, content_type: sanitizeType(contentType),
    note: String(note).slice(0, 240), security
  };
}

async function probeOne(target, fetcher) {
  const url = WEBSITE_PROOF_ORIGIN + target.path;
  try {
    const response = await fetcher(url, {
      method: "GET",
      redirect: "manual",
      headers: { accept: "*/*", "user-agent": "YorpHives-WebsiteProof/1.0" },
      signal: AbortSignal.timeout(CHECK_TIMEOUT_MS)
    });
    const type = response.headers.get("content-type");
    if ([401, 403, 429].includes(response.status)) {
      await response.body?.cancel();
      return outcome(target, "not_verified", response.status, type,
        "This check was blocked or rate-limited. Do not treat it as proof that visitors cannot use the page.");
    }
    if (response.status !== 200) {
      await response.body?.cancel();
      return outcome(target, "needs_attention", response.status, type,
        response.status >= 300 && response.status < 400 ?
          "The address redirects. The exact public route must be checked before claiming it works." :
          "The public address did not return HTTP 200. Confirm its deployed route and availability.");
    }
    const body = await readBoundedBody(response);
    const format = assessAssetRepresentation({url, type:target.type}, type, body);
    if (!format.ok) {
      return outcome(target, "needs_attention", response.status, type, format.reason);
    }
    const security = target.security ? inspectWebsiteSecurity(response.headers) : null;
    if (security && (!security.https_redirect_persistence || !security.embedding_protection)) {
      return outcome(target, "needs_attention", response.status, type,
        "The page format is correct, but HTTPS or browser-embedding protection needs another check.", security);
    }
    return outcome(target, "verified_basic", response.status, type,
      "The public route returned HTTP 200 and the expected document format." +
      (security ? " Its required security response headers were detected." : ""), security);
  } catch (error) {
    const sizeLimited = error instanceof Error && error.message === "BODY_SIZE_LIMIT";
    return outcome(target, "not_verified", null, null,
      sizeLimited ? "The response exceeded the bounded inspection size. A separate check is needed." :
        "The public address could not be reached from this inspection service. No website failure is assumed.");
  }
}

export async function checkPublicWebsite(fetcher = globalThis.fetch, clock = () => new Date()) {
  if (typeof fetcher !== "function") throw new TypeError("A fetch function is required.");
  const results = new Array(WEBSITE_PROOF_TARGETS.length);
  let cursor = 0;
  await Promise.all(Array.from({length: MAX_PARALLEL}, async () => {
    while (cursor < WEBSITE_PROOF_TARGETS.length) {
      const index = cursor++;
      results[index] = await probeOne(WEBSITE_PROOF_TARGETS[index], fetcher);
    }
  }));
  const needsAttention = results.filter(x => x.status === "needs_attention").length;
  const unverified = results.filter(x => x.status === "not_verified").length;
  const passed = results.filter(x => x.status === "verified_basic").length;
  const overall = needsAttention ? "needs_attention" :
    unverified ? "inconclusive" : "basic_routes_passed";
  return {
    source: "real_public_http_get",
    origin: WEBSITE_PROOF_ORIGIN,
    checked_at: clock().toISOString(),
    total: results.length,
    basic_passed: passed,
    needs_attention: needsAttention,
    unverified,
    overall,
    checks: results,
    documents_proven_fully_correct: false,
    previous_findings_auto_resolved: false,
    new_ai_model_calls: 0,
    database_writes: 0,
    production_changes: 0
  };
}
