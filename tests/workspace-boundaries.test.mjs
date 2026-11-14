import test from "node:test";
import assert from "node:assert/strict";
import { PROJECTS, remoteRepository, fileOwner, requireOwner } from "../scripts/workspace-boundaries.mjs";
test("two stable and distinct source repositories for every AI session", () => {
 assert.notEqual(PROJECTS.headquarters.repo.toLowerCase(), PROJECTS.website.repo.toLowerCase());
 assert.equal(PROJECTS.headquarters.directory, "headquarters");
 assert.equal(PROJECTS.website.directory, "website");
});
test("Git origins are compared exactly, not inferred from folder names", () => {
 assert.equal(remoteRepository("https://github.com/solopreneursid/yorpHives-2.0.git"), "solopreneursid/yorphives-2.0");
 assert.equal(remoteRepository("git@github.com:solopreneursid/YorpHives.git"), "solopreneursid/yorphives");
 assert.equal(remoteRepository("https://malicious.example/solopreneursid/YorpHives"), null);
});
test("legacy website paths are never treated as Headquarters", () => {
 for (const path of ["index.html", "free-tools/index.html", "functions/api/v1/trending.ts", "discover/index.html"]) assert.equal(fileOwner(path), "website");
 for (const path of ["admin/index.html", "self-host/server.mjs", "functions/api/admin/go-live.ts"]) assert.equal(fileOwner(path), "headquarters");
 assert.equal(fileOwner("brand/yorphives-mark.svg"), "shared");
});
test("wrong, ambiguous and traversal paths fail closed", () => {
 assert.equal(requireOwner("headquarters", ["admin/index.html"]), true);
 assert.throws(() => requireOwner("headquarters", ["free-tools/index.html"]), /Wrong project/);
 assert.throws(() => requireOwner("website", ["admin/index.html"]), /Wrong project/);
 assert.throws(() => requireOwner("headquarters", ["brand/yorphives-mark.svg"]), /Wrong project/);
 assert.throws(() => requireOwner("headquarters", ["../website/index.html"]), /Wrong project/);
 assert.equal(requireOwner("headquarters", ["brand/yorphives-mark.svg"], true), true);
});