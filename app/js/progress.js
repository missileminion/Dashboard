// Strength journey: where each lift is on its curve, and how often to add weight.
//
// The science in one paragraph. Strength does not rise in a straight line: early training adds a lot quickly (mostly nervous-system learning plus
// first muscle), then returns shrink as you approach your genetic ceiling. A logarithmic curve describes that well:
//     e1RM(t) = a + b * ln(1 + t / tau)          t = days since the first logged session, tau = 21 days (how fast early gains fade)
// where e1RM is the Epley estimate of a one-rep max, weight * (1 + reps / 30), from your best set of the day (sets of 12 reps or fewer).
// The slope today is b / (tau + t) per day, which falls as t grows: that is the diminishing return. Dividing a plate increment by your slope
// (converted to working weight at your usual reps) gives how many weeks each increase takes. Typical published ranges, for comparison:
// roughly 1 to 2 percent a week on a big lift in the first months, 0.25 to 0.5 percent a week through the first two years, under 0.25 after that.
// Body context uses fat-free mass index (FFMI = lean mass / height squared, height-normalised); about 25 is the usual natural upper limit.
// This is a guide fitted to your own data, not a promise; sleep, food, deloads and plateaus move real numbers around it.
const PKEY = "profile.v1";
export const PROFILE = { heightCm: 183, weightKg: 70, bodyFat: 0.15, startWeightKg: 65, startBodyFat: 0.13, startAge: 22.2, age: 22.8, ageOn: "2026-10-21" };   // editable on the Bodybuilding journey card, kept in this browser
try { Object.assign(PROFILE, JSON.parse(localStorage.getItem(PKEY) || "{}")); } catch {}
export function saveProfile(next) { Object.assign(PROFILE, next); try { localStorage.setItem(PKEY, JSON.stringify(PROFILE)); } catch {} }
const TAU = 21, STEP_LEGS = 5, STEP_OTHER = 2.5;
export const e1rm = (w, r) => (r <= 1 ? w : w * (1 + r / 30));
const median = a => { const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

export function bodyStats(p = PROFILE) {
  const h = p.heightCm / 100, lbm = p.weightKg * (1 - p.bodyFat), ffmi = lbm / (h * h), norm = ffmi + 6.1 * (1.8 - h);
  return { lbm, ffmi, norm, share: norm / 25, kgToCeiling: (25 - 6.1 * (1.8 - h)) * h * h - lbm };
}

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
    <div class="basis jr-body">Your build: ${PROFILE.heightCm} cm, ${PROFILE.weightKg} kg, ${Math.round(PROFILE.bodyFat * 100)}% body fat, so about ${body.lbm.toFixed(1)} kg of lean mass and an FFMI near ${body.norm.toFixed(1)}. That is roughly ${Math.round(body.share * 100)}% of the usual natural ceiling (25), so there is real room to keep adding strength, but the rate is expected to keep slowing.</div>`;
}

// ---------- the bodybuilding journey: how much lean mass a natural lifter of your frame can reach, and where you are on the way ----------
// Lean mass is judged with FFMI (lean mass / height squared, adjusted to a 1.8 m reference). Research on drug-free lifters puts the upper limit near 25,
// and most people top out around 22 to 23, so those two lines frame the graph. Progress follows the usual pattern for natural lifters: gains come fast at
// first and shrink as you close in on your limit. The gap to the limit halves every "half-life" years: lean mass(t) = limit - (limit - start) * 2^(-t / halfLife),
// t in years since you started and the limit the "realistic" FFMI of 22.5. The half-life is fitted to YOUR two real points (start and now); with no history it is 1 year,
// the usual figure for a beginner (about 8 to 9 kg of lean mass in year one).
const FFMI_REAL = 22.5, FFMI_CEIL = 25;
export function potential(p = PROFILE) {
  const h = p.heightCm / 100, adj = 6.1 * (1.8 - h), lbmOf = f => (f - adj) * h * h, ffmiOf = l => l / (h * h) + adj;
  const meas = p.weightKg * (1 - p.bodyFat), start = p.startWeightKg * (1 - p.startBodyFat), real = lbmOf(FFMI_REAL), ceil = lbmOf(FFMI_CEIL);
  // the curve is fixed by two measurements: training start and the day you last entered your weight (tm). Today (tNow) is only a place on that curve, so as time passes
  // the marker moves along it and the curve itself stays put until you enter new numbers.
  const age = p.age + (Date.now() - new Date(p.ageOn + "T12:00").getTime()) / (365.25 * 864e5), tm = Math.max(0, p.age - p.startAge), tNow = Math.max(tm, age - p.startAge);
  const gap0 = real - start, gapM = Math.max(0, real - meas);
  // your own pace: the half-life that carries start lean mass to the measured lean mass, bounded to 1..20 years; with under half a year of history we fall back to a typical 1 year
  let hl = 1, fitted = false;
  if (tm >= 0.5 && gap0 > 0.5 && gapM > 0.2 && gapM < gap0) { hl = Math.min(20, Math.max(1, tm * Math.LN2 / Math.log(gap0 / gapM))); fitted = true; }
  // forward, the pace is your fitted one but never slower than a 3 year half-life: a flat, intermittent stretch in the past says little about what consistent training and enough protein do next
  const hlF = Math.min(hl, 3);
  const at = t => (gapM <= 0 ? meas : t <= tm ? real - gap0 * Math.pow(2, -t / hl) : real - gapM * Math.pow(2, -(t - tm) / hlF));   // t = years since training started
  const now = at(tNow), fromNow = t => at(tNow + t);
  const yearsTo = f => { const target = lbmOf(f); if (target <= now) return 0; if (target >= real - 0.02 * gapM || gapM <= 0) return null; return tm - hlF * Math.log2((real - target) / gapM) - tNow; };
  return { h, now, start, hlF, age, elapsed: tNow, tm, hl, fitted, ffmi: ffmiOf(now), startFfmi: ffmiOf(start), real, ceil, at, fromNow, yearsTo, lbmOf, ffmiOf, shareReal: now / real, shareCeil: now / ceil };
}
export function potentialHTML(p = PROFILE) {
  const P = potential(p), W = 600, H = 250, L = 46, R = 112, top = 14, bot = 34, plotW = W - L - R, plotH = H - top - bot, tMax = P.tm + 10;
  const lo = Math.min(P.now, P.start) - 2, hi = P.ceil + 2, x = t => L + (t / tMax) * plotW, y = v => top + (1 - (v - lo) / (hi - lo)) * plotH;
  const trace = (t0, t1) => Array.from({ length: 41 }, (_, i) => { const t = t0 + (t1 - t0) * i / 40; return `${i ? "L" : "M"}${x(t).toFixed(1)},${y(P.at(t)).toFixed(1)}`; }).join(" ");
  const ageAt = t => P.age - P.elapsed + t;
  let s = `<svg viewBox="0 0 ${W} ${H}" class="jr-svg" role="img" aria-label="Lean mass since you started and projected against the natural ceiling">
    <defs><linearGradient id="bbBand" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#ffc060" stop-opacity=".03"/><stop offset="1" stop-color="#ffc060" stop-opacity=".12"/></linearGradient></defs>`;
  for (let i = 0; i <= 4; i++) { const v = lo + (hi - lo) * i / 4; s += `<line x1="${L}" x2="${L + plotW}" y1="${y(v)}" y2="${y(v)}" stroke="var(--grid-minor)"/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end" font-size="11" fill="var(--tx2)">${Math.round(v)}</text>`; }
  for (let a = Math.ceil(ageAt(0)); a <= ageAt(tMax); a += 2) { const t = a - ageAt(0); s += `<text x="${x(t)}" y="${H - 14}" text-anchor="middle" font-size="11" fill="var(--tx2)">${a}</text><line x1="${x(t)}" x2="${x(t)}" y1="${top + plotH}" y2="${top + plotH + 4}" stroke="var(--tx3)"/>`; }
  s += `<text x="${L + plotW}" y="${H - 1}" text-anchor="end" font-size="10.5" fill="var(--tx3)">age</text>
    <rect x="${L}" y="${y(P.ceil)}" width="${plotW}" height="${y(P.real) - y(P.ceil)}" fill="url(#bbBand)"/>
    <line x1="${L}" x2="${L + plotW}" y1="${y(P.ceil)}" y2="${y(P.ceil)}" stroke="#ffd884" stroke-opacity=".35" stroke-width=".8" stroke-dasharray="2 4"/><line x1="${L}" x2="${L + plotW}" y1="${y(P.real)}" y2="${y(P.real)}" stroke="#ffd884" stroke-opacity=".3" stroke-width=".8" stroke-dasharray="2 4"/>
    <text x="${L + plotW + 6}" y="${y(P.ceil) + 4}" font-size="11" fill="#ffd884">ceiling ${Math.round(P.ceil)} kg</text><text x="${L + plotW + 6}" y="${y(P.real) + 4}" font-size="11" fill="#ffd884" opacity=".85">realistic ${Math.round(P.real)} kg</text>
    <path d="${trace(0, P.elapsed)}" fill="none" stroke="#ffc060" stroke-opacity=".7" stroke-width="1.5"/><path d="${trace(P.elapsed, tMax)}" fill="none" stroke="#ffc060" stroke-width="1.5" stroke-dasharray="1.5 4"/>`;
  for (const f of [20, 21, 22]) { const d = P.yearsTo(f), t = d == null ? null : d + P.elapsed; if (t != null && d > 0 && t <= tMax) s += `<g><circle cx="${x(t)}" cy="${y(P.lbmOf(f))}" r="2.5" fill="#0e1118" stroke="#ffd884" stroke-width="1"/><text x="${x(t)}" y="${y(P.lbmOf(f)) + 15}" text-anchor="middle" font-size="10" fill="var(--tx2)">FFMI ${f}</text></g>`; }
  const xn = x(P.elapsed), yn = y(P.now);
  s += `<circle cx="${x(0)}" cy="${y(P.start)}" r="3" fill="#0e1118" stroke="#ffc060" stroke-width="1.2"/><text x="${x(0) + 9}" y="${y(P.start) + 16}" font-size="11" fill="var(--tx2)">start</text>
    <circle cx="${xn}" cy="${yn}" r="4" fill="#ffc060"/></svg>`;
  // the ladder: where an FFMI of this size sits among untrained, trained, advanced and elite natural lifters
  const lo2 = 16, hi2 = 26, pos = f => Math.max(0, Math.min(100, ((f - lo2) / (hi2 - lo2)) * 100)), zones = [["just starting", 16, 18], ["trained", 18, 20.5], ["well trained", 20.5, 22.5], ["advanced", 22.5, 24], ["elite natural", 24, 26]];
  const ladder = `<div class="bb-ladder"><div class="bb-track">${zones.map(([n, a, b]) => `<span style="left:${pos(a)}%;width:${pos(b) - pos(a)}%"><em>${n}</em></span>`).join("")}<i class="bb-mark" style="left:${pos(P.ffmi)}%"></i></div><div class="bb-scale">${[16, 18, 20, 22, 24, 26].map(v => `<span style="left:${pos(v)}%">${v}</span>`).join("")}</div></div>`;
  const reach = f => { const t = P.yearsTo(f); return t == null ? "beyond the curve" : t <= 0 ? "reached" : `in about ${t < 1.2 ? Math.round(t * 12) + " months" : t.toFixed(1) + " years"}`; };
  const target = P.real / (1 - 0.1), gained = P.now - P.start, nxt = P.fromNow(1) - P.now, perYr = P.tm > 0.2 ? (P.now - P.start) / P.elapsed : null;
  const inp = rows => rows.map(([k, l, u, mn, mx, st]) => `<label><span class="basis">${l}</span><span class="bb-f"><input type="number" data-k="${k}" min="${mn}" max="${mx}" step="${st}" value="${/^(bodyFat|startBodyFat)$/.test(k) ? +(p[k] * 100).toFixed(1) : k === "age" ? +P.age.toFixed(1) : p[k]}"><b>${u}</b></span></label>`).join("");
  return `<div class="bb-inputs">${inp([["heightCm", "Height", "cm", 140, 220, 1], ["weightKg", "Weight now", "kg", 40, 200, 0.5], ["bodyFat", "Body fat now", "%", 4, 45, 0.5], ["age", "Age now", "yr", 14, 60, 0.1], ["startWeightKg", "Weight at start", "kg", 35, 200, 0.5], ["startBodyFat", "Body fat at start", "%", 4, 45, 0.5], ["startAge", "Effective start age", "yr", 12, 60, 0.1]])}</div>
    ${ladder}
    <div class="bb-lead">You carry <b>${P.now.toFixed(1)} kg</b> of lean mass, an FFMI of <b>${P.ffmi.toFixed(1)}</b>, up from ${P.start.toFixed(1)} kg (FFMI ${P.startFfmi.toFixed(1)}) at your effective start (age ${p.startAge}). That is <b>${Math.round(P.shareReal * 100)}%</b> of a realistic natural limit (FFMI 22.5) and <b>${Math.round(P.shareCeil * 100)}%</b> of the absolute ceiling (25).</div>
    <div class="jr-chart">${s}</div>
    <div class="wx-leg"><span><i style="background:#ffc060;opacity:.7"></i>Your path so far (fitted)</span><span><i style="background:#ffc060"></i>Where it heads at your pace</span><span><i style="background:#ffd884;opacity:.6"></i>Realistic limit to ceiling</span></div>
    <div class="jr-stats"><div><div class="basis">So far</div><div class="num jr-big">+${gained.toFixed(1)} kg<small> lean</small></div><div class="basis">${perYr == null ? "no history yet" : `about ${perYr.toFixed(1)} kg a year over ${P.tm.toFixed(1)} years of effective training. ${P.fitted ? `That fits a half-life of ${P.hl.toFixed(1)} years, ${P.hl > 3 ? `much slower than the typical 1 year of a beginner who trains hard and eats enough. Going forward I assume ${P.hlF.toFixed(1)} years, not a flatter line` : P.hl > 1.5 ? "slower than the typical 1 year of a beginner who eats and trains well, which fits where you are now, and the path keeps that pace" : "close to the typical pace"}` : ""}`}</div></div>
      <div><div class="basis">Next year</div><div class="num jr-big">+${nxt.toFixed(1)} kg<small> lean</small></div><div class="basis">about ${nxt / 12 < 0.1 ? "under 0.1" : (nxt / 12).toFixed(2)} kg a month if you keep your pace</div></div>
      <div><div class="basis">FFMI 20</div><div class="num jr-big">${reach(20)}</div><div class="basis">FFMI 22 ${reach(22)}</div></div>
      <div><div class="basis">At the realistic limit</div><div class="num jr-big">${P.real.toFixed(0)} kg lean<small></small></div><div class="basis">about ${target.toFixed(0)} kg body weight at 10% body fat</div></div></div>`;
}
