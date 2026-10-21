// Pure calculations, one place, shared by the live app and the demo. No DOM, no network.
// Scores are 0..1 "closeness to ideal" (1 = ideal) so every widget can colour them red (0) to white (1).
import { mean, nn, sd } from "./util.js";

export const TARGET = { needMin: 460, idealMin: 490, wakeMin: 390, gymPerWeek: 5, referenceSleepMin: 480 }; // need 7 h 40 m, ideal 8 h 10 m, wake 06:30, gym 5-6 days
export const GYM_TYPES = ["WEIGHTLIFTING", "STRENGTH_TRAINING", "WORKOUT"];
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const median = a => { a = nn(a).sort((x, y) => x - y); if (!a.length) return null; const m = a.length >> 1; return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; };

// ---------- sleep: one night ----------
export function nightStats(d) {
  if (!d?.sleepStages?.length) return null;
  const st = d.sleepStages.map(([t, a, b]) => ({ t, a: Date.parse(a) / 1000, b: Date.parse(b) / 1000 }));
  const asleep = st.filter(x => x.t !== "AWAKE");
  if (!asleep.length) return null;
  const onset = asleep[0].a, final = asleep[asleep.length - 1].b, off = d.sleepOffset || 0;
  const tst = asleep.reduce((s, x) => s + (x.b - x.a), 0) / 60, tib = (st[st.length - 1].b - st[0].a) / 60;
  // awake time strictly between first sleep and final wake, adjacent awake pieces merged
  const merged = []; st.filter(x => x.t === "AWAKE" && x.a >= onset && x.b <= final).forEach(x => { const p = merged[merged.length - 1]; if (p && x.a - p.b < 1) p.b = x.b; else merged.push({ a: x.a, b: x.b }); });
  const local = s => (((s + off) / 60) % 1440 + 1440) % 1440;
  return { tst, tib, se: 100 * tst / tib, waso: merged.reduce((s, x) => s + (x.b - x.a), 0) / 60, n5: merged.filter(x => x.b - x.a > 300).length, onsetMin: local(onset), wakeMin: local(final), onset, final };
}
// 14-night timing regularity: SD of onset and wake clock times, minutes. Onset is shifted so 23:30 and 00:30 are one hour apart.
export function regularity(days, n = 14) {
  const st = days.slice(-n).map(nightStats).filter(Boolean); if (st.length < 5) return null;
  return { onsetSd: sd(st.map(s => (s.onsetMin < 720 ? s.onsetMin + 1440 : s.onsetMin))), wakeSd: sd(st.map(s => s.wakeMin)), nights: st.length };
}
// Closeness-to-ideal per dimension (1 = ideal). Reported separately, never blended into one number.
export function nightScores(d) {
  const s = nightStats(d); if (!s) return null;
  const dur = clamp(1 - Math.abs(s.tst - TARGET.idealMin) / TARGET.idealMin);
  const wake = clamp(1 - Math.abs(s.wakeMin - TARGET.wakeMin) / 180);
  const cont = mean([clamp(1 - Math.max(0, s.waso - 20) / 70), clamp((s.se - 60) / 25), clamp(1 - Math.max(0, s.n5 - 1) / 3)]);
  return { dur, wake, cont, stats: s };
}

