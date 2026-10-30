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
    (r.items || []).forEach(ev => { if (ev.status !== "cancelled") events.push({ id: ev.id, title: ev.summary || "(no title)", start: ev.start.dateTime || ev.start.date, end: ev.end.dateTime || ev.end.date, allDay: !ev.start.dateTime, location: ev.location || "", description: ev.description || "", recurring: !!ev.recurringEventId, updated: ev.updated }); });
    pageToken = r.nextPageToken || "";
  } while (pageToken);
  return events;
}

// Run this once from the editor (Run > authorize) to grant the permissions. It changes nothing.
function authorize() { calendars_(); }
