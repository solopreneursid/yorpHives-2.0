import { errorResponse, jsonResponse, type CatalogueRequestContext } from "../../../../_lib/catalogue";

export interface UsageEventRequest {
  event: "detail_view" | "launch";
}

export interface UsageEventResponse {
  accepted: true;
  event: UsageEventRequest["event"];
}

export async function onRequestPost({ request, env, params }: CatalogueRequestContext): Promise<Response> {
  if (!env.DB) {
    return errorResponse("CATALOGUE_UNAVAILABLE", "The usage database is not configured.", 503);
  }

  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) {
    return errorResponse("ORIGIN_NOT_ALLOWED", "Usage events must come from the same origin.", 403);
  }

  if (!(request.headers.get("content-type") || "").toLowerCase().includes("application/json")) {
    return errorResponse("UNSUPPORTED_MEDIA_TYPE", "Send a JSON usage event.", 415);
  }

  const slug = params?.slug || "";
  if (!/^[a-z0-9][a-z0-9-]{1,99}$/.test(slug)) {
    return errorResponse("INVALID_SLUG", "The requested listing slug is invalid.", 400);
  }

  let payload: UsageEventRequest;
  try {
    payload = await request.json() as UsageEventRequest;
  } catch {
    return errorResponse("INVALID_JSON", "The request body must be valid JSON.", 400);
  }

  if (!payload || (payload.event !== "detail_view" && payload.event !== "launch")) {
    return errorResponse("INVALID_EVENT", "Supported events are detail_view and launch.", 400);
  }

  const listing = await env.DB.prepare(
    "SELECT id FROM catalogue_listings WHERE slug = ? AND status = 'available' LIMIT 1",
  ).bind(slug).first<{ id: string }>();

  if (!listing) {
    return errorResponse("LISTING_NOT_FOUND", "No available listing was found for this slug.", 404);
  }

  const column = payload.event === "detail_view" ? "detail_views" : "launches";
  const statement = [
    "INSERT INTO catalogue_usage_daily (listing_id, usage_date, detail_views, launches)",
    "VALUES (?, date('now'), ?, ?)",
    "ON CONFLICT(listing_id, usage_date) DO UPDATE SET",
    column + " = " + column + " + 1",
  ].join(" ");

  const write = await env.DB.prepare(statement)
    .bind(listing.id, payload.event === "detail_view" ? 1 : 0, payload.event === "launch" ? 1 : 0)
    .run();

  if (!write.success) {
    return errorResponse("USAGE_WRITE_FAILED", "The usage event could not be recorded.", 500);
  }

  const response: UsageEventResponse = { accepted: true, event: payload.event };
  return jsonResponse(response, 202, { "cache-control": "no-store" });
}
