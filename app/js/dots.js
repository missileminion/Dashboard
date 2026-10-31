// Dot-matrix graphics for the console. Every chart is a grid of round dots on a canvas: lit dots are bright, unlit dots stay faintly visible, like an LED panel.
// matrix() is the grid; dotCols, dotHBars, dotStack, dotPlot and dotDigits draw the console's versions of the charts, and dotDigits draws timer digits in a 5x7 dot font.
export const C = { lit: "#e6f0ff", red: "#ff5a64", blue: "#6db8ff", yel: "#ffd24d", cyan: "#7fd6ff", grey: "#6c7080", off: "rgba(150,170,210,.14)" };
const DPR = () => Math.min(2, window.devicePixelRatio || 1);

export function matrix(cols, rows, { pitch = 6, dot = 2.1 } = {}) {
  const el = document.createElement("canvas"), g = el.getContext("2d"), cells = new Array(cols * rows).fill(null), d = DPR();
  el.width = Math.round(cols * pitch * d); el.height = Math.round(rows * pitch * d); el.style.width = cols * pitch + "px"; el.style.height = rows * pitch + "px"; el.className = "tm-dots";
  const set = (x, y, c) => { x = Math.round(x); y = Math.round(y); if (x >= 0 && x < cols && y >= 0 && y < rows) cells[y * cols + x] = c; };
  const draw = extra => {
    g.setTransform(d, 0, 0, d, 0, 0); g.clearRect(0, 0, cols * pitch, rows * pitch); const over = new Map(); if (extra) extra((x, y, c) => { if (x >= 0 && x < cols && y >= 0 && y < rows) over.set(Math.round(y) * cols + Math.round(x), c); });
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) { const k = y * cols + x, c = over.get(k) || cells[k]; g.beginPath(); g.arc(x * pitch + pitch / 2, y * pitch + pitch / 2, c ? dot : dot * 0.62, 0, 6.2832); g.fillStyle = c || C.off; if (c) { g.shadowColor = c; g.shadowBlur = 5; } else g.shadowBlur = 0; g.fill(); }
    g.shadowBlur = 0;
  };
  const line = (x0, y0, x1, y1, c) => { x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1); const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1; let e = dx + dy; for (;;) { set(x0, y0, c); if (x0 === x1 && y0 === y1) break; const e2 = 2 * e; if (e2 >= dy) { e += dy; x0 += sx; } if (e2 <= dx) { e += dx; y0 += sy; } } };
  return { el, cols, rows, pitch, set, line, draw, cells };
}

/* ---------- columns: the dot version of the little block sparkline ---------- */
export function dotCols(values, { h = 9, red = () => false, color = C.lit, pitch = 5 } = {}) {
  const v = values.filter(x => x != null && !Number.isNaN(x)); if (!v.length) { const s = document.createElement("span"); return s; }
  const lo = Math.min(...v), hi = Math.max(...v), cpp = Math.max(1, Math.min(3, Math.floor(110 / values.length))), bw = Math.max(1, cpp - 1), m = matrix(values.length * cpp, h, { pitch, dot: pitch * 0.38 });
  values.forEach((x, i) => { if (x == null || Number.isNaN(x)) return; const n = Math.max(1, Math.round((x - lo) / (hi - lo || 1) * (h - 1)) + 1), c = red(x, i) ? C.red : color; for (let b = 0; b < bw; b++) for (let k = 0; k < n; k++) m.set(i * cpp + b, h - 1 - k, c); });
  m.draw(); return m.el;
}

/* ---------- horizontal bars with a label and a value on each row ---------- */
export function dotHBars(rows, { max, w = 36, pitch = 5 } = {}) {
  const box = document.createElement("div"), mx = max != null ? max : Math.max(1, ...rows.map(r => r.value || 0)), lw = Math.max(...rows.map(r => r.label.length), 1);
  box.className = "tm-hb"; rows.forEach(r => { const row = document.createElement("div"); row.className = "tm-hbr";
    const m = matrix(w, 2, { pitch, dot: pitch * 0.38 }), n = r.value == null ? 0 : Math.max(r.value > 0 ? 1 : 0, Math.round(r.value / mx * w)); for (let x = 0; x < n; x++) { m.set(x, 0, r.color || C.lit); m.set(x, 1, r.color || C.lit); } m.draw();
    const l = document.createElement("span"); l.className = "tm-hbl"; l.style.minWidth = lw + "ch"; l.textContent = r.label; const t = document.createElement("span"); t.className = "tm-hbv" + (r.bad ? " tm-red" : ""); t.textContent = r.text || ""; row.append(l, m.el, t); box.appendChild(row); });
  return box;
}

/* ---------- one stacked bar split into named parts (sleep stages) ---------- */
export function dotStack(parts, { w = 64, pitch = 5 } = {}) {
  const box = document.createElement("div"), tot = parts.reduce((s, p) => s + p.value, 0) || 1, m = matrix(w, 3, { pitch, dot: pitch * 0.38 }); let x = 0;
  parts.forEach(p => { const n = Math.round(p.value / tot * w); for (let i = 0; i < n && x < w; i++, x++) for (let y = 0; y < 3; y++) m.set(x, y, p.color); }); m.draw();
  const leg = document.createElement("div"); leg.className = "tm-leg"; leg.innerHTML = parts.map(p => `<span><i style="background:${p.color}"></i>${p.label}</span>`).join(""); box.append(m.el, leg); return box;
}

