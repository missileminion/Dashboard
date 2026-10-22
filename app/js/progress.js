// Strength journey: where each lift is on its curve, and how often to add weight.
//
// The science in one paragraph. Strength does not rise in a straight line: early training adds a lot quickly (mostly nervous-system learning plus
// first muscle), then returns shrink as you approach your genetic ceiling. A logarithmic curve describes that well:
//     e1RM(t) = a + b * ln(1 + t / tau)          t = days since the first logged session, tau = 21 days (how fast early gains fade)
// where e1RM is the Epley estimate of a one-rep max, weight * (1 + reps / 30), from your best set of the day (sets of 12 reps or fewer).
// The slope today is b / (tau + t) per day, which falls as t grows: that is the diminishing return. Dividing a plate increment by your slope
// (converted to working weight at your usual reps) gives how many weeks each increase takes. Typical published ranges, for comparison:
// roughly 1 to 2 percent a week on a big lift in the first months, 0.25 to 0.5 percent a week through the first two years, under 0.25 after that.
// Body context is your latest logged body weight: the strength journey shows your estimated 1RM as a multiple of it.
// This is a guide fitted to your own data, not a promise; sleep, food, deloads and plateaus move real numbers around it.
export const PROFILE = { heightCm: 183 };
const TAU = 21, STEP_LEGS = 5, STEP_OTHER = 2.5;
export const e1rm = (w, r) => (r <= 1 ? w : w * (1 + r / 30));
const median = a => { const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

export const bodyStats = kg => ({ kg });

export function fitLift(entries, name, today) {
  const rows = entries.filter(e => e.exercise === name && e.reps >= 1 && e.reps <= 12);
  const best = {}; rows.forEach(e => { const v = e1rm(e.weight, e.reps); if (!(e.date in best) || v > best[e.date].v) best[e.date] = { v, w: e.weight, r: e.reps, day: e.day }; });
  const dates = Object.keys(best).sort(); if (dates.length < 2) return { ok: false, n: dates.length, name };
  const d0 = new Date(dates[0] + "T12:00:00"), tOf = d => Math.round((new Date(d + "T12:00:00") - d0) / 864e5);
  const pts = dates.map(d => ({ date: d, t: tOf(d), y: best[d].v, w: best[d].w, r: best[d].r }));
  const span = pts.at(-1).t, tNow = Math.max(span, tOf(today));
  if (pts.length < 5 || span < 14) return { ok: false, n: pts.length, span, name, pts };
  const xs = pts.map(p => Math.log(1 + p.t / TAU)), mx = xs.reduce((a, b) => a + b) / xs.length, my = pts.reduce((a, p) => a + p.y, 0) / pts.length;
  let sxx = 0, sxy = 0; pts.forEach((p, i) => { sxx += (xs[i] - mx) ** 2; sxy += (xs[i] - mx) * (p.y - my); });
  let b = sxx > 1e-9 ? sxy / sxx : 0; const plateau = b <= 0; if (plateau) b = 0;
  const a = my - b * mx, fit = t => a + b * Math.log(1 + t / TAU);
  const resid = Math.sqrt(pts.reduce((s, p) => s + (p.y - fit(p.t)) ** 2, 0) / pts.length);
  const reps = Math.min(12, Math.max(5, Math.round(median(pts.slice(-6).map(p => p.r))))), step = rows.at(-1)?.day === "Legs" || best[dates.at(-1)].day === "Legs" ? STEP_LEGS : STEP_OTHER;
  const rateWk = (7 * b) / (TAU + tNow), nowE = fit(tNow), pctWk = (100 * rateWk) / nowE, workWk = rateWk / (1 + reps / 30);   // lb a week of e1RM, percent a week, working-weight lb a week
  const weeksPerStep = workWk > 0.005 ? step / workWk : Infinity;
  return { ok: true, name, pts, a, b, fit, tNow, resid, plateau, rateWk, pctWk, nowE, reps, step, weeksPerStep, d0, firstDate: dates[0], span, now: pts.at(-1).y };
}

const stage = pct => (pct >= 1 ? "a fast, early-stage pace" : pct >= 0.35 ? "a steady intermediate pace" : pct >= 0.12 ? "a slow, advanced pace" : "close to a plateau");

// the chart and the plain-language readout for one lift
export function journeyHTML(m, body) {
  if (!m.ok) return `<div class="basis" style="padding:var(--s3) 0">${m.n >= 1 ? `${m.n} session${m.n > 1 ? "s" : ""} logged so far.` : ""} The curve needs at least 5 sessions of this lift across 2 weeks or more. Keep logging and it appears here.</div>`;
  const W = 600, H = 250, L = 46, R = 14, top = 14, bot = 34, plotW = W - L - R, plotH = H - top - bot, hist = Math.max(m.tNow, 14), horizon = hist + 84, tMax = Math.max(horizon, 112);
  const ideal = t => m.fit(0) * Math.pow(1.01, t / 7), proj = t => m.fit(t);
  const ys = [...m.pts.map(p => p.y), proj(tMax), ideal(Math.min(tMax, m.tNow + 84))], lo = Math.min(...m.pts.map(p => p.y)) * 0.96, hi = Math.max(...ys) * 1.04;
  const x = t => L + (t / tMax) * plotW, y = v => top + (1 - (v - lo) / (hi - lo)) * plotH;
  const path = (f, a, b, n = 60) => Array.from({ length: n + 1 }, (_, i) => { const t = a + (b - a) * i / n; return `${i ? "L" : "M"}${x(t).toFixed(1)},${y(f(t)).toFixed(1)}`; }).join(" ");
  let s = `<svg viewBox="0 0 ${W} ${H}" class="jr-svg" role="img" aria-label="Estimated one-rep max over time with a fitted curve and a projection">
    <defs><linearGradient id="jrFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#ffc060" stop-opacity=".28"/><stop offset="1" stop-color="#ffc060" stop-opacity="0"/></linearGradient></defs>`;
  const gridN = 4; for (let i = 0; i <= gridN; i++) { const v = lo + (hi - lo) * i / gridN; s += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="var(--grid-minor)"/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end" font-size="11" fill="var(--tx2)">${Math.round(v)}</text>`; }
  for (let wk = 0; wk <= tMax / 7; wk += 4) { const t = wk * 7; s += `<text x="${x(t)}" y="${H - 14}" text-anchor="middle" font-size="11" fill="var(--tx2)">${wk === 0 ? "start" : "wk " + wk}</text><line x1="${x(t)}" x2="${x(t)}" y1="${top + plotH}" y2="${top + plotH + 4}" stroke="var(--tx3)"/>`; }
  s += `<path d="${path(ideal, 0, tMax)}" fill="none" stroke="var(--tx3)" stroke-width="1.4" stroke-dasharray="1 4" stroke-linecap="round"/>`;   // 1% a week, compounding
  s += `<path d="${path(proj, m.tNow, horizon)} L${x(horizon)},${top + plotH} L${x(m.tNow)},${top + plotH} Z" fill="url(#jrFill)"/>`;
  s += `<path d="${path(m.fit, 0, m.tNow)}" fill="none" stroke="#ffc060" stroke-width="2.6" stroke-linecap="round"/><path d="${path(proj, m.tNow, horizon)}" fill="none" stroke="#ffc060" stroke-width="2.2" stroke-dasharray="6 5" stroke-linecap="round"/>`;
  s += `<line x1="${x(m.tNow)}" x2="${x(m.tNow)}" y1="${top}" y2="${top + plotH}" stroke="rgba(255,255,255,.3)"/><text x="${x(m.tNow) + 5}" y="${top + 11}" font-size="10.5" fill="var(--tx2)">today</text>`;
  m.pts.forEach(p => { s += `<circle cx="${x(p.t)}" cy="${y(p.y)}" r="3.6" fill="var(--tx)" opacity=".9"><title>${p.date}: ${p.w} lb x ${p.r} = about ${Math.round(p.y)} lb 1RM</title></circle>`; });
  // each time the working weight should go up, along the projection (first four)
  let k = 0; const per = m.reps, base = Math.round(m.fit(m.tNow) / (1 + per / 30) / m.step) * m.step; for (let t = m.tNow + 1, wgt = base; t <= horizon && k < 4; t++) { if ((proj(t) / (1 + per / 30)) >= wgt + m.step * 0.5 + m.step * 0.5) { wgt += m.step; k++; s += `<g><circle cx="${x(t)}" cy="${y(proj(t))}" r="4.4" fill="#0e1118" stroke="#ffd884" stroke-width="1.8"/><text x="${x(t)}" y="${y(proj(t)) - 9}" text-anchor="middle" font-size="10.5" fill="#ffd884">${wgt}</text></g>`; } }
  s += "</svg>";
  const wks = m.weeksPerStep, every = !isFinite(wks) || wks > 52 ? "about once a year or less" : wks < 1.5 ? "about every week" : `about every ${Math.round(wks)} weeks`;
  const gain12 = proj(m.tNow + 84) - m.fit(m.tNow), pct12 = (100 * gain12) / m.fit(m.tNow), ideal12 = (Math.pow(1.01, 12) - 1) * 100;
  const fmt1 = v => (v < 10 ? v.toFixed(1) : Math.round(v));
  return `<div class="jr-chart">${s}</div>
    <div class="wx-leg"><span><i style="background:var(--tx)"></i>Session best (est. 1RM)</span><span><i style="background:#ffc060"></i>Fitted curve</span><span><i style="background:#ffc060;opacity:.6"></i>Next 12 weeks</span><span><i style="background:var(--tx3)"></i>1% a week, compounding</span></div>
    <div class="jr-stats">
      <div><div class="basis">Right now</div><div class="num jr-big">${m.plateau ? "flat" : "+" + fmt1(m.rateWk * 1) + " lb"}<small>${m.plateau ? "" : " 1RM a week"}</small></div><div class="basis">${m.plateau ? "no upward trend yet" : fmt1(m.pctWk) + "% a week, " + stage(m.pctWk)}</div></div>
      <div><div class="basis">Add weight</div><div class="num jr-big">+${m.step} lb<small> ${every}</small></div><div class="basis">at about ${m.reps} reps. Add it when you hit the top of the rep range on every set</div></div>
      <div><div class="basis">In 12 weeks</div><div class="num jr-big">${m.plateau ? "—" : "~" + Math.round(proj(m.tNow + 84)) + " lb"}<small> est. 1RM</small></div><div class="basis">${m.plateau ? "" : `${pct12 >= 0 ? "+" : ""}${fmt1(pct12)}% on the curve, against +${fmt1(ideal12)}% at 1% a week`}</div></div>
    </div>
    ${body.kg ? `<div class="basis jr-body">At ${PROFILE.heightCm} cm and ${body.kg.toFixed(1)} kg, your estimated one-rep max on this lift is about <b>${(m.fit(m.tNow) / 2.2046 / body.kg).toFixed(2)}x your body weight</b>. That ratio is a fair way to compare lifts and to see strength rising faster than weight. Log your weight on the Gym log page to keep it current.</div>` : `<div class="basis jr-body">Log your body weight on the Gym log page and this shows your estimated one-rep max as a multiple of it.</div>`}`;
}
