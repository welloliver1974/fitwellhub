const CACHE = "fitwellhub-v2";
const STATIC_ASSETS = [
  "/",
  "/app",
  "/auth",
  "/manifest.webmanifest",
  "/icon-192.png",
  "/icon-512.png",
];

// On install: cache core assets immediately
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(STATIC_ASSETS)),
  );
  self.skipWaiting();
});

// On activate: clean old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
    ),
  );
  self.clients.claim();
});

// Network-first for navigation, cache-first for static assets
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle same-origin requests
  if (url.origin !== self.location.origin) return;

  // Always network-first for API calls and server functions
  if (url.pathname.startsWith("/api/") || url.pathname.includes("_server")) {
    event.respondWith(networkFirst(request));
    return;
  }

  // Cache-first for known static assets (JS, CSS, images, fonts)
  if (
    request.destination === "script" ||
    request.destination === "style" ||
    request.destination === "image" ||
    request.destination === "font"
  ) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Network-first for navigation (pages)
  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request));
    return;
  }

  // Default: network-only
  event.respondWith(fetch(request));
});

async function cacheFirst(request) {
  const cached = await caches.match(request);
  return cached ?? fetchAndCache(request);
}

async function networkFirst(request) {
  try {
    return await fetchAndCache(request);
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    // Offline fallback for navigation
    if (request.mode === "navigate") {
      return caches.match("/");
    }
    throw new Error("Offline");
  }
}

async function fetchAndCache(request) {
  const response = await fetch(request);
  if (response.ok) {
    const clone = response.clone();
    caches.open(CACHE).then((cache) => cache.put(request, clone));
  }
  return response;
}
