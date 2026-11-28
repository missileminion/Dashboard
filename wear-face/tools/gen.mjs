// Draws CORE · INSTRUMENT's static parts into images for the Watch Face Format face, from the same maths as the owner's concept
// (core-instrument.html): the polar halftone screen with minute ticks and hour markers, the dotted hour / minute / second hands,
// the soft light, the always-on hour markers, the 3×5 micro type as bitmap-font glyphs, and a preview. Writes watchface.xml too,
// so sizes and positions stay in step. Run: node wear-face/tools/gen.mjs
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url)), RES = path.join(here, "../app/src/main/res");
const S = 450, K = S / 480, C = 240;            // the face is 450 × 450; the design is drawn in 480 space and scaled
const INK = [0xf4, 0xf3, 0xef];
const TAU = Math.PI * 2, clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));

// ---- tiny RGBA canvas with anti-aliased dots, and a PNG writer
const canvas = (w = S, h = S) => ({ w, h, a: new Float32Array(w * h) });   // alpha only; colour is INK
function dot(cv, x, y, r, al) {   // x, y, r in 480 space
  if (al < .01 || r < .06) return; al = Math.min(1, al);
  const X = x * K, Y = y * K, R = r * K, x0 = Math.max(0, Math.floor(X - R - 1)), x1 = Math.min(cv.w - 1, Math.ceil(X + R + 1)), y0 = Math.max(0, Math.floor(Y - R - 1)), y1 = Math.min(cv.h - 1, Math.ceil(Y + R + 1));
  for (let j = y0; j <= y1; j++) for (let i = x0; i <= x1; i++) {
    const d = Math.hypot(i + .5 - X, j + .5 - Y), cov = clamp(R + .5 - d); if (cov <= 0) continue;
    const k = j * cv.w + i, s = cov * al; cv.a[k] = s + cv.a[k] * (1 - s);
  }
}
const crc = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return b => { let c = 0xffffffff; for (const x of b) c = t[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }; })();
function png(cv, file, rgb = INK, opaque = false) {
  const raw = Buffer.alloc((cv.w * 4 + 1) * cv.h);
  for (let j = 0; j < cv.h; j++) { raw[j * (cv.w * 4 + 1)] = 0; for (let i = 0; i < cv.w; i++) { const o = j * (cv.w * 4 + 1) + 1 + i * 4, a = cv.a[j * cv.w + i]; if (opaque) { raw[o] = Math.round(rgb[0] * clamp(a)); raw[o + 1] = Math.round(rgb[1] * clamp(a)); raw[o + 2] = Math.round(rgb[2] * clamp(a)); raw[o + 3] = 255; } else { raw[o] = rgb[0]; raw[o + 1] = rgb[1]; raw[o + 2] = rgb[2]; raw[o + 3] = Math.round(clamp(a) * 255); } } }
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(cv.w, 0); ihdr.writeUInt32BE(cv.h, 4); ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  fs.writeFileSync(path.join(RES, "drawable-nodpi", file + ".png"), Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]));
}

// ---- the polar halftone screen (exactly as the concept)
const pts = []; const RINGS = []; for (let r = 48; r <= 226; r += 7.6) RINGS.push(r);
const ringNear = v => RINGS.reduce((b, r) => (Math.abs(r - v) < Math.abs(b - v) ? r : b), 48);
const cmDist = (a, b) => { const d = Math.abs(a - b) % 720; return Math.min(d, 720 - d); };
const RT = ringNear(222.8);
for (const r of RINGS) { const n = Math.round(TAU * r / 7.6), half = 720 / n / 2;
  for (let i = 0; i < n; i++) { const a = i / n * TAU - Math.PI / 2, cm = i / n * 720, min = r === RT && cmDist(cm, Math.round(cm / 12) * 12) < half;
    pts.push({ r, bx: C + r * Math.cos(a), by: C + r * Math.sin(a), cm, min, five: min && cmDist(cm, Math.round(cm / 60) * 60) < half, hr: r > 170 && cmDist(cm, Math.round(cm / 60) * 60) < half * 1.05 ? Math.round(cm / 60) % 12 : -1 }); } }
const marker = (p, rc) => (p.hr >= 0 ? Math.min(1, Math.exp(-((p.r - rc) ** 2) / (2 * 3.4 * 3.4)) / .54) : 0);

