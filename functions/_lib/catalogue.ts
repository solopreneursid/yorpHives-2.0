export type CatalogueListingType = "tool" | "application" | "service" | "opportunity" | "capability";
export type CatalogueAudience = "people" | "businesses" | "creators" | "application_users" | "ai_agents";
export type CatalogueAccessModel = "free" | "paid" | "freemium" | "contact" | "unknown";

export interface CatalogueListing {
  id: string;
  slug: string;
  title: string;
  summary: string;
  description: string;
  listing_type: CatalogueListingType;
  audiences: CatalogueAudience[];
  category: { slug: string; name: string } | null;
  access: { model: CatalogueAccessModel; price_minor: number | null; currency: string | null };
  destination_url: string;
  machine_readable_url: string | null;
  requires_auth: boolean;
  required_scopes: string[];
  side_effects: string[];
  published_at: string;
  updated_at: string;
}

export interface CatalogueListResponse {
  data: CatalogueListing[];
  pagination: { limit: number; offset: number; count: number };
}

export interface CatalogueErrorResponse {
  error: { code: string; message: string };
}

export interface D1Result<T> { results: T[]; success: boolean; }
export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  all<T>(): Promise<D1Result<T>>;
  first<T>(): Promise<T | null>;
  run(): Promise<{ success: boolean; meta?: { changes?: number } }>;
}
export interface D1Database { prepare(query: string): D1PreparedStatement; }
export interface CatalogueEnv { DB?: D1Database; }
export interface CatalogueRequestContext {
  request: Request;
  env: CatalogueEnv;
  params?: Record<string, string>;
}

export interface CatalogueRow {
  id: string;
  slug: string;
  title: string;
  summary: string;
  description: string;
  listing_type: CatalogueListingType;
  audiences_json: string;
  category_slug: string | null;
  category_name: string | null;
  access_model: CatalogueAccessModel;
  price_minor: number | null;
  currency: string | null;
  destination_url: string;
  machine_readable_url: string | null;
  requires_auth: number;
  required_scopes_json: string;
  side_effects_json: string;
  published_at: string;
  updated_at: string;
}

export const LISTING_TYPES: readonly CatalogueListingType[] = [
  "tool", "application", "service", "opportunity", "capability",
];
export const AUDIENCES: readonly CatalogueAudience[] = [
  "people", "businesses", "creators", "application_users", "ai_agents",
];

export function parseStringArray<T extends string>(value: string, allowed?: readonly T[]): T[] {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is T =>
      typeof item === "string" && (allowed === undefined || allowed.includes(item as T))
    );
  } catch {
    return [];
  }
}

export function mapCatalogueRow(row: CatalogueRow): CatalogueListing {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    summary: row.summary,
    description: row.description,
    listing_type: row.listing_type,
    audiences: parseStringArray(row.audiences_json, AUDIENCES),
    category: row.category_slug && row.category_name
      ? { slug: row.category_slug, name: row.category_name }
      : null,
    access: { model: row.access_model, price_minor: row.price_minor, currency: row.currency },
    destination_url: row.destination_url,
    machine_readable_url: row.machine_readable_url,
    requires_auth: row.requires_auth === 1,
    required_scopes: parseStringArray(row.required_scopes_json),
    side_effects: parseStringArray(row.side_effects_json),
    published_at: row.published_at,
    updated_at: row.updated_at,
  };
}

export function jsonResponse(data: unknown, status = 200, headers: HeadersInit = {}): Response {
  const responseHeaders = new Headers(headers);
  responseHeaders.set("content-type", "application/json; charset=utf-8");
  responseHeaders.set("cache-control", "public, max-age=60, stale-while-revalidate=300");
  responseHeaders.set("x-content-type-options", "nosniff");
  return new Response(JSON.stringify(data), { status, headers: responseHeaders });
}

export function errorResponse(code: string, message: string, status: number): Response {
  return jsonResponse({ error: { code, message } } satisfies CatalogueErrorResponse, status, {
    "cache-control": "no-store",
  });
}

export function wantsMarkdown(request: Request): boolean {
  return (request.headers.get("accept") || "").includes("text/markdown") ||
    new URL(request.url).searchParams.get("format") === "markdown";
}

export function renderCatalogueMarkdown(listings: CatalogueListing[]): string {
  if (listings.length === 0) {
    return "# YorpHives catalogue\n\nNo public listings are available yet. Check back as verified tools, applications, services, opportunities, and capabilities are published.\n";
  }
  const sections = listings.map((listing) => {
    const audience = listing.audiences.join(", ") || "not specified";
    const category = listing.category?.name || "Uncategorized";
    return [
      "## [" + listing.title + "](" + listing.destination_url + ")",
      listing.summary,
      "- Type: " + listing.listing_type,
      "- Category: " + category,
      "- Audiences: " + audience,
      "- Access: " + listing.access.model,
      "- Authentication required: " + (listing.requires_auth ? "yes" : "no"),
    ].join("\n");
  });
  return "# YorpHives catalogue\n\n" + sections.join("\n\n") + "\n";
}
