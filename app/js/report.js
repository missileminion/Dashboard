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
  const { byDate, days, today, addDays, signs, rd, lb, sq, lastNight, sf, bed, call, gymEntries = [], wx = null, now = new Date() } = c;
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
  const nextSplit = lastSplit && SPLIT.includes(lastSplit) ? SPLIT[(SPLIT.indexOf(lastSplit) + 1) % 3] : null;
  const gymToday = (T.workouts || []).some(A.isGym) || A.gymLog.days.has(today), runToday = (T.workouts || []).some(w => /RUN/i.test(w.type || ""));
  const trainedToday = gymToday || runToday;
  const lastGymBand = allWork.filter(w => A.isGym(w)).map(w => w.date).sort().at(-1), lastGymDate = [lastLogDate, lastGymBand].filter(Boolean).sort().at(-1);
  const daysSinceGym = lastGymDate ? Math.round((new Date(today) - new Date(lastGymDate)) / 864e5) : null;
  const lastRunDate = allWork.filter(w => /RUN/i.test(w.type || "")).map(w => w.date).sort().at(-1), daysSinceRun = lastRunDate ? Math.round((new Date(today) - new Date(lastRunDate)) / 864e5) : null;
  const phase = hourNow < 11 ? "morning" : hourNow < 17 ? "day" : hourNow < 21 ? "evening" : "night";

  /* ---------- 1. what stands out: each problem scored, with its likely cause ---------- */
  const issues = [], good = [];
  const add = (sev, text) => sev > 0.45 && issues.push({ sev, text });
  if (deficit > 20) {
    const cause = lateBy > 40 ? ` The main reason is a late start: you fell asleep around ${clock(st.onsetMin)} when the plan is ${clock(idealBed)}.`
      : st.waso > 40 ? ` It was also broken up, with about ${Math.round(st.waso)} minutes awake in the night.` : wakeOff < -40 ? " You woke well before your alarm window." : "";
    add(Math.min(3, deficit / 55), `You slept ${hrs(tst / 60)}, ${deficit >= 60 ? hrs(deficit / 60) : Math.round(deficit) + " minutes"} short of what you need.${cause}`);
  }
  if (q < 65) add(1 + (65 - q) / 18, deficit > 20
    ? pick([`The quality was ${q < 50 ? "poor" : "mediocre"} too, so the hours you did get restored less than they should have.`, `And the sleep you got was ${q < 50 ? "poor" : "mediocre"}, which makes the shortfall count for more.`], 1)
    : pick([`Sleep quality was ${q < 50 ? "poor" : "so-so"} even though the night was long enough, which usually points to what happened before bed or in the room.`, `The sleep itself was ${q < 50 ? "poor" : "mediocre"}, so the hours alone will not have restored you fully.`], 1));
  if (deep != null && deep < 0.1 && q >= 65) add(1.0, "Deep sleep was thin, the part that does most of the physical repair. Alcohol, a late meal or a very late workout are the usual causes.");
  if (rd.z != null && rd.z < -0.5) {
    const bits = [dH != null && dH <= -5 ? "HRV is lower than usual" : null, dR != null && dR >= 2 ? "resting heart rate is higher" : null].filter(Boolean);
    const why = hardYesterday ? `, which fits yesterday's hard training (${Math.round(yMin)} minutes of work)` : deficit > 30 ? ", which fits the short night" : ", and nothing in your recent training explains it";
    add(1.2 + Math.min(1.3, -rd.z - 0.5), `Your recovery is below your usual${bits.length ? `: ${list(bits)}` : ""}${why}.`);
  }
  if (signs.composite != null && signs.status !== "All clear =)") add(1.8 + (signs.status === "Strong" ? 1 : signs.status === "Mild" ? .5 : 0), `Body check reads ${signs.status.toLowerCase()}: ${list(up.map(p => names[p.key])) || "small shifts across several signals"} ${signs.ctx ? "do not match what your recent training and sleep explain" : "are off your normal"}. That can be illness, alcohol or stress, and the band cannot tell which.`);
  else if (drift.length) add(.7, `${cap(list(drift.map(p => names[p.key])))} ${drift.length > 1 ? "are" : "is"} drifting from your normal${signs.ctx ? ", beyond what your training explains" : ""}. Not a problem yet, but it is the first thing to move when you are getting ill or run down.`);
  if (sf.nights >= 3 && sf.hours > 1.5) add(Math.min(2.4, sf.hours / 1.6), `You are carrying about ${hrs(sf.hours)} of sleep debt over the last ${sf.nights} nights${sf.hours > 3.5 ? ", which is large enough to dull training and mood" : ""}.`);
  if (reg && reg.onsetSd > 60) add(1.0, "Your bedtimes have been all over the place lately, and an irregular schedule makes every night worse than the hours suggest.");
  if (Math.abs(wakeOff) > 45 && wakeOff > 0 && lateBy <= 40) add(.9, `You woke ${Math.round(wakeOff)} minutes later than your ${clock(wakeT)} target.`);
  const sleepTrend = wkChange("sleepMin"), hrvTrend = wkChange("hrv"), rhrTrend = wkChange("restingHr");
  const worse = [sleepTrend != null && sleepTrend <= -5 ? "sleep time" : null, hrvTrend != null && hrvTrend <= -5 ? "HRV" : null, rhrTrend != null && rhrTrend >= 5 ? "resting heart rate" : null].filter(Boolean);
  if (worse.length) add(.9 + (worse.length - 1) * .3, `Over the last week ${list(worse)} ${worse.length > 1 ? "have" : "has"} moved the wrong way compared with the week before.`);
  if (lb && lb.ratio > 1.5) add(1.5, "Your training load is well above what your body is adapted to, so the next few days should be lighter than they feel like they could be.");
  else if (lb && lb.ratio < 0.6) add(.8, "Your training load has dropped well below your usual, so you are losing some fitness.");
  if (g7 != null && g7 <= 3 && !(daysSinceGym === 0)) add(1.0 + (g7 <= 2 ? .4 : 0), `Only ${g7} gym day${g7 === 1 ? "" : "s"} in the last 7${daysSinceGym != null && daysSinceGym >= 2 ? `, and it has been ${daysSinceGym} days since the last session` : ""}.`);
  issues.sort((a, b) => b.sev - a.sev);

  if (g7 != null && g7 >= 5) good.push(pick(["you are on pace in the gym", "the gym habit is holding"], 2));
  if (lateBy <= 20 && lateBy >= -75) good.unshift(lateBy <= 0 ? `you were asleep by ${clock(st.onsetMin)}, ahead of your ${clock(idealBed)} target` : `you were asleep by ${clock(st.onsetMin)}, right on your ${clock(idealBed)} target`);
  if (reg && reg.onsetSd <= 30) good.push("your bedtimes have been steady");
  if (dH != null && dH >= 5 && (dR == null || dR <= 1)) good.push("HRV is above your usual");
  if (q >= 80 && deficit <= 20) good.push("last night's sleep was both long enough and good quality");
  if (rd.z != null && rd.z >= 0.5) good.push("recovery is better than your usual");
  if (signs.status === "All clear =)" && !drift.length) good.push("your body-check signals are all steady");
  const top = issues.slice(0, 3), p1 = [];
  if (!top.length) p1.push(pick(["Nothing needs fixing this morning.", "You are in good shape today.", "No red flags in this morning's numbers."], 3));
  else { p1.push(top[0].text); if (top[1]) p1.push(pick(["On top of that, ", "Also, ", "Related to that, "], 4) + lower(top[1].text)); if (top[2]) p1.push(pick(["And ", "One more thing: "], 5) + lower(top[2].text)); }
  if (good.length) p1.push((top.length ? "On the plus side, " : "") + list(good.slice(0, 2)) + ".");
  const para1 = p1.map((s, i) => (i === p1.length - 1 && good.length ? cap(s) : s)).join(" ");

  /* ---------- 2. what to do: training, then sleep, then the rest, shaped by the call, the weather and the time of day ---------- */
  const act = [], rainText = r => `${String(r.start).padStart(2, "0")}:00 to ${String(r.end).padStart(2, "0")}:00`;
  const hot = wx && wx.feelsMax >= 30, rainNow = wx?.rain?.find(r => r.end > hourNow && r.peak >= 50);
  const session = nextSplit ? `your ${nextSplit.toLowerCase()} day` : "your gym session";
  if (phase === "night") act.push("It is late, so the plan for today is simply to wind down: screens away, lights low, and get to bed.");
  else if (trainedToday) act.push(`You have already trained today (${list([gymToday ? "the gym" : null, runToday ? "a run" : null].filter(Boolean))}), so the job now is recovery: eat a proper meal with protein, drink water, and keep the evening easy so tonight's sleep does the repair.`);
  else if (call?.call === "Rest") act.push(`Take today as a rest day. ${pick(["A 20 to 30 minute walk and some stretching is plenty.", "Easy movement only: a walk, mobility work, maybe a swim.", "Keep it to a short walk and an early night."], 6)}${nextSplit ? ` Your ${nextSplit.toLowerCase()} day can wait until you are back to normal.` : ""}`);
  else if (call?.call === "Steady") act.push(`Train, but keep it controlled: ${session} at your normal working weights, leaving one or two reps in the tank on every set and skipping any all-out efforts.${daysSinceRun != null && daysSinceRun >= 3 ? " If you run instead, make it an easy, conversational pace." : ""}`);
  else act.push(`You can push today: ${session} is a good place to chase a top set${daysSinceGym != null && daysSinceGym >= 3 ? ", and it has been a few days since you last lifted" : ""}.${daysSinceRun != null && daysSinceRun >= 3 ? " A run fits too, as it has been " + daysSinceRun + " days." : ""}`);
  if (!trainedToday && phase !== "night" && wx && call?.call !== "Rest") {
    if (hot) act.push(`It gets hot (up to ${wx.feelsMax}° feels-like), so train early or after the heat and take water.`);
    else if (rainNow) act.push(`Rain is expected from ${rainText(rainNow)}, so fit the session in before then or go indoors.`);
    else if (wx.bestRun && call?.call !== "Rest" && (daysSinceRun == null || daysSinceRun >= 2)) act.push(`If you run, the best window is ${wx.bestRun.day} at ${wx.bestRun.time} (about ${wx.bestRun.feel}°, ${wx.bestRun.rain}% chance of rain).`);
  }
  // sleep: one specific tip chosen for what actually went wrong, then tonight's bedtime
  let tip = null;
  if (lateBy > 40) tip = pick(["Getting outside in bright light within an hour of waking, and putting screens away 45 minutes before bed, pulls bedtime earlier over a few days.", "Set a hard phone-down time about 45 minutes before bed; late scrolling is the most common reason bedtime slips."], 7);
  else if (st.waso > 40 || q < 65) tip = pick(["Keep the room cool and dark, and have the last coffee at least 8 hours before bed.", "Try no alcohol tonight and a lighter, earlier dinner; both cut restlessness and give deep sleep back."], 8);
  else if (deep != null && deep < 0.1) tip = "Finish hard training a few hours before bed and skip alcohol tonight to give deep sleep a chance.";
  else if (reg && reg.onsetSd > 60) tip = `Pick one bedtime, ${clock(bed.minutes)}, and hold it even on weekends for a week.`;
  const nights = sf.hours > 1.5 ? Math.max(2, Math.min(7, Math.ceil(sf.hours / .75))) : 0;
  if (phase !== "night" || !tip) {
    const bedLine = nights && !(phase === "night") ? `Be in bed by ${clock(bed.minutes)} tonight${bed.extra ? ", which includes some catch-up" : ""}; repeat that for about ${nights} nights and the ${hrs(sf.hours)} of debt is gone.` : `Aim to be in bed by ${clock(bed.minutes)} tonight.`;
    act.push(tip ? `${tip} ${bedLine}` : bedLine);
  } else act.push(`${tip} Aim for ${clock(bed.minutes)} tomorrow night.`);
  if (rd.z != null && rd.z < -0.5 && !trainedToday && call?.call !== "Rest") act.push("Eat enough and drink water today; recovery is the weak spot, so food and fluids matter more than usual.");
  if (signs.status !== "All clear =)" && signs.composite != null) act.push("If you also feel run down or scratchy, treat that as a reason to back off for a day instead of pushing through.");
  if (!byDate[today]) act.push("Nothing from the band is recorded for today yet; sync it from the Google Health app for a fuller read.");
  const para2 = act.join(" ");
  return { paras: [para1, para2].filter(Boolean).map(p => p.replace(/\s+/g, " ")) };
}
function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
