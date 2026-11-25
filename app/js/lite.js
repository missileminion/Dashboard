// Lite: the phone layout (lite.html). It reads the same cache, runs the same formulas (analytics.js) and the same "bad" rules
// (standards.js) as the full dashboard, and shares its storage, so both can be used on the same phone. Four panes: Today, Sleep, Body, Gym.
import { getToken, hasToken } from "./auth.js";
import { healthPull, healthPush } from "./cloud.js";
import { sync, allDays, getMeta, SCHEMA } from "./sync.js";
import { mean, sum, sd, ymd, addDays, hm, pad, dayLabel, esc, n3 } from "./util.js";
import * as A from "./analytics.js";
import { bad, red } from "./standards.js";
import { INFO } from "./info.js";
import { demoDays, demoSleepHr } from "./demo.js";
import { dm } from "./dotfont.js";
import { sleepMonth, earlyOrb, nightFlow, drawLanes } from "./widgets.js";
import { drawNight } from "./sleepchart.js";
import { line, vital } from "./charts.js";
import { loadSleepHr } from "./sync.js";
import { initLiteGym } from "./litegym.js";
import { isNative, hcStatus, hcConnect, hcInstall, hcSync, hcNightHr, hcOrigins, origins } from "./hc.js";

const DEMO = location.port === "8082" || new URLSearchParams(location.search).has("demo");
if (DEMO) A.gymTracking.start = "2000-01-01";
const $ = id => document.getElementById(id);
let days = [], byDate = {}, today = ymd(new Date()), nightIdx = -1, busy = false, signedOut = !DEMO, syncText = "";

// ---- data access (same conventions as main.js) ----
const get = (d, k) => { const r = byDate[d]; if (!r) return null; if (k === "azm") return r.azm ?? (r.restingHr != null || r.hrv != null || r.sleepMin != null ? 0 : null); return r[k] ?? null; };
const series = (k, n, end = today) => [...Array(n)].map((_, i) => { const d = addDays(end, -(n - 1 - i)); return { d, v: get(d, k) }; });
const win = (k, n, back = 0) => series(k, n, addDays(today, -back)).map(x => x.v);
const clock = m => { const r = Math.round(((m % 1440) + 1440) % 1440) % 1440; return `${pad(Math.floor(r / 60))}:${pad(r % 60)}`; };
const monday = d => { const x = new Date(d + "T12:00:00"); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return ymd(x); };
const try_ = (fn, dflt = null) => { try { return fn(); } catch (e) { console.error(e); return dflt; } };
const ib = k => (k && INFO[k] ? `<button class="i" type="button" data-i="${k}" aria-label="More information">i</button>` : "");
const cell = (label, v, unit, key, isBad = false) => `<div class="card cell"><div class="lb"><span>${label}</span>${ib(key)}</div><div class="v ${v == null ? "none" : isBad ? "bad" : ""}">${dm(v ?? "—")}${v == null || !unit ? "" : `<small>${unit}</small>`}</div></div>`;
const row = (k, v, unit, { key = "", isBad = false, rng = "" } = {}) => `<div class="row"><div class="k">${k}${ib(key)}</div><div class="r"><span class="num ${v == null ? "gap" : isBad ? "bad" : ""}">${v ?? "—"}</span>${v == null ? "" : `<span class="u">${unit}</span>`}${rng ? `<span class="rng">${rng}</span>` : ""}</div></div>`;

// ---- everything the panes need, worked out once per render ----
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

