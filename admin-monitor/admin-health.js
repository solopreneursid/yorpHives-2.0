import { assessAssetRepresentation, isMachineReadableAsset } from './asset-policy.js';

/**
 * Shared read-only health-check runner for the Pages admin API and scheduled Worker.
 * @typedef {{ bind(...values: unknown[]): any; all<T>(): Promise<{results:T[]}>; run(): Promise<unknown> }} D1Statement
 * @typedef {{ prepare(sql:string): D1Statement; batch(statements:D1Statement[]): Promise<unknown[]> }} HealthD1
 * @typedef {{ id:string; name:string; url:string; environment:"production"|"preview" }} MonitorRow
 * @typedef {{ monitor_id:string; ok:boolean; status_code:number|null; duration_ms:number; error_message:string|null }} CheckResult
 */

const ACCESS_GATE_MONITORS = new Set(["admin-staging-ui", "admin-staging-api"]);

const APPROVED_HOSTS = new Set([
  "yorphives.com",
  "www.yorphives.com",
  "build-yorphives-admin-reliab.yorphives-2-preview.pages.dev",
  "admin-staging.yorphives.com",
]);

function approvedUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || !APPROVED_HOSTS.has(url.hostname) ||
      url.username || url.password || url.port || url.search || url.hash) return null;
    return url;
  } catch {
    return null;
  }
}

export async function checkMonitor(monitor) {
  const url = approvedUrl(monitor.url);
  if (!url) {
    return { monitor_id: monitor.id, ok: false, status_code: null, duration_ms: 0, error_message: "Monitor URL is outside the approved HTTPS host allowlist." };
  }
  const started = Date.now();
  try {
    const asset = { url: url.toString(), type: 'website_page' };
    const machine=isMachineReadableAsset(asset);
    const response = await fetch(url.toString(), {
      method: "GET",
      headers: machine
        ? { "user-agent": "YorpHives-SiteHealth/1.0",
            accept: "application/json,application/xml,text/plain,application/yaml" }
        : { "user-agent": "YorpHives-SiteHealth/1.0", range: "bytes=0-1023" },
      redirect: "manual",
      signal: AbortSignal.timeout(8000),
    });
    const expectedAccessDenial = ACCESS_GATE_MONITORS.has(monitor.id) &&
      (response.status === 401 || response.status === 403) &&
      Boolean(response.headers.get("cf-ray"));
    let ok=(response.status>=200&&response.status<300)||expectedAccessDenial;
    let reason=ok?null:"HTTP "+response.status;
    if(machine && !expectedAccessDenial) {
      if(response.status!==200){
        ok=false;
        reason="Machine-readable route returned HTTP "+response.status+" instead of a full HTTP 200 document.";
      }else if(Number(response.headers.get('content-length')||0)>131072){
        ok=false;
        reason="Machine-readable response exceeded the health-check size limit.";
      }else{
        const reader=response.body?.getReader();
        const chunks=[];
        let bytes=0;
        try{
          if(reader){
            while(true){
              const {done,value}=await reader.read();
              if(done)break;
              bytes+=value.byteLength;
              if(bytes>131072)break;
              chunks.push(value);
            }
          }
        }finally{await reader?.cancel().catch(()=>{});}
        if(bytes>131072){
          ok=false;reason="Machine-readable response exceeded the health-check size limit.";
        }else{
          const data=new Uint8Array(bytes);
          let offset=0;
          for(const chunk of chunks){data.set(chunk,offset);offset+=chunk.byteLength;}
          const report=assessAssetRepresentation(asset,response.headers.get("content-type")||"",
            new TextDecoder().decode(data));
          ok=report.ok;
          reason=report.ok?null:"Machine-readable content invalid: "+report.code;
        }
      }
    }
    if(!response.bodyUsed) await response.body?.cancel().catch(()=>{});
    return {
      monitor_id: monitor.id,
      ok,
      status_code: response.status,
      duration_ms: Date.now()-started,
      error_message:reason,
    };
  } catch (error) {
    return {
      monitor_id: monitor.id,
      ok: false,
      status_code: null,
      duration_ms: Date.now() - started,
      error_message: error instanceof Error ? error.message.slice(0, 240) : "Network check failed.",
    };
  }
}

