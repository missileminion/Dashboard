// Status report: written by rules (no AI), but built to read like advice from someone who looked at your whole picture.
// It does not run down a checklist. It gathers the facts (sleep, recovery, yesterday's training, sleep debt, the gym split, the weather, the time of day),
// scores what matters most, explains each problem with its likely cause where the data points to one, then turns that into a plan for today.
// Paragraph 1 = what stands out and why (and what is going well). Paragraph 2 = what to do, tonight included.
// Phrasing rotates by date so it does not read the same every day.
import * as A from "./analytics.js";
import { pad } from "./util.js";

const clock = m => `${pad(Math.floor(((m % 1440) + 1440) % 1440 / 60))}:${pad(Math.round(((m % 1440) + 1440) % 1440 % 60) % 60)}`;
const names = { restingHr: "resting heart rate", hrv: "HRV", breathing: "breathing rate", skinTemp: "skin temperature" };
const mean = a => { a = a.filter(v => v != null); return a.length ? a.reduce((x, y) => x + y, 0) / a.length : null; };
const sum = a => a.reduce((x, y) => x + y, 0);
const list = a => a.length < 2 ? a.join("") : a.slice(0, -1).join(", ") + " and " + a[a.length - 1];
const lower = s => (/^[A-Z]{2,}/.test(s) ? s : s.charAt(0).toLowerCase() + s.slice(1));   // leave acronyms like HRV alone
const hrs = h => (h >= 1 ? `${Math.floor(h)} h${Math.round((h % 1) * 60) >= 10 ? " " + Math.round((h % 1) * 60) + " min" : ""}` : `${Math.round(h * 60)} min`);
const SPLIT = ["Legs", "Pull", "Push"];

