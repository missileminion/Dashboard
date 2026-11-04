// The Notes tab: a list of notes on the left and a rich-text editor (Milkdown Crepe) on the right.
// Notes are plain markdown files. With a GitHub token they live in your private notes repo (files at the top level, pictures and attachments in _files/);
// without one they are kept in this browser only, so the tab can be tried first. The editor loads from the web the first time the tab is opened.
import { syncwarn, EXPIRY_HEADER } from "./syncwarn.js";
const ESM = "https://esm.sh/@milkdown/", CREPE = ESM + "crepe@7.23.0", KIT = ESM + "kit@7.23.0/";
const CSS = [ESM + "crepe@7.23.0/lib/theme/common/style.css", "https://esm.sh/katex@0.16.11/dist/katex.min.css"];
const FONT = "https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500&display=swap";
const draftKey = p => "notes.draft:" + p, KEEP = ".gitkeep", TRASH = "_trash", K_THEME = "notes.theme", K_FOLD = "notes.fold", K_TABS = "notes.tabs", K_EXP = "notes.expires";
const COLORS = [["Red", "#e5484d"], ["Orange", "#f76808"], ["Yellow", "#c99400"], ["Green", "#30a46c"], ["Blue", "#3e63dd"], ["Purple", "#8e4ec6"], ["Pink", "#d6409f"], ["Grey", "#8b8d98"]];
const K_REPO = "notes.repo", K_TOKEN = "notes.token", K_LOCAL = "notes.local", DEFAULT_REPO = "missileminion/Notes", FILES = "_files";
const lsGet = k => { try { return localStorage.getItem(k) || ""; } catch { return ""; } }, lsSet = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); return true; } catch { return false; } };
const cfg = { get repo() { return lsGet(K_REPO) || DEFAULT_REPO; }, get token() { return lsGet(K_TOKEN); }, get remote() { return !!lsGet(K_TOKEN); } };
const err = (status, msg) => Object.assign(new Error(msg || "HTTP " + status), { status });
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const b64 = s => btoa(unescape(encodeURIComponent(s))), unb64 = s => decodeURIComponent(escape(atob(s.replace(/\n/g, ""))));
const encPath = p => p.split("/").map(encodeURIComponent).join("/"), baseName = p => p.split("/").pop().replace(/\.(md|html)$/i, ""), dirOf = p => (p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "");
const slug = s => s.toLowerCase().replace(/\.[a-z0-9]+$/, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "file";
const blobToB64 = async blob => { const u = new Uint8Array(await blob.arrayBuffer()); let s = ""; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };

/* ---------- storage: GitHub (private repo) or this browser ---------- */
const remote = {
  async call(p, o = {}) {
    const r = await fetch(`https://api.github.com/repos/${cfg.repo}${p ? "/" + p : ""}`, { cache: "no-store", ...o, headers: { Authorization: `Bearer ${cfg.token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", ...(o.headers || {}) } }).catch(() => { throw err(0, "offline"); });
    const exp = r.headers.get(EXPIRY_HEADER) || lsGet(K_EXP); syncwarn.seen("notes", "Notes", "notes", r.status, exp);
    if (r.status === 404 && p.startsWith("git/trees")) syncwarn.broken("notes", "Notes", "notes", "Notes are not syncing: GitHub cannot find the notes repo, or the token has no access to it. Check the repo name and the token's repository access.");
    return r;
  },
  async list() { const r = await this.call("git/trees/HEAD?recursive=1"); if (r.status === 409) return []; if (!r.ok) throw err(r.status); return (await r.json()).tree.filter(t => t.type === "blob").map(t => t.path); },
  async read(path) { const r = await this.call(`contents/${encPath(path)}`); if (r.status === 404) return null; if (!r.ok) throw err(r.status); const j = await r.json(); let text = j.content ? unb64(j.content) : ""; if (!j.content && j.size) { const raw = await this.call(`contents/${encPath(path)}`, { headers: { Accept: "application/vnd.github.raw+json" } }); text = await raw.text(); } return { text, sha: j.sha }; },
  async write(path, text, sha, message) { const r = await this.call(`contents/${encPath(path)}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message, content: b64(text), ...(sha ? { sha } : {}) }) }); if (!r.ok) throw err(r.status); return (await r.json()).content.sha; },
  async putBlob(path, blob, message) { const r = await this.call(`contents/${encPath(path)}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message, content: await blobToB64(blob) }) }); if (!r.ok) throw err(r.status); },
  async remove(path, sha, message) { const r = await this.call(`contents/${encPath(path)}`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message, sha }) }); if (!r.ok && r.status !== 404) throw err(r.status); },
  branch: "", head: null,
  async batch(moves, dels, message) {   // many moves and deletes in ONE commit, whatever the count (git data API)
    for (let attempt = 0; attempt < 3; attempt++) {
      if (!this.branch) { const r = await this.call(""); if (!r.ok) throw err(r.status); this.branch = (await r.json()).default_branch; }
      let r = await this.call(`git/ref/heads/${this.branch}`); if (!r.ok) throw err(r.status); const head = (await r.json()).object.sha;
      r = await this.call(`git/trees/${head}?recursive=1`); if (!r.ok) throw err(r.status); const t = await r.json(), shaOf = {}; t.tree.forEach(x => { if (x.type === "blob") shaOf[x.path] = x.sha; });
      const entries = []; for (const [from, to] of moves) if (shaOf[from]) { entries.push({ path: to, mode: "100644", type: "blob", sha: shaOf[from] }, { path: from, mode: "100644", type: "blob", sha: null }); }
      for (const d of dels) if (shaOf[d]) entries.push({ path: d, mode: "100644", type: "blob", sha: null });
      if (!entries.length) return;
      const J = { "Content-Type": "application/json" }; r = await this.call("git/trees", { method: "POST", headers: J, body: JSON.stringify({ base_tree: t.sha, tree: entries }) }); if (!r.ok) throw err(r.status); const tree = await r.json();
      r = await this.call("git/commits", { method: "POST", headers: J, body: JSON.stringify({ message, tree: tree.sha, parents: [head] }) }); if (!r.ok) throw err(r.status); const commit = await r.json();
      r = await this.call(`git/refs/heads/${this.branch}`, { method: "PATCH", headers: J, body: JSON.stringify({ sha: commit.sha }) }); if (r.ok) return; if (r.status !== 422 && r.status !== 409) throw err(r.status);
    }
    throw err(409, "the repo kept changing, try again");
  },
  async sha(path) { const r = await this.call(`contents/${encPath(path)}`); return r.ok ? (await r.json()).sha : null; },
  async blob(path) { const r = await this.call(`contents/${encPath(path)}`, { headers: { Accept: "application/vnd.github.raw+json" } }); if (!r.ok) throw err(r.status); return r.blob(); },
};
const local = {
  all() { try { return JSON.parse(lsGet(K_LOCAL)) || {}; } catch { return {}; } }, save(o) { if (!lsSet(K_LOCAL, JSON.stringify(o))) throw err(0, "this browser's storage is full"); },
  async batch(moves, dels) { const o = this.all(); for (const [a, b] of moves) if (a in o) { o[b] = o[a]; delete o[a]; } dels.forEach(d => delete o[d]); this.save(o); },
  async list() { return Object.keys(this.all()); }, async read(path) { const o = this.all(); return path in o ? { text: o[path], sha: null } : null; },
  async write(path, text) { const o = this.all(); o[path] = text; this.save(o); return null; }, async remove(path) { const o = this.all(); delete o[path]; this.save(o); },
};
const store = () => (cfg.remote ? remote : local);

/* ---------- pictures: shrink before they are saved ---------- */
async function prepareImage(file) {
  if (/svg|gif/.test(file.type)) return { blob: file, ext: file.type.includes("svg") ? "svg" : "gif" };
  const bmp = await createImageBitmap(file), k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height)), c = document.createElement("canvas"); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  const g = c.getContext("2d"); let png = null;
  if (file.type === "image/png") { g.drawImage(bmp, 0, 0, c.width, c.height); png = await new Promise(r => c.toBlob(r, "image/png")); if (png.size < 600e3) return { blob: png, ext: "png" }; }
  g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); g.drawImage(bmp, 0, 0, c.width, c.height);
  return { blob: await new Promise(r => c.toBlob(r, "image/jpeg", 0.85)), ext: "jpg" };
}
const readAsDataURL = blob => new Promise((res, rej) => { const f = new FileReader(); f.onload = () => res(f.result); f.onerror = rej; f.readAsDataURL(blob); });

const ICON = {
  new: '<path d="M12 20h8M4 20l1-4L16.5 4.5a2.1 2.1 0 0 1 3 3L8 19z"/>', side: '<rect x="3.5" y="4.5" width="17" height="15" rx="3"/><path d="M9.5 4.5v15"/>', gear: '<path d="M7 18a4 4 0 0 1-.6-7.96A5.5 5.5 0 0 1 17 9.5 4.3 4.3 0 0 1 17.5 18z"/>',
  bold: '<path d="M7 5h6a3.5 3.5 0 0 1 0 7H7zM7 12h7a3.5 3.5 0 0 1 0 7H7z"/>', ital: '<path d="M10 5h7M7 19h7M14 5l-4 14"/>', strike: '<path d="M4 12h16M16.5 7.5C16 6 14.5 5 12 5S8 6.2 8 8c0 4 8.5 2.5 8.5 7 0 2-2 3-4.5 3s-4.3-1-4.8-2.8"/>', code: '<path d="M8 8l-4 4 4 4M16 8l4 4-4 4"/>',
  hl: '<path d="M4 20h16M7 15l7.5-7.5 3 3L10 18H7z"/>', color: '<path d="M7 18L12 5l5 13M8.8 13.5h6.4"/><path d="M5 21h14" stroke-width="3"/>', link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  ul: '<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r=".8"/><circle cx="4.5" cy="12" r=".8"/><circle cx="4.5" cy="18" r=".8"/>', ol: '<path d="M10 6h10M10 12h10M10 18h10M4 4.5l1.5-.8V9M4 14.8c.3-1 2.5-1.3 2.5.3 0 1-2.5 2-2.5 3h2.7"/>',
  quote: '<path d="M6 17c-1.5-1-2-2.500-2-4.500C4 9 6 7 8.500 6.500M15 17c-1.500-1-2-2.500-2-4.500 0-3.500 2-5.500 4.500-6"/>', block: '<rect x="3.500" y="4.500" width="17" height="15" rx="3"/><path d="M9.500 10l-2 2 2 2M14.500 10l2 2-2 2"/>',
  sigma: '<path d="M17 5H7l5 7-5 7h10"/>', mblock: '<rect x="3.500" y="4.500" width="17" height="15" rx="3"/><path d="M15 9h-6l3 3-3 3h6"/>', table: '<rect x="3.500" y="5" width="17" height="14" rx="2.500"/><path d="M3.500 10h17M3.500 14.500h17M9.500 5v14M14.500 5v14"/>',
  img: '<rect x="3.500" y="5" width="17" height="14" rx="3"/><circle cx="9" cy="10" r="1.500"/><path d="M4 17l5-4.500 3.500 3 3-2.500L20 16"/>', clip: '<path d="M20 11.500l-7.500 7.500a5 5 0 0 1-7-7l8-8a3.300 3.300 0 0 1 4.700 4.700l-8 8a1.700 1.700 0 0 1-2.400-2.400l7.300-7.300"/>', hr: '<path d="M4 12h16"/>',
  chev: '<path d="M9 6l6 6-6 6"/>', home: '<path d="M3.5 11.5L12 4l8.5 7.5M5.5 10v10h13V10"/>', folderplus: '<path d="M3.5 7a2 2 0 0 1 2-2H10l2 2.500h6.500a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2zM12 10.500v5M9.500 13h5"/>', trash: '<path d="M4.5 7h15M10 4h4M6.5 7l.8 12a1.5 1.5 0 0 0 1.5 1.4h6.4a1.5 1.5 0 0 0 1.5-1.4L17.5 7M10 11v6M14 11v6"/>', comment: '<path d="M5 5.5h14a1.5 1.5 0 0 1 1.5 1.5v8a1.5 1.5 0 0 1-1.5 1.5H11l-4 3.5V16.5H5A1.5 1.5 0 0 1 3.5 15V7A1.5 1.5 0 0 1 5 5.5z"/>', down: '<path d="M12 4v11M7.5 10.500L12 15l4.500-4.500M5 20h14"/>', x: '<path d="M7 7l10 10M17 7L7 17"/>', plus: '<path d="M12 5v14M5 12h14"/>', moon: '<path d="M20 14.500A8 8 0 0 1 9.500 4a8 8 0 1 0 10.500 10.500z"/>', sun: '<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.600 5.600L7 7M17 17l1.400 1.400M5.600 18.400L7 17M17 7l1.400-1.400"/>', file: '<path d="M6 3.500h8l4 4v13H6z"/>', folder: '<path d="M3.500 7a2 2 0 0 1 2-2H10l2 2.500h6.500a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/>',
};
const ic = (n, w = 1.8) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[n]}</svg>`;
const TOOLS = [   // id, icon, title
  ["h", null, "Heading"], ["|"], ["bold", "bold", "Bold  ⌘B"], ["ital", "ital", "Italic  ⌘I"], ["strike", "strike", "Strikethrough"], ["code", "code", "Inline code"], ["hl", "hl", "Highlight"], ["color", "color", "Text colour"], ["link", "link", "Link"], ["comment", "comment", "Comment"], ["|"],
  ["ul", "ul", "Bulleted list"], ["ol", "ol", "Numbered list"], ["quote", "quote", "Quote"], ["|"], ["math", "sigma", "Inline math"], ["mblock", "mblock", "Math block"], ["cblock", "block", "Code block"], ["table", "table", "Table"], ["|"], ["img", "img", "Picture"], ["attach", "clip", "Attach a file"], ["hr", "hr", "Divider"],
];

export function initNotes(root) {
  { const f = document.createElement("link"); f.rel = "stylesheet"; f.href = FONT; document.head.appendChild(f); }
  root.innerHTML = `<div class="nt" data-th="dark">
    <aside class="nt-side">
      <div class="nt-sbar"><button type="button" class="nt-ib nt-home" data-a="home" title="Dashboard" aria-label="Dashboard">${ic("home")}</button><b class="nt-brand">Notes</b><span class="nt-mode"></span><button type="button" class="nt-ib" data-a="folder" title="New folder" aria-label="New folder">${ic("folderplus")}</button><button type="button" class="nt-ib" data-a="new" title="New note" aria-label="New note">${ic("new")}</button><button type="button" class="nt-ib nt-selbtn" data-a="select" title="Select notes to delete" aria-label="Select notes to delete">${ic("trash")}</button></div>
      <div class="nt-list"></div>
      <div class="nt-selbar" hidden></div><div class="nt-trashrow" data-a="trashview" role="button" tabindex="0"></div>
      <form class="nt-conn" hidden><input name="repo" placeholder="owner/repo" autocomplete="off" spellcheck="false" data-1p-ignore><input class="nt-tok" name="tok" placeholder="token" autocomplete="off" autocapitalize="off" spellcheck="false" data-1p-ignore data-lpignore="true"><label class="nt-hint">Token expires<input type="date" name="exp"></label><div class="nt-row"><button type="submit" class="nt-btn">Save</button><button type="button" class="nt-btn" data-a="disc">Disconnect</button></div></form>
      <div class="nt-vault"><span class="nt-repo"></span><button type="button" class="nt-ib" data-a="theme" aria-label="Light or dark"></button><button type="button" class="nt-ib" data-a="gear" title="GitHub connection" aria-label="GitHub connection">${ic("gear")}</button></div>
    </aside>
    <div class="nt-main">
      <div class="nt-tabs"><button type="button" class="nt-ib nt-side-t" data-a="side" title="Show or hide the file list" aria-label="Show or hide the file list">${ic("side")}</button><button type="button" class="nt-ib nt-back" data-a="list" aria-label="All notes">${ic("chev")}</button><div class="nt-tablist"></div><button type="button" class="nt-ib" data-a="new" title="New note" aria-label="New note">${ic("plus")}</button><button type="button" class="nt-ib nt-exp" data-a="export" title="Export this note" aria-label="Export this note" disabled>${ic("down")}</button><span class="nt-rt"></span><span class="nt-status" role="status"><i class="nt-sd"></i><span class="nt-msg"></span></span></div>
      <div class="nt-xmenu" hidden><button type="button" class="nt-pi" data-x="md">Markdown</button><button type="button" class="nt-pi" data-x="pdf">PDF</button></div><div class="nt-banner" hidden></div>
      <div class="nt-scroll"><div class="nt-page"><textarea class="nt-title" rows="1" placeholder="Untitled" spellcheck="false" disabled></textarea><div class="nt-ed"></div><div class="nt-hello">No note open</div></div></div>
      <div class="nt-pop" hidden></div><div class="nt-cpop" hidden></div>
      <div class="nt-foot"><div class="nt-tools"></div></div>
      <input type="file" class="nt-file" hidden><input type="file" class="nt-pic" accept="image/*" hidden>
    </div></div>`;
  const $ = s => root.querySelector(s), nt = $(".nt"), listEl = $(".nt-list"), titleEl = $(".nt-title"), statusEl = $(".nt-status"), edEl = $(".nt-ed"), banner = $(".nt-banner"), conn = $(".nt-conn"), modeEl = $(".nt-mode"), fileIn = $(".nt-file"), picIn = $(".nt-pic"), tabsEl = $(".nt-tablist"), pop = $(".nt-pop"), toolsEl = $(".nt-tools"), rtEl = $(".nt-rt"), selbar = $(".nt-selbar"), trashRow = $(".nt-trashrow"), cpop = $(".nt-cpop"), sdEl = $(".nt-sd"), msgEl = $(".nt-msg"), scrollEl = $(".nt-scroll");
  let selDir = "", view = "notes", selecting = false, purgeArm = 0, picked = new Set(), files = [], cur = null, crepe = null, mod = null, ext = null, timer = null, saving = false, openSeq = 0, tabs = [], theme = lsGet(K_THEME) || "auto", fold = new Set(); const blobUrls = new Map();
  try { fold = new Set(JSON.parse(lsGet(K_FOLD) || "[]")); tabs = JSON.parse(lsGet(K_TABS) || "[]").filter(Boolean); } catch {}
  const setStatus = (t, bad) => {   // a blue dot when saved, a red dot while there is something unsaved; anything else is spelled out
    const k = /^saved/.test(t) ? "saved" : /^(unsaved|saving)/.test(t) ? "dirty" : ""; sdEl.dataset.s = k; statusEl.title = t; statusEl.setAttribute("aria-label", t || "no note open"); msgEl.textContent = k ? "" : t; statusEl.classList.toggle("bad", !!bad);
  };
  const showBanner = html => { banner.hidden = !html; banner.innerHTML = html || ""; };
  const enable = on => { $(".nt-exp").disabled = !on; toolsEl.classList.toggle("off", !on || !crepe); }, sizeTitle = () => { titleEl.style.height = "auto"; titleEl.style.height = titleEl.scrollHeight + "px"; }, setTitle = (v, on) => { titleEl.value = v; titleEl.disabled = !on; sizeTitle(); requestAnimationFrame(sizeTitle); root.classList.toggle("blank", !on); };
  const mode = () => { modeEl.textContent = ""; modeEl.title = cfg.remote ? cfg.repo : "not saved to GitHub yet"; $(".nt-repo").textContent = cfg.remote ? cfg.repo.split("/")[1] : "Local notes"; };
  const applyTheme = (quick) => { const dark = theme === "dark" || (theme === "auto" && matchMedia("(prefers-color-scheme: dark)").matches); nt.dataset.th = dark ? "dark" : "light"; document.body.dataset.ntth = dark ? "dark" : "light"; const b = root.querySelector('[data-a=theme]'); b.innerHTML = ic(dark ? "moon" : "sun"); b.title = dark ? "Switch to light (cream)" : "Switch to dark"; };
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => applyTheme()); applyTheme();
  toolsEl.innerHTML = TOOLS.map(t => t[0] === "|" ? '<i class="nt-sep"></i>' : t[0] === "h" ? `<button type="button" class="nt-t nt-h" data-tool="h" title="Heading"><b>H</b><small>▾</small></button>` : `<button type="button" class="nt-t" data-tool="${t[0]}" title="${t[2]}" aria-label="${t[2]}">${ic(t[1])}</button>`).join("");
  toolsEl.classList.add("off");

  /* ----- file list: folders and notes, like a vault ----- */
  const isDoc = p => /\.(md|html)$/i.test(p) && !p.startsWith(FILES + "/") && !p.startsWith("."), isTrash = p => isDoc(p) && p.startsWith(TRASH + "/"), isNote = p => isDoc(p) && !p.startsWith(TRASH + "/");
  const saveFold = () => lsSet(K_FOLD, JSON.stringify([...fold])), saveTabs = () => lsSet(K_TABS, JSON.stringify(tabs));
  const ckIcon = on => `<i class="nt-ck${on ? " on" : ""}"></i>`;
  function renderList() {
    const trashed = files.filter(isTrash), pick = view === "trash" || selecting, cmp = (a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
    trashRow.innerHTML = view === "trash" ? `${ic("chev", 2)}<span>Back to notes</span>` : `${ic("trash", 1.6)}<span>Trash</span>${trashed.length ? `<small>${trashed.length}</small>` : ""}`; trashRow.classList.toggle("none", view !== "trash" && !trashed.length);
    root.querySelector(".nt-selbtn").classList.toggle("on", selecting); root.querySelector(".nt-selbtn").hidden = view === "trash";
    if (view === "trash") {
      listEl.innerHTML = trashed.length ? trashed.sort(cmp).map(p => { const r = p.slice(TRASH.length + 1); return `<div role="button" tabindex="0" class="nt-row-i nt-item${picked.has(p) ? " picked" : ""}" data-path="${esc(p)}">${ckIcon(picked.has(p))}<span>${esc(baseName(r))}${dirOf(r) ? `<em> ${esc(dirOf(r))}</em>` : ""}</span></div>`; }).join("") : `<div class="nt-empty">Trash is empty</div>`; drawSel(); return;
    }
    const notes = files.filter(isNote), tree = { dirs: {}, files: [] }, mk = path => { let n = tree; path.split("/").filter(Boolean).forEach(d => (n = n.dirs[d] ||= { dirs: {}, files: [] })); return n; };
    files.filter(p => p.endsWith("/" + KEEP) && !p.startsWith(TRASH + "/")).forEach(p => mk(dirOf(p))); notes.forEach(p => mk(dirOf(p)).files.push(p));
    const draw = (n, path, depth) => Object.keys(n.dirs).sort(cmp).map(d => { const full = path ? path + "/" + d : d, open = !fold.has(full); return `<div role="button" tabindex="0" class="nt-row-i nt-dir${open ? " open" : ""}${selDir === full ? " sel" : ""}${picked.has(full) ? " picked" : ""}" style="--d:${depth}" data-dir="${esc(full)}">${pick ? ckIcon(picked.has(full)) : ic("chev", 2)}<span>${esc(d)}</span></div>${open ? draw(n.dirs[d], full, depth + 1) : ""}`; }).join("") + n.files.sort((a, b) => cmp(baseName(a), baseName(b))).map(p => `<div role="button" tabindex="0" ${pick ? "" : 'draggable="true"'} class="nt-row-i nt-item${cur && cur.path === p ? " on" : ""}${picked.has(p) ? " picked" : ""}" style="--d:${depth}" data-path="${esc(p)}">${pick ? ckIcon(picked.has(p)) : ic("file", 1.6)}<span>${esc(baseName(p))}</span>${/\.html$/i.test(p) ? "<i>html</i>" : ""}</div>`).join("");
    listEl.innerHTML = draw(tree, "", 0) || `<div class="nt-empty">No notes</div>`; drawSel();
  }
  function drawSel() {
    const on = selecting || view === "trash"; selbar.hidden = !on; if (!on) return; const n = picksToDocs().length;
    selbar.innerHTML = view === "trash" ? `<button type="button" class="nt-sb" data-sb="all">All</button><span class="nt-sn">${n || ""}</span><button type="button" class="nt-sb" data-sb="restore" ${n ? "" : "disabled"}>Restore</button><button type="button" class="nt-sb danger" data-sb="purge" ${n ? "" : "disabled"}>${purgeArm ? "Sure?" : "Delete forever"}</button>`
      : `<span class="nt-sn">${n ? n + " selected" : "Pick notes or folders"}</span><button type="button" class="nt-sb danger" data-sb="trash" ${picked.size ? "" : "disabled"}>Move to trash</button><button type="button" class="nt-sb" data-sb="cancel">Cancel</button>`;
  }
  const picksToDocs = () => { const out = new Set(); for (const k of picked) { if (isDoc(k)) out.add(k); else files.forEach(f => { if (isDoc(f) && f.startsWith(k + "/")) out.add(f); }); } return [...out]; };
  function renderTabs() {
    tabsEl.innerHTML = tabs.map(p => `<div class="nt-tab${cur && cur.path === p ? " on" : ""}" data-tab="${esc(p)}" role="tab"><span>${esc(baseName(p))}</span><button type="button" class="nt-x" data-close="${esc(p)}" aria-label="Close">${ic("x", 2)}</button></div>`).join("");
    const on = tabsEl.querySelector(".on"); if (on && on.scrollIntoView) on.scrollIntoView({ block: "nearest", inline: "nearest" });
  }
  async function refresh() { mode(); try { files = await store().list(); setStatus(""); } catch (e) { files = []; setStatus(e.status === 401 ? "token not accepted" : e.status === 404 ? "repo not found, or no access" : "could not reach GitHub: " + e.message, true); } tabs = tabs.filter(p => files.includes(p)); renderList(); renderTabs(); }

  /* ----- paths, pictures ----- */
  const rel = (notePath, repoPath) => { const up = dirOf(notePath) ? dirOf(notePath).split("/").map(() => "..").join("/") + "/" : ""; return up + repoPath; };
  const resolve = (notePath, url) => { const parts = dirOf(notePath) ? dirOf(notePath).split("/") : []; for (const seg of url.split("/")) { if (seg === "..") parts.pop(); else if (seg && seg !== ".") parts.push(seg); } return parts.join("/"); };
  const isRelative = u => !/^([a-z][a-z0-9+.-]*:|\/\/|#)/i.test(u);
  async function show(url) {   // a picture's address as the page can show it; pictures in a private repo are fetched with the token
    if (!isRelative(url) || !cur || !cfg.remote) return url; const p = resolve(cur.path, decodeURI(url));
    if (!blobUrls.has(p)) blobUrls.set(p, remote.blob(p).then(b => URL.createObjectURL(b)).catch(() => url)); return blobUrls.get(p);
  }
  async function upload(file) {
    const { blob, ext: e } = await prepareImage(file);
    if (!cfg.remote) return readAsDataURL(blob);
    const repoPath = `${FILES}/${new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "")}-${slug(file.name)}.${e}`; await remote.putBlob(repoPath, blob, "notes: add picture"); blobUrls.set(repoPath, Promise.resolve(URL.createObjectURL(blob)));
    return rel(cur.path, repoPath);
  }

  /* ----- editor engine: Crepe plus highlight and colour marks ----- */
  const safeColor = c => /^(#[0-9a-f]{3,8}|[a-z]{3,20})$/i.test(c) ? c : "";
  function marks(kit) {
    const hl = kit.$markSchema("highlight", () => ({ parseDOM: [{ tag: "mark" }], toDOM: () => ["mark", 0], parseMarkdown: { match: n => n.type === "hlMark", runner: (st, n, t) => { st.openMark(t); st.next(n.children); st.closeMark(t); } }, toMarkdown: { match: m => m.type.name === "highlight", runner: (st, m) => { st.withMark(m, "hlMark"); } } }));
    const col = kit.$markSchema("textColor", () => ({ attrs: { color: { default: "" } }, parseDOM: [{ tag: "span[style]", getAttrs: el => { const c = safeColor((el.style.color || "").trim()); return c ? { color: c } : false; } }], toDOM: m => ["span", { style: `color:${m.attrs.color}` }, 0], parseMarkdown: { match: n => n.type === "colorMark", runner: (st, n, t) => { st.openMark(t, { color: n.color }); st.next(n.children); st.closeMark(t); } }, toMarkdown: { match: m => m.type.name === "textColor", runner: (st, m) => { st.withMark(m, "colorMark", undefined, { color: m.attrs.color }); } } }));
    const encC = o => encodeURIComponent(JSON.stringify({ t: o.text || "", d: o.date || "" }));
    const cm = kit.$markSchema("comment", () => ({ attrs: { text: { default: "" }, date: { default: "" } }, inclusive: false, parseDOM: [{ tag: "span[data-comment]", getAttrs: el => { try { const o = JSON.parse(decodeURIComponent(el.getAttribute("data-comment"))); return { text: String(o.t || ""), date: String(o.d || "") }; } catch { return false; } } }], toDOM: m => ["span", { class: "nt-cmt", "data-comment": encC(m.attrs), title: m.attrs.text }, 0], parseMarkdown: { match: n => n.type === "commentMark", runner: (st, n, t) => { st.openMark(t, { text: n.text, date: n.date }); st.next(n.children); st.closeMark(t); } }, toMarkdown: { match: m => m.type.name === "comment", runner: (st, m) => { st.withMark(m, "commentMark", undefined, { text: m.attrs.text, date: m.attrs.date }); } } }));
    const rm = kit.$remark("notes-marks", () => function () {   // <mark>, <span style="color:…"> and <span data-comment="…"> become marks; the same text is written back out
      const inner = (n, st, i) => st.containerPhrasing(n, { ...i, before: ">", after: "<" });
      const d = this.data(); (d.toMarkdownExtensions ||= []).push({ handlers: { hlMark: (n, _, st, i) => "<mark>" + inner(n, st, i) + "</mark>", colorMark: (n, _, st, i) => `<span style="color:${n.color}">` + inner(n, st, i) + "</span>", commentMark: (n, _, st, i) => `<span data-comment="${encC(n)}">` + inner(n, st, i) + "</span>" } });
      const opener = v => {
        if (v === "<mark>") return { type: "hlMark" };
        let m = /^<span style="color:\s*([^";]+);?">$/i.exec(v); if (m && safeColor(m[1].trim())) return { type: "colorMark", color: m[1].trim() };
        m = /^<span data-comment="([^"]*)">$/.exec(v); if (m) { try { const o = JSON.parse(decodeURIComponent(m[1])); return { type: "commentMark", text: String(o.t || ""), date: String(o.d || "") }; } catch {} }
        return null;
      };
      const closes = (v, top) => top && ((v === "</mark>" && top.type === "hlMark") || (v === "</span>" && (top.type === "colorMark" || top.type === "commentMark")));
      const walk = node => { if (!node.children) return; node.children.forEach(walk); const out = [], stack = [], put = c => (stack.length ? stack[stack.length - 1].children : out).push(c);
        for (const c of node.children) { const v = c.type === "html" ? c.value.trim() : "", open = v ? opener(v) : null;
          if (open) { open.children = []; open.raw = v; stack.push(open); continue; }
          if (v && closes(v, stack[stack.length - 1])) { put(stack.pop()); continue; }
          put(c); }
        while (stack.length) { const u = stack.pop(); put({ type: "html", value: u.raw }); u.children.forEach(put); }
        node.children = out; };
      return tree => walk(tree); });
    return { list: [hl, col, cm, rm].flat(), hl, col, cmt: cm };
  }
  async function engine() {
    if (mod) return; for (const h of CSS) { const l = document.createElement("link"); l.rel = "stylesheet"; l.href = h; document.head.appendChild(l); }
    const [crepeM, utils, core, cm, gfm, cmds] = await Promise.all([import(CREPE), import(KIT + "utils"), import(KIT + "core"), import(KIT + "preset/commonmark"), import(KIT + "preset/gfm"), import(KIT + "prose/commands")]);
    mod = crepeM; ext = { kit: utils, core, cm, gfm, cmds, ...marks(utils) };
  }
  async function destroyEditor() { clearTimeout(timer); if (crepe) { try { await crepe.destroy(); } catch {} crepe = null; } edEl.textContent = ""; rtEl.textContent = ""; closePop(); cpop.hidden = true; }
  const wc = md => { const t = md.replace(/[#>*_`~|\-\[\]()!$<>=]/g, " ").trim(); return t ? t.split(/\s+/).length : 0; };
  const updateCount = md => { const w = wc(md); rtEl.textContent = w ? `${Math.max(1, Math.round(w / 220))} min` : ""; rtEl.title = w ? `${w} words, about ${Math.max(1, Math.round(w / 220))} min to read` : ""; };
  async function open(path) {
    const seq = ++openSeq; await flush(); showBanner(""); setStatus("opening…"); let f;
    try { f = await store().read(path); } catch (e) { setStatus("could not open: " + e.message, true); return; } if (!f) { setStatus("that note is gone", true); await refresh(); return; }
    await destroyEditor(); if (seq !== openSeq) return; let draft = null; try { draft = JSON.parse(lsGet(draftKey(path)) || "null"); } catch {} if (draft && draft.md === f.text) { lsSet(draftKey(path), null); draft = null; }
    cur = { path, sha: f.sha, base: f.text, md: draft ? draft.md : f.text }; if (!tabs.includes(path)) tabs.push(path); saveTabs(); setTitle(baseName(path), true); enable(true); renderList(); renderTabs(); root.classList.add("open"); scrollEl.scrollTop = 0; updateCount(cur.md);
    if (/\.html$/i.test(path)) { const fr = document.createElement("iframe"); fr.className = "nt-frame"; fr.setAttribute("sandbox", "allow-scripts"); fr.srcdoc = f.text; edEl.appendChild(fr); root.classList.add("html"); setStatus("web page, view only"); toolsEl.classList.add("off"); return; }
    root.classList.remove("html");
    try { await engine(); } catch (e) { setStatus("the editor could not load (needs internet): " + e.message, true); return; } if (seq !== openSeq) return;
    const { Crepe } = mod, F = Crepe.Feature; crepe = new Crepe({ root: edEl, defaultValue: cur.md, features: { [F.AI]: false, [F.Toolbar]: false, [F.TopBar]: false }, featureConfigs: { [F.ImageBlock]: { onUpload: upload, blockOnUpload: upload, inlineOnUpload: upload, proxyDomURL: show }, [F.Placeholder]: { text: "Write, or type / for blocks" }, [F.Cursor]: { virtual: false } } });
    crepe.editor.use(ext.list);
    await crepe.create(); if (seq !== openSeq) { crepe.destroy(); return; } enable(true);
    crepe.on(l => l.markdownUpdated((ctx, md) => { if (!cur || md === cur.md) return; cur.md = md; updateCount(md); lsSet(draftKey(cur.path), JSON.stringify({ md, base: cur.base })); setStatus("unsaved…"); clearTimeout(timer); timer = setTimeout(save, 1200); }));
    if (draft) { if (draft.base === f.text) { setStatus("unsaved, restored from this device"); clearTimeout(timer); timer = setTimeout(save, 600); } else { cur.remoteSha = f.sha; showBanner(`This note changed on GitHub while you had unsaved edits on this device. <button type="button" class="nt-btn" data-a="over">Keep mine</button> <button type="button" class="nt-btn" data-a="reload">Load theirs</button>`); setStatus("conflict", true); } }
    else setStatus(cfg.remote ? "saved" : "saved in this browser");
  }

  /* ----- saving ----- */
  async function save(force) {
    clearTimeout(timer); if (!cur || cur.md === cur.base || saving) return; saving = true; const c = cur, md = c.md; setStatus("saving…");
    try { c.sha = await store().write(c.path, md, c.sha, `notes: ${baseName(c.path)}`); c.base = md; if (cur === c && c.md === md) lsSet(draftKey(c.path), null); setStatus(cfg.remote ? "saved" : "saved in this browser"); showBanner(""); }
    catch (e) {
      if (cfg.remote && (e.status === 409 || e.status === 422)) {   // the file changed on GitHub since we opened it
        try { const r = await remote.read(c.path); if (r && (r.text === c.base || force)) { c.sha = r.sha; saving = false; return save(); } if (r) { c.remoteSha = r.sha; showBanner(`This note changed on GitHub since you opened it. <button type="button" class="nt-btn" data-a="over">Keep mine</button> <button type="button" class="nt-btn" data-a="reload">Load theirs</button>`); setStatus("conflict", true); } } catch {}
      } else setStatus(e.status === 0 ? "unsaved, offline. Kept on this device" : e.status === 401 ? "NOT SYNCING: token rejected" : e.status === 403 ? "NOT SYNCING: token cannot write" : "not saved: " + e.message, true);
    }
    saving = false; if (cur === c && c.md !== c.base && !banner.innerHTML) { clearTimeout(timer); timer = setTimeout(save, c.retry = Math.min((c.retry || 1200) * 2, 30000)); } else if (cur === c) c.retry = 0;
  }
  async function flush() { if (cur && cur.md !== cur.base) { while (saving) await new Promise(r => setTimeout(r, 50)); await save(); } }

  /* ----- actions on notes ----- */
  async function newNote() {
    await flush(); const dir = selDir || (cur ? dirOf(cur.path) : ""); let n = "Untitled", i = 2; const has = p => files.includes(p); while (has((dir ? dir + "/" : "") + n + ".md")) n = "Untitled " + i++;
    const path = (dir ? dir + "/" : "") + n + ".md"; try { await store().write(path, "\n", null, `notes: new ${n}`); } catch (e) { setStatus("could not create: " + e.message, true); return; }
    files.push(path); await open(path); titleEl.focus(); titleEl.select();
  }
  async function rename() {
    if (!cur) return; let n = titleEl.value.trim().replace(/[\\/:*?"<>|]/g, "-"); if (!n || n === baseName(cur.path)) { titleEl.value = baseName(cur.path); return; }
    const e = /\.html$/i.test(cur.path) ? ".html" : ".md", from = cur.path, to = (dirOf(from) ? dirOf(from) + "/" : "") + n + e; if (files.includes(to)) { setStatus("a note with that name exists", true); titleEl.value = baseName(from); return; }
    try { await flush(); const text = cur.md; const sha = await store().write(to, text, null, `notes: rename ${baseName(from)}`); await store().remove(from, cur.sha, `notes: rename ${baseName(from)}`); files = files.filter(p => p !== from).concat(to); tabs = tabs.map(p => (p === from ? to : p)); saveTabs(); cur.path = to; cur.sha = sha; cur.base = text; titleEl.value = baseName(to); renderList(); renderTabs(); setStatus("renamed"); }
    catch (x) { setStatus("could not rename: " + x.message, true); }
  }
  async function closeTab(p) {
    const wasCur = cur && cur.path === p; tabs = tabs.filter(t => t !== p); saveTabs();
    if (wasCur) { const next = tabs[tabs.length - 1]; if (next) return open(next); await flush(); cur = null; ++openSeq; await destroyEditor(); setTitle("", false); enable(false); renderList(); }
    renderTabs();
  }
  const relTo = (fromDir, target) => { const a = fromDir ? fromDir.split("/") : [], b = target.split("/"); let i = 0; while (i < a.length && i < b.length - 1 && a[i] === b[i]) i++; return [...a.slice(i).map(() => ".."), ...b.slice(i)].join("/"); };
  const rebase = (text, from, to) => (dirOf(from) === dirOf(to) ? text : text.replace(/(\]\()([^)\s]+)/g, (m, a, u) => (isRelative(u) ? a + relTo(dirOf(to), resolve(from, decodeURI(u))).replace(/ /g, "%20") : m)));
  async function moveFile(from, to) {   // copy then remove, so a failure never loses the note
    while (files.includes(to)) to = to.replace(/( \(\d+\))?(\.[^./]+)$/, (m, a, b) => ` (${a ? +a.slice(2, -1) + 1 : 2})${b}`);
    try { if (cur && cur.path === from) await flush(); const f = await store().read(from); if (!f) throw new Error("note not found"); const text = /\.md$/i.test(from) ? rebase(f.text, from, to) : f.text; await store().write(to, text, null, `notes: move ${baseName(from)}`); await store().remove(from, f.sha, `notes: move ${baseName(from)}`); }
    catch (e) { setStatus("could not move: " + e.message, true); return null; }
    files = files.filter(p => p !== from).concat(to); return to;
  }
  async function moveNote(from, toDir) {
    const to0 = (toDir ? toDir + "/" : "") + from.split("/").pop(); if (to0 === from) return; if (files.includes(to0)) { setStatus("that folder already has a note with this name", true); return; }
    const wasCur = cur && cur.path === from, to = await moveFile(from, to0); if (!to) return;
    tabs = tabs.map(p => (p === from ? to : p)); saveTabs(); if (toDir) fold.delete(toDir); renderList(); renderTabs(); if (wasCur) { cur = null; await open(to); }
  }
  const leave = () => { picked.clear(); selecting = false; };
  const uniq = (to, taken) => { while (taken.has(to)) to = to.replace(/( \(\d+\))?(\.[^./]+)$/, (m, a, b) => ` (${a ? +a.slice(2, -1) + 1 : 2})${b}`); taken.add(to); return to; };
  const refsOf = (path, text) => { const out = []; text.replace(/\]\(([^)\s]+)/g, (m, u) => { if (isRelative(u)) { const r = resolve(path, decodeURI(u)); if (r.startsWith(FILES + "/")) out.push(r); } return m; }); return out; };
  async function commit(moves, dels, message) {   // show the result now; one commit follows; undo the screen if it fails
    files = files.filter(f => !moves.some(m => m[0] === f) && !dels.includes(f)).concat(moves.map(m => m[1]));
    const gone = new Set(moves.map(m => m[0]).concat(dels)); let closed = false; tabs = tabs.filter(t => { if (gone.has(t)) { if (cur && cur.path === t) closed = true; return false; } return true; }); saveTabs();
    gone.forEach(g => lsSet(draftKey(g), null)); if (closed) { cur = null; ++openSeq; await destroyEditor(); setTitle("", false); enable(false); const next = tabs[tabs.length - 1]; if (next) open(next); }
    renderList(); renderTabs(); setStatus("saving…");
    try { await store().batch(moves, dels, message); setStatus(cfg.remote ? "saved" : "saved in this browser"); } catch (e) { setStatus("could not save the change: " + e.message, true); await refresh(); }
  }
  async function trashPicked() {   // nothing is destroyed: notes go to the Trash folder and can be restored
    await flush(); const docs = picksToDocs(), dirs = [...picked].filter(k => !isDoc(k)), keeps = files.filter(f => f.endsWith("/" + KEEP) && dirs.some(d => f.startsWith(d + "/"))), taken = new Set(files);
    leave(); if (dirs.some(d => selDir === d || selDir.startsWith(d + "/"))) selDir = ""; await commit(docs.map(p => [p, uniq(TRASH + "/" + p, taken)]), keeps, `notes: trash ${docs.length}`);
  }
  async function restorePicked() {
    await flush(); const docs = picksToDocs().filter(isTrash), taken = new Set(files); picked.clear(); await commit(docs.map(p => [p, uniq(p.slice(TRASH.length + 1), taken)]), [], `notes: restore ${docs.length}`);
  }
  async function purgePicked() {   // the only permanent delete; pictures no other note uses go with it
    const docs = picksToDocs().filter(isTrash); picked.clear(); purgeArm = 0; let dels = docs.slice();
    if (cfg.remote) {
      setStatus("deleting…"); const orig = p => p.slice(TRASH.length + 1), refs = new Set(), used = new Set(), mds = f => /\.md$/i.test(f) && !f.startsWith(FILES + "/");
      try { const read = async list => (await Promise.all(list.map(async q => [q, await store().read(q).catch(() => null)]))).filter(x => x[1]);
        (await read(docs.filter(mds))).forEach(([q, f]) => refsOf(orig(q), f.text).forEach(r => refs.add(r)));
        if (refs.size) { (await read(files.filter(f => mds(f) && !docs.includes(f)))).forEach(([q, f]) => refsOf(isTrash(q) ? orig(q) : q, f.text).forEach(r => used.add(r))); refs.forEach(r => { if (!used.has(r) && files.includes(r)) dels.push(r); }); } }
      catch (e) { setStatus("could not delete: " + e.message, true); return; }
    }
    await commit([], dels, `notes: delete ${docs.length}`);
  }
  async function newFolder(name) {
    name = name.trim().replace(/[\\:*?"<>|]/g, "-").replace(/^\/+|\/+$/g, ""); if (!name) return; const dir = (selDir ? selDir + "/" : "") + name, path = dir + "/" + KEEP;
    if (files.includes(path)) return; try { await store().write(path, "", null, `notes: new folder ${name}`); } catch (e) { setStatus("could not create folder: " + e.message, true); return; }
    files.push(path); selDir = dir; fold.delete(dir); renderList();
  }
  function askFolder() {
    if (listEl.querySelector(".nt-newdir")) return; const row = document.createElement("div"); row.className = "nt-row-i nt-newdir"; row.innerHTML = `${ic("folder", 1.6)}<input placeholder="Folder name" spellcheck="false" autocomplete="off">`; listEl.prepend(row); const inp = row.querySelector("input"); inp.focus();
    let done = false; const end = async ok => { if (done) return; done = true; const v = inp.value; row.remove(); if (ok && v.trim()) await newFolder(v); };
    inp.addEventListener("keydown", e => { if (e.key === "Enter") end(true); else if (e.key === "Escape") end(false); }); inp.addEventListener("blur", () => end(true));
  }
  async function attach(file) {
    if (!cur || !crepe || !file) return; if (/^image\//.test(file.type)) return addPicture(file); setStatus("uploading…");
    try { let href; if (cfg.remote) { const repoPath = `${FILES}/${new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "")}-${slug(file.name)}${file.name.includes(".") ? file.name.slice(file.name.lastIndexOf(".")).toLowerCase() : ""}`; if (file.size > 25e6) throw new Error("that file is over 25 MB"); await remote.putBlob(repoPath, file, "notes: add file"); href = rel(cur.path, repoPath); } else { if (file.size > 1e6) throw new Error("connect GitHub to attach files over 1 MB"); href = await readAsDataURL(file); }
      crepe.editor.action(ext.kit.insert(`[${file.name}](${href.replace(/ /g, "%20")})`)); setStatus("unsaved…"); }
    catch (e) { setStatus("not attached: " + e.message, true); }
  }
  async function pasteImage() {   // for phones, where the keyboard cannot paste a picture into the page
    try { for (const it of await navigator.clipboard.read()) { const t = it.types.find(x => x.startsWith("image/")); if (t) { const blob = await it.getType(t); return addPicture(new File([blob], "pasted." + t.split("/")[1], { type: t })); } } setStatus("No picture on the clipboard", true); }
    catch (e) { setStatus("Allow clipboard access, or choose a photo", true); }
  }
  async function addPicture(file) {
    if (!cur || !crepe || !file) return; setStatus("uploading picture…");
    try { const href = await upload(file); crepe.editor.action(ext.kit.insert(`![1](${href.replace(/ /g, "%20")})`)); setStatus("unsaved…"); } catch (e) { setStatus("picture not added: " + e.message, true); }
  }
  // a link to a file in the private repo opens through the token; other links behave normally
  edEl.addEventListener("click", async e => { const a = e.target.closest("a[href]"); if (!a || !cur) return; const h = a.getAttribute("href"); if (!isRelative(h) || !cfg.remote) return; e.preventDefault(); try { const b = await remote.blob(resolve(cur.path, decodeURI(h))); window.open(URL.createObjectURL(b), "_blank"); } catch (x) { setStatus("could not open the file: " + x.message, true); } });

  /* ----- export ----- */
  const xmenu = $(".nt-xmenu"), download = (name, blob) => { const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); };
  async function exportMd() {
    if (!cur) return; let md = cur.md;
    if (cfg.remote) {   // pictures live in the private repo, so write them into the file itself
      const re = /(!\[[^\]]*\]\()([^)\s]+)((?:\s+"[^"]*")?\))/g, jobs = [];
      md.replace(re, (m, a, u) => { if (isRelative(u)) jobs.push(u); return m; });
      const map = {}; setStatus("preparing the file…");
      await Promise.all([...new Set(jobs)].map(async u => { try { map[u] = await readAsDataURL(await remote.blob(resolve(cur.path, decodeURI(u)))); } catch {} }));
      md = md.replace(re, (m, a, u, z) => (map[u] ? a + map[u] + z : m)); setStatus("saved");
    }
    download(baseName(cur.path) + ".md", new Blob([md], { type: "text/markdown;charset=utf-8" }));
  }
  function exportPdf() {   // the page prints only the note (see the print rules in the stylesheet); choose "Save as PDF" in the dialog
    if (!cur) return; const was = document.title; document.title = baseName(cur.path); root.classList.add("printing"); document.documentElement.classList.add("nt-print");
    const done = () => { document.title = was; root.classList.remove("printing"); document.documentElement.classList.remove("nt-print"); removeEventListener("afterprint", done); }; addEventListener("afterprint", done); setTimeout(() => print(), 60);
  }
  xmenu.addEventListener("click", e => { const b = e.target.closest("[data-x]"); if (!b) return; xmenu.hidden = true; b.dataset.x === "md" ? exportMd() : exportPdf(); });
  document.addEventListener("pointerdown", e => { if (!xmenu.hidden && !e.target.closest(".nt-xmenu,.nt-exp")) xmenu.hidden = true; });

  /* ----- comments: notes in the margin of your own text ----- */
  function commentBox(el, range, view) {   // el: the commented text (to edit it), or null for a new comment on `range`
    const type = crepe && (() => { let ty; crepe.editor.action(ctx => { ty = ext.cmt.type(ctx); }); return ty; })(); if (!type) return;
    const existing = el ? JSON.parse(decodeURIComponent(el.getAttribute("data-comment"))) : null, box = el || view.domAtPos(range.to).node, r = (el || (box.nodeType === 3 ? box.parentElement : box)).getBoundingClientRect(), mr = $(".nt-main").getBoundingClientRect();
    cpop.innerHTML = `<form class="nt-cf"><div class="nt-ch">${existing ? "Comment" : "Add a comment"}${existing && existing.d ? `<small>${esc(existing.d)}</small>` : ""}</div><textarea name="c" rows="3" placeholder="Write a note about this text…" spellcheck="true">${existing ? esc(existing.t) : ""}</textarea><div class="nt-row"><button class="nt-btn nt-go" type="submit">${existing ? "Save" : "Comment"}</button>${existing ? '<button type="button" class="nt-btn nt-bad" data-cdel>Delete</button>' : ""}<button type="button" class="nt-btn" data-ccancel>Cancel</button></div></form>`;
    cpop.hidden = false; cpop.style.left = Math.max(10, Math.min(r.left - mr.left, mr.width - 330)) + "px"; cpop.style.top = Math.min(r.bottom - mr.top + 8, mr.height - 220) + "px";
    const ta = cpop.querySelector("textarea"); ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length);
    cpop._ctx = { el, range, type, view };
  }
  function markSpan(view, pos, type, text) {   // the whole stretch of text carrying one comment
    const $p = view.state.doc.resolve(pos), par = $p.parent, base = $p.start(); let off = 0, from = -1, to = -1;
    par.forEach((child, o) => { const has = child.marks.some(m => m.type === type && m.attrs.text === text); if (has && o <= pos - base && pos - base <= o + child.nodeSize) { from = from < 0 ? o : from; to = o + child.nodeSize; } else if (has && from >= 0 && o === to) to = o + child.nodeSize; });
    return from < 0 ? null : { from: base + from, to: base + to };
  }
  cpop.addEventListener("submit", e => {
    e.preventDefault(); const c = cpop._ctx, text = cpop.querySelector("textarea").value.trim(); if (!c) return; const { view, type } = c;
    if (c.el) { const old = JSON.parse(decodeURIComponent(c.el.getAttribute("data-comment"))), rg = markSpan(view, view.posAtDOM(c.el, 0), type, old.t); if (rg) { let tr = view.state.tr.removeMark(rg.from, rg.to, type); if (text) tr = tr.addMark(rg.from, rg.to, type.create({ text, date: old.d })); view.dispatch(tr); } }
    else if (text) view.dispatch(view.state.tr.addMark(c.range.from, c.range.to, type.create({ text, date: new Date().toISOString().slice(0, 10) })));
    cpop.hidden = true; view.focus();
  });
  cpop.addEventListener("click", e => {
    const c = cpop._ctx; if (e.target.closest("[data-ccancel]")) { cpop.hidden = true; c && c.view.focus(); return; }
    if (e.target.closest("[data-cdel]") && c && c.el) { const old = JSON.parse(decodeURIComponent(c.el.getAttribute("data-comment"))), rg = markSpan(c.view, c.view.posAtDOM(c.el, 0), c.type, old.t); if (rg) c.view.dispatch(c.view.state.tr.removeMark(rg.from, rg.to, c.type)); cpop.hidden = true; c.view.focus(); }
  });
  cpop.addEventListener("keydown", e => { if (e.key === "Escape") { cpop.hidden = true; } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); cpop.querySelector("form").requestSubmit(); } });
  edEl.addEventListener("click", e => { const el = e.target.closest("[data-comment]"); if (el && crepe) { let v; crepe.editor.action(ctx => { v = ctx.get(ext.core.editorViewCtx); }); commentBox(el, null, v); } else if (!cpop.hidden && !e.target.closest(".nt-cpop")) cpop.hidden = true; });

  /* ----- the bottom toolbar ----- */
  const run = fn => { if (crepe) crepe.editor.action(ctx => fn(ctx, ctx.get(ext.core.editorViewCtx))); };
  const cmd = (c, payload) => run(ctx => ctx.get(ext.core.commandsCtx).call(c.key, payload));
  const refocus = () => run((c, v) => v.focus());
  function closePop() { pop.hidden = true; pop.innerHTML = ""; pop.dataset.for = ""; }
  function openPop(kind, btn, html) { if (!pop.hidden && pop.dataset.for === kind) return closePop(); pop.innerHTML = html; pop.dataset.for = kind; pop.hidden = false; const r = btn.getBoundingClientRect(), pr = pop.offsetParent ? pop.offsetParent.getBoundingClientRect() : { left: 0, top: 0, width: innerWidth }; pop.style.left = Math.max(8, Math.min(r.left - pr.left, pr.width - pop.offsetWidth - 8)) + "px"; }
  const setColor = c => run((ctx, v) => { const t = ext.col.type(ctx), { from, to, empty } = v.state.selection; let tr = v.state.tr; if (empty) { tr = c ? tr.addStoredMark(t.create({ color: c })) : tr.removeStoredMark(t); } else { tr = tr.removeMark(from, to, t); if (c) tr = tr.addMark(from, to, t.create({ color: c })); } v.dispatch(tr); v.focus(); });
  function tool(id, btn) {
    if (!crepe || !ext) return; const { cm, gfm } = ext;
    if (id !== "color" && id !== "link" && id !== "h") closePop();
    switch (id) {
      case "bold": return cmd(cm.toggleStrongCommand); case "ital": return cmd(cm.toggleEmphasisCommand); case "strike": return cmd(gfm.toggleStrikethroughCommand); case "code": return cmd(cm.toggleInlineCodeCommand);
      case "hl": return run((ctx, v) => { ext.cmds.toggleMark(ext.hl.type(ctx))(v.state, v.dispatch); v.focus(); });
      case "ul": return cmd(cm.wrapInBulletListCommand); case "ol": return cmd(cm.wrapInOrderedListCommand); case "quote": return cmd(cm.wrapInBlockquoteCommand); case "cblock": return cmd(cm.createCodeBlockCommand); case "hr": return cmd(cm.insertHrCommand);
      case "table": return cmd(gfm.insertTableCommand, { row: 3, col: 3 });
      case "math": return run(ctx => ext.kit.insert("$x$")(ctx)); case "mblock": return run(ctx => ext.kit.insert("$$\n\n$$")(ctx));
      case "img": return openPop("img", btn, `<button type="button" class="nt-pi" data-img="paste">Paste from clipboard</button><button type="button" class="nt-pi" data-img="file">Choose a photo</button>`); case "attach": return fileIn.click();
      case "h": return openPop("h", btn, ["Text", "Heading 1", "Heading 2", "Heading 3", "Heading 4"].map((t, i) => `<button type="button" class="nt-pi" data-h="${i}">${t}</button>`).join(""));
      case "color": return openPop("color", btn, `<div class="nt-sw">${COLORS.map(([n, c]) => `<button type="button" class="nt-dot" data-col="${c}" title="${n}" style="--c:${c}"></button>`).join("")}<button type="button" class="nt-dot nt-none" data-col="" title="Remove colour">${ic("x", 2)}</button></div>`);
      case "comment": return run((ctx, v) => { const sel = v.state.selection; if (sel.empty) { setStatus("Select some text first, then press Comment"); return; } commentBox(null, { from: sel.from, to: sel.to }, v); });
      case "link": return run((ctx, v) => { const sel = v.state.selection; if (sel.empty) { setStatus("Select some text first, then press Link"); return; } const m = v.state.doc.rangeHasMark(sel.from, sel.to, cm.linkSchema.type(ctx)); if (m) { cmd(cm.toggleLinkCommand); return; } const keep = { from: sel.from, to: sel.to }; openPop("link", btn, `<form class="nt-lf"><input name="u" placeholder="https://…" autocomplete="off" spellcheck="false" autocapitalize="off"><button class="nt-btn" type="submit">Link</button></form>`); pop.querySelector("input").focus(); pop._keep = keep; });
    }
  }
  toolsEl.addEventListener("mousedown", e => { if (e.target.closest(".nt-t")) e.preventDefault(); });   // keep the selection while the button is pressed
  toolsEl.addEventListener("click", e => { const b = e.target.closest("[data-tool]"); if (b && !toolsEl.classList.contains("off")) tool(b.dataset.tool, b); });
  pop.addEventListener("mousedown", e => { if (!e.target.closest("input")) e.preventDefault(); });
  pop.addEventListener("click", e => {
    const im = e.target.closest("[data-img]"); if (im) { closePop(); im.dataset.img === "paste" ? pasteImage() : picIn.click(); return; }
    const h = e.target.closest("[data-h]"), c = e.target.closest("[data-col]"); if (h) { const n = +h.dataset.h; n ? cmd(ext.cm.wrapInHeadingCommand, n) : cmd(ext.cm.turnIntoTextCommand); closePop(); refocus(); } else if (c) { setColor(c.dataset.col); closePop(); }
  });
  pop.addEventListener("submit", e => { e.preventDefault(); const u = pop.querySelector("input").value.trim(); if (u) { cmd(ext.cm.toggleLinkCommand, { href: /^[a-z][a-z0-9+.-]*:|^\//i.test(u) ? u : "https://" + u }); } closePop(); refocus(); });
  document.addEventListener("pointerdown", e => { if (!pop.hidden && !e.target.closest(".nt-pop,.nt-tools")) closePop(); if (!cpop.hidden && !e.target.closest(".nt-cpop,[data-comment],[data-tool=comment]")) cpop.hidden = true; });
  document.addEventListener("keydown", e => { if (e.key === "Escape" && !pop.hidden) { closePop(); refocus(); } });

  /* ----- clicks ----- */
  root.addEventListener("click", async e => {
    const x = e.target.closest("[data-close]"); if (x) { e.stopPropagation(); closeTab(x.dataset.close); return; }
    const tb = e.target.closest(".nt-tab"); if (tb) { if (!cur || cur.path !== tb.dataset.tab) open(tb.dataset.tab); return; }
    const dir = e.target.closest("[data-dir]"); if (dir) { const d = dir.dataset.dir; if (selDir === d) { fold.has(d) ? fold.delete(d) : fold.add(d); saveFold(); } else { selDir = d; fold.delete(d); saveFold(); } renderList(); return; }
    const sb = e.target.closest("[data-sb]"); if (sb) { const k = sb.dataset.sb;
      if (k === "cancel") { leave(); renderList(); } else if (k === "trash") trashPicked(); else if (k === "restore") restorePicked();
      else if (k === "all") { const all = files.filter(isTrash); picked = picked.size === all.length ? new Set() : new Set(all); renderList(); }
      else if (k === "purge") { if (!purgeArm) { purgeArm = setTimeout(() => { purgeArm = 0; drawSel(); }, 3000); drawSel(); } else { clearTimeout(purgeArm); purgePicked(); } } return; }
    if (selecting || view === "trash") { const row = e.target.closest(".nt-item,.nt-dir"); if (row) { const k = row.dataset.path || row.dataset.dir; picked.has(k) ? picked.delete(k) : picked.add(k); renderList(); return; } }
    const it = e.target.closest(".nt-item"); if (it) { selDir = dirOf(it.dataset.path); open(it.dataset.path); return; }
    const b = e.target.closest("[data-a]"); if (!b) return; const a = b.dataset.a;
    if (a === "export") xmenu.hidden = !xmenu.hidden; else if (a === "new") newNote(); else if (a === "side") nt.classList.toggle("nofiles"); else if (a === "folder") askFolder(); else if (a === "home") dispatchEvent(new CustomEvent("goto", { detail: "home" })); else if (a === "select") { selecting = !selecting; picked.clear(); renderList(); } else if (a === "trashview") { view = view === "trash" ? "notes" : "trash"; leave(); renderList(); }
    else if (a === "theme") { theme = nt.dataset.th === "dark" ? "light" : "dark"; lsSet(K_THEME, theme); nt.classList.add("nt-swap"); applyTheme(); requestAnimationFrame(() => requestAnimationFrame(() => nt.classList.remove("nt-swap"))); }
    else if (a === "gear") { conn.hidden = !conn.hidden; conn.elements.repo.value = cfg.repo; conn.elements.tok.value = ""; conn.elements.exp.value = lsGet(K_EXP); conn.elements.tok.placeholder = cfg.remote ? "token saved (paste a new one to replace)" : "token"; }
    else if (a === "disc") { lsSet(K_TOKEN, null); lsSet(K_EXP, null); syncwarn.seen("notes", "Notes", "notes", 200, null); conn.hidden = true; cur = null; tabs = []; saveTabs(); ++openSeq; await destroyEditor(); setTitle("", false); enable(false); await refresh(); }
    else if (a === "list") root.classList.remove("open"); else if (a === "over") { if (cur) { cur.sha = cur.remoteSha; showBanner(""); await save(true); } } else if (a === "reload") { const p = cur && cur.path; cur.md = cur.base; if (p) lsSet(draftKey(p), null); showBanner(""); if (p) open(p); }
  });
  conn.addEventListener("submit", async e => { e.preventDefault(); const r = conn.elements.repo.value.trim() || DEFAULT_REPO, t = conn.elements.tok.value.trim(); if (!/^[\w.-]+\/[\w.-]+$/.test(r)) { setStatus("the repo should look like owner/name", true); return; } lsSet(K_REPO, r); lsSet(K_EXP, conn.elements.exp.value || null); if (t) lsSet(K_TOKEN, t); conn.elements.tok.value = ""; conn.hidden = true; cur = null; ++openSeq; await destroyEditor(); setTitle("", false); enable(false); await refresh(); if (t) syncwarn.seen("notes", "Notes", "notes", 200, lsGet(K_EXP)); });
  listEl.addEventListener("keydown", e => { if (e.key === "Enter" && e.target === trashRow) { trashRow.click(); return; } const dr = e.target.closest(".nt-dir"); if (dr && e.target === dr && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); dr.click(); return; } const it = e.target.closest(".nt-item"); if (it && (e.key === "Enter" || e.key === " ") && e.target === it) { e.preventDefault(); open(it.dataset.path); } });
  listEl.addEventListener("dragstart", e => { const it = e.target.closest(".nt-item"); if (!it || selecting || view === "trash") return; e.dataTransfer.setData("text/plain", it.dataset.path); e.dataTransfer.effectAllowed = "move"; });
  const dropTarget = e => { const d = e.target.closest("[data-dir]"); return d ? d.dataset.dir : e.target.closest(".nt-item") ? null : ""; };
  listEl.addEventListener("dragover", e => { if (!e.dataTransfer.types.includes("text/plain")) return; const t = dropTarget(e); if (t === null) return; e.preventDefault(); listEl.querySelectorAll(".drop").forEach(x => x.classList.remove("drop")); (e.target.closest("[data-dir]") || listEl).classList.add("drop"); });
  listEl.addEventListener("dragleave", e => { if (!listEl.contains(e.relatedTarget)) listEl.querySelectorAll(".drop").forEach(x => x.classList.remove("drop")); });
  listEl.addEventListener("drop", e => { const t = dropTarget(e); listEl.querySelectorAll(".drop").forEach(x => x.classList.remove("drop")); const p = e.dataTransfer.getData("text/plain"); if (t === null || !p) return; e.preventDefault(); moveNote(p, t); });
  edEl.addEventListener("paste", e => { const cd = e.clipboardData || {}, f = [...(cd.files || [])].find(x => /^image\//.test(x.type)) || [...(cd.items || [])].map(i => (i.kind === "file" && /^image\//.test(i.type) ? i.getAsFile() : null)).find(Boolean); if (f) { e.preventDefault(); e.stopPropagation(); addPicture(f); } }, true);
  edEl.addEventListener("dragover", e => { if (e.dataTransfer && [...e.dataTransfer.types].includes("Files")) e.preventDefault(); }, true);
  edEl.addEventListener("drop", e => { const fs = [...((e.dataTransfer && e.dataTransfer.files) || [])]; if (!fs.length) return; e.preventDefault(); e.stopPropagation(); /^image\//.test(fs[0].type) ? addPicture(fs[0]) : attach(fs[0]); }, true);
  fileIn.addEventListener("change", () => { const f = fileIn.files[0]; fileIn.value = ""; attach(f); });
  picIn.addEventListener("change", () => { const f = picIn.files[0]; picIn.value = ""; addPicture(f); });
  titleEl.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); titleEl.blur(); crepe && crepe.editor.action(c => c.get(ext.core.editorViewCtx).focus()); } }); titleEl.addEventListener("change", rename); titleEl.addEventListener("input", sizeTitle); addEventListener("resize", sizeTitle);
  addEventListener("online", () => save());
  document.addEventListener("visibilitychange", () => { if (document.hidden) flush(); }); addEventListener("pagehide", () => { flush(); });
  const vv = window.visualViewport, fitV = () => { nt.style.setProperty("--vvh", (vv ? vv.height : innerHeight) + "px"); nt.style.setProperty("--vvt", (vv ? vv.offsetTop : 0) + "px"); document.body.classList.toggle("kbd", !!vv && innerHeight - vv.height > 140); }; if (vv) { vv.addEventListener("resize", fitV); vv.addEventListener("scroll", fitV); } fitV();
  const centre = () => run((ctx, v) => { try { const c = v.coordsAtPos(v.state.selection.head), r = scrollEl.getBoundingClientRect(), d = (c.top + c.bottom) / 2 - (r.top + r.height * 0.4); if (Math.abs(d) > 8) scrollEl.scrollBy({ top: d, behavior: "auto" }); } catch {} });
  edEl.addEventListener("input", () => requestAnimationFrame(centre)); edEl.addEventListener("keyup", e => { if (["Enter", "ArrowDown", "ArrowUp", "Backspace"].includes(e.key)) requestAnimationFrame(centre); });
  const fit = () => { if (nt.offsetParent) { const tb = document.getElementById("tabs"), r = tb && tb.getBoundingClientRect(); nt.style.setProperty("--nt-top", Math.round(r && r.height ? r.bottom + 8 : 56) + "px"); const sec = root.closest("#notes"); if (sec) document.documentElement.style.setProperty("--hm-top", Math.round(sec.getBoundingClientRect().top + scrollY) + "px"); } }; addEventListener("resize", fit); addEventListener("tab", () => setTimeout(fit, 30)); fit(); setTimeout(fit, 300);
  setTitle("", false); enable(false);
  refresh().then(() => { const last = tabs[tabs.length - 1]; if (last && files.includes(last) && innerWidth > 900) open(last); });
}
