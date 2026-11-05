// The Reader: the Notes page as a quiet printed reader for e-ink (Onyx Boox). Same notes.js, same repo, same sync; this file turns it into a reader:
// no typing or editing (you can select text and highlight it), a masthead and byline, paged reading, text size, a clear-screen flash,
// and every picture redrawn as halftone dots like newsprint.
import { initNotes } from "./notes.js";
const ls = { get: k => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch {} } };
ls.set("notes.theme", "light");
const $ = s => document.querySelector(s);
initNotes($("#notesRoot"));
const brand = $(".nt-brand"); if (brand) brand.textContent = "The Reader";

/* ----- read only: keep the editor live (so selecting and highlighting work) but refuse every edit ----- */
const inEd = e => e.target && e.target.closest && e.target.closest(".nt-ed");
for (const t of ["beforeinput", "paste", "cut", "drop", "dragstart", "compositionstart"]) document.addEventListener(t, e => { if (inEd(e)) { e.preventDefault(); e.stopPropagation(); } }, true);
document.addEventListener("keydown", e => {
  if (!inEd(e)) return; const mod = e.ctrlKey || e.metaKey;
  if (e.key.length === 1 && !mod) { e.preventDefault(); e.stopPropagation(); }
  else if (["Enter", "Backspace", "Delete", "Tab"].includes(e.key) || (mod && ["z", "y", "x", "v", "b", "i", "u"].includes(e.key.toLowerCase()))) { e.preventDefault(); e.stopPropagation(); }
}, true);
const noKeys = () => document.querySelectorAll(".nt-ed .ProseMirror").forEach(p => { p.setAttribute("inputmode", "none"); p.setAttribute("autocapitalize", "off"); p.setAttribute("spellcheck", "false"); });
new MutationObserver(noKeys).observe($(".nt-ed"), { childList: true, subtree: true }); noKeys();

/* ----- the kicker over the headline and the byline under it ----- */
const page = $(".nt-page"), title = $(".nt-title");
const kick = document.createElement("div"); kick.className = "pp-kick"; const by = document.createElement("div"); by.className = "pp-by";
page.insertBefore(kick, title); title.after(by);
let lastMeta = "";
const meta = () => {   // only touch the page when the text really changes, or the observer below would feed on its own edits
  const on = $(".nt-item.on"), path = on ? on.dataset.path || "" : "", dir = path.includes("/") ? path.split("/").slice(-2, -1)[0] : "Notes";
  const rt = ($(".nt-rt") || {}).textContent || "", has = !!on && !$(".nt-ed").closest(".blank");
  const words = ($(".nt-ed .ProseMirror") || { textContent: "" }).textContent.trim().split(/\s+/).filter(Boolean).length;
  const key = [has, dir, rt, words].join("|"); if (key === lastMeta) return; lastMeta = key;
  kick.textContent = has ? dir : ""; kick.hidden = !has; by.hidden = !has;
  by.innerHTML = has ? `<span>${words.toLocaleString("en-GB")} words</span><span>${rt ? rt.replace(/\s*min$/i, " min read") : ""}</span>` : "";
};
new MutationObserver(meta).observe($("#notesRoot"), { subtree: true, childList: true, attributes: true, attributeFilter: ["class"], characterData: true }); meta();

