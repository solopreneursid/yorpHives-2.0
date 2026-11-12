const SECURITY_TARGETS = [
  { key: "site:home", title: "Homepage", url: "https://yorphives.com/" },
  { key: "site:free-tools", title: "Free Tools directory", url: "https://yorphives.com/free-tools/" },
  { key: "site:tool-manifest", title: "Free Tools manifest", url: "https://yorphives.com/free-tools/manifest.json" },
  { key: "site:tools-api", title: "Free Tools discovery API", url: "https://yorphives.com/api/v1/free-tools" },
  { key: "site:llms", title: "LLMs.txt", url: "https://yorphives.com/llms.txt" },
  { key: "site:openapi", title: "OpenAPI document", url: "https://yorphives.com/openapi.yaml" },
  { key: "site:well-known", title: "Agent discovery manifest", url: "https://yorphives.com/.well-known/yorphives.json" }
];

const SECURITY_HEADERS = [
  { name: "strict-transport-security", key: "missing-hsts", severity: "medium", title: "HTTPS response is missing HSTS", recommendation: "Configure a suitable Strict-Transport-Security policy after validating all subdomains." },
  { name: "x-content-type-options", key: "missing-nosniff", severity: "low", title: "Response is missing X-Content-Type-Options", recommendation: "Set X-Content-Type-Options: nosniff on public responses." },
  { name: "referrer-policy", key: "missing-referrer-policy", severity: "low", title: "Response is missing Referrer-Policy", recommendation: "Set a privacy-preserving Referrer-Policy such as strict-origin-when-cross-origin." }
];

async function upsertSecurityFinding(db, assetId, finding, checkedAt) {
  await db.prepare(`
    INSERT INTO admin_asset_findings
      (id, asset_id, finding_key, severity, category, title, details, recommendation, evidence_json, status, first_detected, last_verified)
    VALUES (?, ?, ?, ?, 'security', ?, ?, ?, ?, 'open', ?, ?)
    ON CONFLICT(asset_id, finding_key) DO UPDATE SET
      severity=excluded.severity, title=excluded.title, details=excluded.details,
      recommendation=excluded.recommendation, evidence_json=excluded.evidence_json,
      last_verified=excluded.last_verified,
      status=CASE WHEN admin_asset_findings.status='fixed' THEN 'open' ELSE admin_asset_findings.status END,
      resolved_at=NULL
  `).bind(crypto.randomUUID(), assetId, finding.key, finding.severity, finding.title,
    finding.details, finding.recommendation, JSON.stringify(finding.evidence), checkedAt, checkedAt).run();
}

async function closeVerifiedFindings(db, assetId, detected, checkedAt) {
  const prior = await db.prepare(
    "SELECT finding_key FROM admin_asset_findings WHERE asset_id=? AND category='security' AND status IN ('open','investigating','awaiting_approval')"
  ).bind(assetId).all();
  for (const row of prior.results || []) {
    if (!detected.has(row.finding_key)) {
      await db.prepare(
        "UPDATE admin_asset_findings SET status='fixed',resolved_at=?,last_verified=? WHERE asset_id=? AND finding_key=?"
      ).bind(checkedAt, checkedAt, assetId, row.finding_key).run();
    }
  }
}

