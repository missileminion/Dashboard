// Haptics for the phone UI. On the Android app it asks the system for its own feedback patterns (the same ones the launcher and
// keyboard use, so they follow the phone's "touch feedback" setting and feel native); in a browser it falls back to short vibrations.
// Kinds: minor / major (detents on a scale), tap (a button), toggle (on/off), confirm (logged, saved), reject (delete, refused).
// Every button press gets a "tap" from the one listener in lite.js, unless the screen already gave a more specific one.
const C = () => window.Capacitor, native = () => !!C()?.isNativePlatform?.();
const MS = { minor: 3, major: 8, tap: 6, toggle: 10, confirm: [12, 60, 18], reject: [20, 50, 20, 50, 20] };
let last = 0, firedFor = null;   // the press (event) a specific haptic already answered

export function haptic(kind = "tap") {
  const t = performance.now();
  if (t - last < (kind === "minor" || kind === "major" ? 12 : 40)) return;   // detents may come fast; anything else once per press
  last = t; firedFor = window.event || null;
  try {
    if (native()) { const P = C().Plugins?.HealthConnect; (P?.haptic ? P.haptic({ kind }) : C().nativePromise("HealthConnect", "haptic", { kind })).catch(() => {}); }
    else navigator.vibrate?.(MS[kind] || 6);
  } catch {}
}
// true when a specific haptic already answered this press, so the general "tap" stays quiet
export const justFired = (e) => (e && firedFor === e) || performance.now() - last < 60;
// the detent for a value on the weight scale: whole numbers are major markers, quarters minor
export const detent = v => (Math.abs(v - Math.round(v)) < 1e-6 ? "major" : "minor");
