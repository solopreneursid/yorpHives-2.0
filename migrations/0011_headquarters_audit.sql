CREATE TRIGGER IF NOT EXISTS headquarters_mission_created
AFTER INSERT ON agent_jobs WHEN NEW.job_type = 'owner_mission'
BEGIN
  INSERT INTO agent_job_events (event_id,job_id,actor_type,actor_id,event_type,details_json)
  VALUES (lower(hex(randomblob(16))),NEW.job_id,'owner',NEW.created_by,'mission_created',json_object('status',NEW.status,'priority',NEW.priority));
END;
CREATE TRIGGER IF NOT EXISTS headquarters_mission_cancelled
AFTER UPDATE OF status ON agent_jobs WHEN NEW.job_type = 'owner_mission' AND NEW.status = 'cancelled' AND OLD.status != NEW.status
BEGIN
  INSERT INTO agent_job_events (event_id,job_id,actor_type,actor_id,event_type,details_json)
  VALUES (lower(hex(randomblob(16))),NEW.job_id,'owner',NEW.created_by,'mission_cancelled',json_object('from',OLD.status,'to',NEW.status));
END;
