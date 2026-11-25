// The phone layout (lite.html): Today · Health · Plan · Gym · Notes, plus Connections behind the gear.
// Same cache, formulas (analytics.js), "bad" rules (standards.js) and storage keys as the full dashboard. Each number lives in one place:
// Today holds what you act on today (the call, readiness, bedtime, what's next); Health holds the detail; nothing repeats.
// Sync: everything goes through the same GitHub repos and calendar bridge as the web version, so both see the same data.
import { getToken, hasToken } from "./auth.js";
import { healthPull, healthPush } from "./cloud.js";
import { sync, allDays, getMeta, SCHEMA, loadSleepHr } from "./sync.js";
import { mean, sum, sd, ymd, addDays, hm, pad, dayLabel, esc, n3 } from "./util.js";
import * as A from "./analytics.js";
import { bad, red } from "./standards.js";
import { INFO } from "./info.js";
import { demoDays, demoSleepHr } from "./demo.js";
import { dm } from "./dotfont.js";
import { sleepMonth, earlyOrb, nightFlow, drawLanes } from "./widgets.js";
import { drawNight } from "./sleepchart.js";
import { line, vital } from "./charts.js";
import { gh } from "./ghstore.js";
import { initLiteGym } from "./litegym.js";
import { initNotes } from "./litenotes.js";
import { initPlan, agenda, evRow } from "./liteplan.js";
import { initTempo } from "./litetempo.js";
import { initSettings } from "./litesettings.js";
import { isNative, hcStatus, hcConnect, hcInstall, hcSync, hcNightHr, hcOrigins, origins } from "./hc.js";

const DEMO = location.port === "8082" || new URLSearchParams(location.search).has("demo");
if (DEMO) A.gymTracking.start = "2000-01-01";
const $ = id => document.getElementById(id);
let days = [], byDate = {}, today = ymd(new Date()), nightIdx = -1, busy = false, signedOut = !DEMO, busyText = "", hsub = "sleep", hc = null, M = null;

// ---- data access (same conventions as main.js) ----
const get = (d, k) => { const r = byDate[d]; if (!r) return null; if (k === "azm") return r.azm ?? (r.restingHr != null || r.hrv != null || r.sleepMin != null ? 0 : null); return r[k] ?? null; };
const series = (k, n, end = today) => [...Array(n)].map((_, i) => { const d = addDays(end, -(n - 1 - i)); return { d, v: get(d, k) }; });
const win = (k, n, back = 0) => series(k, n, addDays(today, -back)).map(x => x.v);
const clock = m => { const r = Math.round(((m % 1440) + 1440) % 1440) % 1440; return `${pad(Math.floor(r / 60))}:${pad(r % 60)}`; };
const monday = d => { const x = new Date(d + "T12:00:00"); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return ymd(x); };
const try_ = (fn, dflt = null) => { try { return fn(); } catch (e) { console.error(e); return dflt; } };
const ib = k => (k && INFO[k] ? `<button class="i" type="button" data-i="${k}" aria-label="More information">i</button>` : "");
const hhmm = at => new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
const sigma = z => (z >= 0 ? "+" : "−") + n3(Math.abs(z));
const row = (k, v, unit, { key = "", isBad = false, note = "", sub = "" } = {}) => `<div class="row"><span class="k">${k}${ib(key)}${sub ? `<small>${sub}</small>` : ""}</span><span class="v"><span class="num ${v == null ? "gap" : isBad ? "bad" : ""}">${v ?? "—"}</span><span class="u">${v == null ? "" : unit}</span>${note ? `<span class="note">${note}</span>` : ""}</span></div>`;

