// The Notes tab: a list of notes on the left and a rich-text editor (Milkdown Crepe) on the right.
// Notes are plain markdown files. With a GitHub token they live in your private notes repo (files at the top level, pictures and attachments in _files/);
// without one they are kept in this browser only, so the tab can be tried first. The editor loads from the web the first time the tab is opened.
const CREPE = "https://esm.sh/@milkdown/crepe@7.23.0", KIT = "https://esm.sh/@milkdown/kit@7.23.0/utils";
const CSS = ["https://esm.sh/@milkdown/crepe@7.23.0/lib/theme/common/style.css", "https://esm.sh/@milkdown/crepe@7.23.0/lib/theme/frame-dark/style.css", "https://esm.sh/katex@0.16.11/dist/katex.min.css"];
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
  async call(p, o = {}) { const r = await fetch(`https://api.github.com/repos/${cfg.repo}/${p}`, { cache: "no-store", ...o, headers: { Authorization: `Bearer ${cfg.token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", ...(o.headers || {}) } }).catch(() => { throw err(0, "offline"); }); return r; },
  async list() { const r = await this.call("git/trees/HEAD?recursive=1"); if (r.status === 409) return []; if (!r.ok) throw err(r.status); return (await r.json()).tree.filter(t => t.type === "blob").map(t => t.path); },
  async read(path) { const r = await this.call(`contents/${encPath(path)}`); if (r.status === 404) return null; if (!r.ok) throw err(r.status); const j = await r.json(); let text = j.content ? unb64(j.content) : ""; if (!j.content && j.size) { const raw = await this.call(`contents/${encPath(path)}`, { headers: { Accept: "application/vnd.github.raw+json" } }); text = await raw.text(); } return { text, sha: j.sha }; },
  async write(path, text, sha, message) { const r = await this.call(`contents/${encPath(path)}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message, content: b64(text), ...(sha ? { sha } : {}) }) }); if (!r.ok) throw err(r.status); return (await r.json()).content.sha; },
  async putBlob(path, blob, message) { const r = await this.call(`contents/${encPath(path)}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message, content: await blobToB64(blob) }) }); if (!r.ok) throw err(r.status); },
  async remove(path, sha, message) { const r = await this.call(`contents/${encPath(path)}`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message, sha }) }); if (!r.ok && r.status !== 404) throw err(r.status); },
  async blob(path) { const r = await this.call(`contents/${encPath(path)}`, { headers: { Accept: "application/vnd.github.raw+json" } }); if (!r.ok) throw err(r.status); return r.blob(); },
};
const local = {
  all() { try { return JSON.parse(lsGet(K_LOCAL)) || {}; } catch { return {}; } }, save(o) { if (!lsSet(K_LOCAL, JSON.stringify(o))) throw err(0, "this browser's storage is full"); },
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

export function initNotes(root) {
  root.innerHTML = `<div class="nt">
    <aside class="nt-side"><div class="nt-head"><b>Notes</b><span class="nt-mode"></span><button type="button" class="nt-btn" data-a="new" title="New note">+ New</button><button type="button" class="nt-btn" data-a="gear" title="Connect to GitHub" aria-label="Connect to GitHub">⚙</button></div>
      <form class="nt-conn" hidden><div class="nt-hint">Notes save to this repo. Paste a fine-grained token with <b>Contents: read and write</b> on that repo only; it stays in this browser.</div><input name="repo" placeholder="owner/repo" autocomplete="off" spellcheck="false" data-1p-ignore><input class="nt-tok" name="tok" placeholder="token" autocomplete="off" autocapitalize="off" spellcheck="false" data-1p-ignore data-lpignore="true"><div class="nt-row"><button type="submit" class="nt-btn">Save</button><button type="button" class="nt-btn" data-a="disc">Disconnect</button></div></form>
      <div class="nt-list"></div></aside>
    <div class="nt-main"><div class="nt-bar"><button type="button" class="nt-btn nt-toggle" data-a="list">☰</button><input class="nt-title" placeholder="Pick or create a note" spellcheck="false" disabled><span class="nt-status"></span><button type="button" class="nt-btn" data-a="attach" title="Attach a file" disabled>Attach</button><button type="button" class="nt-btn nt-del" data-a="del" title="Delete this note" disabled>Delete</button><input type="file" class="nt-file" hidden></div>
      <div class="nt-banner" hidden></div><div class="nt-ed"></div></div></div>`;
  const $ = s => root.querySelector(s), listEl = $(".nt-list"), titleEl = $(".nt-title"), statusEl = $(".nt-status"), edEl = $(".nt-ed"), banner = $(".nt-banner"), conn = $(".nt-conn"), modeEl = $(".nt-mode"), fileIn = $(".nt-file");
  let files = [], cur = null, crepe = null, mod = null, kit = null, timer = null, saving = false, openSeq = 0; const blobUrls = new Map();
  const setStatus = (t, bad) => { statusEl.textContent = t; statusEl.classList.toggle("bad", !!bad); };
  const showBanner = html => { banner.hidden = !html; banner.innerHTML = html || ""; };
  const enable = on => root.querySelectorAll(".nt-bar [data-a=attach], .nt-bar [data-a=del]").forEach(b => (b.disabled = !on)), setTitle = (v, on) => { titleEl.value = v; titleEl.disabled = !on; };
  const mode = () => { modeEl.textContent = cfg.remote ? "GitHub" : "this browser"; modeEl.title = cfg.remote ? cfg.repo : "not saved to GitHub yet"; };

  /* ----- list ----- */
  const isNote = p => /\.(md|html)$/i.test(p) && !p.startsWith(FILES + "/") && !p.startsWith(".");
  function renderList() {
    const notes = files.filter(isNote).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" })), groups = {};
    notes.forEach(p => (groups[dirOf(p)] ||= []).push(p));
    listEl.innerHTML = notes.length ? Object.keys(groups).sort().map(d => `${d ? `<div class="nt-folder">${esc(d)}</div>` : ""}${groups[d].map(p => `<button type="button" class="nt-item${cur && cur.path === p ? " on" : ""}" data-path="${esc(p)}">${esc(baseName(p))}${/\.html$/i.test(p) ? '<i>html</i>' : ""}</button>`).join("")}`).join("") : `<div class="nt-empty">No notes yet. Press + New.</div>`;
  }
  async function refresh() { mode(); try { files = await store().list(); setStatus(""); } catch (e) { files = []; setStatus(e.status === 401 ? "token not accepted" : e.status === 404 ? "repo not found, or the token has no access to it" : "could not reach GitHub: " + e.message, true); } renderList(); }

  /* ----- editor ----- */
  const rel = (notePath, repoPath) => { const up = dirOf(notePath) ? dirOf(notePath).split("/").map(() => "..").join("/") + "/" : ""; return up + repoPath; };
  const resolve = (notePath, url) => { const parts = dirOf(notePath) ? dirOf(notePath).split("/") : []; for (const seg of url.split("/")) { if (seg === "..") parts.pop(); else if (seg && seg !== ".") parts.push(seg); } return parts.join("/"); };
  const isRelative = u => !/^([a-z][a-z0-9+.-]*:|\/\/|#)/i.test(u);
  async function show(url) {   // a picture's address as the page can show it; pictures in a private repo are fetched with the token
    if (!isRelative(url) || !cur || !cfg.remote) return url; const p = resolve(cur.path, decodeURI(url));
    if (!blobUrls.has(p)) blobUrls.set(p, remote.blob(p).then(b => URL.createObjectURL(b)).catch(() => url)); return blobUrls.get(p);
  }
  async function upload(file) {
    const { blob, ext } = await prepareImage(file);
    if (!cfg.remote) return readAsDataURL(blob);
    const repoPath = `${FILES}/${new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "")}-${slug(file.name)}.${ext}`; await remote.putBlob(repoPath, blob, "notes: add picture"); blobUrls.set(repoPath, Promise.resolve(URL.createObjectURL(blob)));
    return rel(cur.path, repoPath);
  }
  async function engine() {
    if (mod) return; for (const h of CSS) { const l = document.createElement("link"); l.rel = "stylesheet"; l.href = h; document.head.appendChild(l); }
    [mod, kit] = await Promise.all([import(CREPE), import(KIT)]);
  }
  async function destroyEditor() { clearTimeout(timer); if (crepe) { try { await crepe.destroy(); } catch {} crepe = null; } edEl.textContent = ""; }
  async function open(path) {
    const seq = ++openSeq; await flush(); showBanner(""); setStatus("opening…"); let f;
    try { f = await store().read(path); } catch (e) { setStatus("could not open: " + e.message, true); return; } if (!f) { setStatus("that note is gone", true); await refresh(); return; }
    await destroyEditor(); if (seq !== openSeq) return; cur = { path, sha: f.sha, base: f.text, md: f.text }; setTitle(baseName(path), true); enable(true); renderList(); root.classList.add("open");
    if (/\.html$/i.test(path)) { const fr = document.createElement("iframe"); fr.className = "nt-frame"; fr.setAttribute("sandbox", "allow-scripts"); fr.srcdoc = f.text; edEl.appendChild(fr); setStatus("web page (view only)"); return; }
    try { await engine(); } catch (e) { setStatus("the editor could not load (needs internet): " + e.message, true); return; } if (seq !== openSeq) return;
    const { Crepe } = mod; crepe = new Crepe({ root: edEl, defaultValue: f.text, features: { [Crepe.Feature.AI]: false }, featureConfigs: { [Crepe.Feature.ImageBlock]: { onUpload: upload, blockOnUpload: upload, inlineOnUpload: upload, proxyDomURL: show }, [Crepe.Feature.Placeholder]: { text: "Write something, or press / for blocks…" } } });
    await crepe.create(); if (seq !== openSeq) { crepe.destroy(); return; }
    crepe.on(l => l.markdownUpdated((ctx, md) => { if (!cur || md === cur.md) return; cur.md = md; setStatus("unsaved…"); clearTimeout(timer); timer = setTimeout(save, 1500); }));
    setStatus(cfg.remote ? "saved" : "saved in this browser");
  }

  /* ----- saving ----- */
  async function save(force) {
    clearTimeout(timer); if (!cur || cur.md === cur.base || saving) return; saving = true; const c = cur, md = c.md; setStatus("saving…");
    try { c.sha = await store().write(c.path, md, c.sha, `notes: ${baseName(c.path)}`); c.base = md; setStatus(cfg.remote ? "saved" : "saved in this browser"); showBanner(""); }
    catch (e) {
      if (cfg.remote && (e.status === 409 || e.status === 422)) {   // the file changed on GitHub since we opened it
        try { const r = await remote.read(c.path); if (r && (r.text === c.base || force)) { c.sha = r.sha; saving = false; return save(); } if (r) { c.remoteSha = r.sha; showBanner(`This note changed on GitHub since you opened it. <button type="button" class="nt-btn" data-a="over">Keep mine</button> <button type="button" class="nt-btn" data-a="reload">Load theirs</button>`); setStatus("conflict", true); } } catch {}
      } else setStatus(e.status === 401 || e.status === 403 ? "token cannot write to this repo" : "not saved: " + e.message, true);
    }
    saving = false; if (cur === c && c.md !== c.base && !banner.innerHTML) { clearTimeout(timer); timer = setTimeout(save, 1500); }
  }
  async function flush() { if (cur && cur.md !== cur.base) { while (saving) await new Promise(r => setTimeout(r, 50)); await save(); } }

  /* ----- actions ----- */
  async function newNote() {
    await flush(); const dir = cur ? dirOf(cur.path) : ""; let n = "Untitled", i = 2; const has = p => files.includes(p); while (has((dir ? dir + "/" : "") + n + ".md")) n = "Untitled " + i++;
    const path = (dir ? dir + "/" : "") + n + ".md"; try { await store().write(path, "\n", null, `notes: new ${n}`); } catch (e) { setStatus("could not create: " + e.message, true); return; }
    files.push(path); await open(path); titleEl.focus(); titleEl.select();
  }
  async function rename() {
    if (!cur) return; let n = titleEl.value.trim().replace(/[\\:*?"<>|]/g, "-").replace(/^\/+|\/+$/g, ""); if (!n || n === baseName(cur.path)) { titleEl.value = baseName(cur.path); return; }
    const ext = /\.html$/i.test(cur.path) ? ".html" : ".md", from = cur.path, to = (n.includes("/") ? "" : dirOf(from) ? dirOf(from) + "/" : "") + n + ext; if (files.includes(to)) { setStatus("a note with that name exists", true); titleEl.value = baseName(from); return; }
    try { await flush(); const text = cur.md; const sha = await store().write(to, text, null, `notes: rename ${baseName(from)}`); await store().remove(from, cur.sha, `notes: rename ${baseName(from)}`); files = files.filter(p => p !== from).concat(to); cur.path = to; cur.sha = sha; cur.base = text; titleEl.value = baseName(to); renderList(); setStatus("renamed"); }
    catch (e) { setStatus("could not rename: " + e.message, true); }
  }
  async function del() {
    if (!cur || !confirm(`Delete "${baseName(cur.path)}"? ${cfg.remote ? "The file stays in the repo's history." : "This cannot be undone."}`)) return;
    try { await store().remove(cur.path, cur.sha, `notes: delete ${baseName(cur.path)}`); } catch (e) { setStatus("could not delete: " + e.message, true); return; }
    files = files.filter(p => p !== cur.path); cur = null; ++openSeq; await destroyEditor(); setTitle("", false); enable(false); renderList(); setStatus("deleted"); root.classList.remove("open");
  }
  async function attach(file) {
    if (!cur || !crepe || !file) return; setStatus("uploading…");
    try { let href; if (cfg.remote) { const repoPath = `${FILES}/${new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "")}-${slug(file.name)}${file.name.includes(".") ? file.name.slice(file.name.lastIndexOf(".")).toLowerCase() : ""}`; if (file.size > 25e6) throw new Error("that file is over 25 MB"); await remote.putBlob(repoPath, file, "notes: add file"); href = rel(cur.path, repoPath); } else { if (file.size > 1e6) throw new Error("connect GitHub to attach files over 1 MB"); href = await readAsDataURL(file); }
      crepe.editor.action(kit.insert(`[${file.name}](${href.replace(/ /g, "%20")})`)); setStatus("unsaved…"); }
    catch (e) { setStatus("not attached: " + e.message, true); }
  }
  // a link to a file in the private repo opens through the token; other links behave normally
  edEl.addEventListener("click", async e => { const a = e.target.closest("a[href]"); if (!a || !cur) return; const h = a.getAttribute("href"); if (!isRelative(h) || !cfg.remote) return; e.preventDefault(); try { const b = await remote.blob(resolve(cur.path, decodeURI(h))); window.open(URL.createObjectURL(b), "_blank"); } catch (x) { setStatus("could not open the file: " + x.message, true); } });

  root.addEventListener("click", async e => {
    const it = e.target.closest(".nt-item"); if (it) { open(it.dataset.path); return; }
    const b = e.target.closest("[data-a]"); if (!b) return; const a = b.dataset.a;
    if (a === "new") newNote(); else if (a === "del") del(); else if (a === "attach") fileIn.click(); else if (a === "gear") { conn.hidden = !conn.hidden; conn.elements.repo.value = cfg.repo; conn.elements.tok.value = ""; conn.elements.tok.placeholder = cfg.remote ? "token saved (paste a new one to replace)" : "token"; }
    else if (a === "disc") { lsSet(K_TOKEN, null); conn.hidden = true; cur = null; ++openSeq; await destroyEditor(); setTitle("", false); enable(false); await refresh(); }
    else if (a === "list") root.classList.toggle("open"); else if (a === "over") { if (cur) { cur.sha = cur.remoteSha; showBanner(""); await save(true); } } else if (a === "reload") { const p = cur && cur.path; cur.md = cur.base; showBanner(""); if (p) open(p); }
  });
  conn.addEventListener("submit", async e => { e.preventDefault(); const r = conn.elements.repo.value.trim() || DEFAULT_REPO, t = conn.elements.tok.value.trim(); if (!/^[\w.-]+\/[\w.-]+$/.test(r)) { setStatus("the repo should look like owner/name", true); return; } lsSet(K_REPO, r); if (t) lsSet(K_TOKEN, t); conn.elements.tok.value = ""; conn.hidden = true; cur = null; ++openSeq; await destroyEditor(); setTitle("", false); enable(false); await refresh(); });
  fileIn.addEventListener("change", () => { const f = fileIn.files[0]; fileIn.value = ""; attach(f); });
  titleEl.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); titleEl.blur(); } }); titleEl.addEventListener("change", rename);
  document.addEventListener("visibilitychange", () => { if (document.hidden) flush(); }); addEventListener("pagehide", () => { flush(); });
  refresh();
}
