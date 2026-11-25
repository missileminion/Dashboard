// Notes on the phone: the same notes as the web Notes tab (markdown files in your notes repo, or this device only without a token),
// the same editor (Milkdown Crepe), the same draft keys. A folder list that opens instantly from a cached copy, search by name,
// and a full-screen editor that saves by itself. Trash works like the web: a note moves to _trash/.
import { syncwarn, EXPIRY_HEADER } from "./syncwarn.js";

const ESM = "https://esm.sh/@milkdown/", CREPE = ESM + "crepe@7.23.0", CSS = [ESM + "crepe@7.23.0/lib/theme/common/style.css", "https://esm.sh/katex@0.16.11/dist/katex.min.css"];
const K_REPO = "notes.repo", K_TOKEN = "notes.token", K_LOCAL = "notes.local", DEFAULT_REPO = "missileminion/Notes", TRASH = "_trash", FILES = "_files", KEEP = ".gitkeep", TREE = "lite.notes.tree";
const ls = { get: k => { try { return localStorage.getItem(k) || ""; } catch { return ""; } }, set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} } };
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const b64 = s => btoa(unescape(encodeURIComponent(s))), unb64 = s => decodeURIComponent(escape(atob(s.replace(/\n/g, ""))));
const encPath = p => p.split("/").map(encodeURIComponent).join("/"), baseName = p => p.split("/").pop().replace(/\.(md|html)$/i, ""), dirOf = p => (p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "");
const draftKey = p => "notes.draft:" + p;
export const notesCfg = { get repo() { return ls.get(K_REPO) || DEFAULT_REPO; }, get token() { return ls.get(K_TOKEN); }, get remote() { return !!ls.get(K_TOKEN); } };
const err = (status, msg) => Object.assign(new Error(msg || "HTTP " + status), { status });

const remote = {
  async call(p, o = {}) {
    const r = await fetch(`https://api.github.com/repos/${notesCfg.repo}${p ? "/" + p : ""}`, { cache: "no-store", ...o, headers: { Authorization: `Bearer ${notesCfg.token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", ...(o.headers || {}) } }).catch(() => { throw err(0, "offline"); });
    syncwarn.seen("notes", "Notes", "notes", r.status, r.headers.get(EXPIRY_HEADER)); return r;
  },
  async list() { const r = await this.call("git/trees/HEAD?recursive=1"); if (r.status === 409) return []; if (!r.ok) throw err(r.status); return (await r.json()).tree.filter(t => t.type === "blob").map(t => t.path); },
  async read(path) { const r = await this.call(`contents/${encPath(path)}`); if (r.status === 404) return null; if (!r.ok) throw err(r.status); const j = await r.json(); return { text: j.content ? unb64(j.content) : "", sha: j.sha }; },
  async write(path, text, sha, message) { const r = await this.call(`contents/${encPath(path)}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message, content: b64(text), ...(sha ? { sha } : {}) }) }); if (!r.ok) throw err(r.status); return (await r.json()).content.sha; },
  async remove(path, sha, message) { const r = await this.call(`contents/${encPath(path)}`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message, sha }) }); if (!r.ok && r.status !== 404) throw err(r.status); },
};
const local = {
  all() { try { return JSON.parse(ls.get(K_LOCAL)) || {}; } catch { return {}; } }, save(o) { ls.set(K_LOCAL, JSON.stringify(o)); },
  async list() { return Object.keys(this.all()); }, async read(p) { const o = this.all(); return p in o ? { text: o[p], sha: null } : null; },
  async write(p, t) { const o = this.all(); o[p] = t; this.save(o); return null; }, async remove(p) { const o = this.all(); delete o[p]; this.save(o); },
};
const DEMO_NOTES = { "Welcome.md": "# Welcome\n\nThis is the demo. Notes live in your notes repo once it is connected.\n", "Thermo/Entropy.md": "# Entropy\n\n$dS \\ge \\frac{\\delta Q}{T}$\n", "Thermo/Cycles.md": "# Cycles\n\n- Carnot\n- Rankine\n- Brayton\n", "Ideas.md": "# Ideas\n\n- [ ] Bike rack bracket\n" };

