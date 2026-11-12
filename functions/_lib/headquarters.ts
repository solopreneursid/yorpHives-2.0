import { adminJson, type AdminD1Database } from "./admin-auth";
export interface Department { department_id: string; name: string; mission: string; }
export interface Specialist { agent_id: string; display_name: string; department_id: string; description: string; status: string; enabled: number; autonomy_level: string; }
export interface Mission { job_id: string; title: string; request_summary: string; status: string; priority: string; agent_id: string | null; created_at: string; updated_at: string; started_at: string | null; completed_at: string | null; result_json: string | null; evidence_json: string; }
export interface MissionEvent { event_id: string; job_id: string; actor_id: string; event_type: string; details_json: string; created_at: string; }
export interface HeadquartersSnapshot { departments: Department[]; specialists: Specialist[]; missions: Mission[]; events: MissionEvent[]; generated_at: string; execution: string; engine_available: boolean; }
export interface CreateMissionRequest { job_id: string; title: string; request_summary: string; agent_id: string; priority: string; }
export interface CancelMissionRequest { job_id: string; expected_updated_at: string; action: "cancel"; }
export interface MissionMutationResponse { success: boolean; job_id: string; status: string; replayed?: boolean; }
export const missionColumns = "job_id,title,request_summary,status,priority,agent_id,created_at,updated_at,started_at,completed_at,result_json,evidence_json";
export const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function validMission(value: unknown): value is CreateMissionRequest {
  if (!value || typeof value !== "object") return false;
  const p = value as Record<string, unknown>;
  return typeof p.job_id === "string" && uuidPattern.test(p.job_id)
    && typeof p.title === "string" && p.title.trim().length >= 3 && p.title.length <= 160
    && typeof p.request_summary === "string" && p.request_summary.trim().length >= 10 && p.request_summary.length <= 4000
    && typeof p.agent_id === "string" && /^[a-z-]{3,64}$/.test(p.agent_id)
    && typeof p.priority === "string" && ["low", "normal", "high", "urgent"].includes(p.priority);
}
export async function readBoundedJson(request: Request): Promise<unknown> {
  if (!request.body) throw new Error("A JSON body is required.");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 24000) { await reader.cancel(); throw new Error("Request exceeds 24 KB."); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return JSON.parse(new TextDecoder().decode(bytes));
}
export function mutationGuard(request: Request): Response | null {
  if (request.headers.get("origin") !== new URL(request.url).origin) return adminJson({ error: { message: "A same-origin owner request is required." } }, 403);
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") return adminJson({ error: { message: "Use application/json." } }, 415);
  return null;
}
export async function headquartersSnapshot(db: AdminD1Database, engineAvailable = false): Promise<HeadquartersSnapshot> {
  const [departments, specialists, missions, events] = await Promise.all([
    db.prepare("SELECT department_id,name,mission FROM agent_departments ORDER BY sort_order").all<Department>(),
    db.prepare("SELECT agent_id,display_name,department_id,description,status,enabled,autonomy_level FROM agent_registry ORDER BY display_name").all<Specialist>(),
    db.prepare(`SELECT ${missionColumns} FROM agent_jobs ORDER BY created_at DESC LIMIT 100`).all<Mission>(),
    db.prepare("SELECT event_id,job_id,actor_id,event_type,details_json,created_at FROM agent_job_events ORDER BY created_at DESC LIMIT 50").all<MissionEvent>()
  ]);
  return { departments: departments.results, specialists: specialists.results, missions: missions.results, events: events.results, generated_at: new Date().toISOString(), engine_available: engineAvailable, execution: engineAvailable ? "AI recommendation briefs available for enabled specialists. Outputs are unverified until independently checked; no production or financial actions are performed." : "Mission storage is available. This deployment has no private AI mission engine binding; execution is disabled." };
}
export function headquartersResponse(request: Request, snapshot: HeadquartersSnapshot): Response {
  const format = new URL(request.url).searchParams.get("format");
  const markdown = format === "markdown" || (!format && request.headers.get("accept")?.includes("text/markdown"));
  if (!markdown) {
    const response = adminJson(snapshot);
    response.headers.set("vary", "Accept");
    return response;
  }
  const clean = (text: string) => text.replace(/[\r\n]/g, " ").replace(/[\\`*_{}\[\]<>#|]/g, "\\$&");
  const body = ["# YorpHives Headquarters", "", snapshot.execution, "", "## Departments", ...snapshot.departments.map(d => `- ${clean(d.name)}: ${clean(d.mission)}`), "", "## Specialists", ...snapshot.specialists.map(a => `- ${clean(a.display_name)}: ${a.status}; ${a.enabled ? "enabled" : "disabled"}`), "", "## Missions (latest 100)", ...snapshot.missions.map(j => `- ${clean(j.title)} — ${j.status}, ${j.priority}\n  ${clean(j.request_summary)}`), "", `Generated: ${snapshot.generated_at}`].join("\n");
  return new Response(body, { headers: { "content-type": "text/markdown; charset=utf-8", "cache-control": "no-store", vary: "Accept", "x-content-type-options": "nosniff" } });
}
