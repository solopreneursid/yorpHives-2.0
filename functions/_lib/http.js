export const MAX_JSON_BYTES = 96 * 1024;

export function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "Vary": "Origin",
      ...corsHeaders(),
      ...extraHeaders
    }
  });
}

export function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Accept, Idempotency-Key",
    "Access-Control-Max-Age": "86400"
  };
}

export function preflight() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

export function requestId(request) {
  return request.headers.get("cf-ray") || crypto.randomUUID();
}

export function errorResponse(code, message, status, id, retryable = false, details) {
  return json({
    error: {
      code,
      message,
      retryable,
      request_id: id,
      ...(details ? { details } : {})
    }
  }, status, { "X-Request-ID": id });
}

export async function readJson(request, maxBytes = MAX_JSON_BYTES) {
  const declared = Number(request.headers.get("Content-Length") || 0);
  if (declared > maxBytes) return { ok: false, reason: "too_large" };
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > maxBytes) return { ok: false, reason: "too_large" };
  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch {
    return { ok: false, reason: "invalid_json" };
  }
}
