// Status report: two short paragraphs written by rules (no AI), in words rather than numbers, all in light grey.
// Paragraph 1 = the problems found. Paragraph 2 = the course of action that answers them.
// Wording scales with how big a change is and which signals agree.
import * as A from "./analytics.js";
import { pad } from "./util.js";

const clock = m => `${pad(Math.floor(m / 60) % 24)}:${pad(Math.round(m % 60) % 60)}`;
const names = { restingHr: "resting heart rate", hrv: "HRV", breathing: "breathing rate", skinTemp: "skin temperature" };
const mean = a => { a = a.filter(v => v != null); return a.length ? a.reduce((x, y) => x + y, 0) / a.length : null; };
const list = a => a.length < 2 ? a.join("") : a.slice(0, -1).join(", ") + " and " + a[a.length - 1];

export function buildReport(c) {
  const { byDate, days, today, addDays, signs, rd, lb, sq, lastNight, sf, bed, call } = c;
  const st = lastNight ? A.nightStats(lastNight) : null, T = byDate[today] || {};
  const base = k => A.ewState(d => byDate[d]?.[k], addDays(today, -1), addDays);
  const hrvB = base("hrv"), rhrB = base("restingHr");
  const win = (k, end) => mean([...Array(7)].map((_, i) => byDate[addDays(end, -i)]?.[k] ?? null));
  const prob = [], act = [], flags = new Set();

  // ---------- problems ----------
  if (st && sq) {
    const need = A.TARGET.needMin, ideal = A.TARGET.idealMin, tst = st.tst, q = sq.score;
    if (tst < need) { flags.add("short"); prob.push(tst >= need - 60 ? "you slept a little under what you need" : "you slept far less than you need"); }
    if (q < 65) { flags.add("quality"); prob.push(q < 50 ? "the quality of your sleep was poor" : "the quality of your sleep was mediocre"); }
    if (st.waso > 45) { flags.add("broken"); prob.push("your sleep was restless"); }
    else if (st.waso > 20) prob.push("your sleep was a little broken");
    const off = st.wakeMin - A.TARGET.wakeMin;
    if (Math.abs(off) > 45) { flags.add(off > 0 ? "late" : "early"); prob.push(off > 0 ? "you woke much later than planned" : "you woke much earlier than planned"); }
    const rem = lastNight.remMin != null ? lastNight.remMin / tst : null, deep = lastNight.deepMin != null ? lastNight.deepMin / tst : null;
    if (deep != null && deep < 0.1) { flags.add("stages"); prob.push("deep sleep was low"); }
    if (rem != null && rem < 0.17) { flags.add("stages"); prob.push("REM was low"); }
    const reg = A.regularity(days.slice(0, days.indexOf(lastNight) + 1));
    if (reg && reg.onsetSd > 60) { flags.add("erratic"); prob.push("your bedtimes have been erratic"); }
  }
  const dH = T.hrv != null && hrvB ? 100 * (T.hrv - hrvB.mean) / hrvB.mean : null, dR = T.restingHr != null && rhrB ? T.restingHr - rhrB.mean : null;
  if (rd.z != null && rd.z < -0.5) {
    flags.add("recovery");
    const bits = [];
    if (dH != null && dH <= -5) bits.push("HRV is down");
    if (dR != null && dR >= 2) bits.push("resting heart rate is up");
    prob.push(`your recovery is ${rd.z < -1.5 ? "well below" : "below"} your usual${bits.length ? ` (${list(bits)})` : ""}`);
    if (dR != null && dH != null && dR >= 2 && dH < -10) prob.push("heart rate up with HRV down together points to strain on the body");
  }
  const up = signs.parts.filter(p => p.z != null && p.z >= 0.8);
  if (signs.composite != null) {
    if (signs.status !== "All clear =)") { flags.add("body"); prob.push(`Body check reads ${signs.status.toLowerCase()} (${list(up.map(p => names[p.key])) || "small shifts across signals"})${signs.ctx ? " that your recent training and sleep do not explain" : ""}, which can mean illness, alcohol or stress`); }
    else if (up.length) { flags.add("drift"); prob.push(`${list(up.map(p => names[p.key]))} ${up.length > 1 ? "are" : "is"} drifting`); }
  }
  const tr = [["sleep", "sleepMin", false], ["HRV", "hrv", false], ["resting heart rate", "restingHr", true]].map(([n, k, inv]) => { const a = win(k, today), b = win(k, addDays(today, -7)); if (a == null || !b) return null; const p = 100 * (a / b - 1); return Math.abs(p) < 5 || !(inv ? p > 0 : p < 0) ? null : `${n} is ${p > 0 ? "up" : "down"} on last week`; }).filter(Boolean);
  if (tr.length) { flags.add("trend"); prob.push(list(tr)); }
  if (lb) {
    if (lb.ratio > 1.5) { flags.add("loadHigh"); prob.push("your training load is well above what you're adapted to"); }
    else if (lb.ratio > 1.2) prob.push("your training load is a little high");
    else if (lb.ratio < 0.6) { flags.add("loadLow"); prob.push("your training load has dropped well below your usual"); }
  }
  if (sf.nights >= 3) {
    if (sf.hours > 3.5) { flags.add("debt"); prob.push("your sleep debt is large"); }
    else if (sf.hours > 1.5) { flags.add("debt"); prob.push("you are carrying some sleep debt"); }
  }
  const g7 = A.gymDaysInWindow(byDate, today, 7, addDays);
  if (g7 != null && g7 <= 3) { flags.add("gym"); prob.push("gym has been light this week"); }

  const p1 = !st || !sq ? "There is no sleep with stage detail for last night yet, so open the Google Health app to sync the band."
    : prob.length ? `The main problems: ${list(prob)}.`
    : "No problems stand out: sleep, recovery and your recent trends are all within your normal range.";

  // ---------- course of action ----------
  const did = (T.workouts || []).filter(w => A.isGym(w) || /RUN/i.test(w.type || "")).map(w => (/RUN/i.test(w.type || "") ? "a run" : "a gym session"));
  if (!did.includes("a gym session") && A.gymLog.days.has(today)) did.push("a gym session");
  if (did.length) act.push(`You have already done ${list(did)} today, so today's training is done: refuel, drink water and protect tonight's sleep.`);
  else if (call) {
    const guide = { Push: "a harder session is fine", Steady: "keep it moderate and skip maximal efforts", Rest: "put recovery first with easy movement" }[call.call];
    act.push(`Today's call is <b>${call.call}</b>: ${guide}.`);
  }
  if (flags.has("body")) act.push("Treat today with care: skip hard intensity, drink plenty and watch for symptoms.");
  else if (flags.has("drift")) act.push("Keep an eye on the drifting signals and avoid alcohol and late caffeine today.");
  if (flags.has("loadHigh")) act.push("Cut volume or intensity for a few days until your load settles.");
  if (flags.has("loadLow")) act.push("Add a session or two to bring your training back up.");
  if (flags.has("gym")) act.push("Get your remaining gym sessions in this week.");
  if (flags.has("broken") || flags.has("quality") || flags.has("stages")) act.push("To sleep deeper, keep the room cool and dark and avoid alcohol and late caffeine.");
  if (flags.has("erratic") || flags.has("late") || flags.has("early")) act.push(`Anchor your wake time at ${clock(A.TARGET.wakeMin)} every day, weekends included, to steady your schedule.`);
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
  if (bed) act.push(nowMin >= bed.minutes - 60 && nowMin <= bed.minutes + 150 ? `It is nearly bedtime (<b>${clock(bed.minutes)}</b>): start winding down and put screens away.` : `Aim to be in bed by <b>${clock(bed.minutes)}</b>${bed.extra || flags.has("short") || flags.has("debt") ? " to start paying back sleep" : ""}.`);
  if (!act.length) act.push("Carry on as normal.");
  if (!byDate[today]) act.push("Nothing is recorded for today yet.");
  return { paras: [p1, act.join(" ")] };
}
