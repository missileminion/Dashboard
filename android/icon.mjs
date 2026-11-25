// Draws the app icon: a 15×15 dot grid on near-black with one heartbeat traced in lit dots (flat, small bump, the spike, the dip,
// back to flat); the top of the spike is red, the same red as the sync pill's dot. The unlit grid stays faint.
// Writes the Android adaptive icon (vector, sharp at every size, with a monochrome layer for themed icons) and an SVG for the web.
// Run: node android/icon.mjs   (patch.mjs copies native/res into the Android project)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url)), root = path.join(here, "..");
const BG = "#05060a", ON = "#f2f3f5", OFF = "#ffffff", RED = "#ff1f1f";
const GX = 15, GY = 15, OY = 3;   // a square grid of faint dots (so the fade-out is round); the 9-row trace sits in rows 3–11
const TRACE = [[0, 5], [3, 5], [4, 4], [5, 4], [6, 5], [7, 5], [9, 0], [11, 8], [12, 5], [14, 5]].map(([x, y]) => [x, y + OY]), PEAK = `9,${OY}`;
const lit = new Set();
for (let k = 1; k < TRACE.length; k++) {   // join the points with dots, one per grid step along the longer axis
  const [x0, y0] = TRACE[k - 1], [x1, y1] = TRACE[k], n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  for (let i = 0; i <= n; i++) lit.add(`${Math.round(x0 + (x1 - x0) * i / n)},${Math.round(y0 + (y1 - y0) * i / n)}`);
}
const dots = (cx, gap) => { const out = [], x0 = cx - (GX - 1) / 2 * gap, y0 = cx - (GY - 1) / 2 * gap; for (let c = 0; c < GX; c++) for (let r = 0; r < GY; r++) { const key = `${c},${r}`; out.push({ x: x0 + c * gap, y: y0 + r * gap, lit: lit.has(key), red: key === PEAK }); } return out; };
const circ = (x, y, rr) => `M${(x - rr).toFixed(2)},${y.toFixed(2)}a${rr},${rr} 0 1,0 ${2 * rr},0a${rr},${rr} 0 1,0 ${-2 * rr},0`;

// Android adaptive icon: 108dp canvas, 72dp visible, 66dp safe circle. The grid is kept small (about 46dp across) so the
// icon has a comfortable border, and the dots fade out towards the rim: the faint grid dissolves into the background and the
// ends of the trace taper off, so there is no hard edge. fillAlpha is per path, so dots are grouped by their (quantised) alpha.
const G = 3.3, FADE0 = 12, FADE1 = 27;   // dots fully visible within FADE0 dp of the centre, gone by FADE1
const fade = (d, cx) => { const t = Math.min(1, Math.max(0, (Math.hypot(d.x - cx, d.y - cx) - FADE0) / (FADE1 - FADE0))); return 1 - t * t * (3 - 2 * t); };
const q = (a) => Math.round(a * 10) / 10;
const D = dots(54, G).map(d => ({ ...d, a: q((d.lit ? 1 : 0.2) * fade(d, 54)) })).filter(d => d.a > 0);
const paths = (f, color, scale = 1) => { const by = new Map(); for (const d of D.filter(f)) { const k = d.a; by.set(k, (by.get(k) || "") + circ(d.x, d.y, (d.red ? 1.6 : d.lit ? 1.35 : 0.6) * scale)); }
  return [...by].sort((x, y) => x[0] - y[0]).map(([a, pd]) => `    <path android:fillColor="${color}"${a < 1 ? ` android:fillAlpha="${a}"` : ""} android:pathData="${pd}"/>`).join("\n"); };
const vec = (body) => `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="108dp" android:height="108dp" android:viewportWidth="108" android:viewportHeight="108">
${body}
</vector>
`;
const fg = vec([paths(d => !d.lit, OFF), paths(d => d.lit && !d.red, ON), paths(d => d.red, RED)].join("\n"));
const mono = vec(paths(d => d.lit, "#ffffff"));
const adaptive = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background"/>
    <foreground android:drawable="@drawable/ic_dash_foreground"/>
    <monochrome android:drawable="@drawable/ic_dash_monochrome"/>
</adaptive-icon>
`;
const R = path.join(here, "native/res"), w = (p, s) => { fs.mkdirSync(path.dirname(path.join(R, p)), { recursive: true }); fs.writeFileSync(path.join(R, p), s); };
w("drawable/ic_dash_foreground.xml", fg); w("drawable/ic_dash_monochrome.xml", mono);
w("mipmap-anydpi-v26/ic_launcher.xml", adaptive); w("mipmap-anydpi-v26/ic_launcher_round.xml", adaptive);
w("values/ic_launcher_background.xml", `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${BG}</color>\n</resources>\n`);

// web: the same mark on a rounded square, scaled from the 72dp visible area to the 100-unit box
const k = 100 / 72, svgDots = D.map(d => { const x = 50 + (d.x - 54) * k, y = 50 + (d.y - 54) * k, r = (d.red ? 1.6 : d.lit ? 1.35 : 0.6) * k;
  return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(2)}" fill="${d.red ? RED : d.lit ? ON : OFF}"${d.a < 1 ? ` fill-opacity="${d.a}"` : ""}/>`; }).join("");
fs.writeFileSync(path.join(root, "app/icons/app.svg"), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="24" fill="${BG}"/>${svgDots}</svg>\n`);
console.log("icon written");
