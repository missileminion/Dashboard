// Calendar tab: a two-way view of your Google Calendar.
// It talks to your own Apps Script bridge (see apps-script/), which runs as you and keeps its own permission, so there is no hourly sign-in.
// The bridge URL and secret are kept in this browser only. Events are fetched into the page and never stored anywhere else.
import { esc, ymd, addDays, pad } from "./util.js";
import { plannedFor } from "./analytics.js";

const CFG = "cal.cfg", HIDDEN = "cal.hidden", VIEW = "cal.view", CACHE = "cal.cache", CALS = "cal.cals";
const HR = 44;   // pixels per hour in the week grid
const get = (k, d = null) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const put = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
// Google's event colours (the ones you can pick for a single event), used when an event has its own colour instead of its calendar's
const EVC = { 1: "#a4bdfc", 2: "#7ae7bf", 3: "#dbadff", 4: "#ff887c", 5: "#fbd75b", 6: "#ffb878", 7: "#46d6db", 8: "#e1e1e1", 9: "#5484ed", 10: "#51b749", 11: "#dc2127" };
const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;
const mondayOf = d => { const x = new Date(d + "T12:00:00"); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return ymd(x); };
const atNoon = s => new Date(s + "T12:00:00");
const hhmm = d => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const fmtDay = (s, o) => atNoon(s).toLocaleDateString("en-US", o);

