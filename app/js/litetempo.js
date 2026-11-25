// Rep tempo metronome (above the gym log), from the owner's rep_metronome.html: the same Web Audio scheduler, sounds and voice clips,
// in a fixed-size card (it never grows or collapses: settings are always in view, and Start only changes the readout). Phases: lower (eccentric), bottom pause, lift (concentric), top pause. A cue marks the start of lowering
// and lifting, optional ticks count the seconds, optional voice says "down" / "up". Sounds are scheduled ~120 ms ahead on the audio clock,
// so timing stays exact even when the screen redraws late.
//
// Music: everything plays through Web Audio, which does not ask Android for audio focus, so Spotify or YouTube Music keep playing
// underneath (no pause, no ducking). A screen wake lock keeps it running; Android mutes web audio once the app is in the background.
import { dm } from "./dotfont.js";
import { haptic, detent } from "./haptic.js";
import { bad } from "./standards.js";

const KEY = "repmetro";   // same storage key as the stand-alone page, so settings carry over
const S = { ecc: 3, bot: 0, con: 1, top: 0, vol: 8, kind: "digital", mode: "sound", ticks: true };
try { Object.assign(S, JSON.parse(localStorage.getItem(KEY) || "{}")); } catch {}
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch {} };
const STEPS = [["ecc", "Lower", .5, 10, .5], ["bot", "Pause", 0, 5, .5], ["con", "Lift", .5, 6, .5], ["top", "Pause", 0, 5, .5]];
const FREQ = { digital: { ecc: 880, con: 1480, tick: 1175 }, wood: { ecc: 620, con: 980, tick: 800 }, clave: { ecc: 1700, con: 2600, tick: 2100 } };
const NAMES = { ecc: "Lower", bot: "Hold", con: "Lift", top: "Hold" };
const f1 = v => (Number.isInteger(v) ? String(v) : v.toFixed(1));
const keepOn = on => { const C = window.Capacitor; if (!C?.isNativePlatform?.()) return; try { const P = C.Plugins?.HealthConnect; (P?.keepScreenOn ? P.keepScreenOn({ on }) : C.nativePromise("HealthConnect", "keepScreenOn", { on })).catch(() => {}); } catch {} };   // same call path as hc.js
const total = () => S.ecc + S.bot + S.con + S.top;