/* ----- the foot: previous, text size, page x of y, clear screen, next ----- */
const FS = "paper.pt", MIN = 9, MAX = 22;   // the text size in points: 12 pt is the standard
let size = Math.min(MAX, Math.max(MIN, +ls.get(FS) || 12));
const setSize = n => { size = Math.min(MAX, Math.max(MIN, n)); document.body.style.setProperty("--pp-fs", size + "pt"); ls.set(FS, String(size)); status(); };
const foot = document.createElement("div"); foot.className = "pp-foot";
foot.innerHTML = `<button type="button" data-k="up" aria-label="Previous page">&#8592; Previous</button><div class="pp-pg"><button type="button" data-k="sm" aria-label="Smaller text">A&#8722;</button><button type="button" data-k="lg" aria-label="Larger text">A+</button><span class="pp-n"></span><button type="button" data-k="hl" class="pp-hl" aria-label="Highlight mode">Highlight</button><button type="button" data-k="fx" aria-label="Clear the screen">Clear</button><button type="button" data-k="rf" aria-label="Refresh notes">Refresh</button></div><button type="button" data-k="dn" aria-label="Next page">Next &#8594;</button>`;
$(".nt-main").appendChild(foot);
const scroller = () => $(".nt-scroll"), lineH = () => { const p = $(".nt-ed .ProseMirror"); return p ? parseFloat(getComputedStyle(p).lineHeight) || size * 1.333 * 1.55 : size * 1.333 * 1.55; };
const stepPx = el => Math.max(lineH(), Math.floor((el.clientHeight * 0.92) / lineH()) * lineH());
const status = () => { const el = scroller(), n = foot.querySelector(".pp-n"); if (!el) return; const real = Math.max(1, el.scrollHeight - (el.clientHeight * 0.46)), st = stepPx(el), pages = Math.max(1, Math.ceil(real / st)), at = Math.min(pages, Math.round(el.scrollTop / st) + 1); n.textContent = `Page ${at} of ${pages}`; };
let turns = 0;
const flash = () => {   // black, then white, then the page again; each step lasts long enough for an e-ink panel to draw it
  const f = $("#ppFlash"); clearTimeout(flash.t1); clearTimeout(flash.t2); f.className = "k"; f.hidden = false; void f.offsetHeight;
  flash.t1 = setTimeout(() => { f.className = "w"; flash.t2 = setTimeout(() => { f.hidden = true; }, 550); }, 700);
};
const refresh = () => { flash(); setTimeout(() => location.reload(), 1300); };   // clear the screen, then fetch the latest notes (unsaved highlights are saved as the page closes)
const turn = dir => { const el = scroller(); if (!el) return; el.scrollTop += dir * stepPx(el); status(); if (++turns >= 10) { turns = 0; flash(); } };
foot.addEventListener("click", e => { const b = e.target.closest("button"); if (!b) return; const k = b.dataset.k; if (k === "up") turn(-1); else if (k === "dn") turn(1); else if (k === "lg") setSize(size + 1); else if (k === "sm") setSize(size - 1); else if (k === "fx") flash(); else if (k === "rf") refresh(); else if (k === "hl") setHl(!hlOn); });
addEventListener("keydown", e => { const t = e.target; if (t && /^(INPUT|TEXTAREA)$/.test(t.tagName)) return; if (e.key === "PageDown" || (e.key === " " && !e.shiftKey)) { turn(1); e.preventDefault(); } else if (e.key === "PageUp" || (e.key === " " && e.shiftKey)) { turn(-1); e.preventDefault(); } });
const sc = scroller(); sc.addEventListener("scroll", status, { passive: true }); addEventListener("resize", status);
new ResizeObserver(status).observe(page); setSize(size);

/* ----- halftone: every picture is redrawn as a 45 degree screen of black dots ----- */
const CELL = 4.6;   // device pixels between dots: about 75 lines an inch on a 300 ppi screen, like a newspaper
function dots(img) {
  const st = img.__ht || (img.__ht = {}); if (!img.src || img.src === st.out || st.busy) return;
  st.busy = true; const orig = img.src, o = new Image();
  o.onload = () => setTimeout(() => {
    try {
      const dpr = window.devicePixelRatio || 1, cw = Math.max(200, Math.min(img.parentElement ? img.parentElement.clientWidth : 640, 640)), W = Math.round(Math.min(cw * dpr, o.naturalWidth)), H = Math.round(W * o.naturalHeight / o.naturalWidth);
      const c1 = document.createElement("canvas"); c1.width = W; c1.height = H; const x1 = c1.getContext("2d", { willReadFrequently: true }); x1.fillStyle = "#fff"; x1.fillRect(0, 0, W, H); if ("filter" in x1) x1.filter = "blur(1.2px)"; x1.drawImage(o, 0, 0, W, H);
      const px = x1.getImageData(0, 0, W, H).data, out = document.createElement("canvas"); out.width = W; out.height = H; const x2 = out.getContext("2d"); x2.fillStyle = "#fff"; x2.fillRect(0, 0, W, H); x2.fillStyle = "#000";
      const th = Math.PI / 4, ct = Math.cos(th), sn = Math.sin(th), R = Math.ceil(Math.hypot(W, H) / CELL) + 2, cx = W / 2, cy = H / 2; x2.beginPath();
      for (let i = -R; i < R; i++) for (let j = -R; j < R; j++) {
        const u = i * CELL, v = j * CELL, x = cx + u * ct - v * sn, y = cy + u * sn + v * ct; if (x < 0 || y < 0 || x >= W || y >= H) continue;
        const k = (Math.floor(y) * W + Math.floor(x)) * 4, lum = (px[k] * .299 + px[k + 1] * .587 + px[k + 2] * .114) / 255, dark = 1 - Math.pow(lum, .62), r = CELL * .5 * Math.sqrt(dark) * 1.08;
        if (r > .3) { x2.moveTo(x + r, y); x2.arc(x, y, r, 0, 6.2832); }
      }
      x2.fill(); st.out = out.toDataURL("image/png"); st.orig = orig; img.src = st.out;
    } catch { st.out = orig; }
    st.busy = false;
  }, 30);
  o.onerror = () => { st.out = orig; st.busy = false; }; o.src = orig;
}
const scan = () => document.querySelectorAll(".nt-ed .ProseMirror img").forEach(i => { if (i.closest(".katex")) return; if (i.complete && i.naturalWidth) dots(i); else i.addEventListener("load", () => dots(i), { once: true }); });
const dup = () => { const h = $(".nt-ed .ProseMirror > h1:first-child"), same = !!h && h.textContent.trim().toLowerCase() === title.value.trim().toLowerCase() && !!title.value.trim(); if (page.dataset.dup !== (same ? "1" : "0")) page.dataset.dup = same ? "1" : "0"; };
new MutationObserver(() => { scan(); dup(); }).observe($(".nt-ed"), { childList: true, subtree: true, attributes: true, attributeFilter: ["src"] }); scan(); dup(); title.addEventListener("input", dup); new MutationObserver(dup).observe($(".nt-bt"), { childList: true, characterData: true, subtree: true });

