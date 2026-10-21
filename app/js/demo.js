// DEMO DATA ONLY (served on port 8082). Same row format the live sync produces. Nothing here is real.
import { ymd, addDays } from "./util.js";
let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
// A separate generator seeded by a key, so redrawing the same night or run always gives the same heart rate.
const seeded = key => { let h = 2166136261; for (const c of String(key)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); let s = (h >>> 0) % 2147483646 + 1; return () => (s = (s * 16807) % 2147483647) / 2147483647; };
const OFF = -25200;

function night(date, i) {
  const wake = Date.parse(date + "T13:30:00Z") / 1000 + Math.round((rnd() - .4) * 80) * 60;   // about 06:30 local
  const target = (5.9 + rnd() * 2.9) * 3600; let t = wake - target - 600, cyc = 0; const st = [], add = (ty, n) => { const s = 30 * Math.max(1, Math.round(n)); st.push([ty, new Date(t * 1000).toISOString(), new Date((t + s) * 1000).toISOString()]); t += s; };
  add("AWAKE", 6 + rnd() * 24);
  while (t < wake - 900) { add("LIGHT", 20 + rnd() * 50); add("DEEP", cyc < 3 ? 40 + rnd() * 60 : rnd() * 30); add("LIGHT", 10 + rnd() * 40); if (rnd() < .4) add("AWAKE", 1 + rnd() * 5); add("REM", 20 + rnd() * (20 + cyc * 25)); if (rnd() < .3) add("AWAKE", 1 + rnd() * 3); cyc++; }
  add("AWAKE", 4 + rnd() * 16);
  const sec = ty => st.filter(x => x[0] === ty).reduce((s, x) => s + (Date.parse(x[2]) - Date.parse(x[1])) / 1000, 0) / 60;
  return { sleepStages: st, sleepOffset: OFF, sleepStart: st[0][1], sleepEnd: st[st.length - 1][2], sleepMin: Math.round(sec("LIGHT") + sec("DEEP") + sec("REM")), awakeMin: Math.round(sec("AWAKE")), deepMin: Math.round(sec("DEEP")), lightMin: Math.round(sec("LIGHT")), remMin: Math.round(sec("REM")), inBedMin: Math.round((Date.parse(st[st.length - 1][2]) - Date.parse(st[0][1])) / 60000), napMin: 0 };
}

export function demoDays(n = 200) {
  const rows = [], today = ymd(new Date()), sick = new URLSearchParams(location.search).has("sick"), ill = i => (sick && i < 3 ? 1 : 0);   // healthy by default; add ?sick=1 to see the illness state
  for (let i = n - 1; i >= 0; i--) {
    const date = addDays(today, -i), dow = new Date(date + "T12:00:00").getDay(), r = { date };
    if (i % 23 === 7) { rows.push(r); continue; }                       // a day the band was not worn
    r.steps = Math.round(3500 + rnd() * 9500); r.restingHr = Math.round(58 + rnd() * 5 + ill(i) * 2.5); r.hrv = 88 + rnd() * 30 - ill(i) * 14;
    r.vo2max = 46 + (200 - i) * .01 + rnd() * .4; r.hrvNight = 62 + rnd() * 34 - ill(i) * 24; r.spo2 = 96.6 + rnd() * 1.8; r.breathing = 14.6 + rnd() * 1.4 + ill(i) * .9; r.skinTemp = 33.9 + rnd() * .5 + ill(i) * .6; r.skinTempDelta = r.skinTemp - 34.0;
    r.azm = rnd() < .25 ? undefined : Math.round(rnd() * 70); r.zones = { FAT_BURN: 18, CARDIO: 9, PEAK: 3 };
    if (i % 31 !== 12) Object.assign(r, night(date, i));
    const w = [];
    if (dow !== 0 && dow !== 3 && rnd() < .9) { const sec = 4200 + Math.round(rnd() * 1800), st = Date.parse(date + "T01:30:00Z"), z = k => Math.round(sec * k) + "s"; w.push({ type: "WEIGHTLIFTING", name: "Weightlifting", start: st, end: st + sec * 1000, offset: OFF, seconds: sec, source: "band", avgHr: 112 + Math.round(rnd() * 16), kcal: Math.round(sec / 60 * (5.2 + rnd() * 1.6)), azm: Math.round(10 + rnd() * 26), zones: { lightTime: z(.5), moderateTime: z(.35), vigorousTime: z(.13), peakTime: z(.02) } }); }
    if ((dow === 2 || dow === 4 || dow === 6) && rnd() < .85) { const km = 4 + rnd() * 5, hr = 150 + Math.round(rnd() * 12) - Math.round((n - i) / 40), sec = km * (350 - (n - 1 - i) * .18 + rnd() * 22); { const st = Date.parse(date + "T00:30:00Z"), z = k => Math.round(sec * k) + "s"; w.push({ type: "RUNNING", name: "Run", start: st, end: st + sec * 1000, offset: OFF, seconds: Math.round(sec), distanceM: km * 1000, paceSecPerKm: sec / km, avgHr: hr, kcal: Math.round(km * 68), zones: { lightTime: z(.1), moderateTime: z(.5), vigorousTime: z(.33), peakTime: z(.07) } }); } }
    if (w.length) r.workouts = w;
    rows.push(r);
  }
  return rows;
}