// ---------- sleep debt ----------
// (1) 7-day shortfall in hours: sum of max(0, N - T) over the latest 7 complete days; days without data are left out and counted.
export function shortfall7(byDate, endDate, addDays, N = TARGET.needMin) {
  let sum = 0, have = 0;
  for (let i = 0; i < 7; i++) { const r = byDate[addDays(endDate, -i)]; if (r?.sleepMin == null) continue; have++; sum += Math.max(0, N - (r.sleepMin + (r.napMin || 0))); }
  return { hours: sum / 60, nights: have };
}
// (2) Unified Model of Performance debt state: dD/dt = (L - D)/tau, L = +1 awake, -2 asleep, tau = 168 h. Exact update per interval.
const TAU = 168 * 3600;
function simulate(sleepIntervals, t0, t1) {
  let D = 0, t = t0; const step = (L, to) => { if (to > t) { D = L + (D - L) * Math.exp(-(to - t) / TAU); t = to; } };
  for (const [a, b] of sleepIntervals) { if (b <= t0 || a >= t1) continue; step(1, Math.max(a, t0)); step(-2, Math.min(b, t1)); }
  step(1, t1); return D;
}
// Index B = D_observed - D_reference at `now`. Days with no tracking use the reference schedule and are counted, never treated as awake.
export function debtIndex(days, nowSec, addDays, ymd) {
  const t0 = nowSec - 28 * 86400, usual = median(days.slice(-28).map(d => nightStats(d)?.onsetMin).filter(v => v != null).map(m => (m < 720 ? m + 1440 : m))) ?? 22.5 * 60;
  const ref = [], obs = []; let missing = 0;
  const byDate = Object.fromEntries(days.map(d => [d.date, d]));
  for (let i = 28; i >= 0; i--) {
    const dateStr = addDays(ymd(new Date(nowSec * 1000)), -i), d = byDate[dateStr];
    const off = (d?.sleepOffset ?? -new Date().getTimezoneOffset() * 60), dayStartLocal = Date.parse(dateStr + "T00:00:00Z") / 1000 - off;   // midnight local, as UTC seconds
    const onset = dayStartLocal + (usual - 1440) * 60;  // reference sleep begins the evening before this wake date
    ref.push([onset, onset + TARGET.referenceSleepMin * 60]);
    const st = d?.sleepStages?.filter(x => x[0] !== "AWAKE").map(([, a, b]) => [Date.parse(a) / 1000, Date.parse(b) / 1000]);
    if (st?.length) obs.push(...st); else { obs.push(ref[ref.length - 1]); if (i > 0 || !d) missing++; }
  }
  obs.sort((a, b) => a[0] - b[0]);
  return { index: simulate(obs, t0, nowSec) - simulate(ref, t0, nowSec), missingNights: missing };
}
// Bedtime that fits the need before the target wake time. Debt is repaid gradually: the extra is spread over about a week and
// never exceeds 30 min a night, so tonight is never more than the ideal plus half an hour in bed. One long night would not clear debt (the model's
// time constant is 7 days) and would simply be oversleeping.
export const MAX_CATCHUP_MIN = 30;
export function bedtime(shortfallHours) {
  const extra = Math.min(MAX_CATCHUP_MIN, (shortfallHours * 60) / 7), mins = (((TARGET.wakeMin - TARGET.idealMin - extra) % 1440) + 1440) % 1440;
  return { minutes: mins, extra: Math.round(extra), nights: extra > 0 ? Math.ceil((shortfallHours * 60) / Math.max(extra, 1)) : 0 };
}

// ---------- sleep quality: one equation, every term visible ----------
// SQ = 100 * sum(w_k * s_k) / sum(w_k over available terms), then capped by duration: SQ <= 100 * (0.4 + 0.6 * s_dur)
// so efficient but far-too-short sleep cannot score well. Each s_k is 0..1 and piecewise linear.
export const SQ_WEIGHTS = { dur: .30, reg: .15, waso: .13, se: .12, n5: .10, wake: .10, comp: .10 };
const dist = (v, lo, hi) => (v < lo ? lo - v : v > hi ? v - hi : 0);
export function sleepQuality(day, days) {
  const s = nightStats(day); if (!s) return null;
  const idx = days.indexOf(day), reg = regularity(idx >= 0 ? days.slice(0, idx + 1) : days);
  const tst = s.tst, N = TARGET.idealMin, pctOf = m => (m == null ? null : 100 * m / tst);
  const deep = day.deepMin, rem = day.remMin;
  const terms = {
    dur: tst <= N ? clamp(1 - (N - tst) / (N - 240)) : clamp(1 - Math.max(0, tst - (N + 60)) / 120),    // ideal 8 h 10 m (7 h 40 m scores 0.88); 4 h scores 0; more than 1 h over ideal loses points
    se: clamp((s.se - 65) / 20),                                                                           // 85 % and up scores 1
    waso: clamp(1 - (s.waso - 20) / 70),                                                                  // 20 min or less scores 1, 90 min scores 0
    n5: clamp(1 - Math.max(0, s.n5 - 1) / 3),                                                             // 0-1 wakes over 5 min scores 1
    wake: clamp(1 - Math.max(0, Math.abs(s.wakeMin - TARGET.wakeMin) - 15) / 105),                         // within 15 min of 06:30 scores 1, 2 h off scores 0
    reg: reg ? clamp(1 - Math.max(0, reg.onsetSd - 30) / 60) : null,                                      // bedtime spread over 14 nights: 30 min scores 1, 90 scores 0
    comp: deep != null && rem != null ? mean([clamp(1 - dist(pctOf(deep), 13, 23) / 10), clamp(1 - dist(pctOf(rem), 20, 25) / 10)]) : null  // deep 13-23 %, REM 20-25 % of sleep (rough adult norms, weakest evidence)
  };
  let w = 0, acc = 0; for (const k in SQ_WEIGHTS) if (terms[k] != null) { w += SQ_WEIGHTS[k]; acc += SQ_WEIGHTS[k] * terms[k]; }
  const raw = 100 * acc / w, score = Math.min(raw, 100 * (0.4 + 0.6 * terms.dur));
  return { score, raw, terms, completeness: w, capped: score < raw - 0.05 };
}

