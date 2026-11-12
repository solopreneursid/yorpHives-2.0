PRAGMA foreign_keys = ON;

-- Activates only recommendation-level specialists; executable engineering/QA
-- specialists remain disabled until their independent runtimes are verified.
UPDATE agent_registry
SET status='ready',enabled=1,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE agent_id IN (
  'chief-of-staff','security-sentinel','innovation-scout',
  'global-intelligence','product-strategist','growth-operator','revenue-analyst'
) AND status='planned' AND enabled=0 AND autonomy_level='recommend';

CREATE TRIGGER IF NOT EXISTS headquarters_mission_execution_event
AFTER UPDATE OF status ON agent_jobs
WHEN NEW.job_type='owner_mission' AND NEW.status!=OLD.status
  AND NEW.status IN ('queued','running','awaiting_owner_approval','failed')
BEGIN
  INSERT INTO agent_job_events
    (event_id,job_id,agent_id,actor_type,actor_id,event_type,details_json)
  VALUES (
    lower(hex(randomblob(16))),NEW.job_id,NEW.agent_id,
    CASE WHEN NEW.status='queued' THEN 'owner' ELSE 'agent' END,
    CASE WHEN NEW.status='queued' THEN NEW.created_by ELSE 'headquarters-mission-engine' END,
    'mission_'||NEW.status,
    json_object('from',OLD.status,'to',NEW.status)
  );
END;

CREATE INDEX IF NOT EXISTS idx_headquarters_active_missions
ON agent_jobs(job_type,status,created_at DESC);
