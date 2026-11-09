// T-minus: up to three things you are counting down to, shown under the day card on the Calendar page.
// Far away it reads in weeks and days, then days and hours, and on the last day in hours and minutes. Kept in this browser only.
import { esc } from "./util.js";

const KEY = "tminus", MAX = 3;
let edit = false, tick = 0;
const load = () => { try { const a = JSON.parse(localStorage.getItem(KEY)); return Array.isArray(a) ? a.slice(0, MAX) : []; } catch { return []; } };
const save = a => { try { localStorage.setItem(KEY, JSON.stringify(a.slice(0, MAX))); } catch {} };
const toLocal = iso => { const d = new Date(iso); if (isNaN(d)) return ""; const p = n => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };

export function tminusText(at, now = Date.now()) {
  const ms = new Date(at) - now; if (isNaN(ms)) return "";
  if (ms <= 0) return "now";
  const m = Math.floor(ms / 6e4), d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), mm = m % 60;
  if (d >= 7) return `${Math.floor(d / 7)}w ${d % 7}d`;
  if (d >= 1) return `${d}d ${h}h`;
  return h ? `${h}h ${mm}m` : `${mm}m`;
}

function rows() {
  const t = load();
  if (edit) return [...Array(MAX)].map((_, i) => `<div class="tm-row edit"><input type="text" data-tn="${i}" placeholder="What" maxlength="40" value="${esc((t[i] && t[i].name) || "")}" aria-label="Name ${i + 1}"><input type="datetime-local" data-ta="${i}" value="${t[i] ? toLocal(t[i].at) : ""}" aria-label="Date ${i + 1}"></div>`).join("");
  if (!t.length) return `<div class="tm-empty">Count down to up to three things.</div>`;
  return t.map(x => `<div class="tm-row"><b data-tt="${esc(x.at)}">${esc(tminusText(x.at))}</b><span>${esc(x.name || "")}</span></div>`).join("");
}
export const tminusHTML = () => `<div class="ag-t" id="agT"><div class="tm-h"><span>T-</span><button type="button" class="tm-b" data-tm="${edit ? "done" : "edit"}">${edit ? "Done" : load().length ? "Edit" : "Add"}</button></div><div class="tm-rows">${rows()}</div></div>`;

export function wireTminus(root) {
  const box = root.querySelector("#agT"); clearInterval(tick); if (!box) return;
  box.addEventListener("click", e => {
    const b = e.target.closest("[data-tm]"); if (!b) return;
    if (b.dataset.tm === "edit") edit = true;
    else {
      const out = []; box.querySelectorAll("[data-tn]").forEach(n => { const a = box.querySelector(`[data-ta="${n.dataset.tn}"]`).value; if (a && !isNaN(new Date(a))) out.push({ name: n.value.trim(), at: new Date(a).toISOString() }); }); save(out); edit = false;
    }
    const keep = box.parentElement, fresh = document.createElement("div"); fresh.innerHTML = tminusHTML(); keep.replaceChild(fresh.firstElementChild, box); wireTminus(root);
  });
  tick = setInterval(() => { if (!box.isConnected) { clearInterval(tick); return; } box.querySelectorAll("[data-tt]").forEach(b => (b.textContent = tminusText(b.dataset.tt))); }, 20000);
}
