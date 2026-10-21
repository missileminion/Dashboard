import { fetchPoints } from "./api.js";
import * as A from "./aggregate.js";
import { allDays, putDays, getMeta, setMeta } from "./db.js";

// The band is the only source we trust: other writers (phone steps, Strava, Whoop, Samsung Health, Health Sync)
// duplicate or pollute the same metrics.
const onlyBand = p => p.dataSource?.platform === "FITBIT";
const iso = d => d.toISOString().slice(0, 10);
const daysAgo = n => iso(new Date(Date.now() - n * 864e5));

// Fetch plan per type. Where a filter name is documented we use it; otherwise we page newest-first
// and stop at the cutoff date, which needs no filter syntax.
const olderThan = (since, dateOf) => p => dateOf(p) < since;
const PLAN = since => [
  ["sleep", { filter: `sleep.interval.civil_end_time >= "${since}"`, pageSize: 25 }, A.sleepRows],
  ["daily-resting-heart-rate", { stop: olderThan(since, p => A.civil(p.dailyRestingHeartRate.date)) }, (pts, r) => A.dailyRows("dailyRestingHeartRate", pts, r)],
  ["daily-heart-rate-variability", { stop: olderThan(since, p => A.civil(p.dailyHeartRateVariability.date)) }, (pts, r) => A.dailyRows("dailyHeartRateVariability", pts, r)],
  ["daily-oxygen-saturation", { stop: olderThan(since, p => A.civil(p.dailyOxygenSaturation.date)) }, (pts, r) => A.dailyRows("dailyOxygenSaturation", pts, r)],
  ["daily-respiratory-rate", { stop: olderThan(since, p => A.civil(p.dailyRespiratoryRate.date)) }, (pts, r) => A.dailyRows("dailyRespiratoryRate", pts, r)],
  ["daily-sleep-temperature-derivations", { stop: olderThan(since, p => A.civil(p.dailySleepTemperatureDerivations.date)) }, (pts, r) => A.dailyRows("dailySleepTemperatureDerivations", pts, r)],
  ["active-zone-minutes", { pageSize: 1000, stop: olderThan(since, p => A.civil(p.activeZoneMinutes.interval.civilStartTime.date)) }, A.zoneRows],
  ["heart-rate-variability", { pageSize: 100, stop: p => Date.parse(p.heartRateVariability.sampleTime.physicalTime) / 1000 < Date.parse(since + "T00:00:00Z") / 1000 - 86400 }, (pts, r, ctx) => { ctx.hrv = pts.map(p => [Date.parse(p.heartRateVariability.sampleTime.physicalTime) / 1000, p.heartRateVariability.rootMeanSquareOfSuccessiveDifferencesMilliseconds]); }],
  ["daily-vo2-max", { stop: olderThan(since, p => A.civil(p.dailyVo2Max.date)) }, (pts, r) => A.dailyRows("dailyVo2Max", pts, r)],
  ["exercise", { stop: olderThan(since, p => A.localDate(p.exercise.interval.startTime, p.exercise.interval.startUtcOffset)) }, A.exerciseRows]
];

// First run loads 90 days; later runs reload from 2 days before the last sync so late-arriving data is picked up.
// Bump SCHEMA whenever stored fields change. Rows saved under an older schema are ignored and reloaded on the next sync.
export const SCHEMA = 4;
export async function sync(onProgress = () => {}) {
  if ((await getMeta("schema")) !== SCHEMA) { await setMeta("lastSyncDate", null); await setMeta("schema", SCHEMA); }
  const last = await getMeta("lastSyncDate");
  const since = last ? iso(new Date(Date.parse(last) - 2 * 864e5)) : daysAgo(200);
  const rows = {}, errors = [], ctx = {}; let device = null;
  for (const [type, opts, fold] of PLAN(since)) {
    onProgress(type);
    try { const pts = await fetchPoints(type, opts); device ||= pts.find(p => onlyBand(p) && p.dataSource.device?.displayName)?.dataSource.device.displayName; fold(pts.filter(type === "exercise" ? (() => true) : onlyBand), rows, ctx); } catch (e) { if (e.auth) throw e; errors.push(`${type}: ${e.message}`); }
  }
  const cached = Object.fromEntries((await allDays()).map(r => [r.date, r]));
  // A refetched day replaces only the fields the fetch produced; failed types keep their cached values.
  const merged = Object.values(rows).map(r => ({ ...cached[r.date], ...r }));
  // Nightly HRV for readiness: mean RMSSD over the 4 hours starting 30 minutes after sleep onset (needs 3+ readings in that window).
  if (ctx.hrv?.length) for (const r of merged) {
    const first = r.sleepStages?.find(x => x[0] !== "AWAKE"); if (!first) continue;
    const a = Date.parse(first[1]) / 1000 + 1800, v = ctx.hrv.filter(([t, x]) => t >= a && t < a + 4 * 3600 && x > 0).map(([, x]) => x);
    if (v.length >= 3) r.hrvNight = v.reduce((p, q) => p + q, 0) / v.length;
  }
  await putDays(merged);
  if (!errors.length) await setMeta("lastSyncDate", iso(new Date()));
  if (device) await setMeta("device", device);
  if (errors.length < PLAN(since).length) await setMeta("lastSyncedAt", Date.now());
  return { days: merged.length, errors };
}
export { allDays, getMeta };

// Heart rate for a time window (a night, or one run). Dense, so fetched on demand and cached.
// Readings come newest first, so we page until we pass the start. Returns [[seconds since start, bpm]].
async function loadHr(key, start, end) {
  const cached = await getMeta(key); if (cached) return cached;
  const iso = s => new Date(s * 1000).toISOString().replace(/\.\d+Z$/, "Z");
  const t = p => Date.parse(p.heartRate.sampleTime.physicalTime) / 1000;
  const run = async filter => {
    const pts = await fetchPoints("heart-rate", { filter, pageSize: 1000, maxPages: 120, stop: p => t(p) < start });
    return pts.filter(p => p.dataSource?.platform === "FITBIT" && t(p) <= end).map(p => [t(p) - start, Number(p.heartRate.beatsPerMinute)]).reverse();
  };
  let out;
  try { out = await run(`heart_rate.sample_time.physical_time >= "${iso(start)}"`); }   // filter name is a guess; fall back to paging without it
  catch { out = await run(undefined); }
  if (out.length) await setMeta(key, out);
  return out;
}
export const loadSleepHr = day => loadHr("hr:" + day.date, Date.parse(day.sleepStages[0][1]) / 1000, Date.parse(day.sleepStages[day.sleepStages.length - 1][2]) / 1000);
// runs include 3 minutes after the stop, for heart-rate recovery
export const loadRunHr = run => loadHr("hr:run2:" + run.start, run.start / 1000, ((run.end || run.start + run.seconds * 1000) / 1000) + 180);
