// The Home tab: a search box, your links in groups, and one line of text, over a field of plus signs. It is only links; nothing is fetched except site icons.
// The links below are public (this file is on GitHub). Anything private goes in through the pencil button: those links are kept in this browser only.
const GROUPS = [
  ["School", [["Canvas", "https://coastdistrict.instructure.com/"], ["MATLAB grader", "https://grader.mathworks.com/courses/176768-engr-a220-23180-programming-and-problem-solving-in-matlab-fall-2026"], ["Drive", "https://drive.google.com/drive/u/3/"]]],
  ["Read", [["NYTimes", "https://www.nytimes.com/"], ["WSJ", "https://www.wsj.com/"], ["NYT Cooking", "https://cooking.nytimes.com/"], ["Anna's Archive", "https://annas-archive.pk/"]]],
  ["Watch and chat", [["Nebula", "https://nebula.tv/library"], ["Discord", "https://discord.com/channels/@me"]]],
  ["Tools", [["Claude", "https://claude.ai/new"], ["Boox notes", "https://push.boox.com/#/note/recentNote"], ["Rocket", "https://auth.rocketaccount.com/"]]],
];
const TEXT = "enfocate.";
const EXTRA = "home.extra", HIDE = "home.hide";   // links you added (group, name, address) and built-in ones you removed (addresses)
const rd = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) || d; } catch { return d; } }, wr = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
const hostOf = u => { try { return new URL(u, location.href).hostname; } catch { return ""; } };

export function initHome(root) {
  root.innerHTML = `<div class="hm">
    <button type="button" class="hm-edit" aria-label="Edit links" title="Edit links"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z"/></svg></button>
    <form class="hm-search" action="https://www.google.com/search" method="get" role="search">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>
      <input name="q" type="search" placeholder="Search the web" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="Search the web" data-1p-ignore data-lpignore="true">
    </form>
    <div class="hm-groups"></div>
    <form class="hm-add" hidden><input name="name" placeholder="Name" maxlength="24" aria-label="Name" data-1p-ignore><input name="url" placeholder="https://…" inputmode="url" autocapitalize="off" aria-label="Address" data-1p-ignore><input name="group" list="hmGroups" placeholder="Group" maxlength="24" aria-label="Group" data-1p-ignore><datalist id="hmGroups"></datalist><button type="submit">Add</button></form>
    <div class="hm-note" hidden>Editing: tap × to remove a link, or add one below. Links you add stay in this browser only. Press the pencil again when done.</div>
    <div class="hm-text"></div>
  </div>`;
  const wrap = root.querySelector(".hm"), box = root.querySelector(".hm-groups"), search = root.querySelector(".hm-search"), q = search.querySelector("input"), add = root.querySelector(".hm-add"), note = root.querySelector(".hm-note"), edit = root.querySelector(".hm-edit");
  root.querySelector(".hm-text").textContent = TEXT;
  const letter = (t, name) => { t.textContent = ""; let hue = 0; for (const c of name) hue = (hue * 31 + c.charCodeAt(0)) % 360; t.style.background = `hsl(${hue} 38% 30%)`; const b = document.createElement("b"); b.textContent = (name[0] || "?").toUpperCase(); t.appendChild(b); };
  const tile = (name, url, onRemove) => {
    const a = document.createElement("a"), t = document.createElement("div"), s = document.createElement("span"), h = hostOf(url); a.className = "hm-lk"; a.href = url; a.title = name; t.className = "hm-tile"; s.textContent = name;
    if (/^https?:/i.test(url) && h) { const im = new Image(); im.alt = ""; im.referrerPolicy = "no-referrer"; im.src = "https://www.google.com/s2/favicons?domain=" + encodeURIComponent(h) + "&sz=64"; im.onerror = () => letter(t, name); im.onload = () => { if (im.naturalWidth < 17) letter(t, name); }; t.appendChild(im); } else letter(t, name);
    const x = document.createElement("button"); x.type = "button"; x.className = "hm-x"; x.textContent = "×"; x.setAttribute("aria-label", "Remove " + name); x.addEventListener("click", e => { e.preventDefault(); e.stopPropagation(); onRemove(); });
    a.addEventListener("click", e => { if (wrap.classList.contains("editing")) e.preventDefault(); });
    a.append(t, s, x); return a;
  };
  function render() {
    const hide = new Set(rd(HIDE, [])), extra = rd(EXTRA, []), groups = GROUPS.map(([g, l]) => [g, l.filter(([, u]) => !hide.has(u)).map(([n, u]) => ({ n, u, own: false }))]);
    extra.forEach(([g, n, u], i) => { let r = groups.find(x => x[0].toLowerCase() === g.toLowerCase()); if (!r) groups.push(r = [g, []]); r[1].push({ n, u, own: true, i }); });
    box.textContent = ""; root.querySelector("#hmGroups").innerHTML = groups.map(([g]) => `<option value="${g.replace(/"/g, "&quot;")}">`).join("");
    groups.forEach(([g, l]) => {
      if (!l.length) return; const sec = document.createElement("section"), cap = document.createElement("h3"), grid = document.createElement("div"); sec.className = "hm-group"; cap.textContent = g; grid.className = "hm-grid";
      l.forEach(k => grid.appendChild(tile(k.n, k.u, () => { if (k.own) { const e = rd(EXTRA, []); e.splice(k.i, 1); wr(EXTRA, e); } else wr(HIDE, [...rd(HIDE, []), k.u]); render(); })));
      sec.append(cap, grid); box.appendChild(sec);
    });
  }
  render();
  edit.addEventListener("click", () => { const on = wrap.classList.toggle("editing"); add.hidden = note.hidden = !on; });
  add.addEventListener("submit", e => { e.preventDefault(); const f = new FormData(add); let u = String(f.get("url") || "").trim(), n = String(f.get("name") || "").trim(), g = String(f.get("group") || "").trim() || "Other"; if (!u) return; if (!/^[a-z][a-z0-9+.-]*:|^\.{0,2}\/|^\?/i.test(u)) u = "https://" + u; if (!n) n = hostOf(u).replace(/^www\./, "") || u; wr(EXTRA, [...rd(EXTRA, []), [g, n, u]]); add.reset(); render(); });
  // typing an address in the search box goes straight there; anything else is a web search
  search.addEventListener("submit", e => { const v = q.value.trim(); if (/^(https?:\/\/)?[\w-]+(\.[\w-]+)+(\/\S*)?$/i.test(v)) { e.preventDefault(); location.href = /^https?:/i.test(v) ? v : "https://" + v; } });

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