// ---------- three-colour scoring: bright red = bad, black = neutral or no data, white = good ----------
export const GOOD = 0.8, BAD = 0.6;   // closeness-to-ideal thresholds; one place to tune
export const tri = score => (score == null || Number.isNaN(score) ? "none" : score >= GOOD ? "good" : score < BAD ? "bad" : "mid");
export const TRI_FILL = { good: "var(--good)", bad: "var(--bad)", mid: "var(--mid)", none: "var(--none)" };   // colours live in CSS so light and dark mode can differ
export const TRI_BAR = { good: "var(--good-bar)", bad: "var(--bad)", mid: "var(--mid)", none: "var(--none-bar)" };

// ---------- body check (personal heuristic, not validated, not a diagnosis): overnight signals against your own baseline ----------
const CORE = [
  { key: "restingHr", name: "Resting heart rate", unit: "bpm", g: x => x, sign: 1, floor: 1.2, w: 1.2 },
  { key: "hrv", name: "HRV (log)", unit: "ms", g: x => (x > 0 ? Math.log(x) : null), sign: -1, floor: 0.12, w: 1.0 },
  { key: "breathing", name: "Breathing rate", unit: "br/min", g: x => x, sign: 1, floor: 0.5, w: 1.0 },
  { key: "skinTemp", name: "Skin temperature", unit: "°C", g: x => x, sign: 1, floor: 0.25, w: 1.3 }
];
// z = (g(x_t) - baseline) / max(spread, floor). Baseline and spread are exponentially weighted (time constant 14 days) over data up to
// 3 days before the assessment, so an emerging illness doesn't drag its own baseline. Needs 14+ valid days.
function zFor(metric, byDate, t, addDays) {
  const val = d => { const v = byDate[d]?.[metric.key]; return v == null ? null : metric.g(v); };
  const x = val(t), base = ewState(val, addDays(t, -3), addDays);
  if (x == null || !base || base.n < 14) return null;
  return metric.sign * ((x - base.mean) / Math.max(base.sd, metric.floor));
}
// ---- context: what your recent behaviour already explains ----
// For each signal, a small model learned from your own history predicts how far it should sit from its baseline given yesterday's training
// (active zone minutes, workout minutes), last night's sleep length and how late you fell asleep. Today's gap between actual and expected is
// the "unexplained" part, and that is what Body check scores. A hard day followed by low HRV is expected and doesn't count; the same HRV after
// a quiet day does. Fitted robustly (outlier days, such as earlier sick days, get little weight) and with a cap on how much it may explain away.
const CTX_MIN_DAYS = 40, CTX_CAP = 1.5;
function ctxFeats(byDate, d, addDays) {
  const r = byDate[d] || {}, p = byDate[addDays(d, -1)] || {}, st = nightStats(r);
  const wm = p.workouts ? p.workouts.reduce((s, w) => s + (w.seconds || 0) / 60, 0) : null;
  return [p.azm ?? (p.workouts ? 0 : null), wm, r.sleepMin ?? null, st ? ((st.onsetMin < 720 ? st.onsetMin + 1440 : st.onsetMin) - 1380) / 60 : null];
}
function solveLinear(M, b) {
  const n = b.length, A = M.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]]; if (Math.abs(A[c][c]) < 1e-9) return null;
    for (let r = 0; r < n; r++) if (r !== c) { const f = A[r][c] / A[c][c]; for (let k = c; k <= n; k++) A[r][k] -= f * A[c][k]; }
  }
  return A.map((r, i) => r[n] / r[i]);
}
const mad = a => { const m = median(a); return 1.4826 * median(a.map(v => Math.abs(v - m))); };
function ctxModel(metric, byDate, t, addDays) {
  const val = d => { const v = byDate[d]?.[metric.key]; return v == null ? null : metric.g(v); }, end = addDays(t, -3), rows = [];
  for (let i = 0; i <= 150; i++) {
    const d = addDays(end, -i), x = val(d); if (x == null) continue;
    const b = ewState(val, addDays(d, -3), addDays); if (!b || b.n < 14) continue;
    rows.push({ y: x - b.mean, f: ctxFeats(byDate, d, addDays) });
  }
  if (rows.length < CTX_MIN_DAYS) return null;
  const k = rows[0].f.length, mu = [], sc = [];
  for (let c = 0; c < k; c++) { const col = rows.map(r => r.f[c]).filter(v => v != null); mu.push(col.length ? mean(col) : 0); sc.push(col.length > 5 ? Math.max(sd2(col), 1e-6) : Infinity); }
  const std = f => f.map((v, c) => (v == null || !isFinite(sc[c]) ? 0 : (v - mu[c]) / sc[c])), X = rows.map(r => [1, ...std(r.f)]), y = rows.map(r => r.y);
  let w = rows.map(() => 1), beta = null;
  for (let it = 0; it < 6; it++) {   // robust (Huber-style) ridge: outlier days lose weight each round
    const p = k + 1, M = Array.from({ length: p }, (_, i) => Array(p).fill(0)), v = Array(p).fill(0);
    X.forEach((x, n) => { for (let i = 0; i < p; i++) { v[i] += w[n] * x[i] * y[n]; for (let j = 0; j < p; j++) M[i][j] += w[n] * x[i] * x[j]; } });
    for (let i = 1; i < p; i++) M[i][i] += 8;   // ridge on the behaviour terms, not the intercept
    const b = solveLinear(M, v); if (!b) return null; beta = b;
    const res = X.map((x, n) => y[n] - x.reduce((s, xi, i) => s + xi * b[i], 0)), s = Math.max(mad(res), 1e-6);
    w = res.map(r => Math.min(1, 1.345 * s / Math.max(Math.abs(r), 1e-9)));
  }
  const res = X.map((x, n) => y[n] - x.reduce((s, xi, i) => s + xi * beta[i], 0));
  return { beta, std, scale: Math.max(mad(res), metric.floor), n: rows.length };
}
const sd2 = a => { const m = mean(a); return Math.sqrt(mean(a.map(v => (v - m) ** 2))); };
function zCtx(metric, model, byDate, t, addDays) {
  const val = d => { const v = byDate[d]?.[metric.key]; return v == null ? null : metric.g(v); };
  const x = val(t), base = ewState(val, addDays(t, -3), addDays);
  if (x == null || !base || base.n < 14) return { z: null };
  const raw = metric.sign * ((x - base.mean) / Math.max(base.sd, metric.floor));
  if (!model) return { z: raw, raw, expected: null };
  const fx = [1, ...model.std(ctxFeats(byDate, t, addDays))], pred0 = fx.reduce((s, xi, i) => s + xi * model.beta[i], 0), pred = Math.max(-CTX_CAP * model.scale, Math.min(CTX_CAP * model.scale, pred0));
  const g = base.mean + pred, expected = metric.key === "hrv" ? Math.exp(g) : g;
  return { z: metric.sign * ((x - base.mean - pred) / model.scale), raw, expected };
}
// Thresholds and weights are one place, easy to retune. Skin temperature and resting heart rate carry a little more weight
// (the best early signals); several signals rising together adds a bonus, because agreement matters more than any one number.
// Recalibrated 2026-10-20: it read Low on a day with no symptoms. The spread floors were too tight (a 0.15 °C skin-temperature wobble counted as 1.2 standard deviations),
// so the floors are wider and the labels need a bigger, more consistent shift.
export const ILLNESS = { low: 0.6, mild: 1.2, strong: 2.0, elevatedAt: 1.0, convergence: 0.2, recent: [0.5, 0.3, 0.2] };
export function earlySigns(byDate, today, addDays) {
  const per = CORE.map(c => {
    const model = ctxModel(c, byDate, today, addDays), zs = [0, 1, 2].map(i => zCtx(c, model, byDate, addDays(today, -i), addDays));   // today, yesterday, the day before
    let num = 0, den = 0; zs.forEach((q, i) => { if (q.z != null) { num += ILLNESS.recent[i] * q.z; den += ILLNESS.recent[i]; } });
    return { ...c, z: den ? num / den : null, zRaw: zs[0].raw ?? null, expected: zs[0].expected ?? null, ctx: !!model, today: byDate[today]?.[c.key] ?? null };   // recent days weighted 50 / 30 / 20 so a fresh change shows up quickly
  });
  const have = per.filter(p => p.z != null);
  if (have.length < 3) return { status: "Insufficient data", composite: null, parts: per, elevated: 0, n: have.length, ctx: false };
  const wsum = have.reduce((s, p) => s + p.w, 0), wmean = have.reduce((s, p) => s + p.w * p.z, 0) / wsum;
  const elevated = have.filter(p => p.z >= ILLNESS.elevatedAt).length, composite = wmean + ILLNESS.convergence * Math.max(0, elevated - 1);
  return { status: composite >= ILLNESS.strong ? "Strong" : composite >= ILLNESS.mild ? "Mild" : composite >= ILLNESS.low ? "Low" : "All clear =)", composite, parts: per, elevated, n: have.length, ctx: have.every(p => p.ctx) };
}

