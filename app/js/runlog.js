// Runs tracked by the Galaxy Watch app, kept like the gym log: the same browser mirror idea and one GitHub file (run-log.json,
// {version, runs, deleted}), merged as a union minus deletions so the phone and the web can both read and write it.
// A run has the shape the dashboard already uses for workouts (start, end, offset, seconds, distanceM, paceSecPerKm, avgHr, kcal)
// plus what the watch adds: id, source "watch", maxHr, hr ([seconds, bpm] samples), route ([lat, lon] points), paceTarget.
// mergedRuns() joins them with the runs that come from Health Connect: a watch run and a band run that start within 3 minutes are
// the same run, and the watch's numbers (with its heart-rate trace and route) win.
import { gh, ghRead, ghWrite, ghMessage } from "./ghstore.js";
import { syncwarn } from "./syncwarn.js";

const KEY = "runlog.mirror", PATH = "run-log.json";
let runs = [], deleted = new Set(), sha = null, saving = false, again = false;
try { const m = JSON.parse(localStorage.getItem(KEY) || "null"); if (m) { runs = m.runs || []; (m.deleted || []).forEach(id => deleted.add(id)); } } catch {}

const persist = () => { try { localStorage.setItem(KEY, JSON.stringify({ runs, deleted: [...deleted] })); } catch {} };
function merge(rem) {
  (rem.deleted || []).forEach(id => deleted.add(id)); const have = new Set(runs.map(r => r.id)); let n = 0;
  (rem.runs || []).forEach(r => { if (!have.has(r.id) && !deleted.has(r.id)) { runs.push(r); n++; } });
  const before = runs.length; runs = runs.filter(r => !deleted.has(r.id)); runs.sort((a, b) => b.start - a.start);
  return n > 0 || runs.length !== before;
}
const behind = rem => runs.some(r => !(rem.runs || []).some(x => x.id === r.id)) || [...deleted].some(id => !(rem.deleted || []).includes(id));

async function push() {
  if (!gh.on) return; if (saving) { again = true; return; } saving = true;
  try {
    for (let i = 0; i < 2; i++) {
      try { sha = await ghWrite(PATH, JSON.stringify({ version: 1, runs, deleted: [...deleted] }), sha, "Update run log"); break; }
      catch (e) { if ((e.status !== 409 && e.status !== 422) || i) throw e; const r = await ghRead(PATH); sha = r?.sha ?? null; if (r) { merge(JSON.parse(r.text)); persist(); } }
    }
  } catch (e) { if (e.status !== 401 && e.status !== 403) syncwarn.broken("gh", "The run log", "health", "The run log is not syncing: " + ghMessage(e)); }
  saving = false; if (again) { again = false; push(); }
}

export const runlog = {
  get runs() { return runs; },
  async pull() {   // newest from GitHub; sends ours if GitHub is missing any
    if (!gh.on) return runs;
    try { const r = await ghRead(PATH); sha = r?.sha ?? null; const rem = r ? JSON.parse(r.text) : { runs: [], deleted: [] }; if (merge(rem)) persist(); if (behind(rem)) push(); } catch {}
    return runs;
  },
  add(list) {   // runs from the watch
    const have = new Set(runs.map(r => r.id)); let n = 0;
    for (const r of list) if (r && r.id && !have.has(r.id) && !deleted.has(r.id)) { runs.push(r); n++; }
    if (n) { runs.sort((a, b) => b.start - a.start); persist(); push(); }
    return n;
  },
  remove(id) { if (!runs.some(r => r.id === id)) return; runs = runs.filter(r => r.id !== id); deleted.add(id); persist(); push(); },
};

// Health Connect runs (from the health cache) joined with the watch's; newest first
export function mergedRuns(hcRuns) {
  const out = hcRuns.map(r => ({ ...r }));
  for (const w of runs) {
    const twin = out.find(r => Math.abs(r.start - w.start) < 180e3);
    const date = new Date(w.start + (w.offset || 0) * 1000).toISOString().slice(0, 10);
    if (twin) Object.assign(twin, { ...w, zones: twin.zones || w.zones, date: twin.date || date });
    else out.push({ ...w, type: "RUNNING", date });
  }
  return out.sort((a, b) => b.start - a.start);
}