// the dial at rest (no hands): base dots, minute ticks, hour markers on the inner index rings, the light's faint lift
{ const cv = canvas(), Lx = C - 60, Ly = C - 90;
  for (const p of pts) { if (p.r < 62) continue; const tick = p.five ? 1 : p.min ? .45 : 0, mk = marker(p, 181), g = Math.exp(-((p.bx - Lx) ** 2 + (p.by - Ly) ** 2) / (2 * 115 * 115));
    dot(cv, p.bx, p.by, .58 + tick * .9 * (1 - mk) + mk * 1.05 + g * .2, .13 + tick * .45 * (1 - mk) + mk * .5 + g * .12); }
  png(cv, "core_grid"); }
// always-on: the hour markers move out to the edge
{ const cv = canvas(); for (const p of pts) { const mk = marker(p, 219); if (mk > .01) dot(cv, p.bx, p.by, mk * 1.15, mk * .42); } png(cv, "core_markers_aod"); }
// the light above the glass: a soft highlight (moved by the watch's tilt)
{ const cv = canvas(); for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) { const x = (i + .5) / K, y = (j + .5) / K, d2 = (x - C) ** 2 + (y - C) ** 2; cv.a[j * S + i] = .07 * Math.exp(-d2 / (2 * 115 * 115)) * (d2 < 226 * 226 ? 1 : 0); } png(cv, "core_light"); }

// ---- the hands as the concept draws them: the dial's own grid dots, swollen by a soft field along the hand. One frame per position
// (hour every 6 minutes, minute and second every step), each cropped to its dots; the face shows the frame for the current time.
const handField = (x, y, a, w, len, taper, start) => { const dx = x - C, dy = y - C, along = dx * Math.cos(a) + dy * Math.sin(a); if (along < start - 10 || along > len + 12) return 0;
  const perp = Math.abs(-dx * Math.sin(a) + dy * Math.cos(a)), we = w * (1 - taper * clamp(along / len)); let v = Math.exp(-(perp * perp) / (2 * we * we));
  if (along > len) v *= Math.exp(-((along - len) ** 2) / 30); if (along < start) v *= Math.exp(-((start - along) ** 2) / 30); return v; };
// Each hand is a layer of the dial's grid dots at the hand's swollen size, shown only through a soft mask shaped like the hand's
// field (1 on its axis, falling off sideways and towards both ends). The mask turns continuously with the time, so the dots stay
// fixed on the grid and only their brightness moves, frame by frame, as in the concept.
function dotsLayer(name, size, alpha, rmax) {
  const cv = canvas(); for (const p of pts) { if (p.r < 62 || p.r > rmax) continue; dot(cv, p.bx, p.by, .58 + size, .13 + alpha); } png(cv, name);
}
function maskImage(name, field) {   // the field for a hand pointing to 12, as a smooth alpha image
  const cv = canvas(); for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) cv.a[j * S + i] = clamp(field((i + .5) / K, (j + .5) / K)); png(cv, name, [255, 255, 255]);
}
const up = -Math.PI / 2;
// In the concept a dot under a hand grows with the field (radius .58 + H·size) as well as brightening. Four tiers approximate that:
// each tier's dots are drawn at the size for one field level, and its mask lets them through only where the field is near it.
const TIERS = [1, .72, .45, .2], NODES = [0, .2, .45, .72, 1];   // tent weights between neighbouring levels: they add up to 1, and 0 with no field
const tw = (H, c) => { const k = NODES.indexOf(c), lo = NODES[k - 1], hi = NODES[k + 1];
  if (H <= lo) return 0; if (H <= c) return (H - lo) / (c - lo); if (hi == null) return 1; return clamp(1 - (H - c) / (hi - c)); };
const HANDS = {
  hour: { size: 2.75, alpha: .85, rmax: 142, f: (x, y) => handField(x, y, up, 10.5, 128, .45, 66) },
  min: { size: 2.75, alpha: .85, rmax: 214, f: (x, y) => handField(x, y, up, 6.6, 200, .4, 66) },
  sec: { size: 1.5, alpha: .8, rmax: 226, f: (x, y) => Math.max(handField(x, y, up, 2.1, 218, 0, 66), handField(x, y, up + Math.PI, 3.2, 96, 0, 66)) },
};
for (const [id, h] of Object.entries(HANDS)) TIERS.forEach((c, i) => {
  dotsLayer(`core_dots_${id}${i}`, h.size * c, h.alpha * c, h.rmax);
  maskImage(`core_mask_${id}${i}`, (x, y) => tw(h.f(x, y), c));
});


