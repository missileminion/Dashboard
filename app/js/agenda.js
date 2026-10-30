// The Agenda view. The main thing is your day as a timeline of tasks laid along the sun's real path, drawn in dots (Nothing-inspired).
// Beside it sits the day budget ring: the same day as a measure of HOW MUCH rather than WHEN. The ring is your waking day from wake-up to bedtime,
// one dot per slice, white where something is booked and dim where you are free, with a red dot for now and a thin inner arc of daylight.
// Next to the ring: free time left, booked time left, daylight left and how heavy the day is. Hover or drag along the path to scrub: the clock, the
// light, the glow behind the path, the ring and the numbers all move to that moment.
import { sunPos } from "./sky.js";
import { esc, addDays, pad } from "./util.js";
import { plannedFor, TARGET } from "./analytics.js";

const RED = "#ff2d37", HEAVY = /exam|midterm|final|quiz|due|deadline/i;
const GLYPH = { 0: ["01110", "10001", "10011", "10101", "11001", "10001", "01110"], 1: ["00100", "01100", "00100", "00100", "00100", "00100", "01110"], 2: ["01110", "10001", "00001", "00010", "00100", "01000", "11111"], 3: ["11110", "00001", "00001", "01110", "00001", "00001", "11110"], 4: ["00010", "00110", "01010", "10010", "11111", "00010", "00010"], 5: ["11111", "10000", "11110", "00001", "00001", "10001", "01110"], 6: ["00110", "01000", "10000", "11110", "10001", "10001", "01110"], 7: ["11111", "00001", "00010", "00100", "01000", "01000", "01000"], 8: ["01110", "10001", "10001", "01110", "10001", "10001", "01110"], 9: ["01110", "10001", "10001", "01111", "00001", "00010", "01100"], ":": ["0", "0", "1", "0", "1", "0", "0"] };
const hhmm = d => `${pad(d.getHours())}:${pad(d.getMinutes())}`, mins = d => d.getHours() * 60 + d.getMinutes();
const at = (day, m) => { const x = new Date(day + "T00:00:00"); x.setMinutes(m); return x; };
const place = () => { try { const s = JSON.parse(localStorage.getItem("sky.loc")); if (s && s.lat != null) return s; } catch {} try { const c = JSON.parse(localStorage.getItem("weather.city")); if (c) return { lat: c.lat, lon: c.lon }; } catch {} return { lat: 34, lon: -118 }; };
const alt = (day, m, loc) => sunPos(+at(day, m), loc.lat, loc.lon).alt;
const light = (day, m, loc) => { const a = alt(day, m, loc), rising = sunPos(+at(day, m), loc.lat, loc.lon).rising; return a < -12 ? "night" : a < -4 ? (rising ? "before dawn" : "after dusk") : a < 4 ? (rising ? "sunrise glow" : "sunset glow") : a < 14 ? (rising ? "soft morning light" : "golden hour") : "full daylight"; };
// the glow behind the path: a continuous function of the sun's altitude, never a fixed set of themes
const STOPS = [[-18, [6, 8, 18]], [-8, [26, 30, 70]], [-2, [86, 58, 110]], [4, [224, 118, 82]], [14, [92, 150, 214]], [45, [58, 126, 214]]];
function glow(a) { a = Math.max(-18, Math.min(45, a)); let i = 0; while (i < STOPS.length - 2 && a > STOPS[i + 1][0]) i++; const [a0, c0] = STOPS[i], [a1, c1] = STOPS[i + 1], f = (a - a0) / (a1 - a0); return c0.map((v, k) => Math.round(v + (c1[k] - v) * f)); }
const heavyEv = e => HEAVY.test(e.title);
const onDay = (e, day) => (e.allDay ? e.s <= new Date(day + "T12:00:00") && e.e > new Date(day + "T12:00:00") : e.s < new Date(addDays(day, 1) + "T00:00:00") && e.e > new Date(day + "T00:00:00"));
const hoursOn = (list, day) => list.filter(e => !e.allDay && onDay(e, day)).reduce((s, e) => s + (Math.min(+e.e, +new Date(addDays(day, 1) + "T00:00:00")) - Math.max(+e.s, +new Date(day + "T00:00:00"))) / 36e5, 0);
const hm = h => { const m = Math.round(h * 60); return m >= 60 ? `${Math.floor(m / 60)}H ${pad(m % 60)}M` : `${m}M`; };
const factor = t => (HEAVY.test(t) ? 3 : /lab|project|presentation|interview/i.test(t) ? 1.6 : /run|gym|workout/i.test(t) ? 1.2 : 1);
function load(day, list) {   // how heavy the day is, 0 to 10: hours times a weight for the kind of task, plus a little for back-to-back blocks
  const evs = list.filter(e => onDay(e, day)).sort((a, b) => (a.allDay ? -1 : 0) - (b.allDay ? -1 : 0) || a.s - b.s); let w = 0;
  evs.forEach((e, i) => { w += (e.allDay ? 3 : (e.e - e.s) / 36e5) * factor(e.title); const n = evs[i + 1]; if (n && !e.allDay && !n.allDay && n.s - e.e < 15 * 6e4 && n.s - e.e > -1) w += .4; });
  return Math.min(10, w / 1.15);
}