// ---- Today ----
function renderToday(m) {
  const c = m.call, rz = m.rd?.z;
  const debtV = m.sf.nights < 3 ? null : m.sf.hours < 0.1 ? "None" : hm(m.sf.hours * 60);
  const mon = monday(today), wk = [...Array(7)].map((_, i) => addDays(mon, i)), done = wk.filter(d => A.gymLog.days.has(d)).length;
  const sickBad = bad("illnessScore", m.signs.composite);
  $("today").innerHTML = `
  <div class="card hero">
    <div class="kick">Today's call ${ib("today")}</div>
    <div class="plan">Planned<b>${dm(A.plannedFor(today).toUpperCase())}</b></div>
    <div class="call ${c ? red("trainingCall", c.call) : "gap"}">${dm(c ? c.call.toUpperCase() : "—")}</div>
    <div class="why">${c ? c.reasons.map(esc).join(" · ") : "Not enough data yet"}</div>
  </div>
  <div class="grid2">
    ${cell("Readiness", rz == null ? null : (rz >= 0 ? "+" : "−") + n3(Math.abs(rz)), "σ", "readiness", bad("readinessZ", rz))}
    ${cell("Slept", m.st ? hm(m.st.tst) : null, "", "sleepQuality", m.st ? bad("sleepTime", m.st.tst) : false)}
    ${cell("Sleep debt", debtV, "", "debt", bad("sleepDebtHours", m.sf.hours))}
    ${cell("Load", m.lb ? "×" + m.lb.ratio.toFixed(2) : null, "", "load", m.lb ? bad("loadRatio", m.lb.ratio) : false)}
  </div>
  <div class="card bed"><div class="kick">Bedtime tonight ${ib("bedtime")}</div><div class="big">${dm(m.bed ? clock(m.bed.minutes) : "—")}</div>
    ${m.bed && (m.bed.extra || m.bed.loadExtra) ? `<div class="sub">+${m.bed.extra + m.bed.loadExtra} min catch-up</div>` : ""}</div>
  <div class="card"><div class="row" style="padding:0"><div class="k">Body check ${ib("early")}</div><div class="r"><span class="num ${m.signs.composite == null ? "gap" : sickBad ? "bad" : ""}" style="font-family:var(--sans)">${esc(m.signs.status)}</span></div></div></div>
  <div class="card"><div class="row" style="padding:0"><div class="k">Gym this week ${ib("gymDays")}</div><div class="r"><span class="num">${done}</span><span class="u">of 6</span></div></div>
    <div class="week">${wk.map(d => `<div class="${A.gymLog.days.has(d) ? "on" : ""} ${d > today ? "fut" : ""} ${d === today ? "now" : ""}"><i></i><span>${"MTWTFSS"[wk.indexOf(d)]}</span></div>`).join("")}</div></div>
  <div class="card" id="wx"><div class="empty">Weather…</div></div>
  <a class="card more" href="index.html?full${DEMO ? "&demo" : ""}"><span>Full dashboard</span><span class="sub">Calendar · Notes · Home · Console</span><b>→</b></a>`;
  drawWeather();
}

// ---- Weather: Open-Meteo, no key; the city is the one chosen in the full dashboard ----
const WMO = c => c === 0 ? "Clear" : c <= 2 ? "Partly cloudy" : c === 3 ? "Overcast" : c === 45 || c === 48 ? "Fog" : c <= 57 ? "Drizzle" : c <= 67 ? "Rain" : c <= 77 ? "Snow" : c <= 82 ? "Showers" : c <= 86 ? "Snow showers" : "Thunderstorm";
const jget = k => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
async function drawWeather() {
  const el = $("wx"); if (!el) return;
  const city = DEMO ? { name: "Demo city", lat: 0, lon: 0 } : jget("weather.city"), F = (jget("weather.unit") || "C") === "F";
  if (!city || city.lat == null) { el.innerHTML = `<div class="empty">Pick a weather city in the full dashboard.</div>`; return; }
  let w = jget("lite.wx");
  if (DEMO) w = { at: Date.now(), name: city.name, d: { now: 9.4, hi: 12.8, lo: 4.1, feel: 11.2, rain: 60, uv: 2.1, wind: 18, code: 61 } };
  else if (!w || w.name !== city.name || Date.now() - w.at > 30 * 60e3) {
    try {
      const u = `https://api.open-meteo.com/v1/forecast?latitude=${city.lat}&longitude=${city.lon}&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min,apparent_temperature_max,precipitation_probability_max,uv_index_max,wind_speed_10m_max&timezone=auto&forecast_days=1`;
      const j = await (await fetch(u)).json(), D = k => j.daily[k][0];
      w = { at: Date.now(), name: city.name, d: { now: j.current.temperature_2m, code: j.current.weather_code, hi: D("temperature_2m_max"), lo: D("temperature_2m_min"), feel: D("apparent_temperature_max"), rain: D("precipitation_probability_max"), uv: D("uv_index_max"), wind: D("wind_speed_10m_max") } };
      localStorage.setItem("lite.wx", JSON.stringify(w));
    } catch { if (!w) { el.innerHTML = `<div class="empty">Weather unavailable offline.</div>`; return; } }
  }
  const d = w.d, T = c => (c == null ? "—" : Math.round(F ? c * 9 / 5 + 32 : c) + "°"), W = k => (F ? Math.round(k * .621) + " mph" : Math.round(k) + " km/h");
  el.innerHTML = `<div class="wx"><div class="t num">${T(d.now)}</div><div class="d"><b>${esc(city.name)}</b>${WMO(d.code)} · <span class="num">${T(d.hi)} / ${T(d.lo)}</span></div>
    <div class="m"><span>Rain</span><span class="num">${d.rain ?? "—"}%</span><span>UV</span><span class="num ${red("uv", d.uv)}">${d.uv == null ? "—" : Math.round(d.uv)}</span><span>Wind</span><span class="num ${red("wind", d.wind)}">${d.wind == null ? "—" : W(d.wind)}</span>
    ${bad("heat", d.feel) ? `<span>Feels</span><span class="num bad">${T(d.feel)}</span>` : ""}</div></div>`;
}

