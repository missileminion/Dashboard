import { getToken, hasToken } from "./auth.js";
import { sync, allDays, getMeta, loadSleepHr, loadRunHr, SCHEMA } from "./sync.js";
import { formulas } from "./formulas.js";
import { $, mean, sum, sd, ymd, addDays, f, hm, mmss, pad, dayLabel, delta, tile, slot, esc, n3 } from "./util.js";
import { bars, line, vital } from "./charts.js";
import { drawNight } from "./sleepchart.js";
import * as A from "./analytics.js";
import { bad, red } from "./standards.js";
import { sleepMonth, earlyOrb, yearRing, weakLink, nightFlow, drawLanes, lastRun } from "./widgets.js";
import { INFO } from "./info.js";
import { buildReport } from "./report.js";
import { initTimer } from "./timer.js";
import { initTasks } from "./tasks.js";
import { initGymLog, e1rm } from "./gymlog.js";
import { fitLift, fitGroup, journeyHTML, bodyStats, GROUPS, groupOf } from "./progress.js";
import { initCalendar } from "./calendar.js";
import { initTerminal } from "./terminal.js";
import { weightHTML, weightEntryHTML, wireWeight, latestWeight } from "./weight.js";
import { initSky } from "./sky.js";
import { initWeather } from "./weather.js";
import { demoDays, demoSleepHr, demoRunHr, demoGymHr } from "./demo.js";

const DEMO = location.port === "8082" || new URLSearchParams(location.search).has("demo");      // demo data on 8082, your real data on 8081
if (DEMO) A.gymTracking.start = "2000-01-01";   // the demo has gym history; real tracking starts fresh (see analytics.js)
let days = [], byDate = {}, today = ymd(new Date()), selNight = -1, view = "lanes", selRun = null, selGym = null, selLift = null, selGroup = null, busy = false, signedOut = false;
const km2 = v => v.toFixed(2).padStart(5, "0");
const WEEK_AZM = 150;

// ---- data access ----
// get(): a day the band was worn (it has sleep, HRV or resting HR) with no active zone minutes logged counts as 0
const get = (d, key) => { const r = byDate[d]; if (!r) return null; if (key === "azm") return r.azm ?? (r.restingHr != null || r.hrv != null || r.sleepMin != null ? 0 : null); return r[key] ?? null; };
const series = (key, n, end = today) => [...Array(n)].map((_, i) => { const d = addDays(end, -(n - 1 - i)); return { d, v: get(d, key) }; });
const vals = s => s.map(x => x.v);
const win = (key, n, back = 0) => vals(series(key, n, addDays(today, -back)));
const monday = d => { const x = new Date(d + "T12:00:00"); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return ymd(x); };
const clock = m => `${pad(Math.floor(m / 60) % 24)}:${pad(Math.round(m % 60) % 60)}`;
const slotOrValue = (label, v, unit, fmt = v => String(Math.round(v))) => (v == null ? slot(label) : tile(label, fmt(v), unit, ""));

