// The app's haptic language (the Android app plays it with shaped vibrations: android/native/Haptics.kt; a browser gets short buzzes).
// One word per kind of moment, each with its own feel:
//   press    a button                              select   picking one of several (segment, chip, tab)
//   minor    a small mark on a scale (quarters)     major    a big mark (whole numbers), clearly heavier
//   limit    the end of a scale or range            toggle   something switching on or off (done, a setting)
//   hold     a long press registering               confirm  saved or logged ("da-DUM")
//   reject   refused, or a first tap that arms a delete
// Every button press gets "press" (or "select" inside a segmented control) from the one listener in lite.js, unless the
// screen already gave a more specific one for that press.
const C = () => window.Capacitor, native = () => !!C()?.isNativePlatform?.();
const MS = { minor: 3, major: 9, press: 7, tap: 7, select: 5, limit: [14, 40, 8], toggle: 12, hold: 18, confirm: [10, 70, 18], reject: [18, 80, 12] };
let last = 0, firedFor = null;   // the press (event) a specific haptic already answered

export function haptic(kind = "press") {
  if (kind === "tap") kind = "press";
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
