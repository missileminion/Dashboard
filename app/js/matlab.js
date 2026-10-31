// The calculator's MATLAB-style engine: matrices and vectors (column-major, real or complex), elementwise (.* ./ .^) versus matrix (* / \ ^) operators, ranges a:s:b,
// indexing and assignment, complex numbers, trig in radians with sind/cosd/... for degrees, semicolon to hide output, format short/long, a workspace (who, clear),
// anonymous functions (f = @(x) x.^2), and MATLAB's wording for results and errors. Everything is written from MATLAB's documented behaviour.
// The default display shows up to 7 decimals (the console's promise); `format short` and `format long` switch to MATLAB's own layouts.

const EPS = 2.220446049250313e-16;
const M = (r, c, re, im = null, lg = false) => ({ t: "m", r, c, re, im: im && im.some(v => v !== 0) ? im : null, lg });
const sc = (v, im = 0) => M(1, 1, [v], im ? [im] : null);
const bool = b => M(1, 1, [b ? 1 : 0], null, true);
const str = s => ({ t: "s", s });
const isScalar = m => m.t === "m" && m.r === 1 && m.c === 1;
const fail = m => { throw new Error(m); };

/* ---------- complex arithmetic on (re, im) pairs ---------- */
const cx = {
  mul: (a, b, c, d) => [a * c - b * d, a * d + b * c],
  div: (a, b, c, d) => { if (d === 0) return [a / c, b / c]; const s = c * c + d * d; return [(a * c + b * d) / s, (b * c - a * d) / s]; },
  exp: (a, b) => { const e = Math.exp(a); return [e * Math.cos(b), e * Math.sin(b)]; },
  log: (a, b) => [Math.log(Math.hypot(a, b)), Math.atan2(b, a)],
  sqrt: (a, b) => { const m = Math.hypot(a, b), re = Math.sqrt((m + a) / 2); let im = Math.sqrt((m - a) / 2); if (b < 0) im = -im; return [re, im]; },
  pow(a, b, c, d) {
    if (a === 0 && b === 0) return c === 0 && d === 0 ? [1, 0] : [0, 0];
    if (d === 0 && Number.isInteger(c) && Math.abs(c) <= 64) { let n = Math.abs(c), r = [1, 0], q = [a, b]; while (n) { if (n & 1) r = cx.mul(r[0], r[1], q[0], q[1]); q = cx.mul(q[0], q[1], q[0], q[1]); n >>= 1; } return c < 0 ? cx.div(1, 0, r[0], r[1]) : r; }
    const [lr, li] = cx.log(a, b), [er, ei] = cx.mul(lr, li, c, d); return cx.exp(er, ei);
  },
  sin: (a, b) => [Math.sin(a) * Math.cosh(b), Math.cos(a) * Math.sinh(b)],
  cos: (a, b) => [Math.cos(a) * Math.cosh(b), -Math.sin(a) * Math.sinh(b)],
  tan: (a, b) => { const s = cx.sin(a, b), c = cx.cos(a, b); return cx.div(s[0], s[1], c[0], c[1]); },
  sinh: (a, b) => [Math.sinh(a) * Math.cos(b), Math.cosh(a) * Math.sin(b)],
  cosh: (a, b) => [Math.cosh(a) * Math.cos(b), Math.sinh(a) * Math.sin(b)],
  tanh: (a, b) => { const s = cx.sinh(a, b), c = cx.cosh(a, b); return cx.div(s[0], s[1], c[0], c[1]); },
  asin(a, b) { const z2 = cx.mul(a, b, a, b), s = cx.sqrt(1 - z2[0], -z2[1]), l = cx.log(-b + s[0], a + s[1]); return [l[1], -l[0]]; },   // -i log(iz + sqrt(1 - z^2))
  acos(a, b) { const s = cx.asin(a, b); return [Math.PI / 2 - s[0], -s[1]]; },
  atan(a, b) { const p = cx.log(1 + b, -a), q = cx.log(1 - b, a); return [(p[1] - q[1]) / 2, (q[0] - p[0]) / 2]; },   // (i/2)(log(1 - iz) - log(1 + iz))
};

function gamma(z) {
  if (Number.isInteger(z) && z > 0 && z < 171) { let r = 1; for (let i = 2; i < z; i++) r *= i; return r; }
  if (z <= 0 && Number.isInteger(z)) return Infinity;
  if (z < 0.5) return Math.PI / (Math.sin(Math.PI * z) * gamma(1 - z));
  z -= 1; const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  let x = c[0]; for (let i = 1; i < 9; i++) x += c[i] / (z + i); const t = z + 7.5; return Math.sqrt(2 * Math.PI) * Math.pow(t, z + 0.5) * Math.exp(-t) * x;
}
const half = v => { const h = Math.round(v * 2) / 2; return Math.abs(v - h) < 1e-15 ? h : v; };   // sind(30) is exactly 0.5
const D2R = Math.PI / 180;
const sind = x => { const r = ((x % 360) + 360) % 360; return r % 180 === 0 ? 0 : half(Math.sin(r * D2R)); };
const cosd = x => { const r = ((x % 360) + 360) % 360; return (r - 90) % 180 === 0 ? 0 : half(Math.cos(r * D2R)); };
const tand = x => { const r = (((x % 180) + 180) % 180); return r === 0 ? 0 : r === 90 ? Infinity : Math.tan(r * D2R); };
const rnd = x => (x < 0 ? -Math.round(-x) : Math.round(x));
const gcd = (a, b) => { a = Math.abs(a); b = Math.abs(b); while (b) [a, b] = [b, a % b]; return a; };

// real functions with their real domain; outside it (or for complex input) the complex form is used
const R1 = {
  sin: [Math.sin, null, cx.sin], cos: [Math.cos, null, cx.cos], tan: [Math.tan, null, cx.tan], asin: [Math.asin, x => Math.abs(x) <= 1, cx.asin], acos: [Math.acos, x => Math.abs(x) <= 1, cx.acos], atan: [Math.atan, null, cx.atan],
  sinh: [Math.sinh, null, cx.sinh], cosh: [Math.cosh, null, cx.cosh], tanh: [Math.tanh, null, cx.tanh], asinh: [Math.asinh], acosh: [Math.acosh, x => x >= 1], atanh: [Math.atanh, x => Math.abs(x) <= 1],
  exp: [Math.exp, null, cx.exp], log: [Math.log, x => x >= 0, cx.log], log2: [Math.log2, x => x >= 0, (a, b) => { const l = cx.log(a, b); return [l[0] / Math.LN2, l[1] / Math.LN2]; }], log10: [Math.log10, x => x >= 0, (a, b) => { const l = cx.log(a, b); return [l[0] / Math.LN10, l[1] / Math.LN10]; }],
  ln: null, sqrt: [Math.sqrt, x => x >= 0, cx.sqrt], cbrt: [Math.cbrt], sign: [Math.sign], gamma: [gamma], factorial: [x => (x < 0 || !Number.isInteger(x) ? NaN : gamma(x + 1))],
  sind: [sind], cosd: [cosd], tand: [tand], asind: [x => Math.asin(x) / D2R, x => Math.abs(x) <= 1], acosd: [x => Math.acos(x) / D2R, x => Math.abs(x) <= 1], atand: [x => Math.atan(x) / D2R],
  sec: [x => 1 / Math.cos(x)], csc: [x => 1 / Math.sin(x)], cot: [x => 1 / Math.tan(x)], secd: [x => 1 / cosd(x)], cscd: [x => 1 / sind(x)], cotd: [x => 1 / tand(x)],
  deg2rad: [x => x * D2R], rad2deg: [x => x / D2R], fix: [Math.trunc], isnan: [x => +Number.isNaN(x)], isinf: [x => +(Math.abs(x) === Infinity)], isfinite: [x => +Number.isFinite(x)],
};
R1.ln = R1.log;
const PARTWISE = { floor: Math.floor, ceil: Math.ceil, round: rnd, fix: Math.trunc };

