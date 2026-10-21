// Gym log: the weight-wheel set logger (ported from the standalone Gym Log page) inside the dashboard.
// Entries are {id, date, day, exercise, weight (lb), reps, sets}. They are saved to gym-log.json on disk through /api/gymlog,
// with a copy kept in the browser as a backup, exactly like the Stickynote. Every change fires "gymlog:change" so the Gym cards can update.
import { esc, HOSTED } from "./util.js";
import { gh, ghCheck, ghRead, ghWrite, ghMessage } from "./ghstore.js";

const API = "api/gymlog", KEY = "gymlog.mirror", GHPATH = "gym-log.json";
export const PROGRAM = {
  "Legs": [
    ["Hack squat / pendulum squat", "3 × 6–10"], ["Leg extension", "3 × 10–15"], ["Seated leg curl", "3 × 10–12"],
    ["Standing calf raise", "3 × 8–12"], ["Cable crunch", "4 × 10–15"],
    ["Leg press (feet high & wide)", "3 × 8–12"], ["Hip thrust machine", "3 × 8–12"], ["Seated leg curl / 45° back extension", "3 × 10–12"],
    ["Seated calf raise", "3 × 10–15"], ["Machine lateral raise", "5 × 12–15"], ["Hanging leg raise / weighted decline sit-up", "3 × 10–15"]],
  "Pull": [
    ["Lat pulldown", "3 × 8–12"], ["Chest-supported row machine", "3 × 8–10"], ["Single-arm cable pulldown", "2 × 10–12"],
    ["Reverse pec deck", "3 × 12–15"], ["Bayesian cable curl", "3 × 8–12"], ["Smith machine shrug", "3 × 10–15"], ["Cable reverse curl", "2 × 12–15"],
    ["Neutral-grip pulldown / weighted pull-up", "3 × 6–10"], ["Seated cable row", "3 × 8–12"], ["Cable rear-delt fly", "3 × 12–15"],
    ["Machine preacher curl", "3 × 8–12"], ["Cable shrug", "3 × 10–15"], ["Cable wrist curl", "2 × 12–20"]],
  "Push": [
    ["Incline Smith press (30°)", "3 × 6–10"], ["Machine chest press", "3 × 8–10"], ["Cable lateral raise", "5 × 10–15"],
    ["Pec deck", "2 × 12–15"], ["Overhead cable triceps extension", "3 × 10–12"],
    ["Machine shoulder press", "3 × 6–10"], ["Incline machine press", "3 × 8–12"],
    ["Low-to-high cable fly", "2 × 12–15"], ["Cable triceps pushdown", "3 × 10–12"]],
};
export const e1rm = (w, r) => (r <= 1 ? w : w * (1 + r / 30));   // Epley estimate of a one-rep max
const MAX_W = 600, ITEM = 64, pad = n => String(n).padStart(2, "0"), fmt = n => (Number.isInteger(n) ? n : n.toFixed(1));
const nowDate = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const toLocal = s => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const prettyDate = s => toLocal(s).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", year: "numeric" });
const shortDate = s => toLocal(s).toLocaleDateString("en-US", { month: "short", day: "numeric" });
const cmpDesc = (a, b) => b.date.localeCompare(a.date) || b.id - a.id;
const buzz = ms => { try { navigator.vibrate && navigator.vibrate(ms); } catch {} };

