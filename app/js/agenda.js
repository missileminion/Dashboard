// The Agenda view: a day ring of dots (Nothing-inspired) that also carries the sun's path (daylight, sunrise, sunset, the light each event sits in),
// your sleep window, and a dot-matrix clock, above a monochrome agenda with one red dot for what is next. Hover or drag around the ring to scrub through
// the day: the centre reads the time, the light and what is on, and the glow behind the ring follows the sun.
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
// the glow behind the ring: a continuous function of the sun's altitude, never a fixed set of themes
const STOPS = [[-18, [6, 8, 18]], [-8, [26, 30, 70]], [-2, [86, 58, 110]], [4, [224, 118, 82]], [14, [92, 150, 214]], [45, [58, 126, 214]]];
function glow(a) { a = Math.max(-18, Math.min(45, a)); let i = 0; while (i < STOPS.length - 2 && a > STOPS[i + 1][0]) i++; const [a0, c0] = STOPS[i], [a1, c1] = STOPS[i + 1], f = (a - a0) / (a1 - a0); return c0.map((v, k) => Math.round(v + (c1[k] - v) * f)); }
const heavyEv = e => HEAVY.test(e.title);
const onDay = (e, day) => (e.allDay ? e.s <= new Date(day + "T12:00:00") && e.e > new Date(day + "T12:00:00") : e.s < new Date(addDays(day, 1) + "T00:00:00") && e.e > new Date(day + "T00:00:00"));
const hoursOn = (list, day) => list.filter(e => !e.allDay && onDay(e, day)).reduce((s, e) => s + (Math.min(+e.e, +new Date(addDays(day, 1) + "T00:00:00")) - Math.max(+e.s, +new Date(day + "T00:00:00"))) / 36e5, 0);

function clock(txt, blink) {   // dot-matrix digits as SVG circles
  let x = 0, s = "";
  for (const ch of txt) { const g = GLYPH[ch]; if (!g) continue; g.forEach((row, r) => [...row].forEach((v, c) => { if (v === "1") s += `<circle cx="${x + c + .5}" cy="${r + .5}" r=".37" fill="${ch === ":" ? RED : "#fff"}"${ch === ":" && !blink ? ' opacity=".28"' : ""}/>`; })); x += g[0].length + 1; }
  return { vb: `-0.1 -0.1 ${x - 0.8} 7.2`, s };
}

// the dial, as one string: dots for every quarter hour, sleep window, daylight, now
function dialSVG(day, list, scrub, now, loc) {
  const cx = 300, cy = 300, R = 230, dayEv = list.filter(e => !e.allDay && onDay(e, day)), isToday = !!now, nm = now ? mins(now) : -1;
  const bedMin = ((TARGET.wakeMin - TARGET.idealMin) % 1440 + 1440) % 1440, wake = TARGET.wakeMin, inSleep = t => (bedMin > wake ? t >= bedMin || t < wake : t >= bedMin && t < wake);
  let s = "", rise = null, set = null, prev = alt(day, 0, loc);
  for (let m = 5; m <= 1440; m += 5) { const a = alt(day, m % 1440, loc); if (prev < 0 && a >= 0 && rise == null) rise = m; if (prev >= 0 && a < 0 && set == null) set = m; prev = a; }
  for (let i = 0; i < 96; i++) {
    const t0 = i * 15, ang = t0 / 1440 * Math.PI * 2 - Math.PI / 2, ca = Math.cos(ang), sa = Math.sin(ang), a = at(day, t0), b = new Date(+a + 15 * 6e4);
    const hit = dayEv.filter(e => e.s < b && e.e > a), lit = hit.length > 0, red = hit.some(heavyEv), isNow = isToday && nm >= t0 && nm < t0 + 15, sc = scrub != null && scrub >= t0 && scrub < t0 + 15;
    s += `<circle cx="${(cx + ca * R).toFixed(1)}" cy="${(cy + sa * R).toFixed(1)}" r="${isNow ? 7.5 : lit ? 6.4 : 3.4}" fill="${isNow ? RED : lit ? (red ? RED : (isToday && +b <= +now ? "#7f8599" : "#fff")) : "#2c2f36"}">${isNow ? `<animate attributeName="r" values="6;9.5;6" dur="2.6s" repeatCount="indefinite"/>` : ""}</circle>`;
    if (sc) s += `<circle cx="${(cx + ca * R).toFixed(1)}" cy="${(cy + sa * R).toFixed(1)}" r="11.5" fill="none" stroke="#fff" stroke-width="1.6"/>`;
    if (inSleep(t0)) s += `<circle cx="${(cx + ca * (R - 30)).toFixed(1)}" cy="${(cy + sa * (R - 30)).toFixed(1)}" r="1.9" fill="#7c86a8"/>`;
    if (alt(day, t0 + 7, loc) > 0) s += `<circle cx="${(cx + ca * (R + 26)).toFixed(1)}" cy="${(cy + sa * (R + 26)).toFixed(1)}" r="1.7" fill="#c9cdd8"/>`;
  }
  [[0, "00"], [6, "06"], [12, "12"], [18, "18"]].forEach(([h, l]) => { const ang = h / 24 * Math.PI * 2 - Math.PI / 2; s += `<text x="${cx + Math.cos(ang) * (R - 54)}" y="${cy + Math.sin(ang) * (R - 54) + 4}" text-anchor="middle" class="ag-hl">${l}</text>`; });
  const mark = (m, up) => { if (m == null) return; const ang = m / 1440 * Math.PI * 2 - Math.PI / 2, x = cx + Math.cos(ang) * (R + 52), y = cy + Math.sin(ang) * (R + 52); s += `<text x="${x}" y="${y + 4}" text-anchor="middle" class="ag-sun">${up ? "↑" : "↓"} ${pad(Math.floor(m / 60) % 24)}:${pad(m % 60)}</text>`; };
  mark(rise, true); mark(set, false);
  return s;
}

