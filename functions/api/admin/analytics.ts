import { adminJson, isAdminResponse, requireAdmin, type AdminRequestContext } from "../../_lib/admin-auth";

interface AnalyticsEnv {
  CF_ANALYTICS_API_TOKEN?: string;
  CF_ANALYTICS_ZONE_ID?: string;
}
interface DailyGroup {
  dimensions: { date: string };
  sum: { requests: number; pageViews: number; bytes: number };
}
interface PathGroup {
  dimensions: { clientRequestPath: string };
  count: number;
}
interface GraphqlResponse {
  data?: {
    viewer?: {
      zones?: Array<{
        httpRequests1dGroups?: DailyGroup[];
        httpRequestsAdaptiveGroups?: PathGroup[];
      }>;
    };
  };
  errors?: Array<{ message: string }>;
}
export async function onRequestGet(context: AdminRequestContext & { env: AdminRequestContext["env"] & AnalyticsEnv }): Promise<Response> {
  const identity = await requireAdmin(context);
  if (isAdminResponse(identity)) return identity;
  const token = context.env.CF_ANALYTICS_API_TOKEN;
  const zoneId = context.env.CF_ANALYTICS_ZONE_ID;
  if (!token || !zoneId) {
    return adminJson({ configured: false, message: "Analytics is not connected yet. Add CF_ANALYTICS_API_TOKEN (Zone Analytics:Read) and CF_ANALYTICS_ZONE_ID to the Admin Pages environment." });
  }
  const rangeParam = new URL(context.request.url).searchParams.get("range");
  const days = rangeParam === "30d" ? 30 : 7;
  const end = new Date();
  const start = new Date(end.getTime() - days * 86400000);
  const iso = (date: Date) => date.toISOString().slice(0, 10);
  const query = `query YorpHivesAnalytics($zoneTag: String!, $startDate: Date!, $endDate: Date!, $startTime: DateTime!, $endTime: DateTime!) {
    viewer {
      zones(filter: { zoneTag: $zoneTag }) {
        httpRequests1dGroups(limit: 31, filter: { date_geq: $startDate, date_leq: $endDate }) {
          dimensions { date }
          sum { requests pageViews bytes }
        }
        httpRequestsAdaptiveGroups(limit: 10, filter: { datetime_geq: $startTime, datetime_leq: $endTime }) {
          dimensions { clientRequestPath }
          count
        }
      }
    }
  }`;
  try {
    const response = await fetch("https://api.cloudflare.com/client/v4/graphql", {
      method: "POST",
      headers: { authorization: "Bearer " + token, "content-type": "application/json" },
      body: JSON.stringify({ query, variables: { zoneTag: zoneId, startDate: iso(start), endDate: iso(end), startTime: start.toISOString(), endTime: end.toISOString() } }),
      signal: AbortSignal.timeout(10000)
    });
    if (!response.ok) return adminJson({ configured: true, error: "Cloudflare Analytics API returned HTTP " + response.status }, 502);
    const result = await response.json() as GraphqlResponse;
    if (result.errors?.length) return adminJson({ configured: true, error: result.errors.map(item => item.message).join("; ") }, 502);
    const zone = result.data?.viewer?.zones?.[0];
    const daily = zone?.httpRequests1dGroups || [];
    const paths = zone?.httpRequestsAdaptiveGroups || [];
    const totals = daily.reduce((sum, item) => ({
      requests: sum.requests + (item.sum.requests || 0),
      pageViews: sum.pageViews + (item.sum.pageViews || 0),
      bytes: sum.bytes + (item.sum.bytes || 0)
    }), { requests: 0, pageViews: 0, bytes: 0 });
    return adminJson({
      configured: true, range: days + "d", totals,
      daily: daily.map(item => ({ date: item.dimensions.date, ...item.sum })),
      topPaths: paths.map(item => ({ path: item.dimensions.clientRequestPath, requests: item.count }))
    });
  } catch (error) {
    return adminJson({ configured: true, error: error instanceof Error ? error.message : "Analytics request failed." }, 502);
  }
}
