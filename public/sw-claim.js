const CACHE_NAME = "tfm-claim-v1";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);
  const isAsset = url.pathname.startsWith("/assets/");
  const isAudio = url.hostname.includes("supabase.co") && url.pathname.includes("/audio-clips/");
  const isSectionImage = url.hostname.includes("supabase.co") && url.pathname.includes("/section-images/");

  if (!isAsset && !isAudio && !isSectionImage) return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        return response;
      });
    }),
  );
});
