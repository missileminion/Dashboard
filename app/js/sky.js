// Sky theme: the UI is always dark; the background glow and brightness follow the sun's real position.
// Night, twilight, blue hour, a warm vivid dawn, brighter day, golden hour, dusk, all blended continuously.
// Where you are is read once from the browser (it asks permission; rounded to ~10 km, kept only in this browser, never sent anywhere).
// Without permission it falls back to a guess from your timezone. Add ?sun=06:15 to the address to preview another time of day.
const rad = Math.PI / 180, hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const lerp = (a, b, t) => a + (b - a) * t, smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/* ---------- where the sun is ---------- */
function sunPos(date, lat, lon) {
  const d = date / 86400000 + 2440587.5 - 2451545.0, g = (357.529 + 0.98560028 * d) * rad;
  const L = (280.459 + 0.98564736 * d + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * rad, e = (23.439 - 3.6e-7 * d) * rad;
  const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L)), dec = Math.asin(Math.sin(e) * Math.sin(L));
  const H = ((280.16 + 360.9856235 * d + lon) * rad) - ra;
  const alt = Math.asin(Math.sin(lat * rad) * Math.sin(dec) + Math.cos(lat * rad) * Math.cos(dec) * Math.cos(H)) / rad;
  return { alt, rising: Math.sin(H) < 0, east: smooth(-.35, .35, -Math.sin(H)) };
}

/* ---------- the glow as one continuous formula of sun altitude (no sections, no keyframes) ----------
   Four smooth weights overlap and are blended together: night, blue hour (sun near -6 degrees), the warm horizon glow (peaks just
   after sunrise or before sunset) and daylight. Dawn and dusk differ by a smooth factor of the sun's side of the sky. */
const gauss = (x, c, w) => Math.exp(-(((x - c) / w) ** 2));
const NIGHT = ["#2a3a8f", "#5a2a6e", "#1c5f66"], BLUE = ["#2f56d0", "#6a3fb0", "#1f7f9a"], DAYC = ["#7fa6ff", "#b9a4f0", "#7fd9cc"];
const DAWN = ["#ffb347", "#ff6f9c", "#ffd86b"], DUSK = ["#ff7a4a", "#e0508a", "#ffb347"];
function glow(alt, east) {
  const w = [1 - smooth(-18, -6, alt), gauss(alt, -6, 4.5), gauss(alt, 1.5, 7), smooth(-2, 22, alt)], sum = w.reduce((x, y) => x + y);
  const warm = [0, 1, 2].map(i => hex(DAWN[i]).map((v, j) => lerp(hex(DUSK[i])[j], v, east)));   // east = 1 at dawn, 0 at dusk
  const col = i => rgbHex([0, 1, 2].map(j => (w[0] * hex(NIGHT[i])[j] + w[1] * hex(BLUE[i])[j] + w[2] * warm[i][j] + w[3] * hex(DAYC[i])[j]) / sum));
  const op = .07 + .27 * smooth(-12, 8, alt) + .07 * smooth(0, 26, alt) + .08 * w[2] / sum + .05 * w[1] / sum;
  return { orbs: [col(0), col(1), col(2)], op: Math.min(.52, op) };
}
const relLum = c => { const [r, g, b] = c.map(v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }); return .2126 * r + .7152 * g + .0722 * b; };
const ratio = (a, b) => (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
// lighten a colour just enough to reach a contrast ratio against the backdrop (unchanged when it already has enough)
const lighten = (c, bgL, target) => {
  if (ratio(relLum(c), bgL) >= target) return c;
  let lo = 0, hi = 1; for (let i = 0; i < 12; i++) { const m = (lo + hi) / 2; ratio(relLum(c.map(v => lerp(v, 255, m))), bgL) >= target ? hi = m : lo = m; }
  return c.map(v => lerp(v, 255, hi));
};
const rgbHex = c => "#" + c.map(v => Math.round(v).toString(16).padStart(2, "0")).join("");

/* sunrise and sunset for a calendar day from the same formula: where the altitude crosses zero */
function sunTimes(day, lat, lon) {
  const t0 = new Date(day); t0.setHours(0, 0, 0, 0); const at = m => sunPos(new Date(t0.getTime() + m * 6e4), lat, lon).alt;
  let rise = null, set = null;
  for (let m = 0; m < 1440; m += 5) { const a = at(m) + .833, b = at(m + 5) + .833; if (a < 0 && b >= 0 && rise == null) rise = m + 5 * (-a / (b - a)); if (a >= 0 && b < 0 && set == null) set = m + 5 * (a / (a - b)); }
  return { rise, set };
}

/* ---------- the dark and light palettes already defined in the stylesheets, read once and blended ---------- */
function palettes() {
  const dark = {}, light = {};
  const take = (rule, into) => { for (const n of rule.style) if (n.startsWith("--")) into[n] = rule.style.getPropertyValue(n).trim(); };
  const isBase = s => s === ":root" || s === "body.theme-glass";
  for (const sh of document.styleSheets) {
    let rules; try { rules = sh.cssRules; } catch { continue; }
    for (const r of rules) {
      if (r.selectorText && isBase(r.selectorText)) take(r, dark);
      else if (r.media && /prefers-color-scheme:\s*light/.test(r.media.mediaText)) for (const rr of r.cssRules) if (rr.selectorText && isBase(rr.selectorText)) take(rr, light);
    }
  }
  return { dark, light: { ...dark, ...light } };
}
const parse = v => {
  let m = v.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (m) { const h = m[1].length === 3 ? [...m[1]].map(c => c + c).join("") : m[1]; return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)).concat(1); }
  m = v.match(/^rgba?\(\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)(?:[ ,/]+([\d.]+))?\s*\)$/);
  return m ? [+m[1], +m[2], +m[3], m[4] == null ? 1 : +m[4]] : null;
};
const css = c => `rgba(${c.slice(0, 3).map(Math.round).join(",")},${+c[3].toFixed(3)})`;

