// The Console: an all-black terminal where you ask about your sleep, training and schedule and the answer is typed out line by line.
// The questions go to Claude through your own Apps Script (the same link and secret as the Calendar tab); the script holds the API key, so it never reaches a browser.
// Only the numbers the console needs (a compact summary of your recent days, your plan and your calendar) are sent, and only when you ask. Type /context to see them.
import { esc } from "./util.js";

const CFG = "cal.cfg";
const cfg = () => { try { return JSON.parse(localStorage.getItem(CFG)); } catch { return null; } };
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

export function initTerminal(root, { demo = false } = {}) {
  root.innerHTML = `<div class="tm" id="tm"><div class="tm-log" id="tmLog"></div><div class="tm-line tm-live" id="tmLive"><span class="tm-p">›</span><span id="tmEcho"></span><i class="tm-cur"></i></div></div>
    <input id="tmIn" class="tm-in" type="text" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" aria-label="Ask the console">`;
  const $ = id => root.querySelector("#" + id), log = $("tmLog"), live = $("tmLive"), echo = $("tmEcho"), inp = $("tmIn"), scr = $("tm");
  let busy = false, booted = false, history = [], past = [], pi = -1, skip = false;
  const bottom = () => { scr.scrollTop = scr.scrollHeight; };
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  // type text into a new line, character by character (long answers speed up so they never take more than a few seconds)
  async function say(text, cls = "") {
    const line = document.createElement("div"); line.className = "tm-line " + cls; log.appendChild(line);
    const cur = document.createElement("i"); cur.className = "tm-cur"; skip = false;
    if (reduce) { line.textContent = text; bottom(); return; }
    line.appendChild(cur); const node = document.createTextNode(""); line.insertBefore(node, cur);
    const per = Math.max(1, Math.round(text.length / 360)), delay = text.length > 160 ? 12 : 22;   // about 6 seconds at most for a long reply
    for (let i = 0; i < text.length; i += per) { if (skip) { node.nodeValue = text; break; } node.nodeValue = text.slice(0, i + per); bottom(); await sleep(/[.,;:]\s?$/.test(node.nodeValue) ? delay + 40 : delay); }
    node.nodeValue = text; cur.remove(); bottom();
  }
  const sayLines = async (lines, cls) => { for (const l of lines) await say(l, cls); };

  function context() { try { return window.__dashContext ? window.__dashContext() : null; } catch (e) { return { error: String(e.message || e) }; } }
  async function ask(question) {
    const ctx = context();
    if (demo) { await sleep(900); return demoAnswer(question, ctx); }
    const c = cfg(); if (!c || !c.url) throw new Error("Not connected. Open the Calendar tab and connect your Apps Script first; the console uses the same link.");
    const r = await fetch(c.url, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify({ secret: c.secret, action: "ask", question, context: ctx, history: history.slice(-8) }) });
    const j = await r.json();
    if (j.error === "unknown action") throw new Error("Your Apps Script is out of date. Paste the newest Code.gs and deploy a new version (Deploy, Manage deployments, Edit, New version).");
    if (j.error === "no key") throw new Error("The script has no API key yet. In Apps Script open Project Settings, Script properties, and add ANTHROPIC_KEY.");
    if (j.error === "unauthorized") throw new Error("The secret does not match the one in your script.");
    if (j.error) throw new Error(j.error);
    return j.text;
  }
  // with no model behind it (the demo), answer from the numbers alone so the typing and layout can be tried
  function demoAnswer(q, ctx) {
    const l = ctx?.lastNight, p = ctx?.plan;
    return [`DEMO MODE: no model is connected here, so this is a plain summary of the numbers.`, l ? `Last night: ${l.sleep}, asleep by ${l.asleepBy}, quality ${l.quality}.` : "No sleep recorded yet.", ctx?.sleepDebt != null ? `Sleep debt: ${ctx.sleepDebt}.` : "", p ? `Today's plan: ${p.today}. Tomorrow: ${p.tomorrow}.` : "", `You asked: "${q}".`].filter(Boolean).join("\n");
  }

  async function run(q) {
    q = q.trim(); if (!q) return;
    past.unshift(q); pi = -1;
    const echoLine = document.createElement("div"); echoLine.className = "tm-line tm-q"; echoLine.innerHTML = `<span class="tm-p">›</span> ${esc(q)}`; log.appendChild(echoLine); bottom();
    if (q === "/clear") { log.innerHTML = ""; history = []; return; }
    if (q === "/help") { await sayLines(["/help      this list", "/clear     clear the screen", "/context   show the numbers that are sent with a question", "esc        skip the typing", "", "Try: how was my week?   when can I run tomorrow?   am I recovering?"], "tm-dim"); return; }
    if (q === "/context") { await say(JSON.stringify(context(), null, 1).replace(/[{}"]/g, "").replace(/,$/gm, ""), "tm-dim"); return; }
    busy = true; live.hidden = true;
    const wait = document.createElement("div"); wait.className = "tm-line tm-dim tm-wait"; wait.innerHTML = `<span></span><span></span><span></span>`; log.appendChild(wait); bottom();
    try {
      const text = await ask(q); wait.remove(); history.push({ role: "user", content: q }, { role: "assistant", content: text });
      await say(text);
    } catch (err) { wait.remove(); await say(String(err.message || err), "tm-err"); }
    busy = false; live.hidden = false; inp.focus(); bottom();
  }

  async function boot() {
    if (booted) return; booted = true;
    const c = cfg(), ok = demo || (c && c.url);
    await sayLines(["CLAUDE // DASHBOARD CONSOLE", "─────────────────────────────"], "tm-head");
    await say(`calendar link ......... ${ok ? "ok" : "not connected"}`, ok ? "" : "tm-err");
    await say(`model ................ ${demo ? "none (demo)" : ok ? "claude, through your Apps Script" : "not connected"}`, ok ? "" : "tm-err");
    await say("");
    await say("Ask about your sleep, training, schedule or week. Type /help for commands.", "tm-dim");
    await say("");
  }

  inp.addEventListener("input", () => { echo.textContent = inp.value; bottom(); });
  inp.addEventListener("keydown", e => {
    if (e.key === "Enter" && !busy) { const q = inp.value; inp.value = ""; echo.textContent = ""; run(q); }
    else if (e.key === "Escape") skip = true;
    else if (e.key === "ArrowUp" && past.length) { e.preventDefault(); pi = Math.min(past.length - 1, pi + 1); inp.value = past[pi]; echo.textContent = inp.value; }
    else if (e.key === "ArrowDown") { e.preventDefault(); pi = Math.max(-1, pi - 1); inp.value = pi < 0 ? "" : past[pi]; echo.textContent = inp.value; }
  });
  root.addEventListener("click", () => { if (!getSelection().toString()) inp.focus(); });
  addEventListener("tab", e => { if (e.detail === "console") { setTimeout(() => { boot(); inp.focus(); }, 450); } });
  if (document.body.dataset.tab === "console") { boot(); setTimeout(() => inp.focus(), 500); }
}
