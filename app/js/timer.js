// Focus timer (the "Tempo" timer), ported from pomodoro.jsx into the dashboard's Productivity tab.
// Focus -> overtime earns extra break (0.2 min per overtime minute); the 4th break is a 20 min long break.
// All state is timestamp-based, so it keeps running while the Health tab is showing. Phase colours are CSS variables (themes.css).
import { esc } from "./util.js";

const LONG = 20 * 60;
const V = n => `var(--t-${n})`;
const T = {
  en: { ready: "Ready", focus: "Focus", overtime: "Overtime", break_: "Break", longBreak: "Long break", breakOver: "Break over", startFocus: "Start focus", breakBtn: "Break",
    earned: t => `+${t} extra break earned`, includes: t => `includes +${t} earned`, breakUp: "Break time is up", timeSpent: "Time spent",
    chartDesc: "Focus and break per session. Brighter tops mark time beyond the plan.", totFocus: "Total focus", totBreak: "Total break", totExtra: "Earned extra",
    empty: "Complete a session to see your rhythm here.", lgFocus: "Focus", lgFocusOT: "Focus overtime", lgBreak: "Break", lgBreakOT: "Break overrun",
    reset: "Reset all", confirmReset: "Confirm reset", developer: "Developer", chimePreview: "Chime preview", play: "Play",
    ch1: "Focus complete", ch1d: "Rising triad · plays when focus time is up", ch2: "Break complete", ch2d: "Descending pair · plays when break ends", ch3: "Break overrun", ch3d: "Low double knock · reminder while over",
    language: "Language", sessionLength: "Session length", focusLen: "Focus", breakLen: "Break", min: "min", appliesNext: "Applies from the next session. The 4th break stays 20 min.",
    cycleTip: "Sessions until long break", paused: "Paused", pause: "Pause", resume: "Resume", spaceHint: "Space to pause or resume", title: "Focus timer" },
  es: { ready: "Listo", focus: "Enfoque", overtime: "Tiempo extra", break_: "Descanso", longBreak: "Descanso largo", breakOver: "Descanso excedido", startFocus: "Iniciar enfoque", breakBtn: "Descanso",
    earned: t => `+${t} de descanso extra ganado`, includes: t => `incluye +${t} ganado`, breakUp: "El descanso terminó", timeSpent: "Tiempo dedicado",
    chartDesc: "Enfoque y descanso por sesión. Las puntas brillantes marcan el tiempo fuera del plan.", totFocus: "Enfoque total", totBreak: "Descanso total", totExtra: "Extra ganado",
    empty: "Completa una sesión para ver tu ritmo aquí.", lgFocus: "Enfoque", lgFocusOT: "Enfoque extra", lgBreak: "Descanso", lgBreakOT: "Descanso excedido",
    reset: "Restablecer todo", confirmReset: "Confirmar", developer: "Desarrollador", chimePreview: "Prueba de campanas", play: "Oír",
    ch1: "Enfoque completo", ch1d: "Tríada ascendente · suena al terminar el enfoque", ch2: "Descanso completo", ch2d: "Par descendente · suena al terminar el descanso", ch3: "Descanso excedido", ch3d: "Doble toque grave · recordatorio al excederse",
    language: "Idioma", sessionLength: "Duración de sesión", focusLen: "Enfoque", breakLen: "Descanso", min: "min", appliesNext: "Se aplica desde la próxima sesión. El 4.º descanso sigue siendo de 20 min.",
    cycleTip: "Sesiones hasta el descanso largo", paused: "En pausa", pause: "Pausar", resume: "Reanudar", spaceHint: "Espacio para pausar o reanudar", title: "Temporizador de enfoque" },
  zh: { ready: "準備就緒", focus: "專注", overtime: "加時", break_: "休息", longBreak: "長休息", breakOver: "休息超時", startFocus: "開始專注", breakBtn: "休息",
    earned: t => `已賺取 +${t} 額外休息`, includes: t => `含 +${t} 已賺取`, breakUp: "休息時間結束", timeSpent: "時間統計",
    chartDesc: "每節的專注與休息時間。較亮的頂端代表超出計畫的時間。", totFocus: "總專注", totBreak: "總休息", totExtra: "已賺額外",
    empty: "完成一節後，這裡會顯示你的節奏。", lgFocus: "專注", lgFocusOT: "專注加時", lgBreak: "休息", lgBreakOT: "休息超時",
    reset: "全部重設", confirmReset: "確認重設", developer: "開發者", chimePreview: "提示音試聽", play: "播放",
    ch1: "專注完成", ch1d: "上行三和弦 · 專注時間結束時播放", ch2: "休息完成", ch2d: "下行雙音 · 休息結束時播放", ch3: "休息超時", ch3d: "低沉雙擊 · 超時提醒",
    language: "語言", sessionLength: "時段長度", focusLen: "專注", breakLen: "休息", min: "分鐘", appliesNext: "下一節開始生效。第 4 次休息仍為 20 分鐘。",
    cycleTip: "距離長休息的節數", paused: "已暫停", pause: "暫停", resume: "繼續", spaceHint: "按空白鍵暫停或繼續", title: "專注計時器" },
};
const LANGS = [["en", "English"], ["es", "Español"], ["zh", "繁體中文"]];