function model() {
  const m = {};
  m.nights = days.filter(d => d.sleepStages?.length);
  m.last = m.nights[m.nights.length - 1] || null;
  const endD = [today, addDays(today, -1)].find(d => byDate[d]?.sleepMin != null) || addDays(today, -1);
  m.sf = try_(() => A.shortfall7(byDate, endD, addDays), { hours: 0, nights: 0 });
  m.rd = try_(() => A.readiness(byDate, today, addDays), { z: null });
  m.lb = try_(() => A.banister(d => A.dayLoad(get(d, "azm"), A.gymLog.sets[d] || 0), today, addDays));
  m.bed = try_(() => A.bedtimePlan(m.sf.hours, days, m.lb?.ratio ?? null));
  m.sq = m.last ? try_(() => A.sleepQuality(m.last, days)) : null;
  m.st = m.last ? try_(() => A.nightStats(m.last)) : null;
  m.signs = try_(() => A.earlySigns(byDate, today, addDays), { composite: null, status: "Insufficient data" });
  m.call = try_(() => A.trainingCall({ rd: m.rd, signs: m.signs, lastQuality: m.sq?.score ?? null, lastTst: m.st?.tst ?? null, ratio: m.lb?.ratio ?? null }));
  return m;
}

// =============================== Today: only what you act on today ===============================
function renderToday() {
  const m = M, el = pane("today"), now = new Date(); if (!m) return;
  const c = m.call, rz = m.rd?.z, mon = monday(today), wk = [...Array(7)].map((_, i) => addDays(mon, i)), done = wk.filter(d => A.gymLog.days.has(d)).length;
  const sick = m.signs.composite != null && bad("illnessScore", m.signs.composite);
  // next up: what is left today, or tomorrow's first events once today is over
  let next = [], nextLbl = "Next up";
  if (agenda.events) { const td = agenda.on(today); next = td.filter(e => !e.allDay && e.e > now).concat(td.filter(e => e.allDay)).slice(0, 3); if (!next.length) { next = agenda.on(addDays(today, 1)).slice(0, 2); nextLbl = "Tomorrow"; } }
  el.innerHTML = `
  <div class="card hero">
    <div class="kick">Today's call ${ib("today")}</div>
    <div class="call ${c ? red("trainingCall", c.call) : "gap"}">${dm(c ? c.call.toUpperCase() : "—")}</div>
    <div class="why">${c ? c.reasons.map(esc).join(" · ") : "Not enough data yet"}</div>
    <div class="meta"><span class="tag">Planned: ${esc(A.plannedFor(today))}</span>${m.last && m.last.date < addDays(today, -1) ? `<span class="tag">Data from ${dayLabel(m.last.date)}</span>` : ""}</div>
  </div>
  ${sick ? `<button class="card tap alert" type="button" data-to="health:body"><span class="kick">Body check</span><b>${esc(m.signs.status)}</b></button>` : ""}
  <div class="duo">
    <div class="card stat"><div class="lb"><span>Readiness</span>${ib("readiness")}</div><div class="big ${rz == null ? "gap" : bad("readinessZ", rz) ? "bad" : ""}">${dm(rz == null ? "—" : sigma(rz))}${rz == null ? "" : "<small>σ</small>"}</div></div>
    <div class="card stat"><div class="lb"><span>Bed by</span>${ib("bedtime")}</div><div class="big">${dm(m.bed ? clock(m.bed.minutes) : "—")}</div>${m.bed && (m.bed.extra || m.bed.loadExtra) ? `<div class="sub">+${m.bed.extra + m.bed.loadExtra} min catch-up</div>` : ""}</div>
  </div>
  ${agenda.events && next.length ? `<button class="card tap" type="button" data-to="plan"><div class="kick">${nextLbl}<span class="go">Plan ›</span></div><div style="margin-top:6px">${next.map(e => evRow(e, now)).join("")}</div></button>` : ""}
  <div class="card" id="wx"></div>
  <button class="card tap" type="button" data-to="gym"><div class="kick">Gym this week<span class="go"><span class="num" style="color:var(--tx);font-size:13px">${done}</span> of 6 ›</span></div>
    <div class="week">${wk.map((d, i) => `<div class="${A.gymLog.days.has(d) ? "on" : ""} ${d > today ? "fut" : ""} ${d === today ? "now" : ""}"><i></i><span>${"MTWTFSS"[i]}</span></div>`).join("")}</div></button>`;
  drawWeather();
}