// ---------- gym ----------
// Days with sets in the gym log also count as gym days (the log is filled in by hand, the band may miss a session).
export const gymLog = { days: new Set() };
export const isGym = w => GYM_TYPES.includes(w.type) && (w.seconds || 0) >= 20 * 60;
// Gym tracking starts fresh on this date: earlier gym sessions were never logged on the band, so they would only look like skipped days.
// Anything that would need days before the start returns null ("no data yet") instead of a misleading zero.
export const gymTracking = { start: "2026-10-15" };
export function gymDaysInWindow(byDate, endDate, n, addDays) {
  const first = addDays(endDate, -(n - 1)); if (first < gymTracking.start) return null;
  let c = 0; for (let i = 0; i < n; i++) { const d = addDays(first, i); if ((byDate[d]?.workouts || []).some(isGym) || gymLog.days.has(d)) c++; } return c;
}
export function gymDaysInWeek(byDate, mondayStr, addDays) { return gymDaysInWindow(byDate, addDays(mondayStr, 6), 7, addDays); }

// ---------- run form: metres per heartbeat, relative to a fixed baseline, and weekly momentum ----------
export function runForm(runs) {
  // runs: newest first, each {start (ms), seconds, distanceM, avgHr}
  const ok = runs.filter(r => r.avgHr && r.distanceM && r.seconds >= 600 && r.seconds <= 7200).sort((a, b) => a.start - b.start);
  const withE = ok.map(r => ({ ...r, E: (r.distanceM) / ((r.seconds / 60) * r.avgHr) }));   // metres per heartbeat
  const base = withE.length >= 3 ? median(withE.slice(0, 5).map(r => r.E)) : null;          // fixed: first 5 comparable runs
  withE.forEach(r => (r.P = base ? 100 * (r.E / base - 1) : null));
  let M = null, note = "Needs 3+ comparable runs spanning 14+ days in the last 42 days";
  if (withE.length) {
    const now = withE[withE.length - 1].start / 864e5, win = withE.filter(r => now - r.start / 864e5 <= 42);
    if (win.length >= 3 && now - Math.min(...win.map(r => r.start / 864e5)) >= 14) {
      const w = win.map(r => Math.exp(-(now - r.start / 864e5) / 14)), t = win.map(r => r.start / 864e5), y = win.map(r => Math.log(r.E));
      const sw = w.reduce((a, b) => a + b, 0), tb = w.reduce((a, x, i) => a + x * t[i], 0) / sw, yb = w.reduce((a, x, i) => a + x * y[i], 0) / sw;
      const den = w.reduce((a, x, i) => a + x * (t[i] - tb) ** 2, 0);
      if (den > 0) { const b = w.reduce((a, x, i) => a + x * (t[i] - tb) * (y[i] - yb), 0) / den; M = 100 * (Math.exp(7 * b) - 1); note = `${win.length} runs, last 42 days`; }
    }
  }
  return { runs: withE, baseline: base, momentum: M, note, skipped: runs.length - ok.length };
}