/* ---------- audio: synthesized chimes ---------- */
let AC = null;
const ctx = () => { if (!AC) AC = new (window.AudioContext || window.webkitAudioContext)(); if (AC.state === "suspended") AC.resume(); return AC; };
function tone(c, f, t0, dur, vol, pan = 0) {
  const o = c.createOscillator(), g = c.createGain();
  o.type = "sine"; o.frequency.value = f;
  g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(vol, t0 + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g);
  if (c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = pan; g.connect(p); p.connect(c.destination); } else g.connect(c.destination);
  o.start(t0); o.stop(t0 + dur + 0.05);
}
const bell = (c, f, t0, dur, vol, pan = 0) => { tone(c, f, t0, dur, vol, pan); tone(c, f * 2.01, t0, dur * 0.7, vol * 0.28, pan); tone(c, f * 2.99, t0, dur * 0.45, vol * 0.12, pan); };
const chimeFocusDone = () => { const c = ctx(), t = c.currentTime + 0.03; bell(c, 523.25, t, 2.2, 0.2, -0.25); bell(c, 659.25, t + 0.16, 2.2, 0.18, 0.05); bell(c, 783.99, t + 0.32, 2.6, 0.16, 0.3); };
const chimeBreakDone = () => { const c = ctx(), t = c.currentTime + 0.03; bell(c, 880, t, 1.8, 0.17, -0.15); bell(c, 659.25, t + 0.22, 2.4, 0.17, 0.2); };
const chimeOverdue = () => { const c = ctx(), t = c.currentTime + 0.03; bell(c, 392, t, 1.2, 0.16, 0); bell(c, 392, t + 0.3, 1.6, 0.13, 0); };

