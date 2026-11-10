// Strict calendar paste format, v1. One line per item, ten fields separated by "|", always all present ("-" for empty):
//   TYPE|DATE|START|END|PRI|CAL|TITLE|PLACE|REPEAT|NOTES
// A line is accepted whole or rejected with its line number and reason; nothing is written unless every line is valid.
export const CALPASTE_SPEC = `TYPE|DATE|START|END|PRI|CAL|TITLE|PLACE|REPEAT|NOTES`;

const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone, DAYS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"], WD = { MON: "MO", TUE: "TU", WED: "WE", THU: "TH", FRI: "FR", SAT: "SA", SUN: "SU" };
const pad = n => String(n).padStart(2, "0"), ymdOf = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, addD = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const dateOf = s => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s); if (!m) return null; const d = new Date(+m[1], +m[2] - 1, +m[3]); return d.getFullYear() === +m[1] && d.getMonth() === +m[2] - 1 && d.getDate() === +m[3] ? d : null; };
const clock = s => { const m = /^(\d{2}):(\d{2})$/.exec(s); return m && +m[1] < 24 && +m[2] < 60 ? +m[1] * 60 + +m[2] : null; };
const dur = s => { const m = /^\+(\d{2}):(\d{2})$/.exec(s); return m && +m[2] < 60 && +m[1] * 60 + +m[2] > 0 ? +m[1] * 60 + +m[2] : null; };
const at = (day, min) => new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, min);

export const looksLikeCalPaste = t => /^\s*(?:#cal\b[^\n]*\n\s*)?[EAB]\|\d{4}-\d{2}-\d{2}\|/m.test(t || "") && (t.match(/^[EAB]\|/gm) || []).length >= 1;

function rule(rep, day, allDay) {
  if (rep === "-") return null;
  const m = /^(DAILY|MONTHLY|WEEKLY(?::((?:MON|TUE|WED|THU|FRI|SAT|SUN)(?:,(?:MON|TUE|WED|THU|FRI|SAT|SUN))*))?)(?:;UNTIL=(\d{4}-\d{2}-\d{2}))?$/.exec(rep);
  if (!m) return false;
  let r = "RRULE:FREQ=" + m[1].split(":")[0]; if (m[2]) r += ";BYDAY=" + m[2].split(",").map(x => WD[x]).join(",");
  if (m[3]) { const u = dateOf(m[3]); if (!u) return false; r += ";UNTIL=" + (allDay ? m[3].replace(/-/g, "") : at(u, 1439).toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "")); }
  return [r];
}

