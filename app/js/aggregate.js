// Turns raw API points into one row per LOCAL date. Numbers can arrive as strings.
const num = v => (v === undefined || v === null ? null : Number(v));
const pad = n => String(n).padStart(2, "0");
export const civil = d => `${d.year}-${pad(d.month)}-${pad(d.day)}`;
const offsetSec = s => (s ? parseInt(s, 10) : 0);
// Local date of an instant, using the UTC offset recorded with that data point (never the current zone).
export function localDate(utcIso, offset) {
  return new Date(Date.parse(utcIso) + offsetSec(offset) * 1000).toISOString().slice(0, 10);
}
const day = (rows, d) => (rows[d] ||= { date: d });

export function sleepRows(points, rows) {
  const byDay = {};
  for (const p of points) {
    const s = p.sleep, iv = s.interval;
    const d = localDate(iv.endTime, iv.endUtcOffset);
    (byDay[d] ||= []).push(s);
  }
  for (const [d, list] of Object.entries(byDay)) {
    const main = list.find(s => s.metadata?.mainSleep) || list.reduce((a, b) => (+a.summary.minutesAsleep > +b.summary.minutesAsleep ? a : b));
    const st = Object.fromEntries((main.summary.stagesSummary || []).map(x => [x.type, num(x.minutes)]));
    Object.assign(day(rows, d), {
      inBedMin: num(main.summary.minutesInSleepPeriod),
      sleepMin: num(main.summary.minutesAsleep), awakeMin: num(main.summary.minutesAwake),
      deepMin: st.DEEP ?? null, lightMin: st.LIGHT ?? null, remMin: st.REM ?? null,
      sleepStart: main.interval.startTime, sleepEnd: main.interval.endTime, sleepOffset: offsetSec(main.interval.endUtcOffset),
      sleepStages: main.stages.map(x => [x.type, x.startTime, x.endTime]),
      napMin: list.filter(s => s !== main).reduce((a, s) => a + num(s.summary.minutesAsleep), 0)
    });
  }
}

// Steps: totals per source, because the phone and the band can both report steps.
export function stepRows(points, rows) {
  const tot = {};
  for (const p of points) {
    const d = civil(p.steps.interval.civilStartTime.date);
    const src = p.dataSource.device?.displayName || p.dataSource.device?.manufacturer || p.dataSource.application?.packageName || "unknown";
    ((tot[d] ||= {})[src] ||= 0);
    tot[d][src] += num(p.steps.count);
  }
  for (const [d, srcs] of Object.entries(tot)) {
    const best = Object.entries(srcs).sort((a, b) => b[1] - a[1])[0];
    Object.assign(day(rows, d), { steps: best[1], stepsSource: best[0], stepsBySource: srcs });
  }
}

export function dailyRows(type, points, rows) {
  for (const p of points) {
    const v = p[type];
    const r = day(rows, civil(v.date));
    if (type === "dailyRestingHeartRate") r.restingHr = num(v.beatsPerMinute);
    if (type === "dailyHeartRateVariability") r.hrv = v.averageHeartRateVariabilityMilliseconds;
    if (type === "dailyOxygenSaturation") r.spo2 = v.averagePercentage;
    if (type === "dailyRespiratoryRate") r.breathing = v.breathsPerMinute;
    if (type === "dailyVo2Max") { const n = Object.entries(v).find(([k, x]) => k !== "date" && typeof x === "number" && x > 5 && x < 100); if (n) r.vo2max = n[1]; }
    if (type === "dailySleepTemperatureDerivations") { r.skinTemp = v.nightlyTemperatureCelsius; r.skinTempDelta = v.nightlyTemperatureCelsius - v.baselineTemperatureCelsius; }
  }
}

export function zoneRows(points, rows) {
  for (const p of points) {
    const v = p.activeZoneMinutes, r = day(rows, civil(v.interval.civilStartTime.date));
    r.azm = (r.azm || 0) + num(v.activeZoneMinutes);
    r.zones = r.zones || {}; r.zones[v.heartRateZone] = (r.zones[v.heartRateZone] || 0) + num(v.activeZoneMinutes);
  }
}

// Workouts: the band supplies heart rate / zones; Strava (via Health Connect) supplies distance and pace.
// Entries that overlap in time are merged into one workout.
export function exerciseRows(points, rows) {
  const all = points.map(p => {
    const e = p.exercise, m = e.metricsSummary || {}, band = p.dataSource.platform === "FITBIT";
    return {
      key: p.name, name: e.displayName, type: e.exerciseType, band,
      start: Date.parse(e.interval.startTime), end: Date.parse(e.interval.endTime), offset: offsetSec(e.interval.startUtcOffset),
      seconds: parseInt(e.activeDuration, 10),
      distanceM: m.distanceMillimeters != null ? m.distanceMillimeters / 1000 : null,
      paceSecPerKm: m.averagePaceSecondsPerMeter != null ? m.averagePaceSecondsPerMeter * 1000 : null,
      avgHr: num(m.averageHeartRateBeatsPerMinute), kcal: m.caloriesKcal ?? null, azm: num(m.activeZoneMinutes),
      zones: m.heartRateZoneDurations || null
    };
  }).sort((a, b) => a.start - b.start);
  const merged = [];
  for (const w of all) {
    const prev = merged.find(m => w.start < m.end && w.end > m.start);
    if (!prev) { merged.push({ ...w }); continue; }
    for (const [k, v] of Object.entries(w)) if (prev[k] == null && v != null) prev[k] = v;
    if (w.distanceM != null) { prev.name = w.name; prev.type = w.type; }
  }
  for (const w of merged) {
    const d = new Date(w.start + w.offset * 1000).toISOString().slice(0, 10);
    (day(rows, d).workouts ||= []).push(w);
  }
}