// ---- render ----
function render() {
  failures.length = 0;
  // values shared by several cards; each block below fills them in, and a failure leaves a safe default
  let nights = [], hrv7 = null, hrv30 = [], hrvSd = null, hrvMean = null, hrvIn = null, hrvPos = 50, last = () => null;
  let sf = { hours: 0, nights: 0 }, sfPrev = { hours: 0, nights: 0 }, debt = { index: 0, missingNights: 0 }, bed = { minutes: 0, extra: 0 }, debtTile = () => slot("Sleep debt", "Unavailable");
  let rd = { z: null, status: "Unavailable" }, lb = null, st7 = null, st7p = null, lastNight = null, sq = null, sqTile = slot("Sleep quality", "Unavailable");
  let a7 = null, a7p = null, gymLast = 0, signs = { composite: null, status: "Insufficient data", parts: [] };
  const step = (name, fn) => { try { fn(); } catch (e) { failures.push(`${name}: ${e.message}`); console.error(name, e); } };
  step("Data", () => {
  nights = days.filter(d => d.sleepStages?.length);
  if (selNight < 0 || selNight >= nights.length) selNight = nights.length - 1;
  hrv7 = mean(win("hrv", 7)), hrv30 = win("hrv", 30, 7), hrvSd = sd(hrv30), hrvMean = mean(hrv30);
  hrvIn = hrvSd == null || hrv7 == null ? null : Math.abs(hrv7 - hrvMean) <= hrvSd, hrvPos = hrvSd == null || hrv7 == null ? 50 : Math.min(100, Math.max(0, ((hrv7 - (hrvMean - 2 * hrvSd)) / (4 * hrvSd)) * 100));
  last = k => [...series(k, 14)].reverse().find(x => x.v != null);

  });
  step("Sleep debt", () => {
  // sleep debt: two separate outputs, never merged
  const endD = [today, addDays(today, -1)].find(d => byDate[d]?.sleepMin != null) || addDays(today, -1);   // last night is filed under today once you have woken up
  sf = A.shortfall7(byDate, endD, addDays); sfPrev = A.shortfall7(byDate, addDays(endD, -1), addDays); debt = A.debtIndex(days, Date.now() / 1000, addDays, ymd), bed = A.bedtime(sf.hours);
  debtTile = () => sf.nights < 3 ? slot("Sleep debt", "Needs 3+ nights", "debt") :
    sf.hours < 0.1 ? tile("Sleep debt", "None", "", `<div class="basis">on target this week</div>${debtChange()}`, "", "debt") :
    tile("Sleep debt", hm(sf.hours * 60), "behind", `<div class="basis">over recent nights, the last week counts most</div>${debtChange()}`, "", "debt", bad("sleepDebtHours", sf.hours));
  const debtChange = () => { if (sfPrev.nights < 3) return ""; const d = (sf.hours - sfPrev.hours) * 60; return Math.abs(d) < 2 ? `<div class="basis">same as yesterday</div>` : `<div class="basis" style="${d > 0 ? "color:var(--worse)" : ""}">${d > 0 ? "▲ " : "▼ "}${hm(Math.abs(d))} since yesterday</div>`; };
  });
  step("Readiness and load", () => {
  rd = A.readiness(byDate, today, addDays), lb = A.banister(d => get(d, "azm"), today, addDays);
  });
  step("Headline", () => {
  $("hero").innerHTML =
    (rd.z == null ? `<div class="card slot main"><span class="i" data-i="readiness" role="button" tabindex="0">i</span><div class="lbl">Readiness</div><div class="val">—</div><div class="basis">Needs 2 of the last 3 nights and 14 earlier nights of HRV</div></div>` :
      tile("Readiness", (rd.z >= 0 ? "+" : "−") + n3(Math.abs(rd.z)), "σ", `<div class="d ${red("readinessZ", rd.z)}">${rd.z < -0.5 ? "▼ Below usual" : rd.z > 0.5 ? "▲ Above usual" : "✓ Usual"}</div>`, "main", "readiness", bad("readinessZ", rd.z))) +
    (hrv7 == null ? tile("HRV status", null, "ms", `<div class="basis">No data in the last 7 days</div>`, "", "hrvStatus") :
      tile("HRV status", hrv7.toFixed(0), "ms", `<div class="range"><i style="left:25%;width:50%"></i><b style="left:${hrvPos}%${hrvIn === false ? ";background:var(--worse)" : ""}"></b></div>`, "", "hrvStatus", hrvIn === false)) +
    debtTile() +
    (lb == null ? slot("Load balance", "Needs 28+ days of data", "load") : tile("Load balance", "×" + lb.ratio.toFixed(2), "fatigue ÷ fitness", `<div class="d ${red("loadRatio", lb.ratio)} num">${lb.fatigue.toFixed(0)} vs ${lb.fitness.toFixed(0)} min a day</div>`, "", "load", bad("loadRatio", lb.ratio)));

  });
  step("Sleep numbers", () => {
  // sleep
  st7 = mean(win("sleepMin", 14)), st7p = mean(win("sleepMin", 14, 14)), lastNight = nights[nights.length - 1], sq = lastNight ? A.sleepQuality(lastNight, days) : null;
  sqTile = sq == null ? slot("Sleep quality", "Needs a night with stage data", "sleepQuality") :
    tile("Sleep quality", Math.round(sq.score), "/ 100", `<div class="basis">last night</div>`, "", "sleepQuality", bad("sleepQuality", sq.score));
  });
  step("Sleep tiles", () => {
  $("sleepKpi").innerHTML = sqTile +
    tile("Sleep time", st7 == null ? null : hm(st7), "", delta(st7, st7p, "min", true, "14-night avg vs prior 14"), "", "", bad("sleepTime", st7)) +
    tile("Bedtime tonight", clock(bed.minutes), "", bed.extra ? `<div class="basis">includes ${bed.extra} min catch-up</div>` : "", "", "bedtime");
  });
  step("Sleep chart", () => drawSleepCard(nights));
  step("Sleep quality", () => renderQuality(nights));
  step("Sleep Month", () => sleepMonth($("sleepMonth"), byDate, days, today));
  step("Load numbers", () => {
  // load: the last 7 days including today so far, against the 7 before, the same windows as the weekly review and the runs card
  a7 = sum(win("azm", 7, 0)), a7p = sum(win("azm", 7, 7));
  gymLast = A.gymDaysInWeek(byDate, monday(addDays(today, -7)), addDays);
  });
  step("Load", () => {
  $("loadKpi").innerHTML =
    tile("Active zone min", a7 == null ? null : Math.round(a7), "min / 7d", delta(a7, a7p, "min", true, "vs prior 7 days"), "", "", bad("azmWeek", a7)) +
    weeksTile() +
    `<div class="card"><div class="lbl">Workouts last week</div><div class="val ${gymLast == null ? "gap" : red("workouts", gymLast)}">${gymLast ?? "—"}<small>of 6 days</small></div>${gymLast == null ? `<div class="basis">tracking restarted ${A.gymTracking.start}</div>` : ""}</div>` + weekTile();
  });
  step("Illness signs data", () => { signs = A.earlySigns(byDate, today, addDays); });
  step("Runs", () => renderRuns());
  step("Gym", () => renderGym());
  step("Body Check", () => earlyOrb($("orb"), signs, A.earlySigns(byDate, addDays(today, -1), addDays)));
  step("Today", () => renderToday(signs, rd, lb, sq, lastNight));
  step("Weekly review", () => renderReview());
  step("Morning report", () => renderMorning({ signs, rd, lb, sq, lastNight, sf, sfPrev, bed }));
  step("Vitals", () => {
    const vrow = (k, name, unit, dec) => { const l = last(k); if (!l) return vital(name, null, unit, null, dec); const base = vals(series(k, 31, addDays(l.d, -1))); const m = mean(base), s = sd(base); return vital(name, l.v, unit, s == null ? null : [m - s, m + s], dec, l.d === today ? "" : ` · from ${dayLabel(l.d)}`); };
    $("vitals").innerHTML = vrow("restingHr", "Resting HR", "bpm", 0) + vrow("hrv", "HRV", "ms", 0) + vrow("breathing", "Breathing", "br/min", 1) + vrow("spo2", "SpO2", "%", 1) + vrow("skinTempDelta", "Skin temp Δ", "°C", 2);
  });
  step("Resting heart rate chart", () => line($("lrhr"), series("restingHr", 90), { h: 78 }));
  step("Year Ring", () => {
    const yr = today.slice(0, 4), ds = {}; for (let d = `${yr}-01-01`; d <= today; d = addDays(d, 1)) { const r = A.dailyScore(byDate, d, addDays, x => get(x, "azm")); if (r) ds[d] = r.score / 100; }
    window.__dailyScores = ds; yearRing($("yearRing"), d => ds[d] ?? null, today);
  });
  step("Weak Link", () => renderWeakLink(nights));
  showFailures();
}
const failures = [];
function showFailures() { const el = $("fail"); el.hidden = !failures.length; el.innerHTML = failures.length ? `<span>●</span><span>${failures.length} card${failures.length > 1 ? "s" : ""} could not be drawn: ${esc(failures.join(" · "))}</span>` : ""; }

// ---- sleep card: Fitbit-style stages, or Night Flow ----
let flowToken = 0;
async function drawSleepCard(nights) {
  if (!nights.length) { $("hyp").innerHTML = `<div class="basis" style="padding:var(--s6) 0">No sleep data yet.</div>`; $("sleepStats").innerHTML = ""; $("nightLbl").textContent = "—"; $("prevN").disabled = $("nextN").disabled = true; return; }
  const n = nights[selNight];
  $("nightLbl").textContent = selNight === nights.length - 1 ? "Last night" : dayLabel(n.date);
  $("prevN").disabled = selNight <= 0; $("nextN").disabled = selNight >= nights.length - 1;
  $("tip").style.display = "none"; $("stageNote").textContent = ""; $("sleepInfo").dataset.i = { lanes: "nightFlow", stages: "stages" }[view];
  if (view === "stages") {
    const restKnown = days.some(d => d.sleepStages?.some(([t, a, b], i, arr) => t === "AWAKE" && i > 0 && i < arr.length - 1 && (Date.parse(b) - Date.parse(a)) / 1000 < 180));
    drawNight(n, { restKnown });
    $("stageNote").textContent = "";
  } else {
    const my = ++flowToken; $("hyp").innerHTML = `<div class="basis" style="padding:var(--s6) 0">Loading heart rate for this night…</div>`;
    let hr = []; try { hr = DEMO ? demoSleepHr(n) : await loadSleepHr(n); } catch (e) { $("stageNote").textContent = "Heart rate could not be loaded (" + e.message + "). Showing stages only."; }
    if (my !== flowToken) return;
    const nf = nightFlow(n, hr); drawLanes($("hyp"), $("tip"), nf);
    $("sleepStats").innerHTML = `<div class="big">${hm(n.sleepMin)}<small>asleep</small></div>`;
    if (!hr.length) $("stageNote").textContent = "No heart-rate readings for this night. The line sits mid-band.";
  }
}

