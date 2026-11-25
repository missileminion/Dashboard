// Moon phase as a watch complication: the moon seen through a round window in a dark dial, a bezel of 29 day marks, the current day lit.
// Phase maths: the moon's age is the time since a known new moon (6 Jan 2000, 18:14 UTC) modulo the mean synodic month, 29.53 days.
// Accurate to within about half a day, which is plenty for a picture and a countdown.
const SYN = 29.530588853, REF = Date.UTC(2000, 0, 6, 18, 14) / 864e5;
export function moonState(date = new Date()) {
  const age = (((date.getTime() / 864e5 - REF) % SYN) + SYN) % SYN, f = age / SYN, lit = (1 - Math.cos(2 * Math.PI * f)) / 2;
  const names = [[.0338, "New moon"], [.2162, "Waxing crescent"], [.2838, "First quarter"], [.4662, "Waxing gibbous"], [.5338, "Full moon"], [.7162, "Waning gibbous"], [.7838, "Last quarter"], [.9662, "Waning crescent"], [1.01, "New moon"]];
  const name = names.find(([lim]) => f < lim)[1], toFull = (((.5 - f) % 1) + 1) % 1 * SYN, toNew = ((1 - f) % 1) * SYN;
  return { age, f, lit, name, toFull, toNew, waxing: f < .5 };
}
export function moonWatch(date = new Date()) {
  const m = moonState(date), S = 120, c = S / 2, R = 56, mr = 33, mx = c, my = c;
  const k = Math.cos(2 * Math.PI * m.f), rx = Math.abs(k) * mr, rightHalf = `M${mx},${my - mr} A${mr},${mr} 0 0 1 ${mx},${my + mr} Z`, leftHalf = `M${mx},${my - mr} A${mr},${mr} 0 0 0 ${mx},${my + mr} Z`;
  const day = Math.floor(m.age) % 29;
  // flat and monochrome like the rest of the dashboard: a hairline ring, 29 quiet dots (today's is solid), the moon in the text colour on the track colour
  let dots = ""; for (let i = 0; i < 29; i++) { const a = (i / 29) * 2 * Math.PI - Math.PI / 2, on = i === day; dots += `<circle cx="${(c + (R - 3) * Math.cos(a)).toFixed(1)}" cy="${(c + (R - 3) * Math.sin(a)).toFixed(1)}" r="${on ? 2.4 : 1.2}" style="fill:${on ? "var(--tx)" : "var(--tx2)"};opacity:${on ? 1 : .35}"/>`; }
  const svg = `<svg viewBox="0 0 ${S} ${S}" class="moon-svg" role="img" aria-label="${m.name}, ${Math.round(m.lit * 100)} percent lit">
    <circle cx="${c}" cy="${c}" r="${R}" fill="none" style="stroke:var(--line)" stroke-width="1"/>
    ${dots}
    <clipPath id="mnClip"><circle cx="${mx}" cy="${my}" r="${mr}"/></clipPath>
    <circle cx="${mx}" cy="${my}" r="${mr}" style="fill:var(--track)"/>
    <g clip-path="url(#mnClip)"><path d="${m.waxing ? rightHalf : leftHalf}" style="fill:var(--tx)"/><ellipse cx="${mx}" cy="${my}" rx="${rx.toFixed(2)}" ry="${mr}" style="fill:${k > 0 ? "var(--track)" : "var(--tx)"}"/></g>
  </svg>`;
  const d = x => (x < 1 ? "less than a day" : x < 1.5 ? "1 day" : Math.round(x) + " days");
  return `<div class="moon"><div class="moon-dial">${svg}</div><div class="moon-text"><div class="moon-name">${m.name}</div><div class="basis">${Math.round(m.lit * 100)}% lit · day ${day + 1} of 29</div><div class="basis">${m.toFull <= m.toNew ? "full" : "new"} moon in ${d(Math.min(m.toFull, m.toNew))}</div></div></div>`;
}
