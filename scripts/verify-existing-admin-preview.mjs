import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  locateMatchingAdminPreview, verifyAnonymousBoundary,
  readHeadquartersCanonical, readHeadquartersD1Isolation, sameHeadquartersCanonical
} from "./staging-preview-check.mjs";

const checkedOut = process.env.GITHUB_SHA || "";
const approved = process.env.PAGES_COMMIT_SHA || "";
if (!/^[a-f0-9]{40}$/.test(checkedOut) || approved !== checkedOut) {
  throw new Error("The checked-out version does not equal the founder-selected revision.");
}
if (!process.env.GITHUB_ENV) {
  throw new Error("This protected verification only runs inside an approved GitHub Actions job.");
}

// The canonical and preview Pages configurations must point to DIFFERENT
// D1 databases. With a shared DB, even a signed-in staging test can damage
// canonical data if a route behaves unexpectedly.
const isolatedBefore=await readHeadquartersD1Isolation({
  accountId:process.env.CF_ACCOUNT_ID||"",apiToken:process.env.CF_API_TOKEN||""
});
const before=await readHeadquartersCanonical({accountId:process.env.CF_ACCOUNT_ID||"",apiToken:process.env.CF_API_TOKEN||""});
const preview = await locateMatchingAdminPreview({
  accountId: process.env.CF_ACCOUNT_ID || "",
  apiToken: process.env.CF_API_TOKEN || "",
  branch: process.env.PAGES_BRANCH || "",
  commitSha: approved
});

const boundary = await verifyAnonymousBoundary(preview.url);
const after=await readHeadquartersCanonical({accountId:process.env.CF_ACCOUNT_ID||"",apiToken:process.env.CF_API_TOKEN||""});
if(!sameHeadquartersCanonical(before,after))throw Error("HQ canonical production deployment changed during QA.");
const isolatedAfter=await readHeadquartersD1Isolation({
  accountId:process.env.CF_ACCOUNT_ID||"",apiToken:process.env.CF_API_TOKEN||""
});
if(!isolatedBefore.isolated||!isolatedAfter.isolated)
 throw Error("D1 environment isolation changed during QA.");

const report = {
  source: "verified_cloudflare_pages_deployment_metadata_and_anonymous_access",
  staging_project: "yorphives-admin-staging",
  verified_commit_sha: preview.commitSha,
  deployment_id: preview.id,
  preview_url: preview.url,
  verified_existing_deployment: true,
  access_boundary_verified: boundary.access_boundary_verified,
  database_isolation_verified: true,
  anonymous_paths_checked: boundary.routes,
  authenticated_browser_test_completed: false,
  no_deployment_created: true,
  canonical_before: before,
  canonical_after: after,
  no_production_change: sameHeadquartersCanonical(before,after),
  owner_mfa_verified: false,
  assistant_grants_created: 0,
  ai_model_calls: 0,
  database_writes: 0,
  checked_at: new Date().toISOString()
};
await mkdir("artifacts", { recursive: true });
await writeFile(resolve("artifacts/admin-preview-verification.json"),
  JSON.stringify(report, null, 2) + "\n", "utf8");

// The exact URL is set only AFTER successful Cloudflare metadata and
// anonymous Access validation. Never write authentication credentials.
await appendFile(process.env.GITHUB_ENV, "ADMIN_BASE_URL=" + preview.url + "\n");
console.log(JSON.stringify({
  existing_private_staging_verified: true,
  exact_sha_match: true,
  anonymous_access_blocked: true,
  admin_preview: preview.url,
  deployment_performed: false,
  checked_paths: boundary.routes.length
}));
