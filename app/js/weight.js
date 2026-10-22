// Body weight log: one number per day, kept in this browser. Entry lives on the Gym log page; the Health page only displays the trend. The latest value feeds the strength journey.
import { esc, ymd, addDays } from "./util.js";
const KEY = "weightlog.v1";
export const loadWeights = () => { try { const a = JSON.parse(localStorage.getItem(KEY) || "[]"); return Array.isArray(a) ? a.filter(e => e && e.date && isFinite(e.kg)).sort((x, y) => x.date.localeCompare(y.date)) : []; } catch { return []; } };
const save = a => { try { localStorage.setItem(KEY, JSON.stringify(a)); } catch {} dispatchEvent(new Event("weight:change")); };
export const latestWeight = () => { const a = loadWeights(); return a.length ? a[a.length - 1].kg : null; };
export function setWeight(date, kg) { const a = loadWeights().filter(e => e.date !== date); a.push({ date, kg }); save(a); }
export function delWeight(date) { save(loadWeights().filter(e => e.date !== date)); }

export function weightHTML(today) {
  const a = loadWeights(), last = a[a.length - 1];
  const at = d => { const p = a.filter(e => e.date <= d); return p.length ? p[p.length - 1] : null; };
  const chg = n => { const o = at(addDays(today, -n)); return last && o && o.date !== last.date ? last.kg - o.kg : null; };
  const sg = v => (v == null ? "—" : (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v).toFixed(1) + " kg");
  let svg = "";
  const pts = a.filter(e => e.date >= addDays(today, -120));
  if (pts.length >= 2) {
    const W = 600, H = 150, L = 40, R = 10, top = 10, bot = 22, t0 = new Date(pts[0].date + "T12:00").getTime(), t1 = new Date(pts[pts.length - 1].date + "T12:00").getTime() || t0 + 1;
    const vs = pts.map(e => e.kg), lo = Math.floor(Math.min(...vs) - 0.5), hi = Math.ceil(Math.max(...vs) + 0.5);
    const x = e => L + ((new Date(e.date + "T12:00").getTime() - t0) / Math.max(1, t1 - t0)) * (W - L - R), y = v => top + (1 - (v - lo) / (hi - lo)) * (H - top - bot);
    svg = `<svg viewBox="0 0 ${W} ${H}" class="jr-svg" role="img" aria-label="Body weight over time">`;
    for (let i = 0; i <= 3; i++) { const v = lo + (hi - lo) * i / 3; svg += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="var(--grid-minor)"/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end" font-size="11" fill="var(--tx2)">${v.toFixed(1)}</text>`; }
    svg += `<text x="${L}" y="${H - 5}" font-size="10.5" fill="var(--tx3)">${pts[0].date.slice(5)}</text><text x="${W - R}" y="${H - 5}" text-anchor="end" font-size="10.5" fill="var(--tx3)">${pts[pts.length - 1].date.slice(5)}</text>`;
    svg += `<path d="${pts.map((e, i) => `${i ? "L" : "M"}${x(e).toFixed(1)},${y(e.kg).toFixed(1)}`).join(" ")}" fill="none" stroke="#ffc060" stroke-width="1.5"/>`;
    svg += pts.map(e => `<circle cx="${x(e).toFixed(1)}" cy="${y(e.kg).toFixed(1)}" r="2.4" fill="#ffc060"><title>${e.date}: ${e.kg} kg</title></circle>`).join("") + "</svg>";
  }
  return `${svg ? `<div class="jr-chart">${svg}</div>` : `<div class="basis" style="padding:var(--s3) 0">${a.length ? "Log a second weigh-in on the Gym log page and the line appears." : "Log your weight on the Gym log page and the trend builds here."}</div>`}
    <div class="jr-stats"><div><div class="basis">Latest</div><div class="num jr-big">${last ? last.kg.toFixed(1) : "—"}<small> kg</small></div><div class="basis">${last ? last.date : ""}</div></div>
      <div><div class="basis">7 days</div><div class="num jr-big">${sg(chg(7))}</div></div><div><div class="basis">30 days</div><div class="num jr-big">${sg(chg(30))}</div></div></div>`;
}
// the entry form for the Gym log page: log a weigh-in, see and delete the recent ones
export function weightEntryHTML(today) {
  const a = loadWeights(), last = a[a.length - 1];
  const rows = [...a].reverse().slice(0, 6).map(e => `<div class="wl-row"><span>${e.date}</span><b class="num">${e.kg.toFixed(1)} kg</b><button type="button" class="gl-del" data-d="${esc(e.date)}" aria-label="Delete">×</button></div>`).join("");
  return `<div class="lbl">Log body weight</div>
    <div class="wl-add"><input id="wlKg" type="number" inputmode="decimal" step="0.1" min="30" max="250" placeholder="kg" value="${last ? last.kg : ""}" aria-label="Body weight in kilograms"><input id="wlDate" type="date" value="${today}" max="${today}" aria-label="Date"><button type="button" id="wlSave" class="gl-save">Log</button></div>
    <div class="basis">Same time of day and conditions, such as first thing after the toilet and before eating, makes the trend cleaner. Logging a date again replaces it.</div>
    ${rows ? `<div class="wl-list">${rows}</div>` : ""}`;
}
export function wireWeight(root, today) {
  const go = () => { const kg = parseFloat(root.querySelector("#wlKg").value), d = root.querySelector("#wlDate").value || today; if (isFinite(kg) && kg >= 30 && kg <= 250) setWeight(d, Math.round(kg * 10) / 10); };
  root.querySelector("#wlSave").onclick = go;
  root.querySelector("#wlKg").onkeydown = e => { if (e.key === "Enter") go(); };
  root.querySelectorAll(".wl-row .gl-del").forEach(b => (b.onclick = () => { if (confirm("Delete this weigh-in?")) delWeight(b.dataset.d); }));
}
