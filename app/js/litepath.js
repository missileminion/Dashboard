// The day path on the phone: the day as a dial. A wide semicircle whose top is now (under a fixed pointer); the hours are marked
// round it and turn with the clock, events sit on it as bands in their priority colour with their names along the curve, and it
// fades out into both edges of the screen, so nothing is cut. Daylight hours are brighter than night ones (the sun's real times
// for your city). Drag across it to move a second pointer through the day; let go and it returns to now.
// Under it: what is on now or next, and the day budget (free, booked, daylight, load), from the same formulas as the web.
import { budget, dayLoad, place, alt, glow, light, onDay, hoursOn, chipHTML, mins, hhmm, budgetHM as hm } from "./agenda.js";
import { esc, addDays, ymd } from "./util.js";
import { haptic } from "./haptic.js";

const W = 400, H = 200, CX = 200, CY = 340, R = 300;            // the arc: centre well below the box, so it spans the width
const DPM = 48 / 360;                                           // degrees per minute: the screen edges (±42°) show about ±5¼ h around now
const P = (deg, r) => { const t = (deg - 90) * Math.PI / 180; return [CX + r * Math.cos(t), CY + r * Math.sin(t)]; };
const arc = (d1, d2, r) => { const [x1, y1] = P(d1, r), [x2, y2] = P(d2, r); return `M${x1.toFixed(1)} ${y1.toFixed(1)}A${r} ${r} 0 0 1 ${x2.toFixed(1)} ${y2.toFixed(1)}`; };
const hlab = h => `${h % 12 || 12}${h < 12 ? "a" : "p"}`;

export function pathHTML(focus, list, today) {
  const days = [...Array(7)].map((_, k) => addDays(today, k));
  return `<div class="dp" id="dp"><svg class="dp-dial" id="dpPath" viewBox="0 0 ${W} ${H}" aria-label="Your day as a dial: now at the top, events around it"></svg></div>
    <div class="dp-cap" id="dpCap"></div><div class="dp-stats" id="dpStats"></div>
    <div class="ag-week dp-week">${days.map(d => chipHTML(d, list, focus, today)).join("")}</div>`;
}

