// Plan: the calendar's next 7 days (through the Apps Script bridge) as the day path and the chosen day's events.
import * as cal from "./calbridge.js";
import { addDays, ymd, esc } from "./util.js";
import { pathHTML, wirePath } from "./litepath.js";

const ls = { get: k => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} } };
const dayName = d => d === ymd(new Date()) ? "Today" : d === addDays(ymd(new Date()), 1) ? "Tomorrow" : new Date(d + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", day: "numeric", month: "short" });
const hhmm = d => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

// ---- calendar: next 7 days, cached so the tab paints at once ----
export const agenda = {
  events: null, error: "", at: 0,
  async load(force = false) {
    if (!cal.connected()) { this.events = null; return; }
    if (!force && this.events && Date.now() - this.at < 5 * 60e3) return;
    if (!this.events && !cal.isDemo) { try { const c = JSON.parse(ls.get("lite.agenda") || "null"); if (c) this.events = c.map(e => ({ ...e, s: new Date(e.s), e: new Date(e.e) })); } catch {} }
    try { const t = ymd(new Date()); this.events = await cal.events(t, addDays(t, 8)); this.at = Date.now(); this.error = ""; if (!cal.isDemo) ls.set("lite.agenda", JSON.stringify(this.events.map(({ id, title, s, e, allDay, location, desc, cal: c, writable, recurring, done, pri }) => ({ id, title, s, e, allDay, location, desc, cal: c, writable, recurring, done, pri })))); }
    catch (e) { this.error = e.message || "Calendar unavailable"; }
  },
  on(d) { const a = new Date(d + "T00:00:00"), b = new Date(addDays(d, 1) + "T00:00:00"); return (this.events || []).filter(e => e.s < b && e.e > a).sort((x, y) => (y.allDay - x.allDay) || x.s - y.s); },
};
export const evRow = (e, now = new Date()) => `<div class="ev ${e.e < now ? "past" : ""}${e.done ? " done" : ""}${e.pri ? " p" + e.pri : ""}"><span class="t">${e.allDay ? "all day" : `${hhmm(e.s)}<small>${hhmm(e.e)}</small>`}</span><i></i><span><b>${e.pri ? `<em>${"!".repeat(e.pri)}</em> ` : ""}${esc(e.title || "(no title)")}</b>${e.location ? `<small>${esc(e.location)}</small>` : ""}</span></div>`;

// ---- the Plan tab: the day path, then the chosen day's events. Tap an event to open its editor in place (like the web's expanding day card);
// the round check marks it done. Everything writes to Google Calendar through the bridge, with the same title rules as the web.
const PRI_NAME = ["None", "!", "!!", "!!!"];
export function initPlan(root, { toast }) {
  let focus = null, open = null, armDel = null, busy = false;   // open: the id of the event being edited ("new" for a new one)
  const ev = id => (agenda.events || []).find(e => e.id === id);
  const dt = d => ymd(d), tm = d => hhmm(d);
  function editor(e) {   // e is null for a new event on the focused day
    const s0 = e ? e.s : new Date(`${focus}T${focus === ymd(new Date()) ? String(Math.min(22, new Date().getHours() + 1)).padStart(2, "0") : "09"}:00:00`);
    const e0 = e ? (e.allDay ? new Date(+e.e - 864e5) : e.e) : new Date(+s0 + 36e5), all = e ? e.allDay : false, pri = e ? e.pri : 0, ro = e && e.writable === false, cals = cal.writableCals();
    return `<div class="ed" data-ed="${e ? esc(e.id) : "new"}">
      <input class="ed-title" id="eT" value="${esc(e ? e.title : "")}" placeholder="Title" ${ro ? "disabled" : ""} enterkeyhint="done">
      <label class="ed-all"><input type="checkbox" id="eA" ${all ? "checked" : ""} ${ro ? "disabled" : ""}> All day</label>
      <div class="ed-when"><span>Starts</span><input type="date" id="eSd" value="${dt(s0)}" ${ro ? "disabled" : ""}><input type="time" id="eSt" value="${tm(s0)}" ${all ? "hidden" : ""} ${ro ? "disabled" : ""}>
        <span>Ends</span><input type="date" id="eEd" value="${dt(e0)}" ${ro ? "disabled" : ""}><input type="time" id="eEt" value="${tm(e0)}" ${all ? "hidden" : ""} ${ro ? "disabled" : ""}></div>
      <input id="eL" value="${esc(e ? e.location : "")}" placeholder="Location" ${ro ? "disabled" : ""}>
      <textarea id="eN" rows="2" placeholder="Notes" ${ro ? "disabled" : ""}>${esc(e ? e.desc || "" : "")}</textarea>
      ${ro ? `<div class="ed-msg">This calendar is read-only.</div>` : `<div class="seg sm ed-pri" id="eP">${PRI_NAME.map((n, i) => `<button type="button" data-pr="${i}" class="${i === pri ? "on" : ""} ${i ? "p" + i : ""}">${n}</button>`).join("")}</div>`}
      ${!e && cals.length > 1 ? `<div class="sel"><select id="eC" aria-label="Calendar">${cals.map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join("")}</select></div>` : ""}
      ${e && e.recurring ? `<div class="ed-msg">Repeating event: changes apply to this one only.</div>` : ""}
      <div class="ed-msg bad" id="eE"></div>
      ${ro ? "" : `<div class="btns">${e ? `<button type="button" class="btn ghost ${armDel === e.id ? "arm" : ""}" data-del>${armDel === e.id ? "Tap again to delete" : "Delete"}</button>` : `<button type="button" class="btn ghost" data-cancel>Cancel</button>`}<button type="button" class="btn" data-save>${e ? "Save" : "Add"}</button></div>`}
    </div>`;
  }
  const row = e => `<div class="er${open === e.id ? " open" : ""}${e.done ? " done" : ""}${e.pri ? " p" + e.pri : ""}${!e.allDay && e.e < new Date() ? " past" : ""}" data-eid="${esc(e.id)}">
      <button type="button" class="chk" data-done aria-pressed="${e.done}" aria-label="${e.done ? "Mark not done" : "Mark done"}" ${e.writable === false ? "disabled" : ""}><svg viewBox="0 0 14 14" aria-hidden="true"><path d="M3 7.4 5.8 10 11 4.4"/></svg></button>
      <span class="t">${e.allDay ? "all day" : `${tm(e.s)}<small>${tm(e.e)}</small>`}</span>
      <span class="nm"><b>${e.pri ? `<em>${"!".repeat(e.pri)}</em> ` : ""}${esc(e.title || "(no title)")}</b>${e.location ? `<small>${esc(e.location)}</small>` : ""}</span>
    </div>${open === e.id ? editor(e) : ""}`;
  async function render() {
    const t = ymd(new Date());
    if (!focus || focus < t || focus > addDays(t, 6)) focus = t;
    const list = cal.connected() ? agenda.events || [] : [], es = agenda.on(focus);
    const body = !cal.connected() ? `<button class="row card tap" type="button" data-connect="calendar"><span class="k"><b>Connect your calendar</b></span><span class="chev">›</span></button>` :
      agenda.events == null ? `<div class="card"><div class="empty">${agenda.error ? esc(agenda.error) : "Loading…"}</div></div>` :
      `<div class="card evs">${es.map(row).join("")}${open === "new" ? editor(null) : ""}${!es.length && open !== "new" ? `<div class="empty" style="padding:14px 0">Nothing scheduled</div>` : ""}</div>${agenda.error ? `<div class="sub bad" style="margin-top:8px">${esc(agenda.error)}</div>` : ""}`;
    root.innerHTML = `
      ${pathHTML(focus, list, t)}
      <div class="kick sec">${dayName(focus)}${cal.connected() ? `<button type="button" class="go" data-new>+ Event</button>` : ""}</div>
      ${body}
      ${cal.connected() ? `<a class="sub full" href="index.html?full&tab=cal">Full calendar ›</a>` : ""}`;
    wirePath(root, focus, list, t);
    if (open) { const ed = root.querySelector(".ed"); ed?.scrollIntoView({ block: "nearest", behavior: "smooth" }); if (open === "new") root.querySelector("#eT")?.focus(); }
  }
  // the editor's values as Google's event shape
  function body(e) {
    const q = id => root.querySelector("#" + id), all = q("eA").checked, sd = q("eSd").value, ed = q("eEd").value || sd, A = new Date(`${sd}T${q("eSt").value || "00:00"}:00`), B = new Date(`${ed}T${q("eEt").value || "00:00"}:00`);
    if (!sd || (!all && !(B > A))) throw new Error("The end has to be after the start.");
    const pri = +(root.querySelector("#eP .on")?.dataset.pr || 0);
    return { summary: cal.wrapT(e && e.done, pri, q("eT").value.trim() || "(no title)"), location: q("eL").value, description: q("eN").value,
      ...(all ? { start: { date: sd }, end: { date: addDays(ed < sd ? sd : ed, 1) } } : { start: { dateTime: A.toISOString(), timeZone: cal.TZ }, end: { dateTime: B.toISOString(), timeZone: cal.TZ } }) };
  }
  async function act(fn, ok) {   // one write at a time; on failure the editor stays open with the reason
    if (busy) return; busy = true; const err = root.querySelector("#eE"); if (err) err.textContent = "Saving…";
    try { await fn(); open = null; armDel = null; await agenda.load(true); render(); if (ok) toast(ok); }
    catch (x) { const e2 = root.querySelector("#eE"); if (e2) e2.textContent = x.message || "Could not save"; else toast(x.message || "Could not save"); }
    busy = false;
  }
  root.addEventListener("click", e => {
    const t = e.target, chip = t.closest("[data-fd]"), r = t.closest(".er"), id = r?.dataset.eid;
    if (chip) { focus = chip.dataset.fd; open = null; render(); try { navigator.vibrate?.(6); } catch {} return; }
    if (t.closest("[data-new]")) { open = open === "new" ? null : "new"; render(); return; }
    if (t.closest("[data-done]") && id) {   // done: the title gets (or loses) "✓ " in Google Calendar; shown at once, undone if Google refuses
      const x = ev(id); if (!x) return; x.done = !x.done; render(); try { navigator.vibrate?.(8); } catch {}
      cal.save(x, { summary: cal.wrapT(x.done, x.pri, x.title) }).catch(er => { x.done = !x.done; render(); toast("Could not update: " + er.message); });
      return;
    }
    if (r && id) { open = open === id ? null : id; armDel = null; render(); return; }
    const pr = t.closest("[data-pr]"); if (pr) { root.querySelectorAll("#eP button").forEach(b => b.classList.toggle("on", b === pr)); return; }
    const edEl = t.closest(".ed"); if (!edEl) return; const eid = edEl.dataset.ed, x = eid === "new" ? null : ev(eid);
    if (t.closest("[data-cancel]")) { open = null; render(); return; }
    if (t.closest("[data-save]")) { let b; try { b = body(x); } catch (er) { root.querySelector("#eE").textContent = er.message; return; }
      return act(() => (x ? cal.save(x, b) : cal.create(root.querySelector("#eC")?.value || cal.writableCals()[0]?.id, b)), x ? "Saved" : "Added"); }
    if (t.closest("[data-del]") && x) { if (armDel !== x.id) { armDel = x.id; render(); setTimeout(() => { if (armDel === x.id) { armDel = null; render(); } }, 3000); return; } return act(() => cal.remove(x), "Deleted"); }
  });
  root.addEventListener("change", e => { if (e.target.id === "eA") root.querySelectorAll("#eSt,#eEt").forEach(i => (i.hidden = e.target.checked)); });
  return { render, paint() { if (!root.querySelector(".ed")) render(); }, back() { if (open) { open = null; render(); return true; } return false; }, async refresh() { await agenda.load(true); if (!root.querySelector(".ed")) render(); } };
}