export function initNotes(root, { demo = false, toast = () => {} } = {}) {
  const store = () => (demo ? demoStore : notesCfg.remote ? remote : local);
  const demoStore = { async list() { return Object.keys(DEMO_NOTES); }, async read(p) { return p in DEMO_NOTES ? { text: DEMO_NOTES[p], sha: null } : null; }, async write(p, t) { DEMO_NOTES[p] = t; return null; }, async remove(p) { delete DEMO_NOTES[p]; } };
  let files = [], dir = "", q = "", recent = {}, cur = null, timer = 0, saving = false, crepe = null, engineP = null, status = "";
  try { files = JSON.parse(ls.get(TREE) || "[]"); recent = JSON.parse(ls.get("notes.recent") || "{}"); } catch {}
  if (demo) files = Object.keys(DEMO_NOTES);
  const isNote = p => /\.md$/i.test(p) && !p.startsWith(TRASH + "/") && !p.startsWith(FILES + "/") && !p.startsWith(".");
  const touch = p => { recent[p] = Date.now(); ls.set("notes.recent", JSON.stringify(recent)); };

  // ---- the list ----
  const ICON_DIR = `<svg class="ic" viewBox="0 0 24 24"><path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/></svg>`;
  const ICON_DOC = `<svg class="ic" viewBox="0 0 24 24"><path d="M6.5 3.5h8l4 4v13h-12z"/><path d="M14 3.5v4.5h4.5"/></svg>`;
  function render() {
    const notes = files.filter(isNote), here = dir ? dir + "/" : "";
    const dirs = [...new Set([...notes, ...files.filter(p => p.endsWith("/" + KEEP) && !p.startsWith(TRASH + "/"))].map(p => p.startsWith(here) ? p.slice(here.length) : null).filter(r => r && r.includes("/")).map(r => r.split("/")[0]))].sort((a, b) => a.localeCompare(b));
    let rows = "";
    if (q) {
      const hits = notes.filter(p => p.toLowerCase().includes(q)).sort((a, b) => (recent[b] || 0) - (recent[a] || 0) || a.localeCompare(b)).slice(0, 60);
      rows = hits.length ? `<div class="list">${hits.map(p => noteRow(p, dirOf(p))).join("")}</div>` : `<div class="card"><div class="empty">No note named like that.</div></div>`;
    } else {
      const rec = !dir ? notes.filter(p => recent[p]).sort((a, b) => recent[b] - recent[a]).slice(0, 4) : [];
      const inDir = notes.filter(p => dirOf(p) === dir).sort((a, b) => baseName(a).localeCompare(baseName(b)));
      rows = (rec.length ? `<div class="kick sec">Recent</div><div class="list">${rec.map(p => noteRow(p, dirOf(p))).join("")}</div><div class="kick sec">${notesCfg.remote || demo ? "All notes" : "On this phone"}</div>` : "") +
        (dirs.length || inDir.length ? `<div class="list">${dirs.map(d => `<button class="row nrow" type="button" data-dir="${esc(here + d)}">${ICON_DIR}<span class="k">${esc(d)}</span><span class="chev">›</span></button>`).join("")}${inDir.map(p => noteRow(p)).join("")}</div>` : `<div class="card"><div class="empty">${dir ? "This folder is empty." : "No notes yet. Tap + to write one."}</div></div>`);
    }
    const crumbs = dir ? `<div class="crumbs"><button type="button" data-dir="">Notes</button>${dir.split("/").map((s, i, a) => ` / <button type="button" data-dir="${esc(a.slice(0, i + 1).join("/"))}">${esc(s)}</button>`).join("")}</div>` : "";
    root.innerHTML = `<input class="search" id="nQ" type="search" placeholder="Search notes" value="${esc(q)}" autocomplete="off" spellcheck="false">${crumbs}<div id="nRows">${rows}</div>
      ${!notesCfg.remote && !demo ? `<button class="row card tap" type="button" data-connect style="margin-top:12px"><span class="k"><b>Notes are only on this phone</b></span><span class="chev">›</span></button>` : ""}
      <div class="sub" style="text-align:center;margin-top:10px">${esc(status)}</div><button class="fab" type="button" id="nNew" aria-label="New note">+</button>`;
  }
  const noteRow = (p, sub) => `<button class="row nrow" type="button" data-open="${esc(p)}">${ICON_DOC}<span class="k">${esc(baseName(p))}${sub ? `<small>${esc(sub)}</small>` : ""}</span></button>`;
  async function refresh() {
    try { files = await store().list(); if (!demo) ls.set(TREE, JSON.stringify(files)); status = ""; }
    catch (e) { status = e.status === 401 ? "Notes token not accepted" : e.status === 404 ? "Notes repo not found" : e.status === 0 ? "Offline: showing the last list" : "Could not load notes"; }
    if (!cur) render();
  }

  // ---- the editor ----
  async function engine() {
    if (!engineP) engineP = (async () => { for (const h of CSS) { const l = document.createElement("link"); l.rel = "stylesheet"; l.href = h; document.head.appendChild(l); } return import(CREPE); })();
    return engineP;
  }
  function setSt(t) { const el = document.getElementById("eSt"); if (el) el.textContent = t; }
  async function open(path, { fresh = false } = {}) {
    const ed = document.createElement("div"); ed.className = "nedit";
    ed.innerHTML = `<div class="ebar"><button class="back" type="button" id="eBack" aria-label="Back">‹</button><input class="ttl" id="eTtl" value="${esc(baseName(path))}" aria-label="Title" spellcheck="false"><span class="st" id="eSt">opening…</span><button class="back" type="button" id="eDel" aria-label="Move to trash" style="font-size:18px">⌫</button></div><div class="ebody" id="eBody"></div>`;
    document.body.appendChild(ed); document.body.style.overflow = "hidden";
    cur = { path, ed, sha: null, base: "", md: "" }; touch(path);
    let f = null; try { f = await store().read(path); } catch (e) { setSt(e.status === 0 ? "offline" : "could not open"); }
    let draft = null; try { draft = JSON.parse(ls.get(draftKey(path)) || "null"); } catch {}
    const text = f ? f.text : draft ? draft.base : "";
    Object.assign(cur, { sha: f?.sha ?? null, base: text, md: draft && (!f || draft.base === f.text) ? draft.md : text });
    if (draft && f && draft.base !== f.text) toast("This note changed elsewhere; showing the latest version");
    const body = ed.querySelector("#eBody");
    try {
      const { Crepe } = await engine(); if (cur?.ed !== ed) return; const F = Crepe.Feature;
      crepe = new Crepe({ root: body, defaultValue: cur.md, features: { [F.AI]: false, [F.Toolbar]: false, [F.TopBar]: false, [F.ImageBlock]: false }, featureConfigs: { [F.Placeholder]: { text: "Write, or type / for blocks" } } });
      await crepe.create(); crepe.on(l => l.markdownUpdated((ctx, md) => changed(md)));
    } catch (e) {   // offline the first time: a plain text editor on the same markdown
      body.innerHTML = `<textarea id="eTa" spellcheck="true" placeholder="Write…"></textarea>`; const ta = body.querySelector("#eTa"); ta.value = cur.md; ta.oninput = () => changed(ta.value);
    }
    setSt(cur.md !== cur.base ? "unsaved" : notesCfg.remote || demo ? "saved" : "on this phone");
    if (cur.md !== cur.base) later(400);
    ed.querySelector("#eBack").onclick = close;
    ed.querySelector("#eTtl").onchange = e => rename(e.target.value);
    ed.querySelector("#eDel").onclick = () => trash();
    if (fresh) { const t = ed.querySelector("#eTtl"); t.focus(); t.select(); }
  }
  function changed(md) { if (!cur || md === cur.md) return; cur.md = md; ls.set(draftKey(cur.path), JSON.stringify({ md, base: cur.base })); setSt("unsaved"); later(1200); }
  const later = ms => { clearTimeout(timer); timer = setTimeout(save, ms); };
  async function save() {
    clearTimeout(timer); if (!cur || cur.md === cur.base) return; if (saving) return later(400); saving = true; const c = cur, md = c.md; setSt("saving…");
    try { c.sha = await store().write(c.path, md, c.sha, `notes: ${baseName(c.path)}`); c.base = md; if (c.md === md) ls.set(draftKey(c.path), null); setSt(notesCfg.remote || demo ? "saved" : "on this phone"); }
    catch (e) {
      if ((e.status === 409 || e.status === 422) && notesCfg.remote) { try { const r = await remote.read(c.path); c.sha = r?.sha ?? null; saving = false; return later(200); } catch {} }
      setSt(e.status === 0 ? "offline, kept on phone" : "not saved (" + (e.status || e.message) + ")");
    }
    saving = false;
  }
  async function close() {
    if (!cur) return; const c = cur; await save(); try { await crepe?.destroy(); } catch {} crepe = null; c.ed.remove(); document.body.style.overflow = ""; cur = null;
    if (!files.includes(c.path)) files.push(c.path); render(); refresh();
  }
  async function rename(name) {
    name = name.replace(/[\/\\:*?"<>|]/g, " ").trim(); if (!cur || !name || name === baseName(cur.path)) return;
    const to = (dirOf(cur.path) ? dirOf(cur.path) + "/" : "") + name + ".md"; if (files.includes(to)) { toast("A note with that name exists"); return; }
    await save(); const from = cur.path, sha = cur.sha;
    try { cur.sha = await store().write(to, cur.md, null, `notes: rename ${baseName(from)} → ${name}`); await store().remove(from, sha, `notes: rename ${baseName(from)}`); cur.path = to; cur.base = cur.md; files = files.filter(p => p !== from).concat(to); delete recent[from]; touch(to); setSt("renamed"); }
    catch (e) { toast("Rename failed"); }
  }
  async function trash() {
    if (!cur) return; const b = cur.ed.querySelector("#eDel");
    if (!b.dataset.arm) { b.dataset.arm = 1; b.classList.add("bad"); toast("Tap again to move to trash"); setTimeout(() => { delete b.dataset.arm; b.classList.remove("bad"); }, 2500); return; }
    const c = cur; clearTimeout(timer);
    try { const to = TRASH + "/" + c.path; await store().write(to, c.md, null, `notes: trash ${baseName(c.path)}`); await store().remove(c.path, c.sha, `notes: trash ${baseName(c.path)}`); files = files.filter(p => p !== c.path).concat(to); ls.set(draftKey(c.path), null); }
    catch { toast("Could not move to trash"); return; }
    c.md = c.base; await close(); toast("Moved to trash");
  }
  async function newNote() {
    const here = dir ? dir + "/" : ""; let n = "Untitled", i = 2; while (files.includes(here + n + ".md")) n = "Untitled " + i++;
    const p = here + n + ".md";
    try { await store().write(p, "\n", null, `notes: new ${n}`); } catch (e) { toast(e.status === 0 ? "Offline: can't create a note in the repo" : "Could not create the note"); return; }
    files.push(p); open(p, { fresh: true });
  }

  // ---- input ----
  root.addEventListener("click", e => {
    const t = e.target.closest("[data-open],[data-dir],#nNew,[data-connect]"); if (!t) return;
    if (t.id === "nNew") return newNote();
    if (t.hasAttribute("data-connect")) return dispatchEvent(new CustomEvent("connections", { detail: "notes" }));
    if (t.dataset.dir != null && !t.dataset.open) { dir = t.dataset.dir; q = ""; render(); scrollTo(0, 0); return; }
    if (t.dataset.open) open(t.dataset.open);
  });
  root.addEventListener("input", e => { if (e.target.id !== "nQ") return; q = e.target.value.trim().toLowerCase(); const pos = e.target.selectionStart; render(); const s = root.querySelector("#nQ"); s.focus(); s.setSelectionRange(pos, pos); });
  addEventListener("pagehide", () => save());
  document.addEventListener("visibilitychange", () => { if (document.hidden) save(); });

  render(); refresh();
  return {
    refresh, back() { if (cur) { close(); return true; } if (dir) { dir = dir.includes("/") ? dir.slice(0, dir.lastIndexOf("/")) : ""; render(); return true; } return false; },
    get open() { return !!cur; },
  };
}