export function makeMatlab(calc) {
  const W = { vars: {}, fmt: "default", ans: null };
  const NAMES = new Set();

  /* ---------- tokens ---------- */
  function tokenize(src) {
    const T = [], depth = []; let i = 0;
    while (i < src.length) {
      const sp = /\s/.test(src[i]); if (sp) { i++; continue; }
      const hadSp = i > 0 && /\s/.test(src[i - 1]), prev = T[T.length - 1], c = src[i], rest = src.slice(i); let m;
      if ((m = rest.match(/^(?:\d+\.?\d*(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?)([ij])?(?!\d)/))) {
        let txt = m[0]; if (/^\d+\.[*/^\\']/.test(rest) && !/^\d+\.\d/.test(rest)) txt = rest.match(/^\d+/)[0] + (m[1] || "");
        T.push({ k: "n", v: parseFloat(txt), im: !!m[1] && /[ij]$/.test(txt), sp: hadSp, at: i }); i += txt.length; continue;
      }
      if ((m = rest.match(/^[A-Za-zπτ_][A-Za-z0-9_]*/))) { T.push({ k: "i", v: m[0] === "π" ? "pi" : m[0] === "τ" ? "tau" : m[0], sp: hadSp, at: i }); i += m[0].length; continue; }
      const enders = prev && (prev.k === "n" || prev.k === "i" || prev.k === "s" || (prev.k === "o" && /^[)\]}']$|^\.'$/.test(prev.v)));
      if (c === "'" && !(enders && (!hadSp || !depth.length))) { let j = i + 1, s = ""; while (j < src.length) { if (src[j] === "'") { if (src[j + 1] === "'") { s += "'"; j += 2; continue; } break; } s += src[j++]; } if (j >= src.length) fail("A MATLAB string constant is not terminated properly."); T.push({ k: "s", v: s, sp: hadSp, at: i }); i = j + 1; continue; }
      if (c === '"') { const j = src.indexOf('"', i + 1); if (j < 0) fail("A MATLAB string constant is not terminated properly."); T.push({ k: "s", v: src.slice(i + 1, j), sp: hadSp, at: i }); i = j + 1; continue; }
      if ((m = rest.match(/^(\.\*|\.\/|\.\\|\.\^|\.'|==|~=|!=|<=|>=|&&|\|\||[-+*/\\^<>=&|~!:,;()\[\]@{}'])/))) {
        const v = m[1] === "!=" ? "~=" : m[1] === "!" ? (enders ? "!" : "~") : m[1]; if (v === "[" || v === "(" || v === "{") depth.push(v); else if (v === "]" || v === ")" || v === "}") depth.pop();
        T.push({ k: "o", v, sp: hadSp, at: i }); i += m[0].length; continue;
      }
      fail(`Invalid text character: "${c}". Check for unsupported symbol, invisible character, or pasting of non-ASCII characters.`);
    }
    return T;
  }

  /* ---------- parser ---------- */
  function parse(src) {
    const T = tokenize(src); let p = 0; const mat = [false];
    const peek = () => T[p], isO = (t, v) => t && t.k === "o" && (v === undefined || t.v === v), eat = v => (isO(T[p], v) ? T[p++] : null);
    const expect = v => { if (!eat(v)) fail(p >= T.length ? `Invalid expression. Missing closing '${v === ")" ? ")" : v}'.` : `Invalid expression. Check for missing or extra characters near '${T[p].v}'.`); };
    const inMat = () => mat[mat.length - 1];
    const startsOperand = t => t && (t.k === "n" || t.k === "i" || t.k === "s" || (t.k === "o" && /^[(\[@~]$/.test(t.v)));
    const binLevel = (next, ops) => () => { let a = next(); for (;;) { const t = peek(); if (!isO(t) || !ops.includes(t.v)) return a; if (inMat() && (t.v === "+" || t.v === "-") && t.sp && T[p + 1] && !T[p + 1].sp) return a; p++; a = { t: "bin", op: t.v, a, b: next() }; } };
    function range() { const a = additive(); if (isO(peek(), ":") && !(inMat() && false)) { const nx = T[p + 1]; if (!nx || (nx.k === "o" && /^[,)\]]$/.test(nx.v))) return a; p++; const b = additive(); if (eat(":")) { const c = additive(); return { t: "range", a, s: b, b: c }; } return { t: "range", a, s: null, b }; } return a; }
    const additive = binLevel(() => multiplicative(), ["+", "-"]);
    const multiplicativeCore = binLevel(() => unary(), ["*", "/", ".*", "./", "\\", ".\\"]);
    function multiplicative() { return multiplicativeCore(); }
    const compare = binLevel(range, ["<", "<=", ">", ">=", "==", "~="]);
    const and = binLevel(compare, ["&"]), or = binLevel(and, ["|"]), andand = binLevel(or, ["&&"]), oror = binLevel(andand, ["||"]);
    function unary() {
      const t = peek(); if (t && t.k === "n" && !t.im && !inMat()) { const nx = T[p + 1]; if (nx && (nx.k === "i" || (nx.k === "o" && nx.v === "(")) && !nx.sp) { p++; return { t: "bin", op: ".*", a: { t: "num", v: t.v }, b: unary() }; } }
      return unaryCore();
    }
    function unaryCore() { const t = peek(); if (isO(t, "-") || isO(t, "+") || isO(t, "~")) { p++; return { t: "un", op: t.v, a: unary() }; } return power(); }
    function power() {
      let a = postfix();
      while (isO(peek(), "^") || isO(peek(), ".^")) { const op = T[p++].v; let b; if (isO(peek(), "-") || isO(peek(), "+") || isO(peek(), "~")) { const u = T[p++]; b = { t: "un", op: u.v, a: powerOperand() }; } else b = powerOperand(); a = { t: "bin", op, a, b }; }
      return a;
    }
    const powerOperand = () => postfix();
    function postfix() {
      let a = primary();
      for (;;) {
        const t = peek();
        if (isO(t, "'") || isO(t, ".'")) { p++; a = { t: "post", op: t.v, a }; }
        else if (isO(t, "!")) { p++; a = { t: "idx", a: { t: "var", n: "factorial" }, args: [a] }; }
        else if (isO(t, "(") && !(inMat() && t.sp)) { p++; mat.push(false); const args = []; if (!eat(")")) { do args.push(arg()); while (eat(",")); expect(")"); } mat.pop(); a = { t: "idx", a, args }; }
        else return a;
      }
    }
    function arg() { if (isO(peek(), ":") && (isO(T[p + 1], ",") || isO(T[p + 1], ")"))) { p++; return { t: "colon" }; } return oror(); }
    function primary() {
      const t = T[p++]; if (!t) fail("Invalid expression. Check for missing or extra characters.");
      if (t.k === "n") return t.im ? { t: "num", v: 0, im: t.v } : { t: "num", v: t.v };
      if (t.k === "s") return { t: "str", v: t.v };
      if (t.k === "i") return t.v === "end" ? { t: "end" } : { t: "var", n: t.v };
      if (t.v === "(") { mat.push(false); const a = oror(); expect(")"); mat.pop(); return { t: "paren", a }; }
      if (t.v === "[") return matrix();
      if (t.v === "@") {
        if (eat("(")) { const params = []; if (!eat(")")) { do { const q = T[p++]; if (!q || q.k !== "i") fail("Invalid anonymous function parameter list."); params.push(q.v); } while (eat(",")); expect(")"); } mat.push(false); const st = T[p] ? T[p].at : src.length, body = oror(); mat.pop(); const last = T[p - 1], en = p < T.length ? T[p].at : src.length; return { t: "anon", params, body, src: src.slice(st, en).trim() }; }
        const q = T[p++]; if (!q || q.k !== "i") fail("Invalid function handle."); return { t: "handle", n: q.v };
      }
      fail(`Invalid expression. Check for missing or extra characters near '${t.v}'.`);
    }
    function matrix() {
      const rows = []; let row = []; mat.push(true);
      for (;;) {
        const t = peek(); if (!t) fail("Invalid expression. Missing closing ']'.");
        if (isO(t, "]")) { p++; break; }
        if (isO(t, ";")) { p++; rows.push(row); row = []; continue; }
        if (isO(t, ",")) { p++; continue; }
        row.push(oror());
        const nx = peek(); if (nx && !isO(nx, ",") && !isO(nx, ";") && !isO(nx, "]") && !startsOperand(nx) && !(isO(nx, "+") || isO(nx, "-"))) fail(`Invalid expression. Check for missing or extra characters near '${nx.v}'.`);
      }
      mat.pop(); rows.push(row); return { t: "matrix", rows: rows.filter((r, i) => r.length || rows.length === 1 || i < rows.length - 1) };
    }
    const ast = oror(); if (p < T.length) fail(`Invalid expression. Check for missing or extra characters near '${T[p].v}'.`); return ast;
  }

  /* ---------- values: shapes and element-wise operations ---------- */
  const toMat = v => (v.t === "s" ? M(v.s.length ? 1 : 0, v.s.length, [...v.s].map(ch => ch.charCodeAt(0))) : v.t === "m" ? v : fail("This operation needs numeric values, not a function handle."));
  const num = (v, what = "value") => { const m = toMat(v); if (m.re.length !== 1) fail(`The ${what} must be a scalar.`); return m.re[0]; };
  const imOf = m => m.im || m.re.map(() => 0);
  const fromGrid = (rows, cols, f) => { const re = new Array(rows * cols); for (let j = 0; j < cols; j++) for (let i = 0; i < rows; i++) re[i + j * rows] = f(i, j); return M(rows, cols, re); };
  const G = (m, i, j) => m.re[i + j * m.r];

  function broadcast(a, b) {
    const r = a.r === b.r ? a.r : a.r === 1 ? b.r : b.r === 1 ? a.r : -1, c = a.c === b.c ? a.c : a.c === 1 ? b.c : b.c === 1 ? a.c : -1;
    if (r < 0 || c < 0) fail("Arrays have incompatible sizes for this operation."); return [r, c];
  }
  function ewise(a, b, fr, fc, lg = false) {   // fr(x,y) for real inputs (may return [re,im]), fc(a,b,c,d) -> [re,im] for complex
    a = toMat(a); b = toMat(b); const [r, c] = broadcast(a, b), n = r * c, re = new Array(n), cplx = !!(a.im || b.im); let im = cplx ? new Array(n).fill(0) : null;
    for (let j = 0; j < c; j++) for (let i = 0; i < r; i++) {
      const ka = (a.r === 1 ? 0 : i) + (a.c === 1 ? 0 : j) * a.r, kb = (b.r === 1 ? 0 : i) + (b.c === 1 ? 0 : j) * b.r, k = i + j * r;
      if (!cplx) { const v = fr(a.re[ka], b.re[kb]); if (Array.isArray(v)) { if (!im) im = new Array(n).fill(0); re[k] = v[0]; im[k] = v[1]; } else re[k] = v; }
      else { const v = fc(a.re[ka], a.im ? a.im[ka] : 0, b.re[kb], b.im ? b.im[kb] : 0); re[k] = v[0]; im[k] = v[1]; }
    }
    return M(r, c, re, im, lg);
  }
  const rpow = (x, y) => (x < 0 && !Number.isInteger(y) ? cx.pow(x, 0, y, 0) : Math.pow(x, y));
  const OPS = {
    "+": [(x, y) => x + y, (a, b, c, d) => [a + c, b + d]], "-": [(x, y) => x - y, (a, b, c, d) => [a - c, b - d]],
    ".*": [(x, y) => x * y, cx.mul], "./": [(x, y) => x / y, cx.div], ".\\": [(x, y) => y / x, (a, b, c, d) => cx.div(c, d, a, b)], ".^": [rpow, cx.pow],
  };
  const CMP = { "<": (x, y) => x < y, "<=": (x, y) => x <= y, ">": (x, y) => x > y, ">=": (x, y) => x >= y, "==": (x, y) => x === y, "~=": (x, y) => x !== y };
  const trueish = m => { const t = toMat(m); return t.re.length > 0 && t.re.every((v, i) => v !== 0 || (t.im && t.im[i] !== 0)); };

  function matmul(a, b) {
    if (a.c !== b.r) fail("Incorrect dimensions for matrix multiplication. Check that the number of columns in the first matrix matches the number of rows in the second matrix. To perform elementwise multiplication, use '.*'.");
    const cplx = a.im || b.im, re = new Array(a.r * b.c).fill(0), im = cplx ? new Array(a.r * b.c).fill(0) : null;
    for (let j = 0; j < b.c; j++) for (let i = 0; i < a.r; i++) { let sr = 0, si = 0; for (let k = 0; k < a.c; k++) { const x = a.re[i + k * a.r], y = b.re[k + j * b.r]; if (cplx) { const xi = a.im ? a.im[i + k * a.r] : 0, yi = b.im ? b.im[k + j * b.r] : 0; sr += x * y - xi * yi; si += x * yi + xi * y; } else sr += x * y; } re[i + j * a.r] = sr; if (cplx) im[i + j * a.r] = si; }
    return M(a.r, b.c, re, im);
  }
  const transpose = (a, conj) => { const re = new Array(a.re.length), im = a.im ? new Array(a.re.length) : null; for (let i = 0; i < a.r; i++) for (let j = 0; j < a.c; j++) { re[j + i * a.c] = a.re[i + j * a.r]; if (im) im[j + i * a.c] = (conj ? -1 : 1) * a.im[i + j * a.r]; } return M(a.c, a.r, re, im); };
  const rows2 = a => Array.from({ length: a.r }, (_, i) => Array.from({ length: a.c }, (_, j) => G(a, i, j)));
  const needReal = (a, what) => { if (a.im) fail(`${what} is not supported for complex matrices here.`); return a; };

  function solve(A, B) {   // A \ B: Gaussian elimination for square systems, Householder least squares otherwise
    A = needReal(toMat(A), "Solving"); B = needReal(toMat(B), "Solving");
    if (A.r !== B.r) fail("Dimensions of arrays being concatenated are not consistent.".replace("Dimensions of arrays being concatenated are not consistent.", "Arrays have incompatible sizes for this operation."));
    if (A.r === A.c) {
      const n = A.r, a = rows2(A).map((r, i) => r.concat(rows2(B)[i])), m = B.c; let singular = false;
      for (let k = 0; k < n; k++) { let p = k; for (let i = k + 1; i < n; i++) if (Math.abs(a[i][k]) > Math.abs(a[p][k])) p = i; if (Math.abs(a[p][k]) < 1e-14 * Math.max(1, ...a.map(r => Math.abs(r[k])))) { singular = true; if (a[p][k] === 0) continue; } [a[k], a[p]] = [a[p], a[k]]; for (let i = k + 1; i < n; i++) { const f = a[i][k] / a[k][k]; for (let j = k; j < n + m; j++) a[i][j] -= f * a[k][j]; } }
      if (singular) warn("Matrix is singular to working precision.");
      const X = Array.from({ length: n }, () => new Array(m).fill(0));
      for (let c = 0; c < m; c++) for (let i = n - 1; i >= 0; i--) { let s = a[i][n + c]; for (let j = i + 1; j < n; j++) s -= a[i][j] * X[j][c]; X[i][c] = s / a[i][i]; }
      return fromGrid(n, m, (i, j) => X[i][j]);
    }
    if (A.r < A.c) warn("Rank deficient, rank = " + A.r + ".");
    const m = A.r, n = A.c, a = rows2(A), b = rows2(B), k = B.c;   // Householder QR
    for (let c = 0; c < Math.min(n, m); c++) { let nrm = 0; for (let i = c; i < m; i++) nrm += a[i][c] * a[i][c]; nrm = Math.sqrt(nrm); if (!nrm) continue; const s = a[c][c] > 0 ? -nrm : nrm, v = []; for (let i = c; i < m; i++) v.push(a[i][c]); v[0] -= s; const vv = v.reduce((q, x) => q + x * x, 0); if (!vv) continue;
      for (const M2 of [a, b]) for (let j = 0; j < M2[0].length; j++) { let d = 0; for (let i = c; i < m; i++) d += v[i - c] * M2[i][j]; d = 2 * d / vv; for (let i = c; i < m; i++) M2[i][j] -= d * v[i - c]; } }
    const X = Array.from({ length: n }, () => new Array(k).fill(0));
    for (let q = 0; q < k; q++) for (let i = Math.min(n, m) - 1; i >= 0; i--) { let s = b[i][q]; for (let j = i + 1; j < n; j++) s -= a[i][j] * X[j][q]; X[i][q] = s / a[i][i]; }
    return fromGrid(n, k, (i, j) => X[i][j]);
  }
  const luDet = A => { const n = A.r, a = rows2(A); let d = 1; for (let k = 0; k < n; k++) { let p = k; for (let i = k + 1; i < n; i++) if (Math.abs(a[i][k]) > Math.abs(a[p][k])) p = i; if (a[p][k] === 0) return 0; if (p !== k) { [a[k], a[p]] = [a[p], a[k]]; d = -d; } d *= a[k][k]; for (let i = k + 1; i < n; i++) { const f = a[i][k] / a[k][k]; for (let j = k; j < n; j++) a[i][j] -= f * a[k][j]; } } return d; };
  const eye = n => fromGrid(n, n, (i, j) => +(i === j));
  function inv(A) { A = needReal(toMat(A), "inv"); if (A.r !== A.c) fail("Matrix must be square."); const d = luDet(A); if (d === 0) { warn("Matrix is singular to working precision."); return fromGrid(A.r, A.c, () => Infinity); } return solve(A, eye(A.r)); }
  function mpow(A, p) {
    if (isScalar(A) && isScalar(p)) return ewise(A, p, rpow, cx.pow);
    if (!isScalar(p)) fail("Incorrect dimensions for raising a matrix to a power. Check that the matrix is square and the power is a scalar. To perform elementwise matrix powers, use '.^'.");
    if (A.r !== A.c) fail("Incorrect dimensions for raising a matrix to a power. Check that the matrix is square and the power is a scalar. To perform elementwise matrix powers, use '.^'.");
    let n = p.re[0]; if (!Number.isInteger(n)) fail("Non-integer matrix powers are not supported."); let base = n < 0 ? inv(A) : A, r = eye(A.r); n = Math.abs(n);
    while (n) { if (n & 1) r = matmul(r, base); base = matmul(base, base); n = Math.floor(n / 2); } return r;
  }
  function eig(A) {   // eigenvalues of a real square matrix: shifted QR iteration, complex pairs read off 2x2 blocks
    A = needReal(toMat(A), "eig"); if (A.r !== A.c) fail("Matrix must be square."); let a = rows2(A), n = a.length; const res = [];
    const qrStep = (m, mu) => {
      const k = m.length, X = m.map((r, i) => r.map((v, j) => v - (i === j ? mu : 0))), Q = [], R = Array.from({ length: k }, () => new Array(k).fill(0));
      for (let j = 0; j < k; j++) {
        let v = X.map(r => r[j]);
        for (let pass = 0; pass < 2; pass++) for (let i = 0; i < j; i++) { const d = Q[i].reduce((sum2, q, t) => sum2 + q * v[t], 0); R[i][j] += d; v = v.map((x, t) => x - d * Q[i][t]); }
        const nr = Math.hypot(...v); R[j][j] = nr; Q.push(nr ? v.map(x => x / nr) : v);
      }
      return Array.from({ length: k }, (_, i) => Array.from({ length: k }, (_, j) => { let sum2 = 0; for (let t = i; t < k; t++) sum2 += R[i][t] * Q[j][t]; return sum2 + (i === j ? mu : 0); }));
    };
    const lowSmall = from => { for (let i = from; i < n; i++) for (let j = 0; j < from; j++) if (Math.abs(a[i][j]) > 1e-13 * (Math.abs(a[i][i]) + Math.abs(a[j][j]) + 1e-300)) return false; return true; };
    const shrink = k => { n -= k; a = a.slice(0, n).map(r => r.slice(0, n)); };
    let it = 0;
    while (n > 0) {
      if (n === 1) { res.push([a[0][0], 0]); break; }
      if (lowSmall(n - 1)) { res.push([a[n - 1][n - 1], 0]); shrink(1); it = 0; continue; }
      const p = a[n - 2][n - 2], q = a[n - 2][n - 1], r = a[n - 1][n - 2], s = a[n - 1][n - 1], tr = p + s, disc = tr * tr / 4 - (p * s - q * r);
      if (n === 2 || lowSmall(n - 2)) {
        if (disc < 0) { const w = Math.sqrt(-disc); res.push([tr / 2, w], [tr / 2, -w]); shrink(2); it = 0; continue; }
        if (n === 2) { const sq = Math.sqrt(disc); res.push([tr / 2 + sq, 0], [tr / 2 - sq, 0]); break; }
      }
      if (++it > 1000) fail("eig did not converge.");
      const sq = Math.sqrt(Math.max(disc, 0)), mu = disc >= 0 ? (Math.abs(tr / 2 + sq - s) < Math.abs(tr / 2 - sq - s) ? tr / 2 + sq : tr / 2 - sq) : s;
      a = qrStep(a, mu);
    }
    res.sort((u, v) => u[0] - v[0] || u[1] - v[1]); return M(res.length, 1, res.map(z => z[0]), res.map(z => z[1]));
  }

  /* ---------- indexing ---------- */
  function idxList(ix, len, dimName) {   // an index argument -> array of zero-based positions
    if (ix === ":") return Array.from({ length: len }, (_, i) => i);
    const m = toMat(ix);
    if (m.lg) { if (m.re.length > len && m.re.slice(len).some(v => v)) fail(`Index exceeds the number of array elements. Index must not exceed ${len}.`); const o = []; m.re.forEach((v, i) => v && o.push(i)); return o; }
    return m.re.map(v => { if (!Number.isInteger(v)) fail(v === 0 ? "Index in position 1 is invalid. Array indices must be positive integers or logical values." : `Array indices must be positive integers or logical values.`); if (v < 1) fail(v === 0 ? "Index in position 1 is invalid. Array indices must be positive integers or logical values." : "Index in position 1 is invalid. Array indices must be positive integers or logical values."); return v - 1; });
  }
  function indexInto(a, args) {
    if (a.t === "s") { const r = indexInto(toMat(a), args); return str(String.fromCharCode(...r.re)); }
    if (args.length === 0) return a;
    if (args.length === 1) {
      const ix = args[0], n = a.re.length, list = idxList(ix, n); list.forEach(k => { if (k >= n) fail(`Index exceeds the number of array elements. Index must not exceed ${n}.`); });
      const re = list.map(k => a.re[k]), im = a.im ? list.map(k => a.im[k]) : null;
      if (ix === ":") return M(re.length, 1, re, im);
      const im2 = toMat(ix), col = im2.lg ? (im2.r === 1 ? false : true) : null;
      let r, c; if ((a.r === 1 || a.c === 1) && (im2.r === 1 || im2.c === 1 || im2.lg)) { if (a.r === 1 && a.c !== 1) { r = 1; c = re.length; } else if (a.c === 1 && a.r !== 1) { r = re.length; c = 1; } else { r = im2.r === 1 ? 1 : re.length; c = im2.r === 1 ? re.length : 1; } } else if (im2.lg) { r = re.length; c = 1; } else { r = im2.r; c = im2.c; }
      return M(r, c, re, im, a.lg);
    }
    if (args.length > 2) { if (args.slice(2).every(x => x === ":" || (toMat(x).re.length === 1 && toMat(x).re[0] === 1))) args = args.slice(0, 2); else fail("Index exceeds the number of array dimensions. Index must not exceed 2."); }
    const ri = idxList(args[0], a.r), ci = idxList(args[1], a.c);
    ri.forEach(k => { if (k >= a.r) fail(`Index in position 1 exceeds array bounds. Index must not exceed ${a.r}.`); }); ci.forEach(k => { if (k >= a.c) fail(`Index in position 2 exceeds array bounds. Index must not exceed ${a.c}.`); });
    const re = [], im = a.im ? [] : null; for (const j of ci) for (const i of ri) { re.push(a.re[i + j * a.r]); if (im) im.push(a.im[i + j * a.r]); } return M(ri.length, ci.length, re, im, a.lg);
  }
  function assignInto(a, args, v) {
    a = a ? { ...toMat(a), re: [...toMat(a).re], im: toMat(a).im ? [...toMat(a).im] : null } : M(0, 0, []); const val = toMat(v);
    if (val.r === 0 && val.c === 0 && val.re.length === 0) {   // A(idx) = [] deletes
      if (args.length === 1) { const del = new Set(idxList(args[0], a.re.length)), keep = a.re.map((_, i) => i).filter(i => !del.has(i)); const re = keep.map(i => a.re[i]); return a.c === 1 && a.r !== 1 ? M(re.length, 1, re) : M(1, re.length, re); }
      if (args.length === 2) { if (args[0] === ":") { const del = new Set(idxList(args[1], a.c)), keep = [...Array(a.c).keys()].filter(j => !del.has(j)); return fromGrid(a.r, keep.length, (i, j) => G(a, i, keep[j])); } if (args[1] === ":") { const del = new Set(idxList(args[0], a.r)), keep = [...Array(a.r).keys()].filter(i => !del.has(i)); return fromGrid(keep.length, a.c, (i, j) => G(a, keep[i], j)); } }
      fail("A null assignment can have only one non-colon index.");
    }
    const needIm = a.im || val.im; if (needIm && !a.im) a.im = a.re.map(() => 0);
    const resize = (R, C) => { if (R === a.r && C === a.c) return; const re = new Array(R * C).fill(0), im = needIm ? new Array(R * C).fill(0) : null; for (let j = 0; j < a.c; j++) for (let i = 0; i < a.r; i++) { re[i + j * R] = a.re[i + j * a.r]; if (im && a.im) im[i + j * R] = a.im[i + j * a.r]; } a = { ...a, r: R, c: C, re, im }; };
    const put = (k, t) => { a.re[k] = val.re.length === 1 ? val.re[0] : val.re[t]; if (a.im) a.im[k] = val.im ? (val.re.length === 1 ? val.im[0] : val.im[t]) : 0; };
    if (args.length === 1) {
      const n = a.re.length, list = args[0] === ":" ? [...Array(n).keys()] : idxList(args[0], n), mx = Math.max(-1, ...list) + 1;
      if (val.re.length !== 1 && val.re.length !== list.length) fail("Unable to perform assignment because the number of elements on the left and right sides must be the same.".replace("Unable to perform assignment because the number of elements on the left and right sides must be the same.", "Unable to perform assignment because the left and right sides have a different number of elements."));
      if (mx > n) { if (a.re.length === 0 || a.r === 1) resize(1, mx); else if (a.c === 1) resize(mx, 1); else fail("Attempt to grow array along ambiguous dimension."); }
      list.forEach((k, t) => put(k, t)); return M(a.r, a.c, a.re, a.im, false);
    }
    const ri = args[0] === ":" ? [...Array(a.r || (val.r)).keys()] : idxList(args[0], a.r), ci = args[1] === ":" ? [...Array(a.c || (val.c)).keys()] : idxList(args[1], a.c);
    if (val.re.length !== 1 && (val.r !== ri.length || val.c !== ci.length) && val.re.length !== ri.length * ci.length) fail("Unable to perform assignment because the size of the left side is " + ri.length + "-by-" + ci.length + " and the size of the right side is " + val.r + "-by-" + val.c + ".");
    resize(Math.max(a.r, Math.max(-1, ...ri) + 1), Math.max(a.c, Math.max(-1, ...ci) + 1)); let t = 0; for (const j of ci) for (const i of ri) put(i + j * a.r, t++);
    return M(a.r, a.c, a.re, a.im, false);
  }

  /* ---------- evaluating ---------- */
  const warnings = [];
  const warn = m => warnings.push(`Warning: ${m}`);
  const lookup = (n, env) => (env && n in env ? env[n] : n in W.vars ? W.vars[n] : undefined);
  const CONSTS = { pi: () => sc(Math.PI), e: () => sc(Math.E), tau: () => sc(2 * Math.PI), phi: () => sc((1 + Math.sqrt(5)) / 2), Inf: () => sc(Infinity), inf: () => sc(Infinity), NaN: () => sc(NaN), nan: () => sc(NaN), eps: () => sc(EPS), i: () => sc(0, 1), j: () => sc(0, 1), true: () => bool(true), false: () => bool(false), realmax: () => sc(Number.MAX_VALUE), realmin: () => sc(2.2250738585072014e-308), intmax: () => sc(2147483647), intmin: () => sc(-2147483648) };

  function ev(n, env, endCtx) {
    switch (n.t) {
      case "num": return sc(n.v, n.im || 0);
      case "str": return str(n.v);
      case "paren": return ev(n.a, env, endCtx);
      case "colon": return str(":");
      case "end": if (!endCtx) fail("The end operator must be used within an array index."); return sc(endCtx.len);
      case "var": { const v = lookup(n.n, env); if (v !== undefined) return v; if (n.n === "ans") fail("Unrecognized function or variable 'ans'."); if (n.n in CONSTS) return CONSTS[n.n](); const r = call(n.n, [], 1, true); if (r) return r[0]; fail(`Unrecognized function or variable '${n.n}'.`); }
      case "un": { const a = ev(n.a, env, endCtx); if (n.op === "~") { const m = toMat(a); return M(m.r, m.c, m.re.map((v, i) => +(v === 0 && !(m.im && m.im[i]))), null, true); } if (n.op === "+") return a; const m = toMat(a); return M(m.r, m.c, m.re.map(v => -v), m.im ? m.im.map(v => -v) : null); }
      case "post": return transpose(toMat(ev(n.a, env, endCtx)), n.op === "'");
      case "range": {
        const a = num(ev(n.a, env, endCtx), "range start"), st = n.s ? num(ev(n.s, env, endCtx), "range step") : 1, b = num(ev(n.b, env, endCtx), "range end");
        if (st === 0 || (st > 0 && a > b) || (st < 0 && a < b) || Number.isNaN(a + st + b)) return M(1, 0, []);
        const cnt = Math.floor((b - a) / st * (1 + EPS * 4) + 1e-10) + 1, re = Array.from({ length: cnt }, (_, i) => a + i * st); return M(1, cnt, re);
      }
      case "matrix": return buildMatrix(n.rows.map(row => row.map(e => ev(e, env, endCtx))));
      case "anon": return { t: "f", params: n.params, body: n.body, src: n.src, cap: { ...W.vars, ...(env || {}) } };
      case "handle": { if (lookup(n.n, env) && lookup(n.n, env).t === "f") return lookup(n.n, env); return { t: "f", name: n.n, params: ["x"], src: n.n }; }
      case "bin": {
        const op = n.op;
        if (op === "&&" || op === "||") { const a = ev(n.a, env, endCtx); if (op === "&&" ? !trueish(a) : trueish(a)) return bool(op === "||"); return bool(trueish(ev(n.b, env, endCtx))); }
        const a = ev(n.a, env, endCtx), b = ev(n.b, env, endCtx);
        if (op in OPS) return ewise(a, b, OPS[op][0], OPS[op][1]);
        if (op in CMP) { const f = CMP[op], A = toMat(a), B = toMat(b); if (op === "==" || op === "~=") { const r = ewise(A, B, (x, y) => +f(x, y), (p, q, c, d) => [+(op === "==" ? p === c && q === d : !(p === c && q === d)), 0]); return M(r.r, r.c, r.re, null, true); } const r = ewise(A, B, (x, y) => +f(x, y), (p, q, c, d) => [+f(p, c), 0]); return M(r.r, r.c, r.re, null, true); }
        if (op === "&" || op === "|") { const r = ewise(a, b, (x, y) => +(op === "&" ? x !== 0 && y !== 0 : x !== 0 || y !== 0)); return M(r.r, r.c, r.re, null, true); }
        const A = toMat(a), B = toMat(b);
        if (op === "*") return isScalar(A) || isScalar(B) ? ewise(A, B, OPS[".*"][0], cx.mul) : matmul(A, B);
        if (op === "/") return isScalar(B) ? ewise(A, B, OPS["./"][0], cx.div) : transpose(solve(transpose(B), transpose(A)));
        if (op === "\\") return isScalar(A) ? ewise(A, B, OPS[".\\"][0], OPS[".\\"][1]) : solve(A, B);
        if (op === "^") return mpow(A, B);
        fail(`Unsupported operator ${op}.`);
      }
      case "idx": {
        // function call or indexing?
        if (n.a.t === "var") {
          const v = lookup(n.a.n, env);
          if (v === undefined || v.t === "f") {
            const f = v && v.t === "f" ? v : null, args = n.args.map(x => ev(x, env, endCtx));
            if (f) return callHandle(f, args, 1)[0];
            const r = call(n.a.n, args, 1); if (r && r.length) return r[0]; if (r) return { t: "none" };
          }
          const base = v; const total = base.t === "s" ? base.s.length : base.t === "m" ? base.re.length : 1;
          const args = n.args.map((x, k) => (x.t === "colon" ? ":" : ev(x, env, { len: n.args.length === 1 ? total : k === 0 ? base.r : base.c })));
          if (base.t === "f") return callHandle(base, args.map(a => (a === ":" ? str(":") : a)), 1)[0];
          return indexInto(base, args);
        }
        const base = ev(n.a, env, endCtx); if (base.t === "f") return callHandle(base, n.args.map(x => ev(x, env, endCtx)), 1)[0];
        const total = base.t === "s" ? base.s.length : base.re.length;
        return indexInto(base, n.args.map((x, k) => (x.t === "colon" ? ":" : ev(x, env, { len: n.args.length === 1 ? total : k === 0 ? base.r : base.c }))));
      }
    }
    fail("Unsupported expression.");
  }
  function buildMatrix(rows) {
    const built = rows.map(row => {
      row = row.filter(v => !(v.t === "m" && v.re.length === 0 && v.r === 0 && v.c === 0));
      if (!row.length) return M(0, 0, []);
      if (row.every(v => v.t === "s")) return str(row.map(v => v.s).join(""));
      if (row.some(v => v.t === "f")) fail("Function handles cannot be concatenated.");
      const ms = row.map(toMat), nz = ms.filter(m => m.r || m.c), r = nz.length ? nz[0].r : 0;
      nz.forEach(m => { if (m.r !== r) fail("Dimensions of arrays being concatenated are not consistent."); });
      const re = [], im = ms.some(m => m.im) ? [] : null; let c = 0; for (const m of nz) { re.push(...m.re); if (im) im.push(...(m.im || m.re.map(() => 0))); c += m.c; }
      return M(r, c, re, im, nz.length > 0 && nz.every(m => m.lg));
    });
    if (built.length === 1) return built[0];
    if (built.every(v => v.t === "s")) return str(built.map(v => v.s).join(""));
    const ms = built.map(toMat).filter(m => m.re.length || m.c), c = ms.length ? ms[0].c : 0; ms.forEach(m => { if (m.c !== c) fail("Dimensions of arrays being concatenated are not consistent."); });
    const R = ms.reduce((s, m) => s + m.r, 0), cplx = ms.some(m => m.im), re = new Array(R * c), im = cplx ? new Array(R * c) : null; let off = 0;
    for (const m of ms) { for (let j = 0; j < c; j++) for (let i = 0; i < m.r; i++) { re[off + i + j * R] = m.re[i + j * m.r]; if (im) im[off + i + j * R] = m.im ? m.im[i + j * m.r] : 0; } off += m.r; }
    return M(R, c, re, im);
  }
  function callHandle(f, args, nout) {
    if (f.name) { const r = call(f.name, args, nout); if (!r) fail(`Unrecognized function or variable '${f.name}'.`); return r; }
    if (args.length > f.params.length) fail("Too many input arguments.");
    const env = { ...f.cap }; f.params.forEach((q, i) => { if (i < args.length) env[q] = args[i]; });
    const r = ev(f.body, env); return [r];
  }

  /* ---------- the function library ---------- */
  const RESULT = v => [v];
  const dimOf = (m, d) => (d != null ? d : m.r > 1 ? 1 : 2);
  function along(m, d, fn, outLen = 1) {   // apply fn(arrayOfValues) -> number | array along dimension d
    if (d === 1) { const cols = Array.from({ length: m.c }, (_, j) => fn(Array.from({ length: m.r }, (_, i) => G(m, i, j)))); return outLen === 1 ? M(1, m.c, cols) : fromGrid(cols[0] ? cols[0].length : 0, m.c, (i, j) => cols[j][i]); }
    const rws = Array.from({ length: m.r }, (_, i) => fn(Array.from({ length: m.c }, (_, j) => G(m, i, j)))); return outLen === 1 ? M(m.r, 1, rws) : fromGrid(m.r, rws[0] ? rws[0].length : 0, (i, j) => rws[i][j]);
  }
  const redArg = (m, a) => dimOf(m, a ? num(a, "dimension") : null);
  const sum = xs => { let s = 0, c = 0; for (const x of xs) { const y = x - c, t = s + y; c = (t - s) - y; s = t; } return s; };
  const mean = xs => sum(xs) / xs.length, median = xs => { if (!xs.length) return NaN; const s = [...xs].sort((a, b) => a - b), h = s.length >> 1; return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2; };
  const variance = (xs, opt = 0) => { if (xs.length === 1) return 0; const m = mean(xs); return sum(xs.map(x => (x - m) ** 2)) / (xs.length - (opt === 1 ? 0 : 1)); };
  const vec = m => toMat(m).re;
  const rowOrCol = (like, arr) => (like.c === 1 && like.r !== 1 ? M(arr.length, 1, arr) : M(1, arr.length, arr));
  const sortIdx = (arr, desc) => arr.map((v, i) => [v, i]).sort((p, q) => (Number.isNaN(p[0]) ? 1 : Number.isNaN(q[0]) ? -1 : desc ? q[0] - p[0] || p[1] - q[1] : p[0] - q[0] || p[1] - q[1]));
  const sizeArgs = (a, name) => { const v = a.map(x => num(x, "size")); if (!v.length) return [1, 1]; if (v.length === 1) return [v[0], v[0]]; if (v.length === 2 && a[0].re && a[0].re.length > 1) return [a[0].re[0], a[0].re[1]]; return [v[0], v[1]]; };
  const dims = (a, name) => { if (a.length === 1 && a[0].t === "m" && a[0].re.length > 1) return [a[0].re[0], a[0].re[1]]; const [r, c] = sizeArgs(a); if (r < 0 || c < 0 || !Number.isInteger(r) || !Number.isInteger(c)) fail("Size inputs must be integers."); return [r, c]; };
  function cmpExtreme(args, nout, isMax) {
    const f = isMax ? (a, b) => a > b : (a, b) => a < b;
    if (args.length >= 2 && !(toMat(args[1]).re.length === 0)) { const r = ewise(args[0], args[1], (x, y) => (Number.isNaN(x) ? y : Number.isNaN(y) ? x : f(x, y) ? x : y)); return [r]; }
    const m = toMat(args[0]); if (m.im) { }
    const d = dimOf(m, args[2] ? num(args[2]) : null), idx = [], vals = along(m, d, xs => { let b = -1; xs.forEach((x, i) => { if (!Number.isNaN(x) && (b < 0 || f(x, xs[b]))) b = i; }); idx.push(b < 0 ? 1 : b + 1); return b < 0 ? NaN : xs[b]; });
    if (m.re.length === 0) return [M(0, 0, []), M(0, 0, [])]; return [vals, d === 1 ? M(1, idx.length, idx) : M(idx.length, 1, idx)];
  }
  function polyval(p, x) { return ewise(x, sc(0), (v) => { let r = 0; for (const c of p) r = r * v + c; return r; }, null); }
  function polyfit(x, y, n) { const xs = vec(x), ys = vec(y); if (xs.length !== ys.length) fail("X and Y vectors must be the same size."); const A = fromGrid(xs.length, n + 1, (i, j) => Math.pow(xs[i], n - j)); return solve(A, M(ys.length, 1, ys)); }
  function polyroots(p) {
    let c = p.slice(); while (c.length && c[0] === 0) c.shift(); let zeros = 0; while (c.length && c[c.length - 1] === 0) { c.pop(); zeros++; }
    const n = c.length - 1; if (n < 1) return zeros ? M(zeros, 1, new Array(zeros).fill(0)) : M(0, 0, []);
    const comp = fromGrid(n, n, (i, j) => (i === 0 ? -c[j + 1] / c[0] : i === j + 1 ? 1 : 0)), e = eig(comp);
    return M(e.re.length + zeros, 1, e.re.concat(new Array(zeros).fill(0)), e.im ? e.im.concat(new Array(zeros).fill(0)) : null);
  }
  function fzero(f, x0) {
    const F = x => { const r = callHandle(f, [sc(x)], 1)[0]; return num(r, "function value"); };
    let a, b, fa, fb;
    if (x0.re.length >= 2) { a = x0.re[0]; b = x0.re[1]; fa = F(a); fb = F(b); if (fa * fb > 0) fail("The function values at the interval endpoints must differ in sign."); }
    else { a = x0.re[0]; fa = F(a); if (fa === 0) return a; b = a; fb = fa; let d = a === 0 ? 0.1 : Math.abs(a) * 0.1, found = false; for (let k = 0; k < 60 && !found; k++) { for (const sg of [-1, 1]) { const t = a + sg * d, ft = F(t); if (Number.isFinite(ft) && fa * ft <= 0) { b = t; fb = ft; found = true; break; } } d *= 1.6; } if (!found) fail("Unable to find an interval containing a sign change."); }
    if (fa === 0) return a; if (fb === 0) return b; let lo = Math.min(a, b), hi = Math.max(a, b), flo = lo === a ? fa : fb;
    for (let k = 0; k < 400; k++) { const mid = (lo + hi) / 2, fm = F(mid); if (fm === 0 || hi - lo < 2e-16 * Math.max(1, Math.abs(mid))) return mid; if (flo * fm < 0) hi = mid; else { lo = mid; flo = fm; } } return (lo + hi) / 2;
  }
  const isPrime = n => { if (n < 2 || !Number.isInteger(n)) return false; for (let i = 2; i * i <= n; i++) if (n % i === 0) return false; return true; };
  const toNum2 = (v, digits) => { if (Number.isInteger(v)) return String(v); if (!Number.isFinite(v)) return Number.isNaN(v) ? "NaN" : v > 0 ? "Inf" : "-Inf"; const sig = digits != null ? digits : Math.max(Math.floor(Math.log10(Math.abs(v))) + 5, 5); return String(parseFloat(v.toPrecision(Math.min(sig, 16)))); };
  function num2str(a, p) {
    if (a.t === "s") return a.s; const m = toMat(a);
    const one = (re, im) => im ? `${toNum2(re, p)}${im < 0 ? "-" : "+"}${toNum2(Math.abs(im), p)}i` : toNum2(re, p);
    const rowsOut = rows2(m).map((r, i) => r.map((v, j) => one(v, m.im ? m.im[i + j * m.r] : 0)).join("  ")); return rowsOut.join("\n");
  }
  function sprintf(fmt, args) {
    const flat = []; args.forEach(a => { if (a.t === "s") flat.push(a.s); else toMat(a).re.forEach(v => flat.push(v)); });
    const esc = s => s.replace(/\\n/g, "\n").replace(/\\t/g, "\t").replace(/\\\\/g, "\\").replace(/\\'/g, "'").replace(/\\"/g, '"'); fmt = esc(fmt);
    const re = /%(%|([-+ 0#]*)(\d+)?(?:\.(\d+))?([diufeEgGsxXcol]))/g, specs = [...fmt.matchAll(re)].filter(m => m[1] !== "%"); let out = "", k = 0, first = true;
    const fmt1 = (m, v) => {
      const flags = m[2] || "", w = m[3] ? +m[3] : 0, pr = m[4] != null ? +m[4] : null, ty = m[5]; let s;
      if (ty === "s" || ty === "c") s = typeof v === "number" ? (ty === "c" ? String.fromCharCode(v) : toNum2(v)) : String(v);
      else { if (typeof v === "string") { s = v; return s; } const x = v;
        if (ty === "d" || ty === "i" || ty === "u") s = Number.isInteger(x) ? String(x) : fmtG(x, pr); else if (ty === "f") s = Number.isFinite(x) ? x.toFixed(pr == null ? 6 : pr) : (Number.isNaN(x) ? "NaN" : x > 0 ? "Inf" : "-Inf");
        else if (ty === "e" || ty === "E") { s = x.toExponential(pr == null ? 6 : pr).replace(/e([+-])(\d)$/, "e$10$2"); if (ty === "E") s = s.toUpperCase(); } else if (ty === "g" || ty === "G") s = fmtG(x, pr); else if (ty === "x") s = Math.trunc(x).toString(16); else if (ty === "X") s = Math.trunc(x).toString(16).toUpperCase(); else s = String(x);
        if (flags.includes("+") && x >= 0) s = "+" + s; }
      if (s.length < w) s = flags.includes("-") ? s.padEnd(w) : flags.includes("0") && ty !== "s" ? (/^[-+]/.test(s) ? s[0] + s.slice(1).padStart(w - 1, "0") : s.padStart(w, "0")) : s.padStart(w); return s;
    };
    const fmtG = (x, pr) => { if (!Number.isFinite(x)) return Number.isNaN(x) ? "NaN" : x > 0 ? "Inf" : "-Inf"; const P = pr == null ? 6 : pr || 1, e = x === 0 ? 0 : Math.floor(Math.log10(Math.abs(x))); if (e < -5 || e >= P) return x.toExponential(P - 1).replace(/\.?0+e/, "e").replace(/e([+-])(\d)$/, "e$10$2"); return String(parseFloat(x.toPrecision(P))); };
    for (;;) {
      out += fmt.replace(re, (all, p1, f, w, pr, ty, off) => { if (p1 === "%") return "%"; const m = [all, p1, f, w, pr, ty]; if (k >= flat.length) { return first && !flat.length ? "" : ""; } return fmt1(m, flat[k++]); });
      first = false; if (k >= flat.length || !specs.length) break;
    }
    return out;
  }
  function mat2str(a) {
    if (a.t === "s") return `'${a.s}'`; const m = toMat(a), one = (re, im) => im ? `${toNum2(re, 15)}${im < 0 ? "-" : "+"}${toNum2(Math.abs(im), 15)}i` : (m.lg ? (re ? "true" : "false") : toNum2(re, 15));
    const rs = rows2(m).map((r, i) => r.map((v, j) => one(v, m.im ? m.im[i + j * m.r] : 0)).join(" ")); return m.re.length === 1 ? rs[0] : "[" + rs.join(";") + "]";
  }
  const kindName = v => (v.t === "s" ? "char" : v.t === "f" ? "function_handle" : v.lg ? "logical" : "double");

  const B = {};   // name -> (args, nargout) => array of values (or undefined for none)
  const def = (names, fn) => names.split(" ").forEach(n => { B[n] = fn; NAMES.add(n); });
  Object.keys(R1).forEach(n => def(n, a => { if (a.length !== 1) fail(a.length ? "Too many input arguments." : "Not enough input arguments."); const m = toMat(a[0]), [rf, dom, cf] = R1[n], im = new Array(m.re.length).fill(0); let cplx = false, re = m.re.map((x, i) => { const y = m.im ? m.im[i] : 0; if (!y && (!dom || dom(x)) && rf) return rf(x); if (!cf) { if (y) fail(`${n} is not supported for complex values.`); return rf(x); } const r = cf(x, y); im[i] = r[1]; if (r[1]) cplx = true; return r[0]; }); const out = M(m.r, m.c, re, cplx ? im : null); return [n === "isnan" || n === "isinf" || n === "isfinite" ? M(m.r, m.c, re, null, true) : out]; }));
  Object.keys(PARTWISE).forEach(n => def(n, a => { const m = toMat(a[0]); if (a[1] && n === "round") { const d = Math.pow(10, num(a[1])); return [M(m.r, m.c, m.re.map(x => rnd(x * d) / d), m.im ? m.im.map(x => rnd(x * d) / d) : null)]; } return [M(m.r, m.c, m.re.map(PARTWISE[n]), m.im ? m.im.map(PARTWISE[n]) : null)]; }));
  def("abs", a => { const m = toMat(a[0]); return [M(m.r, m.c, m.re.map((x, i) => (m.im ? Math.hypot(x, m.im[i]) : Math.abs(x))))]; });
  def("real", a => { const m = toMat(a[0]); return [M(m.r, m.c, [...m.re])]; });
  def("imag", a => { const m = toMat(a[0]); return [M(m.r, m.c, m.im ? [...m.im] : m.re.map(() => 0))]; });
  def("conj", a => { const m = toMat(a[0]); return [M(m.r, m.c, [...m.re], m.im ? m.im.map(v => -v) : null)]; });
  def("angle arg", a => { const m = toMat(a[0]); return [M(m.r, m.c, m.re.map((x, i) => Math.atan2(m.im ? m.im[i] : 0, x)))]; });
  def("complex", a => { const r = toMat(a[0]), i = toMat(a[1] || sc(0)); const o = ewise(r, i, (x) => x, (p, q, c, d) => [p, c]); return [M(o.r, o.c, ewise(r, i, x => x, (p, q, c, d) => [p, c]).re, ewise(r, i, (x, y) => y, (p, q, c, d) => [c, 0]).re)]; });
  def("isreal", a => [bool(!toMat(a[0]).im)]);
  def("atan2", a => [ewise(a[0], a[1], (y, x) => Math.atan2(y, x))]);
  def("atan2d", a => [ewise(a[0], a[1], (y, x) => Math.atan2(y, x) / D2R)]);
  def("hypot", a => [ewise(a[0], a[1], Math.hypot)]);
  def("mod", a => [ewise(a[0], a[1], (x, y) => (y === 0 ? x : x - Math.floor(x / y) * y))]);
  def("rem", a => [ewise(a[0], a[1], (x, y) => (y === 0 ? x : x - Math.trunc(x / y) * y))]);
  def("power", a => [ewise(a[0], a[1], rpow, cx.pow)]); def("times", a => [ewise(a[0], a[1], OPS[".*"][0], cx.mul)]); def("plus", a => [ewise(a[0], a[1], OPS["+"][0], OPS["+"][1])]); def("minus", a => [ewise(a[0], a[1], OPS["-"][0], OPS["-"][1])]);
  def("rdivide", a => [ewise(a[0], a[1], OPS["./"][0], cx.div)]); def("mtimes", a => [matmul(toMat(a[0]), toMat(a[1]))]);
  def("nthroot", a => [ewise(a[0], a[1], (x, n) => { if (x < 0 && n % 2 === 0) fail("nthroot: X must be nonnegative when N is even."); return x < 0 ? -Math.pow(-x, 1 / n) : Math.pow(x, 1 / n); })]);
  def("gcd", a => [ewise(a[0], a[1], gcd)]); def("lcm", a => [ewise(a[0], a[1], (x, y) => (x && y ? Math.abs(x * y) / gcd(x, y) : 0))]);
  def("nchoosek", a => [ewise(a[0], a[1], (n, k) => { if (k > n) return 0; k = Math.min(k, n - k); let r = 1; for (let i = 1; i <= k; i++) r = r * (n - k + i) / i; return Math.round(r); })]);
  def("isprime", a => { const m = toMat(a[0]); return [M(m.r, m.c, m.re.map(x => +isPrime(x)), null, true)]; });
  def("primes", a => { const n = num(a[0]), o = []; for (let i = 2; i <= n; i++) if (isPrime(i)) o.push(i); return [M(1, o.length, o)]; });
  def("factor", a => { let n = num(a[0]); const o = []; for (let p = 2; p * p <= n; p++) while (n % p === 0) { o.push(p); n /= p; } if (n > 1 || !o.length) o.push(n); return [M(1, o.length, o)]; });
  def("max", (a, no) => cmpExtreme(a, no, true)); def("min", (a, no) => cmpExtreme(a, no, false));
  const redDef = (names, fn, empty) => def(names, a => { const m = toMat(a[0]); if (m.re.length === 0) return [sc(empty)]; if (m.im && /^(sum|mean|prod)$/.test(names.split(" ")[0])) { const n0 = names.split(" ")[0]; if (n0 === "prod") { let r = [1, 0]; m.re.forEach((x, i) => (r = cx.mul(r[0], r[1], x, m.im[i]))); return [sc(r[0], r[1])]; } const k = n0 === "mean" ? m.re.length : 1; return [sc(sum(m.re) / k, sum(m.im) / k)]; } return [along(m, redArg(m, a[1]), fn)]; });
  redDef("sum", sum, 0); redDef("prod", xs => xs.reduce((p, x) => p * x, 1), 1); redDef("mean", mean, NaN); redDef("median", median, NaN);
  def("std", a => { const m = toMat(a[0]), opt = a[1] && a[1].re && a[1].re.length ? num(a[1]) : 0; return [along(m, redArg(m, a[2]), xs => Math.sqrt(variance(xs, opt)))]; });
  def("var", a => { const m = toMat(a[0]), opt = a[1] && a[1].re && a[1].re.length ? num(a[1]) : 0; return [along(m, redArg(m, a[2]), xs => variance(xs, opt))]; });
  def("mode", a => { const m = toMat(a[0]); return [along(m, redArg(m, a[1]), xs => { const c = new Map(); xs.forEach(x => c.set(x, (c.get(x) || 0) + 1)); let best = NaN, bc = 0; [...c].sort((p, q) => p[0] - q[0]).forEach(([x, n]) => { if (n > bc) { best = x; bc = n; } }); return best; })]; });
  def("range", a => { const m = toMat(a[0]); return [along(m, redArg(m, null), xs => Math.max(...xs) - Math.min(...xs))]; });
  def("any", a => { const m = toMat(a[0]), r = along(m, redArg(m, a[1]), xs => +xs.some(x => x !== 0)); return [M(r.r, r.c, r.re, null, true)]; });
  def("all", a => { const m = toMat(a[0]), r = along(m, redArg(m, a[1]), xs => +xs.every(x => x !== 0)); return [M(r.r, r.c, r.re, null, true)]; });
  const cum = (names, f) => def(names, a => { const m = toMat(a[0]), d = redArg(m, a[1]); return [d === 1 ? fromGrid(m.r, m.c, (i, j) => { let s = f.init; for (let k = 0; k <= i; k++) s = f.op(s, G(m, k, j)); return s; }) : fromGrid(m.r, m.c, (i, j) => { let s = f.init; for (let k = 0; k <= j; k++) s = f.op(s, G(m, i, k)); return s; })]; });
  cum("cumsum", { init: 0, op: (s, x) => s + x }); cum("cumprod", { init: 1, op: (s, x) => s * x });
  def("diff", a => { const m = toMat(a[0]); if (m.r === 1 || m.c === 1) { const v = m.re, o = v.slice(1).map((x, i) => x - v[i]); return [rowOrCol(m, o)]; } return [fromGrid(m.r - 1, m.c, (i, j) => G(m, i + 1, j) - G(m, i, j))]; });
  def("sort", (a, no) => { const m = toMat(a[0]), desc = a.some(x => x.t === "s" && /^desc/i.test(x.s)); if (m.r === 1 || m.c === 1) { const s = sortIdx(m.re, desc); return [rowOrCol(m, s.map(p => p[0])), rowOrCol(m, s.map(p => p[1] + 1))]; } const idx = []; const cols = Array.from({ length: m.c }, (_, j) => sortIdx(Array.from({ length: m.r }, (_, i) => G(m, i, j)), desc)); return [fromGrid(m.r, m.c, (i, j) => cols[j][i][0]), fromGrid(m.r, m.c, (i, j) => cols[j][i][1] + 1)]; });
  def("find", a => { const m = toMat(a[0]), k = a[1] ? num(a[1]) : Infinity, o = []; m.re.forEach((v, i) => v !== 0 && o.length < k && o.push(i + 1)); return [m.r === 1 && m.c !== 1 ? M(1, o.length, o) : M(o.length, o.length ? 1 : 0, o)]; });
  def("numel", a => [sc(a[0].t === "s" ? a[0].s.length : a[0].t === "f" ? 1 : a[0].re.length)]);
  def("length", a => { const m = a[0].t === "s" ? toMat(a[0]) : a[0].t === "f" ? sc(0) : a[0]; return [sc(m.re.length ? Math.max(m.r, m.c) : 0)]; });
  def("ndims", () => [sc(2)]); def("isempty", a => [bool((a[0].t === "s" ? a[0].s.length : a[0].re ? a[0].re.length : 1) === 0)]);
  def("isscalar", a => [bool(a[0].t === "m" && a[0].re.length === 1)]); def("isvector", a => [bool(a[0].t === "m" && (a[0].r === 1 || a[0].c === 1) && a[0].re.length >= 1)]);
  def("ischar", a => [bool(a[0].t === "s")]); def("isnumeric", a => [bool(a[0].t === "m" && !a[0].lg)]); def("islogical", a => [bool(a[0].t === "m" && a[0].lg)]);
  def("class", a => [str(kindName(a[0]))]);
  def("size", (a, no) => { const m = a[0].t === "s" ? toMat(a[0]) : a[0].t === "f" ? sc(0) : a[0]; if (a[1]) return [sc(num(a[1]) === 1 ? m.r : num(a[1]) === 2 ? m.c : 1)]; return no >= 2 ? [sc(m.r), sc(m.c)] : [M(1, 2, [m.r, m.c])]; });
  def("zeros", a => { const [r, c] = dims(a); return [M(r, c, new Array(r * c).fill(0))]; }); def("ones", a => { const [r, c] = dims(a); return [M(r, c, new Array(r * c).fill(1))]; });
  def("eye", a => { const [r, c] = dims(a); return [fromGrid(r, c, (i, j) => +(i === j))]; });
  def("rand", a => { const [r, c] = dims(a); return [M(r, c, Array.from({ length: r * c }, Math.random))]; });
  def("randn", a => { const [r, c] = dims(a); return [M(r, c, Array.from({ length: r * c }, () => Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random())))]; });
  def("randi", a => { const lim = toMat(a[0]), lo = lim.re.length > 1 ? lim.re[0] : 1, hi = lim.re.length > 1 ? lim.re[1] : lim.re[0], [r, c] = dims(a.slice(1)); return [M(r, c, Array.from({ length: r * c }, () => lo + Math.floor(Math.random() * (hi - lo + 1))))]; });
  def("magic", a => { const n = num(a[0]); if (n < 3) return [n === 1 ? sc(1) : fromGrid(2, 2, (i, j) => [[4, 3], [1, 2]][i][j])]; const g = Array.from({ length: n }, () => new Array(n).fill(0));
    if (n % 2) { let i = 0, j = (n - 1) / 2; for (let k = 1; k <= n * n; k++) { g[i][j] = k; const ni = (i - 1 + n) % n, nj = (j + 1) % n; if (g[ni][nj]) i = (i + 1) % n; else { i = ni; j = nj; } } }
    else if (n % 4 === 0) { for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { const v = i * n + j + 1; g[i][j] = ((i % 4 === j % 4) || ((i % 4) + (j % 4) === 3)) ? n * n + 1 - v : v; } }
    else { const h = n / 2, sub = B.magic([sc(h)])[0], add = [0, 2, 3, 1]; for (let i = 0; i < h; i++) for (let j = 0; j < h; j++) { const v = G(sub, i, j); g[i][j] = v; g[i + h][j + h] = v + h * h; g[i][j + h] = v + 2 * h * h; g[i + h][j] = v + 3 * h * h; } const k = (n - 2) / 4;
      for (let i = 0; i < h; i++) { for (let j = 0; j < n; j++) { const swap = j < k ? true : j >= n - k + 1; let s = swap; if (i === (h - 1) / 2 && j < k) s = j >= 1 && j <= k; if (i === (h - 1) / 2 && j === 0) s = false; if (i === (h - 1) / 2 && j === k) s = true; if (s) { const t = g[i][j]; g[i][j] = g[i + h][j]; g[i + h][j] = t; } } } }
    return [fromGrid(n, n, (i, j) => g[i][j])]; });
  def("linspace", a => { const lo = num(a[0]), hi = num(a[1]), n = a[2] ? Math.floor(num(a[2])) : 100; return [M(1, Math.max(n, 1), Array.from({ length: Math.max(n, 1) }, (_, i) => (n <= 1 ? hi : i === n - 1 ? hi : lo + (hi - lo) * i / (n - 1))))]; });
  def("logspace", a => { const lo = num(a[0]), hi = num(a[1]), n = a[2] ? num(a[2]) : 50; return [M(1, n, Array.from({ length: n }, (_, i) => Math.pow(10, lo + (hi - lo) * i / (n - 1))))]; });
  def("colon", a => [ev({ t: "range", a: { t: "num", v: num(a[0]) }, s: a[2] ? { t: "num", v: num(a[1]) } : null, b: { t: "num", v: num(a[2] || a[1]) } })]);
  def("repmat", a => { const m = toMat(a[0]), [rr, cc] = dims(a.slice(1)); return [fromGrid(m.r * rr, m.c * cc, (i, j) => G(m, i % m.r, j % m.c))]; });
  def("reshape", a => { const m = toMat(a[0]); let [r, c] = a.length === 2 ? [toMat(a[1]).re[0], toMat(a[1]).re[1]] : [toMat(a[1]).re.length ? num(a[1]) : null, toMat(a[2]).re.length ? num(a[2]) : null]; if (r == null) r = m.re.length / c; if (c == null) c = m.re.length / r; if (r * c !== m.re.length) fail("Product of known dimensions, " + (r === m.re.length / c ? c : r) + ", must divide number of elements.".replace(/^Product.*/, "Number of elements must not change. Use [] as one of the size inputs to automatically calculate the appropriate size for that dimension.")); return [M(r, c, [...m.re], m.im ? [...m.im] : null)]; });
  def("horzcat", a => [buildMatrix([a])]); def("vertcat", a => [buildMatrix(a.map(x => [x]))]); def("cat", a => [num(a[0]) === 1 ? buildMatrix(a.slice(1).map(x => [x])) : buildMatrix([a.slice(1)])]);
  def("diag", a => { const m = toMat(a[0]); if (m.r === 1 || m.c === 1) return [fromGrid(m.re.length, m.re.length, (i, j) => (i === j ? m.re[i] : 0))]; const n = Math.min(m.r, m.c); return [M(n, 1, Array.from({ length: n }, (_, i) => G(m, i, i)))]; });
  def("triu", a => { const m = toMat(a[0]); return [fromGrid(m.r, m.c, (i, j) => (j >= i ? G(m, i, j) : 0))]; }); def("tril", a => { const m = toMat(a[0]); return [fromGrid(m.r, m.c, (i, j) => (j <= i ? G(m, i, j) : 0))]; });
  def("fliplr", a => { const m = toMat(a[0]); return [fromGrid(m.r, m.c, (i, j) => G(m, i, m.c - 1 - j))]; }); def("flipud", a => { const m = toMat(a[0]); return [fromGrid(m.r, m.c, (i, j) => G(m, m.r - 1 - i, j))]; });
  def("flip", a => { const m = toMat(a[0]); return [m.r === 1 ? B.fliplr(a)[0] : B.flipud(a)[0]]; });
  def("transpose", a => [transpose(toMat(a[0]))]); def("ctranspose", a => [transpose(toMat(a[0]), true)]);
  def("trace", a => { const m = needReal(toMat(a[0]), "trace"); if (m.r !== m.c) fail("Matrix must be square."); let s = 0; for (let i = 0; i < m.r; i++) s += G(m, i, i); return [sc(s)]; });
  def("det", a => { const m = needReal(toMat(a[0]), "det"); if (m.r !== m.c) fail("Matrix must be square."); return [sc(luDet(m))]; });
  def("inv", a => [inv(a[0])]); def("pinv", a => { const m = toMat(a[0]); return [solve(matmul(transpose(m), m), transpose(m))]; });
  def("rank", a => { const m = needReal(toMat(a[0]), "rank"), g = rows2(m); let r = 0; const tol = 1e-10 * Math.max(1, ...m.re.map(Math.abs)); for (let c = 0; c < m.c && r < m.r; c++) { let p = r; for (let i = r + 1; i < m.r; i++) if (Math.abs(g[i][c]) > Math.abs(g[p][c])) p = i; if (Math.abs(g[p][c]) < tol) continue; [g[r], g[p]] = [g[p], g[r]]; for (let i = r + 1; i < m.r; i++) { const f = g[i][c] / g[r][c]; for (let j = c; j < m.c; j++) g[i][j] -= f * g[r][j]; } r++; } return [sc(r)]; });
  def("eig", a => [eig(a[0])]); def("roots", a => [polyroots(vec(a[0]))]);
  def("norm", a => { const m = toMat(a[0]), p = a[1] ? (a[1].t === "s" ? a[1].s : num(a[1])) : 2; const mag = m.re.map((x, i) => (m.im ? Math.hypot(x, m.im[i]) : Math.abs(x)));
    if (m.r === 1 || m.c === 1) return [sc(p === "inf" || p === Infinity ? Math.max(...mag) : p === 1 ? sum(mag) : p === 2 || p === "fro" ? Math.sqrt(sum(mag.map(x => x * x))) : Math.pow(sum(mag.map(x => Math.pow(x, p))), 1 / p))];
    if (p === "fro") return [sc(Math.sqrt(sum(mag.map(x => x * x))))]; if (p === 1) return [sc(Math.max(...Array.from({ length: m.c }, (_, j) => sum(Array.from({ length: m.r }, (_, i) => Math.abs(G(m, i, j)))))))]; if (p === Infinity || p === "inf") return [sc(Math.max(...Array.from({ length: m.r }, (_, i) => sum(Array.from({ length: m.c }, (_, j) => Math.abs(G(m, i, j)))))))];
    const e = eig(matmul(transpose(m), m)); return [sc(Math.sqrt(Math.max(...e.re)))]; });
  def("dot", a => { const x = vec(a[0]), y = vec(a[1]); if (x.length !== y.length) fail("Vectors must be the same lengths."); return [sc(sum(x.map((v, i) => v * y[i])))]; });
  def("cross", a => { const x = vec(a[0]), y = vec(a[1]); if (x.length !== 3 || y.length !== 3) fail("Both X and Y must have 3 elements."); const o = [x[1] * y[2] - x[2] * y[1], x[2] * y[0] - x[0] * y[2], x[0] * y[1] - x[1] * y[0]]; return [rowOrCol(toMat(a[0]), o)]; });
  def("kron", a => { const x = toMat(a[0]), y = toMat(a[1]); return [fromGrid(x.r * y.r, x.c * y.c, (i, j) => G(x, Math.floor(i / y.r), Math.floor(j / y.c)) * G(y, i % y.r, j % y.c))]; });
  def("trapz", a => { const x = a.length > 1 ? vec(a[0]) : null, y = vec(a[a.length - 1]); let s = 0; for (let i = 1; i < y.length; i++) s += ((x ? x[i] - x[i - 1] : 1) * (y[i] + y[i - 1])) / 2; return [sc(s)]; });
  def("polyval", a => [polyval(vec(a[0]), toMat(a[1]))]); def("polyfit", a => { const p = polyfit(a[0], a[1], num(a[2])); return [transpose(p)]; });
  def("conv", a => { const x = vec(a[0]), y = vec(a[1]), o = new Array(x.length + y.length - 1).fill(0); x.forEach((p, i) => y.forEach((q, j) => (o[i + j] += p * q))); return [M(1, o.length, o)]; });
  def("polyder", a => { const p = vec(a[0]), n = p.length - 1, o = p.slice(0, -1).map((c, i) => c * (n - i)); return [M(1, Math.max(o.length, 1), o.length ? o : [0])]; });
  def("polyint", a => { const p = vec(a[0]), n = p.length, o = p.map((c, i) => c / (n - i)); o.push(0); return [M(1, o.length, o)]; });
  def("interp1", a => { const x = vec(a[0]), y = vec(a[1]), q = toMat(a[2]); return [M(q.r, q.c, q.re.map(v => { for (let i = 0; i < x.length - 1; i++) if (v >= x[i] && v <= x[i + 1]) return y[i] + (y[i + 1] - y[i]) * (v - x[i]) / (x[i + 1] - x[i]); return NaN; }))]; });
  def("fzero", a => { if (a[0].t !== "f") fail("FUN must be a function handle."); return [sc(fzero(a[0], toMat(a[1])))]; });
  def("integral quad quadl", a => { if (a[0].t !== "f") fail("FUN must be a function handle."); return [sc(calc.integral(x => num(callHandle(a[0], [sc(x)], 1)[0], "function value"), num(a[1]), num(a[2])))]; });
  def("deriv", a => [sc(calc.deriv(x => num(callHandle(a[0], [sc(x)], 1)[0], "function value"), num(a[1])))]);
  def("feval", (a, no) => callHandle(a[0].t === "f" ? a[0] : { t: "f", name: a[0].s, params: [] }, a.slice(1), no));
  def("func2str", a => [str(a[0].name || `@(${a[0].params.join(",")}) ${a[0].src}`)]); def("isequal", a => [bool(a.slice(1).every(x => { const p = toMat(a[0]), q = toMat(x); return p.r === q.r && p.c === q.c && p.re.every((v, i) => v === q.re[i]); }))]);
  def("double", a => { const m = toMat(a[0]); return [M(m.r, m.c, [...m.re], m.im)]; }); def("logical", a => { const m = toMat(a[0]); return [M(m.r, m.c, m.re.map(v => +(v !== 0)), null, true)]; });
  def("char", a => [str(a[0].t === "s" ? a[0].s : String.fromCharCode(...vec(a[0])))]);
  def("upper", a => [str(a[0].s.toUpperCase())]); def("lower", a => [str(a[0].s.toLowerCase())]); def("strtrim", a => [str(a[0].s.trim())]);
  def("strcat", a => [str(a.map(x => x.s).join(""))]); def("strrep", a => [str(a[0].s.split(a[1].s).join(a[2].s))]); def("strcmp", a => [bool(a[0].t === "s" && a[1].t === "s" && a[0].s === a[1].s)]);
  def("num2str", a => [str(num2str(a[0], a[1] ? num(a[1]) : null))]); def("mat2str", a => [str(mat2str(a[0]))]); def("int2str", a => [str(String(rnd(num(a[0]))))]);
  def("str2num str2double", a => { try { return [ev(parse(a[0].s), {})]; } catch { return [sc(NaN)]; } });
  def("sprintf", a => [str(sprintf(a[0].s, a.slice(1)))]);
  def("fprintf", a => { const t = a[0].t === "s" ? sprintf(a[0].s, a.slice(1)) : sprintf(a[1].s, a.slice(2)); printed.push(t.endsWith("\n") ? t.slice(0, -1) : t); return []; });
  def("disp display", a => { printed.push(...dispLines(a[0])); return []; });
  def("xor", a => { const r = ewise(a[0], a[1], (x, y) => +((x !== 0) !== (y !== 0))); return [M(r.r, r.c, r.re, null, true)]; }); def("nnz", a => [sc(toMat(a[0]).re.filter(v => v !== 0).length)]);
  def("tic", () => { W.tic = Date.now(); return []; }); def("toc", () => [sc((Date.now() - (W.tic || Date.now())) / 1000)]);
    const printed = [];   // lines produced by disp/fprintf during the current statement

  function call(name, args, nargout, quiet) {
    if (name in B) { if (quiet && name !== "rand" && name !== "toc" && !/^(rand|randn|zeros|ones|eye|tic)$/.test(name)) return null; return B[name](args, nargout); }
    if (name in calc.S.funcs && !(name in W.vars)) { const f = calc.S.funcs[name]; const env = {}; f.params.forEach((q, i) => (env[q] = num(args[i], "argument"))); return [sc(f.fn(env))]; }
    if (quiet) return null;
    fail(`Unrecognized function or variable '${name}'.`);
  }

  /* ---------- showing values ---------- */
  const dp = () => calc.S.dp;
  const sig = (v, d) => parseFloat(v.toPrecision(d));
  function fixed(v, d) { if (!Number.isFinite(v)) return Number.isNaN(v) ? "NaN" : v > 0 ? "Inf" : "-Inf"; const s = v.toFixed(d); return /^-0(\.0+)?$/.test(s) ? s.slice(1) : s; }
  const expo = (v, d) => { if (!Number.isFinite(v)) return fixed(v, d); return v.toExponential(d).replace(/e([+-])(\d)$/, "e$10$2"); };
  const isInt = v => Number.isInteger(v) || !Number.isFinite(v);
  function scalarText(v, cplx = false) {   // one real number for the active format
    if (W.fmt === "default") { if (cplx && Math.abs(v) < Math.pow(10, -dp()) / 2) return "0"; return calc.fmt(v); }
    if (!Number.isFinite(v)) return fixed(v);
    const a = Math.abs(v), long = W.fmt === "long" || W.fmt === "longg";
    if (W.fmt === "bank") return fixed(v, 2);
    if (W.fmt === "shortg" || W.fmt === "longg") return String(sig(v, long ? 15 : 5));
    if (isInt(v) && !cplx) return a >= 1e9 ? expo(v, long ? 15 : 4) : String(v);
    if (a === 0) return cplx ? "0" : "0";
    const d = long ? 15 : 4; if (a >= (long ? 1e5 : 1e3) || a < 1e-3) return expo(v, d);
    return fixed(v, long ? Math.max(15 - Math.max(Math.floor(Math.log10(a)) + 1, 1) + (a < 10 ? 1 : 0), 4) : 4);
  }
  function cplxText(re, im) {
    if (W.fmt === "default") { const r = calc.fmt(re), i = calc.fmt(Math.abs(im)); return `${r} ${im < 0 || Object.is(im, -0) ? "-" : "+"} ${i}i`; }
    const long = W.fmt === "long" || W.fmt === "longg", d = long ? 15 : 4, mx = Math.max(Math.abs(re), Math.abs(im)), ex = Number.isFinite(mx) && mx !== 0 && (mx >= (long ? 1e5 : 1e3) || mx < 1e-3);
    const f = v => (W.fmt === "shortg" || W.fmt === "longg" ? String(sig(v, long ? 15 : 5)) : W.fmt === "bank" ? fixed(v, 2) : ex ? expo(v, d) : fixed(v, d));
    return `${f(re)} ${im < 0 || Object.is(im, -0) ? "-" : "+"} ${f(Math.abs(im))}i`;
  }
  function matrixLines(m) {
    if (m.re.length === 0) return [`     []`];
    const long = W.fmt === "long";
    if (m.im) {
      const cells = rows2(m).map((r, i) => r.map((v, j) => cplxText(v, m.im[i + j * m.r]))), w = Math.max(...cells.flat().map(s => s.length)) + 3;
      return cells.map(r => r.map(s => s.padStart(w)).join(""));
    }
    const all = m.re, finite = all.filter(Number.isFinite), allInt = finite.every(Number.isInteger) && !m.lg && true;
    if (m.lg || (allInt && W.fmt !== "bank" && W.fmt !== "shortg" && W.fmt !== "longg")) {
      const cells = rows2(m).map(r => r.map(v => (Number.isFinite(v) ? (Math.abs(v) >= 1e9 ? expo(v, long ? 15 : 4) : String(v)) : fixed(v)))), w = m.lg ? 4 : Math.max(6, Math.max(...cells.flat().map(s => s.replace("-", "").length)) + 3 + (cells.flat().some(s => s.startsWith("-")) ? 0 : 0));
      return cells.map(r => r.map(s => s.padStart(w)).join(""));
    }
    if (W.fmt === "default") {
      const need = Math.min(dp(), Math.max(...finite.map(v => { const s = calc.fmt(v); return s.includes("e") ? 0 : (s.split(".")[1] || "").length; }), 0)), cells = rows2(m).map(r => r.map(v => (Number.isFinite(v) ? (Math.abs(v) >= 1e15 || (v !== 0 && Math.abs(v) < Math.pow(10, -need) / 2 && need === dp() && false) ? calc.fmt(v) : fixed(Math.abs(v) < Math.pow(10, -dp()) / 2 ? 0 : v, need)) : fixed(v))));
      const w = Math.max(...cells.flat().map(s => s.replace("-", "").length)) + 4; return cells.map(r => r.map(s => s.padStart(w)).join(""));
    }
    if (W.fmt === "shortg" || W.fmt === "longg") { const cells = rows2(m).map(r => r.map(v => String(sig(v, W.fmt === "longg" ? 15 : 5)))), w = Math.max(...cells.flat().map(s => s.length)) + 4; return cells.map(r => r.map(s => s.padStart(w)).join("")); }
    if (W.fmt === "bank") { const cells = rows2(m).map(r => r.map(v => fixed(v, 2))), w = Math.max(...cells.flat().map(s => s.length)) + 4; return cells.map(r => r.map(s => s.padStart(w)).join("")); }
    const mx = Math.max(...finite.map(Math.abs)), mn = Math.min(...finite.filter(v => v !== 0).map(Math.abs), Infinity), e = mx === 0 ? 0 : Math.floor(Math.log10(mx));
    let scale = 1, head = [];
    if (!long && (e >= 3 || e <= -3) && (mx / (mn === Infinity ? mx : mn) < 1e5)) { scale = Math.pow(10, e); head = [`   1.0e${e < 0 ? "-" : "+"}${String(Math.abs(e)).padStart(2, "0")} *`, ""]; }
    else if (!long && mx >= 1e5) { const cells = rows2(m).map(r => r.map(v => expo(v, 4))), w = Math.max(...cells.flat().map(s => s.length)) + 3; return cells.map(r => r.map(s => s.padStart(w)).join("")); }
    const d = long ? 15 : 4, cells = rows2(m).map(r => r.map(v => (v === 0 ? "0" : Number.isFinite(v) ? fixed(v / scale, long ? Math.max(15 - (e >= 0 ? e : 0) - (mx >= 10 ? 0 : 0), 4) : d) : fixed(v)))), w = Math.max(...cells.flat().map(s => s.replace("-", "").length)) + 4;
    return head.concat(cells.map(r => r.map(s => s.padStart(w)).join("")));
  }
  function valueText(v) {   // the text of a scalar as MATLAB prints it after `x = `
    if (v.t === "s") return v.s;
    const m = v; return m.im ? cplxText(m.re[0], m.im[0]) : scalarText(m.re[0]);
  }
  function showNamed(name, v) {
    if (v.t === "none") return [];
    if (v.t === "f") return [`${name} =`, "", "  function_handle with value:", "", `    @(${v.params.join(",")}) ${v.src}`, ""].map(s => s).filter((s, i, a) => !(name === "f" && false));
    if (v.t === "s") return v.s.length <= 1 && false ? [] : v.s.length ? [`${name} = ${v.s}`] : [`${name} = ''`];
    if (v.re.length === 1) return v.lg ? [`${name} =`, "", "  logical", "", `   ${v.re[0]}`, ""] : [`${name} = ${valueText(v)}`];
    if (v.re.length === 0) return [v.r === 0 && v.c === 0 ? `${name} = []` : `${name} = ${v.r}×${v.c} empty double ${v.r === 1 ? "row vector" : v.c === 1 ? "column vector" : "matrix"}`];
    return [`${name} =`, "", ...matrixLines(v), ""];
  }
  function dispLines(v) {
    if (v.t === "s") return v.s.split("\n"); if (v.t === "f") return [`@(${v.params.join(",")}) ${v.src}`];
    if (v.re.length === 1) return [valueText(v)]; if (v.re.length === 0) return [];
    return matrixLines(v);
  }

  /* ---------- running a line ---------- */
  function splitStatements(line) {
    const parts = []; let depth = 0, q = false, cur = "";
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === "'" ) { const prev = cur.trim().slice(-1); if (q) { q = false; } else if (!prev || /[\s,;=(\[+\-*/\\^<>&|~:@{]/.test(prev)) q = true; }
      else if (ch === '"') { q = !q; }
      if (!q) { if (/[(\[{]/.test(ch)) depth++; else if (/[)\]}]/.test(ch)) depth--; else if (depth === 0 && (ch === ";" || ch === ",")) { parts.push([cur, ch === ";"]); cur = ""; continue; } }
      cur += ch;
    }
    parts.push([cur, false]); return parts.filter(([s]) => s.trim());
  }
  function stripComment(line) { let q = false; for (let i = 0; i < line.length; i++) { const ch = line[i]; if (ch === '"') q = !q; else if (ch === "'") { const prev = line.slice(0, i).trim().slice(-1); if (q) q = false; else if (!prev || /[\s,;=(\[+\-*/\\^<>&|~:@{]/.test(prev)) q = true; } else if (ch === "%" && !q) return line.slice(0, i); } return line; }
  function topEquals(s) { let d = 0; for (let i = 0; i < s.length; i++) { const c = s[i]; if (c === "(" || c === "[" || c === "{") d++; else if (c === ")" || c === "]" || c === "}") d--; else if (c === "=" && d === 0 && s[i + 1] !== "=" && !/[=<>~!]/.test(s[i - 1] || "")) return i; } return -1; }
  const setVar = (name, v) => { W.vars[name] = v; if (v.t === "m" && v.re.length === 1 && !v.im) calc.S.vars[name] = v.re[0]; else delete calc.S.vars[name]; if (v.t === "f") registerFn(name, v); else delete calc.S.funcs[name]; };
  function registerFn(name, h) {   // so plot, roots, deriv and integral can use f
    if (h.name) return; calc.S.funcs[name] = { params: h.params, src: h.src, fn: env => { const r = callHandle(h, h.params.map(q => sc(env[q])), 1)[0]; return num(r); } };
  }
  function runStatement(text, quiet) {
    const t = text.trim(); if (!t) return [];
    let m;
    if ((m = t.match(/^(format)(?:\s+(\w+))?$/i))) { const f = (m[2] || "default").toLowerCase(); if (!["default", "short", "long", "bank", "shortg", "longg"].includes(f)) fail(`Unknown format option: '${m[2]}'. Choose short, long, bank, shortg, longg or default.`); W.fmt = f === "default" ? "default" : f; if (f === "default") { return quiet ? [] : [`✓ format default: up to ${dp()} decimals (format short and format long give MATLAB's own layouts)`]; } return []; }
    if ((m = t.match(/^(clear|clearvars)(?:\s+(.+))?$/i))) { const ns = (m[2] || "all").split(/\s+/); if (ns[0] === "all" || ns[0] === "-all" || ns[0] === "variables") { Object.keys(W.vars).forEach(k => { delete calc.S.vars[k]; delete calc.S.funcs[k]; }); W.vars = {}; W.ans = null; calc.S.ans = 0; } else ns.forEach(k => { delete W.vars[k]; delete calc.S.vars[k]; delete calc.S.funcs[k]; }); return []; }
    if (/^(who|whos)$/i.test(t)) { const ks = Object.keys(W.vars).sort(); if (!ks.length) return []; if (/^who$/i.test(t)) return ["Your variables are:", "", ks.join("  "), ""]; const rows = ks.map(k => { const v = W.vars[k]; const r = v.t === "s" ? 1 : v.t === "f" ? 1 : v.r, c = v.t === "s" ? v.s.length : v.t === "f" ? 1 : v.c; return `  ${k.padEnd(12)}${(r + "x" + c).padEnd(10)}${String(r * c * 8).padStart(6)}  ${kindName(v)}${v.t === "m" && v.im ? " (complex)" : ""}`; }); return ["  Name        Size      Bytes  Class", "", ...rows, ""]; }
    if ((m = t.match(/^\[([\w\s,~]+)\]\s*=(?!=)\s*(.+)$/))) {   // [a, b] = f(...)
      const names = m[1].split(/[\s,]+/).filter(Boolean), val = parseAndCall(m[2], names.length);
      if (val.length < names.filter(n => n !== "~").length && val.length < names.length) { if (val.length < names.length) fail(`Too many output arguments.`); }
      const lines = []; names.forEach((n, i) => { if (n !== "~" && val[i]) { setVar(n, val[i]); if (!quiet) lines.push(...showNamed(n, val[i])); } }); return lines;
    }
    const eq = topEquals(t);
    if (eq > 0) {
      const lhs = t.slice(0, eq).trim(), rhs = t.slice(eq + 1).trim();
      let mm = lhs.match(/^([A-Za-z_]\w*)$/);
      if (mm) { if (!rhs) fail("Invalid expression. Check for missing or extra characters."); const v = toResult(ev(parse(rhs), {})); if (v.t === "none") fail("Value on the right hand side of the assignment not defined."); if (mm[1] in CONSTS && false) { } setVar(mm[1], v); return quiet ? [] : showNamed(mm[1], v); }
      mm = lhs.match(/^([A-Za-z_]\w*)\s*\(([\s\S]*)\)$/);
      if (mm) {
        const name = mm[1], isVar = name in W.vars;
        if (!isVar && /^[A-Za-z_]\w*(\s*,\s*[A-Za-z_]\w*)*$/.test(mm[2].trim()) && !(name in B)) {   // f(x) = x^2 defines a function
          const params = mm[2].split(",").map(s => s.trim()), h = { t: "f", params, body: parse(rhs), src: rhs, cap: { ...W.vars } }; setVar(name, h); return quiet ? [] : [`${name}(${params.join(", ")}) = ${rhs}`];
        }
        const argAsts = parse(`f(${mm[2]})`).args, cur = W.vars[name] || null;
        const total = cur ? (cur.t === "s" ? cur.s.length : cur.re.length) : 0, args = argAsts.map((x, k) => (x.t === "colon" ? ":" : ev(x, {}, { len: argAsts.length === 1 ? total : k === 0 ? (cur ? cur.r : 0) : (cur ? cur.c : 0) })));
        const rv = ev(parse(rhs), {}); const nv = assignInto(cur && cur.t === "s" ? toMat(cur) : cur, args, rv); setVar(name, nv); return quiet ? [] : showNamed(name, nv);
      }
      fail("Invalid expression. The left side of an assignment must be a variable name.");
    }
    const ast = parse(t), v = ev(ast, {});
    if (v.t === "none") return [];
    const bare = ast.t === "var" && ast.n in W.vars;
    if (!bare) { W.ans = v; W.vars.ans = v; if (v.t === "m" && v.re.length === 1 && !v.im) { calc.S.ans = v.re[0]; calc.S.vars.ans = v.re[0]; } }
    return quiet ? [] : showNamed(bare ? ast.n : "ans", v);
  }
  const toResult = v => v;
  function parseAndCall(src, nout) {
    const ast = parse(src);
    if (ast.t === "idx" && ast.a.t === "var" && !(ast.a.n in W.vars && W.vars[ast.a.n].t !== "f")) { const args = ast.args.map(x => ev(x, {})), f = W.vars[ast.a.n]; return f && f.t === "f" ? callHandle(f, args, nout) : call(ast.a.n, args, nout) || []; }
    if (ast.t === "var" && !(ast.n in W.vars)) return call(ast.n, [], nout) || [];
    return [ev(ast, {})];
  }

  function run(line) {   // -> array of output lines; errors thrown with MATLAB's wording
    const lines = []; warnings.length = 0; printed.length = 0;
    line = stripComment(line);
    const sg = line.match(/^\s*(sum|prod)\s*\((.+)\)\s+(?:for\s+([A-Za-z_]\w*)\s+)?from\s+(.+?)\s+to\s+(.+?)\s*;?\s*$/i);   // sum(ln(x)) from 1 to 22
    if (sg) line = `${sg[1].toLowerCase()}((@(${sg[3] || "x"}) ${sg[2].replace(/(?<!\.)([*\/^])/g, ".$1")})(${sg[4]}:${sg[5]}))`;
    const stmts = splitStatements(line);
    for (const [s, quiet] of stmts) {
      printed.length = 0;
      try { const r = runStatement(s, quiet); lines.push(...printed, ...r); } catch (e) { lines.push(...printed); throw Object.assign(new Error(e.message), { partial: lines }); }
    }
    lines.push(...warnings); return lines;
  }
  const names = () => new Set([...NAMES, ...Object.keys(CONSTS), "end"]);
  return { run, names, W, evalNumber: s => num(ev(parse(s), {})), scalar: s => ev(parse(s), {}), reset: () => { W.vars = {}; W.fmt = "default"; } };
}
