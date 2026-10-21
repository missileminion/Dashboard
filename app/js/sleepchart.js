import { $, hm, pad, dayLabel } from "./util.js";
const LANES = ["AWAKE", "REST", "REM", "LIGHT", "DEEP"];
const COL = { AWAKE: "var(--st-awake)", REST: "var(--st-restless)", REM: "var(--st-rem)", LIGHT: "var(--st-light)", DEEP: "var(--st-deep)" };
const LAB = { AWAKE: "Total awake", REST: "Restlessness", REM: "REM", LIGHT: "Light", DEEP: "Deep" };
const BRIEF = 180; // wakes shorter than 3 min inside the night count as restlessness, as in Fitbit's own export

const fmtMin = m => (m >= 60 ? hm(m) : `${Math.round(m)} min`);
const clock = sod => `${pad(Math.floor(sod / 3600) % 24)}:${pad(Math.floor(sod % 3600 / 60))}`;
const clockS = sod => `${clock(sod)}:${pad(Math.floor(sod % 60))}`;

// Draws one night from the API's stage list. Every block sits at its exact recorded start and end.
export function drawNight(day, { restKnown = true } = {}) {
  const raw = (day.sleepStages || []).map(([type, a, b]) => ({ type, a: Date.parse(a) / 1000, b: Date.parse(b) / 1000 })).filter(g => g.b > g.a);
  if (!raw.length) { $("hyp").innerHTML = `<div class="basis" style="padding:var(--s6) 0">No stage detail for this night.</div>`; $("sleepStats").innerHTML = ""; return; }
  const t0 = raw[0].a, total = raw[raw.length - 1].b - t0, off = day.sleepOffset || 0, sod = s => ((s + off) % 86400 + 86400) % 86400;
  const segs = raw.map((g, i) => {
    let lane = g.type === "AWAKE" ? ((g.b - g.a < BRIEF && i > 0 && i < raw.length - 1) ? "REST" : "AWAKE") : g.type === "RESTLESS" ? "REST" : (["REM", "LIGHT", "DEEP"].includes(g.type) ? g.type : "LIGHT");
    return { lane, s: g.a - t0, e: g.b - t0 };
  });
  const dur = l => segs.filter(g => g.lane === l).reduce((a, g) => a + g.e - g.s, 0) / 60;
  const W = 960, rowH = 36, gap = 36, top = 30, H = top + 5 * (rowH + gap) - gap + 34, x = sec => sec / total * W, rt = l => top + LANES.indexOf(l) * (rowH + gap), rc = l => rt(l) + rowH / 2;
  let s = `<svg viewBox="0 0 ${W} ${H}" id="hypSvg" font-family="Inter,system-ui,sans-serif">`;
  LANES.forEach(l => s += `<text x="0" y="${rt(l) - 11}" font-size="15" fill="var(--tx)">${LAB[l]} <tspan fill="var(--tx2)">• ${l === "REST" && !restKnown ? "not in Google Health data" : fmtMin(dur(l))}</tspan></text><rect x="0" y="${rt(l)}" width="${W}" height="${rowH}" rx="${rowH / 2}" fill="var(--track)"/>`);
  const main = segs.filter(g => g.lane !== "REST");
  main.forEach((g, i) => { const p = main[i - 1]; if (p && p.lane !== g.lane) s += `<line x1="${x(g.s)}" x2="${x(g.s)}" y1="${rc(p.lane)}" y2="${rc(g.lane)}" stroke="var(--link)" stroke-opacity=".55" stroke-width="2"/>`; });
  segs.forEach(g => { const x0 = x(g.s), w = Math.max(1.6, x(g.e) - x0); s += `<rect x="${x0}" y="${rt(g.lane)}" width="${w}" height="${rowH}" rx="${g.lane === "REST" ? 0 : Math.min(rowH / 2, w / 2)}" fill="${COL[g.lane]}"/>`; });
  s += `<text x="0" y="${H - 6}" font-size="16" fill="var(--tx2)">${clock(sod(t0))}</text><text x="${W / 2}" y="${H - 6}" font-size="16" text-anchor="middle" fill="var(--tx2)">${clock(sod(t0 + total / 2))}</text><text x="${W}" y="${H - 6}" font-size="16" text-anchor="end" fill="var(--tx2)">${clock(sod(t0 + total))}</text>`;
  s += `<line id="cur" y1="${top - 8}" y2="${H - 30}" stroke="#ffffff66" visibility="hidden"/><rect id="hit" x="0" y="${top - 8}" width="${W}" height="${H - 30 - top + 8}" fill="transparent"/></svg>`;
  $("hyp").innerHTML = s;
  const svg = $("hypSvg"), tip = $("tip");
  $("hit").onmousemove = ev => {
    const r = svg.getBoundingClientRect(), px = (ev.clientX - r.left) / r.width * W, sec = Math.max(0, Math.min(total - 1, px / W * total));
    const g = segs.find(q => sec >= q.s && sec < q.e) || segs[segs.length - 1], dm = Math.round((g.e - g.s) / 30) * 30;
    $("cur").setAttribute("x1", px); $("cur").setAttribute("x2", px); $("cur").setAttribute("visibility", "visible");
    tip.innerHTML = `<div class="t">${clockS(sod(t0 + sec))}</div><div><span style="color:${COL[g.lane]}">●</span> ${g.lane === "AWAKE" ? "Awake" : g.lane === "REST" ? "Restless (brief wake)" : LAB[g.lane]} · ${Math.floor(dm / 60)}m ${pad(dm % 60)}s block</div>`;
    tip.style.display = "block"; const fr = px / W; tip.style.left = `calc(${fr * 100}% ${fr > .75 ? "- 190px" : "+ 14px"})`; tip.style.top = "40px";
  };
  $("hit").onmouseleave = () => { $("cur").setAttribute("visibility", "hidden"); tip.style.display = "none"; };
  $("sleepStats").innerHTML = `<div class="big">${hm(day.sleepMin)}<small>asleep · ${clock(sod(t0))}–${clock(sod(t0 + total))}</small></div>`;
}
