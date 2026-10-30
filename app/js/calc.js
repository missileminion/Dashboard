// A small, honest calculator for the command line: a real expression parser (no eval), functions, your own variables and functions, and plots.
// Numbers are ordinary 64-bit floats, which carry about 15 digits, so anything below about 1e8 is exact to 7 decimals. Results are rounded to the decimals you ask for
// (7 by default) and tiny noise such as sin(pi) = 1.2e-16 is cleaned to 0. Past about 1e8 the console says so rather than pretending.

const CONST = { pi: Math.PI, "π": Math.PI, tau: 2 * Math.PI, "τ": 2 * Math.PI, e: Math.E, phi: (1 + Math.sqrt(5)) / 2 };

function gamma(z) {   // Lanczos; exact loop for whole numbers
  if (Number.isInteger(z) && z > 0 && z < 171) { let r = 1; for (let i = 2; i < z; i++) r *= i; return r; }
  if (z < 0.5) return Math.PI / (Math.sin(Math.PI * z) * gamma(1 - z));
  z -= 1; const g = 7, c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  let x = c[0]; for (let i = 1; i < g + 2; i++) x += c[i] / (z + i); const t = z + g + 0.5; return Math.sqrt(2 * Math.PI) * Math.pow(t, z + 0.5) * Math.exp(-t) * x;
}
const snap = v => (Math.abs(v) < 1e-15 ? 0 : v);

