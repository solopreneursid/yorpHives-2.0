import { appendFile } from "node:fs/promises";
import { createOrReusePreview } from "./pages-preview-client.mjs";

async function writeOutput(name, value) {
  const line = name + "=" + value.replace(/[\r\n]/g, "") + "\n";
  if (process.env.GITHUB_ENV) await appendFile(process.env.GITHUB_ENV, line);
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, "url=" + value.replace(/[\r\n]/g, "") + "\n");
}

const result = await createOrReusePreview({
  accountId: process.env.CF_ACCOUNT_ID || "",
  apiToken: process.env.CF_API_TOKEN || "",
  project: process.env.PAGES_PROJECT_NAME || "",
  branch: process.env.PAGES_BRANCH || "",
  commitSha: process.env.PAGES_COMMIT_SHA || "",
  commitMessage: process.env.PAGES_COMMIT_MESSAGE || "Automated isolated preview deployment"
});
await writeOutput(result.output, result.url);
console.log((result.reused ? "Reused verified" : "Created") + " isolated preview: " + result.url);
console.log("Deployment: " + result.id);