function renderQuality(nights) {
  const n = nights[selNight], el = $("quality"); if (!n) { el.innerHTML = `<div class="basis">No night selected.</div>`; return; }
  const q = A.sleepQuality(n, days), s = A.nightStats(n);
  if (!q) { el.innerHTML = `<div class="basis">No stage detail for this night.</div>`; return; }
  const reg = A.regularity(days.slice(0, days.indexOf(n) + 1));
  const T = [["dur", "Duration", hm(s.tst), "ideal 8 h 10 m"], ["reg", "Bedtime regularity", reg ? "±" + Math.round(reg.onsetSd) + " min" : "—", "14-night spread"], ["waso", "Awake after falling asleep", Math.round(s.waso) + " min", "≤ 20 min"], ["se", "Efficiency", s.se.toFixed(0) + " %", "85 %+"], ["n5", "Wakes over 5 min", String(s.n5), "0–1"], ["wake", "Wake time", clock(s.wakeMin), "goal 06:30"], ["comp", "Deep and REM share", n.deepMin != null ? Math.round(100 * n.deepMin / s.tst) + " / " + Math.round(100 * n.remMin / s.tst) + " %" : "—", "deep 13–23, REM 20–25"]];
  const row = ([k, name, val, ref]) => `<div class="row" style="grid-template-columns:1fr auto"><div>${name}<div class="basis">${ref}</div></div><span class="num ${q.terms[k] != null ? red("closeness", q.terms[k]) : ""}" style="font-size:15px">${val}</span></div>`;
  el.innerHTML = `<div class="num ${red("sleepQuality", q.score)}" style="font-size:26px;font-weight:600;margin-bottom:var(--s2)">${Math.round(q.score)}<small style="font-size:12px;color:var(--tx2);font-weight:400;margin-left:6px">/ 100</small></div>` + T.map(row).join("");
}
function weekTile() {
  const mon = monday(today), wk = [...Array(7)].map((_, i) => addDays(mon, i)).filter(d => d <= today);
  const tot = sum(wk.map(d => get(d, "azm")));
  if (tot == null) return tile("This week", null, "/ 150 min", "");
  return `<div class="card"><div class="lbl">Active zone min this week</div><div class="val">${Math.round(tot)}<small>/ ${WEEK_AZM} min</small></div><div class="range" style="height:6px;margin:6px 0 0"><i style="left:0;width:${Math.min(100, tot / WEEK_AZM * 100)}%;background:var(--accent)"></i></div></div>`;
}
// every run with the local date it started on; the Runs card and the weekly review both read this, so their totals always agree
const allRuns = () => days.flatMap(d => (d.workouts || []).filter(w => /RUN/i.test(w.type || "")).map(w => ({ ...w, date: new Date(w.start + w.offset * 1000).toISOString().slice(0, 10) }))).sort((a, b) => b.start - a.start);
let runToken = 0;
function renderRuns() {
  const runs = allRuns();
  const within = (a, b) => runs.filter(r => r.date > addDays(today, -b) && r.date <= addDays(today, -a));
  const d7 = sum(within(0, 7).map(r => r.distanceM)), d7p = sum(within(7, 14).map(r => r.distanceM)), rf = A.runForm(runs);
  const latest = rf.runs[rf.runs.length - 1];
  $("runKpi").innerHTML =
    tile("Distance", d7 == null ? (runs.length ? "0.00" : null) : km2(d7 / 1000), "km / 7d", delta(d7 == null ? (runs.length ? 0 : null) : d7 / 1000, d7p == null ? (runs.length ? 0 : null) : d7p / 1000, "km", true, "vs prior 7 days", 2, km2)) +
    tile("Runs", runs.length ? within(0, 7).length : null, "/ 7d", delta(runs.length ? within(0, 7).length : null, runs.length ? within(7, 14).length : null, "", true, "vs prior 7 days", 0, v => String(Math.round(v)))) +
    tile("Latest run form", latest?.P == null ? null : (latest.P >= 0 ? "+" : "−") + n3(latest.P), "% vs baseline", `<div class="basis">${latest ? latest.E.toFixed(3) + " m per heartbeat" : "Needs runs with heart rate"}</div>`, "", "", latest?.P != null && bad("runChange", latest.P)) +
    tile("Momentum", rf.momentum == null ? null : (rf.momentum >= 0 ? "+" : "−") + n3(rf.momentum), "% / week", `<div class="basis">${rf.note}</div>`, "", "", rf.momentum != null && bad("runChange", rf.momentum));
  const vo = [...series("vo2max", 60)].reverse().find(x => x.v != null), vo30 = mean(series("vo2max", 12, addDays(today, -25)).map(x => x.v)), voPct = vo && vo30 ? 100 * (vo.v / vo30 - 1) : null;
  $("runKpi").insertAdjacentHTML("beforeend", vo == null ? slot("Cardio fitness", "No estimate from the band yet", "vo2") : tile("Cardio fitness", n3(vo.v), "VO2 max", voPct == null ? "" : `<div class="d ${red("vo2Change", voPct)}">${voPct >= 0 ? "▲" : "▼"} ${n3(voPct)}% in 30 days</div>`, "", "vo2", voPct != null && bad("vo2Change", voPct)));
  const E = r => rf.runs.find(x => x.start === r.start);
  const sel = runs.find(r => r.start === selRun) || runs[0];
  $("runs").innerHTML = runs.length ? `<div class="row hd" style="grid-template-columns:80px 1fr 1fr 1fr 70px 70px"><span>Date</span><span>Distance</span><span>Time</span><span>Pace</span><span style="text-align:right">Avg HR</span><span style="text-align:right">Form</span></div>` +
    runs.slice(0, 10).map(r => { const e = E(r); return `<div class="row num runrow" data-start="${r.start}" style="grid-template-columns:80px 1fr 1fr 1fr 70px 70px;cursor:pointer;${sel && r.start === sel.start ? "background:var(--raised)" : ""}"><span>${dayLabel(r.date).replace(/^\w+, /, "")}</span><span>${r.distanceM == null ? "—" : km2(r.distanceM / 1000) + " km"}</span><span>${r.seconds ? mmss(r.seconds) : "—"}</span><span>${r.paceSecPerKm ? mmss(r.paceSecPerKm) + " /km" : "—"}</span><span style="text-align:right">${r.avgHr ? r.avgHr : "—"}</span><span style="text-align:right">${e?.P == null ? "—" : (e.P >= 0 ? "+" : "−") + n3(e.P) + "%"}</span></div>`; }).join("") + `<div class="basis" style="margin-top:var(--s2)">Click a run to open it above.</div>` :
    `<div class="basis" style="padding:var(--s4) 0">No runs in the last 90 days.</div>`;
  document.querySelectorAll(".runrow").forEach(el => (el.onclick = () => { selRun = +el.dataset.start; renderRuns(); }));
  // last run: shown at once, heart-rate trace added when it arrives
  lastRun($("lastRun"), sel, null);
  if (sel) { const my = ++runToken; (async () => { let hr = []; try { hr = DEMO ? demoRunHr(sel) : await loadRunHr(sel); } catch (e) { } if (my === runToken) lastRun($("lastRun"), sel, hr); })(); }
  // run form: change in metres per heartbeat vs the start, and vs 1, 3 and 6 months ago
  const pr = A.runProgress(rf), fmtP = v => (v == null ? `<span></span><span>—</span>` : `<span>${v >= 0 ? "+" : "−"}</span><span>${n3(Math.abs(v))}%</span>`);
  const prow = (l, v, hint) => `<div class="row" style="grid-template-columns:1fr auto;padding:7px 0"><span>${l}</span><span class="num chg ${v != null ? red("runChange", v) : ""}" style="font-size:20px;font-weight:600;grid-template-columns:.8em 6ch">${fmtP(v)}</span></div>`;
  $("pace").innerHTML = prow("From your first runs", pr.initial, "") + prow("vs 1 month ago", pr.m1, "") + prow("vs 3 months ago", pr.m3, "") + prow("vs 6 months ago", pr.m6, "");
  $("paceNote").textContent = rf.skipped ? `${rf.skipped} run${rf.skipped > 1 ? "s" : ""} left out (no heart rate)` : "";
}
let gymLogApi = null, gymToken = 0;
addEventListener("wx:ready", () => { if (days.length) render(); });   // the weather arrived: the Status report can use it
const renderWeightEntry = () => { $("glogWeight").innerHTML = weightEntryHTML(today); wireWeight($("glogWeight"), today); };
addEventListener("weight:change", () => { renderWeightEntry(); renderGym(); });
addEventListener("gymlog:change", () => {   // logged sets also make that day a gym day; refresh everything that depends on it
  A.gymLog.days = new Set((gymLogApi?.entries || []).map(e => e.date)); if (days.length) render();
});
function renderGym() {
  const iso = w => new Date(w.start + w.offset * 1000).toISOString().slice(0, 10);
  const gyms = days.flatMap(d => (d.workouts || []).filter(A.isGym).map(w => ({ ...w, date: iso(w) }))).sort((a, b) => b.start - a.start);
  const win = (a, b) => gyms.filter(g => g.date > addDays(today, -b) && g.date <= addDays(today, -a));
  const g7 = A.gymDaysInWindow(byDate, today, 7, addDays), g7p = A.gymDaysInWindow(byDate, addDays(today, -7), 7, addDays);
  const hrs = a => (a.length ? sum(a.map(g => g.seconds)) / 3600 : gyms.length ? 0 : null), w28 = win(0, 28);
  $("gymKpi").innerHTML =
    tile("Gym days", g7, "/ 7d", delta(g7, g7p, "", true, "vs prior 7 days"), "", "gymDays", g7 != null && g7 <= 3) +
    tile("Training time", hrs(win(0, 7)) == null ? null : n3(hrs(win(0, 7))), "h / 7d", delta(hrs(win(0, 7)), hrs(win(7, 14)), "h", true, "vs prior 7 days", 1), "", "gymTime") +
    tile("Average session", w28.length ? hm(mean(w28.map(g => g.seconds)) / 60) : null, "", `<div class="basis">last 4 weeks</div>`) +
    tile("Average heart rate", w28.length && mean(w28.map(g => g.avgHr)) != null ? Math.round(mean(w28.map(g => g.avgHr))) : null, "bpm", `<div class="basis">last 4 weeks</div>`);
  const mon = monday(today), wk = [...Array(12)].map((_, i) => addDays(mon, -7 * (11 - i)));
  $("gymWeeks").innerHTML = wk.slice().reverse().map(m => {
    const v = A.gymDaysInWeek(byDate, m, addDays), cur = m === mon, bad = v != null && !cur && red("workouts", v);
    return `<div style="display:grid;grid-template-columns:70px 1fr 24px;gap:var(--s3);align-items:center;padding:5px 0;border-bottom:1px solid var(--line)"><span class="basis">${cur ? "This week" : dayLabel(m).replace(/^\w+, /, "")}</span><div style="position:relative;height:8px;border-radius:4px;background:var(--raised)">${v == null ? "" : `<i style="display:block;height:100%;width:${Math.min(100, v / 7 * 100)}%;border-radius:4px;background:var(--ink2)"></i>`}<b style="position:absolute;top:-3px;bottom:-3px;left:${5 / 7 * 100}%;width:1px;background:var(--tx3)"></b></div><span class="num ${bad || ""}" style="text-align:right">${v ?? "—"}</span></div>`;
  }).join("");
  $("gymNote").textContent = "The line marks 5 days, your goal is 5 to 6. The current week counts days so far.";
  const sel = gyms.find(g => g.start === selGym) || gyms[0], cols = "80px 1fr 1fr 1fr 1fr";
  $("gymRecent").innerHTML = gyms.length ? `<div class="row hd" style="grid-template-columns:${cols}"><span>Date</span><span>Time</span><span>Avg HR</span><span>Calories</span><span style="text-align:right">Zone min</span></div>` +
    gyms.slice(0, 10).map(g => `<div class="row num gymrow" data-start="${g.start}" style="grid-template-columns:${cols};cursor:pointer;${sel && g.start === sel.start ? "background:var(--raised)" : ""}"><span>${dayLabel(g.date).replace(/^\w+, /, "")}</span><span>${hm(g.seconds / 60)}</span><span>${g.avgHr ? g.avgHr + " bpm" : "—"}</span><span>${g.kcal ? Math.round(g.kcal) + " kcal" : "—"}</span><span style="text-align:right">${g.azm != null ? Math.round(g.azm) : "—"}</span></div>`).join("") + `<div class="basis" style="margin-top:var(--s2)">Click a workout to open it above.</div>`
    : `<div class="basis" style="padding:var(--s4) 0">No gym sessions from the band yet. Weightlifting, Strength training and Workout sessions of 20 minutes or more show up here after the band syncs them.</div>`;
  // lift progress from the gym log: last set, estimated 1-rep max (Epley), and its change against 4 weeks earlier
  const ents = gymLogApi?.entries || [], byEx = {};
  ents.forEach(e => (byEx[e.exercise] ||= []).push(e));
  const cutoff = addDays(today, -28), lifts = Object.entries(byEx).map(([name, list]) => {
    list.sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);
    const last = list[list.length - 1], best = l => Math.max(...l.map(e => e1rm(e.weight, e.reps))), now = best(list.filter(e => e.date > addDays(last.date, -14))), old = list.filter(e => e.date <= cutoff && e.date > addDays(cutoff, -28));
    return { name, last, now, change: old.length ? 100 * (now / best(old) - 1) : null, n: list.length };
  }).filter(l => l.last.date > addDays(today, -60)).sort((a, b) => b.last.date.localeCompare(a.last.date)).slice(0, 14);
  const lcols = "1fr 110px 80px 80px";
  $("gymLifts").innerHTML = lifts.length ? `<div class="row hd" style="grid-template-columns:${lcols}"><span>Lift</span><span>Last set</span><span style="text-align:right">Est. 1RM</span><span style="text-align:right">vs 4 wks</span></div>` + lifts.map(l => `<div class="row num" style="grid-template-columns:${lcols}"><span style="font-family:var(--sans)">${esc(l.name)}</span><span>${l.last.weight} lb × ${l.last.reps}</span><span style="text-align:right">${Math.round(l.now)} lb</span><span class="${l.change != null ? red("liftChange", l.change) : ""}" style="text-align:right">${l.change == null ? "—" : (l.change >= 0 ? "+" : "−") + n3(Math.abs(l.change)) + "%"}</span></div>`).join("") + `<div class="basis" style="margin-top:var(--s2)">Estimated 1RM = weight × (1 + reps ÷ 30). Change needs a set from 4 to 8 weeks ago.</div>`
    : `<div class="basis" style="padding:var(--s4) 0">No sets logged yet. Log a set in the Gym log tab and progress per lift shows up here.</div>`;
  // strength journey: Legs, Push or Pull as one curve; tap a lift in the list for its own curve
  if (!GROUPS.includes(selGroup)) selGroup = GROUPS.find(g => ents.some(e => groupOf(e) === g)) || GROUPS[0];
  $("journeyChips").innerHTML = GROUPS.map(g => `<button type="button" class="gl-chip${g === selGroup ? " on" : ""}" data-g="${g}">${g}</button>`).join("");
  $("journeyChips").onclick = e => { const b = e.target.closest("button[data-g]"); if (b) { selGroup = b.dataset.g; selLift = null; renderGym(); } };
  const jr = $("gymJourney");
  jr.innerHTML = selLift
    ? `<button type="button" class="jr-back" id="jrBack">‹ ${selGroup}</button><div class="jr-lifttitle">${esc(selLift)}</div>` + journeyHTML(fitLift(ents, selLift, today), bodyStats(latestWeight()))
    : journeyHTML(fitGroup(ents, selGroup, today), bodyStats(latestWeight()));
  const pick = el => { selLift = el.dataset.n; renderGym(); };
  jr.querySelectorAll(".jr-lift").forEach(el => { el.onclick = () => pick(el); el.onkeydown = e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(el); } }; });
  if ($("jrBack")) $("jrBack").onclick = () => { selLift = null; renderGym(); };
  $("gymWeight").innerHTML = weightHTML(today);
  document.querySelectorAll(".gymrow").forEach(el => (el.onclick = () => { selGym = +el.dataset.start; renderGym(); }));
  lastRun($("lastGym"), sel, null, { gym: true });
  if (sel) { const my = ++gymToken; (async () => { let hr = []; try { hr = DEMO ? demoGymHr(sel) : await loadRunHr(sel); } catch (e) { } if (my === gymToken) lastRun($("lastGym"), sel, hr, { gym: true }); })(); }
}
function weeksTile() {   // completed weeks in which you reached your gym goal (5 or more gym days). Active zone minutes are not used: lifting barely raises heart rate into the zones.
  const mon = monday(today), weeks = [...Array(12)].map((_, i) => addDays(mon, -7 * (i + 1)));
  const res = weeks.map(w => A.gymDaysInWeek(byDate, w, addDays)).filter(v => v != null);
  const hit = res.filter(v => v >= A.TARGET.gymPerWeek).length;
  return tile("Weeks on goal", res.length ? hit : null, res.length ? `of last ${res.length}` : "", `<div class="basis">${res.length ? "5+ gym days in a week" : "builds up as weeks finish"}</div>`, "", "weeksGoal", res.length >= 3 && bad("weeksOnGoal", hit, res.length));
}
function renderWeakLink(nights) {
  const recent = nights.slice(-14), sc = recent.map(A.nightScores).filter(Boolean), st = recent.map(A.nightStats).filter(Boolean), enough = st.length >= 5;
  const avgS = k => (enough ? mean(sc.map(s => s[k])) : null);
  const mon = monday(today), wk = i => addDays(mon, -7 * (i + 1));
  const gym = [0, 1, 2].map(i => A.gymDaysInWeek(byDate, wk(i), addDays)), gymAvg = gym.some(v => v != null) ? mean(gym) : null;
  const azmW = [0, 1, 2].map(i => sum([...Array(7)].map((_, j) => get(addDays(wk(i), j), "azm")))), azmAvg = azmW.some(v => v != null) ? mean(azmW) : null;
  const rd = A.readiness(byDate, today, addDays), rf = A.runForm(days.flatMap(d => (d.workouts || []).filter(w => /RUN/i.test(w.type || "")))), pr = A.runProgress(rf);
  const g = (v, unit, dec = 0) => (v == null ? null : v > -0.05 ? "00.0" : "−" + n3(v) + " " + unit);   // minus = short of goal, 0 = met
  const W = A.WEAK_WEIGHTS;
  weakLink($("weakLink"), [
    { name: "Sleep duration", weight: W.duration, score: avgS("dur"), gap: enough ? g(mean(st.map(s => s.tst)) - A.TARGET.idealMin, "min") : null },
    { name: "Readiness", weight: W.readiness, score: rd.z == null ? null : rd.score, gap: rd.z == null ? null : g(Math.min(0, rd.z + 0.5), "σ", 1) },
    { name: "Gym", weight: W.gym, score: gymAvg == null ? null : Math.min(1, gymAvg / A.TARGET.gymPerWeek), gap: gymAvg == null ? null : g(gymAvg - A.TARGET.gymPerWeek, "days", 1) },
    { name: "Active minutes", weight: W.active, score: azmAvg == null ? null : Math.min(1, azmAvg / WEEK_AZM), gap: azmAvg == null ? null : g(azmAvg - WEEK_AZM, "min") },
    { name: "Sleep continuity", weight: W.continuity, score: avgS("cont"), gap: enough ? g(-Math.max(0, mean(st.map(s => s.waso)) - 20), "min") : null },
    { name: "Wake time", weight: W.wake, score: avgS("wake"), gap: enough ? g(-mean(st.map(s => Math.abs(s.wakeMin - A.TARGET.wakeMin))), "min") : null },
    { name: "Running form", weight: W.running, score: pr.initial == null ? null : Math.min(1, Math.max(0, .5 + pr.initial / 20)), gap: pr.initial == null ? null : (pr.initial >= 0 ? "+" : "−") + n3(pr.initial) + "%" }]);

}
// ---- status / banner ----
function banner(html, cls = "") { const b = $("banner"); b.hidden = !html; b.className = "banner hv " + cls; b.innerHTML = html || ""; }
const needsId = () => !DEMO && (!window.CONFIG?.CLIENT_ID || /PASTE/i.test(CONFIG.CLIENT_ID));
async function status(errors = []) {
  if (needsId()) {   // the published copy has no config.js: the client ID is entered once per device and kept in this browser
    banner(`<span>Paste your Google OAuth client ID to connect Google Health (kept only in this browser, never sent anywhere but to Google).</span><input id="cidIn" placeholder="1234-abc.apps.googleusercontent.com" style="margin-left:auto;flex:1 1 220px;min-width:0;background:var(--raised);color:var(--tx);border:1px solid var(--line);border-radius:6px;padding:6px 10px"><button class="btn" id="cidSave">Save</button>`);
    $("cidSave").onclick = () => { const v = $("cidIn").value.trim(); if (/\.apps\.googleusercontent\.com$/.test(v)) { try { localStorage.setItem("clientId", v); } catch {} location.reload(); } else $("cidIn").style.borderColor = "var(--worse)"; };
    return;
  }
  if (DEMO) { $("device").textContent = "Google Fitbit Air (demo)"; $("synced").textContent = "Demo data, not yours"; $("signin").hidden = true; $("refresh").hidden = true; $("demoTag").hidden = false; banner(""); return; }
  const at = await getMeta("lastSyncedAt"), dev = await getMeta("device");
  if (dev) $("device").textContent = dev;
  const ago = at ? (Date.now() - at) / 60000 : null;
  $("synced").textContent = at ? `Synced ${ago < 1 ? "just now" : ago < 90 ? Math.round(ago) + " min ago" : (ago / 60).toFixed(1) + " h ago"}` : "Never synced";
  $("signin").hidden = true;   // the banner carries the Sign in button
  if (errors.length) banner(`<span>●</span><span>Some data failed to load: ${esc(errors.join("; "))}. Showing cached data.</span><button class="btn" style="margin-left:auto" id="bRetry">Retry</button>`, "err");
  else if (signedOut && !days.length) banner(`<i class="dot"></i><b>Connect Google Health</b><span class="sub">read-only</span><button class="btn go" id="bSign">Sign in</button>`, "signin");
  else if (signedOut) banner(`<i class="dot"></i><b>Signed out</b><span class="sub">showing saved data</span><button class="btn go" id="bSign">Sign in</button>`, "signin");
  else if (ago != null && ago > 180) banner(`<span>▲</span><span>Last synced ${(ago / 60).toFixed(1)} h ago. The band syncs when the Google Health app is opened on your phone.</span>`, "warn");
  else banner("");
  $("bSign") && ($("bSign").onclick = () => refresh(true)); $("bRetry") && ($("bRetry").onclick = () => refresh(false));
}

