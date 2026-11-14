/**
 * Fail-closed project ownership helper for memory-independent AI coding sessions.
 * No files, services, remote branches, or production targets are modified by
 * identify/guard/verify. setup creates missing separate Git checkouts only.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const PROJECTS = Object.freeze({
  headquarters: Object.freeze({ directory: "headquarters", repo: "solopreneursid/yorpHives-2.0", branch: "feature/headquarters-functional-watchdog-inbox-20261114" }),
  website: Object.freeze({ directory: "website", repo: "solopreneursid/YorpHives", branch: "main" })
});
const here = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const defaultWorkspace = here.endsWith(sep + "headquarters") ? dirname(here) : resolve(dirname(here), "yorphives-workspace");

function git(cwd, ...args) {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}
export function remoteRepository(value) {
  const match = typeof value === "string" && value.trim().match(/^(?:https:\/\/github\.com\/|ssh:\/\/git@github\.com\/|git@github\.com:)([\w-]+\/[\w.-]+?)(?:\.git)?\/?$/i);
  return match ? match[1].toLowerCase() : null;
}
export function fileOwner(input) {
  if (typeof input !== "string" || input.length === 0 || isAbsolute(input) ||
      input.includes("\\") || input.split("/").some(segment => segment === ".." || segment === "." || segment === "")) return "invalid";
  if (/^(admin\/|admin-monitor\/|admin-agent\/|hq-engine\/|hq-intelligence\/|self-host\/|functions\/admin\/|functions\/api\/admin\/)/.test(input)) return "headquarters";
  if (/^(scripts\/headquarters-|tests\/headquarters|docs\/HEADQUARTERS|docs\/YORPMIND)/.test(input)) return "headquarters";
  if (/^(free-tools\/|discover\/|explore\/|listing\/|builder\/|connect\/|functions\/api\/v1\/|\.well-known\/)/.test(input)) return "website";
  if (/^(index\.html|app\.js|styles\.css|llms\.txt|robots\.txt|sitemap\.xml|site\.webmanifest|openapi\.yaml|_headers)$/.test(input)) return "website";
  return "shared";
}
export function requireOwner(project, paths, allowShared = false) {
  if (!Object.hasOwn(PROJECTS, project)) throw new Error("Unknown project: " + project);
  if (!Array.isArray(paths) || paths.length < 1) throw new Error("Provide at least one repository-relative file path");
  const forbidden = paths.filter(path => fileOwner(path) !== project && !(allowShared && fileOwner(path) === "shared"));
  if (forbidden.length) throw new Error("Wrong project / ambiguous file: " + forbidden.map(path => path + " [" + fileOwner(path) + "]").join(", ") + ". Verify correct checkout. Shared files require explicit review.");
  return true;
}
export function checkoutIdentity(directory) {
  const path = realpathSync(directory);
  if (realpathSync(git(directory, "rev-parse", "--show-toplevel")) !== path) throw new Error("Not an independent Git repository root: " + directory);
  const origin = remoteRepository(git(directory, "remote", "get-url", "origin"));
  const match = Object.entries(PROJECTS).find(([,entry]) => entry.repo.toLowerCase() === origin);
  if (!match) throw new Error("Unknown Git origin: " + (origin || "unsupported remote") + ". Refusing to guess.");
  return { project: match[0], repository: match[1].repo, path, branch: git(directory, "branch", "--show-current") || "DETACHED" };
}
export function assertTwoCheckouts(directory) {
  const entries = Object.entries(PROJECTS).map(([project, item]) => {
    const root = join(resolve(directory), item.directory);
    if (!existsSync(root)) throw new Error("Missing " + project + " checkout: " + root);
    const found = checkoutIdentity(root);
    if (found.project !== project) throw new Error("Wrong Git remote for " + root);
    return found;
  });
  if (entries[0].path === entries[1].path) throw new Error("Website and Headquarters share a checkout");
  return entries;
}
function print(items) {
  for (const item of items) process.stdout.write(item.project.toUpperCase() + " | " + item.repository + " | " + item.branch + " | " + item.path + "\n");
}
function main(args) {
  const [action, ...rest] = args;
  if (action === "identify") {
    const found = checkoutIdentity(rest[0] ? resolve(rest[0]) : here);
    print([found]); return;
  }
  if (action === "verify") { print(assertTwoCheckouts(rest[0] || defaultWorkspace)); return; }
  if (action === "setup") {
    const parent = resolve(rest[0] || defaultWorkspace);
    mkdirSync(parent, {recursive:true});
    for (const [project, item] of Object.entries(PROJECTS)) {
      const dest = join(parent, item.directory);
      if (!existsSync(dest)) git(parent, "clone", "--branch", item.branch, "--single-branch", "https://github.com/" + item.repo + ".git", dest);
      const found = checkoutIdentity(dest);
      if (found.project !== project) throw new Error("Wrong project checked out at " + dest);
    }
    print(assertTwoCheckouts(parent)); return;
  }
  if (action === "guard") {
    const project = rest.shift();
    const allowShared = rest[0] === "--allow-shared";
    if (allowShared) rest.shift();
    const actual = checkoutIdentity(here);
    if (actual.project !== project) throw new Error("This checkout is " + actual.project + ", not " + project + ". Use the other repository.");
    requireOwner(project, rest, allowShared);
    process.stdout.write("Allowed " + project + " paths. No files modified.\n"); return;
  }
  throw new Error("Usage: node scripts/workspace-boundaries.mjs identify [checkout] | setup [workspace] | verify [workspace] | guard headquarters <path> [path...]");
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(process.argv.slice(2)); } catch (error) { process.stderr.write("YorpHives boundary blocked: " + error.message + "\n"); process.exitCode = 1; }
}