/* ---------- a 5x7 dot font for digits: timers ---------- */
const F = { 0: [".###.", "#...#", "#..##", "#.#.#", "##..#", "#...#", ".###."], 1: ["..#..", ".##..", "..#..", "..#..", "..#..", "..#..", ".###."], 2: [".###.", "#...#", "....#", "...#.", "..#..", ".#...", "#####"], 3: ["#####", "...#.", "..#..", "...#.", "....#", "#...#", ".###."], 4: ["...#.", "..##.", ".#.#.", "#..#.", "#####", "...#.", "...#."],
  5: ["#####", "#....", "####.", "....#", "....#", "#...#", ".###."], 6: ["..##.", ".#...", "#....", "####.", "#...#", "#...#", ".###."], 7: ["#####", "....#", "...#.", "..#..", ".#...", ".#...", ".#..."], 8: [".###.", "#...#", "#...#", ".###.", "#...#", "#...#", ".###."], 9: [".###.", "#...#", "#...#", ".####", "....#", "...#.", ".##.."],
  ":": [".", ".", "#", ".", "#", ".", "."], "-": ["...", "...", "...", "###", "...", "...", "..."], ".": [".", ".", ".", ".", ".", ".", "#"], " ": ["..", "..", "..", "..", "..", "..", ".."] };
export function dotDigits(text, { pitch = 3.6, color = C.lit } = {}) {
  const glyphs = [...String(text)].map(ch => F[ch] || F[" "]), cols = glyphs.reduce((s, g) => s + g[0].length + 1, -1), m = matrix(cols, 7, { pitch, dot: pitch * 0.42 }); let x = 0;
  glyphs.forEach(g => { g.forEach((row, y) => [...row].forEach((c, i) => c === "#" && m.set(x + i, y, color))); x += g[0].length + 1; }); m.draw(); return m.el;
}

/* ---------- the plot: curves drawn as dots, zero axes dotted, with a hover readout ---------- */
const PLOT_COLS = [C.lit, C.red, C.cyan, C.yel];
export function dotPlot(fs, a, b, { cols = 150, rows = 58, pitch = 5.4 } = {}) {
  const xs = Array.from({ length: cols }, (_, i) => a + (b - a) * i / (cols - 1)), ys = fs.map(f => xs.map(x => f(x))), all = ys.flat().filter(Number.isFinite).sort((p, q) => p - q);
  if (!all.length) throw new Error("that function has no values in this range");
  let lo = all[Math.floor(all.length * 0.01)], hi = all[Math.ceil(all.length * 0.99) - 1]; if (hi - lo < 1e-9) { lo -= 1; hi += 1; } const pad = (hi - lo) * 0.1; lo -= pad; hi += pad;
  const span = hi - lo, row = y => (hi - y) / span * (rows - 1), colOf = x => (x - a) / (b - a) * (cols - 1), m = matrix(cols, rows, { pitch, dot: pitch * 0.4 });
  if (lo < 0 && hi > 0) for (let x = 0; x < cols; x += 2) m.set(x, row(0), C.grey); if (a < 0 && b > 0) for (let y = 0; y < rows; y += 2) m.set(colOf(0), y, C.grey);
  ys.forEach((arr, k) => { let prev = null; arr.forEach((y, i) => { if (!Number.isFinite(y) || y < lo - span || y > hi + span) { prev = null; return; } const r = Math.max(-1, Math.min(rows, row(y))); if (prev != null && Math.abs(r - prev) < rows * 0.7) m.line(i - 1, prev, i, r, PLOT_COLS[k % 4]); else m.set(i, r, PLOT_COLS[k % 4]); prev = r; }); });
  m.draw();
  const box = document.createElement("div"); box.className = "tm-plot";
  box.innerHTML = `<div class="tm-leg"></div>`; box.appendChild(m.el);
  const read = document.createElement("div"); read.className = "tm-read"; read.textContent = "move over the graph for exact values"; box.appendChild(read);
  const ax = document.createElement("div"); ax.className = "tm-axl"; ax.innerHTML = `<span>x ${+a.toFixed(4)}</span><span>y ${+lo.toFixed(3)} to ${+hi.toFixed(3)}</span><span>x ${+b.toFixed(4)}</span>`; box.appendChild(ax);
  const at = e => { const r = m.el.getBoundingClientRect(); return Math.max(0, Math.min(cols - 1, Math.round((e.clientX - r.left) / r.width * (cols - 1)))); };
  let onMove = null; m.el.addEventListener("pointermove", e => { const c = at(e), x = xs[c]; m.draw(set => { for (let y = 0; y < rows; y += 2) set(c, y, "rgba(230,240,255,.55)"); ys.forEach((arr, k) => { if (Number.isFinite(arr[c])) for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) set(c + dx, row(arr[c]) + dy, PLOT_COLS[k % 4]); }); }); if (onMove) onMove(x, ys.map(arr => arr[c]), c); });
  m.el.addEventListener("pointerleave", () => m.draw());
  return { box, legendEl: box.querySelector(".tm-leg"), read, setHover: f => { onMove = f; }, colors: PLOT_COLS };
}