/**
 * Run bounded checks against database-configured monitors and persist the run.
 * @param {HealthD1} db
 * @param {"manual"|"scheduled"} triggerSource
 */
export async function runAdminHealthChecks(db, triggerSource) {
  const monitorRows = await db.prepare(
    `SELECT m.id, m.name, m.url, m.environment FROM admin_monitors m
     WHERE m.enabled = 1
     ORDER BY (SELECT MAX(c.checked_at) FROM admin_checks c WHERE c.monitor_id = m.id) ASC, m.id
     LIMIT 10`,
  ).all();
  /** @type {MonitorRow[]} */
  const monitors = monitorRows.results;
  if (monitors.length === 0) throw new Error("No enabled health monitors are configured.");

  const runId = crypto.randomUUID();
  const startedAt = new Date().toISOString();
  await db.prepare(
    "INSERT INTO admin_runs (id, trigger_source, status, started_at, monitor_count) VALUES (?, ?, 'running', ?, ?)",
  ).bind(runId, triggerSource, startedAt, monitors.length).run();

  try {
    /** @type {CheckResult[]} */
    const results = await Promise.all(monitors.map(checkMonitor));
    const completedAt = new Date().toISOString();
    const passed = results.filter((result) => result.ok).length;
    const failed = results.length - passed;
    const statements = results.map((result) => db.prepare(`
      INSERT INTO admin_checks (id, run_id, monitor_id, ok, status_code, duration_ms, error_message, checked_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(crypto.randomUUID(), runId, result.monitor_id, result.ok ? 1 : 0, result.status_code, result.duration_ms, result.error_message, completedAt));

    for (const result of results) {
      const monitor = monitors.find((item) => item.id === result.monitor_id);
      if (!monitor) continue;
      const fingerprint = "http-health:" + monitor.id;
      if (result.ok) {
        statements.push(db.prepare(
          "UPDATE admin_findings SET status = 'verified', resolved_at = ?, last_verified = ? WHERE fingerprint = ? AND status IN ('open', 'investigating', 'awaiting_approval', 'fixed')",
        ).bind(completedAt, completedAt, fingerprint));
      } else {
        const severity = monitor.environment === "production" ? "high" : "medium";
        statements.push(db.prepare(`
          INSERT INTO admin_findings (id, fingerprint, monitor_id, run_id, severity, title, details, status, first_detected, last_verified)
          VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?, ?)
          ON CONFLICT(fingerprint) DO UPDATE SET run_id = excluded.run_id, severity = excluded.severity,
            details = excluded.details, last_verified = excluded.last_verified,
            status = CASE WHEN admin_findings.status IN ('fixed', 'verified') THEN 'open' ELSE admin_findings.status END,
            resolved_at = NULL
        `).bind(
          crypto.randomUUID(), fingerprint, monitor.id, runId, severity,
          monitor.name + " is not healthy", result.error_message || "HTTP check failed.", completedAt, completedAt,
        ));
      }
    }
    statements.push(db.prepare(
      "UPDATE admin_runs SET status = 'completed', completed_at = ?, passed_count = ?, failed_count = ? WHERE id = ?",
    ).bind(completedAt, passed, failed, runId));
    await db.batch(statements);
    return {
      run: { id: runId, status: "completed", started_at: startedAt, completed_at: completedAt, monitor_count: monitors.length, passed_count: passed, failed_count: failed },
      results,
    };
  } catch (error) {
    const completedAt = new Date().toISOString();
    await db.prepare("UPDATE admin_runs SET status = 'failed', completed_at = ? WHERE id = ?").bind(completedAt, runId).run().catch(() => undefined);
    throw error;
  }
}