const WMO = c => c === 0 ? "Clear" : c <= 2 ? "Partly cloudy" : c === 3 ? "Overcast" : c === 45 || c === 48 ? "Fog" : c <= 57 ? "Drizzle" : c <= 67 ? "Rain" : c <= 77 ? "Snow" : c <= 82 ? "Showers" : c <= 86 ? "Snow showers" : "Thunderstorm";
const jget = k => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
// tiny line icons for the forecast strip (currentColor, so the theme colours them)
const WXI = c => { const sun = `<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4"/>`, cloud = `<path d="M7 18h10a4 4 0 0 0 0-8 5.5 5.5 0 0 0-10.6 1.5A3.3 3.3 0 0 0 7 18z"/>`;
  const g = c === 0 || c === 1 ? sun : c === 2 ? `<circle cx="8" cy="8" r="3"/><path d="M8 2.5v1M2.5 8h1M4.2 4.2l.7.7"/><path d="M9 19h8a3.5 3.5 0 0 0 0-7 4.6 4.6 0 0 0-8.7 1.3A2.9 2.9 0 0 0 9 19z"/>` : c === 3 || c === 45 || c === 48 ? cloud
    : c >= 71 && c <= 77 || c === 85 || c === 86 ? cloud.replace("18h", "14h").replace("0 0 7 18z", "0 0 7 14z") + `<path d="M8 18v.01M12 20v.01M16 18v.01"/>` : c >= 95 ? cloud.replace("18h", "14h").replace("0 0 7 18z", "0 0 7 14z") + `<path d="m12 15-2 4h4l-2 4"/>` : cloud.replace("18h", "14h").replace("0 0 7 18z", "0 0 7 14z") + `<path d="M8 17l-1 3M12 17l-1 3M16 17l-1 3"/>`;
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${g}</svg>`; };
async function drawWeather() {
  const el = $("wx"); if (!el) return;
  const city = DEMO ? { name: "Demo city", lat: 0, lon: 0 } : jget("weather.city"), F = (jget("weather.unit") || "C") === "F";
  if (!city || city.lat == null) { el.outerHTML = `<button class="row card tap" type="button" data-connect="weather" id="wx"><span class="k"><b>Add a weather city</b></span><span class="chev">›</span></button>`; return; }
  let w = jget("lite.wx");
  const paintW = () => { const d = w.d, T = c => (c == null ? "—" : Math.round(F ? c * 9 / 5 + 32 : c) + "°"), W = k => (F ? Math.round(k * .621) + " mph" : Math.round(k) + " km/h");
    if (!$("wx")) return; $("wx").innerHTML = `<div class="wx"><div class="t">${dm(T(d.now))}</div><div class="d"><b>${esc(city.name)}</b>${WMO(d.code)} · <span class="num">${T(d.hi)} / ${T(d.lo)}</span></div>
      <div class="m"><span>Rain</span><span class="num">${d.rain ?? "—"}%</span><span>UV</span><span class="num ${red("uv", d.uv)}">${d.uv == null ? "—" : Math.round(d.uv)}</span><span>Wind</span><span class="num ${red("wind", d.wind)}">${d.wind == null ? "—" : W(d.wind)}</span>${bad("heat", d.feel) ? `<span>Feels</span><span class="num bad">${T(d.feel)}</span>` : ""}</div></div>
      ${w.days?.length ? `<div class="fc">${w.days.map(x => `<div title="${WMO(x.code)}"><span>${new Date(x.date + "T12:00:00").toLocaleDateString("en-US", { weekday: "short" })}</span>${WXI(x.code)}<b class="num">${T(x.hi)}</b><i class="num">${T(x.lo)}</i><small class="num">${x.rain ?? 0}%</small></div>`).join("")}</div>` : ""}`; };
  if (DEMO) w = { d: { now: 9.4, hi: 12.8, lo: 4.1, feel: 11.2, rain: 60, uv: 2.1, wind: 18, code: 61 }, days: [[1, 14, 6, 10, 2], [2, 16, 7, 0, 0], [3, 13, 8, 70, 63], [4, 11, 5, 90, 95], [5, 12, 4, 20, 3], [6, 15, 6, 0, 1]].map(([k, hi, lo, rain, code]) => ({ date: addDays(today || ymd(new Date()), k), hi, lo, rain, code })) };
  if (w && (DEMO || w.name === city.name)) paintW(); else el.innerHTML = `<div class="empty">Weather…</div>`;
  if (DEMO || (w && w.name === city.name && w.days && Date.now() - w.at < 30 * 60e3)) return;
  try {
    const u = `https://api.open-meteo.com/v1/forecast?latitude=${city.lat}&longitude=${city.lon}&current=temperature_2m,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min,apparent_temperature_max,precipitation_probability_max,uv_index_max,wind_speed_10m_max&timezone=auto&forecast_days=7`;
    const j = await (await fetch(u)).json(), D = k => j.daily[k][0];
    w = { at: Date.now(), name: city.name, d: { now: j.current.temperature_2m, code: j.current.weather_code, hi: D("temperature_2m_max"), lo: D("temperature_2m_min"), feel: D("apparent_temperature_max"), rain: D("precipitation_probability_max"), uv: D("uv_index_max"), wind: D("wind_speed_10m_max") },
      days: j.daily.time.slice(1).map((date, i) => ({ date, code: j.daily.weather_code[i + 1], hi: j.daily.temperature_2m_max[i + 1], lo: j.daily.temperature_2m_min[i + 1], rain: j.daily.precipitation_probability_max[i + 1] })) };
    localStorage.setItem("lite.wx", JSON.stringify(w)); paintW();
  } catch { if (!w && $("wx")) $("wx").innerHTML = `<div class="empty">Weather unavailable offline.</div>`; }
}

