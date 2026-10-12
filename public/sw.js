/* Build replaces these constants. Only listed shell files are handled. */
const FILES = __PRECACHE__;
const PREFIX = "travel-itinerary-shell-", CACHE = PREFIX + "__VERSION__";
let disabled = false;
const hex = bytes => [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, "0")).join("");
self.addEventListener("install", event => event.waitUntil((async () => {
  const cache = await caches.open(CACHE);
  try {
    for (const file of FILES) {
      const response = await fetch(file.url, { cache: "reload", credentials: "same-origin" });
      if (!response.ok || hex(await crypto.subtle.digest("SHA-256", await response.clone().arrayBuffer())) !== file.hash) throw new Error(`incomplete shell: ${file.url}`);
      await cache.put(file.url, response);
    }
  } catch (error) {
    await caches.delete(CACHE);
    for (const client of await self.clients.matchAll({ type: "window", includeUncontrolled: true })) client.postMessage({ type: "INSTALL_ERROR", reason: error.message });
    throw error;
  }
})()));
self.addEventListener("activate", event => event.waitUntil((async () => {
  for (const key of await caches.keys()) if (key.startsWith(PREFIX) && key !== CACHE) await caches.delete(key);
  await self.clients.claim();
})()));
self.addEventListener("fetch", event => {
  const request = event.request, url = new URL(request.url);
  if (disabled || request.method !== "GET" || url.origin !== self.location.origin || url.search || url.pathname.startsWith("/api/")) return;
  const path = request.mode === "navigate" && ["/", "/index.html"].includes(url.pathname) ? "/index.html" : url.pathname;
  if (!FILES.some(file => file.url === path)) return;
  event.respondWith((async () => {
    // CacheStorage.match does not recreate a cache deleted by disable/recovery.
    return (await caches.match(path, { cacheName: CACHE })) || fetch(request);
  })());
});
self.addEventListener("message", event => {
  if (event.data?.type === "DISABLE") { disabled = true; return; }
  if (event.data?.type === "ACTIVATE") event.waitUntil((async () => {
    const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    if (clients.length > 1) { event.ports[0]?.postMessage("OTHER_TABS"); return; }
    event.ports[0]?.postMessage("ACTIVATING"); await self.skipWaiting();
  })());
});