export async function runSecurityAudit(db) {
  const startedAt = new Date().toISOString();
  const results = [];
  let checked = 0;
  let findings = 0;
  let errors = 0;
  let skipped = 0;

  for (const target of SECURITY_TARGETS) {
    const asset = await db.prepare(
      "SELECT id FROM admin_assets WHERE asset_key=? AND active=1"
    ).bind(target.key).first();

    if (!asset?.id) {
      skipped += 1;
      results.push({
        asset: target.key,
        status: "skipped",
        reason: "Asset inventory has not discovered this route yet."
      });
      continue;
    }

    const detected = new Set();
    let response;

    try {
      response = await fetch(target.url, {
        method: "GET",
        headers: {
          "user-agent": "YorpHives-SecurityAuditor/1.1",
          "range": "bytes=0-0"
        },
        redirect: "manual",
        signal: AbortSignal.timeout(8000)
      });

      const status = response.status;
      const contentType = (response.headers.get("content-type") || "").toLowerCase();
      const evidence = {
        url: target.url,
        status,
        checked_at: startedAt,
        content_type: contentType
      };

      if (status >= 300 && status < 400) {
        skipped += 1;
        results.push({
          asset: target.key,
          status: "skipped",
          http_status: status,
          reason: "Redirect was not followed; the destination was not audited."
        });
        continue;
      }

      if (status < 200 || status >= 300) {
        errors += 1;
        detected.add("security-unexpected-status");
        await upsertSecurityFinding(db, asset.id, {
          key: "security-unexpected-status",
          severity: status >= 500 ? "high" : "medium",
          title: target.title + " returned unexpected HTTP " + status,
          details: "The passive security audit received HTTP " + status + "; response-header checks were not treated as complete.",
          recommendation: "Confirm the route is intended to be public and returns a successful response before interpreting its security headers.",
          evidence
        }, startedAt);
        findings += 1;
        results.push({
          asset: target.key,
          status: "error",
          http_status: status,
          findings: detected.size,
          reason: "A non-success response prevents a complete header audit."
        });
        continue;
      }

      checked += 1;

      for (const header of SECURITY_HEADERS) {
        if (!response.headers.get(header.name)) {
          detected.add(header.key);
          await upsertSecurityFinding(db, asset.id, {
            key: header.key,
            severity: header.severity,
            title: target.title + ": " + header.title,
            details: "The public HTTPS response did not include the " + header.name + " header.",
            recommendation: header.recommendation,
            evidence: { ...evidence, missing_header: header.name }
          }, startedAt);
          findings += 1;
        }
      }

      const csp = response.headers.get("content-security-policy") || "";
      const hasFrameAncestors = /(?:^|;)\s*frame-ancestors\b/i.test(csp);
      if (contentType.includes("text/html") &&
          !hasFrameAncestors &&
          !response.headers.get("x-frame-options")) {
        detected.add("missing-clickjacking-protection");
        await upsertSecurityFinding(db, asset.id, {
          key: "missing-clickjacking-protection",
          severity: "medium",
          title: target.title + " has no detected clickjacking protection",
          details: "The HTML response contains neither a Content-Security-Policy frame-ancestors directive nor X-Frame-Options.",
          recommendation: "Set a compatible Content-Security-Policy frame-ancestors directive or X-Frame-Options: DENY after checking legitimate embeds.",
          evidence
        }, startedAt);
        findings += 1;
      }

      if (response.headers.get("x-powered-by")) {
        detected.add("technology-disclosure");
        await upsertSecurityFinding(db, asset.id, {
          key: "technology-disclosure",
          severity: "info",
          title: target.title + " discloses its application technology",
          details: "The response includes an X-Powered-By header.",
          recommendation: "Remove unnecessary technology-identifying response headers.",
          evidence: { ...evidence, header: "x-powered-by" }
        }, startedAt);
        findings += 1;
      }

      await closeVerifiedFindings(db, asset.id, detected, startedAt);
      results.push({
        asset: target.key,
        status: "checked",
        http_status: status,
        findings: detected.size
      });
    } catch (error) {
      errors += 1;
      results.push({
        asset: target.key,
        status: "error",
        error: error instanceof Error ? error.message.slice(0, 240) : "Request failed"
      });
    } finally {
      if (response?.body) await response.body.cancel().catch(() => {});
    }
  }

  const complete = checked === SECURITY_TARGETS.length && errors === 0 && skipped === 0;
  const action = complete ? "security_audit_completed" : "security_audit_partial";
  const summary = {
    status: complete ? "complete" : "partial",
    checked,
    target_count: SECURITY_TARGETS.length,
    findings,
    errors,
    skipped,
    results
  };

  await db.prepare(
    "INSERT INTO admin_audit_events (id,actor,action,resource_type,resource_id,details_json,created_at) VALUES (?,?,?,?,?,?,?)"
  ).bind(
    crypto.randomUUID(),
    "yorphives-security-auditor",
    action,
    "agent",
    "security-auditor",
    JSON.stringify(summary),
    startedAt
  ).run();

  return { ...summary, completed_at: startedAt };
}