/* ----- collapsible library, and "last synced" in military time ----- */
const nt = $(".nt"), tabs = $(".nt-tabs"), K_SIDE = "paper.side";
const sideBtn = document.createElement("button"); sideBtn.type = "button"; sideBtn.className = "pp-side";
const setSide = hide => { nt.classList.toggle("nofiles", hide); sideBtn.textContent = hide ? "Show library" : "Hide library"; ls.set(K_SIDE, hide ? "1" : "0"); };
sideBtn.addEventListener("click", () => setSide(!nt.classList.contains("nofiles"))); tabs.insertBefore(sideBtn, tabs.querySelector(".nt-status")); setSide(ls.get(K_SIDE) === "1");
const sync = document.createElement("span"); sync.className = "pp-sync"; tabs.insertBefore(sync, tabs.querySelector(".nt-status")); const sd = $(".nt-sd"), msg = $(".nt-msg");
const hhmm = d => String(d.getHours()).padStart(2, "0") + String(d.getMinutes()).padStart(2, "0");
let lastSync = ls.get("paper.sync") || "";
const stamp = () => { lastSync = hhmm(new Date()); ls.set("paper.sync", lastSync); showSync(); };
const showSync = () => { const local = (($(".nt-repo") || {}).textContent || "").trim() === "Local notes", s = sd && sd.dataset.s; sync.textContent = local ? "Not synced, local notes" : s === "dirty" ? "Saving" : lastSync ? "Last synced: " + lastSync : ""; };
if (sd) new MutationObserver(() => { if (sd.dataset.s === "saved") stamp(); else showSync(); }).observe(sd, { attributes: true, attributeFilter: ["data-s"] });
let first = true; new MutationObserver(() => { if (first && $(".nt-item")) { first = false; stamp(); } }).observe($(".nt-list"), { childList: true });
showSync(); if ($(".nt-item") && first) { first = false; stamp(); }

/* ----- highlighting on a touch screen -----
   A long press starts the phone's own Copy / Paste bar and cancels the pointer, so the little highlight button never settles. So there is a Highlight mode (on by default):
   select text however you like, and a moment after you stop moving the handles it is highlighted. Select highlighted text again to take the highlight off. */
const K_HL = "paper.hl"; let hlOn = ls.get(K_HL) !== "0", hlT = 0; const hlBtn = foot.querySelector(".pp-hl");
const setHl = on => { hlOn = on; ls.set(K_HL, on ? "1" : "0"); hlBtn.classList.toggle("on", on); if (!on) clearTimeout(hlT); }; setHl(hlOn);
const applyHl = () => {
  const sl = getSelection(), pm = $(".nt-ed .ProseMirror"); if (!hlOn || !pm || !sl.rangeCount || sl.isCollapsed || !pm.contains(sl.anchorNode) || !pm.contains(sl.focusNode)) return;
  const b = $(".nt-sel [data-st=hl]"); if (b) { b.click(); setTimeout(() => { try { getSelection().collapseToEnd(); } catch {} }, 60); }
};
document.addEventListener("selectionchange", () => { clearTimeout(hlT); if (hlOn) hlT = setTimeout(applyHl, 900); });
// a long press cancels the pointer; tell notes.js the touch is over so its own highlight button (used when Highlight mode is off) can appear
for (const t of ["pointercancel", "touchend"]) document.addEventListener(t, () => setTimeout(() => document.dispatchEvent(new PointerEvent("pointerup")), 0), true);
