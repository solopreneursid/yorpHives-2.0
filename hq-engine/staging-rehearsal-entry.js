/**
 * RETIRED MONITORING-ONLY HEADQUARTERS REHEARSAL.
 * Keep a closed HTTP entrypoint for historical config compatibility.
 * No Worker, AI, Workflow or D1 bindings and no import of the archived
 * mission engine. An accidental deploy cannot dispatch legacy work.
 */
export default {
  async fetch() {
    return new Response("Not found", {
      status: 404,
      headers: {
        "cache-control": "no-store",
        "x-content-type-options": "nosniff"
      }
    });
  }
};
