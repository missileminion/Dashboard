# Daily macro targets (reference)

Body: 70 kg | 183 cm | 22 y/o | Goal: hypertrophy. Calories 2,480 kcal (maintenance).

| Macro | Per kg | Grams | kcal |
|---|---|---|---|
| Protein | 2.0 g/kg | 140 g | 560 |
| Fat | 1.1 g/kg | 77 g | 693 |
| Carbs | 4.4 g/kg | 307 g | 1,227 |
| Total | | | 2,480 |

Fiber: 25 g minimum.

## Formulas
1. Protein (g) = 2.0 x body weight (kg)
2. Fat (g) = 1.1 x body weight (kg)
3. Carbs (g) = (Calories - 4 x Protein - 9 x Fat) / 4
4. Calories = 4 x P + 9 x F + 4 x C
5. Fiber (g) = 14 x (Calories / 1,000), floor of 25 g

## Calories
- Mifflin-St Jeor BMR (men) = 10 x kg + 6.25 x cm - 5 x age + 5 = 1,739
- TDEE = BMR x activity factor (1.55 moderate, 1.725 hard training)
- Measured maintenance = avg daily intake - (weekly weight change in kg x 7,700 / 7)
- Lean-bulk target = maintenance x 1.05 to 1.10

Lean-bulk example (+10% = 2,730 kcal): protein 140 g, fat 77 g, carbs 369 g (5.3 g/kg).

## Adjusting every 2-4 weeks
- Target gain: 0.25-0.5% body weight per week (0.17-0.35 kg)
- Gain under 0.1% per week: add 150-250 kcal, all from carbs
- Gain over 0.5% per week: cut 100-200 kcal, all from carbs
- Gained about 2 kg: recompute protein and fat from the new weight

Code: `app/js/macros.js` (pure functions + saved profile). Console commands: `macros`, `need`.