export function initGymLog(root, { demo = false } = {}) {
  let entries = [], deleted = new Set(), ghSha = null, step = 5, weight = 45, filter = "All", lastIdx = -1, lastBuzz = 0, curDay = Object.keys(PROGRAM)[0];
  let dirty = false, inflight = false, again = false, timer = null, filePath = "", status = "Loading…", statusBad = false;
  try { const d = localStorage.getItem("gymlog.day"); if (d && PROGRAM[d]) curDay = d; } catch {}

  root.innerHTML = `
  <div class="gl-grid">
    <div class="card gl-card">
      <div class="gl-top"><div class="lbl">Log a set</div><label class="gl-today" id="glTodayBox"><span id="glToday"></span><input id="glDate" type="date" aria-label="Log date"></label></div>
      <div class="gl-days" id="glDays"></div>
      <div class="gl-selwrap"><select id="glEx" aria-label="Exercise"></select></div>
      <div class="gl-info"><span id="glTarget"></span><span id="glLast"></span></div>
      <div class="gl-wheelbox"><div class="gl-wheel" id="glWheel" aria-label="Weight in pounds"></div></div>
      <div class="gl-under"><span class="gl-seglabel">Step</span><div class="gl-seg" id="glStep"><button data-s="2.5" type="button">2.5</button><button data-s="5" type="button" class="on">5</button><button data-s="10" type="button">10</button></div></div>
      <div class="gl-row">
        <div><label class="gl-l">Reps</label><div class="gl-stepper"><button type="button" data-t="glReps" data-d="-1" aria-label="Fewer reps">−</button><input id="glReps" type="number" inputmode="numeric" min="0" value="8"><button type="button" data-t="glReps" data-d="1" aria-label="More reps">+</button></div></div>
        <div><label class="gl-l">Sets</label><div class="gl-stepper"><button type="button" data-t="glSets" data-d="-1" aria-label="Fewer sets">−</button><input id="glSets" type="number" inputmode="numeric" min="1" value="3"><button type="button" data-t="glSets" data-d="1" aria-label="More sets">+</button></div></div>
      </div>
      <button class="gl-save" id="glSave" type="button">Log set</button>
      <div class="basis" id="glStatus" style="margin-top:var(--s2);text-align:center"></div>
      <details class="gl-sync" id="glSync"><summary>GitHub sync</summary><div class="gl-syncbody">
        <div class="basis" id="glSyncInfo"></div>
        <div id="glSyncForm"><input id="glRepo" type="text" placeholder="owner/repo, for example missileminion/dashboard-data" autocomplete="off" spellcheck="false"><input id="glTok" type="password" placeholder="Fine-grained token (kept only in this browser)" autocomplete="off">
          <div class="basis">Create a private repo (add a README), then a token limited to just that repo with Contents: Read and write. Sets then sync between your phone and your Mac.</div></div>
        <div style="display:flex;gap:var(--s2)"><button class="btn" id="glConnect" type="button">Connect</button><button class="btn" id="glDisconnect" type="button" hidden>Disconnect</button></div>
      </div></details>
    </div>
    <div class="card gl-hist">
      <div style="display:flex;align-items:center;gap:var(--s3)"><div class="lbl" style="flex:1">History</div><button class="btn" id="glExport" type="button">Export CSV</button><button class="btn" id="glImport" type="button">Import CSV</button><input id="glFile" type="file" accept=".csv,text/csv" hidden></div>
      <div class="gl-chips" id="glChips"></div><div id="glLog"></div>
    </div>
  </div>`;
  const $$ = id => root.querySelector("#" + id), wheel = $$("glWheel"), exSel = $$("glEx");

  /* ---------- storage: GitHub when connected, else the local file, always with a copy in this browser ---------- */
  const ghPending = () => gh.on && !demo;
  const persistMirror = () => { try { localStorage.setItem(KEY, JSON.stringify({ entries, deleted: [...deleted] })); } catch {} };
  const nowTime = () => new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  const parseRemote = text => { const j = JSON.parse(text || "[]"); return Array.isArray(j) ? { entries: j, deleted: [] } : { entries: j.entries || [], deleted: j.deleted || [] }; };
  function mergeIn(rem) {   // sets are only ever added or deleted, so merging two copies is a union minus the deletions
    rem.deleted.forEach(id => deleted.add(id));
    const have = new Set(entries.map(e => e.id)); let added = 0;
    rem.entries.forEach(e => { if (!have.has(e.id) && !deleted.has(e.id)) { entries.push(e); added++; } });
    const before = entries.length; entries = entries.filter(e => !deleted.has(e.id));
    return added > 0 || entries.length !== before;
  }
  const behind = rem => entries.some(e => !rem.entries.some(r => r.id === e.id)) || [...deleted].some(id => !rem.deleted.includes(id));
  const refreshAll = () => { persistMirror(); onExercise(); render(); dispatchEvent(new CustomEvent("gymlog:change")); };
  function changed() { dirty = true; persistMirror(); setStatus("Saving…"); clearTimeout(timer); timer = setTimeout(flush, 600); dispatchEvent(new CustomEvent("gymlog:change")); }
  async function localWrite() {   // on your Mac the plain file stays up to date too, as a second copy
    if (HOSTED) return;
    try { await fetch(API, { method: "PUT", body: JSON.stringify(entries, null, 1), headers: { "Content-Type": "application/json" } }); } catch {}
  }
  async function ghSave() {
    for (let i = 0; i < 3; i++) {
      try { ghSha = await ghWrite(GHPATH, JSON.stringify({ version: 1, entries, deleted: [...deleted] }, null, 1), ghSha, "Update gym log"); return; }
      catch (e) {
        if (e.status !== 409 && e.status !== 422) throw e;   // the file changed on another device: merge it in and try again
        const rem = await ghRead(GHPATH); ghSha = rem?.sha ?? null; if (rem && mergeIn(parseRemote(rem.text))) refreshAll();
      }
    }
    throw Object.assign(new Error("conflict"), { status: 409 });
  }
  async function flush(keepalive = false) {
    clearTimeout(timer); if (!dirty) return;
    if (inflight) { again = true; return; }
    if (ghPending()) {
      inflight = true; dirty = false;
      try { await ghSave(); setStatus("Saved to GitHub " + nowTime()); localWrite(); }
      catch (e) { dirty = true; setStatus(ghMessage(e) + " Kept in this browser.", true); timer = setTimeout(flush, 15000); }
      inflight = false; if (again) { again = false; flush(); } return;
    }
    if (HOSTED) { dirty = false; return setStatus("Saved in this browser only. Connect GitHub below to sync across devices."); }
    inflight = true; dirty = false;
    try {
      const body = JSON.stringify(entries, null, 1), r = await fetch(API, { method: "PUT", body, keepalive: keepalive === true && body.length < 60000, headers: { "Content-Type": "application/json" } });
      if (!r.ok) throw new Error(r.status);
      setStatus("Saved " + nowTime());
    } catch { dirty = true; setStatus("Not saved to the file (server unreachable). Kept in this browser.", true); timer = setTimeout(flush, 5000); }
    inflight = false; if (again) { again = false; flush(); }
  }
  async function pull(quiet) {   // bring in sets logged on another device
    if (!ghPending() || dirty || inflight) return;
    try {
      const rem = await ghRead(GHPATH); if (!rem) return;
      ghSha = rem.sha; const r = parseRemote(rem.text);
      if (mergeIn(r)) { refreshAll(); localWrite(); }
      if (behind(r)) { dirty = true; flush(); } else if (!quiet) setStatus("Synced with GitHub " + nowTime());
    } catch (e) { if (!quiet) setStatus(ghMessage(e), true); }
  }
  function setStatus(s, bad = false) { status = s; statusBad = bad; const el = $$("glStatus"); el.textContent = s + (!ghPending() && filePath ? ` · ${filePath.replace(/^\/Users\/[^/]+/, "~")}` : ""); el.className = "basis" + (bad ? " worse" : ""); paintSync(); }
  document.addEventListener("visibilitychange", () => { if (document.hidden) flush(true); else pull(true); });
  addEventListener("pagehide", () => flush(true));
  setInterval(() => { if (!document.hidden) pull(true); }, 90000);

  /* ---------- the GitHub panel ---------- */
  function paintSync() {
    const on = ghPending();
    $$("glSyncInfo").textContent = on ? `Connected to ${gh.repo}. Every set is saved there as a commit, and sets from your other devices appear here.` : "Not connected: sets are saved only " + (HOSTED ? "in this browser." : "to the local file and this browser.");
    $$("glSyncForm").hidden = on; $$("glConnect").hidden = on; $$("glDisconnect").hidden = !on;
    $$("glSync").querySelector("summary").textContent = on ? "GitHub sync · connected" : "GitHub sync";
  }
  $$("glConnect").onclick = async () => {
    const repo = $$("glRepo").value.trim(), tok = $$("glTok").value.trim();
    if (!/^[\w.-]+\/[\w.-]+$/.test(repo) || tok.length < 20) return setStatus("Enter the repo as owner/name and paste the token.", true);
    gh.set(repo, tok); setStatus("Checking…");
    try { const priv = await ghCheck(); if (!priv && !confirm("That repo is PUBLIC, so your sets would be visible to anyone. Connect anyway?")) { gh.clear(); return setStatus("Not connected."); } }
    catch (e) { gh.clear(); return setStatus(ghMessage(e), true); }
    $$("glTok").value = ""; ghSha = null;
    const rem = await ghRead(GHPATH).catch(() => null); if (rem) { ghSha = rem.sha; mergeIn(parseRemote(rem.text)); refreshAll(); }
    dirty = true; await flush();
  };
  $$("glDisconnect").onclick = () => { if (confirm("Disconnect GitHub on this device? Your sets stay here and on GitHub.")) { gh.clear(); ghSha = null; setStatus(HOSTED ? "Saved in this browser only." : "Saved to the local file."); } };

  /* ---------- workout + exercise ---------- */
  const dayName = k => k.split(" (")[0];
  function renderDays() {
    const box = $$("glDays"); box.innerHTML = "";
    Object.keys(PROGRAM).forEach(k => {
      const b = document.createElement("button"); b.type = "button"; b.className = "gl-day" + (k === curDay ? " on" : ""); b.textContent = dayName(k);
      b.onclick = () => { curDay = k; try { localStorage.setItem("gymlog.day", k); } catch {} renderDays(); fillExercises(); buzz(8); };
      box.appendChild(b);
    });
  }
  function fillExercises() { exSel.innerHTML = ""; PROGRAM[curDay].forEach(([n]) => exSel.add(new Option(n, n))); onExercise(); }
  function onExercise() {
    const ex = PROGRAM[curDay].find(e => e[0] === exSel.value);
    $$("glTarget").textContent = ex ? "Target " + ex[1] : "";
    const last = entries.filter(e => e.exercise === exSel.value).sort(cmpDesc)[0];
    $$("glLast").textContent = last ? `Last ${fmt(last.weight)} × ${last.reps}, ${shortDate(last.date)}` : "No previous log";
    if (last) setWheel(last.weight);
  }
  exSel.onchange = onExercise;

  /* ---------- weight wheel ---------- */
  function buildWheel() {
    const frag = document.createDocumentFragment();
    for (let v = 0; v <= MAX_W + 1e-9; v += step) { const d = document.createElement("div"), sp = document.createElement("span"); sp.textContent = fmt(v); d.appendChild(sp); d.dataset.v = v; frag.appendChild(d); }
    wheel.innerHTML = ""; wheel.appendChild(frag);
  }
  wheel.addEventListener("click", e => { const d = e.target.closest("div[data-v]"); if (d) wheel.scrollTo({ top: Math.round(parseFloat(d.dataset.v) / step) * ITEM, behavior: "smooth" }); });
  function setWheel(v) {
    weight = Math.round(v / step) * step; buildWheel(); wheel.style.scrollSnapType = "none"; wheel.scrollTop = Math.round(weight / step) * ITEM;
    requestAnimationFrame(() => { wheel.style.scrollSnapType = ""; }); lastIdx = -1; markSel(true);
  }
  function markSel(silent) {
    const idx = Math.round(wheel.scrollTop / ITEM), kids = wheel.children; if (idx === lastIdx) return;
    if (kids[lastIdx]) kids[lastIdx].classList.remove("sel");
    if (kids[idx]) { kids[idx].classList.add("sel"); if (wheel.clientHeight) weight = parseFloat(kids[idx].dataset.v); }
    lastIdx = idx; const t = performance.now();
    if (!silent && t - lastBuzz > 45) { lastBuzz = t; buzz(3); }
  }
  wheel.addEventListener("scroll", () => requestAnimationFrame(() => markSel()), { passive: true });
  let wasHidden = true; new ResizeObserver(() => { const hidden = !wheel.clientHeight; if (wasHidden && !hidden) setWheel(weight); wasHidden = hidden; }).observe(wheel);   // the tab starts hidden, where scroll positions can't be set
  $$("glStep").onclick = e => { const b = e.target.closest("button"); if (!b) return; [...$$("glStep").children].forEach(x => x.classList.toggle("on", x === b)); const cur = weight; step = parseFloat(b.dataset.s); setWheel(cur); buzz(8); };
  root.querySelectorAll(".gl-stepper button").forEach(b => (b.onclick = () => { const i = $$(b.dataset.t), min = i.id === "glSets" ? 1 : 0; i.value = Math.max(min, (parseInt(i.value) || 0) + parseInt(b.dataset.d)); buzz(5); }));

  /* ---------- date ---------- */
  function showDate() { const v = $$("glDate").value || nowDate(); $$("glToday").textContent = toLocal(v).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }); $$("glTodayBox").classList.toggle("off", v !== nowDate()); }

  /* ---------- save + history ---------- */
  $$("glSave").onclick = () => {
    if (!$$("glDate").value) { $$("glDate").value = nowDate(); showDate(); }
    entries.push({ id: Date.now(), date: $$("glDate").value, day: curDay, exercise: exSel.value, weight, reps: parseInt($$("glReps").value) || 0, sets: parseInt($$("glSets").value) || 1 });
    changed(); render(); $$("glLast").textContent = `Last ${fmt(weight)} × ${$$("glReps").value}, ${shortDate($$("glDate").value)}`;
    const b = $$("glSave"); b.textContent = "Logged ✓"; setTimeout(() => (b.textContent = "Log set"), 1100); buzz([20, 40, 20]);
  };
  function render() {
    const chips = $$("glChips"); chips.innerHTML = "";
    ["All", ...Object.keys(PROGRAM)].forEach(n => { const c = document.createElement("button"); c.type = "button"; c.className = "gl-chip" + (n === filter ? " on" : ""); c.textContent = n === "All" ? "All" : dayName(n); c.onclick = () => { filter = n; render(); }; chips.appendChild(c); });
    const list = entries.filter(e => filter === "All" || e.day === filter).sort(cmpDesc), box = $$("glLog"); box.innerHTML = "";
    if (!list.length) { box.innerHTML = '<div class="basis" style="padding:var(--s5) 0">Nothing logged yet. Pick a weight and tap Log set.</div>'; return; }
    const prev = {}, delta = {};
    [...entries].sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id).forEach(e => { if (prev[e.exercise] !== undefined) delta[e.id] = Math.round((e.weight - prev[e.exercise]) * 10) / 10; prev[e.exercise] = e.weight; });
    let curDate = "", shown = 0;
    for (const e of list) {
      if (++shown > 120) break;
      if (e.date !== curDate) { curDate = e.date; box.insertAdjacentHTML("beforeend", `<div class="gl-datehead">${esc(prettyDate(e.date))}</div>`); }
      const dl = delta[e.id], dh = dl > 0 ? `<span class="gl-up">+${fmt(dl)}</span>` : dl < 0 ? `<span class="gl-down">−${fmt(Math.abs(dl))}</span>` : "";
      const row = document.createElement("div"); row.className = "gl-entry";
      row.innerHTML = `<div class="gl-main"><div class="gl-ex">${esc(e.exercise)}</div><div class="basis">${esc(dayName(e.day || ""))}</div></div><div class="gl-w"><b class="num">${fmt(e.weight)}<span>lb</span></b><small class="num">${dh}${e.sets} × ${e.reps}</small></div><button class="gl-del" type="button" aria-label="Delete entry">×</button>`;
      row.querySelector(".gl-del").onclick = () => { if (confirm("Delete this entry?")) { entries = entries.filter(x => x.id !== e.id); deleted.add(e.id); changed(); render(); onExercise(); } };
      box.appendChild(row);
    }
  }
  $$("glExport").onclick = () => {
    if (!entries.length) return alert("Nothing to export yet.");
    const q = s => `"${String(s).replace(/"/g, '""')}"`, rows = [["Date", "Workout", "Exercise", "Weight (lb)", "Sets", "Reps"].join(",")].concat([...entries].sort(cmpDesc).map(e => [e.date, q(e.day), q(e.exercise), e.weight, e.sets, e.reps].join(",")));
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([rows.join("\n")], { type: "text/csv" })); a.download = "gym-log.csv"; a.click();
  };
  // import a CSV exported from the standalone Gym Log page (Date, Workout, Exercise, Weight (lb), Sets, Reps); rows already present are skipped
  $$("glImport").onclick = () => $$("glFile").click();
  $$("glFile").onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    const parse = line => { const out = []; let cur = "", q = false; for (let i = 0; i < line.length; i++) { const c = line[i]; if (q) { if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; } else if (c === '"') q = true; else if (c === ",") { out.push(cur); cur = ""; } else cur += c; } out.push(cur); return out; };
    const lines = (await f.text()).replace(/\r/g, "").split("\n").filter(Boolean).slice(1), have = new Set(entries.map(x => [x.date, x.exercise, x.weight, x.sets, x.reps].join("|")));
    let added = 0, t = Date.now();
    for (const l of lines) { const [date, day, exercise, w, sets, reps] = parse(l), ent = { id: t++, date, day, exercise, weight: parseFloat(w), sets: parseInt(sets) || 1, reps: parseInt(reps) || 0 }; if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !exercise || !isFinite(ent.weight)) continue; const k = [date, exercise, ent.weight, ent.sets, ent.reps].join("|"); if (have.has(k)) continue; have.add(k); entries.push(ent); added++; }
    e.target.value = ""; if (added) { changed(); render(); onExercise(); } setStatus(added ? `Imported ${added} entries` : "Nothing new to import");
  };

  /* ---------- init ---------- */
  $$("glDate").value = nowDate(); showDate();
  $$("glDate").addEventListener("change", showDate);
  $$("glDate").addEventListener("click", () => { try { $$("glDate").showPicker(); } catch {} });
  setWheel(weight); renderDays(); fillExercises(); render();
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") { $$("glDate").value = nowDate(); showDate(); } });

  (async () => {
    let mirror = null, fromFile = null;
    try { mirror = JSON.parse(localStorage.getItem(KEY) || "null"); } catch {}
    if (mirror && !Array.isArray(mirror)) { (mirror.deleted || []).forEach(id => deleted.add(id)); mirror = mirror.entries || []; }
    if (!HOSTED) try {
      const r = await fetch(API); filePath = r.headers.get("X-Path") || "";
      if (r.ok) { fromFile = JSON.parse(await r.text() || "[]"); setStatus("Loaded"); } else if (r.status === 404) setStatus(mirror?.length ? "Creating the file…" : "New file"); else throw new Error(r.status);
    } catch { setStatus("Server unreachable: using the copy kept in this browser.", true); }
    entries = Array.isArray(fromFile) ? fromFile : Array.isArray(mirror) ? mirror : [];
    if (Array.isArray(mirror) && Array.isArray(fromFile)) mergeIn({ entries: mirror, deleted: [] });   // sets logged while the server was off
    entries = entries.filter(e => !deleted.has(e.id));
    if (demo && !entries.length) { entries = demoEntries(); dirty = true; flush(); }
    refreshAll(); paintSync();
    if (ghPending()) {
      try {
        const rem = await ghRead(GHPATH);
        if (rem) { ghSha = rem.sha; const r = parseRemote(rem.text); if (mergeIn(r)) refreshAll(); if (behind(r)) { dirty = true; flush(); } else setStatus("Synced with GitHub " + nowTime()); }
        else if (entries.length) { dirty = true; flush(); } else setStatus("Connected to GitHub. Log a set to create gym-log.json there.");
      } catch (e) { setStatus(ghMessage(e) + " Using this browser's copy.", true); }
    } else if (fromFile == null && entries.length && !demo && !HOSTED) { dirty = true; flush(); }
    else if (HOSTED) setStatus("Saved in this browser only. Connect GitHub below to sync across devices.");
  })();
  return { get entries() { return entries; } };
}

// demo only: eight weeks of a push / pull / legs split with slowly rising weights
function demoEntries() {
  const out = []; let id = 1, seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const base = {}; Object.values(PROGRAM).flat().forEach(([n], i) => (base[n] = 40 + (i * 13) % 90));
  const days = Object.keys(PROGRAM), today = new Date();
  for (let i = 56; i >= 0; i--) {
    const d = new Date(today); d.setDate(d.getDate() - i); const dow = d.getDay(); if (dow === 0 || dow === 3) continue;
    const day = days[(56 - i) % 3], date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    PROGRAM[day].slice(0, 5).forEach(([n]) => out.push({ id: id++, date, day, exercise: n, weight: Math.round((base[n] + (56 - i) * .22 + rnd() * 5) / 2.5) * 2.5, reps: 6 + Math.floor(rnd() * 6), sets: 3 }));
  }
  return out;
}
