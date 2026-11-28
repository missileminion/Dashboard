// The heartbeat: a flat red dotted line that, once per beat at the given rate, springs up into one heartbeat shape in place
// (the spike first, the small waves a moment later), overshoots a touch and relaxes back to flat while its glow fades.
// The dots sit on a fixed grid and never move; each one's brightness and size come from its distance to the curve, so the
// shape glides through the grid instead of jumping row to row. beat() returns the canvas; one shared loop draws every
// canvas on the page and stops when none is showing.
const gs = (t, m, s) => Math.exp(-((t - m) ** 2) / (2 * s * s));
// one beat, u in [-1,1] around the spike: small bump, dip, sharp spike, dip, rounded wave
const shape = u => .12 * gs(u, -.42, .07) - .1 * gs(u, -.06, .022) + 1 * gs(u, 0, .026) - .28 * gs(u, .07, .028) + .24 * gs(u, .45, .1);
const clamp = v => v < 0 ? 0 : v > 1 ? 1 : v, smooth = t => (t = clamp(t), t * t * (3 - 2 * t));
// a damped spring from 0 to 1: overshoots a little, settles
const ZW = Math.sqrt(1 - .42 * .42);
const spring = t => t <= 0 ? 0 : 1 - Math.exp(-.42 * 26 * t) * (Math.cos(26 * ZW * t) + .42 / ZW * Math.sin(26 * ZW * t));
const reduce = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

export function beat(bpm, { h = 54 } = {}) {
  const r = Math.round(bpm);
  return `<canvas class="beat" data-bpm="${Math.max(30, bpm)}" style="height:${h}px" role="img" aria-label="Heart beating at ${r} beats a minute"></canvas>`;
}

const state = new WeakMap();
function setup(cv) {
  const DPR = Math.max(2, devicePixelRatio || 1), w = cv.clientWidth, h = cv.clientHeight, p = 4.2;
  cv.width = Math.round(w * DPR); cv.height = Math.round(h * DPR);
  const x = cv.getContext("2d"); x.setTransform(DPR, 0, 0, DPR, 0, 0);
  const cols = Math.floor(w / p), rows = Math.floor(h / p), SUB = 3, N = (cols - 1) * SUB + 1;
  const st = { w, h, x, p, cols, rows, SUB, N, ox: (w - (cols - 1) * p) / 2, oy: (h - (rows - 1) * p) / 2, base: Math.round(rows * .66), amp: rows * .7,
    ys: new Float32Array(N), es: new Float32Array(N), buf: new Float32Array(cols * rows), last: 0,
    ink: getComputedStyle(cv).getPropertyValue("--pulse").trim() || "255,52,52" };
  state.set(cv, st); return st;
}

function draw(cv, now) {
  let st = state.get(cv);
  if (!st || st.w !== cv.clientWidth || st.h !== cv.clientHeight) st = setup(cv);
  const { x, w, h, p, cols, rows, SUB, N, ox, oy, base, amp, ys, es, buf, ink } = st;
  if (cols < 2 || rows < 2) return;
  const per = 60 / +cv.dataset.bpm, s = reduce() ? .1 : (now / 1000) % per, hold = Math.exp(-Math.max(0, s - .12) * 6), glow = clamp(1.2 - s * 3);
  for (let j = 0; j < N; j++) {
    const t = j / (N - 1), u = (t - .5) / .44, a = Math.abs(u);
    ys[j] = base - (a > 1 ? 0 : shape(u) * spring(s - a * .05) * hold) * amp;
    es[j] = a > 1 ? 0 : glow * (1 - a * .5);
  }
  const dt = st.last ? Math.min(.05, (now - st.last) / 1000) : .016, fade = Math.exp(-dt * 10); st.last = now;
  x.clearRect(0, 0, w, h);
  for (let i = 0; i < cols; i++) {
    const j0 = Math.max(0, (i - 2) * SUB), j1 = Math.min(N - 1, (i + 2) * SUB);
    for (let k = 0; k < rows; k++) {
      let best = 0;
      for (let j = j0; j < j1; j++) {   // distance from this dot to each little segment of the curve nearby, in grid units
        const ax = j / SUB, ay = ys[j], dx = 1 / SUB, dy = ys[j + 1] - ay;
        const q = clamp(((i - ax) * dx + (k - ay) * dy) / (dx * dx + dy * dy)), d = Math.hypot(i - ax - q * dx, k - ay - q * dy);
        const v = smooth(1 - d / .8) * (.55 + .45 * es[j]);
        if (v > best) best = v;
      }
      const o = i * rows + k, b = buf[o] = Math.max(best, buf[o] * fade);
      if (b < .03) continue;
      x.fillStyle = `rgba(${ink},${b.toFixed(3)})`; x.beginPath(); x.arc(ox + i * p, oy + k * p, p * (.17 + .11 * b), 0, 7); x.fill();
    }
  }
}

let running = false;
function loop(now) {
  const all = [...document.querySelectorAll("canvas.beat")].filter(c => c.offsetParent);
  all.forEach(c => draw(c, now));
  if (all.length || document.querySelector("canvas.beat")) requestAnimationFrame(loop); else running = false;
}
export function startBeats() { if (!running) { running = true; requestAnimationFrame(loop); } }