// ---------- shared colour: 0 = pure red, 1 = pure white ----------
export function rw(score) {
  if (score == null || Number.isNaN(score)) return null;
  const s = clamp(score), g = Math.round(255 * s);
  return `rgb(255,${g},${g})`;
}

// Exponentially weighted mean and variance of a daily series: dB/dt = (x - B)/tau, solved exactly between observations, so
// missing days need no special handling and no old value drops off a cliff. Returns the state after the last day <= endDate.
export const BASELINE_TAU_DAYS = 14;
export function ewState(valOf, endDate, addDays, span = 150, tau = BASELINE_TAU_DAYS) {
  let B = null, V = 0, n = 0, last = null;
  for (let i = span; i >= 0; i--) {
    const x = valOf(addDays(endDate, -i)); if (x == null) continue;
    if (B == null) { B = x; n = 1; last = i; continue; }
    const k = 1 - Math.exp(-(last - i) / tau), d = x - B; B += k * d; V = (1 - k) * (V + k * d * d); n++; last = i;
  }
  return n ? { mean: B, sd: Math.sqrt(V), n } : null;
}

// ---------- readiness: how far recent nightly HRV sits from your own usual ----------
// H[t] = mean RMSSD in the 4 h starting 30 min after sleep onset; X = ln(H); A = mean of the last 3 nights; baseline = earlier nights;
// Z = (A - M) / S, with M and S the exponentially weighted mean and spread of earlier nights. A recovery signal, not a percentage.
export function readiness(byDate, today, addDays) {
  const X = d => { const h = byDate[d]?.hrvNight; return h > 0 ? Math.log(h) : null; };
  const recent = [0, 1, 2].map(i => X(addDays(today, -i))).filter(v => v != null);
  const base = ewState(X, addDays(today, -1), addDays);   // baseline through last night: exponentially weighted, time constant 14 days
  if (recent.length < 2 || !base || base.n < 14) return { z: null, status: "Needs 2 of the last 3 nights and 14 earlier nights", nights: recent.length, base: base?.n ?? 0 };
  if (!base.sd) return { z: null, status: "Baseline has no spread yet", nights: recent.length, base: base.n };
  const z = (mean(recent) - base.mean) / base.sd;
  return { z, status: z < -0.5 ? "HRV trend below your usual range" : z > 0.5 ? "HRV trend above your usual range" : "Within your usual range", nights: recent.length, base: base.n,
    score: clamp(1 - Math.max(0, -z - 0.5) / 1.5) };   // below range loses points; above range is not treated as better
}

