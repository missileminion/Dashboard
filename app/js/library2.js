// More console commands (calendar editing, task editing, health reviews, gym extras, reminders, everyday calculators and text tools).
// addMore(X) registers them through the same def() as library.js, so help, Tab completion, suggestions and blue highlighting pick them up with no extra wiring.
import { e1rm } from "./gymlog.js";

export function addMore(X) {
  const { def, print, dim, ask, choose, err, undos, parseWhen, fmtDay, hhmm, midnight, addDaysD, call, history, H, series, MET, metric, calApi, tasksApi, gymApi, taskList, pickTask, rewrite, TASK, lastKg, loadWeights,
    pad, hmm, num, nn, mean, sdev, trim, thou, chart, link, dotHBars, timers, clk, rd, html, U, esc, ymd, addDays, n3, nums, relDays, longDay, copyText, beep, rankExercises, debtNow } = X;
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
  def("cal", "undone reopen-event", "undone <event>", "mark a completed calendar event as not done", async a => {
    const l = calApi().find(a).filter(e => e.done); if (!a.trim()) U("usage: undone study"); if (!l.length) U(`no completed event matches "${a}".`); await calApi().setDone(l[0].id, false); await print(`✓ reopened: ${l[0].title}`);
  });
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
  def("cal", "freeday", "freeday", "the lightest day in view", async () => {
    const last = Math.max(...calApi().events().map(e => +midnight(e.s))), days = [...Array(7)].map((_, i) => midnight(addDaysD(new Date(), i))).filter(d => +d <= last), hrs = d => timed().filter(e => midnight(e.s).getTime() === d.getTime()).reduce((s, e) => s + (e.e - e.s) / 36e5, 0), best = days.map(d => ({ d, h: hrs(d) })).sort((x, y) => x.h - y.h)[0];
    await print(`${longDay(best.d)}: ${trim(best.h, 1)} h scheduled (${relDays(best.d)})`);
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
  def("tasks", "donetasks completed", "donetasks", "the tasks you have ticked off", async () => { const d = taskList().filter(t => t.done); await print(d.length ? d.map(t => `  ✓ ${t.text}`) : "no finished tasks", "tm-dim"); });
  def("tasks", "addtasks batch", "addtasks milk; eggs; bread", "add several tasks at once, separated by semicolons", async a => {
    const items = a.split(/;|\n/).map(s => s.trim()).filter(Boolean); if (!items.length) U("usage: addtasks milk; eggs; bread"); const api = tasksApi(), lines = items.map(t => api.append(`- [ ] ${t}`));
    undos.push({ label: `${items.length} tasks`, fn: () => lines.forEach(l => api.removeLine(l)) }); await print(`✓ added ${items.length} task${items.length > 1 ? "s" : ""}`);
  });
  def("tasks", "taskstats", "taskstats", "how many tasks are open and finished", async () => { const t = taskList(), d = t.filter(x => x.done).length; await print(`${t.length - d} open, ${d} finished${t.length ? ` (${Math.round(d / t.length * 100)}% done)` : ""}`, "tm-dim"); });
  def("tasks", "lastnote", "lastnote", "the most recent non-task line in Stickynote", async () => { const l = tasksApi().text().split("\n").filter(x => x.trim() && !TASK.test(x)); await print(l.length ? l[l.length - 1] : "no notes", "tm-dim"); });

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
  def("fit", "deficit", "deficit <kg per week>", "the daily calorie gap for a given weekly weight change", async a => { const v = nums(a)[0]; if (v == null) U("usage: deficit 0.5   (kg to lose per week)"); await print(`${v >= 0 ? "losing" : "gaining"} ${trim(Math.abs(v), 2)} kg a week = about ${thou(Math.abs(v) * 7700 / 7)} kcal a day ${v >= 0 ? "below" : "above"} maintenance`); });
  def("fit", "macros", "macros <kcal> [protein% carb% fat%]", "grams of protein, carbohydrate and fat for a calorie target (default 30/40/30)", async a => {
    const n = nums(a); if (!n.length) U("usage: macros 2500   or   macros 2500 35 40 25"); const [k, p = 30, c = 40, f = 30] = n; if (Math.abs(p + c + f - 100) > 1) U("the three percentages must add to 100.");
    await print([`${thou(k)} kcal`, `  protein ${Math.round(k * p / 100 / 4)} g   carbohydrate ${Math.round(k * c / 100 / 4)} g   fat ${Math.round(k * f / 100 / 9)} g`], "tm-dim");
  });
  def("fit", "bmr", "bmr <kg> <cm> <age> <m|f>", "basal metabolic rate (Mifflin-St Jeor); kg defaults to your latest weight", async a => {
    const n = nums(a), sex = /\bf/i.test(a) ? "f" : "m"; let kg, cm, age; if (n.length >= 3) [kg, cm, age] = n; else if (n.length === 2) { kg = lastKg(); [cm, age] = n; } else U("usage: bmr 72 178 30 m"); if (kg == null) U("log a weight first.");
    await print(`${thou(10 * kg + 6.25 * cm - 5 * age + (sex === "m" ? 5 : -161))} kcal a day at rest`);
  });
  def("fit", "maxhr", "maxhr <age>", "estimated maximum heart rate two ways", async a => { const age = nums(a)[0]; if (!age) U("usage: maxhr 30"); await print(`${Math.round(220 - age)} bpm (220 − age)   ${Math.round(208 - 0.7 * age)} bpm (Tanaka, usually closer)`); });
  def("fit", "cooper", "cooper <km in 12 min>", "VO2 max estimate from the 12-minute Cooper run", async a => { const km = nums(a)[0]; if (!km) U("usage: cooper 2.8"); await print(`VO2 max about ${trim((km * 1000 - 504.9) / 44.73, 1)}`); });
  def("fit", "whr", "whr <waist> <hip>", "waist to hip ratio", async a => { const [w, h] = nums(a); if (!w || !h) U("usage: whr 80 98"); const r = w / h; await print(`${r.toFixed(2)}  (${r < 0.85 ? "low risk range" : r < 0.95 ? "moderate range" : "higher range"} for most adults)`); });

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
  def("gym", "lastsession", "lastsession", "when you last trained and what you did", async () => {
    const e = entries(); if (!e.length) U("no sets logged yet."); const d = e.map(x => x.date).sort().pop(), l = e.filter(x => x.date === d); await print([`${d} (${Math.round((midnight(new Date()) - new Date(d + "T12:00")) / 864e5)} days ago)`, ...l.map(x => `  ${x.exercise} ${x.weight} lb × ${x.reps}${x.sets > 1 ? " × " + x.sets : ""}`)], "tm-dim");
  });
  def("gym", "ratio", "ratio <exercise>", "your best estimated one-rep max as a multiple of body weight", async a => {
    const kg = lastKg(); if (kg == null) U("log a weight first."); const rk = rankExercises(a, entries()); if (!rk.length) U(`no exercise matches "${a}".`); const l = entries().filter(e => e.exercise === rk[0].n); if (!l.length) U(`no sets logged for ${rk[0].n}.`);
    const best = Math.max(...l.map(e => e1rm(e.weight, e.reps))), r = best * 0.45359237 / kg; await print(`${rk[0].n}: e1RM ${Math.round(best)} lb = ${r.toFixed(2)} × body weight (${n3(kg)} kg)`);
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
  def("timer", "reminders", "reminders", "reminders and alarms that are waiting", async () => { await print(REM.length ? REM.map(r => `  ${String(r.id).padStart(2)}  ${hhmm(new Date(r.due))}  ${r.text || "reminder"}`) : "none waiting", "tm-dim"); });
  def("timer", "unremind", "unremind <number | all>", "cancel a reminder", async a => { const k = a.trim(); if (!k) U("usage: unremind 2   or   unremind all"); const hit = /^all$/i.test(k) ? [...REM] : REM.filter(r => r.id === +k); if (!hit.length) U("no such reminder."); hit.forEach(dropRem); await print(`✓ cancelled ${hit.length}`); });

  /* ================= TEXT ================= */
  const words = s => s.replace(/([a-z0-9])([A-Z])/g, "$1 $2").split(/[^A-Za-z0-9]+/).filter(Boolean).map(w => w.toLowerCase());
  def("text", "snake", "snake <text>", "snake_case", async a => print(words(a).join("_")));
  def("text", "kebab", "kebab <text>", "kebab-case", async a => print(words(a).join("-")));
  def("text", "camel", "camel <text>", "camelCase", async a => print(words(a).map((w, i) => (i ? w[0].toUpperCase() + w.slice(1) : w)).join("")));
  def("text", "pascal", "pascal <text>", "PascalCase", async a => print(words(a).map(w => w[0].toUpperCase() + w.slice(1)).join("")));
  def("text", "words wordcount", "words <text>", "characters, words and lines in some text", async a => print(`${a.length} characters, ${(a.trim() ? a.trim().split(/\s+/).length : 0)} words, ${a ? a.split("\n").length : 0} line${a.split("\n").length === 1 ? "" : "s"}`));
  def("text", "rot13", "rot13 <text>", "rot13 (applying it twice gives the original back)", async a => print(a.replace(/[a-z]/gi, c => String.fromCharCode((c <= "Z" ? 90 : 122) >= (c = c.charCodeAt(0) + 13) ? c : c - 26))));
  const MORSE = { a: ".-", b: "-...", c: "-.-.", d: "-..", e: ".", f: "..-.", g: "--.", h: "....", i: "..", j: ".---", k: "-.-", l: ".-..", m: "--", n: "-.", o: "---", p: ".--.", q: "--.-", r: ".-.", s: "...", t: "-", u: "..-", v: "...-", w: ".--", x: "-..-", y: "-.--", z: "--..", 0: "-----", 1: ".----", 2: "..---", 3: "...--", 4: "....-", 5: ".....", 6: "-....", 7: "--...", 8: "---..", 9: "----." };
  def("text", "morse", "morse <text | dots and dashes>", "text to Morse code and back", async a => { const t = a.trim(); if (!t) U("usage: morse sos"); if (/^[.\-/ ]+$/.test(t)) { const inv = Object.fromEntries(Object.entries(MORSE).map(([k, v]) => [v, k])); return print(t.split(/ \/ | {3}/).map(w => w.split(" ").map(c => inv[c] || "?").join("")).join(" ")); } await print(t.toLowerCase().split("").map(c => (c === " " ? "/" : MORSE[c] || "")).filter(Boolean).join(" ")); });
  def("text", "urlencode", "urlencode <text>", "percent-encode text for a web address", async a => print(encodeURIComponent(a)));
  def("text", "urldecode", "urldecode <text>", "decode percent-encoded text", async a => { try { await print(decodeURIComponent(a)); } catch { U("that is not valid percent-encoding."); } });
  def("text", "json", "json <json text>", "tidy JSON so it is readable", async a => { try { await print(JSON.stringify(JSON.parse(a), null, 2).split("\n")); } catch (e) { U(`that is not valid JSON: ${e.message}`); } });
  def("text", "ascii charcode", "ascii <character | number>", "the code of a character, or the character for a code", async a => { const t = a.trim(); if (!t) U("usage: ascii A   or   ascii 65"); await print(/^\d+$/.test(t) ? `${t} = "${String.fromCodePoint(+t)}"` : [...t].map(c => `"${c}" = ${c.codePointAt(0)} (0x${c.codePointAt(0).toString(16)})`)); });
  def("text", "sortlines", "sortlines a; b; c", "sort items separated by semicolons, or numbers separated by spaces", async a => { const s = a.includes(";") ? a.split(";").map(x => x.trim()).filter(Boolean) : a.trim().split(/\s+/); const numeric = s.every(x => /^-?\d+(\.\d+)?$/.test(x)); await print((numeric ? s.sort((x, y) => x - y) : s.sort((x, y) => x.localeCompare(y))).join(a.includes(";") ? "; " : " ")); });
  def("text", "dedupe unique", "dedupe a b a c", "remove repeated words or items", async a => { const s = a.includes(";") ? a.split(";").map(x => x.trim()).filter(Boolean) : a.trim().split(/\s+/); await print([...new Set(s)].join(a.includes(";") ? "; " : " ")); });
  def("text", "lorem", "lorem [sentences]", "placeholder text", async a => { const W = "lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua enim ad minim veniam quis nostrud exercitation ullamco laboris nisi aliquip ex ea commodo consequat".split(" "), n = Math.min(20, +(nums(a)[0] || 3)); let k = 0; await print(Array.from({ length: n }, () => { const len = 6 + (k % 7); const s = Array.from({ length: len }, () => W[k++ % W.length]).join(" "); return s[0].toUpperCase() + s.slice(1) + "."; }).join(" ")); });
  def("text", "color colour", "color #ff8800 | color 255 136 0", "convert a colour between hex, RGB and HSL", async a => {
    let r, g, b; const t = a.trim(); let m = t.match(/^#?([0-9a-f]{6})$/i) || t.match(/^#?([0-9a-f]{3})$/i); if (m) { let h = m[1]; if (h.length === 3) h = [...h].map(c => c + c).join(""); [r, g, b] = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)); } else { const n = nums(t); if (n.length !== 3) U("usage: color #ff8800   or   color 255 136 0"); [r, g, b] = n; }
    const R = r / 255, G = g / 255, Bb = b / 255, mx = Math.max(R, G, Bb), mn = Math.min(R, G, Bb), l = (mx + mn) / 2, d = mx - mn, s = d ? d / (1 - Math.abs(2 * l - 1)) : 0, h = !d ? 0 : mx === R ? ((G - Bb) / d + 6) % 6 : mx === G ? (Bb - R) / d + 2 : (R - G) / d + 4;
    await print([html(`<span style="display:inline-block;width:2.4em;height:1em;background:rgb(${r},${g},${b});vertical-align:-2px;border-radius:2px"></span> #${[r, g, b].map(v => pad(Math.round(v).toString(16))).join("")}`), `rgb(${r}, ${g}, ${b})`, `hsl(${Math.round(h * 60)}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%)`]);
  });
  def("text", "epoch unix", "epoch [seconds | now | date]", "unix time to a date, a date to unix time, or the current unix time", async a => {
    const t = a.trim(); if (!t || /^now$/i.test(t)) return print(String(Math.floor(Date.now() / 1000))); if (/^\d{9,13}$/.test(t)) { const d = new Date(t.length > 11 ? +t : +t * 1000); return print(`${d.toString().slice(0, 33)}  (${d.toISOString()})`); }
    const w = parseWhen(t.split(/\s+/)); if (!w.hasDate && !w.hasTime) U("usage: epoch 1700000000   or   epoch nov 4 3pm"); await print(String(Math.floor(w.start / 1000)));
  });
  def("time", "worldtime meeting", "worldtime 3pm london to tokyo", "what a time in one city is in another", async a => {
    const { ZONES } = X; const m = a.match(/^(.*?)\s+(?:in|to)\s+(.+)$/i); if (!m) U("usage: worldtime 3pm london to tokyo"); const parts = m[1].trim().split(/\s+/), city = parts.pop().toLowerCase(), z1 = ZONES[city], z2 = ZONES[m[2].trim().toLowerCase()]; if (!z1 || !z2) U("I know the cities in the time command: tokyo, london, ny, la, sydney, paris...");
    const w = parseWhen(parts); if (!w.hasTime) U("give a time, like 3pm."); const d = new Date(), off = z => { const f = new Intl.DateTimeFormat("en-US", { timeZone: z, hour: "2-digit", minute: "2-digit", hour12: false, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(d), g = k => +f.find(p => p.type === k).value; return Date.UTC(g("year"), g("month") - 1, g("day"), g("hour") % 24, g("minute")) - d.getTime(); };
    const m1 = Math.round(off(z1) / 9e5) * 15, m2 = Math.round(off(z2) / 9e5) * 15, t2 = w.start.getHours() * 60 + w.start.getMinutes() - m1 + m2, day = Math.floor(t2 / 1440), mm = ((t2 % 1440) + 1440) % 1440;
    await print(`${w.start.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })} in ${city}  =  ${clockStr(mm)} in ${m[2].trim().toLowerCase()}${day ? ` (${day > 0 ? "next" : "previous"} day)` : ""}`);
  });

  /* ================= MATH and money ================= */
  def("math", "scale", "scale 16:9 1920", "the other side of a ratio: scale 16:9 1920 gives 1080", async a => { const m = a.match(/(\d+(?:\.\d+)?)\s*[:x/]\s*(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)/i); if (!m) U("usage: scale 16:9 1920"); const [, w, h, v] = m.map(Number); await print(`${trim(v)} wide → ${trim(v * h / w, 3)} tall   |   ${trim(v)} tall → ${trim(v * w / h, 3)} wide`); });
  def("math", "salary wage", "salary 60000 | salary 25/h", "yearly pay as monthly, weekly, daily and hourly (40 h weeks), or the reverse", async a => {
    const v = nums(a)[0]; if (v == null) U("usage: salary 60000   or   salary 25/h"); const perH = /\/\s*h|hour/i.test(a) ? v : v / 2080; await print([`yearly   ${thou(perH * 2080)}`, `monthly  ${thou(perH * 2080 / 12)}`, `weekly   ${thou(perH * 40)}`, `daily    ${thou(perH * 8)}`, `hourly   ${trim(perH, 2)}`], "tm-dim");
  });
  def("math", "sale discount", "sale 20% 80", "price after a discount, and how much you save", async a => { const n = nums(a); if (n.length < 2) U("usage: sale 20% 80"); const [p, price] = n; await print(`${trim(price * (1 - p / 100), 2)}  (save ${trim(price * p / 100, 2)})`); });
  def("math", "split", "split <total> <people> [tip%]", "share a bill evenly, with an optional tip", async a => { const [t, n, tip = 0] = nums(a); if (!t || !n) U("usage: split 86 4 15"); const all = t * (1 + tip / 100); await print(`${trim(all / n, 2)} each  (total ${trim(all, 2)}${tip ? ` with ${tip}% tip` : ""})`); });
  const fact = n => { let r = 1; for (let i = 2; i <= n; i++) r *= i; return r; };
  def("math", "ncr", "ncr <n> <r>", "combinations: ways to choose r from n", async a => { const [n, r] = nums(a); if (n == null || r == null || r > n || n > 170) U("usage: ncr 52 5"); let v = 1; for (let i = 1; i <= Math.min(r, n - r); i++) v = v * (n - Math.min(r, n - r) + i) / i; await print(thou(Math.round(v))); });
  def("math", "npr permute", "npr <n> <r>", "permutations: ordered ways to pick r from n", async a => { const [n, r] = nums(a); if (n == null || r == null || r > n || n > 170) U("usage: npr 10 3"); await print(thou(fact(n) / fact(n - r))); });
  def("math", "geo shape", "geo circle 5 | geo rect 3 4 | geo tri 3 4 5 | geo sphere 2", "area, perimeter and volume of common shapes", async a => {
    const t = a.trim().split(/\s+/), k = (t.shift() || "").toLowerCase(), n = t.map(Number); if (!k || n.some(Number.isNaN)) U("usage: geo circle 5   geo rect 3 4   geo tri 3 4 5   geo sphere 2   geo cylinder 2 5");
    if (k.startsWith("circ")) return print([`area ${trim(Math.PI * n[0] ** 2, 6)}`, `circumference ${trim(2 * Math.PI * n[0], 6)}`]); if (k.startsWith("rect")) return print([`area ${trim(n[0] * n[1], 6)}`, `perimeter ${trim(2 * (n[0] + n[1]), 6)}`, `diagonal ${trim(Math.hypot(n[0], n[1]), 6)}`]);
    if (k.startsWith("tri")) { if (n.length === 2) return print(`area ${trim(n[0] * n[1] / 2, 6)}   hypotenuse ${trim(Math.hypot(n[0], n[1]), 6)}`); const [x, y, z] = n, s = (x + y + z) / 2, A = Math.sqrt(s * (s - x) * (s - y) * (s - z)); return Number.isNaN(A) ? U("those sides cannot make a triangle.") : print(`area ${trim(A, 6)}   perimeter ${trim(x + y + z, 6)}`); }
    if (k.startsWith("sph")) return print([`volume ${trim(4 / 3 * Math.PI * n[0] ** 3, 6)}`, `surface ${trim(4 * Math.PI * n[0] ** 2, 6)}`]); if (k.startsWith("cyl")) return print([`volume ${trim(Math.PI * n[0] ** 2 * n[1], 6)}`, `surface ${trim(2 * Math.PI * n[0] * (n[0] + n[1]), 6)}`]); if (k.startsWith("cone")) return print(`volume ${trim(Math.PI * n[0] ** 2 * n[1] / 3, 6)}`);
    U("shapes: circle, rect, tri, sphere, cylinder, cone");
  });
  def("math", "dms", "dms 51.5074 | dms 51 30 26", "decimal degrees to degrees-minutes-seconds and back", async a => { const n = nums(a); if (!n.length) U("usage: dms 51.5074   or   dms 51 30 26"); if (n.length === 1) { const v = Math.abs(n[0]), d = Math.floor(v), m = Math.floor((v - d) * 60), s = ((v - d) * 60 - m) * 60; return print(`${n[0] < 0 ? "−" : ""}${d}° ${m}′ ${trim(s, 2)}″`); } const [d, m = 0, s = 0] = n; await print(trim(Math.sign(d || 1) * (Math.abs(d) + m / 60 + s / 3600), 6)); });
  def("math", "growth", "growth <start> <end> <years>", "compound annual growth rate between two values", async a => { const [s, e, y] = nums(a); if (!s || !e || !y) U("usage: growth 1000 1800 5"); await print(`${trim((Math.pow(e / s, 1 / y) - 1) * 100, 2)}% a year`); });
  def("math", "ruleof72 doubling", "doubling <rate%>", "years to double at a growth rate (rule of 72, and exact)", async a => { const r = nums(a)[0]; if (!r) U("usage: doubling 7"); await print(`about ${trim(72 / r, 1)} years (exactly ${trim(Math.log(2) / Math.log(1 + r / 100), 2)})`); });
  def("math", "percentile", "percentile <p> <numbers>", "the p-th percentile of a list", async a => { const n = nums(a); if (n.length < 2) U("usage: percentile 90 3 5 7 9 11"); const p = n.shift(), s = n.sort((x, y) => x - y), k = (s.length - 1) * p / 100, f = Math.floor(k); await print(trim(s[f] + (s[Math.min(f + 1, s.length - 1)] - s[f]) * (k - f), 6)); });

  /* ================= SYSTEM ================= */
  def("sys", "backup", "backup", "download your weigh-ins, aliases and notes mirror as a JSON file", async () => {
    const out = { saved: new Date().toISOString(), weights: loadWeights(), aliases: JSON.parse(localStorage.getItem("console.aliases") || "{}") }; const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(out, null, 2)], { type: "application/json" })); a.download = `dash-backup-${ymd(new Date())}.json`; a.click(); await print(`✓ downloaded ${a.download}`);
  });
}
