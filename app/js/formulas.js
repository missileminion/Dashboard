// Score formulas. Each takes the cached daily rows (oldest first) and returns a number, or null while undefined.
// Null shows as a gap on the dashboard, never as zero. Fill these in when the equations are decided.
// Row fields: date, steps, restingHr, hrv, sleepMin, deepMin, lightMin, remMin, awakeMin, sleepStages, spo2,
// breathing, skinTempDelta, azm, zones, workouts.
export const formulas = {
  readiness: days => null,          // 0-100
  sleepQuality: (day, days) => null, // 0-100 for one night
  sleepNeed: days => null,           // minutes needed tonight
  sleepDebt: days => null,           // minutes
  sleepConsistency: days => null,    // 0-100
  strain: (day, days) => null,       // load for one day
  acuteChronic: days => null,        // ratio, 7-day vs 28-day load
  overallHealth: days => null,       // 0-100
  dailyLife: date => null            // 0-1 for the Year Ring: how well one day went (undefined for now)
};