async function load() {
  let rows = [];
  if (DEMO) rows = demoDays();
  else if ((await getMeta("schema")) === SCHEMA) rows = (await allDays()).sort((a, b) => a.date.localeCompare(b.date));   // an older cache is ignored and reloaded on the next sync
  // drop anything an older version stored in a shape this one can't read
  days = rows.map(r => ({ ...r, workouts: (r.workouts || []).filter(w => Number.isFinite(w.start) && Number.isFinite(w.offset)), sleepStages: Array.isArray(r.sleepStages) ? r.sleepStages.filter(x => Array.isArray(x) && x.length >= 3) : r.sleepStages }));
  byDate = Object.fromEntries(days.map(d => [d.date, d])); today = ymd(new Date()); render();
}

async function refresh(interactive) {
  if (DEMO || busy || needsId()) return; busy = true; let errors = [];
  // Google opens its sign-in window even for a "quiet" request, and a phone shows that as a full-screen page that can loop. So a background refresh only runs
  // while the saved token is still valid; once it has expired, one tap on Sign in is needed.
  try { if (!interactive && !hasToken()) throw new Error("sign-in needed"); await getToken({ interactive }); signedOut = false; }
  catch (e) { signedOut = true; }
  if (!signedOut) { try { $("synced").textContent = "Syncing…"; const r = await sync(t => ($("synced").textContent = "Fetching " + t + "…")); errors = r.errors; } catch (e) { if (e.auth) signedOut = true; else { errors = ["sync: " + e.message]; console.error(e); } } }
  busy = false;
  try { await load(); } catch (e) { errors.push("page: " + e.message); console.error(e); }
  await status(errors);
}