// ---- the 3×5 micro type as bitmap-font glyphs (big: pitch 3.4 / dot 1.15; small: pitch 2.7 / dot .92)
const MICRO = { A: [".#.", "#.#", "###", "#.#", "#.#"], B: ["##.", "#.#", "##.", "#.#", "##."], C: [".##", "#..", "#..", "#..", ".##"], D: ["##.", "#.#", "#.#", "#.#", "##."], E: ["###", "#..", "##.", "#..", "###"], F: ["###", "#..", "##.", "#..", "#.."], G: [".##", "#..", "#.#", "#.#", ".##"], H: ["#.#", "#.#", "###", "#.#", "#.#"], I: ["###", ".#.", ".#.", ".#.", "###"], J: ["..#", "..#", "..#", "#.#", ".#."], K: ["#.#", "#.#", "##.", "#.#", "#.#"], L: ["#..", "#..", "#..", "#..", "###"], M: ["#.#", "###", "###", "#.#", "#.#"], N: ["##.", "#.#", "#.#", "#.#", "#.#"], O: [".#.", "#.#", "#.#", "#.#", ".#."], P: ["##.", "#.#", "##.", "#..", "#.."], Q: [".#.", "#.#", "#.#", "##.", ".##"], R: ["##.", "#.#", "##.", "#.#", "#.#"], S: [".##", "#..", ".#.", "..#", "##."], T: ["###", ".#.", ".#.", ".#.", ".#."], U: ["#.#", "#.#", "#.#", "#.#", "###"], V: ["#.#", "#.#", "#.#", "#.#", ".#."], W: ["#.#", "#.#", "###", "###", "#.#"], X: ["#.#", "#.#", ".#.", "#.#", "#.#"], Y: ["#.#", "#.#", ".#.", ".#.", ".#."], Z: ["###", "..#", ".#.", "#..", "###"], "0": ["###", "#.#", "#.#", "#.#", "###"], "1": [".#.", "##.", ".#.", ".#.", "###"], "2": ["##.", "..#", ".#.", "#..", "###"], "3": ["##.", "..#", ".#.", "..#", "##."], "4": ["#.#", "#.#", "###", "..#", "..#"], "5": ["###", "#..", "##.", "..#", "##."], "6": [".##", "#..", "###", "#.#", "###"], "7": ["###", "..#", ".#.", ".#.", ".#."], "8": ["###", "#.#", "###", "#.#", "###"], "9": ["###", "#.#", "###", "..#", "##."], ":": [".", "#", ".", "#", "."], "·": [".", ".", "#", ".", "."], "-": ["...", "...", "###", "...", "..."], "+": ["...", ".#.", "###", ".#.", "..."], ".": [".", ".", ".", ".", "#"], "°": ["##", "##", "..", "..", ".."], " ": ["..", "..", "..", "..", ".."] };
const NAMES = { ":": "colon", "·": "mid", "-": "minus", "+": "plus", ".": "dot", "°": "deg", " ": "space" };
const fonts = {};
for (const [font, p, rr, al] of [["big", 3.4, 1.15, .97], ["small", 2.7, .92, .82]]) {
  fonts[font] = [];
  for (const [ch, g] of Object.entries(MICRO)) {
    const cols = g[0].length + 1, pw = Math.ceil(cols * p * K), ph = Math.ceil(5 * p * K) + 2, cv = canvas(pw, ph);
    g.forEach((row, ry) => [...row].forEach((v, rx) => { if (v === "#") dot(cv, (rx * p + p / 2), (ry * p + p / 2 + 1 / K), rr, al); }));
    const res = `core_${font}_${NAMES[ch] || ch.toLowerCase()}`; png(cv, res); fonts[font].push({ ch, res, w: pw, h: ph });
  }
}

