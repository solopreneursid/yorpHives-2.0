export interface AdminD1Statement {
  bind(...values: unknown[]): AdminD1Statement;
  first<T>(): Promise<T | null>;
  all<T>(): Promise<{ results: T[]; success: boolean }>;
  run(): Promise<{ success: boolean; meta?: { changes?: number } }>;
}
export interface AdminD1Database {
  prepare(query: string): AdminD1Statement;
  batch<T = unknown>(statements: AdminD1Statement[]): Promise<T[]>;
}
export interface AdminEnv {
  DB?: AdminD1Database;
  /** Explicit, preview-only read-only monitoring surface; default deny. */
  HQ_MONITOR_V3_MODE?: string;
  CF_ACCESS_TEAM_DOMAIN?: string;
  CF_ACCESS_AUD?: string;
  ADMIN_ALLOWED_EMAILS?: string;
  ADMIN_CI_SERVICE_TOKEN_IDS?: string;
  CF_ACCESS_STEP_UP_AUD?: string;
  CF_ACCESS_STEP_UP_MFA_POLICY_CONFIRMED?: string;
  CF_ACCESS_AGENT_AUD?: string;
  CF_ACCESS_YORPMIND_SERVICE_TOKEN_ID?: string;
  CF_ACCESS_CHATGPT_SERVICE_TOKEN_ID?: string;
}
export interface AdminIdentity {
  email: string;
  serviceToken?: boolean;
  authenticatedAt?: number;
  expiresAt?: number;
}
export interface AdminRequestContext {
  request: Request;
  env: AdminEnv;
  next?: () => Promise<Response>;
  params?: Record<string, string>;
}
export interface AccessClaims {
  aud: string | string[];
  exp: number;
  iat?: number;
  iss: string;
  email?: string;
  sub?: string;
  common_name?: string;
  service_token_id?: string;
  service_token_status?: boolean;
}
interface AccessJwkSet { keys: JsonWebKey[]; }
let cachedKeys: { expiresAt: number; keys: JsonWebKey[] } | null = null;

