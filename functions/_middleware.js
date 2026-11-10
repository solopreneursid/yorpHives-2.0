import { preflight } from "./_lib/http.js";

export async function onRequest(context) {
  if (context.request.method === "OPTIONS") return preflight();
  const response = await context.next();
  const headers = new Headers(response.headers);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "DENY");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  headers.set("Cross-Origin-Opener-Policy", "same-origin");
  if (!headers.has("Content-Security-Policy")) {
    headers.set("Content-Security-Policy", "frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'");
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
