// Weather: pick a city with the search box. The card leads with how today differs from yesterday, shows rain as time periods,
// and draws the day as one timeline: temperature (today solid, yesterday dashed), rain periods, and the sun's height over the sky.
// Data comes from Open-Meteo (free, no account or key): the city search sends what you type, the forecast sends the city's coordinates.
// Nothing about you or your health is sent. The chosen city is kept in this browser and also sets where the sun-position background is computed.
import { esc, dayLabel, n3 } from "./util.js";
import { red } from "./standards.js";
import { sunPos } from "./sky.js";
import { moonWatch } from "./moon.js";

const CITY = "weather.city", UNIT = "weather.unit", CACHE = "weather.cache", VERSION = 2;
const WMO = c => c === 0 ? "Clear" : c === 1 ? "Mostly clear" : c === 2 ? "Partly cloudy" : c === 3 ? "Overcast" : c === 45 || c === 48 ? "Fog" : c >= 51 && c <= 57 ? "Drizzle" : c >= 61 && c <= 67 ? "Rain" : c >= 71 && c <= 77 ? "Snow" : c >= 80 && c <= 82 ? "Rain showers" : c === 85 || c === 86 ? "Snow showers" : c >= 95 ? "Thunderstorm" : "—";
const get = (k, d = null) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const put = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
const lerp = (a, b, t) => a + (b - a) * t, smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const hh = h => String(Math.floor(h)).padStart(2, "0") + ":" + String(Math.round((h % 1) * 60)).padStart(2, "0");
const feel0 = c => c.apparent_temperature;
const minutesOf = iso => +iso.slice(11, 13) * 60 + +iso.slice(14, 16);

