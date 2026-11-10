// HAL's eye: a red lens in the corner of the console. The bright core follows the pointer, glances toward the prompt while you type,
// blinks when you press Enter, glows faster while a command runs, flares when something goes wrong, and wanders a little when nothing happens.
// Pure drawing: no network, no model.
const SVG = `<svg viewBox="0 0 100 100" aria-hidden="true">
  <defs>
    <radialGradient id="heH" cx="38%" cy="30%" r="85%"><stop offset="0" stop-color="#2a2d38"/><stop offset=".6" stop-color="#12141b"/><stop offset="1" stop-color="#07080c"/></radialGradient>
    <radialGradient id="heL" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#7a0d14"/><stop offset=".7" stop-color="#4a070c"/><stop offset="1" stop-color="#1c0306"/></radialGradient>
    <radialGradient id="heC" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#fff0b8"/><stop offset=".16" stop-color="#ffc24d"/><stop offset=".42" stop-color="#ff4a2e"/><stop offset=".78" stop-color="#b3121b" stop-opacity=".55"/><stop offset="1" stop-color="#b3121b" stop-opacity="0"/></radialGradient>
    <radialGradient id="heG" cx="50%" cy="50%" r="50%"><stop offset=".3" stop-color="#ff3b30" stop-opacity=".55"/><stop offset="1" stop-color="#ff3b30" stop-opacity="0"/></radialGradient>
  </defs>
  <circle class="he-glow" cx="50" cy="50" r="49" fill="url(#heG)"/>
  <circle cx="50" cy="50" r="40" fill="url(#heH)" stroke="rgba(255,255,255,.2)" stroke-width="1"/>
  <circle cx="50" cy="50" r="33" fill="none" stroke="rgba(255,255,255,.07)" stroke-width="1"/>
  <circle cx="50" cy="50" r="28" fill="url(#heL)"/>
  <g class="he-core"><circle cx="50" cy="50" r="22" fill="url(#heC)"/></g>
  <ellipse cx="41" cy="39" rx="7" ry="3.6" transform="rotate(-35 41 39)" fill="#fff" opacity=".16"/>
</svg>`;

export function initHalEye(host, input) {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const el = document.createElement("div"); el.id = "halEye"; el.innerHTML = SVG; host.appendChild(el);
  const core = el.querySelector(".he-core"); let x = 0, y = 0, tx = 0, ty = 0, raf = 0, last = Date.now(), glance = 0, scale = 1, ts = 1, flareT = 0;
  const night = () => { const h = new Date().getHours(); el.classList.toggle("dim", h >= 22 || h < 6); }; night(); setInterval(night, 600000);
  const draw = () => {
    x += (tx - x) * 0.14; y += (ty - y) * 0.14; scale += (ts - scale) * 0.3;
    core.style.transform = `translate(${x.toFixed(2)}px,${y.toFixed(2)}px) scale(${scale.toFixed(3)})`;
    raf = (Math.abs(tx - x) + Math.abs(ty - y) > 0.05 || Math.abs(ts - scale) > 0.01) ? requestAnimationFrame(draw) : 0;
  };
  const go = () => { if (!raf && el.isConnected) raf = requestAnimationFrame(draw); };
  const look = (px, py) => {   // aim the core at a point on the screen
    const r = el.getBoundingClientRect(); if (!r.width) return;
    const dx = px - (r.left + r.width / 2), dy = py - (r.top + r.height / 2), d = Math.hypot(dx, dy) || 1, k = Math.min(1, d / 260) * 8.5;
    tx = dx / d * k; ty = dy / d * k; last = Date.now(); go();
  };
  if (!reduce) {
    document.addEventListener("pointermove", e => { if (document.body.dataset.tab === "home") look(e.clientX, e.clientY); }, { passive: true });
    input.addEventListener("input", () => { tx = -3; ty = 6; last = Date.now(); clearTimeout(glance); go(); });   // glances toward the prompt while you type
    setInterval(() => { if (document.body.dataset.tab === "home" && Date.now() - last > 6000) { tx = (Math.random() - .5) * 11; ty = (Math.random() - .5) * 8; go(); last = Date.now() - 3000; } }, 3500);   // idle: a slow wander
  }
  return {
    blink() { if (reduce) return; ts = 0.25; go(); setTimeout(() => { ts = 1; go(); }, 150); },
    think(on) { el.classList.toggle("busy", !!on); },
    flare() { el.classList.add("flare"); clearTimeout(flareT); flareT = setTimeout(() => el.classList.remove("flare"), 900); }
  };
}
