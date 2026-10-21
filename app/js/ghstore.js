// Read and write one file in a private GitHub repo through the contents API, straight from the browser.
// The repo name and a fine-grained token (limited to that one repo, Contents: read and write) are kept in this browser's localStorage.
// Used for the gym log so your phone and your Mac share the same sets, with full history in git.
const R = "gh.repo", T = "gh.token";
const get = k => { try { return localStorage.getItem(k) || ""; } catch { return ""; } };
export const gh = {
  get repo() { return get(R); }, get token() { return get(T); }, get on() { return !!(get(R) && get(T)); },
  set(repo, token) { try { localStorage.setItem(R, repo.trim()); localStorage.setItem(T, token.trim()); } catch {} },
  clear() { try { localStorage.removeItem(R); localStorage.removeItem(T); } catch {} },
};
const err = (status, msg) => Object.assign(new Error(msg || "HTTP " + status), { status });
const hdr = () => ({ Authorization: `Bearer ${gh.token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" });
const b64 = s => btoa(unescape(encodeURIComponent(s))), unb64 = s => decodeURIComponent(escape(atob(s.replace(/\n/g, ""))));
const url = p => `https://api.github.com/repos/${gh.repo}${p ? "/" + p : ""}`;   // no trailing slash: GitHub answers that with a response browsers refuse to read

export async function ghCheck() {   // can this token see the repo and write to it?
  const r = await fetch(url(""), { headers: hdr(), cache: "no-store" }).catch(() => { throw err(0, "offline"); });
  if (!r.ok) throw err(r.status);
  const j = await r.json(); if (j.permissions && !j.permissions.push) throw err(403, "read-only token");
  return j.private;
}
export async function ghRead(path) {   // {text, sha} or null when the file doesn't exist yet
  const r = await fetch(url(`contents/${path}?t=${Date.now()}`), { headers: hdr(), cache: "no-store" }).catch(() => { throw err(0, "offline"); });
  if (r.status === 404) return null;
  if (!r.ok) throw err(r.status);
  const j = await r.json(); return { text: unb64(j.content), sha: j.sha };
}
export async function ghWrite(path, text, sha, message) {   // returns the new sha; throws status 409 or 422 when the file changed underneath us
  const r = await fetch(url(`contents/${path}`), { method: "PUT", headers: { ...hdr(), "Content-Type": "application/json" }, body: JSON.stringify({ message, content: b64(text), ...(sha ? { sha } : {}) }) }).catch(() => { throw err(0, "offline"); });
  if (!r.ok) throw err(r.status);
  return (await r.json()).content.sha;
}
export const ghMessage = e => e.status === 401 ? "GitHub rejected the token. Make a new one and reconnect."
  : e.status === 403 ? "The token can't write to that repo (it needs Contents: read and write)."
  : e.status === 404 ? "Repo not found, or the token can't see it. Check the name and the token's repository access."
  : e.status === 0 ? "Can't reach GitHub right now. Check your connection, or an ad blocker or privacy extension blocking api.github.com." : "GitHub error " + e.status;