function decodeBase64Url(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
function decodeJsonPart<T>(value: string): T {
  return JSON.parse(new TextDecoder().decode(decodeBase64Url(value))) as T;
}
async function getAccessKeys(teamDomain: string): Promise<JsonWebKey[]> {
  const now = Date.now();
  if (cachedKeys && cachedKeys.expiresAt > now) return cachedKeys.keys;
  const response = await fetch("https://" + teamDomain + "/cdn-cgi/access/certs", {
    headers: { accept: "application/json" }, signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error("Cloudflare Access signing keys are unavailable.");
  const data = await response.json() as AccessJwkSet;
  if (!Array.isArray(data.keys) || data.keys.length === 0) throw new Error("Cloudflare Access returned no signing keys.");
  cachedKeys = { keys: data.keys, expiresAt: now + 5 * 60 * 1000 };
  return data.keys;
}
export async function verifyAdminAccess(request: Request, env: AdminEnv, audienceOverride?: string): Promise<AdminIdentity | null> {
  let teamDomain = (env.CF_ACCESS_TEAM_DOMAIN || "").trim();
  if (teamDomain.startsWith("https://")) teamDomain = teamDomain.slice(8);
  if (teamDomain.startsWith("http://")) teamDomain = teamDomain.slice(7);
  teamDomain = teamDomain.replace(/\/$/, "");
  const expectedAudiences = new Set((audienceOverride === undefined ? (env.CF_ACCESS_AUD || "") : audienceOverride).split(",").map((value) => value.trim()).filter(Boolean));
  const allowedEmails = new Set((env.ADMIN_ALLOWED_EMAILS || "").split(",").map((email) => email.trim().toLowerCase()).filter(Boolean));
  const allowedServiceTokenIds = new Set((env.ADMIN_CI_SERVICE_TOKEN_IDS || "").split(",").map((value) => value.trim()).filter(Boolean));
  if (!teamDomain || expectedAudiences.size === 0 || (allowedEmails.size === 0 && allowedServiceTokenIds.size === 0)) return null;
  const token = request.headers.get("cf-access-jwt-assertion");
  if (!token) return null;
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const header = decodeJsonPart<{ alg?: string; kid?: string }>(parts[0]);
    const claims = decodeJsonPart<AccessClaims>(parts[1]);
    if (header.alg !== "RS256" || !header.kid) return null;
    if (claims.iss !== "https://" + teamDomain || claims.exp <= Math.floor(Date.now() / 1000)) return null;
    const tokenAudiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (!tokenAudiences.some((audience) => expectedAudiences.has(audience))) return null;
    const serviceTokenId = (claims.service_token_id || claims.common_name || "").trim();
    const serviceTokenClaim = claims.service_token_status === true || (serviceTokenId.length > 0 && claims.sub === "");
    const isAllowedServiceToken = serviceTokenClaim && serviceTokenId.length > 0 && allowedServiceTokenIds.has(serviceTokenId);
    const email = (claims.email || "").trim().toLowerCase();
    if (serviceTokenClaim ? !isAllowedServiceToken : (!email || !allowedEmails.has(email))) return null;
    const keys = await getAccessKeys(teamDomain);
    const jwk = keys.find((key) => key.kid === header.kid);
    if (!jwk) return null;
    const publicKey = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    const signedContent = new TextEncoder().encode(parts[0] + "." + parts[1]);
    const valid = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", publicKey, decodeBase64Url(parts[2]), signedContent);
    if (!valid) return null;
    return isAllowedServiceToken
      ? { email: "github-actions@yorphives.internal", serviceToken: true, authenticatedAt: claims.iat, expiresAt: claims.exp }
      : { email, authenticatedAt: claims.iat, expiresAt: claims.exp };
  } catch { return null; }
}
export async function requireOwnerStepUp(context: AdminRequestContext): Promise<AdminIdentity | Response> {
  if (!context.env.DB) return adminJson({
    error: { code: "ADMIN_DATABASE_UNAVAILABLE", message: "The private D1 database is unavailable." }
  }, 503);
  const aud = (context.env.CF_ACCESS_STEP_UP_AUD || "").trim();
  const baseAudiences = new Set((context.env.CF_ACCESS_AUD || "").split(",").map(value => value.trim()));
  if (!aud || baseAudiences.has(aud) ||
      context.env.CF_ACCESS_STEP_UP_MFA_POLICY_CONFIRMED !== "yes") {
    return adminJson({
      error: { code: "STEP_UP_NOT_CONFIGURED",
        message: "A distinct Cloudflare Access MFA-protected application must be configured and independently tested." }
    }, 503);
  }
  const identity = await verifyAdminAccess(context.request, context.env, aud);
  if (!identity || identity.serviceToken) {
    return adminJson({
      error: { code: "STEP_UP_REQUIRED",
        message: "Complete the independent Cloudflare Access MFA challenge using the separate approval application." }
    }, 403);
  }
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isSafeInteger(identity.authenticatedAt) ||
      !Number.isSafeInteger(identity.expiresAt) ||
      identity.authenticatedAt > now + 30 ||
      identity.authenticatedAt < now - 300 ||
      identity.expiresAt <= now ||
      identity.expiresAt - identity.authenticatedAt > 600) {
    return adminJson({ error: { code: "FRESH_STEP_UP_REQUIRED",
      message: "The MFA-protected session must be fresh and short-lived. Sign in again." } }, 403);
  }
  return identity;
}

/**
 * AI assistant identities are Cloudflare Access service tokens with a DISTINCT
 * audience and explicit allowlisted token IDs. An AI's text, user-supplied
 * header, normal CI identity or founder browser session cannot impersonate one.
 * These identities NEVER inherit requireAdmin privileges.
 */
export async function verifyTemporaryAssistantAccess(
  request: Request, env: AdminEnv
): Promise<"yorpmind" | "chatgpt" | null> {
  const audience = (env.CF_ACCESS_AGENT_AUD || "").trim();
  const base = new Set((env.CF_ACCESS_AUD || "").split(",").map(s => s.trim()));
  const stepUp = (env.CF_ACCESS_STEP_UP_AUD || "").trim();
  const ids = {
    yorpmind: (env.CF_ACCESS_YORPMIND_SERVICE_TOKEN_ID || "").trim(),
    chatgpt: (env.CF_ACCESS_CHATGPT_SERVICE_TOKEN_ID || "").trim()
  };
  if (!audience || base.has(audience) || audience === stepUp ||
      ids.yorpmind.length < 8 || ids.chatgpt.length < 8 ||
      ids.yorpmind === ids.chatgpt) return null;
  let teamDomain = (env.CF_ACCESS_TEAM_DOMAIN || "").trim();
  if (teamDomain.startsWith("https://")) teamDomain = teamDomain.slice(8);
  else if (teamDomain.startsWith("http://")) teamDomain = teamDomain.slice(7);
  if (teamDomain.endsWith("/")) teamDomain = teamDomain.slice(0, -1);
  if (!teamDomain || !/^[a-z0-9.-]+$/i.test(teamDomain)) return null;
  const token = request.headers.get("cf-access-jwt-assertion");
  if (!token) return null;
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const header = decodeJsonPart<{ alg?: string; kid?: string }>(parts[0]);
    const claims = decodeJsonPart<AccessClaims>(parts[1]);
    const now = Math.floor(Date.now() / 1000);
    if (header.alg !== "RS256" || !header.kid ||
        claims.iss !== "https://" + teamDomain ||
        !Number.isSafeInteger(claims.exp) || claims.exp <= now ||
        (claims.iat !== undefined && (!Number.isSafeInteger(claims.iat) ||
          claims.iat > now + 30)) ||
        !claims.service_token_status ||
        !Array.isArray(claims.aud) && claims.aud !== audience ||
        Array.isArray(claims.aud) && !claims.aud.includes(audience)) return null;
    const identity = (claims.service_token_id || "").trim();
    const actor = identity === ids.yorpmind ? "yorpmind" :
      identity === ids.chatgpt ? "chatgpt" : null;
    if (!actor) return null;
    const jwk = (await getAccessKeys(teamDomain)).find(key => key.kid === header.kid);
    if (!jwk) return null;
    const publicKey = await crypto.subtle.importKey("jwk", jwk,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    const valid = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", publicKey,
      decodeBase64Url(parts[2]), new TextEncoder().encode(parts[0] + "." + parts[1]));
    return valid ? actor : null;
  } catch { return null; }
}

export async function requireAdmin(context: AdminRequestContext): Promise<AdminIdentity | Response> {
  if (!context.env.DB) return Response.json({ error: { code: "ADMIN_DATABASE_UNAVAILABLE", message: "The admin database is not configured." } }, { status: 503, headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" } });
  const identity = await verifyAdminAccess(context.request, context.env);
  if (!identity) return Response.json({ error: { code: "ADMIN_AUTH_REQUIRED", message: "A valid, allowlisted Cloudflare Access session is required." } }, { status: 401, headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" } });
  if (identity.serviceToken && !["GET", "HEAD"].includes(context.request.method.toUpperCase())) {
    return Response.json(
      { error: { code: "ADMIN_CI_READ_ONLY", message: "CI service identities are restricted to read-only Admin endpoints." } },
      { status: 403, headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" } }
    );
  }
  return identity;
}
export function isAdminResponse(value: AdminIdentity | Response): value is Response { return value instanceof Response; }
export function adminJson(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: { "cache-control": "no-store", "x-content-type-options": "nosniff", "referrer-policy": "no-referrer" } });
}
