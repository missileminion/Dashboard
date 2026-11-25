// The moon as you would see it tonight: a real photograph-based map (NASA / Lunar Reconnaissance Orbiter colour map, img/moon-lroc-2k.jpg)
// wrapped on a sphere and lit from the sun's true direction, then turned the way the moon is turned in your sky.
//   - Phase and the tilt of the bright side: from the moon's and sun's real positions (low-precision lunar theory, good to about 0.3 degree).
//   - Which face you see: optical libration (the moon nods and sways by up to about 7 degrees), so the craters near the edge shift from week to week.
//   - Rotation on screen: the parallactic angle for your place and the clock. A rising moon leans one way, a setting moon the other.
//   - Place: the city from the weather card (kept in this browser), else a guess from the timezone. Nothing is sent anywhere.
// Shading is Lommel-Seeliger (the way a dusty airless surface scatters light), so a full moon is nearly flat to the edge and the terminator is soft.
const SYN = 29.530588853, REF = Date.UTC(2000, 0, 6, 18, 14) / 864e5, rad = Math.PI / 180, nrm = x => ((x % 360) + 360) % 360;
export function moonState(date = new Date()) {
  const age = (((date.getTime() / 864e5 - REF) % SYN) + SYN) % SYN, f = age / SYN, lit = (1 - Math.cos(2 * Math.PI * f)) / 2;
  const names = [[.0338, "New moon"], [.2162, "Waxing crescent"], [.2838, "First quarter"], [.4662, "Waxing gibbous"], [.5338, "Full moon"], [.7162, "Waning gibbous"], [.7838, "Last quarter"], [.9662, "Waning crescent"], [1.01, "New moon"]];
  const name = names.find(([lim]) => f < lim)[1], toFull = (((.5 - f) % 1) + 1) % 1 * SYN, toNew = ((1 - f) % 1) * SYN;
  return { age, f, lit, name, toFull, toNew, waxing: f < .5 };
}

function place() {
  try { const s = JSON.parse(localStorage.getItem("sky.loc")); if (s && s.lat != null) return s; } catch {}
  const y = new Date().getFullYear(), off = -Math.max(new Date(y, 0, 1).getTimezoneOffset(), new Date(y, 6, 1).getTimezoneOffset()) / 60;
  return { lat: 38, lon: off * 15 };
}

