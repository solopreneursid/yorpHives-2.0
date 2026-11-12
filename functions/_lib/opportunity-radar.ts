import type { AdminD1Database } from "./admin-auth";

export type SignalSource = "monitor_finding" | "asset_finding";
export type SignalCategory = "reliability" | "security" | "discoverability" | "product_quality";
export type SignalTriage = "new" | "investigating" | "promoted" | "dismissed";
export type SignalSeverity = "critical" | "high" | "medium" | "low" | "info";
export interface OpportunitySignal {
  signal_id: string;
  source_kind: SignalSource;
  source_id: string;
  title: string;
  details: string;
  recommendation: string;
  source_url: string | null;
  severity: SignalSeverity;
  category: SignalCategory;
  suggested_agent_id: string;
  source_status: string;
  first_observed: string;
  last_observed: string;
  triage_status: SignalTriage;
  linked_job_id: string | null;
  modified_by: string;
  created_at: string;
  updated_at: string;
}
interface ObservedFinding {
  id: string;
  title: string;
  details: string;
  severity: SignalSeverity;
  source_status: string;
  first_observed: string;
  last_observed: string;
  source_url: string | null;
  category?: string | null;
  recommendation?: string | null;
}
export interface RadarRun {
  run_id: string;
  trigger_source: "scheduled" | "owner";
  status: "complete" | "failed";
  observed_count: number;
  inserted_count: number;
  recorded_at: string;
}
export interface RadarSnapshot {
  signals: OpportunitySignal[];
  latest_run: RadarRun | null;
  counts: { active: number; needs_review: number; promoted: number; dismissed: number; resolved_source: number };
  provenance: string;
  generated_at: string;
}
export interface RadarSyncReceipt {
  run_id: string;
  observed_count: number;
  inserted_count: number;
  source: "first_party_monitoring";
  inference_requests: 0;
}
const active = new Set(["open","investigating","awaiting_approval"]);
export function isActiveSource(status: string): boolean { return active.has(status); }

