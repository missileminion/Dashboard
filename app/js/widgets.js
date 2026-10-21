import { $, esc, hm, pad, dayLabel, addDays, mmss, n3 } from "./util.js";
import { niceTicks, plotFade } from "./charts.js";
import { red } from "./standards.js";
import { heartRateRecovery, WEAK_WEIGHTS, DAILY_CUT } from "./analytics.js";
import { tri, TRI_FILL, TRI_BAR, nightScores, sleepQuality, TARGET } from "./analytics.js";

const pct = s => (s == null ? "no data" : Math.round(s * 100) + "%");
const LEGEND = (a = "Bad", b = "Good") => `<div class="basis" style="display:flex;align-items:center;gap:var(--s3);margin-top:var(--s3);flex-wrap:wrap"><span class="sw" style="background:var(--bad)"></span>${a}<span class="sw" style="background:var(--mid)"></span>Middling<span class="sw" style="background:var(--good)"></span>${b}<span class="sw" style="background:var(--none);border:1px solid var(--none-bd)"></span>No data</div>`;

// ---------- Sleep Month: one square per day, scored 0-100 by the sleep quality equation ----------
// Columns are weeks (Monday at the top). Red = poor (under 60), white = good (80+), dark = middling or no data.
export function sleepMonth(el, byDate, days, today, n = 60) {
  const dates = [...Array(n)].map((_, i) => addDays(today, -(n - 1 - i)));   // 4 rows of 15, oldest first, read left to right
  const scores = dates.map(d => { const r = byDate[d] && sleepQuality(byDate[d], days); return r ? r.score : null; });
  const cells = dates.map((d, i) => `<i class="blk ${tri(scores[i] == null ? null : scores[i] / 100)}" title="${esc(dayLabel(d))} · ${scores[i] == null ? "no data" : Math.round(scores[i]) + " / 100"}"></i>`).join("");
  const have = scores.filter(v => v != null), avg = have.length ? have.reduce((a, b) => a + b, 0) / have.length : null;
  const cnt = k => scores.filter(v => v != null && tri(v / 100) === k).length;
  el.innerHTML = `<div class="mflex"><div class="mgrid">${cells}</div><div class="mstats">
    <div><div class="basis">Average</div><div class="num ${avg != null ? red("sleepQuality", avg) : ""}" style="font-size:24px;font-weight:600;line-height:1.1">${avg == null ? "—" : Math.round(avg)}<small style="font-size:11px;color:var(--tx2);margin-left:4px;font-weight:400">/ 100</small></div></div>
    <div><div class="basis"><i class="sw" style="background:var(--good)"></i> Good, 80+</div><div class="num">${cnt("good")} nights</div></div>
    <div><div class="basis"><i class="sw" style="background:var(--mid)"></i> Middling</div><div class="num">${cnt("mid")} nights</div></div>
    <div><div class="basis"><i class="sw" style="background:var(--bad)"></i> Poor, under 60</div><div class="num">${cnt("bad")} nights</div></div>
    <div style="color:var(--tx3)"><div class="basis"><i class="sw" style="background:var(--none);border:1px solid var(--none-bd)"></i> No data</div><div class="num">${scores.length - have.length} nights</div></div></div></div>`;
}

