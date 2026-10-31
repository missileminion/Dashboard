// Stickynote: an Obsidian-style live-preview markdown editor (CodeMirror 6, vendored in app/vendor, no CDN at runtime).
// One continuous document you can move through freely; markdown symbols are hidden except on the line you are editing,
// checkboxes are clickable. On your Mac the file on disk (stickynote.md, written through /api/tasks) is kept; with GitHub connected (the same private repo as
// the gym log) the note also syncs there, so your phone and laptop share it with history. A copy is mirrored in the browser as a backup. It is one undated note.
// If both devices changed it, nothing is lost: the other device's text is added below a dividing line.
import { HOSTED } from "./util.js";
import { gh, ghRead, ghWrite, ghMessage } from "./ghstore.js";
import { EditorState } from "/vendor/esm/@codemirror/state.js";
import { EditorView, Decoration, ViewPlugin, WidgetType, keymap, drawSelection, placeholder } from "/vendor/esm/@codemirror/view.js";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "/vendor/esm/@codemirror/commands.js";
import { markdown, markdownKeymap, markdownLanguage } from "/vendor/esm/@codemirror/lang-markdown.js";
import { syntaxTree } from "/vendor/esm/@codemirror/language.js";

const API = "api/tasks", KEY = "stickynote.mirror", GHPATH = "stickynote.md", BASE = "stickynote.base", SHA = "stickynote.sha";
const ls = { get: k => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} } };
const OTHER = "\n\n--- from your other device ---\n";
const TASK = /^(\s*)[-*] \[( |x|X)\] ?(.*)$/;
const emptyTask = l => { const m = l.match(TASK); return m && !m[3].trim(); };

/* ---------- live preview: hide markdown symbols away from the cursor, style the rest ---------- */
class Check extends WidgetType {
  constructor(done) { super(); this.done = done; }
  eq(o) { return o.done === this.done; }
  toDOM(view) {
    const b = document.createElement("span"); b.className = "cm-chk" + (this.done ? " on" : ""); b.setAttribute("role", "checkbox"); b.setAttribute("aria-checked", this.done);
    b.onmousedown = e => {   // tick or untick without moving the cursor
      e.preventDefault(); const pos = view.posAtDOM(b);
      view.dispatch({ changes: { from: pos + 1, to: pos + 2, insert: this.done ? " " : "x" } });
    };
    return b;
  }
  ignoreEvent() { return true; }
}
class Bullet extends WidgetType { eq() { return true; } toDOM() { const s = document.createElement("span"); s.className = "cm-bul"; s.textContent = "•"; return s; } }
class Rule extends WidgetType { eq() { return true; } toDOM() { const s = document.createElement("span"); s.className = "cm-hr"; return s; } }