// =============================== Health: Sleep | Body ===============================
function renderHealth() {
  const el = pane("health"); if (!M) return;
  el.innerHTML = `<div class="stickw"><div class="seg" id="hSeg"><button type="button" data-h="sleep" class="${hsub === "sleep" ? "on" : ""}">Sleep</button><button type="button" data-h="body" class="${hsub === "body" ? "on" : ""}">Body</button></div></div><div id="hBody"></div>`;
  (hsub === "body" ? renderBody : renderSleep)($("hBody"));
}
let hrToken = 0;
async function nightHr(n) {
  if (DEMO) return demoSleepHr(n);
  const cached = await getMeta("hr:" + n.date); if (cached) return cached;
  if (isNative) return hcNightHr(n);
  if (hasToken()) return loadSleepHr(n);
  return null;
}
async function drawSleepChart(n) {
  const my = ++hrToken; let hr = null; try { hr = await nightHr(n); } catch (e) { console.warn("night heart rate", e); }
  const el = $("hyp"); if (my !== hrToken || !el) return;
  if (hr?.length) { $("sleepStats").innerHTML = ""; drawLanes(el, $("tip"), nightFlow(n, hr), { W: 500, dots: false, mL: 54 }); $("sleepInfo").dataset.i = "nightFlow"; }
  else { drawNight(n, { restKnown: false, W: 520 }); $("sleepInfo").dataset.i = "stages"; }
}
function renderSleep(el) {
  const m = M, N = m.nights; if (nightIdx < 0 || nightIdx >= N.length) nightIdx = N.length - 1;
  const n = N[nightIdx]; if (!n) { el.innerHTML = `<div class="card"><div class="empty">No sleep data yet.</div></div>`; return; }
  const s = try_(() => A.nightStats(n)), q = try_(() => A.sleepQuality(n, days)), avg = mean(win("sleepMin", 14)), last = nightIdx === N.length - 1;
  const debtV = m.sf.nights < 3 ? null : m.sf.hours < 0.1 ? "None" : hm(m.sf.hours * 60);
  el.innerHTML = `
  <div class="card night">
    <div class="nnav"><button type="button" id="nPrev" ${nightIdx <= 0 ? "disabled" : ""} aria-label="Earlier night">‹</button><span class="lbl">${n.date === today ? "Last night" : dayLabel(n.date)}<small>${s ? `${clock(s.onsetMin)} → ${clock(s.wakeMin)}` : ""}</small></span><button type="button" id="nNext" ${last ? "disabled" : ""} aria-label="Later night">›</button></div>
    <div class="big ${s && bad("sleepTime", s.tst) ? "bad" : ""}">${dm(s ? hm(s.tst) : "—")}</div>
    <div class="chartbox"><div id="hyp"></div><div id="tip"></div></div><div id="sleepStats"></div>
    <div style="text-align:right;margin-top:4px"><button class="i" type="button" id="sleepInfo" data-i="nightFlow" aria-label="About this chart">i</button></div>
  </div>
  <div class="list">
    ${row("Quality", q ? Math.round(q.score) : null, "/100", { key: "sleepQuality", isBad: q ? bad("sleepQuality", q.score) : false })}
    ${row("Efficiency", s ? Math.round(s.se) : null, "%")}
    ${row("Sleep debt", debtV, "", { sub: debtV && debtV !== "None" ? "behind your need" : "", key: "debt", isBad: bad("sleepDebtHours", m.sf.hours) })}
    ${row("14-night average", avg == null ? null : hm(avg), "", { isBad: bad("sleepTime", avg) })}
  </div>
  <div class="kick sec">Sleep Month ${ib("sleepMonth")}</div>
  <div class="card"><div id="sleepMonth"></div></div>`;
  drawSleepChart(n);
  try { sleepMonth($("sleepMonth"), byDate, days, today); } catch (e) { console.error(e); }
  $("nPrev").onclick = () => { nightIdx--; renderSleep(el); };
  $("nNext").onclick = () => { nightIdx++; renderSleep(el); };
}
function vitalRow(k, name, unit, dec) {   // the original vital row: latest value against its own usual range (30 days before it, mean ± 1 sd)
  const l = [...series(k, 14)].reverse().find(x => x.v != null); if (!l) return vital(name, null, unit, null, dec);
  const base = series(k, 31, addDays(l.d, -1)).map(x => x.v), mu = mean(base), s = sd(base);
  return vital(name, l.v, unit, s == null ? null : [mu - s, mu + s], dec, l.d === today ? "" : ` · from ${dayLabel(l.d)}`);
}
function renderBody(el) {
  const m = M, a7 = sum(win("azm", 7)), gymLast = try_(() => A.gymDaysInWeek(byDate, monday(addDays(today, -7)), addDays));
  const hrv7 = mean(win("hrv", 7)), hrv30 = win("hrv", 30, 7), hs = sd(hrv30), hmu = mean(hrv30), hrvOut = hs != null && hrv7 != null && Math.abs(hrv7 - hmu) > hs;
  const vo2 = [...series("vo2max", 30)].reverse().find(x => x.v != null), vo2Old = get(addDays(vo2?.d || today, -30), "vo2max"), vo2Chg = vo2 && vo2Old ? 100 * (vo2.v / vo2Old - 1) : null;
  el.innerHTML = `
  <div class="card"><div class="kick">Body check ${ib("early")}</div><div id="orb"></div></div>
  <div class="kick sec">Vitals ${ib("vitals")}</div>
  <div class="list vitals">${vitalRow("restingHr", "Resting HR", "bpm", 0)}${vitalRow("hrv", "HRV", "ms", 0)}${vitalRow("breathing", "Breathing", "br/min", 1)}${vitalRow("spo2", "SpO2", "%", 1)}${vitalRow("skinTempDelta", "Skin temp Δ", "°C", 2)}</div>
  <div class="card"><div class="kick">Resting heart rate · 90 days</div><div class="lchart" id="lrhr" style="margin-top:8px"></div></div>
  <div class="kick sec">Training load</div>
  <div class="list">
    ${row("Load balance", m.lb ? "×" + m.lb.ratio.toFixed(2) : null, "", { key: "load", isBad: m.lb ? bad("loadRatio", m.lb.ratio) : false, note: m.lb ? `fatigue ${Math.round(m.lb.fatigue)} · fitness ${Math.round(m.lb.fitness)}` : "needs 28 days" })}
    ${row("Active zone minutes", a7 == null ? null : Math.round(a7), "min", { sub: "last 7 days", isBad: bad("azmWeek", a7) })}
    ${row("Gym", gymLast ?? null, "/6", { sub: "days last week", key: "gymDays", isBad: bad("workouts", gymLast) })}
    ${row("HRV", hrv7 == null ? null : Math.round(hrv7), "ms", { sub: "7-day average", key: "hrvStatus", isBad: hrvOut })}
    ${row("Cardio fitness", vo2 ? vo2.v.toFixed(1) : null, "", { sub: "VO2 max", key: "vo2", note: vo2Chg == null ? "" : `<span class="${red("vo2Change", vo2Chg)}">${vo2Chg >= 0 ? "▲" : "▼"} ${n3(Math.abs(vo2Chg))}% in 30 days</span>` })}
  </div>`;
  try { earlyOrb($("orb"), m.signs, try_(() => A.earlySigns(byDate, addDays(today, -1), addDays))); } catch (e) { console.error(e); }
  try { line($("lrhr"), series("restingHr", 90), { h: 78 }); } catch (e) { console.error(e); }
}

