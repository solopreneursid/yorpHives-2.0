const SNAPSHOT_TARGETS = [
  { url: "https://yorphives.com/", label: "Production homepage" },
  { url: "https://yorphives.com/free-tools/", label: "Free Tools directory" },
  { url: "https://yorphives.com/api/v1/free-tools", label: "Free Tools discovery API" },
  { url: "https://yorphives.com/llms.txt", label: "Agent discovery document" }
];
const SNAPSHOT_HOSTS = new Set(["yorphives.com"]);

async function readBounded(response, limit = 512 * 1024) {
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit) {
        await reader.cancel();
        throw new Error("Response exceeded the 512 KiB snapshot limit.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

async function digest(bytes) {
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)].map(value => value.toString(16).padStart(2, "0")).join("");
}

export async function captureProductionSnapshots(db) {
  const events = [];
  const checkedAt = new Date().toISOString();
  for (const target of SNAPSHOT_TARGETS) {
    const url = new URL(target.url);
    if (url.protocol !== "https:" || !SNAPSHOT_HOSTS.has(url.hostname)) continue;
    try {
      const response = await fetch(url.toString(), {
        method: "GET",
        headers: { "user-agent": "YorpHives-ChangeMonitor/1.0" },
        redirect: "manual",
        signal: AbortSignal.timeout(10000)
      });
      if (response.status !== 200) {
        await response.body?.cancel();
        events.push({ url: target.url, ok: false, reason: "HTTP " + response.status });
        continue;
      }
      const bytes = await readBounded(response);
      const currentHash = await digest(bytes);
      const previous = await db.prepare(
        "SELECT content_hash, last_changed_at FROM admin_page_snapshots WHERE url = ?"
      ).bind(target.url).first();
      let lastChangedAt = previous?.last_changed_at || checkedAt;
      if (previous && previous.content_hash !== currentHash) {
        lastChangedAt = checkedAt;
        const details = "SHA-256 changed from " + previous.content_hash.slice(0, 12) +
          " to " + currentHash.slice(0, 12) + "; response size " + bytes.byteLength + " bytes.";
        await db.prepare(`
          INSERT INTO admin_change_events (id, url, previous_hash, current_hash, detected_at, title, details)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).bind(
          crypto.randomUUID(), target.url, previous.content_hash, currentHash, checkedAt,
          target.label + " changed", details
        ).run();
        events.push({ url: target.url, ok: true, changed: true });
      } else {
        events.push({ url: target.url, ok: true, changed: false });
      }
      await db.prepare(`
        INSERT INTO admin_page_snapshots (url, content_hash, byte_length, checked_at, last_changed_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(url) DO UPDATE SET content_hash = excluded.content_hash,
          byte_length = excluded.byte_length, checked_at = excluded.checked_at,
          last_changed_at = excluded.last_changed_at
      `).bind(target.url, currentHash, bytes.byteLength, checkedAt, lastChangedAt).run();
    } catch (error) {
      events.push({ url: target.url, ok: false, reason: error instanceof Error ? error.message : "Snapshot failed" });
    }
  }
  return { checked_at: checkedAt, targets: events.length, changed: events.filter(event => event.changed).length, results: events };
}