export function initWeather(root) {
  let city = get(CITY), unit = get(UNIT, "C"), data = null, results = [], timer = null, status = "";
  const dT = c => (unit === "F" ? c * 1.8 : c), T = c => (c == null ? "—" : Math.round(unit === "F" ? c * 9 / 5 + 32 : c));
  const WS = k => (k == null ? "—" : unit === "F" ? Math.round(k * .621) + " mph" : Math.round(k) + " km/h"), wUnit = () => (unit === "F" ? "mph" : "km/h"), dW = k => (unit === "F" ? k * .621 : k);

  root.innerHTML = `<div class="wx-bar"><div class="wx-search"><input id="wxQ" type="search" placeholder="Search a city" autocomplete="off" spellcheck="false" aria-label="Search a city"><div class="wx-res" id="wxRes" hidden></div></div>
    <div class="wx-city" id="wxCity"></div><div style="flex:1"></div><span class="basis" id="wxUpd"></span><div class="seg" id="wxUnit"><button data-u="C">°C</button><button data-u="F">°F</button></div></div><div id="wxBody"></div>`;
  const $$ = id => root.querySelector("#" + id);

  /* ---------- city search ---------- */
  async function search(q) {
    try {
      const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=6&language=en&format=json`);
      results = (await r.json()).results || [];
    } catch { results = []; }
    const box = $$("wxRes"); box.hidden = false;
    box.innerHTML = results.length ? results.map((c, i) => `<button type="button" data-i="${i}"><b>${esc(c.name)}</b> <span>${esc([c.admin1, c.country].filter(Boolean).join(", "))}</span></button>`).join("") : `<div class="basis" style="padding:8px 12px">No city found</div>`;
  }
  $$("wxQ").addEventListener("input", e => { clearTimeout(timer); const q = e.target.value.trim(); if (q.length < 2) { $$("wxRes").hidden = true; return; } timer = setTimeout(() => search(q), 300); });
  $$("wxRes").addEventListener("click", e => {
    const b = e.target.closest("button[data-i]"); if (!b) return; const c = results[+b.dataset.i];
    city = { name: c.name, label: [c.name, c.admin1, c.country].filter(Boolean).join(", "), lat: +c.latitude.toFixed(2), lon: +c.longitude.toFixed(2) };
    put(CITY, city); put("sky.loc", { lat: city.lat, lon: city.lon, src: "city" });   // the sun position follows the city too
    dispatchEvent(new CustomEvent("sky:refresh")); $$("wxQ").value = ""; $$("wxRes").hidden = true; data = null; load(true);
  });
  document.addEventListener("click", e => { if (!e.target.closest(".wx-search")) $$("wxRes").hidden = true; });
  $$("wxUnit").onclick = e => { const b = e.target.closest("button"); if (!b) return; unit = b.dataset.u; put(UNIT, unit); paint(); };

  /* ---------- forecast: yesterday comes along (past_days=1) so today can be compared with it ---------- */
  async function load(force = false) {
    if (!city) return paint();
    const c = get(CACHE);
    if (!force && c && c.v === VERSION && c.lat === city.lat && c.lon === city.lon && Date.now() - c.at < 30 * 60000) { data = c.data; return paint(); }
    status = "Loading…"; paint();
    try {
      const u = `https://api.open-meteo.com/v1/forecast?latitude=${city.lat}&longitude=${city.lon}&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,cloud_cover,wind_speed_10m&hourly=temperature_2m,apparent_temperature,relative_humidity_2m,precipitation_probability,precipitation,wind_speed_10m,uv_index&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,uv_index_max,sunrise,sunset&timezone=auto&past_days=1&forecast_days=5`;
      const r = await fetch(u); if (!r.ok) throw new Error(r.status);
      data = await r.json(); put(CACHE, { v: VERSION, lat: city.lat, lon: city.lon, at: Date.now(), data }); status = "";
    } catch { data = c?.v === VERSION ? c.data : null; status = data ? "Offline: showing the last forecast" : "The forecast could not be loaded"; }
    paint();
  }

  /* ---------- helpers over the hourly data ---------- */
  const dayIdx = (h, day) => h.time.map((t, i) => (t.startsWith(day) ? i : -1)).filter(i => i >= 0);
  const wet = (h, i) => (h.precipitation_probability[i] ?? 0) >= 40 || (h.precipitation[i] ?? 0) >= 0.3;
  function rainPeriods(h, idxs, fromHour = 0) {   // merge consecutive wet hours (a one-hour gap does not split a period)
    const out = []; let cur = null;
    idxs.forEach((i, k) => {
      if (k < fromHour || !wet(h, i)) return;
      const p = h.precipitation_probability[i] ?? 0, mm = h.precipitation[i] ?? 0;
      if (cur && k - cur.end <= 1) { cur.end = k + 1; cur.peak = Math.max(cur.peak, p); cur.mm += mm; } else { cur = { start: k, end: k + 1, peak: p, mm }; out.push(cur); }
    });
    return out;
  }
  const periodText = ps => ps.map(p => `${hh(p.start)}–${hh(p.end)} <span class="basis">up to ${p.peak}%${p.mm >= 0.5 ? `, ${n3(p.mm)} mm` : ""}</span>`).join(" · ");

  const altFn = d => { const off = d.utc_offset_seconds || 0, base = Date.parse(d.daily.time[1] + "T00:00:00Z") - off * 1000; return hr => sunPos(new Date(base + hr * 3600e3), city.lat, city.lon).alt; };
  const wear = f => f <= 2 ? "tights, gloves, a warm jacket and a hat" : f <= 8 ? "tights or leggings, a long sleeve and a light jacket" : f <= 13 ? "shorts or tights with a long sleeve" : f <= 19 ? "shorts and a t-shirt" : f <= 25 ? "shorts and a light singlet, and a cap in the sun" : "the lightest kit you own, a cap, and water with you; slow the pace";

  /* ---------- one timeline for the day: sky, sun height, rain, temperature today and yesterday ---------- */
  function timeline(d, ti, yi, nowHour) {
    const h = d.hourly, W = 560, H = 250, L = 34, R = 12, top = 28, bot = 34, plotH = H - top - bot, x = hr => L + (hr / 24) * (W - L - R);
    const alt = altFn(d);
    const tt = ti.map(i => h.temperature_2m[i]), yt = yi.map(i => h.temperature_2m[i]);
    const lo = Math.min(...tt, ...yt) - 1.5, hi = Math.max(...tt, ...yt) + 1.5, yT = v => top + (1 - (v - lo) / (hi - lo)) * plotH;
    const yS = a => top + (1 - (Math.max(-12, Math.min(70, a)) + 12) / 82) * plotH;   // sun height -12 to 70 degrees across the plot
    let sky = "", s = `<svg viewBox="0 0 ${W} ${H}" class="wx-svg" role="img" aria-label="Today's temperature, rain and sun position">
      <defs><radialGradient id="wxGlow"><stop offset="0" stop-color="#ffd27a" stop-opacity=".9"/><stop offset="1" stop-color="#ff9a62" stop-opacity="0"/></radialGradient>
      <linearGradient id="wxFade" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#ffc060" stop-opacity=".26"/><stop offset="1" stop-color="#ffc060" stop-opacity="0"/></linearGradient>
      <clipPath id="wxClip"><rect x="${L}" y="${top}" width="${W - L - R}" height="${plotH}" rx="6"/></clipPath></defs>`;
    for (let m = 0; m < 1440; m += 15) {   // the sky behind everything: deep blue at night, violet and amber at the horizon, pale blue by day
      const a = alt((m + 7.5) / 60), day = smooth(-6, 10, a), warm = Math.exp(-(((a - 2) / 6) ** 2));
      const r = lerp(14, 130, day) + 90 * warm, g = lerp(20, 170, day) + 40 * warm, b = lerp(60, 235, day) - 50 * warm, o = lerp(.62, .2, day) + .1 * warm;
      sky += `<rect x="${x(m / 60).toFixed(1)}" y="${top}" width="${(x(.26) - x(0) + .6).toFixed(1)}" height="${plotH}" fill="rgba(${Math.round(r)},${Math.round(g)},${Math.round(Math.max(0, b))},${o.toFixed(2)})"/>`;
    }
    s += `<g clip-path="url(#wxClip)">${sky}`;
    ti.forEach((i, k) => { if (wet(h, i)) { const p = (h.precipitation_probability[i] ?? 0) / 100 * plotH * .55; s += `<rect x="${x(k)}" y="${top}" width="${x(1) - x(0)}" height="${plotH}" fill="rgba(110,175,255,.30)"/><rect x="${x(k) + 2}" y="${top + plotH - p}" width="${x(1) - x(0) - 4}" height="${p}" rx="3" fill="rgba(140,195,255,.55)"/>`; } });
    // the sun's height over the day: a soft golden arc with the area under it faded in
    const pts = []; for (let m = 0; m <= 1440; m += 20) pts.push([x(m / 60), yS(alt(m / 60))]);
    s += `<path d="M${pts[0][0]},${top + plotH} ${pts.map(p => "L" + p[0].toFixed(1) + "," + p[1].toFixed(1)).join(" ")} L${pts.at(-1)[0]},${top + plotH} Z" fill="url(#wxFade)"/>
      <path d="${pts.map((p, k) => (k ? "L" : "M") + p[0].toFixed(1) + "," + p[1].toFixed(1)).join(" ")}" fill="none" stroke="#ffc060" stroke-width="2" stroke-linecap="round" opacity=".9"/>
      <line x1="${L}" x2="${W - R}" y1="${yS(0)}" y2="${yS(0)}" stroke="rgba(255,255,255,.22)" stroke-dasharray="2 4"/></g>`;
    // temperature: yesterday dashed and dim, today solid
    const line = (arr, extra) => `<polyline points="${arr.map((v, k) => `${x(k + .5).toFixed(1)},${yT(v).toFixed(1)}`).join(" ")}" fill="none" ${extra} stroke-linejoin="round" stroke-linecap="round"/>`;
    s += line(yt, 'stroke="var(--tx2)" stroke-width="1.6" stroke-dasharray="4 4" opacity=".85"') + line(tt, 'stroke="var(--tx)" stroke-width="2.6"');
    for (let k = 0; k <= 24; k += 3) s += `<text x="${x(k)}" y="${H - 14}" text-anchor="middle" font-size="11" fill="var(--tx2)">${String(k % 24).padStart(2, "0")}</text><line x1="${x(k)}" x2="${x(k)}" y1="${top + plotH}" y2="${top + plotH + 4}" stroke="var(--tx3)"/>`;
    s += `<text x="${L - 6}" y="${yT(Math.max(...tt, ...yt)) + 4}" text-anchor="end" font-size="11" fill="var(--tx2)">${T(Math.max(...tt, ...yt))}°</text><text x="${L - 6}" y="${yT(Math.min(...tt, ...yt)) + 4}" text-anchor="end" font-size="11" fill="var(--tx2)">${T(Math.min(...tt, ...yt))}°</text>`;
    for (const [iso, lab] of [[d.daily.sunrise[1], "sunrise"], [d.daily.sunset[1], "sunset"]]) {   // labels sit above the plot, with a hairline down to the horizon
      const m = minutesOf(iso) / 60, anchor = m < 3 ? "start" : m > 21 ? "end" : "middle";
      s += `<line x1="${x(m)}" x2="${x(m)}" y1="${top - 6}" y2="${yS(0)}" stroke="#ffd9a0" stroke-opacity=".5" stroke-dasharray="2 3"/><text x="${x(m)}" y="${top - 11}" text-anchor="${anchor}" font-size="11.5" fill="#ffd9a0">${lab} ${hh(m)}</text>`;
    }
    if (nowHour != null) {   // now: a line, the sun itself with a glow, and the current temperature
      const a = alt(nowHour), up = a > -4;
      s += `<line x1="${x(nowHour)}" x2="${x(nowHour)}" y1="${top}" y2="${top + plotH}" stroke="rgba(255,255,255,.4)"/>
        <circle cx="${x(nowHour)}" cy="${yS(a)}" r="${up ? 15 : 9}" fill="url(#wxGlow)" opacity="${up ? 1 : .35}"/><circle cx="${x(nowHour)}" cy="${yS(a)}" r="${up ? 5.5 : 4}" fill="${up ? "#fff3d0" : "#9fb0d8"}"/>
        <circle cx="${x(nowHour)}" cy="${yT(tt[Math.min(23, Math.floor(nowHour))])}" r="3.8" fill="var(--tx)"/>`;
    }
    return s + "</svg>";
  }

  /* ---------- how today differs from yesterday ---------- */
  function deviations(d, yi, k) {
    const dl = d.daily, h = d.hourly, c = d.current, dayLen = i => minutesOf(dl.sunset[i]) - minutesOf(dl.sunrise[i]);
    const rows = [
      ["High", T(dl.temperature_2m_max[1]) + "°", dT(dl.temperature_2m_max[1] - dl.temperature_2m_max[0]), "°", .5],
      ["Low", T(dl.temperature_2m_min[1]) + "°", dT(dl.temperature_2m_min[1] - dl.temperature_2m_min[0]), "°", .5],
      ["Right now", T(c.temperature_2m) + "°", dT(c.temperature_2m - h.temperature_2m[yi[k]]), "°", .5, "vs this time yesterday"],
      ["Feels like", T(c.apparent_temperature) + "°", dT(c.apparent_temperature - h.apparent_temperature[yi[k]]), "°", .5, "", red("heat", c.apparent_temperature)],
      ["Wind", WS(c.wind_speed_10m), dW(c.wind_speed_10m - h.wind_speed_10m[yi[k]]), " " + wUnit(), 2, "", red("wind", c.wind_speed_10m)],
      ["Humidity", Math.round(c.relative_humidity_2m) + "%", c.relative_humidity_2m - h.relative_humidity_2m[yi[k]], "%", 3],
      ["UV peak", Math.round(dl.uv_index_max[1]), dl.uv_index_max[1] - dl.uv_index_max[0], "", .5, "", red("uv", dl.uv_index_max[1])],
      ["Rain total", n3(dl.precipitation_sum[1]) + " mm", dl.precipitation_sum[1] - dl.precipitation_sum[0], " mm", .3],
      ["Daylight", `${Math.floor(dayLen(1) / 60)}h ${String(dayLen(1) % 60).padStart(2, "0")}m`, dayLen(1) - dayLen(0), " min", .5],
    ];
    return `<div class="wx-dev">${rows.map(([l, v, dv, u, tiny, hint, cls]) => {
      const flat = Math.abs(dv) < tiny, mag = flat ? "same" : `${dv > 0 ? "▲" : "▼"} ${n3(Math.abs(dv))}${u}`;
      return `<div class="wx-drow"><span>${l}${hint ? `<span class="basis"> ${hint}</span>` : ""}</span><span class="num ${cls || ""}">${v}</span><span class="num wx-dv${flat ? " flat" : ""}">${mag}</span></div>`;
    }).join("")}</div>`;
  }

  function summary(d, yi, nowK, rains) {
    const dl = d.daily, bits = [], dHigh = dT(dl.temperature_2m_max[1] - dl.temperature_2m_max[0]), dLow = dT(dl.temperature_2m_min[1] - dl.temperature_2m_min[0]);
    if (Math.abs(dHigh) < 1 && Math.abs(dLow) < 1) bits.push("About the same temperature as yesterday");
    else if (Math.abs(dHigh) >= Math.abs(dLow)) bits.push(`${n3(Math.abs(dHigh))}° ${dHigh > 0 ? "warmer" : "cooler"} than yesterday at the high`);
    else bits.push(`${n3(Math.abs(dLow))}° ${dLow > 0 ? "warmer" : "cooler"} than yesterday overnight`);
    bits.push(rains.length ? `rain ${rains.map(p => `${hh(p.start)} to ${hh(p.end)}`).join(" and ")}` : (dl.precipitation_sum[0] >= 1 ? "drier, with no rain expected" : "dry"));
    const dWind = d.current.wind_speed_10m - d.hourly.wind_speed_10m[yi[nowK]];
    if (Math.abs(dWind) >= 8) bits.push(dWind > 0 ? "windier" : "calmer");
    return bits.join(", ") + ".";
  }

  function paint() {
    $$("wxCity").textContent = city ? city.label : "";
    [...$$("wxUnit").children].forEach(b => b.classList.toggle("on", b.dataset.u === unit));
    $$("wxUpd").textContent = status;
    const body = $$("wxBody");
    if (!city) { body.innerHTML = `<div class="basis" style="padding:var(--s4) 0">Search for your city above to see the forecast. The same place sets where the sun-position background is worked out.</div>`; return; }
    if (!data) { body.innerHTML = `<div class="basis" style="padding:var(--s4) 0">${esc(status || "Loading…")}</div>`; return; }
    const d = data, c = d.current, h = d.hourly, dl = d.daily, today = dl.time[1], yday = dl.time[0];
    const ti = dayIdx(h, today), yi = dayIdx(h, yday);
    if (ti.length < 24 || yi.length < 24) { body.innerHTML = `<div class="basis" style="padding:var(--s4) 0">The forecast came back incomplete. Try again in a minute.</div>`; return; }
    const nowIso = c.time, onToday = nowIso.startsWith(today), nowK = onToday ? +nowIso.slice(11, 13) : 12, nowHour = onToday ? nowK + +nowIso.slice(14, 16) / 60 : null;
    const todayRain = rainPeriods(h, ti, nowK), tomRain = rainPeriods(h, dayIdx(h, dl.time[2]));
    // best time to run: the next daylight hours with a mild feel, little rain, light wind and low UV
    let best = null;
    h.time.forEach((t, i) => {
      if (t < nowIso.slice(0, 13) + ":00" || t > dl.time[3]) return;
      const hour = +t.slice(11, 13), di = dl.time.indexOf(t.slice(0, 10)); if (di < 0) return;
      const dark = t < dl.sunrise[di].slice(0, 13) + ":00" || t >= dl.sunset[di].slice(0, 13) + ":00"; if (dark || hour < 5 || hour > 21) return;
      const sc = Math.abs(h.apparent_temperature[i] - 11) + (h.precipitation_probability[i] ?? 0) / 100 * 9 + Math.max(0, (h.wind_speed_10m[i] ?? 0) - 20) * .2 + Math.max(0, (h.uv_index[i] ?? 0) - 5) * 1.2;
      if (!best || sc < best.sc) best = { sc, t, feel: h.apparent_temperature[i], rain: h.precipitation_probability[i] ?? 0 };
    });
    const runDay = best ? (best.t.slice(0, 10) === today ? "today" : new Date(best.t).toLocaleDateString("en-US", { weekday: "long" })) : "";

    // "Plan around it": the things you act on today. Everything here comes from the same forecast and the sun's position.
    const altN = altFn(d), at = (from, to, cond) => { for (let m = from; m <= to; m += 5) if (cond(altN(m / 60))) return m / 60; return null; };
    const noon = 13, golden = [at(noon * 60, 1439, a => a <= 6), at(noon * 60, 1439, a => a <= 0)], sunsetH = minutesOf(dl.sunset[1]) / 60;
    const uvHours = ti.filter(i => (h.uv_index[i] ?? 0) >= 3).map(i => ti.indexOf(i)), left = onToday && nowHour < sunsetH ? sunsetH - nowHour : 0;
    const row = (l, v, hint = "") => `<div class="wx-drow wx-prow"><span>${l}</span><span>${v}${hint ? ` <span class="basis">${hint}</span>` : ""}</span></div>`;
    const strip = ti.slice(onToday ? nowK : 0, (onToday ? nowK : 0) + 10).map(i => { const k = ti.indexOf(i); return `<div class="wx-h"><span class="basis">${String(k).padStart(2, "0")}</span><b class="num">${T(h.temperature_2m[i])}°</b><span class="basis ${wet(h, i) ? "wx-wet" : ""}">${h.precipitation_probability[i] ?? 0}%</span></div>`; }).join("");
    const plan = `<div class="wx-plan"><div class="basis" style="margin-bottom:2px">Plan around it</div>
      ${row("Best time to run", best ? `<b>${best.t.slice(0, 10) === today ? "today" : new Date(best.t).toLocaleDateString("en-US", { weekday: "long" })} ${best.t.slice(11, 16)}</b>` : "no daylight hour left", best ? `feels like ${T(best.feel)}°, ${best.rain}% rain` : "")}
      ${best ? row("What to wear", `<b>${wear(best.feel)}</b>`) : ""}
      ${row("Daylight left", left > 0 ? `<b>${Math.floor(left)}h ${String(Math.round((left % 1) * 60)).padStart(2, "0")}m</b>` : `<span class="basis">the sun is down</span>`, `sunset ${hh(sunsetH)}`)}
      ${golden[0] != null && golden[1] != null ? row("Golden hour", `<b>${hh(golden[0])}–${hh(golden[1])}</b>`, "soft light, good for a walk or a run") : ""}
      ${uvHours.length ? row("Sun protection", `<b>${hh(uvHours[0])}–${hh(uvHours.at(-1) + 1)}</b>`, `UV 3 or more, peaks at ${Math.round(dl.uv_index_max[1])}`) : row("Sun protection", `<span class="basis">UV stays low today</span>`)}
      <div class="wx-hours">${strip}</div></div>`;
    body.innerHTML = `<div class="wx-grid"><div>
        <div class="wx-top"><div><div class="num" style="font-size:44px;font-weight:600;letter-spacing:-.03em;line-height:1">${T(c.temperature_2m)}°<small style="font-size:16px;color:var(--tx2);font-weight:400;margin-left:6px">${esc(WMO(c.weather_code))}</small></div>
        <div class="wx-sum">${esc(summary(d, yi, nowK, todayRain))}</div></div>${moonWatch()}</div>
        ${deviations(d, yi, nowK)}
        ${plan}
      </div>
      <div><div class="wx-chart">${timeline(d, ti, yi, nowHour)}</div>
        <div class="wx-leg"><span><i style="background:var(--tx)"></i>Today</span><span><i style="background:var(--tx2);opacity:.8"></i>Yesterday</span><span><i style="background:#ffc060"></i>Sun height</span><span><i style="background:rgba(110,175,255,.6)"></i>Rain</span></div>
        <div class="wx-rain"><div class="basis">Rain</div>
          <div>${todayRain.length ? `Today ${periodText(todayRain)}` : `Today <span class="basis">${onToday && nowK >= 22 ? "nothing more tonight" : "dry for the rest of the day"}</span>`}</div>
          <div>${tomRain.length ? `Tomorrow ${periodText(tomRain)}` : `Tomorrow <span class="basis">dry</span>`}</div></div>
        <div class="wx-days">${dl.time.slice(1).map((day, k) => {
          const i = k + 1, dh = dT(dl.temperature_2m_max[i] - dl.temperature_2m_max[i - 1]), flat = Math.abs(dh) < .5;
          return `<div class="row" style="grid-template-columns:62px 1fr auto 74px auto;gap:var(--s3);padding:6px 0"><span>${k === 0 ? "Today" : dayLabel(day).split(",")[0]}</span><span class="basis">${esc(WMO(dl.weather_code[i]))}</span><span class="basis">${dl.precipitation_probability_max[i]}%</span><span class="num wx-dv${flat ? " flat" : ""}" style="text-align:right">${flat ? "same" : (dh > 0 ? "▲ " : "▼ ") + n3(Math.abs(dh)) + "°"}</span><span class="num">${T(dl.temperature_2m_max[i])}° <span class="basis">${T(dl.temperature_2m_min[i])}°</span></span></div>`;
        }).join("")}<div class="basis" style="margin-top:4px">The change beside each day's high is against the day before it.</div></div>
      </div></div>`;
    const brief = { city: city.name, feelsNow: Math.round(feel0(c)), highToday: dl.temperature_2m_max[1], deltaHigh: dl.temperature_2m_max[1] - dl.temperature_2m_max[0], feelsMax: Math.max(...ti.map(i => h.apparent_temperature[i])), uvMax: dl.uv_index_max[1], rain: todayRain.map(p => ({ start: p.start, end: p.end, peak: p.peak })), rainTomorrow: tomRain.length > 0, bestRun: best ? { day: best.t.slice(0, 10) === today ? "today" : "tomorrow", time: best.t.slice(11, 16), feel: Math.round(best.feel), rain: best.rain } : null };
    const bj = JSON.stringify(brief); if (bj !== JSON.stringify(window.wxBrief)) { window.wxBrief = brief; dispatchEvent(new CustomEvent("wx:ready")); }
    window.skyWeather = { cloud: c.cloud_cover ?? 0 };   // clouds dim the sun glow in the background
    dispatchEvent(new CustomEvent("sky:refresh"));
  }

  paint(); load();
  setInterval(() => load(), 30 * 60000);
}
