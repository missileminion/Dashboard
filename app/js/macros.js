// Macro targets and "how much of this food" maths. Pure functions plus a saved profile, so the console, a page or anything else can use them; nothing here touches the DOM or the terminal.
// Formulas follow the reference in macro-reference.md at the project root.
const KEY = "macro.profile";
export const DEFAULT_PROFILE = { kg: 70, cm: 183, age: 22, sex: "m", kcal: 2480, bulk: 0, pPerKg: 2.0, fPerKg: 1.1 };
export const loadProfile = () => { try { return { ...DEFAULT_PROFILE, ...(JSON.parse(localStorage.getItem(KEY)) || {}) }; } catch { return { ...DEFAULT_PROFILE }; } };
export const saveProfile = p => { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch {} return p; };

export const bmr = p => 10 * p.kg + 6.25 * p.cm - 5 * p.age + (p.sex === "f" ? -161 : 5);
export const tdee = (p, factor = 1.55) => bmr(p) * factor;

// kcal is the maintenance you gave (or measured); bulk is the surplus as a fraction (0.1 = +10%)
export function targets(p = loadProfile()) {
  const kcal = p.kcal * (1 + (p.bulk || 0)), protein = p.pPerKg * p.kg, fat = p.fPerKg * p.kg, carbs = (kcal - 4 * protein - 9 * fat) / 4, fiber = Math.max(25, 14 * kcal / 1000);
  return { kcal, protein, fat, carbs, fiber, perKg: { protein: protein / p.kg, fat: fat / p.kg, carbs: carbs / p.kg }, kcalOf: { protein: protein * 4, fat: fat * 9, carbs: carbs * 4 } };
}

// weekly gain in kg → what to change (every 2–4 weeks); null if inside the band
export function adjustAdvice(p, gainKgPerWeek) {
  const pct = gainKgPerWeek / p.kg * 100;
  if (pct < 0.1) return { pct, add: [150, 250], text: "gaining under 0.1% a week: add 150–250 kcal, all from carbs" };
  if (pct > 0.5) return { pct, add: [-200, -100], text: "gaining over 0.5% a week: cut 100–200 kcal, all from carbs" };
  return { pct, add: null, text: "inside the 0.25–0.5% a week band: no change" };
}

