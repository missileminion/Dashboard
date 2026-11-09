// T-minus: up to three things you are counting down to, shown under the day card on the Calendar page.
// Far away it reads in weeks and days, then days and hours, and on the last day in hours and minutes. Kept in this browser only.
import { esc } from "./util.js";

const KEY = "tminus", MAX = 3;
let edit = false, tick = 0, source = null, choices = null;
export const setTminusSource = fn => { source = fn; };   // the calendar gives us its upcoming events to pick from
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

const dayLabel = iso => { const d = new Date(iso); return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }); };
function optionsFor(x) {   // upcoming calendar events, plus the one already chosen even if it is not in the list any more
  const l = (choices || []).map(e => ({ id: e.id, label: `${dayLabel(e.at)} · ${e.title}`, e })); if (x && x.eid && !l.some(o => o.id === x.eid)) l.unshift({ id: x.eid, label: `${dayLabel(x.at)} · ${x.name}`, e: { id: x.eid, title: x.name, at: x.at } });
  return l;
}
function rows() {
  const t = load();
  if (edit) return [...Array(MAX)].map((_, i) => { const x = t[i], list = optionsFor(x), custom = !!x && !x.eid;
    return `<div class="tm-row edit"><select data-ts="${i}" aria-label="Thing ${i + 1}"><option value="">Nothing</option>${list.map(o => `<option value="${esc(o.id)}"${x && x.eid === o.id ? " selected" : ""}>${esc(o.label)}</option>`).join("")}<option value="c"${custom ? " selected" : ""}>Custom date…</option></select><span class="tm-cu"${custom ? "" : " hidden"}><input type="text" data-tn="${i}" placeholder="What" maxlength="40" value="${esc((custom && x.name) || "")}" aria-label="Name ${i + 1}"><input type="datetime-local" data-ta="${i}" value="${custom ? toLocal(x.at) : ""}" aria-label="Date ${i + 1}"></span></div>`; }).join("");
  if (!t.length) return `<div class="tm-empty">Count down to up to three things.</div>`;
  return t.map(x => `<div class="tm-row"><b data-tt="${esc(x.at)}">${esc(tminusText(x.at))}</b><span>${esc(x.name || "")}</span></div>`).join("");
}
export const tminusHTML = () => `<div class="ag-t" id="agT"><div class="tm-h"><span>T-</span><button type="button" class="tm-b" data-tm="${edit ? "done" : "edit"}">${edit ? "Done" : load().length ? "Edit" : "Add"}</button></div><div class="tm-rows">${rows()}</div></div>`;

const redraw = (box, root) => { const keep = box.parentElement, fresh = document.createElement("div"); fresh.innerHTML = tminusHTML(); keep.replaceChild(fresh.firstElementChild, box); wireTminus(root); };
export function wireTminus(root) {
  const box = root.querySelector("#agT"); clearInterval(tick); if (!box) return;
  box.addEventListener("change", e => { const sel = e.target.closest("[data-ts]"); if (sel) sel.parentElement.querySelector(".tm-cu").hidden = sel.value !== "c"; });
  box.addEventListener("click", async e => {
    const b = e.target.closest("[data-tm]"); if (!b) return;
    if (b.dataset.tm === "edit") { edit = true; redraw(box, root); if (source) { try { choices = await source(); } catch { choices = choices || []; } const now = root.querySelector("#agT"); if (edit && now) redraw(now, root); } return; }
    const old = load(), out = [];
    box.querySelectorAll("[data-ts]").forEach(sel => {
      const i = +sel.dataset.ts, v = sel.value; if (!v) return;
      if (v === "c") { const a = box.querySelector(`[data-ta="${i}"]`).value, name = box.querySelector(`[data-tn="${i}"]`).value.trim(); if (a && !isNaN(new Date(a))) out.push({ name, at: new Date(a).toISOString() }); return; }
      const o = optionsFor(old[i]).find(x => x.id === v); if (o) out.push({ name: o.e.title, at: o.e.at, eid: v });
    });
    save(out); edit = false; redraw(box, root);
  });
  // a task you picked follows the calendar: if it is moved or postponed, the count follows it
  if (!edit && source && load().some(x => x.eid)) source().then(list => { const t = load(); let ch = false; t.forEach(x => { const f = x.eid && list.find(y => y.id === x.eid); if (f && f.at !== x.at) { x.at = f.at; x.name = f.title; ch = true; } }); if (ch) { save(t); const now = root.querySelector("#agT"); if (now && !edit) redraw(now, root); } }).catch(() => {});
  tick = setInterval(() => { if (!box.isConnected) { clearInterval(tick); return; } box.querySelectorAll("[data-tt]").forEach(b => (b.textContent = tminusText(b.dataset.tt))); }, 20000);
}