// ---- Sleep: the original charts (Night Flow lanes when heart rate is at hand, the stage chart otherwise, and Sleep Month) ----
let hrToken = 0;
async function nightHr(n) {
  if (DEMO) return demoSleepHr(n);
  const cached = await getMeta("hr:" + n.date); if (cached) return cached;
  if (isNative) return hcNightHr(n);
  if (hasToken()) return loadSleepHr(n);
  return null;
}
async function drawSleepChart(n) {
  const my = ++hrToken, el = $("hyp"); $("tip").style.display = "none";
  let hr = null; try { hr = await nightHr(n); } catch (e) { console.warn("night heart rate", e); }
  if (my !== hrToken || !el.isConnected) return;
  if (hr?.length) { $("sleepStats").innerHTML = ""; drawLanes(el, $("tip"), nightFlow(n, hr), { W: 520 }); $("sleepInfo").dataset.i = "nightFlow"; }
  else { drawNight(n, { restKnown: false, W: 520 }); $("sleepInfo").dataset.i = "stages"; }
}
function renderSleep(m) {
  const N = m.nights; if (nightIdx < 0 || nightIdx >= N.length) nightIdx = N.length - 1;
  const n = N[nightIdx], s = n ? try_(() => A.nightStats(n)) : null, q = n ? try_(() => A.sleepQuality(n, days)) : null, avg = mean(win("sleepMin", 14));
  const debtV = m.sf.nights < 3 ? null : m.sf.hours < 0.1 ? "None" : hm(m.sf.hours * 60);
  $("sleep").innerHTML = !n ? `<div class="card"><div class="empty">No sleep data yet.</div></div>` : `
  <div class="card night">
    <div class="nnav"><button type="button" id="nPrev" ${nightIdx <= 0 ? "disabled" : ""} aria-label="Earlier night">‹</button><span class="lbl">${nightIdx === N.length - 1 ? "Last night" : dayLabel(n.date)}</span><button type="button" id="nNext" ${nightIdx >= N.length - 1 ? "disabled" : ""} aria-label="Later night">›</button></div>
    <div class="big ${s && bad("sleepTime", s.tst) ? "bad" : ""}">${dm(s ? hm(s.tst) : "—")}</div>
    <div class="win">${s ? `${clock(s.onsetMin)} → ${clock(s.wakeMin)}` : ""} <button class="i" type="button" id="sleepInfo" data-i="nightFlow" aria-label="More information">i</button></div>
    <div class="chartbox"><div id="hyp"></div><div id="tip"></div></div><div id="sleepStats"></div>
  </div>
  <div class="card">
    ${row("Quality", q ? Math.round(q.score) : null, "/ 100", { key: "sleepQuality", isBad: q ? bad("sleepQuality", q.score) : false })}
    ${row("14-night average", avg == null ? null : hm(avg), "", { isBad: bad("sleepTime", avg) })}
    ${row("Sleep debt", debtV, debtV === "None" ? "" : "behind", { key: "debt", isBad: bad("sleepDebtHours", m.sf.hours) })}
    ${row("Bedtime tonight", m.bed ? clock(m.bed.minutes) : null, "", { key: "bedtime" })}
  </div>
  <div class="kick sec">Sleep Month ${ib("sleepMonth")}</div>
  <div class="card"><div id="sleepMonth"></div></div>`;
  if (!n) return;
  drawSleepChart(n);
  try { sleepMonth($("sleepMonth"), byDate, days, today); } catch (e) { console.error(e); }
  $("nPrev").onclick = () => { nightIdx--; renderSleep(m); };
  $("nNext").onclick = () => { nightIdx++; renderSleep(m); };
}

