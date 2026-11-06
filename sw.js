// Cache the app shell and OCR assets only; never cache shared financial data.
const BASE = new URL(self.registration.scope).pathname;
const PREFIX = "buruburu-" + BASE + "-";
const CACHE = PREFIX + "0901e7323833";
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) =>
        c.addAll(["/Computo_Scientifico_test/","/Computo_Scientifico_test/manifest.webmanifest","/Computo_Scientifico_test/icon-192.png","/Computo_Scientifico_test/icon-512.png","/Computo_Scientifico_test/assets/index-BHevIght.js","/Computo_Scientifico_test/assets/index-CJBAhXpu.css"]),
      ),
  );
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k.startsWith(PREFIX) && k !== CACHE).map((k) => caches.delete(k)),
        ),
      ),
  );
});
self.addEventListener("fetch", (event) => {
  const u = new URL(event.request.url);
  if (
    event.request.method !== "GET" ||
    u.origin !== self.location.origin ||
    !u.pathname.startsWith(BASE) ||
    u.pathname.startsWith("/api/")
  )
    return;
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          event.waitUntil(caches.open(CACHE).then((c) => c.put(event.request, copy)).catch(() => {}));
        }
        return response;
      })
      .catch(async () => {
        const match = await caches.match(event.request);
        if (match) return match;
        if (event.request.mode === "navigate") return await caches.match(BASE);
        throw Error("Sin conexión");
      }),
  );
});
