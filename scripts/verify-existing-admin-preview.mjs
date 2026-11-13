import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  locateExactExistingPreview, verifyAnonymousBoundary
} from "./staging-preview-check.mjs";

const checkedOut = process.env.GITHUB_SHA || "";
const approved = process.env.PAGES_COMMIT_SHA || "";
if (!/^[a-f0-9]{40}$/.test(checkedOut) || approved !== checkedOut) {
  throw new Error("The checked-out version does not equal the founder-selected revision.");
}
if (!process.env.GITHUB_ENV) {
  throw new Error("This protected verification only runs inside an approved GitHub Actions job.");
}

const preview = await locateExactExistingPreview({
  accountId: process.env.CF_ACCOUNT_ID || "",
  apiToken: process.env.CF_API_TOKEN || "",
  deploymentId: process.env.PAGES_DEPLOYMENT_ID || "",
  branch: process.env.PAGES_BRANCH || "",
  commitSha: approved
});

const boundary = await verifyAnonymousBoundary(preview.url);
const report = {
  source: "verified_cloudflare_pages_deployment_metadata_and_anonymous_access",
  staging_project: "yorphives-admin-staging",
  verified_commit_sha: preview.commitSha,
  deployment_id: preview.id,
  preview_url: preview.url,
  verified_existing_deployment: true,
  access_boundary_verified: boundary.access_boundary_verified,
  anonymous_paths_checked: boundary.routes,
  authenticated_browser_test_completed: false,
  no_deployment_created: true,
  no_production_change: true,
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
