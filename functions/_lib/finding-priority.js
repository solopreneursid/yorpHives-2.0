/** Evidence-first, deterministic priority for the founder's issue Inbox.
 * Does not change recorded severity or issue status. This is triage metadata.
 */
const ORDER = Object.freeze({critical:0,high:1,medium:2,low:3,info:4});
export const FINDING_FRESHNESS_HOURS = 8;

export function prioritizeFindingRecords(records, now = new Date()) {
  if (!Array.isArray(records)) throw Error("Invalid finding records");
  const time = now.getTime();
  if (!Number.isFinite(time)) throw Error("Invalid observation time");
  return records.map((item,index) => {
    const parsed = typeof item.last_verified === 'string' &&
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(item.last_verified)
      ? Date.parse(item.last_verified) : NaN;
    const valid = Number.isFinite(parsed) && parsed <= time;
    const age = valid ? Math.max(0,time-parsed) : null;
    const evidence_state = age === null ? 'unverified' :
      age <= FINDING_FRESHNESS_HOURS*3600000 ? 'recent' : 'stale';
    const severityOrder = ORDER[item.severity] ?? 5;
    return {...item,evidence_state,
      evidence_age_hours: age === null ? null : Math.floor(age/3600000),
      triage_level: severityOrder < 2 ? 'urgent' : 'review',
      priority_rank: severityOrder,
      original_index:index};
  }).sort((a,b) =>
    a.priority_rank - b.priority_rank ||
    ({recent:0,stale:1,unverified:2}[a.evidence_state] -
      {recent:0,stale:1,unverified:2}[b.evidence_state]) ||
    (Number.isFinite(Date.parse(b.last_verified)) ? Date.parse(b.last_verified) : 0) -
      (Number.isFinite(Date.parse(a.last_verified)) ? Date.parse(a.last_verified) : 0) ||
    a.original_index - b.original_index
  ).map(({original_index,...item}) => item);
}