// =============================== frame: tabs, sync pill, connections ===============================
const TABS = ["today", "health", "plan", "gym", "notes"], NAMES = { today: "TODAY", health: "HEALTH", plan: "PLAN", gym: "GYM", notes: "NOTES" };
let cur = "today";
const trail = [];
const pane = k => document.querySelector(`.pane[data-p="${k}"]`);
function show(k, { push = true } = {}) {
  if (!TABS.includes(k)) return; if (push && k !== cur) trail.push(cur);
  cur = k; TABS.forEach(t => (pane(t).hidden = t !== k)); [...$("tabs").children].forEach(b => b.classList.toggle("on", b.dataset.p === k));
  $("title").innerHTML = dm(NAMES[k]); pop.hidden = true; try { localStorage.setItem("lite.tab", k); } catch {}
  paint(k); scrollTo(0, 0);
  if (k === "gym") gym.shown();   // the weight ruler can only be positioned once its tab is visible
}
function paint(k = cur) {
  try { if (k === "today") renderToday(); else if (k === "health") renderHealth(); else if (k === "plan") plan.paint(); }
  catch (e) { console.error(k, e); }
}
$("tabs").onclick = e => { const b = e.target.closest("button"); if (!b) return; if (b.dataset.p === cur) { scrollTo({ top: 0, behavior: "smooth" }); if (cur === "notes") notes.back(); } else show(b.dataset.p); };
const pop = $("pop");
document.addEventListener("click", e => {
  const b = e.target.closest(".i");   // "i" popovers first, so they never also trigger the card they sit on
  if (b) { e.stopPropagation(); e.preventDefault(); if (!pop.hidden && pop.dataset.k === b.dataset.i) { pop.hidden = true; return; } pop.innerHTML = INFO[b.dataset.i] || ""; pop.dataset.k = b.dataset.i; pop.hidden = false; pop.scrollTop = 0; return; }
  if (!e.target.closest(".pop")) pop.hidden = true;
}, true);
document.addEventListener("click", e => {
  const to = e.target.closest("[data-to]"), cn = e.target.closest("[data-connect]"), h = e.target.closest("[data-h]");
  if (to) { const [t, sub] = to.dataset.to.split(":"); if (sub) hsub = sub; if (t === cur) paint(); else show(t); }
  else if (cn) settings.open(cn.dataset.connect);
  else if (h) { hsub = h.dataset.h; renderHealth(); }
});
addEventListener("connections", e => settings.open(e.detail || "main"));
addEventListener("goto", e => settings.open(e.detail === "notes" ? "notes" : "github"));   // the red sync bar's "Fix it"
$("gear").onclick = () => settings.open("main");
$("sheet").addEventListener("click", e => { if (e.target.closest("[data-close]")) settings.close(); });
let tt = 0; const toast = msg => { const t = $("toast"); t.textContent = msg; t.hidden = false; clearTimeout(tt); tt = setTimeout(() => (t.hidden = true), 2200); };

