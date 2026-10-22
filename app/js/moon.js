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
  const m = moonState(date), S = 132, c = S / 2, R = 62, mr = 30, mx = c, my = c + 2;
  const k = Math.cos(2 * Math.PI * m.f), rx = Math.abs(k) * mr, rightHalf = `M${mx},${my - mr} A${mr},${mr} 0 0 1 ${mx},${my + mr} Z`, leftHalf = `M${mx},${my - mr} A${mr},${mr} 0 0 0 ${mx},${my + mr} Z`;
  const day = Math.floor(m.age) % 29;
  let ticks = ""; for (let i = 0; i < 29; i++) { const a = (i / 29) * 2 * Math.PI - Math.PI / 2, on = i === day, r1 = R - 3, r2 = R - (on ? 11 : 7); ticks += `<line x1="${(c + r1 * Math.cos(a)).toFixed(1)}" y1="${(c + r1 * Math.sin(a)).toFixed(1)}" x2="${(c + r2 * Math.cos(a)).toFixed(1)}" y2="${(c + r2 * Math.sin(a)).toFixed(1)}" stroke="${on ? "#ffd884" : "rgba(220,228,255,.45)"}" stroke-width="${on ? 2.4 : 1.1}" stroke-linecap="round"/>`; }
  const stars = [[22, 30, .9], [104, 26, 1.2], [30, 96, 1], [100, 100, .8], [64, 18, .8], [18, 62, .7], [114, 64, .9], [48, 112, .7], [86, 14, .6]].map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#dfe6ff" opacity="${(.4 + r * .3).toFixed(2)}"/>`).join("");
  const svg = `<svg viewBox="0 0 ${S} ${S}" class="moon-svg" role="img" aria-label="${m.name}, ${Math.round(m.lit * 100)} percent lit">
    <defs>
      <linearGradient id="mnBezel" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f4eadb"/><stop offset=".45" stop-color="#8f8a86"/><stop offset=".7" stop-color="#d9c9a8"/><stop offset="1" stop-color="#6e6a70"/></linearGradient>
      <radialGradient id="mnDial" cx=".5" cy=".4" r=".75"><stop offset="0" stop-color="#1c2650"/><stop offset=".7" stop-color="#0c1230"/><stop offset="1" stop-color="#070a1e"/></radialGradient>
      <radialGradient id="mnLit" cx=".4" cy=".35" r=".8"><stop offset="0" stop-color="#fffbe9"/><stop offset=".7" stop-color="#ecdfb8"/><stop offset="1" stop-color="#cdbf96"/></radialGradient>
      <radialGradient id="mnGlow"><stop offset=".55" stop-color="#ffe9a8" stop-opacity=".45"/><stop offset="1" stop-color="#ffe9a8" stop-opacity="0"/></radialGradient>
      <clipPath id="mnClip"><circle cx="${mx}" cy="${my}" r="${mr}"/></clipPath>
    </defs>
    <circle cx="${c}" cy="${c}" r="${R + 4}" fill="url(#mnBezel)"/><circle cx="${c}" cy="${c}" r="${R + 1.2}" fill="#0a0d1c"/><circle cx="${c}" cy="${c}" r="${R}" fill="url(#mnDial)"/>
    ${stars}${ticks}
    <circle cx="${mx}" cy="${my}" r="${mr + 9}" fill="url(#mnGlow)" opacity="${(.25 + m.lit * .75).toFixed(2)}"/>
    <circle cx="${mx}" cy="${my}" r="${mr + 2.5}" fill="#05070f" stroke="url(#mnBezel)" stroke-width="2"/>
    <circle cx="${mx}" cy="${my}" r="${mr}" fill="#1b2240"/>
    <g clip-path="url(#mnClip)">
      <path d="${m.waxing ? rightHalf : leftHalf}" fill="url(#mnLit)"/>
      <ellipse cx="${mx}" cy="${my}" rx="${rx.toFixed(2)}" ry="${mr}" fill="${k > 0 ? "#1b2240" : "url(#mnLit)"}"/>
      <g opacity=".16" fill="#6b6455"><circle cx="${mx - 9}" cy="${my - 8}" r="5.5"/><circle cx="${mx + 11}" cy="${my + 4}" r="7"/><circle cx="${mx - 4}" cy="${my + 15}" r="4"/><circle cx="${mx + 4}" cy="${my - 17}" r="3.2"/></g>
      <circle cx="${mx}" cy="${my}" r="${mr}" fill="none" stroke="rgba(0,0,0,.35)" stroke-width="3"/>
    </g>
    <path d="M${c - 28},${c - 40} A${R - 4},${R - 4} 0 0 1 ${c + 28},${c - 40}" fill="none" stroke="rgba(255,255,255,.14)" stroke-width="1.4" stroke-linecap="round"/>
  </svg>`;
  const d = x => (x < 1 ? "less than a day" : x < 1.5 ? "1 day" : Math.round(x) + " days");
  return `<div class="moon"><div class="moon-dial">${svg}</div><div class="moon-text"><div class="moon-name">${m.name}</div><div class="basis">${Math.round(m.lit * 100)}% lit · day ${day + 1} of 29</div><div class="basis">${m.toFull <= m.toNew ? "full" : "new"} moon in ${d(Math.min(m.toFull, m.toNew))}</div></div></div>`;
}
