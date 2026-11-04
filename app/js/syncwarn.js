// One shared warning for everything that syncs through a GitHub token (notes, gym log, journal, stickynote).
// A bar appears at the top of every tab when GitHub stops accepting the token, and a few days before a token expires.
const items = new Map(), DAYS = 7; let bar = null;
const dismissed = new Set(); try { JSON.parse(sessionStorage.getItem("sw.off") || "[]").forEach(k => dismissed.add(k)); } catch {}
function ensure() {
  if (bar) return bar; const st = document.createElement("style");
  st.textContent = `#syncWarn{position:fixed;top:0;left:0;right:0;z-index:9999;display:flex;flex-direction:column;gap:1px;font:13px/1.4 -apple-system,system-ui,sans-serif}
#syncWarn div{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:8px 14px;background:#b3261e;color:#fff} #syncWarn div.soon{background:#8a5a00}
#syncWarn span{flex:1;min-width:200px} #syncWarn button{font:inherit;color:#fff;background:rgba(255,255,255,.18);border:1px solid rgba(255,255,255,.4);border-radius:7px;padding:3px 10px;cursor:pointer} #syncWarn button:hover{background:rgba(255,255,255,.3)}`;
  document.head.appendChild(st); bar = document.createElement("section"); bar.id = "syncWarn"; bar.setAttribute("role", "alert"); document.body.appendChild(bar); return bar;
}
function draw() {
  const b = ensure(); b.textContent = "";
  for (const [k, it] of items) {
    if (dismissed.has(k)) continue; const d = document.createElement("div"); d.className = it.soon ? "soon" : ""; const s = document.createElement("span"); s.textContent = it.msg; d.appendChild(s);
    if (it.tab) { const g = document.createElement("button"); g.type = "button"; g.textContent = "Fix it"; g.onclick = () => dispatchEvent(new CustomEvent("goto", { detail: it.tab })); d.appendChild(g); }
    if (it.soon) { const x = document.createElement("button"); x.type = "button"; x.textContent = "Dismiss"; x.onclick = () => { dismissed.add(k); try { sessionStorage.setItem("sw.off", JSON.stringify([...dismissed])); } catch {} draw(); }; d.appendChild(x); }
    b.appendChild(d);
  }
}
const set = (k, it) => { const o = items.get(k); if (o && o.msg === it.msg) return; items.set(k, it); draw(); }, clear = k => { if (items.delete(k)) draw(); };
export const syncwarn = {
  // call after every GitHub response: source = "notes" or "gym log", what = what stops working, tab = where to fix it
  seen(source, what, tab, status, expiry) {
    if (status === 401) return set(source, { msg: `${what} stopped syncing: GitHub rejected the token. It has probably expired or been revoked. Make a new one and paste it in again.`, tab });
    if (status === 403) return set(source, { msg: `${what} cannot save to GitHub: the token has no write access to the repo (Contents: read and write).`, tab });
    if (status >= 200 && status < 300) { clear(source); this.expiring(source, what, tab, expiry); }
  },
  broken(source, what, tab, msg) { set(source, { msg: msg || `${what} is not syncing.`, tab }); },
  expiring(source, what, tab, when) {   // when: a Date, or the text of GitHub's token-expiration header
    const key = source + ":soon"; if (!when) return clear(key);
    let d = when instanceof Date ? when : new Date(String(when).replace(" UTC", "Z").replace(/ ([-+]\d\d)(\d\d)$/, "$1:$2").replace(" ", "T"));
    if (isNaN(d)) return clear(key); const days = Math.ceil((d - Date.now()) / 864e5);
    if (days > DAYS) return clear(key);
    set(key, { soon: true, tab, msg: days <= 0 ? `The GitHub token for ${what} has expired. Make a new one and paste it in again.` : `The GitHub token for ${what} expires in ${days} day${days === 1 ? "" : "s"} (${d.toLocaleDateString()}). Make a new one before then or syncing stops.` });
  },
};
export const EXPIRY_HEADER = "github-authentication-token-expiration";