// ---- health source: Health Connect in the app, the Google Health API on the web ----
const health = {
  state() {
    if (DEMO) return { text: "Demo data", ok: true };
    if (isNative) return !hc ? { text: "Checking…", ok: null } : !hc.available ? { text: "Not installed", ok: false } : !hc.all ? { text: "Needs permission", ok: false } : { text: "Reading automatically", ok: true };
    return { text: gh.on ? "From the phone, via GitHub" : "Connect GitHub first", ok: gh.on ? true : null };
  },
  html() {
    if (isNative) return `<p class="lead">The band's data is read from Health Connect whenever the app opens, then shared with the web through GitHub. Only data written by ${esc(origins().join(", "))} is used.</p>
      ${!hc?.available ? `<button class="btn" type="button" data-hc="install">Get Health Connect</button>` : !hc.all ? `<button class="btn" type="button" data-hc="connect">Allow access</button>` :
        `<div class="btns"><button class="btn ghost" type="button" data-hc="sources">Check sources</button><button class="btn" type="button" data-hc="read">Read now</button></div>`}<div class="msg" id="hcMsg"></div>`;
    return `<p class="lead">On the web, health data comes from the phone app through GitHub. Nothing to tap here.</p>
      <details class="adv"><summary>Advanced: Google Health fallback</summary><p class="lead">Only for when Health Connect on the phone is not working. Google's numbers are calculated a little differently, and a Google sync can replace days the phone filled in.${window.CONFIG?.CLIENT_ID ? "" : " Set up the Google client ID in the full dashboard first."}</p>
      ${window.CONFIG?.CLIENT_ID ? `<button class="btn ghost" type="button" data-hc="signin">${signedOut ? "Sign in with Google" : "Sync from Google now"}</button>` : ""}</details>`;
  },
  async act(a) {
    if (a === "install") return hcInstall();
    if (a === "connect") { try { await hcConnect(); } catch (e) { console.error(e); } return hcRefresh(true); }
    if (a === "read") { settings.close(); return hcRefresh(true); }
    if (a === "signin") { settings.close(); return refreshWeb(true); }
    if (a === "sources") { const m = document.getElementById("hcMsg"); m.textContent = "Reading…"; try { const o = await hcOrigins(), use = origins(); m.innerHTML = Object.keys(o).length ? Object.entries(o).map(([p, n]) => `${use.includes(p) ? "● " : "○ "}${esc(p)} · ${n}`).join("<br>") + "<br>● = used" : "No apps have written data in the last 30 days."; } catch (e) { m.textContent = e.message || String(e); } }
  },
};