/* ---------- place ---------- */
function place() {
  try { const s = JSON.parse(localStorage.getItem("sky.loc")); if (s) return s; } catch {}
  const y = new Date().getFullYear(), off = -Math.max(new Date(y, 0, 1).getTimezoneOffset(), new Date(y, 6, 1).getTimezoneOffset()) / 60;   // fallback: longitude from the clock's standard-time offset (daylight saving ignored), a mid-latitude guess
  return { lat: 38, lon: off * 15, src: "timezone" };
}

export function initSky({ demo = false } = {}) {
  const P = palettes(), names = Object.keys(P.dark), body = document.body;
  const fixed = new URLSearchParams(location.search).get("sun");
  let manual = null;   // minutes since midnight when the demo time control is in use
  const now = () => { if (manual != null) { const d = new Date(); d.setHours(0, 0, 0, 0); d.setMinutes(manual); return d; } if (!fixed) return new Date(); const [h, m] = fixed.split(":").map(Number), d = new Date(); d.setHours(h, m || 0, 0, 0); return d; };
  function apply() {
    const d = now(), { lat, lon } = place(), { alt, rising, east } = sunPos(d, lat, lon), { orbs: [o1, o2, o3], op } = glow(alt, east);
    for (const n of names) { const a = P.dark[n]; if (a !== P.light[n]) body.style.setProperty(n, a); }   // dark UI always
    const set = (k, v) => body.style.setProperty(k, v);
    const cloud = Math.min(1, Math.max(0, (window.skyWeather?.cloud ?? 0) / 100)), day = smooth(-8, 24, alt) * (1 - .3 * cloud);   // the whole backdrop lifts a little as the sun climbs
    const base = hex("#010103"), lit = hex("#171c29"), tint = hex(o1), tw = (.12 + .06 * day) * smooth(-14, -2, alt);   // pure night is nearly black
    const page = [0, 1, 2].map(i => lerp(lerp(base[i], lit[i], day), tint[i], tw));
    set("--page", css(page.concat(1)));
    set("--orb1", o1); set("--orb2", o2); set("--orb3", o3); set("--orb-op", (op * (1 - .4 * cloud * smooth(-6, 10, alt))).toFixed(3));   // overcast days glow less
    // text and lines keep a constant contrast: estimate how bright the backdrop is behind the cards (page + glow), then lift
    // anything that would blend in. At night nothing changes; around midday the greys brighten.
    const glowC = [0, 1, 2].map(i => (hex(o1)[i] + hex(o2)[i] + hex(o3)[i]) / 3), bgC = page.map((v, i) => lerp(v, glowC[i], Math.min(.5, op * .55)));
    const bgL = relLum(bgC), target = { "--tx": 11, "--ink": 11, "--ink2": 9, "--accent": 8, "--tx2": 6.5, "--rep": 6, "--link": 5, "--mid": 4.8, "--neutral": 4.5, "--tx3": 3.8 };
    for (const [n, tgt] of Object.entries(target)) { const c = parse(P.dark[n] || ""); if (c) set(n, css(lighten(c.slice(0, 3), bgL, tgt).concat(c[3]))); }
    for (const [n, tgt] of Object.entries({ "--none-bd": 2.4, "--none-bar": 1.7, "--track": 1.5 })) { const c = parse(P.dark[n] || ""); if (c) set(n, css(lighten(c.slice(0, 3), bgL, tgt).concat(c[3]))); }
    const k = Math.min(2.4, 1 + 7 * bgL);   // hairlines, grid and card edges are white at low alpha: strengthen them as the backdrop brightens
    for (const n of ["--line", "--edge", "--hair", "--soft", "--grid", "--grid-minor", "--hi"]) { const c = parse(P.dark[n] || ""); if (c) set(n, css([c[0], c[1], c[2], Math.min(.5, c[3] * k)])); }
    document.documentElement.style.colorScheme = "dark";
    const st = sunTimes(d, lat, lon), hm = m => m == null ? "–" : `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(Math.round(m % 60)).padStart(2, "0")}`;
    if (bar) bar.update(d, st, alt);
    window.sky = { alt: +alt.toFixed(1), rising, sunrise: hm(st.rise), sunset: hm(st.set), src: place().src };
  }
  let bar = null;
  if (demo) {   // demo only: a time control to watch the background move through a whole day
    const el = document.createElement("div"); el.className = "skybar";
    el.innerHTML = `<button id="skyPlay" aria-label="Play the day">▶</button><input id="skyT" type="range" min="0" max="1439" step="1" aria-label="Time of day"><span class="num" id="skyL"></span><button id="skyNow">Now</button>`;
    document.body.appendChild(el);
    const $s = id => el.querySelector("#" + id); let timer = null;
    const hm = m => `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(Math.floor(m % 60)).padStart(2, "0")}`;
    const stop = () => { clearInterval(timer); timer = null; $s("skyPlay").textContent = "▶"; };
    $s("skyT").oninput = e => { manual = +e.target.value; stop(); apply(); };
    $s("skyPlay").onclick = () => {
      if (timer) return stop();
      if (manual == null) { const n = new Date(); manual = n.getHours() * 60 + n.getMinutes(); }
      $s("skyPlay").textContent = "❚❚"; timer = setInterval(() => { manual = (manual + 6) % 1440; apply(); }, 70);   // a full day in about 17 seconds
    };
    $s("skyNow").onclick = () => { stop(); manual = null; apply(); };
    bar = { update(d, st, alt) {
      const m = d.getHours() * 60 + d.getMinutes(); $s("skyT").value = m;
      $s("skyL").textContent = `${hm(m)} · sunrise ${hm(st.rise ?? 0)} · sunset ${hm(st.set ?? 0)} · sun ${alt.toFixed(0)}°`;
    } };
  }
  addEventListener("sky:refresh", apply);
  apply(); setInterval(apply, 20000);   // the place comes from the weather card's city search (or a timezone guess until one is chosen)
}
