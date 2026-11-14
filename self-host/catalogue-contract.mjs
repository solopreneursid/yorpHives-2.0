/** Deterministic, read-only catalogue contracts. They verify the discovery
 * response contains a usable list, NOT individual web-app conversions/workflows.
 * Only fixed public GET endpoints are eligible; no user data or requests.
 */
export function inspectCatalogueResponse(targetKind, mediaType, body) {
  if (typeof mediaType !== 'string' ||
      !/^(application\/json|[a-z0-9.+-]+\/[a-z0-9.+-]+\+json)(?:\s*;|\s*$)/i.test(mediaType) ||
      typeof body !== 'string') return {ok:false,reason:'catalogue_contract_invalid'};
  let parsed;
  try { parsed = JSON.parse(body); } catch { return {ok:false,reason:'catalogue_contract_invalid'}; }
  if (parsed === null || typeof parsed !== 'object') return {ok:false,reason:'catalogue_contract_invalid'};
  const records = targetKind === 'manifest'
    ? (Array.isArray(parsed) ? parsed : parsed.tools)
    : (Array.isArray(parsed.data) ? parsed.data : parsed.tools);
  if (!Array.isArray(records) || records.length > 200)
    return {ok:false,reason:'catalogue_contract_invalid'};
  if (records.length === 0)
    return {ok:false,reason:'catalogue_contract_unverified'};
  const slugs = new Set();
  for (const item of records) {
    if (!item || typeof item !== 'object' || Array.isArray(item) ||
        typeof item.slug !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item.slug) ||
        item.slug.length > 90 || slugs.has(item.slug)) {
      return {ok:false,reason:'catalogue_contract_invalid'};
    }
    slugs.add(item.slug);
  }
  return {ok:true,reason:'catalogue_contract_verified'};
}