// ---- the sync pill: one honest status for everything ----
async function pill() {
  const b = $("sync"), t = $("syncTxt"); b.className = "sync";
  if (DEMO) { t.textContent = "Demo"; return; }
  if (busy) { b.classList.add("busy"); t.textContent = busyText || "Syncing"; return; }
  const needHealth = isNative && hc && (!hc.available || !hc.all);
  if (needHealth || !gh.on) { b.classList.add("go"); t.textContent = "Connect"; return; }
  const at = await getMeta("lastSyncedAt"); t.textContent = at ? hhmm(at) : "Sync";
  if (settings.status.gh === false) b.classList.add("err"); else if (at && Date.now() - at < 36 * 36e5) b.classList.add("ok");
}
$("sync").onclick = () => {
  if (DEMO || busy) return;
  if ($("sync").classList.contains("go")) return settings.open(isNative && hc && (!hc.available || !hc.all) ? "health" : "github");
  fullSync(true);
};

// ---- loading and syncing ----
async function load() {
  let rows = [];
  if (!DEMO) { try { await healthPull(); } catch (e) { console.warn("health pull", e); } }   // the other device may have newer health data
  if (DEMO) rows = demoDays();
  else if ((await getMeta("schema")) === SCHEMA) rows = (await allDays()).sort((a, b) => a.date.localeCompare(b.date));
  days = rows.map(r => ({ ...r, workouts: (r.workouts || []).filter(w => Number.isFinite(w.start) && Number.isFinite(w.offset)), sleepStages: Array.isArray(r.sleepStages) ? r.sleepStages.filter(x => Array.isArray(x) && x.length >= 3) : r.sleepStages }));
  byDate = Object.fromEntries(days.map(d => [d.date, d])); today = ymd(new Date()); M = model();
  if (cur === "today" || cur === "health") paint();
}
async function hcRefresh(force = false) {
  if (busy) return;
  try { hc = await hcStatus(); } catch (e) { console.error(e); hc = { available: false }; }
  if (!hc.available || !hc.all) return pill();
  const at = await getMeta("lastSyncedAt"); if (!force && at && Date.now() - at < 5 * 60e3 && (await getMeta("device")) === "Health Connect") return pill();
  busy = true; busyText = "Reading"; pill(); let r = null;
  try { r = await hcSync(t => { busyText = t.split(" ")[0]; pill(); }); } catch (e) { console.error(e); toast("Health Connect read failed"); }
  busy = false; try { await load(); } catch (e) { console.error(e); } pill();
  if (r?.errors.length) console.warn("Health Connect", r.errors);
}
async function refreshWeb(interactive) {
  if (DEMO || busy || !window.CONFIG?.CLIENT_ID) return load();
  busy = true; busyText = "Syncing"; pill();
  try { if (!interactive && !hasToken()) throw new Error("sign-in needed"); await getToken({ interactive }); signedOut = false; } catch { signedOut = true; }
  if (!signedOut) { try { await sync(t => { busyText = t.replace(/^daily-/, "").split("-")[0]; pill(); }); healthPush().catch(e => console.warn("health push", e)); } catch (e) { if (e.auth) signedOut = true; } }
  busy = false; try { await load(); } catch (e) { console.error(e); } pill();
}
async function fullSync(force = false) {   // everything the phone shares with the web: health, gym, calendar, notes
  const healthP = isNative ? hcRefresh(force) : hasToken() ? refreshWeb(false) : load();
  await Promise.allSettled([healthP, gym.pull(), agenda.load(force), notes.refresh(), settings.check()]);
  if (cur === "today" || cur === "plan") paint(); pill();
}

