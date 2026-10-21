// Service worker: makes the dashboard installable and lets it open with no signal.
// Same-site files are fetched from the network first (always revalidated, so a new version shows up straight away) and kept in a cache,
// which is used only when the network fails. Google, GitHub and the weather service are never touched here, so no health data passes through the cache.
const CACHE = "dashboard-v1";
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
  await self.clients.claim();
})()));
self.addEventListener("fetch", e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== "GET" || u.origin !== location.origin) return;
  e.respondWith((async () => {
    try {
      const res = await fetch(r, { cache: "no-cache" });
      if (res.ok) { const c = await caches.open(CACHE); c.put(r, res.clone()); }
      return res;
    } catch (err) {
      const hit = await caches.match(r, { ignoreSearch: true });
      if (hit) return hit;
      if (r.mode === "navigate") { const home = await caches.match("index.html", { ignoreSearch: true }) || await caches.match("./", { ignoreSearch: true }); if (home) return home; }
      throw err;
    }
  })());
});
