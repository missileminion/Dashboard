# Builds the "Pressroom" fonts: Newsreader (SIL OFL) with the outlines swollen, rounded and given a faint fibre wobble, like ink on newsprint.
import sys, math, random, copy
import pathops
from pathops import Path, PathOp, LineCap, LineJoin
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
from fontTools import subset
from fontTools.pens.recordingPen import DecomposingRecordingPen
from fontTools.pens.ttGlyphPen import TTGlyphPen

STR = {"soft": (3, 10, 7, 2.5), "medium": (5, 16, 11, 4.5), "heavy": (8, 24, 15, 7)}   # swell, fill-in radius, round-off radius, wobble (units of 2000/em)
UNI = list(range(0x20, 0x7F)) + list(range(0xA0, 0x100)) + [0x2013, 0x2014, 0x2018, 0x2019, 0x201C, 0x201D, 0x2022, 0x2026, 0x2032, 0x2033, 0x20AC, 0x2122, 0x2190, 0x2192, 0x2212, 0x2217, 0x2009, 0x200A, 0x2002, 0x2003, 0x00B6, 0x00A7]

def to_path(rec):
    p = Path(); rec.replay(p.getPen()); p.simplify(fix_winding=True); return p
def grow(p, r):
    s = Path(p); s.stroke(2 * r, LineCap.ROUND_CAP, LineJoin.ROUND_JOIN, 4); s.convertConicsToQuads(0.1); return pathops.op(p, s, PathOp.UNION, fix_winding=True)
def shrink(p, r):
    s = Path(p); s.stroke(2 * r, LineCap.ROUND_CAP, LineJoin.ROUND_JOIN, 4); s.convertConicsToQuads(0.1); return pathops.op(p, s, PathOp.DIFFERENCE, fix_winding=True)
