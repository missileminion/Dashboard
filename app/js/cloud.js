// Cross-device sync for the Home links and the Health cache, through the same private GitHub repo as the gym log.
// Both are last-writer-wins on a timestamp: whichever device changed or synced most recently is the copy everyone adopts.
import { gh, ghRead, ghWrite } from "./ghstore.js";
import { allDays, putDays, getMeta, setMeta } from "./db.js";
import { SCHEMA } from "./sync.js";

const ls = { get: k => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch {} } };
const retry = async fn => { try { return await fn(); } catch (e) { if (e.status === 409 || e.status === 422) return fn(); throw e; } };

// ---- Home links: one small JSON file ----
const HOME = "home-links.json", HSHA = "home.sha";
export const homeStamp = () => +ls.get("home.t") || 0;
export const homeTouch = () => ls.set("home.t", String(Date.now()));
export async function homePull(apply) {   // apply(doc) when the cloud copy is newer; resolves true if it was applied
  if (!gh.on) return false;
  const f = await ghRead(HOME); if (!f) return false; ls.set(HSHA, f.sha);
  let d; try { d = JSON.parse(f.text); } catch { return false; }
  if ((d.t || 0) <= homeStamp()) return false; ls.set("home.t", String(d.t)); apply(d); return true;
}
let timer = 0;
export function homePush(read) {   // debounced; read() returns {extra, hide, cats}
  if (!gh.on) return; clearTimeout(timer);
  timer = setTimeout(() => retry(async () => {
    const f = await ghRead(HOME), doc = JSON.stringify({ version: 1, t: homeStamp(), ...read() }, null, 1);
    await ghWrite(HOME, doc, f?.sha, "Update home links");
  }).catch(e => console.warn("home sync", e)), 800);
}

// ---- Health: the cached days, gzipped, so the file stays small ----
const HEALTH = "health-cache.b64";
const toB64 = async text => { const s = new Blob([text]).stream().pipeThrough(new CompressionStream("gzip")); const u = new Uint8Array(await new Response(s).arrayBuffer()); let b = ""; for (let i = 0; i < u.length; i += 8192) b += String.fromCharCode(...u.subarray(i, i + 8192)); return btoa(b); };
const fromB64 = async b64 => { const u = Uint8Array.from(atob(b64.trim()), c => c.charCodeAt(0)); return new Response(new Blob([u]).stream().pipeThrough(new DecompressionStream("gzip"))).text(); };
export async function healthPush() {   // after this device synced with the Health API
  if (!gh.on) return;
  const at = await getMeta("lastSyncedAt"); if (!at) return;
  const doc = JSON.stringify({ version: 1, schema: SCHEMA, at, device: await getMeta("device"), lastSyncDate: await getMeta("lastSyncDate"), days: await allDays() });
  const text = await toB64(doc);
  await retry(async () => { const f = await ghRead(HEALTH); await ghWrite(HEALTH, text, f?.sha, "Update health cache"); });
}
export async function healthPull() {   // true when this device took a newer copy
  if (!gh.on) return false;
  const f = await ghRead(HEALTH); if (!f) return false;
  const d = JSON.parse(await fromB64(f.text));
  if (d.schema !== SCHEMA || !Array.isArray(d.days)) return false;
  if (d.at <= ((await getMeta("lastSyncedAt")) || 0)) return false;
  await putDays(d.days); await setMeta("schema", SCHEMA); await setMeta("lastSyncedAt", d.at);
  if (d.device) await setMeta("device", d.device); if (d.lastSyncDate) await setMeta("lastSyncDate", d.lastSyncDate);
  return true;
}