// ---- Body ----
function vitalRow(k, name, unit, dec) {   // the original vital row: latest value against its own usual range (30 days before it, mean ± 1 sd)
  const l = [...series(k, 14)].reverse().find(x => x.v != null); if (!l) return vital(name, null, unit, null, dec);
  const base = series(k, 31, addDays(l.d, -1)).map(x => x.v), mu = mean(base), s = sd(base);
  return vital(name, l.v, unit, s == null ? null : [mu - s, mu + s], dec, l.d === today ? "" : ` · from ${dayLabel(l.d)}`);
}
function renderBody(m) {
  const a7 = sum(win("azm", 7)), gymLast = try_(() => A.gymDaysInWeek(byDate, monday(addDays(today, -7)), addDays));
  const hrv7 = mean(win("hrv", 7)), hrv30 = win("hrv", 30, 7), hs = sd(hrv30), hm_ = mean(hrv30), hrvOut = hs != null && hrv7 != null && Math.abs(hrv7 - hm_) > hs;
  const vo2 = [...series("vo2max", 30)].reverse().find(x => x.v != null), vo2Old = get(addDays(vo2?.d || today, -30), "vo2max"), vo2Chg = vo2 && vo2Old ? 100 * (vo2.v / vo2Old - 1) : null;
  const sickBad = bad("illnessScore", m.signs.composite);
  $("body").innerHTML = `
  <div class="card"><div class="kick">Body check ${ib("early")}</div><div id="orb"></div></div>
  <div class="kick sec">Vitals ${ib("vitals")}</div>
  <div class="card vitals">${vitalRow("restingHr", "Resting HR", "bpm", 0)}${vitalRow("hrv", "HRV", "ms", 0)}${vitalRow("breathing", "Breathing", "br/min", 1)}${vitalRow("spo2", "SpO2", "%", 1)}${vitalRow("skinTempDelta", "Skin temp Δ", "°C", 2)}</div>
  <div class="card"><div class="kick">Resting heart rate · 90 days</div><div class="lchart" id="lrhr"></div></div>
  <div class="kick sec">Recovery and load</div>
  <div class="grid2">
    ${cell("Readiness", m.rd?.z == null ? null : (m.rd.z >= 0 ? "+" : "−") + n3(Math.abs(m.rd.z)), "σ", "readiness", bad("readinessZ", m.rd?.z))}
    ${cell("HRV 7 days", hrv7 == null ? null : Math.round(hrv7), "ms", "hrvStatus", hrvOut)}
    ${cell("Active zone", a7 == null ? null : Math.round(a7), "min / 7d", "", bad("azmWeek", a7))}
    ${cell("Gym last week", gymLast ?? null, "of 6", "gymDays", bad("workouts", gymLast))}
  </div>
  <div class="card">
    ${row("Load balance", m.lb ? "×" + m.lb.ratio.toFixed(2) : null, "", { key: "load", isBad: m.lb ? bad("loadRatio", m.lb.ratio) : false, rng: m.lb ? `fatigue ${Math.round(m.lb.fatigue)} · fitness ${Math.round(m.lb.fitness)}` : "" })}
    ${row("Cardio fitness", vo2 ? vo2.v.toFixed(1) : null, "VO2 max", { key: "vo2", rng: vo2Chg == null ? "" : `${vo2Chg >= 0 ? "▲" : "▼"} ${n3(Math.abs(vo2Chg))}% in 30 days` })}
  </div>`;
  if (vo2Chg != null && bad("vo2Change", vo2Chg)) $("body").querySelector(".card:last-child .row:last-child .rng").classList.add("bad");
  if (isNative) { $("body").insertAdjacentHTML("beforeend", `<button class="card more" type="button" id="hcSrc"><span>Health Connect sources</span><span class="sub">Using: ${esc(origins().join(", "))}</span><b>→</b></button>`);
    $("hcSrc").onclick = async () => { pop.innerHTML = "<b>Apps writing to Health Connect (30 days)</b><p>Reading…</p>"; pop.hidden = false;
      try { const o = await hcOrigins(), use = origins(); pop.innerHTML = "<b>Apps writing to Health Connect (30 days)</b>" + (Object.keys(o).length ? Object.entries(o).map(([p, n]) => `<p>${use.includes(p) ? "● " : "○ "}${esc(p)} · ${n} records</p>`).join("") : "<p>None found.</p>") + "<p>● = used. Only the band's app should be used.</p>"; } catch (e) { pop.innerHTML = "<b>Could not read sources</b><p>" + esc(e.message || e) + "</p>"; } }; }
  try { earlyOrb($("orb"), m.signs, try_(() => A.earlySigns(byDate, addDays(today, -1), addDays))); } catch (e) { console.error(e); }
  try { line($("lrhr"), series("restingHr", 90), { h: 78 }); } catch (e) { console.error(e); }
}