def flat(p, step=6):
    out = []; cur = []; last = None
    for verb, pts in p.segments:
        if verb == "moveTo": cur = [pts[0]]; last = pts[0]
        elif verb == "lineTo": cur.append(pts[0]); last = pts[0]
        elif verb == "qCurveTo":
            # pathops gives one quad (control, end) here
            c, e = pts[-2], pts[-1]; n = max(2, int(math.dist(last, c) + math.dist(c, e)) // step)
            for i in range(1, n + 1):
                t = i / n; a = (1 - t) ** 2; b = 2 * t * (1 - t); d = t * t
                cur.append((a * last[0] + b * c[0] + d * e[0], a * last[1] + b * c[1] + d * e[1]))
            last = e
        elif verb == "curveTo":
            c1, c2, e = pts; n = max(2, int(math.dist(last, c1) + math.dist(c1, c2) + math.dist(c2, e)) // step)
            for i in range(1, n + 1):
                t = i / n; u = 1 - t
                cur.append((u**3 * last[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t**3 * e[0], u**3 * last[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t**3 * e[1]))
            last = e
        elif verb in ("closePath", "endPath"):
            if cur and len(cur) > 2: out.append(cur)
            cur = []
    return out
def wobble(contours, amp, rnd):
    res = []
    for pts in contours:
        if pts[0] == pts[-1]: pts = pts[:-1]
        n = len(pts); ph = [rnd.random() * 6.28 for _ in range(4)]; fr = [rnd.uniform(.03, .05), rnd.uniform(.09, .15), rnd.uniform(.3, .5), rnd.uniform(.9, 1.4)]
        new = []; 
        for i in range(n):
            x, y = pts[i]; px, py = pts[i - 1]; nx, ny = pts[(i + 1) % n]
            tx, ty = nx - px, ny - py; L = math.hypot(tx, ty) or 1; nrm = (ty / L, -tx / L)
            d = amp * (.45 * math.sin(i * fr[0] + ph[0]) + .3 * math.sin(i * fr[1] + ph[1]) + .15 * math.sin(i * fr[2] + ph[2]) + .1 * math.sin(i * fr[3] + ph[3]))
            new.append((x + nrm[0] * d, y + nrm[1] * d))
        res.append(new)
    return res
def area(pts): return sum(pts[i][0] * pts[(i + 1) % len(pts)][1] - pts[(i + 1) % len(pts)][0] * pts[i][1] for i in range(len(pts))) / 2

def build(src, out, wght, opsz, strength, family, style, pin=True):
    g, rc, ro, amp = STR[strength]
    f = TTFont(src); f = instancer.instantiateVariableFont(f, {"wght": wght, "opsz": opsz})
    opts = subset.Options(); opts.layout_features = ["kern", "liga", "onum", "lnum", "pnum", "tnum", "smcp", "c2sc", "case", "frac", "ccmp", "locl", "mark", "mkmk"]; opts.hinting = False; opts.notdef_outline = True; opts.name_IDs = ["*"]; opts.glyph_names = False
    sub = subset.Subsetter(opts); sub.populate(unicodes=UNI); sub.subset(f)
    gs = f.getGlyphSet(); glyf = f["glyf"]; hm = f["hmtx"]; rnd = random.Random(7)
    for name in f.getGlyphOrder():
        rec = DecomposingRecordingPen(gs); gs[name].draw(rec)
        if not rec.value: glyf[name] = TTGlyphPen(None).glyph(); hm[name] = (hm[name][0], 0); continue
        p = to_path(rec)
        for fn, rr in ((grow, g), (grow, rc), (shrink, rc), (shrink, ro), (grow, ro)):
            try: p2 = fn(p, rr); p = p2
            except Exception:
                try: p.simplify(fix_winding=True); p = fn(p, rr * 0.7)
                except Exception: pass
        cs = wobble(flat(p), amp, rnd)
        q = Path()
        pen = q.getPen()
        for pts in cs:
            pen.moveTo(pts[0]); [pen.lineTo(pt) for pt in pts[1:]]; pen.closePath()
        q.simplify(fix_winding=True)
        hr = random.Random(hash((family, style, name)) & 0xffffffff)
        if pin:
            try: ar = abs(q.area)
            except Exception: ar = 0
            n = min(7, int(ar / 60000)); holes = Path(); bx = q.bounds; tries = 0; made = 0
            while made < n and tries < 400 and bx:
                tries += 1; r = hr.uniform(9, 20); x = hr.uniform(bx[0], bx[2]); y = hr.uniform(bx[1], bx[3])
                if all(q.contains((x + dx * 2.4 * r, y + dy * 2.4 * r)) for dx, dy in ((0, 0), (1, 0), (-1, 0), (0, 1), (0, -1), (.7, .7), (-.7, -.7), (.7, -.7), (-.7, .7))):
                    hp = holes.getPen(); k = 9; pts = [(x + r * math.cos(6.283 * i / k + hr.random()), y + r * 0.8 * math.sin(6.283 * i / k)) for i in range(k)]
                    hp.moveTo(pts[0]); [hp.lineTo(p_) for p_ in pts[1:]]; hp.closePath(); made += 1
            if made: q = pathops.op(q, holes, PathOp.DIFFERENCE, fix_winding=True)
        cs = flat(q, 1000)
        if not cs: glyf[name] = TTGlyphPen(None).glyph(); continue
        big = max(cs, key=lambda c: abs(area(c))); flip = area(big) > 0
        tp = TTGlyphPen(None)
        for pts in cs:
            pts = [(round(x), round(y)) for x, y in pts]
            if flip: pts = pts[::-1]
            tp.qCurveTo(*pts, None); tp.closePath()
        gl = tp.glyph(); glyf[name] = gl; gl.recalcBounds(glyf)
        hm[name] = (hm[name][0], getattr(gl, "xMin", 0))
    for t in ("fpgm", "prep", "cvt ", "hdmx", "VDMX", "LTSH", "gasp", "STAT"):
        if t in f: del f[t]
    f["maxp"].maxSizeOfInstructions = 0
    nm = f["name"]
    for rec in list(nm.names):
        if rec.nameID in (1, 3, 4, 6, 16, 17, 21, 22, 25): nm.removeNames(nameID=rec.nameID)
    ps = (family + "-" + style).replace(" ", "")
    for pid, eid, lid in ((3, 1, 0x409), (1, 0, 0)):
        nm.setName(family, 1, pid, eid, lid); nm.setName(style, 2, pid, eid, lid); nm.setName(family + " " + style, 4, pid, eid, lid); nm.setName(ps, 6, pid, eid, lid); nm.setName(ps + ";" + strength, 3, pid, eid, lid)
    f.flavor = "woff2"; f.save(out)
if __name__ == "__main__":
    src, out, wght, opsz, strength, fam, sty = sys.argv[1:8]; build(src, out, float(wght), float(opsz), strength, fam, sty); print("built", out)
