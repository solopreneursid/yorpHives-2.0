/**
 * Bounded, read-only classification of already recorded HTTP monitor receipts.
 * A 2xx or protected Access gate is NOT functional proof of a product or HQ.
 * No new network requests, database writes, schema changes or token use.
 */
export const COVERAGE_LIMIT = 200;
export const COVERAGE_FRESHNESS_HOURS = 8;
const SUITES = ["website", "products", "headquarters"];
const empty = () => ({ configured:0, recent_passes:0, recent_failures:0,
  stale:0, unchecked:0, last_checked_at:null });

export function classifyMonitoredRoute(value, environment) {
  if (typeof value !== "string" || value.length > 2048) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.port ||
        url.search || url.hash) return null;
    if (url.hostname === "admin-staging.yorphives.com" && environment === "preview") {
      return "headquarters";
    }
    if ((url.hostname !== "yorphives.com" && url.hostname !== "www.yorphives.com") ||
        environment !== "production") return null;
    if (/^\/(?:free-tools|tools|products|apps)(?:\/|$)/.test(url.pathname) ||
        /^\/api\/v1\/(?:free-tools|catalogue)(?:\/|$)/.test(url.pathname)) return "products";
    return "website";
  } catch { return null; }
}

function validTime(value, nowMs) {
  if (typeof value !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(value)) return null;
  const instant = Date.parse(value);
  return Number.isFinite(instant) && instant <= nowMs ? instant : null;
}

/**
 * The returned record counts represent monitored URLs, NOT verified user journeys
 * or guarantees that Headquarters is running. Staging Access 403 is a boundary
 * observation only. Passing a single HTTP check never certifies a product.
 */
export function summarizeWatchtowerCoverage(records, now = new Date(), capped = false) {
  const timestamp = now.getTime();
  if (!Number.isFinite(timestamp) || !Array.isArray(records)) throw new Error("Invalid monitor evidence");
  const surfaces = Object.fromEntries(SUITES.map(key => [key, empty()]));
  let unclassified = 0;
  const cutoff = timestamp - COVERAGE_FRESHNESS_HOURS * 3600000;
  for (const item of records.slice(0,COVERAGE_LIMIT)) {
    const suite = classifyMonitoredRoute(item?.url, item?.environment);
    if (!suite) { unclassified++; continue; }
    const tally = surfaces[suite];
    tally.configured++;
    const ms = validTime(item.checked_at, timestamp);
    if (ms === null) {
      // No receipt, invalid timestamp, or future-dated check: not verified.
      tally.unchecked++;
    } else if (ms < cutoff) {
      tally.stale++;
    } else if (item.ok === 1 || item.ok === true) {
      tally.recent_passes++;
    } else if (item.ok === 0 || item.ok === false) {
      tally.recent_failures++;
    } else {
      tally.unchecked++;
    }
    if (ms !== null && (!tally.last_checked_at ||
        ms > Date.parse(tally.last_checked_at))) tally.last_checked_at = item.checked_at;
  }
  return {
    scope:"recorded_http_reachability_only", freshness_hours:COVERAGE_FRESHNESS_HOURS,
    truncated:capped || records.length > COVERAGE_LIMIT,
    ignored_routes:unclassified,
    surfaces,
    headquarters_runtime_verified:false,
    product_functionality_verified:false
  };
}

export async function readWatchtowerCoverage(db, now = new Date()) {
  const statement = db.prepare(`SELECT m.url,m.environment,c.ok,c.checked_at
    FROM admin_monitors m LEFT JOIN admin_checks c ON c.id=(
      SELECT recent.id FROM admin_checks recent WHERE recent.monitor_id=m.id
      ORDER BY recent.checked_at DESC,recent.id DESC LIMIT 1)
    WHERE m.enabled=1 ORDER BY m.id LIMIT ${COVERAGE_LIMIT + 1}`);
  const response = await statement.all();
  if (response?.success === false || !Array.isArray(response?.results))
    throw new Error("Monitor records unavailable");
  return summarizeWatchtowerCoverage(response.results,now,response.results.length > COVERAGE_LIMIT);
}
