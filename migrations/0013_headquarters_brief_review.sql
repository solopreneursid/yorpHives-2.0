PRAGMA foreign_keys = ON;

-- Completing a review is only an acknowledgement of the planning brief.
-- Neither this trigger nor the route writes to agent_approvals or release controls.
CREATE TRIGGER IF NOT EXISTS headquarters_brief_reviewed
AFTER UPDATE OF status ON agent_jobs
WHEN NEW.job_type='owner_mission'
  AND OLD.status='awaiting_owner_approval'
  AND NEW.status='completed'
  AND json_extract(NEW.result_json,'$.kind')='recommendation_brief'
BEGIN
  INSERT INTO agent_job_events
    (event_id,job_id,agent_id,actor_type,actor_id,event_type,details_json)
  VALUES (
    lower(hex(randomblob(16))),NEW.job_id,NEW.agent_id,'owner',NEW.created_by,
    'brief_review_acknowledged',
    json_object('from',OLD.status,'to',NEW.status,'verified',0,'release_authorized',0)
  );
END;
