import { sha256Hex, randomToken } from "../../../_lib/security.js";
import { rateLimit, failure, success } from "../../../_lib/platform.js";
import { readJson, requestId } from "../../../_lib/http.js";
import { sameOrigin } from "../../../_lib/session.js";

function validEmail(value) { return typeof value === "string" && value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value); }
async function sendCode(env, email, code) {
  if (!env.YH_EMAIL_API_KEY || !env.YH_EMAIL_FROM) throw new Error("EMAIL_NOT_CONFIGURED");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: "Bearer " + env.YH_EMAIL_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ from: env.YH_EMAIL_FROM, to: [email], subject: "Your YorpHives sign-in code", text: "Your YorpHives verification code is " + code + ". It expires in 10 minutes. If you did not request this, you can ignore this email." })
  });
  if (!response.ok) throw new Error("EMAIL_DELIVERY_FAILED");
}
export async function onRequestPost({ request, env }) {
  if (!sameOrigin(request)) return failure("ORIGIN_REJECTED", "Cross-origin requests are not accepted.", 403, request);
  const limit = await rateLimit(request, env, null);
  if (!limit.ok) return limit.response;
  const parsed = await readJson(request);
  if (!parsed.ok || !parsed.value || !validEmail(parsed.value.email)) return failure("INVALID_EMAIL", "Provide a valid email address.", 422, request);
  const email = parsed.value.email.trim().toLowerCase();
  const displayName = typeof parsed.value.display_name === "string" ? parsed.value.display_name.trim().slice(0, 100) : null;
  const recent = await env.DB.prepare("SELECT created_at FROM email_login_challenges WHERE email = ? ORDER BY created_at DESC LIMIT 1").bind(email).first();
  if (recent && Date.now() - Date.parse(recent.created_at) < 60_000) return success({ accepted: true, message: "If this address can receive YorpHives sign-in codes, an email will arrive shortly." }, 202);
  const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, "0");
  const salt = randomToken(16), id = crypto.randomUUID(), now = new Date();
  try {
    await sendCode(env, email, code);
    await env.DB.prepare("INSERT INTO email_login_challenges (id, email, code_hash, salt, display_name, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(id, email, await sha256Hex(salt + ":" + code), salt, displayName, new Date(now.getTime() + 10 * 60_000).toISOString(), now.toISOString()).run();
  } catch (error) {
    if (error.message === "EMAIL_NOT_CONFIGURED") return failure("EMAIL_NOT_CONFIGURED", "Email sign-in is not enabled yet. Configure the email delivery credentials before allowing registration.", 503, request);
    console.error(JSON.stringify({ event: "auth.email_delivery_failed", request_id: requestId(request) }));
    return failure("EMAIL_DELIVERY_FAILED", "The sign-in email could not be sent. Retry shortly.", 503, request, { retryable: true });
  }
  return success({ accepted: true, message: "If this address can receive YorpHives sign-in codes, an email will arrive shortly." }, 202);
}
