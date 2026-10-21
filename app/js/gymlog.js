// Gym log: the weight-wheel set logger (ported from the standalone Gym Log page) inside the dashboard.
// Entries are {id, date, day, exercise, weight (lb), reps, sets}. They are saved to gym-log.json on disk through /api/gymlog,
// with a copy kept in the browser as a backup, exactly like the Stickynote. Every change fires "gymlog:change" so the Gym cards can update.
import { esc, HOSTED } from "./util.js";

const API = "api/gymlog", KEY = "gymlog.mirror";
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
  let entries = [], step = 5, weight = 45, filter = "All", lastIdx = -1, lastBuzz = 0, curDay = Object.keys(PROGRAM)[0];
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
    </div>
    <div class="card gl-hist">
      <div style="display:flex;align-items:center;gap:var(--s3)"><div class="lbl" style="flex:1">History</div><button class="btn" id="glExport" type="button">Export CSV</button><button class="btn" id="glImport" type="button">Import CSV</button><input id="glFile" type="file" accept=".csv,text/csv" hidden></div>
      <div class="gl-chips" id="glChips"></div><div id="glLog"></div>
    </div>
  </div>`;
  const $$ = id => root.querySelector("#" + id), wheel = $$("glWheel"), exSel = $$("glEx");

  /* ---------- storage ---------- */
  const persistMirror = () => { try { localStorage.setItem(KEY, JSON.stringify(entries)); } catch {} };
  function changed() { dirty = true; persistMirror(); setStatus("Saving…"); clearTimeout(timer); timer = setTimeout(flush, 500); dispatchEvent(new CustomEvent("gymlog:change")); }
  async function flush(keepalive = false) {
    clearTimeout(timer); if (!dirty) return;
    if (HOSTED) { dirty = false; return setStatus("Saved in this browser only (the published copy has no file to write)"); }
    if (inflight) { again = true; return; }
    inflight = true; dirty = false;
    try {
      const body = JSON.stringify(entries, null, 1), r = await fetch(API, { method: "PUT", body, keepalive: keepalive === true && body.length < 60000, headers: { "Content-Type": "application/json" } });
      if (!r.ok) throw new Error(r.status);
      setStatus("Saved " + new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }));
    } catch { dirty = true; setStatus("Not saved to the file (server unreachable). Kept in this browser.", true); timer = setTimeout(flush, 5000); }
    inflight = false; if (again) { again = false; flush(); }
  }
  function setStatus(s, bad = false) { status = s; statusBad = bad; const el = $$("glStatus"); el.textContent = s + (filePath ? ` · ${filePath.replace(/^\/Users\/[^/]+/, "~")}` : ""); el.className = "basis" + (bad ? " worse" : ""); }
  document.addEventListener("visibilitychange", () => { if (document.hidden) flush(true); });
  addEventListener("pagehide", () => flush(true));

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
      row.querySelector(".gl-del").onclick = () => { if (confirm("Delete this entry?")) { entries = entries.filter(x => x.id !== e.id); changed(); render(); onExercise(); } };
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
    if (HOSTED) setStatus("Saved in this browser only (the published copy has no file to write)");
    else try {
      const r = await fetch(API); filePath = r.headers.get("X-Path") || "";
      if (r.ok) { fromFile = JSON.parse(await r.text() || "[]"); setStatus("Loaded"); } else if (r.status === 404) setStatus(mirror?.length ? "Creating the file…" : "New file"); else throw new Error(r.status);
    } catch { setStatus("Server unreachable: using the copy kept in this browser.", true); }
    entries = Array.isArray(fromFile) ? fromFile : Array.isArray(mirror) ? mirror : [];
    if (demo && !entries.length) { entries = demoEntries(); dirty = true; flush(); }
    if (fromFile == null && entries.length && !demo && !HOSTED) { dirty = true; flush(); }
    persistMirror(); onExercise(); render(); dispatchEvent(new CustomEvent("gymlog:change"));
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