function chipHTML(day, list, focus, today) {
  const h = hoursOn(list, day), n = Math.min(12, Math.round(h)), heavy = list.some(e => heavyEv(e) && onDay(e, day)), d = new Date(day + "T12:00:00");
  const dots = [...Array(12)].map((_, i) => `<circle cx="${6.5 + (i % 4) * 7.6}" cy="${6.5 + Math.floor(i / 4) * 7.6}" r="2.1" fill="${i < n ? (heavy ? RED : "#fff") : "#2c2f36"}"/>`).join("");
  return `<button type="button" class="ag-chip${day === focus ? " on" : ""}${day === today ? " today" : ""}" data-fd="${day}"><em>${d.toLocaleDateString("en-US", { weekday: "short" })}</em><svg viewBox="0 0 36 29" aria-hidden="true">${dots}</svg><b>${d.getDate()}</b></button>`;
}

export function agendaHTML(ctx) {
  const { days, list, focus, today } = ctx, now = new Date();
  const nextEv = list.filter(e => !e.allDay && e.e > now).sort((a, b) => a.s - b.s).find(e => e.s > now);
  const rows = days.map(day => {
    const evs = list.filter(e => onDay(e, day)).sort((a, b) => (a.allDay ? -1 : 0) - (b.allDay ? -1 : 0) || a.s - b.s), d = new Date(day + "T12:00:00"), h = hoursOn(list, day);
    return `<section class="ag-day${day === focus ? " on" : ""}" data-day="${day}"><button type="button" class="ag-dh" data-fd="${day}"><span><b>${d.toLocaleDateString("en-US", { weekday: "short" }).toUpperCase()} ${d.getDate()}</b>${day === today ? ' <i class="ag-red">TODAY</i>' : ""}<em>${plannedFor(day).toUpperCase()}</em></span><span>${h ? h.toFixed(1) + " H" : ""}</span></button>
      ${evs.length ? evs.map(e => { const past = !e.allDay && e.e <= now, cur = !e.allDay && e.s <= now && e.e > now, nx = nextEv && e === nextEv;
        return `<button type="button" class="ag-row${past ? " past" : ""}${cur ? " now" : ""}${nx ? " next" : ""}${e.recurring ? " routine" : ""}${heavyEv(e) ? " heavy" : ""}" data-id="${esc(e.id)}"><i class="ag-dot"></i><span class="ag-time">${e.allDay ? "ALL DAY" : hhmm(e.s) + "–" + hhmm(e.e)}</span><span class="ag-title">${esc(e.title)}${e.location ? `<small>${esc(e.location)}</small>` : ""}</span><i class="ag-cal" style="background:${esc(e.color)}"></i></button>`; }).join("") : `<div class="ag-none">NOTHING SCHEDULED</div>`}</section>`;
  }).join("");
  return `<div class="ag"><div class="ag-hero"><div class="ag-dialwrap" id="agWrap"><svg class="ag-dial" id="agDial" viewBox="-20 -20 640 640" aria-label="Your day as a ring of dots"></svg>
    <div class="ag-center"><svg class="ag-clk" id="agClk" aria-hidden="true"></svg><div class="ag-cap" id="agCap"></div></div></div>
    <div class="ag-week">${days.map(d => chipHTML(d, list, focus, today)).join("")}</div>
    <div class="ag-legend">EACH DOT IS 15 MIN · <b>WHITE</b> SCHEDULED · <b class="ag-red">RED</b> HEAVY OR NEXT · INNER ARC SLEEP · OUTER ARC DAYLIGHT · DRAG ON THE RING TO SCRUB THE DAY</div></div>
    <div class="ag-list">${rows}</div></div>`;
}

