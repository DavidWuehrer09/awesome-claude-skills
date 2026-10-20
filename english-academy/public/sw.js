/* English Academy service worker.
 * - Static build assets: cache-first (they are content-hashed).
 * - Pages: network-first, falling back to the cached copy, then /offline.html.
 * - Read-only vocabulary APIs: network-first with cache fallback, so your
 *   word list stays browsable offline.
 * - Everything else (writes, AI, auth) always goes to the network.
 * - Push: shows the reminder; clicks only ever open same-origin URLs.
 */
const VERSION = "v1";
const STATIC = `static-${VERSION}`;
const PAGES = `pages-${VERSION}`;
const DATA = `data-${VERSION}`;
const CACHEABLE_API = ["/api/vocab", "/api/topics", "/api/me", "/api/tags"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(PAGES).then((c) => c.addAll(["/offline.html", "/manifest.webmanifest", "/icons/icon-192.png"])));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keep = [STATIC, PAGES, DATA];
    for (const key of await caches.keys()) if (!keep.includes(key)) await caches.delete(key);
    await self.clients.claim();
  })());
});

async function networkFirst(request, cacheName, fallbackUrl) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(request);
    if (res.ok && res.type === "basic") cache.put(request, res.clone());
    return res;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    if (fallbackUrl) return (await caches.match(fallbackUrl)) ?? Response.error();
    return new Response(JSON.stringify({ error: "You are offline", code: "offline" }), { status: 503, headers: { "Content-Type": "application/json" } });
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(caches.open(STATIC).then(async (cache) => {
      const hit = await cache.match(request);
      if (hit) return hit;
      const res = await fetch(request);
      if (res.ok) cache.put(request, res.clone());
      return res;
    }));
    return;
  }
  if (url.pathname.startsWith("/api/")) {
    if (CACHEABLE_API.some((p) => url.pathname === p || url.pathname.startsWith(`${p}/`))) event.respondWith(networkFirst(request, DATA));
    return;
  }
  if (request.mode === "navigate") event.respondWith(networkFirst(request, PAGES, "/offline.html"));
});

self.addEventListener("push", (event) => {
  let data = { title: "English Academy", body: "Time for a short review.", url: "/home" };
  try {
    data = { ...data, ...event.data.json() };
  } catch {
    /* use defaults */
  }
  event.waitUntil(self.registration.showNotification(data.title, {
    body: data.body,
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    tag: "review-reminder",
    data: { url: data.url },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const raw = (event.notification.data && event.notification.data.url) || "/home";
  const target = new URL(raw, self.location.origin);
  const url = target.origin === self.location.origin ? target.href : self.location.origin + "/home";
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of all) {
      if (c.url.startsWith(self.location.origin)) {
        await c.navigate(url).catch(() => {});
        return c.focus();
      }
    }
    return self.clients.openWindow(url);
  })());
});