// ---------- Early Signs: a gas orb. Six drifting energy points, warped by flowing noise, so the whole shape keeps changing ----------
let orbRaf = 0;
export function earlyOrb(el, r, prev = null) {
  cancelAnimationFrame(orbRaf);
  const ok = r.composite != null, kind = !ok ? "none" : r.status === "Strong" ? "major" : r.status === "Mild" ? "minor" : r.status === "Low" ? "low" : "clear";
  const fmtz = z => (z == null ? "—" : (z >= 0 ? "+" : "−") + n3(z));
  el.innerHTML = `<div class="orbwrap"><canvas class="orbcv" width="110" height="110"></canvas><div class="orbtext"><div class="${ok && r.status !== "All clear =)" ? "worse" : ""}" style="font-size:26px;font-weight:600;letter-spacing:-.02em">${r.status}</div></div></div>
  <div style="margin-top:var(--s2)">${r.parts.map(p => `<div class="row" style="grid-template-columns:1fr auto auto;gap:var(--s3);padding:4px 0"><span>${p.name}${p.ctx && p.expected != null ? `<div class="basis">expected ${p.expected.toFixed(p.unit === "ms" ? 0 : 1)} ${p.unit} given your last day</div>` : ""}</span><span class="num basis">${p.today == null ? "—" : (+p.today).toFixed(p.unit === "ms" ? 0 : 1)} ${p.unit}</span><span class="num ${p.z != null ? red("signZ", p.z) : ""}" style="min-width:44px;text-align:right">${fmtz(p.z)}</span></div>`).join("")}</div>`;
  const cv = el.querySelector("canvas"), g = cv.getContext("2d"), N = cv.width, img = g.createImageData(N, N), d = img.data;
  const k = ok ? Math.min(1, Math.max(0, r.composite / 2.0)) : 0, B = [38, 118, 255], R = [255, 32, 32], rgb = ok ? B.map((v, i) => v + (R[i] - v) * k) : [112, 116, 124];   // blue = healthy, shifting to red as signs grow
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  function frame(ms) {
    if (!cv.isConnected) return;
    const t = ms / 1000, P = [];
    for (let i = 0; i < 6; i++) P.push([.5 + .24 * Math.sin(t * (.21 + .09 * i) + i * 2.1) * Math.cos(t * (.13 + .07 * i) + i), .5 + .24 * Math.cos(t * (.17 + .08 * i) + i * 1.3) * Math.sin(t * (.11 + .06 * i) + i * 1.7), .075 + .055 * (.5 + .5 * Math.sin(t * (.35 + .11 * i) + i * 1.9))]);
    for (let y = 0, k = 0; y < N; y++) for (let x = 0; x < N; x++, k += 4) {
      const u = x / N, v = y / N, rr = Math.hypot(u - .5, v - .5) * 2;
      const wx = u + .09 * Math.sin(4.2 * v + t * .85) + .05 * Math.sin(9 * u - t * .55) + .03 * Math.sin(15 * v + t * 1.3), wy = v + .09 * Math.cos(4.6 * u + t * .75) + .05 * Math.cos(8 * v + t * .65) + .03 * Math.cos(13 * u - t * 1.1);
      let f = 0; for (const p of P) { const dx = wx - p[0], dy = wy - p[1]; f += p[2] * p[2] / (dx * dx + dy * dy + .0006); }
      const fade = rr >= 1 ? 0 : rr < .6 ? 1 : 1 - (rr - .6) / .4, a = Math.min(1, (1 - Math.exp(-f * .62)) * fade * fade * 1.15), hot = Math.max(0, a - .72) * 1.1;
      d[k] = rgb[0] + (255 - rgb[0]) * hot * .55; d[k + 1] = rgb[1] + (255 - rgb[1]) * hot * .55; d[k + 2] = rgb[2] + (255 - rgb[2]) * hot * .55; d[k + 3] = a * 255;
    }
    g.putImageData(img, 0, 0);
    if (!reduce) orbRaf = requestAnimationFrame(frame);
  }
  orbRaf = requestAnimationFrame(frame);
}

