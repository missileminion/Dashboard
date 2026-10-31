// The command library: about 130 small commands for the console, in 14 groups. Every one reads your own data or does plain arithmetic; nothing leaves the page. Charts are dot-matrix (dots.js); a chart line is {node, text} and a link to a page is {buttons:[{label, go}]}.
// buildLibrary(ctx) returns { cmds, meta }. meta drives help, Tab completion, "did you mean" and the blue highlighting of recognised commands.
import { esc, addDays, ymd, n3 } from "./util.js";
import { PROGRAM, e1rm } from "./gymlog.js";
import { sunPos } from "./sky.js";
import { moonState } from "./moon.js";
import { addMore } from "./library2.js";
import { dotCols, dotHBars, dotStack, C } from "./dots.js";

const pad = n => String(n).padStart(2, "0"), hmm = m => (m == null ? "—" : `${Math.floor(m / 60)}h ${pad(Math.round(m % 60) % 60)}m`);
const num = v => (v == null || Number.isNaN(v) ? null : +v), nn = a => a.filter(v => v != null && !Number.isNaN(v));
const mean = a => { a = nn(a); return a.length ? a.reduce((x, y) => x + y, 0) / a.length : null; };
const sdev = a => { a = nn(a); if (a.length < 2) return null; const m = mean(a); return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1)); };
const trim = (v, d = 2) => String(+(+v).toFixed(d)), thou = v => Math.round(v).toLocaleString("en-US");
const chart = (node, text = "") => ({ node, text }), link = (go, label) => ({ buttons: [{ label, go }] }), PAGES = { buttons: [{ label: "Health", go: "health" }, { label: "Productivity", go: "prod" }, { label: "Gym log", go: "gym" }, { label: "Calendar", go: "cal" }] };
const clk = s => { s = Math.max(0, Math.round(s)); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return h ? `${h}:${pad(m)}:${pad(x)}` : `${pad(m)}:${pad(x)}`; };
const secT = s => { s = Math.round(s); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return h ? `${h}:${pad(m)}:${pad(x)}` : `${m}:${pad(x)}`; };
const rd = (s, b) => (b ? `<span class="tm-red">${esc(s)}</span>` : esc(s));
const html = s => ({ html: s });
const U = m => { throw new Error(m); };
const slope = ys => { const p = ys.map((y, x) => [x, y]).filter(q => q[1] != null); if (p.length < 3) return null; const mx = mean(p.map(q => q[0])), my = mean(p.map(q => q[1])); const den = p.reduce((s, q) => s + (q[0] - mx) ** 2, 0); return den ? p.reduce((s, q) => s + (q[0] - mx) * (q[1] - my), 0) / den : null; };
const dayName = s => new Date(s + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", day: "numeric" });

export function dist(a, b) { const m = a.length, n = b.length, d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]); for (let j = 1; j <= n; j++) d[0][j] = j; for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return d[m][n]; }

// a typed exercise name ("bench", "lat pull", "rdl") matched against yours, best first
const SYN = { bench: ["chest press", "incline", "press"], ohp: ["shoulder press"], pullup: ["pull-up", "pulldown"], chinup: ["pulldown"], lat: ["pulldown", "lat"], squat: ["squat", "leg press"], quad: ["extension"], quads: ["extension"], ham: ["curl"], hams: ["curl"], hamstring: ["curl"], calf: ["calf"], calves: ["calf"], bicep: ["curl"], biceps: ["curl"], tricep: ["triceps"], delt: ["lateral", "raise"], delts: ["lateral", "raise"], abs: ["crunch", "raise"], glute: ["hip thrust"], glutes: ["hip thrust"], back: ["row", "pulldown"], shrug: ["shrug"], fly: ["fly", "pec deck"], flys: ["fly", "pec deck"] };
export function rankExercises(text, entries) {
  const q = text.toLowerCase().split(/\s+/).filter(Boolean); if (!q.length) return [];
  const names = [...new Map([...Object.entries(PROGRAM).flatMap(([day, l]) => l.map(([n]) => [n, day])), ...entries.map(e => [e.exercise, e.day])]).entries()], forms = w => [w, ...(SYN[w] || [])];
  const score = n => { const low = n.toLowerCase(), hit = q.filter(w => forms(w).some(f => low.includes(f))).length; if (hit === q.length) return 100 + hit * 10 - low.length / 10 + (low.includes(q.join(" ")) ? 45 : 0) + (low.startsWith(q[0]) ? 8 : 0); const fuzzy = q.filter(w => low.split(/[^a-z0-9]+/).some(t => dist(w, t) <= (w.length > 4 ? 2 : 1))).length; return fuzzy === q.length ? 50 + fuzzy * 5 - low.length / 10 : 0; };
  return names.map(([n, day]) => ({ n, day, sc: score(n) })).filter(x => x.sc > 0).sort((a, b) => b.sc - a.sc);
}

/* ---------- units ---------- */
const UNITS = {
  length: { m: 1, km: 1000, cm: .01, mm: .001, mi: 1609.344, yd: .9144, ft: .3048, in: .0254, nmi: 1852 },
  mass: { kg: 1, g: .001, mg: 1e-6, lb: .45359237, oz: .028349523125, st: 6.35029318, t: 1000 },
  volume: { l: 1, ml: .001, gal: 3.785411784, qt: .946352946, pt: .473176473, cup: .2365882365, floz: .0295735296, tbsp: .01478676478, tsp: .00492892159 },
  time: { s: 1, min: 60, h: 3600, d: 86400, wk: 604800, yr: 31557600 },
  speed: { ms: 1, kmh: 1 / 3.6, mph: .44704, kn: .514444444 },
  data: { b: 1, kb: 1e3, mb: 1e6, gb: 1e9, tb: 1e12, kib: 1024, mib: 1048576, gib: 1073741824 },
  energy: { j: 1, kj: 1000, cal: 4.184, kcal: 4184, wh: 3600, kwh: 3.6e6 },
  area: { m2: 1, km2: 1e6, cm2: 1e-4, ha: 1e4, acre: 4046.8564224, ft2: .09290304, mi2: 2589988.110336 }
};
const UALIAS = { meter: "m", meters: "m", metre: "m", metres: "m", kilometer: "km", kilometers: "km", kilometre: "km", kilometres: "km", centimeter: "cm", centimeters: "cm", millimeter: "mm", millimeters: "mm", mile: "mi", miles: "mi", yard: "yd", yards: "yd", foot: "ft", feet: "ft", inch: "in", inches: "in", '"': "in", "'": "ft",
  gram: "g", grams: "g", kilogram: "kg", kilograms: "kg", kilo: "kg", kilos: "kg", pound: "lb", pounds: "lb", lbs: "lb", ounce: "oz", ounces: "oz", stone: "st", tonne: "t", litre: "l", litres: "l", liter: "l", liters: "l", gallon: "gal", gallons: "gal", cups: "cup", tablespoon: "tbsp", teaspoon: "tsp",
  sec: "s", secs: "s", second: "s", seconds: "s", mins: "min", minute: "min", minutes: "min", hr: "h", hrs: "h", hour: "h", hours: "h", day: "d", days: "d", week: "wk", weeks: "wk", year: "yr", years: "yr",
  "km/h": "kmh", kph: "kmh", "m/s": "ms", "mi/h": "mph", knot: "kn", knots: "kn", byte: "b", bytes: "b", kib: "kib", joule: "j", joules: "j", calorie: "cal", calories: "cal", kilocalorie: "kcal", kilocalories: "kcal", celsius: "c", "°c": "c", fahrenheit: "f", "°f": "f", kelvin: "k", sqm: "m2", hectare: "ha", acres: "acre" };
const unitOf = u => { u = u.toLowerCase(); u = UALIAS[u] || u; if (["c", "f", "k"].includes(u)) return { cat: "temp", u }; for (const [cat, t] of Object.entries(UNITS)) if (u in t) return { cat, u }; const s = u.replace(/s$/, ""); if (s !== u) return unitOf(s); return null; };
const toTemp = (v, from, to) => { const c = from === "c" ? v : from === "f" ? (v - 32) * 5 / 9 : v - 273.15; return to === "c" ? c : to === "f" ? c * 9 / 5 + 32 : c + 273.15; };

const parseDist = t => { t = t.toLowerCase(); const N = { half: 21.0975, hm: 21.0975, halfmarathon: 21.0975, marathon: 42.195, mara: 42.195, mile: 1.609344 }; if (t in N) return N[t]; const m = t.match(/^(\d+(?:\.\d+)?)(k|km|m|mi|mile|miles)?$/); if (!m) return null; const v = +m[1]; return !m[2] || m[2] === "k" || m[2] === "km" ? v : m[2] === "m" ? v / 1000 : v * 1.609344; };
const parseClock = t => { if (!t) return null; t = t.toLowerCase(); let m = t.match(/^(\d+):(\d{2}):(\d{2})$/); if (m) return +m[1] * 3600 + +m[2] * 60 + +m[3]; m = t.match(/^(\d+):(\d{2})$/); if (m) return +m[1] * 60 + +m[2]; m = t.match(/^(?:(\d+(?:\.\d+)?)h)?(?:(\d+(?:\.\d+)?)m(?:in)?)?(?:(\d+(?:\.\d+)?)s)?$/); if (m && (m[1] || m[2] || m[3])) return (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0); if (/^\d+(\.\d+)?$/.test(t)) return +t * 60; return null; };

const ZONES = { tokyo: "Asia/Tokyo", london: "Europe/London", paris: "Europe/Paris", berlin: "Europe/Berlin", rome: "Europe/Rome", madrid: "Europe/Madrid", moscow: "Europe/Moscow", dubai: "Asia/Dubai", delhi: "Asia/Kolkata", mumbai: "Asia/Kolkata", bangkok: "Asia/Bangkok", singapore: "Asia/Singapore", "hong kong": "Asia/Hong_Kong", seoul: "Asia/Seoul", beijing: "Asia/Shanghai", shanghai: "Asia/Shanghai", sydney: "Australia/Sydney", auckland: "Pacific/Auckland", ny: "America/New_York", nyc: "America/New_York", "new york": "America/New_York", boston: "America/New_York", chicago: "America/Chicago", denver: "America/Denver", la: "America/Los_Angeles", "los angeles": "America/Los_Angeles", sf: "America/Los_Angeles", seattle: "America/Los_Angeles", toronto: "America/Toronto", vancouver: "America/Vancouver", mexico: "America/Mexico_City", "sao paulo": "America/Sao_Paulo", cairo: "Africa/Cairo", lagos: "Africa/Lagos", johannesburg: "Africa/Johannesburg", istanbul: "Europe/Istanbul", utc: "UTC", gmt: "UTC" };

const GROUPS = { log: "Log", gym: "Gym log", health: "Health numbers", body: "Body and recovery", cal: "Calendar", tasks: "Stickynote", timer: "Timers", time: "Time and dates", convert: "Convert and pace", fit: "Fitness calculators", math: "Math tools", rand: "Random", text: "Text tools", sys: "Console" };
export { GROUPS };

