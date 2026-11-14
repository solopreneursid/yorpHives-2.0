import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
const schema=readFileSync(new URL('../staging/monitor-only-schema-v1.sql',import.meta.url),'utf8');
const load=()=>{
 const db=new DatabaseSync(':memory:');
 db.exec(schema);
 db.exec('PRAGMA foreign_keys = ON');
 return db;
};
const tables = db=>db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(x=>x.name);

test('preview schema contains ONLY monitor-owned evidence tables; no workflows, OTP, repair or payment tables',()=>{
 const db=load();
 try{
  assert.deepEqual(tables(db),[
   'monitor_observation_runs','monitor_observations',
   'monitor_schema_versions','monitor_signals','monitor_targets'
  ]);
  assert.equal(db.prepare('SELECT purpose FROM monitor_schema_versions WHERE version=1').get().purpose,'monitor-only');
  assert.doesNotMatch(tables(db).join(','),/agent|repair|grant|permission|deploy|release|otp|payment|secret|user/);
  assert.equal(db.prepare('PRAGMA foreign_keys').get().foreign_keys,1);
 }finally{db.close();}
});
test('schema is idempotent, deterministic and rejects duplicate observations',()=>{
 const db=load();
 try{
  db.exec(schema);
  assert.equal(tables(db).length,5);
  db.prepare('INSERT INTO monitor_targets (id,kind,label,public_url) VALUES (?,?,?,?)').run(
   'studio','website','File Studio','https://yorphives.com/free-tools/file-studio/');
  db.prepare('INSERT INTO monitor_observation_runs (id,started_at,collector,status) VALUES (?,?,?,?)').run(
   'run-synthetic-1','2026-11-14T05:00:00Z','external-watchdog','completed');
  const insert=db.prepare('INSERT INTO monitor_observations (id,run_id,target_id,observed_at,status,evidence_kind,evidence_sha256) VALUES (?,?,?,?,?,?,?)');
  const args=['event-synthetic-1','run-synthetic-1','studio','2026-11-14T05:01:00Z','verified','http-status','a'.repeat(64)];
  insert.run(...args);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM monitor_observations').get().n,1);
  assert.throws(()=>insert.run('event-synthetic-2',...args.slice(1)),/UNIQUE/);
  assert.throws(()=>insert.run('event-synthetic-3','missing','studio',...args.slice(3)),/FOREIGN KEY/);
  assert.throws(()=>db.prepare('DELETE FROM monitor_targets WHERE id=?').run('studio'),/FOREIGN KEY/);
 }finally{db.close();}
});
test('signals retain founder recommendations as evidence, never execute them',()=>{
 const db=load();
 try{
  db.prepare('INSERT INTO monitor_signals (id,category,priority,title,evidence_ref,observed_at,founder_action) VALUES (?,?,?,?,?,?,?)').run(
    'signal-test-1','revenue',3,'Conversion trend needs investigation','analytics:staging-only',
    '2026-11-14T05:01:00Z','Review the evidence and decide independently');
  assert.equal(db.prepare('SELECT state FROM monitor_signals WHERE id=?').get('signal-test-1').state,'unreviewed');
  assert.throws(()=>db.prepare('INSERT INTO monitor_signals (id,category,priority,title,evidence_ref,observed_at) VALUES (?,?,?,?,?,?)').run(
    'signal-test-2','revenue',10,'Invalid priority','test:a','2026-11-14T05:01:00Z'),/CHECK/);
 }finally{db.close();}
});
