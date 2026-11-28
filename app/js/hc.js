// Health Connect (Android app only). The phone reads the band's data straight from Health Connect: no Google sign-in, no daily tap.
// The native side (android/native/HealthConnectPlugin.kt) returns plain records; this file turns them into the SAME day rows sync.js
// builds from the Google Health API (SCHEMA 4), so analytics.js and every card work unchanged.
// After a read, the cache goes to GitHub (cloud.js healthPush), and the web version picks it up on its next load (healthPull).
//
// Band-only rule: only records written by the packages in hc.origins are used (default: the Fitbit app). hcOrigins() lists what is
// actually in Health Connect so the owner can check which app writes the band's data on their phone.
import { allDays, putDays, getMeta, setMeta } from "./db.js";
import { SCHEMA } from "./sync.js";
import { healthPush, nightHrPush } from "./cloud.js";
import { ymd, addDays } from "./util.js";
import { loadProfile } from "./macros.js";

const C = window.Capacitor;
export const isNative = !!C?.isNativePlatform?.();
export const DEFAULT_ORIGINS = ["com.fitbit.FitbitMobile"];
const call = (m, o = {}) => (C.Plugins?.HealthConnect?.[m] ? C.Plugins.HealthConnect[m](o) : C.nativePromise("HealthConnect", m, o));
export const origins = () => { try { const a = JSON.parse(localStorage.getItem("hc.origins")); return Array.isArray(a) && a.length ? a : DEFAULT_ORIGINS; } catch { return DEFAULT_ORIGINS; } };
export const setOrigins = a => localStorage.setItem("hc.origins", JSON.stringify(a));

export const hcStatus = () => call("status");          // {available, sdk, all, granted[]}
export const hcConnect = () => call("request");        // opens Health Connect's own permission sheet
export const hcInstall = () => call("install");        // Play Store page for Health Connect (Android 13 and older)
export const hcOrigins = async () => (await call("origins", { start: Date.now() - 30 * 864e5, end: Date.now() })).origins;   // {package: count}

// ---- mapping: records -> rows keyed by LOCAL date ----
const devOff = ms => -new Date(ms).getTimezoneOffset() * 60;
const local = (ms, off) => new Date(ms + (off ?? devOff(ms)) * 1000).toISOString().slice(0, 10);
const iso = ms => new Date(ms).toISOString();
const STAGE = { 1: "AWAKE", 3: "AWAKE", 7: "AWAKE", 2: "LIGHT", 4: "LIGHT", 5: "DEEP", 6: "REM" };   // 2 = "sleeping" with no stage: counted as light
const avg = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);

