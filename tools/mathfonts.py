"""Builds the Reader's symbol fallback fonts into app/fonts (run with the soften.py venv).
  usage: python mathfonts.py NR.ttf STIXTwoText.ttf NotoSansMath-Regular.ttf ../app/fonts
 pressroom-sym  : subscript / superscript letters drawn from Newsreader (scaled n, i, x ... ) + digits from STIX Two Text
 pressroom-math : arrows and math operators from Noto Sans Math (OFL)"""
import sys
from fontTools.ttLib import TTFont
from fontTools import subset
from fontTools.varLib import instancer
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.pens.transformPen import TransformPen
NR, STIX, NSM, OUT = sys.argv[1:5]
def save(f, name): f.flavor = "woff2"; f.save(f"{OUT}/{name}.woff2")
def sub(path, uni, inst=None):
    f = TTFont(path)
    if inst and "fvar" in f: f = instancer.instantiateVariableFont(f, inst)
    o = subset.Options(); o.layout_features = []; o.hinting = False; o.notdef_outline = True; o.name_IDs = ["*"]; o.glyph_names = True
    s = subset.Subsetter(o); s.populate(unicodes=uni); s.subset(f); return f
# subscript letters (base letter, below baseline) and superscript letters (above)
SUBS = {"ₐ":"a","ₑ":"e","ₕ":"h","ᵢ":"i","ⱼ":"j","ₖ":"k","ₗ":"l","ₘ":"m","ₙ":"n","ₒ":"o","ₚ":"p","ᵣ":"r","ₛ":"s","ₜ":"t","ᵤ":"u","ᵥ":"v","ₓ":"x"}
SUPS = {"ⁿ":"n","ⁱ":"i"}
# base: STIX digits + Greek-free; then add synthesized letters into the Newsreader subset
digits = [ord(c) for c in "₀₁₂₃₄₅₆₇₈₉⁰¹²³⁴⁵⁶⁷⁸⁹₊₋₌₍₎⁺⁻⁼⁽⁾"]
f = sub(NR, [ord(c) for c in set(SUBS.values()) | set(SUPS.values())], {"wght": 400, "opsz": 14})
upm = f["head"].unitsPerEm; gs = f.getGlyphSet(); cm = f.getBestCmap(); hmtx = f["hmtx"]
glyf = f["glyf"]; order = list(f.getGlyphOrder()); new = {}
K = 0.62
for table, dy in ((SUBS, -0.16 * upm), (SUPS, 0.38 * upm)):
    for ch, base in table.items():
        gname = "uni%04X" % ord(ch); pen = TTGlyphPen(gs); gs[cm[ord(base)]].draw(TransformPen(pen, (K, 0, 0, K, 0, dy)))
        glyf[gname] = pen.glyph(); adv = int(hmtx[cm[ord(base)]][0] * K) + 20; hmtx[gname] = (adv, 0); order.append(gname); new[ord(ch)] = gname
f.setGlyphOrder(order); f["glyf"].glyphOrder = order
for t in f["cmap"].tables:
    if t.isUnicode(): t.cmap = dict(new)
f["maxp"].numGlyphs = len(order)
for t in ("GSUB", "GPOS", "GDEF", "STAT", "fvar", "gvar", "avar", "HVAR", "MVAR"):
    if t in f: del f[t]
if "post" in f: f["post"].formatType = 3.0
save(f, "pressroom-sym-letters")
g = sub(STIX, digits, {"wght": 400}); save(g, "pressroom-sym-digits")
m = sub(NSM, list(range(0x2190, 0x2200)) + list(range(0x2200, 0x2300)) + [0x00B1, 0x00D7, 0x00F7, 0x2032, 0x2033, 0x2034, 0x2102, 0x210D, 0x2115, 0x211A, 0x211D, 0x2124] + list(range(0x0391, 0x03CA)))
save(m, "pressroom-math")