// ---------- Year Ring ----------
// Twelve month blocks around a circle. Inside a block the squares sit on one even grid (5 columns x 7 rows, filled down each
// column in turn, first day at the inner edge), so every square has the same size and spacing. Each block is rotated to face outward.
export function yearRing(el, scoreFn, today) {
  const year = +today.slice(0, 4), C = 250, W = 500, Rc = 160, P = 11.5, SZ = 8.5, COLS = 5, ROWS = 7;
  const MN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  let s = `<svg viewBox="0 0 ${W} ${W}" font-family="Inter,system-ui,sans-serif" style="max-width:460px;margin:0 auto">`;
  const known = [];
  for (let m = 0; m < 12; m++) {
    const th = (m * 30 + 15) * Math.PI / 180, ux = Math.sin(th), uy = -Math.cos(th), tx = Math.cos(th), ty = Math.sin(th), n = new Date(year, m + 1, 0).getDate(), deg = (th * 180 / Math.PI).toFixed(2);
    const cx = C + Rc * ux, cy = C + Rc * uy, lx = C + (Rc + 62) * ux, ly = C + (Rc + 62) * uy;
    s += `<text x="${lx.toFixed(1)}" y="${(ly + 3).toFixed(1)}" font-size="10" text-anchor="middle" fill="var(--tx3)" letter-spacing=".06em">${MN[m].toUpperCase()}</text>`;
    for (let d = 1; d <= n; d++) {
      const k = d - 1, col = Math.floor(k / ROWS), row = k % ROWS, gx = (col - (COLS - 1) / 2) * P, gy = (row - (ROWS - 1) / 2) * P;
      const x = cx + gx * tx + gy * ux, y = cy + gx * ty + gy * uy;
      const date = `${year}-${pad(m + 1)}-${pad(d)}`, future = date > today, sc = future ? null : scoreFn(date), t = sc == null ? "none" : sc >= DAILY_CUT ? "good" : "bad", isToday = date === today;
      if (sc != null) known.push(sc);
      s += `<rect x="${-SZ / 2}" y="${-SZ / 2}" width="${SZ}" height="${SZ}" rx="1.2" transform="translate(${x.toFixed(2)} ${y.toFixed(2)}) rotate(${deg})" fill="${future ? "var(--future)" : TRI_FILL[t]}"${isToday ? ' stroke="#fff" stroke-width="1.2"' : t === "none" && !future ? ' stroke="var(--none-bd)" stroke-width=".9"' : ""}><title>${date}: ${future ? "upcoming" : sc == null ? "no score" : Math.round(sc * 100)}</title></rect>`;
    }
  }
  const avgS = known.length ? known.reduce((a, b) => a + b, 0) / known.length : null;
  s += `<text x="${C}" y="${C - 6}" font-size="13" text-anchor="middle" fill="var(--tx2)">${year}</text><text x="${C}" y="${C + 22}" font-size="30" font-weight="600" text-anchor="middle" fill="${avgS == null ? "var(--tx3)" : avgS < DAILY_CUT ? "var(--worse)" : "var(--tx)"}" font-family="ui-monospace,Menlo,monospace">${avgS == null ? "—" : Math.round(avgS * 100)}</text></svg>`;
  el.innerHTML = s + `<div class="basis" style="display:flex;align-items:center;gap:var(--s3);margin-top:var(--s3)"><span class="sw" style="background:var(--bad)"></span>Bad day<span class="sw" style="background:var(--good)"></span>Good day<span class="sw" style="background:var(--none);border:1px solid var(--none-bd)"></span>No data</div>`;
}

// ---------- Weak Link ----------
// Rows are ranked by impact: weight x (1 - closeness to goal), in points out of 100. The gap is in the row's own unit (minus = short of goal).
export function weakLink(el, dims) {
  const rows = dims.map(d => ({ ...d, impact: d.score == null ? null : (d.weight || 0) * (1 - d.score) * 100 })).sort((a, b) => (b.impact ?? -1) - (a.impact ?? -1));
  const top = rows.find(r => r.impact != null);
  el.innerHTML = (top ? `<div style="font-size:18px;font-weight:600;margin-bottom:var(--s2)">${top.name}<span class="basis" style="font-weight:400;margin-left:var(--s2)">biggest drag · −${n3(top.impact)} pts</span></div>` : `<div class="basis">Not enough data yet.</div>`) +
    rows.map(d => `<div class="row" style="grid-template-columns:120px 1fr 96px 52px;padding:4px 0" title="${Math.round((d.weight || 0) * 100)}% of the weight"><span>${d.name}${d === top ? " ◀" : ""}</span><div class="range" style="height:6px;margin:0"><i style="left:0;width:${d.score == null ? 0 : d.score * 100}%;background:${TRI_BAR[tri(d.score)]}"></i></div><span class="num ${d.score != null ? red("closeness", d.score) : ""}" style="text-align:right">${d.gap == null ? "—" : d.gap}</span><span class="num basis" style="text-align:right">${d.impact == null ? "" : "−" + n3(d.impact)}</span></div>`).join("");
}

