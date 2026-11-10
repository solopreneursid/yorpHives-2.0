import {
  errorResponse,
  jsonResponse,
  mapCatalogueRow,
  wantsMarkdown,
  type CatalogueRequestContext,
  type CatalogueRow,
} from "../../../_lib/catalogue";

export async function onRequestGet({ request, env, params }: CatalogueRequestContext): Promise<Response> {
  if (!env.DB) {
    return errorResponse("CATALOGUE_UNAVAILABLE", "The public catalogue database is not configured.", 503);
  }

  const slug = params?.slug || "";
  if (!/^[a-z0-9][a-z0-9-]{1,99}$/.test(slug)) {
    return errorResponse("INVALID_SLUG", "The requested listing slug is invalid.", 400);
  }

  const sql = [
    "SELECT l.id, l.slug, l.title, l.summary, l.description, l.listing_type,",
    "l.audiences_json, c.slug AS category_slug, c.name AS category_name,",
    "l.access_model, l.price_minor, l.currency, l.destination_url,",
    "l.machine_readable_url, l.requires_auth, l.required_scopes_json,",
    "l.side_effects_json, l.published_at, l.updated_at",
    "FROM catalogue_listings l",
    "LEFT JOIN catalogue_categories c ON c.id = l.category_id",
    "WHERE l.slug = ? AND l.status = 'available'",
    "LIMIT 1",
  ].join(" ");

  const row = await env.DB.prepare(sql).bind(slug).first<CatalogueRow>();
  if (!row) {
    return errorResponse("LISTING_NOT_FOUND", "No available listing was found for this slug.", 404);
  }

  const listing = mapCatalogueRow(row);
  if (wantsMarkdown(request)) {
    const markdown = [
      "# " + listing.title,
      listing.summary,
      listing.description,
      "- Type: " + listing.listing_type,
      "- Access: " + listing.access.model,
      "- Destination: " + listing.destination_url,
      "- Audiences: " + listing.audiences.join(", "),
    ].filter(Boolean).join("\n\n");
    return new Response(markdown + "\n", {
      headers: {
        "content-type": "text/markdown; charset=utf-8",
        "cache-control": "public, max-age=60, stale-while-revalidate=300",
        "x-content-type-options": "nosniff",
        vary: "Accept",
      },
    });
  }

  return jsonResponse({ data: listing }, 200, { vary: "Accept" });
}
