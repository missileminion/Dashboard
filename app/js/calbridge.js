// Read-only calendar data for the Labs experiments: your real events through the same Apps Script bridge as the Calendar tab
// (the URL and secret are read from this browser's storage), or a generated year of demo events on the demo server.
import { addDays, ymd } from "./util.js";
const DEMO = location.port === "8082" || new URLSearchParams(location.search).has("demo");
export const isDemo = DEMO;
const cfg = () => { try { return JSON.parse(localStorage.getItem("cal.cfg")); } catch { return null; } };
export const connected = () => DEMO || !!(cfg() && cfg().url);
const EVC = { 1: "#a4bdfc", 2: "#7ae7bf", 3: "#dbadff", 4: "#ff887c", 5: "#fbd75b", 6: "#ffb878", 7: "#46d6db", 8: "#e1e1e1", 9: "#5484ed", 10: "#51b749", 11: "#dc2127" };
const at = (d, h, m = 0) => { const x = new Date(d + "T00:00:00"); x.setHours(h, m, 0, 0); return x; };
function demoYear(y) {
  let seed = y * 7 + 3; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const out = []; let id = 1;
  const add = (d, h1, m1, h2, m2, title, color, extra = {}) => out.push({ id: "d" + id++, title, s: at(d, h1, m1), e: at(d, h2, m2), allDay: false, color, cal: "demo", recurring: false, location: "", ...extra });
  for (let d = `${y}-01-01`; d < `${y + 1}-01-01`; d = addDays(d, 1)) {
    const dow = new Date(d + "T12:00:00").getDay(), school = !(d >= `${y}-06-10` && d < `${y}-08-25`);
    if (school && [1, 3, 5].includes(dow)) { add(d, 9, 0, 10, 30, "Thermodynamics", "#34a37a", { recurring: true }); add(d, 13, 0, 14, 0, "Machine Design lab", "#34a37a", { recurring: true }); }
    if (school && [2, 4].includes(dow)) add(d, 10, 0, 11, 15, "Fluid Mechanics", "#34a37a", { recurring: true });
    if (dow === 3) add(d, 17, 30, 18, 30, "Run", "#4f86f7");
    if ([1, 2, 4, 5, 6, 0].includes(dow) && rnd() < .8) add(d, 16 + Math.floor(rnd() * 2), 0, 17 + Math.floor(rnd() * 2), 15, "Gym", "#4f86f7");
    if (rnd() < .12) add(d, 12, 0, 13, 0, "Lunch", "#ffb878");
    if (school && dow === 4 && rnd() < .3) out.push({ id: "d" + id++, title: "Midterm", s: at(d, 0), e: at(addDays(d, 1), 0), allDay: true, color: "#dc2127", cal: "demo", recurring: false, location: "" });
    if (school && rnd() < .1) add(d, 19, 0, 22, 0, "Project crunch", "#a4bdfc");
  }
  return out;
}
let demoCache = {};
async function bridge(action, body) {
  const c = cfg(); if (!c) throw new Error("Not connected");
  const r = await fetch(c.url, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify({ secret: c.secret, action, ...body }) });
  const j = await r.json(); if (j.error) throw new Error(j.error); return j;
}
// events that overlap [start, end) with dates as YYYY-MM-DD, all visible calendars merged, sorted by start
export async function events(start, end) {
  if (DEMO) { const y = +start.slice(0, 4); demoCache[y] ||= [...demoYear(y), ...demoYear(y + 1)]; const a = at(start, 0), b = at(end, 0); return demoCache[y].filter(e => e.s < b && e.e > a); }
  let hidden = []; try { hidden = JSON.parse(localStorage.getItem("cal.hidden")) || []; } catch {}
  let cals = []; try { cals = JSON.parse(localStorage.getItem("cal.cals")) || []; } catch {}
  if (!cals.length) cals = (await bridge("calendars")).calendars;
  const timeMin = at(start, 0).toISOString(), timeMax = at(end, 0).toISOString();
  const res = await Promise.all(cals.filter(c => !hidden.includes(c.id)).map(async c => (await bridge("list", { calendarId: c.id, timeMin, timeMax })).events.map(e => ({ id: e.id, title: e.title, allDay: e.allDay, s: e.allDay ? new Date(e.start + "T00:00:00") : new Date(e.start), e: e.allDay ? new Date(e.end + "T00:00:00") : new Date(e.end), color: EVC[e.colorId] || c.color, cal: c.id, recurring: e.recurring, location: e.location }))));
  return res.flat().sort((a, b) => a.s - b.s || b.e - a.e);
}
export const today = () => ymd(new Date());
export const hhmm = d => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
export const location_ = () => { try { const s = JSON.parse(localStorage.getItem("sky.loc")); if (s && s.lat != null) return s; } catch {} try { const c = JSON.parse(localStorage.getItem("weather.city")); if (c) return { lat: c.lat, lon: c.lon }; } catch {} return { lat: 34, lon: -118 }; };
