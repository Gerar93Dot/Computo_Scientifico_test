// Cache the app shell and OCR assets only; never cache shared financial data.
const CACHE = "buruburu-v1";
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) =>
        c.addAll([
          "/",
          "/manifest.webmanifest",
          "/icon-192.png",
          "/icon-512.png",
        ]),
      ),
  );
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)),
        ),
      ),
  );
});
self.addEventListener("fetch", (event) => {
  const u = new URL(event.request.url);
  if (
    event.request.method !== "GET" ||
    u.origin !== self.location.origin ||
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
        if (event.request.mode === "navigate") return await caches.match("/");
        throw Error("Sin conexión");
      }),
  );
});
