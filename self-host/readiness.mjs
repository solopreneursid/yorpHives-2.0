/** Dependency readiness for an independent supervisor. No private records leave this endpoint. */
export async function assessRuntimeReadiness({ db, observations, now = Date.now() }) {
  let database = 'unavailable';
  try {
    const row = await db.prepare('SELECT COUNT(*) AS count FROM self_host_migrations').first();
    if (row?.count > 0) database = 'available';
  } catch { /* Report dependency failure without exposing database details. */ }
  const observation = observations?.status();
  let monitoring = 'disabled';
  if (observation) {
    const checkedAt = Date.parse(observation.checked_at);
    const age = now - checkedAt;
    const fresh = Number.isFinite(age) && age >= 0 && age <= observation.interval_ms * 2;
    monitoring = !observation.stopped && observation.status === 'completed' && fresh ? 'available' : 'unavailable';
  }
  return {
    service: 'YorpHives Headquarters',
    status: database === 'available' && monitoring === 'available' ? 'ready' : 'degraded',
    database,
    monitoring
  };
}
