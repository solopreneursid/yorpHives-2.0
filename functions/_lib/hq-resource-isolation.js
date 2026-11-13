/**
 * Verify Cloudflare Pages Headquarters D1 environment isolation from actual
 * provider project metadata. Pure read-only evaluator. Never creates or
 * migrates a database, changes bindings, or enables a production deployment.
 *
 * The PRIVATE Pages project has a canonical "production" configuration. Its
 * preview configuration MUST use a different physical D1 database: a migration
 * in preview must never alter the canonical database.
 */
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const fail=reason=>Object.freeze({
 schema_version:1,target:"headquarters",isolated:false,
 production_deployment_enabled:false,database_migration_allowed:false,
 database_restore_verified:false,reason
});
export function verifyHeadquartersD1Isolation(project){
 if(project?.name!=="yorphives-admin-staging"||
    project?.source?.type!=="github"||
    project?.source?.config?.owner!=="solopreneursid"||
    project?.source?.config?.repo_name!=="yorpHives-2.0"||
    project?.production_branch!=="build/yorphives-admin-reliability"||
    project?.source?.config?.production_branch!=="build/yorphives-admin-reliability")
  return fail("Pages project identity is unverified; database isolation cannot be established.");
 const configs=project?.deployment_configs;
 if(!configs||typeof configs!=="object"||
    !configs.preview||!configs.production)
  return fail("Cloudflare Pages preview and canonical deployment bindings are unavailable.");
 const p=configs.preview.d1_databases?.DB?.id;
 const c=configs.production.d1_databases?.DB?.id;
 if(!UUID.test(String(p||""))||!UUID.test(String(c||"")))
  return fail("Both preview and canonical Headquarters require independently identified D1 DB bindings.");
 if(p.toLowerCase()===c.toLowerCase())
  return fail("Preview and canonical Headquarters share the SAME D1 database. Isolate preview D1 before migrations, live QA or Go Live.");
 // We never publish database identifiers to an untrusted browser.
 return Object.freeze({
  schema_version:1,target:"headquarters",isolated:true,
  preview_and_canonical_d1_distinct:true,
  production_deployment_enabled:false,
  database_migration_allowed:false,
  database_restore_verified:false,
  reason:"D1 bindings differ. Migration, backup/restore and release verification remain separate gates."
 });
}