$("signin").onclick = () => refresh(true);
$("refresh").onclick = () => refresh(true);   // a click may open the sign-in window, so it asks properly
$("prevN").onclick = () => { selNight = Math.max(0, selNight - 1); render(); };
$("nextN").onclick = () => { selNight++; render(); };
$("viewSeg").onclick = e => { const b = e.target.closest("button"); if (!b) return; view = b.dataset.v; [...$("viewSeg").children].forEach(x => x.classList.toggle("on", x === b)); render(); };

// "i" buttons: one popover, closed by clicking elsewhere or pressing Escape
const pop = document.createElement("div"); pop.className = "pop"; pop.hidden = true; document.body.appendChild(pop);
document.addEventListener("click", e => {
  const b = e.target.closest(".i");
  if (!b) { if (!e.target.closest(".pop")) pop.hidden = true; return; }
  if (!pop.hidden && pop.dataset.k === b.dataset.i && pop._b === b) { pop.hidden = true; return; }
  pop.innerHTML = INFO[b.dataset.i] || ""; pop.dataset.k = b.dataset.i; pop._b = b; pop.hidden = false;
  const r = b.getBoundingClientRect(); pop.style.top = r.bottom + scrollY + 6 + "px"; const pw = Math.min(360, innerWidth - 24); pop.style.left = Math.max(12, Math.min(innerWidth - pw - 12, r.right + scrollX - pw)) + "px";
});
document.addEventListener("click", e => {   // "Copy my signal values": a small text block to paste into chat when tuning the illness thresholds
  const b = e.target.closest("#copyIll"); if (!b) return;
  const sg = A.earlySigns(byDate, today, addDays), rows = [...Array(45)].map((_, i) => addDays(today, -(44 - i))).map(d => [d, ...["restingHr", "hrv", "breathing", "skinTemp"].map(k => byDate[d]?.[k] != null ? +byDate[d][k].toFixed(2) : "")].join(","));
  const text = `date,restingHr,hrv,breathing,skinTemp\n${rows.join("\n")}\n\ntoday: ${sg.status} (hidden score ${sg.composite == null ? "n/a" : sg.composite.toFixed(2)}); deviations ${sg.parts.map(p => p.name + " " + (p.z == null ? "n/a" : p.z.toFixed(2))).join(", ")}`;
  navigator.clipboard.writeText(text).then(() => { b.textContent = "Copied"; }, () => { b.textContent = "Copy failed"; });
});
document.addEventListener("keydown", e => { if (e.key === "Escape") pop.hidden = true; if ((e.key === "Enter" || e.key === " ") && e.target.classList?.contains("i")) { e.preventDefault(); e.target.click(); } });

