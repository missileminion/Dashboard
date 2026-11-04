// Phone navigation without swiping. Home is a launcher with an icon button for each page; every other page has a small round button
// in the corner that opens a row of icons for jumping anywhere in one more tap. The button hides while the keyboard is open.
export function initDock() {
  const tabs = [...document.querySelectorAll("#tabs button")].map(b => ({ k: b.dataset.t, icon: b.querySelector("svg").outerHTML, label: b.querySelector("span").textContent }));
  const go = k => dispatchEvent(new CustomEvent("goto", { detail: k }));
  const dock = document.createElement("nav"); dock.id = "dock"; dock.setAttribute("aria-label", "Pages");
  dock.innerHTML = tabs.map(t => `<button type="button" data-k="${t.k}" aria-label="${t.label}" title="${t.label}">${t.icon}</button>`).join(""); document.body.appendChild(dock);
  const hub = document.querySelector("#home .hm-split");
  if (hub) { const L = document.createElement("nav"); L.id = "launch"; L.setAttribute("aria-label", "Pages"); L.innerHTML = tabs.filter(t => t.k !== "home").map(t => `<button type="button" data-k="${t.k}">${t.icon}<span>${t.label}</span></button>`).join(""); hub.appendChild(L); L.addEventListener("click", e => { const b = e.target.closest("button"); if (b) go(b.dataset.k); }); }
  const mark = () => { const cur = document.body.dataset.tab; dock.classList.remove("open"); dock.querySelectorAll("button").forEach(b => b.classList.toggle("cur", b.dataset.k === cur)); };
  addEventListener("tab", mark); mark();
  dock.addEventListener("click", e => { const b = e.target.closest("button"); if (!b) return; if (b.dataset.k === document.body.dataset.tab) dock.classList.toggle("open"); else { dock.classList.remove("open"); go(b.dataset.k); } });
  document.addEventListener("pointerdown", e => { if (!e.target.closest("#dock")) dock.classList.remove("open"); }, true);
  const vv = window.visualViewport, typing = () => { const a = document.activeElement, field = a && (/^(input|textarea|select)$/i.test(a.tagName) || a.isContentEditable); dock.classList.toggle("hide", !!field || !!(vv && innerHeight - vv.height > 140)); };
  document.addEventListener("focusin", typing); document.addEventListener("focusout", () => setTimeout(typing, 60)); if (vv) vv.addEventListener("resize", typing);
}
