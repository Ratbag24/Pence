/* Pence service worker — offline-first for the web/PWA build.
   Paths are relative so this works at the domain root, under /Pence/ on
   GitHub Pages, and anywhere else the app is hosted. */
const CACHE = "pence-v2.0.0";
const ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icon.svg",
  "./icon-192.png",
  "./icon-512.png",
  "./privacy.html",
  "./vendor/chart.umd.min.js",
];

self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* Network first for the page itself (so updates land quickly), cache first
   for everything else. */
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const isPage = req.mode === "navigate" || req.url.endsWith("/index.html");
  if (isPage) {
    e.respondWith(
      fetch(req).then(res => { const clone = res.clone(); caches.open(CACHE).then(c => c.put(req, clone)); return res; })
        .catch(() => caches.match(req).then(r => r || caches.match("./index.html")))
    );
    return;
  }
  e.respondWith(
    caches.match(req).then(cached => cached || fetch(req).then(res => {
      if (!res || res.status !== 200 || res.type !== "basic") return res;
      const clone = res.clone();
      caches.open(CACHE).then(c => c.put(req, clone));
      return res;
    }))
  );
});
