// Offline copy of the MC script for the iPad at the venue.
// The page is fetched fresh whenever the network answers and served from the saved copy when it does not.
// Fonts are saved once; the music and video previews are left out on purpose.
const CACHE = "mc-script-v1";
const FONT_CSS = "https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css";
const EXTRAS = ["manifest.webmanifest", "icon-180.png", "icon-192.png", "icon-512.png"];

// A stalled request must never keep the install from finishing
const within = (promise, ms) => Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms))]);

// Only the page itself is required; a missing icon or font must not sink the whole offline copy
self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await within(cache.add("./"), 15000);
    await Promise.all(EXTRAS.map(u => within(cache.add(u), 10000).catch(() => {})));
    try {
      const css = await within(fetch(FONT_CSS), 10000);
      await cache.put(FONT_CSS, css.clone());
      const queue = [...(await css.text()).matchAll(/url\(([^)]+\.woff2)\)/g)].map(m => new URL(m[1], FONT_CSS).href);
      // A few downloads at a time; anything left after the time limit is saved later, when the page uses it
      const lane = async () => {
        while (queue.length) {
          const u = queue.shift();
          try { const r = await within(fetch(u), 10000); if (r.ok) await cache.put(u, r); } catch (e) {}
        }
      };
      await Promise.race([Promise.all([1, 2, 3, 4, 5, 6].map(lane)), new Promise(r => setTimeout(r, 30000))]);
    } catch (e) { /* the page still works offline with the system font */ }
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
    await self.clients.claim();
    for (const client of await self.clients.matchAll()) client.postMessage("offline-ready");
  })());
});

self.addEventListener("fetch", event => {
  const req = event.request, url = new URL(req.url);
  if (req.method !== "GET" || url.pathname.includes("/media/")) return;
  if (req.mode === "navigate") {
    // Newest script when online; on a slow venue connection fall back to the saved copy after a few seconds
    const network = fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put("./", copy)); }
      return res;
    });
    event.waitUntil(network.catch(() => {}));
    event.respondWith((async () => {
      const saved = await caches.match("./");
      if (!saved) return network;
      return Promise.race([network.catch(() => saved), new Promise(r => setTimeout(() => r(saved), 4000))]);
    })());
    return;
  }
  // Saved copy first; anything fetched later (such as a font the install did not get to) is kept too
  event.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
    return res;
  })));
});
