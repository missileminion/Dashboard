// Connections: everything the phone needs to talk to the same places as the web dashboard, set up on the phone itself.
// GitHub data repo (gym log, tasks, health cache), Notes repo, calendar bridge, weather city, and health data (Health Connect in the app).
// Tokens and secrets are typed or pasted here and kept in this app's storage only, exactly like the web version.
import { gh, ghCheck, ghMessage } from "./ghstore.js";
import { notesCfg } from "./litenotes.js";
import { esc } from "./util.js";

const ls = { get: k => { try { return localStorage.getItem(k) || ""; } catch { return ""; } }, set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} } };
const jget = k => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
// GitHub opens its "new fine-grained token" page with the name, expiry and Contents: read and write already filled in.
const TOKEN_URL = "https://github.com/settings/personal-access-tokens/new?name=Dashboard%20phone&description=Gym%20log%2C%20tasks%2C%20notes%20and%20health%20sync%20for%20the%20Dashboard%20app&expires_in=366&contents=write";

export function initSettings({ sheet, body, demo, native, health, onChange, toast }) {
  let page = "main";
  const status = { gh: null, notes: null, cal: null, watch: null };
  let watch = null;   // what the phone knows about the Galaxy Watch link (Android app only): { watches: [{name, nearby, app}], lastIn, lastOut } or { error }
  const ago = t => { if (!t) return "never"; const m = Math.round((Date.now() - t) / 6e4); return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`; };
  async function checkWatch() {
    if (!native || demo) return;
    const C = window.Capacitor, P = C.Plugins?.HealthConnect;
    try { watch = await (P?.wearStatus ? P.wearStatus() : C.nativePromise("HealthConnect", "wearStatus", {})); } catch (e) { watch = { error: e.message || "Watch link unavailable" }; }
    const w = watch.watches?.[0];
    status.watch = watch.error ? false : !w ? null : w.app ? true : false;   // red only when something is wrong: no link, or a watch without the app
  }
  const watchLine = () => { if (!watch) return "Checking…"; if (watch.error) return "Link unavailable"; const w = watch.watches?.[0]; return !w ? "No watch connected" : !w.app ? `${w.name}: app not installed` : `${w.name} · ${ago(watch.lastIn)}`; };
  const dot = s => `<span class="dot ${s === true ? "ok" : s === false ? "err" : ""}"></span>`;
  const row = (id, title, sub, s) => `<button class="row" type="button" data-go="${id}">${dot(s)}<span class="k"><b>${title}</b></span><span class="note" style="margin:0 4px 0 0;max-width:46%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(sub)}</span><span class="chev">›</span></button>`;
  const head = (t, back = true) => `<h2>${back ? `<button class="back" type="button" data-go="main" aria-label="Back">‹</button>` : ""}${t}</h2>`;

  async function check() {
    if (demo) { status.gh = status.notes = status.cal = true; return; }
    checkWatch().then(() => { if (!sheet.hidden && (page === "main" || page === "watch")) render(); });
    status.gh = gh.on ? await ghCheck().then(() => true, () => false) : null;
    status.notes = notesCfg.remote ? await fetch(`https://api.github.com/repos/${notesCfg.repo}`, { headers: { Authorization: `Bearer ${notesCfg.token}` } }).then(r => r.ok, () => false) : null;
    status.cal = jget("cal.cfg")?.url ? true : null;
  }
  function render() {
    const city = jget("weather.city"), cal = jget("cal.cfg"), h = health.state();
    if (page === "main") body.innerHTML = `${head("Connections", false)}<p class="lead">The phone and the web dashboard share data through these. Each is set up once.</p>
      <div class="list">
        ${row("health", native ? "Health Connect" : "Health data", h.text, h.ok)}
        ${row("github", "Sync with web", gh.on ? gh.repo : "Not connected", status.gh)}
        ${row("notes", "Notes", notesCfg.remote ? notesCfg.repo : "Only on this phone", status.notes)}
        ${row("calendar", "Calendar", cal?.url ? "Connected" : "Not connected", status.cal)}
        ${row("weather", "Weather", city?.name || "No city", city ? true : null)}
        ${native && !demo ? row("watch", "Galaxy Watch", watchLine(), status.watch) : ""}
      </div>
      <a class="row card tap" href="index.html?full${demo ? "&demo" : ""}"><span class="k"><b>Full dashboard</b><span class="note" style="margin-left:6px">Home · Console · everything</span></span><span class="chev">›</span></a>`;
    if (page === "github") body.innerHTML = head("Sync with web") + (gh.on ? `
      <p class="lead">Gym log, tasks and health data sync through <b>${esc(gh.repo)}</b>, the same repo the web dashboard uses.</p>
      <div class="list"><div class="row">${dot(status.gh)}<span class="k">${status.gh ? "Connected" : status.gh === false ? "GitHub refused the token" : "Checking…"}</span></div></div>
      <div class="btns"><button class="btn ghost" type="button" data-act="ghOff">Disconnect</button><button class="btn" type="button" data-act="syncNow">Sync now</button></div>` : `
      <p class="lead">Connect the private repo your web dashboard syncs to. Then the gym log, tasks and health data are the same on both.</p>
      <ol class="howto"><li>Tap <b>Create token</b>. GitHub opens with the settings filled in.</li><li>Under <b>Repository access</b>, pick your data repo and your Notes repo.</li><li>Generate, copy the token, come back here and paste it.</li></ol>
      <a class="btn ghost" href="${TOKEN_URL}" style="margin-bottom:16px">Create token on GitHub ↗</a>
      <label class="field"><span>Data repo</span><input id="sRepo" placeholder="missileminion/dashboard-data" autocapitalize="off" autocomplete="off" spellcheck="false" value="${esc(gh.repo)}"></label>
      <label class="field"><span>Token</span><input id="sTok" type="password" placeholder="github_pat_…" autocapitalize="off" autocomplete="off" spellcheck="false"></label>
      <label class="row" style="padding:4px 2px;min-height:40px"><input type="checkbox" id="sSame" checked style="width:20px;height:20px"><span class="k">Use this token for Notes too</span></label>
      <button class="btn" type="button" data-act="ghOn">Connect</button>`) + `<div class="msg" id="sMsg"></div>`;
    if (page === "notes") body.innerHTML = head("Notes") + `<p class="lead">Notes are markdown files in a private repo, the same as the web Notes tab.${notesCfg.remote ? "" : " Until it is connected, new notes stay on this phone."}</p>
      <label class="field"><span>Notes repo</span><input id="nRepo" value="${esc(notesCfg.repo)}" autocapitalize="off" autocomplete="off" spellcheck="false"></label>
      <label class="field"><span>Token</span><input id="nTok" type="password" placeholder="${notesCfg.remote ? "saved (paste to replace)" : "github_pat_…"}" autocapitalize="off" autocomplete="off" spellcheck="false"></label>
      ${gh.on ? `<button class="btn ghost" type="button" data-act="nSame" style="margin-bottom:10px">Use the sync token</button>` : `<a class="btn ghost" href="${TOKEN_URL}" style="margin-bottom:10px">Create token on GitHub ↗</a>`}
      <div class="btns">${notesCfg.remote ? `<button class="btn ghost" type="button" data-act="nOff">Disconnect</button>` : "<span></span>"}<button class="btn" type="button" data-act="nOn">Save</button></div><div class="msg" id="sMsg"></div>`;
    if (page === "calendar") body.innerHTML = head("Calendar") + `<p class="lead">The calendar bridge you deployed from the <b>apps-script</b> folder. Paste the same URL and secret as on the web.</p>
      <label class="field"><span>Web app URL</span><input id="cUrl" type="url" value="${esc(cal?.url || "")}" placeholder="https://script.google.com/macros/s/…/exec" autocapitalize="off" autocomplete="off" spellcheck="false"></label>
      <label class="field"><span>Secret</span><input id="cSec" type="password" placeholder="${cal?.secret ? "saved (paste to replace)" : ""}" autocapitalize="off" autocomplete="off" spellcheck="false"></label>
      <div class="btns">${cal?.url ? `<button class="btn ghost" type="button" data-act="cOff">Disconnect</button>` : "<span></span>"}<button class="btn" type="button" data-act="cOn">Connect</button></div><div class="msg" id="sMsg"></div>`;
    if (page === "weather") body.innerHTML = head("Weather") + `<p class="lead">Forecast from Open-Meteo. Only the city's position is sent.</p>
      <label class="field"><span>City</span><input id="wQ" type="search" placeholder="${esc(city?.label || "Search a city")}" autocomplete="off" spellcheck="false"></label>
      <div class="list" id="wRes" hidden></div>
      <div class="seg" id="wUnit" style="margin-top:4px">${["C", "F"].map(u => `<button type="button" data-u="${u}" class="${(jget("weather.unit") || "C") === u ? "on" : ""}">°${u}</button>`).join("")}</div>`;
    if (page === "watch") { const w = watch?.watches?.[0];
      body.innerHTML = head("Galaxy Watch") + `<p class="lead">The watch logs sets and sends them here over Bluetooth. They join the gym log the next time this app is open, then sync to the web.</p>
      <div class="list">
        <div class="row">${dot(watch?.error ? false : w ? true : null)}<span class="k">Watch</span><span class="v ${watch?.error ? "bad" : ""}">${esc(watch?.error ? watch.error : w ? w.name + (w.nearby ? "" : " (via cloud)") : watch ? "Not connected" : "Checking…")}</span></div>
        <div class="row">${dot(w ? w.app : null)}<span class="k">Watch app</span><span class="v ${w && !w.app ? "bad" : ""}">${w ? (w.app ? "Installed" : "Not installed") : "—"}</span></div>
        <div class="row"><span class="k">Last set from the watch</span><span class="v">${esc(ago(watch?.lastIn))}</span></div>
        <div class="row"><span class="k">Last update to the watch</span><span class="v">${esc(ago(watch?.lastOut))}</span></div>
      </div>
      <div class="btns"><button class="btn ghost" type="button" data-act="wCheck">Check again</button><button class="btn" type="button" data-act="wPush">Send to watch</button></div>`; }
    if (page === "health") body.innerHTML = head(native ? "Health Connect" : "Health data") + health.html();
  }
  const msg = (t, bad = false) => { const m = body.querySelector("#sMsg"); if (m) { m.textContent = t; m.classList.toggle("bad", bad); } };
  const val = id => body.querySelector("#" + id)?.value.trim() || "";

  let wTimer = 0, results = [];
  body.addEventListener("input", e => {
    if (e.target.id !== "wQ") return; clearTimeout(wTimer); const q = e.target.value.trim(), box = body.querySelector("#wRes");
    if (q.length < 2) { box.hidden = true; return; }
    wTimer = setTimeout(async () => {
      try { results = (await (await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=6&language=en&format=json`)).json()).results || []; } catch { results = []; }
      box.hidden = false; box.innerHTML = results.length ? results.map((c, i) => `<button class="row" type="button" data-city="${i}"><span class="k"><b>${esc(c.name)}</b>&nbsp;${esc([c.admin1, c.country].filter(Boolean).join(", "))}</span></button>`).join("") : `<div class="row"><span class="k">No city found</span></div>`;
    }, 300);
  });
  body.addEventListener("click", async e => {
    const go = e.target.closest("[data-go]"), act = e.target.closest("[data-act]"), c = e.target.closest("[data-city]"), u = e.target.closest("[data-u]");
    if (go) { page = go.dataset.go; render(); body.parentElement.scrollTop = 0; return; }
    if (c) { const x = results[+c.dataset.city]; localStorage.setItem("weather.city", JSON.stringify({ name: x.name, label: [x.name, x.admin1, x.country].filter(Boolean).join(", "), lat: +x.latitude.toFixed(2), lon: +x.longitude.toFixed(2) })); localStorage.removeItem("lite.wx"); toast("Weather: " + x.name); page = "main"; render(); onChange("weather"); return; }
    if (u) { localStorage.setItem("weather.unit", JSON.stringify(u.dataset.u)); localStorage.removeItem("lite.wx"); render(); onChange("weather"); return; }
    if (e.target.closest("[data-hc]")) { await health.act(e.target.closest("[data-hc]").dataset.hc); render(); return; }
    if (!act) return; const a = act.dataset.act; act.disabled = true;
    try {
      if (a === "ghOn") {
        const repo = (val("sRepo") || "missileminion/dashboard-data").replace(/^https?:\/\/github\.com\//, "").replace(/\/+$/, ""), tok = val("sTok");
        if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) return msg("Repo should look like owner/name.", true);
        if (tok.length < 20) return msg("Paste the whole token.", true);
        const old = [gh.repo, gh.token]; gh.set(repo, tok); msg("Checking…");
        try { await ghCheck(); } catch (err) { old[0] ? gh.set(...old) : gh.clear(); return msg(ghMessage(err), true); }
        if (body.querySelector("#sSame")?.checked) ls.set("notes.token", tok);
        status.gh = true; toast("Connected to " + repo); page = "main"; render(); onChange("github");
      }
      if (a === "ghOff") { gh.clear(); status.gh = null; page = "main"; render(); onChange("github"); }
      if (a === "syncNow") { onChange("sync"); toast("Syncing"); }
      if (a === "wCheck") { watch = null; render(); await checkWatch(); render(); }
      if (a === "wPush") { dispatchEvent(new Event("wear:push")); toast("Sent the program and last weights"); setTimeout(async () => { await checkWatch(); if (page === "watch") render(); }, 800); }
      if (a === "nSame") { ls.set("notes.token", gh.token); }
      if (a === "nOn" || a === "nSame") {
        const repo = val("nRepo") || "missileminion/Notes", tok = val("nTok") || ls.get("notes.token"); if (!tok) return msg("Paste a token.", true);
        msg("Checking…"); const r = await fetch(`https://api.github.com/repos/${repo}`, { headers: { Authorization: `Bearer ${tok}` } }).catch(() => null);
        if (!r || !r.ok) return msg(!r ? "Can't reach GitHub." : r.status === 404 ? "Repo not found, or the token can't see it." : "GitHub refused the token.", true);
        ls.set("notes.repo", repo); ls.set("notes.token", tok); status.notes = true; toast("Notes connected"); page = "main"; render(); onChange("notes");
      }
      if (a === "nOff") { ls.set("notes.token", null); status.notes = null; page = "main"; render(); onChange("notes"); }
      if (a === "cOn") {
        const url = val("cUrl"), secret = val("cSec") || jget("cal.cfg")?.secret || "";
        if (!/^https:\/\/script\.google(usercontent)?\.com\//.test(url)) return msg("Paste the web app URL from Apps Script (script.google.com/…/exec).", true);
        if (secret.length < 8) return msg("Paste the secret from the script properties.", true);
        msg("Checking…");
        try { const r = await fetch(url, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify({ secret, action: "calendars" }) }); const j = await r.json(); if (j.error) throw new Error(j.error === "unauthorized" ? "The secret does not match the script." : j.error); localStorage.setItem("cal.cals", JSON.stringify(j.calendars || [])); }
        catch (err) { return msg(err.message || "The bridge did not answer.", true); }
        localStorage.setItem("cal.cfg", JSON.stringify({ url, secret })); status.cal = true; toast("Calendar connected"); page = "main"; render(); onChange("calendar");
      }
      if (a === "cOff") { localStorage.removeItem("cal.cfg"); localStorage.removeItem("lite.agenda"); status.cal = null; page = "main"; render(); onChange("calendar"); }
    } finally { act.disabled = false; }
  });

  return {
    async open(p = "main") { page = p; render(); sheet.hidden = false; document.body.style.overflow = "hidden"; await check(); if (!sheet.hidden) render(); },
    close() { sheet.hidden = true; document.body.style.overflow = ""; },
    back() { if (sheet.hidden) return false; if (page !== "main") { page = "main"; render(); } else this.close(); return true; },
    status, check,
  };
}