// the look is always glass; light or dark follows the system
document.body.classList.add("theme-glass");
document.addEventListener("pointermove", e => { const c = e.target.closest?.(".card"); if (!c) return; const r = c.getBoundingClientRect(); c.style.setProperty("--mx", e.clientX - r.left + "px"); c.style.setProperty("--my", e.clientY - r.top + "px"); });

signedOut = !DEMO;
try { await load(); } catch (e) { failures.push("page: " + e.message); showFailures(); console.error(e); }
await status();
if (!DEMO) {
  const sync0 = async () => { if (!document.hidden && hasToken()) await refresh(false); };
  if (hasToken()) refresh(false);                             // a saved token is still valid: sync straight away
  setInterval(sync0, 10 * 60 * 1000);                          // later syncs only while the token is valid (it lasts about an hour)
  document.addEventListener("visibilitychange", async () => { if (document.hidden) return; const at = await getMeta("lastSyncedAt"); if (hasToken() && (!at || Date.now() - at > 5 * 60 * 1000)) await refresh(false); else status(); });
  setInterval(() => status(), 60 * 1000);
}

// ---- today's call and the weekly review ----
function renderToday(signs, rd, lb, sq, lastNight) {
  const dsc = A.dailyScore(byDate, today, addDays, x => get(x, "azm"));
  const st = lastNight ? A.nightStats(lastNight) : null;
  const t = A.trainingCall({ rd, signs, lastQuality: sq?.score ?? null, lastTst: st?.tst ?? null, ratio: lb?.ratio ?? null });
  $("todayCall").innerHTML = !t ? `<div class="basis" style="padding:var(--s2) 0">Not enough data yet</div>` :
    `<div class="num ${red("trainingCall", t.call)}" style="font-size:34px;font-weight:600;letter-spacing:-.02em;margin:2px 0 6px">${t.call}</div>` + t.reasons.map(r => `<div class="basis">${r}</div>`).join("") + `<div class="basis">Planned today: ${A.plannedFor(today)}</div>` + (dsc ? `<div class="basis" style="margin-top:var(--s3)">Daily score <span class="num ${red("dailyScore", dsc.score)}" style="font-size:16px;font-weight:600">${Math.round(dsc.score)}</span></div>` : "");
}
function renderReview() {
  const dayWin = (end, n) => [...Array(n)].map((_, i) => addDays(end, -(n - 1 - i)));
  const sleepNow = dayWin(today, 7), sleepPrev = dayWin(addDays(today, -7), 7), actNow = dayWin(today, 7), actPrev = dayWin(addDays(today, -7), 7);
  const q = ds => mean(ds.map(d => (byDate[d]?.sleepStages?.length ? A.sleepQuality(byDate[d], days)?.score : null)));
  const avgOf = (ds, k) => mean(ds.map(d => get(d, k)));
  const sumOf = (ds, k) => sum(ds.map(d => get(d, k)));
  const gym = ds => A.gymDaysInWindow(byDate, ds[ds.length - 1], 7, addDays);
  const km = ds => { const set = new Set(ds), r = allRuns().filter(x => set.has(x.date)); return ds.some(d => byDate[d]) ? r.reduce((s, x) => s + (x.distanceM || 0), 0) / 1000 : null; };
  const rows = [
    ["Sleep quality", q(sleepNow), q(sleepPrev), "", true, v => Math.round(v), "sleepQuality"],
    ["Sleep time", avgOf(sleepNow, "sleepMin"), avgOf(sleepPrev, "sleepMin"), "", true, hm, "sleepTime"],
    ["HRV", avgOf(sleepNow, "hrv"), avgOf(sleepPrev, "hrv"), " ms", true, v => Math.round(v)],
    ["Resting heart rate", avgOf(sleepNow, "restingHr"), avgOf(sleepPrev, "restingHr"), " bpm", false, v => v.toFixed(1)],
    ["Active zone minutes", sumOf(actNow, "azm"), sumOf(actPrev, "azm"), " min", true, v => Math.round(v)],
    ["Workouts", gym(actNow), gym(actPrev), "", true, v => `${v} ${v === 1 ? "day" : "days"}`],
    ["Run distance", km(actNow), km(actPrev), " km", true, km2]
  ].map(([name, now, prev, unit, hb, fmt, rule]) => { const pct = now != null && prev ? 100 * (now / prev - 1) : null; return { name, now, unit, hb, fmt, rule, pct }; });
  const scored = rows.filter(r => r.pct != null).map(r => ({ ...r, s: r.hb ? r.pct : -r.pct }));
  const best = scored.length ? scored.reduce((a, b) => (b.s > a.s ? b : a)) : null, worst = scored.length ? scored.reduce((a, b) => (b.s < a.s ? b : a)) : null;
  $("weeklyReview").innerHTML = (best ? `<div class="basis" style="margin-bottom:var(--s2)">Best: <span style="color:var(--tx)">${best.name}</span>${worst && worst.s < -5 ? ` · Watch: <span class="worse">${worst.name}</span>` : ""}</div>` : "") +
    rows.map(r => `<div class="row" style="grid-template-columns:1fr auto 78px;padding:4px 0"><span>${r.name}</span><span class="num ${r.rule && r.now != null ? red(r.rule, r.now) : ""}">${r.now == null ? "—" : r.fmt(r.now) + r.unit}</span><span class="num chg ${r.pct != null ? red("weekChange", r.pct, r.hb) : ""}"><span>${r.pct == null || Math.abs(r.pct) < 0.05 ? "" : r.pct >= 0 ? "▲" : "▼"}</span><span>${r.pct == null ? "—" : Math.abs(r.pct) < 0.05 ? "same" : n3(Math.abs(r.pct)) + "%"}</span></span></div>`).join("");
}

