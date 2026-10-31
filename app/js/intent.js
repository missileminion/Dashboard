// Plain-English phrasing for the console, with no AI: a list of patterns that turn a sentence into the command it means.
//   "how did I sleep"  ->  sleep 7        "I weigh 70.4"  ->  weight 70.4        "bench 135 for 8 x 3"  ->  set bench 135 8 3
// interpret(line) returns { run: "command line" } to run, { say: "text" } for small talk, or null when nothing matches.
const STOP = new Set("the a an of to i me my is are was what how do did does in on for and it show give tell please can you could would with at this that there any much many some about".split(" "));

export function interpret(raw) {
  const o = raw.trim().replace(/\s+/g, " "), low = o.toLowerCase();
  let t = low.replace(/[?!.]+$/, "").replace(/^(please|pls|ok|okay|so|um|well)[, ]+/, "").replace(/^(can|could|would) you( please)? /, "").replace(/^(show|tell|give) me( my)? /, "").replace(/^i (want|need|wanna|would like) (to )?(see|know|check|look at)\s+/, "");
  const R = (rx, f) => { const m = t.match(rx); return m ? f(m) : undefined; };
  const rules = [
    // small talk
    () => R(/^(?:how many )?days?\s+(?:until|till|to|left until|before)\s+(.+)$|^how long (?:until|till|to)\s+(.+)$/, m => ({ run: "until " + (m[1] || m[2]) })),
    () => R(/^(hi|hello|hey|hiya|yo|sup|howdy|hola|gm|greetings|good (morning|afternoon|evening|day|night)|how are you|how'?s it going|what'?s up|wassup|whats up)\b[\w\s,!.']*$/, () => ({ run: "hi" })),
    () => R(/^(thanks|thank you|thx|ty|cheers|nice one|great|awesome|cool|perfect)\b/, () => ({ say: "any time." })),
    () => R(/^(bye|goodbye|see you|see ya|cya|later|good ?night)\b/, () => ({ run: "bye" })),
    () => R(/^(who|what) are you|^what is this\b/, () => ({ run: "about" })),
    () => R(/^(oops|undo that|take that back|take it back|never ?mind that|that was wrong)/, () => ({ run: "undo" })),
    // help
    () => R(/^(help me|i need help|what can (you|i) do|what do you do|what commands|list (the )?commands|how (do|does) (i|this)( work| use)?|how to use|how do i use (this|it)|commands|options|menu)/, () => ({ run: "help" })),
    // maths phrased as words (before the data rules, so "what is 15% of 80" is a sum)
    () => R(/(\d+(?:\.\d+)?)\s*(?:%|percent)\s*of\s*(\d+(?:\.\d+)?)/, m => ({ run: `pct ${m[1]} of ${m[2]}` })),
    () => R(/^(?:what(?:'s| is)\s+)?(\d+(?:\.\d+)?)\s*([a-z°"']+)\s+(?:in|to|into)\s+([a-z°]+)$/, m => ({ run: `convert ${m[1]} ${m[2]} to ${m[3]}` })),
    () => R(/^(?:how many|how much)\s+([a-z°]+)\s+(?:is|are|in)\s+(\d+(?:\.\d+)?)\s*([a-z°]+)$/, m => ({ run: `convert ${m[2]} ${m[3]} to ${m[1]}` })),
    () => R(/^(?:what(?:'s| is| are)|whats|calculate|calc|compute|how much is|solve|work out|evaluate)\s+(.+)$/, m => { const e = words2math(m[1]); return /\d/.test(e) && /^[\d\s+\-*/^().,x×÷%a-z]+$/i.test(e) ? { run: e } : undefined; }),
    // sleep, recovery, body
    () => R(/(how (did|have|was) (i|my)|how'?s my|how is my)\s*(sleep|slept)|\bmy sleep\b|sleep (last night|lately|this week|score|quality|history)/, () => ({ run: "sleep 7" })),
    () => R(/^last night\b|how was last night/, () => ({ run: "status" })),
    () => R(/sleep debt|how (much|tired)\b.*\b(debt|behind)|am i (behind|owed) .*sleep/, () => ({ run: "debt" })),
    () => R(/when (should|do) i (go to )?(bed|sleep)|what time should i (go to )?(bed|sleep)|^bed ?time|when to sleep/, () => ({ run: "bedtime" })),
    () => R(/should i (train|rest|work ?out|lift|go to the gym|exercise)|can i (train|lift|work ?out|exercise)|ready to (train|lift)|am i (ready|recovered)/, () => ({ run: "readiness" })),
    () => R(/(how am i|how'?s my|how is my|am i)\s*(doing|recover\w*|health\w*|body|feeling|sick|ill)|my (recovery|readiness|body check)|body ?check|am i getting sick/, () => ({ run: "status" })),
    () => R(/\bhrv\b|heart rate variability/, () => ({ run: "hrv 7" })),
    () => R(/(resting )?heart ?rate|\bmy pulse\b|\brhr\b/, () => ({ run: "rhr 7" })),
    () => R(/(how many )?\bsteps\b/, () => ({ run: "steps 7" })),
    () => R(/active (zone )?minutes|\bazm\b/, () => ({ run: "azm 7" })),
    () => R(/\b(vo2|cardio fitness)\b/, () => ({ run: "vo2 14" })),
    // weight
    () => R(/\b(weight|weigh)\b.*\b(trend|trending|changing|going)\b|am i (gaining|losing)/, () => ({ run: "wtrend" })),
    // day and calendar
    () => R(/(what('s| is|s)?|how'?s) (on )?(my )?(day|today|schedule|agenda)( like)?( today)?$|what do i have (on )?today|what am i doing today|my day$|today'?s? (schedule|plan|agenda)|what'?s on today|what'?s happening today/, () => ({ run: "today" })),
    () => R(/what do i have (next|on next)|what'?s (up )?next|what'?s coming up|whats next|next (event|thing|class|meeting)|what is next/, () => ({ run: "next" })),
    () => R(/what('s| is|s)? (on )?tomorrow|tomorrow'?s? (schedule|plan|agenda|events)|what do i have tomorrow/, () => ({ run: "tomorrow" })),
    () => R(/^(?:what(?:'s| is)? ?(?:on )?(?:my )?)?(?:this|next) week$|^my week$|upcoming events|^what'?s coming$/, () => ({ run: "agenda 7" })),
    () => R(/(when am i free|am i free|free time|any free (time|slots?)|what'?s free|open slots?|gaps?)( (today|tomorrow))?/, m => ({ run: `free${m[3] === "tomorrow" ? " tomorrow" : ""}` })),
    () => R(/^(?:schedule|book|set up|put)\s+(.+)$/, m => ({ run: `add ${m[1].replace(/\s+(on|in) my calendar$/, "")}` })),
    () => R(/^when(?:'s| is| was)?\s+(?!did |do |should |am |can |will |are |was |were )(?:my |the )?(.+)$/, m => (/sunset|sunrise|full moon|new moon|^it$/.test(m[1]) ? undefined : { run: `when ${m[1]}` })),
    () => R(/how (many )?(days|long|much time)( are there| is it| is left| left| do i have)? (until|till|to|before|left until)\s+(.+)/, m => ({ run: `until ${m[5]}` })),
    () => R(/^(?:days )?(?:until|till)\s+(.+)/, m => ({ run: `until ${m[1]}` })),
    () => R(/what time is it in (.+)|time in (.+)/, m => ({ run: `time ${m[1] || m[2]}` })),
    () => R(/what('s| is|s)? the time|what time is it|^time now|current time/, () => ({ run: "time" })),
    () => R(/what('s| is|s)? (the |today'?s )?date|what day (is it|is today|of the week)|which day|what'?s today'?s date/, () => ({ run: "date" })),
    () => R(/sun ?(set|rise)|when does the sun|daylight/, () => ({ run: "sun" })),
    () => R(/\bmoon\b/, () => ({ run: "moon" })),
    // lifting
    () => R(/^(push|pull|legs?)( day| workout| routine| session)?$/, m => ({ run: `routine ${m[1]}` })),
    () => R(/what (should|do) i (train|lift|do)( today| at the gym)?|(my |today'?s? )?(workout|routine|session|lifting|training|exercises) (for )?(today|plan)|what'?s (my |today'?s )?(workout|routine|session|plan)|what'?s the plan/, () => ({ run: "routine" })),
    () => R(/how many (times|days|sessions) (did i|have i|i)? ?(lift|train|gym|work ?out|exercise)\w*( this)? ?(week|month)?/, m => ({ run: `gymdays ${m[5] || "week"}` })),
    () => R(/how much (did|have) i (lift|lifted|move|moved|train|trained)( this)? ?(week|month)?|my volume|total volume|tonnage/, m => ({ run: `volume ${m[4] || "week"}` })),
    () => R(/(?:my )?(?:pr|personal (?:best|record)|max|one rep max|1rm) (?:on|for|in)?\s*(?:the )?(.+)/, m => ({ run: `pr ${m[1]}` })),
    () => R(/(?:when|what) (?:did|was) i (?:last )?(?:did |do |lift |train |hit |bench |squat )?(.+?)(?: last)?$|last (?:time|session) (?:i )?(?:did |lifted |benched |squatted )?(.+)/, m => ({ run: `last ${m[1] || m[2]}` })),
    () => R(/(my )?(last|recent|latest) runs?|how far did i run|running (this )?week|my mileage|how (far|much) (have i|did i) run/, m => ({ run: /mileage|far|much|week/.test(t) ? "mileage" : "runs 5" })),
    () => R(/personal bests|all (my )?prs|my prs|my records/, () => ({ run: "prs" })),
    // notes, tasks, timers
    () => R(/^(?:remind me to|reminder to|reminder:?|todo:?|to-?do:?|i need to|i have to|i should|i must|add (?:a )?(?:task|todo|to-?do)(?: to| for)?|task to|don'?t forget to)\s+(.+)$/, m => ({ run: `task ${m[1]}` })),
    () => R(/^(?:remember(?: that)?|jot( down)?|write down|make a note(?: that| of)?|note that|add (?:a )?note(?: that)?|note to self:?)\s+(.+)$/, m => ({ run: `note ${m[m.length - 1]}` })),
    () => R(/(what|which) (do i|should i|tasks do i) (need to do|have to do|have left)|my (to-?dos?|tasks|to do list)|^tasks?( list)?$|open tasks|what'?s (left|on my list)/, () => ({ run: "tasks" })),
    () => R(/^(?:i )?(?:finished|completed|did|checked off|ticked off)\s+(?:the\s+)?(.+)$/, m => ({ run: `finish ${m[1]}` })),
    () => R(/(?:set|start|begin)(?: a| an)? (?:timer|countdown|alarm)(?: for| of)? (.+)/, m => ({ run: `countdown ${m[1].replace(/\s*(minutes?|mins?)$/, "m").replace(/\s*(seconds?|secs?)$/, "s").replace(/\s*(hours?|hrs?)$/, "h")}` })),
    () => R(/^(?:focus|study|work|read|concentrate)(?: for)?\s*(\d+)?\s*(?:min(?:ute)?s?)?$|^(?:i'?m|i am|let'?s|lets)(?: going to| gonna)? (?:focus|study|work|read)/, m => ({ run: `start ${m[1] || ""}`.trim() })),
    () => R(/how (much )?(time )?(is )?left|time left|how long (is )?left|remaining time/, () => ({ run: "left" })),
    () => R(/(pause|stop|resume) (the )?(timer|focus|session)/, m => ({ run: m[1] })),
  ];
  for (const r of rules) { const out = r(); if (out) return out; }
  return null;
}

// "5 plus 3 times 2" -> "5+3*2"
export function words2math(s) {
  return s.replace(/\bplus\b|\band\b(?=\s*\d)/g, "+").replace(/\bminus\b/g, "-").replace(/\b(times|multiplied by|x)\b(?=\s*[\d(])/g, "*").replace(/\b(divided by|over)\b/g, "/").replace(/\bto the power of\b|\bto the\b/g, "^")
    .replace(/(\d+(?:\.\d+)?|\))\s+squared\b/g, "$1^2").replace(/(\d+(?:\.\d+)?|\))\s+cubed\b/g, "$1^3").replace(/\bsquare root of\s+(\d+(?:\.\d+)?)/g, "sqrt($1)").replace(/\bpercent\b/g, "%").trim();
}

// rank commands by how well their name, aliases, usage and description match the words typed (for "closest commands" and the suggestion strip)
export function findCommands(query, meta) {
  const toks = (query.toLowerCase().match(/[a-z0-9°]+/g) || []).filter(w => w.length >= 2 && !STOP.has(w));
  if (!toks.length) return [];
  return meta.map(m => {
    const text = `${m.use} ${m.d}`.toLowerCase(); let sc = 0;
    toks.forEach(w => {
      if (m.n === w) sc += 10; else if (m.al.includes(w)) sc += 9; else if (m.n.startsWith(w)) sc += 6; else if (w.length > 2 && m.n.includes(w)) sc += 4;
      if (new RegExp(`\\b${w.replace(/[^a-z0-9]/g, "")}`).test(text)) sc += 2;
    });
    return { m, sc };
  }).filter(x => x.sc > 0).sort((a, b) => b.sc - a.sc).map(x => x.m);
}