export function makeCalc() {
  const S = { vars: {}, funcs: {}, deg: false, ans: 0, dp: 7 };
  const toRad = x => (S.deg ? x * Math.PI / 180 : x), fromRad = x => (S.deg ? x * 180 / Math.PI : x);
  const FN = {
    sin: x => snap(Math.sin(toRad(x))), cos: x => snap(Math.cos(toRad(x))), tan: x => { const r = Math.tan(toRad(x)); return Math.abs(r) > 1e15 ? NaN : snap(r); },
    asin: x => fromRad(Math.asin(x)), acos: x => fromRad(Math.acos(x)), atan: x => fromRad(Math.atan(x)), atan2: (y, x) => fromRad(Math.atan2(y, x)),
    sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh, exp: Math.exp, ln: Math.log, log: Math.log10, log10: Math.log10, log2: Math.log2, sqrt: Math.sqrt, cbrt: Math.cbrt,
    abs: Math.abs, floor: Math.floor, ceil: Math.ceil, round: Math.round, sign: Math.sign, trunc: Math.trunc, gamma, fact: x => gamma(x + 1),
    min: Math.min, max: Math.max, pow: Math.pow, mod: (a, b) => ((a % b) + b) % b, hypot: Math.hypot, root: (x, n) => (x < 0 && n % 2 ? -Math.pow(-x, 1 / n) : Math.pow(x, 1 / n)),
    deg: x => x * 180 / Math.PI, rad: x => x * Math.PI / 180, sec: x => 1 / FN.cos(x), csc: x => 1 / FN.sin(x), cot: x => 1 / FN.tan(x),
  };
  FN.sqrt = x => (x < 0 ? NaN : Math.sqrt(x));

  /* ---------- reading the expression ---------- */
  function tokenize(src) {
    const out = [], re = /\s*(?:(\d+\.?\d*(?:e[+-]?\d+)?|\.\d+(?:e[+-]?\d+)?)|([A-Za-zπτ_][A-Za-z0-9_]*)|(\*\*|[-+*/^()!,=×÷−]))/gy; let m, last = 0;
    src = src.replace(/\s+$/, "");
    while (last < src.length) { re.lastIndex = last; m = re.exec(src); if (!m) throw new Error(`I do not understand "${src.slice(last).trim().slice(0, 12)}"`); last = re.lastIndex;
      if (m[1] != null) out.push({ k: "n", v: parseFloat(m[1]) }); else if (m[2] != null) out.push({ k: "i", v: m[2] }); else out.push({ k: "o", v: m[3] === "×" ? "*" : m[3] === "÷" ? "/" : m[3] === "−" ? "-" : m[3] === "**" ? "^" : m[3] }); }
    return out;
  }
  function parse(src) {   // recursive descent; implicit multiplication (2pi, 3(4+5), (1+2)(3+4)); unary minus binds below ^ so -2^2 = -4
    const T = tokenize(src); let p = 0;
    const peek = () => T[p], eat = v => { const t = T[p]; if (t && t.k === "o" && (v === undefined || t.v === v)) { p++; return t; } return null; };
    const expect = v => { if (!eat(v)) throw new Error(`expected "${v}"`); };
    function expr() { let a = term(); for (;;) { if (eat("+")) a = { t: "bin", op: "+", a, b: term() }; else if (eat("-")) a = { t: "bin", op: "-", a, b: term() }; else return a; } }
    function term() { let a = unary(); for (;;) { const t = peek(); if (eat("*")) a = { t: "bin", op: "*", a, b: unary() }; else if (eat("/")) a = { t: "bin", op: "/", a, b: unary() }; else if (t && (t.k === "n" || t.k === "i" || (t.k === "o" && t.v === "("))) a = { t: "bin", op: "*", a, b: unary() }; else return a; } }
    function unary() { if (eat("-")) return { t: "neg", a: unary() }; if (eat("+")) return unary(); return power(); }
    function power() { const a = postfix(); if (eat("^")) return { t: "bin", op: "^", a, b: unary() }; return a; }   // right associative; the exponent may carry its own sign
    function postfix() { let a = primary(); while (eat("!")) a = { t: "call", n: "fact", args: [a] }; return a; }
    function primary() {
      const t = T[p++]; if (!t) throw new Error("the expression ends too soon");
      if (t.k === "n") return { t: "num", v: t.v };
      if (t.k === "i") { if (eat("(")) { const args = []; if (!eat(")")) { do args.push(expr()); while (eat(",")); expect(")"); } return { t: "call", n: t.v, args }; } return { t: "var", n: t.v }; }
      if (t.v === "(") { const a = expr(); expect(")"); return a; }
      throw new Error(`unexpected "${t.v}"`);
    }
    const ast = expr(); if (p < T.length) throw new Error(`unexpected "${T[p].v}"`); return ast;
  }
  function compile(ast) {   // to a closure over an environment of local names (x, function parameters)
    const c = n => {
      switch (n.t) {
        case "num": return () => n.v;
        case "neg": { const a = c(n.a); return e => -a(e); }
        case "bin": { const a = c(n.a), b = c(n.b); switch (n.op) { case "+": return e => a(e) + b(e); case "-": return e => a(e) - b(e); case "*": return e => a(e) * b(e); case "/": return e => a(e) / b(e); default: return e => Math.pow(a(e), b(e)); } }
        case "var": return e => { if (e && n.n in e) return e[n.n]; if (n.n in S.vars) return S.vars[n.n]; if (n.n === "ans") return S.ans; if (n.n in CONST) return CONST[n.n]; throw new Error(`"${n.n}" is not defined`); };
        case "call": {
          const args = n.args.map(c);
          return e => {
            const f = S.funcs[n.name || n.n];
            if (f) { if (f.params.length !== args.length) throw new Error(`${n.n} takes ${f.params.length} value${f.params.length === 1 ? "" : "s"}`); const env = {}; f.params.forEach((q, i) => (env[q] = args[i](e))); return f.fn(env); }
            const g = FN[n.n]; if (!g) throw new Error(`unknown function "${n.n}"`);
            return g(...args.map(a => a(e)));
          };
        }
      }
    };
    return c(ast);
  }
  const usesX = ast => (ast.t === "var" ? ast.n === "x" : ast.t === "bin" ? usesX(ast.a) || usesX(ast.b) : ast.t === "neg" ? usesX(ast.a) : ast.t === "call" ? ast.args.some(usesX) : false);

  /* ---------- showing a number ---------- */
  function fmt(v, dp = S.dp) {
    if (Number.isNaN(v)) return "undefined"; if (!Number.isFinite(v)) return v > 0 ? "∞" : "−∞";
    const a = Math.abs(v); if (a === 0) return "0";
    if (a >= 1e15 || a < Math.pow(10, -dp)) { if (a < Math.pow(10, -dp) && a >= 5 * Math.pow(10, -dp - 1)) return (v < 0 ? "-" : "") + "0." + "0".repeat(dp - 1) + "1"; if (a < 5 * Math.pow(10, -dp - 1)) return "0"; return v.toExponential(9).replace(/\.?0+e/, "e").replace("e+", "e"); }
    let s = v.toFixed(dp); if (s.includes(".")) s = s.replace(/0+$/, "").replace(/\.$/, ""); return s === "-0" ? "0" : s;
  }
  const trustworthy = v => Math.abs(v) < 1e8;

  /* ---------- running a line ---------- */
  function evaluate(line) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*\(\s*([A-Za-z_][A-Za-z0-9_]*(?:\s*,\s*[A-Za-z_][A-Za-z0-9_]*)*)\s*\)\s*=\s*(.+)$/);   // f(x) = ...
    if (m) { const params = m[2].split(",").map(s => s.trim()), ast = parse(m[3]); S.funcs[m[1]] = { params, fn: compile(ast), src: m[3] }; return { kind: "def", text: `${m[1]}(${params.join(", ")}) = ${m[3].trim()}` }; }
    const a = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)$/);                                   // a = ...
    if (a && !(a[1] in CONST)) { const v = compile(parse(a[2]))(); S.vars[a[1]] = v; return { kind: "set", name: a[1], value: v }; }
    const v = compile(parse(line))({}); S.ans = v; return { kind: "val", value: v };
  }
  function fnOf(src) { const ast = parse(src), f = compile(ast); return { f: x => { try { return f({ x }); } catch (e) { if (/not defined|unknown function/.test(e.message)) throw e; return NaN; } }, ast, uses: usesX(ast) }; }

  /* ---------- calculus on a function of x ---------- */
  const deriv = (f, a) => { let h = 1e-2, D = []; for (let i = 0; i < 6; i++) { D[i] = [(f(a + h) - f(a - h)) / (2 * h)]; for (let j = 1; j <= i; j++) D[i][j] = D[i][j - 1] + (D[i][j - 1] - D[i - 1][j - 1]) / (Math.pow(4, j) - 1); h /= 2; } return D[5][5]; };   // Richardson extrapolation
  function integral(f, a, b) {   // adaptive Simpson down to 1e-11
    const simp = (fa, fm, fb, h) => (h / 6) * (fa + 4 * fm + fb);
    const rec = (a, b, fa, fm, fb, whole, tol, depth) => { const m = (a + b) / 2, lm = (a + m) / 2, rm = (m + b) / 2, flm = f(lm), frm = f(rm), L = simp(fa, flm, fm, m - a), R = simp(fm, frm, fb, b - m);
      if (depth <= 0 || Math.abs(L + R - whole) <= 15 * tol) return L + R + (L + R - whole) / 15; return rec(a, m, fa, flm, fm, L, tol / 2, depth - 1) + rec(m, b, fm, frm, fb, R, tol / 2, depth - 1); };
    const fa = f(a), fb = f(b), fm = f((a + b) / 2); return rec(a, b, fa, fm, fb, simp(fa, fm, fb, b - a), 1e-11, 40);
  }
  function roots(f, a, b) {   // scan for sign changes, then bisection to full precision
    const N = 4000, out = []; let px = a, py = f(a);
    for (let i = 1; i <= N; i++) { const x = a + (b - a) * i / N, y = f(x); if (Number.isFinite(py) && Number.isFinite(y)) { if (py === 0) out.push(px); else if (py * y < 0) { let lo = px, hi = x, flo = py; for (let k = 0; k < 200; k++) { const mid = (lo + hi) / 2, fm = f(mid); if (fm === 0) { lo = hi = mid; break; } if (flo * fm < 0) hi = mid; else { lo = mid; flo = fm; } } const r = (lo + hi) / 2; if (Math.abs(f(r)) < 1e-6 * Math.max(1, Math.abs(py), Math.abs(y))) out.push(r); } } px = x; py = y; }
    if (py === 0) out.push(px);   // a root exactly at the right edge
    return out.filter((r, i) => !i || Math.abs(r - out[i - 1]) > 1e-9);
  }

  /* ---------- plots ---------- */
  const COLS = ["#ffffff", "#ff2d37", "#7fd6ff", "#ffd24d"];
  function niceStep(span, target) { const raw = span / target, p = Math.pow(10, Math.floor(Math.log10(raw))), n = raw / p; return (n < 1.5 ? 1 : n < 3.5 ? 2 : n < 7.5 ? 5 : 10) * p; }
  function plot(srcs, a, b) {
    const fs = srcs.map(fnOf), W = 840, H = 380, L = 54, R = 16, T = 14, B = 30, N = 900, xs = Array.from({ length: N + 1 }, (_, i) => a + (b - a) * i / N);
    const ys = fs.map(o => xs.map(x => o.f(x))), all = ys.flat().filter(Number.isFinite).sort((p, q) => p - q);
    if (!all.length) throw new Error("that function has no values in this range");
    let lo = all[Math.floor(all.length * 0.01)], hi = all[Math.ceil(all.length * 0.99) - 1];
    if (hi - lo < 1e-9) { lo -= 1; hi += 1; } const pad = (hi - lo) * 0.1; lo -= pad; hi += pad; if (lo > 0 && lo < (hi - lo) * 0.6) lo = Math.min(lo, 0) - pad * 0.2; if (hi < 0 && -hi < (hi - lo) * 0.6) hi = Math.max(hi, 0) + pad * 0.2;
    const X = x => L + (x - a) / (b - a) * (W - L - R), Y = y => T + (hi - y) / (hi - lo) * (H - T - B), span = hi - lo;
    let s = `<svg class="tm-plotsvg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Graph of ${srcs.map(x => x.replace(/"/g, "")).join(", ")}">`;
    const sx = niceStep(b - a, 8), sy = niceStep(span, 6), lab = v => fmt(Math.abs(v) < 1e-12 ? 0 : v, 6);
    for (let v = Math.ceil(a / sx) * sx; v <= b + 1e-9; v += sx) s += `<line x1="${X(v)}" x2="${X(v)}" y1="${T}" y2="${H - B}" stroke="${Math.abs(v) < 1e-9 ? "#6c7080" : "#23262e"}" ${Math.abs(v) < 1e-9 ? "" : 'stroke-dasharray="1 5"'}/><text x="${X(v)}" y="${H - 10}" text-anchor="middle" class="tm-ax">${lab(v)}</text>`;
    for (let v = Math.ceil(lo / sy) * sy; v <= hi + 1e-9; v += sy) s += `<line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}" stroke="${Math.abs(v) < 1e-9 ? "#6c7080" : "#23262e"}" ${Math.abs(v) < 1e-9 ? "" : 'stroke-dasharray="1 5"'}/><text x="${L - 7}" y="${Y(v) + 3.5}" text-anchor="end" class="tm-ax">${lab(v)}</text>`;
    ys.forEach((arr, k) => { let d = "", pen = false, prev = null; arr.forEach((y, i) => { const ok = Number.isFinite(y) && y > lo - span * 2 && y < hi + span * 2 && !(prev != null && Math.abs(y - prev) > span * 0.8); if (ok) { d += `${pen ? "L" : "M"}${X(xs[i]).toFixed(1)},${Math.max(T - 6, Math.min(H - B + 6, Y(y))).toFixed(1)}`; pen = true; } else pen = false; prev = Number.isFinite(y) ? y : null; }); s += `<path d="${d}" fill="none" stroke="${COLS[k % 4]}" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/>`; });
    s += `<g class="tm-cross" style="display:none"><line class="v" y1="${T}" y2="${H - B}" stroke="#fff" stroke-opacity=".4" stroke-dasharray="3 4"/>${fs.map((_, k) => `<circle class="d${k}" r="4" fill="${COLS[k % 4]}"/>`).join("")}</g></svg>`;
    return { svg: s, fs, a, b, X, Y, W, L, R, legend: srcs.map((q, k) => ({ q, c: COLS[k % 4] })) };
  }

  return { S, evaluate, fnOf, fmt, trustworthy, plot, deriv, integral, roots, parse, compile, FN };
}
