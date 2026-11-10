// Service worker: makes the dashboard installable, opens it instantly, and lets it open with no signal.
// Same-site files are answered straight from the cache (so a new tab paints at once) and are re-checked with the server in the background.
// When a check finds a newer file, the page is told (after things settle) so it can offer a reload; the new version then shows on that reload.
// Google, GitHub and the weather service are never touched here, so no health data passes through the cache.
const CACHE = "dashboard-v3";
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
  await self.clients.claim();
})()));

let note = 0;
const tellPages = () => { clearTimeout(note); note = setTimeout(async () => { for (const c of await self.clients.matchAll()) c.postMessage({ type: "updated" }); }, 2500); };   // one message once the downloads stop, so a reload never mixes old and new files
const sig = r => r.headers.get("etag") || r.headers.get("last-modified") || "";

const same = (x, y) => { if (x.byteLength !== y.byteLength) return false; const a = new Uint8Array(x), b = new Uint8Array(y); for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false; return true; };

async function refresh(req, key) {
  try {
    const cache = await caches.open(CACHE), old = await cache.match(key), res = await fetch(req, { cache: "no-cache" });
    if (!res.ok) return res;
    let changed = false;
    if (old && sig(old) !== sig(res)) changed = !same(await old.clone().arrayBuffer(), await res.clone().arrayBuffer());   // a different ETag alone proves nothing (the CDN hands out varying ones), so only differing content counts
    await cache.put(key, res.clone());
    if (changed) tellPages();
    return res;
  } catch (err) { return null; }
}

self.addEventListener("fetch", e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== "GET" || u.origin !== location.origin) return;
  const key = r.mode === "navigate" ? new Request(u.origin + u.pathname) : r;   // ?tab=cal and friends share one cached page
  e.respondWith((async () => {
    const hit = await caches.match(key, { ignoreSearch: r.mode !== "navigate" ? false : true });
    if (hit) { e.waitUntil(refresh(r, key)); return hit; }
    const res = await refresh(r, key);
    if (res) return res;
    if (r.mode === "navigate") { const home = await caches.match("index.html", { ignoreSearch: true }) || await caches.match("./", { ignoreSearch: true }); if (home) return home; }
    return Response.error();
  })());
});