// text -> { items, errors } ; cal is the calendar api (calendars(), events())
export function parseCalPaste(text, cal) {
  const cals = cal.calendars(), items = [], errors = [], busy = {};
  const find = n => { const k = n.toLowerCase(); return cals.find(c => c.name.toLowerCase() === k || c.id.toLowerCase() === k || c.name.toLowerCase().replace(/\s+/g, "") === k); };
  const busyOn = day => busy[ymdOf(day)] || (busy[ymdOf(day)] = cal.events().filter(e => !e.allDay && e.s < addD(day, 1) && e.e > day).map(e => [Math.max(0, (e.s - day) / 6e4), Math.min(1440, (e.e - day) / 6e4)]));
  String(text).split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim(); if (!line || line.startsWith("#")) return;
    const bad = why => errors.push({ n: i + 1, why, raw: line }), f = line.split(/(?<!\\)\|/).map(x => x.trim().replace(/\\\|/g, "|"));
    if (f.length !== 10) return bad(`expected 10 fields separated by |, found ${f.length}`);
    if (f.some(x => x.includes("??"))) return bad("contains ?? (unreadable in the source): fix or remove it");
    const [type, d, st, en, pr, cn, title0, place, rep, notes] = f;
    if (!/^[EAB]$/.test(type)) return bad(`TYPE "${type}" must be E, A or B`);
    const day = dateOf(d); if (!day) return bad(`DATE "${d}" must be a real date as YYYY-MM-DD`);
    if (!/^(-|!|!!|!!!)$/.test(pr)) return bad(`PRI "${pr}" must be -, !, !! or !!!`);
    const c = find(cn); if (!c) return bad(`CAL "${cn}" is not a writable calendar (${cals.map(x => x.name.toLowerCase().replace(/\s+/g, "")).join(", ")})`);
    let title = title0, done = false; if (title.startsWith("✓")) { done = true; title = title.replace(/^✓\s*/, ""); } if (!title) return bad("TITLE is empty");
    const pri = pr === "-" ? 0 : pr.length;
    let s, e, allDay = false;
    if (type === "A") {
      if (st !== "-" || en !== "-") return bad("an A (all-day) line needs START and END as -"); allDay = true;
    } else if (type === "E") {
      const a = clock(st); if (a == null) return bad(`START "${st}" must be HH:MM (24-hour)`);
      let b; if (en === "-") b = a + 60; else if (en.startsWith("+")) { const k = dur(en); if (k == null) return bad(`END "${en}" must be +HH:MM above zero`); b = a + k; } else { b = clock(en); if (b == null) return bad(`END "${en}" must be HH:MM, +HH:MM or -`); if (b <= a) return bad(`END ${en} is not after START ${st}`); }
      s = at(day, a); e = at(day, b);
    } else {
      if (st !== "-") return bad("a B (block) line needs START as -"); const k = dur(en); if (k == null) return bad(`a B (block) line needs END as +HH:MM, found "${en}"`);
      const b = busyOn(day), now = new Date(); let cur = 7 * 60; if (ymdOf(day) === ymdOf(now)) cur = Math.max(cur, Math.ceil((now.getHours() * 60 + now.getMinutes()) / 15) * 15);
      for (const [x, y] of [...b].sort((p, q) => p[0] - q[0])) { if (x - cur >= k) break; cur = Math.max(cur, y); }
      if (cur + k > 22 * 60) return bad(`no free gap of ${en.slice(1)} on ${d} before 22:00`);
      s = at(day, cur); e = at(day, cur + k); b.push([cur, cur + k]);
    }
    const r = rule(rep, day, allDay); if (r === false) return bad(`REPEAT "${rep}" must be -, DAILY, WEEKLY, WEEKLY:MON,WED, or MONTHLY, optionally ;UNTIL=YYYY-MM-DD`);
    if (!allDay && type === "E") (busyOn(day)).push([(s - day) / 6e4, (e - day) / 6e4]);
    items.push({ n: i + 1, type, day, s, e, allDay, pri, done, cal: c.id, calName: c.name, title, place: place === "-" ? "" : place, notes: notes === "-" ? "" : notes, recurrence: r });
  });
  return { items, errors };
}

const T = d => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
export const previewLines = items => items.map(i => `${ymdOf(i.day)}  ${i.allDay ? "all day   " : T(i.s) + "-" + T(i.e)}  ${"!".repeat(i.pri).padEnd(3)} ${i.done ? "✓ " : ""}${i.title}${i.place ? "  @" + i.place : ""}${i.recurrence ? "  ↻ " + i.recurrence[0].replace("RRULE:FREQ=", "").split(";")[0].toLowerCase() : ""}  [${i.calName}]${i.type === "B" ? "  (placed in a free gap)" : ""}`);
export const errorLines = errors => errors.map(x => `line ${x.n}: ${x.why}\n        ${x.raw.length > 90 ? x.raw.slice(0, 90) + "…" : x.raw}`);

export async function commitItems(cal, items) {
  const made = await cal.createMany(items.map(i => ({
    cal: i.cal, summary: (i.done ? "✓ " : "") + (i.pri ? "!".repeat(i.pri) + " " : "") + i.title, location: i.place, description: i.notes, recurrence: i.recurrence,
    start: i.allDay ? { date: ymdOf(i.day) } : { dateTime: i.s.toISOString(), timeZone: TZ }, end: i.allDay ? { date: ymdOf(addD(i.day, 1)) } : { dateTime: i.e.toISOString(), timeZone: TZ }
  })));
  try { localStorage.setItem("calpaste.last", JSON.stringify(made)); } catch {}
  return made.length;
}
export async function undoLast(cal) {
  let last = []; try { last = JSON.parse(localStorage.getItem("calpaste.last") || "[]"); } catch {}
  if (!last.length) return 0;
  for (const m of last) { try { await cal.remove(m.id, m.cal); } catch {} }
  try { localStorage.removeItem("calpaste.last"); } catch {}
  return last.length;
}
