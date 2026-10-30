// The command line: an all-black terminal that does things in the dashboard with one short line each.
//   weight 70.4        set bench 135 8 3        add gym thu 5pm        done rocketry        note buy shoes
//   start study now    timer 25        go gym        today / next / status        undo        clc
// There is no AI behind it: commands are read by a small parser, answers come straight from your own data, and everything it changes can be undone.
import { esc, addDays, ymd } from "./util.js";
import { loadWeights, setWeight, delWeight } from "./weight.js";
import { PROGRAM } from "./gymlog.js";
import { makeCalc } from "./calc.js";

const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
const pad = n => String(n).padStart(2, "0"), hhmm = d => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const DOW = { sun: 0, sunday: 0, mon: 1, monday: 1, tue: 2, tues: 2, tuesday: 2, wed: 3, wednesday: 3, thu: 4, thur: 4, thurs: 4, thursday: 4, fri: 5, friday: 5, sat: 6, saturday: 6 };
const MON = { jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3, may: 4, jun: 5, june: 5, jul: 6, july: 6, aug: 7, august: 7, sep: 8, sept: 8, september: 8, oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11 };
const TABS = { health: "health", home: "health", h: "health", prod: "prod", productivity: "prod", timer: "prod", stickynote: "prod", notes: "prod", gym: "gym", gymlog: "gym", log: "gym", cal: "cal", calendar: "cal", console: "console", terminal: "console" };
const COMMANDS = ["help", "clc", "weight", "set", "add", "done", "note", "task", "timer", "start", "stop", "pause", "resume", "go", "today", "next", "status", "undo", "rm", "plot", "roots", "deriv", "integral", "deg", "rad", "prec"];
const ALIAS = { clear: "clc", cls: "clc", w: "weight", ev: "add", event: "add", n: "note", t: "task", d: "done", delete: "rm", del: "rm", remove: "rm", "?": "help", sleep: "status" };

// closeness of two words, for "did you mean" and for matching a typed exercise name to the real one
function dist(a, b) { const m = a.length, n = b.length, d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]); for (let j = 1; j <= n; j++) d[0][j] = j; for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return d[m][n]; }
const midnight = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const fmtDay = d => d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

