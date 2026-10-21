// DESIGN LANGUAGE: a number is shown in red when its value is bad. Nothing else carries "bad": no bars, no tags.
// This file is the one place that decides what "bad" means. Change a rule here and every card follows.
// Each rule returns true when the value is BAD. Rules are personal standards (your goals and your own baselines), not clinical limits.
export const RULES = {
  sleepQuality:   { bad: v => v < 60,                 text: "Sleep quality score under 60" },
  sleepTime:      { bad: v => v < 460,                text: "Average sleep under your 7 h 40 m need (minutes)" },
  sleepDebtHours: { bad: v => v > 3.5,                text: "More than 3.5 h short over 7 nights (about 30 min a night)" },
  readinessZ:     { bad: v => v < -0.5,               text: "Readiness below -0.5 σ (HRV trend below your usual range)" },
  loadRatio:      { bad: v => v > 1.5 || v < 0.6,     text: "Fatigue ÷ fitness above 1.5 or below 0.6" },
  azmWeek:        { bad: v => v < 150,                text: "Under 150 active zone minutes in 7 days" },
  weeksAt150:     { bad: (v, of) => v < of / 2,       text: "Under half of recent weeks reached 150 minutes" },
  workouts:       { bad: v => v <= 4,                 text: "4 or fewer workouts last week (goal 5–6)" },
  runChange:      { bad: v => v < 0,                  text: "Run form below its reference (negative change)" },
  illnessScore:   { bad: v => v >= 0.6,                text: "Body Check reads Low, Mild or Strong (anything but All clear)" },
  liftChange:     { bad: v => v <= -5,                text: "A lift's estimated 1-rep max is down 5% or more against 4 weeks earlier" },
  heat:           { bad: v => v >= 32,                 text: "Feels like 32 °C (90 °F) or hotter" },
  uv:             { bad: v => v >= 8,                  text: "Peak UV index of 8 or more" },
  wind:           { bad: v => v >= 40,                 text: "Wind of 40 km/h (25 mph) or more" },
  signZ:          { bad: v => v >= 1.0,               text: "An illness-sign deviation of +1.0 or more" },
  vitalOutside:   { bad: (v, lo, hi) => v < lo || v > hi, text: "A vital outside its own 30-day usual range" },
  hrr:            { bad: v => v < 12,                 text: "Heart rate falls less than 12 bpm in the first minute after stopping" },
  vo2Change:      { bad: v => v < -3,                 text: "Cardio fitness down more than 3% in 30 days" },
  weekChange:     { bad: (pct, higherBetter) => (higherBetter ? pct < -5 : pct > 5), text: "A weekly-review figure moved the wrong way by more than 5%" },
  trainingCall:   { bad: v => v === "Rest",           text: "Today's call is Rest" },
  dailyScore:     { bad: v => v < 60,                 text: "A daily score under 60" },
  closeness:      { bad: v => v < 0.6,                text: "Any scored measure under 0.6 of its ideal (sleep measures, Weak Link rows)" }
};
export const bad = (rule, ...a) => (a[0] != null && !Number.isNaN(a[0]) && RULES[rule].bad(...a));
export const red = (rule, ...a) => (bad(rule, ...a) ? "worse" : "");   // the CSS class that turns text red
export const STANDARDS_HTML = "<b>When a number turns red</b>" + Object.values(RULES).map(r => `<p>${r.text}</p>`).join("") + "<p>These are personal standards, not clinical limits.</p>";
