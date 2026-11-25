// The day path on the phone: the web Calendar's centrepiece (agenda.js) at thumb size. Your day laid along the sun's real path in dots,
// events lit on it, now in yellow, the sleep window along the bottom. Press and hold the path, then slide, to move the clock through the day;
// a plain swipe still scrolls. Under it: what is on now or next, and the day budget (free, booked, daylight, load), from the same formulas.
import { timelineSVG, budget, dayLoad, place, alt, glow, light, onDay, hoursOn, chipHTML, VW, X0, X1, Xm, mins, hhmm, budgetHM as hm } from "./agenda.js";
import { esc, addDays, ymd } from "./util.js";

export function pathHTML(focus, list, today) {
  const days = [...Array(7)].map((_, k) => addDays(today, k));
  return `<div class="dp" id="dp"><div class="dp-sc" id="dpSc"><svg class="ag-path" id="dpPath" viewBox="0 0 ${VW} 436" aria-label="Your day along the sun's path"></svg></div></div>
    <div class="dp-cap" id="dpCap"></div><div class="dp-stats" id="dpStats"></div>
    <div class="ag-week dp-week">${days.map(d => chipHTML(d, list, focus, today)).join("")}</div>`;
}

let timer = 0;
export function wirePath(root, focus, list, today) {
  const box = root.querySelector("#dp"), svg = root.querySelector("#dpPath"), sc = root.querySelector("#dpSc"), cap = root.querySelector("#dpCap"), stats = root.querySelector("#dpStats"); if (!svg) return;
  const loc = place(), isToday = focus === today; let scrub = null;
  const paint = () => {
    const now = isToday ? new Date() : null, m = scrub ?? (now ? mins(now) : 12 * 60), a = alt(focus, m, loc), [r, g, b] = glow(a);
    const k = (svg.getBoundingClientRect().width || 700) / VW; svg.style.setProperty("--k", k.toFixed(3));
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
  // press and hold, then slide: scrub. A quick swipe scrolls the path sideways as usual.
  const minuteAt = x => { const r = svg.getBoundingClientRect(), f = (x - r.left) / r.width * VW; return Math.max(0, Math.min(1435, Math.round((f - X0) / (X1 - X0) * 288) * 5)); };
  let hold = 0, sx = 0, sy = 0, on = false;
  svg.addEventListener("touchstart", e => { const t = e.touches[0]; sx = t.clientX; sy = t.clientY; clearTimeout(hold); hold = setTimeout(() => { on = true; scrub = minuteAt(sx); try { navigator.vibrate?.(10); } catch {} paint(); }, 220); }, { passive: true });
  svg.addEventListener("touchmove", e => { const t = e.touches[0]; if (on) { e.preventDefault(); const m = minuteAt(t.clientX); if (m !== scrub) { scrub = m; paint(); } } else if (Math.abs(t.clientX - sx) > 8 || Math.abs(t.clientY - sy) > 8) clearTimeout(hold); }, { passive: false });
  const end = () => { clearTimeout(hold); if (on) { on = false; scrub = null; paint(); } };
  svg.addEventListener("touchend", end); svg.addEventListener("touchcancel", end);
  svg.addEventListener("pointermove", e => { if (e.pointerType !== "mouse") return; const m = minuteAt(e.clientX); if (m !== scrub) { scrub = m; paint(); } });
  svg.addEventListener("pointerleave", e => { if (e.pointerType === "mouse" && scrub != null) { scrub = null; paint(); } });
  paint();
  // start centred on now (today), or on the day's first event, or 09:00
  const first = list.filter(e => !e.allDay && onDay(e, focus)).sort((x, y) => x.s - y.s)[0], m0 = isToday ? mins(new Date()) : first ? mins(first.s) : 9 * 60;
  const centre = () => { sc.scrollLeft = Math.max(0, Xm(m0) / VW * sc.scrollWidth - sc.clientWidth / 2); }; centre(); requestAnimationFrame(centre);
  clearInterval(timer); if (isToday) timer = setInterval(() => { if (!svg.isConnected || document.hidden) return; if (scrub == null) paint(); }, 30e3);
}
export const todayYmd = () => ymd(new Date());
