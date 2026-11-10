const $ = (s, r = document) => r.querySelector(s);
const state = { token: "", principal: null };
const headers = () => ({ Accept: "application/json", Authorization: "Bearer " + state.token });
const money = (minor, currency = "INR") => new Intl.NumberFormat(undefined, { style: "currency", currency }).format((minor || 0) / 100);
function node(tag, text, className) { const el = document.createElement(tag); if (text !== undefined) el.textContent = text; if (className) el.className = className; return el; }
async function api(path, options = {}) {
  const response = await fetch(path, { ...options, headers: { ...headers(), ...(options.headers || {}) } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) { const error = new Error(body.error?.message || "The request failed."); error.code = body.error?.code; error.status = response.status; throw error; }
  return body.data;
}
function empty(target, message) { target.replaceChildren(node("p", message, "empty")); }
function renderRows(target, items, renderer, fallback) { target.replaceChildren(); if (!items.length) return empty(target, fallback); items.forEach(item => target.append(renderer(item))); }
function renderKey(key) {
  const row = node("div", undefined, "row"), left = node("div"), title = node("strong", key.label), meta = node("small", key.prefix + " · " + key.scopes.join(", ") + (key.last_used_at ? " · used " + new Date(key.last_used_at).toLocaleDateString() : " · never used"));
  left.append(title, meta); const right = node("div"); const badge = node("span", key.revoked_at ? "REVOKED" : "ACTIVE", "tag" + (key.revoked_at ? " revoked" : "")); right.append(badge);
  if (!key.revoked_at && key.id !== state.currentKeyId) { const revoke = node("button", "Revoke", "quiet danger"); revoke.type = "button"; revoke.addEventListener("click", async () => { if (!confirm("Revoke this API key immediately? Any integration using it will stop working.")) return; try { await api("/api/v1/identity/keys?id=" + encodeURIComponent(key.id), { method: "DELETE" }); await loadDashboard(); } catch (e) { alert(e.message); } }); right.append(revoke); }
  row.append(left, right); return row;
}
async function loadDashboard() {
  const [me, credits, usage, keys, orders] = await Promise.all([
    api("/api/v1/identity/me"), api("/api/v1/commerce/credits"), api("/api/v1/usage?limit=50"),
    api("/api/v1/identity/keys"), api("/api/v1/commerce/orders?limit=50").catch(e => e.code === "INSUFFICIENT_SCOPE" ? { orders: [], unavailable: true } : Promise.reject(e))
  ]);
  state.principal = me;
  $("#welcome").textContent = "Welcome, " + me.display_name;
  $("#principal-meta").textContent = me.kind + " · " + me.id;
  $("#credit-balance").textContent = Number(credits.balance).toLocaleString();
  $("#execution-count").textContent = Number(usage.totals.executions).toLocaleString();
  $("#execution-cost").textContent = "Recorded charges: " + money(usage.totals.amount_minor);
  const active = keys.keys.filter(k => !k.revoked_at); $("#key-count").textContent = active.length.toLocaleString();
  renderRows($("#keys-list"), keys.keys, renderKey, "No API credentials found.");
  renderRows($("#credit-history"), credits.entries, entry => { const row=node("div",undefined,"row"), left=node("div"), title=node("strong",entry.description), meta=node("small",entry.entry_type+" · "+new Date(entry.created_at).toLocaleString()); left.append(title,meta); row.append(left,node("strong",(entry.delta_credits>0?"+":"")+entry.delta_credits.toLocaleString())); return row; }, "No credit activity yet.");
  renderRows($("#orders-list"), orders.orders, order => { const row=node("div",undefined,"row"), left=node("div"); left.append(node("strong",order.pack_id+" · "+order.credits+" credits"),node("small",new Date(order.created_at).toLocaleDateString()+" · "+order.provider)); row.append(left,node("span",order.status.toUpperCase()+" · "+money(order.amount_minor,order.currency),"tag")); return row; }, orders.unavailable ? "Your credential does not include purchase-history access." : "No purchases yet.");
  renderRows($("#usage-rows"), usage.events, event => { const tr=node("tr"), values=[event.capability_id,event.outcome,event.units,event.amount_minor ? money(event.amount_minor,event.currency || "INR") : "—",new Date(event.created_at).toLocaleString()]; values.forEach(v=>tr.append(node("td",String(v)))); return tr; }, "No executions recorded yet.");
  $("#dashboard").hidden=false; $("#connect-panel").hidden=true;
}
$("#connect-form").addEventListener("submit", async event => {
  event.preventDefault(); const token=$("#api-key").value.trim(); const status=$("#connect-status"); status.textContent="Verifying credential…";
  if (!/^yh_[A-Za-z0-9_-]{24,}$/.test(token)) { status.textContent="That does not look like a YorpHives API key."; return; }
  state.token=token;
  try { await loadDashboard(); $("#api-key").value=""; status.textContent=""; }
  catch (error) { state.token=""; status.textContent=error.message + (error.code ? " ["+error.code+"]" : ""); }
});
$("#disconnect").addEventListener("click", () => { state.token=""; state.principal=null; state.currentKeyId=null; $("#dashboard").hidden=true; $("#connect-panel").hidden=false; $("#connect-status").textContent="Disconnected. Your credential was cleared from memory."; });
$("#new-key").addEventListener("click", async () => {
  const label=prompt("Name this API key (for example: Production integration):"); if (!label) return;
  const scopes=state.principal.scopes.filter(s=>["identity:read","capability:execute","usage:read","credits:read","keys:manage","commerce:checkout","commerce:orders:read","capabilities:grant"].includes(s));
  try {
    const result=await api("/api/v1/identity/keys",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({label:label.trim(),scopes})});
    state.currentKeyId=result.id; $("#secret-value").textContent=result.secret; $("#new-secret").hidden=false; await loadDashboard();
  } catch(e) { alert(e.message); }
});
$("#copy-secret").addEventListener("click", async () => { try { await navigator.clipboard.writeText($("#secret-value").textContent); $("#copy-secret").textContent="Copied"; } catch { alert("Clipboard access unavailable. Select and copy the key manually."); } });