// ---- morning report: plain rules turn the numbers above into a few sentences (no AI, nothing leaves this page) ----
// What counts as new information for the Status report: last night's sleep, today's recovery numbers, and today's workouts.
function reportSig(lastNight) {
  const T = byDate[today] || {}, r1 = v => (v == null ? null : Math.round(v * 10) / 10);
  return { sleep: lastNight ? [lastNight.date, lastNight.sleepMin] : null, recovery: [r1(T.restingHr), r1(T.hrv), r1(T.breathing), r1(T.spo2), r1(T.skinTemp)], workouts: (T.workouts || []).map(w => w.start) };
}
function renderMorning({ signs, rd, lb, sq, lastNight, sf, sfPrev, bed }) {
  const st = lastNight ? A.nightStats(lastNight) : null;
  const call = A.trainingCall({ rd, signs, lastQuality: sq?.score ?? null, lastTst: st?.tst ?? null, ratio: lb?.ratio ?? null });
  const rep = buildReport({ byDate, days, today, addDays, signs, rd, lb, sq, lastNight, sf, sfPrev, bed, call, gymEntries: gymLogApi?.entries || [], wx: window.wxBrief || null, now: new Date() });
  // when did it last change, and why: stored so it survives a reload
  const sig = reportSig(lastNight); let state = null;
  try { state = JSON.parse(localStorage.getItem("report.state") || "null"); } catch {}
  if (!state || state.day !== today) state = { day: today, sig, at: Date.now(), why: "" };
  else if (JSON.stringify(state.sig) !== JSON.stringify(sig)) {
    const why = [];
    if (JSON.stringify(state.sig.sleep) !== JSON.stringify(sig.sleep)) why.push("new sleep data");
    if (JSON.stringify(state.sig.recovery) !== JSON.stringify(sig.recovery)) why.push("new recovery numbers");
    if (JSON.stringify(state.sig.workouts) !== JSON.stringify(sig.workouts)) why.push("a new workout");
    state = { day: today, sig, at: Date.now(), why: why.join(" and ") };
  }
  if (!DEMO) try { localStorage.setItem("report.state", JSON.stringify(state)); } catch {}
  $("morningDate").textContent = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }) + ` · updated ${new Date(state.at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}${state.why ? " for " + state.why : ""}`;
  $("morning").innerHTML = rep.paras.map(p => `<p class="mpara">${p}</p>`).join("");
}
const last2 = k => { for (let i = 0; i < 4; i++) { const v = byDate[addDays(today, -i)]?.[k]; if (v != null) return v; } return null; };