const HIDE = Decoration.replace({});
function build(view) {
  const { state } = view, out = [], doc = state.doc, sel = state.selection.ranges;
  const lineTouched = pos => { const l = doc.lineAt(pos); return sel.some(r => r.from <= l.to && r.to >= l.from); };
  const touched = (a, b) => sel.some(r => r.from <= b && r.to >= a);
  const hide = (a, b) => { if (b > a) out.push(HIDE.range(a, b)); };
  const lineCls = (pos, cls, attrs) => out.push(Decoration.line({ class: cls, attributes: attrs }).range(doc.lineAt(pos).from));
  syntaxTree(state).iterate({
    enter(n) {
      const name = n.name;
      let m;
      if ((m = name.match(/^ATXHeading(\d)$/))) lineCls(n.from, "cm-h cm-h" + m[1]);
      else if (name === "HeaderMark" && n.node.parent?.name.startsWith("ATXHeading")) { if (!lineTouched(n.from)) hide(n.from, Math.min(doc.lineAt(n.from).to, n.to + 1)); }
      else if (name === "StrongEmphasis") out.push(Decoration.mark({ class: "cm-strong" }).range(n.from, n.to));
      else if (name === "Emphasis") out.push(Decoration.mark({ class: "cm-em" }).range(n.from, n.to));
      else if (name === "Strikethrough") out.push(Decoration.mark({ class: "cm-strike" }).range(n.from, n.to));
      else if (name === "InlineCode") out.push(Decoration.mark({ class: "cm-icode" }).range(n.from, n.to));
      else if (name === "EmphasisMark" || name === "StrikethroughMark" || name === "CodeMark") { const p = n.node.parent; if (p && p.name !== "FencedCode" && !touched(p.from, p.to)) hide(n.from, n.to); }
      else if (name === "Link") { out.push(Decoration.mark({ class: "cm-link" }).range(n.from, n.to)); }
      else if (name === "LinkMark" || name === "URL") { const p = n.node.parent; if (p?.name === "Link" && !touched(p.from, p.to)) hide(n.from, n.to); }
      else if (name === "Blockquote") { for (let p = n.from; p <= n.to; ) { const l = doc.lineAt(p); lineCls(l.from, "cm-quote"); p = l.to + 1; } }
      else if (name === "QuoteMark") { if (!lineTouched(n.from)) hide(n.from, Math.min(doc.lineAt(n.from).to, n.to + (doc.sliceString(n.to, n.to + 1) === " " ? 1 : 0))); }
      else if (name === "HorizontalRule") { if (!lineTouched(n.from)) out.push(Decoration.replace({ widget: new Rule() }).range(n.from, n.to)); }
      else if (name === "ListItem") {
        const line = doc.lineAt(n.from), ind = n.from - line.from, task = /^(\s*)[-*] \[[ xX]\]/.test(line.text);
        const done = /^(\s*)[-*] \[[xX]\]/.test(line.text);
        lineCls(n.from, "cm-li" + (task ? " cm-task" : "") + (done ? " cm-done" : ""), { style: `padding-left:${ind * 9 + 4}px` });
        if (ind && !lineTouched(n.from)) hide(line.from, n.from);
      } else if (name === "ListMark") {
        const line = doc.lineAt(n.from), mark = doc.sliceString(n.from, n.to), isTask = TASK.test(line.text) || /^\s*[-*] \[[ xX]\]/.test(line.text);
        if (/^[-*+]$/.test(mark) && !lineTouched(n.from)) { if (isTask) hide(n.from, n.to + 1); else out.push(Decoration.replace({ widget: new Bullet() }).range(n.from, n.to)); }
      } else if (name === "TaskMarker") out.push(Decoration.replace({ widget: new Check(/[xX]/.test(doc.sliceString(n.from, n.to))) }).range(n.from, n.to));
    },
  });
  return Decoration.set(out, true);
}
const livePreview = ViewPlugin.fromClass(class {
  constructor(v) { this.deco = build(v); }
  update(u) { if (u.docChanged || u.selectionSet || u.viewportChanged || syntaxTree(u.state) !== syntaxTree(u.startState)) this.deco = build(u.view); }
}, { decorations: p => p.deco, provide: pl => EditorView.atomicRanges.of(v => v.plugin(pl)?.deco ?? Decoration.none) });

const toggleTask = view => {   // Cmd/Ctrl+Enter
  const l = view.state.doc.lineAt(view.state.selection.main.head), m = l.text.match(/^(\s*[-*] \[)( |x|X)\]/);
  if (!m) return false;
  view.dispatch({ changes: { from: l.from + m[1].length, to: l.from + m[1].length + 1, insert: m[2] === " " ? "x" : " " } }); return true;
};
const typeCheckbox = EditorView.inputHandler.of((view, from, to, text) => {   // "[] " becomes a task
  if (text !== " ") return false;
  const l = view.state.doc.lineAt(from), m = l.text.slice(0, from - l.from).match(/^(\s*)(?:-\s*)?\[\]$/);
  if (!m) return false;
  view.dispatch({ changes: { from: l.from, to, insert: m[1] + "- [ ] " }, selection: { anchor: l.from + m[1].length + 6 } }); return true;
});
const openLinks = EditorView.domEventHandlers({
  click(e, view) {   // Cmd/Ctrl+click opens a link
    if (!(e.metaKey || e.ctrlKey)) return false;
    const pos = view.posAtCoords({ x: e.clientX, y: e.clientY }); if (pos == null) return false;
    for (let n = syntaxTree(view.state).resolveInner(pos, 1); n; n = n.parent) if (n.name === "Link") {
      const u = n.getChild("URL"); if (u) { open(view.state.sliceDoc(u.from, u.to), "_blank", "noopener"); return true; }
    }
    return false;
  },
});
const theme = EditorView.theme({
  "&": { background: "transparent", color: "var(--tx)", fontSize: "15px" },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": { fontFamily: "var(--sans)", lineHeight: "1.65", overflow: "visible" },
  ".cm-content": { padding: "2px 0 24px", caretColor: "var(--tx)" },
  ".cm-line": { padding: "0 2px" },
  ".cm-cursor": { borderLeftColor: "var(--tx)" },
  ".cm-selectionBackground, &.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground": { background: "var(--rangebg)" },
  ".cm-placeholder": { color: "var(--tx3)" },
});

