import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile(new URL("../migrations/0010_agentic_os_foundation.sql", import.meta.url), "utf8");
const architecture = await readFile(new URL("../docs/AGENTIC-OPERATING-SYSTEM.md", import.meta.url), "utf8");

test("Agentic OS foundation defines durable registry, work, evidence and approval records", () => {
  for (const table of [
    "agent_departments",
    "agent_registry",
    "agent_jobs",
    "agent_job_events",
    "agent_artifacts",
    "agent_approvals",
  ]) {
    assert.match(migration, new RegExp("CREATE TABLE IF NOT EXISTS " + table + "\\b"));
  }
  assert.match(migration, /REFERENCES agent_departments/);
  assert.match(migration, /REFERENCES agent_registry/);
  assert.match(migration, /REFERENCES agent_jobs/);
});

test("specialist roles are seeded as planned and disabled until verified", () => {
  const seeded = migration.match(/\('(?:chief-of-staff|engineering-lead|security-sentinel|innovation-scout|global-intelligence|product-strategist|growth-operator|revenue-analyst|quality-engineer)'/g) || [];
  assert.equal(seeded.length, 9);
  assert.match(migration, /'planned', 'recommend', 0/);
  assert.match(migration, /'planned', 'sandbox_execute', 0/);
  assert.match(migration, /CHECK \(enabled = 0 OR status = 'ready'\)/);
});

test("approval records bind a verified step-up to a specific change and expiry", () => {
  assert.match(migration, /change_digest TEXT NOT NULL/);
  assert.match(migration, /step_up_verified_at TEXT/);
  assert.match(migration, /expires_at TEXT NOT NULL/);
  assert.match(migration, /consumed_at TEXT/);
  assert.doesNotMatch(migration, /otp_code|password_value|recovery_code|secret_value/i);
});

test("architecture preserves owner approval, independent QA and production isolation", () => {
  assert.match(architecture, /fresh Cloudflare Access authentication flow protected by an OTP\/MFA policy/i);
  assert.match(architecture, /A browser-supplied boolean, timestamp, email, OTP value or client-generated token is never proof of approval/i);
  assert.match(architecture, /independent code review and QA/i);
  assert.match(architecture, /Pages rollback does not reverse D1 data/i);
  assert.match(architecture, /revenue, recurring revenue, active and returning users/i);
});