function clock(txt, blink) {   // dot-matrix digits as SVG circles
  let x = 0, s = "";
  for (const ch of txt) { const g = GLYPH[ch]; if (!g) continue; g.forEach((row, r) => [...row].forEach((v, c) => { if (v === "1") s += `<circle cx="${x + c + .5}" cy="${r + .5}" r=".37" fill="${ch === ":" ? RED : "#fff"}"${ch === ":" && !blink ? ' opacity=".28"' : ""}/>`; })); x += g[0].length + 1; }
  return { vb: `-0.1 -0.1 ${x - 0.8} 7.2`, s };
}

/* ---------- the timeline: the sun's path as a dotted curve across 24 hours, the tasks laid on it ---------- */
const VW = 780, VH = 436, X0 = 24, X1 = 756, HOR = 266;
const Xm = m => X0 + m / 1440 * (X1 - X0);
function sunTimes(day, loc) { let rise = null, set = null, prev = alt(day, 0, loc); for (let m = 5; m <= 1440; m += 5) { const v = alt(day, m % 1440, loc); if (prev < 0 && v >= 0 && rise == null) rise = m; if (prev >= 0 && v < 0 && set == null) set = m; prev = v; } return { rise, set }; }
// one smooth curve: the sun's altitude over the day, with the night half eased in so the arc keeps its true sine-like shape and a continuous slope at the horizon
function curveFor(day, loc) {
  const A = []; for (let m = 0; m <= 1440; m += 5) A.push(alt(day, m % 1440, loc));
  const mx = Math.max(...A), f = v => (v >= 0 ? v : v / (1 - v / 45)), k = Math.min(2.7, 108 / Math.max(10, mx)), y = v => HOR - f(v) * k;
  return { A, y, Y: m => { const q = Math.min(287.999, m / 5), i = Math.floor(q); return y(A[i] + (A[i + 1] - A[i]) * (q - i)); }, horizon: HOR };
}
function timelineSVG(day, list, scrub, now, loc, k = 1.3) {
  const dayEv = list.filter(e => !e.allDay && onDay(e, day)).sort((a, b) => a.s - b.s), isToday = !!now, nm = now ? mins(now) : -1, { rise, set } = sunTimes(day, loc), C = curveFor(day, loc);
  let s = `<line x1="${X0}" x2="${X1}" y1="${C.horizon}" y2="${C.horizon}" stroke="#3d4150" stroke-dasharray="1.5 6"/>`;
  for (let m = 0; m <= 1440; m += 5) {   // the path itself, one dot per five minutes; larger and brighter where a task is on
    const a = at(day, m), b = new Date(+a + 5 * 6e4), hit = dayEv.filter(e => e.s < b && e.e > a), up = C.A[m / 5] > 0, past = isToday && +b <= +now;
    s += `<circle cx="${Xm(m).toFixed(1)}" cy="${C.y(C.A[m / 5]).toFixed(1)}" r="2.1" fill="${hit.length ? (hit.some(heavyEv) ? RED : past ? "#8a90a4" : "#fff") : up ? "#aeb3c4" : "#454957"}" opacity="${hit.length ? 1 : up ? .72 : .6}"/>`;   // every dot the same size; a task is a brighter colour
  }
  const bed = ((TARGET.wakeMin - TARGET.idealMin) % 1440 + 1440) % 1440, wake = TARGET.wakeMin;   // the sleep window along the bottom
  for (let m = 0; m < 1440; m += 10) if (bed > wake ? m >= bed || m < wake : m >= bed && m < wake) s += `<circle cx="${Xm(m).toFixed(1)}" cy="382" r="1.9" fill="#7c86a8"/>`;
  s += `<text x="${Xm(wake / 2)}" y="370" text-anchor="middle" class="ag-sun" style="fill:#7c86a8">SLEEP</text><text x="${Xm(bed + (1440 - bed) / 2)}" y="370" text-anchor="middle" class="ag-sun" style="fill:#7c86a8">SLEEP</text>`;
  [0, 3, 6, 9, 12, 15, 18, 21, 24].forEach(h => { s += `<text x="${Xm(h * 60)}" y="422" text-anchor="${h === 24 ? "end" : h === 0 ? "start" : "middle"}" class="ag-hl">${pad(h % 24)}</text>`; });
  [[rise, "↑"], [set, "↓"]].forEach(([m, g]) => { if (m != null) s += `<text x="${Xm(m)}" y="${C.horizon + 24}" text-anchor="middle" class="ag-sun">${g} ${pad(Math.floor(m / 60))}:${pad(m % 60)}</text>`; });
  // task titles sit in their own band above the curve, on leader lines, staggered into lanes so no text ever touches the curve or another title
  const lanes = [];
  dayEv.forEach(e => {
    const startM = e.s < at(day, 0) ? 0 : mins(e.s), x = Xm(startM), title = e.title.length > 28 ? e.title.slice(0, 27) + "…" : e.title, w = Math.max(60 / k, title.length * 7.4 / k + 8), flip = x + w > VW - 14, xs = flip ? x - w : x;
    const lane = lanes.findIndex(r => r < xs - 8), ln = lane < 0 ? lanes.length : lane; if (ln > 3) return; lanes[ln] = xs + w;
    const by = C.Y(startM), ly = 24 + ln * 34, past = isToday && e.e <= now, col = heavyEv(e) ? RED : past ? "#8b90a3" : "#fff", dim = e.recurring && !heavyEv(e), tx = flip ? x - 5 : x + 5, anchor = flip ? "end" : "start";
    s += `<g class="ag-bead" data-id="${esc(e.id)}"><line x1="${x}" x2="${x}" y1="${ly + 20}" y2="${by - 4}" stroke="${col}" stroke-opacity=".55" stroke-width="1.4" stroke-dasharray="3 4"/>`
      + `<text x="${tx}" y="${ly}" text-anchor="${anchor}" class="ag-ev" fill="${col}" opacity="${dim ? .7 : 1}">${esc(title)}</text><text x="${tx}" y="${ly + 14}" text-anchor="${anchor}" class="ag-evt">${hhmm(e.s)}–${hhmm(e.e)}</text><rect x="${xs - 6}" y="${ly - 15}" width="${w + 12}" height="${Math.max(34, by - ly + 4)}" fill="transparent"/></g>`;
  });
  const mk = (m, col, txt) => `<line x1="${Xm(m)}" x2="${Xm(m)}" y1="${C.Y(m) + 2}" y2="338" stroke="${col}" stroke-width="2" stroke-dasharray="6 5" stroke-linecap="round"/><text x="${Xm(m)}" y="354" text-anchor="middle" class="ag-now" fill="${col}">${txt}</text>`;
  if (isToday) s += mk(nm, "#ffd24d", hhmm(now));
  if (scrub != null) s += mk(scrub + 2.5, "#fff", `${pad(Math.floor(scrub / 60))}:${pad(scrub % 60)}`);
  return s;
}