export function initTasks(root) {
  let view = null, settingDoc = false, dirty = false, inflight = false, again = false, timer = null, lastSaved = null, filePath = "", status = "Loading…", statusBad = false;

  root.innerHTML = `<div class="tk-head"><span class="meta" id="tkCount"></span><div style="flex:1"></div><span class="basis" id="tkStatus"></span></div>
    <div class="tk-area" id="tkArea"></div><div class="basis" id="tkPath" style="margin-top:var(--s2)"></div>`;
  const $$ = id => root.querySelector("#" + id);
  const text = () => view.state.doc.toString();

  function setDoc(t) {
    settingDoc = true;
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: t }, selection: { anchor: t.length } });
    settingDoc = false; paintHead();
  }
  function touch() { dirty = true; try { localStorage.setItem(KEY, text()); } catch {} setStatus("Saving…"); clearTimeout(timer); timer = setTimeout(flush, 500); }
  // ---- GitHub sync of the same note ----
  let ghInflight = false, ghTimer = null, ghAgain = false;
  const stamp = () => new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  function ghQueue() { if (!gh.on) return; clearTimeout(ghTimer); ghTimer = setTimeout(ghPush, 2500); }
  async function ghPush() {
    if (!gh.on) return; if (ghInflight) { ghAgain = true; return; }
    ghInflight = true; let txt = text();
    try {
      let sha = ls.get(SHA) || null;
      for (let tries = 0; tries < 2; tries++) {
        try { sha = await ghWrite(GHPATH, txt, sha, "Update stickynote"); ls.set(SHA, sha); ls.set(BASE, txt); setStatus("Synced to GitHub " + stamp()); break; }
        catch (e) {
          if ((e.status === 409 || e.status === 422) && tries === 0) {   // the file changed on GitHub since we last looked: keep both versions
            const rem = await ghRead(GHPATH); sha = rem?.sha ?? null;
            if (rem && rem.text !== txt && rem.text !== ls.get(BASE)) { txt = txt.replace(/\s+$/, "") + OTHER + rem.text; setDoc(txt); ls.set(KEY, txt); }
          } else throw e;
        }
      }
    } catch (e) { setStatus("Saved in this browser. GitHub: " + ghMessage(e), true); ghTimer = setTimeout(ghPush, 30000); }
    ghInflight = false; if (ghAgain) { ghAgain = false; ghQueue(); }
  }
  // bring in the GitHub copy: used on load and when you come back to the page
  async function ghPull(initial) {
    if (!gh.on) return false;
    const rem = await ghRead(GHPATH); if (!rem) { ghQueue(); return false; }
    const local = initial ? ls.get(KEY) : text(), base = ls.get(BASE);
    ls.set(SHA, rem.sha);
    if (rem.text === local) { ls.set(BASE, rem.text); setStatus("Synced to GitHub " + stamp()); return true; }
    if (!local || local === base) { ls.set(BASE, rem.text); setDoc(rem.text); ls.set(KEY, rem.text); setStatus("Synced to GitHub " + stamp()); return true; }   // only GitHub changed
    if (base === rem.text) { ghQueue(); return true; }                                                                                                             // only this device changed
    const merged = local.replace(/\s+$/, "") + OTHER + rem.text; setDoc(merged); ls.set(KEY, merged); ls.set(BASE, rem.text); dirty = true; flush(); return true;      // both changed
  }
  async function flush(keepalive = false) {
    clearTimeout(timer); if (!dirty) return;
    if (HOSTED) { dirty = false; if (gh.on) { ghQueue(); return setStatus("Saved in this browser. Syncing to GitHub…"); } return setStatus("Saved in this browser only. Connect GitHub in the Gym log tab to sync it across devices."); }
    if (inflight) { again = true; return; }
    inflight = true; dirty = false; const txt = text();
    try {
      const r = await fetch(API, { method: "PUT", body: txt, keepalive: keepalive === true && txt.length < 60000, headers: { "Content-Type": "text/markdown" } });
      if (!r.ok) throw new Error(r.status);
      lastSaved = txt; setStatus("Saved " + new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })); ghQueue();
    } catch { dirty = true; setStatus("Not saved to the file (server unreachable). Kept in this browser.", true); timer = setTimeout(flush, 5000); }
    inflight = false; if (again) { again = false; flush(); }
  }
  function setStatus(s, bad = false) { status = s; statusBad = bad; paintHead(); }
  function paintHead() {
    const tasks = view ? text().split("\n").filter(l => TASK.test(l) && !emptyTask(l)) : [], done = tasks.filter(l => /\[[xX]\]/.test(l)).length;
    $$("tkCount").textContent = tasks.length ? `${done} of ${tasks.length} done` : "";
    const st = $$("tkStatus"); st.textContent = status; st.className = "basis" + (statusBad ? " worse" : "");
    $$("tkPath").textContent = filePath ? `Stored in ${filePath.replace(/^\/Users\/[^/]+/, "~")}` : "";
  }

  view = new EditorView({
    parent: $$("tkArea"),
    state: EditorState.create({
      doc: "",
      extensions: [
        history(), drawSelection(), EditorView.lineWrapping, markdown({ base: markdownLanguage }), livePreview, typeCheckbox, openLinks, theme,
        placeholder("Jot anything. Start a line with [] to make a checkbox."),
        keymap.of([{ key: "Mod-Enter", run: toggleTask }, ...markdownKeymap, indentWithTab, ...historyKeymap, ...defaultKeymap]),
        EditorView.updateListener.of(u => { if (u.docChanged && !settingDoc) touch(); if (u.docChanged) paintHead(); }),
      ],
    }),
  });
  root.addEventListener("click", e => { if (e.target === $$("tkArea")) view.focus(); });

  document.addEventListener("visibilitychange", async () => {
    if (document.hidden) { flush(true); if (gh.on) { clearTimeout(ghTimer); ghPush(); } return; }
    if (dirty || inflight || view.hasFocus) return;
    if (gh.on) { try { await ghPull(false); } catch (e) { setStatus("Saved in this browser. GitHub: " + ghMessage(e), true); } if (HOSTED) return; }   // pick up edits made in another app (Obsidian, a text editor) when you come back
    try { const r = await fetch(API); if (r.ok) { const t = await r.text(); if (t !== lastSaved && !dirty) { lastSaved = t; setDoc(t); } } } catch {}
  });
  addEventListener("pagehide", () => flush(true));

  (async () => {
    let txt = null, mirror = null;
    try { mirror = localStorage.getItem(KEY); } catch {}
    if (HOSTED) {
      if (mirror) setDoc(mirror);
      if (!gh.on) return setStatus("Saved in this browser only. Connect GitHub in the Gym log tab to sync it across devices.");
      try { await ghPull(true); } catch (e) { setStatus("Saved in this browser. GitHub: " + ghMessage(e), true); }
      return;
    }
    try {
      const r = await fetch(API); filePath = r.headers.get("X-Path") || "";
      if (r.ok) { txt = await r.text(); lastSaved = txt; setStatus("Loaded"); }
      else if (r.status === 404) setStatus(mirror ? "Creating the file…" : "New file");
      else throw new Error(r.status);
    } catch { setStatus("Server unreachable: using the copy kept in this browser.", true); }
    const src = txt ?? mirror;
    if (src) setDoc(src);
    if (txt == null && mirror) { dirty = true; flush(); }
  })();
  // used by the command line: add a line to the note, or take that same line back out
  return {
    append(line) { const doc = view.state.doc.toString(), pre = doc.length && !doc.endsWith("\n") ? "\n" : ""; view.dispatch({ changes: { from: doc.length, insert: pre + line + "\n" } }); return line; },
    text() { return view.state.doc.toString(); },
    set(t) { view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: t } }); },
    removeLine(line) { const doc = view.state.doc.toString(), at = doc.lastIndexOf(line + "\n"); if (at >= 0) view.dispatch({ changes: { from: at, to: at + line.length + 1 } }); }
  };
}