// tabs: Health (everything above) and Productivity (focus timer). The timer keeps running while Health is shown.
{
  const TABS = ["health", "prod", "gym", "cal", "console"], setTab = k => { document.body.dataset.tab = k; dispatchEvent(new CustomEvent("tab", { detail: k })); document.querySelectorAll("#tabs button").forEach(b => b.classList.toggle("on", b.dataset.t === k)); try { localStorage.setItem("tab", k); } catch {} };
  $("tabs").addEventListener("click", e => { const b = e.target.closest("button"); if (b) setTab(b.dataset.t); });
  let k = "health"; try { k = localStorage.getItem("tab") || k; } catch {}
  setTab(TABS.includes(k) ? k : "health");
  const timerApi = initTimer($("timerRoot")), calApi = initCalendar($("calRoot"), { demo: DEMO }), tasksApi = initTasks($("tasksRoot"));
  gymLogApi = initGymLog($("glogRoot"), { demo: DEMO });
  initTerminal($("consoleRoot"), { demo: DEMO, api: { timer: timerApi, cal: calApi, tasks: tasksApi, gym: () => gymLogApi, health: () => ({ days, byDate, today, A, addDays, bad }) } });
  // the command line from anywhere: Cmd/Ctrl+K opens it and, pressed again, returns to the page you were on; Esc on an empty line does the same
  let prevTab = "health";
  addEventListener("goto", e => { if (document.body.dataset.tab !== "console") prevTab = document.body.dataset.tab; setTab(e.detail); });
  addEventListener("leaveconsole", () => { if (document.body.dataset.tab === "console") setTab(prevTab); });
  addEventListener("keydown", e => {
    const cur = document.body.dataset.tab;
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); if (cur === "console") setTab(prevTab); else { prevTab = cur; setTab("console"); } }
    
  });
  // phone: swipe left or right to cycle through the pages (the bottom bar is replaced by a row of dots showing where you are)
  {
    const phone = matchMedia("(max-width:700px), (pointer:coarse) and (hover:none) and (max-width:1100px)"), dots = document.createElement("div");
    dots.id = "pageDots"; dots.setAttribute("aria-hidden", "true"); dots.innerHTML = TABS.map(t => `<i data-t="${t}"></i>`).join(""); document.body.appendChild(dots);
    const mark = () => dots.querySelectorAll("i").forEach(i => i.classList.toggle("on", i.dataset.t === document.body.dataset.tab)); addEventListener("tab", mark); mark();
    const SKIP = "input,textarea,select,[contenteditable],.cal-ev,.gl-wheel,.cal-sheet,.cdev,.ag-path,.tm-plot,.tm-view";   // things that use horizontal touches themselves
    const hScroll = el => { for (; el && el !== document.body; el = el.parentElement) { const o = getComputedStyle(el).overflowX; if ((o === "auto" || o === "scroll") && el.scrollWidth > el.clientWidth + 2) return true; } return false; };
    let sx = 0, sy = 0, st = 0, ok = false;
    addEventListener("touchstart", e => { const t = e.touches[0]; ok = phone.matches && e.touches.length === 1 && t.clientX > 24 && t.clientX < innerWidth - 24 && !e.target.closest(SKIP) && !hScroll(e.target); sx = t.clientX; sy = t.clientY; st = Date.now(); }, { passive: true });
    addEventListener("touchcancel", () => { ok = false; }, { passive: true });
    addEventListener("touchend", e => {
      if (!ok) return; ok = false; const t = e.changedTouches[0], dx = t.clientX - sx, dy = t.clientY - sy;
      if (Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 1.8 || Date.now() - st > 800) return;
      const dir = dx < 0 ? 1 : -1, next = TABS[(TABS.indexOf(document.body.dataset.tab) + dir + TABS.length) % TABS.length];
      document.body.dataset.swipe = dir > 0 ? "l" : "r"; setTimeout(() => { delete document.body.dataset.swipe; }, 450);
      dispatchEvent(new CustomEvent("goto", { detail: next })); scrollTo(0, 0);
    }, { passive: true });
  }
  renderWeightEntry();
  initSky({ demo: DEMO });
  initWeather($("weatherRoot"));
}

// What the Console is told with each question: a compact picture of the last two weeks, tonight's plan and the calendar. Type /context in the console to read it.
window.__dashContext = () => {
  const hm = min => (min == null ? null : `${Math.floor(min / 60)}h ${String(Math.round(min % 60)).padStart(2, "0")}m`), r1 = v => (v == null ? null : Math.round(v * 10) / 10), clock = m => `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(Math.round(m % 60) % 60).padStart(2, "0")}`;
  const nightsD = days.filter(d => d.sleepStages?.length), ln = nightsD[nightsD.length - 1], st = ln ? A.nightStats(ln) : null, sq = ln ? A.sleepQuality(ln, days) : null;
  const endD = [today, addDays(today, -1)].find(d => byDate[d]?.sleepMin != null) || addDays(today, -1), sf = A.shortfall7(byDate, endD, addDays), rd = A.readiness(byDate, today, addDays), signs = A.earlySigns(byDate, today, addDays);
  const lastDays = [...Array(14)].map((_, i) => addDays(today, -13 + i)).map(d => { const r = byDate[d] || {}; return { date: d, plan: A.plannedFor(d), sleep: hm(r.sleepMin), restingHr: r.restingHr ?? null, hrvMs: r.hrv != null ? Math.round(r.hrv) : null, activeZoneMin: r.azm ?? null, workouts: (r.workouts || []).map(w => w.type).join(", ") || null }; });
  const gym = (gymLogApi?.entries || []).filter(e => e.date >= addDays(today, -14)).reduce((o, e) => { (o[e.date] ||= {})[e.exercise] = `${e.weight} lb x ${e.reps} x ${e.sets}`; return o; }, {});
  const now = new Date();
  return {
    now: now.toLocaleString("en-US", { weekday: "long", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }),
    targets: { wake: "06:30", idealSleep: "8h 10m", sleepNeed: "7h 40m", weeklyPlan: "Mon legs, Tue push, Wed run, Thu pull, Fri legs, Sat push, Sun pull" },
    plan: { today: A.plannedFor(today), tomorrow: A.plannedFor(addDays(today, 1)) },
    lastNight: st ? { sleep: hm(st.tst), asleepBy: clock(st.onsetMin), wokeAt: clock(st.wakeMin), minutesAwake: Math.round(st.waso), quality: sq ? Math.round(sq.score) : null } : null,
    sleepDebt: sf.nights >= 3 ? hm(sf.hours * 60) : null,
    recovery: { readinessZ: rd.z != null ? r1(rd.z) : null, restingHrToday: r1(byDate[today]?.restingHr), hrvToday: byDate[today]?.hrv != null ? Math.round(byDate[today].hrv) : null, bodyCheck: signs.status },
    weather: window.wxBrief || null,
    last14Days: lastDays,
    gymLog14Days: gym,
    calendarNext7Days: (window.__calEvents ? window.__calEvents() : []).slice(0, 60)
  };
};