/* ---------- the day budget ring: how much of your waking day is booked, free and left ---------- */
const WAKE = TARGET.wakeMin, BED = (((TARGET.wakeMin - TARGET.idealMin) % 1440) + 1440) % 1440, AWAKE = (BED > WAKE ? BED : BED + 1440) - WAKE, N = 72, SLICE = AWAKE / N;
function budget(day, list, m, loc) {
  const dayEv = list.filter(e => !e.allDay && onDay(e, day)), slices = [];
  for (let i = 0; i < N; i++) { const t0 = WAKE + i * SLICE, a = at(day, 0), s0 = new Date(+a + t0 * 6e4), s1 = new Date(+a + (t0 + SLICE) * 6e4), hit = dayEv.filter(e => e.s < s1 && e.e > s0); slices.push({ t0, booked: hit.length > 0, heavy: hit.some(heavyEv), up: alt(day, (t0 + SLICE / 2) % 1440, loc) > 0 }); }
  const left = slices.filter(x => x.t0 + SLICE > m), freeLeft = left.filter(x => !x.booked).length * SLICE / 60, bookedLeft = left.filter(x => x.booked).length * SLICE / 60;
  const { rise, set } = sunTimes(day, loc), dl = set == null ? null : alt(day, m % 1440, loc) > 0 ? set - m : rise != null && m < rise ? -(rise - m) : 0;
  return { slices, freeLeft, bookedLeft, dl };
}
function ringSVG(day, list, scrub, now, loc) {
  const m = scrub ?? (now ? mins(now) : WAKE), B = budget(day, list, m, loc), cx = 200, cy = 200, R = 160;
  const nowIdx = m >= WAKE && m < WAKE + AWAKE ? Math.floor((m - WAKE) / SLICE) : -1, track = scrub != null || !!now;
  let s = "";
  B.slices.forEach((x, i) => {
    const ang = i / N * Math.PI * 2 - Math.PI / 2, ca = Math.cos(ang), sa = Math.sin(ang), past = track && x.t0 + SLICE <= m, isNow = track && i === nowIdx;
    const fill = isNow ? RED : x.booked ? (x.heavy ? RED : past ? "#7f8599" : "#fff") : past ? "#272a33" : "#4d5264";
    s += `<circle cx="${(cx + ca * R).toFixed(1)}" cy="${(cy + sa * R).toFixed(1)}" r="${isNow ? 7 : x.booked ? 5.6 : 3.1}" fill="${fill}">${isNow && scrub == null ? `<animate attributeName="r" values="5.5;8.5;5.5" dur="2.6s" repeatCount="indefinite"/>` : ""}</circle>`;
    if (x.up) s += `<circle cx="${(cx + ca * (R - 24)).toFixed(1)}" cy="${(cy + sa * (R - 24)).toFixed(1)}" r="1.5" fill="#c9cdd8"/>`;
  });
  s += `<text x="${cx}" y="${cy - R + 34}" text-anchor="middle" class="ag-hl">${pad(Math.floor(WAKE / 60))}:${pad(WAKE % 60)} WAKE</text><text x="${cx}" y="${cy + R - 28}" text-anchor="middle" class="ag-hl">BED ${pad(Math.floor(BED / 60))}:${pad(BED % 60)}</text>`;
  return { s, B };
}