// Night heart rate at uneven times (every 4-14 s), shaped by stage. Returns [secondsFromSleepStart, bpm].
export function demoSleepHr(day) {
  const rnd = seeded("sleep" + day.date);
  const t0 = Date.parse(day.sleepStages[0][1]) / 1000, base = { AWAKE: 70, REM: 62, LIGHT: 57, DEEP: 52 }, out = []; let w = 0;
  for (const [ty, a, b] of day.sleepStages) { const sa = Date.parse(a) / 1000 - t0, sb = Date.parse(b) / 1000 - t0; for (let s = sa; s < sb; s += 4 + rnd() * 10) { w = w * .985 + (rnd() - .5) * 1.4; out.push([s, base[ty] + w * 2 + Math.sin(s / 700) * 1.2]); } }
  return out;
}
// Year Ring template: a made-up daily score so the look can be judged. The real one is still undefined.
export const demoLifeScore = date => { const d = new Date(date + "T12:00:00"), k = Math.sin(d.getTime() / 864e5 / 5.3) * .25 + Math.sin(d.getTime() / 864e5 / 1.7) * .2 + .55; return Math.max(0, Math.min(1, k)); };

// Heart rate during a run at uneven times: warms up, settles, drifts upward, with a final push.
export function demoRunHr(run) {
  const rnd = seeded("run" + run.start);
  const out = []; let w = 0, endHr = 0; const elapsed = (run.end - run.start) / 1000;
  for (let s = 0; s < elapsed + 180; s += 3 + rnd() * 5) { const p = s / elapsed; w = w * .97 + (rnd() - .5) * 2;
    if (s <= elapsed) { endHr = run.avgHr - 22 * Math.exp(-p * 9) + 10 * p + (p > .88 ? (p - .88) * 90 : 0) + w * 2; out.push([s, endHr]); }
    else out.push([s, endHr - 26 * (1 - Math.exp(-(s - elapsed) / 38)) + w]); }
  return out;
}

// Heart rate during a lifting session: it rises through each set and falls back in the rests.
export function demoGymHr(w) {
  const rnd = seeded("gym" + w.start), out = [], elapsed = (w.end - w.start) / 1000; let endHr = 0;
  for (let s = 0; s < elapsed + 180; s += 4 + rnd() * 4) {
    if (s <= elapsed) { const ph = (s % 190) / 190, set = ph < .38 ? ph / .38 : Math.exp(-(ph - .38) * 3.2); endHr = w.avgHr - 14 + 34 * set + (rnd() - .5) * 6; out.push([s, endHr]); }
    else out.push([s, endHr - 40 * (1 - Math.exp(-(s - elapsed) / 50)) + (rnd() - .5) * 3]);
  }
  return out;
}
