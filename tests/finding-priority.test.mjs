import test from 'node:test';
import assert from 'node:assert/strict';
import { prioritizeFindingRecords,FINDING_FRESHNESS_HOURS } from '../functions/_lib/finding-priority.js';
const now=new Date('2026-11-14T12:00:00.000Z');
const finding=(severity,time,id,source_type='monitor')=>({id,title:'Finding '+id,
 severity,last_verified:time,source_type,status:'open'});

test('severity remains authoritative while recent verification breaks ties',()=>{
 const result=prioritizeFindingRecords([
  finding('medium','2026-11-14T11:59:00.000Z','medium'),
  finding('critical','2026-11-14T00:00:00.000Z','critical-old'),
  finding('high','2026-11-14T11:50:00.000Z','high'),
  finding('critical','2026-11-14T11:00:00.000Z','critical-new'),
 ],now);
 assert.deepEqual(result.map(x=>x.id),['critical-new','critical-old','high','medium']);
 assert.equal(result[0].triage_level,'urgent');
 assert.equal(result[1].evidence_state,'stale');
 assert.equal(result[1].evidence_age_hours,12);
 assert.equal(result[3].triage_level,'review');
 assert.equal(FINDING_FRESHNESS_HOURS,8);
});

test('missing, future, invalid or offset dates are explicitly unverified',()=>{
 const rows=['','invalid','2026-11-14T15:00:00.000Z','2026-11-14T10:00:00+00:00']
  .map((time,index)=>finding('high',time,String(index)));
 const out=prioritizeFindingRecords(rows,now);
 assert.ok(out.every(x=>x.evidence_state==='unverified'&&x.evidence_age_hours===null));
});

test('no source records or stored severity are mutated by prioritization',()=>{
 const original=[finding('low','2026-11-14T10:00:00.000Z','a','asset')];
 const copy=JSON.parse(JSON.stringify(original));
 const r=prioritizeFindingRecords(original,now);
 assert.deepEqual(original,copy);
 assert.equal(r[0].source_type,'asset');
 assert.equal(r[0].severity,'low');
 assert.equal(r[0].evidence_state,'recent');
});
