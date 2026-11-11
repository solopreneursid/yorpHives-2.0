import {
  AUDIENCES,
  LISTING_TYPES,
  errorResponse,
  jsonResponse,
  mapCatalogueRow,
  renderCatalogueMarkdown,
  wantsMarkdown,
  type CatalogueListResponse,
  type CatalogueRequestContext,
  type CatalogueRow,
} from "../../_lib/catalogue";

export async function onRequestGet({ request, env }: CatalogueRequestContext): Promise<Response> {
  if (!env.DB) {
    return errorResponse("CATALOGUE_UNAVAILABLE", "The public catalogue database is not configured.", 503);
  }

  const url = new URL(request.url);
  const type = url.searchParams.get("type");
  const category = url.searchParams.get("category");
  const audience = url.searchParams.get("audience");
  const search = (url.searchParams.get("q") || "").trim();
  const limitValue = Number(url.searchParams.get("limit") || 20);
  const offsetValue = Number(url.searchParams.get("offset") || 0);

  if (type && !LISTING_TYPES.includes(type as (typeof LISTING_TYPES)[number])) {
    return errorResponse("INVALID_TYPE", "The requested listing type is not supported.", 400);
  }
  if (audience && !AUDIENCES.includes(audience as (typeof AUDIENCES)[number])) {
    return errorResponse("INVALID_AUDIENCE", "The requested audience is not supported.", 400);
  }
  if (category && !/^[a-z0-9][a-z0-9-]{1,79}$/.test(category)) {
    return errorResponse("INVALID_CATEGORY", "Category must be a valid slug.", 400);
  }
  if (search.length > 120) {
    return errorResponse("QUERY_TOO_LONG", "Search queries must be 120 characters or fewer.", 400);
  }
  if (!Number.isInteger(limitValue) || limitValue < 1 || limitValue > 50) {
    return errorResponse("INVALID_LIMIT", "Limit must be an integer from 1 to 50.", 400);
  }
  if (!Number.isInteger(offsetValue) || offsetValue < 0 || offsetValue > 10000) {
    return errorResponse("INVALID_OFFSET", "Offset must be an integer from 0 to 10000.", 400);
  }

  const conditions = ["l.status = 'available'"];
  const bindings: unknown[] = [];

  if (type) {
    conditions.push("l.listing_type = ?");
    bindings.push(type);
    if (type === "application") {
      conditions.push("l.owner_type = 'yorphives'");
    }
  }
  if (category) {
    conditions.push("c.slug = ?");
    bindings.push(category);
  }
  if (audience) {
    conditions.push("EXISTS (SELECT 1 FROM json_each(l.audiences_json) WHERE value = ?)");
    bindings.push(audience);
  }
  if (search) {
    conditions.push("(instr(lower(l.title), lower(?)) > 0 OR instr(lower(l.summary), lower(?)) > 0 OR instr(lower(l.description), lower(?)) > 0)");
    bindings.push(search, search, search);
  }

  const where = conditions.join(" AND ");
  const countResult = await env.DB.prepare(
    "SELECT COUNT(*) AS total FROM catalogue_listings l LEFT JOIN catalogue_categories c ON c.id = l.category_id WHERE " + where,
  ).bind(...bindings).first<{ total: number }>();

  const sql = [
    "SELECT l.id, l.slug, l.title, l.summary, l.description, l.listing_type,",
    "l.audiences_json, c.slug AS category_slug, c.name AS category_name,",
    "l.access_model, l.price_minor, l.currency, l.destination_url,",
    "l.machine_readable_url, l.requires_auth, l.required_scopes_json,",
    "l.side_effects_json, l.published_at, l.updated_at",
    "FROM catalogue_listings l",
    "LEFT JOIN catalogue_categories c ON c.id = l.category_id",
    "WHERE " + where,
    "ORDER BY l.published_at DESC, l.id ASC",
    "LIMIT ? OFFSET ?",
  ].join(" ");

  const result = await env.DB.prepare(sql)
    .bind(...bindings, limitValue, offsetValue)
    .all<CatalogueRow>();

  const listings = result.results.map(mapCatalogueRow);
  const response: CatalogueListResponse = {
    data: listings,
    pagination: {
      limit: limitValue,
      offset: offsetValue,
      count: countResult?.total || 0,
    },
  };

  if (wantsMarkdown(request)) {
    return new Response(renderCatalogueMarkdown(listings), {
      headers: {
        "content-type": "text/markdown; charset=utf-8",
        "cache-control": "public, max-age=60, stale-while-revalidate=300",
        "x-content-type-options": "nosniff",
        vary: "Accept",
      },
    });
  }

  return jsonResponse(response, 200, { vary: "Accept" });
}