export function sleepRows(recs, rows) {
  const by = {};
  for (const r of recs) (by[local(r.end, r.eo)] ||= []).push(r);
  for (const [d, list] of Object.entries(by)) {
    const dur = r => r.end - r.start, main = list.reduce((a, b) => (dur(a) >= dur(b) ? a : b));
    const st = (main.stages || []).filter(s => STAGE[s[0]]).sort((a, b) => a[1] - b[1]).map(([t, a, b]) => [STAGE[t], iso(a), iso(b)]);
    const min = ty => Math.round(st.filter(s => s[0] === ty).reduce((s, x) => s + (Date.parse(x[2]) - Date.parse(x[1])), 0) / 60000);
    const asleep = r => (r.stages?.length ? r.stages.filter(s => STAGE[s[0]] && STAGE[s[0]] !== "AWAKE").reduce((s, x) => s + x[2] - x[1], 0) : dur(r)) / 60000;
    const row = (rows[d] ||= { date: d });
    Object.assign(row, { inBedMin: Math.round(dur(main) / 60000), sleepStart: iso(main.start), sleepEnd: iso(main.end), sleepOffset: main.eo ?? devOff(main.end),
      napMin: Math.round(list.filter(r => r !== main).reduce((s, r) => s + asleep(r), 0)) });
    if (st.length) Object.assign(row, { sleepStages: st, deepMin: min("DEEP"), lightMin: min("LIGHT"), remMin: min("REM"), awakeMin: min("AWAKE"), sleepMin: min("DEEP") + min("LIGHT") + min("REM") });
    else Object.assign(row, { sleepMin: Math.round(asleep(main)), awakeMin: 0 });
  }
}
// One value per day for point records: the mean (or the last reading, for once-a-day values).
function daily(recs, rows, key, how = "mean") {
  const by = {}; for (const r of recs) (by[local(r.t, r.o)] ||= []).push(r);
  for (const [d, list] of Object.entries(by)) { list.sort((a, b) => a.t - b.t); (rows[d] ||= { date: d })[key] = how === "last" ? list[list.length - 1].v : avg(list.map(r => r.v)); }
}
// Skin temperature arrives as deltas from the band's own baseline; skinTemp keeps the same meaning (a level whose changes matter) for the illness check.
function skinRows(recs, rows) {
  const by = {}; for (const r of recs) for (const [t, v] of r.deltas || []) (by[local(t, r.eo)] ||= []).push(v);
  for (const [d, vs] of Object.entries(by)) { const m = avg(vs); Object.assign(rows[d] ||= { date: d }, { skinTempDelta: m, skinTemp: 34 + m }); }
}
// Readiness uses nightly HRV: the mean in the 4 h starting 30 min after sleep onset. If the band only writes one HRV value a day, that value is used.
function hrvNight(recs, rows) {
  for (const r of Object.values(rows)) {
    const first = r.sleepStages?.find(x => x[0] !== "AWAKE");
    if (first) { const a = Date.parse(first[1]) + 1800e3, v = recs.filter(x => x.t >= a && x.t < a + 4 * 36e5).map(x => x.v); if (v.length >= 3) { r.hrvNight = avg(v); continue; } }
    if (r.hrv != null) r.hrvNight = r.hrv;
  }
}
const KIND = { RUNNING: "Run", WEIGHTLIFTING: "Weightlifting", STRENGTH_TRAINING: "Strength training", WALKING: "Walk", BIKING: "Ride", HIKING: "Hike", SWIMMING: "Swim" };
function exerciseRows(recs, rows) {
  for (const r of recs) {
    const d = local(r.start, r.so), sec = Math.round((r.end - r.start) / 1000), w = { type: r.type, name: r.title || KIND[r.type] || "Workout", start: r.start, end: r.end, offset: r.so ?? devOff(r.start), seconds: sec, source: "band" };
    if (r.avgHr) w.avgHr = Math.round(r.avgHr);
    if (r.distanceM > 0) { w.distanceM = r.distanceM; if (r.type === "RUNNING") w.paceSecPerKm = sec / (r.distanceM / 1000); }
    const row = (rows[d] ||= { date: d }); (row.workouts ||= []).push(w);
  }
}