function chipHTML(day, list, focus, today) {
  const h = hoursOn(list, day), n = Math.min(12, Math.round(h)), heavy = list.some(e => heavyEv(e) && onDay(e, day)), d = new Date(day + "T12:00:00");
  const dots = [...Array(12)].map((_, i) => `<circle cx="${6.5 + (i % 4) * 7.6}" cy="${6.5 + Math.floor(i / 4) * 7.6}" r="2.1" fill="${i < n ? (heavy ? RED : "#fff") : "#2c2f36"}"/>`).join("");
  return `<button type="button" class="ag-chip${day === focus ? " on" : ""}${day === today ? " today" : ""}" data-fd="${day}"><em>${d.toLocaleDateString("en-US", { weekday: "short" })}</em><svg viewBox="0 0 36 29" aria-hidden="true">${dots}</svg><b>${d.getDate()}</b></button>`;
}

export const ui = { open: false };
const dur = e => { const m = Math.round((e.e - e.s) / 6e4); return m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? " " + (m % 60) + "m" : ""}` : `${m}m`; };
export function toggleCard(root) { ui.open = !ui.open; const c = root.querySelector(".ag-card"); if (c) { c.classList.toggle("open", ui.open); c.setAttribute("aria-expanded", ui.open); } }
export function agendaHTML(ctx) {
  const { days, list, focus, today, calNames = {} } = ctx, now = new Date();
  const nextEv = list.filter(e => !e.allDay && !e.done && e.e > now).sort((a, b) => a.s - b.s).find(e => e.s > now);
  const day = focus, evs = list.filter(e => onDay(e, day)).sort((a, b) => a.s - b.s), d = new Date(day + "T12:00:00"), h = hoursOn(list, day);
  const allDay = evs.filter(e => e.allDay), timed = evs.filter(e => !e.allDay);
  const state = e => { const past = !e.allDay && e.e <= now, cur = !e.allDay && e.s <= now && e.e > now, nx = nextEv && e === nextEv; return `${e.done ? " done" : ""}${past ? " past" : ""}${cur ? " now" : ""}${nx ? " next" : ""}${e.recurring ? " routine" : ""}${heavyEv(e) ? " heavy" : ""}`; };
  const chk = e => `<button type="button" class="ag-check" data-done="${esc(e.id)}" aria-pressed="${!!e.done}" aria-label="${e.done ? "Mark not complete" : "Mark complete"}"><svg viewBox="0 0 14 14" aria-hidden="true"><path d="M3 7.4 5.8 10 11 4.4"/></svg></button>`;
  const mini = e => `<div class="ag-mini${state(e)}">${chk(e)}<span class="ag-time">${e.allDay ? "ALL DAY" : hhmm(e.s)}</span><span class="ag-title">${esc(e.title)}</span></div>`;
  // the expanded view, kept quiet: a check, the time and the title. Everything else (place, notes, which calendar) waits inside the editor, which opens in place when you click a task.
  const det = e => `<article class="ag-det${state(e)}" data-eid="${esc(e.id)}">${chk(e)}<div class="ag-dbody">${e.allDay ? "" : `<div class="ag-dtime">${hhmm(e.s)}–${hhmm(e.e)}</div>`}<div class="ag-dt">${esc(e.title)}</div></div><div class="ag-editor"><div class="ag-ei"></div></div></article>`;
  const sect = (label, items, fn) => (items.length ? `<div class="ag-sec">${label}</div>${items.map(fn).join("")}` : "");
  const min = evs.length ? sect("ALL DAY", allDay, mini) + sect("SCHEDULED", timed, mini) : `<div class="ag-none">NOTHING SCHEDULED</div>`;
  const full = sect("ALL DAY", allDay, det) + sect("SCHEDULED", timed, det);
  const doneCount = evs.filter(e => e.done).length;
  return `<div class="ag"><div class="ag-main"><div class="ag-left">
      <div class="ag-tl" id="agTl"><div class="ag-scroll" id="agScroll"><svg class="ag-path" id="agPath" viewBox="0 0 ${VW} ${VH}" aria-label="Your day as tasks along the sun's path"></svg></div></div>
      <div class="ag-week">${days.map(x => chipHTML(x, list, focus, today)).join("")}</div></div>
    <div class="ag-right"><section class="ag-card${ui.open ? " open" : ""}" tabindex="0" role="button" aria-expanded="${ui.open}" aria-label="Tasks for the day, click to expand"><div class="ag-dh"><div class="ag-dh1"><b>${d.toLocaleDateString("en-US", { weekday: "long" }).toUpperCase()} ${d.getDate()}</b>${day === today ? '<i class="ag-red">TODAY</i>' : ""}<i class="ag-chev" aria-hidden="true">⌄</i></div><div class="ag-dh2">${plannedFor(day).toUpperCase()}${evs.length ? ` · ${doneCount}/${evs.length} DONE` : ""}${h ? ` · ${h.toFixed(1)} H` : ""}</div></div>
      <div class="ag-fold ag-foldmin"><div class="ag-fi">${min}</div></div><div class="ag-fold ag-foldfull"><div class="ag-fi">${full}</div></div></section>
      <div class="ag-info"><div class="ag-cap" id="agCap"></div><div class="ag-stats" id="agStats"></div></div></div></div></div>`;
}

// paint and wire (runs after the HTML is in the page)
export function wireAgenda(root, ctx) {
  const tl = root.querySelector("#agTl"), pathEl = root.querySelector("#agPath"), cap = root.querySelector("#agCap"), stats = root.querySelector("#agStats"), sc = root.querySelector("#agScroll"); if (!tl) return;
  const { focus, list, today } = ctx, loc = place(), isToday = focus === today;
  let scrub = null, timer = null;
  const paint = () => {
    const now = isToday ? new Date() : null, m = scrub ?? (now ? mins(now) : 12 * 60), a = alt(focus, m, loc), [r, g, b] = glow(a);
    const pw = pathEl.getBoundingClientRect().width, k = pw > 0 ? pw / VW : 1.3; pathEl.style.setProperty("--k", k.toFixed(3)); pathEl.innerHTML = timelineSVG(focus, list, scrub, now, loc, k);
    const R = { B: budget(focus, list, m, loc) };
    tl.style.setProperty("--glow", `rgba(${r},${g},${b},${scrub != null ? .7 : .52})`);
    const dayEv = list.filter(e => !e.allDay && onDay(e, focus)), when = at(focus, m), cur = dayEv.find(e => e.s <= when && e.e > when), B = R.B, ld = load(focus, list);
    let line;
    if (scrub != null) { line = `${light(focus, m, loc).toUpperCase()} · SUN ${a >= 0 ? "+" : "−"}${Math.abs(a).toFixed(0)}°<br>${cur ? `<b>${esc(cur.title)}</b>` : "FREE"}`; }
    else if (now) { const fut = dayEv.filter(e => e.e > now).sort((x, y) => x.s - y.s), c = fut.find(e => e.s <= now), nx = fut.find(e => e.s > now); line = c ? `NOW · UNTIL ${hhmm(c.e)}<br><b>${esc(c.title)}</b>` : nx ? `NEXT IN ${Math.floor((nx.s - now) / 36e5) ? Math.floor((nx.s - now) / 36e5) + "H " : ""}${Math.round(((nx.s - now) / 6e4) % 60)}M<br><b>${esc(nx.title)}</b>` : "NOTHING MORE TODAY"; }
    else { const d = new Date(focus + "T12:00:00"); line = `${d.toLocaleDateString("en-US", { weekday: "long", month: "short" }).toUpperCase()}<br><b>${dayEv.length} EVENT${dayEv.length === 1 ? "" : "S"}</b>${dayEv.length ? ` · ${hoursOn(list, focus).toFixed(1)} H` : ""}`; }
    cap.innerHTML = line;
    const dl = B.dl == null ? "—" : B.dl > 0 ? hm(B.dl / 60) : B.dl < 0 ? "IN " + hm(-B.dl / 60) : "OVER";
    const label = scrub != null || !now ? (scrub != null ? "FROM " + hhmm(when) : "WHOLE DAY") : "LEFT TODAY";
    const st = (k, v, red) => `<div><span>${k}</span><b${red ? ` class="ag-red"` : ""}>${v}</b></div>`;
    stats.innerHTML = st("FREE " + label.replace("LEFT TODAY", "LEFT"), hm(B.freeLeft)) + st("BOOKED " + label.replace("LEFT TODAY", "LEFT"), hm(B.bookedLeft)) + st(B.dl != null && B.dl < 0 ? "SUNRISE" : "DAYLIGHT", dl) + st("LOAD", `${ld.toFixed(1)} / 10`, ld >= 7);
  };
  const minuteAt = e => { const r = pathEl.getBoundingClientRect(), f = (e.clientX - r.left) / r.width * VW; return Math.max(0, Math.min(1435, Math.round((f - X0) / (X1 - X0) * 288) * 5)); };
  pathEl.addEventListener("pointermove", e => { if (e.pointerType === "touch" && e.buttons !== 1) return; const m = minuteAt(e); if (m !== scrub) { scrub = m; paint(); } });
  pathEl.addEventListener("pointerdown", e => { if (e.pointerType === "touch") { try { pathEl.setPointerCapture(e.pointerId); } catch {} scrub = minuteAt(e); paint(); } });
  const done = () => { if (scrub != null) { scrub = null; paint(); } };
  pathEl.addEventListener("pointerleave", done); pathEl.addEventListener("pointerup", e => { if (e.pointerType === "touch") done(); }); pathEl.addEventListener("pointercancel", done);
  paint();
  if (sc && sc.scrollWidth > sc.clientWidth) {   // on a phone, start the path centred on now, or on the day's first task (or 09:00 on an empty day)
    const first = list.filter(e => !e.allDay && onDay(e, focus)).sort((x, y) => x.s - y.s)[0], m = isToday ? mins(new Date()) : first ? mins(first.s) : 9 * 60;
    sc.scrollLeft = Math.max(0, Xm(m) / VW * sc.scrollWidth - sc.clientWidth / 2);
  }
  if (isToday) timer = setInterval(() => { if (!tl.isConnected) return clearInterval(timer); if (scrub == null) paint(); }, 1000);
}
