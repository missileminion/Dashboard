// The day path on the phone: the web Calendar's centrepiece (agenda.js) at thumb size. Your day laid along the sun's real path in dots,
// events lit on it, now in yellow, the sleep window along the bottom. A fixed window of 16 hours with the clock in the middle: the path
// slides through it as the day goes, and fades out at every edge. Drag across it to move the clock; let go and it returns to now.
// Under it: what is on now or next, and the day budget (free, booked, daylight, load), from the same formulas as the web.
import { timelineSVG, budget, dayLoad, place, alt, glow, light, onDay, hoursOn, chipHTML, VW, X0, X1, Xm, mins, hhmm, budgetHM as hm } from "./agenda.js";
import { esc, addDays, ymd } from "./util.js";

export function pathHTML(focus, list, today) {
  const days = [...Array(7)].map((_, k) => addDays(today, k));
  return `<div class="dp" id="dp"><svg class="ag-path" id="dpPath" viewBox="0 0 ${VW} 436" preserveAspectRatio="xMidYMid meet" aria-label="Your day along the sun's path"></svg></div>
    <div class="dp-cap" id="dpCap"></div><div class="dp-stats" id="dpStats"></div>
    <div class="ag-week dp-week">${days.map(d => chipHTML(d, list, focus, today)).join("")}</div>`;
}

let timer = 0;
const HALF = 480;   // minutes either side of the centre
export function wirePath(root, focus, list, today) {
  const box = root.querySelector("#dp"), svg = root.querySelector("#dpPath"), cap = root.querySelector("#dpCap"), stats = root.querySelector("#dpStats"); if (!svg) return;
  const loc = place(), isToday = focus === today; let scrub = null, centre = 0;
  const first = list.filter(e => !e.allDay && onDay(e, focus)).sort((x, y) => x.s - y.s)[0];
  const vx = () => Xm(centre - HALF), vw = () => Xm(centre + HALF) - Xm(centre - HALF);
  const paint = () => {
    const now = isToday ? new Date() : null, m = scrub ?? (now ? mins(now) : 12 * 60), a = alt(focus, m, loc), [r, g, b] = glow(a);
    if (scrub == null) centre = now ? mins(now) : first ? Math.max(mins(first.s), 9 * 60) : 12 * 60;   // the view only moves with the clock, never while you drag
    svg.setAttribute("viewBox", `${vx().toFixed(1)} 0 ${vw().toFixed(1)} 436`);
    const k = (svg.getBoundingClientRect().width || 343) / vw(); svg.style.setProperty("--k", k.toFixed(3));
    svg.innerHTML = timelineSVG(focus, list, scrub, now, loc, k);
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
  const minuteAt = x => { const r = svg.getBoundingClientRect(), f = vx() + (x - r.left) / r.width * vw(); return Math.max(0, Math.min(1435, Math.round((f - X0) / (X1 - X0) * 288) * 5)); };
  const set = x => { const m = minuteAt(x); if (m !== scrub) { scrub = m; paint(); } };
  svg.addEventListener("pointerdown", e => { if (e.pointerType === "mouse") return; try { svg.setPointerCapture(e.pointerId); } catch {} set(e.clientX); });
  svg.addEventListener("pointermove", e => { if (e.pointerType === "mouse" || e.buttons) set(e.clientX); });
  const end = () => { if (scrub != null) { scrub = null; paint(); } };
  svg.addEventListener("pointerup", e => { if (e.pointerType !== "mouse") end(); }); svg.addEventListener("pointercancel", end); svg.addEventListener("pointerleave", e => { if (e.pointerType === "mouse") end(); });
  paint();
  clearInterval(timer); if (isToday) timer = setInterval(() => { if (!svg.isConnected || document.hidden) return; if (scrub == null) paint(); }, 60e3);
}
export const todayYmd = () => ymd(new Date());