export function classifyFinding(source: SignalSource, item: ObservedFinding): { category: SignalCategory; agent: string; recommendation: string } {
  const value = [item.category || "",item.title,item.details].join(" ").toLowerCase();
  if (/security|vulnerab|certificate|csp\b|headers?|tls\b|malware|exposed|secret|injection|permissions?/.test(value)) {
    return { category: "security", agent: "security-sentinel", recommendation: "Independently verify the recorded security observation and determine whether remediation is needed." };
  }
  if (/seo\b|sitemap|robots|canonical|metadata|description|structured data|discover|llms\.txt|mcp\b|schema\.org|indexability/.test(value)) {
    return { category: "discoverability", agent: "growth-operator", recommendation: "Verify the observed discoverability issue in a fresh crawl and investigate an isolated improvement." };
  }
  if (source === "asset_finding" && /accessibility|usability|navigation|missing content|broken link|empty|product|image|mobile|contrast|alt text/.test(value)) {
    return { category: "product_quality", agent: "product-strategist", recommendation: "Reproduce the observed product-quality issue before proposing a change." };
  }
  return { category: "reliability", agent: "engineering-lead", recommendation: "Reproduce the monitoring finding and prepare an isolated engineering investigation." };
}
export function normalizeSignal(source: SignalSource, item: ObservedFinding): Omit<OpportunitySignal,"triage_status"|"linked_job_id"|"modified_by"|"created_at"|"updated_at"> {
  const classification = classifyFinding(source,item);
  const severity = ["critical","high","medium","low","info"].includes(item.severity) ? item.severity : "info";
  const clean = (value: string | null | undefined, limit: number): string => String(value || "").slice(0,limit);
  return {
    signal_id: (source === "monitor_finding" ? "monitor:" : "asset:") + item.id,
    source_kind: source,
    source_id: item.id,
    title: clean(item.title,240),
    details: clean(item.details,4000),
    recommendation: clean(item.recommendation,1500) || classification.recommendation,
    source_url: item.source_url ? clean(item.source_url,2000) : null,
    severity,
    category: classification.category,
    suggested_agent_id: classification.agent,
    source_status: clean(item.source_status,32),
    first_observed: clean(item.first_observed,64),
    last_observed: clean(item.last_observed,64)
  };
}
const UPSERT = `
 INSERT INTO hq_opportunity_signals
 (signal_id,source_kind,source_id,title,details,recommendation,source_url,severity,category,
  suggested_agent_id,source_status,first_observed,last_observed)
 VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
 ON CONFLICT(signal_id) DO UPDATE SET
 title=excluded.title,details=excluded.details,recommendation=excluded.recommendation,
 source_url=excluded.source_url,severity=excluded.severity,category=excluded.category,
 suggested_agent_id=excluded.suggested_agent_id,source_status=excluded.source_status,
 last_observed=excluded.last_observed,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
 WHERE title!=excluded.title OR details!=excluded.details OR recommendation!=excluded.recommendation
  OR COALESCE(source_url,'')!=COALESCE(excluded.source_url,'') OR severity!=excluded.severity
  OR category!=excluded.category OR suggested_agent_id!=excluded.suggested_agent_id
  OR source_status!=excluded.source_status OR last_observed!=excluded.last_observed
`;
function statement(db: AdminD1Database, value: ReturnType<typeof normalizeSignal>) {
  return db.prepare(UPSERT).bind(
    value.signal_id,value.source_kind,value.source_id,value.title,value.details,value.recommendation,
    value.source_url,value.severity,value.category,value.suggested_agent_id,value.source_status,
    value.first_observed,value.last_observed
  );
}
export async function syncRadarFromObservations(db: AdminD1Database, trigger: "scheduled" | "owner"): Promise<RadarSyncReceipt> {
  // Read existing monitoring observations only. No public crawling or paid AI
  // inference is started by this sync. Monitoring has its own separate cron.
  const [monitor,asset] = await Promise.all([
    db.prepare(`
       SELECT f.id,f.title,f.details,f.severity,f.status AS source_status,
              f.first_detected AS first_observed,f.last_verified AS last_observed,m.url AS source_url
       FROM admin_findings f LEFT JOIN admin_monitors m ON m.id=f.monitor_id
       ORDER BY f.last_verified DESC LIMIT 250
    `).all<ObservedFinding>(),
    db.prepare(`
       SELECT f.id,f.title,f.details,f.severity,f.category,f.recommendation,
              f.status AS source_status,f.first_detected AS first_observed,
              f.last_verified AS last_observed,a.url AS source_url
       FROM admin_asset_findings f JOIN admin_assets a ON a.id=f.asset_id
       ORDER BY f.last_verified DESC LIMIT 250
    `).all<ObservedFinding>()
  ]);
  const items = [
    ...monitor.results.map(v=>normalizeSignal("monitor_finding",v)),
    ...asset.results.map(v=>normalizeSignal("asset_finding",v))
  ];
  const existing = await db.prepare("SELECT COUNT(*) AS count FROM hq_opportunity_signals").first<{count:number}>();
  const runId = crypto.randomUUID();
  try {
    for (let start = 0; start < items.length; start += 40) {
      await db.batch(items.slice(start,start+40).map(item => statement(db,item)));
    }
    const post = await db.prepare("SELECT COUNT(*) AS count FROM hq_opportunity_signals").first<{count:number}>();
    const inserted = Math.max(0,Number(post?.count||0)-Number(existing?.count||0));
    await db.prepare("INSERT INTO hq_radar_runs(run_id,trigger_source,status,observed_count,inserted_count) VALUES (?,?,'complete',?,?)")
      .bind(runId,trigger,items.length,inserted).run();
    return { run_id:runId, observed_count:items.length, inserted_count:inserted, source:"first_party_monitoring", inference_requests:0 };
  } catch (error) {
    await db.prepare("INSERT INTO hq_radar_runs(run_id,trigger_source,status,observed_count,inserted_count) VALUES (?,?,'failed',?,0)")
      .bind(runId,trigger,items.length).run();
    throw error;
  }
}
export async function radarSnapshot(db: AdminD1Database): Promise<RadarSnapshot> {
  const [signals,run] = await Promise.all([
    db.prepare(`
      SELECT signal_id,source_kind,source_id,title,details,recommendation,source_url,severity,category,
             suggested_agent_id,source_status,first_observed,last_observed,triage_status,
             linked_job_id,modified_by,created_at,updated_at
      FROM hq_opportunity_signals
      ORDER BY CASE WHEN triage_status='new' THEN 0 WHEN triage_status='investigating' THEN 1 ELSE 2 END,
        CASE severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 ELSE 4 END,
        last_observed DESC LIMIT 250
    `).all<OpportunitySignal>(),
    db.prepare("SELECT run_id,trigger_source,status,observed_count,inserted_count,recorded_at FROM hq_radar_runs ORDER BY recorded_at DESC LIMIT 1").first<RadarRun>()
  ]);
  return {
    signals:signals.results, latest_run:run,
    counts:{
      active: signals.results.filter(s=>["new","investigating"].includes(s.triage_status)&&isActiveSource(s.source_status)).length,
      needs_review: signals.results.filter(s=>s.triage_status==="new"&&isActiveSource(s.source_status)).length,
      promoted: signals.results.filter(s=>s.triage_status==="promoted").length,
      dismissed: signals.results.filter(s=>s.triage_status==="dismissed").length,
      resolved_source:signals.results.filter(s=>!isActiveSource(s.source_status)).length
    },
    provenance: "First-party monitoring observations only. No external market data, independent fact-checking, or AI-generated claims are present.",
    generated_at:new Date().toISOString()
  };
}