// where the moon and sun are, and how the moon is lit and turned, for an instant and a place
export function lunar(date = new Date(), { lat, lon } = place()) {
  const d = date.getTime() / 864e5 + 2440587.5 - 2451545;
  const Lm = nrm(218.316 + 13.176396 * d), Mm = nrm(134.963 + 13.064993 * d) * rad, F = nrm(93.272 + 13.22935 * d) * rad, Ms = nrm(357.529 + 0.98560028 * d) * rad, D = nrm(297.85 + 12.190749 * d) * rad;
  const lam = (Lm + 6.289 * Math.sin(Mm) + 1.274 * Math.sin(2 * D - Mm) + 0.658 * Math.sin(2 * D) + 0.214 * Math.sin(2 * Mm) - 0.186 * Math.sin(Ms) - 0.114 * Math.sin(2 * F)) * rad;
  const bet = (5.128 * Math.sin(F) + 0.281 * Math.sin(Mm + F) + 0.278 * Math.sin(Mm - F) + 0.173 * Math.sin(2 * D - F)) * rad, eps = (23.439 - 3.6e-7 * d) * rad;
  const eq = (l, b) => ({ ra: Math.atan2(Math.sin(l) * Math.cos(eps) - Math.tan(b) * Math.sin(eps), Math.cos(l)), dec: Math.asin(Math.sin(b) * Math.cos(eps) + Math.cos(b) * Math.sin(eps) * Math.sin(l)) });
  const mo = eq(lam, bet), su = eq((280.459 + 0.98564736 * d + 1.915 * Math.sin(Ms) + 0.02 * Math.sin(2 * Ms)) * rad, 0);
  // phase angle (sun-moon-earth) and the direction of the bright limb, measured from celestial north through east
  const dA = su.ra - mo.ra, psi = Math.acos(Math.sin(mo.dec) * Math.sin(su.dec) + Math.cos(mo.dec) * Math.cos(su.dec) * Math.cos(dA)), phase = Math.PI - psi;
  const chi = Math.atan2(Math.cos(su.dec) * Math.sin(dA), Math.sin(su.dec) * Math.cos(mo.dec) - Math.cos(su.dec) * Math.sin(mo.dec) * Math.cos(dA));
  // where it is in your sky
  const phi = lat * rad, H = (280.16 + 360.9856235 * d + lon) * rad - mo.ra;
  const alt = Math.asin(Math.sin(phi) * Math.sin(mo.dec) + Math.cos(phi) * Math.cos(mo.dec) * Math.cos(H));
  const az = nrm((Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(mo.dec) * Math.cos(phi)) / rad) + 180);
  const q = Math.atan2(Math.sin(H), Math.tan(phi) * Math.cos(mo.dec) - Math.sin(mo.dec) * Math.cos(H));   // parallactic angle: how far the moon is turned on screen
  // optical libration: which longitude and latitude of the moon face the earth
  const Om = (125.045 - 0.0529539 * d) * rad, I = 1.54242 * rad, W = lam - Om;
  let l0 = Math.atan2(Math.sin(W) * Math.cos(bet) * Math.cos(I) - Math.sin(bet) * Math.sin(I), Math.cos(W) * Math.cos(bet)) - F; l0 = ((l0 + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  const b0 = Math.asin(-Math.sin(W) * Math.cos(bet) * Math.sin(I) - Math.sin(bet) * Math.cos(I));
  return { phase, chi, alt: alt / rad, az, q, l0, b0, lit: (1 + Math.cos(phase)) / 2 };
}

/* ---------- the picture ---------- */
let tex = null, loading = null, cache = null;
const loadTex = () => (loading ||= new Promise(res => {
  const im = new Image(); im.onload = () => { const c = document.createElement("canvas"); c.width = im.width; c.height = im.height; const g = c.getContext("2d"); g.drawImage(im, 0, 0); tex = g.getImageData(0, 0, c.width, c.height); res(tex); };
  im.onerror = () => res(null); im.src = "img/moon-lroc-2k.jpg";
}));
function render(T, e, N = 420) {
  const c = document.createElement("canvas"); c.width = c.height = N; const g = c.getContext("2d"), out = g.createImageData(N, N), o = out.data, W = T.width, Hh = T.height, t = T.data;
  const ux = -Math.sin(e.chi), uy = Math.cos(e.chi), sx = ux * Math.sin(e.phase), sy = uy * Math.sin(e.phase), sz = Math.cos(e.phase), sb = Math.sin(e.b0), cb = Math.cos(e.b0), earth = .05 * (1 - e.lit) + .008;
  const px = (X, Y, k) => t[(Math.min(Hh - 1, Math.max(0, Y)) * W + ((X % W) + W) % W) * 4 + k];
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = ((i + .5) / N) * 2 - 1, y = 1 - ((j + .5) / N) * 2, r2 = x * x + y * y; if (r2 >= 1.02) continue;
    const r = Math.sqrt(r2), z = Math.sqrt(Math.max(0, 1 - r2)), a = r < .985 ? 1 : Math.max(0, (1.0 - r) / .015);
    const lat = Math.asin(Math.max(-1, Math.min(1, z * sb + y * cb))), lon = e.l0 + Math.atan2(x, z * cb - y * sb);
    const u = (.5 + lon / (2 * Math.PI)) * W - .5, v = (.5 - lat / Math.PI) * Hh - .5, x0 = Math.floor(u), y0 = Math.floor(v), fx = u - x0, fy = v - y0, rgb = [0, 0, 0];
    for (let k = 0; k < 3; k++) rgb[k] = (px(x0, y0, k) * (1 - fx) + px(x0 + 1, y0, k) * fx) * (1 - fy) + (px(x0, y0 + 1, k) * (1 - fx) + px(x0 + 1, y0 + 1, k) * fx) * fy;
    const grey = .3 * rgb[0] + .59 * rgb[1] + .11 * rgb[2]; for (let k = 0; k < 3; k++) rgb[k] = grey + (rgb[k] - grey) * .45;   // the map's colour is exaggerated; the eye sees a warm grey
    const mu0 = x * sx + y * sy + z * sz, mu = Math.max(z, .02), I = mu0 > 0 ? 2.1 * mu0 / (mu0 + mu) : 0;
    const k0 = (j * N + i) * 4, tint = [.82, .92, 1.05];
    for (let k = 0; k < 3; k++) o[k0 + k] = Math.min(255, rgb[k] * (I * 1.05 + earth * 3.2 * tint[k]) * 1.05);
    o[k0 + 3] = a * 255;
  }
  g.putImageData(out, 0, 0); return c.toDataURL("image/png");
}
async function refresh() {
  const T = await loadTex(); if (!T) return; const e = lunar();
  cache = { url: render(T, e), at: Date.now(), q: e.q / rad };
  document.querySelectorAll(".moon-img").forEach(el => { el.src = cache.url; el.style.transform = `rotate(${cache.q.toFixed(1)}deg)`; el.style.visibility = "visible"; });
}
const GIF = "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==", DIR = ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"];
export function moonWatch(date = new Date()) {
  const m = moonState(date), e = lunar(date), day = Math.floor(m.age) % 29;
  if (!cache || Date.now() - cache.at > 180000) refresh();
  const d = x => (x < 1 ? "less than a day" : x < 1.5 ? "1 day" : Math.round(x) + " days");
  const where = e.alt > 0 ? `${Math.round(e.alt)}° up in the ${DIR[Math.round(e.az / 45) % 8]}` : "below the horizon";
  const img = `<img class="moon-img" alt="${m.name}, ${Math.round(m.lit * 100)} percent lit" src="${cache ? cache.url : GIF}" style="${cache ? `transform:rotate(${cache.q.toFixed(1)}deg)` : "visibility:hidden"}">`;
  return `<div class="moon"><div class="moon-dial">${img}</div><div class="moon-text"><div class="moon-name">${m.name}</div><div class="basis">${Math.round(m.lit * 100)}% lit · day ${day + 1} of 29</div><div class="basis">${where}</div><div class="basis">${m.toFull <= m.toNew ? "full" : "new"} moon in ${d(Math.min(m.toFull, m.toNew))}</div></div></div>`;
}
