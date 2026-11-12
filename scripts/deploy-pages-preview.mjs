import { appendFile } from "node:fs/promises";

const ACCOUNT_ID = process.env.CF_ACCOUNT_ID || "";
const API_TOKEN = process.env.CF_API_TOKEN || "";
const PROJECT = process.env.PAGES_PROJECT_NAME || "";
const BRANCH = process.env.PAGES_BRANCH || "";
const COMMIT_SHA = process.env.PAGES_COMMIT_SHA || "";
const COMMIT_MESSAGE = (process.env.PAGES_COMMIT_MESSAGE || "Automated isolated preview deployment").slice(0, 500);

const PROJECTS = {
  "yorphives-2-preview": {
    output: "SITE_BASE_URL",
    productionBranch: "main"
  },
  "yorphives-admin-staging": {
    output: "ADMIN_BASE_URL",
    productionBranch: "build/yorphives-admin-reliability"
  }
};

function requireValue(value, name) {
  if (!value) throw new Error(name + " is required.");
  return value;
}

async function writeOutput(name, value) {
  const line = name + "=" + value.replace(/[\r\n]/g, "") + "\n";
  if (process.env.GITHUB_ENV) await appendFile(process.env.GITHUB_ENV, line);
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, "url=" + value.replace(/[\r\n]/g, "") + "\n");
}

async function main() {
  requireValue(ACCOUNT_ID, "CF_ACCOUNT_ID");
  requireValue(API_TOKEN, "CF_API_TOKEN");
  requireValue(BRANCH, "PAGES_BRANCH");
  requireValue(COMMIT_SHA, "PAGES_COMMIT_SHA");

  const config = PROJECTS[PROJECT];
  if (!config) throw new Error("Refusing to deploy an unapproved Pages project: " + PROJECT);
  if (BRANCH === config.productionBranch) {
    throw new Error("Refusing to create a preview deployment from the project's production branch.");
  }
  if (!BRANCH.startsWith("build/")) {
    throw new Error("Only build/* feature branches may be deployed by this workflow.");
  }

  const form = new FormData();
  form.append("branch", BRANCH);
  form.append("commit_hash", COMMIT_SHA);
  form.append("commit_message", COMMIT_MESSAGE);
  form.append("commit_dirty", "false");

  const endpoint = "https://api.cloudflare.com/client/v4/accounts/" +
    encodeURIComponent(ACCOUNT_ID) + "/pages/projects/" +
    encodeURIComponent(PROJECT) + "/deployments";
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { authorization: "Bearer " + API_TOKEN },
    body: form,
    signal: AbortSignal.timeout(45000)
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.success !== true || !payload?.result?.url) {
    const messages = Array.isArray(payload?.errors)
      ? payload.errors.map(item => String(item.message || "Cloudflare API error")).join("; ")
      : "Cloudflare Pages deployment request failed.";
    throw new Error("Cloudflare Pages preview deployment failed (HTTP " + response.status + "): " + messages.slice(0, 500));
  }

  const deployment = payload.result;
  if (deployment.environment !== "preview") {
    throw new Error("Cloudflare returned a non-preview deployment; refusing to continue.");
  }
  if (deployment.deployment_trigger?.metadata?.branch !== BRANCH) {
    throw new Error("Cloudflare deployment branch did not match the requested feature branch.");
  }
  const url = new URL(deployment.url);
  if (url.protocol !== "https:" || !url.hostname.endsWith("." + PROJECT + ".pages.dev")) {
    throw new Error("Cloudflare returned an unexpected Pages deployment hostname.");
  }

  await writeOutput(config.output, deployment.url);
  console.log("Created isolated " + PROJECT + " preview for " + BRANCH + ".");
  console.log("Deployment: " + deployment.id);
  console.log("Preview URL: " + deployment.url);
}

await main();
