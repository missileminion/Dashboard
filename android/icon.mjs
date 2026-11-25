// Draws the app icon: a ring of 16 dots on near-black, lit clockwise from the top like a progress ring, ending in one red dot
// (the same red as the sync pill's dot); the rest of the ring is faint.
// Writes the Android adaptive icon (vector, sharp at every size, with a monochrome layer for themed icons) and an SVG for the web.
// Run: node android/icon.mjs   (patch.mjs copies native/res into the Android project)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url)), root = path.join(here, "..");
const BG = "#05060a", ON = "#f2f3f5", OFF = "#ffffff", RED = "#ff1f1f";
const N = 16, LITN = 11;
const dots = (c, rad) => [...Array(N)].map((_, k) => { const t = -Math.PI / 2 + k * 2 * Math.PI / N; return { x: c + rad * Math.cos(t), y: c + rad * Math.sin(t), lit: k < LITN, red: k === LITN - 1 }; });
const circ = (x, y, rr) => `M${(x - rr).toFixed(2)},${y.toFixed(2)}a${rr},${rr} 0 1,0 ${2 * rr},0a${rr},${rr} 0 1,0 ${-2 * rr},0`;

// Android: 108dp canvas, the grid inside the 66dp safe circle
const D = dots(54, 25), path_ = (f) => D.filter(f).map(d => circ(d.x, d.y, d.red ? 3.6 : d.lit ? 3.1 : 2)).join("");
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
const W = dots(50, 29), svgDots = W.map(d => `<circle cx="${d.x.toFixed(1)}" cy="${d.y.toFixed(1)}" r="${d.red ? 4.3 : d.lit ? 3.7 : 2.4}" fill="${d.red ? RED : d.lit ? ON : OFF}"${d.lit ? "" : ' fill-opacity=".18"'}/>`).join("");
fs.writeFileSync(path.join(root, "app/icons/app.svg"), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="24" fill="${BG}"/>${svgDots}</svg>\n`);
console.log("icon written");