// the dial for a day: c = the minute under the top pointer, s = the scrubbed minute (or null), now = minute now (or null)
function dial(focus, list, c, s, now, loc) {
  const dayEv = list.filter(e => !e.allDay && onDay(e, focus)), d0 = new Date(focus + "T00:00:00").getTime();
  const deg = m => (m - c) * DPM, vis = m => Math.abs(deg(m)) <= 47;
  let o = `<defs>`;
  const bands = [], labels = [], shown = [];
  dayEv.forEach(e => {
    const m1 = Math.max(0, (e.s - d0) / 6e4), m2 = Math.min(1440, (e.e - d0) / 6e4); if (m2 <= m1) return;
    const a1 = Math.max(-48, deg(m1)), a2 = Math.min(48, deg(m2)); if (a2 <= a1) return;
    const col = e.pri === 3 ? "var(--p3)" : e.pri === 2 ? "var(--p2)" : e.pri === 1 ? "var(--p1)" : "var(--tx2)";
    bands.push(`<path d="${arc(a1, a2 - Math.min(.6, (a2 - a1) / 4), R - 26)}" stroke="${col}" stroke-width="9" stroke-linecap="round" fill="none" opacity="${e.done ? .3 : .95}"/>`);
    shown.push({ e, mid: (a1 + a2) / 2, half: (a2 - a1) / 2 });
  });
  // names along the curve, each given room up to halfway to its neighbours' (at most ±13°), so short events still read
  shown.sort((x, y) => x.mid - y.mid).forEach((v, i, all) => {
    const room = Math.min(13, Math.max(v.half, Math.min(i ? (v.mid - all[i - 1].mid) / 2 : 99, i < all.length - 1 ? (all[i + 1].mid - v.mid) / 2 : 99)));
    const len = 2 * room * Math.PI / 180 * (R - 46), max = Math.floor(len / 6.2); if (max < 3) return;
    o += `<path id="dpe${i}" d="${arc(v.mid - room, v.mid + room, R - 46)}"/>`;
    const t = v.e.title.length > max ? v.e.title.slice(0, max - 1) + "…" : v.e.title;
    labels.push(`<text class="dp-ev${v.e.done ? " done" : ""}"><textPath href="#dpe${i}" startOffset="50%" text-anchor="middle">${esc(t)}</textPath></text>`);
  });
  o += `</defs>`;
  // the scale: a mark every 15 min, longer on the hour with its label; brighter while the sun is up
  for (let m = Math.ceil((c - 420) / 15) * 15; m <= c + 420; m += 15) {
    if (m < 0 || m > 1440 || !vis(m)) continue;
    const a = deg(m), hour = m % 60 === 0, half = m % 30 === 0, day = alt(focus, Math.min(1439, m), loc) > 0;
    const len = hour ? 13 : half ? 7 : 4, [x1, y1] = P(a, R), [x2, y2] = P(a, R - len);
    o += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" class="dp-t${hour ? " h" : ""}${day ? " day" : ""}"/>`;
    if (hour && Math.abs(a) > 3.5) { const [lx, ly] = P(a, R + 11); o += `<text class="dp-h${day ? " day" : ""}" x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" transform="rotate(${a.toFixed(2)} ${lx.toFixed(1)} ${ly.toFixed(1)})">${hlab(m / 60 % 24)}</text>`; }
  }
  o += bands.join("") + labels.join("");
  // the pointers: now (or the day's centre) fixed at the top; while scrubbing a second one follows the finger
  const [px1, py1] = P(0, R + 2), [px2, py2] = P(0, R - 31);
  o += `<line class="dp-now" x1="${px1}" y1="${py1}" x2="${px2}" y2="${py2}"/>`;
  if (s != null && vis(s)) { const [a, b] = P(deg(s), R + 2), [cc, dd] = P(deg(s), R - 31); o += `<line class="dp-scrub" x1="${a.toFixed(1)}" y1="${b.toFixed(1)}" x2="${cc.toFixed(1)}" y2="${dd.toFixed(1)}"/>`; }
  const t = s ?? now ?? c, hh = Math.floor(t / 60) % 24, mm = Math.round(t % 60);
  o += `<text class="dp-clock" x="${CX}" y="${H - 34}">${hh % 12 || 12}:${String(mm).padStart(2, "0")}<tspan class="ap"> ${hh < 12 ? "am" : "pm"}</tspan></text>`;
  return o;
}