// ---- the sync: read everything since 2 days before the last read (first time: 200 days), merge, save, share ----
export async function hcSync(onProgress = () => {}) {
  if ((await getMeta("schema")) !== SCHEMA) { await setMeta("lastSyncDate", null); await setMeta("schema", SCHEMA); }
  const last = await getMeta("lastSyncDate"), end = Date.now(), start = last ? Date.parse(last) - 2 * 864e5 : end - 200 * 864e5, o = origins();
  const read = async type => { onProgress(type); return (await call("read", { type, start, end, origins: o })).records || []; };
  const rows = {}, errors = [], step = async (name, fn) => { try { await fn(); } catch (e) { errors.push(`${name}: ${e.message || e}`); console.error(name, e); } };
  let hrv = [];
  await step("sleep", async () => sleepRows(await read("sleep"), rows));
  await step("resting heart rate", async () => daily(await read("restingHr"), rows, "restingHr", "last"));
  await step("HRV", async () => { hrv = await read("hrv"); daily(hrv, rows, "hrv"); });
  await step("SpO2", async () => daily(await read("spo2"), rows, "spo2"));
  await step("breathing", async () => daily(await read("resp"), rows, "breathing"));
  await step("skin temperature", async () => skinRows(await read("skinTemp"), rows));
  await step("VO2 max", async () => daily(await read("vo2"), rows, "vo2max", "last"));
  await step("exercise", async () => exerciseRows(await read("exercise"), rows));
  hrvNight(hrv, rows);
  // Active zone minutes are not in Health Connect, so they are worked out from heart rate (see the plugin). Resting HR: the median of recent days.
  await step("active zone minutes", async () => {
    onProgress("heart rate");
    const cached = await allDays(), rests = [...cached, ...Object.values(rows)].map(r => r.restingHr).filter(v => v > 0).slice(-30).sort((a, b) => a - b);
    const rest = rests.length ? rests[rests.length >> 1] : 60, max = 220 - (loadProfile().age || 22);
    const azm = (await call("activeZoneMinutes", { start: Math.max(start, end - 120 * 864e5), end, rest, max, origins: o })).days || [];
    for (const z of azm) { const row = (rows[z.date] ||= { date: z.date }); row.azm = Math.round(z.fat + 2 * (z.cardio + z.peak)); row.zones = { FAT_BURN: z.fat, CARDIO: z.cardio, PEAK: z.peak }; }
  });
  const cached = Object.fromEntries((await allDays()).map(r => [r.date, r]));
  const merged = Object.values(rows).map(r => ({ ...cached[r.date], ...r }));   // a re-read day replaces only the fields this read produced
  await putDays(merged);
  if (!errors.length) await setMeta("lastSyncDate", new Date(end).toISOString());
  if (merged.length && errors.length < 9) {   // something was actually read: stamp it and share it (an all-failed read must not overwrite the web copy)
    await setMeta("lastSyncedAt", Date.now()); await setMeta("device", "Health Connect");
    healthPush().catch(e => console.warn("health share", e));   // the web version reads this copy
    shareNightHr().catch(e => console.warn("night hr share", e));
  }
  return { days: merged.length, errors };
}

// Heart rate for one night, for the Night Flow chart: [[seconds since the first stage starts, bpm]], cached under the same key sync.js uses.
export async function hcNightHr(day) {
  const st = day.sleepStages; if (!st?.length) return null;
  const a = Date.parse(st[0][1]), b = Date.parse(st[st.length - 1][2]);
  const recs = (await call("read", { type: "heartRate", start: a, end: b, origins: origins() })).records || [];
  const hr = recs.filter(r => r.t >= a && r.t <= b).sort((x, y) => x.t - y.t).map(r => [(r.t - a) / 1000, r.v]);
  if (hr.length && b < Date.now() - 36e5) await setMeta("hr:" + day.date, hr);   // a finished night does not change
  return hr;
}

// ---- share each finished night's heart rate with the web (one reading a minute), a few nights per read so the first run stays light ----
const perMinute = hr => { const m = new Map(); for (const [t, v] of hr) { const k = Math.floor(t / 60), a = m.get(k) || [0, 0]; a[0] += v; a[1]++; m.set(k, a); } return [...m].sort((a, b) => a[0] - b[0]).map(([k, [s, n]]) => [k * 60 + 30, Math.round(s / n * 10) / 10]); };
export async function shareNightHr() {
  const done = new Set((await getMeta("hrshared")) || []), nights = {}, fresh = [];
  const days = (await allDays()).filter(d => d.sleepStages?.length).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 30);
  for (const d of days) {
    if (done.has(d.date) || fresh.length >= 10) continue;
    if (Date.parse(d.sleepStages[d.sleepStages.length - 1][2]) > Date.now() - 36e5) continue;   // tonight's is not finished yet
    const hr = (await getMeta("hr:" + d.date)) || (await hcNightHr(d));
    if (hr?.length) { nights[d.date] = perMinute(hr); fresh.push(d.date); }
  }
  if (!fresh.length) return;
  await nightHrPush(nights);
  await setMeta("hrshared", [...done, ...fresh]);
}
