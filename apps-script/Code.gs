// Calendar bridge for the Personal Dashboard.
// This runs in your own Google account, as you, so it keeps its own permission to your calendar and the dashboard never has to sign in to Google for it.
// Every request must carry the secret stored in Script properties (SECRET). Without it the script answers "unauthorized" and does nothing.
// The dashboard sends one POST with a JSON body: { secret, action, ... }. Actions: calendars, list, create, update, delete.
// It uses Apps Script's built-in Calendar service (enabled in appsscript.json), so no Google Cloud project needs configuring.

function doPost(e) {
  let req = {};
  try { req = JSON.parse(e.postData.contents); } catch (err) { return out_({ error: "bad request" }); }
  const secret = PropertiesService.getScriptProperties().getProperty("SECRET");
  if (!secret || !req.secret || req.secret !== secret) return out_({ error: "unauthorized" });
  const cal = req.calendarId || "primary";
  try {
    switch (req.action) {
      case "calendars": return out_({ calendars: calendars_() });
      case "list": return out_({ events: list_(cal, req.timeMin, req.timeMax) });
      case "create": return out_({ event: Calendar.Events.insert(req.event, cal) });
      case "update": return out_({ event: Calendar.Events.patch(req.patch, cal, req.id) });
      case "updateFollowing": return out_({ event: following_(cal, req.id, req.patch || {}) });
      case "delete": Calendar.Events.remove(cal, req.id); return out_({ ok: true });
      default: return out_({ error: "unknown action" });
    }
  } catch (err) { return out_({ error: String(err.message || err) }); }
}

function out_(obj) { return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }

function calendars_() {
  const r = Calendar.CalendarList.list({ minAccessRole: "reader", maxResults: 100 });
  return (r.items || []).map(c => ({ id: c.id, name: c.summaryOverride || c.summary, color: c.backgroundColor, primary: !!c.primary, writable: c.accessRole === "owner" || c.accessRole === "writer", selected: c.selected !== false }));
}

// events between two ISO times, repeating events expanded into single dates
function list_(calendarId, timeMin, timeMax) {
  const events = []; let pageToken = "";
  do {
    const r = Calendar.Events.list(calendarId, { singleEvents: true, orderBy: "startTime", maxResults: 250, timeMin: timeMin, timeMax: timeMax, pageToken: pageToken || undefined });
    (r.items || []).forEach(ev => { if (ev.status !== "cancelled") events.push({ id: ev.id, title: ev.summary || "(no title)", start: ev.start.dateTime || ev.start.date, end: ev.end.dateTime || ev.end.date, allDay: !ev.start.dateTime, location: ev.location || "", description: ev.description || "", recurring: !!ev.recurringEventId, colorId: ev.colorId || "", updated: ev.updated }); });
    pageToken = r.nextPageToken || "";
  } while (pageToken);
  return events;
}

// "This and all following events" for a repeating event, the way Google Calendar does it: the series is cut just before this occurrence and a new
// series starts from it with the change. If this is the first occurrence, the whole series is changed instead. Supported shifts to a different day:
// daily repeats and weekly repeats with fixed days (the days shift together). Anything else can change the time of day only.
const DAYS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
function following_(cal, id, patch) {
  const inst = Calendar.Events.get(cal, id), mid = inst.recurringEventId;
  if (!mid) return Calendar.Events.patch(patch, cal, id);
  const master = Calendar.Events.get(cal, mid), orig = inst.originalStartTime || inst.start, timed = !!orig.dateTime, ms = x => Date.parse(x.dateTime || x.date + "T00:00:00Z");
  const origMs = ms(orig), iStart = ms(inst.start), iEnd = ms(inst.end), nStart = patch.start ? ms(patch.start) : iStart, nEnd = patch.end ? ms(patch.end) : nStart + (iEnd - iStart);
  const tz = (master.start && master.start.timeZone) || Session.getScriptTimeZone(), dayOf = t => Utilities.formatDate(new Date(t), tz, "yyyy-MM-dd");
  const pt = t => (timed ? { dateTime: new Date(t).toISOString(), timeZone: tz } : { date: Utilities.formatDate(new Date(t), "UTC", "yyyy-MM-dd") });
  const dayShift = timed ? Math.round((Date.parse(dayOf(nStart) + "T00:00:00Z") - Date.parse(dayOf(origMs) + "T00:00:00Z")) / 864e5) : Math.round((nStart - origMs) / 864e5), dMs = nStart - origMs;
  const rec = (master.recurrence || []).slice(), ri = rec.findIndex(r => /^RRULE:/i.test(r));
  if (ri < 0) return Calendar.Events.patch(patch, cal, id);
  const weeklyDays = /FREQ=WEEKLY/.test(rec[ri]) && /BYDAY=/.test(rec[ri]);
  if (dayShift && !(/FREQ=DAILY/.test(rec[ri]) || weeklyDays)) throw new Error("Moving to a different day is not supported for this kind of repeat. Change the time only, or move it just this once.");
  const shiftRule = r => (dayShift && weeklyDays ? r.replace(/BYDAY=([A-Z,]+)/, (m, d) => "BYDAY=" + d.split(",").map(x => DAYS[(DAYS.indexOf(x) + (dayShift % 7) + 7) % 7]).join(",")) : r);
  const extra = {}; ["summary", "location", "description", "colorId"].forEach(k => { if (patch[k] !== undefined) extra[k] = patch[k]; });
  const mStart = ms(master.start);
  if (mStart === origMs) {   // the first occurrence: the whole series moves
    return Calendar.Events.patch(Object.assign({}, extra, { start: pt(mStart + dMs), end: pt(mStart + dMs + (nEnd - nStart)), recurrence: rec.map((r, i) => (i === ri ? shiftRule(r) : r)) }), cal, mid);
  }
  const until = timed ? Utilities.formatDate(new Date(origMs - 1000), "UTC", "yyyyMMdd'T'HHmmss'Z'") : Utilities.formatDate(new Date(origMs - 864e5), "UTC", "yyyyMMdd");
  const oldRule = rec[ri].replace(/;?(UNTIL|COUNT)=[^;]*/g, "") + ";UNTIL=" + until;
  let newRule = rec[ri]; const mc = /COUNT=(\d+)/.exec(rec[ri]);
  if (mc) { const before = Calendar.Events.instances(cal, mid, { timeMin: new Date(mStart).toISOString(), timeMax: new Date(origMs).toISOString(), maxResults: 500 }).items.length; newRule = newRule.replace(/COUNT=\d+/, "COUNT=" + Math.max(1, +mc[1] - before)); }
  const created = Calendar.Events.insert(Object.assign({ summary: master.summary, location: master.location, description: master.description, colorId: master.colorId, reminders: master.reminders, start: pt(nStart), end: pt(nEnd), recurrence: [shiftRule(newRule)] }, extra), cal);
  Calendar.Events.patch({ recurrence: rec.map((r, i) => (i === ri ? oldRule : r)) }, cal, mid);
  return created;
}

// Run this once from the editor (Run > authorize) to grant the permissions. It changes nothing.
function authorize() { calendars_(); }