let timer = 0;
export function wirePath(root, focus, list, today) {
  const box = root.querySelector("#dp"), svg = root.querySelector("#dpPath"), cap = root.querySelector("#dpCap"), stats = root.querySelector("#dpStats"); if (!svg) return;
  const loc = place(), isToday = focus === today; let scrub = null, centre = 0;
  const first = list.filter(e => !e.allDay && onDay(e, focus)).sort((x, y) => x.s - y.s)[0];
  const paint = () => {
    const now = isToday ? new Date() : null, m = scrub ?? (now ? mins(now) : 12 * 60), a = alt(focus, m, loc), [r, g, b] = glow(a);
    if (scrub == null) centre = now ? mins(now) : first ? Math.max(mins(first.s), 9 * 60) : 12 * 60;   // the dial only turns with the clock, never while you drag
    svg.innerHTML = dial(focus, list, centre, scrub, now ? mins(now) : null, loc);
    box.style.setProperty("--glow", `rgba(${r},${g},${b},${scrub != null ? .7 : .5})`);
    const dayEv = list.filter(e => !e.allDay && onDay(e, focus)), when = new Date(new Date(focus + "T00:00:00").getTime() + m * 6e4), B = budget(focus, list, m, loc), ld = dayLoad(focus, list);
    let line;
    if (scrub != null) { const cur = dayEv.find(e => e.s <= when && e.e > when); line = `${light(focus, m, loc)} · sun ${a >= 0 ? "+" : "−"}${Math.abs(a).toFixed(0)}°<b>${cur ? esc(cur.title) : "Free"}</b>`; }
    else if (now) { const fut = dayEv.filter(e => e.e > now).sort((x, y) => x.s - y.s), c = fut.find(e => e.s <= now), nx = fut.find(e => e.s > now), mm = nx ? Math.round((nx.s - now) / 6e4) : 0;
      line = c ? `Now · until ${hhmm(c.e)}<b>${esc(c.title)}</b>` : nx ? `Next in ${mm >= 60 ? Math.floor(mm / 60) + "h " : ""}${mm % 60}m<b>${esc(nx.title)}</b>` : `Nothing more today<b>Free</b>`; }
    else line = `${new Date(focus + "T12:00:00").toLocaleDateString("en-US", { weekday: "long" })}<b>${dayEv.length} event${dayEv.length === 1 ? "" : "s"}${dayEv.length ? ` · ${hoursOn(list, focus).toFixed(1)} h` : ""}</b>`;
    cap.innerHTML = line;
    const dl = B.dl == null ? "—" : B.dl > 0 ? hm(B.dl / 60) : B.dl < 0 ? "in " + hm(-B.dl / 60) : "over";
    const st = (lb, v, red) => `<div><span>${lb}</span><b class="${red ? "bad" : ""}">${v}</b></div>`;
    stats.innerHTML = st("Free", hm(B.freeLeft).toLowerCase()) + st("Booked", hm(B.bookedLeft).toLowerCase()) + st(B.dl != null && B.dl < 0 ? "Sunrise" : "Daylight", dl.toLowerCase()) + st("Load", ld.toFixed(1), ld >= 10);
  };
  // drag across the path to scrub (vertical swipes still scroll the page); a mouse just hovers
  const minuteAt = (x, y) => { const r = svg.getBoundingClientRect(), k = r.width / W, px = (x - r.left) / k, py = (y - r.top) / k;   // the angle of the finger seen from the arc's centre
    const deg = Math.atan2(px - CX, CY - py) * 180 / Math.PI; return Math.max(0, Math.min(1435, Math.round((centre + deg / DPM) / 5) * 5)); };
  const evAt = m => { const w = new Date(focus + "T00:00:00").getTime() + m * 6e4; return list.find(e => !e.allDay && onDay(e, focus) && +e.s <= w && +e.e > w) || null; };
  const set = (x, y) => { const m = minuteAt(x, y); if (m === scrub) return;   // haptics: a stronger tick crossing into another event, a light one each hour
    const was = scrub; scrub = m; paint();
    if (was == null) return; if (evAt(was) !== evAt(m)) haptic("major"); else if (Math.floor(was / 60) !== Math.floor(m / 60)) haptic("minor"); };
  svg.addEventListener("pointerdown", e => { if (e.pointerType === "mouse") return; try { svg.setPointerCapture(e.pointerId); } catch {} set(e.clientX, e.clientY); });
  svg.addEventListener("pointermove", e => { if (e.pointerType === "mouse" || e.buttons) set(e.clientX, e.clientY); });
  const end = () => { if (scrub != null) { scrub = null; paint(); } };
  svg.addEventListener("pointerup", e => { if (e.pointerType !== "mouse") end(); }); svg.addEventListener("pointercancel", end); svg.addEventListener("pointerleave", e => { if (e.pointerType === "mouse") end(); });
  paint();
  clearInterval(timer); if (isToday) timer = setInterval(() => { if (!svg.isConnected || document.hidden) return; if (scrub == null) paint(); }, 60e3);
}
export const todayYmd = () => ymd(new Date());
