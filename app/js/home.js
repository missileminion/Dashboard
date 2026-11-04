// The Home tab: a search box, a grid of link tiles and one line of text, over a field of plus signs. It is only links; nothing is fetched except site icons.
// Add links to LINKS below as [name, address]; an address starting with "./" or "?" stays inside the dashboard. Empty slots show as faint tiles until they are filled.
const LINKS = [];
const TEXT = "enfocate.";
const SLOTS = 20;   // two rows of ten on a laptop, four rows of five on a phone

const hostOf = u => { try { return new URL(u, location.href).hostname; } catch { return ""; } };
export function initHome(root) {
  root.innerHTML = `<div class="hm">
    <form class="hm-search" action="https://www.google.com/search" method="get" role="search">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>
      <input name="q" type="search" placeholder="Search the web" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="Search the web" data-1p-ignore data-lpignore="true">
    </form>
    <nav class="hm-links" aria-label="Links"></nav>
    <div class="hm-text"></div>
  </div>`;
  const box = root.querySelector(".hm-links"), form = root.querySelector(".hm-search"), q = form.querySelector("input"); root.querySelector(".hm-text").textContent = TEXT;
  const letter = (t, name) => { t.textContent = ""; let hue = 0; for (const c of name) hue = (hue * 31 + c.charCodeAt(0)) % 360; t.style.background = `hsl(${hue} 38% 30%)`; const b = document.createElement("b"); b.textContent = (name[0] || "?").toUpperCase(); t.appendChild(b); };
  for (let i = 0; i < Math.max(SLOTS, LINKS.length); i++) {
    const l = LINKS[i], a = document.createElement(l ? "a" : "div"), t = document.createElement("div"), s = document.createElement("span"); a.className = "hm-lk" + (l ? "" : " empty"); t.className = "hm-tile";
    if (l) {
      const [name, url] = l, h = hostOf(url), ext = /^https?:/i.test(url); a.href = url; a.title = name; s.textContent = name;
      if (ext && h) { const im = new Image(); im.alt = ""; im.referrerPolicy = "no-referrer"; im.src = "https://www.google.com/s2/favicons?domain=" + encodeURIComponent(h) + "&sz=64"; im.onerror = () => letter(t, name); im.onload = () => { if (im.naturalWidth < 17) letter(t, name); }; t.appendChild(im); } else letter(t, name);
    } else t.innerHTML = "<i></i>";
    a.append(t, s); box.appendChild(a);
  }
  // typing an address in the search box goes straight there; anything else is a web search
  form.addEventListener("submit", e => { const v = q.value.trim(); if (/^(https?:\/\/)?[\w-]+(\.[\w-]+)+(\/\S*)?$/i.test(v)) { e.preventDefault(); location.href = /^https?:/i.test(v) ? v : "https://" + v; } });

  // the plus-sign field: a small plus every 50px, a larger one every 250px; drawn on a canvas behind the page and shown only on this tab
  const cv = document.createElement("canvas"); cv.className = "hm-field"; cv.setAttribute("aria-hidden", "true"); document.body.appendChild(cv); const g = cv.getContext("2d");
  const draw = () => {
    if (document.body.dataset.tab !== "home") return;
    const dpr = Math.min(2, devicePixelRatio || 1), W = innerWidth, H = innerHeight, ink = getComputedStyle(document.body).getPropertyValue("--tx").trim() || "#fff";
    cv.width = W * dpr; cv.height = H * dpr; g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H); g.lineCap = "round"; g.strokeStyle = ink;
    const plus = (x, y, r, a, w) => { g.globalAlpha = a; g.lineWidth = w; g.beginPath(); g.moveTo(x - r, y); g.lineTo(x + r, y); g.moveTo(x, y - r); g.lineTo(x, y + r); g.stroke(); }, ox = (W % 50) / 2, oy = (H % 50) / 2;
    for (let j = 0, y = oy; y < H; y += 50, j++) for (let i = 0, x = ox; x < W; x += 50, i++) (i % 5 === 0 && j % 5 === 0) ? plus(x, y, 6, .55, 1.4) : plus(x, y, 3, .18, 1);
  };
  addEventListener("tab", e => { if (e.detail === "home") requestAnimationFrame(draw); }); addEventListener("resize", draw); matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", () => setTimeout(draw, 50));
  draw();
}
