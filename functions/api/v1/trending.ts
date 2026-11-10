import { errorResponse, jsonResponse, type CatalogueRequestContext } from "../../_lib/catalogue";

export interface TrendingTool {
  slug: string;
  title: string;
  summary: string;
  published_at: string;
  detail_views: number;
  launches: number;
  activity: number;
}

export interface TrendingResponse {
  data: TrendingTool[];
  window: { days: 7; starts_at: string; ends_at: string };
  metric: "detail_views_plus_launches";
}

export async function onRequestGet({ env }: CatalogueRequestContext): Promise<Response> {
  if (!env.DB) {
    return errorResponse("CATALOGUE_UNAVAILABLE", "The usage database is not configured.", 503);
  }

  const result = await env.DB.prepare([
    "SELECT l.slug, l.title, l.summary, l.published_at,",
    "SUM(u.detail_views) AS detail_views, SUM(u.launches) AS launches,",
    "SUM(u.detail_views + u.launches) AS activity",
    "FROM catalogue_listings l",
    "INNER JOIN catalogue_usage_daily u ON u.listing_id = l.id",
    "WHERE l.status = 'available' AND l.listing_type = 'tool'",
    "AND u.usage_date >= date('now', '-6 days')",
    "GROUP BY l.id, l.slug, l.title, l.summary, l.published_at",
    "HAVING SUM(u.detail_views + u.launches) >= 3",
    "ORDER BY activity DESC, launches DESC, l.published_at DESC",
    "LIMIT 5",
  ].join(" ")).all<TrendingTool>();

  const now = new Date();
  const startsAt = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const endsAt = now.toISOString().slice(0, 10);
  const response: TrendingResponse = {
    data: result.results,
    window: { days: 7, starts_at: startsAt, ends_at: endsAt },
    metric: "detail_views_plus_launches",
  };
  return jsonResponse(response, 200, { "cache-control": "public, max-age=60, stale-while-revalidate=120" });
}