export function initTempo(root) {
  let ctx = null, master = null, noise = null, timer = 0, raf = 0, queue = [], cur = null, cycle = [], ci = 0, running = false, lock = null, clips = null;
  const buffers = {};

  // ---------- audio (as in the original) ----------
  function initAudio() {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      const comp = ctx.createDynamicsCompressor(); master = ctx.createGain(); master.connect(comp); comp.connect(ctx.destination);
      const nb = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate), d = nb.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; noise = nb;
    }
    master.gain.value = S.vol / 10; if (ctx.state === "suspended") ctx.resume();
  }
  function osc(type, f, t, peak, decay, f2) {
    const o = ctx.createOscillator(), g = ctx.createGain(); o.type = type; o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + decay * .6);
    g.gain.setValueAtTime(.0001, t); g.gain.linearRampToValueAtTime(peak, t + .001); g.gain.exponentialRampToValueAtTime(.0001, t + decay);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + decay + .02);
  }
  function burst(f, t, peak, dur) {
    const s = ctx.createBufferSource(), b = ctx.createBiquadFilter(), g = ctx.createGain(); s.buffer = noise; b.type = "bandpass"; b.frequency.value = f; b.Q.value = 1.2;
    g.gain.setValueAtTime(peak, t); g.gain.exponentialRampToValueAtTime(.0001, t + dur); s.connect(b); b.connect(g); g.connect(master); s.start(t); s.stop(t + dur + .02);
  }
  function click(which, t) {
    const f = FREQ[S.kind][which], p = which === "tick" ? .38 : .95;
    if (S.kind === "digital") osc("sine", f, t, p, .05);
    else if (S.kind === "wood") { osc("sine", f, t, p, .1, f * .86); osc("triangle", f * 2.4, t, p * .35, .035); burst(f * 1.6, t, p * .3, .015); }
    else { osc("sine", f, t, p, .13); osc("sine", f * 2.7, t, p * .25, .04); burst(f, t, p * .15, .01); }
  }
  function loadClips() {   // "down" and "up", decoded once
    if (!clips) clips = Promise.all(["down", "up"].map(w => fetch(`audio/rep-${w}.wav`).then(r => r.arrayBuffer()).then(b => ctx.decodeAudioData(b)).then(buf => (buffers[w] = buf)))).catch(() => {});
    return clips;
  }
  function say(w, t) { if (S.mode === "sound" || !buffers[w]) return; const s = ctx.createBufferSource(); s.buffer = buffers[w]; s.connect(master); s.start(Math.max(t || 0, ctx.currentTime)); }
  const newCycle = () => [["ecc", S.ecc], ["bot", S.bot], ["con", S.con], ["top", S.top]].filter(p => p[1] > 0);
  function nextPhase(start) {   // off/len: where this phase sits in its rep, for the playhead on the scale
    if (ci >= cycle.length) { cycle = newCycle(); ci = 0; } const off = cycle.slice(0, ci).reduce((a, q) => a + q[1], 0), len = cycle.reduce((a, q) => a + q[1], 0);
    const [name, dur] = cycle[ci++]; const p = { name, dur, start, off, len, head: false, k: 1 }; queue.push(p); return p; }
  function headCue(p) { if (p.name === "ecc" || p.name === "con") { if (S.mode !== "voice") click(p.name, p.start); say(p.name === "ecc" ? "down" : "up", p.start); } }
  function pump() {
    if (!running) return; const horizon = ctx.currentTime + .12;
    for (;;) {
      if (!cur.head) { if (cur.start >= horizon) return; headCue(cur); cur.head = true; }
      if (S.ticks && S.mode !== "voice" && (cur.name === "ecc" || cur.name === "con")) { while (cur.k < cur.dur - .05 && cur.start + cur.k < horizon) { click("tick", cur.start + cur.k); cur.k++; } }
      else cur.k = Math.ceil(cur.dur);
      if (cur.start + cur.dur < horizon) cur = nextPhase(cur.start + cur.dur); else return;
    }
  }
  // ---------- screen ----------
  const $ = id => root.querySelector("#" + id);
  function frame() {   // only text, a class and two transforms change while running, so the card never moves
    if (!running) return; const now = ctx.currentTime;
    while (queue.length > 2 && queue[1].start <= now) queue.shift();
    const p = queue.find(q => q.start <= now && now < q.start + q.dur);
    if (p) {
      const el = now - p.start, left = Math.max(0, p.dur - el), card = root.firstElementChild;
      if (card.dataset.ph !== p.name) { card.dataset.ph = p.name; $("tpPh").textContent = NAMES[p.name]; }
      $("tpBig").innerHTML = dm(left.toFixed(1));
      $("tpHead").style.left = (Math.min(1, (p.off + el) / p.len) * 100).toFixed(2) + "%";
    }
    raf = requestAnimationFrame(frame);
  }
  async function start() {
    initAudio(); if (S.mode !== "sound") await loadClips(); stop(true);
    running = true; cycle = newCycle(); ci = 0; queue = []; cur = nextPhase(ctx.currentTime + .35);
    draw(); pump(); timer = setInterval(pump, 25); raf = requestAnimationFrame(frame);
    keepOn(true);   // the Android app: keep the screen on natively
    try { lock = await navigator.wakeLock?.request("screen"); } catch {}
  }
  function stop(silent) {
    running = false; clearInterval(timer); cancelAnimationFrame(raf); queue = [];
    try { lock?.release(); } catch {} lock = null; keepOn(false);
    if (!silent) draw();
  }
  const tempoStr = () => STEPS.map(([k]) => f1(S[k])).join("·");
  // the scale: one rep from 0 to its total length, each phase a band, major markers on whole seconds, minor on half seconds
  function scale(t) {
    let x = 0, bands = "", ticks = "";
    for (const [k] of STEPS) { if (S[k] > 0) bands += `<i class="b-${k}" style="left:${(x / t * 100).toFixed(2)}%;width:${(S[k] / t * 100).toFixed(2)}%"></i>`; x += S[k]; }
    const lab = t > 12 ? 2 : 1;
    for (let v = 0; v <= t + 1e-6; v += .5) { const maj = Number.isInteger(v), pos = (v / t * 100).toFixed(2);
      ticks += `<i class="${maj ? "mj" : "mn"}" style="left:${pos}%"></i>` + (maj && v % lab === 0 ? `<span style="left:${pos}%">${v}</span>` : ""); }
    return `<div class="tp-scale"><div class="tp-bands">${bands}</div><div class="tp-ticks">${ticks}</div><b id="tpHead"></b></div>`;
  }
  const seg = (attr, cur, opts) => `<div class="seg sm">${opts.map(([v, l]) => `<button type="button" data-${attr}="${v}" class="${String(cur) === String(v) ? "on" : ""}">${l}</button>`).join("")}</div>`;
  const ctl = (k, val, name) => `<div class="ctl"><button type="button" data-k="${k}" data-d="-1" aria-label="${name} down">−</button><span class="n num">${val}</span><button type="button" data-k="${k}" data-d="1" aria-label="${name} up">+</button></div>`;
  function draw() {
    const t = total();
    root.innerHTML = `<div class="card tp${running ? " on" : ""}" data-ph="">
      <div class="tp-head"><span class="kick">Tempo <button class="i" type="button" data-i="tempo" aria-label="About the tempo">i</button></span>
        <span class="tp-read${!running && bad("repLength", t) ? " bad" : ""}"><span id="tpPh">${running ? "Get ready" : tempoStr()}</span><span class="tp-big" id="tpBig">${dm(running ? "0.0" : f1(t))}</span><small>s</small></span></div>
      ${scale(t)}
      <div class="tp-steps">${STEPS.map(([k, name]) => `<div class="step s-${k}"><div class="lb">${name}</div>${ctl(k, f1(S[k]), name)}</div>`).join("")}</div>
      <div class="tp-opt">${seg("kind", S.kind, [["digital", "Click"], ["wood", "Wood"], ["clave", "Clave"]])}${ctl("vol", S.vol * 10 + "%", "Volume")}</div>
      <div class="tp-opt">${seg("mode", S.mode, [["sound", "Sound"], ["both", "+ Voice"], ["voice", "Voice"]])}${seg("ticks", S.ticks, [[true, "Ticks"], [false, "Off"]])}</div>
      <button type="button" class="btn tp-go" data-tp="go">${running ? "Stop" : "Start"}</button></div>`;
  }
  root.addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b || b.classList.contains("i")) return;
    const tp = b.dataset.tp;
    if (tp === "go") { running ? stop() : start(); return; }
    if (b.dataset.k) {
      const k = b.dataset.k, d = +b.dataset.d, st = STEPS.find(x => x[0] === k), [min, max, step] = st ? st.slice(2) : [1, 10, 1];
      S[k] = Math.max(min, Math.min(max, Math.round((S[k] + d * step) * 100) / 100)); save(); if (master) master.gain.value = S.vol / 10;
      draw();   // while running, the new tempo starts with the next rep; the readout catches up on the next frame
      haptic(k === "vol" ? "minor" : detent(S[k])); return;   // phase lengths: whole seconds are major detents, halves minor
    }
    if (b.dataset.kind) { S.kind = b.dataset.kind; save(); draw(); initAudio(); click("ecc", ctx.currentTime + .03); return; }
    if (b.dataset.mode) { S.mode = b.dataset.mode; save(); draw(); return; }
    if (b.dataset.ticks) { S.ticks = b.dataset.ticks === "true"; save(); draw(); return; }
  });
  document.addEventListener("visibilitychange", () => { if (!document.hidden && running && !lock) navigator.wakeLock?.request("screen").then(l => (lock = l), () => {}); });
  draw();
  return { stop: () => running && stop(), get running() { return running; } };
}
