// Plan: the calendar's next 7 days (through the Apps Script bridge, read-only here) and the Stickynote tasks.
// The Stickynote is the same file as the web Productivity tab (stickynote.md in the data repo, mirrored in stickynote.mirror/base/sha),
// with the same rule when both devices changed it: nothing is lost, the other device's text goes below a dividing line.
import { gh, ghRead, ghWrite, ghMessage } from "./ghstore.js";
import * as cal from "./calbridge.js";
import { addDays, ymd, esc } from "./util.js";

const KEY = "stickynote.mirror", BASE = "stickynote.base", SHA = "stickynote.sha", GHPATH = "stickynote.md", OTHER = "\n\n--- from your other device ---\n";
const TASK = /^(\s*)[-*] \[( |x|X)\] ?(.*)$/;
const ls = { get: k => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} } };
const DEMO_NOTE = "## This week\n- [ ] Thermo problem set 6\n- [ ] Email lab partner about CAD files\n- [x] Book dentist\n- [ ] Print poster draft\n\n## Later\n- [ ] Renew bike lock\nRemember: library closes at 22:00 on Fridays";
const dayName = d => d === ymd(new Date()) ? "Today" : d === addDays(ymd(new Date()), 1) ? "Tomorrow" : new Date(d + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", day: "numeric", month: "short" });
const hhmm = d => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

// ---- the Stickynote, shared by Plan and Today ----
export const sticky = {
  demo: false, text: "", sha: null, busy: false, again: false, listeners: new Set(), status: "",
  init(demo) { this.demo = demo; this.text = demo ? DEMO_NOTE : ls.get(KEY) ?? ""; this.sha = ls.get(SHA); },
  on(fn) { this.listeners.add(fn); }, emit() { this.listeners.forEach(f => f()); },
  tasks() { return this.text.split("\n").map((l, i) => { const m = l.match(TASK); return m ? { i, done: m[2] !== " ", text: m[3] } : null; }).filter(Boolean); },
  set(text) { this.text = text; if (!this.demo) ls.set(KEY, text); this.emit(); clearTimeout(this.t); this.t = setTimeout(() => this.push(), 900); },
  toggle(i) { const ls_ = this.text.split("\n"), m = ls_[i]?.match(TASK); if (!m) return; ls_[i] = `${m[1]}- [${m[2] === " " ? "x" : " "}] ${m[3]}`; this.set(ls_.join("\n")); },
  edit(i, t) { const ls_ = this.text.split("\n"), m = ls_[i]?.match(TASK); if (!m) return; if (t.trim()) ls_[i] = `${m[1]}- [${m[2]}] ${t.trim()}`; else ls_.splice(i, 1); this.set(ls_.join("\n")); },
  add(t) { if (!t.trim()) return; const lines = this.text ? this.text.split("\n") : [], first = lines.findIndex(l => TASK.test(l)); if (first < 0) lines.push(`- [ ] ${t.trim()}`); else lines.splice(first, 0, `- [ ] ${t.trim()}`); this.set(lines.join("\n")); },
  async pull() {
    if (this.demo || !gh.on) return;
    try {
      const rem = await ghRead(GHPATH); if (!rem) return this.push();
      const base = ls.get(BASE) ?? "", mine = this.text;
      this.sha = rem.sha; ls.set(SHA, rem.sha);
      if (this.status) { this.status = ""; this.emit(); }   // GitHub answered: clear an old error
      if (rem.text === mine) { ls.set(BASE, mine); return; }
      if (mine === base || !mine.trim()) { this.text = rem.text; ls.set(KEY, rem.text); ls.set(BASE, rem.text); this.emit(); return; }   // only the other device changed it
      if (rem.text === base) return this.push();   // only this phone changed it
      this.text = mine + OTHER + rem.text; ls.set(KEY, this.text); this.emit(); this.push();   // both changed: keep both
    } catch (e) { this.status = ghMessage(e); this.emit(); }
  },
  async push() {
    if (this.demo || !gh.on) return; if (this.busy) { this.again = true; return; } this.busy = true;
    try {
      for (let k = 0; k < 2; k++) {
        try { const t = this.text; this.sha = await ghWrite(GHPATH, t, this.sha, "Update stickynote"); ls.set(SHA, this.sha); ls.set(BASE, t); if (this.status) { this.status = ""; this.emit(); } break; }
        catch (e) { if ((e.status !== 409 && e.status !== 422) || k) throw e; this.busy = false; await this.pull(); this.busy = true; }
      }
    } catch (e) { this.status = ghMessage(e); this.emit(); if (e.status >= 500 || e.status === 0) { clearTimeout(this.rt); this.rt = setTimeout(() => this.push(), 60e3); } }
    this.busy = false; if (this.again) { this.again = false; this.push(); }
  },
};

// ---- calendar: next 7 days, cached so the tab paints at once ----
export const agenda = {
  events: null, error: "", at: 0,
  async load(force = false) {
    if (!cal.connected()) { this.events = null; return; }
    if (!force && this.events && Date.now() - this.at < 5 * 60e3) return;
    if (!this.events && !cal.isDemo) { try { const c = JSON.parse(ls.get("lite.agenda") || "null"); if (c) this.events = c.map(e => ({ ...e, s: new Date(e.s), e: new Date(e.e) })); } catch {} }
    try { const t = ymd(new Date()); this.events = await cal.events(t, addDays(t, 8)); this.at = Date.now(); this.error = ""; if (!cal.isDemo) ls.set("lite.agenda", JSON.stringify(this.events.map(({ id, title, s, e, allDay, location }) => ({ id, title, s, e, allDay, location })))); }
    catch (e) { this.error = e.message || "Calendar unavailable"; }
  },
  on(d) { const a = new Date(d + "T00:00:00"), b = new Date(addDays(d, 1) + "T00:00:00"); return (this.events || []).filter(e => e.s < b && e.e > a).sort((x, y) => (y.allDay - x.allDay) || x.s - y.s); },
};
export const evRow = (e, now = new Date()) => `<div class="ev ${e.e < now ? "past" : ""}"><span class="t">${e.allDay ? "all day" : `${hhmm(e.s)}<small>${hhmm(e.e)}</small>`}</span><i></i><span><b>${esc(e.title || "(no title)")}</b>${e.location ? `<small>${esc(e.location)}</small>` : ""}</span></div>`;

export function taskRows(list, { limit = 0 } = {}) {
  const out = []; let n = 0;
  for (const t of list) { if (limit && n >= limit) break; out.push(`<div class="task ${t.done ? "done" : ""}"><button class="box" type="button" data-tog="${t.i}" aria-label="${t.done ? "Mark not done" : "Mark done"}"></button><span class="tx" data-edit="${t.i}">${esc(t.text)}</span></div>`); n++; }
  return out.join("");
}

export function initPlan(root, { toast }) {
  async function render() {
    const t = ymd(new Date()), all = sticky.text.split("\n");
    // the whole note, in order: headings as small titles, tasks as checkboxes, other lines as plain text
    const body = all.map((l, i) => { const m = l.match(TASK); if (m) return taskRows([{ i, done: m[2] !== " ", text: m[3] }]); const h = l.match(/^#{1,6}\s+(.*)/); if (h) return `<div class="task h">${esc(h[1])}</div>`; if (l.trim() && !/^-{3,}/.test(l.trim())) return `<div class="task p">${esc(l.replace(/^[-*]\s+/, "• "))}</div>`; return ""; }).join("");
    const calHtml = !cal.connected() ? `<button class="row card tap" type="button" data-connect="calendar"><span class="k"><b>Connect your calendar</b></span><span class="chev">›</span></button>` :
      agenda.events == null ? `<div class="card"><div class="empty">${agenda.error ? esc(agenda.error) : "Loading…"}</div></div>` :
      [...Array(7)].map((_, k) => addDays(t, k)).map(d => { const es = agenda.on(d); return es.length || k0(d, t) ? `<div class="day">${dayName(d)}</div><div class="card" style="padding:6px 16px">${es.length ? es.map(e => evRow(e)).join("") : `<div class="empty" style="padding:10px 0">Nothing scheduled</div>`}</div>` : ""; }).join("");
    root.innerHTML = `
      <div class="kick sec">Tasks${sticky.status ? ` <span class="go bad">${esc(sticky.status)}</span>` : ""}</div>
      <form class="add" id="pAdd"><input id="pNew" placeholder="Add a task" autocomplete="off" enterkeyhint="done"><button type="submit" aria-label="Add">+</button></form>
      <div class="list">${body || `<div class="task p">No tasks. Add one above.</div>`}</div>
      ${!gh.on && !sticky.demo ? `<button class="row card tap" type="button" data-connect="github"><span class="k"><b>Tasks are only on this phone</b></span><span class="chev">›</span></button>` : ""}
      <div class="kick sec">Calendar${cal.connected() ? `<a class="go" href="index.html?full&tab=cal">Full calendar ›</a>` : ""}</div>
      ${calHtml}`;
  }
  const k0 = (d, t) => d === t;   // always show today, even when empty
  root.addEventListener("submit", e => { if (e.target.id !== "pAdd") return; e.preventDefault(); const i = root.querySelector("#pNew"); sticky.add(i.value); i.value = ""; i.focus(); });
  root.addEventListener("click", e => {
    const tog = e.target.closest("[data-tog]"), ed = e.target.closest("[data-edit]");
    if (tog) { sticky.toggle(+tog.dataset.tog); try { navigator.vibrate?.(8); } catch {} }
    else if (ed) editTask(+ed.dataset.edit, ed);
  });
  function editTask(i, el) {   // in place: the text becomes a field; empty it to delete the task
    const inp = document.createElement("input"); inp.value = el.textContent; inp.className = "tx"; inp.style.cssText = "border:0;background:none;outline:none;font:inherit;padding:0";
    el.replaceWith(inp); inp.focus();
    const done = () => { inp.onblur = null; sticky.edit(i, inp.value); };
    inp.onblur = done; inp.onkeydown = e => { if (e.key === "Enter") inp.blur(); if (e.key === "Escape") { inp.onblur = null; render(); } };
  }
  sticky.on(() => { if (!root.hidden && !root.querySelector("input.tx:focus")) render(); });
  return { render, async refresh() { await Promise.all([sticky.pull(), agenda.load(true)]); render(); } };
}
