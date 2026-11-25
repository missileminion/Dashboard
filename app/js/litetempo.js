// Rep tempo metronome (above the gym log), from the owner's rep_metronome.html: the same Web Audio scheduler, sounds and voice clips,
// with a compact phone layout. Phases: lower (eccentric), bottom pause, lift (concentric), top pause. A cue marks the start of lowering
// and lifting, optional ticks count the seconds, optional voice says "down" / "up". Sounds are scheduled ~120 ms ahead on the audio clock,
// so timing stays exact even when the screen redraws late.
//
// Music: everything plays through Web Audio, which does not ask Android for audio focus, so Spotify or YouTube Music keep playing
// underneath (no pause, no ducking). A screen wake lock keeps it running; Android mutes web audio once the app is in the background.
import { dm } from "./dotfont.js";
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

export function initTempo(root, { onReps = () => {} } = {}) {
  let ctx = null, master = null, noise = null, timer = 0, raf = 0, queue = [], cur = null, cycle = [], ci = 0, reps = 0, running = false, open = false, lock = null, clips = null;
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
  function nextPhase(start) { if (ci >= cycle.length) { cycle = newCycle(); ci = 0; } const [name, dur] = cycle[ci++]; if (name === "ecc") reps++; const p = { name, dur, start, rep: reps, head: false, k: 1 }; queue.push(p); return p; }
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
  function frame() {
    if (!running) return; const now = ctx.currentTime;
    while (queue.length > 2 && queue[1].start <= now) queue.shift();
    const p = queue.find(q => q.start <= now && now < q.start + q.dur);
    if (p) {
      const el = now - p.start, left = Math.max(0, p.dur - el), stage = $("tpStage");
      stage.dataset.ph = p.name; $("tpPh").textContent = NAMES[p.name]; $("tpBig").innerHTML = dm(left.toFixed(1));
      $("tpFill").style.transform = `scaleX(${Math.min(1, el / p.dur)})`; $("tpRep").textContent = p.rep;
    }
    raf = requestAnimationFrame(frame);
  }
  async function start() {
    initAudio(); if (S.mode !== "sound") await loadClips(); stop(true);
    running = true; reps = 0; cycle = newCycle(); ci = 0; queue = []; cur = nextPhase(ctx.currentTime + .35);
    pump(); timer = setInterval(pump, 25); raf = requestAnimationFrame(frame); draw();
    keepOn(true);   // the Android app: keep the screen on natively
    try { lock = await navigator.wakeLock?.request("screen"); } catch {}
  }
  function stop(silent) {   // only reps whose lift has finished count: stopping halfway down does not add one
    const now = ctx ? ctx.currentTime : 0, p = queue.find(q => q.start <= now && now < q.start + q.dur), n = p ? (p.name === "ecc" || p.name === "bot" || p.name === "con" ? p.rep - 1 : p.rep) : 0, was = running; running = false; clearInterval(timer); cancelAnimationFrame(raf); queue = [];
    try { lock?.release(); } catch {} lock = null; keepOn(false);
    if (!silent) { draw(); if (was && n > 0) onReps(n); }
  }
  const tempoStr = () => STEPS.map(([k]) => f1(S[k])).join("·");
  function draw() {
    const t = total();
    root.innerHTML = `<div class="card tp${running ? " on" : ""}">
      <div class="tp-head"><span class="kick">Tempo <button class="i" type="button" data-i="tempo" aria-label="About the tempo">i</button></span>
        <button type="button" class="tp-cfg" data-tp="cfg" aria-expanded="${open}"><span class="num">${tempoStr()}</span><span class="num tp-len ${bad("repLength", t) ? "bad" : ""}">${f1(t)} s</span><i>${open ? "⌃" : "⌄"}</i></button></div>
      ${running ? `<div class="tp-stage" id="tpStage" data-ph="ecc"><div class="tp-top"><span id="tpPh">Get ready</span><span class="num">rep <b id="tpRep">0</b></span></div>
        <div class="tp-big" id="tpBig">${dm("0.0")}</div><div class="tp-bar"><i id="tpFill"></i></div></div>` : ""}
      <div class="tp-btns"><button type="button" class="btn${running ? " ghost" : ""}" data-tp="go">${running ? "Stop" : "Start"}</button>${running ? "" : `<button type="button" class="btn ghost tp-test" data-tp="test" aria-label="Test the sound">Test</button>`}</div>
      ${open ? `<div class="tp-set">
        <div class="tp-steps">${STEPS.map(([k, name]) => `<div class="step"><div class="lb">${name}</div><div class="ctl"><button type="button" data-k="${k}" data-d="-1" aria-label="${name} shorter">−</button><span class="n num">${f1(S[k])}</span><button type="button" data-k="${k}" data-d="1" aria-label="${name} longer">+</button></div></div>`).join("")}</div>
        <div class="tp-opt"><span>Sound</span><div class="seg sm">${[["digital", "Click"], ["wood", "Wood"], ["clave", "Clave"]].map(([v, l]) => `<button type="button" data-kind="${v}" class="${S.kind === v ? "on" : ""}">${l}</button>`).join("")}</div></div>
        <div class="tp-opt"><span>Cues</span><div class="seg sm">${[["sound", "Sound"], ["both", "+ Voice"], ["voice", "Voice"]].map(([v, l]) => `<button type="button" data-mode="${v}" class="${S.mode === v ? "on" : ""}">${l}</button>`).join("")}</div></div>
        <div class="tp-opt"><span>Ticks</span><div class="seg sm">${[[true, "On"], [false, "Off"]].map(([v, l]) => `<button type="button" data-ticks="${v}" class="${S.ticks === v ? "on" : ""}">${l}</button>`).join("")}</div></div>
        <div class="tp-opt"><span>Volume</span><div class="ctl"><button type="button" data-k="vol" data-d="-1" aria-label="Quieter">−</button><span class="n num">${S.vol * 10}%</span><button type="button" data-k="vol" data-d="1" aria-label="Louder">+</button></div></div>
      </div>` : ""}</div>`;
  }
  root.addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b || b.classList.contains("i")) return;
    const tp = b.dataset.tp;
    if (tp === "go") { running ? stop() : start(); return; }
    if (tp === "test") { initAudio(); const t = ctx.currentTime + .05; if (S.mode !== "voice") { click("ecc", t); click("con", t + .5); } if (S.mode !== "sound") loadClips().then(() => { const t2 = ctx.currentTime + .05; say("down", t2); say("up", t2 + 1); }); return; }
    if (tp === "cfg") { open = !open; draw(); return; }
    if (b.dataset.k) {
      const k = b.dataset.k, d = +b.dataset.d, st = STEPS.find(x => x[0] === k), [min, max, step] = st ? st.slice(2) : [1, 10, 1];
      S[k] = Math.max(min, Math.min(max, Math.round((S[k] + d * step) * 100) / 100)); save(); if (master) master.gain.value = S.vol / 10;
      if (running && k !== "vol") { /* the new tempo starts with the next rep */ }
      draw(); try { navigator.vibrate?.(5); } catch {} return;
    }
    if (b.dataset.kind) { S.kind = b.dataset.kind; save(); draw(); initAudio(); click("ecc", ctx.currentTime + .03); return; }
    if (b.dataset.mode) { S.mode = b.dataset.mode; save(); draw(); return; }
    if (b.dataset.ticks) { S.ticks = b.dataset.ticks === "true"; save(); draw(); return; }
  });
  document.addEventListener("visibilitychange", () => { if (!document.hidden && running && !lock) navigator.wakeLock?.request("screen").then(l => (lock = l), () => {}); });
  draw();
  return { stop: () => running && stop(), get running() { return running; } };
}
