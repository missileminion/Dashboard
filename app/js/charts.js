import { esc } from "./util.js";
// All charts treat null as a gap: bars are skipped, lines break.
const segs = pts => { const out = []; let cur = []; for (const p of pts) { if (p.y == null) { if (cur.length) out.push(cur); cur = []; } else cur.push(p); } if (cur.length) out.push(cur); return out; };
const trailing = (vals, n = 7) => vals.map((v, i) => { if (v == null) return null; const w = vals.slice(Math.max(0, i - n + 1), i + 1).filter(x => x != null); return w.reduce((a, b) => a + b, 0) / w.length; });

export function bars(el, series, { color = "var(--accent)", avg = true, unit = "", dec = 0, fmt } = {}) {
  const vals = series.map(s => s.v), W = 900, H = 150, m = 30, n = series.length, bw = (W - m) / n;
  const real = vals.filter(v => v != null); if (!real.length) { el.innerHTML = `<div class="basis" style="padding:var(--s5) 0">No data in this range.</div>`; return; }
  const max = Math.max(...real) * 1.1 || 1, y = v => H - 18 - (v / max) * (H - 30);
  let s = `<svg viewBox="0 0 ${W} ${H}">`;
  [0, .5, 1].forEach(fr => { const v = max * fr; s += `<line x1="${m}" x2="${W}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)"/><text x="0" y="${y(v) + 4}" fill="var(--tx3)" font-size="10" font-family="monospace">${Math.round(v)}</text>`; });
  series.forEach((p, i) => { if (p.v == null) return; s += `<rect x="${m + i * bw + 1.5}" y="${y(p.v)}" width="${Math.max(1, bw - 3)}" height="${H - 18 - y(p.v)}" rx="2" fill="${color}" opacity=".75"><title>${esc(p.d)}: ${fmt ? fmt(p.v) : p.v.toFixed(dec) + " " + unit}</title></rect>`; });
  if (avg) { const a = trailing(vals); segs(a.map((v, i) => ({ x: m + i * bw + bw / 2, y: v == null ? null : y(v) }))).forEach(sg => { s += `<polyline fill="none" stroke="var(--tx)" stroke-width="1.5" points="${sg.map(p => `${p.x},${p.y}`).join(" ")}"/>`; }); }
  el.innerHTML = s + "</svg>";
}