// paint and wire the ring (runs after the HTML is in the page)
export function wireAgenda(root, ctx) {
  const wrap = root.querySelector("#agWrap"), svg = root.querySelector("#agDial"), clk = root.querySelector("#agClk"), cap = root.querySelector("#agCap"); if (!wrap) return;
  const { focus, list, today } = ctx, loc = place(), isToday = focus === today;
  let scrub = null, timer = null;
  const paint = () => {
    const now = isToday ? new Date() : null, m = scrub ?? (now ? mins(now) : 12 * 60), a = alt(focus, m, loc), [r, g, b] = glow(a);
    svg.innerHTML = dialSVG(focus, list, scrub, now, loc);
    wrap.style.setProperty("--glow", `rgba(${r},${g},${b},${scrub != null ? .62 : .46})`);
    const dayEv = list.filter(e => !e.allDay && onDay(e, focus)), when = at(focus, m), cur = dayEv.find(e => e.s <= when && e.e > when);
    let txt, line;
    if (scrub != null) { txt = hhmm(when); line = `${light(focus, m, loc).toUpperCase()} · SUN ${a >= 0 ? "+" : "−"}${Math.abs(a).toFixed(0)}°<br>${cur ? `<b>${esc(cur.title)}</b>` : "FREE"}`; }
    else if (now) { const fut = dayEv.filter(e => e.e > now).sort((x, y) => x.s - y.s), c = fut.find(e => e.s <= now), nx = fut.find(e => e.s > now); txt = hhmm(now); line = c ? `NOW<br><b>${esc(c.title)}</b><br>UNTIL ${hhmm(c.e)}` : nx ? `NEXT IN ${Math.floor((nx.s - now) / 36e5) ? Math.floor((nx.s - now) / 36e5) + "H " : ""}${Math.round(((nx.s - now) / 6e4) % 60)}M<br><b>${esc(nx.title)}</b>` : "NOTHING MORE TODAY"; }
    else { const d = new Date(focus + "T12:00:00"); txt = String(d.getDate()).padStart(2, "0"); line = `${d.toLocaleDateString("en-US", { weekday: "long" }).toUpperCase()}<br><b>${dayEv.length} EVENT${dayEv.length === 1 ? "" : "S"}</b>${dayEv.length ? ` · ${hoursOn(list, focus).toFixed(1)} H` : ""}`; }
    const c = clock(txt, scrub != null || !now || new Date().getSeconds() % 2 === 0); clk.setAttribute("viewBox", c.vb); clk.innerHTML = c.s; cap.innerHTML = line;
  };
  const minuteAt = e => { const r = svg.getBoundingClientRect(), x = e.clientX - (r.left + r.width / 2), y = e.clientY - (r.top + r.height / 2); if (Math.hypot(x, y) < r.width * .12) return null; let ang = Math.atan2(y, x) + Math.PI / 2; if (ang < 0) ang += Math.PI * 2; return Math.min(1425, Math.floor(ang / (Math.PI * 2) * 96) * 15); };
  svg.addEventListener("pointermove", e => { if (e.pointerType === "touch" && e.buttons !== 1) return; const m = minuteAt(e); if (m !== scrub) { scrub = m; paint(); } });
  svg.addEventListener("pointerdown", e => { if (e.pointerType === "touch") { try { svg.setPointerCapture(e.pointerId); } catch {} scrub = minuteAt(e); paint(); } });
  const done = () => { if (scrub != null) { scrub = null; paint(); } };
  svg.addEventListener("pointerleave", done); svg.addEventListener("pointerup", e => { if (e.pointerType === "touch") done(); }); svg.addEventListener("pointercancel", done);
  paint();
  if (isToday) timer = setInterval(() => { if (!wrap.isConnected) return clearInterval(timer); if (scrub == null) paint(); }, 1000);
}
