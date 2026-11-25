// Highlight, text colour and comment marks for the Milkdown Crepe note editor, shared by the web Notes tab (notes.js) and the phone (litenotes.js).
// In the markdown files they are plain HTML: <mark>…</mark>, <span style="color:…">…</span> and <span data-comment="…">…</span>.
// Without these, the editor shows that HTML as text; with them it shows the highlight or colour, and writes the same HTML back.
export const safeColor = c => /^(#[0-9a-f]{3,8}|[a-z]{3,20})$/i.test(c) ? c : "";
export function marks(kit) {
  const hl = kit.$markSchema("highlight", () => ({ parseDOM: [{ tag: "mark" }], toDOM: () => ["mark", 0], parseMarkdown: { match: n => n.type === "hlMark", runner: (st, n, t) => { st.openMark(t); st.next(n.children); st.closeMark(t); } }, toMarkdown: { match: m => m.type.name === "highlight", runner: (st, m) => { st.withMark(m, "hlMark"); } } }));
  const col = kit.$markSchema("textColor", () => ({ attrs: { color: { default: "" } }, parseDOM: [{ tag: "span[style]", getAttrs: el => { const c = safeColor((el.style.color || "").trim()); return c ? { color: c } : false; } }], toDOM: m => ["span", { style: `color:${m.attrs.color}` }, 0], parseMarkdown: { match: n => n.type === "colorMark", runner: (st, n, t) => { st.openMark(t, { color: n.color }); st.next(n.children); st.closeMark(t); } }, toMarkdown: { match: m => m.type.name === "textColor", runner: (st, m) => { st.withMark(m, "colorMark", undefined, { color: m.attrs.color }); } } }));
  const encC = o => encodeURIComponent(JSON.stringify({ t: o.text || "", d: o.date || "" }));
  const cm = kit.$markSchema("comment", () => ({ attrs: { text: { default: "" }, date: { default: "" } }, inclusive: false, parseDOM: [{ tag: "span[data-comment]", getAttrs: el => { try { const o = JSON.parse(decodeURIComponent(el.getAttribute("data-comment"))); return { text: String(o.t || ""), date: String(o.d || "") }; } catch { return false; } } }], toDOM: m => ["span", { class: "nt-cmt", "data-comment": encC(m.attrs), title: m.attrs.text }, 0], parseMarkdown: { match: n => n.type === "commentMark", runner: (st, n, t) => { st.openMark(t, { text: n.text, date: n.date }); st.next(n.children); st.closeMark(t); } }, toMarkdown: { match: m => m.type.name === "comment", runner: (st, m) => { st.withMark(m, "commentMark", undefined, { text: m.attrs.text, date: m.attrs.date }); } } }));
  const rm = kit.$remark("notes-marks", () => function () {   // <mark>, <span style="color:…"> and <span data-comment="…"> become marks; the same text is written back out
    const inner = (n, st, i) => st.containerPhrasing(n, { ...i, before: ">", after: "<" });
    const d = this.data(); (d.toMarkdownExtensions ||= []).push({ handlers: { hlMark: (n, _, st, i) => "<mark>" + inner(n, st, i) + "</mark>", colorMark: (n, _, st, i) => `<span style="color:${n.color}">` + inner(n, st, i) + "</span>", commentMark: (n, _, st, i) => `<span data-comment="${encC(n)}">` + inner(n, st, i) + "</span>" } });
    const opener = v => {
      if (v === "<mark>") return { type: "hlMark" };
      let m = /^<span style="color:\s*([^";]+);?">$/i.exec(v); if (m && safeColor(m[1].trim())) return { type: "colorMark", color: m[1].trim() };
      m = /^<span data-comment="([^"]*)">$/.exec(v); if (m) { try { const o = JSON.parse(decodeURIComponent(m[1])); return { type: "commentMark", text: String(o.t || ""), date: String(o.d || "") }; } catch {} }
      return null;
    };
    const closes = (v, top) => top && ((v === "</mark>" && top.type === "hlMark") || (v === "</span>" && (top.type === "colorMark" || top.type === "commentMark")));
    const walk = node => { if (!node.children) return; node.children.forEach(walk); const out = [], stack = [], put = c => (stack.length ? stack[stack.length - 1].children : out).push(c);
      for (const c of node.children) { const v = c.type === "html" ? c.value.trim() : "", open = v ? opener(v) : null;
        if (open) { open.children = []; open.raw = v; stack.push(open); continue; }
        if (v && closes(v, stack[stack.length - 1])) { put(stack.pop()); continue; }
        put(c); }
      while (stack.length) { const u = stack.pop(); put({ type: "html", value: u.raw }); u.children.forEach(put); }
      node.children = out; };
    return tree => walk(tree); });
  return { list: [hl, col, cm, rm].flat(), hl, col, cmt: cm };
}