// ---------- run progress: metres per heartbeat now vs initial, and vs 1, 3 and 6 months ago ----------
export function runProgress(rf, nowMs = Date.now()) {
  const age = r => (nowMs - r.start) / 864e5, avgE = a => (a.length ? mean(a.map(r => r.E)) : null);
  const recent = avgE(rf.runs.filter(r => age(r) <= 30));
  const pct = (x, y) => (x == null || y == null ? null : 100 * (x / y - 1));
  const then = k => avgE(rf.runs.filter(r => Math.abs(age(r) - 30 * k) <= 15));
  return { recent, initial: pct(recent, rf.baseline), m1: pct(recent, then(1)), m3: pct(recent, then(3)), m6: pct(recent, then(6)) };
}

// ---------- load: Banister fitness-fatigue ----------
// Two first-order states driven by daily load w (active zone minutes, a stand-in for session load):
//   dF/dt = (w - F)/42   fitness: slow, the load you are adapted to
//   dG/dt = (w - G)/7    fatigue: fast, the load you are carrying
// Each is the exponentially weighted average of daily load, in minutes a day. Form = F - G (positive = fresher than adapted).
// Days with no data are skipped, not counted as rest.
export const TAU_FITNESS = 42, TAU_FATIGUE = 7;
export function banister(azmOf, today, addDays, span = 200) {
  let F = null, G = null, last = null, n = 0;
  for (let i = span; i >= 1; i--) {   // completed days only
    const w = azmOf(addDays(today, -i)); if (w == null) continue;
    if (F == null) { F = G = w; last = i; n = 1; continue; }
    const dt = last - i; F += (1 - Math.exp(-dt / TAU_FITNESS)) * (w - F); G += (1 - Math.exp(-dt / TAU_FATIGUE)) * (w - G); last = i; n++;
  }
  if (n < 28 || !F) return null;
  return { fitness: F, fatigue: G, form: F - G, ratio: G / F, days: n };
}

// ---------- heart-rate recovery: how far heart rate falls in the first minute after stopping ----------
// hr = [[seconds since the start, bpm]] including a few minutes after the end; elapsed = seconds from start to stop.
export function heartRateRecovery(hr, elapsed) {
  const win = (lo, hi) => hr.filter(p => p[0] >= lo && p[0] <= hi).map(p => p[1]);
  const end = win(elapsed - 15, elapsed), after = win(elapsed + 52, elapsed + 68);
  if (end.length < 2 || after.length < 1) return null;
  return { end: mean(end), at60: mean(after), drop: mean(end) - mean(after) };
}