function render() {
  today = ymd(new Date());
  const m = model();
  for (const [name, fn] of [["Today", renderToday], ["Sleep", renderSleep], ["Body", renderBody]]) try { fn(m); } catch (e) { console.error(name, e); }
}

// ---- loading and syncing (as in main.js) ----
async function load() {
  let rows = [];
  if (!DEMO) { try { await healthPull(); } catch (e) { console.warn("health sync", e); } }
  if (DEMO) rows = demoDays();
  else if ((await getMeta("schema")) === SCHEMA) rows = (await allDays()).sort((a, b) => a.date.localeCompare(b.date));
  days = rows.map(r => ({ ...r, workouts: (r.workouts || []).filter(w => Number.isFinite(w.start) && Number.isFinite(w.offset)), sleepStages: Array.isArray(r.sleepStages) ? r.sleepStages.filter(x => Array.isArray(x) && x.length >= 3) : r.sleepStages }));
  byDate = Object.fromEntries(days.map(d => [d.date, d])); render();
}
const needsId = () => !DEMO && !window.CONFIG?.CLIENT_ID;
async function chip() {
  const c = $("chip"); c.classList.remove("go");
  if (DEMO) return (c.textContent = "Demo");
  if (isNative) {
    if (busy) return (c.textContent = syncText || "Reading…");
    if (hc && !hc.available) { c.classList.add("go"); return (c.textContent = "Get Health Connect"); }
    if (hc && !hc.all) { c.classList.add("go"); return (c.textContent = "Connect"); }
    const at = await getMeta("lastSyncedAt"); return (c.textContent = at ? "Read " + hhmm(at) : "Read now");
  }
  if (needsId()) return (c.textContent = "Set up in full app");
  if (busy) return (c.textContent = syncText || "Syncing…");
  if (signedOut) { c.classList.add("go"); return (c.textContent = "Sign in"); }
  const at = await getMeta("lastSyncedAt"), dev = await getMeta("device"); c.textContent = at ? (dev === "Health Connect" ? "Phone " : "Synced ") + hhmm(at) : "Refresh";   // "Phone" = the Android app read Health Connect and shared it
}
const hhmm = at => new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
// ---- Android: Health Connect replaces the Google sign-in; reads run by themselves on open and on return ----
let hc = null;
async function hcRefresh(force = false) {
  if (busy) return;
  try { hc = await hcStatus(); } catch (e) { console.error(e); hc = { available: false }; }
  if (!hc.available || !hc.all) return chip();
  const at = await getMeta("lastSyncedAt"); if (!force && at && Date.now() - at < 5 * 60e3 && (await getMeta("device")) === "Health Connect") return chip();
  busy = true; syncText = ""; chip(); let r = null;
  try { r = await hcSync(t => { syncText = "Reading " + t + "…"; chip(); }); } catch (e) { console.error(e); toast("Health Connect read failed"); }
  busy = false; try { await load(); } catch (e) { console.error(e); } await chip();
  if (r?.errors.length) toast(r.errors.length + " type" + (r.errors.length > 1 ? "s" : "") + " could not be read");
}
async function hcTap() {
  if (busy) return;
  if (hc && !hc.available) return hcInstall();
  if (hc && !hc.all) { try { await hcConnect(); } catch (e) { console.error(e); } return hcRefresh(true); }
  hcRefresh(true);
}
async function refresh(interactive) {
  if (DEMO || busy || needsId()) return; busy = true; syncText = ""; chip();
  try { if (!interactive && !hasToken()) throw new Error("sign-in needed"); await getToken({ interactive }); signedOut = false; } catch { signedOut = true; }
  let failed = false;
  if (!signedOut) { try { const r = await sync(t => { syncText = "Fetching " + t.replace(/^daily-/, "").split("-")[0] + "…"; chip(); }); failed = r.errors.length > 0; healthPush().catch(e => console.warn("health sync", e)); } catch (e) { if (e.auth) signedOut = true; else { failed = true; console.error(e); } } }
  busy = false;
  try { await load(); } catch (e) { console.error(e); }
  await chip(); if (failed) toast("Some data did not sync");
}
$("chip").onclick = () => { if (isNative) hcTap(); else if (needsId()) location.href = "./"; else refresh(true); };

