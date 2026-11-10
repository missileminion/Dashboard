// The right half of the Home tab: your links as plain text in groups (HAL is the left half), beside HAL. It is only links; nothing is fetched from anywhere.
// The links below are public (this file is on GitHub). Anything private goes in through the pencil button: those links are kept in this browser only.
const GROUPS = [
  ["School", [["Canvas", "https://coastdistrict.instructure.com/"], ["MATLAB", "https://grader.mathworks.com/courses/176768-engr-a220-23180-programming-and-problem-solving-in-matlab-fall-2026"], ["Drive", "https://drive.google.com/drive/u/3/"]]],
  ["Read", [["NYT", "https://www.nytimes.com/"], ["WSJ", "https://www.wsj.com/"], ["Cooking", "https://cooking.nytimes.com/"], ["Anna's", "https://annas-archive.pk/"]]],
  ["Watch and chat", [["Nebula", "https://nebula.tv/library"], ["Discord", "https://discord.com/channels/@me"]]],
  ["Tools", [["Claude", "https://claude.ai/new"], ["Boox", "https://push.boox.com/#/note/recentNote"], ["Rocket", "https://auth.rocketaccount.com/"]]],
];
const EXTRA = "home.extra", HIDE = "home.hide";   // links you added (group, name, address) and built-in ones you removed (addresses)
const rd = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) || d; } catch { return d; } }, wr = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

export function initHome(root) {
  root.innerHTML = `<div class="hm">
    <button type="button" class="hm-edit" aria-label="Edit links" title="Edit links"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z"/></svg></button>
    <div class="hm-groups"></div>
    <form class="hm-add" hidden><input name="name" placeholder="Name" maxlength="14" aria-label="Name" data-1p-ignore><input name="url" placeholder="https://…" inputmode="url" autocapitalize="off" aria-label="Address" data-1p-ignore><input name="group" list="hmGroups" placeholder="Group" maxlength="24" aria-label="Group" data-1p-ignore><datalist id="hmGroups"></datalist><button type="submit" class="hm-go">Add</button><button type="button" class="hm-cancel" hidden>Cancel</button></form>
    <div class="hm-note" hidden>Editing: tap a link to change it, × to remove it, or add a new one below. Changes stay in this browser only. Press the pencil again when done.</div>
  </div>`;
  const wrap = root.querySelector(".hm"), box = root.querySelector(".hm-groups"), add = root.querySelector(".hm-add"), note = root.querySelector(".hm-note"), edit = root.querySelector(".hm-edit");
  const short = n => (n.length > 14 ? n.slice(0, 13) + "…" : n);   // titles stay short so the list stays tidy
  const tile = (name, url, onRemove, onEdit) => {
    const a = document.createElement("a"); a.className = "hm-lk"; a.href = url; a.title = name; a.textContent = short(name);
    const x = document.createElement("button"); x.type = "button"; x.className = "hm-x"; x.textContent = "×"; x.setAttribute("aria-label", "Remove " + name); x.addEventListener("click", e => { e.preventDefault(); e.stopPropagation(); onRemove(); });
    a.addEventListener("click", e => { if (wrap.classList.contains("editing")) { e.preventDefault(); onEdit(); } });
    a.append(x); return a;
  };
  function render() {
    const hide = new Set(rd(HIDE, [])), extra = rd(EXTRA, []), groups = GROUPS.map(([g, l]) => [g, l.filter(([, u]) => !hide.has(u)).map(([n, u]) => ({ n, u, own: false }))]);
    extra.forEach(([g, n, u], i) => { let r = groups.find(x => x[0].toLowerCase() === g.toLowerCase()); if (!r) groups.push(r = [g, []]); r[1].push({ n, u, own: true, i }); });
    box.textContent = ""; root.querySelector("#hmGroups").innerHTML = groups.map(([g]) => `<option value="${g.replace(/"/g, "&quot;")}">`).join("");
    groups.forEach(([g, l]) => {
      if (!l.length) return; const sec = document.createElement("section"), cap = document.createElement("h3"), grid = document.createElement("div"); sec.className = "hm-group"; cap.textContent = g; grid.className = "hm-grid";
      l.forEach(k => grid.appendChild(tile(k.n, k.u, () => { if (k.own) { const e = rd(EXTRA, []); e.splice(k.i, 1); wr(EXTRA, e); } else wr(HIDE, [...rd(HIDE, []), k.u]); render(); }, () => startEdit(k, g))));
      sec.append(cap, grid); box.appendChild(sec);
    });
  }
  render();
  edit.addEventListener("click", () => { const on = wrap.classList.toggle("editing"); add.hidden = note.hidden = !on; if (!on) stopEdit(); });
  let editing = null;   // the link being changed: { own, i, u } (a built-in link is replaced by an edited copy of your own)
  const form = add, go = add.querySelector(".hm-go"), cancel = add.querySelector(".hm-cancel");
  const stopEdit = () => { editing = null; form.reset(); go.textContent = "Add"; cancel.hidden = true; };
  function startEdit(k, g) { editing = { own: k.own, i: k.i, u: k.u }; form.elements.name.value = k.n; form.elements.url.value = k.u; form.elements.group.value = g; go.textContent = "Save"; cancel.hidden = false; form.elements.name.focus(); }
  cancel.addEventListener("click", stopEdit);
  add.addEventListener("submit", e => {
    e.preventDefault(); const f = new FormData(add); let u = String(f.get("url") || "").trim(), n = String(f.get("name") || "").trim(), g = String(f.get("group") || "").trim() || "Other"; if (!u) return;
    if (!/^[a-z][a-z0-9+.-]*:|^\.{0,2}\/|^\?/i.test(u)) u = "https://" + u; if (!n) n = (() => { try { return new URL(u, location.href).hostname.replace(/^www\./, ""); } catch { return u; } })();
    const ex = rd(EXTRA, []);
    if (editing && editing.own) ex[editing.i] = [g, n, u]; else { if (editing) wr(HIDE, [...rd(HIDE, []), editing.u]); ex.push([g, n, u]); }
    wr(EXTRA, ex); stopEdit(); render();
  });
  // a soft light follows the pointer inside a link group (mouse and pen only; a finger has no hover)
  root.addEventListener("pointermove", e => { if (e.pointerType === "touch") return; const g = e.target.closest(".hm-group"); if (!g) return; const r = g.getBoundingClientRect(); g.style.setProperty("--gx", (e.clientX - r.left).toFixed(0) + "px"); g.style.setProperty("--gy", (e.clientY - r.top).toFixed(0) + "px"); }, { passive: true });
  // HAL runs from just under the tab bar to the bottom of the window; measure where the page content starts
  const fitTop = () => { const h = root.closest("#home"); if (h && h.offsetParent) document.documentElement.style.setProperty("--hm-top", Math.round(h.getBoundingClientRect().top + scrollY) + "px"); };
  addEventListener("tab", e => { if (e.detail === "home") requestAnimationFrame(fitTop); }); addEventListener("resize", fitTop); requestAnimationFrame(fitTop);
}
