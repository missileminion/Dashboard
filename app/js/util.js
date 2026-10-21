export const $ = id => document.getElementById(id);
export const nn = a => a.filter(v => v != null && !Number.isNaN(v));
export const mean = a => { a = nn(a); return a.length ? a.reduce((x, y) => x + y, 0) / a.length : null; };
export const sum = a => { a = nn(a); return a.length ? a.reduce((x, y) => x + y, 0) : null; };
export const sd = a => { a = nn(a); if (a.length < 7) return null; const m = mean(a); return Math.sqrt(mean(a.map(v => (v - m) ** 2))); };
export const ymd = d => d.toLocaleDateString("sv");
export const addDays = (s, n) => { const d = new Date(s + "T12:00:00"); d.setDate(d.getDate() + n); return ymd(d); };
export const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
export const f = (v, d = 0) => (v == null ? "—" : Number(v).toFixed(d));
export const hm = min => (min == null ? "—" : `${Math.floor(min / 60)}h ${String(Math.round(min % 60)).padStart(2, "0")}m`);
export const mmss = sec => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, "0")}`;
export const pad = n => String(n).padStart(2, "0");
export const dayLabel = d => new Date(d + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", day: "numeric", month: "short" });

// Tile helpers. A delta only shows when both values exist; colour never stands alone (arrow + words + unit).
export function delta(now, then, unit, higherIsBetter, basis, dec = 0) {
  if (now == null || then == null) return `<div class="basis">${basis}: not enough data</div>`;
  const d = now - then, up = d >= 0, flat = Math.abs(d) < Math.pow(10, -dec) / 2;
  const good = higherIsBetter === null || flat ? null : up === higherIsBetter;
  const cls = good === null ? "neutral" : good ? "better" : "worse";
  return `<div class="d ${cls}">${flat ? "■ no change" : `${up ? "▲" : "▼"} ${n3(Math.abs(d))} ${unit}`}</div><div class="basis">${basis}</div>`;
}
const ibtn = k => (k ? `<span class="i" data-i="${k}" role="button" tabindex="0" aria-label="More information">i</span>` : "");
export const info = ibtn;
export const tile = (l, v, u, dl, extra = "", key = "", red = false) => `<div class="card ${extra}">${ibtn(key)}<div class="lbl">${l}</div><div class="val ${v == null ? "gap" : red ? "worse" : ""}">${v == null ? "—" : v}<small>${u}</small></div>${dl}</div>`;
export const slot = (l, hint = "", key = "") => `<div class="card slot">${ibtn(key)}<div class="lbl">${l}</div><div class="val">—</div>${hint ? `<div class="basis">${hint}</div>` : ""}</div>`;

// Three significant figures in a fixed 00.0 pattern, so numbers line up: 5.2 -> "05.2", 0.4 -> "00.4", 21.3 -> "21.3", 123 -> "123".
export const n3 = x => { if (x == null || Number.isNaN(x)) return "—"; const a = Math.abs(x); return a >= 99.95 ? String(Math.round(a)).padStart(3, "0") : a.toFixed(1).padStart(4, "0"); };

// true on the published copy (GitHub Pages), where there is no local server to write files; notes and lifts then live in this browser only
export const HOSTED = !["localhost", "127.0.0.1", "[::1]"].includes(location.hostname);