// ---------- Last run: distance, effort and heart data for one run ----------
export function lastRun(el, run, hr, { gym = false } = {}) {
  if (!run) { el.innerHTML = `<div class="basis" style="padding:var(--s4) 0">${gym ? "No gym sessions yet." : "No runs yet."}</div>`; return; }
  const zs = run.zones ? [["Light", run.zones.lightTime], ["Moderate", run.zones.moderateTime], ["Vigorous", run.zones.vigorousTime], ["Peak", run.zones.peakTime]].map(([n, v]) => [n, parseInt(v, 10) || 0]) : null;
  const elapsed = run.end ? (run.end - run.start) / 1000 : run.seconds, hrr = hr && hr.length > 3 ? heartRateRecovery(hr, elapsed) : null, zmax = zs ? Math.max(1, ...zs.map(z => z[1])) : 1, d = new Date(run.start + run.offset * 1000);
  const trace = (hr && hr.length > 3) ? (() => {
    const W = 560, mL = 30, H = 104, mB = 14, h = H - mB, vs = hr.map(p => p[1]), lo = Math.min(...vs), hi = Math.max(...vs), pad = (hi - lo) * .06 || 1, mn = lo - pad, mx = hi + pad, T = hr[hr.length - 1][0] || 1, G = "var(--grid)";
    const y = v => h - 4 - (v - mn) / (mx - mn) * (h - 8), xs = s => mL + s / T * (W - mL), M = T / 60;
    const stepMin = [1, 2, 5, 10, 15].find(s => M / s <= 24), every = Math.ceil((M / stepMin) / 8);          // a tick every few minutes, a number on some of them
    const id = "hr" + Math.floor(Math.random() * 1e6), ty = niceTicks(mn, mx, 5), hs = ty.length > 1 ? (ty[1] - ty[0]) / 2 : 0;
    let grid = "", labels = "";
    if (hs) { [...ty.map(v => v - hs), ty[ty.length - 1] + hs].filter(v => v > mn && v < mx).forEach(v => { grid += `<line x1="${mL}" x2="${W}" y1="${y(v)}" y2="${y(v)}" stroke="var(--grid-minor)"/>`; }); }   // minor: halfway between
    ty.forEach(v => { grid += `<line x1="${mL}" x2="${W}" y1="${y(v)}" y2="${y(v)}" stroke="${G}"/>`; labels += `<text x="${mL - 4}" y="${y(v) + 3}" font-size="9" text-anchor="end" fill="var(--tx3)">${Math.round(v)}</text>`; });
    grid += `<line x1="${mL}" x2="${mL}" y1="0" y2="${h}" stroke="${G}"/><line x1="${mL}" x2="${W}" y1="${h}" y2="${h}" stroke="${G}"/>`;
    const minorStep = stepMin >= 5 ? 1 : stepMin >= 2 ? 1 : .5;   // minor vertical lines: every minute (or half minute on short runs)
    for (let m = 0; m <= M + 1e-9; m += minorStep) if (Math.abs(m / stepMin - Math.round(m / stepMin)) > 1e-6) grid += `<line x1="${xs(m * 60)}" x2="${xs(m * 60)}" y1="0" y2="${h}" stroke="var(--grid-minor)"/>`;
    for (let m = 0, k = 0; m <= M + 1e-9; m += stepMin, k++) { const xx = xs(m * 60), lab = k % every === 0; grid += `<line x1="${xx}" x2="${xx}" y1="0" y2="${h}" stroke="${G}"/><line x1="${xx}" x2="${xx}" y1="${h}" y2="${h + 3}" stroke="var(--tx3)"/>`; if (lab) labels += `<text x="${xx}" y="${H - 2}" font-size="9" text-anchor="${m === 0 ? "start" : "middle"}" fill="var(--tx3)">${m}m</text>`; }
    const stopX = xs(Math.min(elapsed, T)); grid += `<line x1="${stopX}" x2="${stopX}" y1="0" y2="${h}" stroke="var(--tx3)" stroke-dasharray="3 3"/>`; labels += `<text x="${stopX + 3}" y="9" font-size="8" fill="var(--tx3)">stop</text>`;
    const data = `<polyline fill="none" stroke="var(--ink)" stroke-width="1.4" stroke-linejoin="round" points="${hr.map(p => `${xs(p[0]).toFixed(1)},${y(p[1]).toFixed(1)}`).join(" ")}"/>`;
    return `<svg viewBox="0 -12 ${W} ${H + 12}" style="margin-top:var(--s2)" font-family="monospace"><defs>${plotFade(id, mL, 0, W - mL, H)}</defs><g mask="url(#${id}m)">${grid}${data}</g>${labels}<text x="${mL - 4}" y="-3" font-size="8" text-anchor="end" fill="var(--tx3)">bpm</text></svg>`;
  })() : `<div class="basis" style="padding:var(--s3) 0">No heart-rate trace for this ${gym ? "workout" : "run"}.</div>`;
  const stat = (l, v, cls = "") => `<div><div class="basis">${l}</div><div class="num ${cls}" style="font-size:20px;font-weight:600">${v}</div></div>`;
  el.innerHTML = `<div class="basis">${d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" })}</div>
    ${gym
      ? `<div class="basis" style="margin-top:var(--s3)">Time</div><div class="num" style="font-size:38px;font-weight:600;letter-spacing:-.02em">${run.seconds ? hm(run.seconds / 60) : "—"}</div>
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:var(--s3);margin:var(--s3) 0">${stat("Avg heart rate", run.avgHr ? run.avgHr + " bpm" : "—")}${stat("Calories", run.kcal ? Math.round(run.kcal) + " kcal" : "—")}${stat("Active zone min", run.azm != null ? Math.round(run.azm) : "—")}${stat("Recovery, 1 min", hrr ? "−" + Math.round(hrr.drop) + " bpm" : "—", hrr ? red("hrr", hrr.drop) : "")}</div>`
      : `<div class="basis" style="margin-top:var(--s3)">Distance</div><div class="num" style="font-size:38px;font-weight:600;letter-spacing:-.02em">${run.distanceM == null ? "—" : n3(run.distanceM / 1000)}<small style="font-size:14px;color:var(--tx2);margin-left:6px">km</small></div>
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:var(--s3);margin:var(--s3) 0">${stat("Pace", run.paceSecPerKm ? mmss(run.paceSecPerKm) + " /km" : "—")}${stat("Time", run.seconds ? mmss(run.seconds) : "—")}${stat("Avg heart rate", run.avgHr ? run.avgHr + " bpm" : "—")}${stat("Recovery, 1 min", hrr ? "−" + Math.round(hrr.drop) + " bpm" : "—", hrr ? red("hrr", hrr.drop) : "")}</div>`}
    <div class="basis">Heart rate</div>${trace}
    ${zs ? `<div class="basis" style="margin-top:var(--s3)">Heart-rate zones${run.kcal ? ` · ${run.kcal} kcal` : ""}</div><div class="zbars">${zs.map(([n, v]) => `<div><i style="height:${Math.max(3, v / zmax * 46)}px"></i><span>${n}</span><b class="num">${Math.round(v / 60)}m</b></div>`).join("")}</div>` : ``}`;
}

// ---------- Night Flow: smooth curve that stays inside the stage Fitbit assigned ----------
// y position inside each stage's band = within-stage index from heart rate (lower heart rate = lower in the band).
// The index is bounded to 0..1 per band, so the curve can never leave the stage. Moves between bands happen only at Fitbit's recorded stage changes.
const FCOL = { AWAKE: "#ff9ec0", REM: "#b5ecff", LIGHT: "#82b8ff", DEEP: "#9a62d0" }, FLAB = { AWAKE: "Awake", REM: "REM", LIGHT: "Light", DEEP: "Deep" }, BANDS = ["AWAKE", "REM", "LIGHT", "DEEP"];
export function nightFlow(day, hr) {
  const raw = day.sleepStages.map(([t, a, b]) => ({ t, a: Date.parse(a) / 1000, b: Date.parse(b) / 1000 })), t0 = raw[0].a, total = raw[raw.length - 1].b - t0, N = Math.round(total / 30), off = day.sleepOffset || 0;
  const stage = new Array(N).fill("LIGHT"); raw.forEach(g => { for (let i = Math.floor((g.a - t0) / 30); i < Math.ceil((g.b - t0) / 30) && i < N; i++) stage[i] = g.t === "RESTLESS" ? "AWAKE" : g.t; });
  const bins = Array.from({ length: N }, () => []); (hr || []).forEach(([s, v]) => { const i = Math.floor(s / 30); if (i >= 0 && i < N) bins[i].push(v); });
  const med = a => { if (!a.length) return null; a = [...a].sort((x, y) => x - y); const m = a.length >> 1; return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; };
  const bpm = bins.map(med);
  // percentile rank of heart rate among the same-stage epochs tonight; index = 1 - rank
  const idx = new Array(N).fill(null);
  BANDS.forEach(st => { const ids = stage.map((s, i) => (s === st && bpm[i] != null ? i : -1)).filter(i => i >= 0), sorted = ids.map(i => bpm[i]).sort((a, b) => a - b); ids.forEach(i => { const lo = sorted.findIndex(v => v >= bpm[i]), hi = sorted.length - 1 - [...sorted].reverse().findIndex(v => v <= bpm[i]); idx[i] = 1 - ((lo + hi) / 2) / Math.max(1, sorted.length - 1); }); });
  // smooth inside runs of the same stage only (never across a stage change), missing = band centre
  const sm = idx.map((v, i) => { let a = 0, c = 0; for (let k = -10; k <= 10; k++) { const j = i + k; if (j < 0 || j >= N || stage[j] !== stage[i]) continue; if (idx[j] != null) { a += idx[j]; c++; } } return c ? a / c : .5; });
  return { stage, bpm, idx: sm, N, t0, total, off };
}

// =====================================================================================================
// Night Flow in three more visual styles. Same idea as Flow (the line never leaves the stage Fitbit assigned;
// height inside a stage comes from heart rate), different design language.
// =====================================================================================================
const NF = { DEEP: "var(--st-deep)", LIGHT: "var(--st-light)", REM: "var(--st-rem)", AWAKE: "var(--st-awake)" }, NFL = { DEEP: "Deep", LIGHT: "Light", REM: "REM", AWAKE: "Awake" };   // BANDS (top to bottom: awake, REM, light, deep) is defined above
const p2 = n => String(n).padStart(2, "0");
const nfClock = (sec, off) => { const s = (((sec + off) % 86400) + 86400) % 86400; return `${p2(Math.floor(s / 3600))}:${p2(Math.floor(s % 3600 / 60))}`; };
const nfClockS = (sec, off) => { const s = (((sec + off) % 86400) + 86400) % 86400; return `${p2(Math.floor(s / 3600))}:${p2(Math.floor(s % 3600 / 60))}:${p2(Math.floor(s % 60))}`; };
const runsOf = stage => { const r = []; let a = 0; for (let i = 1; i <= stage.length; i++) if (i === stage.length || stage[i] !== stage[i - 1]) { r.push([stage[a], a, i]); a = i; } return r; };
const place = (tipEl, frac, html) => { tipEl.innerHTML = html; tipEl.style.display = "block"; tipEl.style.left = `calc(${frac * 100}% ${frac > .72 ? "- 210px" : "+ 14px"})`; tipEl.style.top = "46px"; };
const minsOf = stage => Object.fromEntries(BANDS.map(k => [k, stage.filter(v => v === k).length / 2])), fmDur = m => `${Math.floor(m / 60)}h ${p2(Math.round(m % 60))}m`;

// Geometry shared by the styles: x for each 30 s record, the band each stage owns, and one smooth path (bounded inside each band).
function buildFlow(flow, g) {
  const { stage, idx, N } = flow, x = i => g.mL + (i + .5) / N * g.pw, by = st => g.top + BANDS.indexOf(st) * (g.bandH + g.gap), y = i => by(stage[i]) + g.padT + idx[i] * (g.bandH - g.padT - g.padB);
  const runs = [], full = []; let d = "";
  runsOf(stage).forEach(([st, a, b], k) => {
    const stride = Math.max(1, Math.round((b - a) / 90)), pts = []; for (let i = a; i < b; i += stride) pts.push([x(i), y(i)]); if (pts[pts.length - 1][0] !== x(b - 1)) pts.push([x(b - 1), y(b - 1)]);
    const sm = pts.length < 3 ? pts.map(([px, py], j) => (j ? "L" : "M") + px.toFixed(1) + "," + py.toFixed(1)).join("") : `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}` + pts.slice(1, -1).map((p, j) => { const q = pts[j + 2]; return `Q${p[0].toFixed(1)},${p[1].toFixed(1)} ${((p[0] + q[0]) / 2).toFixed(1)},${((p[1] + q[1]) / 2).toFixed(1)}`; }).join("") + `L${pts[pts.length - 1][0].toFixed(1)},${pts[pts.length - 1][1].toFixed(1)}`;
    runs.push({ st, a, b, sm, x0: pts[0][0], x1: pts[pts.length - 1][0], y0: pts[0][1], y1: pts[pts.length - 1][1], floor: by(st) + g.bandH });
    d += (k ? `C${(x(a - 1) + x(a)) / 2},${y(a - 1)} ${(x(a - 1) + x(a)) / 2},${y(a)} ${x(a)},${y(a)}` + sm.replace(/^M[^QL]*/, "") : sm);
  });
  return { x, y, by, runs, d };
}
function hover(svgEl, hitEl, tipEl, flow, g, geo, ids) {
  const { stage, bpm, idx, N, t0, off } = flow;
  hitEl.onmousemove = ev => { const r = svgEl.getBoundingClientRect(), px = (ev.clientX - r.left) / r.width * g.W, i = Math.max(0, Math.min(N - 1, Math.floor((px - g.mL) / g.pw * N)));
    const cur = $(ids.cur), dot = $(ids.dot); cur.setAttribute("x1", geo.x(i)); cur.setAttribute("x2", geo.x(i)); dot.setAttribute("cx", geo.x(i)); dot.setAttribute("cy", geo.y(i)); [cur, dot].forEach(e => e.setAttribute("visibility", "visible"));
    place(tipEl, (px - g.mL) / g.pw, `<div class="t">${nfClockS(t0 + i * 30, off)}</div><div><span style="color:${NF[stage[i]]}">●</span> ${NFL[stage[i]]} · ${bpm[i] == null ? "no heart rate" : Math.round(bpm[i]) + " bpm"}</div><div class="basis">Within-stage index ${bpm[i] == null ? "—" : Math.round(idx[i] * 100) + "%"}</div>`); };
  hitEl.onmouseleave = () => { [$(ids.cur), $(ids.dot)].forEach(e => e.setAttribute("visibility", "hidden")); tipEl.style.display = "none"; };
}
function axis(flow, g, s, labelY) {
  const { t0, total, off } = flow; const f0 = Math.ceil((t0 + off) / 3600) * 3600 - off; let out = "";
  for (let t = f0; t < t0 + total; t += 3600) { const xx = g.mL + (t - t0) / total * g.pw; out += `<line x1="${xx}" x2="${xx}" y1="${labelY - 14}" y2="${labelY - 9}" stroke="#4b525d"/><text x="${xx}" y="${labelY}" font-size="10" text-anchor="middle" fill="var(--tx3)" font-family="monospace">${nfClock(t, off).slice(0, 2)}</text>`; }
  return out + `<text x="${g.mL}" y="${labelY + 14}" font-size="11" font-weight="600" fill="var(--tx)" font-family="monospace">${nfClock(t0, off)}</text><text x="${g.mL + g.pw}" y="${labelY + 14}" font-size="11" font-weight="600" text-anchor="end" fill="var(--tx)" font-family="monospace">${nfClock(t0 + total, off)}</text>`;
}

// ---------- LANES: four floating glass lanes, each with its own colour line, durations on the left ----------
export function drawLanes(el, tipEl, flow) {
  const g = { W: 960, mL: 86, pw: 960 - 86 - 12, top: 6, bandH: 74, gap: 12, padT: 14, padB: 10 }, H = g.top + 4 * g.bandH + 3 * g.gap + 44, geo = buildFlow(flow, g), mins = minsOf(flow.stage);
  let s = `<svg viewBox="0 0 ${g.W} ${H}" id="lnSvg" font-family="Inter,system-ui,sans-serif"><defs><filter id="lnGlow" x="-5%" y="-40%" width="110%" height="180%"><feGaussianBlur stdDeviation="3"/></filter><linearGradient id="lnPanel" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="var(--lane-a)"/><stop offset="1" stop-color="var(--lane-b)"/></linearGradient>` + BANDS.map(k => `<linearGradient id="lnA${k}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${NF[k]}" stop-opacity=".30"/><stop offset="1" stop-color="${NF[k]}" stop-opacity="0"/></linearGradient>`).join("") + `</defs>`;
  BANDS.forEach(k => { const t = geo.by(k); s += `<rect x="${g.mL}" y="${t}" width="${g.pw}" height="${g.bandH}" rx="16" fill="url(#lnPanel)" stroke="var(--lane-bd)"/><line x1="${g.mL + 14}" x2="${g.mL + g.pw - 14}" y1="${t + g.bandH / 2}" y2="${t + g.bandH / 2}" stroke="var(--lane-mid)" stroke-dasharray="2 5"/><circle cx="10" cy="${t + g.bandH / 2 - 8}" r="4" fill="${NF[k]}"/><text x="22" y="${t + g.bandH / 2 - 4}" font-size="12" fill="var(--tx)">${NFL[k]}</text><text x="22" y="${t + g.bandH / 2 + 12}" font-size="11" fill="var(--tx3)" font-family="monospace">${fmDur(mins[k])}</text>`; });
  // connectors in the gaps, then the lines
  geo.runs.forEach((r, k) => { const p = geo.runs[k - 1]; if (p) s += `<path d="M${p.x1},${p.y1}C${(p.x1 + r.x0) / 2},${p.y1} ${(p.x1 + r.x0) / 2},${r.y0} ${r.x0},${r.y0}" fill="none" stroke="#56606d" stroke-width="1" stroke-dasharray="2 3"/>`; });
  s += `<defs><clipPath id="lnClip">${BANDS.map(k => `<rect x="${g.mL}" y="${geo.by(k)}" width="${g.pw}" height="${g.bandH}" rx="16"/>`).join("")}</clipPath></defs><g clip-path="url(#lnClip)">`;
  geo.runs.forEach(r => { s += `<path d="${r.sm}L${r.x1},${r.floor}L${r.x0},${r.floor}Z" fill="url(#lnA${r.st})"/><path d="${r.sm}" fill="none" stroke="${NF[r.st]}" stroke-width="5" opacity=".35" filter="url(#lnGlow)"/><path d="${r.sm}" fill="none" stroke="${NF[r.st]}" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/>`; });
  s += `</g>` + axis(flow, g, s, H - 22);
  s += `<line id="lnCur" y1="${g.top}" y2="${H - 44}" stroke="var(--ink)" stroke-opacity=".4" visibility="hidden"/><circle id="lnDot" r="4" fill="var(--ink)" stroke="var(--bg-solid)" stroke-width="2" visibility="hidden"/><rect id="lnHit" x="${g.mL}" y="${g.top}" width="${g.pw}" height="${H - 44 - g.top}" fill="transparent"/></svg>`;
  el.innerHTML = s; hover($("lnSvg"), $("lnHit"), tipEl, flow, g, geo, { cur: "lnCur", dot: "lnDot" });
}