const GRID = "var(--grid)";   // visible but quiet; colour comes from CSS so it works in light and dark mode
const shortDate = d => new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
// Round tick values (1, 2, 5 x 10^n) covering [lo, hi], aiming for about `count` of them.
export function niceTicks(lo, hi, count = 5) {
  const span = hi - lo || 1, raw = span / count, p = Math.pow(10, Math.floor(Math.log10(raw))), step = [1, 2, 5, 10].map(m => m * p).find(s => s >= raw) || raw;
  const out = []; for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(+v.toFixed(10)); return out;
}
let chartSeq = 0;
// Shared by the charts: a mask that fades the plot (grid and data) to nothing at its left and right edges, so nothing is cut off hard.
export const plotFade = (id, x, y, w, h) => `<linearGradient id="${id}g" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".05" stop-color="#fff"/><stop offset=".93" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient><mask id="${id}m" maskUnits="userSpaceOnUse" x="${x}" y="${y}" width="${w}" height="${h}"><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="url(#${id}g)"/></mask>`;
export function line(el, series, { color = "var(--accent)", h = 90, avg = false, dec = 0 } = {}) {
  let vals = series.map(s => s.v); if (avg) vals = trailing(vals);
  const real = vals.filter(v => v != null); if (!real.length) { el.innerHTML = `<div class="basis" style="padding:var(--s4) 0">No data in this range.</div>`; return; }
  const id = "ln" + (++chartSeq), W = 600, mL = 34, mB = 16, H = h + mB, mn0 = Math.min(...real), mx0 = Math.max(...real), pad = (mx0 - mn0) * .08 || 1, mn = mn0 - pad, mx = mx0 + pad, span = mx - mn;
  const y = v => h - 6 - ((v - mn) / span) * (h - 12), x = i => mL + (i * (W - mL)) / Math.max(1, vals.length - 1), n = vals.length;
  const ticks = niceTicks(mn, mx, 4), half = ticks.length > 1 ? (ticks[1] - ticks[0]) / 2 : 0;
  let grid = "", labels = "";
  if (half) { const minors = []; ticks.forEach(t => minors.push(t - half)); minors.push(ticks[ticks.length - 1] + half); minors.filter(v => v > mn && v < mx).forEach(v => { grid += `<line x1="${mL}" x2="${W}" y1="${y(v)}" y2="${y(v)}" stroke="var(--grid-minor)"/>`; }); }   // minor: halfway between the major lines
  ticks.forEach(v => { grid += `<line x1="${mL}" x2="${W}" y1="${y(v)}" y2="${y(v)}" stroke="${GRID}"/>`; labels += `<text x="${mL - 5}" y="${y(v) + 3}" font-size="9" text-anchor="end" fill="var(--tx3)">${v.toFixed(dec)}</text>`; });
  grid += `<line x1="${mL}" x2="${mL}" y1="0" y2="${h}" stroke="${GRID}"/><line x1="${mL}" x2="${W}" y1="${h}" y2="${h}" stroke="${GRID}"/>`;
  if (series[0]?.d && /^\d{4}-/.test(series[0].d)) {   // major: every `step` days with a date on every second one; minor: the days in between
    const step = n <= 14 ? 1 : n <= 31 ? 2 : n <= 100 ? 7 : 14, minor = step >= 14 ? 2 : step >= 7 ? 1 : 0;
    if (minor) for (let i = n - 1; i >= 0; i--) if ((n - 1 - i) % step !== 0 && (n - 1 - i) % minor === 0) grid += `<line x1="${x(i)}" x2="${x(i)}" y1="0" y2="${h}" stroke="var(--grid-minor)"/>`;
    for (let i = n - 1, k = 0; i >= 0; i -= step, k++) { const lab = k % 2 === 0; grid += `<line x1="${x(i)}" x2="${x(i)}" y1="0" y2="${h}" stroke="${GRID}"/><line x1="${x(i)}" x2="${x(i)}" y1="${h}" y2="${h + 3}" stroke="var(--tx3)"/>`; if (lab) labels += `<text x="${x(i)}" y="${H - 2}" font-size="9" text-anchor="${i === n - 1 ? "end" : "middle"}" fill="var(--tx3)">${shortDate(series[i].d)}</text>`; }
  }
  let data = ""; segs(vals.map((v, i) => ({ x: x(i), y: v == null ? null : y(v) }))).forEach(sg => { data += sg.length === 1 ? `<circle cx="${sg[0].x}" cy="${sg[0].y}" r="2" fill="${color}"/>` : `<polyline fill="none" stroke="${color}" stroke-width="1.8" stroke-linejoin="round" points="${sg.map(p => `${p.x},${p.y}`).join(" ")}"/>`; });
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" font-family="monospace"><defs>${plotFade(id, mL, 0, W - mL, H)}</defs><g mask="url(#${id}m)">${grid}${data}</g>${labels}</svg>`;
}

// One row per vital: the number is white inside your usual range and red outside it. No labels, no tags.
export function vital(name, v, unit, range, dec, note = "") {
  if (v == null) return `<div class="row" style="grid-template-columns:1fr auto;padding:5px 0"><div>${name}</div><div class="gap">—</div></div>`;
  if (!range) return `<div class="row" style="grid-template-columns:1fr auto;padding:5px 0"><div>${name}</div><div><span class="num" style="font-size:15px">${v.toFixed(dec)}</span> <span class="basis">${unit}</span></div></div>`;
  const [lo, hi] = range, span = (hi - lo) * 2 || 1, mn = lo - (hi - lo) / 2, pos = Math.min(100, Math.max(0, (v - mn) / span * 100)), inR = v >= lo && v <= hi;
  return `<div class="row" style="grid-template-columns:110px 1fr 90px;padding:5px 0"><div>${name}</div><div title="usual range ${lo.toFixed(dec)} to ${hi.toFixed(dec)} ${unit}${note}"><div class="range" style="margin:0 0 3px"><i style="left:25%;width:50%"></i><b style="left:${pos}%${inR ? "" : ";background:var(--worse)"}"></b></div><div class="basis num">${lo.toFixed(dec)} to ${hi.toFixed(dec)} ${unit}</div></div><div style="text-align:right"><span class="num ${inR ? "" : "worse"}" style="font-size:16px;font-weight:600">${v.toFixed(dec)}</span></div></div>`;
}