// ---- modules ----
const settings = initSettings({ sheet: $("sheet"), body: $("sheetBody"), demo: DEMO, native: isNative, health, toast, onChange: what => { if (what === "weather") { if (cur === "today") drawWeather(); } else fullSync(true); pill(); } });
const plan = initPlan(pane("plan"), { toast });
pane("gym").innerHTML = `<div id="tempoBox"></div><div id="gymBox"></div>`;   // the rep metronome sits above the log
const gym = initLiteGym($("gymBox"), { demo: DEMO, toast, onChange: entries => {
  A.gymLog.days = new Set(entries.map(e => e.date)); A.gymLog.sets = {}; entries.forEach(e => (A.gymLog.sets[e.date] = (A.gymLog.sets[e.date] || 0) + (e.sets || 1)));
  if (days.length || DEMO) { M = model(); if (cur === "today" || cur === "health") paint(); }
} });
const tempo = initTempo($("tempoBox"), { onReps: n => { gym.setReps(n); toast(`${n} reps counted`); } });
const notes = initNotes(pane("notes"), { demo: DEMO, toast });

// Android Back: popover → sheet → note editor / folder → previous tab → leave the app (MainActivity asks this)
window.__back = () => {
  if (!pop.hidden) { pop.hidden = true; return true; }
  if (settings.back()) return true;
  if (cur === "notes" && notes.back()) return true;
  if (cur === "plan" && plan.back()) return true;
  if (trail.length) { show(trail.pop(), { push: false }); return true; }
  if (cur !== "today") { show("today", { push: false }); return true; }
  return false;
};

// ---- start: paint from the cache at once, then sync in the background ----
{ const q = new URLSearchParams(location.search), saved = localStorage.getItem("lite.tab"); if (q.get("h")) hsub = q.get("h"); show(TABS.includes(q.get("tab")) ? q.get("tab") : TABS.includes(saved) ? saved : "today", { push: false }); }
try { await load(); } catch (e) { console.error(e); }
agenda.load().then(() => { if (cur === "today" || cur === "plan") paint(); });
if (isNative && !DEMO) hcStatus().then(s => { hc = s; pill(); }, () => {});
pill();
if (!DEMO) fullSync();
document.addEventListener("visibilitychange", () => { if (!document.hidden && !DEMO) fullSync(); });