// ---- preview (10:08:32, with a sample event ring)
{ const cv = canvas(); const add = f => { const b = canvas(); f(b); for (let i = 0; i < cv.a.length; i++) cv.a[i] = b.a[i] + cv.a[i] * (1 - b.a[i]); };
  const Lx = C - 60, Ly = C - 90, hA = (10 + 8 / 60) / 12 * TAU - Math.PI / 2, mA = 8 / 60 * TAU - Math.PI / 2;
  const hand = (x, y, a, w, len, taper, start) => { const dx = x - C, dy = y - C, along = dx * Math.cos(a) + dy * Math.sin(a); if (along < start - 10 || along > len + 12) return 0; const perp = Math.abs(-dx * Math.sin(a) + dy * Math.cos(a)), we = w * (1 - taper * clamp(along / len)); let v = Math.exp(-(perp * perp) / (2 * we * we)); if (along > len) v *= Math.exp(-((along - len) ** 2) / 30); if (along < start) v *= Math.exp(-((start - along) ** 2) / 30); return v; };
  add(b => { for (const p of pts) { if (p.r < 62) continue; const H = Math.max(hand(p.bx, p.by, hA, 10.5, 128, .45, 66), hand(p.bx, p.by, mA, 6.6, 200, .4, 66)); const tick = p.five ? 1 : p.min ? .45 : 0, mk = marker(p, 181), g = Math.exp(-((p.bx - Lx) ** 2 + (p.by - Ly) ** 2) / (2 * 115 * 115));
    const ev = p.r > 196 && p.r < 218 && p.cm >= 300 && p.cm < 390 ? (p.cm < 320 ? 1.1 : .8) : 0;
    dot(b, p.bx, p.by, .58 + H * 2.75 + ev * .95 + tick * .9 * (1 - mk) + mk * 1.05 + g * .2, .13 + H * .85 + ev * .55 + tick * .45 * (1 - mk) + mk * .5 + g * .12); } });
  const txt = (s, top, p, rr, al) => { let col = 0; const cells = []; for (const ch of s) { const g = MICRO[ch]; g.forEach((row, ry) => [...row].forEach((v, rx) => v === "#" && cells.push([(col + rx) * p, ry]))); col += g[0].length + 1; } const w = (col - 2) * p; add(b => cells.forEach(([x, ry]) => dot(b, C - w / 2 + x, top + ry * p, rr, al))); };
  txt("10:08", C - 13, 3.4, 1.15, .97); txt("ROCKETRY", C + 9, 2.7, .92, .82);
  png(cv, "core_preview", INK, true); }   // on black, for the face picker

// ---- watchface.xml
const q = v => Math.round(v * K);   // positions are whole pixels in the format
const bitmapFont = (name, list) => `    <BitmapFont name="${name}">\n${list.map(g => `      <Character name="${g.ch === " " ? "&#32;" : g.ch}" resource="${g.res}" width="${g.w}" height="${g.h}" />`).join("\n")}\n    </BitmapFont>`;
const hub = { x: q(C - 120), w: q(240) };
// one hand: the dot layer, masked by the hand's field turning about the centre by the hand's angle (degrees, continuous)
const hands = (id, angle, aodAlpha) => `    <Group name="${id}" x="0" y="0" width="${S}" height="${S}">
      <Variant mode="AMBIENT" target="alpha" value="${aodAlpha}" />
${TIERS.map((c, i) => `      <Group name="${id}${i}" x="0" y="0" width="${S}" height="${S}">
        <PartImage x="0" y="0" width="${S}" height="${S}" renderMode="SOURCE"><Image resource="core_dots_${id}${i}" /></PartImage>
        <PartImage x="0" y="0" width="${S}" height="${S}" pivotX="0.5" pivotY="0.5" renderMode="MASK">
          <Image resource="core_mask_${id}${i}" />
          <Transform target="angle" value="${angle}" />
        </PartImage>
      </Group>`).join("\n")}
    </Group>`;