export function buildReport(c) {
  const { byDate, days, today, addDays, signs, rd, lb, sq, lastNight, sf, sfPrev = null, bed, call, gymEntries = [], wx = null, now = new Date() } = c;
  if (!days.length) return { paras: ["Connect Google Health to see your status report. It writes itself from your sleep, recovery, training and gym data."] };
  const st = lastNight ? A.nightStats(lastNight) : null, T = byDate[today] || {}, Y = byDate[addDays(today, -1)] || {};
  if (!st || !sq) return { paras: ["There is no sleep with stage detail for last night yet. Open the Google Health app on your phone so the band syncs, and this report will fill in."] };
  const seed = Math.floor(new Date(today + "T12:00:00").getTime() / 864e5), pick = (arr, salt = 0) => arr[(seed + salt) % arr.length];
  const hourNow = now.getHours() + now.getMinutes() / 60;

  /* ---------- the facts ---------- */
  const need = A.TARGET.needMin, ideal = A.TARGET.idealMin, wakeT = A.TARGET.wakeMin, tst = st.tst, deficit = need - tst;
  const idealBed = (((wakeT - ideal) % 1440) + 1440) % 1440, lateBy = ((st.onsetMin - idealBed + 720) % 1440 + 1440) % 1440 - 720;   // minutes later than the ideal bedtime
  const wakeOff = st.wakeMin - wakeT, q = sq.score;
  const deep = lastNight.deepMin != null ? lastNight.deepMin / tst : null, rem = lastNight.remMin != null ? lastNight.remMin / tst : null;
  const reg = A.regularity(days.slice(0, days.indexOf(lastNight) + 1));
  const iso = w => new Date(w.start + w.offset * 1000).toISOString().slice(0, 10);
  const allWork = days.flatMap(d => (d.workouts || []).map(w => ({ ...w, date: iso(w) })));
  const yWork = (Y.workouts || []).filter(w => A.isGym(w) || /RUN/i.test(w.type || "")), yMin = sum(yWork.map(w => (w.seconds || 0) / 60));
  const hardYesterday = yMin >= 60 || (lb && lb.ratio > 1.25) || (Y.azm || 0) >= 45;
  const hrvB = A.ewState(d => byDate[d]?.hrv, addDays(today, -1), addDays), rhrB = A.ewState(d => byDate[d]?.restingHr, addDays(today, -1), addDays);
  const dH = T.hrv != null && hrvB ? 100 * (T.hrv - hrvB.mean) / hrvB.mean : null, dR = T.restingHr != null && rhrB ? T.restingHr - rhrB.mean : null;
  const up = signs.parts.filter(p => p.z != null && p.z >= 1.0), drift = signs.parts.filter(p => p.z != null && p.z >= 0.6 && p.z < 1.0);
  const win = (k, end) => mean([...Array(7)].map((_, i) => byDate[addDays(end, -i)]?.[k] ?? null));
  const wkChange = k => { const a = win(k, today), b = win(k, addDays(today, -7)); return a == null || !b ? null : 100 * (a / b - 1); };
  const g7 = A.gymDaysInWindow(byDate, today, 7, addDays);
  // the gym split: what the log says you did last, so today's session is named
  const logDays = {}; gymEntries.forEach(e => { (logDays[e.date] ||= {})[e.day] = (logDays[e.date][e.day] || 0) + 1; });
  const lastLogDate = Object.keys(logDays).filter(d => d <= today).sort().at(-1), lastSplit = lastLogDate ? Object.entries(logDays[lastLogDate]).sort((a, b) => b[1] - a[1])[0][0] : null;
  const planned = A.plannedFor(today), plannedRun = planned === "Run", nextSplit = SPLIT.includes(planned) ? planned : null;   // your fixed weekly plan, not a guess from the log
  const gymToday = (T.workouts || []).some(A.isGym) || A.gymLog.days.has(today), runToday = (T.workouts || []).some(w => /RUN/i.test(w.type || ""));
  const trainedToday = gymToday || runToday;
  const lastGymBand = allWork.filter(w => A.isGym(w)).map(w => w.date).sort().at(-1), lastGymDate = [lastLogDate, lastGymBand].filter(Boolean).sort().at(-1);
  const daysSinceGym = lastGymDate ? Math.round((new Date(today) - new Date(lastGymDate)) / 864e5) : null;
  const lastRunDate = allWork.filter(w => /RUN/i.test(w.type || "")).map(w => w.date).sort().at(-1), daysSinceRun = lastRunDate ? Math.round((new Date(today) - new Date(lastRunDate)) / 864e5) : null;
  const phase = hourNow < 11 ? "morning" : hourNow < 17 ? "day" : hourNow < 21 ? "evening" : "night";

  /* ---------- 1. what is different today: only the things that moved, with the number and the likely cause ---------- */
  // No routine advice and no restating of the plan: the report earns its place by telling you what you would not have noticed.
  const issues = [], good = [];
  const add = (sev, text) => sev > 0.45 && issues.push({ sev, text });
  if (deficit > 20) {
    const cause = lateBy > 40 ? `, asleep only at ${clock(st.onsetMin)}` : st.waso > 40 ? `, with ${Math.round(st.waso)} min awake in the night` : wakeOff < -40 ? ", woken early" : "";
    add(Math.min(3, deficit / 55), `You slept ${hrs(tst / 60)}, ${deficit >= 60 ? hrs(deficit / 60) : Math.round(deficit) + " min"} under your need${cause}.`);
  }
  if (q < 65) add(1 + (65 - q) / 18, deficit > 20 ? `Quality was ${q < 50 ? "poor" : "mediocre"} as well (${Math.round(q)}).` : `Sleep quality was ${Math.round(q)} despite enough hours.`);
  if (deep != null && deep < 0.1 && q >= 65) add(1.0, `Deep sleep was only ${Math.round(deep * 100)}% of the night.`);
  if (rd.z != null && rd.z < -0.5) {
    const bits = [dH != null && dH <= -5 ? `HRV ${Math.round(Math.abs(dH))}% under your usual` : null, dR != null && dR >= 2 ? `resting heart rate ${dR.toFixed(0)} bpm over` : null].filter(Boolean);
    const why = hardYesterday ? `, after ${Math.round(yMin)} min of training yesterday` : deficit > 30 ? ", after the short night" : ", with no training to explain it";
    add(1.2 + Math.min(1.3, -rd.z - 0.5), `Recovery is down${bits.length ? `: ${list(bits)}` : ""}${why}.`);
  }
  if (signs.composite != null && signs.status !== "All clear =)") add(1.8 + (signs.status === "Strong" ? 1 : signs.status === "Mild" ? .5 : 0), `Body check reads ${signs.status.toLowerCase()}: ${list(up.map(p => names[p.key])) || "small shifts across several signals"} off what your training and sleep explain.`);
  else if (signs.strain) add(.7, "Heart rate and HRV are off while breathing and skin temperature are normal, which points to strain, not illness.");
  else if (drift.length) add(.7, `${cap(list(drift.map(p => names[p.key])))} ${drift.length > 1 ? "are" : "is"} creeping up.`);
  if (sf.nights >= 3 && sf.hours > 1.5) add(Math.min(2.4, sf.hours / 1.6), `Sleep debt is ${hrs(sf.hours)}${sfPrev && sfPrev.nights >= 3 && Math.abs(sfPrev.hours - sf.hours) >= 0.2 ? `, ${sf.hours < sfPrev.hours ? "down" : "up"} ${hrs(Math.abs(sfPrev.hours - sf.hours))} since yesterday` : ""}.`);
  const onTarget = lateBy <= 20 && lateBy >= -75;
  if (reg && reg.onsetSd > 60 && !onTarget) add(1.0, `Bedtimes have swung by about ${Math.round(reg.onsetSd)} min over two weeks.`);
  if (Math.abs(wakeOff) > 45 && wakeOff > 0 && lateBy <= 40) add(.9, `You woke ${Math.round(wakeOff)} min after your ${clock(wakeT)} target.`);
  const sleepTrend = wkChange("sleepMin"), hrvTrend = wkChange("hrv"), rhrTrend = wkChange("restingHr");
  const worse = [sleepTrend != null && sleepTrend <= -5 ? "sleep time" : null, hrvTrend != null && hrvTrend <= -5 ? "HRV" : null, rhrTrend != null && rhrTrend >= 5 ? "resting heart rate" : null].filter(Boolean);
  if (worse.length) add(.9 + (worse.length - 1) * .3, `${cap(list(worse))} ${worse.length > 1 ? "have" : "has"} slipped against the week before.`);
  if (lb && lb.ratio > 1.5) add(1.5, "Training load is well above what you are adapted to.");
  else if (lb && lb.ratio < 0.6) add(.8, "Training load has dropped well below your usual.");
  if (g7 != null && g7 <= 3 && !(daysSinceGym === 0)) add(1.0 + (g7 <= 2 ? .4 : 0), `Only ${g7} gym day${g7 === 1 ? "" : "s"} in the last 7.`);
  issues.sort((a, b) => b.sev - a.sev);

  // one good thing, and only when it is news
  const debtDrop = sfPrev && sfPrev.nights >= 3 ? sfPrev.hours - sf.hours : 0;
  if (debtDrop >= 0.5 && !(sf.nights >= 3 && sf.hours > 1.5)) good.push(`sleep debt fell by ${hrs(debtDrop)}`);
  if (onTarget && deficit <= 20 && q >= 75 && !issues.some(i => /bed|asleep/i.test(i.text))) good.push(`you were asleep by ${clock(st.onsetMin)}, on your ${clock(idealBed)} target`);
  if (rd.z != null && rd.z >= 0.8) good.push("recovery is well above your usual");
  const top = issues.slice(0, 2), p1 = top.map(i => i.text);
  if (!top.length) p1.push("Nothing stands out today.");
  if (good.length) p1.push(cap(good[0]) + ".");
  const para1 = p1.join(" ");

  /* ---------- 2. what to change: only departures from your plan ---------- */
  const act = [], rainText = r => `${String(r.start).padStart(2, "0")}:00 to ${String(r.end).padStart(2, "0")}:00`;
  const hot = wx && wx.feelsMax >= 30, rainNow = wx?.rain?.find(r => r.end > hourNow && r.peak >= 50);
  const session = plannedRun ? "run" : nextSplit ? nextSplit.toLowerCase() + " day" : "session";
  if (!trainedToday && phase !== "night") {
    if (call?.call === "Rest") act.push(`Skip today's ${session} and move easy; it can wait.`);
    else if (call?.call === "Steady") act.push(`${cap(session)} as planned, ${plannedRun ? "easy pace only" : "a rep or two short of failure"}.`);
    else if (plannedRun || nextSplit) act.push(`${cap(session)} as planned.`);
    if (plannedRun && wx) {
      if (hot) act.push(`Heat reaches ${wx.feelsMax}° feels-like, so run early or late.`);
      else if (rainNow) act.push(`Rain ${rainText(rainNow)}, so run outside that window.`);
      else if (wx.bestRun) act.push(`Best window: ${wx.bestRun.day} ${wx.bestRun.time}, about ${wx.bestRun.feel}°.`);
    }
  }
  const usual = (((wakeT - ideal) % 1440) + 1440) % 1440, early = ((usual - bed.minutes + 720) % 1440 + 1440) % 1440 - 720;   // minutes earlier than your usual bedtime
  if (early >= 15) act.push(`Bed by ${clock(bed.minutes)}, ${Math.round(early)} min earlier than usual, to pay down the debt.`);
  if (!byDate[today]) act.push("Nothing from the band is recorded for today yet; sync it for a fuller read.");
  const para2 = act.join(" ");
  return { paras: [para1, para2].filter(Boolean).map(p => p.replace(/\s+/g, " ")) };
}
function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