// natural dates and times: "gym thu 5pm", "lunch tomorrow 12:30", "study 7-9pm", "dentist nov 4 3pm for 90m", "exam 11/5 9am"
function parseWhen(tokens) {
  const used = new Set(), now = new Date(); let date = null, start = null, end = null, dur = null;
  const toMin = (h, m, ap, fallbackAp) => { h = +h; m = +(m || 0); const a = ap || fallbackAp; if (a === "pm" && h < 12) h += 12; else if (a === "am" && h === 12) h = 0; else if (!a && h >= 1 && h <= 7) h += 12; return h * 60 + m; };
  const T = /^(\d{1,2})(?::(\d{2}))?(am|pm)?$/, R = /^(\d{1,2})(?::(\d{2}))?(am|pm)?[-–](\d{1,2})(?::(\d{2}))?(am|pm)?$/;
  tokens.forEach((raw, i) => {
    const w = raw.toLowerCase().replace(/[,.]$/, "");
    if (w === "today") { date = midnight(now); used.add(i); }
    else if (w === "tomorrow" || w === "tmr" || w === "tmrw") { date = midnight(addDaysD(now, 1)); used.add(i); }
    else if (w === "yesterday") { date = midnight(addDaysD(now, -1)); used.add(i); }
    else if (w in DOW) { const t = midnight(now); let k = (DOW[w] - t.getDay() + 7) % 7; date = midnight(addDaysD(t, k)); date._wd = true; used.add(i); }
    else if (/^\d{1,2}\/\d{1,2}(\/\d{2,4})?$/.test(w)) { const [mo, dd, yy] = w.split("/").map(Number); date = new Date(yy ? (yy < 100 ? 2000 + yy : yy) : now.getFullYear(), mo - 1, dd); used.add(i); }
    else if (w in MON && /^\d{1,2}(st|nd|rd|th)?$/.test((tokens[i + 1] || "").toLowerCase())) { date = new Date(now.getFullYear(), MON[w], parseInt(tokens[i + 1])); used.add(i); used.add(i + 1); }
    else if (/^\d{1,2}(st|nd|rd|th)?$/.test(w) && (tokens[i + 1] || "").toLowerCase() in MON) { date = new Date(now.getFullYear(), MON[tokens[i + 1].toLowerCase()], parseInt(w)); used.add(i); used.add(i + 1); }
    else if (w === "at" || w === "on" || w === "from" || w === "until") used.add(i);
    else if (w === "for" && /^\d+(\.\d+)?\s*(h|hr|hrs|hours?|m|min|mins|minutes?)$/.test((tokens[i + 1] || "").toLowerCase())) used.add(i);
    else if (/^\d+(\.\d+)?(h|hr|hrs|hours?|m|min|mins|minutes?)$/.test(w) && (tokens[i - 1] || "").toLowerCase() === "for") { const n = parseFloat(w); dur = /^h/.test(w.replace(/^[\d.]+/, "")) ? n * 60 : n; used.add(i); }
    else if (R.test(w) && start == null) { const m = w.match(R); const endAp = m[6] || null; end = toMin(m[4], m[5], endAp, null); start = toMin(m[1], m[2], m[3], endAp); if (start > end) start -= 12 * 60; used.add(i); }
    else if (T.test(w) && start == null && (/am|pm|:/.test(w) || (tokens[i - 1] || "").toLowerCase() === "at")) { const m = w.match(T); start = toMin(m[1], m[2], m[3], null); used.add(i); }
  });
  const title = tokens.filter((_, i) => !used.has(i)).join(" ").trim();
  const day = date ? midnight(date) : midnight(now);
  let s = new Date(day); const startMin = start != null ? start : (date ? 9 * 60 : (now.getHours() + 1) * 60);
  s.setMinutes(startMin);
  if (!date && start != null && s < now) s = new Date(addDaysD(s, 1));                         // a time already past, with no day given, means tomorrow
  if (date && date._wd && start != null && s < now) s = new Date(addDaysD(s, 7));               // "thu 5pm" said on Thursday evening means next Thursday
  const e = new Date(+s + (end != null && start != null ? (end - start) * 6e4 : (dur || 60) * 6e4));
  return { title, start: s, end: e, hasDate: !!date, hasTime: start != null };
}
function addDaysD(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }

export function initTerminal(root, { demo = false, api = {} } = {}) {
  root.innerHTML = `<div class="tm" id="tm"><div class="tm-log" id="tmLog"></div><div class="tm-line tm-live" id="tmLive"><span class="tm-p">›</span><span id="tmEcho"></span><i class="tm-cur"></i></div></div>
    <input id="tmIn" class="tm-in" type="text" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" aria-label="Command line">`;
  const $ = id => root.querySelector("#" + id), log = $("tmLog"), live = $("tmLive"), echo = $("tmEcho"), inp = $("tmIn"), scr = $("tm");
  let busy = false, booted = false, past = [], pi = -1, pending = null, undos = []; const calc = makeCalc();
  const bottom = () => { scr.scrollTop = scr.scrollHeight; }, sleep = ms => new Promise(r => setTimeout(r, ms));

  // output: commands answer at once; several lines appear one after another, quickly, so it still reads like a terminal
  async function print(lines, cls = "") {
    lines = [].concat(lines);
    for (const text of lines) { const d = document.createElement("div"); d.className = "tm-line " + cls; if (/^✓/.test(text) && !cls) d.classList.add("tm-ok"); d.textContent = text; log.appendChild(d); bottom(); if (lines.length > 1 && !reduce) await sleep(26); }
  }
  const err = t => print(t, "tm-err"), dim = t => print(t, "tm-dim");
  async function type(text, cls = "") {   // the boot text only
    const line = document.createElement("div"); line.className = "tm-line " + cls; log.appendChild(line);
    if (reduce) { line.textContent = text; return; }
    const cur = document.createElement("i"); cur.className = "tm-cur"; line.appendChild(cur); const node = document.createTextNode(""); line.insertBefore(node, cur);
    for (let i = 0; i < text.length; i += 2) { node.nodeValue = text.slice(0, i + 2); bottom(); await sleep(14); }
    node.nodeValue = text; cur.remove(); bottom();
  }
  const ask = (prompt, then) => { pending = then; return dim(prompt); };

  const A = () => api, today = () => ymd(new Date());
  const choose = async (label, options, then) => { await print([label, ...options.map((o, i) => `  ${i + 1}  ${o.label}`)]); await dim("type a number, or anything else to cancel"); pending = { type: "choose", options, then }; };

  /* ---------- the commands ---------- */
  const cmds = {
    async help() {
      await print(["COMMANDS", "", "weight 70.4            log your weight (also: weight 70.4 yesterday)", "set bench 135 8 3      log a gym set: exercise, lb, reps, sets", "add gym thu 5pm        add a calendar event (add lunch tomorrow 12:30 for 45m)", "done rocketry          mark a calendar event complete", "note buy shoes         add a line to Stickynote (task buy shoes adds a checkbox)", "start study now        start a focus session (timer 25 sets the minutes; stop, pause, resume)", "go gym                 jump to a tab: health, prod, gym, cal", "today  next  status    read your day, your next event, last night", "rm set / rm weight     delete the last set or today's weight (asks first)", "undo                   take back the last change", "clc                    clear the screen", "", "MATH  type any expression:  2+2   sqrt(2)   sin(pi/2)   10!   a=5   f(x)=x^2-3x   ans", "plot sin(x), cos(x) from -2pi to 2pi    graph, hover for exact values", "roots x^2-2    deriv x^3 at 2    integral sin(x) from 0 to pi    deg / rad    prec 10", "", "Cmd+K opens and closes this from any page. Up arrow recalls, Tab completes."], "tm-dim");
    },
    async clc() { log.innerHTML = ""; },
    async weight(args) {
      const toks = args.split(/\s+/).filter(Boolean), num = toks.find(t => /^\d+(\.\d+)?$/.test(t));
      const all = loadWeights();
      if (!num) { if (!all.length) return dim("no weigh-ins yet. weight 70.4 logs one."); const l = all[all.length - 1], p = all[all.length - 2]; return print(`${l.kg.toFixed(1)} kg on ${fmtDay(new Date(l.date + "T12:00"))}${p ? `, ${l.kg - p.kg >= 0 ? "+" : "−"}${Math.abs(l.kg - p.kg).toFixed(1)} vs ${fmtDay(new Date(p.date + "T12:00"))}` : ""}`); }
      const kg = Math.round(parseFloat(num) * 10) / 10; if (kg < 30 || kg > 250) return err("that does not look like a body weight in kg.");
      const rest = toks.filter(t => t !== num), d = parseWhen(rest), date = d.hasDate ? ymd(d.start) : today(), prev = all.find(e => e.date === date), before = [...all].reverse().find(e => e.date < date);
      setWeight(date, kg); undos.push({ label: `weight ${kg} kg`, fn: () => (prev ? setWeight(date, prev.kg) : delWeight(date)) });
      await print(`✓ ${kg.toFixed(1)} kg logged for ${fmtDay(new Date(date + "T12:00"))}${before ? ` (${kg - before.kg >= 0 ? "+" : "−"}${Math.abs(kg - before.kg).toFixed(1)} vs ${fmtDay(new Date(before.date + "T12:00"))})` : ""}`);
    },
    async set(args) {
      const gym = A().gym && A().gym(); if (!gym) return err("the gym log is not ready yet.");
      let s = args.replace(/(\d)\s*[x×]\s*(\d)/g, "$1 $2").replace(/(\d)\s*[x×]\s*(\d)/g, "$1 $2"); const toks = s.split(/\s+/).filter(Boolean), nums = [];
      while (toks.length && /^\d+(\.\d+)?$/.test(toks[toks.length - 1]) && nums.length < 3) nums.unshift(parseFloat(toks.pop()));
      if (nums.length < 2 || !toks.length) return err("usage: set <exercise> <lb> <reps> [sets]   e.g. set bench 135 8 3");
      const [wt, reps, sets = 1] = nums, q = toks.join(" ").toLowerCase().split(/\s+/);
      const names = [...new Map([...Object.entries(PROGRAM).flatMap(([day, l]) => l.map(([n]) => [n, day])), ...gym.entries.map(e => [e.exercise, e.day])]).entries()];
      const SYN = { bench: ["chest press", "incline", "press"], ohp: ["shoulder press"], pullup: ["pull-up", "pulldown"], chinup: ["pulldown"], lat: ["pulldown", "lat"], squat: ["squat", "leg press"], quad: ["extension"], quads: ["extension"], ham: ["curl"], hams: ["curl"], hamstring: ["curl"], calf: ["calf"], calves: ["calf"], bicep: ["curl"], biceps: ["curl"], tricep: ["triceps"], delt: ["lateral", "raise"], delts: ["lateral", "raise"], abs: ["crunch", "raise"], glute: ["hip thrust"], glutes: ["hip thrust"], back: ["row", "pulldown"], shrug: ["shrug"], fly: ["fly", "pec deck"], flys: ["fly", "pec deck"] };
      const forms = w => [w, ...(SYN[w] || [])];
      const score = n => { const low = n.toLowerCase(); const hit = q.filter(w => forms(w).some(f => low.includes(f))).length; if (hit === q.length) return 100 + hit * 10 - low.length / 10 + (low.includes(q.join(" ")) ? 45 : 0) + (low.startsWith(q[0]) ? 8 : 0); const fuzzy = q.filter(w => low.split(/[^a-z0-9]+/).some(t => dist(w, t) <= (w.length > 4 ? 2 : 1))).length; return fuzzy === q.length ? 50 + fuzzy * 5 - low.length / 10 : 0; };
      const ranked = names.map(([n, day]) => ({ n, day, sc: score(n) })).filter(x => x.sc > 0).sort((a, b) => b.sc - a.sc);
      if (!ranked.length) return err(`no exercise matches "${toks.join(" ")}". Yours include: ${names.slice(0, 10).map(x => x[0].replace(/ \(.*\)| \/.*/g, "")).join(", ")}.`);
      const go = async x => {
        const last = [...gym.entries].reverse().find(e => e.exercise === x.n), e = gym.add({ date: today(), day: x.day, exercise: x.n, weight: wt, reps, sets });
        undos.push({ label: `set ${x.n}`, fn: () => gym.remove(e.id), redo: null });
        await print(`✓ ${x.n}: ${wt} lb × ${reps}${sets > 1 ? " × " + sets : ""}  (${x.day})${last ? `  last: ${last.weight} × ${last.reps}${last.sets > 1 ? " × " + last.sets : ""}` : ""}`);
      };
      if (ranked.length > 1 && ranked[0].sc - ranked[1].sc < 8) return choose(`"${toks.join(" ")}" matches more than one exercise:`, ranked.slice(0, 5).map(x => ({ label: x.n, value: x })), o => go(o.value));
      await go(ranked[0]);
    },
    async add(args) {
      const cal = A().cal; if (!cal) return err("the calendar is not ready yet.");
      const w = parseWhen(args.split(/\s+/).filter(Boolean)); if (!w.title) return err("usage: add <title> [day] [time]   e.g. add gym thu 5pm");
      busy = true; try { const r = await cal.create({ title: w.title, start: w.start, end: w.end }); undos.push({ label: `event ${w.title}`, fn: () => cal.remove(r.id, r.cal) });
        await print(`✓ added: ${w.title}, ${fmtDay(w.start)} ${hhmm(w.start)}–${hhmm(w.end)}${w.hasTime ? "" : " (no time given, so a default slot)"}`); } finally { busy = false; }
    },
    async done(args) {
      const cal = A().cal; if (!cal) return err("the calendar is not ready yet."); const now = new Date();
      let list = args.trim() ? cal.find(args, { notDone: true }) : cal.events().filter(e => !e.allDay && !e.done && e.s <= now && midnight(e.s) <= midnight(now)).sort((a, b) => b.s - a.s).slice(0, 1);
      if (!list.length) return err(args.trim() ? `no open event in view matches "${args}".` : "no event is open right now. done <words from the title> marks one.");
      const go = async ev => { await cal.setDone(ev.id, true); if (!ev.done) return err(`could not mark "${ev.title}" complete.`); undos.push({ label: `done ${ev.title}`, fn: () => cal.setDone(ev.id, false) }); await print(`✓ marked complete: ${ev.title}`); };
      if (list.length > 1 && args.trim()) return choose(`"${args}" matches more than one event:`, list.slice(0, 5).map(e => ({ label: `${fmtDay(e.s)} ${e.allDay ? "all day" : hhmm(e.s)}  ${e.title}`, value: e })), o => go(o.value));
      await go(list[0]);
    },
    async note(args) { const t = A().tasks; if (!t) return err("Stickynote is not ready yet."); if (!args.trim()) return err("usage: note <text>"); const line = t.append(args.trim()); undos.push({ label: "note", fn: () => t.removeLine(line) }); await print(`✓ added to Stickynote: ${args.trim()}`); },
    async task(args) { const t = A().tasks; if (!t) return err("Stickynote is not ready yet."); if (!args.trim()) return err("usage: task <text>"); const line = t.append("[] " + args.trim()); undos.push({ label: "task", fn: () => t.removeLine(line) }); await print(`✓ task added to Stickynote: ${args.trim()}`); },
    async timer(args) { const m = parseInt(args); await cmds.start(m ? String(m) : ""); },
    async start(args) {
      const tm = A().timer; if (!tm) return err("the timer is not ready yet.");
      const words = args.replace(/\bnow\b/gi, "").trim().split(/\s+/).filter(Boolean), minTok = words.find(w => /^\d+$/.test(w) || /^\d+m(in)?$/.test(w)), min = minTok ? parseInt(minTok) : undefined, label = words.filter(w => w !== minTok).join(" ") || "focus";
      const was = tm.running; const mins = tm.start(min); undos.push({ label: "timer start", fn: () => tm.stop() });
      await print(`✓ ${label}: focus session started, ${mins} min${was ? " (the earlier session was replaced)" : ""}`); await dim("go prod to watch it.");
    },
    async stop() { const tm = A().timer; if (!tm || !tm.running) return dim("no timer is running."); tm.stop(); await print("✓ timer stopped"); },
    async pause() { const tm = A().timer; if (!tm || !tm.running) return dim("no timer is running."); tm.pause(); await print("✓ timer paused"); },
    async resume() { const tm = A().timer; if (!tm || !tm.running) return dim("no timer is running."); tm.resume(); await print("✓ timer resumed"); },
    async go(args) { const k = TABS[args.trim().toLowerCase()]; if (!k) return err(`go where? ${[...new Set(Object.keys(TABS))].filter(x => x.length > 2).join(", ")}`); dispatchEvent(new CustomEvent("goto", { detail: k })); },
    async today() {
      const cal = A().cal, ctx = window.__dashContext && window.__dashContext(), now = new Date(); const list = cal ? cal.events().filter(e => midnight(e.s) <= midnight(now) && e.e > midnight(now) && e.s < midnight(addDaysD(now, 1))).sort((a, b) => (b.allDay - a.allDay) || a.s - b.s) : [];
      await print([`${fmtDay(now)}${ctx ? `  ·  plan: ${ctx.plan.today}` : ""}`, ...(list.length ? list.map(e => `${e.done ? "✓" : e.allDay || e.e > now ? "·" : "·"} ${e.allDay ? "all day   " : hhmm(e.s) + "–" + hhmm(e.e)}  ${e.title}`) : ["  nothing scheduled"])], "tm-dim");
    },
    async next() { const cal = A().cal, now = new Date(); const e = cal && cal.events().filter(x => !x.allDay && !x.done && x.e > now).sort((a, b) => a.s - b.s)[0]; if (!e) return dim("nothing coming up in the loaded week."); const mins = Math.round((e.s - now) / 6e4), cur = e.s <= now; await print(`${cur ? "now" : mins < 60 ? `in ${mins} min` : mins < 1440 ? `in ${Math.floor(mins / 60)} h ${mins % 60} min` : fmtDay(e.s)}: ${e.title}, ${hhmm(e.s)}–${hhmm(e.e)}`); },
    async status() {
      const c = window.__dashContext && window.__dashContext(); if (!c) return dim("the numbers are not loaded yet.");
      const l = c.lastNight; await print(["LAST NIGHT", l ? `  ${l.sleep}, asleep by ${l.asleepBy}, woke ${l.wokeAt}, quality ${l.quality}` : "  no sleep recorded", `  sleep debt ${c.sleepDebt || "—"}`, "RECOVERY", `  resting heart rate ${c.recovery.restingHrToday ?? "—"} bpm, HRV ${c.recovery.hrvToday ?? "—"} ms, body check: ${c.recovery.bodyCheck}`, `PLAN  today ${c.plan.today}, tomorrow ${c.plan.tomorrow}`], "tm-dim");
    },
    async undo() { const u = undos.pop(); if (!u) return dim("nothing to undo."); busy = true; try { await u.fn(); await print(`↩ undone: ${u.label}`); } catch (e) { await err(`could not undo ${u.label}: ${e.message || e}`); } finally { busy = false; } },
    async rm(args) {
      const w = args.trim().split(/\s+/)[0].toLowerCase(), cal = A().cal, gym = A().gym && A().gym();
      if (w === "set") { const e = gym && gym.entries.length ? [...gym.entries].sort((a, b) => b.id - a.id)[0] : null; if (!e) return err("no sets to delete."); return ask(`delete ${e.exercise} ${e.weight} lb × ${e.reps}${e.sets > 1 ? " × " + e.sets : ""} from ${e.date}? (y/n)`, async () => { gym.remove(e.id); undos.push({ label: `deleted set ${e.exercise}`, fn: () => gym.add({ date: e.date, day: e.day, exercise: e.exercise, weight: e.weight, reps: e.reps, sets: e.sets }) }); await print("✓ set deleted"); }); }
      if (w === "weight") { const all = loadWeights(), e = all.find(x => x.date === today()) || all[all.length - 1]; if (!e) return err("no weigh-ins to delete."); return ask(`delete the ${e.kg.toFixed(1)} kg weigh-in from ${e.date}? (y/n)`, async () => { delWeight(e.date); undos.push({ label: "deleted weigh-in", fn: () => setWeight(e.date, e.kg) }); await print("✓ weigh-in deleted"); }); }
      if (w === "event") { const q = args.trim().slice(5).trim(); const list = cal && q ? cal.find(q) : []; if (!list.length) return err(q ? `no event in view matches "${q}".` : "usage: rm event <words from the title>"); const ev = list[0]; return ask(`delete "${ev.title}" (${fmtDay(ev.s)}) from Google Calendar? This cannot be undone. (y/n)`, async () => { await cal.remove(ev.id, ev.cal); await print("✓ event deleted"); }); }
      await err("rm what? rm set, rm weight, rm event <title>");
    },
  };

  /* ---------- math ---------- */
  const top = s => { const out = []; let d = 0, cur = ""; for (const ch of s) { if (ch === "(") d++; if (ch === ")") d--; if ((ch === "," || ch === ";") && d === 0) { out.push(cur); cur = ""; } else cur += ch; } if (cur.trim()) out.push(cur); return out.map(x => x.trim()).filter(Boolean); };
  const num = s => { const v = calc.evaluate(s); if (v.kind !== "val" || !Number.isFinite(v.value)) throw new Error(`"${s}" is not a number`); return v.value; };
  const range = s => {   // "... from A to B", "... [A, B]" or "... A B" (plain numbers or pi) at the end; defaults to -10 to 10
    let m = s.match(/^(.*?)\s+from\s+(.+?)\s+to\s+(.+)$/i) || s.match(/^(.*?)\s*\[\s*(.+?)\s*,\s*(.+?)\s*\]\s*$/) || s.match(/^(.*?)\s+(-?[\d.]+(?:e-?\d+)?(?:\s*\*?\s*pi)?)\s+(-?[\d.]+(?:e-?\d+)?(?:\s*\*?\s*pi)?)\s*$/i);
    if (!m) return { src: s.trim(), a: -10, b: 10 }; const a = num(m[2]), b = num(m[3]); if (!(b > a)) throw new Error("the range needs a smaller number first"); return { src: m[1].trim(), a, b };
  };
  const out7 = (v, c = calc) => c.fmt(v);
  async function showValue(r) {
    if (r.kind === "def") return print(`✓ ${r.text}`);
    if (r.kind === "set") return print(`${r.name} = ${calc.fmt(r.value)}`);
    const lines = [`= ${calc.fmt(r.value)}`]; if (Number.isFinite(r.value) && !calc.trustworthy(r.value)) lines.push("  beyond about 1e8 only the first 15 digits can be trusted");
    return print(lines);
  }
  const cleanName = s => (/^[A-Za-z_]\w*$/.test(s) && calc.S.funcs[s] ? `${s}(x)` : s);
  Object.assign(cmds, {
    async plot(args) {
      if (!args.trim()) return err("usage: plot sin(x), x^2/4 from -2pi to 2pi");
      const { src, a, b } = range(args), fs = top(src).map(cleanName); if (!fs.length || fs.length > 4) return err("plot one to four functions of x, separated by commas.");
      const P = calc.plot(fs, a, b), box = document.createElement("div"); box.className = "tm-plot";
      box.innerHTML = `<div class="tm-leg">${P.legend.map(l => `<span><i style="background:${l.c}"></i>${esc(l.q)}</span>`).join("")}</div>${P.svg}<div class="tm-read">move over the graph for exact values</div>`; log.appendChild(box);
      const svg = box.querySelector("svg"), cross = svg.querySelector(".tm-cross"), read = box.querySelector(".tm-read");
      svg.addEventListener("pointermove", e => {
        const r = svg.getBoundingClientRect(), vx = (e.clientX - r.left) / r.width * P.W; if (vx < P.L || vx > P.W - P.R) { cross.style.display = "none"; return; }
        const x = P.a + (vx - P.L) / (P.W - P.L - P.R) * (P.b - P.a); cross.style.display = ""; cross.querySelector(".v").setAttribute("x1", vx); cross.querySelector(".v").setAttribute("x2", vx);
        const ys = P.fs.map(o => o.f(x)); ys.forEach((y, k) => { const c = cross.querySelector(".d" + k); if (Number.isFinite(y)) { c.setAttribute("cx", vx); c.setAttribute("cy", P.Y(y)); c.style.display = ""; } else c.style.display = "none"; });
        read.textContent = `x = ${calc.fmt(x, 7)}    ` + ys.map((y, k) => `${fs.length > 1 ? "f" + (k + 1) : "y"} = ${calc.fmt(y, 7)}`).join("    ");
      });
      svg.addEventListener("pointerleave", () => { cross.style.display = "none"; });
      bottom();
      const lines = P.fs.map((o, k) => { const r = calc.roots(o.f, a, b).slice(0, 8); return r.length ? `roots${fs.length > 1 ? " of " + fs[k] : ""}: ${r.map(v => calc.fmt(v)).join(", ")}` : null; }).filter(Boolean);
      if (lines.length) await print(lines, "tm-dim");
    },
    async roots(args) { const { src, a, b } = range(args); if (!src) return err("usage: roots x^2-2 [from -5 to 5]"); const f = calc.fnOf(cleanName(src)), r = calc.roots(f.f, a, b); await print(r.length ? r.map(v => `x = ${calc.fmt(v)}`) : `no roots between ${calc.fmt(a)} and ${calc.fmt(b)}`); },
    async deriv(args) { const m = args.match(/^(.*?)\s+at\s+(.+)$/i); if (!m) return err("usage: deriv x^3 at 2"); const f = calc.fnOf(cleanName(m[1].trim())), a = num(m[2]); await print(`d/dx at x = ${calc.fmt(a)}:  ${calc.fmt(calc.deriv(f.f, a))}`); },
    async integral(args) { const m = args.match(/^(.*?)\s+from\s+(.+?)\s+to\s+(.+)$/i); if (!m) return err("usage: integral sin(x) from 0 to pi"); const f = calc.fnOf(cleanName(m[1].trim())), a = num(m[2]), b = num(m[3]); await print(`∫ from ${calc.fmt(a)} to ${calc.fmt(b)}:  ${calc.fmt(calc.integral(f.f, a, b))}`); },
    async deg() { calc.S.deg = true; await print("✓ angles in degrees"); },
    async rad() { calc.S.deg = false; await print("✓ angles in radians"); },
    async prec(args) { const n = parseInt(args); if (!n) return print(`${calc.S.dp} decimals (the default is 7)`); if (n < 1 || n > 12) return err("choose 1 to 12 decimals."); calc.S.dp = n; await print(`✓ showing ${n} decimals${n > 8 ? "; large numbers lose digits past about 15 in total" : ""}`); },
  });

  /* ---------- reading a line ---------- */
  async function run(line) {
    line = line.trim(); if (!line) return;
    past.unshift(line); pi = -1;
    const q = document.createElement("div"); q.className = "tm-line tm-q"; q.innerHTML = `<span class="tm-p">›</span> ${esc(line)}`; log.appendChild(q); bottom();
    if (pending) {   // answering a question the console asked; anything else cancels it and is read as a new command
      const p = pending; pending = null;
      if (typeof p === "function") { if (/^(y|yes)$/i.test(line)) { busy = true; try { await p(); } catch (e) { await err(e.message || String(e)); } busy = false; return; } if (/^(n|no|cancel)$/i.test(line)) { await dim("cancelled."); return; } }
      else if (p.type === "choose") { const n = parseInt(line); if (/^\d+$/.test(line) && n >= 1 && n <= p.options.length) { busy = true; try { await p.then(p.options[n - 1]); } catch (e) { await err(e.message || String(e)); } busy = false; return; } if (/^(n|no|cancel)$/i.test(line) || /^\d+$/.test(line)) { await dim("cancelled."); return; } }
    }
    const m = line.match(/^(\S+)\s*(.*)$/), word = m[1].toLowerCase(), rest = m[2];
    const isMath = /^[A-Za-z_]\w*\s*(\([^)]*\))?\s*=[^=]/.test(line);   // a = 5 and f(x) = x^2 are math, not commands
    let name = isMath ? "=" : (ALIAS[word] || word);
    if (/^start\s+\S/i.test(line) || name === "start") name = "start";
    if (!COMMANDS.includes(name) && (isMath || /[\d+\-*/^()=!π]|^(pi|e|tau|phi|ans)\b/i.test(line))) {   // not a command: read it as math
      try { await showValue(calc.evaluate(line)); } catch (e) { await err(e.message || String(e)); }
      return;
    }
    if (!COMMANDS.includes(name)) {
      const near = COMMANDS.map(c => ({ c, d: dist(word, c) })).sort((a, b) => a.d - b.d)[0];
      return near && near.d <= 2 ? err(`unknown command "${word}". did you mean "${near.c}"?`) : err(`unknown command "${word}". type help.`);
    }
    busy = true; live.hidden = true;
    try { await cmds[name](name === "start" ? (/^start\b/i.test(line) ? line.replace(/^start\s*/i, "") : rest) : rest); }
    catch (e) { await err(e && e.message ? e.message : String(e)); }
    busy = false; live.hidden = false; inp.focus(); bottom();
  }

  async function boot() {
    if (booted) return; booted = true;
    await type("DASH // COMMAND LINE", "tm-head"); await type("─────────────────────────────", "tm-head");
    await dim("weight 70.4   set bench 135 8 3   add gym thu 5pm   done rocketry   note buy shoes   start study now"); await dim("2+2   sqrt(2)   f(x)=x^2-3x+1   plot sin(x), cos(x)   roots x^2-2   integral sin(x) from 0 to pi");
    await dim("help lists everything. undo takes back the last change. Cmd+K opens this from anywhere."); await print("");
  }

  inp.addEventListener("input", () => { echo.textContent = inp.value; bottom(); });
  inp.addEventListener("keydown", e => {
    if (e.key === "Enter" && !busy) { const v = inp.value; inp.value = ""; echo.textContent = ""; run(v); }
    else if (e.key === "Tab") { e.preventDefault(); const v = inp.value.trim().toLowerCase(); if (v && !/\s/.test(v)) { const hit = COMMANDS.filter(c => c.startsWith(v)); if (hit.length === 1) { inp.value = hit[0] + " "; echo.textContent = inp.value; } } }
    else if (e.key === "ArrowUp" && past.length) { e.preventDefault(); pi = Math.min(past.length - 1, pi + 1); inp.value = past[pi]; echo.textContent = inp.value; }
    else if (e.key === "ArrowDown") { e.preventDefault(); pi = Math.max(-1, pi - 1); inp.value = pi < 0 ? "" : past[pi]; echo.textContent = inp.value; }
  });
  root.addEventListener("click", () => { if (!getSelection().toString()) inp.focus(); });
  addEventListener("tab", e => { if (e.detail === "console") setTimeout(() => { boot(); inp.focus(); }, 450); });
  if (document.body.dataset.tab === "console") { boot(); setTimeout(() => inp.focus(), 500); }
}