const xml = `<?xml version="1.0" encoding="utf-8"?>
<!-- CORE · INSTRUMENT. Generated by wear-face/tools/gen.mjs: edit that, not this. -->
<WatchFace width="${S}" height="${S}">
  <Metadata key="CLOCK_TYPE" value="ANALOG" />
  <Metadata key="PREVIEW_TIME" value="10:08:32" />
  <BitmapFonts>
${bitmapFont("micro_big", fonts.big)}
${bitmapFont("micro_small", fonts.small)}
  </BitmapFonts>
  <Scene backgroundColor="#ff000000">
    <!-- the light above the glass, moving with the watch's tilt -->
    <PartImage x="0" y="0" width="${S}" height="${S}" alpha="255">
      <Image resource="core_light" />
      <Gyro x="[ACCELEROMETER_ANGLE_X] * -1.6" y="[ACCELEROMETER_ANGLE_Y] * -1.6" />
      <Variant mode="AMBIENT" target="alpha" value="0" />
    </PartImage>
    <!-- the dial: halftone screen, minute ticks, hour markers -->
    <PartImage x="0" y="0" width="${S}" height="${S}" alpha="255">
      <Image resource="core_grid" />
      <Variant mode="AMBIENT" target="alpha" value="0" />
    </PartImage>
    <PartImage x="0" y="0" width="${S}" height="${S}" alpha="0">
      <Image resource="core_markers_aod" />
      <Variant mode="AMBIENT" target="alpha" value="255" />
    </PartImage>
    <!-- the event ring and the bed-by crescent: an image the Gym app draws from the phone's calendar (it has no tap action; the hub, drawn above it, takes taps in the middle) -->
    <ComplicationSlot slotId="0" x="0" y="0" width="${S}" height="${S}" supportedTypes="SMALL_IMAGE" isCustomizable="TRUE">
      <DefaultProviderPolicy defaultSystemProvider="EMPTY" defaultSystemProviderType="SMALL_IMAGE" primaryProvider="io.github.missileminion.dashboard/io.github.missileminion.dashboard.RingSource" primaryProviderType="SMALL_IMAGE" />
      <BoundingArc centerX="${S / 2}" centerY="${S / 2}" width="${S}" height="${S}" startAngle="-90" endAngle="269.9" thickness="${q(40)}" isRoundEdge="FALSE" />
      <Complication type="SMALL_IMAGE">
        <PartImage x="0" y="0" width="${S}" height="${S}">
          <Image resource="[COMPLICATION.SMALL_IMAGE]" />
          <Variant mode="AMBIENT" target="alpha" value="0" />
        </PartImage>
      </Complication>
    </ComplicationSlot>
    <!-- the hub, as in the concept: the time (drawn by the face) and under it the current or next event (from the Gym app).
         Only the event line is a complication; it has no tap action. -->
    <DigitalClock x="${hub.x}" y="${q(C - 13)}" width="${hub.w}" height="${fonts.big[0].h}">
      <TimeText format="hh:mm" align="CENTER" x="0" y="0" width="${hub.w}" height="${fonts.big[0].h}">
        <BitmapFont family="micro_big" size="${fonts.big[0].h}" color="#FFFFFFFF" />
      </TimeText>
      <Variant mode="AMBIENT" target="alpha" value="150" />
    </DigitalClock>
    <ComplicationSlot slotId="1" x="${hub.x}" y="${q(C + 8)}" width="${hub.w}" height="${fonts.small[0].h + 2}" supportedTypes="SHORT_TEXT" isCustomizable="TRUE">
      <DefaultProviderPolicy defaultSystemProvider="EMPTY" defaultSystemProviderType="SHORT_TEXT" primaryProvider="io.github.missileminion.dashboard/io.github.missileminion.dashboard.HubSource" primaryProviderType="SHORT_TEXT" />
      <BoundingBox x="0" y="0" width="${hub.w}" height="${fonts.small[0].h + 2}" />
      <Complication type="SHORT_TEXT">
        <PartText x="0" y="0" width="${hub.w}" height="${fonts.small[0].h + 2}">
          <Text align="CENTER" ellipsis="FALSE">
            <BitmapFont family="micro_small" size="${fonts.small[0].h}" color="#FFFFFFFF">
              <Template>%s<Parameter expression="[COMPLICATION.TITLE]" /></Template>
            </BitmapFont>
          </Text>
          <Variant mode="AMBIENT" target="alpha" value="130" />
        </PartText>
      </Complication>
    </ComplicationSlot>
    <!-- the hands: the fixed grid's dots brightened along the hand, crossfading between positions; always-on keeps hour and minute, dimmed -->
${hands("hour", "(([HOUR_0_11] * 60 + [MINUTE]) * 60 + [SECOND]) / 120", 150)}
${hands("min", "(([MINUTE] * 60 + [SECOND]) * 1000 + [MILLISECOND]) / 10000", 150)}
${hands("sec", "([SECOND] * 1000 + [MILLISECOND]) * 0.006", 0)}
  </Scene>
</WatchFace>
`;
fs.writeFileSync(path.join(RES, "raw", "watchface.xml"), xml);
console.log("images and watchface.xml written:", fs.readdirSync(path.join(RES, "drawable-nodpi")).length, "images");