// per 100 g, as eaten (cooked where it matters): [kcal, protein, fat, carbs, fiber]. Typical values; "usda" in the console fetches exact ones.
export const FOODS = {
  "chicken breast": [165, 31, 3.6, 0, 0], "chicken thigh": [209, 26, 10.9, 0, 0], "turkey breast": [135, 30, 1, 0, 0], "lean beef": [217, 26, 12, 0, 0], "ground beef": [254, 17, 20, 0, 0], "pork loin": [196, 27, 9, 0, 0], "bacon": [541, 37, 42, 1.4, 0],
  "salmon": [208, 20, 13, 0, 0], "tuna": [132, 28, 1.3, 0, 0], "cod": [105, 23, 0.9, 0, 0], "shrimp": [99, 24, 0.3, 0.2, 0], "egg": [143, 12.6, 9.5, 0.7, 0], "egg white": [52, 11, 0.2, 0.7, 0],
  "greek yogurt": [59, 10, 0.4, 3.6, 0], "milk": [61, 3.2, 3.3, 4.8, 0], "cottage cheese": [98, 11, 4.3, 3.4, 0], "cheddar": [403, 25, 33, 1.3, 0], "whey": [400, 80, 6, 8, 0], "tofu": [144, 17, 9, 3, 2.3], "tempeh": [192, 20, 11, 7.6, 0],
  "rice": [130, 2.7, 0.3, 28, 0.4], "brown rice": [123, 2.7, 1, 26, 1.6], "pasta": [158, 5.8, 0.9, 31, 1.8], "oats": [389, 16.9, 6.9, 66, 10.6], "bread": [265, 9, 3.2, 49, 2.7], "potato": [93, 2.5, 0.1, 21, 2.2], "sweet potato": [90, 2, 0.2, 21, 3.3], "quinoa": [120, 4.4, 1.9, 21, 2.8], "tortilla": [304, 8, 8, 51, 3],
  "lentils": [116, 9, 0.4, 20, 7.9], "black beans": [132, 8.9, 0.5, 24, 8.7], "chickpeas": [164, 8.9, 2.6, 27, 7.6], "banana": [89, 1.1, 0.3, 23, 2.6], "apple": [52, 0.3, 0.2, 14, 2.4], "blueberries": [57, 0.7, 0.3, 14, 2.4], "orange": [47, 0.9, 0.1, 12, 2.4],
  "broccoli": [35, 2.4, 0.4, 7.2, 3.3], "spinach": [23, 2.9, 0.4, 3.6, 2.2], "carrot": [41, 0.9, 0.2, 9.6, 2.8], "avocado": [160, 2, 15, 8.5, 6.7],
  "olive oil": [884, 0, 100, 0, 0], "butter": [717, 0.9, 81, 0.1, 0], "peanut butter": [588, 25, 50, 20, 6], "almonds": [579, 21, 50, 22, 12.5], "walnuts": [654, 15, 65, 14, 6.7], "chia": [486, 17, 31, 42, 34], "dark chocolate": [598, 7.8, 43, 46, 11],
};
const ALT = { chicken: "chicken breast", beef: "lean beef", steak: "lean beef", eggs: "egg", yogurt: "greek yogurt", yoghurt: "greek yogurt", "protein powder": "whey", whey: "whey", oatmeal: "oats", porridge: "oats", potatoes: "potato", nuts: "almonds", almond: "almonds", walnut: "walnuts", "peanut butter": "peanut butter", oil: "olive oil", beans: "black beans", lentil: "lentils", bananas: "banana", apples: "apple", shrimps: "shrimp", prawns: "shrimp", cheese: "cheddar", bacon: "bacon", pb: "peanut butter" };
export function findFood(q) {
  q = q.toLowerCase().trim().replace(/^(some|a|an|the)\s+/, ""); if (!q) return null; const hit = k => ({ name: k, per100: FOODS[k] });
  if (FOODS[q]) return hit(q); if (ALT[q]) return hit(ALT[q]);
  const ks = Object.keys(FOODS), c = ks.find(k => k.startsWith(q)) || ks.find(k => k.includes(q)) || ks.find(k => q.includes(k)); return c ? hit(c) : null;
}

// live look-up in the USDA FoodData Central database (the shared DEMO_KEY is enough for a few look-ups; only the food name leaves the browser)
export async function usdaFood(q) {
  const r = await fetch(`https://api.nal.usda.gov/fdc/v1/foods/search?query=${encodeURIComponent(q)}&pageSize=1&dataType=Foundation,SR%20Legacy&api_key=DEMO_KEY`); if (!r.ok) throw new Error(r.status === 429 ? "USDA look-ups are rate limited right now; try again in a bit" : `USDA answered ${r.status}`);
  const f = ((await r.json()).foods || [])[0]; if (!f) return null; const v = id => { const n = (f.foodNutrients || []).find(x => x.nutrientId === id || x.nutrientNumber === String(id)); return n ? +n.value : 0; };
  const kcal = v(1008) || v(2047) || v(2048);
  return { name: f.description.toLowerCase(), per100: [kcal, v(1003), v(1004), v(1005), v(1079) || v(2033)], mono: v(1292), poly: v(1293), usda: true };
}

// grams of one food that supply `amount` of a macro; null when the food has none of it
const IDX = { kcal: 0, protein: 1, fat: 2, carbs: 3, fiber: 4 };
export const gramsFor = (per100, macro, amount) => { const v = per100[IDX[macro]]; return v > 0 ? amount / v * 100 : null; };
export const macrosOf = (per100, grams) => ({ kcal: per100[0] * grams / 100, protein: per100[1] * grams / 100, fat: per100[2] * grams / 100, carbs: per100[3] * grams / 100, fiber: per100[4] * grams / 100 });
