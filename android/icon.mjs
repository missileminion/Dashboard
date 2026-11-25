// Draws the app icon: a 15×9 dot grid on near-black with one heartbeat traced in lit dots (flat, small bump, the spike, the dip,
// back to flat); the top of the spike is red, the same red as the sync pill's dot. The unlit grid stays faint.
// Writes the Android adaptive icon (vector, sharp at every size, with a monochrome layer for themed icons) and an SVG for the web.
// Run: node android/icon.mjs   (patch.mjs copies native/res into the Android project)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url)), root = path.join(here, "..");
const BG = "#05060a", ON = "#f2f3f5", OFF = "#ffffff", RED = "#ff1f1f";
const GX = 15, GY = 9, TRACE = [[0, 5], [3, 5], [4, 4], [5, 4], [6, 5], [7, 5], [9, 0], [11, 8], [12, 5], [14, 5]], PEAK = "9,0";
const lit = new Set();
for (let k = 1; k < TRACE.length; k++) {   // join the points with dots, one per grid step along the longer axis
  const [x0, y0] = TRACE[k - 1], [x1, y1] = TRACE[k], n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  for (let i = 0; i <= n; i++) lit.add(`${Math.round(x0 + (x1 - x0) * i / n)},${Math.round(y0 + (y1 - y0) * i / n)}`);
}
const dots = (cx, gap) => { const out = [], x0 = cx - (GX - 1) / 2 * gap, y0 = cx - (GY - 1) / 2 * gap; for (let c = 0; c < GX; c++) for (let r = 0; r < GY; r++) { const key = `${c},${r}`; out.push({ x: x0 + c * gap, y: y0 + r * gap, lit: lit.has(key), red: key === PEAK }); } return out; };
const circ = (x, y, rr) => `M${(x - rr).toFixed(2)},${y.toFixed(2)}a${rr},${rr} 0 1,0 ${2 * rr},0a${rr},${rr} 0 1,0 ${-2 * rr},0`;

// Android adaptive icon: 108dp canvas; every dot (the grid's corners too) stays inside the 66dp safe circle, so no launcher
// shape (circle, squircle, scallop, ...) clips it. Corner dot: sqrt(7²+4²)·3.8 + 0.7 ≈ 31.3dp from the centre, under 33.
const D = dots(54, 3.8), path_ = (f) => D.filter(f).map(d => circ(d.x, d.y, d.red ? 1.8 : d.lit ? 1.55 : 0.7)).join("");
const fg = `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="108dp" android:height="108dp" android:viewportWidth="108" android:viewportHeight="108">
    <path android:fillColor="${OFF}" android:fillAlpha="0.18" android:pathData="${path_(d => !d.lit)}"/>
    <path android:fillColor="${ON}" android:pathData="${path_(d => d.lit && !d.red)}"/>
    <path android:fillColor="${RED}" android:pathData="${path_(d => d.red)}"/>
</vector>
`;
const mono = `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="108dp" android:height="108dp" android:viewportWidth="108" android:viewportHeight="108">
    <path android:fillColor="#ffffff" android:pathData="${path_(d => d.lit)}"/>
</vector>
`;
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

// web: the same mark on a rounded square
const W = dots(50, 5.4), svgDots = W.map(d => `<circle cx="${d.x.toFixed(1)}" cy="${d.y.toFixed(1)}" r="${d.red ? 2.5 : d.lit ? 2.1 : 0.95}" fill="${d.red ? RED : d.lit ? ON : OFF}"${d.lit ? "" : ' fill-opacity=".18"'}/>`).join("");
fs.writeFileSync(path.join(root, "app/icons/app.svg"), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="24" fill="${BG}"/>${svgDots}</svg>\n`);
console.log("icon written");