export function initCalendar(root, { demo = false } = {}) {
  let cfg = demo ? { demo: true } : get(CFG), cals = get(CALS, []), hidden = new Set(get(HIDDEN, [])), view = get(VIEW, "week"), week = addDays(ymd(new Date()), -1);
  let events = [], status = "", busy = false, token = 0, editing = null;
  const today = () => ymd(new Date());
  const narrow = () => root.clientWidth < 760;

  /* ---------- the bridge (a fake one in demo mode so you can try creating and editing) ---------- */
  const demoStore = (() => {
    const mon = addDays(ymd(new Date()), -1), at = (d, h, m = 0) => { const x = atNoon(addDays(mon, d)); x.setHours(h, m, 0, 0); return x.toISOString(); };
    let id = 1; const ev = (cal, d, h1, m1, h2, m2, title, loc = "") => ({ id: "d" + id++, cal, summary: title, location: loc, start: { dateTime: at(d, h1, m1) }, end: { dateTime: at(d, h2, m2) } });
    const list = [];
    [0, 2, 4].forEach(d => list.push(ev("classes", d, 9, 0, 10, 30, "Thermodynamics", "Eng Hall 214"), ev("classes", d, 13, 0, 14, 0, "Machine Design lab", "Lab B")));
    [1, 3].forEach(d => list.push(ev("classes", d, 10, 0, 11, 15, "Fluid Mechanics", "Eng Hall 101")));
    list.push(ev("personal", 2, 17, 30, 18, 30, "Run, easy pace"), ev("personal", 5, 12, 0, 13, 0, "Lunch with Marco", "Cafe Verde"), { id: "d" + id++, cal: "classes", summary: "Midterm: Fluid Mechanics", start: { date: addDays(mon, 3) }, end: { date: addDays(mon, 4) } });
    return list;
  })();
  async function bridge(action, body = {}) {
    if (demo) {
      await new Promise(r => setTimeout(r, 120));
      if (action === "calendars") return { calendars: [{ id: "personal", name: "Personal", color: "#4f86f7", primary: true, writable: true }, { id: "classes", name: "Classes", color: "#34a37a", writable: true }] };
      if (action === "list") return { events: demoStore.filter(e => e.cal === body.calendarId && (e.start.dateTime || e.start.date + "T00:00:00") < body.timeMax && (e.end.dateTime || e.end.date + "T00:00:00") > body.timeMin).map(e => ({ id: e.id, title: e.summary, start: e.start.dateTime || e.start.date, end: e.end.dateTime || e.end.date, allDay: !e.start.dateTime, location: e.location || "", description: e.description || "", recurring: false })) };
      if (action === "create") { const e = { ...body.event, id: "n" + Date.now(), cal: body.calendarId }; demoStore.push(e); return { event: e }; }
      if (action === "update") { const e = demoStore.find(x => x.id === body.id); Object.assign(e, body.patch); return { event: e }; }
      if (action === "delete") { demoStore.splice(demoStore.findIndex(x => x.id === body.id), 1); return { ok: true }; }
    }
    const r = await fetch(cfg.url, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify({ secret: cfg.secret, action, ...body }) });
    const j = await r.json(); if (j.error) throw new Error(j.error === "unauthorized" ? "The secret does not match the one in your script." : j.error); return j;
  }

  /* ---------- data ---------- */
  const range = () => ({ timeMin: new Date(week + "T00:00:00").toISOString(), timeMax: new Date(addDays(week, 7) + "T00:00:00").toISOString() });
  const norm = (e, c) => { const allDay = e.allDay; return { id: e.id, cal: c.id, color: EVC[e.colorId] || c.color, writable: c.writable, title: e.title, allDay, s: allDay ? new Date(e.start + "T00:00:00") : new Date(e.start), e: allDay ? new Date(e.end + "T00:00:00") : new Date(e.end), location: e.location, desc: e.description, recurring: e.recurring }; };
  async function load() {
    const my = ++token, key = "w" + week; busy = true; draw();
    try {
      if (!cals.length || demo) { cals = (await bridge("calendars")).calendars; put(CALS, cals); }
      const vis = cals.filter(c => !hidden.has(c.id)), { timeMin, timeMax } = range();
      const res = await Promise.all(vis.map(async c => (await bridge("list", { calendarId: c.id, timeMin, timeMax })).events.map(e => norm(e, c))));
      if (my !== token) return;
      events = res.flat().sort((a, b) => a.s - b.s || b.e - a.e); status = "";
      const cache = get(CACHE, {}); cache[key] = { at: Date.now(), events: events.map(e => ({ ...e, s: e.s.toISOString(), e: e.e.toISOString() })) };
      Object.keys(cache).sort((a, b) => cache[b].at - cache[a].at).slice(8).forEach(k => delete cache[k]); put(CACHE, cache);
    } catch (err) {
      if (my !== token) return;
      const c = get(CACHE, {})[key]; if (c) events = c.events.map(e => ({ ...e, s: new Date(e.s), e: new Date(e.e) }));
      status = `${c ? "Showing the saved copy. " : ""}Could not reach your calendar: ${err.message}`;
    }
    busy = false; draw();
  }

  /* ---------- layout helpers ---------- */
  const visible = () => events.filter(e => !hidden.has(e.cal));
  const days = () => [...Array(7)].map((_, i) => addDays(week, i));
  const segs = d => {   // timed events as they fall on one day, packed into side-by-side columns
    const a = new Date(d + "T00:00:00"), b = new Date(addDays(d, 1) + "T00:00:00");
    const list = visible().filter(e => !e.allDay && e.s < b && e.e > a).map(e => ({ e, s: Math.max(e.s, a), t: Math.min(e.e, b) })).sort((x, y) => x.s - y.s || y.t - x.t);
    let cluster = [], end = 0; const out = [];
    const flush = () => { const cols = []; cluster.forEach(g => { let c = cols.findIndex(t => t <= g.s); if (c < 0) { c = cols.length; cols.push(0); } cols[c] = g.t; g.col = c; }); cluster.forEach(g => (g.cols = cols.length)); out.push(...cluster); cluster = []; };
    list.forEach(g => { if (cluster.length && g.s >= end) flush(); cluster.push(g); end = Math.max(end, +g.t); }); flush();
    return out;
  };
  const allDayOn = d => visible().filter(e => e.allDay && e.s <= atNoon(d) && e.e > atNoon(d));
  const timeLabel = e => (e.allDay ? "All day" : `${hhmm(e.s)}–${hhmm(e.e)}`);

  /* ---------- drawing ---------- */
  function head() {
    const a = fmtDay(week, { month: "short", day: "numeric" }), b = fmtDay(addDays(week, 6), { month: "short", day: "numeric" });
    return `<div class="cal-top"><div class="cal-nav"><button type="button" data-a="prev" aria-label="Previous week">‹</button><button type="button" data-a="today">Today</button><button type="button" data-a="next" aria-label="Next week">›</button></div>
      <div class="cal-range">${a} – ${b}</div><div style="flex:1"></div>
      ${narrow() ? "" : `<div class="seg cal-seg"><button type="button" data-v="week" class="${view === "week" ? "on" : ""}">Week</button><button type="button" data-v="agenda" class="${view === "agenda" ? "on" : ""}">Agenda</button></div>`}
      <button type="button" class="btn" data-a="new">+ New</button><button type="button" class="btn" data-a="refresh">${busy ? "…" : "Refresh"}</button></div>
      <div class="cal-chips">${cals.map(c => `<button type="button" class="cal-chip${hidden.has(c.id) ? " off" : ""}" data-c="${esc(c.id)}"><i style="background:${esc(c.color)}"></i>${esc(c.name)}</button>`).join("")}</div>
      ${status ? `<div class="basis cal-status">${esc(status)} <button type="button" class="btn" data-a="refresh">Retry</button></div>` : ""}`;
  }
  function gridHTML() {
    const ds = days(), t = today(), now = new Date();
    const header = `<div class="cal-gh"><span></span>${ds.map(d => `<div class="cal-dh${d === t ? " today" : ""}"><b>${fmtDay(d, { weekday: "short" })} ${atNoon(d).getDate()}</b><em>${plannedFor(d)}</em></div>`).join("")}</div>`;
    const ad = `<div class="cal-ad"><span>all day</span>${ds.map(d => `<div>${allDayOn(d).map(e => `<button type="button" class="cal-ev ad${e.recurring ? " routine" : ""}" data-id="${esc(e.id)}" style="--c:${esc(e.color)}">${esc(e.title)}</button>`).join("")}</div>`).join("")}</div>`;
    const hours = [...Array(24)].map((_, h) => `<div style="top:${h * HR}px">${h ? pad(h) + ":00" : ""}</div>`).join("");
    const cols = ds.map(d => `<div class="cal-col${d === t ? " today" : ""}" data-d="${d}" style="height:${24 * HR}px">${segs(d).map(g => { const top = (g.s - new Date(d + "T00:00:00")) / 36e5 * HR, h = Math.max(18, (g.t - g.s) / 36e5 * HR - 2), w = 100 / g.cols; return `<button type="button" class="cal-ev${g.e.recurring ? " routine" : ""}" data-id="${esc(g.e.id)}" style="--c:${esc(g.e.color)};top:${top}px;height:${h}px;left:calc(${g.col * w}% + 1px);width:calc(${w}% - 3px)"><b>${esc(g.e.title)}</b>${h > 34 ? `<span>${timeLabel(g.e)}</span>` : ""}${h > 50 && g.e.location ? `<span>${esc(g.e.location)}</span>` : ""}</button>`; }).join("")}${d === t ? `<i class="cal-now" style="top:${(now.getHours() + now.getMinutes() / 60) * HR}px"></i>` : ""}</div>`).join("");
    return `<div class="cal-grid">${header}${ad}<div class="cal-scroll" id="calScroll"><div class="cal-body"><div class="cal-hours" style="height:${24 * HR}px">${hours}</div>${cols}</div></div></div>`;
  }
  function agendaHTML() {
    const t = today();
    return `<div class="cal-agenda">${days().map(d => {
      const list = visible().filter(e => (e.allDay ? e.s <= atNoon(d) && e.e > atNoon(d) : e.s < new Date(addDays(d, 1) + "T00:00:00") && e.e > new Date(d + "T00:00:00")));
      return `<div class="cal-day${d === t ? " today" : ""}"><div class="cal-dayh"><b>${fmtDay(d, { weekday: "long", month: "short", day: "numeric" })}</b><em>${plannedFor(d)}</em></div>
        ${list.length ? list.map(e => `<button type="button" class="cal-row${e.recurring ? " routine" : ""}" data-id="${esc(e.id)}" style="--c:${esc(e.color)}"><span class="num">${timeLabel(e)}</span><span><b>${esc(e.title)}</b>${e.location ? `<small>${esc(e.location)}</small>` : ""}</span></button>`).join("") : `<div class="basis cal-none">Nothing scheduled</div>`}</div>`;
    }).join("")}</div>`;
  }
  function setupHTML() {
    return `<div class="card cal-setup"><div class="lbl">Connect your Google Calendar</div>
      <div class="basis" style="line-height:1.5;max-width:70ch">Deploy the Apps Script bridge from the <b>apps-script</b> folder, then paste its web app URL and your secret. Both are kept in this browser only.</div>
      <div class="cal-fields"><input id="calUrl" type="url" placeholder="https://script.google.com/macros/s/…/exec" autocomplete="off" spellcheck="false" aria-label="Web app URL"><div class="cal-secret"><input id="calSecret" type="password" placeholder="Secret" autocomplete="new-password" aria-label="Secret" spellcheck="false"><button type="button" class="btn" id="calShow">Show</button></div><div class="basis" id="calLen">0 characters</div><button type="button" class="btn" id="calConnect">Connect</button></div>
      <div class="basis cal-status" id="calErr">${esc(status)}</div></div>`;
  }
  function draw() {
    if (!demo && !(cfg && cfg.url)) { root.innerHTML = setupHTML(); wireSetup(); return; }
    const keep = root.querySelector("#calScroll")?.scrollTop;
    root.innerHTML = head() + (narrow() || view === "agenda" ? agendaHTML() : gridHTML()) + `<div class="basis cal-foot">${demo ? "Demo calendar. Changes here stay in this page." : ""}${!demo ? `<button type="button" class="cal-link" data-a="disconnect">Disconnect</button>` : ""}</div>`;
    const sc = root.querySelector("#calScroll"); if (sc) sc.scrollTop = keep ?? (week === addDays(today(), -1) ? Math.max(0, (new Date().getHours() - 2) * HR) : 7 * HR);
  }
  function wireSetup() {
    const sec = root.querySelector("#calSecret"), len = root.querySelector("#calLen");
    sec.oninput = () => (len.textContent = `${sec.value.trim().length} characters`);
    root.querySelector("#calShow").onclick = e => { const show = sec.type === "password"; sec.type = show ? "text" : "password"; e.target.textContent = show ? "Hide" : "Show"; };
    root.querySelector("#calConnect").onclick = async () => {
      const url = root.querySelector("#calUrl").value.trim(), secret = root.querySelector("#calSecret").value.trim(), err = root.querySelector("#calErr");
      if (!/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(url)) { err.textContent = "That does not look like a web app URL. It starts with https://script.google.com/macros/s/ and ends in /exec."; return; }
      if (secret.length < 8) { err.textContent = "Paste the secret you saved in the script properties."; return; }
      err.textContent = "Connecting…"; cfg = { url, secret };
      try { cals = (await bridge("calendars")).calendars; put(CFG, cfg); put(CALS, cals); status = ""; load(); } catch (e) { cfg = null; err.textContent = `Could not connect: ${e.message}${/secret/i.test(e.message) ? ` (sent ${secret.length} characters)` : ""}`; }
    };
  }

  /* ---------- the editor ---------- */
  function openEditor(ev, when) {
    const writable = cals.filter(c => c.writable); editing = ev;
    const s = ev ? ev.s : when, e = ev ? (ev.allDay ? new Date(+ev.e - 864e5) : ev.e) : new Date(+when + 36e5);
    const f = d => ymd(d), allDay = ev ? ev.allDay : false;
    const m = document.createElement("div"); m.className = "cal-modal";
    m.innerHTML = `<div class="cal-sheet" role="dialog" aria-label="${ev ? "Edit event" : "New event"}"><div class="lbl">${ev ? "Edit event" : "New event"}</div>
      <input id="ceTitle" type="text" placeholder="Title" value="${esc(ev ? ev.title : "")}" aria-label="Title">
      <label class="cal-chk"><input id="ceAll" type="checkbox"${allDay ? " checked" : ""}> All day</label>
      <div class="cal-two"><label>Starts<input id="ceSd" type="date" value="${f(s)}"><input id="ceSt" type="time" value="${hhmm(s)}"></label><label>Ends<input id="ceEd" type="date" value="${f(e)}"><input id="ceEt" type="time" value="${hhmm(e)}"></label></div>
      <input id="ceLoc" type="text" placeholder="Location" value="${esc(ev ? ev.location : "")}" aria-label="Location">
      <textarea id="ceDesc" rows="3" placeholder="Notes" aria-label="Notes">${esc(ev ? ev.desc : "")}</textarea>
      ${ev ? `<div class="basis">${ev.recurring ? "Repeating event: changes apply to this occurrence only. " : ""}${ev.writable === false ? "This calendar is read-only." : ""}</div>` : `<select id="ceCal" aria-label="Calendar">${writable.map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join("")}</select>`}
      <div class="cal-err" id="ceErr"></div>
      <div class="cal-btns">${ev && ev.writable !== false ? `<button type="button" class="btn cal-del" id="ceDel">Delete</button>` : ""}<span style="flex:1"></span><button type="button" class="btn" id="ceCancel">Cancel</button>${ev && ev.writable === false ? "" : `<button type="button" class="btn cal-save" id="ceSave">Save</button>`}</div></div>`;
    root.appendChild(m);
    const q = id => m.querySelector("#" + id), close = () => { m.remove(); editing = null; };
    const sync = () => m.querySelectorAll("#ceSt,#ceEt").forEach(i => (i.hidden = q("ceAll").checked)); sync(); q("ceAll").onchange = sync;
    q("ceCancel").onclick = close; m.onclick = x => { if (x.target === m) close(); }; q("ceTitle").focus();
    q("ceSave") && (q("ceSave").onclick = async () => {
      const all = q("ceAll").checked, sd = q("ceSd").value, ed = q("ceEd").value || sd, st = q("ceSt").value || "00:00", et = q("ceEt").value || "00:00";
      const A = new Date(`${sd}T${st}:00`), B = new Date(`${ed}T${et}:00`);
      if (!sd || (!all && !(B > A))) { q("ceErr").textContent = "The end has to be after the start."; return; }
      const body = { summary: q("ceTitle").value.trim() || "(no title)", location: q("ceLoc").value, description: q("ceDesc").value, ...(all ? { start: { date: sd }, end: { date: addDays(ed < sd ? sd : ed, 1) } } : { start: { dateTime: A.toISOString(), timeZone: TZ }, end: { dateTime: B.toISOString(), timeZone: TZ } }) };
      q("ceSave").disabled = true; q("ceErr").textContent = "Saving…";
      try { ev ? await bridge("update", { calendarId: ev.cal, id: ev.id, patch: body }) : await bridge("create", { calendarId: q("ceCal").value, event: body }); close(); load(); } catch (err) { q("ceErr").textContent = "Could not save: " + err.message; q("ceSave").disabled = false; }
    });
    q("ceDel") && (q("ceDel").onclick = async () => {
      if (!confirm("Delete this event from your Google Calendar?")) return;
      q("ceErr").textContent = "Deleting…";
      try { await bridge("delete", { calendarId: ev.cal, id: ev.id }); close(); load(); } catch (err) { q("ceErr").textContent = "Could not delete: " + err.message; }
    });
  }

  /* ---------- events ---------- */
  root.addEventListener("click", e => {
    const b = e.target.closest("[data-a],[data-v],[data-c],[data-id]");
    if (b && b.dataset.a) {
      const a = b.dataset.a;
      if (a === "prev" || a === "next") { week = addDays(week, a === "next" ? 7 : -7); load(); }
      else if (a === "today") { week = addDays(today(), -1); load(); }
      else if (a === "refresh") load();
      else if (a === "new") { const n = new Date(); n.setMinutes(0, 0, 0); n.setHours(n.getHours() + 1); openEditor(null, n); }
      else if (a === "disconnect" && confirm("Disconnect this browser from your calendar? Your calendar itself is untouched.")) { cfg = null; cals = []; events = []; try { ["cal.cfg", CALS, CACHE].forEach(k => localStorage.removeItem(k)); } catch {} draw(); }
    } else if (b && b.dataset.v) { view = b.dataset.v; put(VIEW, view); draw(); }
    else if (b && b.dataset.c) { hidden.has(b.dataset.c) ? hidden.delete(b.dataset.c) : hidden.add(b.dataset.c); put(HIDDEN, [...hidden]); load(); }
    else if (b && b.dataset.id) { const ev = events.find(x => x.id === b.dataset.id); if (ev) openEditor(ev); }
    else { const col = e.target.closest(".cal-col"); if (col && !editing) { const r = col.getBoundingClientRect(), mins = Math.floor((e.clientY - r.top) / HR * 2) * 30, d = new Date(col.dataset.d + "T00:00:00"); d.setMinutes(mins); openEditor(null, d); } }
  });
  addEventListener("resize", () => { if (root.isConnected && root.offsetParent) draw(); });
  document.addEventListener("visibilitychange", () => { if (!document.hidden && root.offsetParent && cfg && !editing) load(); });
  setInterval(() => { if (!document.hidden && root.offsetParent && cfg && !editing && !busy) load(); }, 5 * 60000);
  draw(); if (demo || (cfg && cfg.url)) load();
  return { reload: () => load() };
}
