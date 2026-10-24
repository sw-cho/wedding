// Offline copy of the MC script for the iPad at the venue.
// The page is fetched fresh whenever the network answers and served from the saved copy when it does not.
// Fonts are saved once; the music and video previews are left out on purpose.
const CACHE = "mc-script-v1";
const FONT_CSS = "https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css";
const SHELL = ["./", "manifest.webmanifest", "icon-180.png", "icon-192.png", "icon-512.png"];

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(SHELL);
    const css = await fetch(FONT_CSS);
    await cache.put(FONT_CSS, css.clone());
    const fonts = [...(await css.text()).matchAll(/url\(([^)]+\.woff2)\)/g)].map(m => new URL(m[1], FONT_CSS).href);
    await Promise.all(fonts.map(u => fetch(u).then(r => r.ok && cache.put(u, r)).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET" || new URL(req.url).pathname.includes("/media/")) return;
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
  event.respondWith(caches.match(req).then(hit => hit || fetch(req)));
});
