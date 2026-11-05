// Paper Notes: the Notes tab on its own page, set for e-ink (Onyx Boox). The editor, storage and sync are exactly the ones in notes.js;
// this file only forces the light theme, hides what a one-purpose page does not need, and adds the controls an e-ink screen wants:
// page up / page down buttons (swiping smears on e-ink), a text size setting, and a "clear screen" flash to wipe ghosting.
import { initNotes } from "./notes.js";
const ls = { get: k => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch {} } };
ls.set("notes.theme", "light");
initNotes(document.getElementById("notesRoot"));

const FS = "paper.fs", MIN = 18, MAX = 40;
let size = Math.min(MAX, Math.max(MIN, +ls.get(FS) || 24));
const setSize = n => { size = Math.min(MAX, Math.max(MIN, n)); document.body.style.setProperty("--pp-fs", size + "px"); ls.set(FS, String(size)); };
setSize(size);

const ico = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="square" stroke-linejoin="miter" aria-hidden="true">${d}</svg>`;
const ctl = document.getElementById("ppCtl");
ctl.innerHTML = [
  ["up", ico('<path d="M5 15l7-7 7 7"/>'), "Page up"],
  ["dn", ico('<path d="M5 9l7 7 7-7"/>'), "Page down"],
  ["lg", "<b>A+</b>", "Larger text"],
  ["sm", "<b>A−</b>", "Smaller text"],
  ["fx", ico('<path d="M20 12a8 8 0 1 1-2.6-5.9"/><path d="M20 4v5h-5"/>'), "Clear screen"],
].map(([k, h, t]) => `<button type="button" data-k="${k}" aria-label="${t}">${h}<small>${t.split(" ")[0]}</small></button>`).join("");

const scroller = () => document.querySelector(".nt-scroll"), list = () => document.querySelector(".nt-list");
const page = dir => {   // jump by almost one screen, instantly: no smooth scrolling, so the screen refreshes once
  const side = document.querySelector(".nt-side"), useList = side && side.offsetParent && !document.querySelector(".nt-main").offsetParent ? true : false;
  const el = useList ? list() : scroller(); if (el) el.scrollTop += dir * Math.round(el.clientHeight * 0.9);
  if (++turns >= 12) { turns = 0; flash(); }
}; let turns = 0;
const flash = () => {   // black, then white, then back: the usual way to clear ghosting on an e-ink panel
  const f = document.getElementById("ppFlash"); f.className = "k"; f.hidden = false;
  setTimeout(() => { f.className = "w"; setTimeout(() => { f.hidden = true; }, 160); }, 160);
};
ctl.addEventListener("click", e => {
  const b = e.target.closest("button"); if (!b) return; const k = b.dataset.k;
  if (k === "up") page(-1); else if (k === "dn") page(1); else if (k === "lg") setSize(size + 2); else if (k === "sm") setSize(size - 2); else if (k === "fx") flash();
});
addEventListener("keydown", e => { const t = e.target; if (t && (t.isContentEditable || /^(INPUT|TEXTAREA)$/.test(t.tagName))) return; if (e.key === "PageDown") { page(1); e.preventDefault(); } else if (e.key === "PageUp") { page(-1); e.preventDefault(); } });