export function buildLibrary(c) {
  const { print, err, dim, ask, choose, A, calc, today, undos, parseWhen, fmtDay, hhmm, midnight, addDaysD, loadWeights, setWeight, delWeight, call, log, bottom, lastOut, history, aliases, names, timers } = c;
  const L = {}, meta = [];
  const def = (cat, nm, use, d, fn) => { const [n, ...al] = nm.split(" "); L[n] = fn; meta.push({ n, cat, use, d, al }); };
  const H = () => { const h = A.health && A.health(); if (!h || !h.days || !h.days.length) U("the health numbers are not loaded yet."); return h; };
  const gymApi = () => { const g = A.gym && A.gym(); if (!g) U("the gym log is not ready yet."); return g; };
  const calApi = () => A.cal || U("the calendar is not ready yet."), tasksApi = () => (A.tasks && A.tasks.text ? A.tasks : U("Stickynote is not ready yet."));
  const nums = s => (s.match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
  const allNums = s => { const t = s.replace(/,/g, " ").trim().split(/\s+/).filter(Boolean); return t.length && t.every(x => /^-?\d+(\.\d+)?(e-?\d+)?$/i.test(x)) ? t.map(Number) : null; };
  const lastKg = () => { const w = loadWeights(); return w.length ? w[w.length - 1].kg : null; };
  const dateOf = toks => { const w = parseWhen(toks); return { ...w, date: w.hasDate ? midnight(w.start) : midnight(new Date()) }; };
  const relDays = d => { const n = Math.round((midnight(d) - midnight(new Date())) / 864e5); return n === 0 ? "today" : n === 1 ? "tomorrow" : n === -1 ? "yesterday" : n > 0 ? `in ${n} days` : `${-n} days ago`; };
  const longDay = d => d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  const doy = d => Math.round((midnight(d) - new Date(d.getFullYear(), 0, 0)) / 864e5);
  const isoWeek = d => { const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())), n = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - n); return Math.ceil(((t - Date.UTC(t.getUTCFullYear(), 0, 1)) / 864e5 + 1) / 7); };
  const copyText = async t => { try { await navigator.clipboard.writeText(t); return true; } catch { return false; } };
  const beep = () => { try { const a = new (window.AudioContext || window.webkitAudioContext)(), o = a.createOscillator(), g = a.createGain(); o.connect(g); g.connect(a.destination); o.frequency.value = 880; g.gain.setValueAtTime(.15, a.currentTime); g.gain.exponentialRampToValueAtTime(.001, a.currentTime + .6); o.start(); o.stop(a.currentTime + .6); } catch {} };

  /* ===== health series ===== */
  const gymByDate = () => { const m = {}; (A.gym && A.gym() ? A.gym().entries : []).forEach(e => { m[e.date] = (m[e.date] || 0) + e.weight * e.reps * (e.sets || 1); }); return m; };
  const runKm = d => (d.workouts || []).filter(w => /RUN/i.test(w.type) && w.distanceM).reduce((s, w) => s + w.distanceM / 1000, 0) || null;
  const MET = {
    sleep: { get: d => d.sleepMin, k: 1 / 60, fmt: v => hmm(v), hi: true, bad: v => v < 460, label: "sleep" },
    rhr: { get: d => d.restingHr, k: 1, fmt: v => n3(v) + " bpm", hi: false, label: "resting heart rate" },
    hrv: { get: d => d.hrv, k: 1, fmt: v => n3(v) + " ms", hi: true, label: "HRV" },
    steps: { get: d => d.steps, k: 1, fmt: v => thou(v), hi: true, label: "steps" },
    azm: { get: d => d.azm, k: 1, fmt: v => thou(v) + " min", hi: true, label: "active zone minutes" },
    spo2: { get: d => d.spo2, k: 1, fmt: v => n3(v) + " %", hi: true, label: "blood oxygen" },
    vo2: { get: d => d.vo2max, k: 1, fmt: v => n3(v), hi: true, label: "VO2 max" },
    temp: { get: d => d.skinTempDelta, k: 1, fmt: v => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(2)} °C`, hi: false, label: "skin temperature vs baseline" },
    deep: { get: d => d.deepMin, k: 1, fmt: hmm, hi: true, label: "deep sleep" }, rem: { get: d => d.remMin, k: 1, fmt: hmm, hi: true, label: "REM sleep" }, light: { get: d => d.lightMin, k: 1, fmt: hmm, hi: null, label: "light sleep" },
    awake: { get: d => d.awakeMin, k: 1, fmt: hmm, hi: false, label: "time awake in bed" }, nap: { get: d => d.napMin || null, k: 1, fmt: hmm, hi: null, label: "naps" },
    run: { get: d => runKm(d), k: 1, fmt: v => v.toFixed(2) + " km", hi: true, label: "running distance" },
    weight: { get: (d, date, X) => X.w[date] ?? null, k: 1, fmt: v => n3(v) + " kg", hi: null, label: "weight" },
    volume: { get: (d, date, X) => X.g[date] || null, k: 1, fmt: v => thou(v) + " lb", hi: true, label: "lifting volume" }
  };
  const MALIAS = { sleeping: "sleep", resting: "rhr", hr: "rhr", heart: "rhr", step: "steps", zone: "azm", zones: "azm", az: "azm", o2: "spo2", oxygen: "spo2", vo2max: "vo2", skin: "temp", km: "run", running: "run", mileage: "run", kg: "weight", weights: "weight", vol: "volume", tonnage: "volume", naps: "nap", awake: "awake", wake: "awake" };
  const metric = s => { s = (s || "").toLowerCase(); const k = MALIAS[s] || s; return MET[k] ? { key: k, ...MET[k] } : null; };
  const metricList = () => Object.keys(MET).join(", ");
  const series = (m, n) => { const h = H(), X = { w: Object.fromEntries(loadWeights().map(e => [e.date, e.kg])), g: gymByDate() }; return [...Array(n)].map((_, i) => { const date = h.addDays(h.today, -(n - 1) + i); return { date, v: num(m.get(h.byDate[date] || {}, date, X)) }; }); };
  const disp = (m, v) => (v == null ? null : v * m.k), unitWord = m => (m.key === "sleep" ? " h" : "");
  const needMetric = (s, what = "a metric") => metric(s) || U(`${what}? one of: ${metricList()}`);
  const parseN = (toks, d) => { const t = toks.find(x => /^\d+$/.test(x)); return t ? Math.min(365, Math.max(2, +t)) : d; };

  /* ================= TIME AND DATES ================= */
  def("time", "time", "time [city]", "the time here or in a city (tokyo, london, ny, la, sydney, utc...)", async a => {
    const q = a.trim().toLowerCase(); let tz = q ? ZONES[q] : undefined;
    if (q && !tz) { try { new Intl.DateTimeFormat("en-US", { timeZone: a.trim() }); tz = a.trim(); } catch { U(`I do not know "${a.trim()}". try tokyo, london, ny, la, sydney or a zone like Europe/Oslo.`); } }
    await print(new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false, timeZoneName: "short" }).format(new Date()) + (q ? `  ·  ${q}` : ""));
  });
  def("time", "date", "date [day]", "today's date, day of year and week number; or a given day (date nov 4)", async a => {
    const t = a.split(/\s+/).filter(Boolean), w = t.length ? parseWhen(t) : null, d = w && w.hasDate ? midnight(w.start) : new Date();
    const left = Math.round((new Date(d.getFullYear(), 11, 31) - midnight(d)) / 864e5), len = doy(new Date(d.getFullYear(), 11, 31));
    await print([`${longDay(d)}${w && w.hasDate ? `  (${relDays(d)})` : ""}`, `  day ${doy(d)} of ${len}, week ${isoWeek(d)}, ${left} days left in ${d.getFullYear()}`], "tm-dim");
  });
  def("time", "until", "until <day | event words>", "days or hours until a date or until a calendar event", async a => {
    if (!a.trim()) U("usage: until nov 12   or   until exam");
    const w = parseWhen(a.split(/\s+/).filter(Boolean)); let target = null, label = "";
    if (w.hasDate && !w.title) { target = w.hasTime ? w.start : midnight(w.start); label = fmtDay(w.start); }
    else { const cal = calApi(), ev = cal.find(a, {}).filter(e => e.e > new Date()).sort((x, y) => x.s - y.s)[0]; if (!ev) U(`no upcoming event or date matches "${a.trim()}".`); target = ev.s; label = ev.title; }
    const ms = target - new Date(), mins = Math.round(ms / 6e4); await print(ms < 0 ? `${label} was ${Math.round(-ms / 864e5)} days ago` : mins < 120 ? `${mins} min until ${label}` : ms < 2 * 864e5 ? `${Math.floor(mins / 60)} h ${mins % 60} min until ${label}` : `${Math.ceil(ms / 864e5)} days until ${label} (${trim(ms / 864e5 / 7, 1)} weeks)`);
  });
  def("time", "since", "since <day>", "days since a date", async a => { const w = parseWhen(a.split(/\s+/).filter(Boolean)); if (!w.hasDate) U("usage: since oct 1   or   since 3/14/2026"); const n = Math.round((midnight(new Date()) - midnight(w.start)) / 864e5); await print(`${n} days since ${fmtDay(w.start)} (${trim(n / 7, 1)} weeks)`); });
  const shiftBy = (a, sign) => {
    const m = a.match(/^\s*(\d+(?:\.\d+)?)\s*(day|days|d|week|weeks|wk|w|month|months|mo|year|years|y|hour|hours|h)\b\s*(?:from\s+(.+))?$/i); if (!m) U(`usage: ${sign > 0 ? "later" : "ago"} 90 days [from nov 1]`);
    const base = m[3] ? parseWhen(m[3].split(/\s+/)).start : new Date(), n = +m[1] * sign, u = m[2][0].toLowerCase(), d = new Date(base);
    if (u === "d") d.setDate(d.getDate() + n); else if (u === "w") d.setDate(d.getDate() + 7 * n); else if (u === "m") d.setMonth(d.getMonth() + n); else if (u === "y") d.setFullYear(d.getFullYear() + n); else d.setHours(d.getHours() + n);
    return d;
  };
  def("time", "month cal", "month [next|last|nov|11] [year]", "a calendar for this month or another", async a => {
    const t = a.toLowerCase().split(/\s+/).filter(Boolean), now = new Date(); let y = now.getFullYear(), mo = now.getMonth();
    t.forEach(x => { if (x === "next") mo++; else if (x === "last" || x === "prev") mo--; else if (/^\d{4}$/.test(x)) y = +x; else if (/^\d{1,2}$/.test(x) && +x >= 1 && +x <= 12) mo = +x - 1; else if (x in { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 } || x.slice(0, 3) in { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 }) mo = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 }[x.slice(0, 3)]; });
    const first = new Date(y, mo, 1), len = new Date(y, mo + 1, 0).getDate(), lead = (first.getDay() + 6) % 7, title = first.toLocaleDateString("en-US", { month: "long", year: "numeric" });
    const lines = [esc(" ".repeat(Math.max(0, Math.floor((20 - title.length) / 2))) + title), "Mo Tu We Th Fr Sa Su"]; let row = "   ".repeat(lead);
    for (let d = 1; d <= len; d++) { const isToday = d === now.getDate() && mo === now.getMonth() && y === now.getFullYear(), cell = String(d).padStart(2, " "); row += (isToday ? `<span class="tm-today">${cell}</span>` : cell) + " "; if ((lead + d) % 7 === 0) { lines.push(row.trimEnd()); row = ""; } }
    if (row.trim()) lines.push(row.trimEnd()); await print(lines.map((x, i) => (i < 2 ? html(esc(x)) : html(x))), "tm-dim");
  });
  // countdown and stopwatch run in the developer panel (bottom right), drawn in dot-matrix digits; end stops them
  const LIVE = { cd: null, sw: null }, stopLive = k => { const x = LIVE[k]; if (x) { LIVE[k] = null; if (x.t) clearTimeout(x.t); timers.remove(k); } };
  def("timer", "countdown", "countdown 90s | 5m | 1h30m | stop", "a quick countdown that beeps when done, shown in the developer panel (use start for focus sessions)", async a => {
    if (/^(stop|cancel|off)$/i.test(a.trim())) { if (!LIVE.cd) return dim("no countdown is running."); stopLive("cd"); return print("✓ countdown cancelled"); }
    const sec = parseClock(a.trim()); if (!sec || sec <= 0) U("usage: countdown 90s   countdown 5m   countdown 1:30   countdown stop"); stopLive("cd");
    const end = Date.now() + sec * 1000, t = setTimeout(() => { stopLive("cd"); beep(); print(`✓ ${secT(sec)} countdown finished`); }, sec * 1000); LIVE.cd = { t };
    timers.add("cd", { label: "countdown", loop: true, get: () => ({ text: clk((end - Date.now()) / 1000), sub: `of ${secT(sec)}`, red: end - Date.now() < 10000 }), stop: () => stopLive("cd") });
    await print(`✓ countdown ${secT(sec)} started. It shows in the developer panel; end stops it.`);
  });
  def("timer", "stopwatch sw", "stopwatch [lap | stop]", "start a stopwatch in the developer panel; lap records a split, stop prints the total", async a => {
    const w = a.trim().toLowerCase();
    if (w === "lap") { if (!LIVE.sw) U("no stopwatch is running. type stopwatch to start one."); const t = (Date.now() - LIVE.sw.t0) / 1000, lap = t - LIVE.sw.last; LIVE.sw.last = t; LIVE.sw.laps++; return print(`lap ${LIVE.sw.laps}  ${secT(lap)}   total ${secT(t)}`); }
    if (w === "stop" || w === "reset") { if (!LIVE.sw) return dim("no stopwatch is running."); const t = (Date.now() - LIVE.sw.t0) / 1000; stopLive("sw"); return print(`✓ stopped at ${secT(t)}`); }
    stopLive("sw"); const t0 = Date.now(); LIVE.sw = { t0, last: 0, laps: 0 };
    timers.add("sw", { label: "stopwatch", loop: true, get: () => ({ text: clk((Date.now() - t0) / 1000), sub: LIVE.sw ? `${LIVE.sw.laps} lap${LIVE.sw.laps === 1 ? "" : "s"}` : "" }), stop: () => stopLive("sw") });
    await print("✓ stopwatch started. It shows in the developer panel. stopwatch lap · stopwatch stop · end");
  });

  /* ================= CONVERT AND PACE ================= */
  def("convert", "convert conv", "convert 5 km to mi", "units: length, mass, volume, temperature, speed, time, data, energy, area", async a => {
    const m = a.trim().match(/^(-?\d+(?:\.\d+)?(?:e-?\d+)?)\s*([^\s\d].*?)\s+(?:to|in|into|as|->|=)\s+(.+)$/i) || a.trim().match(/^(-?\d+(?:\.\d+)?)\s*([^\s\d]\S*)\s+(\S+)$/); if (!m) U("usage: convert 5 km to mi   ·   convert 70 kg to lb   ·   convert 100 f to c");
    const v = +m[1], f = unitOf(m[2].trim()), t = unitOf(m[3].trim()); if (!f) U(`I do not know the unit "${m[2].trim()}".`); if (!t) U(`I do not know the unit "${m[3].trim()}".`); if (f.cat !== t.cat) U(`${f.u} is ${f.cat} and ${t.u} is ${t.cat}; they cannot be converted.`);
    const r = f.cat === "temp" ? toTemp(v, f.u, t.u) : v * UNITS[f.cat][f.u] / UNITS[t.cat][t.u]; await print(`${trim(v, 6)} ${f.u} = ${calc.fmt(r)} ${t.u}`);
  });
  const readRace = a => {
    const t = a.replace(/\bin\b|\bat\b/gi, " ").split(/\s+/).filter(Boolean); let dist = null, secs = null, paceTok = null;
    if (t.length >= 3 && /^(km|k|mi|mile|miles|m)$/i.test(t[1]) && /^\d+(\.\d+)?$/.test(t[0])) t.splice(0, 2, t[0] + t[1]);
    t.forEach(x => { if (/\/(km|mi)$/i.test(x)) paceTok = x; else if (dist == null && parseDist(x) != null && !/:/.test(x)) dist = parseDist(x); else if (secs == null && parseClock(x) != null) secs = parseClock(x); });
    return { dist, secs, paceTok };
  };
  def("convert", "pace", "pace 5k 25:00   |   pace 10k 5:00/km", "pace and speed from a distance and a time, or the finish time from a pace", async a => {
    const r = readRace(a); if (!r.dist) U("usage: pace 5k 25:00   ·   pace 10 mi 1:20:00   ·   pace 10k 5:00/km"); let secs = r.secs;
    if (r.paceTok) { const m = r.paceTok.match(/^(.+)\/(km|mi)$/i), p = parseClock(m[1]); if (!p) U("I could not read that pace."); secs = p * (/mi/i.test(m[2]) ? r.dist / 1.609344 : r.dist); } if (!secs) U("I need a time or a pace as well.");
    const pk = secs / r.dist, pm = pk * 1.609344, kmh = r.dist / (secs / 3600);
    await print([`${trim(r.dist, 3)} km in ${secT(secs)}`, `  pace ${secT(pk)} /km   ·   ${secT(pm)} /mi`, `  speed ${trim(kmh, 2)} km/h   ·   ${trim(kmh / 1.609344, 2)} mph`], "tm-dim");
  });
  def("convert", "predict", "predict 5k 24:30", "race times at other distances from one result (Riegel formula)", async a => {
    const r = readRace(a); if (!r.dist || !r.secs) U("usage: predict 5k 24:30   ·   predict 10 km 52:10"); const T = [["1 mile", 1.609344], ["5 km", 5], ["10 km", 10], ["15 km", 15], ["half marathon", 21.0975], ["marathon", 42.195]];
    await print([`from ${trim(r.dist, 2)} km in ${secT(r.secs)}  (Riegel, exponent 1.06; longer races need endurance, so treat them as a ceiling)`, ...T.map(([n, d]) => { const s = r.secs * (d / r.dist) ** 1.06; return `  ${n.padEnd(14)} ${secT(s).padEnd(8)} ${secT(s / d)} /km`; })], "tm-dim");
  });
  def("convert", "splits", "splits 10k 50:00", "even-pace split times for each kilometre", async a => {
    const r = readRace(a); if (!r.dist || !r.secs) U("usage: splits 10k 50:00"); const pk = r.secs / r.dist, out = [`even pace ${secT(pk)} /km`];
    for (let k = 1; k <= Math.floor(r.dist); k++) out.push(`  km ${String(k).padStart(2)}  ${secT(pk * k)}`); if (r.dist % 1) out.push(`  finish ${secT(r.secs)}`); await print(out, "tm-dim");
  });
  def("convert", "units", "units", "list every unit convert understands", async () => { await print(Object.entries(UNITS).map(([k, v]) => `${k.padEnd(8)} ${Object.keys(v).join(" ")}`).concat(["temp     c f k"]), "tm-dim"); });

  /* ================= FITNESS CALCULATORS ================= */
  def("fit", "1rm orm", "1rm 225 5", "estimated one-rep max from a weight and reps (Epley, Brzycki, Lombardi)", async a => {
    const [w, r] = nums(a); if (!w || !r) U("usage: 1rm 225 5   (weight, then reps)"); if (r > 30) U("estimates fall apart above about 12 reps; use a heavier set.");
    const ep = e1rm(w, r), br = r < 37 ? w * 36 / (37 - r) : null, lo = w * r ** .1, av = mean([ep, br, lo]);
    await print([`${trim(w, 2)} × ${r}`, `  Epley ${trim(ep, 1)}   Brzycki ${trim(br, 1)}   Lombardi ${trim(lo, 1)}`, `  estimate ${trim(av, 1)}${r > 10 ? "  (high reps: least reliable)" : ""}`], "tm-dim");
  });
  def("fit", "loads", "loads 315", "percent table of a one-rep max, rounded to 2.5", async a => { const [w] = nums(a); if (!w) U("usage: loads 315   (your one-rep max)"); await print([`of ${trim(w, 1)}`, ...[100, 95, 90, 85, 80, 75, 70, 65, 60, 50].map(p => `  ${String(p).padStart(3)}%  ${trim(Math.round(w * p / 100 / 2.5) * 2.5, 1)}`)], "tm-dim"); });
  def("fit", "plates", "plates 225 [kg] [bar 35]", "which plates go on each side of the bar", async a => {
    const kg = /\bkg\b/i.test(a), bm = a.match(/bar\s+(\d+(?:\.\d+)?)/i), target = nums(a.replace(/bar\s+\d+(?:\.\d+)?/i, ""))[0]; if (!target) U("usage: plates 225   ·   plates 100 kg   ·   plates 135 bar 35");
    const bar = bm ? +bm[1] : kg ? 20 : 45, set = kg ? [25, 20, 15, 10, 5, 2.5, 1.25] : [45, 35, 25, 10, 5, 2.5]; let side = (target - bar) / 2; if (side < 0) U(`the bar alone is ${bar}.`); const out = [];
    set.forEach(p => { while (side + 1e-9 >= p) { out.push(p); side -= p; } }); const got = bar + 2 * out.reduce((s, p) => s + p, 0);
    await print([`${trim(target, 2)} ${kg ? "kg" : "lb"} on a ${bar} bar`, `  each side: ${out.length ? out.join("  +  ") : "nothing"}`, ...(Math.abs(got - target) > 1e-6 ? [`  closest loadable: ${trim(got, 2)} (${trim(target - got, 2)} short)`] : [])], "tm-dim");
  });
  def("fit", "warmup", "warmup 225", "warm-up sets to reach a working weight", async a => {
    const [w] = nums(a); if (!w) U("usage: warmup 225   (your working weight)"); const R = x => Math.max(5, Math.round(x / 5) * 5);
    await print([`working weight ${trim(w, 1)}`, "  empty bar × 10", `  ${R(w * .4)} × 8`, `  ${R(w * .6)} × 5`, `  ${R(w * .75)} × 3`, `  ${R(w * .9)} × 1`, `  then ${trim(w, 1)} for the work`], "tm-dim");
  });
  def("fit", "bmi", "bmi [kg] [cm]", "body mass index (uses your last weigh-in and 183 cm if you give nothing)", async a => {
    const n = nums(a), kg = n[0] || lastKg(), cm = n[1] || 183; if (!kg) U("no weigh-in yet. weight 70.4 logs one, or give kg and cm: bmi 70 183"); const b = kg / (cm / 100) ** 2;
    await print(`BMI ${b.toFixed(1)} at ${trim(kg, 1)} kg and ${cm} cm  (${b < 18.5 ? "under 18.5" : b < 25 ? "18.5 to 25, the usual range" : b < 30 ? "25 to 30" : "30 or over"}). BMI ignores muscle, so for a lifter it reads high.`);
  });
  def("fit", "tdee", "tdee [kg cm age m|f activity]", "daily calories from the Mifflin-St Jeor equation (activity: low light mod high athlete)", async a => {
    const sex = (a.match(/\b(m|f|male|female)\b/i) || [])[1], act = (a.match(/\b(low|sed|light|mod|moderate|high|active|athlete)\b/i) || [])[1], n = nums(a.replace(/\b(m|f|male|female|low|sed|light|mod|moderate|high|active|athlete)\b/gi, "")), kg = n[0] || lastKg(), cm = n[1] || 183, age = n[2] || 22;
    if (!kg) U("usage: tdee 70 183 22 m high   (weight kg, height cm, age, sex, activity)"); const F = { low: 1.2, sed: 1.2, light: 1.375, mod: 1.55, moderate: 1.55, high: 1.725, active: 1.725, athlete: 1.9 }, k = F[(act || "mod").toLowerCase()], base = 10 * kg + 6.25 * cm - 5 * age;
    const line = (s, off) => { const bmr = base + off; return `  ${s}: BMR ${thou(bmr)} kcal, maintenance ${thou(bmr * k)}, cut ${thou(bmr * k - 400)}, lean gain ${thou(bmr * k + 250)}`; };
    await print([`${trim(kg, 1)} kg, ${cm} cm, ${age} y, activity ${act || "moderate"} (×${k})`, ...(!sex ? [line("male", 5), line("female", -161), "  add m or f for one line"] : [/^m/i.test(sex) ? line("male", 5) : line("female", -161)])], "tm-dim");
  });
  def("fit", "protein", "protein [kg]", "daily protein range for building muscle (1.6 to 2.2 g per kg)", async a => { const kg = nums(a)[0] || lastKg(); if (!kg) U("usage: protein 70"); await print(`${thou(kg * 1.6)} to ${thou(kg * 2.2)} g a day at ${trim(kg, 1)} kg (1.6 to 2.2 g/kg; the low end is enough, more is not harmful)`); });
  def("fit", "water", "water [kg]", "a daily fluid estimate (about 35 ml per kg, more when training or hot)", async a => { const kg = nums(a)[0] || lastKg(); if (!kg) U("usage: water 70"); await print(`about ${trim(kg * .035, 1)} L a day at ${trim(kg, 1)} kg, plus roughly 0.5 L per hour of hard training`); });
  def("fit", "zones hrzones", "zones [age | max hr]", "heart rate zones from your maximum (220 minus age, or give the number)", async a => {
    const n = nums(a)[0] || 22, max = n > 100 ? n : 220 - n, Z = [["1 easy", .5, .6], ["2 aerobic", .6, .7], ["3 tempo", .7, .8], ["4 threshold", .8, .9], ["5 maximum", .9, 1]];
    await print([`max ${Math.round(max)} bpm${n > 100 ? "" : " (220 − age; a measured max is better)"}`, ...Z.map(([nm, lo, hi]) => `  zone ${nm.padEnd(12)} ${Math.round(max * lo)}–${Math.round(max * hi)} bpm`)], "tm-dim");
  });

  /* ================= GYM LOG ================= */
  const exMatch = async (q, then) => { const g = gymApi(), ranked = rankExercises(q, g.entries); if (!ranked.length) U(`no exercise matches "${q}".`); if (ranked.length > 1 && ranked[0].sc - ranked[1].sc < 8) return choose(`"${q}" matches more than one exercise:`, ranked.slice(0, 5).map(x => ({ label: x.n, value: x })), o => then(o.value.n, g)); return then(ranked[0].n, g); };
  const setStr = e => `${trim(e.weight, 1)} lb × ${e.reps}${e.sets > 1 ? " × " + e.sets : ""}`;
  def("gym", "last", "last bench", "your most recent sets of an exercise and the change from the time before", async a => {
    if (!a.trim()) U("usage: last bench");
    await exMatch(a.trim(), async (n, g) => { const es = g.entries.filter(e => e.exercise === n).sort((x, y) => y.date.localeCompare(x.date) || y.id - x.id); if (!es.length) return dim(`${n}: nothing logged yet.`); const d0 = es[0].date, a0 = es.filter(e => e.date === d0), prev = es.find(e => e.date < d0), best = Math.max(...a0.map(e => e1rm(e.weight, e.reps)));
      await print([n, ...a0.map(e => `  ${d0}  ${setStr(e)}`), prev ? `  before (${prev.date}): ${setStr(prev)}, estimated max ${trim(e1rm(prev.weight, prev.reps), 1)} → now ${trim(best, 1)} (${best >= e1rm(prev.weight, prev.reps) ? "+" : "−"}${trim(Math.abs(best / e1rm(prev.weight, prev.reps) - 1) * 100, 1)}%)` : "  first time logged"], "tm-dim"); });
  });
  def("gym", "pr", "pr bench", "your heaviest set and best estimated one-rep max of an exercise", async a => {
    if (!a.trim()) U("usage: pr bench   (prs lists them all)");
    await exMatch(a.trim(), async (n, g) => { const es = g.entries.filter(e => e.exercise === n); if (!es.length) return dim(`${n}: nothing logged yet.`); const hv = es.reduce((b, e) => (e.weight > b.weight || (e.weight === b.weight && e.reps > b.reps) ? e : b)), be = es.reduce((b, e) => (e1rm(e.weight, e.reps) > e1rm(b.weight, b.reps) ? e : b));
      await print([n, `  heaviest  ${setStr(hv)}  on ${hv.date}`, `  best estimated max  ${trim(e1rm(be.weight, be.reps), 1)} lb  (${setStr(be)} on ${be.date})`, `  ${es.length} sets logged since ${es.map(e => e.date).sort()[0]}`], "tm-dim"); });
  });
  def("gym", "prs bests", "prs", "your best estimated one-rep max for every exercise", async () => {
    const g = gymApi(), best = {}; g.entries.forEach(e => { const v = e1rm(e.weight, e.reps); if (!best[e.exercise] || v > best[e.exercise].v) best[e.exercise] = { v, e }; }); const rows = Object.entries(best).sort((x, y) => y[1].v - x[1].v);
    if (!rows.length) return dim("nothing logged yet."); await print(rows.map(([n, b]) => `${trim(b.v, 1).padStart(6)}  ${n}  (${setStr(b.e)}, ${b.e.date})`), "tm-dim");
  });
  def("gym", "history hist", "history bench [n]", "the last n sets of an exercise with the estimated max of each", async a => {
    const n = parseN(a.split(/\s+/), 8), q = a.replace(/\b\d+\b/g, "").trim(); if (!q) U("usage: history bench 10");
    await exMatch(q, async (name, g) => { const es = g.entries.filter(e => e.exercise === name).sort((x, y) => y.date.localeCompare(x.date) || y.id - x.id).slice(0, n); if (!es.length) return dim(`${name}: nothing logged yet.`); await print([name, ...es.map(e => `  ${e.date}  ${setStr(e).padEnd(18)} est. max ${trim(e1rm(e.weight, e.reps), 1)}`)], "tm-dim"); });
  });
  def("gym", "lift", "lift bench [sessions]", "a mini chart of an exercise's estimated max, session by session", async a => {
    const n = parseN(a.split(/\s+/), 20), q = a.replace(/\b\d+\b/g, "").trim(); if (!q) U("usage: lift bench 20");
    await exMatch(q, async (name, g) => { const by = {}; g.entries.filter(e => e.exercise === name).forEach(e => { by[e.date] = Math.max(by[e.date] || 0, e1rm(e.weight, e.reps)); }); const ds = Object.keys(by).sort().slice(-n), v = ds.map(d => by[d]); if (v.length < 2) return dim(`${name}: need at least two sessions.`);
      await print([name, chart(dotCols(v), v.map(x => trim(x, 1)).join(" ")), `  ${trim(v[0], 1)} → ${trim(v[v.length - 1], 1)} lb estimated max over ${v.length} sessions (${v[v.length - 1] >= v[0] ? "+" : "−"}${trim(Math.abs(v[v.length - 1] / v[0] - 1) * 100, 1)}%), ${ds[0]} to ${ds[ds.length - 1]}`, link("gym", "Open Gym log")], "tm-dim"); });
  });
  def("gym", "log sets", "log [day]", "every set logged on a day (default today) and its total", async a => {
    const g = gymApi(), d = dateOf(a.split(/\s+/).filter(Boolean)), key = ymd(d.date), es = g.entries.filter(e => e.date === key).sort((x, y) => x.id - y.id);
    if (!es.length) return dim(`nothing logged on ${fmtDay(d.date)}.`); await print([`${fmtDay(d.date)}  ${es[0].day || ""}`, ...es.map(e => `  ${e.exercise.replace(/ \(.*\)| \/.*/g, "").padEnd(28)} ${setStr(e)}`), `  ${es.reduce((s, e) => s + (e.sets || 1), 0)} sets, ${thou(es.reduce((s, e) => s + e.weight * e.reps * (e.sets || 1), 0))} lb of volume`], "tm-dim");
  });
  def("gym", "volume vol", "volume [week | month | 30 | all]", "total lifted (weight × reps × sets) over a period, by day", async a => {
    const g = gymApi(), w = a.trim().toLowerCase() || "week", days = w === "all" ? 3650 : w === "month" ? 30 : w === "week" ? 7 : /^\d+$/.test(w) ? +w : 7, from = addDays(ymd(new Date()), -(days - 1)), es = g.entries.filter(e => e.date >= from); if (!es.length) return dim("nothing logged in that period.");
    const by = {}; es.forEach(e => { by[e.date] = (by[e.date] || 0) + e.weight * e.reps * (e.sets || 1); }); const ds = Object.keys(by).sort(), tot = Object.values(by).reduce((s, x) => s + x, 0), mx = Math.max(...Object.values(by));
    await print([...(ds.length <= 14 ? [chart(dotHBars(ds.map(d => ({ label: dayName(d), value: by[d], text: `${thou(by[d])} lb` })), { max: mx }), ds.map(d => `${dayName(d)} ${thou(by[d])} lb`).join("\n"))] : []), `${thou(tot)} lb across ${ds.length} session days, ${es.reduce((s, e) => s + (e.sets || 1), 0)} sets (${thou(tot / ds.length)} lb per session)`, link("gym", "Open Gym log")], "tm-dim");
  });
  def("gym", "gymdays", "gymdays [week | month]", "the days you logged lifting this week or month", async a => {
    const g = gymApi(), n = /month/i.test(a) ? 30 : 7, from = addDays(ymd(new Date()), -(n - 1)), ds = [...new Set(g.entries.filter(e => e.date >= from).map(e => e.date))].sort();
    await print([`${ds.length} lifting days in the last ${n}${ds.length ? ": " + ds.map(dayName).join(", ") : ""}`, `goal ${n === 7 ? "5 to 6 a week" : "about 22 a month"}`], "tm-dim");
  });
  def("gym", "streak", "streak", "how many days in a row you have logged a set (today not yet counted until you log)", async () => {
    const g = gymApi(), set = new Set(g.entries.map(e => e.date)); let d = ymd(new Date()), n = 0; if (!set.has(d)) d = addDays(d, -1); while (set.has(d)) { n++; d = addDays(d, -1); }
    await print(n ? `${n} day${n > 1 ? "s" : ""} in a row` : "no current streak. log a set to start one.", "tm-dim");
  });
  def("gym", "routine", "routine [push | pull | legs]", "the exercises in today's session (or the one you name)", async a => {
    const key = Object.keys(PROGRAM).find(k => k.toLowerCase() === a.trim().toLowerCase()) || (() => { const h = A.health && A.health(); const p = h ? h.A.plannedFor(h.today) : null; return p; })();
    if (key === "Run") return print("today is a run day, so there is no lifting routine. routine push|pull|legs shows one.", "tm-dim"); if (!key || !PROGRAM[key]) U("usage: routine push   (or pull, legs)");
    await print([`${key.toUpperCase()}${a.trim() ? "" : " (today's plan)"}`, ...PROGRAM[key].map(([n, r]) => `  ${n.padEnd(42)} ${r}`)], "tm-dim");
  });
  def("gym", "plan", "plan", "your fixed training week with today marked", async () => {
    const h = H(), out = []; for (let i = 0; i < 7; i++) { const d = h.addDays(h.today, i); out.push(`  ${dayName(d).padEnd(7)} ${h.A.plannedFor(d)}${i === 0 ? "   ◂ today" : ""}`); } await print(["THIS WEEK", ...out], "tm-dim");
  });
  def("gym", "exercises", "exercises [filter]", "every exercise name known to the log, optionally filtered", async a => { const g = gymApi(), q = a.trim().toLowerCase(), all = [...new Set([...Object.values(PROGRAM).flat().map(x => x[0]), ...g.entries.map(e => e.exercise)])].filter(n => !q || n.toLowerCase().includes(q)); await print(all.length ? all.map(n => "  " + n) : `no exercise contains "${a.trim()}".`, "tm-dim"); });
  def("gym", "recent", "recent [n]", "the last n sets you logged", async a => { const g = gymApi(), n = parseN(a.split(/\s+/), 10), es = [...g.entries].sort((x, y) => y.date.localeCompare(x.date) || y.id - x.id).slice(0, n); if (!es.length) return dim("nothing logged yet."); await print(es.map(e => `  ${e.date}  ${e.exercise.replace(/ \(.*\)| \/.*/g, "").padEnd(28)} ${setStr(e)}`), "tm-dim"); });
  def("gym", "export", "export gym | weight", "copy the gym log or weight log to the clipboard as CSV", async a => {
    const w = a.trim().toLowerCase(); let csv;
    if (w === "gym") { const g = gymApi(); csv = ["Date,Workout,Exercise,Weight (lb),Sets,Reps", ...g.entries.map(e => [e.date, e.day, `"${e.exercise}"`, e.weight, e.sets, e.reps].join(","))].join("\n"); }
    else if (w === "weight" || w === "weights") csv = ["Date,Weight (kg)", ...loadWeights().map(e => `${e.date},${e.kg}`)].join("\n"); else U("usage: export gym   or   export weight");
    await print(await copyText(csv) ? `✓ copied ${csv.split("\n").length - 1} rows to the clipboard` : "could not reach the clipboard; the browser blocked it.");
  });

  /* ================= HEALTH NUMBERS ================= */
  const showMetric = async (m, n) => {
    const s = series(m, n), v = nn(s.map(x => x.v)); if (!v.length) return dim(`no ${m.label} recorded in the last ${n} days.`); const lo = Math.min(...v), hi = Math.max(...v);
    const base = lo * .9, bad = x => !!(m.bad && m.bad(x)), shown = s.filter(x => x.v != null || n <= 14), avg = mean(v);
    const node = n > 21 ? dotCols(s.map(x => x.v), { red: bad }) : dotHBars(shown.map(x => ({ label: dayName(x.date), value: x.v == null ? null : x.v - base, text: x.v == null ? "—" : m.fmt(x.v), bad: x.v != null && bad(x.v), color: x.v != null && bad(x.v) ? C.red : undefined })), { max: hi - base });
    await print([chart(node, shown.map(x => `${dayName(x.date)} ${x.v == null ? "—" : m.fmt(x.v)}`).join("\n")), html(esc(`${m.label}: average ${m.fmt(avg)}, lowest ${m.fmt(lo)}, highest ${m.fmt(hi)}, over ${v.length} of ${n} days`)), link("health", "Open Health")], "tm-dim");
  };
  def("health", "show", "show <metric> [days]", `a day-by-day table of any number the dashboard holds (${Object.keys(MET).join(", ")})`, async a => { const t = a.split(/\s+/).filter(Boolean), m = needMetric(t[0]); await showMetric(m, parseN(t.slice(1), 14)); });
  [["sleep", "sleep [days]", "nights of sleep, with the average"], ["rhr", "rhr [days]", "resting heart rate by day"], ["hrv", "hrv [days]", "overnight HRV by day"], ["steps", "steps [days]", "steps by day"], ["azm", "azm [days]", "active zone minutes by day"], ["spo2", "spo2 [days]", "blood oxygen by day"], ["vo2", "vo2 [days]", "VO2 max by day"], ["temp", "temp [days]", "skin temperature against your baseline"]].forEach(([k, use, d]) => def("health", k, use, d, async a => showMetric({ key: k, ...MET[k] }, parseN(a.split(/\s+/), 7))));
  const statNums = (m, a) => { const t = a.split(/\s+/).filter(Boolean); return { m: needMetric(t[0]), n: parseN(t.slice(1), 14) }; };
  def("math", "avg mean average", "avg 4 8 15   |   avg sleep 14", "the average of numbers, or of a dashboard metric over the last N days", async a => {
    const ns = allNums(a); if (ns) return print(`= ${calc.fmt(mean(ns))}`); const { m, n } = statNums("", a), v = nn(series(m, n).map(x => x.v)); if (!v.length) return dim(`no ${m.label} in the last ${n} days.`); await print(`${m.label}, last ${n} days: average ${m.fmt(mean(v))} (${v.length} days with data)`);
  });
  def("math", "min", "min 4 8 15   |   min rhr 30", "the smallest of some numbers, or a metric's lowest day in N days", async a => { const ns = allNums(a); if (ns) return print(`= ${calc.fmt(Math.min(...ns))}`); const { m, n } = statNums("", a), s = series(m, n).filter(x => x.v != null); if (!s.length) return dim("no data."); const b = s.reduce((x, y) => (y.v < x.v ? y : x)); await print(`${m.label}, last ${n} days: lowest ${m.fmt(b.v)} on ${dayName(b.date)}`); });
  def("math", "max", "max 4 8 15   |   max steps 30", "the largest of some numbers, or a metric's highest day in N days", async a => { const ns = allNums(a); if (ns) return print(`= ${calc.fmt(Math.max(...ns))}`); const { m, n } = statNums("", a), s = series(m, n).filter(x => x.v != null); if (!s.length) return dim("no data."); const b = s.reduce((x, y) => (y.v > x.v ? y : x)); await print(`${m.label}, last ${n} days: highest ${m.fmt(b.v)} on ${dayName(b.date)}`); });
  def("math", "sum total", "sum 4 8 15   |   sum steps 7", "the sum of some numbers, or a metric's total over N days (steps, azm, run, volume)", async a => { const ns = allNums(a); if (ns) return print(`= ${calc.fmt(ns.reduce((s, x) => s + x, 0))}`); const { m, n } = statNums("", a), v = nn(series(m, n).map(x => x.v)); if (!v.length) return dim("no data."); await print(`${m.label}, last ${n} days: total ${m.fmt(v.reduce((s, x) => s + x, 0))}`); });
  def("health", "trend", "trend <metric> [days]", "a mini chart and slope of any metric (default 28 days)", async a => {
    const t = a.split(/\s+/).filter(Boolean), m = needMetric(t[0]), n = parseN(t.slice(1), 28), s = series(m, n), v = s.map(x => x.v), half = Math.floor(n / 2), a1 = mean(v.slice(0, half)), a2 = mean(v.slice(half)); if (nn(v).length < 4) return dim(`not enough ${m.label} in ${n} days.`);
    const sl = slope(v.map(x => disp(m, x))); await print([`${m.label}, last ${n} days`, chart(dotCols(v, { red: x => !!(m.bad && m.bad(x)) }), v.filter(x => x != null).map(x => m.fmt(x)).join(" ")), `  first half ${m.fmt(a1)}, second half ${m.fmt(a2)}  (${a2 >= a1 ? "+" : "−"}${trim(Math.abs(a2 / a1 - 1) * 100, 1)}%)${sl != null ? `   slope ${sl >= 0 ? "+" : "−"}${trim(Math.abs(sl) * 7, 2)}${unitWord(m)} a week` : ""}`, link("health", "Open Health")], "tm-dim");
  });
  def("health", "compare", "compare <metric> [days]", "the last N days against the N before (default 7)", async a => {
    const t = a.split(/\s+/).filter(Boolean), m = needMetric(t[0]), n = parseN(t.slice(1), 7), s = series(m, n * 2), x = mean(s.slice(n).map(q => q.v)), y = mean(s.slice(0, n).map(q => q.v)); if (x == null || y == null) return dim(`not enough ${m.label} across ${n * 2} days.`);
    const pct = (x / y - 1) * 100, worse = m.hi === true ? pct < -5 : m.hi === false ? pct > 5 : false; await print([html(esc(`${m.label}: last ${n} days ${m.fmt(x)}, the ${n} before ${m.fmt(y)}  `) + rd(`(${pct >= 0 ? "+" : "−"}${trim(Math.abs(pct), 1)}%)`, worse))], "tm-dim");
  });
  def("health", "best", "best <metric> [days]", "your three best days for a metric (default last 30)", async a => { const t = a.split(/\s+/).filter(Boolean), m = needMetric(t[0]), s = series(m, parseN(t.slice(1), 30)).filter(x => x.v != null).sort((p, q) => (m.hi === false ? p.v - q.v : q.v - p.v)).slice(0, 3); await print(s.length ? s.map(x => `  ${dayName(x.date).padEnd(7)} ${m.fmt(x.v)}`) : "no data.", "tm-dim"); });
  def("health", "worst", "worst <metric> [days]", "your three worst days for a metric (default last 30)", async a => { const t = a.split(/\s+/).filter(Boolean), m = needMetric(t[0]), s = series(m, parseN(t.slice(1), 30)).filter(x => x.v != null).sort((p, q) => (m.hi === false ? q.v - p.v : p.v - q.v)).slice(0, 3); await print(s.length ? s.map(x => `  ${dayName(x.date).padEnd(7)} ${m.fmt(x.v)}`) : "no data.", "tm-dim"); });
  def("health", "corr", "corr <a> <b> [days]", "how two metrics move together (default 60 days), e.g. corr sleep hrv", async a => {
    const t = a.split(/\s+/).filter(Boolean), A1 = needMetric(t[0]), B1 = needMetric(t[1], "the second metric"), n = parseN(t.slice(2), 60), sa = series(A1, n), sb = series(B1, n), p = sa.map((x, i) => [x.v, sb[i].v]).filter(q => q[0] != null && q[1] != null);
    if (p.length < 8) return dim(`only ${p.length} days have both; need 8 or more.`); const ma = mean(p.map(q => q[0])), mb = mean(p.map(q => q[1])), r = p.reduce((s, q) => s + (q[0] - ma) * (q[1] - mb), 0) / Math.sqrt(p.reduce((s, q) => s + (q[0] - ma) ** 2, 0) * p.reduce((s, q) => s + (q[1] - mb) ** 2, 0)), ar = Math.abs(r);
    await print([`${A1.label} and ${B1.label} over ${p.length} days: r = ${trim(r, 2)}`, `  ${ar < .2 ? "no real relationship" : ar < .4 ? "a weak" : ar < .6 ? "a moderate" : "a strong"} ${ar < .2 ? "" : r > 0 ? "positive link (they rise together)" : "negative link (one rises as the other falls)"}`, "  this is correlation over a short window, not proof of cause."], "tm-dim");
  });
  def("health", "count", "count sleep >= 7.5 [days]", "how many of the last N days meet a condition (sleep is in hours)", async a => {
    const m0 = a.match(/^\s*(\w+)\s*(>=|<=|>|<|=|==)\s*(-?\d+(?:\.\d+)?)\s*(\d+)?\s*$/); if (!m0) U("usage: count sleep >= 7.5 30   ·   count steps > 10000   ·   count rhr < 55 60"); const m = needMetric(m0[1]), n = m0[4] ? +m0[4] : 30, th = +m0[3], op = m0[2];
    const ok = { ">=": (x, y) => x >= y, "<=": (x, y) => x <= y, ">": (x, y) => x > y, "<": (x, y) => x < y, "=": (x, y) => x === y, "==": (x, y) => x === y }[op], s = series(m, n).filter(x => x.v != null), hit = s.filter(x => ok(disp(m, x.v), th)).length;
    await print(`${hit} of ${s.length} days with data (last ${n}): ${m.label} ${op} ${th}${unitWord(m)}  (${trim(hit / (s.length || 1) * 100, 0)}%)`);
  });
  def("body", "stages", "stages", "last night's deep, REM, light and awake time", async () => {
    const h = H(), d = [...h.days].reverse().find(x => x.deepMin != null && x.sleepMin); if (!d) return dim("no stage data yet."); const tot = d.sleepMin, P = v => `${trim(v / tot * 100, 0)}%`;
    await print([`${dayName(d.date)}: ${hmm(tot)} asleep, ${hmm(d.awakeMin)} awake in bed`, `  deep ${hmm(d.deepMin)} (${P(d.deepMin)})   REM ${hmm(d.remMin)} (${P(d.remMin)})   light ${hmm(d.lightMin)} (${P(d.lightMin)})`, chart(dotStack([{ label: "deep", value: d.deepMin || 0, color: C.blue }, { label: "REM", value: d.remMin || 0, color: C.yel }, { label: "light", value: d.lightMin || 0, color: C.lit }, { label: "awake", value: d.awakeMin || 0, color: C.grey }])), link("health", "Open Health")], "tm-dim");
  });
  const debtNow = () => { const h = H(), endD = [h.today, h.addDays(h.today, -1)].find(d => h.byDate[d]?.sleepMin != null) || h.addDays(h.today, -1); return { h, sf: h.A.shortfall7(h.byDate, endD, h.addDays) }; };
  def("body", "debt", "debt", "your sleep debt, from the 28-night model, and whether it is high", async () => { const { h, sf } = debtNow(); if (sf.nights < 3) return dim("need at least 3 recent nights to work out sleep debt."); await print([html(`sleep debt ${rd(hmm(sf.hours * 60), h.bad("sleepDebtHours", sf.hours))}  over ${sf.nights} nights counted. A short night adds its shortfall; a long one repays half, and debt fades about 7% a night.`)], "tm-dim"); });
  def("body", "bedtime bed", "bedtime", "tonight's suggested bedtime for a 06:30 wake given your debt", async () => {
    const { h, sf } = debtNow(), b = h.A.bedtime(sf.nights >= 3 ? sf.hours : 0), mm = Math.round(b.minutes), clock = `${pad(Math.floor(mm / 60) % 24)}:${pad(mm % 60)}`;
    await print(`bed by ${clock}  (wake 06:30, ideal sleep 8h 10m${b.extra ? `, plus ${b.extra} min to pay back debt over about ${b.nights} nights` : ""})`);
  });
  def("body", "readiness", "readiness", "today's HRV readiness against your own baseline", async () => { const h = H(), r = h.A.readiness(h.byDate, h.today, h.addDays); await print(r.z == null ? r.status : html(`${esc(r.status)}  ` + rd(`(${r.z >= 0 ? "+" : "−"}${Math.abs(r.z).toFixed(1)} σ)`, h.bad("readinessZ", r.z))), "tm-dim"); });
  def("body", "bodycheck", "bodycheck", "the Body check status and which signals are away from your usual", async () => {
    const h = H(), s = h.A.earlySigns(h.byDate, h.today, h.addDays); const parts = (s.parts || []).filter(p => p.z != null).map(p => `  ${(p.label || p.key).toString().padEnd(18)} ${p.z >= 0 ? "+" : "−"}${Math.abs(p.z).toFixed(1)} σ`); await print([`body check: ${s.status}${s.strain ? " (heart rate and HRV alone: strain, not illness)" : ""}`, ...parts], "tm-dim");
  });
  const runsOf = h => h.days.flatMap(d => (d.workouts || []).filter(w => /RUN/i.test(w.type) && w.distanceM).map(w => ({ date: d.date, km: w.distanceM / 1000, sec: w.seconds, hr: w.avgHr, kcal: w.kcal })));
  def("body", "runs", "runs [n]", "your last n runs with distance, pace and heart rate", async a => { const h = H(), r = runsOf(h).slice(-parseN(a.split(/\s+/), 5)).reverse(); if (!r.length) return dim("no runs with distance recorded."); await print(r.map(x => `  ${dayName(x.date).padEnd(7)} ${x.km.toFixed(2)} km  ${x.sec ? secT(x.sec / x.km) + " /km" : ""}${x.hr ? `  ${Math.round(x.hr)} bpm` : ""}`), "tm-dim"); });
  def("body", "mileage", "mileage [days]", "total running distance over the last N days (default 7)", async a => { const h = H(), n = parseN(a.split(/\s+/), 7), from = h.addDays(h.today, -(n - 1)), r = runsOf(h).filter(x => x.date >= from), km = r.reduce((s, x) => s + x.km, 0); await print(`${km.toFixed(2)} km over ${r.length} run${r.length === 1 ? "" : "s"} in ${n} days${r.length ? `, ${(km / r.length).toFixed(2)} km average` : ""}`); });
  def("body", "workouts", "workouts [days]", "the workouts the band recorded in the last N days (default 7)", async a => { const h = H(), n = parseN(a.split(/\s+/), 7), from = h.addDays(h.today, -(n - 1)), w = h.days.filter(d => d.date >= from).flatMap(d => (d.workouts || []).map(x => ({ date: d.date, ...x }))); if (!w.length) return dim("no workouts recorded."); await print(w.map(x => `  ${dayName(x.date).padEnd(7)} ${String(x.type).toLowerCase().replace(/_/g, " ").padEnd(18)} ${Math.round((x.seconds || 0) / 60)} min${x.avgHr ? `  ${Math.round(x.avgHr)} bpm` : ""}${x.distanceM ? `  ${(x.distanceM / 1000).toFixed(2)} km` : ""}`), "tm-dim"); });
  def("health", "weekly week", "weekly", "the last seven days in one block, against the seven before", async () => {
    const out = ["LAST 7 DAYS"], row = (k, label) => { const m = { key: k, ...MET[k] }, s = series(m, 14), x = mean(s.slice(7).map(q => q.v)), y = mean(s.slice(0, 7).map(q => q.v)); if (x == null) return; const pct = y ? (x / y - 1) * 100 : 0, worse = m.hi === true ? pct < -5 : m.hi === false ? pct > 5 : false; out.push(html(esc(`  ${label.padEnd(14)} ${m.fmt(x).padEnd(10)}`) + (y ? rd(`${pct >= 0 ? "+" : "−"}${trim(Math.abs(pct), 0)}% vs before`, worse) : ""))); };
    row("sleep", "avg sleep"); row("rhr", "resting HR"); row("hrv", "HRV"); row("steps", "avg steps");
    const h = H(), az = nn(series({ key: "azm", ...MET.azm }, 7).map(q => q.v)).reduce((s, x) => s + x, 0); out.push(html(esc(`  ${"active zone".padEnd(14)} `) + rd(`${thou(az)} min`, h.bad("azmWeek", az)) + esc(" (goal 150)")));
    const km = nn(series({ key: "run", ...MET.run }, 7).map(q => q.v)).reduce((s, x) => s + x, 0), from7 = h.addDays(h.today, -6), gd = new Set([...gymApi().entries.filter(e => e.date >= from7).map(e => e.date), ...h.days.filter(d => d.date >= from7 && (d.workouts || []).some(w => h.A.isGym(w))).map(d => d.date)]).size; out.push(`  ${"running".padEnd(14)} ${km.toFixed(2)} km`, html(esc(`  ${"lifting days".padEnd(14)} `) + rd(String(gd), h.bad("workouts", gd)) + esc(" (goal 5 to 6)"))); await print(out, "tm-dim");
  });
  def("body", "weights", "weights [n]", "your last n weigh-ins", async a => { const w = loadWeights().slice(-parseN(a.split(/\s+/), 10)); if (!w.length) return dim("no weigh-ins yet."); await print(w.map((e, i) => `  ${dayName(e.date).padEnd(7)} ${n3(e.kg)} kg${i ? `  ${e.kg - w[i - 1].kg >= 0 ? "+" : "−"}${Math.abs(e.kg - w[i - 1].kg).toFixed(1)}` : ""}`), "tm-dim"); });
  def("body", "wavg", "wavg [days]", "average weight over the last N days (default 7)", async a => { const n = parseN(a.split(/\s+/), 7), from = addDays(ymd(new Date()), -(n - 1)), w = loadWeights().filter(e => e.date >= from); if (!w.length) return dim("no weigh-ins in that period."); await print(`${n3(mean(w.map(e => e.kg)))} kg average over ${w.length} weigh-in${w.length > 1 ? "s" : ""} in ${n} days (${n3(Math.min(...w.map(e => e.kg)))} to ${n3(Math.max(...w.map(e => e.kg)))})`); });
  def("body", "wtrend", "wtrend [days]", "which way your weight is moving, per week (default last 28 days)", async a => {
    const n = parseN(a.split(/\s+/), 28), from = addDays(ymd(new Date()), -(n - 1)), w = loadWeights().filter(e => e.date >= from); if (w.length < 3) return dim("need 3 or more weigh-ins in that window.");
    const d0 = new Date(w[0].date + "T12:00:00"), p = w.map(e => [(new Date(e.date + "T12:00:00") - d0) / 864e5, e.kg]), mx = mean(p.map(q => q[0])), my = mean(p.map(q => q[1])), den = p.reduce((s, q) => s + (q[0] - mx) ** 2, 0), sl = den ? p.reduce((s, q) => s + (q[0] - mx) * (q[1] - my), 0) / den : 0;
    await print([chart(dotCols(w.map(e => e.kg)), w.map(e => n3(e.kg)).join(" ")), `${sl >= 0 ? "+" : "−"}${Math.abs(sl * 7).toFixed(2)} kg a week over ${w.length} weigh-ins (${n3(w[0].kg)} → ${n3(w[w.length - 1].kg)} kg)`, link("health", "Open Health")], "tm-dim");
  });

  /* ================= CALENDAR ================= */
  const evLine = e => `  ${e.allDay ? "all day     " : hhmm(e.s) + "–" + hhmm(e.e) + " "} ${e.done ? "✓ " : ""}${e.title}`;
  const inRange = (cal, a, b) => cal.events().filter(e => e.s < b && e.e > a).sort((x, y) => (y.allDay - x.allDay) || x.s - y.s);
  def("cal", "agenda", "agenda [days]", "your events for the next N days (default 3), grouped by day", async a => {
    const cal = calApi(), n = parseN(a.split(/\s+/), 3), t0 = midnight(new Date()), out = []; for (let i = 0; i < n; i++) { const d0 = addDaysD(t0, i), ev = inRange(cal, d0, addDaysD(d0, 1)); out.push(`${i === 0 ? "TODAY" : i === 1 ? "TOMORROW" : fmtDay(d0).toUpperCase()}`); out.push(...(ev.length ? ev.map(evLine) : ["  nothing"])); } await print(out, "tm-dim");
  });
  def("cal", "tomorrow tmr", "tomorrow", "tomorrow's events", async () => { const cal = calApi(), d0 = addDaysD(midnight(new Date()), 1), ev = inRange(cal, d0, addDaysD(d0, 1)); await print([fmtDay(d0), ...(ev.length ? ev.map(evLine) : ["  nothing scheduled"])], "tm-dim"); });
  const freeSlots = (cal, day, fromMin = 7 * 60, toMin = 22 * 60) => {
    const d0 = midnight(day), now = new Date(), startMin = Math.max(fromMin, midnight(now) - d0 === 0 ? Math.ceil((now - d0) / 6e4 / 15) * 15 : 0), busy = cal.events().filter(e => !e.allDay && e.s < addDaysD(d0, 1) && e.e > d0).map(e => [Math.max(0, (e.s - d0) / 6e4), Math.min(1440, (e.e - d0) / 6e4)]).sort((x, y) => x[0] - y[0]);
    const out = []; let cur = startMin; busy.forEach(([s, e]) => { if (s > cur) out.push([cur, Math.min(s, toMin)]); cur = Math.max(cur, e); }); if (cur < toMin) out.push([cur, toMin]); return out.filter(([s, e]) => e - s >= 20 && s < toMin);
  };
  def("cal", "free", "free [day]", "the free gaps between 07:00 and 22:00 (from now, if today)", async a => {
    const cal = calApi(), d = dateOf(a.split(/\s+/).filter(Boolean)), slots = freeSlots(cal, d.date), T = m => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`; if (!slots.length) return dim(`no free gap of 20 minutes or more on ${fmtDay(d.date)}.`);
    await print([`${fmtDay(d.date)}`, ...slots.map(([s, e]) => `  ${T(s)}–${T(e)}   ${hmm(e - s)}`), `  ${hmm(slots.reduce((t, [s, e]) => t + e - s, 0))} free in total`], "tm-dim");
  });
  def("cal", "busy", "busy [day]", "how many hours are scheduled on a day", async a => { const cal = calApi(), d = dateOf(a.split(/\s+/).filter(Boolean)), ev = inRange(cal, d.date, addDaysD(d.date, 1)).filter(e => !e.allDay), mins = ev.reduce((s, e) => s + (Math.min(e.e, addDaysD(d.date, 1)) - Math.max(e.s, d.date)) / 6e4, 0); await print(`${fmtDay(d.date)}: ${ev.length} event${ev.length === 1 ? "" : "s"}, ${hmm(mins)} scheduled`); });
  def("cal", "block", "block 2h study [day]", "put an event of that length into the first free gap (today from now, or another day)", async a => {
    const cal = calApi(), t = a.split(/\s+/).filter(Boolean), dur = parseClock(t[0]); if (!dur || t.length < 2) U("usage: block 2h study   ·   block 90m reading tomorrow"); const need = Math.round(dur / 60), w = parseWhen(t.slice(1)), day = w.hasDate ? midnight(w.start) : midnight(new Date()), title = w.title || "Focus";
    const slot = freeSlots(cal, day).find(([s, e]) => e - s >= need); if (!slot) U(`no free gap of ${hmm(need)} on ${fmtDay(day)}.`); const s = new Date(+day + slot[0] * 6e4), e = new Date(+s + need * 6e4);
    const r = await cal.create({ title, start: s, end: e }); undos.push({ label: `event ${title}`, fn: () => cal.remove(r.id, r.cal) }); await print(`✓ blocked ${title}: ${fmtDay(s)} ${hhmm(s)}–${hhmm(e)}`);
  });
  def("cal", "find search", "find <words>", "events in the loaded range whose title matches", async a => { const cal = calApi(); if (!a.trim()) U("usage: find dentist"); const ev = cal.find(a, {}).sort((x, y) => x.s - y.s).slice(0, 12); await print(ev.length ? ev.map(e => `  ${fmtDay(e.s).padEnd(12)} ${e.allDay ? "all day   " : hhmm(e.s) + "–" + hhmm(e.e)}  ${e.done ? "✓ " : ""}${e.title}`) : `no event matches "${a.trim()}".`, "tm-dim"); });
  def("cal", "when", "when <event words>", "when the next matching event is", async a => { const cal = calApi(); if (!a.trim()) U("usage: when dentist"); const ev = cal.find(a, {}).filter(e => e.e > new Date()).sort((x, y) => x.s - y.s)[0]; await print(ev ? `${ev.title}: ${fmtDay(ev.s)}${ev.allDay ? ", all day" : " " + hhmm(ev.s) + "–" + hhmm(ev.e)}  (${relDays(ev.s)})` : `nothing upcoming matches "${a.trim()}".`); });
  def("cal", "overdue open", "overdue", "events that already ended this week without being marked complete", async () => { const cal = calApi(), now = new Date(), ev = cal.events().filter(e => !e.allDay && !e.done && e.e < now && e.s > addDaysD(now, -7)).sort((x, y) => y.s - x.s); await print(ev.length ? [`${ev.length} past event${ev.length > 1 ? "s" : ""} not marked complete`, ...ev.slice(0, 15).map(e => `  ${fmtDay(e.s).padEnd(12)} ${hhmm(e.s)}  ${e.title}`), "  done <title words> marks one"] : "everything that has ended is marked complete.", "tm-dim"); });

  /* ================= STICKYNOTE ================= */
  const TASK = /^(\s*)[-*] \[( |x|X)\] ?(.*)$/;
  const taskList = () => { const t = tasksApi().text().split("\n"); return t.map((line, i) => { const m = line.match(TASK); return m && m[3].trim() ? { i, done: m[2] !== " ", text: m[3], line } : null; }).filter(Boolean); };
  const pickTask = (q, wantDone) => { const l = taskList().filter(t => t.done === wantDone); if (/^\d+$/.test(q)) { const open = taskList().filter(t => t.done === wantDone); return [open[+q - 1]].filter(Boolean); } const low = q.toLowerCase(); return l.filter(t => t.text.toLowerCase().includes(low)); };
  const rewrite = (idx, newLine) => { const api = tasksApi(), ls = api.text().split("\n"), old = api.text(); ls[idx] = newLine; api.set(ls.join("\n")); return old; };
  def("tasks", "tasks todo todos", "tasks", "your open Stickynote checkboxes, numbered", async () => { const t = taskList(), open = t.filter(x => !x.done); await print(open.length ? [`OPEN (${open.length})`, ...open.map((x, k) => `  ${String(k + 1).padStart(2)}  ${x.text}`), `${t.length - open.length} done`] : [`no open tasks${t.length ? `, ${t.length} done` : ""}. task <text> adds one.`], "tm-dim"); });
  def("tasks", "finish check tick", "finish <number | words>", "tick a Stickynote task done (numbers are from the tasks list)", async a => {
    if (!a.trim()) U("usage: finish 2   ·   finish buy shoes"); const hit = pickTask(a.trim(), false); if (!hit.length) U(`no open task matches "${a.trim()}".`);
    const go = async t => { const prev = rewrite(t.i, t.line.replace(/\[ \]/, "[x]")); undos.push({ label: `finish ${t.text}`, fn: () => tasksApi().set(prev) }); await print(`✓ done: ${t.text}`); };
    if (hit.length > 1 && !/^\d+$/.test(a.trim())) return choose(`"${a.trim()}" matches more than one task:`, hit.slice(0, 5).map(t => ({ label: t.text, value: t })), o => go(o.value)); await go(hit[0]);
  });
  def("tasks", "uncheck reopen", "uncheck <words>", "turn a finished task back into an open one", async a => { if (!a.trim()) U("usage: uncheck buy shoes"); const hit = pickTask(a.trim(), true); if (!hit.length) U(`no finished task matches "${a.trim()}".`); const t = hit[0], prev = rewrite(t.i, t.line.replace(/\[[xX]\]/, "[ ]")); undos.push({ label: `reopen ${t.text}`, fn: () => tasksApi().set(prev) }); await print(`✓ reopened: ${t.text}`); });
  def("tasks", "deltask", "deltask <number | words>", "delete an open task (asks first)", async a => { if (!a.trim()) U("usage: deltask 3"); const hit = pickTask(a.trim(), false); if (!hit.length) U(`no open task matches "${a.trim()}".`); const t = hit[0]; return ask(`delete the task "${t.text}"? (y/n)`, async () => { const api = tasksApi(), prev = api.text(), ls = prev.split("\n"); ls.splice(t.i, 1); api.set(ls.join("\n")); undos.push({ label: `deleted task ${t.text}`, fn: () => api.set(prev) }); await print("✓ task deleted"); }); });
  def("tasks", "cleardone", "cleardone", "remove every ticked task from Stickynote (asks first)", async () => { const done = taskList().filter(t => t.done); if (!done.length) return dim("no finished tasks to clear."); return ask(`remove ${done.length} finished task${done.length > 1 ? "s" : ""}? (y/n)`, async () => { const api = tasksApi(), prev = api.text(), ix = new Set(done.map(t => t.i)); api.set(prev.split("\n").filter((_, i) => !ix.has(i)).join("\n")); undos.push({ label: "cleared finished tasks", fn: () => api.set(prev) }); await print(`✓ ${done.length} cleared`); }); });
  def("tasks", "notes", "notes [n]", "the last n lines of Stickynote that are not tasks (default 10)", async a => { const ls = tasksApi().text().split("\n").filter(l => l.trim() && !TASK.test(l)).slice(-parseN(a.split(/\s+/), 10)); await print(ls.length ? ls.map(l => "  " + l) : "no notes yet. note <text> adds one.", "tm-dim"); });
  def("tasks", "grep", "grep <words>", "search every line of Stickynote", async a => { if (!a.trim()) U("usage: grep shoes"); const q = a.trim().toLowerCase(), ls = tasksApi().text().split("\n").filter(l => l.toLowerCase().includes(q)); await print(ls.length ? ls.slice(0, 20).map(l => "  " + l.trim()) : `nothing in Stickynote matches "${a.trim()}".`, "tm-dim"); });

  /* ================= TIMERS ================= */
  def("timer", "left remaining", "left", "time left in the focus session", async () => { const tm = A.timer; if (!tm || !tm.status || tm.status.mode === "idle") return dim("no focus session is running."); const s = tm.status, left = s.allot - s.elapsed; await print(`${s.mode === "work" ? "focus" : "break"}: ${left >= 0 ? secT(left) + " left" : secT(-left) + " over"}${s.paused ? " (paused)" : ""}`); });
  def("timer", "pomodoro pomo", "pomodoro", "start a 25 minute focus session", async () => call("start", "25"));
  def("timer", "sprint", "sprint", "start a 50 minute focus session", async () => call("start", "50"));
  def("timer", "deepwork", "deepwork", "start a 90 minute focus session", async () => call("start", "90"));
  def("timer", "focused", "focused", "total focus minutes in sessions finished since the page loaded", async () => { const tm = A.timer; if (!tm || tm.focusSec == null) return dim("the timer is not ready."); await print(`${Math.round(tm.focusSec / 60)} min of focus this session`); });

  /* ================= MATH TOOLS ================= */
  const toBase = (v, b) => { if (!Number.isFinite(v) || v !== Math.floor(v)) U("whole numbers only."); return v.toString(b).toUpperCase(); };
  const fromBase = (s, b) => { const v = parseInt(s.replace(/^0[xbo]/i, ""), b); if (Number.isNaN(v)) U(`"${s}" is not a base ${b} number.`); return v; };
  def("math", "bin", "bin 10", "a whole number in binary (a binary number is read too: bin 0b1010)", async a => { const s = a.trim(); await print(/^0b[01]+$/i.test(s) ? `= ${fromBase(s, 2)}` : `= ${toBase(+s, 2)}`); });
  def("math", "hex", "hex 255", "a whole number in hexadecimal (0xFF is read too)", async a => { const s = a.trim(); await print(/^0x[0-9a-f]+$/i.test(s) ? `= ${fromBase(s, 16)}` : `= ${toBase(+s, 16)}`); });
  def("math", "oct", "oct 64", "a whole number in octal", async a => { await print(`= ${toBase(+a.trim(), 8)}`); });
  def("math", "dec", "dec ff 16", "read a number in a base (default 16) and give the decimal", async a => { const t = a.trim().split(/\s+/); await print(`= ${fromBase(t[0], +t[1] || 16)}`); });
  def("math", "base", "base 255 2", "write a whole number in any base from 2 to 36", async a => { const [v, b] = nums(a); if (!b || b < 2 || b > 36) U("usage: base 255 2"); await print(`= ${toBase(v, b)}`); });
  const gcd = (x, y) => (y ? gcd(y, x % y) : Math.abs(x));
  def("math", "gcd", "gcd 48 18", "greatest common divisor", async a => { const n = nums(a); if (n.length < 2) U("usage: gcd 48 18"); await print(`= ${n.reduce(gcd)}`); });
  def("math", "lcm", "lcm 4 6", "least common multiple", async a => { const n = nums(a); if (n.length < 2) U("usage: lcm 4 6"); await print(`= ${n.reduce((x, y) => x / gcd(x, y) * y)}`); });
  const factor = n => { const o = []; for (let p = 2; p * p <= n; p++) while (n % p === 0) { o.push(p); n /= p; } if (n > 1) o.push(n); return o; };
  def("math", "factor", "factor 360", "prime factors of a whole number", async a => { const n = +a.trim(); if (!Number.isInteger(n) || n < 2 || n > 9e15) U("usage: factor 360   (a whole number from 2 up to 9e15)"); const f = factor(n), c = {}; f.forEach(p => (c[p] = (c[p] || 0) + 1)); await print(`${n} = ${Object.entries(c).map(([p, k]) => (k > 1 ? `${p}^${k}` : p)).join(" × ")}${f.length === 1 ? "  (prime)" : ""}`); });
  def("math", "prime", "prime 97", "is a number prime, and the next prime after it", async a => { const n = +a.trim(); if (!Number.isInteger(n) || n < 0 || n > 9e15) U("usage: prime 97"); const isP = x => x > 1 && factor(x).length === 1; let nx = n + 1; while (!isP(nx)) nx++; await print(`${n} is ${isP(n) ? "prime" : "not prime"}; the next prime is ${nx}`); });
  def("math", "primes", "primes 50", "all primes up to N (up to 10 000)", async a => { const n = +a.trim(); if (!n || n < 2 || n > 1e4) U("usage: primes 50   (2 to 10000)"); const s = Array(n + 1).fill(true), o = []; for (let i = 2; i <= n; i++) if (s[i]) { o.push(i); for (let j = i * i; j <= n; j += i) s[j] = false; } await print(`${o.length} primes: ${o.join(" ")}`); });
  def("math", "stats", "stats 4 8 15 16 23 42", "count, mean, median, spread and range of a list of numbers", async a => {
    const v = allNums(a); if (!v || v.length < 2) U("usage: stats 4 8 15 16 23 42"); const s = [...v].sort((x, y) => x - y), md = s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2, F = x => calc.fmt(x);
    await print([`n ${v.length}   sum ${F(v.reduce((x, y) => x + y, 0))}   mean ${F(mean(v))}   median ${F(md)}`, `min ${F(s[0])}   max ${F(s[s.length - 1])}   range ${F(s[s.length - 1] - s[0])}`, `sample sd ${F(sdev(v))}   variance ${F(sdev(v) ** 2)}`], "tm-dim");
  });
  def("math", "pct", "pct 15 of 80", "a percentage of a number (pct 12 of 80 also works backwards: what percent is 12 of 80)", async a => { const m = a.trim().match(/^(-?\d+(?:\.\d+)?)\s*%?\s*(of|is|from)\s*(-?\d+(?:\.\d+)?)$/i); if (!m) U("usage: pct 15 of 80   ·   pct 12 is 80"); const x = +m[1], y = +m[3]; await print(m[2].toLowerCase() === "of" ? `${trim(x, 6)}% of ${trim(y, 6)} = ${calc.fmt(x * y / 100)}` : `${trim(x, 6)} is ${calc.fmt(x / y * 100)}% of ${trim(y, 6)}`); });
  def("math", "change", "change 80 100", "the percent change from one number to another", async a => { const [x, y] = nums(a); if (x == null || y == null || x === 0) U("usage: change 80 100"); const p = (y / x - 1) * 100; await print(`${x} → ${y}: ${p >= 0 ? "+" : "−"}${calc.fmt(Math.abs(p))}%`); });

  /* ================= RANDOM ================= */
  const rnd = () => { const b = new Uint32Array(1); crypto.getRandomValues(b); return b[0] / 4294967296; };
  def("rand", "rand random", "rand [max] | rand 1 100", "a random whole number (default 1 to 100)", async a => { const n = nums(a); let lo = 1, hi = 100; if (n.length === 1) hi = n[0]; else if (n.length >= 2) [lo, hi] = n; if (hi < lo) [lo, hi] = [hi, lo]; await print(`= ${lo + Math.floor(rnd() * (Math.floor(hi) - Math.ceil(lo) + 1))}`); });
  def("rand", "pick choose", "pick pizza, sushi, tacos", "choose one item from a list separated by commas", async a => { const o = a.split(/,|\bor\b/).map(x => x.trim()).filter(Boolean); if (o.length < 2) U("usage: pick pizza, sushi, tacos"); await print(`→ ${o[Math.floor(rnd() * o.length)]}`); });

  /* ================= TEXT TOOLS ================= */
  const need = (a, u) => (a.length ? a : U(`usage: ${u}`));

  /* ================= CONSOLE ================= */
  def("sys", "past", "past [n]", "the commands you typed this visit (Up arrow recalls them too)", async a => { const h = history(); await print(h.length ? h.slice(0, parseN(a.split(/\s+/), 15)).reverse().map((x, i) => `  ${x}`) : "nothing typed yet.", "tm-dim"); });
  def("sys", "alias", "alias ww = weight | alias", "make your own short name for a command (kept in this browser); alone, lists them", async a => {
    const m = a.match(/^(\S+)\s*=\s*(.+)$/); if (!a.trim()) { const e = Object.entries(aliases()); return print(e.length ? e.map(([k, v]) => `  ${k} = ${v}`) : "no aliases yet. alias ww = weight 70.4 makes ww run that.", "tm-dim"); } if (!m) U("usage: alias ww = weight   ·   alias gl = log yesterday"); if (names().includes(m[1].toLowerCase()) && !aliases()[m[1].toLowerCase()]) U(`"${m[1]}" is already a command.`);
    c.setAlias(m[1].toLowerCase(), m[2].trim()); await print(`✓ ${m[1].toLowerCase()} now runs: ${m[2].trim()}`);
  });
  def("sys", "unalias", "unalias ww", "remove one of your aliases", async a => { if (!aliases()[a.trim().toLowerCase()]) U(`no alias called "${a.trim()}".`); c.setAlias(a.trim().toLowerCase(), null); await print("✓ alias removed"); });
  def("sys", "copy", "copy [text]", "copy text, or the last answer, to the clipboard", async a => { const t = a.trim() || lastOut(); if (!t) U("nothing to copy yet."); await print(await copyText(t) ? "✓ copied" : "could not reach the clipboard; the browser blocked it."); });
  def("sys", "bye exit quit", "bye", "inside the calculator, leaves it. Elsewhere the console stays put: use go <page> to switch pages", async () => { await dim("the console stays open. To switch page:"); await print(PAGES); });
  def("sys", "hi hello hey hiya yo sup howdy hola gm morning", "hi", "a quick briefing: last night, today's plan, what is next, what needs doing, and what to try", async () => {
    const now = new Date(), hr = now.getHours(), part = hr < 5 ? "Still up" : hr < 12 ? "Good morning" : hr < 17 ? "Good afternoon" : "Good evening", out = [html(esc(`${part}. ${fmtDay(now)}, ${hhmm(now)}`))], tryRows = [];
    const ctx = window.__dashContext && window.__dashContext(); let h = null; try { h = A.health && A.health(); } catch {}
    if (ctx && ctx.lastNight) { const l = ctx.lastNight, dm = h && ctx.sleepDebt ? (() => { try { const { sf } = debtNow(); return h.bad("sleepDebtHours", sf.hours); } catch { return false; } })() : false;
      out.push(html(esc(`  Sleep    ${l.sleep} last night, asleep by ${l.asleepBy}, quality ${l.quality ?? "—"}`) + (ctx.sleepDebt ? esc(". Debt ") + rd(ctx.sleepDebt, dm) : ""))); }
    else out.push("  Sleep    no night recorded yet");
    if (ctx && ctx.recovery) { const r = ctx.recovery; out.push(`  Body     ${r.hrvToday != null ? `HRV ${r.hrvToday} ms, ` : ""}${r.restingHrToday != null ? `resting HR ${r.restingHrToday} bpm, ` : ""}body check: ${r.bodyCheck}`); }
    if (ctx) out.push(`  Plan     ${ctx.plan.today} today, ${ctx.plan.tomorrow} tomorrow`);
    try { const cal = A.cal, ev = cal ? cal.events().filter(e => !e.allDay && !e.done && e.e > now).sort((x, y) => x.s - y.s)[0] : null;
      if (ev) { const mins = Math.round((ev.s - now) / 6e4); out.push(`  Next     ${ev.title}, ${ev.s <= now ? "on now" : mins < 60 ? `in ${mins} min` : mins < 1440 ? `in ${Math.floor(mins / 60)} h ${mins % 60} min` : fmtDay(ev.s)} (${hhmm(ev.s)}–${hhmm(ev.e)})`); } else out.push("  Next     nothing coming up in the loaded calendar"); } catch {}
    try { const g = A.gym && A.gym(), todays = g ? g.entries.filter(e => e.date === ymd(now)) : []; out.push(todays.length ? `  Gym      ${todays.reduce((s, e) => s + (e.sets || 1), 0)} set${todays.reduce((s, e) => s + (e.sets || 1), 0) === 1 ? "" : "s"} logged today` : `  Gym      nothing logged yet today${ctx && ctx.plan.today !== "Run" ? ` (${ctx.plan.today})` : ""}`); } catch {}
    try { if (A.tasks && A.tasks.text) { const open = taskList().filter(t => !t.done).length; out.push(`  Tasks    ${open ? `${open} open` : "none open"}`); } } catch {}
    try { const w = loadWeights(), lw = w[w.length - 1]; if (lw) { const ago = Math.round((midnight(now) - midnight(new Date(lw.date + "T12:00"))) / 864e5); out.push(`  Weight   ${n3(lw.kg)} kg${ago ? `, ${ago} day${ago > 1 ? "s" : ""} ago` : ", logged today"}`); if (ago >= 3) tryRows.push("weight 70.4 logs today's"); } else tryRows.push("weight 70.4 logs your first weigh-in"); } catch {}
    if (hr < 12) tryRows.unshift("today", "routine"); else if (hr < 18) tryRows.unshift("free", "block 2h study"); else tryRows.unshift("bedtime", "agenda");
    out.push("", `try: ${[...new Set(tryRows)].slice(0, 4).join("  ·  ")}`, "or just say it: how did I sleep · what's next · calculator · help");
    await print(out, "tm-dim");
  });
  def("sys", "commands", "commands", "every command name on one screen", async () => { const by = {}; meta.forEach(m => (by[m.cat] ||= []).push(m.n)); await print(Object.entries(by).map(([k, v]) => `${(GROUPS[k] || k).padEnd(18)} ${v.sort().join(" ")}`), "tm-dim"); });

  addMore({ def, print, dim, ask, choose, err, undos, parseWhen, fmtDay, hhmm, midnight, addDaysD, call, history, H, series, MET, metric, calApi, tasksApi, gymApi, taskList, pickTask, rewrite, TASK, lastKg, loadWeights,
    pad, hmm, num, nn, mean, sdev, trim, thou, chart, link, dotHBars, timers, clk, rd, html, U, esc, ymd, addDays, n3, nums, relDays, longDay, copyText, beep, rankExercises, debtNow, ZONES });
  return { cmds: L, meta };
}