// ---------- today's call: push, steady or rest ----------
// A personal rule, not clinical. Rest beats Steady beats Push. Returns null when there is too little to judge.
export function trainingCall({ rd, signs, lastQuality, lastTst, ratio }) {
  if (rd?.z == null && signs?.composite == null) return null;
  const rest = [], steady = [];
  if (signs?.composite != null && signs.composite >= ILLNESS.mild) rest.push("Body check is off");
  if (rd?.z != null && rd.z < -1) rest.push("HRV well below usual");
  if (lastTst != null && lastTst < 300) rest.push("Under 5 h of sleep");
  if (signs?.composite != null && signs.composite >= ILLNESS.low && signs.composite < ILLNESS.mild) steady.push("Body check slightly off");
  if (rd?.z != null && rd.z < -0.5) steady.push("HRV below usual");
  if (ratio != null && ratio > 1.3) steady.push("Load high for your fitness");
  if (lastQuality != null && lastQuality < 60) steady.push("Poor sleep last night");
  if (lastTst != null && lastTst < TARGET.needMin) steady.push("Short of your sleep need");
  if (rest.length) return { call: "Rest", reasons: rest.concat(steady).slice(0, 2) };
  if (steady.length) return { call: "Steady", reasons: steady.slice(0, 2) };
  return { call: "Push", reasons: ["HRV usual or better", "Load and sleep fine"] };
}

// ---------- weak link weights: not every area matters equally ----------
// Biggest drag = weight x (1 - closeness to goal), in points out of 100. Weights are my judgement, adjustable here.
export const WEAK_WEIGHTS = { readiness: .22, duration: .20, gym: .16, active: .12, continuity: .12, wake: .10, running: .08 };

// ---------- daily score: how well one day went, 0-100 ----------
// Score = 100 x sum(w_k x s_k) / sum(w_k over the terms that have data), each s_k in 0..1 (closeness to your goal).
// Same weights as Weak Link, minus running form (too sparse for a daily number). Needs at least half the weight to have data.
//   duration, continuity, wake time : the night that ended this morning
//   readiness                       : last 3 nights of HRV against your exponential baseline
//   gym                             : workouts in the 7 days up to today / 5   (a rest day doesn't cost points)
//   active minutes                  : active zone minutes in the 7 days up to today / 150
export const DAILY_CUT = 0.7;   // Year Ring: a day is good at 70 or above, bad below. No in-between.
export const DAILY_WEIGHTS = { duration: WEAK_WEIGHTS.duration, readiness: WEAK_WEIGHTS.readiness, gym: WEAK_WEIGHTS.gym, active: WEAK_WEIGHTS.active, continuity: WEAK_WEIGHTS.continuity, wake: WEAK_WEIGHTS.wake };
export function dailyScore(byDate, date, addDays, azmOf) {
  const t = {}, row = byDate[date], ns = row ? nightScores(row) : null;
  if (ns) { t.duration = ns.dur; t.continuity = ns.cont; t.wake = ns.wake; }
  const rd = readiness(byDate, date, addDays); if (rd.z != null) t.readiness = rd.score;
  const w7 = [...Array(7)].map((_, i) => addDays(date, -i)), worn = w7.filter(d => byDate[d] && (byDate[d].restingHr != null || byDate[d].sleepMin != null)).length;
  if (worn >= 5) {
    const g7 = gymDaysInWindow(byDate, date, 7, addDays); if (g7 != null) t.gym = Math.min(1, g7 / TARGET.gymPerWeek);
    const az = w7.map(azmOf).filter(v => v != null); if (az.length >= 5) t.active = Math.min(1, az.reduce((s, v) => s + v, 0) / 150);
  }
  let w = 0, acc = 0; for (const k in DAILY_WEIGHTS) if (t[k] != null) { w += DAILY_WEIGHTS[k]; acc += DAILY_WEIGHTS[k] * t[k]; }
  const total = Object.values(DAILY_WEIGHTS).reduce((s, v) => s + v, 0);
  if (w / total < 0.5) return null;
  return { score: 100 * acc / w, terms: t, coverage: w / total };
}
