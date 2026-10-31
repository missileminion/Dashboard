// More console commands (calendar editing, task editing, health reviews, gym extras, reminders, everyday calculators and text tools).
// addMore(X) registers them through the same def() as library.js, so help, Tab completion, suggestions and blue highlighting pick them up with no extra wiring.
import { e1rm } from "./gymlog.js";
import { gh, ghRead, ghWrite, ghMessage } from "./ghstore.js";
import { loadProfile, saveProfile, targets, adjustAdvice, findFood, usdaFood, gramsFor, macrosOf, bmr, tdee } from "./macros.js";

export function addMore(X) {
  const { def, print, dim, ask, askInput, choose, err, undos, parseWhen, fmtDay, hhmm, midnight, addDaysD, call, history, H, series, MET, metric, calApi, tasksApi, gymApi, taskList, pickTask, rewrite, TASK, lastKg, loadWeights,
    pad, hmm, num, nn, mean, sdev, trim, thou, chart, link, dotHBars, timers, clk, rd, html, U, esc, ymd, addDays, n3, nums, relDays, longDay, copyText, beep, rankExercises, debtNow, zoneOf } = X;
  const minOf = d => d.getHours() * 60 + d.getMinutes(), at = (day, m) => { const d = new Date(midnight(day)); d.setMinutes(m); return d; };
  const evLine = e => `${e.allDay ? "all day" : `${hhmm(e.s)}–${hhmm(e.e)}`}  ${e.title}`;
  const parseDur = t => { const m = String(t || "").trim().toLowerCase().match(/^(?:(\d+(?:\.\d+)?)\s*h(?:ours?|rs?)?)?\s*(?:(\d+)\s*m(?:in(?:ute)?s?)?)?$|^(\d+)$/); if (!m || !t.trim()) return null; return m[3] ? +m[3] : (+m[1] || 0) * 60 + (+m[2] || 0); };
  const dur2 = m => (m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ""}` : `${m} min`);
  const timed = () => calApi().events().filter(e => !e.allDay);

  /* ================= CALENDAR: edit, review ================= */
  const pickEvent = async (q, then) => {
    const l = calApi().find(q); if (!l.length) U(`no event in view matches "${q}".`);
    if (l.length === 1 || (l[0].s > new Date() && !l.slice(1).some(e => e.s > new Date() && e.s - l[0].s < 864e5 * 3))) return then(l[0]);
    return choose(`"${q}" matches more than one event:`, l.slice(0, 5).map(e => ({ label: `${fmtDay(e.s)} ${e.allDay ? "all day" : hhmm(e.s)}  ${e.title}`, value: e })), o => then(o.value));
  };
  const shift = async (ev, s, e, what) => { const old = { s: ev.s, e: ev.e }; await calApi().update(ev.id, { start: s, end: e }); undos.push({ label: `${what} ${ev.title}`, fn: () => calApi().update(ev.id, { start: old.s, end: old.e }) }); await print(`✓ ${ev.title}: ${fmtDay(s)} ${hhmm(s)}–${hhmm(e)}`); };
  def("cal", "move reschedule", "move <event> to <day/time>", "move an event to another day or time, keeping its length (move gym to thu 7pm)", async a => {
    const m = a.match(/^(.*\S)\s+(?:to|at|for)\s+(.+)$/i); if (!m) U("usage: move gym to thu 7pm");
    const w = parseWhen(m[2].split(/\s+/)); if (!w.hasDate && !w.hasTime) U(`I could not read a day or time in "${m[2]}".`);
    await pickEvent(m[1], async ev => { const day = w.hasDate ? midnight(w.start) : midnight(ev.s), s = at(day, w.hasTime ? minOf(w.start) : minOf(ev.s)), e = new Date(+s + (ev.e - ev.s)); await shift(ev, s, e, "move"); });
  });
  def("cal", "postpone push delay", "postpone <event> [by 1h | 1d]", "push an event later (default one hour)", async a => {
    const m = a.match(/^(.*?)(?:\s+by\s+(\S.*))?$/i); if (!m[1].trim()) U("usage: postpone gym by 2h");
    let by = 60, days = 0; if (m[2]) { const d = m[2].trim().match(/^(\d+)\s*d(?:ays?)?$/i); if (d) { days = +d[1]; by = 0; } else by = parseDur(m[2]); if (by == null) U(`I could not read "${m[2]}" as a length of time.`); }
    await pickEvent(m[1], async ev => { const s = new Date(+ev.s + by * 6e4); s.setDate(s.getDate() + days); await shift(ev, s, new Date(+s + (ev.e - ev.s)), "postpone"); });
  });
  def("cal", "extend lengthen", "extend <event> by 30m", "make an event longer", async a => {
    const m = a.match(/^(.*\S)\s+by\s+(.+)$/i); if (!m) U("usage: extend lecture by 30m"); const d = parseDur(m[2]); if (!d) U(`I could not read "${m[2]}".`);
    await pickEvent(m[1], async ev => shift(ev, ev.s, new Date(+ev.e + d * 6e4), "extend"));
  });
  def("cal", "shorten trim", "shorten <event> by 15m", "make an event shorter", async a => {
    const m = a.match(/^(.*\S)\s+by\s+(.+)$/i); if (!m) U("usage: shorten lecture by 15m"); const d = parseDur(m[2]); if (!d) U(`I could not read "${m[2]}".`);
    await pickEvent(m[1], async ev => { if (ev.e - ev.s <= d * 6e4) U("that would leave nothing of the event."); await shift(ev, ev.s, new Date(+ev.e - d * 6e4), "shorten"); });
  });
  def("cal", "rename", "rename <event> to <new title>", "change an event's title", async a => {
    const m = a.match(/^(.*\S)\s+to\s+(.+)$/i); if (!m) U("usage: rename gym to leg day");
    await pickEvent(m[1], async ev => { const old = ev.title; await calApi().update(ev.id, { title: m[2].trim() }); undos.push({ label: `rename ${old}`, fn: () => calApi().update(ev.id, { title: old }) }); await print(`✓ renamed: ${old} → ${m[2].trim()}`); });
  });
  def("cal", "dupe duplicate", "dupe <event> [to day/time]", "copy an event to another day (default: same time tomorrow)", async a => {
    const m = a.match(/^(.*?)(?:\s+to\s+(.+))?$/i); if (!m[1].trim()) U("usage: dupe gym to fri");
    await pickEvent(m[1], async ev => {
      const w = m[2] ? parseWhen(m[2].split(/\s+/)) : null, day = w && w.hasDate ? midnight(w.start) : midnight(addDaysD(ev.s, 1)), s = at(day, w && w.hasTime ? minOf(w.start) : minOf(ev.s)), e = new Date(+s + (ev.e - ev.s));
      const r = await calApi().create({ title: ev.title, start: s, end: e }); undos.push({ label: `copy of ${ev.title}`, fn: () => calApi().remove(r.id, r.cal) }); await print(`✓ copied: ${ev.title}, ${fmtDay(s)} ${hhmm(s)}–${hhmm(e)}`);
    });
  });
  def("cal", "cancel", "cancel <event>", "delete a calendar event (asks first); same as delete <event>", async a => { if (!a.trim()) U("usage: cancel gym"); await call("rm", `event ${a}`); });
  const dayList = (d, label) => { const l = timed().concat(calApi().events().filter(e => e.allDay)).filter(e => midnight(e.s) <= midnight(d) && (e.allDay ? e.e > midnight(d) : midnight(e.s).getTime() === midnight(d).getTime())).sort((x, y) => x.s - y.s); return [`${label || longDay(d)}  (${relDays(d)})`, ...(l.length ? l.map(e => "  " + evLine(e)) : ["  nothing in view"])]; };
  def("cal", "day on", "day <day>", "what is on a given day (day thu, on nov 4)", async a => { const w = parseWhen(a.split(/\s+/).filter(Boolean)); await print(dayList(w.hasDate ? midnight(w.start) : midnight(new Date())), "tm-dim"); });
  def("cal", "schedule weekview", "schedule", "your calendar for the days in view, grouped by day (switch weeks on the Calendar page)", async () => {
    const ev = calApi().events(); if (!ev.length) return dim("no events in view."); const days = [...new Set(ev.map(e => +midnight(e.s)))].sort((x, y) => x - y), out = [];
    days.forEach(t => { const d = new Date(t); out.push(...dayList(d, d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" }))); }); await print(out, "tm-dim");
  });
  def("cal", "now whatson", "now", "what is on right now and what comes next", async () => {
    const n = new Date(), cur = timed().filter(e => e.s <= n && e.e > n), nx = timed().filter(e => e.s > n).sort((x, y) => x.s - y.s)[0];
    await print([cur.length ? cur.map(e => `on now: ${e.title}, until ${hhmm(e.e)} (${dur2(Math.round((e.e - n) / 6e4))} left)`).join("\n") : "nothing on right now", nx ? `next: ${nx.title} at ${hhmm(nx.s)}${midnight(nx.s) > midnight(n) ? " " + fmtDay(nx.s) : ""}, in ${dur2(Math.round((nx.s - n) / 6e4))}` : "nothing else in view"].flatMap(x => x.split("\n")), "tm-dim");
  });
  // journal: one file (journal.md) in the GitHub repo already connected for the gym log, newest day last, a 0 to 5 rating on each day's first entry
  const JPATH = "journal.md", jHead = d => d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  async function jSave(rating, text) {
    const now = new Date(), head = "## " + jHead(now), entry = `**${hhmm(now)}** ${text}`;
    for (let tries = 0; ; tries++) {
      const f = await ghRead(JPATH), doc = f ? f.text : "# Journal\n", i = doc.indexOf(head); let out;
      if (i < 0) out = doc.replace(/\s*$/, "\n") + `\n${head}${rating != null ? ` · ${rating}/5` : ""}\n\n${entry}\n`;
      else { let k = doc.indexOf("\n## ", i + head.length); if (k < 0) k = doc.length; out = doc.slice(0, k).replace(/\s*$/, "") + `\n\n${entry}\n` + doc.slice(k); }
      try { await ghWrite(JPATH, out, f && f.sha, `journal ${ymd(now)} ${hhmm(now)}`); return; } catch (e) { if (tries === 0 && (e.status === 409 || e.status === 422)) continue; throw e; }
    }
  }
  def("log", "journal j", "journal [what you want to write]", "write a journal entry to journal.md on GitHub, stamped with day and time; the first one each day asks how the day was, 0 to 5", async a => {
    if (!gh.on) { await print(link("gym", "Open Gym log")); U("no GitHub repo is connected yet. Connect it on the Gym log page first (the journal uses the same repo and token)."); }
    let f; try { f = await ghRead(JPATH); } catch (e) { U(ghMessage(e)); }
    const first = !f || !f.text.includes("## " + jHead(new Date())), text = a.trim();
    const finish = async (rating, body) => { if (!body) U("nothing to save."); try { await jSave(rating, body); } catch (e) { U(ghMessage(e)); } await print(`✓ saved to ${JPATH}: ${jHead(new Date())}, ${hhmm(new Date())}${rating != null ? `, day ${rating}/5` : ""}`); };
    if (!first) return text ? finish(null, text) : askInput("write your entry (or cancel)", t => finish(null, t.trim()), true);
    await print(["how was today?  0 awful · 3 meh · 5 great", { buttons: [0, 1, 2, 3, 4, 5].map(n => ({ label: String(n), say: String(n) })) }]);
    askInput("press a number, or type 0 to 5 (or cancel)", async l => { const n = l.trim(); if (!/^[0-5]$/.test(n)) U("a number from 0 to 5 please. Type journal to start again."); if (text) return finish(+n, text); await askInput("write your entry (or cancel)", t => finish(+n, t.trim()), true); }, true);
  });
  def("cal", "nextfree gap", "nextfree [45m]", "the next free slot of a given length between 08:00 and 22:00 (default 1 hour), in view", async a => {
    const need = a.trim() ? parseDur(a) : 60; if (!need) U("usage: nextfree 45m"); const evs = timed().sort((x, y) => x.s - y.s), n = new Date();
    for (let k = 0; k < 14; k++) { const day = midnight(addDaysD(n, k)); let t = Math.max(8 * 60, k === 0 ? Math.ceil((minOf(n) + 1) / 15) * 15 : 0); const todays = evs.filter(e => midnight(e.s).getTime() === day.getTime() || (e.s < day && e.e > day));
      for (const e of todays) { const s = e.s < day ? 0 : minOf(e.s), en = e.e > addDaysD(day, 1) ? 1440 : (midnight(e.e).getTime() === day.getTime() ? minOf(e.e) : 1440); if (s - t >= need) break; t = Math.max(t, en); }
      if (t + need <= 22 * 60) { const s = at(day, t); return print(`${fmtDay(s)} ${hhmm(s)}–${hhmm(new Date(+s + need * 6e4))}  (${dur2(need)} free)`); } }
    await print(["no slot that long in view.", link("cal", "Open Calendar")], "tm-dim");
  });
  def("cal", "conflicts clashes", "conflicts", "events in view that overlap each other", async () => {
    const e = timed().sort((x, y) => x.s - y.s), out = []; for (let i = 0; i < e.length; i++) for (let j = i + 1; j < e.length && e[j].s < e[i].e; j++) out.push(`${fmtDay(e[j].s)}  ${e[i].title} (${hhmm(e[i].s)}–${hhmm(e[i].e)})  overlaps  ${e[j].title} (${hhmm(e[j].s)}–${hhmm(e[j].e)})`);
    await print(out.length ? out : "no overlaps in view", "tm-dim");
  });
  def("cal", "workload busyness", "workload", "hours of scheduled events per day in view, as bars", async () => {
    const e = timed(), by = {}; e.forEach(x => { const k = +midnight(x.s); by[k] = (by[k] || 0) + (x.e - x.s) / 36e5; }); const ks = Object.keys(by).sort(), mx = Math.max(1, ...Object.values(by));
    const lab = k => new Date(+k).toLocaleDateString("en-US", { weekday: "short", day: "numeric"});
    await print(ks.length ? [chart(dotHBars(ks.map(k => ({ label: lab(k), value: by[k], text: `${trim(by[k], 1)} h` })), { max: mx }), ks.map(k => `${lab(k)} ${trim(by[k], 1)} h`).join("\n")), `total ${trim(Object.values(by).reduce((s, v) => s + v, 0), 1)} h`, link("cal", "Open Calendar")] : "no events in view", "tm-dim");
  });

  /* ================= STICKYNOTE: edit tasks ================= */
  def("tasks", "edittask retask", "edittask <number> <new text>", "change the words of an open task", async a => {
    const m = a.trim().match(/^(\d+)\s+(.+)$/); if (!m) U("usage: edittask 2 call the dentist"); const t = pickTask(m[1], false)[0]; if (!t) U(`there is no open task ${m[1]}. tasks lists them.`);
    const old = rewrite(t.i, t.line.replace(TASK, (_, sp, mk) => `${sp}- [${mk}] ${m[2].trim()}`)); undos.push({ label: "edit task", fn: () => tasksApi().set(old) }); await print(`✓ task ${m[1]}: ${m[2].trim()}`);
  });
  def("tasks", "prioritize top", "prioritize <number | words>", "move an open task to the top of the list", async a => {
    if (!a.trim()) U("usage: prioritize 4"); const t = pickTask(a.trim(), false)[0]; if (!t) U("no open task matches."); const api = tasksApi(), old = api.text(), ls = old.split("\n"), first = ls.findIndex(l => TASK.test(l) && l.match(TASK)[2] === " ");
    const [line] = ls.splice(t.i, 1); ls.splice(Math.min(first, t.i), 0, line); api.set(ls.join("\n")); undos.push({ label: "prioritize", fn: () => api.set(old) }); await print(`✓ moved to the top: ${t.text}`);
  });
  def("tasks", "addtasks batch", "addtasks milk; eggs; bread", "add several tasks at once, separated by semicolons", async a => {
    const items = a.split(/;|\n/).map(s => s.trim()).filter(Boolean); if (!items.length) U("usage: addtasks milk; eggs; bread"); const api = tasksApi(), lines = items.map(t => api.append(`- [ ] ${t}`));
    undos.push({ label: `${items.length} tasks`, fn: () => lines.forEach(l => api.removeLine(l)) }); await print(`✓ added ${items.length} task${items.length > 1 ? "s" : ""}`);
  });

  /* ================= HEALTH: reviews ================= */
  const avgOf = (key, from, n) => { const m = metric(key), s = series(m, n + from).slice(0, n).map(q => q.v), v = nn(s); return v.length ? { v: mean(v), n: v.length, m } : null; };
  const dline = (label, key, n) => { const cur = avgOf(key, 0, n), prev = avgOf(key, n, n); if (!cur) return `${label.padEnd(14)} no data`; const m = cur.m, c = cur.v * m.k, d = prev ? c - prev.v * m.k : null, pc = prev && prev.v ? (cur.v - prev.v) / prev.v * 100 : null;
    return `${label.padEnd(14)} ${m.fmt(cur.v).padEnd(12)} ${d == null ? "" : `${d >= 0 ? "+" : "−"}${trim(Math.abs(pc), 0)}% vs the ${n} before`}`; };
  def("health", "review", "review [week | month]", "averages for the last 7 or 30 days, each against the period before it", async a => {
    const n = /month|30/i.test(a) ? 30 : 7; await print([`LAST ${n} DAYS`, ...[["sleep", "sleep"], ["resting HR", "rhr"], ["HRV", "hrv"], ["steps", "steps"], ["active zone", "azm"], ["deep sleep", "deep"], ["REM", "rem"]].map(([l, k]) => "  " + dline(l, k, n))], "tm-dim");
  });
  def("health", "yesterday", "yesterday", "how yesterday went: sleep, heart, steps, active minutes and workouts", async () => {
    const h = H(), d = h.addDays(h.today, -1), x = h.byDate[d]; if (!x) U("no data for yesterday yet.");
    await print([`YESTERDAY  ${new Date(d + "T12:00").toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}`, `  sleep ${hmm(x.sleepMin)}   resting HR ${x.restingHr ?? "—"}   HRV ${x.hrv ?? "—"}`, `  steps ${x.steps != null ? thou(x.steps) : "—"}   active zone ${x.azm ?? "—"} min`, ...((x.workouts || []).map(w => `  ${w.type}${w.distanceM ? ` ${(w.distanceM / 1000).toFixed(2)} km` : ""}`))], "tm-dim");
  });
  const clockMin = iso => { if (!iso) return null; const d = new Date(iso); let m = minOf(d); if (m < 12 * 60) m += 1440; return m; };
  const clockStr = m => `${pad(Math.floor(m / 60) % 24)}:${pad(Math.round(m % 60) % 60)}`;
  def("body", "regularity consistency", "regularity [days]", "how regular your bedtime and wake time are (lower spread is better)", async a => {
    const h = H(), n = Math.min(60, +(nums(a)[0] || 14)), bed = [], wake = [];
    for (let i = 0; i < n; i++) { const x = h.byDate[h.addDays(h.today, -i)]; if (x && x.sleepStart) { bed.push(clockMin(x.sleepStart)); const w = new Date(x.sleepEnd); wake.push(minOf(w)); } }
    if (bed.length < 3) U("not enough nights recorded."); const sb = sdev(bed), sw = sdev(wake);
    await print([`last ${bed.length} nights`, `  bedtime   average ${clockStr(mean(bed))}, spread ±${Math.round(sb)} min`, `  wake      average ${clockStr(mean(wake))}, spread ±${Math.round(sw)} min`, sb < 30 ? "  very regular" : sb < 60 ? "  fairly regular" : "  irregular, a steadier bedtime usually helps recovery"], "tm-dim");
  });
  def("health", "weekend", "weekend <metric>", "weekdays against weekends for a metric over the last 8 weeks", async a => {
    const m = metric(a.trim() || "sleep"); if (!m) U("usage: weekend sleep"); const s = series(m, 56), we = nn(s.filter(q => [0, 6].includes(new Date(q.date + "T12:00").getDay())).map(q => q.v)), wd = nn(s.filter(q => ![0, 6].includes(new Date(q.date + "T12:00").getDay())).map(q => q.v));
    if (!we.length || !wd.length) U("not enough data."); await print([`${m.label}, last 8 weeks`, `  weekdays  ${m.fmt(mean(wd))}`, `  weekends  ${m.fmt(mean(we))}`], "tm-dim");
  });
  def("health", "rank", "rank <metric>", "where today (or the latest value) sits among the last 90 days", async a => {
    const m = metric(a.trim() || "hrv"); if (!m) U("usage: rank hrv"); const s = series(m, 90).filter(q => q.v != null); if (s.length < 5) U("not enough data."); const last = s[s.length - 1], below = s.filter(q => q.v < last.v).length;
    await print(`${m.label}: ${m.fmt(last.v / m.k * m.k)} on ${last.date}, higher than ${Math.round(below / (s.length - 1) * 100)}% of your last ${s.length} days`);
  });
  def("health", "anomalies unusual", "anomalies", "readings in the last 7 days that are far from your 60-day normal", async () => {
    const out = []; ["sleep", "rhr", "hrv", "steps", "azm", "spo2", "temp"].forEach(k => { const m = metric(k), base = nn(series(m, 67).slice(0, 60).map(q => q.v)), sd = sdev(base), mu = mean(base); if (!sd) return;
      series(m, 7).forEach(q => { if (q.v != null && Math.abs(q.v - mu) > 2 * sd) out.push(`${q.date}  ${m.label}: ${m.fmt(q.v)}  (${q.v > mu ? "high" : "low"}, usual ${m.fmt(mu)})`); }); });
    await print(out.length ? out : "nothing unusual in the last 7 days", "tm-dim");
  });
  def("body", "caffeine", "caffeine [bedtime]", "the last sensible time for caffeine (about 9 h before bed)", async a => {
    let bed = null; const t = a.trim().match(/^(\d{1,2}):?(\d{2})?\s*(am|pm)?$/i); if (t) { let hr = +t[1]; if (/pm/i.test(t[3]) && hr < 12) hr += 12; bed = hr * 60 + +(t[2] || 0); if (bed < 12 * 60) bed += 1440; } else { const { h, sf } = debtNow(), b = h.A.bedtime(sf.nights >= 3 ? sf.hours : 0); bed = Math.round(b.minutes); if (bed < 12 * 60) bed += 1440; }
    await print(`bed ${clockStr(bed)}  →  last coffee by ${clockStr(bed - 540)}, last tea or cola by ${clockStr(bed - 420)}`);
  });
  def("body", "cycles sleepcalc", "cycles <wake time>", "bedtimes that fit whole 90-minute sleep cycles for a wake-up time", async a => {
    const t = a.trim().match(/^(\d{1,2}):?(\d{2})?\s*(am|pm)?$/i); if (!t) U("usage: cycles 6:30"); let hr = +t[1]; if (/pm/i.test(t[3]) && hr < 12) hr += 12; const wake = hr * 60 + +(t[2] || 0);
    await print([5, 6, 4].map(c => `${clockStr(wake - c * 90 - 15 + 1440)}  →  ${c} cycles (${trim(c * 1.5, 1)} h asleep, 15 min to nod off)`), "tm-dim");
  });
  def("body", "wakeat", "wakeat <bedtime>", "wake times that end a sleep cycle if you go to bed at a given time", async a => {
    const t = a.trim().match(/^(\d{1,2}):?(\d{2})?\s*(am|pm)?$/i); if (!t) U("usage: wakeat 23:30"); let hr = +t[1]; if (/pm/i.test(t[3]) && hr < 12) hr += 12; const bed = hr * 60 + +(t[2] || 0);
    await print([5, 6, 5.5].map(c => `${clockStr(bed + 15 + c * 90)}  →  ${trim(c * 1.5, 2)} h asleep`), "tm-dim");
  });
  def("fit", "weightgoal", "weightgoal <kg> by <day>", "the weekly change and daily calorie gap needed to reach a weight by a date", async a => {
    const m = a.match(/^(\d+(?:\.\d+)?)\s*(?:kg)?\s+by\s+(.+)$/i); if (!m) U("usage: weightgoal 70 by dec 1"); const cur = lastKg(); if (cur == null) U("log a weight first (weight 72.4)."); const w = parseWhen(m[2].split(/\s+/)); if (!w.hasDate) U("I could not read the date.");
    const days = Math.round((midnight(w.start) - midnight(new Date())) / 864e5); if (days < 1) U("that date has already passed."); const diff = +m[1] - cur, wk = diff / (days / 7), kcal = diff * 7700 / days;
    await print([`${n3(cur)} kg → ${m[1]} kg by ${fmtDay(w.start)} (${days} days)`, `  ${diff >= 0 ? "+" : "−"}${trim(Math.abs(wk), 2)} kg a week, about ${thou(Math.abs(kcal))} kcal a day ${diff < 0 ? "below" : "above"} maintenance`, Math.abs(wk) > 1 ? "  that is faster than about 1 kg a week, which is hard to sustain" : "  a steady pace"], "tm-dim");
  });
  def("fit", "macros", "macros <kcal> [protein% carb% fat%]", "grams of protein, carbohydrate and fat for a calorie target (default 30/40/30)", async a => {
    const n = nums(a); if (!n.length) U("usage: macros 2500   or   macros 2500 35 40 25"); const [k, p = 30, c = 40, f = 30] = n; if (Math.abs(p + c + f - 100) > 1) U("the three percentages must add to 100.");
    await print([`${thou(k)} kcal`, `  protein ${Math.round(k * p / 100 / 4)} g   carbohydrate ${Math.round(k * c / 100 / 4)} g   fat ${Math.round(k * f / 100 / 9)} g`], "tm-dim");
  });

  /* ================= GYM extras ================= */
  const entries = () => gymApi().entries;
  def("gym", "again same", "again", "log the same set as your last one, for today", async () => {
    const e = [...entries()].sort((x, y) => y.id - x.id)[0]; if (!e) U("no sets logged yet."); const g = gymApi(); g.add({ date: ymd(new Date()), day: e.day, exercise: e.exercise, weight: e.weight, reps: e.reps, sets: e.sets }); undos.push({ label: "repeated set", fn: () => { const x = [...entries()].sort((p, q) => q.id - p.id)[0]; if (x) g.remove(x.id); } });
    await print(`✓ ${e.exercise} ${e.weight} lb × ${e.reps}${e.sets > 1 ? " × " + e.sets : ""} logged for today`);
  });
  def("gym", "fixset", "fixset <weight> <reps> [sets]", "correct the last set you logged (replaces it)", async a => {
    const n = nums(a); if (n.length < 2) U("usage: fixset 140 8 3"); const e = [...entries()].sort((x, y) => y.id - x.id)[0]; if (!e) U("no sets logged yet."); const g = gymApi();
    await ask(`change ${e.exercise} ${e.weight} lb × ${e.reps}${e.sets > 1 ? " × " + e.sets : ""} to ${n[0]} lb × ${n[1]}${(n[2] || e.sets) > 1 ? " × " + (n[2] || e.sets) : ""}? (y/n)`, async () => { g.remove(e.id); g.add({ date: e.date, day: e.day, exercise: e.exercise, weight: n[0], reps: n[1], sets: n[2] || e.sets }); undos.push({ label: "fixset", fn: () => { const x = [...entries()].sort((p, q) => q.id - p.id)[0]; if (x) g.remove(x.id); g.add(e); } }); await print("✓ set corrected"); });
  });
  def("gym", "neglected missing", "neglected [days]", "exercises you have not done in a while (default 14 days)", async a => {
    const n = +(nums(a)[0] || 14), last = {}; entries().forEach(e => { if (!last[e.exercise] || e.date > last[e.exercise]) last[e.exercise] = e.date; }); const cut = addDays(ymd(new Date()), -n);
    const l = Object.entries(last).filter(([, d]) => d < cut).sort((x, y) => x[1].localeCompare(y[1])); await print(l.length ? l.slice(0, 15).map(([ex, d]) => `  ${ex.padEnd(34)} ${Math.round((midnight(new Date()) - new Date(d + "T12:00")) / 864e5)} days ago`) : `everything done within ${n} days`, "tm-dim");
  });
  def("gym", "plateau stalled", "plateau", "lifts whose best estimated one-rep max has not risen in the last 4 weeks", async () => {
    const by = {}; entries().forEach(e => { (by[e.exercise] ||= []).push({ d: e.date, v: e1rm(e.weight, e.reps) }); }); const cut = addDays(ymd(new Date()), -28), out = [];
    Object.entries(by).forEach(([ex, l]) => { const rec = l.filter(x => x.d >= cut), old = l.filter(x => x.d < cut); if (rec.length >= 3 && old.length >= 3 && Math.max(...rec.map(x => x.v)) <= Math.max(...old.map(x => x.v)) + 0.5) out.push(`  ${ex.padEnd(34)} best ${Math.round(Math.max(...old.map(x => x.v)))} lb e1RM, recent ${Math.round(Math.max(...rec.map(x => x.v)))}`); });
    await print(out.length ? out : "no stalled lifts found", "tm-dim");
  });
  def("gym", "lifetime", "lifetime", "total sets, reps, volume and training days since you started logging", async () => {
    const e = entries(); if (!e.length) U("no sets logged yet."); const sets = e.reduce((s, x) => s + (x.sets || 1), 0), reps = e.reduce((s, x) => s + x.reps * (x.sets || 1), 0), vol = e.reduce((s, x) => s + x.weight * x.reps * (x.sets || 1), 0), days = new Set(e.map(x => x.date)).size;
    await print([`${days} training days, ${thou(sets)} sets, ${thou(reps)} reps`, `${thou(vol)} lb lifted in total (${trim(vol * 0.45359237 / 1000, 1)} tonnes)`], "tm-dim");
  });

  /* ================= REMINDERS ================= */
  const REM = []; let remN = 0;
  const dropRem = r => { clearTimeout(r.t); const i = REM.indexOf(r); if (i >= 0) REM.splice(i, 1); timers.remove("rem" + r.id); };
  const startRem = (ms, text) => {   // waits in the developer panel as a countdown; at the end it beeps and says so here
    const id = ++remN, due = Date.now() + ms, r = { id, due, text, t: setTimeout(() => { dropRem(r); beep(); print([`⏰ ${text || "reminder"}`], "tm-ok"); try { if ("Notification" in window && Notification.permission === "granted") new Notification(text || "reminder"); } catch {} }, ms) };
    REM.push(r); timers.add("rem" + id, { label: text || "reminder", get: () => ({ text: clk((due - Date.now()) / 1000), sub: `reminder at ${hhmm(new Date(due))}` }), stop: () => dropRem(r) }); return id;
  };
  def("timer", "remind remindme", "remind 20m call mom", "a reminder in the console after a delay (it is lost if you reload the page)", async a => {
    const m = a.trim().match(/^(?:in\s+)?(\d+(?:\.\d+)?\s*(?:h(?:ours?|rs?)?|m(?:in(?:ute)?s?)?|s(?:ec(?:ond)?s?)?))\s*(.*)$/i); if (!m) U("usage: remind 20m call mom   (units: s, m, h)");
    const v = parseFloat(m[1]), u = m[1].replace(/[\d.\s]/g, "")[0].toLowerCase(), ms = v * (u === "h" ? 36e5 : u === "m" ? 6e4 : 1e3); startRem(ms, m[2].trim()); await print(`✓ I will remind you in ${m[1].replace(/\s+/g, " ")}${m[2] ? `: ${m[2]}` : ""}`);
  });
  def("timer", "alarm", "alarm 7:30 [text]", "a reminder at a clock time today or tomorrow (lost if you reload the page)", async a => {
    const m = a.trim().match(/^(\d{1,2})(?::?(\d{2}))?\s*(am|pm)?\s*(.*)$/i); if (!m) U("usage: alarm 7:30 wake up"); let hr = +m[1]; if (/pm/i.test(m[3]) && hr < 12) hr += 12; if (/am/i.test(m[3]) && hr === 12) hr = 0;
    const t = new Date(); t.setHours(hr, +(m[2] || 0), 0, 0); if (t <= new Date()) t.setDate(t.getDate() + 1); startRem(t - Date.now(), m[4].trim() || "alarm"); await print(`✓ alarm set for ${fmtDay(t)} ${hhmm(t)}${m[4] ? `: ${m[4].trim()}` : ""}`);
  });

  /* ================= TEXT ================= */
  const words = s => s.replace(/([a-z0-9])([A-Z])/g, "$1 $2").split(/[^A-Za-z0-9]+/).filter(Boolean).map(w => w.toLowerCase());
  const MORSE = { a: ".-", b: "-...", c: "-.-.", d: "-..", e: ".", f: "..-.", g: "--.", h: "....", i: "..", j: ".---", k: "-.-", l: ".-..", m: "--", n: "-.", o: "---", p: ".--.", q: "--.-", r: ".-.", s: "...", t: "-", u: "..-", v: "...-", w: ".--", x: "-..-", y: "-.--", z: "--..", 0: "-----", 1: ".----", 2: "..---", 3: "...--", 4: "....-", 5: ".....", 6: "-....", 7: "--...", 8: "---..", 9: "----." };
  def("time", "worldtime meeting tz", "tz 0200 TPE to LAX   |   tz 3pm london to tokyo", "convert a time between cities, airport codes or zones (daylight saving included); leave the time out for right now", async a => {
    const { zoneOf } = X, m = a.trim().match(/^(.*?)\s*(?:\bto\b|\bin\b|->|=>|>)\s*(.+)$/i); if (!m) U("usage: tz 0200 TPE to LAX   ·   tz 0132 eze to paris   ·   tz 3pm london to tokyo");
    let toks = m[1].trim().split(/\s+/).filter(Boolean), mins = null, used = new Set();
    toks.forEach((t, i) => { if (mins != null) return; const w = t.toLowerCase(); let k;
      if ((k = w.match(/^(\d{1,2}):(\d{2})(am|pm)?$/))) { mins = +k[1] * 60 + +k[2]; if (k[3]) mins = ((+k[1] % 12) + (k[3] === "pm" ? 12 : 0)) * 60 + +k[2]; used.add(i); }
      else if ((k = w.match(/^(\d{1,2})(am|pm)$/))) { mins = ((+k[1] % 12) + (k[2] === "pm" ? 12 : 0)) * 60; used.add(i); }
      else if (/^\d{1,2}$/.test(w) && /^(am|pm)$/i.test(toks[i + 1] || "")) { mins = ((+w % 12) + (/pm/i.test(toks[i + 1]) ? 12 : 0)) * 60; used.add(i); used.add(i + 1); }
      else if (/^\d{3,4}$/.test(w) && +w.slice(0, -2) < 24 && +w.slice(-2) < 60) { mins = +w.slice(0, -2) * 60 + +w.slice(-2); used.add(i); }
      else if (w === "noon") { mins = 720; used.add(i); } else if (w === "midnight") { mins = 0; used.add(i); } });
    const fromName = toks.filter((_, i) => !used.has(i)).join(" "), toName = m[2].trim(), z1 = zoneOf(fromName), z2 = zoneOf(toName);
    if (!z1) U(`I do not know "${fromName}". Try a city, an airport code like TPE or LAX, or a zone like Europe/Oslo.`); if (!z2) U(`I do not know "${toName}". Try a city, an airport code like TPE or LAX, or a zone like Europe/Oslo.`);
    const parts = (z, ms) => Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: z, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(new Date(ms)).map(p => [p.type, +p.value]));
    const offset = (z, ms) => { const p = parts(z, ms); return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(ms / 1000) * 1000; };
    const now = Date.now(); let utc;
    if (mins == null) utc = now; else { const p = parts(z1, now), guess = Date.UTC(p.year, p.month - 1, p.day, 0, mins); utc = guess - offset(z1, guess); utc = guess - offset(z1, utc); }   // today's date in the first place, at that clock time
    const show = (z, label) => { const d = new Date(utc), p = parts(z, utc); const wd = d.toLocaleDateString("en-US", { timeZone: z, weekday: "short", day: "numeric", month: "short" }), ab = new Intl.DateTimeFormat("en-US", { timeZone: z, timeZoneName: "short" }).formatToParts(d).find(x => x.type === "timeZoneName").value; return { text: `${pad(p.hour)}:${pad(p.minute)}  ${wd}  ${label} (${ab})`, day: Date.UTC(p.year, p.month - 1, p.day) }; };
    const nice = s => (/^[a-z]{3}$/i.test(s) ? s.toUpperCase() : s.replace(/\b\w/g, c => c.toUpperCase())), A1 = show(z1, nice(fromName)), A2 = show(z2, nice(toName)), dd = Math.round((A2.day - A1.day) / 864e5);
    await print([A1.text, `= ${A2.text}${dd ? `   (${dd > 0 ? "next" : "previous"} day)` : ""}`]);
  });

  /* ================= MATH and money ================= */
  const fact = n => { let r = 1; for (let i = 2; i <= n; i++) r *= i; return r; };

  /* ================= SYSTEM ================= */
  /* ================= MACROS: targets and "how much of this food" (maths in macros.js) ================= */
  const IDXM = { kcal: 0, protein: 1, fat: 2, carbs: 3, fiber: 4 }, g1 = v => n3(v), MN = { protein: "protein", fat: "fat", carbs: "carbs", fiber: "fiber", kcal: "calories" };
  def("fit", "macros macro", "macros   |   macros weight 71   |   macros kcal 2500   |   macros bulk 10   |   macros adjust 0.2", "daily protein, fat, carb and fiber targets from your body weight and calories; set them, or ask what to change from your weekly gain", async a => {
    let p = loadProfile(); const w = a.trim().toLowerCase().split(/\s+/), cmd = w[0] || "", v = parseFloat(w[1]);
    if (cmd === "weight" || cmd === "kg") { const kg = Number.isFinite(v) ? v : lastKg(); if (!kg) U("usage: macros weight 71   (or log a weigh-in first and use: macros weight)"); p = saveProfile({ ...p, kg }); await print(`✓ body weight ${trim(kg, 1)} kg; protein and fat follow it`); }
    else if (cmd === "kcal" || cmd === "calories") { if (!Number.isFinite(v)) U("usage: macros kcal 2500   (your maintenance calories)"); p = saveProfile({ ...p, kcal: v }); await print(`✓ maintenance ${thou(v)} kcal`); }
    else if (cmd === "bulk") { const x = Number.isFinite(v) ? v : 0; p = saveProfile({ ...p, bulk: x / 100 }); await print(x ? `✓ lean bulk +${trim(x, 1)}% on maintenance` : "✓ eating at maintenance"); }
    else if (cmd === "set") { const n = nums(a); if (n.length < 3) U("usage: macros set 70 183 22   (kg, cm, age)"); p = saveProfile({ ...p, kg: n[0], cm: n[1], age: n[2], sex: /\b(f|female)\b/i.test(a) ? "f" : "m" }); await print("✓ profile saved"); }
    else if (cmd === "adjust") { if (!Number.isFinite(v)) U("usage: macros adjust 0.2   (kg gained per week, averaged over 2 to 4 weeks)"); const r = adjustAdvice(p, v); await print([`${n3(r.pct)}% of body weight a week`, "  " + r.text, ...(r.add ? [`  new calories about ${thou(Math.round(p.kcal * (1 + p.bulk) + (r.add[0] + r.add[1]) / 2))} (that is ${r.add[0]} to ${r.add[1]} kcal)`] : [])]); return; }
    else if (cmd === "reset") { saveProfile({}); p = loadProfile(); await print("✓ back to the defaults"); }
    else if (cmd && cmd !== "show") U("macros weight 71 · kcal 2500 · bulk 10 · set 70 183 22 · adjust 0.2 · reset");
    const t = targets(p); await print([`${trim(p.kg, 1)} kg · ${p.cm} cm · ${p.age} y/o · ${p.bulk ? `lean bulk +${trim(p.bulk * 100, 1)}%` : "maintenance"} ${thou(Math.round(t.kcal))} kcal`,
      `  protein  ${t.perKg.protein.toFixed(1)} g/kg   ${g1(t.protein)} g   ${thou(Math.round(t.kcalOf.protein))} kcal`, `  fat      ${t.perKg.fat.toFixed(1)} g/kg   ${g1(t.fat)} g   ${thou(Math.round(t.kcalOf.fat))} kcal`, `  carbs    ${t.perKg.carbs.toFixed(1)} g/kg   ${g1(t.carbs)} g   ${thou(Math.round(t.kcalOf.carbs))} kcal`,
      `  fiber    ${g1(t.fiber)} g minimum (14 g per 1,000 kcal, never under 25)`, `  BMR ${thou(Math.round(bmr(p)))} · TDEE ${thou(Math.round(tdee(p)))} at 1.55, ${thou(Math.round(tdee(p, 1.725)))} at 1.725`]);
    await print("try: need chicken breast · need rice for carbs · need salmon have 40p 20c", "tm-dim");
  });
  def("fit", "need howmuch", "need chicken breast   |   need rice for carbs   |   need salmon have 40p 20c 10f", "how many grams of a food cover your macro targets (or what is left after what you already ate); usda before the name looks it up in the USDA database", async a => {
    let q = a.trim(); if (!q) U("usage: need chicken breast   ·   need rice for carbs   ·   need oats have 40p 20c   (p protein, c carbs, f fat, fi fiber)");
    const t = targets(loadProfile()), have = { protein: 0, fat: 0, carbs: 0, fiber: 0, kcal: 0 }, hm = q.match(/\b(?:have|had|ate|eaten|after)\s+(.*)$/i);
    if (hm) { q = q.slice(0, hm.index).trim(); for (const m of hm[1].matchAll(/(\d+(?:\.\d+)?)\s*(fi|fib|fiber|fibre|p|protein|f|fat|c|carbs?|k|kcal|cal)\b/gi)) { const u = m[2].toLowerCase(); have[u[0] === "p" ? "protein" : u.startsWith("fi") ? "fiber" : u[0] === "f" ? "fat" : u[0] === "c" && u !== "cal" ? "carbs" : "kcal"] += +m[1]; } }
    let only = null; const fm = q.match(/\b(?:for|to hit|hit)\s+(protein|fat|carbs?|fiber|fibre|calories|kcal)\b/i); if (fm) { q = q.slice(0, fm.index).trim(); const u = fm[1].toLowerCase(); only = u === "protein" ? "protein" : u === "fat" ? "fat" : u.startsWith("carb") ? "carbs" : u.startsWith("fib") ? "fiber" : "kcal"; }
    const web = /^usda\s+/i.test(q); q = q.replace(/^usda\s+/i, "").trim(); let food = web ? null : findFood(q), src = "";
    if (!food) { try { food = await usdaFood(q); src = food ? "USDA FoodData Central" : ""; } catch (e) { if (!web && !findFood(q)) U(`"${q}" is not in my short list, and the USDA look-up failed: ${e.message}`); throw e; } }
    if (!food) U(`could not find "${q}" in my list or in USDA. Try a plainer name, e.g. chicken breast, rice, oats, salmon, olive oil.`);
    const per = food.per100, left = { kcal: t.kcal - have.kcal - (have.kcal ? 0 : 4 * have.protein + 9 * have.fat + 4 * have.carbs), protein: t.protein - have.protein, fat: t.fat - have.fat, carbs: t.carbs - have.carbs, fiber: t.fiber - have.fiber };
    const rows = (only ? [only] : ["protein", "carbs", "fat", "fiber", "kcal"]).map(m => { const g = gramsFor(per, m, Math.max(0, left[m])); return { m, need: Math.max(0, left[m]), g }; });
    const unit = m => (m === "kcal" ? "kcal" : "g");
    await print([`${food.name}${src ? `  (${src})` : ""}   per 100 g: ${n3(per[0])} kcal · P ${n3(per[1])} · F ${n3(per[2])} · C ${n3(per[3])} · fiber ${n3(per[4])}${food.mono != null ? ` · mono ${n3(food.mono)} · poly ${n3(food.poly)}` : ""}`,
      hm ? `already had: ${["protein", "carbs", "fat", "fiber", "kcal"].filter(m => have[m]).map(m => `${trim(have[m], 1)} ${unit(m)} ${m}`).join(", ")}` : "against the full day" , ...rows.map(r => r.g == null ? `  ${MN[r.m].padEnd(9)} ${r.need ? `still ${g1(r.need)} ${unit(r.m)}` : "done"}   (this food has none)` : r.need <= 0 ? `  ${MN[r.m].padEnd(9)} done` : `  ${MN[r.m].padEnd(9)} still ${g1(r.need)} ${unit(r.m)}  →  ${g1(r.g)} g`)]);
    const pick = only ? rows[0] : rows.filter(r => r.g && r.m !== "kcal" && r.m !== "fiber").sort((x, y) => (per[IDXM[y.m]] * (y.need > 0)) / 1 - (per[IDXM[x.m]] * (x.need > 0)))[0];
    if (pick && pick.g && pick.need > 0) { const e = macrosOf(per, pick.g), over = []; if (e.fat > left.fat + 1 && pick.m !== "fat") over.push(`${g1(e.fat - Math.max(0, left.fat))} g too much fat`); if (e.carbs > left.carbs + 1 && pick.m !== "carbs") over.push(`${g1(e.carbs - Math.max(0, left.carbs))} g too much carbs`); if (e.protein > left.protein + 1 && pick.m !== "protein") over.push(`${g1(e.protein - Math.max(0, left.protein))} g too much protein`);
      await print([`eating ${g1(pick.g)} g to cover ${MN[pick.m]} gives ${g1(e.kcal)} kcal: P ${g1(e.protein)} · F ${g1(e.fat)} · C ${g1(e.carbs)} · fiber ${g1(e.fiber)}`, ...(over.length ? ["  but that overshoots: " + over.join(", ") + "; mix foods instead (need ... have ...)"] : [])], "tm-dim"); }
  });
  def("sys", "backup", "backup", "download your weigh-ins, aliases and notes mirror as a JSON file", async () => {
    const out = { saved: new Date().toISOString(), weights: loadWeights(), aliases: JSON.parse(localStorage.getItem("console.aliases") || "{}") }; const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(out, null, 2)], { type: "application/json" })); a.download = `dash-backup-${ymd(new Date())}.json`; a.click(); await print(`✓ downloaded ${a.download}`);
  });
}