const fmt = s => { s = Math.max(0, Math.round(s)); return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`; };
const fmtMin = sec => { const m = sec / 60; return (m >= 100 ? Math.round(m) : m.toFixed(m < 10 ? 1 : 0)) + "m"; };

export function initTimer(root) {
  let prefs = { lang: "en", workMin: 25, brkMin: 5 };
  try { prefs = { ...prefs, ...JSON.parse(localStorage.getItem("tempo.prefs") || "{}") }; } catch {}
  const S = { mode: "idle", startTs: null, allot: prefs.workMin * 60, breakCount: 0, sessions: [], cur: null, pausedAt: null, resetArm: false, devOpen: false };
  let workAllot = prefs.workMin * 60, alerted = false, overdueAlerted = false, resetTimer = null, ctlSig = "", devSig = "";
  const t = () => T[prefs.lang];
  const save = () => { try { localStorage.setItem("tempo.prefs", JSON.stringify(prefs)); } catch {} };

  root.innerHTML = `
  <div class="grid geq">
    <div class="card tm-card">
      <div class="tm-head"><div class="lbl" id="tmTitle"></div><button class="tm-ghost" id="tmReset"></button></div>
      <div class="tm-ruler">
        <div class="tm-label" id="tmLabel"></div>
        <div class="tm-view"><div class="tm-tape" id="tmTape"></div><div class="tm-pin" id="tmPin"></div></div>
        <div class="tm-time num" id="tmTime"></div>
        <div class="tm-sub" id="tmSub"></div>
      </div>
      <div class="tm-ctl" id="tmCtl"></div>
      <div class="tm-pips" id="tmPips"></div>
    </div>
    <div class="card tm-stats">
      <div style="font-weight:600;font-size:14px" id="tmSpent"></div>
      <div class="basis" id="tmDesc" style="margin-top:4px"></div>
      <div class="tm-tot" id="tmTot"></div>
      <div id="tmChart"></div>
      <div class="tm-leg" id="tmLeg"></div>
    </div>
  </div>
  <div class="card tm-dev"><button class="tm-devbtn" id="tmDevBtn"></button><div class="tm-devbody" id="tmDevBody" hidden></div></div>`;
  const $$ = id => root.querySelector("#" + id);
  const el = Object.fromEntries(["tmTitle", "tmReset", "tmLabel", "tmTape", "tmPin", "tmTime", "tmSub", "tmCtl", "tmPips", "tmSpent", "tmDesc", "tmTot", "tmChart", "tmLeg", "tmDevBtn", "tmDevBody"].map(k => [k, $$(k)]));

  const paused = () => S.pausedAt !== null;
  const eff = () => (paused() ? S.pausedAt : Date.now());
  const elapsedNow = () => (S.mode === "idle" ? 0 : (eff() - S.startTs) / 1000);
  const isLongNext = () => (S.breakCount + 1) % 4 === 0;

  function startWork() {
    ctx(); alerted = overdueAlerted = false; workAllot = prefs.workMin * 60; S.pausedAt = null;
    S.mode = "work"; S.startTs = Date.now(); S.allot = workAllot; S.cur = { work: 0, workOver: 0, brk: 0, brkOver: 0, extraEarned: 0 };
  }
  function startBreak() {
    const e = elapsedNow(), wOver = Math.max(0, e - workAllot), extra = wOver * 0.2;
    S.cur = { ...S.cur, work: Math.min(e, workAllot), workOver: wOver, extraEarned: extra };
    S.allot = (isLongNext() ? LONG : prefs.brkMin * 60) + extra; alerted = overdueAlerted = false; S.pausedAt = null; S.mode = "break"; S.startTs = Date.now();
  }
  function nextFocus() {
    const e = elapsedNow();
    S.sessions.push({ ...S.cur, brk: Math.min(e, S.allot), brkOver: Math.max(0, e - S.allot) });
    S.breakCount++; startWork();
  }
  function togglePause() {
    if (S.mode === "idle") return;
    if (paused()) { S.startTs += Date.now() - S.pausedAt; S.pausedAt = null; } else S.pausedAt = Date.now();
    tick();
  }
  function resetAll() {
    if (!S.resetArm) { S.resetArm = true; clearTimeout(resetTimer); resetTimer = setTimeout(() => { S.resetArm = false; tick(); }, 3000); return tick(); }
    clearTimeout(resetTimer); S.resetArm = false; alerted = overdueAlerted = false;
    Object.assign(S, { pausedAt: null, mode: "idle", startTs: null, allot: prefs.workMin * 60, breakCount: 0, sessions: [], cur: null }); tick();
  }

  el.tmCtl.addEventListener("click", e => {
    const a = e.target.closest("[data-act]")?.dataset.act;
    if (a === "pause") togglePause(); else if (a === "start") startWork(); else if (a === "break") startBreak(); else if (a === "next") nextFocus();
    tick();
  });
  el.tmReset.onclick = resetAll;
  el.tmDevBtn.onclick = () => { S.devOpen = !S.devOpen; devSig = ""; tick(); };
  document.addEventListener("keydown", e => {
    if (e.code !== "Space" || document.body.dataset.tab !== "prod") return;
    const tag = document.activeElement?.tagName;
    if (tag === "BUTTON" || tag === "INPUT" || tag === "TEXTAREA" || document.activeElement?.isContentEditable) return;
    e.preventDefault(); togglePause();
  });

  /* ---------- ruler ---------- */
  const W = 560, PPS = 1.1, range = W / PPS;
  function drawRuler(value, over, allot) {
    const lo = Math.max(0, Math.floor((value - range / 2 - 60) / 15) * 15), hi = Math.ceil((value + range / 2 + 60) / 15) * 15;
    const capHi = over ? hi : Math.min(hi, Math.ceil(allot / 15) * 15);
    let h = "";
    for (let v = lo; v <= capHi; v += 15) {
      const major = v % 60 === 0;
      h += `<div class="tm-tk" style="left:${v * PPS}px"><i class="${major ? "mj" : "mn"}"></i>${major ? `<span>${over ? "+" : ""}${v / 60}m</span>` : ""}</div>`;
    }
    el.tmTape.innerHTML = h;
    el.tmTape.style.transform = `translateX(${(root.querySelector(".tm-view").clientWidth || W) / 2 - value * PPS}px)`;
  }

  /* ---------- chart ---------- */
  function drawChart(rows) {
    if (!rows.length) return (el.tmChart.innerHTML = `<div class="tm-empty">${esc(t().empty)}</div>`);
    // Line chart: one point per session for focus and for break. The y axis never drops below the planned
    // session length, so a short first session doesn't fill the chart. Overtime shows as an amber dot, break overrun as a red dot.
    const CW = 640, CH = 190, L = 34, R = 10, top = 12, bot = 22, n = rows.length;
    const plan = Math.max(prefs.workMin, prefs.brkMin) * 60 * 1.2, raw = Math.max(plan, ...rows.map(r => Math.max(r.work + r.workOver, r.brk + r.brkOver)));
    const step = [300, 600, 900, 1800, 3600, 7200].find(s => raw / s <= 5) || 7200, max = Math.ceil(raw / step) * step;
    const yOf = v => CH - bot - (v / max) * (CH - bot - top);
    const xOf = i => n === 1 ? (L + CW - R) / 2 : L + 14 + (i * (CW - L - R - 28)) / (n - 1);
    let s = `<svg viewBox="0 0 ${CW} ${CH}" style="height:190px;margin-top:12px">`;
    for (let v = 0; v <= max; v += step) s += `<line x1="${L}" y1="${yOf(v)}" x2="${CW - R}" y2="${yOf(v)}" stroke="${v ? "var(--grid-minor)" : "var(--line)"}"/><text x="${L - 6}" y="${yOf(v) + 3.5}" text-anchor="end" font-size="10" fill="var(--tx3)">${v / 60}m</text>`;
    const line = (f, col) => `<polyline points="${rows.map((r, i) => `${xOf(i)},${yOf(f(r))}`).join(" ")}" fill="none" stroke="${col}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
    s += line(r => r.work + r.workOver, V("work")) + line(r => r.brk + r.brkOver, V("brk"));
    rows.forEach((r, i) => {
      const x = xOf(i), w = r.work + r.workOver, b = r.brk + r.brkOver;
      s += `<circle cx="${x}" cy="${yOf(w)}" r="3.5" fill="${r.workOver > 0 ? V("extra") : V("work")}"/>`;
      if (b > 0) s += `<circle cx="${x}" cy="${yOf(b)}" r="3.5" fill="${r.brkOver > 0 ? V("over") : V("brk")}"/>`;
      s += `<text x="${x}" y="${CH - 5}" text-anchor="middle" font-size="10" fill="var(--tx3)">${i + 1}</text>`;
    });
    el.tmChart.innerHTML = s + "</svg>";
  }

  /* ---------- developer panel (language, lengths, chime preview) ---------- */
  function stepper(key, label, min, max) {
    return `<div class="tm-row"><span>${esc(label)}</span><div class="tm-step"><button data-step="${key}" data-d="-1">−</button><span class="num">${prefs[key]} <small>${esc(t().min)}</small></span><button data-step="${key}" data-d="1">+</button></div></div>`;
  }
  const chimes = () => [[t().ch1, t().ch1d, chimeFocusDone, V("work")], [t().ch2, t().ch2d, chimeBreakDone, V("brk")], [t().ch3, t().ch3d, chimeOverdue, V("over")]];
  function buildDev() {
    el.tmDevBody.hidden = !S.devOpen;
    if (!S.devOpen) return;
    el.tmDevBody.innerHTML = `
      <div class="tm-sec"><div class="tm-sl">${esc(t().language)}</div><div class="seg">${LANGS.map(([c, n]) => `<button data-lang="${c}" class="${prefs.lang === c ? "on" : ""}">${esc(n)}</button>`).join("")}</div></div>
      <div class="tm-sec"><div class="tm-sl">${esc(t().sessionLength)}</div>${stepper("workMin", t().focusLen)}${stepper("brkMin", t().breakLen)}<div class="basis">${esc(t().appliesNext)}</div></div>
      <div class="tm-sec"><div class="tm-sl">${esc(t().chimePreview)}</div>${chimes().map(([n, d], i) => `<div class="tm-row"><div><div><span class="tm-dot" style="background:${chimes()[i][3]}"></span>${esc(n)}</div><div class="basis" style="margin-left:16px">${esc(d)}</div></div><button class="btn" data-chime="${i}">${esc(t().play)}</button></div>`).join("")}</div>`;
  }
  el.tmDevBody.addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b) return;
    if (b.dataset.lang) { prefs.lang = b.dataset.lang; save(); ctlSig = devSig = ""; }
    else if (b.dataset.step) { const k = b.dataset.step, lim = k === "workMin" ? [1, 120] : [1, 60]; prefs[k] = Math.min(lim[1], Math.max(lim[0], prefs[k] + +b.dataset.d)); save(); if (S.mode === "idle") S.allot = prefs.workMin * 60; devSig = ""; }
    else if (b.dataset.chime != null) { ctx(); chimes()[+b.dataset.chime][2](); }
    tick();
  });

  /* ---------- one frame ---------- */
  function tick() {
    const L = t(), e = elapsedNow(), remain = S.allot - e, over = S.mode !== "idle" && remain < 0, p = paused();
    if (S.mode !== "idle" && !p) {
      if (over && !alerted) { alerted = true; S.mode === "work" ? chimeFocusDone() : chimeBreakDone(); }
      if (S.mode === "break" && -remain >= 60 && !overdueAlerted) { overdueAlerted = true; chimeOverdue(); }
    }
    let color = "var(--tm-idle)", value = prefs.workMin * 60, time = fmt(value), label = L.ready, sub = "", subColor = "var(--tx2)";
    if (S.mode === "work") {
      if (!over) { color = V("work"); value = remain; time = fmt(remain); label = L.focus; }
      else { color = V("extra"); value = -remain; time = fmt(-remain); label = L.overtime; sub = L.earned(fmt(-remain * 0.2)); subColor = V("extra"); }
    } else if (S.mode === "break") {
      if (!over) { color = V("brk"); value = remain; time = fmt(remain); label = isLongNext() ? L.longBreak : L.break_; if (S.cur?.extraEarned >= 1) sub = L.includes(fmt(S.cur.extraEarned)); }
      else { color = V("over"); value = -remain; time = fmt(-remain); label = L.breakOver; sub = L.breakUp; subColor = V("over"); }
    }
    if (p) { label = `${L.paused} · ${label}`; sub = L.spaceHint; subColor = "var(--tx3)"; }

    el.tmTitle.textContent = L.title;
    el.tmReset.textContent = S.resetArm ? L.confirmReset : L.reset; el.tmReset.classList.toggle("arm", S.resetArm);
    el.tmLabel.textContent = label; el.tmTime.textContent = time; el.tmSub.textContent = sub; el.tmSub.style.color = subColor;
    el.tmPin.style.background = color; el.tmPin.style.boxShadow = `0 0 8px ${color}`; el.tmPin.style.opacity = p ? 0.35 : 1;
    el.tmPin.classList.toggle("breathe", over && !p); el.tmTime.classList.toggle("pulse", p);
    drawRuler(value, over, S.mode === "idle" ? prefs.workMin * 60 : S.allot);

    const sig = [S.mode, over, p, prefs.lang].join();
    if (sig !== ctlSig) {
      ctlSig = sig;
      const pill = (act, txt, solid, glow) => `<button class="tm-pill ${solid ? "solid" : ""}" data-act="${act}" ${glow ? `style="box-shadow:0 0 26px ${glow};background:${glow};color:var(--page)"` : ""}>${esc(txt)}</button>`;
      el.tmCtl.innerHTML =
        (S.mode !== "idle" ? `<button class="tm-round ${p ? "on" : ""}" data-act="pause" aria-label="${esc(p ? L.resume : L.pause)}" title="${esc(p ? L.resume : L.pause)} · Space"><svg viewBox="0 0 14 14" fill="currentColor" style="width:14px;height:14px">${p ? '<path d="M3.5 1.8v10.4a.6.6 0 0 0 .9.5l8-5.2a.6.6 0 0 0 0-1L4.4 1.3a.6.6 0 0 0-.9.5z"/>' : '<rect x="2.5" y="1.5" width="3" height="11" rx="1"/><rect x="8.5" y="1.5" width="3" height="11" rx="1"/>'}</svg></button>` : "") +
        (S.mode === "idle" ? pill("start", L.startFocus, true) : S.mode === "work" ? pill("break", L.breakBtn, over, over ? V("brk") : null) : pill("next", L.startFocus, over, over ? V("work") : null));
    }
    el.tmPips.title = L.cycleTip;
    el.tmPips.innerHTML = [0, 1, 2, 3].map(i => `<span class="${i === 3 ? "long" : ""} ${i < S.breakCount % 4 ? "on" : ""}"></span>`).join("");

    const rows = [...S.sessions];
    if (S.mode !== "idle" && S.cur) {
      const r = { ...S.cur };
      if (S.mode === "work") { r.work = Math.min(e, workAllot); r.workOver = Math.max(0, e - workAllot); } else { r.brk = Math.min(e, S.allot); r.brkOver = Math.max(0, e - S.allot); }
      rows.push(r);
    }
    const tot = f => rows.reduce((a, r) => a + f(r), 0);
    el.tmSpent.textContent = L.timeSpent; el.tmDesc.textContent = L.chartDesc;
    el.tmTot.innerHTML = [[L.totFocus, fmtMin(tot(r => r.work + r.workOver)), V("work")], [L.totBreak, fmtMin(tot(r => r.brk + r.brkOver)), V("brk")], [L.totExtra, fmtMin(tot(r => r.extraEarned || 0)), V("extra")]]
      .map(([l, v, c]) => `<div><div class="tm-tv num" style="color:${c}">${v}</div><div class="tm-tl">${esc(l)}</div></div>`).join("");
    drawChart(rows);
    el.tmLeg.innerHTML = [[L.lgFocus, V("work")], [L.lgFocusOT, V("extra")], [L.lgBreak, V("brk")], [L.lgBreakOT, V("over")]].map(([l, c]) => `<span><i style="background:${c}"></i>${esc(l)}</span>`).join("");
    el.tmDevBtn.innerHTML = `${esc(L.developer)} <span style="display:inline-block;transition:transform .35s;transform:${S.devOpen ? "rotate(180deg)" : "none"}">▾</span>`;
    const dsig = [S.devOpen, prefs.lang, prefs.workMin, prefs.brkMin].join();
    if (dsig !== devSig) { devSig = dsig; buildDev(); }
  }
  tick(); setInterval(tick, 250);
  // used by the command line
  return {
    start(minutes) { const keep = prefs.workMin; if (minutes) prefs.workMin = Math.min(180, Math.max(1, minutes)); startWork(); prefs.workMin = keep; tick(); return Math.round(workAllot / 60); },
    pause() { if (S.mode !== "idle" && !paused()) togglePause(); },
    resume() { if (paused()) togglePause(); },
    stop() { Object.assign(S, { pausedAt: null, mode: "idle", startTs: null, allot: prefs.workMin * 60, cur: null }); alerted = overdueAlerted = false; tick(); },
    get running() { return S.mode !== "idle"; },
    get status() { return { mode: S.mode, paused: paused(), elapsed: elapsedNow(), allot: S.allot }; },
    get focusSec() { return S.sessions.reduce((t, x) => t + (x.work || 0), 0) + (S.mode === "work" && S.cur ? S.cur.work || 0 : 0); }
  };
}
