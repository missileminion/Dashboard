// Weather: pick a city with the search box and get today's conditions, a short outlook and the best hour to run.
// Data comes from Open-Meteo (free, no account or key): the city search sends what you type, the forecast sends the city's coordinates.
// Nothing about you or your health is sent. The chosen city is kept in this browser and also sets where the sun-position background is computed.
import { esc, dayLabel } from "./util.js";
import { red } from "./standards.js";

const CITY = "weather.city", UNIT = "weather.unit", CACHE = "weather.cache";
const WMO = c => c === 0 ? "Clear" : c === 1 ? "Mostly clear" : c === 2 ? "Partly cloudy" : c === 3 ? "Overcast" : c === 45 || c === 48 ? "Fog" : c >= 51 && c <= 57 ? "Drizzle" : c >= 61 && c <= 67 ? "Rain" : c >= 71 && c <= 77 ? "Snow" : c >= 80 && c <= 82 ? "Rain showers" : c === 85 || c === 86 ? "Snow showers" : c >= 95 ? "Thunderstorm" : "—";
const get = (k, d = null) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const put = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

export function initWeather(root) {
  let city = get(CITY), unit = get(UNIT, "C"), data = null, results = [], timer = null, status = "";
  const T = c => (c == null ? "—" : Math.round(unit === "F" ? c * 9 / 5 + 32 : c)), W = k => (k == null ? "—" : unit === "F" ? Math.round(k * .621) + " mph" : Math.round(k) + " km/h");

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

  /* ---------- forecast ---------- */
  async function load(force = false) {
    if (!city) return paint();
    const c = get(CACHE);
    if (!force && c && c.lat === city.lat && c.lon === city.lon && Date.now() - c.at < 30 * 60000) { data = c.data; return paint(); }
    status = "Loading…"; paint();
    try {
      const u = `https://api.open-meteo.com/v1/forecast?latitude=${city.lat}&longitude=${city.lon}&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,cloud_cover,wind_speed_10m&hourly=temperature_2m,apparent_temperature,precipitation_probability,wind_speed_10m,uv_index&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,uv_index_max,sunrise,sunset&timezone=auto&forecast_days=5`;
      const r = await fetch(u); if (!r.ok) throw new Error(r.status);
      data = await r.json(); put(CACHE, { lat: city.lat, lon: city.lon, at: Date.now(), data }); status = "";
    } catch { data = c?.data || null; status = data ? "Offline: showing the last forecast" : "The forecast could not be loaded"; }
    paint();
  }

  /* ---------- best hour to run today (or tomorrow once today's daylight is over) ---------- */
  function bestRun() {
    if (!data) return null;
    const h = data.hourly, now = data.current?.time || h.time[0], rise = data.daily.sunrise, set = data.daily.sunset;
    let best = null;
    h.time.forEach((t, i) => {
      if (t < now.slice(0, 13) + ":00" || i > 48) return;
      const hour = +t.slice(11, 13), day = t.slice(0, 10), di = data.daily.time.indexOf(day); if (di < 0) return;
      const dark = t < rise[di].slice(0, 13) + ":00" || t >= set[di].slice(0, 13) + ":00";
      if (dark || hour < 5 || hour > 21) return;
      const feel = h.apparent_temperature[i], rain = h.precipitation_probability[i] ?? 0, wind = h.wind_speed_10m[i] ?? 0, uv = h.uv_index[i] ?? 0;
      const score = Math.abs(feel - 11) + rain / 100 * 9 + Math.max(0, wind - 20) * .2 + Math.max(0, uv - 5) * 1.2;
      if (!best || score < best.score) best = { score, t, feel, rain };
    });
    return best;
  }

  function paint() {
    $$("wxCity").textContent = city ? city.label : "";
    [...$$("wxUnit").children].forEach(b => b.classList.toggle("on", b.dataset.u === unit));
    $$("wxUpd").textContent = status;
    const body = $$("wxBody");
    if (!city) { body.innerHTML = `<div class="basis" style="padding:var(--s4) 0">Search for your city above to see the forecast. The same place sets where the sun-position background is worked out.</div>`; return; }
    if (!data) { body.innerHTML = `<div class="basis" style="padding:var(--s4) 0">${esc(status || "Loading…")}</div>`; return; }
    const c = data.current, d = data.daily, h = data.hourly, today = d.time[0], i0 = Math.max(0, h.time.findIndex(t => t >= c.time.slice(0, 13) + ":00"));
    const uvMax = d.uv_index_max[0], rain = d.precipitation_probability_max[0], feel = c.apparent_temperature, br = bestRun();
    const stat = (l, v, cls = "") => `<div><div class="basis">${l}</div><div class="num ${cls}" style="font-size:18px;font-weight:600">${v}</div></div>`;
    const hours = [...Array(12)].map((_, k) => i0 + k * 1).filter(i => h.time[i]).map(i => `<div class="wx-h"><span class="basis">${h.time[i].slice(11, 13)}</span><b class="num">${T(h.temperature_2m[i])}°</b><span class="basis ${(h.precipitation_probability[i] ?? 0) >= 50 ? "wx-wet" : ""}">${h.precipitation_probability[i] ?? 0}%</span></div>`).join("");
    body.innerHTML = `<div class="wx-grid"><div>
        <div class="num" style="font-size:44px;font-weight:600;letter-spacing:-.03em;line-height:1">${T(c.temperature_2m)}°<small style="font-size:16px;color:var(--tx2);font-weight:400;margin-left:6px">${esc(WMO(c.weather_code))}</small></div>
        <div class="basis" style="margin-top:4px">Feels like <span class="num ${red("heat", feel)}">${T(feel)}°</span></div>
        <div class="wx-stats">${stat("High / low", `${T(d.temperature_2m_max[0])}° / ${T(d.temperature_2m_min[0])}°`)}${stat("Rain chance", rain + "%")}${stat("Wind", W(c.wind_speed_10m), red("wind", c.wind_speed_10m))}${stat("UV peak", Math.round(uvMax), red("uv", uvMax))}${stat("Humidity", c.relative_humidity_2m + "%")}</div>
        <div class="basis" style="margin-top:var(--s3)">Best time to run ${br ? `<b style="color:var(--tx)">${new Date(br.t).toLocaleDateString("en-US", { weekday: "short" }) === new Date().toLocaleDateString("en-US", { weekday: "short" }) ? "today" : new Date(br.t).toLocaleDateString("en-US", { weekday: "long" })} at ${br.t.slice(11, 16)}</b>, feels like ${T(br.feel)}°, ${br.rain}% rain` : "— no daylight hour left in the next two days"}</div>
      </div>
      <div>${d.time.map((day, k) => `<div class="row" style="grid-template-columns:70px 1fr auto auto;gap:var(--s3);padding:6px 0"><span>${k === 0 ? "Today" : dayLabel(day).split(",")[0]}</span><span class="basis">${esc(WMO(d.weather_code[k]))}</span><span class="basis">${d.precipitation_probability_max[k]}%</span><span class="num">${T(d.temperature_2m_max[k])}° <span class="basis">${T(d.temperature_2m_min[k])}°</span></span></div>`).join("")}</div></div>
      <div class="wx-hours">${hours}</div>`;
    window.skyWeather = { cloud: c.cloud_cover ?? 0 };   // clouds dim the sun glow in the background
    dispatchEvent(new CustomEvent("sky:refresh"));
  }

  paint(); load();
  setInterval(() => load(), 30 * 60000);
}
