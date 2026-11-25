// Lite gym log: a thumb-sized set logger for the phone layout. Same data as gymlog.js: entries {id, date, day, exercise, weight (lb, always), reps, sets},
// the same browser copy (gymlog.mirror) and the same GitHub file (gym-log.json, {version, entries, deleted}). Two copies merge as a union minus deletions,
// so the full dashboard and this page can both be used. Demo mode keeps everything in memory and never writes.
import { PROGRAM } from "./gymlog.js";
import { gh, ghRead, ghWrite, ghMessage } from "./ghstore.js";
import { syncwarn } from "./syncwarn.js";
import { esc, ymd, addDays } from "./util.js";
import { dm } from "./dotfont.js";

const KEY = "gymlog.mirror", GHPATH = "gym-log.json", KG = 0.45359237, WEEK = ["Pull", "Legs", "Push", null, "Pull", "Legs", "Push"];   // Sun..Sat; Wed is rest
const fmt = n => String(+n.toFixed(2)), buzz = ms => { try { navigator.vibrate && navigator.vibrate(ms); } catch {} };
const short = d => new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });

export function initLiteGym(root, { demo = false, toast = () => {}, onChange = () => {} } = {}) {
  let entries = [], deleted = new Set(), sha = null, unit = "lb", step = 1, day = "Pull", ex = null, weight = 45, reps = 8, sets = 3, armed = null, status = "", statusBad = false, timer = 0, saving = false, again = false;
  try { const u = localStorage.getItem("gymlog.unit"); if (u === "kg" || u === "lb") unit = u; const d = localStorage.getItem("gymlog.day"); if (PROGRAM[d]) day = d; step = +localStorage.getItem("lite.step") || 1; } catch {}
  { const w = WEEK[new Date().getDay()]; if (w) day = w; }
  const today = () => ymd(new Date());
  const toDisp = lb => (unit === "kg" ? lb * KG : lb), toLb = v => (unit === "kg" ? Math.round(v / KG * 100) / 100 : v);
  const lastOf = name => entries.filter(e => e.exercise === name).sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id)[0];

  // ---- storage and sync ----
  const persist = () => { if (demo) return; try { localStorage.setItem(KEY, JSON.stringify({ entries, deleted: [...deleted] })); } catch {} };
  const parse = t => { const j = JSON.parse(t || "[]"); return Array.isArray(j) ? { entries: j, deleted: [] } : { entries: j.entries || [], deleted: j.deleted || [] }; };
  function merge(rem) {
    rem.deleted.forEach(id => deleted.add(id)); const have = new Set(entries.map(e => e.id)); let n = 0;
    rem.entries.forEach(e => { if (!have.has(e.id) && !deleted.has(e.id)) { entries.push(e); n++; } });
    const before = entries.length; entries = entries.filter(e => !deleted.has(e.id)); return n > 0 || entries.length !== before;
  }
  const behind = rem => entries.some(e => !rem.entries.some(r => r.id === e.id)) || [...deleted].some(id => !rem.deleted.includes(id));
  const setStatus = (t, b = false) => { status = t; statusBad = b; const el = root.querySelector("#gSt"); if (el) { el.textContent = t; el.classList.toggle("bad", b); } };
  async function push() {
    if (demo || !gh.on) return setStatus(demo ? "Demo: nothing is saved" : "Saved on this phone");
    if (saving) { again = true; return; } saving = true;
    try {
      for (let i = 0; i < 2; i++) {
        try { sha = await ghWrite(GHPATH, JSON.stringify({ version: 1, entries, deleted: [...deleted] }, null, 1), sha, "Update gym log"); setStatus("Synced"); break; }
        catch (e) { if ((e.status !== 409 && e.status !== 422) || i) throw e; const r = await ghRead(GHPATH); sha = r?.sha ?? null; if (r && merge(parse(r.text))) { persist(); changed(false); } }
      }
    } catch (e) { setStatus(ghMessage(e), true); if (e.status !== 401 && e.status !== 403) syncwarn.broken("gh", "The gym log", "gym", "The gym log is not syncing: " + ghMessage(e)); }
    saving = false; if (again) { again = false; push(); }
  }
  async function pull() {
    if (demo || !gh.on) return push();
    try { const r = await ghRead(GHPATH); sha = r?.sha ?? null; const rem = r ? parse(r.text) : { entries: [], deleted: [] }; if (merge(rem)) { persist(); changed(false); } if (behind(rem)) push(); else setStatus("Synced"); }
    catch (e) { setStatus(ghMessage(e), true); }
  }
  function changed(save = true) { if (save) { persist(); clearTimeout(timer); timer = setTimeout(push, 700); } onChange(entries); draw(); }

  // ---- view ----
  function pickEx() { const list = PROGRAM[day].map(x => x[0]); if (!list.includes(ex)) ex = list[0]; const l = lastOf(ex); if (l) { weight = l.weight; reps = l.reps || reps; sets = l.sets || sets; } }
  function draw() {
    const prog = PROGRAM[day], target = (prog.find(x => x[0] === ex) || [])[1] || "", l = lastOf(ex), todays = entries.filter(e => e.date === today()).sort((a, b) => b.id - a.id);
    root.innerHTML = `
    <div class="seg" id="gDay">${Object.keys(PROGRAM).map(k => `<button type="button" data-d="${k}" class="${k === day ? "on" : ""}">${k}</button>`).join("")}</div>
    <div class="sel"><select id="gEx" aria-label="Exercise">${prog.map(([n]) => `<option ${n === ex ? "selected" : ""}>${esc(n)}</option>`).join("")}</select></div>
    <div class="glinfo"><span>${esc(target)}</span><span>${l ? `last ${fmt(toDisp(l.weight))} × ${l.reps} · ${short(l.date)}` : "first time"}</span></div>
    <div class="wt"><button class="rnd" type="button" data-w="-1" aria-label="Less weight">−</button><div class="big" id="gW">${dm(fmt(toDisp(weight)))}<small>${unit}</small></div><button class="rnd" type="button" data-w="1" aria-label="More weight">+</button></div>
    <div class="rwrap" aria-hidden="true"><div class="ruler" id="gR"><i class="sp"></i><div class="rtrack" id="gRT">${ticks()}</div><i class="sp"></i></div></div>
    <div class="opts"><div class="seg sm" id="gStep">${[.25, 1, 5].map(s => `<button type="button" data-s="${s}" class="${s === step ? "on" : ""}">${s === .25 ? ".25" : s}</button>`).join("")}</div>
      <div class="seg sm" id="gUnit">${["lb", "kg"].map(u => `<button type="button" data-u="${u}" class="${u === unit ? "on" : ""}">${u}</button>`).join("")}</div></div>
    <div class="steps">${[["reps", "Reps", reps], ["sets", "Sets", sets]].map(([k, lb, v]) => `<div class="step"><div class="lb">${lb}</div><div class="ctl"><button type="button" data-k="${k}" data-d="-1" aria-label="Fewer ${k}">−</button><span class="n">${v}</span><button type="button" data-k="${k}" data-d="1" aria-label="More ${k}">+</button></div></div>`).join("")}</div>
    <button class="log" type="button" id="gLog">Log set</button>
    <div class="sub ${statusBad ? "bad" : ""}" id="gSt" style="text-align:center;margin-top:10px">${esc(status)}</div>
    ${!demo && !gh.on ? `<button class="row card tap" type="button" data-connect="github" style="margin-top:12px"><span class="k"><b>Sync the gym log with the web</b></span><span class="chev">›</span></button>` : ""}
    <div class="kick sec">Today ${todays.length ? `· ${todays.reduce((s, e) => s + (e.sets || 1), 0)} sets` : ""}</div>
    <div class="list sets">${todays.length ? todays.map(e => `<div class="row"><span class="ex">${esc(e.exercise)}</span><span class="num">${fmt(toDisp(e.weight))}<span class="u">${unit}</span> × ${e.reps} × ${e.sets || 1}</span><button type="button" class="x ${armed === e.id ? "arm" : ""}" data-x="${e.id}" aria-label="${armed === e.id ? "Tap again to delete" : "Delete"}">✕</button></div>`).join("") : `<div class="row"><span class="k">Nothing logged today.</span></div>`}</div>
    ${history()}`;
    rulerInit();
  }
  // ---- the weight ruler: drag sideways to pick a weight; it settles on the chosen step ----
  const MAX = () => (unit === "kg" ? 270 : 600), PX = () => (unit === "kg" ? 22 : 10), LBL = () => (unit === "kg" ? 5 : 10);
  function ticks() { let h = ""; for (let v = 0; v <= MAX(); v += LBL()) h += `<span style="left:${v * PX()}px">${v}</span>`; return h; }
  let rulerSet = false, rulerT = 0, lastBuzz = null;
  function rulerTo(smooth = false) {   // move the ruler to the current weight without treating it as a drag
    const r = root.querySelector("#gR"); if (!r) return; rulerSet = true;
    r.scrollTo({ left: toDisp(weight) * PX(), behavior: smooth ? "smooth" : "auto" }); setTimeout(() => (rulerSet = false), smooth ? 350 : 60);
  }
  function rulerInit() {
    const r = root.querySelector("#gR"), t = root.querySelector("#gRT"); if (!r) return;
    t.style.width = MAX() * PX() + "px"; t.style.setProperty("--px", PX() + "px"); rulerTo();
    let seen = 0; new ResizeObserver(() => { const w = r.clientWidth; if (w && w !== seen) { seen = w; requestAnimationFrame(() => rulerTo()); } }).observe(r);   // the tab may be hidden when this runs: centre once it shows
    r.addEventListener("scroll", () => {
      if (rulerSet) return;
      const v = Math.max(0, Math.min(MAX(), Math.round(r.scrollLeft / PX() / step) * step));
      if (v !== lastBuzz) { lastBuzz = v; weight = toLb(v); paintW(); buzz(4); }
      clearTimeout(rulerT); rulerT = setTimeout(() => rulerTo(true), 140);   // settle exactly on the step
    }, { passive: true });
  }
  const paintW = () => { const w = root.querySelector("#gW"); if (w) w.innerHTML = dm(fmt(toDisp(weight))) + `<small>${unit}</small>`; };
  function history() {   // the last few sessions, one line each
    const ds = [...new Set(entries.map(e => e.date))].filter(d => d < today()).sort().reverse().slice(0, 6); if (!ds.length) return "";
    return `<div class="kick sec">Recent</div><div class="list">${ds.map(d => { const es = entries.filter(e => e.date === d), n = es.reduce((s, e) => s + (e.sets || 1), 0); return `<div class="row"><div class="k">${short(d)} · ${esc(es[0].day || "")}</div><div class="v"><span class="num">${n}</span><span class="u">sets</span></div></div>`; }).join("")}</div>`;
  }

  // ---- input: one listener for the whole pane; + and − repeat while held ----
  let hold = 0, holdT = 0;
  const bump = (d) => { weight = Math.max(0, Math.min(600, toLb(Math.round((toDisp(weight) + d * step) / step) * step))); paintW(); rulerTo(); buzz(6); };
  const stop = () => { clearTimeout(holdT); clearInterval(hold); hold = holdT = 0; };
  root.addEventListener("pointerdown", e => { const b = e.target.closest("[data-w]"); if (!b) return; const d = +b.dataset.w; bump(d); holdT = setTimeout(() => (hold = setInterval(() => bump(d), 70)), 380); });
  ["pointerup", "pointercancel", "pointerleave"].forEach(t => root.addEventListener(t, stop));
  root.addEventListener("contextmenu", e => e.target.closest("[data-w]") && e.preventDefault());
  root.addEventListener("click", e => {
    const t = e.target.closest("button"); if (!t) return;
    if (t.dataset.d && !t.dataset.k) { day = t.dataset.d; try { localStorage.setItem("gymlog.day", day); } catch {} ex = null; pickEx(); armed = null; draw(); }
    else if (t.dataset.s) { step = +t.dataset.s; try { localStorage.setItem("lite.step", step); } catch {} draw(); }
    else if (t.dataset.u) { unit = t.dataset.u; try { localStorage.setItem("gymlog.unit", unit); } catch {} draw(); }
    else if (t.dataset.k) { const d = +t.dataset.d; if (t.dataset.k === "reps") reps = Math.max(0, reps + d); else sets = Math.max(1, sets + d); t.parentNode.querySelector(".n").textContent = t.dataset.k === "reps" ? reps : sets; buzz(5); }
    else if (t.id === "gLog") { entries.push({ id: Date.now() + Math.floor(Math.random() * 1000), date: today(), day, exercise: ex, weight, reps, sets }); armed = null; buzz(18); toast(`Logged ${ex.split(" (")[0]}`); changed(); }
    else if (t.dataset.x) { const id = +t.dataset.x; if (armed === id) { entries = entries.filter(x => x.id !== id); deleted.add(id); armed = null; changed(); } else { armed = id; draw(); setTimeout(() => { if (armed === id) { armed = null; draw(); } }, 3000); } }
  });
  root.addEventListener("change", e => { if (e.target.id === "gEx") { ex = e.target.value; const l = lastOf(ex); if (l) { weight = l.weight; reps = l.reps || reps; sets = l.sets || sets; } draw(); } });

  // ---- start ----
  if (demo) entries = demoEntries();
  else { try { const m = JSON.parse(localStorage.getItem(KEY) || "null"); if (Array.isArray(m)) entries = m; else if (m) { entries = m.entries || []; (m.deleted || []).forEach(id => deleted.add(id)); } } catch {} entries = entries.filter(e => !deleted.has(e.id)); }
  pickEx(); onChange(entries); draw(); pull();
  document.addEventListener("visibilitychange", () => { if (!document.hidden) pull(); });
  return { get entries() { return entries; }, pull, shown: () => rulerTo() };
}

// demo only: five weeks of the split, with weights creeping up
function demoEntries() {
  const out = [], t = ymd(new Date()); let id = 1;
  for (let i = 35; i >= 1; i--) { const d = addDays(t, -i), w = WEEK[new Date(d + "T12:00:00").getDay()]; if (!w || i % 9 === 4) continue;
    PROGRAM[w].slice(0, 5).forEach(([name], k) => out.push({ id: id++, date: d, day: w, exercise: name, weight: 60 + k * 15 + (35 - i) * .5, reps: 8 + (i % 3), sets: 3 })); }
  const w = WEEK[new Date().getDay()]; if (w) PROGRAM[w].slice(0, 2).forEach(([name], k) => out.push({ id: id++, date: t, day: w, exercise: name, weight: 80 + k * 20, reps: 8, sets: 3 }));
  return out;
}
