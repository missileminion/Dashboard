// The command line: an all-black terminal that does things in the dashboard with one short line each.
//   add gym thu 5pm        done rocketry        note buy shoes
//   start study now    timer 25        go gym        today / next / status        undo        clc
// There is no AI behind it: commands are read by a small parser, answers come straight from your own data, and everything it changes can be undone.
// Plain-English phrasing ("how did I sleep", "I weigh 70.4") is read by intent.js; calculator is a mode with its own prompt (exit leaves it).
// The core commands live here; about 130 more (gym stats, health numbers, calendar, tasks, conversions, fitness and math tools) are in library.js.
import { esc, addDays, ymd } from "./util.js";
import { loadWeights, setWeight, delWeight } from "./weight.js";
import { makeCalc } from "./calc.js";
import { makeMatlab } from "./matlab.js";
import { buildLibrary, rankExercises, dist, GROUPS } from "./library.js";
import { interpret, findCommands, words2math } from "./intent.js";
import { dotPlot, dotDigits, C } from "./dots.js";

const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
const pad = n => String(n).padStart(2, "0"), hhmm = d => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const DOW = { sun: 0, sunday: 0, mon: 1, monday: 1, tue: 2, tues: 2, tuesday: 2, wed: 3, wednesday: 3, thu: 4, thur: 4, thurs: 4, thursday: 4, fri: 5, friday: 5, sat: 6, saturday: 6 };
const MON = { jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3, may: 4, jun: 5, june: 5, jul: 6, july: 6, aug: 7, august: 7, sep: 8, sept: 8, september: 8, oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11 };
const TABS = { health: "health", home: "health", h: "health", prod: "prod", productivity: "prod", timer: "prod", stickynote: "prod", notes: "prod", gym: "gym", gymlog: "gym", log: "gym", cal: "cal", calendar: "cal", console: "console", terminal: "console" };
// the core commands: [group, name, usage, description, aliases]
const CORE = [
  ["log", "add", "add gym thu 5pm", "add a calendar event (add lunch tomorrow 12:30 for 45m)", ["ev", "event"]],
  ["log", "done", "done rocketry", "mark a calendar event complete", ["d"]], ["log", "note", "note buy shoes", "add a line to Stickynote", ["n"]], ["log", "task", "task buy shoes", "add a checkbox to Stickynote", ["t"]],
  ["log", "rm", "delete set | weight | <event title words>", "delete the last set, today's weight or a calendar event (asks first)", ["delete", "del", "remove"]], ["log", "undo", "undo", "take back the last change"], ["sys", "end", "end", "stop whatever is looping: the calculator, a question being asked, a countdown or stopwatch"], ["sys", "rerun", "rerun [n]", "run your previous command again (rerun 2 for the one before)", ["!!"]],
  ["log", "today", "today", "your day: the plan and the events"], ["log", "next", "next", "your next calendar event"], ["log", "status", "status", "last night, recovery and the plan"], ["log", "go", "go gym", "jump to a tab: health, prod, gym, cal"],
  ["timer", "timer", "timer 25", "start a focus session of that many minutes"], ["timer", "start", "start study now", "start a focus session (a label is optional)"], ["timer", "stop", "stop", "stop the focus timer"], ["timer", "pause", "pause", "pause the focus timer"], ["timer", "resume", "resume", "resume the focus timer"],
  ["math", "calculator", "calculator", "a calculator: sums, x or × multiplies, ans is the last result; exit leaves", ["calc", "calculate"]], ["math", "plot", "plot sin(x), cos(x) from -2pi to 2pi", "graph up to four functions, hover for exact values"], ["math", "roots", "roots x^2-2", "where a function crosses zero"], ["math", "deriv", "deriv x^3 at 2", "the slope of a function at a point"], ["math", "integral", "integral sin(x) from 0 to pi", "the area under a function"],
  ["math", "deg", "deg", "angles in degrees"], ["math", "rad", "rad", "angles in radians"], ["math", "prec", "prec 10", "decimals shown (1 to 12, default 7)"],
  ["sys", "help", "help [group | command | word]", "this guide; help gym lists a group, help last explains one, help sleep searches", ["?"]], ["sys", "clc", "clc", "clear the screen", ["clear", "cls"]]
];

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
    else if (/^\d{1,2}(?::\d{2})?$/.test(w) && start == null && /^(am|pm)$/.test((tokens[i + 1] || "").toLowerCase())) { const m = w.match(/^(\d{1,2})(?::(\d{2}))?$/); start = toMin(m[1], m[2], tokens[i + 1].toLowerCase(), null); used.add(i); used.add(i + 1); }   // 9 pm
    else if (/^\d{3,4}$/.test(w) && start == null && +w.slice(0, -2) < 24 && +w.slice(-2) < 60 && (i > 0 || tokens.length === 1)) { start = +w.slice(0, -2) * 60 + +w.slice(-2); used.add(i); }   // 2100 or 930
    else if ((w === "noon" || w === "midday" || w === "midnight") && start == null) { start = w === "midnight" ? 0 : 720; used.add(i); }
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
  root.innerHTML = `<div class="tm" id="tm"><div class="tm-log" id="tmLog"></div><div class="tm-line tm-live" id="tmLive"><span class="tm-p" id="tmP">›</span><span id="tmEcho"></span><i class="tm-cur"></i></div><div class="tm-sug" id="tmSug"></div></div>
    <input id="tmIn" class="tm-in" type="text" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" aria-label="Command line">`;
  const $ = id => root.querySelector("#" + id), log = $("tmLog"), live = $("tmLive"), sug = $("tmSug"), echo = $("tmEcho"), inp = $("tmIn"), scr = $("tm");
  let busy = false, booted = false, past = [], pi = -1, pending = null, undos = [], lastOut = "", mode = null, halt = false, curLine = ""; const calc = makeCalc(), ml = makeMatlab(calc);
  try { localStorage.removeItem("console.aikey"); localStorage.removeItem("console.aimodel"); } catch {}   // the Gemini fallback was removed; forget the old key
  const ALS = "console.aliases", userAl = () => { try { return JSON.parse(localStorage.getItem(ALS)) || {}; } catch { return {}; } };
  const setAlias = (k, v) => { const a = userAl(); if (v == null) delete a[k]; else a[k] = v; try { localStorage.setItem(ALS, JSON.stringify(a)); } catch {} };
  const bottom = () => { scr.scrollTop = scr.scrollHeight; }, sleep = ms => new Promise(r => setTimeout(r, ms));

  // output: commands answer at once; several lines appear one after another, quickly, so it still reads like a terminal
  // a line is text, {html}, {node, text} (a chart) or {buttons:[{label, go}]} (links that switch page when you press them)
  async function print(lines, cls = "") {
    lines = [].concat(lines);
    if (cls !== "tm-err") lastOut = lines.map(t => (t && t.html ? t.html.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">") : t && (t.node || t.buttons) ? t.text || "" : t)).filter(t => t !== "").join("\n");
    for (const text of lines) {
      if (halt) break;
      const d = document.createElement("div"); d.className = "tm-line " + cls;
      if (text && text.node) { d.className = "tm-line tm-chart"; d.appendChild(text.node); }
      else if (text && text.buttons) { d.className = "tm-line tm-btns"; text.buttons.forEach(b => { const k = document.createElement("button"); k.type = "button"; k.className = "tm-btn"; k.textContent = b.label; k.addEventListener("click", e => { e.stopPropagation(); if (b.go) dispatchEvent(new CustomEvent("goto", { detail: b.go })); }); d.appendChild(k); }); }
      else if (text && text.html != null) d.innerHTML = text.html; else { if (/^✓/.test(text) && !cls) d.classList.add("tm-ok"); d.textContent = text; }
      log.appendChild(d); bottom(); if (lines.length > 1 && lines.length <= 14 && !reduce) await sleep(9);
    }
  }
  const err = t => { devLog(t); return print(t, "tm-err"); }, dim = t => print(t, "tm-dim");
  async function type(text, cls = "") {   // the boot text only
    const line = document.createElement("div"); line.className = "tm-line " + cls; log.appendChild(line);
    if (reduce) { line.textContent = text; return; }
    const cur = document.createElement("i"); cur.className = "tm-cur"; line.appendChild(cur); const node = document.createTextNode(""); line.insertBefore(node, cur);
    for (let i = 0; i < text.length; i += 2) { node.nodeValue = text.slice(0, i + 2); bottom(); await sleep(14); }
    node.nodeValue = text; cur.remove(); bottom();
  }
  const ask = (prompt, then) => { pending = then; return dim(prompt); };
  const askInput = (prompt, then, literal = false) => { pending = { type: "input", then, literal }; return dim(prompt); };   // a question answered in free text; "cancel" drops it

  const A = () => api, today = () => ymd(new Date());

  /* ---------- the developer dock: errors worth fixing, command examples, and every running timer ---------- */
  const DEV = "console.devlog", SEEN = "console.devseen", timers = new Map(), fmtClock = sec => { sec = Math.max(0, Math.round(sec)); const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), x = sec % 60; return h ? `${h}:${pad(m)}:${pad(x)}` : `${pad(m)}:${pad(x)}`; };
  let errs = [], lastSeen = 0, dtab = "timers", trows = new Map(); try { errs = JSON.parse(localStorage.getItem(DEV)) || []; lastSeen = +localStorage.getItem(SEEN) || 0; } catch {}
  const when = t => { const d = new Date(t); return `${ymd(d)} ${hhmm(d)}`; };
  const devLog = t => {   // every error the console shows is kept here (this browser only), with what was typed
    const msg = [].concat(t).join(" ").trim(); if (!msg) return; const last = errs[errs.length - 1];
    if (last && last.line === curLine && last.msg === msg) { last.n = (last.n || 1) + 1; last.t = Date.now(); } else errs.push({ t: Date.now(), line: curLine, msg, calc: !!mode });
    errs = errs.slice(-300); try { localStorage.setItem(DEV, JSON.stringify(errs)); } catch {} if (dock) { if (dtab === "errors" && !panel.hidden) renderErrors(); tickDock(); }
  };
  root.insertAdjacentHTML("beforeend", `<div class="cdev" id="cdev"><div class="cdev-panel" hidden><div class="cdev-tabs"><button type="button" data-p="timers">Timers</button><button type="button" data-p="errors">Errors</button><button type="button" data-p="examples">Examples</button></div><div class="cdev-body"></div></div><button class="cdev-btn" type="button"><span class="cdev-t">developer</span><b class="cdev-n" hidden></b></button></div>`);
  const dock = root.querySelector("#cdev"), panel = dock.querySelector(".cdev-panel"), body = dock.querySelector(".cdev-body"), dbtn = dock.querySelector(".cdev-btn"), dt = dock.querySelector(".cdev-t"), dn = dock.querySelector(".cdev-n");
  const timersApi = { add(id, spec) { timers.set(id, spec); dockOpen("timers"); }, remove(id) { timers.delete(id); tickDock(); }, has: id => timers.has(id) };
  function collect() {
    const out = [], tm = A().timer;
    if (tm && tm.running) { const st = tm.status, left = st.allot - st.elapsed, over = left < 0; out.push({ id: "focus", label: st.mode === "work" ? "focus session" : "break", text: (over ? "-" : "") + fmtClock(Math.abs(left)), sub: st.paused ? "paused" : over ? "over time" : "left", color: over ? C.red : C.lit }); }
    timers.forEach((sp, id) => { const g = sp.get(); out.push({ id, label: sp.label, text: g.text, sub: g.sub || "", color: g.red ? C.red : C.lit }); });
    return out;
  }
  const stopTimer = id => { if (id === "focus") { const tm = A().timer; tm && tm.stop(); } else { const sp = timers.get(id); if (sp && sp.stop) sp.stop(); } tickDock(); };
  function renderTimers() {
    const list = collect();
    if (!list.length) { if (!body.querySelector(".cdev-empty")) { body.innerHTML = `<div class="cdev-empty">no timers running.<br>timer 25 · countdown 5m · stopwatch · remind 20m call mom</div>`; trows.clear(); } return; }
    body.querySelector(".cdev-empty")?.remove();
    for (const [id, r] of trows) if (!list.some(x => x.id === id)) { r.el.remove(); trows.delete(id); }
    list.forEach(x => {
      let r = trows.get(x.id);
      if (!r) { const el = document.createElement("div"); el.className = "cdev-trow"; el.innerHTML = `<div class="cdev-dg"></div><div class="cdev-tx"><b></b><span></span></div><button class="cdev-x" type="button">stop</button>`; body.appendChild(el); r = { el, text: null, color: null, dg: el.querySelector(".cdev-dg"), b: el.querySelector("b"), sp: el.querySelector("span") }; trows.set(x.id, r); el.querySelector(".cdev-x").addEventListener("click", () => stopTimer(x.id)); }
      if (r.text !== x.text || r.color !== x.color) { r.dg.replaceChildren(dotDigits(x.text, { color: x.color, pitch: 4.2 })); r.text = x.text; r.color = x.color; }
      r.b.textContent = x.label; r.sp.textContent = x.sub;
    });
  }
  const errText = () => `DASH CONSOLE ERRORS (${errs.length})\n\n` + errs.map((e, i) => `${i + 1}. ${when(e.t)}${e.calc ? " [calculator]" : ""}${e.n > 1 ? ` x${e.n}` : ""}\n   typed:  ${e.line}\n   result: ${e.msg}`).join("\n\n");
  function renderErrors() {
    lastSeen = Date.now(); try { localStorage.setItem(SEEN, String(lastSeen)); } catch {}
    body.innerHTML = `<div class="cdev-bar"><button type="button" data-a="copy">copy all</button><button type="button" data-a="clear">clear</button><span>${errs.length} logged. Paste them to Claude to tune the commands.</span></div>` +
      (errs.length ? [...errs].reverse().map(e => `<div class="cdev-err"><div class="cdev-meta">${when(e.t)}${e.n > 1 ? ` · ×${e.n}` : ""}${e.calc ? " · calculator" : ""}</div><div class="cdev-in"><span>›</span> ${esc(e.line || "")}</div><div class="cdev-msg">${esc(e.msg)}</div></div>`).join("") : `<div class="cdev-empty">no errors yet.<br>When a command fails it is logged here with what you typed.</div>`);
    tickDock();
  }
  function renderExamples() {
    const meta = allMeta(), used = [...new Set(past)].slice(0, 10);
    body.innerHTML = (used.length ? `<div class="cdev-h">you typed recently</div>` + used.map(l => `<div class="cdev-ex" data-fill="${esc(l)}"><b class="tm-fn">${esc(l)}</b></div>`).join("") : "") +
      Object.entries(GROUPS).map(([k, label]) => { const ms = meta.filter(m => m.cat === k); return ms.length ? `<div class="cdev-h">${esc(label)}</div>` + ms.map(m => `<div class="cdev-ex" data-fill="${esc(m.n + " ")}"><b class="tm-fn">${esc(m.use)}</b><span>${esc(m.d)}</span></div>`).join("") : ""; }).join("");
  }
  function renderDock() {
    dock.querySelectorAll(".cdev-tabs button").forEach(b => b.classList.toggle("on", b.dataset.p === dtab));
    body.innerHTML = ""; trows.clear(); body.scrollTop = 0;
    if (dtab === "timers") renderTimers(); else if (dtab === "errors") renderErrors(); else renderExamples();
  }
  function dockOpen(tab) { if (tab) dtab = tab; panel.hidden = false; renderDock(); tickDock(); }
  function tickDock() {
    const list = collect(), unseen = errs.filter(e => e.t > lastSeen).length;
    dt.textContent = list.length ? (list.length === 1 ? `${list[0].text} · ${list[0].label}` : `${list.length} timers`) : "developer";
    dbtn.classList.toggle("run", !!list.length); dn.hidden = !unseen || (dtab === "errors" && !panel.hidden); dn.textContent = unseen;
    if (!panel.hidden && dtab === "timers") renderTimers();
  }
  dbtn.addEventListener("click", () => { if (!panel.hidden) { panel.hidden = true; return; } const unseen = errs.some(e => e.t > lastSeen); dockOpen(collect().length ? "timers" : unseen ? "errors" : dtab); });
  dock.querySelector(".cdev-tabs").addEventListener("click", e => { const b = e.target.closest("button"); if (b) { dtab = b.dataset.p; renderDock(); tickDock(); } });
  body.addEventListener("click", e => {
    const a = e.target.closest("[data-a]"), f = e.target.closest("[data-fill]");
    if (a && a.dataset.a === "copy") { const t = errText(), done = () => { a.textContent = "copied ✓"; setTimeout(() => { a.textContent = "copy all"; }, 1400); }; (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(done, () => { const ta = document.createElement("textarea"); ta.value = t; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); done(); } catch {} ta.remove(); }); }
    if (a && a.dataset.a === "clear") { errs = []; try { localStorage.removeItem(DEV); } catch {} renderErrors(); }
    if (f) { inp.value = f.dataset.fill; echo.innerHTML = hl(inp.value); sugRender(); panel.hidden = true; inp.focus(); }
  });
  dock.addEventListener("click", e => e.stopPropagation());
  setInterval(tickDock, 250);

  // end: stop whatever is looping (a question being asked, the calculator, a countdown or stopwatch)
  async function endAll(hadQuestion) {
    const done = []; if (hadQuestion) done.push("the open question"); if (mode) { setMode(null); done.push("the calculator"); }
    [...timers.values()].forEach(sp => { if (sp.loop) { done.push(sp.label); if (sp.stop) sp.stop(); } });
    const tm = A().timer; if (!done.length) return dim(tm && tm.running ? "nothing is looping. The focus timer is still going: stop ends it." : "nothing is running to end.");
    await print(`✓ ended: ${done.join(", ")}`);
  }
  const choose = async (label, options, then) => { await print([label, ...options.map((o, i) => `  ${i + 1}  ${o.label}`)]); await dim("type a number, or anything else to cancel"); pending = { type: "choose", options, then }; };

  /* ---------- the commands ---------- */
  const cmds = {
    async help(args) {
      const q = (args || "").trim().toLowerCase(), meta = allMeta(), line = m => `  ${m.use.padEnd(38)} ${m.d}`;
      if (!q) {
        const rows = Object.entries(GROUPS).map(([k, label]) => { const ms = meta.filter(m => m.cat === k); return ms.length ? `help ${k.padEnd(8)} ${label.padEnd(20)} ${ms.map(m => m.n).slice(0, 9).join(" ")}${ms.length > 9 ? " …" : ""}` : null; }).filter(Boolean);
        return print(["COMMANDS", `${meta.length} of them, in ${rows.length} groups`, "", ...rows, "", "help <group> lists a group in full. help <command> explains one. help <word> searches (try: help sleep).", "MATH is built in: type 2+2, sqrt(2), f(x)=x^2-3x, plot sin(x). Commands turn blue when recognised.", "Cmd+K opens and closes this from any page. Up arrow recalls, Tab completes, undo takes back changes, end stops a loop.", "The developer button (bottom right) keeps your errors to paste, shows running timers, and lists command examples."], "tm-dim");
      }
      if (q === "all") return print(Object.entries(GROUPS).flatMap(([k, label]) => { const ms = meta.filter(m => m.cat === k); return ms.length ? ["", label.toUpperCase(), ...ms.map(line)] : []; }), "tm-dim");
      if (GROUPS[q]) return print([GROUPS[q].toUpperCase(), ...meta.filter(m => m.cat === q).map(line)], "tm-dim");
      const one = meta.find(m => m.n === q || (m.al || []).includes(q));
      const hits = meta.filter(m => m !== one && (m.n.includes(q) || m.d.toLowerCase().includes(q) || m.use.toLowerCase().includes(q)));
      if (one) return print([one.use, `  ${one.d}`, ...(one.al && one.al.length ? [`  also: ${one.al.join(", ")}`] : []), ...(hits.length ? ["", `related to "${q}"`, ...hits.slice(0, 8).map(line)] : [])], "tm-dim");
      return hits.length ? print([`matching "${q}"`, ...hits.slice(0, 24).map(line)], "tm-dim") : err(`nothing matches "${q}". help lists the groups.`);
    },
    async clc() { log.innerHTML = ""; },
    async add(args) {
      const cal = A().cal; if (!cal) return err("the calendar is not ready yet.");
      if (!args.trim()) return askInput("what, and when?   e.g. gym thu 5pm   ·   lunch tomorrow 12:30 for 45m   (or cancel)", l => exec("add " + l));
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
    async note(args) { const t = A().tasks; if (!t) return err("Stickynote is not ready yet."); if (!args.trim()) return askInput("what should the note say?   (or cancel)", l => exec("note " + l), true); const line = t.append(args.trim()); undos.push({ label: "note", fn: () => t.removeLine(line) }); await print(`✓ added to Stickynote: ${args.trim()}`); },
    async task(args) { const t = A().tasks; if (!t) return err("Stickynote is not ready yet."); if (!args.trim()) return askInput("what is the task?   (or cancel)", l => exec("task " + l), true); const line = t.append("- [ ] " + args.trim()); undos.push({ label: "task", fn: () => t.removeLine(line) }); await print(`✓ task added to Stickynote: ${args.trim()}`); },
    async timer(args) { const m = parseInt(args); await cmds.start(m ? String(m) : ""); },
    async start(args) {
      const tm = A().timer; if (!tm) return err("the timer is not ready yet.");
      const words = args.replace(/\bnow\b/gi, "").trim().split(/\s+/).filter(Boolean), minTok = words.find(w => /^\d+$/.test(w) || /^\d+m(in)?$/.test(w)), min = minTok ? parseInt(minTok) : undefined, label = words.filter(w => w !== minTok).join(" ") || "focus";
      const was = tm.running; const mins = tm.start(min); undos.push({ label: "timer start", fn: () => tm.stop() });
      await print(`✓ ${label}: focus session started, ${mins} min${was ? " (the earlier session was replaced)" : ""}`); dockOpen("timers");
    },
    async stop() { const tm = A().timer; if (!tm || !tm.running) return dim("no timer is running."); tm.stop(); await print("✓ timer stopped"); },
    async pause() { const tm = A().timer; if (!tm || !tm.running) return dim("no timer is running."); tm.pause(); await print("✓ timer paused"); },
    async resume() { const tm = A().timer; if (!tm || !tm.running) return dim("no timer is running."); tm.resume(); await print("✓ timer resumed"); },
    async go(args) { const k = TABS[args.trim().toLowerCase()]; if (!args.trim()) return askInput("go where?   health · prod · gym · cal   (or cancel)", l => exec("go " + l)); if (!k) return err(`go where? ${[...new Set(Object.keys(TABS))].filter(x => x.length > 2).join(", ")}`); dispatchEvent(new CustomEvent("goto", { detail: k })); },
    async today() {
      const cal = A().cal, ctx = window.__dashContext && window.__dashContext(), now = new Date(); const list = cal ? cal.events().filter(e => midnight(e.s) <= midnight(now) && e.e > midnight(now) && e.s < midnight(addDaysD(now, 1))).sort((a, b) => (b.allDay - a.allDay) || a.s - b.s) : [];
      await print([`${fmtDay(now)}${ctx ? `  ·  plan: ${ctx.plan.today}` : ""}`, ...(list.length ? list.map(e => `${e.done ? "✓" : e.allDay || e.e > now ? "·" : "·"} ${e.allDay ? "all day   " : hhmm(e.s) + "–" + hhmm(e.e)}  ${e.title}`) : ["  nothing scheduled"])], "tm-dim");
    },
    async next() { const cal = A().cal, now = new Date(); const e = cal && cal.events().filter(x => !x.allDay && !x.done && x.e > now).sort((a, b) => a.s - b.s)[0]; if (!e) return dim("nothing coming up in the loaded week."); const mins = Math.round((e.s - now) / 6e4), cur = e.s <= now; await print(`${cur ? "now" : mins < 60 ? `in ${mins} min` : mins < 1440 ? `in ${Math.floor(mins / 60)} h ${mins % 60} min` : fmtDay(e.s)}: ${e.title}, ${hhmm(e.s)}–${hhmm(e.e)}`); },
    async status() {
      const c = window.__dashContext && window.__dashContext(); if (!c) return dim("the numbers are not loaded yet.");
      const l = c.lastNight; await print(["LAST NIGHT", l ? `  ${l.sleep}, asleep by ${l.asleepBy}, woke ${l.wokeAt}, quality ${l.quality}` : "  no sleep recorded", `  sleep debt ${c.sleepDebt || "—"}`, "RECOVERY", `  resting heart rate ${c.recovery.restingHrToday ?? "—"} bpm, HRV ${c.recovery.hrvToday ?? "—"} ms, body check: ${c.recovery.bodyCheck}`, `PLAN  today ${c.plan.today}, tomorrow ${c.plan.tomorrow}`], "tm-dim");
    },
    async end() { await endAll(false); },
    async rerun(args) { const n = +args.trim() || 1, h = past.filter(l => !/^(rerun|!!)\b/.test(l)), l = h[n - 1]; if (!l) return err("nothing to repeat yet."); await dim(`→ ${l}`); return exec(l, true); },
    async undo() { const u = undos.pop(); if (!u) return dim("nothing to undo."); busy = true; try { await u.fn(); await print(`↩ undone: ${u.label}`); } catch (e) { await err(`could not undo ${u.label}: ${e.message || e}`); } finally { busy = false; } },
    async rm(args) {
      let w = args.trim().split(/\s+/)[0].toLowerCase(); const cal = A().cal, gym = A().gym && A().gym();
      if (!args.trim()) return askInput("delete what?   set (last set) · weight · or words from an event title   (or cancel)", l => exec("rm " + l));
      if (/^(last|latest)$/.test(w)) { args = args.trim().slice(w.length).trim() || "set"; w = args.split(/\s+/)[0].toLowerCase(); }
      if (/^(sets?|lift)$/.test(w)) w = "set"; if (/^(weigh-?ins?|weights?)$/.test(w)) w = "weight"; if (w === "event" || w === "events") w = "event";
      if (w === "set") { const e = gym && gym.entries.length ? [...gym.entries].sort((a, b) => b.id - a.id)[0] : null; if (!e) return err("no sets to delete."); return ask(`delete ${e.exercise} ${e.weight} lb × ${e.reps}${e.sets > 1 ? " × " + e.sets : ""} from ${e.date}? (y/n)`, async () => { gym.remove(e.id); undos.push({ label: `deleted set ${e.exercise}`, fn: () => gym.add({ date: e.date, day: e.day, exercise: e.exercise, weight: e.weight, reps: e.reps, sets: e.sets }) }); await print("✓ set deleted"); }); }
      if (w === "weight") { const all = loadWeights(), e = all.find(x => x.date === today()) || all[all.length - 1]; if (!e) return err("no weigh-ins to delete."); return ask(`delete the ${e.kg.toFixed(1)} kg weigh-in from ${e.date}? (y/n)`, async () => { delWeight(e.date); undos.push({ label: "deleted weigh-in", fn: () => setWeight(e.date, e.kg) }); await print("✓ weigh-in deleted"); }); }
      if (w === "event" || cal) { const q = (w === "event" ? args.trim().slice(5) : args).trim(); let list = cal && q ? cal.find(q) : []; if (!list.length && cal && q) { const t = parseWhen(q.split(/\s+/)).title; if (t && t !== q) list = cal.find(t).filter(e => !w || true); }
        if (list.length > 1) { const pick = list.slice(0, 5); return choose(`"${q}" matches more than one event:`, pick.map(e => ({ label: `${fmtDay(e.s)} ${e.allDay ? "all day" : hhmm(e.s)}  ${e.title}`, value: e })), o => ask(`delete "${o.value.title}" (${fmtDay(o.value.s)}) from Google Calendar? This cannot be undone. (y/n)`, async () => { await cal.remove(o.value.id, o.value.cal); await print("✓ event deleted"); })); } if (!list.length) return err(q ? `no event in view matches "${q}".` : "usage: rm event <words from the title>"); const ev = list[0]; return ask(`delete "${ev.title}" (${fmtDay(ev.s)}) from Google Calendar? This cannot be undone. (y/n)`, async () => { await cal.remove(ev.id, ev.cal); await print("✓ event deleted"); }); }
      await err("delete what? delete set, delete weight, or delete <words from an event title>");
    },
  };

  /* ---------- calculator mode ---------- */
  const MODECMD = new Set(["exit", "quit", "q", "back", "leave", "bye", "clc", "cls", "help", "?", "plot", "prec"]);
  const mulX = s => (/^[A-Za-z_]\w*\s*\(.*\)\s*=|@/.test(s) ? s : s.replace(/(\d|\))\s*[x×]\s*(?=\d|\(|\.\d)/gi, "$1*"));   // 12 x 8 and 12x8 multiply; 2x on its own stays "2 times x"
  const CALC_HELP = ["CALCULATOR  (works like MATLAB)", "  2+2    12 x 8    sqrt(2)    10!    15% of 80    x = 5    y = x^2;   (a semicolon hides the result)", "  Angles: sin cos tan use radians. sind cosd tand asind acosd atand use degrees. deg2rad rad2deg convert.", "  Matrices: A = [1 2; 3 4]   A*B   A.*B   A'   A\\b   inv(A)   det(A)   eig(A)   zeros(2,3)   eye(3)   A(2,:)   x = 0:0.5:2   linspace(0,1,5)", "  Complex: sqrt(-4)   (1+2i)*(3-i)   abs(z)   angle(z)    Also: sum mean std sort find cumsum polyfit polyval roots fzero integral sprintf disp", "  f = @(x) x.^2 - 3   then  f(2)  fzero(f, 1)  plot f   |  format long / format short / format  |  who  clear  clc  |  exit or Esc leaves"];
  const setMode = m => { mode = m; $("tmP").textContent = m ? m.prompt : "›"; scr.classList.toggle("mode", !!m); sugRender(); };
  async function enterCalc() { setMode({ name: "calc", prompt: "calc ›" }); await print(CALC_HELP, "tm-dim"); }
  async function modeRun(line) {
    const m = line.match(/^(\S+)\s*(.*)$/), w = m[1].toLowerCase();
    if (/^(exit|quit|q|back|leave|bye)$/.test(w)) { setMode(null); return dim("left the calculator."); }
    if (/^(clc|cls)$/.test(w)) { log.innerHTML = ""; return; }
    if (w === "help" || w === "?") return print(CALC_HELP, "tm-dim");
    if ((w === "deg" || w === "rad") && !m[2]) return print(["sin, cos and tan take radians, as in MATLAB. For degrees use sind, cosd, tand (asind, acosd, atand, atan2d),", "or convert: deg2rad(x) and rad2deg(x).  Example: sind(30) = 0.5   sin(pi/6) = 0.5"], "tm-dim");
    if ((MODECMD.has(w) || (/^(roots|deriv|integral)$/.test(w) && m[2] && !/^\(/.test(m[2]))) && isCmd(w)) { busy = true; try { await cmds[w](m[2]); } catch (e) { await err(e.message || String(e)); } busy = false; return; }
    let t = line.replace(/(\d),(?=\d{3}(\D|$))/g, "$1"); const pc = t.match(/^(-?[\d.]+)\s*%\s*of\s*(-?[\d.]+)$/i); if (pc) t = `${pc[1]}/100*${pc[2]}`;
    if (/\b(plus|minus|times|multiplied by|divided by|over|squared|cubed|percent|square root of|to the)\b/i.test(t) && !/[=\[@]/.test(t)) t = words2math(t);
    if (!("x" in ml.W.vars) && /^x(?=\s*[\d(.])/i.test(t)) t = t.replace(/^x\s*/i, "*");
    t = mulX(t);
    if (/^(?:[+*\/^÷×]|\.[*\/^]|-\s)/.test(t) && ml.W.ans) t = "ans" + t.replace(/^[÷]/, "/").replace(/^[×]/, "*");   // "+ 5" or "x 3" carries on from the last answer
    try { await print(ml.run(t)); }
    catch (e) { if (e.partial && e.partial.length) await print(e.partial); await err(e.message || String(e)); }
  }

  /* ---------- the library: about 130 more commands ---------- */
  const lib = buildLibrary({ print, err, dim, ask, choose, A: api, calc, today, undos, parseWhen, fmtDay, hhmm, midnight, addDaysD, loadWeights, setWeight, delWeight, call: (n, a) => cmds[n](a), log, bottom, lastOut: () => lastOut, history: () => past, aliases: userAl, setAlias, names: () => Object.keys(cmds), timers: timersApi });
  Object.assign(cmds, lib.cmds);
  cmds.calculator = async args => { if (args.trim()) { try { return await print(ml.run(mulX(words2math(args.trim())))); } catch (e) { if (e.partial && e.partial.length) await print(e.partial); return err(e.message || String(e)); } } await enterCalc(); };
  const allMeta = () => [...CORE.map(([cat, n, use, d, al]) => ({ cat, n, use, d, al: al || [] })), ...lib.meta];
  const ALIAS = Object.fromEntries(allMeta().flatMap(m => m.al.map(a => [a, m.n]))); const isCmd = n => Object.hasOwn(cmds, n);
  const allWords = () => [...Object.keys(cmds), ...Object.keys(ALIAS), ...Object.keys(userAl())];

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
      const P = calc.plot(fs, a, b), dp = dotPlot(P.fs.map(o => o.f), a, b);
      dp.legendEl.innerHTML = P.legend.map((l, k) => `<span><i style="background:${dp.colors[k % 4]}"></i>${esc(l.q)}</span>`).join("");
      dp.setHover((x, ys) => { dp.read.textContent = `x = ${calc.fmt(x, 7)}    ` + ys.map((y, k) => `${fs.length > 1 ? "f" + (k + 1) : "y"} = ${calc.fmt(y, 7)}`).join("    "); });
      log.appendChild(dp.box); bottom();
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

  // blue text for anything the console recognises as a command or a math function, the moment it is typed
  function hl(v) {
    const fns = new Set([...Object.keys(calc.FN), ...Object.keys(calc.S.funcs), ...ml.names()]), re = /[A-Za-zπτ_][A-Za-z0-9_]*/g, first = v.search(/\S/), ua = userAl(); let out = "", last = 0, m;
    while ((m = re.exec(v))) {
      const w = m[0], low = w.toLowerCase(), at = m.index, after = v.slice(at + w.length);
      const known = mode ? MODECMD.has(low) && isCmd(low === "q" || low === "exit" || low === "quit" ? "bye" : low) || /^(exit|quit|q|back|leave|help)$/.test(low) : isCmd(low) || low in ALIAS || low in ua;
      const fn = (at === first && known) || (fns.has(w) && /^\s*\(/.test(after));
      out += esc(v.slice(last, at)) + (fn ? `<span class="tm-fn">${esc(w)}</span>` : esc(w)); last = at + w.length;
    }
    return out + esc(v.slice(last));
  }

  /* ---------- suggestions under the prompt: what you can type, with its usage, so nothing has to be guessed ---------- */
  const DEFAULT_CHIPS = ["hi", "sleep", "agenda", "journal", "calculator", "help"];
  function suggestions(v) {
    if (busy) return {};
    const t = v.trim().toLowerCase();
    if (mode) return { rows: [{ use: "12 x 8   (45+15)/4   2^10   15% of 80", d: "x multiplies · ans is the last result · exit leaves", fill: "" }] };
    if (pending) return {};
    if (!t) return { chips: DEFAULT_CHIPS };
    const meta = allMeta(), first = t.split(/\s+/)[0].replace(/[!?.,]+$/, ""), multi = /\s/.test(t), direct = meta.find(m => m.n === first || m.al.includes(first));
    const row = m => ({ use: m.use, d: m.d, fill: m.n + " " });
    if (direct && (multi || t === first)) {
      const more = multi ? [] : meta.filter(m => m !== direct && (m.n.startsWith(first) || m.al.some(a => a.startsWith(first)))).slice(0, 4);
      return { rows: [direct, ...more].map(row) };
    }
    if (!multi) {
      const pre = meta.filter(m => m.n.startsWith(t) || m.al.some(a => a.startsWith(t))).sort((a, b) => (b.n.startsWith(t) - a.n.startsWith(t))).slice(0, 6);   // everyday commands come first, as listed
      if (pre.length) return { rows: pre.map(row) };
    }
    if (multi && !/^[\d.(+\-]/.test(t)) { const it = interpret(v); if (it && it.run) return { rows: [{ use: it.run, d: "I would read that as", fill: it.run }] }; }
    const toks = t.match(/[a-z0-9]{2,}/g) || [], hits = findCommands(v, meta).filter(h => !multi || toks.some(w => h.n.startsWith(w) || h.al.some(a => a.startsWith(w)))).slice(0, multi ? 3 : 5); if (hits.length) return { rows: hits.map(row) };
    const near = allWords().map(c => ({ c, d: dist(first, c) })).sort((a, b) => a.d - b.d)[0];
    return near && near.d <= (first.length > 6 ? 2 : 1) && /^[a-z]{3,}$/.test(first) ? { rows: [row(meta.find(m => m.n === (ALIAS[near.c] || near.c)) || meta[0])] } : {};
  }
  function sugRender() {
    const { rows, chips } = suggestions(inp.value); sug.hidden = busy || (!rows && !chips);
    sug.innerHTML = chips ? `<div class="tm-chips">${chips.map(c => `<button class="tm-chip" data-fill="${esc(c)}">${esc(c)}</button>`).join("")}</div>` : (rows || []).map(r => `<div class="tm-sr" data-fill="${esc(r.fill)}"><b class="tm-fn">${esc(r.use)}</b> <span>${esc(r.d)}</span></div>`).join("");
  }
  sug.addEventListener("click", e => { const el = e.target.closest("[data-fill]"); if (!el) return; e.stopPropagation(); inp.value = el.dataset.fill; echo.innerHTML = hl(inp.value); sugRender(); inp.focus(); });

  /* ---------- reading a line ---------- */
  async function run(line) {
    line = line.trim(); if (!line) return;
    past.unshift(line); pi = -1; curLine = line;
    const q = document.createElement("div"); q.className = "tm-line tm-q"; q.innerHTML = `<span class="tm-p${mode ? " calc" : ""}">${mode ? mode.prompt : "›"}</span> ${hl(line)}`; log.appendChild(q); bottom();
    if (/^end$/i.test(line)) { const q = !!pending; pending = null; await endAll(q); sugRender(); return; }
    if (pending) {   // answering a question the console asked; anything else cancels it and is read as a new command
      const p = pending; pending = null;
      if (typeof p === "function") { if (/^(y|yes)$/i.test(line)) { busy = true; try { await p(); } catch (e) { await err(e.message || String(e)); } busy = false; sugRender(); return; } if (/^(n|no|cancel)$/i.test(line)) { await dim("cancelled."); return; } }
      else if (p.type === "choose") { const n = parseInt(line); if (/^\d+$/.test(line) && n >= 1 && n <= p.options.length) { busy = true; try { await p.then(p.options[n - 1]); } catch (e) { await err(e.message || String(e)); } busy = false; sugRender(); return; } if (/^(n|no|cancel)$/i.test(line) || /^\d+$/.test(line)) { await dim("cancelled."); return; } }
      else if (p.type === "input") {
        if (/^(cancel|stop|never ?mind|nvm|no|n)$/i.test(line)) { await dim("cancelled."); return; }
        const w1 = line.split(/\s+/)[0].toLowerCase();
        if (p.literal || !(isCmd(w1) || w1 in ALIAS)) { busy = true; try { await p.then(line); } catch (e) { await err(e.message || String(e)); } busy = false; live.hidden = false; sugRender(); inp.focus(); return; }
      }
    }
    if (mode) { await modeRun(line); sugRender(); return; }
    await exec(line);
  }

  async function exec(line, viaIntent = false) {
    const ua = userAl(), w0 = line.split(/\s+/)[0].toLowerCase(); if (ua[w0]) line = ua[w0] + line.slice(w0.length);   // your own aliases
    if (/^-?\d+(\.\d+)?\s*[a-z°"']+\s+(to|in)\s+[a-z°]+$/i.test(line)) line = "convert " + line;   // 5 km to mi
    const m = line.match(/^(\S+)\s*(.*)$/), word = m[1].toLowerCase().replace(/(?<=[a-z])[!?.,]+$/, ""), rest = m[2];
    const isMath = /^[A-Za-z_]\w*\s*(\([^)]*\))?\s*=[^=]/.test(line);   // a = 5 and f(x) = x^2 are math, not commands
    let name = isMath ? "=" : (ALIAS[word] || word);
    if (/^start\s+\S/i.test(line) || name === "start") name = "start";
    const mathNames = new Set([...Object.keys(calc.FN), ...Object.keys(calc.S.vars), ...Object.keys(calc.S.funcs), "pi", "e", "tau", "phi", "ans", "x"]);
    const FREE = new Set(["note", "task", "echo", "upper", "lower", "title", "len", "rev", "slug", "b64", "sha256", "alias", "add", "find", "grep", "pick", "shuffle", "copy", "start", "timer", "set", "weight", "convert"]), words = line.toLowerCase().match(/[a-z']+/g) || [];
    const sentence = isCmd(name) && !FREE.has(name) && words.length >= 4 && words.slice(1).some(w => /^(i|my|me|did|do|is|are|was|the|what|how|when|should|much|many)$/.test(w));   // "when did i last bench" is a question, not the command "when"
    if ((!isCmd(name) || sentence) && !isMath && !viaIntent && words.some(w => !mathNames.has(w))) {
      const it = interpret(line);   // plain English: "how did I sleep", "I weigh 70.4", "bench 135 for 8 x 3"
      if (it && it.say) return print(it.say, "tm-dim");
      if (it && it.run) { if (it.run !== "hi") await dim(`→ ${it.run}`); return exec(it.run, true); }
      if (sm) { const g = A().gym && A().gym(), rk = g ? rankExercises(sm[1], g.entries) : []; if (rk.length && rk[0].sc >= 100) { const r = `set ${sm[1]} ${sm[2]} ${sm[3]}${sm[4] ? " " + sm[4] : ""}`; await dim(`→ ${r}`); return exec(r, true); } }
    }
    const near0 = !isCmd(name) && !isMath && /^[a-z]{3,}$/.test(word) && !mathNames.has(word) ? allWords().map(c => ({ c, d: dist(word, c) })).sort((a, b) => a.d - b.d)[0] : null;
    if (near0 && near0.d <= (word.length > 6 ? 2 : 1)) return err(`unknown command "${word}". did you mean "${ALIAS[near0.c] || near0.c}"?`);   // a typo with numbers after it is not math
    if (!isCmd(name) && (isMath || /[\d+\-*/^()=!π]|^(pi|e|tau|phi|ans)\b/i.test(line))) {   // not a command: read it as math
      try { await showValue(calc.evaluate(mulX(line))); } catch (e) { await err(e.message || String(e)); }
      return;
    }
    if (!isCmd(name)) {
      const hits = findCommands(line, allMeta()).slice(0, 3);
      await err(`I did not catch "${line.length > 40 ? line.slice(0, 40) + "…" : line}".`);
      return hits.length ? print(["closest:", ...hits.map(h => `  ${h.use.padEnd(34)} ${h.d}`)], "tm-dim") : dim("help lists everything; help <word> searches. Plain phrases work too: how did I sleep, what's next.");
    }
    busy = true; live.hidden = true; sug.hidden = true;
    const args = name === "start" ? (/^start\b/i.test(line) ? line.replace(/^start\s*/i, "") : rest) : rest;
    halt = false;
    try { await cmds[name](args); }
    catch (e) {
      const msg = e && e.message ? e.message : String(e);
      if (/^usage:/i.test(msg) && !args.trim()) { await dim(msg); await askInput("type the arguments now, or cancel.", l => exec(`${name} ${l}`)); }   // a bare command asks instead of failing
      else await err(msg);
    }
    if (halt) { halt = false; await dim("ended."); }
    busy = false; live.hidden = false; inp.focus(); bottom(); sugRender();
  }

  async function boot() {
    if (booted) return; booted = true;
    await type("DASH // COMMAND LINE", "tm-head"); await type("─────────────────────────────", "tm-head");
    await dim("type hi, or help");
    await print(""); sugRender();
  }

  inp.addEventListener("input", () => { echo.innerHTML = hl(inp.value); bottom(); sugRender(); });
  inp.addEventListener("keydown", e => {
    if (e.key === "Enter" && busy && /^\s*end\s*$/i.test(inp.value)) { inp.value = ""; echo.textContent = ""; halt = true; [...timers.values()].forEach(sp => { if (sp.loop && sp.stop) sp.stop(); }); }
    else if (e.key === "Enter" && !busy) { const v = inp.value; inp.value = ""; echo.textContent = ""; run(v); }
    else if (e.key === "Escape" && mode) { e.stopPropagation(); e.preventDefault(); inp.value = ""; echo.textContent = ""; print([""]); setMode(null); dim("left the calculator."); }
    else if (e.key === "Tab") {
      e.preventDefault(); const v = inp.value.trim().toLowerCase();
      if (v && !/\s/.test(v) && !mode) {
        const hit = [...new Set(allWords())].filter(c => c.startsWith(v)).sort();
        if (hit.length === 1) inp.value = hit[0] + " "; else if (hit.length > 1) { let p = hit[0]; hit.forEach(h => { while (!h.startsWith(p)) p = p.slice(0, -1); }); if (p.length > v.length) inp.value = p; else dim(hit.slice(0, 30).join("  ")); }
        else { const top = suggestions(inp.value).rows; if (top && top[0] && top[0].fill) inp.value = top[0].fill; }   // nothing starts with it: take the best match
      } else if (!v) { const c = DEFAULT_CHIPS[0]; inp.value = c; }
      echo.innerHTML = hl(inp.value); sugRender();
    }
    else if (e.key === "ArrowUp" && past.length) { e.preventDefault(); pi = Math.min(past.length - 1, pi + 1); inp.value = past[pi]; echo.innerHTML = hl(inp.value); sugRender(); }
    else if (e.key === "ArrowDown") { e.preventDefault(); pi = Math.max(-1, pi - 1); inp.value = pi < 0 ? "" : past[pi]; echo.innerHTML = hl(inp.value); sugRender(); }
  });
  root.addEventListener("click", () => { if (!getSelection().toString()) inp.focus(); });
  addEventListener("tab", e => { if (e.detail === "console") setTimeout(() => { boot(); inp.focus(); }, 450); });
  if (document.body.dataset.tab === "console") { boot(); setTimeout(() => inp.focus(), 500); }
}
