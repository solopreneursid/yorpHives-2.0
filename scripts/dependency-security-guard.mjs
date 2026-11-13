/** First-party, offline policy checks before online npm advisories are fetched.
 * This does not replace npm audit, Retire.js or independent QA.
 */
import {readFile} from "node:fs/promises";
import assert from "node:assert/strict";
import {fileURLToPath} from "node:url";

export function validateDependencyManifest(pkg) {
 assert.equal(pkg.private,true,"A public-publishable npm package is not allowed.");
 assert.equal(pkg.type,"module","Use explicit ESM tooling.");
 const dependencies={...(pkg.dependencies||{}),...(pkg.devDependencies||{})};
 const unpinned=[];
 for(const [name,version] of Object.entries(dependencies)) {
  const safeName=/^(?:@[-a-z0-9_.]+\/)?[-a-z0-9_.]+$/i.test(name);
  const pinned=typeof version==="string"&&
   /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9a-z.-]+)?$/i.test(version);
  if(!safeName||!pinned)unpinned.push(name);
 }
 if(unpinned.length)throw Error("Unpinned, URL or otherwise unsafe package specs: "+unpinned.join(", "));
 for(const [name,command] of Object.entries(pkg.scripts||{})) {
  if(/^(preinstall|install|postinstall|prepare|prepublish|prepublishOnly)$/.test(name))
   throw Error("Repository package lifecycle scripts may execute during install: "+name);
  if(typeof command!=="string")throw Error("Invalid package script "+name);
 }
 return {packages:Object.keys(dependencies).length,manifest_private:true,pinned:true};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const pkg=JSON.parse(await readFile(new URL("../package.json",import.meta.url),"utf8"));
 console.log(JSON.stringify(validateDependencyManifest(pkg)));
}
