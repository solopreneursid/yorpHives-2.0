/** Versioned, read-only Website ↔ Headquarters catalogue adapter.
 *
 * The public website owns the actual catalogue. HQ consumes this public
 * metadata; it never imports the HQ experiment catalogue into the website.
 * Return only validated slugs/fingerprint for pair comparison, never private
 * response bodies. This does NOT test individual tool functionality.
 */
import {createHash} from 'node:crypto';

export const WEBSITE_CATALOGUE_VERSION = 1;
const JSON_TYPE = /^(application\/json|[a-z0-9.+-]+\/[a-z0-9.+-]+\+json)(?:\s*;|\s*$)/i;
const failure = reason => ({ok:false,reason});

export function inspectCatalogueResponse(targetKind, mediaType, body) {
  if (!['manifest','catalogue'].includes(targetKind) ||
      typeof mediaType !== 'string' || !JSON_TYPE.test(mediaType) ||
      typeof body !== 'string' || Buffer.byteLength(body,'utf8') > 131072)
    return failure('catalogue_contract_invalid');
  let parsed;
  try { parsed = JSON.parse(body); }
  catch { return failure('catalogue_contract_invalid'); }
  if (parsed === null || typeof parsed !== 'object') return failure('catalogue_contract_invalid');
  if (!Array.isArray(parsed) && parsed.schema_version !== undefined &&
      parsed.schema_version !== WEBSITE_CATALOGUE_VERSION)
    return failure('catalogue_contract_incompatible');
  // Legacy structured API: {data:[...]}. Versioned source-owned contract:
  // {schema_version:1,source:"yorphives-website",tools:[...]}.
  // Manifest also accepts a bare, bounded array for backward compatibility.
  const records = targetKind === 'manifest'
    ? (Array.isArray(parsed) ? parsed : parsed.tools)
    : (Array.isArray(parsed.data) ? parsed.data : parsed.tools);
  if (!Array.isArray(records) || records.length > 200)
    return failure('catalogue_contract_invalid');
  if (records.length === 0) return failure('catalogue_contract_unverified');
  if (!Array.isArray(parsed) && parsed.schema_version === WEBSITE_CATALOGUE_VERSION &&
      parsed.source !== 'yorphives-website')
    return failure('catalogue_contract_invalid');
  const slugs = new Set();
  for (const item of records) {
    if (!item || typeof item !== 'object' || Array.isArray(item) ||
        typeof item.slug !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item.slug) ||
        item.slug.length > 90 || slugs.has(item.slug))
      return failure('catalogue_contract_invalid');
    slugs.add(item.slug);
  }
  if (!Array.isArray(parsed) && Number.isInteger(parsed.count) &&
      parsed.count !== slugs.size) return failure('catalogue_contract_invalid');
  const fingerprint=createHash('sha256').update([...slugs].sort().join('\n'),'utf8').digest('hex');
  return {ok:true,reason:'catalogue_contract_verified',fingerprint,
    count:slugs.size,contract_version:Array.isArray(parsed)?null:(parsed.schema_version??null)};
}

export function reconcileCatalogueObservations(api,manifest) {
  if (!api || !manifest || api.state!=='reachable' || manifest.state!=='reachable' ||
      api.reason!=='catalogue_contract_verified' ||
      manifest.reason!=='catalogue_contract_verified') return false;
  if (typeof api.fingerprint!=='string' || typeof manifest.fingerprint!=='string' ||
      !/^[0-9a-f]{64}$/.test(api.fingerprint) || !/^[0-9a-f]{64}$/.test(manifest.fingerprint))
    return false;
  return api.fingerprint===manifest.fingerprint;
}