// ---- panes, tabs, popovers ----
$("title").innerHTML = dm("TODAY");
const panes = $("panes"), tabs = [...$("tabs").children], NAMES = ["Today", "Sleep", "Body", "Gym"];
let cur = 0;
const setTab = i => { if (i === cur) return; cur = i; tabs.forEach((b, j) => b.classList.toggle("on", j === i)); $("title").innerHTML = dm(NAMES[i].toUpperCase()); pop.hidden = true; try { localStorage.setItem("lite.tab", i); } catch {} };
tabs.forEach((b, i) => (b.onclick = () => { if (i === cur) panes.children[i].scrollTo({ top: 0, behavior: "smooth" }); panes.scrollTo({ left: i * panes.clientWidth }); setTab(i); }));
panes.addEventListener("scroll", () => setTab(Math.round(panes.scrollLeft / panes.clientWidth)), { passive: true });
addEventListener("resize", () => panes.scrollTo({ left: cur * panes.clientWidth, behavior: "instant" }));
const pop = $("pop");
document.addEventListener("click", e => {
  const b = e.target.closest(".i"); if (!b) { if (!e.target.closest(".pop")) pop.hidden = true; return; }
  if (!pop.hidden && pop.dataset.k === b.dataset.i) { pop.hidden = true; return; }
  pop.innerHTML = INFO[b.dataset.i] || ""; pop.dataset.k = b.dataset.i; pop.hidden = false; pop.scrollTop = 0;
});
let tt = 0; const toast = msg => { const t = $("toast"); t.textContent = msg; t.hidden = false; clearTimeout(tt); tt = setTimeout(() => (t.hidden = true), 2200); };

// ---- gym: logged sets are what make a day a gym day ----
initLiteGym($("gym"), { demo: DEMO, toast, onChange: entries => {
  A.gymLog.days = new Set(entries.map(e => e.date)); A.gymLog.sets = {}; entries.forEach(e => (A.gymLog.sets[e.date] = (A.gymLog.sets[e.date] || 0) + (e.sets || 1)));
  if (days.length || DEMO) render();
} });

{ const q = new URLSearchParams(location.search), t = q.has("tab") ? +q.get("tab") : +(localStorage.getItem("lite.tab") || 0); if (t > 0 && t < 4) { cur = -1; setTab(t); requestAnimationFrame(() => panes.scrollTo({ left: t * panes.clientWidth, behavior: "instant" })); } }
try { await load(); } catch (e) { console.error(e); }
await chip();
if (isNative && !DEMO) hcRefresh();
else if (!DEMO && hasToken()) { const at = await getMeta("lastSyncedAt"); if (!at || Date.now() - at > 5 * 60e3) refresh(false); }
document.addEventListener("visibilitychange", async () => {
  if (document.hidden) return;
  if (isNative && !DEMO) return hcRefresh();
  const at = await getMeta("lastSyncedAt"); if (hasToken() && (!at || Date.now() - at > 5 * 60e3)) refresh(false); else { try { await load(); } catch {} chip(); }   // load() also takes a newer copy the phone shared
});
// Android Back: close the popover, then go back to Today, then leave the app (MainActivity asks this before closing)
window.__back = () => { if (!pop.hidden) { pop.hidden = true; return true; } if (cur !== 0) { tabs[0].click(); return true; } return false; };
