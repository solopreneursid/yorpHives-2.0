(function(){
'use strict';
const $=id=>document.getElementById(id);
function renderRows(id,records,toRow,empty){
 const target=$(id);target.replaceChildren();
 if(!Array.isArray(records)||records.length===0){
  target.textContent=empty;return;
 }
 for(const data of records){
  const item=document.createElement('div');item.className='row';
  const label=document.createElement('strong');
  label.textContent=String(toRow(data).label||'Unlabeled entry').slice(0,200);
  const note=document.createElement('small');
  note.textContent=String(toRow(data).detail||'').slice(0,400);
  item.append(label,note);target.append(item);
 }
}
async function load(){
 try{
  const res=await fetch('/api/admin/monitor-only-v3',{
   method:'GET',redirect:'manual',credentials:'same-origin',
   headers:{accept:'application/json'},cache:'no-store',
   signal:AbortSignal.timeout(9000)
  });
  if(res.type==='opaqueredirect'||res.status!==200||
     !res.headers.get('content-type')?.includes('application/json'))
    throw Error('Isolated Headquarters monitoring is not verified. No production changes were attempted.');
  const data=await res.json();
  if(data.schema_version!==1||data.monitor_only!==true||
     data.source!=='isolated_monitor_schema'||data.environment!=='isolated_preview_only')
    throw Error('Monitoring-only runtime contract is not ready.');
  $('readiness').textContent='Authenticated, isolated staging evidence is available. These are synthetic records, NOT a live production certificate.';
  for(const [id,name] of [['targets-count','targets'],['observations-count','observations'],
    ['signals-count','signals'],['runs-count','observation_runs']])
   $(id).textContent=String(data.counts?.[name]??'—');
  renderRows('target-list',data.targets,x=>({
   label:x.label,detail:x.kind+' · '+(x.enabled?'tracked':'paused')
  }),'No monitored targets in staging.');
  renderRows('signal-list',data.signals,x=>({
   label:x.title,detail:x.category+' · priority '+x.priority+' · '+x.state
  }),'No verified business or risk signals.');
  renderRows('observation-list',data.observations,x=>({
   label:x.target_id+' · '+x.status,detail:x.evidence_kind+' · '+x.observed_at+' · '+(x.note||'')
  }),'No first-party evidence yet.');
 }catch(err){
  const n=$('readiness');n.classList.add('warn');
  n.textContent='Monitoring-only preview is unavailable or not independently verified. The live Headquarters has not been changed.';
 }
}
load();
})();
